<script>
  let rand = -1;
  let off_policy_value = 0;
  let n_iterations_value = 2000;
  let lr_model_value = 0.001;
  let lr_logz_value = 0.1;
  let visualize_every = 50;
  let trajectory_length_value = 2;
  let hidden_layer_value = 2;
  let hidden_dim_value = 2;
  let seed_value = 7614;
  let batch_size_exponent = 6;
  $: batch_size_value = 2**batch_size_exponent;


  //polling every n ms
  const POLLING_INTERVAL = 500;
  let isRunning = false;
  let currentImage = null;
  let pollingTimer;

  function getRand() {
      fetch("http://0.0.0.0:8000/rand")
      .then(d => d.text())
      .then(d => (rand = d));
      }

  function resetSliders() {
      off_policy_value = 0;
      n_iterations_value = 2000;
      lr_model_value = 0.001;
      lr_logz_value = 0.1;
      visualize_every = 50;
      trajectory_length_value = 2;
      hidden_layer_value = 2;
      hidden_dim_value = 2;
      seed_value = 7614;
      batch_size_exponent = 6;
  }

  async function startVisualization() {
    try {
      // Disable sliders and switch button state
      isRunning = true;

      // Start visualization on backend
      const response = await fetch('http://localhost:8000/start_visualization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          off_policy_value,
          n_iterations_value,
          lr_model_value,
          lr_logz_value,
          visualize_every,
          trajectory_length_value,
          hidden_layer_value,
          hidden_dim_value,
          seed_value,
          batch_size_value,
        })
      });

      if (!response.ok) {
        throw new Error('Failed to start visualization.');
      }

      // Start polling for visualizations
      pollVisualization();
    } catch (error) {
      console.error(error);
      isRunning = false;
    }
  }

  async function stopVisualization() {
    try {
      // Stop visualization on backend
      const response = await fetch('http://localhost:8000/stop_visualization', {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error('Failed to stop visualization.');
      }

      // Stop polling and reset button state
      clearInterval(pollingTimer);
      isRunning = false;
    } catch (error) {
      console.error(error);
    }
  }

  function pollVisualization() {
    pollingTimer = setInterval(async () => {
      try {
        const response = await fetch('http://localhost:8000/get_visualization');
        if (!response.ok) {
          throw new Error('Failed to fetch visualization.');
        }

        const data = await response.json();

        if (data.image) {
          currentImage = `data:image/png;base64,${data.image}`;
        }
        if (data.completed) {
          console.log("Visualization process completed.");
          isRunning = false; // Update the UI state to reflect the stopped process
          clearInterval(pollingTimer); // Stop the polling
          return; // Stop polling
        }
      } catch (error) {
        console.error(error);
      }
    }, POLLING_INTERVAL);
  }
</script>
<main class="main-content">
  <div id="plot-container" style="width: 100%; height: 100%;"></div>
  <header class="header">
    <div class="container">
      <h1 class="title">Understanding GFlowNets</h1>
      <p class="subtitle">Gaining intuition for Generative Flow Networks and how to train them</p>
    </div>
  </header>

  <section class="section">
    <h2 class="section-title">What is a GFlowNet?</h2>
    <p class="section-text">
      Short Description: What can they do, how do they work, advantages
    </p>

    <h2 class="section-title">Toy Environment</h2>
    <p class="section-text">
      A 2-dimensional multivariate Gaussian environment with two modes. GFlowNet
      takes steps in the x or y direction, and rewards are calculated based on the mixture of
      Gaussians.
    </p>
    <ul class="bullet-list">
      <li>Variable sequence length is typically supported, but fixed here for simplicity.</li>
      <li>State does not depend on the order of steps.</li>
      <li>Added a counter to avoid circular paths in the graph.</li>
    </ul>
    <div class="image-container">
      <img src="/images/env1.png" class="image" alt="Rendering of the environment">
    </div>
  </section>

  <section class="section section-light">
    <h2 class="section-title">Training</h2>
    <p class="section-text">
      Visualizing how GFlowNet samples from the underlying distribution.
      -> Learns full distribution given enough compute
      TODO: Add slider over training iterations to visualizations to add interactivity and see training progress
    </p>
    <div class="image-container">
      <img src="/images/run1.png" class="image" alt="GFN samples from the underlying distribution">
    </div>

    <h2 class="section-title">Mode Collapse</h2>
    <p class="section-text">
      If there is little probability mass between modes, we see mode collapse.
    </p>
    <div class="image-container">
      <img src="/images/run2.png" class="image" alt="Low variance leads to sampling from one mode">
    </div>
    <p class="section-text">
      Training off-policy mitigates this issue.
      We added variance to each step -> more exploring
    </p>
    <div class="image-container">
      <img src="/images/run3.png" class="image" alt="Off-policy training helps">
    </div>
  </section>

  <section class="section">
    <h2 class="section-title">Flow</h2>
    <p class="section-text">
      Visualize flow between states. Probably interactive:
      Hovering over env and displaying flow in 8 directions with arrows.
      Probably need to discretize for this?
    </p>
  </section>

  <section class="playground">
    <div class="container">
      <h1 class="title">Playground</h1>
      <p class="subtitle">
        Change the environment and train your own GFlowNet to get a feeling on how they work.
      </p>
    </div>
  </section>

  <section class="section-light">
    <p class="section-text">
      change env (up to 4 gaussians, change their mean and var by dragging and scaling on the image)
    </p>
    <div class="image-container">
      <img src="/images/env1.png" class="image" alt="Rendering of the environment">
    </div>

    <p class="section-text">
      change training settings and start training (visualize training by sampling every n steps),
      all interactivty deactivated while training, add stop button.
    </p>
    <div class="buttonscontainer">
      <button class="reset-button" on:click="{resetSliders}" disabled="{isRunning}">Reset</button>
      <button class="reset-button" on:click="{isRunning ? stopVisualization : startVisualization}">
        {isRunning ? 'Stop' : 'Start'}</button>
    </div>
    <div class="slider-container">
      <div class="slider">
        <label for="off_policy">Off-policy</label>
        <input
          type="range"
          min="0"
          max="3"
          step="0.1"
          bind:value="{off_policy_value}"
          id="off_policy"
          disabled={isRunning}
        />
        <span>{off_policy_value}</span>
      </div>
      <div class="slider">
        <label for="n_iterations">Iterations to train</label>
        <input
          type="range"
          min="100"
          max="10000"
          step="10"
          bind:value="{n_iterations_value}"
          id="n_iterations"
          disabled={isRunning}
        />
        <span>{n_iterations_value}</span>
      </div>
      <div class="slider">
        <label for="lr_model">Learning rate of the model</label>
        <input
          type="range"
          min="0.0001"
          max="0.1"
          step="0.0001"
          bind:value="{lr_model_value}"
          id="lr_model"
          disabled={isRunning}
        />
        <span>{lr_model_value.toFixed(4)}</span>
      </div>
      <div class="slider">
        <label for="lr_logz">Learning rate of LogZ</label>
        <input
          type="range"
          min="0.001"
          max="0.3"
          step="0.001"
          bind:value="{lr_logz_value}"
          id="lr_logz"
          disabled={isRunning}
        />
        <span>{lr_logz_value.toFixed(3)}</span>
      </div>
      <div class="slider">
        <label for="trajectory_length">Length of trajectory</label>
        <input
          type="range"
          min="1"
          max="8"
          step="1"
          bind:value="{trajectory_length_value}"
          id="trajectory_lenght"
          disabled={isRunning}
        />
        <span>{trajectory_length_value}</span>
      </div>
      <div class="slider">
        <label for="hidden_layer">Number of hidden layers</label>
        <input
          type="range"
          min="1"
          max="8"
          step="1"
          bind:value="{hidden_layer_value}"
          id="hidden_layer"
          disabled={isRunning}
        />
        <span>{hidden_layer_value}</span>
      </div>
      <div class="slider">
        <label for="seed">Seed for the Run</label>
        <input
          type="range"
          min="0"
          max="9999"
          step="1"
          bind:value="{seed_value}"
          id="seed"
          disabled={isRunning}
        />
        <span>{seed_value}</span>
      </div>
      <div class="slider">
        <label for="batch_size">Training batch size</label>
        <input
          type="range"
          min="3"
          max="11"
          step="1"
          bind:value="{batch_size_exponent}"
          id="batch_size"
          disabled={isRunning}
        />
        <span>{batch_size_value}</span>
      </div>
    <div class="slider">
        <label for="vis_every">Update visualization every n interations</label>
        <input
          type="range"
          min="10"
          max="500"
          step="10"
          bind:value="{visualize_every}"
          id="vis_every"
          disabled={isRunning}
        />
        <span>{visualize_every}</span>
      </div>
    </div>
    <div class="visualization">
      {#if currentImage}
        <img src={currentImage} alt="Visualization" />
      {:else if isRunning}
        <p>Loading visualization...</p>
      {/if}
    </div>


    <!--
    <h1>Hello {rand}!</h1>
    <button on:click={getRand}>Get a random number</button>
    <p class="section-text">
      Testing: {resp}
    </p>
    -->

  </section>

  <section class="section">
    <h2 class="section-title">Sources</h2>
    <p class="section-text">
      Add sources
    </p>
  </section>
</main>




<style>
  /* General Styles */
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  body {
    font-family: 'Arial', sans-serif;
    background-color: #f7fafc;
    color: #333;
  }

  .container {
    width: 90%;
    margin: 0 auto;
    max-width: 1200px;
  }

  /* Header */
  .header {
    background: linear-gradient(90deg, #32263d, #3e412d);
    color: white;
    padding: 3rem 0;
    text-align: center;
  }

  .title {
    font-size: 3rem;
    font-weight: 700;
  }

  .subtitle {
    font-size: 1.25rem;
    margin-top: 1rem;
  }

  /* Section */
  .section {
    padding: 3rem 0;
  }

  .section-light {
    background-color: #f8f8f0;
  }

  .section-title {
    font-size: 2rem;
    font-weight: 600;
    color: #24291e;
    margin-bottom: 1rem;
  }

  .section-text {
    font-size: 1rem;
    line-height: 1.6;
    color: #191913;
    margin-bottom: 1.5rem;
  }

  .bullet-list {
    list-style-type: disc;
    margin-left: 20px;
    margin-bottom: 2rem;
  }

  .image-container {
    display: flex;
    justify-content: center;
    margin-bottom: 2rem;
  }

  .image {
    max-width: 100%;
    width: 50%;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }

  /* Playground Section */
  .playground {
    background: linear-gradient(90deg, #382d48, #582897);
    color: white;
    padding: 4rem 0;
    text-align: center;
  }

  .cta-button {
    background-color: #70229d;
    color: white;
    padding: 1rem 2rem;
    font-size: 1.25rem;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    transition: background-color 0.3s;
  }

  .cta-button:hover {
    background-color: #511a74;
  }

  /* Responsiveness */
  @media (max-width: 768px) {
    .title {
      font-size: 2.5rem;
    }

    .subtitle {
      font-size: 1rem;
    }

    .section-title {
      font-size: 1.5rem;
    }

    .image {
      width: 80%;
    }

    .cta-button {
      font-size: 1rem;
    }
  }

  @media (max-width: 480px) {
    .title {
      font-size: 2rem;
    }

    .subtitle {
      font-size: 0.875rem;
    }

    .section-title {
      font-size: 1.25rem;
    }

    .image {
      width: 100%;
    }
  }

  .slider-container {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
    margin-left: 1rem;
}

  .buttonscontainer {
  display: flex;
  flex-direction: row;
  align-items: normal;
  gap: 70px;
}

.slider {
  display: flex;
  align-items: center;
  gap: 10px;
}

label {
  width: 150px; /* Adjust width as needed */
  text-align: right;
  color: black;
}

input[type="range"] {
  flex: 1;
}

span {
  width: 50px; /* Adjust width as needed */
  text-align: center;
  color: black;
}
.reset-button {
    background-color: #cecb7e;
    color: #000000;
    padding: 0.5rem 1.5rem;
    font-size: 1rem;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    margin-top: 1rem;
    margin-left: 1rem;
    transition: background-color 0.3s;
  }

  .reset-button:hover {
    background-color: #97994d;
  }
  .controls {
    margin-bottom: 20px;
  }

  .slider {
    margin: 10px 0;
  }

  .visualization {
    margin-top: 20px;
    text-align: center;
  }

  img {
    max-width: 100%;
    height: auto;
  }

</style>