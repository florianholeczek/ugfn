from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.responses import RedirectResponse
import random
import numpy as np
import plotly.tools as tools
import plotly.graph_objects as go
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse


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

class VisualizationRequest(BaseModel):
    off_policy_value: float
    n_iterations_value: float
    lr_model_value: float
    lr_logz_value: float
    visualize_every: int

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
    off_policy_value = request.off_policy_value
    n_iterations_value = int(request.n_iterations_value)
    lr_model_value = request.lr_model_value
    lr_logz_value = request.lr_logz_value
    visualize_every = int(request.visualize_every)

    # Check if a process is already running
    if visualization_state["running"]:
        return JSONResponse(status_code=400, content={"error": "Visualization already running."})

    # Reset state
    visualization_state["running"] = True
    visualization_state["stop_requested"] = False
    visualization_state["current_image"] = None

    # Start the visualization in the background
    background_tasks.add_task(visualize, off_policy_value, n_iterations_value)
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




"""
@app.get("/rand")
async def hello():
   return random.randint(0, 100)

@app.get('/')
async def front():
   return RedirectResponse(url='front')
app.mount("/front", StaticFiles(directory="front/public", html=True), name="front")
app.mount("/build", StaticFiles(directory="front/public/build"), name="build")"""