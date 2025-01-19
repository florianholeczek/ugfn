from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.responses import RedirectResponse
import random
import numpy as np
import torch
import plotly.tools as tools
import plotly.graph_objects as go
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from arch import GFlowNet
from env import Env
from plot_utils import plot_states_2d, plot_env
from pydantic import BaseModel

from fastapi import FastAPI, BackgroundTasks
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import time
import threading
import base64
import matplotlib.pyplot as plt
import io

app = FastAPI()

# Allow CORS for development purposes
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# Global state to track visualization processes
visualization_state = {
    "running": False,
    "current_image": None,
    "stop_requested": False
}

# start with standard environment
env_start = Env()
_, env_state = plot_env(env_start, title="PDF of the environment")
plt.close("all")

class VisualizationRequest(BaseModel):
    off_policy_value: float
    n_iterations_value: int
    lr_model_value: float
    lr_logz_value: float
    visualize_every: int
    trajectory_length_value: int
    hidden_layer_value: int
    hidden_dim_value: int
    seed_value: int
    batch_size_value: int


# Define the model for 'mean' inside each gaussian
class Mean(BaseModel):
    x: float
    y: float

# Define the model for a single Gaussian object
class Gaussian(BaseModel):
    mean: Mean
    variance: float

# Define the request model that contains a list of Gaussians
class RequestData(BaseModel):
    gaussians: list[Gaussian]

# Dummy visualize function
def visualize(off_policy_value: float, n_iterations_value: int):
    global visualization_state
    for i in range(n_iterations_value):
        if visualization_state["stop_requested"]:
            break

        # Simulate computation
        time.sleep(2)

        # Create a dummy plot
        plt.figure()
        plt.plot([1, 2, 3], [off_policy_value, i, off_policy_value * i])
        plt.title(f"Iteration {i + 1}")

        # Save plot to a Base64 string
        buf = io.BytesIO()
        plt.savefig(buf, format="png")
        plt.close()
        buf.seek(0)
        img_base64 = base64.b64encode(buf.read()).decode("utf-8")

        # Update state
        visualization_state["current_image"] = img_base64

    # Mark process as completed or stop requested
    visualization_state["running"] = False
    if visualization_state["stop_requested"]:
        print("Visualization stopped by user.")


@app.post("/start_visualization")
def start_visualization(request: VisualizationRequest, background_tasks: BackgroundTasks):
    global visualization_state
    params = {}
    for k,v in request.dict().items():
        params[k.replace("_value","")]=v

    print("start_vis")

    # Check if a process is already running
    if visualization_state["running"]:
        return JSONResponse(status_code=400, content={"error": "Visualization already running."})

    # Reset state
    visualization_state["running"] = True
    visualization_state["stop_requested"] = False
    visualization_state["current_image"] = None

    # Start the visualization in the background
    #background_tasks.add_task(visualize, off_policy_value, n_iterations_value)
    background_tasks.add_task(
        train_and_sample,
        params
    )
    return {"status": "Visualization started."}


@app.get("/get_visualization")
def get_visualization():
    global visualization_state

    if not visualization_state["running"] and visualization_state["current_image"] is None:
        return {"completed": True, "image_data": None}

    return {
        "completed": not visualization_state["running"],
        "image": visualization_state["current_image"]
    }


@app.post("/stop_visualization")
def stop_visualization():
    global visualization_state

    # Request stop if a process is running
    if visualization_state["running"]:
        visualization_state["stop_requested"] = True
        return {"status": "Stop requested."}
    else:
        return JSONResponse(status_code=400, content={"error": "No visualization running."})

@app.post("/get_env_state")
def get_env_state(request: RequestData):
    global env_state
    print("get env")
    mus, sigmas = reformat_gaussians(request)
    env_current = Env(mus, sigmas)
    _, env_state = plot_env(env_current, title="PDF of the environment")
    plt.close("all")
    return {"image": env_state}

def reformat_gaussians(request):
    gaussians = request.dict()["gaussians"]
    mus = []
    sigmas = []
    for g in gaussians:
        m=[]
        m.append(g["mean"]["x"])
        m.append(g["mean"]["y"])
        mus.append(torch.Tensor(m))
        sigmas.append(torch.ones(2)*g["variance"])
    return mus, sigmas


def train_and_sample(
        params: dict,
):
    global visualization_state
    #n_visualizations = int(np.ceil(params['n_iterations']/params['visualize_every']))
    trajectory_vis_n = 2048
    n_rounds = int(trajectory_vis_n/params['batch_size'])
    n_visualizations = params['n_iterations']//n_rounds

    env = Env()
    model = GFlowNet(
        n_hidden_layers=params['hidden_layer'],
        hidden_dim=params['hidden_dim'],
        lr_model=params['lr_model'],
        lr_logz=params['lr_logz'],
    )
    if params['off_policy']:
        off_policy = torch.linspace(params['off_policy'], 0, params['n_iterations'])
    else:
        off_policy = [None]*params['n_iterations']
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
        fig, img_base64=plot_states_2d(
            env,
            trajectory,
            title=f"Iteration {(v+1)*n_rounds}/{params['n_iterations']}",
            marginals_gradient=False
        )
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
        # To ensure enough samples
        trajectory = model.inference(env, batch_size=trajectory_vis_n, trajectory_length=params['trajectory_length'])
        fig, img_base64 = plot_states_2d(
            env,
            trajectory,
            title=f"Iteration {params['n_iterations']}/{params['n_iterations']}",
            marginals_gradient=False
        )
        visualization_state["current_image"] = img_base64
        plt.close()

    # Mark process as completed or stop requested
    visualization_state["running"] = False
    if visualization_state["stop_requested"]:
        print("Visualization stopped by user.")

def train_and_sampleOLD(
        params: dict,
):
    global visualization_state
    n_visualizations = int(np.ceil(params['n_iterations']/params['visualize_every']))

    env = Env()
    model = GFlowNet(
        n_hidden_layers=params['hidden_layer'],
        hidden_dim=params['hidden_dim'],
        lr_model=params['lr_model'],
        lr_logz=params['lr_logz'],
    )
    for v in range(n_visualizations):
        if visualization_state["stop_requested"]:
            break
        losses = model.train(
            env,
            batch_size=params['batch_size'],
            trajectory_length=params['trajectory_length'],
            n_iterations=params['visualize_every'],
            off_policy=params['off_policy'],
        )
        trajectory = model.inference(env, batch_size=4096, trajectory_length=params['trajectory_length'])
        fig=plot_states_2d(
            env,
            trajectory,
            title=f"Iteration {(v+1)*params['visualize_every']}/{params['n_iterations']}",
            marginals_gradient=False
        )

        buf= io.BytesIO()
        fig.savefig(buf, format='png')
        buf.seek(0)
        img_base64 = base64.b64encode(buf.read()).decode('utf-8')
        buf.close()
        visualization_state["current_image"] = img_base64
        plt.close()
    # Mark process as completed or stop requested
    visualization_state["running"] = False
    if visualization_state["stop_requested"]:
        print("Visualization stopped by user.")

"""
@app.get("/rand")
async def hello():
   return random.randint(0, 100)

@app.get('/')
async def front():
   return RedirectResponse(url='front')
app.mount("/front", StaticFiles(directory="front/public", html=True), name="front")
app.mount("/build", StaticFiles(directory="front/public/build"), name="build")"""