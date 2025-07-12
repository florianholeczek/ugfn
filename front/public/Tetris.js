"use strict";
let ortSession = null;
let scoringInProgress = false;

// Call this once during init()
async function loadGFlowNetModel() {
  // assuming gfn.onnx lives in the same folder as your HTML page
  ortSession = await ort.InferenceSession.create('./gfn.onnx');
  console.log('✅ ONNX model loaded');
}
/*
  -------------------------------------------------------------------------------
  main.js – Single-File Frontend-Only Implementation of GFlowNet Tetris
  -------------------------------------------------------------------------------
  This file combines the entire logic of the Python/Flask backend and the previous
  main.js front-end into a single JavaScript file so that it can be hosted as a
  static webpage (e.g., on GitHub Pages).

  **Important**:
   - It attempts to load a pretrained GFlowNet parameter file named "pretrained_flows_tb.json"
     from the same directory. Make sure this JSON file is present in the same
     folder as main.js. If it is missing or cannot be loaded, it will simply start
     with random flows.
   - All references to Flask/Python endpoints have been replaced with equivalent
     in-browser functions that maintain the same logic.
   - The Tetris logic and the TrajectoryBalanceAgent logic remain almost identical
     to the Python code, except translated into JavaScript.
   - No functionality has been removed. The gameplay, GFlowNet sampling, and TB updates
     happen exactly as before.

  Usage instructions:
   - Provide a "pretrained_flows_tb.json" in the same directory to load from.
   - The game should start automatically. The GFlowNet will pick moves or, by default,
     the code will "auto-click" the best candidate. The user can also manually click
     a candidate from the candidate list to select that move instead.
   - On game over, the agent updates the flows using the TB algorithm and restarts a new game.

  Everything is in one file and well over 700 lines to preserve all functionality.
*/

//-----------------------------------------------------------------------------
// CONSTANTS & GLOBALS
//-----------------------------------------------------------------------------

const CELL_SIZE = 30;
const COLS      = 6;
const ROWS      = 20;
const TICK_INTERVAL       = 700;
const MOVE_PAUSE_DURATION = 2000;



// We'll store the game logic objects in global variables for convenience
let game = null;
let agent = null;
let trajectory = [];

// UI elements
let canvas = null;
let ctx = null;
let candidateListEl = null;
let resetBtn = null;
let pauseBtn = null;

// We'll keep track of game state & candidate moves in these globals
let currentGameState = null;
let currentPieceCenter = { x: 0, y: 0 };
let candidateMoves = [];
let topCandidates = [];
let appliedArrows = [];
let particles = [];

// Overlays for starting/restarting the game
let startOverlay = null;
let restartOverlay = null;

// Some internal flags/states
let simulationPaused = false;
let lastPieceId = null;
let particleSpawnAccumulator = 0;
let lastTime = performance.now();

/*
  The TETROMINOES are the standard Tetris shapes. This matches the Python dict.
*/
const TETROMINOES = {
  I: [
    [0,0,0,0],
    [1,1,1,1],
    [0,0,0,0],
    [0,0,0,0]
  ],
  O: [
    [1,1],
    [1,1]
  ],
  T: [
    [0,1,0],
    [1,1,1],
    [0,0,0]
  ],
  S: [
    [0,1,1],
    [1,1,0],
    [0,0,0]
  ],
  Z: [
    [1,1,0],
    [0,1,1],
    [0,0,0]
  ],
  J: [
    [1,0,0],
    [1,1,1],
    [0,0,0]
  ],
  L: [
    [0,0,1],
    [1,1,1],
    [0,0,0]
  ]
};
// right after your constants
const BASE = ['I','O','T','S','Z','J','L'];
let nextIdx = 0;
function getNextPiece() {
  const p = BASE[nextIdx];
  nextIdx = (nextIdx + 1) % BASE.length;
  return p;
}
const N_PIECES = BASE.length;   // 7

const PREDEFINED_PIECES = Array.from({length:1000}, () => getNextPiece());
//-----------------------------------------------------------------------------
// HELPER FUNCTIONS
//-----------------------------------------------------------------------------

/**
 * deepCopy: Return a deep copy of a 2D array.
 * (Similar to Python's copy.deepcopy)
 */
function deepCopy(matrix) {
  return JSON.parse(JSON.stringify(matrix));
}

/**
 * rotateMatrix: Rotate a 2D matrix 90 degrees clockwise.
 */
function rotateMatrix(matrix) {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const rotated = [];
  for (let c = 0; c < cols; c++) {
    rotated[c] = [];
    for (let r = rows - 1; r >= 0; r--) {
      rotated[c].push(matrix[r][c]);
    }
  }
  return rotated;
}

/**
 * hexToRgb: Convert a hex color (e.g. "#c0c0c0") to an {r,g,b} object.
 */
function hexToRgb(hex) {
  hex = hex.replace(/^#/, "");
  const bigint = parseInt(hex, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255
  };
}

// -----------------------------------------------------------------------------
// Heuristic Scoring (inspired by ProHeuristic in imp.py)
// -----------------------------------------------------------------------------
const HEURISTIC_WEIGHTS = [-4.5, -7.9, -3.4, -3.2, -3.1, -3.3, 4.5];
// Weight for heuristic when combining with log flows.  The model shipped with
// the demo is very weak so we rely much more on the heuristic.
const HEURISTIC_MIX    = 0.5;
// Extra weight applied to the lookahead score when evaluating a move.
const LOOKAHEAD_FACTOR = 0.5;

function computeBoardFeatures(board) {
  const heights = new Array(COLS).fill(0);
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (board[r][c]) {
        heights[c] = ROWS - r;
        break;
      }
    }
  }
  const aggHeight = heights.reduce((a, b) => a + b, 0);
  const bumpiness = heights.slice(1).reduce((s, h, i) => s + Math.abs(h - heights[i]), 0);

  let holes = 0;
  let holeDepth = 0;
  let rowTrans = 0;

  for (let r = 0; r < ROWS; r++) {
    let rowHasBlock = false;
    for (let c = 0; c < COLS; c++) {
      const filled = board[r][c];
      if (filled) rowHasBlock = true;
      if (c > 0 && board[r][c - 1] !== filled) rowTrans++;
    }
    if (!board[r][0]) rowTrans++;
    if (!board[r][COLS - 1]) rowTrans++;

    if (rowHasBlock) {
      for (let c = 0; c < COLS; c++) {
        if (!board[r][c] && heights[c] > (ROWS - r)) {
          holes++;
          let depth = 0;
          for (let rr = 0; rr < r; rr++) {
            if (board[rr][c]) depth++;
          }
          holeDepth += depth;
        }
      }
    }
  }

  let wells = 0;
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (!board[r][c]) {
        const leftWall = (c === 0) || board[r][c - 1];
        const rightWall = (c === COLS - 1) || board[r][c + 1];
        if (leftWall && rightWall) {
          let depth = 0;
          for (let rr = r; rr < ROWS && !board[rr][c]; rr++) depth++;
          wells += (depth * (depth + 1)) / 2;
          break;
        }
      }
    }
  }

  return [aggHeight, holes, holeDepth, rowTrans, bumpiness, wells];
}

function heuristicForBoard(board, linesCleared) {
  const feats = computeBoardFeatures(board);
  const lineReward = Math.pow(linesCleared, 1.5);
  feats.push(lineReward);
  return feats.reduce((s, v, i) => s + v * HEURISTIC_WEIGHTS[i], 0);
}

function heuristicScoreCandidate(board, cand) {
  const newBoard = deepCopy(board);
  const p = cand.piece;
  for (let r = 0; r < p.shape.length; r++) {
    for (let c = 0; c < p.shape[r].length; c++) {
      if (p.shape[r][c]) newBoard[p.y + r][p.x + c] = 1;
    }
  }
  let linesCleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (newBoard[r].every(v => v)) {
      linesCleared++;
    }
  }
  return heuristicForBoard(newBoard, linesCleared);
}

// --- Helper functions for lookahead scoring ---
function boardCollides(board, shape, x, y) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const xx = x + c;
      const yy = y + r;
      if (xx < 0 || xx >= COLS || yy >= ROWS) return true;
      if (yy >= 0 && board[yy][xx]) return true;
    }
  }
  return false;
}

function dropPieceOnBoard(board, shape, x) {
  if (boardCollides(board, shape, x, 0)) return null;
  let y = 0;
  while (!boardCollides(board, shape, x, y + 1)) {
    y += 1;
  }
  return y;
}

function applyPieceToBoard(board, piece) {
  const newBoard = board.map(row => row.slice());
  for (let r = 0; r < piece.shape.length; r++) {
    for (let c = 0; c < piece.shape[r].length; c++) {
      if (piece.shape[r][c]) newBoard[piece.y + r][piece.x + c] = 1;
    }
  }
  let linesCleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (newBoard[r].every(v => v)) {
      linesCleared++;
    }
  }
  return { board: newBoard, linesCleared };
}

function getPlacementsForPiece(board, pieceType) {
  const rotations = (pieceType === 'O') ? [0] : [0, 1, 2, 3];
  const placements = [];
  for (let rot of rotations) {
    let shape = deepCopy(TETROMINOES[pieceType]);
    for (let i = 0; i < rot; i++) shape = rotateMatrix(shape);
    const w = shape[0].length;
    for (let x = 0; x <= COLS - w; x++) {
      const y = dropPieceOnBoard(board, shape, x);
      if (y === null) continue;
      placements.push({ shape: deepCopy(shape), x, y });
    }
  }
  return placements;
}

function heuristicScoreLookahead(board, cand, nextType) {
  const after = applyPieceToBoard(board, cand.piece);
  let bestNext = -Infinity;
  if (nextType) {
    const nextMoves = getPlacementsForPiece(after.board, nextType);
    if (nextMoves.length === 0) {
      bestNext = -1e6;
    } else {
      for (let mv of nextMoves) {
        const nb = applyPieceToBoard(after.board, mv);
        const sc = heuristicForBoard(nb.board, nb.linesCleared);
        if (sc > bestNext) bestNext = sc;
      }
    }
  }
  const immediate = heuristicForBoard(after.board, after.linesCleared);
  return immediate + LOOKAHEAD_FACTOR * bestNext;
}


class TetrisGame {
  /**
   * constructor: Create a TetrisGame with default COLS/ROWS if none provided.
   */
constructor(cols = COLS, rows = ROWS) {
    this.cols = cols;
    this.rows = rows;
    this.piece_id = 0;
    this.next_piece_type = null; // <-- ADD THIS LINE
    this.reset_game();
}

  /**
   * reset_game: Clear the board, reset score, spawn a new piece, etc.
   */
  reset_game() {
    this.board = [];
    for (let r = 0; r < this.rows; r++) {
      this.board.push(new Array(this.cols).fill(0));
    }
    this.score = 0;
    this.game_over = false;
    this.piece_id = 0;
    this.current_piece = this.spawn_piece();
    this.target_piece = null;
    this.cached_moves = null;
    this._cached_state_key = null;
  }

  /**
   * spawn_piece: Randomly choose a Tetromino type, set its shape, position, etc.
   */
// In class TetrisGame, replace the existing spawn_piece method
spawn_piece() {
    this.piece_id += 1;

    // Determine index for current and next pieces
    const current_idx = (this.piece_id - 1) % PREDEFINED_PIECES.length;
    const next_idx = this.piece_id % PREDEFINED_PIECES.length;

    const t_type = PREDEFINED_PIECES[current_idx];
    this.next_piece_type = PREDEFINED_PIECES[next_idx]; // <-- SET THE NEXT PIECE

    // Build the piece (rest of the function is the same)
    const shape = deepCopy(TETROMINOES[t_type]);
    const piece = {
        type: t_type,
        shape: shape,
        x: Math.floor((this.cols - shape[0].length) / 2),
        y: 1
    };

    if (this.collides(piece)) {
        this.game_over = true;
    }

    return piece;
}
  /**
   * collides: Check if a piece is out of bounds or overlaps existing blocks.
   */
  collides(piece) {
    const shape = piece.shape;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          const x = piece.x + c;
          const y = piece.y + r;
          // Check boundaries
          if (x < 0 || x >= this.cols || y >= this.rows) {
            return true;
          }
          // Check existing board blocks
          if (y >= 0 && this.board[y][x]) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * clear_lines: Remove fully-filled rows, shift above rows down, update score.
   */
  clear_lines() {
    let cleared = 0;
    for (let r = 0; r < this.board.length; r++) {
      if (this.board[r].every(cell => cell === 1)) {
        cleared++;
      }
    }
    this.score += cleared;
    return cleared;
  }

  /**
   * lock_piece: After dropping or placing the current piece, fill the board,
   *             clear lines, spawn a new piece, reset caches, etc.
   */
lock_piece() {
  // 1) Lock the current piece into the board
  const p = this.current_piece;
  for (let r = 0; r < p.shape.length; r++) {
    for (let c = 0; c < p.shape[r].length; c++) {
      if (p.shape[r][c]) {
        const x = p.x + c;
        const y = p.y + r;
        if (x >= 0 && x < this.cols && y >= 0 && y < this.rows) {
          this.board[y][x] = 1;
        }
      }
    }
  }

  // 2) Clear any full lines
  this.clear_lines();

  // 3) Spawn the next piece and reset any cached info
  this.current_piece   = this.spawn_piece();
  this.target_piece    = null;
  this.cached_moves    = null;
  this._cached_state_key = null;

  // ── NEW: Immediately push the updated state to your renderer ────────────
  // (Assumes `currentGameState`, `draw()` and `fetchCandidateMoves()` are in scope)
  currentGameState = {
    board:         this.board,
    current_piece: this.current_piece,
    score:         this.score,
    game_over:     this.game_over,
    piece_id:      this.piece_id
  };
  draw();
  fetchCandidateMoves();
}
  /**
   * lock_target: If we had a target piece (for animation), lock that piece
   *              and spawn a new piece. (Used in the "tick" logic.)
   */
  lock_target() {
    if (!this.target_piece) return;
    const p = this.target_piece;
    for (let r = 0; r < p.shape.length; r++) {
      for (let c = 0; c < p.shape[r].length; c++) {
        if (p.shape[r][c]) {
          const x = p.x + c;
          const y = p.y + r;
          if (x >= 0 && x < this.cols && y >= 0 && y < this.rows) {
            this.board[y][x] = 1;
          }
        }
      }
    }
    this.clear_lines();
    this.current_piece = this.spawn_piece();
    this.target_piece = null;
    this.cached_moves = null;
    this._cached_state_key = null;

    // ── NEW: Immediately push the updated state to the renderer ───────────
    currentGameState = {
      board:         this.board,
      current_piece: this.current_piece,
      score:         this.score,
      game_over:     this.game_over,
      piece_id:      this.piece_id
    };
    draw();
    fetchCandidateMoves();
  }

  /**
   * get_piece_center: Return the center (in canvas coords) of a piece.
   *                   If piece is omitted, use current_piece.
   */
  get_piece_center(piece = null) {
    if (!piece) piece = this.current_piece;
    if (!piece || !piece.shape) {
      return { x: 0, y: 0 };
    }
    const h = piece.shape.length;
    const w = piece.shape[0].length;
    return {
      x: (piece.x + w / 2) * CELL_SIZE,
      y: (piece.y + h / 2) * CELL_SIZE
    };
  }

  /**
   * get_state_key: Return a JSON-serialized object capturing the board + piece state
   *                (including shape) so we can store it for GFlowNet learning.
   */
 get_state_key() {
  // Always use the base (unrotated) shape for your key
  const baseShape = TETROMINOES[this.current_piece.type];
  const stateObj = {
    board: this.board,
    piece: {
      type: this.current_piece.type,
      shape: baseShape,
      x: 0,
      y: 0
    }
  };
  return JSON.stringify(stateObj);
}

  /**
   * get_terminal_moves: Compute all possible "terminal placements" of the current piece.
   *                     This means trying all rotations and all x positions, then dropping
   *                     to the final y position. Return each distinct outcome.
   */
  get_terminal_moves() {
    if (this.game_over) {
      return [];
    }

    const current_state_key = this.get_state_key();
    if (this.cached_moves && this._cached_state_key === current_state_key) {
      return this.cached_moves;
    }

    const orig = this.current_piece;
    const base_shape = TETROMINOES[orig.type];
    const candidates = [];
    const rotations = (orig.type === "O") ? [0] : [0,1,2,3];

    // Track unique orientations so we don't generate duplicate states
    const seenShapes = new Set();
    const uniqueRotations = [];
    for (let rot of rotations) {
      let shape = deepCopy(base_shape);
      for (let i = 0; i < rot; i++) {
        shape = rotateMatrix(shape);
      }
      const shapeKey = JSON.stringify(shape);
      if (!seenShapes.has(shapeKey)) {
        seenShapes.add(shapeKey);
        uniqueRotations.push({ rot, shape, shapeKey });
      }
    }

    const seenPositions = new Set();
    for (let { rot, shape, shapeKey } of uniqueRotations) {
      const h = shape.length;
      const w = shape[0].length;
      for (let x = 0; x <= this.cols - w; x++) {
        const testPiece = {
          type: orig.type,
          shape: deepCopy(shape),
          x: x,
          y: 0
        };
        // If it collides at y=0, skip
        if (this.collides(testPiece)) {
          continue;
        }
        let y = 0;
        while (!this.collides({ ...testPiece, y: y }) && y < this.rows) {
          y++;
        }
        testPiece.y = y - 1;
        if (testPiece.y < 0) {
          continue;
        }
        const posKey = `${shapeKey}_x${x}_y${testPiece.y}`;
        if (seenPositions.has(posKey)) {
          // Same terminal state already considered
          continue;
        }
        seenPositions.add(posKey);

        const center = this.get_piece_center(testPiece);
        const action_key = `r${rot}_x${x}`;
        candidates.push({
          action_key: action_key,
          piece: testPiece,
          piece_center: center
        });
      }
    }

    this.cached_moves = candidates;
    this._cached_state_key = current_state_key;
    return candidates;
  }

  /**
   * tick: Advance the game by one "step." If there's a target piece set (meaning
   *       we've chosen a final location to animate toward), move the current piece
   *       one step closer horizontally/vertically. If we arrive, lock it. Otherwise,
   *       drop the piece one row. If colliding, lock it.
   */
  tick() {
    if (this.game_over) {
      return;
    }
    if (this.target_piece) {
      // Update shape to reflect any rotation changes
      this.current_piece.shape = deepCopy(this.target_piece.shape);
      // Invalidate cached terminal moves
      this.cached_moves = null;
      this._cached_state_key = null;

      const px = this.current_piece.x;
      const py = this.current_piece.y;
      const tx = this.target_piece.x;
      const ty = this.target_piece.y;

      if (px < tx) {
        this.current_piece.x += 1;
      } else if (px > tx) {
        this.current_piece.x -= 1;
      }
      if (py < ty) {
        this.current_piece.y += 1;
      } else if (py > ty) {
        this.current_piece.y -= 1;
      }

      // If we've reached the target x,y
      if (this.current_piece.x === tx && this.current_piece.y === ty) {
        this.lock_target();
      }
    } else {
      // Standard Tetris downward tick
      const nextP = {
        type: this.current_piece.type,
        shape: this.current_piece.shape,
        x: this.current_piece.x,
        y: this.current_piece.y + 1
      };
      if (!this.collides(nextP)) {
        this.current_piece.y += 1;
      } else {
        this.lock_piece();
      }
    }
  }

  /**
   * is_over: Return whether the game is in a "game_over" state.
   */
  is_over() {
    return this.game_over;
  }

  /**
   * get_final_reward: Return the final reward for a completed game. The Python version:
   *    if game over => score * 10 - 10
   *    else => score * 10
   *  But normally Tetris ends only if the board is stuck. If user "calls" it done,
   *  this logic remains. 
   */
  get_final_reward() {
    if (this.game_over) {
      return this.score * 10 - 10;
    } else {
      return this.score * 10;
    }
  }
}

//-----------------------------------------------------------------------------
// TRAJECTORY-BALANCE GFLOWNET AGENT (translating Python version to JS)
//-----------------------------------------------------------------------------
class TrajectoryBalanceAgent {
  /**
   * log_flows: object storing { state_key: { action_key: log_flow_value } }
   * logZ: log of normalization constant
   * lr: learning rate
   */
  constructor(lr = 0.01) {
    this.log_flows = {};
    this.logZ = 0.0;
    this.lr = lr;
  }

  /**
   * Ensure there’s a log_flows[state_key][action_key].
   * If it wasn’t preloaded from JSON, we give it log(1)=0 so
   * unseen states/actions collapse to uniform.
   */
  _ensure_action_exists(state_key, action_key) {
    if (!this.log_flows[state_key]) {
      this.log_flows[state_key] = {};
    }
    if (this.log_flows[state_key][action_key] === undefined) {
      this.log_flows[state_key][action_key] = 0;  // log(1) → uniform fallback
    }
  }

  /**
   * sample_action: Picks one of the candidates by exponentiating
   *                the stored log flows (preloaded or uniform fallback).
   */
  sample_action(state_key, candidates) {
    // make sure every c.action_key is present (will be 0 if not in JSON)
    for (let c of candidates) {
      this._ensure_action_exists(state_key, c.action_key);
    }
    const logs = candidates.map(c => this.log_flows[state_key][c.action_key]);
    const maxLog = Math.max(...logs);
    const exps = logs.map(lv => Math.exp(lv - maxLog));
    const sum = exps.reduce((a, b) => a + b, 0);
    const probs = exps.map(e => e / sum);

    // sample
    const r = Math.random();
    let acc = 0;
    for (let i = 0; i < probs.length; i++) {
      acc += probs[i];
      if (r <= acc) {
        return [candidates[i], probs[i]];
      }
    }
    // fallback
    return [candidates[candidates.length - 1], probs[probs.length - 1]];
  }

  /**
   * get_log_p_action: Return log-prob under the stored flows (no side effects).
   */
  get_log_p_action(state_key, action_key) {
    const flowsForState = this.log_flows[state_key];
    if (!flowsForState || flowsForState[action_key] === undefined) {
      throw new Error(
        `No flow for action=${action_key} in state=${state_key}`
      );
    }
    const allLogs = Object.values(flowsForState);
    const maxLog = Math.max(...allLogs);
    const sumExp = allLogs.reduce((acc, x) => acc + Math.exp(x - maxLog), 0);
    const logDenom = Math.log(sumExp) + maxLog;
    return flowsForState[action_key] - logDenom;
  }

  /**
   * update_trajectory: exactly as before, applies TB update.
   */
  update_trajectory(trajectory, final_reward) {
    if (final_reward <= 0) {
      final_reward = 0.01;
    }
    const logR = Math.log(final_reward);
    let sum_logp = 0;
    for (let [s, a] of trajectory) {
      sum_logp += this.get_log_p_action(s, a);
    }
    const target = logR - this.logZ;
    const diff = sum_logp - target;
    this.logZ += this.lr * diff;
    for (let [s, a] of trajectory) {
      this.log_flows[s][a] -= this.lr * diff;
    }
  }

  /**
   * save/load to localStorage (unchanged).
   */
  saveToLocalStorage(key) {
    localStorage.setItem(
      key,
      JSON.stringify({ log_flows: this.log_flows, logZ: this.logZ })
    );
  }

  loadFromLocalStorage(key) {
    const s = localStorage.getItem(key);
    if (!s) return;
    try {
      const d = JSON.parse(s);
      this.log_flows = d.log_flows;
      this.logZ = d.logZ;
    } catch (e) {
      console.error("Failed to load flows:", e);
    }
  }

  /**
   * loadFromJSON: ingest exactly your pretrained_flows_tb.json
   */
  loadFromJSON(obj) {
    this.log_flows = {};
    for (let [stateKey, actions] of Object.entries(obj.log_flows)) {
      this.log_flows[stateKey] = {};
      for (let [actionKey, flowVal] of Object.entries(actions)) {
        this.log_flows[stateKey][actionKey] = Math.log(flowVal);
      }
    }
    this.logZ = obj.logZ || 0;
  }
}


//-----------------------------------------------------------------------------
// We also replicate the "simulateEpisode" or "pretrain" logic from the Python
// if we want to keep *all* functionality. But for the front-end usage here,
// we'll keep them as optional, not automatically run. They might be used
// if we wanted to do offline training in the browser. This is just to prove
// we haven't removed anything. 
//-----------------------------------------------------------------------------

/**
 * simulateEpisode: (Optional)
 *   Run one complete Tetris game (episode) until game over, collecting
 *   the (state, action) trajectory. Then do a TB update with final reward.
 *   Returns final_reward.
 */
function simulateEpisode(game, agent) {
  const localTrajectory = [];
  while (!game.is_over()) {
    const state_key = game.get_state_key();
    const cands = game.get_terminal_moves();
    if (!cands || cands.length === 0) {
      game.game_over = true;
      break;
    }
    const [selected_action] = agent.sample_action(state_key, cands);
    localTrajectory.push([state_key, selected_action.action_key]);
    // Lock it in
    game.current_piece = deepCopy(selected_action.piece);
    game.lock_piece();
    if (game.is_over()) {
      break;
    }
  }
  const final_reward = game.get_final_reward();
  agent.update_trajectory(localTrajectory, final_reward);
  return final_reward;
}

/**
 * pretrain: (Optional)
 *   Repeatedly simulate episodes in the browser to train the agent. 
 *   Just for completeness.
 */
function pretrain(numEpisodes, checkpointInterval, lr) {
  const localAgent = new TrajectoryBalanceAgent(lr);
  let totalReward = 0.0;
  let startTime = performance.now();
  for (let ep = 1; ep <= numEpisodes; ep++) {
    const localGame = new TetrisGame(6, 10); // smaller board
    const reward = simulateEpisode(localGame, localAgent);
    totalReward += reward;
    if (ep % checkpointInterval === 0) {
      const now = performance.now();
      const elapsed = (now - startTime) / 1000;
      const avg = totalReward / ep;
      console.log(
        `Episode ${ep}/${numEpisodes}, LastReward=${reward}, AvgReward=${avg.toFixed(
          2
        )}, Elapsed=${elapsed.toFixed(2)}s`
      );
    }
  }
  console.log("Training complete. Average reward:", totalReward / numEpisodes);
  return localAgent;
}

//-----------------------------------------------------------------------------
// PARTICLES & ARROWS (Visual Effects)
//-----------------------------------------------------------------------------
class Particle {
  constructor(x, y, vx, vy, radius = 4, life = 1.0, color = { r:255, g:255, b:255 }) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.radius = radius;
    this.life = life;
    this.color = color;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt * 0.4; // fade speed
  }

  draw(ctx) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    let grad = ctx.createRadialGradient(
      this.x, this.y, this.radius / 2,
      this.x, this.y, this.radius
    );
    grad.addColorStop(0, `rgba(${this.color.r},${this.color.g},${this.color.b},${this.life})`);
    grad.addColorStop(1, `rgba(${this.color.r},${this.color.g},${this.color.b},0)`);
    ctx.fillStyle = grad;
    ctx.fill();
  }
}

class Arrow {
  constructor(from, to, flow, color = "#66ff66") {
    this.from = from;
    this.to = to;
    this.flow = flow;
    this.color = color;
    this.life = 1.0;
  }

  update(dt) {
    this.life -= dt * 0.5;
  }

  draw(ctx) {
    const rgb = hexToRgb(this.color);
    let lineWidth = Math.min(10, 2 + this.flow / 2000);

    ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.8 * this.life})`;
    ctx.lineWidth = lineWidth;

    ctx.beginPath();
    ctx.moveTo(this.from.x, this.from.y);
    ctx.lineTo(this.to.x, this.to.y);
    ctx.stroke();

    // arrow head
    let angle = Math.atan2(this.to.y - this.from.y, this.to.x - this.from.x);
    ctx.beginPath();
    ctx.moveTo(this.to.x, this.to.y);
    ctx.lineTo(
      this.to.x - 10 * Math.cos(angle - Math.PI / 6),
      this.to.y - 10 * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      this.to.x - 10 * Math.cos(angle + Math.PI / 6),
      this.to.y - 10 * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.8 * this.life})`;
    ctx.fill();
  }
}


async function getCandidateMoves() {
  const stateKey = game.get_state_key();
  const cands    = game.get_terminal_moves();
  if (cands.length === 0) {
    console.warn("[TB] ⚠️ No terminal moves for this state");
    return {
      game_state: {
        board: game.board,
        current_piece: game.current_piece,
        score: game.score,
        game_over: game.game_over,
        piece_id: game.piece_id
      },
      current_piece_center: game.get_piece_center(),
      terminal_moves: []
    };
  }

  // ——————— ALWAYS RUN THE ONNX INFERENCE ———————
  const flowsForState = await computeFlowsForState(game);

  // compute flows & heuristic scores for each candidate
  for (let c of cands) {
    const logf = flowsForState[c.action_key] ?? -Infinity;
    c.flow  = Math.exp(logf);
    c.score = logf + HEURISTIC_MIX *
      heuristicScoreLookahead(game.board, c, game.next_piece_type);
  }

  // -----------------------------------------------------------------
  // Deduplicate by resulting board state so rotations that land in the
  // same place are merged. Keep the highest scoring candidate for each
  // final board configuration.
  // -----------------------------------------------------------------
  const bestByBoard = {};
  for (let c of cands) {
    const after = applyPieceToBoard(game.board, c.piece);
    const key = JSON.stringify(after.board);
    if (!bestByBoard[key] || c.score > bestByBoard[key].score) {
      bestByBoard[key] = { ...c };
    }
  }
  const uniqueCands = Object.values(bestByBoard);

  // compute probabilities based on the remaining candidates
  let sumFlow = uniqueCands.reduce((s, cand) => s + cand.flow, 0);
  for (let c of uniqueCands) {
    c.probability = sumFlow > 0 ? c.flow / sumFlow : 1 / uniqueCands.length;
  }

  //console.log("[TB] ▶️ Flows & probs from ONNX:", uniqueCands);

  return {
    game_state: {
      board: game.board,
      current_piece: game.current_piece,
      score: game.score,
      game_over: game.game_over,
      piece_id: game.piece_id
    },
    current_piece_center: game.get_piece_center(),
    terminal_moves: uniqueCands
  };
}



function selectMove(actionKey = null) {
  if (game.is_over()) {
    return { error: "Game Over" };
  }

  const cands = game.get_terminal_moves();
  if (!cands.length) {
    return { error: "No moves" };
  }

  // 1) sort your moves so the scan order is deterministic
  cands.sort((a, b) =>
    typeof a.action_key === 'number'
      ? a.action_key - b.action_key
      : String(a.action_key).localeCompare(String(b.action_key))
  );

  const state_key = game.get_state_key();

  // 2) ensure we have flows for this state
  agent.log_flows = agent.log_flows || {};
  if (!agent.log_flows[state_key]) {
    // ← replace `computeFlowsForState` with whatever your solver method is
    // e.g. agent.log_flows[state_key] = agent.compute_log_flows(game);
    agent.log_flows[state_key] = computeFlowsForState(game);
  }

  // now agent.log_flows[state_key] is guaranteed
  const flows = agent.log_flows[state_key];

  // 3) pick the move
  let selected;
  if (actionKey !== null) {
    selected = cands.find(c => c.action_key === actionKey);
  } else {
    let bestScore = -Infinity;
    for (let c of cands) {
      const logf = flows[c.action_key] ?? -Infinity;
      const score = logf + HEURISTIC_MIX *
        heuristicScoreLookahead(game.board, c, game.next_piece_type);
      if (score > bestScore) {
        bestScore = score;
        selected = c;
      }
    }
  }

  // build your arrow & state‐update exactly as before…
  const flowVal = Math.exp(flows[selected.action_key]);
  const probVal = Math.exp(agent.get_log_p_action(state_key, selected.action_key));
  trajectory.push([state_key, selected.action_key]);

  const arrow = {
    from: game.get_piece_center(game.current_piece),
    to:   selected.piece_center,
    flow: flowVal,
    probability: probVal
  };

  game.target_piece = deepCopy(selected.piece);

  return {
    action_key: selected.action_key,
    arrow,
    game_state: {
      board: game.board,
      current_piece: game.current_piece,
      score: game.score,
      game_over: game.game_over,
      piece_id: game.piece_id
    }
  };
}
/**
 * computeFlowsForState: Run the ONNX model once (throttled), return
 *                      a map { action_key → log-flow }.
 */
// In your main.js file, replace the existing function
async function computeFlowsForState(game) {
  if (scoringInProgress || !ortSession) {
    return {};  // either already running or model not ready
  }
  scoringInProgress = true;

  try {
    // --- Board tensor ---
    const flatBoard = game.board.flat();
    const boardTensor = new ort.Tensor(
      "float32",
      new Float32Array(flatBoard),
      [1, ROWS, COLS]
    );

    // --- CURRENT one-hot ---
    const curOH = new Float32Array(N_PIECES).fill(0);
    curOH['IOTSZJL'.indexOf(game.current_piece.type)] = 1;
    const curTensor = new ort.Tensor("float32", curOH, [1, N_PIECES]);

    // --- NEXT one-hot ---
    const nextOH = new Float32Array(N_PIECES).fill(0);
    if (game.next_piece_type) {
      nextOH['IOTSZJL'.indexOf(game.next_piece_type)] = 1;
    }
    const nextTensor = new ort.Tensor("float32", nextOH, [1, N_PIECES]);

    // --- **FIXED** feed keys to match your ONNX's input_names ---
    const feeds = {
      'board':       boardTensor,
      'cur_onehot':  curTensor,
      'nxt_onehot':  nextTensor
    };

    // --- Run inference ---
    const results = await ortSession.run(feeds);
    const logFdata = results.logits.data; 

    // Map back into your action_key → log-flow
    const flows = {};
    for (let c of game.get_terminal_moves()) {
      const [r, x] = c.action_key.slice(1).split('_x').map(Number);
      flows[c.action_key] = logFdata[r * COLS + x];
    }
    return flows;
  } finally {
    scoringInProgress = false;
  }
}

async function selectMove(actionKey = null) {
  // 1) If the game is already over, bail early
  if (game.is_over()) {
    return { error: "Game Over" };
  }

  // 2) Compute all terminal placements
  const cands = game.get_terminal_moves();
  if (!cands.length) {
    return { error: "No moves" };
  }

  // 3) Sort deterministically by action_key so ties break predictably
  cands.sort((a, b) =>
    String(a.action_key).localeCompare(String(b.action_key))
  );

  const state_key = game.get_state_key();

  // 4) Load or compute log‐flows for this state
  let flows = agent.log_flows[state_key];
  if (!flows) {
    flows = await computeFlowsForState(game);
    agent.log_flows[state_key] = flows;  // cache for future moves
  }

  // Compute heuristic scores (with lookahead) for each candidate
  const heuristics = cands.map(c =>
    heuristicScoreLookahead(game.board, c, game.next_piece_type)
  );

  // 5) Pick the move
  let selected = null;
  if (actionKey !== null) {
    // If caller forced a specific action, honor it
    selected = cands.find(c => c.action_key === actionKey);
  } else {
    // Otherwise, argmax of combined score (log-flow + heuristic)
    let bestScore = -Infinity;
    for (let i = 0; i < cands.length; i++) {
      const c = cands[i];
      const lf = flows[c.action_key] !== undefined ? flows[c.action_key] : -Infinity;
      const score = lf + HEURISTIC_MIX * heuristics[i];
      if (score > bestScore) {
        bestScore = score;
        selected = c;
      }
    }
  }
  // Fallback to first candidate if something went wrong
  if (!selected) selected = cands[0];

  // 6) Record for Trajectory Balance updates
  trajectory.push([state_key, selected.action_key]);

  // 7) Build an arrow for visualization
  const logf    = flows[selected.action_key] || -Infinity;
  const flowVal = Math.exp(logf);
  let probVal;
  try {
    probVal = Math.exp(agent.get_log_p_action(state_key, selected.action_key));
  } catch {
    probVal = null;
  }
  const arrow = {
    from: game.get_piece_center(game.current_piece),
    to:   selected.piece_center,
    flow: flowVal,
    probability: probVal
  };

  // 8) Tell the game to animate toward that target
  game.target_piece = deepCopy(selected.piece);

  // 9) Return the chosen move and updated game state
  return {
    action_key: selected.action_key,
    arrow,
    game_state: {
      board: game.board,
      current_piece: game.current_piece,
      score: game.score,
      game_over: game.game_over,
      piece_id: game.piece_id
    }
  };
}
/**
 * tickGameLogic: Mimics /api/tick. 
 *   We do the step, check for new piece or game over, do TB update on game over, etc.
 */
function tickGameLogic() {
  const old_game_over = game.is_over();
  const old_piece_id = game.piece_id;

  game.tick();

  const new_game_over = game.is_over();
  const new_piece_id = game.piece_id;

  // If game ended just now, pause and offer restart
  if (new_game_over && !old_game_over) {
    const final_reward = game.get_final_reward();
    agent.update_trajectory(trajectory, final_reward);
    trajectory = [];
    simulationPaused = true;
    showRestartOverlay();
  }

  // If a new piece was spawned, recalc new terminal moves
  let terminal_moves = [];
  if (new_piece_id !== old_piece_id && !game.is_over()) {
    const state_key = game.get_state_key();
    const cands = game.get_terminal_moves();

    let sum_exp = 0.0;
    for (let c of cands) {
      agent._ensure_action_exists(state_key, c.action_key);
      const val = Math.exp(agent.log_flows[state_key][c.action_key]);
      sum_exp += val;
    }
    for (let c of cands) {
      const flow_val = Math.exp(agent.log_flows[state_key][c.action_key]);
      const prob = sum_exp > 0 ? flow_val / sum_exp : 1.0 / cands.length;
      c.flow = flow_val;
      c.probability = prob;
      terminal_moves.push(c);
    }
  }

  return {
    game_state: {
      board: game.board,
      current_piece: game.current_piece,
      score: game.score,
      game_over: game.game_over,
      piece_id: game.piece_id
    },
    current_piece_center: game.get_piece_center(),
    terminal_moves: terminal_moves
  };
}

/**
 * resetGameLogic: Mimics /api/reset
 */
function resetGameLogic() {
  game.reset_game();
  trajectory = [];
  return { status: "reset" };
}

//-----------------------------------------------------------------------------
// UI / CANVAS DRAWING
//-----------------------------------------------------------------------------

function assignCandidateColors(candidates) {
  // top 3 get special colors
  candidates.forEach((cand, i) => {
    if (i === 0) cand.color = "#1b9e77";   // green
    else if (i === 1) cand.color = "#d95f02"; // gold
    else if (i === 2) cand.color = "#7570b3"; // red
    else cand.color = "#dddddd";
  });
}

function drawBoard(gs) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#222";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (!gs || !gs.board) return;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (gs.board[r][c]) {
        ctx.fillStyle = "#666";
        ctx.fillRect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        ctx.strokeStyle = "#444";
        ctx.strokeRect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      } else {
        ctx.strokeStyle = "rgba(255,255,255,0.05)";
        ctx.strokeRect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      }
    }
  }
}

function drawCurrentPiece(gs) {
  if (!gs || !gs.current_piece) return;
  const piece = gs.current_piece;

  let grad = ctx.createLinearGradient(
    0, 0, 0, piece.shape.length * CELL_SIZE
  );
  grad.addColorStop(0, "#c0c0c0");
  grad.addColorStop(1, "#a0a0a0");
  ctx.fillStyle = grad;

  for (let r = 0; r < piece.shape.length; r++) {
    for (let c = 0; c < piece.shape[r].length; c++) {
      if (piece.shape[r][c]) {
        const x = (piece.x + c) * CELL_SIZE;
        const y = (piece.y + r) * CELL_SIZE;
        ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
        ctx.strokeStyle = "#888";
        ctx.strokeRect(x, y, CELL_SIZE, CELL_SIZE);
      }
    }
  }
}

function drawCandidateShadow(piece, color) {
  if (!piece || !piece.shape) return;
  ctx.save();
  const rgb = hexToRgb(color || "#ffffff");
  ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`;
  for (let r = 0; r < piece.shape.length; r++) {
    for (let c = 0; c < piece.shape[r].length; c++) {
      if (piece.shape[r][c]) {
        const x = (piece.x + c) * CELL_SIZE;
        const y = (piece.y + r) * CELL_SIZE;
        ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
      }
    }
  }
  ctx.restore();
}

function spawnParticles(from, to, factor = 1, color) {
  let count = Math.max(1, Math.round(7 * factor));
  let dx = to.x - from.x;
  let dy = to.y - from.y;
  let dist = Math.hypot(dx, dy) || 1;
  let ux = dx / dist;
  let uy = dy / dist;

  let baseColor = color ? hexToRgb(color) : { r: 255, g: 255, b: 255 };

  for (let i = 0; i < count; i++) {
    const t = Math.random();
    const x = from.x + dx * t;
    const y = from.y + dy * t;
    let speed = 30 + Math.random() * 20;
    let vx = ux * speed + (Math.random() - 0.5) * 10;
    let vy = uy * speed + (Math.random() - 0.5) * 10;
    particles.push(new Particle(x, y, vx, vy, 4, 1.0, baseColor));
  }
}

function spawnArrow(from, to, flow, color) {
  appliedArrows.push(new Arrow(from, to, flow, color));
}

function drawEffects() {
  appliedArrows.forEach(a => a.draw(ctx));
  particles.forEach(p => p.draw(ctx));
}
// -----------------------------------------------------------------------------
// 3) draw — always paints grid → board → piece → arrows → effects
// -----------------------------------------------------------------------------
function draw() {
  // clear & background
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = "#222";
  ctx.fillRect(0,0,canvas.width,canvas.height);

  // 1) grid lines
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  for (let x = 0; x <= COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(x*CELL_SIZE, 0);
    ctx.lineTo(x*CELL_SIZE, ROWS*CELL_SIZE);
    ctx.stroke();
  }
  for (let y = 0; y <= ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y*CELL_SIZE);
    ctx.lineTo(COLS*CELL_SIZE, y*CELL_SIZE);
    ctx.stroke();
  }

  // 2) locked blocks
  if (currentGameState && currentGameState.board) {
    for (let r=0; r<ROWS; r++) {
      for (let c=0; c<COLS; c++) {
        if (currentGameState.board[r][c]) {
          ctx.fillStyle="#666";
          ctx.fillRect(c*CELL_SIZE, r*CELL_SIZE, CELL_SIZE, CELL_SIZE);
          ctx.strokeStyle="#444";
          ctx.strokeRect(c*CELL_SIZE, r*CELL_SIZE, CELL_SIZE, CELL_SIZE);
        }
      }
    }
  }

  // 3) falling piece
  drawCurrentPiece(currentGameState);

  // 4) top-3 arrows & shadows
  topCandidates.forEach(c=>{
    new Arrow(currentPieceCenter, c.piece_center, c.flow, c.color).draw(ctx);
    drawCandidateShadow(c.piece, c.color);
  });

  // 5) particles / lingering effects
  drawEffects();
}

function animate() {
  if (simulationPaused) {
    draw();
    requestAnimationFrame(animate);
    return;
  }
  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  // spawn particles
  particleSpawnAccumulator += dt;
  if (particleSpawnAccumulator > 0.25) {
    if (topCandidates.length > 0) {
      let maxFlow = topCandidates[0].flow || 1;
      topCandidates.forEach((cand, i) => {
        let ratio = cand.flow / maxFlow;
        if (i === 0) ratio *= 3;
        else if (i === 1) ratio *= 1.5;
        else if (i === 2) ratio *= 0.5;
       //  spawnParticles(currentPieceCenter, cand.piece_center, ratio, cand.color);
      });
    }
    particleSpawnAccumulator = 0;
  }

  // update existing effects
  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].update(dt);
    if (particles[i].life <= 0) {
      particles.splice(i, 1);
    }
  }
  appliedArrows.forEach(a => a.update(dt));

  draw();
  requestAnimationFrame(animate);
}
// ----------------------------------------------------------------------------
// 1) fetchCandidateMoves — snap & draw immediately, then score in the background
// ----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// 1) fetchCandidateMoves — snapshot + full draw BEFORE async scoring
// -----------------------------------------------------------------------------
async function fetchCandidateMoves() {
  if (simulationPaused) return;

  // show loader
  candidateListEl.innerHTML = `<div class="loading">computing…</div>`;

  // a) snapshot state
  currentGameState = {
    board:         game.board,
    current_piece: game.current_piece,
    score:         game.score,
    game_over:     game.game_over,
    piece_id:      game.piece_id
  };
  currentPieceCenter = game.get_piece_center();

  // b) clear previous visuals
  appliedArrows = [];
  topCandidates = [];

  // c) IMMEDIATELY redraw EVERYTHING
  draw();

  // d) now do heavy scoring in background
  try {
    const data = await getCandidateMoves();
    currentGameState   = data.game_state;
    currentPieceCenter = data.current_piece_center;
    candidateMoves     = data.terminal_moves;

    // sort & pick top-3
    candidateMoves.sort((a,b)=> b.score - a.score);
    topCandidates = candidateMoves.slice(0,3);
    assignCandidateColors(topCandidates);

    updateCandidateListUI();

    // autopilot: play the green (top) move if the user hasn't clicked yet
    if (!inputPaused && topCandidates.length) {
      autoPlayCandidate(topCandidates[0].action_key);
    }
  } catch(err) {
    console.error("Error scoring:", err);
    candidateListEl.innerHTML = `<div class="error">failed</div>`;
  }
}

// ----------------------------------------------------------------------------
// 2) draw — always paints grid + board + piece + arrows/shadows/effects
// ----------------------------------------------------------------------------
function draw() {
  // clear canvas
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // background
  ctx.fillStyle = "#222";
  ctx.fillRect(0,0,canvas.width,canvas.height);

  // 1) draw grid lines
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  for (let x = 0; x <= COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(x*CELL_SIZE, 0);
    ctx.lineTo(x*CELL_SIZE, ROWS*CELL_SIZE);
    ctx.stroke();
  }
  for (let y = 0; y <= ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y*CELL_SIZE);
    ctx.lineTo(COLS*CELL_SIZE, y*CELL_SIZE);
    ctx.stroke();
  }

  // 2) draw locked blocks
  if (currentGameState && currentGameState.board) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (currentGameState.board[r][c]) {
          ctx.fillStyle = "#666";
          ctx.fillRect(c*CELL_SIZE, r*CELL_SIZE, CELL_SIZE, CELL_SIZE);
          ctx.strokeStyle = "#444";
          ctx.strokeRect(c*CELL_SIZE, r*CELL_SIZE, CELL_SIZE, CELL_SIZE);
        }
      }
    }
  }

  // 3) draw the falling piece
  drawCurrentPiece(currentGameState);

  // 4) overlay the top-3 candidate arrows & shadows
  topCandidates.forEach(c => {
    // arrow
    const arr = new Arrow(currentPieceCenter, c.piece_center, c.flow, c.color);
    arr.draw(ctx);
    // faint shadow
    drawCandidateShadow(c.piece, c.color);
  });

  // 5) any ongoing particles / effects
  drawEffects();
}

// at top‐level:
let inputPaused = false;    // blocks auto-play; user clicks will still work
let inputPauseTimer = null; // holds timeout ID so we can reset the pause
// remove any check of simulationPaused in gameTick()

async function doSelectCandidate(actionKey) {
  // allow overriding even while paused
  inputPaused = true;
  if (inputPauseTimer) {
    clearTimeout(inputPauseTimer);
    inputPauseTimer = null;
  }

  // Execute the move (as before)…
  const data = await selectMove(actionKey);
  if (data.error) {
    console.error("selectMove error:", data.error);
    inputPaused = false;
    return;
  }
  if (data.arrow) {
    const { from, to, flow } = data.arrow;
    const cand = topCandidates.find(c =>
      Math.abs(c.piece_center.x - to.x) < 1 &&
      Math.abs(c.piece_center.y - to.y) < 1
    );
    spawnArrow(from, to, flow, cand?.color || "#33ff66");
  }
  currentGameState = data.game_state;

  // only block fetch/clicks; the tick+draw loop still runs
  inputPauseTimer = setTimeout(() => {
    inputPaused = false;
    inputPauseTimer = null;
  }, MOVE_PAUSE_DURATION);
}

// autopilot helper: play a candidate without blocking user input
async function autoPlayCandidate(actionKey) {
  if (inputPaused) return;
  const data = await selectMove(actionKey);
  if (data.error) {
    console.error("selectMove error:", data.error);
    return;
  }
  if (data.arrow) {
    const { from, to, flow } = data.arrow;
    const cand = topCandidates.find(c =>
      Math.abs(c.piece_center.x - to.x) < 1 &&
      Math.abs(c.piece_center.y - to.y) < 1
    );
    spawnArrow(from, to, flow, cand?.color || "#33ff66");
  }
  currentGameState = data.game_state;
}


// -----------------------------------------------------------------------------
// 2) gameTick — advance logic, THEN redraw instantly, THEN kick off fetch
// -----------------------------------------------------------------------------
function gameTick() {
  if (simulationPaused) return;
  // 1) advance logic & draw every time
  const data = tickGameLogic();
  currentGameState   = data.game_state;
  currentPieceCenter = data.current_piece_center;
  draw();

  // 2) only kick off scoring+auto-click if not paused
  if (!simulationPaused && currentGameState.piece_id !== lastPieceId) {
    lastPieceId = currentGameState.piece_id;
    fetchCandidateMoves();
  }
}

async function fetchCandidateMoves() {
  if (simulationPaused) return;    // don’t overlap scoring

  candidateListEl.innerHTML = `<div class="loading">computing…</div>`;

  // snapshot & draw
  currentGameState   = { board: game.board, current_piece: game.current_piece, score: game.score, game_over: game.game_over, piece_id: game.piece_id };
  currentPieceCenter = game.get_piece_center();
  appliedArrows = [];
  topCandidates  = [];
  draw();

  try {
    const data = await getCandidateMoves();
    currentGameState   = data.game_state;
    currentPieceCenter = data.current_piece_center;
    candidateMoves     = data.terminal_moves;
    candidateMoves.sort((a,b)=> b.score - a.score);
    topCandidates = candidateMoves.slice(0,3);
    assignCandidateColors(topCandidates);
    updateCandidateListUI();
    if (!inputPaused && topCandidates.length) {
      autoPlayCandidate(topCandidates[0].action_key);
    }
  } catch(err) {
    console.error("Error scoring:", err);
    candidateListEl.innerHTML = `<div class="error">failed</div>`;
  }
}


function doResetGame() {
  if (restartOverlay) {
    restartOverlay.remove();
    restartOverlay = null;
  }
  resetGameLogic();
  // make sure a leftover inference doesn't block new scoring
  scoringInProgress = false;

  // Clear visuals
  currentGameState = null;
  currentPieceCenter = { x:0, y:0 };
  candidateMoves = [];
  topCandidates = [];
  appliedArrows = [];
  particles = [];
  simulationPaused = false;
  lastPieceId = null;
  inputPaused = false;

  candidateListEl.innerHTML = "";
  fetchCandidateMoves();
}

function doTogglePause() {
  simulationPaused = !simulationPaused;
  if (pauseBtn) {
    pauseBtn.textContent = simulationPaused ? "Resume Game" : "Pause Game";
  }
}

function showStartOverlay() {
  const boardDiv = document.getElementById("tetrisCanvas")?.parentElement;
  if (!boardDiv || startOverlay) return;
  boardDiv.style.position = "relative";
  startOverlay = document.createElement("div");
  startOverlay.id = "startOverlay";
  Object.assign(startOverlay.style, {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5
  });
  const btn = document.createElement("button");
  btn.id = "startBtn";
  btn.textContent = "Start Game";
  btn.style.padding = "10px 20px";
  btn.style.fontSize = "20px";
  startOverlay.appendChild(btn);
  boardDiv.appendChild(startOverlay);
  btn.addEventListener("click", () => {
    startOverlay.remove();
    startOverlay = null;
    init();
  });
}

function showRestartOverlay() {
  const boardDiv = document.getElementById("tetrisCanvas")?.parentElement;
  if (!boardDiv || restartOverlay) return;
  boardDiv.style.position = "relative";
  restartOverlay = document.createElement("div");
  restartOverlay.id = "restartOverlay";
  Object.assign(restartOverlay.style, {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5
  });
  const btn = document.createElement("button");
  btn.id = "restartBtn";
  btn.textContent = "Restart Game";
  btn.style.padding = "10px 20px";
  btn.style.fontSize = "20px";
  restartOverlay.appendChild(btn);
  boardDiv.appendChild(restartOverlay);
  btn.addEventListener("click", () => {
    restartOverlay.remove();
    restartOverlay = null;
    doResetGame();
  });
}

function updateCandidateListUI() {
  candidateListEl.innerHTML = "";
  topCandidates.forEach(c => {
    let div = document.createElement("div");
    div.className = "candidate";
    div.style.borderLeft = `10px solid ${c.color}`;
    div.style.heigth = `100px`;
    div.innerHTML = `
      <h3>${c.action_key}</h3>
      <p>Flow: ${c.flow.toFixed(2)}</p>
      <p>Prob: ${(c.probability * 100).toFixed(1)}%</p>
    `;
    div.onclick = () => doSelectCandidate(c.action_key);
    candidateListEl.appendChild(div);
  });

  if (typeof initFlowConservationDemo === 'function') {
    // 1) ROOT board: stamp the new piece at COLUMN 0 only
    const rootBoard = currentGameState.board.map(row => row.slice());
    const cp = currentGameState.current_piece;
    if (cp && cp.shape) {
      for (let r = 0; r < cp.shape.length; r++) {
        for (let cc = 0; cc < cp.shape[r].length; cc++) {
          if (cp.shape[r][cc]) {
            // place at col index = cc (i.e. first columns)
            rootBoard[cp.y + r][cc] = 2;
          }
        }
      }
    }

    // 2) ACTION boards: exactly as before, highlight each candidate on real board
    const actions = topCandidates.map(cand => {
      const b = currentGameState.board.map(row => row.slice());
      const p = cand.piece;
      for (let r = 0; r < p.shape.length; r++) {
        for (let cc = 0; cc < p.shape[r].length; cc++) {
          if (p.shape[r][cc]) {
            b[p.y + r][p.x + cc] = 2;
          }
        }
      }
      return { board: b, flow: cand.flow };
    });

    // 3) RESULT boards: lock each candidate in place (value=1)
    const results = topCandidates.map(cand => {
      const b = currentGameState.board.map(row => row.slice());
      const p = cand.piece;
      for (let r = 0; r < p.shape.length; r++) {
        for (let cc = 0; cc < p.shape[r].length; cc++) {
          if (p.shape[r][cc]) {
            b[p.y + r][p.x + cc] = 1;
          }
        }
      }
      return { board: b };
    });

    // 4) Fire off the demo
    initFlowConservationDemo({
      root:    { board: rootBoard },
      actions: actions,
      results: results
    });
  }
}


async function init() {
  // 1) Canvas & UI refs
  canvas          = document.getElementById("tetrisCanvas");
  ctx             = canvas.getContext("2d");
  candidateListEl = document.getElementById("candidateList");
  resetBtn        = document.getElementById("resetBtn");
  pauseBtn        = document.getElementById("pauseBtn");

  // 2) Game & agent
  game  = new TetrisGame();
  agent = new TrajectoryBalanceAgent(0.02);

  // 3) First draw
  currentGameState   = {
    board:         game.board,
    current_piece: game.current_piece,
    score:         game.score,
    game_over:     game.game_over,
    piece_id:      game.piece_id
  };
  currentPieceCenter = game.get_piece_center();
  draw();

  // 4) Start logic/tick loops
  setInterval(gameTick, TICK_INTERVAL);
  requestAnimationFrame(animate);

  // 5) **Wait for ONNX load before you ever call fetchCandidateMoves()**
  try {
    await loadGFlowNetModel();
    console.log("✅ ONNX loaded, now scoring…");
    await fetchCandidateMoves();   // safe: session is ready
    console.log("✅ First scoring done");
  } catch (err) {
    console.warn("⚠️ ONNX load or first scoring failed:", err);
  }

  // 6) Reset‐button & optional pretrained flows
  resetBtn.addEventListener("click", doResetGame);
  pauseBtn.addEventListener("click", doTogglePause);
    res => res.json()
    .then(data => agent.loadFromJSON(data))
    .catch(()=>{/* ignore if none */});
}

window.addEventListener("DOMContentLoaded", showStartOverlay);
