from arch import GFlowNet
from env import Env
import torch
import plot_utils as plot
import matplotlib.pyplot as plt
import numpy as np

seed = 7614
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
torch.backends.cudnn.deterministic = True
torch.backends.cudnn.benchmark = False
torch.manual_seed(seed)
torch.cuda.manual_seed(seed)
np.random.seed(seed)

# hyperparams
device="cpu"
n_inference=4000
batch_size=1024
n_iterations=1000
trajectory_length = 3



env = Env(mus=[torch.tensor([1,1]), torch.tensor([-1.5,-1.5])], sigmas = [torch.ones(2)*0.2]*2,)
gflownet = GFlowNet(device=device)
losses_, _ = gflownet.train(
    env,
    n_iterations=n_iterations,
    batch_size=batch_size,
    trajectory_length=trajectory_length,
    off_policy=2.5
)
losses, logzs, true_logz = losses_
fig = plot.plot_losses(losses, logzs, true_logz)
plt.show()
trajectories = gflownet.inference(env, batch_size=n_inference, trajectory_length=trajectory_length)
fig = plot.plot_states_2d(env, trajectories, alpha=0.8, ground_truth="contour", colormap="viridis", levels=10)
plt.show()