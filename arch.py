import torch.nn as nn
import torch
from tqdm import tqdm
import copy
import numpy as np

class GFlowNet():
    def __init__(
            self,
            n_hidden_layers=2,
            hidden_dim=64,
            lr_model=1e-3,
            lr_logz=1e-1,
            device='cpu'
    ):
        """
        A GFlowNet class
        :param n_hidden_layers: Number of hidden layers
        :param hidden_dim: Number of hidden units
        :param lr_model: learning rate of the model
        :param lr_logz: learning rate of  logZ
        :param device: device for model and images
        """
        hidden_layers = nn.ModuleList()
        for i in range(n_hidden_layers):
            hidden_layers.append(nn.Linear(hidden_dim, hidden_dim))
            hidden_layers.append(nn.ELU())

        self.forward_model = nn.Sequential(
            nn.Linear(3, hidden_dim),
            nn.ELU(),
            *hidden_layers,
            nn.Linear(hidden_dim, 4)
        ).to(device)
        self.backward_model = copy.deepcopy(self.forward_model)
        self.logz = nn.Parameter(torch.tensor(0.0, device=device))
        self.device = device
        self.optimizer = torch.optim.Adam(
            [
                {'params': self.forward_model.parameters(), 'lr': lr_model},
                {'params': self.backward_model.parameters(), 'lr': lr_model},
                {'params': [self.logz], 'lr': lr_logz},
            ]
        )

    def init_state(self, env, batch_size):
        """
        Initializes s_0
        :param env: The environment to train in
        :param batch_size: Batch size
        :return: initialized state, tensor of shape (batch_size, 3) with each state consisting of [step,x,y]
        """
        x = torch.zeros(batch_size, 3, device=self.device)
        x[:,1:] += env.start
        return x

    @staticmethod
    def step(x, action):
        """
        Taking a step in the environment
        :param x: batch of states
        :param action: action to take
        :return: batch of new states
        """
        x_prime=x.clone()
        x_prime[:,1:] = x[:,1:] + action
        x_prime[:,0] = x[:,0] +1
        return x_prime

    @staticmethod
    def get_dist(policy, off_policy):
        """
        Get the distribution for the policy given the output of the network
        :param policy: output of the Neural Network
        :param off_policy: None to train on-policy. Otherwise a constant to add to sigma.
        :return: torch.dist.MultivariateNormal object
        """
        mus, vars = torch.tensor_split(policy, [2], dim=1)
        vars = nn.functional.sigmoid(vars)*0.9+0.1 # for mapping in valid [0.1-1] range
        policy_dist = torch.distributions.MultivariateNormal(mus, torch.diag_embed(vars))

        if not off_policy:
            return policy_dist, None


        exploration_dist = torch.distributions.MultivariateNormal(mus, torch.diag_embed(vars+off_policy))
        return policy_dist, exploration_dist

    def get_action(self, x, off_policy):
        """
        Get the actions for a given batch of states
        :param x: batch of states, Tensor of shape (batch_size, 3)
        :param off_policy: None to train on-policy. Otherwise a constant to add to sigma
        :return: actions, log_probs of the actions.
        Each is a Tensor of shape (batch_size, 2).
        For the actions: [step in x, step in y]
        """
        forward_policy = self.forward_model(x)
        policy_dist, exploration_dist = self.get_dist(forward_policy, off_policy)
        if off_policy:
            actions =exploration_dist.sample()
        else:
            actions = policy_dist.sample()
        log_probs = policy_dist.log_prob(actions)
        return actions, log_probs

    def get_backward_log_probs(self, states, actions):
        """
        Get the log_probs of the backward pass
        :param states: batch of states taken from the trajactories
        :param actions: batch of actions taken during forward pass
        :return:log_probs of the actions
        """
        backward_policy = self.backward_model(states)
        policy_dist,_ = self.get_dist(backward_policy, None)
        log_probs = policy_dist.log_prob(actions)
        return log_probs

    def train(self, env, batch_size=64, trajectory_length=2, n_iterations=5000, off_policy=None):
        """
        Train the model, Loss is Trajectory Balance Loss
        :param env: The environment to train in
        :param batch_size: Batch size
        :param trajectory_length: Fixed length of the trajectory
        :param n_iterations: number of iterations to train
        :param off_policy: None, constant or list
        None or 0 to train on-policy.
        A constant (int, float) will be added to the variance and lead to higher exploration.
        A list of int or float will be used as a schedule. The length must be equal to n_iterations.
        :return: tuple(List of losses, list of logZs, True Logz), last 4096 trajectories for visualization
        """

        losses = []
        trajectory_vis_n = 2048 # keep the last n trajectories for visualization
        trajectory_vis = torch.zeros((trajectory_vis_n, trajectory_length+1, 3), device=self.device)
        logzs = []
        logz_true = env.log_partition
        self.forward_model.train()
        self.backward_model.train()
        if not off_policy:
            exploration_schedule = [None] * n_iterations
        elif isinstance(off_policy, list):
            assert len(off_policy) == n_iterations, "Length of off_policy must be equal to n_iterations"
            exploration_schedule = off_policy
        else:
            assert isinstance(off_policy, int) or isinstance(off_policy, float), "no valid off_policy given"
            exploration_schedule = torch.linspace(off_policy, 0, n_iterations)

        progress_bar = tqdm(range(n_iterations), desc="Training...")
        for i in progress_bar:
            self.optimizer.zero_grad()
            x = self.init_state(env, batch_size)
            trajectory = torch.zeros(batch_size, trajectory_length+1, 3, device=self.device)
            log_probs_forward = torch.zeros((batch_size,), device=self.device)
            log_probs_backward = torch.zeros((batch_size,), device=self.device)

            for t in range(trajectory_length):
                actions, log_probs = self.get_action(x, exploration_schedule[i])
                log_probs_forward += log_probs
                x_prime = self.step(x, actions)
                trajectory[:,t+1,:] += x_prime
                x = x_prime

            for t in range(trajectory_length,1,-1):
                log_probs = self.get_backward_log_probs(trajectory[:,t,:], trajectory[:,t,1:]-trajectory[:,t-1,1:])
                log_probs_backward += log_probs

            log_reward = env.log_reward(trajectory[:,-1,1:])
            loss = torch.mean((self.logz+log_probs_forward-log_probs_backward-log_reward)**2)
            loss.backward()
            self.optimizer.step()
            losses.append(loss.item())
            logzs.append(self.logz.item())
            trajectory_vis = torch.cat((trajectory_vis, trajectory), dim=0)
            if len(trajectory_vis)>trajectory_vis_n:
                trajectory_vis = trajectory_vis[-trajectory_vis_n:]

            if i%20 == 0:
                progress_bar.set_postfix({
                    "Loss": f"{loss.item():.3f}",
                    "logZ": f"{self.logz.item():.3f}",
                    "logZ True": f"{logz_true.item():.3f}"
                })

        return (losses, logzs, logz_true.item()), trajectory_vis

    def inference(self, env, batch_size=4096, trajectory_length=2):
        """
        Sample from the model
        :param env: Environment to sample from
        :param batch_size: Number of trajectories to sample
        :param trajectory_length: Fixed length of the trajectory
        :return: Tensor of shape (batch_size, trajectory_length+1, 2) with the trajectorys of all samples
        """
        self.forward_model.eval()
        self.backward_model.eval()
        with torch.no_grad():
            trajectory = torch.zeros((batch_size, trajectory_length + 1, 3), device=self.device)
            trajectory[:, 0, 1:] += env.start
            x = self.init_state(env, batch_size)

            for t in range(trajectory_length):
                action, _ = self.get_action(x, None)
                x_prime = GFlowNet.step(x, action)
                trajectory[:,t+1,:] += x_prime
                x=x_prime

        return trajectory




