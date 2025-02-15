"""
Contains all the plotting functions.
"""

import torch
import numpy as np
import matplotlib as mpl
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
import io
import base64
import plotly.figure_factory as ff
import plotly.graph_objects as go
import plotly



def grid(between=(-3,3), grid_size=100):
    """
    helper function to generate grid for plotting the environment
    :param between: boundaries of the grid
    :param grid_size: density of plotting grid
    :return:
    """
    x = torch.linspace(between[0], between[1], grid_size)
    y = torch.linspace(between[0], between[1], grid_size)
    x_grid, y_grid = torch.meshgrid(x, y, indexing='xy')
    grid_points = torch.stack([x_grid.ravel(), y_grid.ravel()], dim=-1)
    return x_grid, y_grid, grid_points

def plot_env_2d(
        env,
        title=None,
        levels=50,
        alpha=1.0,
        grid_size=100
):
    """
    Plots the distributions as contour plots
    :param env: the given enviroment to plot.
    :param title: title of the plot
    :param levels: number of countour lines
    :param alpha: transparency of contour lines
    :param grid_size: density of plotting grid
    :return: matplotlib fig object
    """

    x_grid, y_grid, grid_points = grid(grid_size=grid_size)
    print(grid_points)
    density = env.reward(grid_points)
    print(density)
    density = density.reshape(grid_size, grid_size).numpy()

    fig, ax = plt.subplots(figsize=(8, 6))
    contour = ax.contourf(x_grid.numpy(), y_grid.numpy(), density, levels=levels, cmap="viridis", alpha = alpha)
    fig.colorbar(contour, ax=ax, label="Density")
    ax.set_title(title)
    ax.set_xlabel("x")
    ax.set_ylabel("y")

    return fig

def plot_env_3d(
        env,
        title=None,
        alpha=0.8,
        grid_size=100
):
    """
        Plots the distributions as 3d plots
        :param env: the given enviroment to plot.
        :param title: title of the plot
        :param alpha: transparency of 3d plot
        :param grid_size: density of plotting grid
        :return: matplotlib fig object
        """
    x_grid, y_grid, grid_points = grid(grid_size=grid_size)
    density = env.reward(grid_points)
    density = density.reshape(grid_size, grid_size).numpy()

    fig = plt.figure(figsize=(10, 8))
    ax = fig.add_subplot(111, projection='3d')
    surf = ax.plot_surface(x_grid.numpy(), y_grid.numpy(), density, cmap="viridis", edgecolor='none', alpha=alpha)
    fig.colorbar(surf, ax=ax, label="Density")
    ax.set_title(title)
    ax.set_xlabel("x")
    ax.set_ylabel("x")
    ax.set_zlabel("Density")

    return fig

def plot_env(
        env,
        title=None,
        levels=50,
        alpha_2d=1.0,
        alpha_3d=0.8,
        grid_size=100
):
    """
    Plot the environment as a 2d and 3d plot next to each other
    :param env: the given enviroment to plot.
    :param title: title of the plot
    :param levels: number of countour lines
    :param alpha_2d: alpha: transparency of contour lines
    :param alpha_3d: alpha: transparency of 3d plot
    :param grid_size: density of plotting grid
    :return:
    """
    x_grid, y_grid, grid_points = grid(grid_size=grid_size)
    density = env.reward(grid_points)
    density = density.reshape(grid_size, grid_size).numpy()

    fig = plt.figure(figsize=(16, 8))

    # Contour plot
    ax1 = fig.add_subplot(121)
    contour = ax1.contourf(x_grid, y_grid, density, levels=levels, alpha=alpha_2d, cmap="viridis")
    fig.colorbar(contour, ax=ax1, shrink=0.8, orientation='vertical')
    ax1.set_aspect('equal', adjustable='box')
    ax1.set_xlabel("x")
    ax1.set_ylabel("y")

    # 3D plot
    ax2 = fig.add_subplot(122, projection='3d')
    ax2.plot_surface(x_grid, y_grid, density, cmap="viridis", edgecolor='k', alpha=alpha_3d)
    ax2.set_xlabel("x")
    ax2.set_ylabel("y")
    ax2.set_zlim(0,1)
    ax2.set_zlabel("Density")

    fig.suptitle(title)
    buf = io.BytesIO()
    fig.savefig(buf, format='png')
    buf.seek(0)
    img_base64 = base64.b64encode(buf.read()).decode('utf-8')
    buf.close()

    return fig, img_base64


def plot_losses(loss, logzs, true_logz):
    """
    Plots the given losses of the training
    :param loss: list of losses
    :param logzs: list of logzs
    :param true_logz: float or list of true logzs
    :return: Matplotlib fig object
    """
    if not isinstance(true_logz, list):
        true_logz = [true_logz]*len(loss)
    fig, ax = plt.subplots(figsize=(8, 6))
    ax.plot(loss, label="loss", color="blue")
    ax.plot(logzs, label="logz", color="orange")
    ax.plot(true_logz, label="true logz", color="green")
    ax.set_xlabel("iteration")
    ax.set_ylabel("metric")
    ax.set_title("Training")
    ax.set_ylim([-1,3])
    ax.legend()
    return fig

def plot_states_2d(
        env,
        trajectory,
        title=None,
        ground_truth="contour",
        levels=10,
        alpha=1.0,
        grid_size=100,
        colormap='viridis',  # 'cividis',
        marginals_gradient = True
):
    """
    Plots the given final states of the trajectories with consistent layout.
    :param env: the original environment
    :param trajectory: batch of trajectories as torch.tensor of shape (batch_size, trajectory length, 3)
    :param title: title of the plot
    :param ground_truth: heatmap, contour or None
    :param levels: number of contour lines
    :param alpha: transparency of contour lines
    :param grid_size: density of plotting grid
    :param colormap: matplotlib colormap
    :param marginals_gradient: plot the true distribution of the marginals with
    a gradient according to the colormap instead of a fixed color
    :return: matplotlib fig object
    """
    colormap = mpl.colormaps[colormap]
    sec_color = "0.2"
    binwidth = 0.2

    # Get sampled states
    states = trajectory[:, -1, 1:]
    x = states[:, 0].numpy()
    y = states[:, 1].numpy()

    # Calculate density of the environment
    x_grid, y_grid, grid_points = grid(grid_size=grid_size)
    density_env = env.reward(grid_points)
    density_env = density_env.reshape(grid_size, grid_size).numpy()

    # Marginal densities
    # Normalization: Divide through number of gaussians as we sum up over them without weights
    # (6/(gridsize-1) is the step, multiplying with the delta to approximate the integral
    density_x = (6 / (grid_size - 1)) * np.sum(density_env, axis=0) / len(env.mus)
    density_y = (6 / (grid_size - 1)) * np.sum(density_env, axis=1) / len(env.mus)

    # Plot ground truth
    fig = plt.figure(layout='constrained', figsize=(8, 8))
    ax = fig.add_gridspec(top=0.75, right=0.75).subplots()
    ax.set(aspect=1)
    if ground_truth == 'contour':
        ax.contour(x_grid.numpy(), y_grid.numpy(), density_env, levels=levels, cmap=colormap, alpha=1)
    elif ground_truth == 'heatmap':
        ax.contourf(x_grid.numpy(), y_grid.numpy(), density_env, levels=levels, cmap=colormap, alpha=1)
    ax.set_xlim(-3, 3)
    ax.set_ylim(-3, 3)
    ax.set_xlabel("x")
    ax.set_ylabel("y")

    # Plot sampled states
    ax.scatter(x, y, alpha=alpha, color=sec_color, marker='2', linewidths=1, label='samples')

    # Side plots for marginals
    ax_histx = ax.inset_axes([0, 1.05, 1, 0.25], sharex=ax)
    ax_histy = ax.inset_axes([1.05, 0, 0.25, 1], sharey=ax)
    ax_histx.tick_params(axis="x", labelbottom=False)
    ax_histy.tick_params(axis="y", labelleft=False)
    ax_histy.text(0.55, 0, 'Marginal of y', rotation=270, ha='left', va='center')
    ax_histx.set_title('Marginal of x')

    # Fix side plot ranges
    ax_histx.set_ylim(0, 0.5)
    ax_histy.set_xlim(0, 0.5)

    # Histogram of sampled states
    bins = np.arange(-3, 3 + binwidth, binwidth)
    ax_histx.hist(x, density=True, bins=bins, color=sec_color)
    ax_histy.hist(y, density=True, bins=bins, color=sec_color, orientation='horizontal')

    # Ground truth marginals
    r = torch.linspace(-3, 3, grid_size)

    if marginals_gradient:
        # Marginal x
        points = np.array([r, density_x]).T.reshape(-1, 1, 2)
        segments = np.concatenate([points[:-1], points[1:]], axis=1)
        lc = LineCollection(segments, cmap=colormap, norm=plt.Normalize(0, 0.5))
        lc.set_array(density_x)
        lc.set_linewidth(2)
        ax_histx.add_collection(lc)

        # Marginal y
        points = np.array([density_y, r]).T.reshape(-1, 1, 2)
        segments = np.concatenate([points[:-1], points[1:]], axis=1)
        lc = LineCollection(segments, cmap=colormap, norm=plt.Normalize(0, 0.5))
        lc.set_array(density_y)
        lc.set_linewidth(2)
        ax_histy.add_collection(lc)
    else:
        ax_histx.plot(r.numpy(), density_x, color=colormap(0.8), linewidth=2, label='Marginal x', zorder=5)
        ax_histy.plot(density_y, r.numpy(), color=colormap(0.8), linewidth=2, label='Marginal y', zorder=5)

    if title:
        fig.suptitle(title)

    fig.canvas.draw()
    fig.canvas.flush_events()

    buf = io.BytesIO()
    fig.savefig(buf, format='png')
    buf.seek(0)
    img_base64 = base64.b64encode(buf.read()).decode('utf-8')
    buf.close()

    return fig, img_base64

def plot_flow(
        model,
        step=0,
        grid_size=10,
        static = True
        ):
    """
    Plots the flow as a vectorfield
    :param model: the trained gflownet
    :param step: the step for which to visualize. Int in range [0, trajectory_length].
    :param grid_size: size of the grid. Massive impact on computation time.
    :param static: animated or static visualization. animated plots for all steps up to trajectory_length.
    :return: None
    """

    x_grid, y_grid, grid_points = grid(grid_size=grid_size)

    if static:
        states = torch.cat((torch.ones((len(grid_points),1))*step, grid_points), dim=1)
    else:
        steps = torch.repeat_interleave(torch.arange(step+1), len(grid_points)).reshape(-1, 1)
        grid_points = grid_points.repeat(step+1,1)
        states = torch.cat((steps, grid_points), dim=1)

    with torch.no_grad():
        model.forward_model.eval()
        policy = model.forward_model(states)
    mus, sigmas = torch.tensor_split(policy, [2], dim=1)
    #sigmas = torch.sigmoid(sigmas) * 0.9 + 0.1
    flow_vectors = mus


    if static:
        fig = ff.create_quiver(
            grid_points[:,0],
            grid_points[:,1],
            flow_vectors[:,0],
            flow_vectors[:,1],
            line=dict(color='teal'),
            scaleratio=1,
            scale=0.4
        )

    else:
        frames = []
        fig = ff.create_quiver(
            grid_points[:grid_size**2, 0],
            grid_points[:grid_size**2, 1],
            flow_vectors[:grid_size**2, 0],
            flow_vectors[:grid_size**2, 1],
            line=dict(color='teal'),
            scaleratio=1,
            scale=0.4
        )
        for f in range(step):
            a = f*grid_size**2
            b= (f+1)*grid_size**2
            fig_temp = ff.create_quiver(
                grid_points[a:b,0],
                grid_points[a:b,1],
                flow_vectors[a:b,0],
                flow_vectors[a:b,1],
                line=dict(color='teal'),
                scaleratio=1,
                scale=0.4
            )
            frames.append(go.Frame(data=[fig_temp.data[0]]))

        fig.update_layout(
            paper_bgcolor='rgba(0,0,0,0)',
            plot_bgcolor='rgba(0,0,0,0)',
            updatemenus=[dict(type='buttons',
                showactive=False,
                buttons=[dict(
                    label='Play',
                    method='animate',
                    args=[None, dict(frame=dict(duration=250, redraw=False),
                                     transition=dict(duration=50),
                                     fromcurrent=True,
                                     mode='immediate',
                                     loop=True)])])])
        fig.update(frames=frames)


    fig.show()


