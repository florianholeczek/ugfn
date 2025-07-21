#!/usr/bin/env python3
"""
GFlowNet Methodology (Trajectory Balance) for Tetris Agent
---------------------------------------------------------
This comment block explains how a GFlowNet (Generative Flow Network)
with Trajectory Balance is used to train the Tetris agent.

1. Acyclic Environment & States
   - We treat Tetris as acyclic by never removing lines; we only count
     how many would have been cleared.
   - Each state includes the board layout plus the current and next pieces.

2. Forward Policy & Trajectory Generation
   - The network defines a policy π(a | s) over actions a = (rotation, x).
   - We build full-piece-placement trajectories τ = (s0,a0,s1,a1,...,sT)
     by sampling actions from a mix of:
       • The learned policy πθ
       • A strong heuristic h
   - In the initial “imitation” phase, α=0 (pure heuristic), and we record
     the heuristic’s best action at each step for supervised training.

3. Partition Function logZ
   - We learn one scalar parameter logZ[c] for each piece type c.
   - logZ[c] estimates the total “flow” out of the start state when the
     first piece is type c.

4. Trajectory Balance Loss
   - For each sampled trajectory τ:
       F = logZ[start_piece] + sum over steps of log πθ(at | st)
       R = log(final_score), with final_score clamped to at least 1
       Loss = (F − R)²
     This loss makes the total log‐flow into each trajectory match its
     log‐reward.

5. Policy Mixing & Alpha Annealing
   - At each step we combine policies:
       p_mix(a) = α · πθ(a) + (1 − α) · h(a)
   - We linearly increase α from α_start (mostly heuristic) to α_end
     (mostly learned) over a fixed number of steps.

6. Curriculum: Imitation → GFlowNet
   - Phase 1: Imitation learning (first N episodes), α=0, train by
     predicting the heuristic’s greedy action via cross‐entropy loss.
   - Phase 2: Trajectory Balance training, α>0, use the mixed policy
     and minimize the TB loss.

7. Optimization Details
   - Gradient clipping (norm ≤ 1.0) for stability.
   - Learning rate scheduler reduces LR every fixed number of steps.
   - TensorBoard logs: average score, loss, LR, α, and logZ per piece.

By starting with a proven heuristic and gradually shifting to the learned
policy under the Trajectory Balance objective, we discover diverse, high-quality
Tetris plays and converge toward near-perfect performance.

Usage:
    python3 imp.py \
        --episodes 10000 --batch-size 32 \
        --imitation-epochs 5000 --lr 2e-4 \
        --lr-decay-step 2000 --lr-decay-gamma 0.5 --alpha-start 0.2 \
        --alpha-end 0.95 --alpha-anneal-steps 50000 \
        --checkpoint-path gfn_tetris_pro.pt \
        --onnx-path gfn.onnx
"""

import argparse
import random
import time
from collections import deque
from pathlib import Path
from typing import Dict, List, Tuple, Optional

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.optim as optim
import torch.quantization
from torch.utils.tensorboard import SummaryWriter
import torch

# --- Constants and Configuration ---
BOARD_WIDTH, BOARD_HEIGHT = 6, 20
TETROMINOES: Dict[str, np.ndarray] = {
    'I': np.array([[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], dtype=bool),
    'O': np.array([[1,1],[1,1]], dtype=bool),
    'T': np.array([[0,1,0],[1,1,1],[0,0,0]], dtype=bool),
    'S': np.array([[0,1,1],[1,1,0],[0,0,0]], dtype=bool),
    'Z': np.array([[1,1,0],[0,1,1],[0,0,0]], dtype=bool),
    'J': np.array([[1,0,0],[1,1,1],[0,0,0]], dtype=bool),
    'L': np.array([[0,0,1],[1,1,1],[0,0,0]], dtype=bool)
}
N_ROTATIONS: Dict[str, int] = {'I': 2, 'O': 1, 'T': 4, 'S': 2, 'Z': 2, 'J': 4, 'L': 4}
PIECE_IDS = {name: i for i, name in enumerate(TETROMINOES.keys())}
N_PIECES = len(TETROMINOES)

# --- Environment ---
BASE_SEQUENCE = ["I", "O", "T", "S", "Z", "J", "L"]
PREDEFINED_PIECES = [BASE_SEQUENCE[i % len(BASE_SEQUENCE)] for i in range(1000)]


class TetrisEnv:
    """A NumPy-based Tetris environment compatible with the GFlowNet agent."""
    def __init__(self, seed: Optional[int] = None, fixed_sequence: Optional[List[str]] = None):
        if seed is not None:
            np.random.seed(seed)
            random.seed(seed)  # Also seed python's random for bag shuffling
        self.board: Optional[np.ndarray] = None
        self.bag: List[str] = []
        self.next_piece_in_bag: Optional[str] = None
        self.current_piece: Optional[Dict] = None
        self.fixed_sequence = fixed_sequence
        self.seq_idx = 0
        self.score: int = 0
        self.lines_cleared: int = 0
        self.game_over: bool = False
        self.reset()

    def reset(self) -> Dict:
        """Resets the environment to a starting state."""
        self.board = np.zeros((BOARD_HEIGHT, BOARD_WIDTH), dtype=bool)
        self.score = 0
        self.lines_cleared = 0
        self.game_over = False
        self.bag = []
        self.seq_idx = 0
        self._fill_bag()
        self._fill_bag()  # Fill twice for lookahead
        self.current_piece = self._spawn_piece()
        if self.fixed_sequence is not None:
            self.next_piece_in_bag = self.fixed_sequence[self.seq_idx % len(self.fixed_sequence)]
        else:
            self.next_piece_in_bag = self.bag[0]
        if self._collides(self.current_piece['shape'], (self.current_piece['x'], self.current_piece['y'])):
            self.game_over = True
            # right after you detect game over:
            if self.game_over:
                reward -= 1.0
                self.score += -1.0

        return self.get_state()

    def _fill_bag(self):
        """Refills the piece bag."""
        if self.fixed_sequence is not None:
            while len(self.bag) < N_PIECES + 1:
                if self.seq_idx >= len(self.fixed_sequence):
                    self.seq_idx = 0
                self.bag.append(self.fixed_sequence[self.seq_idx])
                self.seq_idx += 1
        else:
            new_pieces = list(TETROMINOES.keys())
            random.shuffle(new_pieces)
            self.bag.extend(new_pieces)

    def _spawn_piece(self) -> Dict:
        """Spawns a new piece."""
        if self.fixed_sequence is not None:
            if len(self.bag) < 1:
                self._fill_bag()
            piece_type = self.bag.pop(0)
        else:
            if len(self.bag) < N_PIECES + 1:  # Ensure lookahead is always possible
                self._fill_bag()
            piece_type = self.bag.pop(0)
        shape = TETROMINOES[piece_type]
        x = (BOARD_WIDTH - shape.shape[1]) // 2
        y = 0  # Start at the top
        return {'type': piece_type, 'shape': shape, 'x': x, 'y': y, 'rot': 0}

    def get_state(self) -> Dict:
        """Returns the current state of the environment."""
        return {
            'board': self.board.copy(),
            'current_piece_type': self.current_piece['type'],
            'next_piece_type': self.next_piece_in_bag,
        }

    def _collides(self, shape: np.ndarray, pos: Tuple[int, int]) -> bool:
        """Checks for collision of a shape at a given position."""
        x, y = pos
        h, w = shape.shape
        for r in range(h):
            for c in range(w):
                if shape[r, c]:
                    board_y, board_x = y + r, x + c
                    if not (0 <= board_x < BOARD_WIDTH and 0 <= board_y < BOARD_HEIGHT):
                        return True  # Out of bounds
                    if self.board[board_y, board_x]:
                        return True  # Collision with existing block
        return False

    def get_valid_moves(self) -> List[Tuple[int, int]]:
        """
        Calculates all possible final placements (rotation, x_position) for the current piece.
        Returns an empty list if no moves are possible (e.g., blocked at spawn).
        """
        moves = []
        piece_type = self.current_piece['type']
        base_shape = TETROMINOES[piece_type]

        seen_states = set()

        for rot in range(N_ROTATIONS[piece_type]):
            shape = np.rot90(base_shape, k=-rot)  # Using negative k for clockwise rotation convention
            max_x = BOARD_WIDTH - shape.shape[1]
            for x in range(max_x + 1):
                # Find drop position by simulating a hard drop
                y = 0
                # First, check if the piece can even be in this column at the top
                if self._collides(shape, (x, y)):
                    continue
                while not self._collides(shape, (x, y + 1)):
                    y += 1

                # Simulate placing the piece to check for duplicate terminal states
                sim_board = self.board.copy()
                for r in range(shape.shape[0]):
                    for c in range(shape.shape[1]):
                        if shape[r, c]:
                            sim_board[y + r, x + c] = True

                # In the acyclic setting we do not clear lines. We merely keep
                # track of the board after placement, so no rows are removed.

                board_hash = sim_board.tobytes()
                if board_hash in seen_states:
                    continue
                seen_states.add(board_hash)
                moves.append((rot, x))

        return moves

    def step(self, action: Tuple[int, int]) -> Tuple[Dict, float, bool]:
        """
        Executes a move (placement), updates the board, and returns the new state.
        A "step" in this GFN context is a full piece placement.
        """
        if self.game_over:
            return self.get_state(), 0.0, True

        rot, x = action
        piece_type = self.current_piece['type']
        shape = np.rot90(TETROMINOES[piece_type], k=-rot)

        # Count how many full lines exist before placing the piece. This allows
        # us to compute the number of newly completed lines without actually
        # clearing them from the board (the environment is acyclic).
        prev_full_lines = int(np.sum(np.all(self.board, axis=1)))

        # Drop the piece. This logic is safe because get_valid_moves ensures this is possible.
        y = 0
        while not self._collides(shape, (x, y + 1)):
            y += 1

        # Place the piece on the board
        h, w = shape.shape
        for r in range(h):
            for c in range(w):
                if shape[r, c]:
                    self.board[y + r, x + c] = True

        # Count new full lines created by this placement.  Since lines are never
        # removed, this is the difference between the number of full rows before
        # and after the piece is placed.
        new_full_lines = int(np.sum(np.all(self.board, axis=1)))
        lines_cleared_this_step = new_full_lines - prev_full_lines

        # Clamp in case something goes wrong (should never exceed 4 in Tetris).
        lines_cleared_this_step = max(0, min(lines_cleared_this_step, 4))
        self.lines_cleared += lines_cleared_this_step

        # Use standard squared rewards for bigger impact on score
        reward_map = {0: 0, 1: 1, 2: 3, 3: 5, 4: 8}
        reward = reward_map.get(lines_cleared_this_step, reward_map[4])
        self.score += reward


        # Spawn next piece
        self.current_piece = self._spawn_piece()
        self.next_piece_in_bag = self.bag[0] if self.bag else None

        # Check for game over (if new piece spawns in a collision)
        if self._collides(self.current_piece['shape'], (self.current_piece['x'], self.current_piece['y'])):
            self.game_over = True

        return self.get_state(), float(reward), self.game_over

    def _clear_lines(self) -> int:
        """Count completed lines without modifying the board."""
        full_rows = np.all(self.board, axis=1)
        # No rows are actually removed in the acyclic formulation
        return int(np.sum(full_rows))


class ProHeuristic:
    """
    An enhanced heuristic with more sophisticated features for near-perfect play,
    focusing on creating a clean stack and setting up Tetrises.
    """
    def __init__(self, weights: Optional[np.ndarray] = None):
        if weights is None:
            # New weights for: [agg_height, holes, hole_depth, row_transitions, bumpiness, wells, lines_cleared^1.5]
            # Heavily favor line clears and keeping the stack low.
            self.weights = torch.tensor([-5.0, -8.5, -4.0, -3.5, -3.4, -3.8, 7.5], dtype=torch.float32)
        else:
            self.weights = torch.tensor(weights, dtype=torch.float32)
        self._sim_env = TetrisEnv() # A private, stateless helper

    @staticmethod
    def get_board_features(board: np.ndarray) -> np.ndarray:
        """Calculate advanced features for a given board state."""
        heights = np.zeros(BOARD_WIDTH, dtype=int)
        for c in range(BOARD_WIDTH):
            if np.any(board[:, c]):
                heights[c] = BOARD_HEIGHT - np.where(board[:, c])[0][0]

        agg_height = np.sum(heights)
        bumpiness = np.sum(np.abs(np.diff(heights)))

        holes = 0
        hole_depth = 0 # Sum of filled cells above holes
        row_transitions = 0
        
        # Calculate holes, hole_depth, and row_transitions
        for r in range(BOARD_HEIGHT):
            # Row transitions: Check for changes from empty to full or vice-versa
            row_has_block = False
            for c in range(BOARD_WIDTH):
                is_filled = board[r, c]
                if is_filled:
                    row_has_block = True
                # A transition occurs if a cell is empty but the one to its right is full (or board edge)
                if c > 0 and board[r, c-1] != board[r, c]:
                    row_transitions +=1
            #Transitions on the edges of the board
            if board[r,0] == False: row_transitions +=1
            if board[r, BOARD_WIDTH-1] == False: row_transitions +=1


            # Hole calculations: A hole is an empty cell with a block above it.
            if row_has_block: # No need to check rows with no blocks
                for c in range(BOARD_WIDTH):
                    if not board[r, c] and heights[c] > (BOARD_HEIGHT - r):
                        holes += 1
                        # Count filled cells above this hole in the same column
                        hole_depth += np.sum(board[0:r, c])
        
        # Well calculation
        wells = 0
        for c in range(BOARD_WIDTH):
            for r in range(BOARD_HEIGHT):
                if not board[r,c]: # Found an empty cell
                    left_wall = (c == 0) or (board[r, c-1])
                    right_wall = (c == BOARD_WIDTH - 1) or (board[r, c+1])
                    if left_wall and right_wall:
                        # This is the top of a well, sum its depth
                        depth = 0
                        for r_well in range(r, BOARD_HEIGHT):
                            if not board[r_well, c]:
                                depth += 1
                            else:
                                break
                        wells += (depth * (depth + 1)) // 2 # Sum of arithmetic series 1+2+...+depth
                        break # Move to next column once a well is found and summed

        return np.array([agg_height, holes, hole_depth, row_transitions, bumpiness, wells])

    def score_state(self, board: np.ndarray, lines_cleared: int) -> float:
        """Scores a single board state using the advanced features."""
        features = self.get_board_features(board)

        # Apply a non-linear reward for line clears to heavily favor Tetrises
        lines_cleared_reward = lines_cleared ** 1.5

        all_features = torch.from_numpy(np.append(features, lines_cleared_reward)).float()
        return torch.dot(all_features, self.weights.to(all_features.device)).item()

    def score_moves(
        self,
        board: np.ndarray,
        current_piece_type: str,
        next_piece_type: str,
        next_next_piece_type: str,
        moves: List[Tuple[int, int]],
    ) -> torch.Tensor:
        """Scores moves using a two-step lookahead."""
        scores = []
        cleared_counts = []
        
        for rot, x in moves:
            # 1. Simulate placing the CURRENT piece
            sim_board = board.copy()
            prev_lines_0 = int(np.sum(np.all(sim_board, axis=1)))
            self._sim_env.board = sim_board
            shape = np.rot90(TETROMINOES[current_piece_type], k=-rot)

            y = 0
            # This check is technically redundant due to get_valid_moves, but good for safety
            if self._sim_env._collides(shape, (x, 0)):
                scores.append(-1e9) # Should not happen with valid moves
                continue

            while not self._sim_env._collides(shape, (x, y + 1)):
                y += 1

            h, w = shape.shape
            for r in range(h):
                for c in range(w):
                    if shape[r, c]:
                        sim_board[y + r, x + c] = True

            # 2. Check for line clears from this move
            lines_after_first = int(np.sum(np.all(sim_board, axis=1)))
            lines_cleared_this_step = lines_after_first - prev_lines_0
            lines_cleared_this_step = max(0, min(lines_cleared_this_step, 4))
            cleared_counts.append(lines_cleared_this_step)
            # Do not actually clear lines; keep the board as is
            post_clear_board = sim_board
            
            # --- 3. Two-step Lookahead ---
            best_next_score = -float("inf")

            self._sim_env.board = post_clear_board
            self._sim_env.current_piece = {
                'type': next_piece_type,
                'shape': TETROMINOES[next_piece_type],
            }
            next_moves = self._sim_env.get_valid_moves()

            if not next_moves:
                best_next_score = -1e9
            else:
                for next_rot, next_x in next_moves:
                    board_after_next = post_clear_board.copy()
                    prev_lines_1 = lines_after_first
                    self._sim_env.board = board_after_next

                    next_shape = np.rot90(TETROMINOES[next_piece_type], k=-next_rot)
                    next_y = 0
                    while not self._sim_env._collides(next_shape, (next_x, next_y + 1)):
                        next_y += 1

                    for r in range(next_shape.shape[0]):
                        for c in range(next_shape.shape[1]):
                            if next_shape[r, c]:
                                board_after_next[next_y + r, next_x + c] = True

                    lines_after_next_total = int(np.sum(np.all(board_after_next, axis=1)))
                    lines_after_next = lines_after_next_total - prev_lines_1
                    lines_after_next = max(0, min(lines_after_next, 4))
                    # In the acyclic setting do not clear lines
                    cleared_board = board_after_next

                    # Second lookahead
                    self._sim_env.board = cleared_board
                    self._sim_env.current_piece = {
                        'type': next_next_piece_type,
                        'shape': TETROMINOES[next_next_piece_type],
                    }
                    next_next_moves = self._sim_env.get_valid_moves()

                    best_third_score = -float("inf")
                    if not next_next_moves:
                        best_third_score = -1e9
                    else:
                        for nn_rot, nn_x in next_next_moves:
                            board_after_nn = cleared_board.copy()
                            prev_lines_2 = lines_after_next_total
                            self._sim_env.board = board_after_nn

                            nn_shape = np.rot90(TETROMINOES[next_next_piece_type], k=-nn_rot)
                            nn_y = 0
                            while not self._sim_env._collides(nn_shape, (nn_x, nn_y + 1)):
                                nn_y += 1

                            for r in range(nn_shape.shape[0]):
                                for c in range(nn_shape.shape[1]):
                                    if nn_shape[r, c]:
                                        board_after_nn[nn_y + r, nn_x + c] = True

                            lines_after_nn_total = int(np.sum(np.all(board_after_nn, axis=1)))
                            lines_after_nn = lines_after_nn_total - prev_lines_2
                            lines_after_nn = max(0, min(lines_after_nn, 4))

                            score2 = self.score_state(board_after_nn, lines_after_nn)
                            if score2 > best_third_score:
                                best_third_score = score2

                    score1 = self.score_state(cleared_board, lines_after_next) + 0.6 * best_third_score
                    if score1 > best_next_score:
                        best_next_score = score1
            
            # 4. Final score combines immediate board quality with future potential
            # The immediate score is based on the state *after* the first piece is placed
            immediate_score = self.score_state(post_clear_board, lines_cleared_this_step)
            # Discount the future score slightly to prioritize the current move's quality
            final_score = immediate_score + 0.5 * best_next_score
            scores.append(final_score)
        scores = torch.tensor(scores, dtype=torch.float32)
        cleared_counts = torch.tensor(cleared_counts, dtype=torch.int)

        max_clear = int(cleared_counts.max().item())
        if max_clear > 0:
            scores[cleared_counts < max_clear] -= 1e6
        return scores
    
# --- Model ---
class SEBlock(nn.Module):
    """Squeeze-and-Excitation Block."""
    def __init__(self, channels, reduction=4):
        super().__init__()
        self.avg_pool = nn.AdaptiveAvgPool2d(1)
        self.fc = nn.Sequential(
            nn.Linear(channels, channels // reduction, bias=False),
            nn.ReLU(inplace=True),
            nn.Linear(channels // reduction, channels, bias=False),
            nn.Sigmoid()
        )
    def forward(self, x):
        b, c, _, _ = x.size()
        y = self.avg_pool(x).view(b, c)
        y = self.fc(y).view(b, c, 1, 1)
        return x * y.expand_as(x)
    
class ResidualBlock(nn.Module):
    """Residual Block with SE."""
    expansion = 1
    def __init__(self, in_ch, out_ch, stride=1):
        super().__init__()
        self.conv1 = nn.Conv2d(in_ch, out_ch, 3, stride, 1, bias=False)
        self.bn1   = nn.BatchNorm2d(out_ch)
        self.relu  = nn.ReLU(inplace=True)
        self.conv2 = nn.Conv2d(out_ch, out_ch, 3, padding=1, bias=False)
        self.bn2   = nn.BatchNorm2d(out_ch)
        self.se    = SEBlock(out_ch)
        
        self.shortcut = nn.Sequential()
        if stride != 1 or in_ch != out_ch:
            self.shortcut = nn.Sequential(
                nn.Conv2d(in_ch, out_ch, 1, stride, bias=False),
                nn.BatchNorm2d(out_ch)
            )
            
    def forward(self, x):
        out = self.relu(self.bn1(self.conv1(x)))
        out = self.bn2(self.conv2(out))
        out = self.se(out)
        out += self.shortcut(x)
        return self.relu(out)

class GFNNet(nn.Module):
    """ResNet-style trunk with 4 stages + SE, then MLP head."""
    def __init__(self,
                 block=ResidualBlock,
                 num_blocks=[2,2,2,2],
                 base_channels=32,
                 n_pieces=N_PIECES):
        super().__init__()
        self.in_ch = base_channels
        self.conv1 = nn.Conv2d(1, base_channels, 3, padding=1, bias=False)
        self.bn1   = nn.BatchNorm2d(base_channels)
        self.relu  = nn.ReLU(inplace=True)

        self.layer1 = self._make_layer(block, base_channels,     num_blocks[0], stride=1)
        self.layer2 = self._make_layer(block, base_channels*2,   num_blocks[1], stride=2)
        self.layer3 = self._make_layer(block, base_channels*4,   num_blocks[2], stride=2)
        self.layer4 = self._make_layer(block, base_channels*8,   num_blocks[3], stride=2)

        self.avgpool = nn.AdaptiveAvgPool2d((1,1))
        fc_dim = base_channels * 8
        self.fc = nn.Sequential(
            nn.Linear(base_channels*8 * block.expansion + 2*n_pieces, fc_dim),
            nn.ReLU(True),
            nn.Dropout(0.5),
            nn.Linear(fc_dim, 4 * BOARD_WIDTH) # 4 rotations, 10 positions
        )

    def _make_layer(self, block, out_ch, blocks, stride):
        strides = [stride] + [1]*(blocks-1)
        layers = []
        for s in strides:
            layers.append(block(self.in_ch, out_ch, s))
            self.in_ch = out_ch * block.expansion
        return nn.Sequential(*layers)

    def forward(self, board, cur_onehot, nxt_onehot):
        x = board.unsqueeze(1).float() # Add channel dimension and convert to float
        x = self.relu(self.bn1(self.conv1(x)))
        x = self.layer1(x)
        x = self.layer2(x)
        x = self.layer3(x)
        x = self.layer4(x)
        x = self.avgpool(x).flatten(1)
        x = torch.cat([x, cur_onehot, nxt_onehot], dim=1)
        logits = self.fc(x)
        return logits.view(-1, 4, BOARD_WIDTH) # (Batch, Rotations, Positions)

# -------------------------------------------------
# 1. GFlowNet Wrapper: Policy Network + logZ
# -------------------------------------------------
class TetrisFlowNet(nn.Module):
    """
    Wraps the ResNet-style policy (GFNNet) and maintains per-piece
    normalizing constants (logZ) as trainable parameters.

    - `model`: outputs raw logits over (rotation, x) moves.
    - `logZ`: a vector of length `n_pieces`, where each entry
      estimates total forward "flow" out of the start state for
      that initial piece type.
    """
    def __init__(self, n_pieces: int):
        super().__init__()
        self.model = GFNNet(n_pieces=n_pieces)
        # Initialize all logZ[c] = 0: will learn relative ease of
        # generating high-reward trajectories from each piece c.
        self.logZ = nn.Parameter(torch.zeros(n_pieces))

    def forward(self, board, cur_piece_id, nxt_piece_id):
        """
        - `board`: tensor of shape (batch, H, W)
        - `cur_piece_id`, `nxt_piece_id`: tensor of ints
        Returns logits of shape (batch, 4, BOARD_WIDTH).
        """
        return self.model(board, cur_piece_id, nxt_piece_id)
    
# --- Training ---

# -------------------------------------------------
# 2. Alpha Annealing: Mixing Heuristic & Learned Policy
# -------------------------------------------------
def get_current_alpha(step: int, args) -> float:
    """
    Linearly interpolate α from alpha_start to alpha_end over
    alpha_anneal_steps total training steps. Once step exceeds
    the anneal schedule, α stays at alpha_end.
    """
    if step >= args.alpha_anneal_steps:
        return args.alpha_end
    return args.alpha_start + (args.alpha_end - args.alpha_start) * (
        step / args.alpha_anneal_steps
    )



# -------------------------------------------------
# 3. Trajectory Generation under Mixed Policy
# -------------------------------------------------
def run_episode(env, model, heuristic, alpha, device, is_imitation, max_steps=0):
    """
    Sample a full-piece-placement trajectory:

    - If `is_imitation`, greedily follow the heuristic and record
      (state, best_action) pairs for supervised pre-training.
    - Otherwise, at each step:
        • Compute model logits (log π_θ)
        • Compute heuristic scores (h)
        • Form p_mix = α·π_θ + (1−α)·h
        • Sample an action under p_mix
        • Store log_prob of the model’s π_θ for TB loss

    Returns:
        trajectory: list of dicts with keys {cur_piece_id, log_prob} (GFN)
        final_score: total episode score for reward computation
    """
    state = env.reset()
    trajectory = []
    steps = 0

    while not env.game_over:
        board = state['board']
        cur_type = state['current_piece_type']
        nxt_type = state['next_piece_type']
        next_next_type = env.bag[1] if len(env.bag) > 1 else nxt_type

        valid_moves = env.get_valid_moves()
        if not valid_moves:
            break  # No legal placements → game over

        # Compute heuristic scores for all valid moves
        heuristic_scores = heuristic.score_moves(
            board, cur_type, nxt_type, next_next_type, valid_moves
        ).to(device)

        if is_imitation:
            # Imitation: pick the single best move from the heuristic
            best_idx = torch.argmax(heuristic_scores).item()
            action = valid_moves[best_idx]
            # Store board & label for cross-entropy training
            trajectory.append({
                'board': board,
                'cur_piece_id': PIECE_IDS[cur_type],
                'nxt_piece_id': PIECE_IDS[nxt_type],
                'best_action_label': best_idx
            })
        else:
            # GFlowNet: combine model & heuristic
            b = torch.from_numpy(board).unsqueeze(0).to(device)
            cur_id = torch.tensor([PIECE_IDS[cur_type]], device=device)
            nxt_id = torch.tensor([PIECE_IDS[nxt_type]], device=device)

            with torch.no_grad():
                logits = model(b, cur_id, nxt_id).squeeze(0)

            # Mask invalid logits
            mask = torch.zeros_like(logits, dtype=torch.bool)
            for i, (r, x) in enumerate(valid_moves):
                mask[r, x] = True
            valid_logits = logits[mask]

            # Convert to distributions
            p_model     = F.softmax(valid_logits, dim=0)
            p_heuristic = F.softmax(heuristic_scores, dim=0)
            p_mix = alpha * p_model + (1 - alpha) * p_heuristic

            # Sample & record log-prob under the MODEL policy
            idx = torch.multinomial(p_mix, 1).item()
            action = valid_moves[idx]
            logp = torch.log(p_model[idx] + 1e-9)
            trajectory.append({'cur_piece_id': PIECE_IDS[cur_type], 'log_prob': logp})

        # Apply action in the environment
        state, _, _ = env.step(action)
        steps += 1
        if max_steps and steps >= max_steps:
            break

    return trajectory, env.score

# -------------------------------------------------
# 4. Training Step with Trajectory Balance Loss
# -------------------------------------------------
def train_step(optimizer, model, batch_data, is_imitation, imitation_fn, device):
    """
    Perform one optimization step over a batch of trajectories.

    - If `is_imitation`: stack collected (state → best_action) pairs
      and apply CrossEntropyLoss to warm-start the policy.
    - Else (GFN): for each trajectory:
        • Sum the stored log_probs → log F(τ)
        • Read logZ for the trajectory’s first piece
        • Compute log R = log(max(score,1))
        • Loss = (logZ + log F(τ) − log R)²
      then average over the batch.
    """
    optimizer.zero_grad()

    if is_imitation:
        # --- Supervised imitation loss ---
        boards, cur_ids, nxt_ids, labels = [], [], [], []
        for ep in batch_data:
            for step in ep['trajectory']:
                boards.append(step['board'])
                cur_ids.append(step['cur_piece_id'])
                nxt_ids.append(step['nxt_piece_id'])
                labels.append(step['best_action_label'])

        if not boards:
            return torch.tensor(0.0)
        B = len(boards)
        b = torch.from_numpy(np.stack(boards)).to(device)
        c = torch.tensor(cur_ids, dtype=torch.long, device=device)
        n = torch.tensor(nxt_ids, dtype=torch.long, device=device)
        y = torch.tensor(labels, dtype=torch.long, device=device)

        logits = model(b, c, n).view(B, -1)
        loss = imitation_fn(logits, y)
    else:
        # --- Trajectory Balance loss ---
        losses = []
        for ep in batch_data:
            traj, final_score = ep['trajectory'], ep['score']
            if not traj:
                continue
            # 4a) log forward flow
            logF = sum(step['log_prob'] for step in traj)
            # 4b) logZ of initial piece
            init_c = traj[0]['cur_piece_id']
            logZ = model.logZ[init_c]
            # 4c) log reward (avoid log(0))
            logR = torch.log(torch.tensor(max(final_score,1.0), device=logZ.device))
            # 4d) squared TB loss
            losses.append((logZ + logF - logR)**2)
        loss = torch.stack(losses).mean() if losses else torch.tensor(0.0, device=device)

    loss.backward()
    nn.utils.clip_grad_norm_(model.parameters(), 1.0)
    optimizer.step()
    return loss

# The format for an action is (rotation, x_position)
# Rotations: 0=spawn, 1=right, 2=180, 3=left
PERFECT_CLEAR_OPENERS = {
    # Key: Sorted pieces in the bag. Value: A list of successful permutations.
    'IJLOSTZ': [
        {
            'permutation': ['L', 'J', 'S', 'Z', 'T', 'O', 'I'],
            'moves': [('L', (0, 7)), ('J', (0, 0)), ('S', (0, 3)), ('Z', (0, 5)), ('T', (2, 2)), ('O', (0, 1)), ('I', (1, 3))]
        },
        {
            'permutation': ['T', 'S', 'Z', 'J', 'L', 'O', 'I'],
            'moves': [('T', (0, 1)), ('S', (0, 8)), ('Z', (0, 6)), ('J', (2, 3)), ('L', (2, 5)), ('O', (0, 4)), ('I', (0, 3))]
        },
        {
            'permutation': ['O', 'I', 'L', 'J', 'S', 'Z', 'T'],
            'moves': [('O', (0, 0)), ('I', (1, 2)), ('L', (1, 0)), ('J', (3, 2)), ('S', (1, 1)), ('Z', (1, 0)), ('T', (2, 1))]
        },
        {
            'permutation': ['I', 'O', 'S', 'Z', 'L', 'J', 'T'],
            'moves': [('I', (1, 0)), ('O', (0, 3)), ('S', (0, 5)), ('Z', (0, 7)), ('L', (2, 2)), ('J', (2, 8)), ('T', (0, 1))]
        },
        {
            'permutation': ['Z', 'S', 'L', 'J', 'I', 'O', 'T'],
            'moves': [('Z', (0, 0)), ('S', (0, 2)), ('L', (3, 0)), ('J', (1, 2)), ('I', (0, 3)), ('O', (0, 6)), ('T', (2, 1))]
        },
        {
            'permutation': ['L', 'J', 'T', 'S', 'Z', 'O', 'I'],
            'moves': [('L', (0, 0)), ('J', (2, 8)), ('T', (2, 1)), ('S', (0, 2)), ('Z', (0, 4)), ('O', (0, 6)), ('I', (1, 4))]
        },
    ]
    # This dictionary can be extended with solutions for other bags.
    # Finding all solutions for all 5040 bag permutations is a significant task,
    # but adding the most common ones provides a massive advantage.
}

def main():
    parser = argparse.ArgumentParser(description="Train a Professional GFlowNet Tetris Agent")
    parser.add_argument('--episodes', type=int, default=100000, help="Total training episodes.")
    parser.add_argument('--batch-size', type=int, default=32, help="Number of trajectories per training step.")
    parser.add_argument('--imitation-epochs', type=int, default=5000, help="Number of initial epochs for imitation learning.")
    parser.add_argument('--lr', type=float, default=2e-4, help="Learning rate.")
    parser.add_argument('--lr-decay-step', type=int, default=20000, help="Step size for LR decay.")
    parser.add_argument('--lr-decay-gamma', type=float, default=0.5, help="LR decay factor.")
    parser.add_argument('--alpha-start', type=float, default=0.2, help="Starting alpha (GFN policy weight).")
    parser.add_argument('--alpha-end', type=float, default=0.95, help="Final alpha.")
    parser.add_argument('--alpha-anneal-steps', type=int, default=50000, help="Steps to anneal alpha over.")
    parser.add_argument('--checkpoint-path', type=str, default='gfn_tetris_pro.pt', help="Path to save model checkpoint.")
    parser.add_argument('--onnx-path', type=str, default='gfn_tetris_pro.onnx', help="Path to export ONNX model.")
    parser.add_argument('--log-dir', type=str, default='runs/tetris_pro_gfn', help="TensorBoard log directory.")
    parser.add_argument('--seed', type=int, default=int(time.time()), help="Random seed.")
    parser.add_argument('--max-steps', type=int, default=0, help="Maximum placements per episode (focus on early game).")
    parser.add_argument('--use-fixed-seq', action='store_true', help="Train on the same piece order as the JS demo.")
    parser.add_argument('--base-channels', type=int, default=32,
                        help='Base channel count for the neural net (lower for a smaller model).')
    parser.add_argument('--minimal-checkpoint', action='store_true',
                        help='Save a smaller checkpoint by omitting optimizer state and using dynamic quantization.')
    args = parser.parse_args()
    
    print(torch.backends.mps.is_available())   # should print True
    print(torch.backends.mps.is_built())       # should print True 

    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)

 # Use Apple MPS (Metal GPU) if available, then CUDA, else CPU
    if torch.backends.mps.is_available():
        device = torch.device('mps')
    elif torch.cuda.is_available():
        device = torch.device('cuda')
    else:
        device = torch.device('cpu')
    print(f"Using device: {device}")

    writer = SummaryWriter(args.log_dir)
    fixed_seq = PREDEFINED_PIECES if args.use_fixed_seq else None
    env = TetrisEnv(seed=args.seed, fixed_sequence=fixed_seq)
    heuristic = ProHeuristic()
    heuristic.weights = heuristic.weights.to(device)

    model = TetrisFlowNet(base_channels=args.base_channels).to(device)
    optimizer = optim.Adam(model.parameters(), lr=args.lr)
    scheduler = optim.lr_scheduler.StepLR(optimizer, step_size=args.lr_decay_step, gamma=args.lr_decay_gamma)
    imitation_loss_fn = nn.CrossEntropyLoss()

    episode_scores = deque(maxlen=100)
    total_steps = 0
    batch_buffer = []
    prev_is_imitation = True

    print("Starting training…")
    for ep in range(1, args.episodes + 1):
        is_imitation = ep <= args.imitation_epochs
        if is_imitation != prev_is_imitation:
            batch_buffer = []
            prev_is_imitation = is_imitation
        alpha = 0.0 if is_imitation else get_current_alpha(total_steps, args)
        
        trajectory, final_score = run_episode(
            env, model, heuristic, alpha, device, is_imitation, args.max_steps
        )
        
        if trajectory: # Only add episodes that had at least one move
            batch_buffer.append({'trajectory': trajectory, 'score': final_score})
            total_steps += len(trajectory)

        episode_scores.append(final_score)
        
        loss = None
        if len(batch_buffer) >= args.batch_size:
            loss = train_step(optimizer, model, batch_buffer, is_imitation, imitation_loss_fn, device)
            scheduler.step()
            batch_buffer = []

        if ep % 100 == 0:
            avg_score = np.mean(episode_scores) if episode_scores else 0.0
            mode = "IMITATION" if is_imitation else "GFN"
            print(f"Ep {ep}/{args.episodes} [{mode}] | Avg Score: {avg_score:.2f} | "
                  f"LR: {scheduler.get_last_lr()[0]:.1e} | Alpha: {alpha:.2f} | "
                  f"Loss: {loss.item() if loss is not None else 'N/A'}")
            
            writer.add_scalar('Performance/Average_Score_100ep', avg_score, ep)
            writer.add_scalar('Training/Learning_Rate', scheduler.get_last_lr()[0], ep)
            writer.add_scalar('Training/Alpha', alpha, ep)
            if loss is not None:
                writer.add_scalar('Training/Loss', loss.item(), ep)
            
            for i, piece_name in enumerate(PIECE_IDS.keys()):
                writer.add_scalar(f'LogZ/{piece_name}', model.logZ[i].item(), ep)

    writer.close()

    # --- Save and Export ---
    print("Training finished. Saving model...")
    Path(args.checkpoint_path).parent.mkdir(exist_ok=True, parents=True)
    if args.minimal_checkpoint:
        print("Saving minimal checkpoint with dynamic quantization…")
        quantized_model = torch.quantization.quantize_dynamic(
            model, {nn.Linear}, dtype=torch.qint8
        )
        torch.save({'model_state_dict': quantized_model.state_dict()}, args.checkpoint_path)
    else:
        torch.save({
            'model_state_dict': model.state_dict(),
            'optimizer_state_dict': optimizer.state_dict(),
            'args': args,
        }, args.checkpoint_path)
    size_mb = Path(args.checkpoint_path).stat().st_size / (1024 * 1024)
    print(f"✅ Saved checkpoint: {args.checkpoint_path} ({size_mb:.2f} MB)")

    model.eval()
    export_model = model
    if args.minimal_checkpoint:
        export_model = torch.quantization.quantize_dynamic(model, {nn.Linear}, dtype=torch.qint8)
    dummy_board = torch.randn(1, BOARD_HEIGHT, BOARD_WIDTH, device=device)
    dummy_cur_id = torch.tensor([0], dtype=torch.long, device=device)
    dummy_nxt_id = torch.tensor([1], dtype=torch.long, device=device)
    dummy_cur_oh = F.one_hot(dummy_cur_id, N_PIECES).float()
    dummy_nxt_oh = F.one_hot(dummy_nxt_id, N_PIECES).float()

    Path(args.onnx_path).parent.mkdir(exist_ok=True, parents=True)
    try:
        torch.onnx.export(
            export_model.model,
            (dummy_board, dummy_cur_oh, dummy_nxt_oh),
            args.onnx_path,
            export_params=True,
            opset_version=12,
            input_names=['board', 'cur_onehot', 'nxt_onehot'],
            output_names=['logits'],
            dynamic_axes={
                'board': {0:'batch'},
                'cur_onehot': {0:'batch'},
                'nxt_onehot': {0:'batch'},
                'logits': {0:'batch'},
            }
        )
        size_mb = Path(args.onnx_path).stat().st_size / (1024 * 1024)
        print(f"✅ Exported ONNX model: {args.onnx_path} ({size_mb:.2f} MB)")
    except Exception as e:
        print(f"❌ Failed to export ONNX model: {e}")


if __name__ == '__main__':
    main()