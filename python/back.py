"""
This script handles the backend for the webserver
"""

from arch import GFlowNet
from env import Env
from plot_utils import plot_states_2d

import torch
from pydantic import BaseModel
from fastapi import FastAPI, BackgroundTasks
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import matplotlib.pyplot as plt

app = FastAPI()

# Allow CORS for development purposes
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# Global state to track training processes
visualization_state = {
    "running": False,
    "current_image": None,
    "stop_requested": False
}

# pydantic classes
class Mean(BaseModel):
    x: float
    y: float

class Gaussian(BaseModel):
    mean: Mean
    variance: float

class VisualizationRequest(BaseModel):
    off_policy_value: float
    n_iterations_value: int
    lr_model_value: float
    lr_logz_value: float
    trajectory_length_value: int
    hidden_layer_value: int
    hidden_dim_value: int
    seed_value: int
    batch_size_value: int
    curr_gaussians: list[Gaussian]

# when user is starting the training process
@app.post("/start_visualization")
def start_visualization(request: VisualizationRequest, background_tasks: BackgroundTasks):
    global visualization_state
    params = {}
    for k,v in request.dict().items():
        params[k.replace("_value","")]=v

    if visualization_state["running"]:
        return JSONResponse(status_code=400, content={"error": "Visualization already running."})

    visualization_state["running"] = True
    visualization_state["stop_requested"] = False
    visualization_state["current_image"] = None

    # Start the visualization in the background
    background_tasks.add_task(
        train_and_sample,
        params
    )
    return {"status": "Visualization started."}

# updates in the training process via polling
@app.get("/get_visualization")
def get_visualization():
    global visualization_state

    if not visualization_state["running"] and visualization_state["current_image"] is None:
        return {"completed": True, "image_data": None}

    return {
        "completed": not visualization_state["running"],
        "image": visualization_state["current_image"]
    }

# when user stops training process
@app.post("/stop_visualization")
def stop_visualization():
    global visualization_state
    # Request stop if a process is running
    if visualization_state["running"]:
        visualization_state["stop_requested"] = True
        return {"status": "Stop requested."}
    else:
        return JSONResponse(status_code=400, content={"error": "No visualization running."})

# train and visualize if trained on enough samples
def train_and_sample(
        params: dict,
):
    global visualization_state

    # basically the batch size for the sampling
    # upper bound: send vis to frontend if trained for n trajectories
    trajectory_vis_n = 2048

    n_rounds = int(trajectory_vis_n/params['batch_size'])
    n_visualizations = params['n_iterations']//n_rounds
    torch.manual_seed(params['seed'])

    # set up the environment
    mus = []
    sigmas = []
    for g in params['curr_gaussians']:
        m = [g["mean"]["x"], g["mean"]["y"]]
        mus.append(torch.Tensor(m))
        sigmas.append(torch.ones(2) * g["variance"])
    env = Env(mus, sigmas)

    model = GFlowNet(
        n_hidden_layers=params['hidden_layer'],
        hidden_dim=params['hidden_dim'],
        lr_model=params['lr_model'],
        lr_logz=params['lr_logz'],
        device = 'cpu'
    )

    # set up off policy schedule beforehand, as training is interrupted for visualizations
    if params['off_policy']:
        off_policy = torch.linspace(params['off_policy'], 0, params['n_iterations'])
    else:
        off_policy = [None]*params['n_iterations']

    # start training
    for v in range(n_visualizations):

        if visualization_state["stop_requested"]:
            break

        losses, trajectory = model.train(
            env,
            batch_size=params['batch_size'],
            trajectory_length=params['trajectory_length'],
            n_iterations=n_rounds,
            off_policy=off_policy[v*n_rounds:(v+1)*n_rounds],
        )

        # visualize
        fig, img_base64=plot_states_2d(
            env,
            trajectory,
            title=f"Iteration {(v+1)*n_rounds}/{params['n_iterations']}",
            marginals_gradient=False
        )
        plt.savefig(f"ims/run3_{(v+1)*n_rounds}.png")
        visualization_state["current_image"] = img_base64
        plt.close()

    # train for the remainder of the division
    if params['n_iterations']/n_rounds != n_visualizations:
        mod = params['n_iterations']%n_rounds
        losses, trajectory = model.train(
            env,
            batch_size=params['batch_size'],
            trajectory_length=params['trajectory_length'],
            n_iterations=mod,
            off_policy=off_policy[-mod:]
        )
        # sample via inference function to ensure enough samples
        trajectory = model.inference(env, batch_size=trajectory_vis_n, trajectory_length=params['trajectory_length'])
        fig, img_base64 = plot_states_2d(
            env,
            trajectory,
            title=f"Iteration {params['n_iterations']}/{params['n_iterations']}",
            marginals_gradient=False
        )
        visualization_state["current_image"] = img_base64
        plt.savefig(f"ims/run3_{params['n_iterations']}.png")
        plt.close()

    # Mark process as completed or stop requested
    visualization_state["running"] = False
    if visualization_state["stop_requested"]:
        print("Visualization stopped by user.")

