"""
Handles the backend for the webserver.
Not neccessary if you use just the python scripts.
"""
import time

from python.arch import GFlowNet
from python.env import Env

from uuid import uuid4
from threading import Lock


import torch
from pydantic import BaseModel
import io
from fastapi import FastAPI, BackgroundTasks
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
torch.set_printoptions(precision=2, sci_mode=False)

vectorgrid_size = 31

app = FastAPI()

# Allow CORS for development purposes
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# Training session class for handling multiple users
class TrainingSession:
    def __init__(self, params):
        self.id = str(uuid4())
        self.params = params
        self.env = self._init_env()
        self.model = self._init_model()
        self.training_state = {
            "running": True,
            "stop_requested": False,
            "states": torch.zeros(1, 2).tolist(),
            "losses": {
                "losses": [],
                "logzs": [],
                "truelogz": [],
                "n_iterations": 0,
            },
            "current_image": None
        }
        self.final_trajectories = []
        self.final_flows = []
        self.lock = Lock()

    def _init_env(self):
        mus = []
        sigmas = []
        for g in self.params['curr_gaussians']:
            m = [g["mean"]["x"], g["mean"]["y"]]
            mus.append(torch.Tensor(m))
            sigmas.append(torch.ones(2) * g["variance"])
        return Env(mus, sigmas)

    def _init_model(self):
        return GFlowNet(
            n_hidden_layers=self.params['hidden_layer'],
            hidden_dim=self.params['hidden_dim'],
            lr_model=self.params['lr_model'],
            lr_logz=self.params['lr_logz'],
            device='cpu'
        )

# Define sessions
sessions: dict[str, TrainingSession] = {}

# pydantic classes
class Mean(BaseModel):
    x: float
    y: float

class Gaussian(BaseModel):
    mean: Mean
    variance: float

class TrainingRequest(BaseModel):
    off_policy_value: float
    loss_choice: str
    n_iterations_value: int
    lr_model_value: float
    lr_logz_value: float
    trajectory_length_value: int
    hidden_layer_value: int
    hidden_dim_value: int
    seed_value: int
    batch_size_value: int
    curr_gaussians: list[Gaussian]

class VectorfieldRequest(BaseModel):
    size: int

# when user is starting the training process
@app.post("/start_training")
def start_training(request: TrainingRequest, background_tasks: BackgroundTasks):
    params = {k.replace("_value", ""): v for k, v in request.dict().items()}
    session = TrainingSession(params)
    sessions[session.id] = session

    background_tasks.add_task(train_and_sample, session)
    return {"session_id": session.id}

# updates in the training process via polling
@app.get("/get_training_update/{session_id}")
def get_training_update(session_id: str):
    session = sessions.get(session_id)
    if not session:
        return JSONResponse(status_code=404, content={"error": "Session not found"})

    with session.lock:
        return {
            "completed": not session.training_state["running"],
            "image": session.training_state["current_image"],
            "states": session.training_state["states"],
            "losses": session.training_state["losses"],
        }

# when user stops training process
@app.post("/stop_training/{session_id}")
def stop_training(session_id: str):
    session = sessions.get(session_id)
    if not session:
        return JSONResponse(status_code=404, content={"error": "Session not found"})

    with session.lock:
        if session.training_state["running"]:
            session.training_state["stop_requested"] = True
            return {"status": "Stop requested."}
        else:
            return {"status": "Not running."}


# collect and send flows and trajectories after training is done
@app.post("/get_final_data/{session_id}")
async def get_final_data(session_id: str):
    session = sessions.get(session_id)
    if not session:
        return JSONResponse(status_code=404, content={"error": "Session not found"})

    while session.training_state["running"]:
        time.sleep(0.1)

    buffer = prepare_final_dump(session.final_trajectories, session.final_flows)
    return StreamingResponse(buffer, media_type="application/octet-stream")




# train and save samples for visualization
def train_and_sample(session: TrainingSession):
    global vectorgrid_size
    params = session.params

    global_trajectory_length = params['trajectory_length']
    session.training_state["losses"] = dict(losses=[], logzs=[], truelogz=[], n_iterations=0)
    session.training_state["states"] = torch.zeros(1,2).tolist()
    vectorgrid = calc_vectorgrid(vectorgrid_size, params['trajectory_length'])

    # as the model samples only n=batch size samples in one iteration and we need to update the visualization
    # frequently, we would only have very few samples for each update.
    # To mitigate this, we always keep the last n samples, set via trajectory_max.
    # This is the number of states to send to frontend for visualization,basically batch size for sampling
    trajectory_max = 2048
    train_interval = 4 # number of iterations to train before updating states for visualization
    current_states = None
    current_trajectories = None
    torch.manual_seed(params['seed'])

    # set up the environment and model
    mus = []
    sigmas = []
    for g in params['curr_gaussians']:
        m = [g["mean"]["x"], g["mean"]["y"]]
        mus.append(torch.Tensor(m))
        sigmas.append(torch.ones(2) * g["variance"])
    session.env = Env(mus, sigmas)
    session.model = GFlowNet(
        n_hidden_layers=params['hidden_layer'],
        hidden_dim=params['hidden_dim'],
        lr_model=params['lr_model'],
        lr_logz=params['lr_logz'],
        device = 'cpu'
    )

    # add state at timestep 0 to final trajectories and flows
    session.final_trajectories =[session.model.inference(
        session.env,
        batch_size=trajectory_max,
        trajectory_length=params['trajectory_length']
    )[:,:,1:], ]
    with torch.no_grad():
        session.final_flows = [session.model.forward_model(vectorgrid)[:,:-1], ]


    # set up off policy schedule beforehand, as training is interrupted for visualizations
    if params['off_policy']:
        off_policy = torch.linspace(params['off_policy'], 0, params['n_iterations'])
    else:
        off_policy = [None]*params['n_iterations']

    # start training
    n_updates = params['n_iterations']//train_interval
    for v in range(n_updates):

        if session.training_state["stop_requested"]:
            break

        losses, trajectory = session.model.train(
            session.env,
            batch_size=params['batch_size'],
            trajectory_length=params['trajectory_length'],
            n_iterations=train_interval,
            off_policy=off_policy[v*train_interval:(v+1)*train_interval],
            loss_fn=params["loss_choice"],
            collect_trajectories=trajectory_max,
            progress_bar=False,
        )

        # keep only x and y of last state of trajectory
        #states = trajectory[:, -1, 1:]

        # update current trajectories (for showing in traininghistory) and current states (for live updates)
        # trajectory shape: (batch, trajectory_length+1, 3)
        # current trajectories shape (trajectory_max, trajectory_length+1, 2)
        if current_trajectories is not None:
            current_trajectories = torch.cat((current_trajectories, trajectory[:,:,1:]), dim=0)
            if len(current_trajectories) > trajectory_max:
                current_trajectories = current_trajectories[-trajectory_max:,:,:]
        else:
            current_trajectories = trajectory[:,:,1:]

        current_states = current_trajectories[:,-1,:]

        # To get final data with 32 timesteps
        # if training gets interrupted add last state
        if (v+1) % (n_updates // 32) == 0 or session.training_state["stop_requested"]:
            # to ensure consistent batch sizes and always new trajectories
            if len(current_trajectories) != trajectory_max:
                session.final_trajectories.append(session.model.inference(
                    session.env,
                    batch_size=trajectory_max,
                    trajectory_length=params['trajectory_length']
                )[:, :, 1:])
            else:
                # to save unneccesary computations
                session.final_trajectories.append(current_trajectories)
            with torch.no_grad():
                session.final_flows.append(session.model.forward_model(vectorgrid)[:,:-1])

        # update training state so frontend can fetch new data
        session.training_state["states"] = current_states.tolist()
        session.training_state["losses"]={
            "losses": session.training_state["losses"]["losses"] + losses[0],
            "logzs": session.training_state["losses"]["logzs"] + losses[1],
            "truelogz": losses[2],
            "n_iterations": params['n_iterations'],
        }


    # done
    session.training_state["running"] = False
    if session.training_state["stop_requested"]:
        print("Visualization stopped by user.")


# Utility functions

def calc_vectorgrid(grid_size, trajectory_length):
    # get vectorgrid for flow calculations
    x = torch.linspace(-3, 3, grid_size)
    y = torch.linspace(-3, 3, grid_size)
    X, Y = torch.meshgrid(x, y, indexing="xy")
    gridpoints = torch.stack([X.flatten(), Y.flatten()], dim=1)
    timesteps = torch.arange(0, trajectory_length).view(-1, 1, 1)
    states = torch.cat(
        (timesteps.expand(-1, gridpoints.size(0), -1), gridpoints.unsqueeze(0).expand(timesteps.size(0), -1, -1)),
        dim=-1)
    states = states.flatten(0, 1)
    return states

def prepare_final_dump(trajectories, flows):
    # get final trajectories and flows in format expected by frontend
    trajectories_temp = torch.stack(trajectories, dim=0)
    s = trajectories_temp.size()
    flows = torch.stack(flows, dim=0).reshape(s[0], s[2]-1, vectorgrid_size**2, s[3])
    flows_temp = torch.zeros((s[0], s[2], vectorgrid_size**2, s[3]))
    flows_temp[:,1:,:,:] = flows

    #trajectories_temp = trajectories_temp.permute(0, 2, 1, 3)

    data = torch.concatenate((trajectories_temp.flatten(), flows_temp.flatten()), axis=0).cpu().numpy()

    buffer = io.BytesIO()
    buffer.write(data.tobytes())
    buffer.seek(0)
    return buffer

app.mount("/", StaticFiles(directory="./front/public", html=True), name="frontend")