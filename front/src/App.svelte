<script>
  let rand = -1;
  let off_policy_value = 0;
  let n_iterations_value = 2000;
  let lr_model_value = 0.001;
  let lr_logz_value = 0.1;
  let visualize_every = 50;

  //polling every n ms
  const POLLING_INTERVAL = 1000;
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

<div class="controls">
  <label>
    Off Policy Value: {off_policy_value}
    <input
      class="slider"
      type="range"
      min="0"
      max="10"
      step="0.1"
      bind:value={off_policy_value}
      disabled={isRunning} />
  </label>

  <label>
    N Iterations Value: {n_iterations_value}
    <input
      class="slider"
      type="range"
      min="1"
      max="10"
      step="1"
      bind:value={n_iterations_value}
      disabled={isRunning} />
  </label>

  <button on:click={isRunning ? stopVisualization : startVisualization}>
    {isRunning ? 'Stop' : 'Start'}
  </button>
</div>

<div class="visualization">
  {#if currentImage}
    <img src={currentImage} alt="Visualization" />
  {:else if isRunning}
    <p>Loading visualization...</p>
  {/if}
</div>

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