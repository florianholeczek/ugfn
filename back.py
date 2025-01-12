from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.responses import RedirectResponse
import random
import numpy as np
import plotly.tools as tools
import plotly.graph_objects as go
import matplotlib.pyplot as plt
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

app.mount("/front", StaticFiles(directory="front/public", html=True), name="front")
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
