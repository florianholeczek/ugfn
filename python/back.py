"""
Handles the backend for the webserver.
Not neccessary if you use just the python scripts.
"""

from arch import GFlowNet
from env import Env
from plot_utils import grid

import torch
from pydantic import BaseModel
from fastapi import FastAPI, BackgroundTasks
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
torch.set_printoptions(precision=2, sci_mode=False)

app = FastAPI()

env = Env()
model = GFlowNet()
global_trajectory_length =1

# Allow CORS for development purposes
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# set up beginning states.
# training states is the variable which will be fetched by the frontend
start_states = torch.zeros(1,2).tolist()
start_losses = {
    "losses": [],
    "logzs": [],
    "truelogz": [],
    "n_iterations": 0
}
training_state = {
    "running": False,
    "current_image": None,
    "stop_requested": False,
    "states": start_states,
    "losses": start_losses,
}

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
    global training_state
    params = {}
    for k,v in request.dict().items():
        params[k.replace("_value","")]=v

    if training_state["running"]:
        return JSONResponse(status_code=400, content={"error": "Visualization already running."})

    training_state["running"] = True
    training_state["stop_requested"] = False
    training_state["current_image"] = None
    # print(params)

    # Start the training in the background
    background_tasks.add_task(
        train_and_sample,
        params
    )
    return {"status": "Visualization started."}

# updates in the training process via polling
@app.get("/get_training_update")
def get_training_update():
    global training_state
    return {
        "completed": not training_state["running"],
        "image": training_state["current_image"],
        "states": training_state["states"],
        "losses": training_state["losses"],
    }

# when user stops training process
@app.post("/stop_training")
def stop_training():
    global training_state
    # Request stop if a process is running
    if training_state["running"]:
        training_state["stop_requested"] = True
        return {"status": "Stop requested."}
    else:
        return JSONResponse(status_code=400, content={"error": "No training running."})


@app.post("/get_vectorfield")
async def generate_flowfield(request: VectorfieldRequest):
    global model
    global global_trajectory_length
    print(request)
    if training_state["running"]:
        return JSONResponse(status_code=400, content={"error": "Training running."})

    grid_size=request.size
    x = torch.linspace(-3, 3, grid_size)
    y = torch.linspace(-3, 3, grid_size)
    X, Y = torch.meshgrid(x, y, indexing="xy")
    gridpoints = torch.stack([X.flatten(), Y.flatten()], dim=1)
    #model = torch.load("model.pth") #use saved model instead
    states = torch.cat((torch.ones(len(gridpoints),1)*global_trajectory_length, gridpoints), dim=1)
    with torch.no_grad():
        vectors = model.forward_model(states)[:,:-1]
    # convert to pixel coordinates
    vectors = [{"x": float(vectors[i, 0]), "y": float(vectors[i, 1])} for i in range(vectors.shape[0])]
    #vectors = [{"x": 0.2, "y": 0.5}] * request.size * request.size # test flowfield
    print("sending")



    return {"cols":request.size, "rows": request.size, "vectors": vectors}

# train and save samples for visualization
def train_and_sample(
        params: dict,
):
    global training_state
    global start_losses
    global start_states
    global model
    global env
    global global_trajectory_length
    global_trajectory_length = params['trajectory_length']
    training_state["losses"] = start_losses
    training_state["states"] = start_states

    # as the model samples only n=batch size samples in one iteration and we need to update the visualization
    # frequently, we would only have very few samples for each update.
    # To mitigate this, we always keep the last n samples, set via trajectory_max.
    # This is the number of states to send to frontend for visualization,basically batch size for sampling
    trajectory_max = 2048
    train_interval =4 # number of iterations to train before updating states for visualization
    current_states = None
    torch.manual_seed(params['seed'])

    # set up the environment and model
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

    # set up off policy schedule beforehand, as training is interrupted for trainings
    if params['off_policy']:
        off_policy = torch.linspace(params['off_policy'], 0, params['n_iterations'])
    else:
        off_policy = [None]*params['n_iterations']

    # start training
    for v in range(params['n_iterations']//train_interval):

        if training_state["stop_requested"]:
            break

        losses, trajectory = model.train(
            env,
            batch_size=params['batch_size'],
            trajectory_length=params['trajectory_length'],
            n_iterations=train_interval,
            off_policy=off_policy[v*train_interval:(v+1)*train_interval],
            loss_fn=params["loss_choice"],
            collect_trajectories=trajectory_max,
            progress_bar=False,
        )

        # keep only x and y of last state of trajectory
        states = trajectory[:, -1, 1:]

        # update current states
        if current_states is not None:
            current_states = torch.cat((current_states, states), dim=0)
            if len(current_states) > trajectory_max:
                current_states = current_states[-trajectory_max:]
        else:
            current_states = states

        # update training state so frontend can fetch new data
        training_state["states"] = current_states.tolist()
        training_state["losses"]={
            "losses": training_state["losses"]["losses"] + losses[0],
            "logzs": training_state["losses"]["logzs"] + losses[1],
            "truelogz": training_state["losses"]["truelogz"] + ([losses[2]]*len(losses[0])),
            "n_iterations": params['n_iterations'],
        }


    # done
    training_state["running"] = False
    if training_state["stop_requested"]:
        print("Visualization stopped by user.")

