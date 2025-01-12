from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.responses import RedirectResponse
import random
import numpy as np
import plotly.tools as tools
import plotly.graph_objects as go
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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

    # Mark process as completed
    visualization_state["running"] = False


@app.post("/start_visualization")
def start_visualization(off_policy_value: float, n_iterations_value: int, background_tasks: BackgroundTasks):
    global visualization_state

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

    # Return the current image if available
    if visualization_state["current_image"]:
        return {"image": visualization_state["current_image"]}
    else:
        return {"image": None}


@app.post("/stop_visualization")
def stop_visualization():
    global visualization_state

    # Request stop if a process is running
    if visualization_state["running"]:
        visualization_state["stop_requested"] = True
        return {"status": "Stop requested."}
    else:
        return JSONResponse(status_code=400, content={"error": "No visualization running."})


"""app.mount("/front", StaticFiles(directory="front/public", html=True), name="front")
app.mount("/build", StaticFiles(directory="front/public/build"), name="build")

# CORS settings to allow requests from the Svelte frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Replace with your frontend's URL in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/plot")
async def get_plot():
   # Create a Matplotlib figure
   fig, ax = plt.subplots()
   ax.plot([0, 1, 2], [0, 1, 4], label="Line")
   ax.set_title("Example Plot")
   ax.set_xlabel("X-axis")
   ax.set_ylabel("Y-axis")
   ax.legend()

   # Convert Matplotlib figure to Plotly figure
   plotly_fig = tools.mpl_to_plotly(fig)

   # Convert the Plotly figure to a JSON-serializable dictionary
   plotly_json = plotly_fig.to_plotly_json()
   return JSONResponse(content=plotly_json)

@app.get("/rand")
async def hello():
   return random.randint(0, 100)

@app.get('/')
async def front():
   return RedirectResponse(url='front')

@app.post("/train_params")
async def receive_train_params(train_params):
    print(f"Received slider values: {train_params}")
    return "Trulla"
"""