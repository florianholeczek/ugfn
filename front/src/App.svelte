<script>
  import { onMount } from 'svelte';
  import {writable} from 'svelte/store';
  import Katex from 'svelte-katex'
  import 'katex/dist/katex.min.css';
  import { CollapsibleCard } from 'svelte-collapsible'

  // default values
  let off_policy_value = 0;
  let n_iterations_value = 2000;
  let lr_model_value = 0.005;
  let lr_logz_value = 0.1;
  let trajectory_length_value = 2;
  let hidden_layer_value = 2;
  let hidden_dim_value = 64;
  let seed_value = 42;
  let batch_size_exponent = 5;
  $: batch_size_value = 2**batch_size_exponent;


  //polling every n ms
  const POLLING_INTERVAL = 200;
  let isRunning = false;
  let currentImage = null;
  let pollingTimer;

  // storing gaussians
  const gaussians = writable([
    { mean: { x: -1, y: -1 }, variance: 0.2 },
    { mean: { x: 1, y: 1 }, variance: 0.2 }
  ]);

  // ranges for means and variances
  const range = { min: -3, max: 3 };
  const varianceRange = { min: 0.1, max: 1.0 };

  // Gaussian tracking
  let selectedGaussian = null; // Tracks the currently selected Gaussian
  let hoveredGaussian = null; // Tracks the Gaussian to be highlighted for deletion
  const highlightGaussian = (index) => {
    hoveredGaussian = index;
  };
  const clearHighlight = () => {
    hoveredGaussian = null;
  };

  // Mouse interaction handlers
  let isDraggingMean = false;
  let isDraggingVariance = false;
  let initialMouse = { x: 0, y: 0 };

  // Utility functions
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  function resetSliders() {
      off_policy_value = 0;
      n_iterations_value = 2000;
      lr_model_value = 0.001;
      lr_logz_value = 0.1;
      trajectory_length_value = 2;
      hidden_layer_value = 2;
      hidden_dim_value = 64;
      seed_value = 7614;
      batch_size_exponent = 6;
  }

  let Plotly; // Load Plotly from CDN
  async function loadPlotly() {
    const script = document.createElement('script');
    script.src = 'https://cdn.plot.ly/plotly-latest.min.js';
    document.head.appendChild(script);

    return new Promise((resolve) => {
      script.onload = () => {
        Plotly = window.Plotly;
        resolve();
      };
    });
  }


  // Functions used to start, stop and update the training process
  async function startVisualization() {
    try {
      // Disable sliders and switch button state
      isRunning = true;
      const curr_gaussians = $gaussians;
      // Start visualization on backend
      const response = await fetch('http://localhost:8000/start_visualization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          off_policy_value,
          n_iterations_value,
          lr_model_value,
          lr_logz_value,
          trajectory_length_value,
          hidden_layer_value,
          hidden_dim_value,
          seed_value,
          batch_size_value,
          curr_gaussians,
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
      const response = await fetch('http://localhost:8000/stop_visualization',{
        method: 'POST',
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

  // Functions for setting the environment
  const addGaussian = () => {
    gaussians.update(gs => {
      if (gs.length < 4) {
        gs.push({ mean: { x: 0, y: 0 }, variance: 0.5 });
      }
      return gs;
    });
    plotEnvironment(plotContainerId, $gaussians, {
        gridSize: 100,
        alpha2D: 1.0,
        alpha3D: 0.8,
        levels: 50,
      });
    plotEnvironment(plotContainerId2, $gaussians, {
        gridSize: 100,
        alpha2D: 1.0,
        alpha3D: 0.8,
        levels: 50,
      });
  };

  const removeGaussian = () => {
    gaussians.update(gs => {
      if (gs.length > 1) {
        gs.pop();
      }
      return gs;
    });
    plotEnvironment(plotContainerId, $gaussians, {
        gridSize: 100,
        alpha2D: 1.0,
        alpha3D: 0.8,
        levels: 50,
      });
    plotEnvironment(plotContainerId2, $gaussians, {
        gridSize: 100,
        alpha2D: 1.0,
        alpha3D: 0.8,
        levels: 50,
      });
  };

  const startDragMean = (event, gaussian) => {
    if (isRunning) return;
    isDraggingMean = true;
    selectedGaussian = gaussian;
    initialMouse = { x: event.clientX, y: event.clientY };
  };

  const startDragVariance = (event, gaussian) => {
    if (isRunning) return;
    isDraggingVariance = true;
    selectedGaussian = gaussian;
    initialMouse = { x: event.clientX, y: event.clientY };
  };

  const handleMouseMove = (event) => {
    if (!selectedGaussian || isRunning) return;

    const dx = (event.clientX - initialMouse.x) / 100;
    const dy = (event.clientY - initialMouse.y) / 100;

    gaussians.update(gs => {
      const g = gs.find(g => g === selectedGaussian);

      if (isDraggingMean && g) {
        g.mean.x = clamp(g.mean.x + dx, range.min, range.max);
        g.mean.y = clamp(g.mean.y - dy, range.min, range.max);
      } else if (isDraggingVariance && g) {
        const newVariance = g.variance + dx;
        g.variance = clamp(newVariance, varianceRange.min, varianceRange.max);
      }

      return gs;
    });

    initialMouse = { x: event.clientX, y: event.clientY };
  };

  const stopDrag = () => {
    if(isDraggingMean || isDraggingVariance){
      console.log($gaussians);
      plotEnvironment(plotContainerId, $gaussians, {
        gridSize: 100,
        alpha2D: 1.0,
        alpha3D: 0.8,
        levels: 50,
      });
      plotEnvironment(plotContainerId2, $gaussians, {
        gridSize: 100,
        alpha2D: 1.0,
        alpha3D: 0.8,
        levels: 50,
      });
    }

    isDraggingMean = false;
    isDraggingVariance = false;
    selectedGaussian = null;
  };

  // functions for computing the reward and visualizing the Environment

  // calculate reward
  function gaussianPDF(x, y, mean, variance) {
    const dx = x - mean.x;
    const dy = y - mean.y;
    const sigma2 = variance;
    return Math.exp(-(dx ** 2 + dy ** 2) / (2 * sigma2)) / (2 * Math.PI * Math.sqrt(sigma2));
  }

  // Density (reward for whole grid)
  function computeDensity(grid, gaussians) {
    const { x, y } = grid;
    const density = Array.from({ length: x.length }, () => Array(y.length).fill(0));

    for (const { mean, variance } of gaussians) {
      for (let i = 0; i < x.length; i++) {
        for (let j = 0; j < y.length; j++) {
          density[j][i] += gaussianPDF(x[i], y[j], mean, variance);
        }
      }
    }
    return density;
  }
  function plotEnvironment(containerId, gaussians, options = {}) {
    const gridSize = options.gridSize || 100;
    const alpha2D = options.alpha2D || 1.0;
    const alpha3D = options.alpha3D || 0.8;

    // Generate grid
    const range = [-3, 3];
    const x = Array.from({ length: gridSize }, (_, i) => range[0] + i * (range[1] - range[0]) / (gridSize - 1));
    const y = Array.from({ length: gridSize }, (_, i) => range[0] + i * (range[1] - range[0]) / (gridSize - 1));

    const density = computeDensity({ x, y }, gaussians);

    // 2D plot data
    const contourData = {
      x: x,
      y: y,
      z: density,
      type: "contour",
      colorscale: "Viridis",
      opacity: alpha2D,
      contours: { coloring: "fill", showlines: false },
      colorbar: { len: 0.8, x: 0.45, thickness: 20 }, // Position shared colorbar in the middle
    };

    // 3D plot data
    const surfaceData = {
      x: x,
      y: y,
      z: density,
      type: "surface",
      colorscale: "Viridis",
      opacity: alpha3D,
      showscale: false, // Disable individual colorbar
    };

    const layout = {
      title: options.title || null,
      grid: { rows: 1, columns: 2, pattern: "independent" },
      xaxis: { title: "x", domain: [0, 0.45] }, // Left plot domain
      yaxis: { title: "y", scaleanchor: "x" },
      scene: { domain: { x: [0.55, 1] } }, // Right plot domain for 3D scene
      margin: { t: 50, b: 50, l: 50, r: 50 },
    };

    const config = {
      staticplot: true,
      displayModeBar: false, // Hide toolbar
    };

    Plotly.newPlot(containerId, [contourData, surfaceData], layout, config);
  }

  let plotContainerId = "plot-container";
  let plotContainerId2 = "plot-container2";

  // Mounting
  onMount(async () => {
    //visualize the environment
    await loadPlotly();
    plotEnvironment(plotContainerId, $gaussians, {
        title: null,
        gridSize: 100,
        alpha2D: 1.0,
        alpha3D: 0.8,
        levels: 50,
      });
    plotEnvironment(plotContainerId2, $gaussians, {
        title: null,
        gridSize: 100,
        alpha2D: 1.0,
        alpha3D: 0.8,
        levels: 50,
      });

    // add listeners for changing the Environment
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopDrag);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopDrag);
    };
  });
  let open = false



</script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.15.2/dist/katex.min.css" integrity="sha384-MlJdn/WNKDGXveldHDdyRP1R4CTHr3FeuDNfhsLPYrq2t0UBkUdK2jyTnXPEK1NQ" crossorigin="anonymous">




<main class="main-content">
  <header class="header-top">
    <div class="container">
      <h1 class="title">Understanding GFlowNets</h1>
      <p class="subtitle">Gaining intuition for Generative Flow Networks and how to train them</p>
    </div>
  </header>

  <section class="section">
    <h2 class="section-title">What is a GFlowNet?</h2>
    <p class="section-text">

      In short, a generative flow network is a model class which allows sampling from an arbitrary probability distribution (similar to MCMC). GFlowNets allow for generating objects with sequentially built compositional structure like trees or graphs.

      <br>We train a model to learn a distribution <Katex>\pi(x)</Katex> (our policy), so we can sample from it. For this, we need a reward function R(x) which assigns value to each final object x and we want <Katex>\pi(x)</Katex> to sample proportional to it:  <Katex>\pi(x) \propto R(x)</Katex>. This allows us later on to sample a diversity of solutions instead of just the reward-maximizing one.

      <br>As we do not rely on a external dataset but only on our internal reward function we are only limited by compute - we can generate objects and query the reward function as often as we like.

      <CollapsibleCard {open}>
        <h2 slot='header' class='collapsible-header'>
          Example (And more introduction)
        </h2>
        <p slot='body' class='collapsible-body'>
        Imagine building a Lego Pyramid. There are different blocks, and you can place them rotated and at different places.
        <br>You might start with an empty plane and add a 2x4 block and so on. After some steps you might end up with an object which is more or less pyramid-shaped.
        <br>
        <br>The different possibilities of states of the object form a graph: While in the beginning (state 0) you can only place something in the first level, later on you might have different options, and they depend on your first choices. One option is always to choose to be finished instead of continuing building.
        <br>
        <br>If you want to use a GFlowNet for your task, it is important that the resulting graph is acyclic, i.e. it is not possible to reach a previous state.
        <br>If we built a pyramid, in the end we have a trajectory (a sequence of states <Katex>s_0 \to s_1 \to ... \to s_{"final"}</Katex>). As we can choose to stop anytime, our trajectories can have different lengts, e.g. we can build a pyramid from 1 piece or from 100.
        <br>
        <br>As you might have guessed from the vocabulary, GFlowNets are very similar to Reinforcement learning methods, we sample trajectories and assign a reward R(x) to them (or to the states). The main difference is that usual RL methods try to find solutions which maximize the reward, whereas GFlowNets learn the underlying distribution p(x). So we want to train a model such that p(x) is proportional to the reward function R(x). This allows us to sample not only from the mode which has the highest reward, but also all other modes which might be almost as good. Imagine a pyramid from two 2x4 blocks next to each other and a 2x2 block centered on top or we could just use 2x2 blocks. Both are valid and we might be interested in finding many possible ways to build pyramids.
        <br>
        <br>Building Lego Pyramids is maybe not usecase number one for GFlowNets, but they are used for is drug discovery (Nica et al., 2022), where sampling from multiple modes is really what you want in order to discover not only the most promising molecule.
        </p>
      </CollapsibleCard>

      When sequentially generating an object, we need to take actions which give us the next state:
      We could add one of the possible components or decide we are done.
      For this we use a neural net which represents our forward policy
      <Katex>
        P_F(s_{"{t+1}"}|s_t)
      </Katex>, it gives us the action which leads to the next state.
      <br>
      <br>So far, everything sounds very nice, but how do we achieve this?
      <br>Thats where the Flows come into play.
      <br>
      <br>If you connect all possible states from the start state to the terminal states you get a directed graph.
      If you want to use a GFlowNet for your task it is important that the graph is acyclic, i.e. it is not possible to reach a previous state.
      We can now interpret this directed acyclic graph (DAG) as a flow network.
      <br>Imagine water flowing from the start space through the intermediate states to the final states, following the edges of the DAG like pipes.
      <br>
    </p>
      <div class="image-container">
        <img src="/images/gflownet_anim.gif" class="image" alt="A visualization of the flow through the DAG">
      </div>
    <p class="section-text">
      <span class="mathexpl">Visualization from the GFlowNet Tutorial by MILA showing the flow from the start state to the terminal states as particles</span>

      <br>This places an important constraint on our model: Preservation of Flow.
      The pipes (edges) and states (nodes) must not be leaky, all of the water has to be preserved.
      <br>This means:
      <br>

      <span class="li">The flow going into the DAG (Flow of the start state) is the same as the Flow going out of it (Sum of the flow of all terminal states).</span>
      <span class="li">Same for the nodes: The sum of the flow going into a state is the same as the sum of the flow going out of it.</span>
      <br>
      We now can set the flow going out of a terminal state equal to it's reward.
      Assuming all flow is stricly positivy, we can express the Flow from one state s to its children s' as:


      <Katex displayMode>
        \sum_{"{s'}"} F(s,s') = \sum_{"{s'}"} R(s') + F(s')
      </Katex>
      <span class="mathexpl">The total Flow of a state is the Reward of its terminal children plus the Flow of its non-terminal children</span>


      We now define our forward policy as the proportion of the Flow s -> s' to the total Flow of s:
      <Katex displayMode>
      P_F(s'|s) = \frac{"{F(s,s')}{F(s)}"}
      </Katex>
      <span class="mathexpl"> The probability to sample an action to get to the next state s' is the flow going from s to s' divided by the total flow through s</span>
      By using this policy we will sample finished objects x proportional to its reward.

      <br>The only thing we miss for training is the loss. The easiest way would be to turn our flow matching constraint into a MSE:

      <Katex displayMode>
        \mathcal{"{L}"}_{"{FM}"} = \left( \log \frac{"{\\sum_{(s''\\to s)}F(s'',s)}"}{"{\\sum_{(s\\to s')}F(s,s')}"} \right)^2
      </Katex>
      <span class="mathexpl"> If the flow going into a state is equal to the flow going out of a state the loss goes to 0.</span>

      This is actually what the authors did in the first paper (Benigo et al., 2021), however it does not perform so well as there are problems with credit assignment.
      We will later use the Trajectory Balance Loss (Malkin et al., 2022) to calculate the loss for a whole trajectory instead of single states.
      It converges better but is a bit more complicated, so let's ignore it for now and look at our environment.

    </p>


    <h2 class="section-title">Toy Environment</h2>
    <p class="section-text">
      As we want to train GFlowNets quickly to explore how they behave, we need a simple environment which allows for exploring without needing a lot of compute during training. Here we use a simple 2D grid with each variable in the range [-3,3]. We then calculate the reward according to the Mixture of Multivariate Gaussians (for now two of them).
      <br>
      <br>For each action, the GFlowNet takes a step along both the x and y direction, this is repeated until the defined length of a trajectory is reached. Note that this is unusual: GFlowNets allow for variable trajectory lengths, so the action space usually contains an additional end of sequence action, where the current state becomes the final state.
      <br>
      <br>Above we stated that GFlowNets build an Acyclic Graph, so each state can only be visited once. We currently violate this assumption: While it is unlikely that a state gets visited twice in our continuous environment, it is still possible. To mitigate this we simply include a counter in our state which represents the current step.

    </section>
    <div class="env-container">
        <!--<img src="/images/env1.png" class="env-image" alt="Rendering of the environment">-->
        <div id={plotContainerId2}
         style="width: 1000px;
         position: relative;
         top: 0;
         left: 0;
         z-index: 1; /* Ensure the image is below the canvas */">
        </div>
        <div class="canvas-container">
          {#each $gaussians as g, i}
            <!-- Variance circle -->
            <div
              class="variance-circle"
              class:highlight={i === hoveredGaussian || isRunning}
              style="
                width: {129 * g.variance}px;
                height: {129 * g.variance}px;
                left: {176 + 176/3 * g.mean.x}px;
                top: {176 - 176/3 * g.mean.y}px;
              "
              on:mousedown={(e) => startDragVariance(e, g)}
            ></div>

            <!-- Mean circle -->
            <div
              class="mean-circle"
              class:highlight={i === hoveredGaussian}
              style="
                left: {176 + 176/3 * g.mean.x}px;
                top: {176 - 176/3 * g.mean.y}px;
              "
              on:mousedown={(e) => startDragMean(e, g)}
            ></div>
          {/each}
        </div>
      </div>

      <div class="controls">
        Number of Gaussians:
        <button
          on:mouseover={() => highlightGaussian($gaussians.length - 1)}
          on:mouseout={clearHighlight}
          on:click={removeGaussian}
          disabled={isRunning || $gaussians.length === 1}
        >
          -
        </button>
        <span>{$gaussians.length}</span>
        <button on:click={addGaussian} disabled={isRunning || $gaussians.length === 4}>+</button>
      </div>

  <section class="section section-light">
    <h2 class="section-title">Training</h2>
    <p class="section-text">
      Now, how do we train a GFlowNet?
      <br>First we need our GFN to be able to act in the environment.
      To do this we let it predict the parameters of a distribution from which we then sample the actions.
      To move, we simply add the actio to the current state to get the next state.
      <br>That was the easy part.
      We now want to train our GFN using Trajectory Balance loss. Here it is again:
      <Katex displayMode>
      L(\tau) = \log\left(\frac{"{Z_{\\theta}\\prod_t P_F(s_{t+1}|s_t;\\theta)}"}{"{R(x)\\prod_t P_B(s_t|s_{t+1}; \\theta)}"} \right)^2
      </Katex>
      <span class="mathexpl">The trajectory balance loss. <br> If both parts of the fraction are equal our loss goes to 0.</span>
      We want the two parts of the fraction to be equal again.
      Simply put, the upper part tells us what fraction of the total flow goes through this trajectory and the lower part tells us what fraction of the reward of the final object x goes through this trajectory.
      <br>Here <Katex>\theta</Katex> are the parameters of our model. They include the parameters of <Katex>P_F, P_B, Z</Katex> and we can update them using the loss above.
      <br>Below you find more detailed background for the parts of the trajectory balance loss as well as the algorithm for training.



      <CollapsibleCard {open}>
        <h2 slot='header' class='collapsible-header'>
          More math
        </h2>
        <p slot='body' class='collapsible-body'>
          Let's look at the parts of this loss function:
          <span class="li">
            <Katex>P_F(s_{"t+1"}|s_t;\theta)</Katex>
            The forward policy. It represents the distribution over the next states (the children) of the current state.
          </span>
          <span class="li">
            <Katex>P_B(s_t|s_{"t+1"};\theta)</Katex>
            The backward policy. Similar to as we defined the forward policy, we can define the backward policy as a distribution over the previous states (the parents) of a state.
            We can also estimate it using a NN (not the same as for the forward policy).
          </span>
          <span class="li">
            <Katex>Z_{"\\theta"}</Katex>
            The partition function. It is equal to the total flow of the system.
            It is another parameter to be learned by our agent and should approach the true partition function given enough training.
            In our case, the true partition function is 2 (the number of gaussians), however it is usually not known.
            The partition function for a mixture of gaussians is the sum of its mixture weights, so always 1 (therefore logZ is 0).
            However we do not compute a real mixture of gaussians here, as we do not use mixture weights but simply sum up over all gaussians.
          </span>
          <span class="li">
            <Katex>R(x)</Katex>
            The reward for the final object x of the trajectory. Note that if we propagate the reward backward using our backward policy, only a small part of it goes through one trajectory, as there are usually many ways to sample x using different trajectories.
          </span>
        </p>
      </CollapsibleCard>
      <CollapsibleCard {open}>
        <h2 slot='header' class='collapsible-header'>
          The algorithm
        </h2>
        <pre slot='body' class='collapsible-body'>
          Input: Reward function (part of the environment), model, hyperparameters
          1. Initialize model parameters for PF, PB, logZ
          2. Repeat for a number of iterations or until convergence:
          3.    Repeat for trajectory length:
          4.        Sample action for current state from PF
          5.        Take step according to action
          6.        Add new state to trajectory
          7.    Calculate reward of final state according to reward function
          8.    Calculate the sum of the log probabilities of all actions of the trajectory for each PF and PB
          9.    Calculate the TB-Loss: (logZ + log probabilities PF - log probabilities PB - log reward)^2
          10.   Update the parameters PF, PB, logZ
        </pre>
      </CollapsibleCard>

      We trained a GFN on this environment for 2000 Iterations.
      Below you see the progress of our GFN during training. While it first samples randomly, it learns to match the true distribution of our environment.


    </p>
    <div class="image-container">
      <img src="/images/run1.png" class="image" alt="GFN samples from the underlying distribution">
    </div>
    <p class="section-text">
      Sampling according to the underlying distribution is one of the big advantages of GFlowNets: Other approaches usually learn to maximize the reward, so they would not sample from both of our modes (or everything in between), but they would find one of them and then just sample from it (especially if one of our modes would be greater than the other). This might be suboptimal e.g. in molecule discovery, where you might not want the most promising molecule, but many different of themmight be interesting.
    </p>

    <h2 class="section-title">Mode Collapse</h2>
    <p class="section-text">
      So far, our distribution to match was very easy. Lets make it more challenging: If we lower the variance, we see the two modes are more seperated.
    </p>
    <div class="image-container">
      <img src="/images/run2.png" class="image" alt="Low variance leads to sampling from one mode">
    </div>
    <p class="section-text">
      Well thats not what we want! Instead of sampling from the true distribution we only sample from one mode, thats what common RL methods do. We can do better!
      <br><br>
      There are two main possibilities to fix this:
      <span class="li">We could introduce a temperature parameter <Katex>\beta</Katex> into our reward function:<Katex>R_{"new"}(x)=R(x)^\beta</Katex>. This would change the "peakyness" of the reward function and we would not sample proportional to the reward function but according to <Katex>/pi(x|\beta) \propto R(x)^\beta</Katex>. It is also possible to use <Katex>\beta</Katex> as a trainable parameter and condition the model on it.</span>
      <span class="li">A similar but simpler way is to just train off-policy. By adding a fixed variance to the logits of the forward policy, we explore more during training. As this is a very easy implementation let's go with this one.</span>
      <CollapsibleCard {open}>
        <h2 slot='header' class='collapsible-header'>
          Changes to the algorithm
        </h2>
        <p slot='body' class='collapsible-body'>
          Training off-policy is even more helpful when we schedule it. We start with more a higher variance and scale it down during training until we reach on-policy training.
          <br>Our new hyperparameter is the initial value for the off policy training, during each step we gradually decrease it until we reach 0.
          <br>
          <br>Important changes:
          <br>Define schedule in the beginning: [start=initial value, stop=0, step=-initial value/number of iterations\]
          <br>When sampling the actions we compute the logits as usual.
          <br>Instead of just defining the policy distribution with them, we also define a exploratory distribution by adding the scheduled value to the variance.
          <br>We then sample our actions from the exploratory distribution. We need the policy distribution later to compute the log probabilities of our actions.
          <br>We do not use the scheduled values with the backward policy and during inference.

        </p>
      </CollapsibleCard>
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
      Here you can change the environment.
      Drag the center of the circles to change the mean and the border to change the variance.
      You can also add more Gaussians if you want.
    </p>

    <div class="env-container">
      <!--<img src="/images/env1.png" class="env-image" alt="Rendering of the environment">-->
      <div id={plotContainerId}
       style="width: 1000px;
       position: relative;
       top: 0;
       left: 0;
       z-index: 1; /* Ensure the image is below the canvas */">
      </div>
      <div class="canvas-container">
        {#each $gaussians as g, i}
          <!-- Variance circle -->
          <div
            class="variance-circle"
            class:highlight={i === hoveredGaussian || isRunning}
            style="
              width: {129 * g.variance}px;
              height: {129 * g.variance}px;
              left: {176 + 176/3 * g.mean.x}px;
              top: {176 - 176/3 * g.mean.y}px;
            "
            on:mousedown={(e) => startDragVariance(e, g)}
          ></div>

          <!-- Mean circle -->
          <div
            class="mean-circle"
            class:highlight={i === hoveredGaussian}
            style="
              left: {176 + 176/3 * g.mean.x}px;
              top: {176 - 176/3 * g.mean.y}px;
            "
            on:mousedown={(e) => startDragMean(e, g)}
          ></div>
        {/each}
      </div>
    </div>

    <div class="controls">
      Number of Gaussians:
      <button
        on:mouseover={() => highlightGaussian($gaussians.length - 1)}
        on:mouseout={clearHighlight}
        on:click={removeGaussian}
        disabled={isRunning || $gaussians.length === 1}
      >
        -
      </button>
      <span>{$gaussians.length}</span>
      <button on:click={addGaussian} disabled={isRunning || $gaussians.length === 4}>+</button>
    </div>

    <table>
      <thead>
        <tr>
          <th>Mean X</th>
          <th>Mean Y</th>
          <th>Variance</th>
        </tr>
      </thead>
      <tbody>
        {#each $gaussians as g, _}
          <tr>
            <td>{g.mean.x.toFixed(2)}</td>
            <td>{g.mean.y.toFixed(2)}</td>
            <td>{g.variance.toFixed(2)}</td>
          </tr>
        {/each}
      </tbody>
    </table>

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
          step="1"
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
          max="10"
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
          max="6"
          step="1"
          bind:value="{hidden_layer_value}"
          id="hidden_layer"
          disabled={isRunning}
        />
        <span>{hidden_layer_value}</span>
      </div>
      <div class="slider">
        <label for="hidden_layer">Dimension of hidden layers</label>
        <input
          type="range"
          min="8"
          max="128"
          step="8"
          bind:value="{hidden_dim_value}"
          id="hidden_dim"
          disabled={isRunning}
        />
        <span>{hidden_dim_value}</span>
      </div>
      <div class="slider">
        <label for="seed">Seed</label>
        <input
          type="range"
          min="0"
          max="99"
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
    </div>
    <div class="visualization">
      {#if currentImage}
        <img src={currentImage} alt="Visualization" />
      {:else if isRunning}
        <p>Loading visualization...</p>
      {/if}
    </div>

  </section>

  <section class="section">
    <h2 class="section-title">Sources</h2>
    <h3 class="section-title3">Literature</h3>
      <p class="section-text">
        Malkin, N., Jain, M., Bengio, E., Sun, C., & Bengio, Y. (2022). Trajectory balance: Improved credit
        assignment in gflownets. Advances in Neural Information Processing Systems, 35, 5955-5967.
        <br><br>
        Shen, M. W., Bengio, E., Hajiramezanali, E., Loukas, A., Cho, K., & Biancalani, T. (2023, July).
        Towards understanding and improving gflownet training. In International Conference on Machine
        Learning (pp. 30956-30975). PMLR.
        <br><br>
        Bengio, Y., Lahlou, S., Deleu, T., Hu, E. J., Tiwari, M., & Bengio, E. (2023). Gflownet foundations. The
        Journal of Machine Learning Research, 24(1), 10006-10060.
        <br><br>
        Bengio, E., Jain, M., Korablyov, M., Precup, D., & Bengio, Y. (2021). Flow network based generative
        models for non-iterative diverse candidate generation. Advances in Neural Information Processing
        Systems, 34, 27381-27394.
        <br><br>
        Nica, A. C., Jain, M., Bengio, E., Liu, C. H., Korablyov, M., Bronstein, M. M., & Bengio, Y. (2022). Evaluating generalization in gflownets for molecule design. In ICLR2022 Machine Learning for Drug Discovery.
      </p>
    <h3 class="section-title3">Tutorials</h3>
      <p class="section-text">
        https://milayb.notion.site/The-GFlowNet-Tutorial-95434ef0e2d94c24aab90e69b30be9b3
        <br><br>
        https://colab.research.google.com/drive/1fUMwgu2OhYpQagpzU5mhe9_Esib3Q2VR
      </p>
    <h3 class="section-title3">GFlowNet Libraries</h3>
      <p class="section-text">
        https://github.com/alexhernandezgarcia/gflownet
        <br><br>
        https://github.com/GFNOrg/torchgfn
        <br><br>
        https://github.com/augustwester/gflownet
      </p>
  </section>
</main>




<style>
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

  .header-top {
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

  .section {
    padding: 3rem 0;
  }

  .section-light {
    background-color: #f8f8f0;
  }

  .section-title {
    width: 1000px;
    font-size: 2rem;
    margin: 0 auto;
    font-weight: 600;
    color: #24291e;
    margin-bottom: 1rem;
  }
  .section-title3 {
    width: 1000px;
    font-size: 1.5rem;
    margin: 0 auto;
    font-weight: 500;
    color: #24291e;
    margin-bottom: 1rem;
  }

  .section-text {
    width: 1000px;
    margin: 0 auto;
    font-size: 1rem;
    line-height: 1.6;
    color: #191913;
    margin-bottom: 1.5rem;
  }


  .image-container {
    width: 1000px;
    display: flex;
    margin:0 auto;
    justify-content: center;
    margin-bottom: 2rem;
  }

  .image {
    max-width: 100%;
    width: 90%;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }

  .playground {
    background: linear-gradient(90deg, #382d48, #582897);
    color: white;
    padding: 4rem 0;
    text-align: center;
  }


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
    width: 1000px;
    margin: 0 auto
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

  .env-container {
    position: relative;
    left: 4px;
    width: 1000px;
    height: 500px;
    margin: 0 auto;
    }

  .canvas-container {
    position: absolute;
    top: 50px;
    left: 77px;
    width: 352px;
    height: 352px;
    z-index: 2; /* Ensure the canvas is above the image */
    pointer-events: none; /* Prevent accidental interaction with the container itself */
    border: 1px solid #ccc;
  }


  .mean-circle {
    position: absolute;
    width: 10px;
    height: 10px;
    background: #585858;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    cursor: grab;
    pointer-events: auto;
  }

  .mean-circle.highlight {
    background: #5f1616;
  }

  .variance-circle {
    position: absolute;
    border: 4px solid #585858;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    cursor: grab;
    pointer-events: auto;
  }

  .variance-circle.highlight {
    background: #5f1616;
    opacity: 0.5;
  }

  .controls {
    margin-top: 10px;
  }

  button {
    margin: 5px;
  }

  button:hover {
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .collapsible-header {
    margin: 0;
    font-size: 14px;
    padding: 0.5em;
    border: 1px solid rgb(100,120,140);
    border-radius: 2px;
    background: rgb(244, 244, 244);
    transition: border-radius 0.5s step-end;
  }
  .collapsible-body {
    margin: 0;
    font-size: 12px;
    padding: 0.5em;
    border-left: 1px solid rgb(100,120,140);
    border-radius: 2px;
    background: rgb(244, 244, 244);
    transition: border-radius 0.5s step-end;
  }

  span.li {
    width: 100%;
    display: list-item;
    list-style-type: disc;
    margin-left: 40px;
    text-align: left;
  }

  .mathexpl {
    display: block;
    text-align: center;
    font-size: 0.8rem;
    color: grey;
    margin-top: 5px;
    width: 500px; /* or a fixed width */
    margin-left: auto;
    margin-right: auto;
    margin-bottom: 1rem;
  }

</style>
