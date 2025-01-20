from arch import GFlowNet
from env import Env
import plot_utils as plot

import torch
import matplotlib.pyplot as plt
import numpy as np


# set hyperparameters
n_inference=4096 # batch size for inference after the training
batch_size=1024 # batch size during training
n_iterations=5000 # number of iteration to train for
trajectory_length = 3 # trajectory length
off_policy = 0 # variance to add during action sampling. 0 to train on-policy.
n_hidden_layers=2 # number of hidden layers for forward and backward policy
hidden_dim=64 # size for forward and backward policy
lr_model=1e-3 # learning rate of the model
lr_logz=1e-1 # learning rate of logZ, typically higher than the model
device=torch.device('cpu') #device to train on. Usually no big difference.
seed = 7614

# set environment
mus = [torch.tensor([1,1]), torch.tensor([-1,-1])] # list of means for the gaussians
sigmas = [torch.ones(2)*0.4]*2 # list of variances for the gaussians




# start training

torch.backends.cudnn.deterministic = True
torch.backends.cudnn.benchmark = False
torch.manual_seed(seed)
torch.cuda.manual_seed(seed)
np.random.seed(seed)

env = Env(
    mus=mus,
    sigmas = sigmas
)

gflownet = GFlowNet(
    n_hidden_layers=n_hidden_layers,
    hidden_dim=hidden_dim,
    lr_model=lr_model,
    lr_logz=lr_logz,
    device=device
)

losses_, _ = gflownet.train(
    env,
    n_iterations=n_iterations,
    batch_size=batch_size,
    trajectory_length=trajectory_length,
    off_policy=off_policy,
)

# plot
losses, logzs, true_logz = losses_
fig = plot.plot_losses(losses, logzs, true_logz)
plt.show()
trajectories = gflownet.inference(env, batch_size=n_inference, trajectory_length=trajectory_length)
fig = plot.plot_states_2d(env, trajectories, alpha=0.8, ground_truth="contour", colormap="viridis", levels=10)
plt.show()