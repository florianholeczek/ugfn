import plot_utils as plot
from env import Env
from arch import GFlowNet


import matplotlib.pyplot as plt
import numpy as np
from tqdm import tqdm
import torch
#from torch.distributions import MultivariateNormal
import gfn

seed = 7614
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
torch.backends.cudnn.deterministic = True
torch.backends.cudnn.benchmark = False
torch.manual_seed(seed)
torch.cuda.manual_seed(seed)
np.random.seed(seed)
#print(device)


env = Env()
GFlowNet = GFlowNet()
losses, logzs, true_logz = GFlowNet.train(env, n_iterations=1000)
fig = plot.plot_losses(losses, logzs, true_logz)
plt.show()
trajectories = GFlowNet.inference(env, batch_size=2000)
fig = plot.plot_states_2d(env, trajectories, alpha=0.2)
plt.show()
"""#env = Env(mus=[torch.tensor([2,2]), torch.tensor([-2,-2])])
env = Env()
#env = Env(mus=[torch.zeros(2)], sigmas=[torch.ones(2)])
a= torch.randn((1000,2,3))
fig = plot.plot_states_2d(env,a,alpha=0.5)
plt.show()"""


import numpy as np
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
from matplotlib import cm

"""# Data
x = np.linspace(0, 10, 100)
y = np.sin(x)

# Create segments for LineCollection
points = np.array([x, y]).T.reshape(-1, 1, 2)
segments = np.concatenate([points[:-1], points[1:]], axis=1)

# Create a colormap based on y-values
norm = plt.Normalize(y.min(), y.max())
lc = LineCollection(segments, cmap=cm.viridis, norm=norm)
lc.set_array(y)  # Set the values used for colormap
lc.set_linewidth(2)

# Plot
fig, ax = plt.subplots()
ax.add_collection(lc)
ax.autoscale()
ax.set_title("Color by Height")
plt.colorbar(lc, ax=ax, label="Height")
plt.show()"""



