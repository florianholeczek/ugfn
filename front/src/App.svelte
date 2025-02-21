<script>
  import { onMount } from 'svelte';
  import {writable} from 'svelte/store';
  import Katex from 'svelte-katex'
  import 'katex/dist/katex.min.css';
  import { CollapsibleCard } from 'svelte-collapsible'
  import {plotEnvironment} from "./env.js";
  import './styles.css';
  import {plotStates} from "./training_vis.js"
  import Accordion, {Panel, Header, Content } from '@smui-extra/accordion';
  import Slider from '@smui/slider';
  import Button, { Label } from '@smui/button';
  import IconButton, { Icon } from '@smui/icon-button';
  import 'svelte-material-ui/themes/fixation.css';
  import Tab from '@smui/tab';
  import TabBar from '@smui/tab-bar';
  import Paper from '@smui/paper';
  import LinearProgress from '@smui/linear-progress';
  import Select, { Option } from '@smui/select';



  // default values
  let off_policy_value = 0;
  let n_iterations_value;
  let lr_model_value = 0.001;
  let lr_logz_value = 0.1;
  let trajectory_length_value = 6;
  let hidden_layer_value = 2;
  let hidden_dim_value = 64;
  let seed_value = 42;
  let batch_size_exponent = 6;
  $: batch_size_value = 2**batch_size_exponent;


  let frames = [];
  let training_frame = 0;
  $: plot_trainingframe(training_frame)
  function plot_trainingframe(frame) {
    if (!isRunning & display_trainhistory){
      plotStates(
        Plotly,
        frames[frame]['gaussians'],
        frames[frame]['states'],
        frames[frame]['losses']
      );
    }
  }

  let training_progress = 0;



  let run1_value = 2048;
  let run2_value = 4096;
  let run3_value = 4096;
  let current_states;
  let current_losses;

  $: run1 = `./images/run1/run1_${run1_value}.png`
  $: run2 = `./images/run2/run2_${run2_value}.png`
  $: run3 = `./images/run3/run3_${run3_value}.png`


  //polling every n ms
  const POLLING_INTERVAL = 50;
  let isRunning = false;
  let pollingTimer;

  // storing gaussians
  const gaussians = writable([
    { mean: { x: -1, y: -1 }, variance: 0.4 },
    { mean: { x: 1, y: 1 }, variance: 0.4 }
  ]);

  function resetGaussians(){
    gaussians.set([
      { mean: { x: -1, y: -1 }, variance: 0.4 },
      { mean: { x: 1, y: 1 }, variance: 0.4 }
    ]);
    plotEnvironment(Plotly, plotContainerId, $gaussians, {title: null});
    plotEnvironment(Plotly, plotContainerId2, $gaussians, {title: null});
    plotEnvironment(Plotly, plotContainerId2d, $gaussians, {title: null});
    plotEnvironment(Plotly, plotContainerId3d, $gaussians, {title: null});
  }

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
      n_iterations_str = "2048";
      lr_model_value = 0.001;
      lr_logz_value = 0.1;
      trajectory_length_value = 6;
      hidden_layer_value = 2;
      hidden_dim_value = 64;
      seed_value = 42;
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
  async function startTraining() {
    try {
      // Disable sliders and switch button state
      isRunning = true;
      display_trainhistory = true;
      training_progress = 0;
      const curr_gaussians = $gaussians;
      // Start training
      const response = await fetch('http://localhost:8000/start_training', {
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
        throw new Error('Failed to start training.');
      }
      frames = [];

      // Start polling for trainings
      pollTraining();
    } catch (error) {
      console.error(error);
      isRunning = false;
      pg_button = false;
    }
  }

  async function stopTraining() {
    try {
      // Stop training on backend
      const response = await fetch('http://localhost:8000/stop_training',{
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to stop training.');
      }

      // Stop polling and reset button state
      clearInterval(pollingTimer);
      isRunning = false;
      pg_button = false;
    } catch (error) {
      console.error(error);
    }
  }

  function pollTraining() {
    pollingTimer = setInterval(async () => {
      try {
        const response = await fetch('http://localhost:8000/get_training_update');
        if (!response.ok) {
          throw new Error('Failed to fetch training.');
        }

        const data = await response.json();
        if (data.losses) {
          current_losses = data.losses;
          training_progress = current_losses['losses'].length
        }
        if (data.states) {
          current_states = data.states;
          plotStates(Plotly, $gaussians, current_states,current_losses);
          frames.push({
            'gaussians': JSON.parse(JSON.stringify($gaussians)),
            'states': current_states,
            'losses': current_losses
          })
        }

        if (data.completed) {
          console.log("Training process completed.");
          plotStates(Plotly, $gaussians, current_states,current_losses);
          isRunning = false; // Update the UI state to reflect the stopped process
          pg_button = false;
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
    plotEnvironment(Plotly, plotContainerId, $gaussians, {title: null});
    plotEnvironment(Plotly, plotContainerId2, $gaussians, {title: null});
    plotEnvironment(Plotly, plotContainerId2d, $gaussians, {title: null});
    plotEnvironment(Plotly, plotContainerId3d, $gaussians, {title: null});
  };

  const removeGaussian = () => {
    gaussians.update(gs => {
      if (gs.length > 1) {
        gs.pop();
      }
      return gs;
    });
    plotEnvironment(Plotly, plotContainerId, $gaussians, {title: null});
    plotEnvironment(Plotly, plotContainerId2, $gaussians, {title: null});
    plotEnvironment(Plotly, plotContainerId2d, $gaussians, {title: null});
    plotEnvironment(Plotly, plotContainerId3d, $gaussians, {title: null});
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
      plotEnvironment(Plotly, plotContainerId, $gaussians, {title: null});
      plotEnvironment(Plotly, plotContainerId2, $gaussians, {title: null});
      plotEnvironment(Plotly, plotContainerId2d, $gaussians, {title: null});
      plotEnvironment(Plotly, plotContainerId3d, $gaussians, {title: null});
    }

    isDraggingMean = false;
    isDraggingVariance = false;
    selectedGaussian = null;
  };



  let plotContainerId = "plot-container";
  let plotContainerId2 = "plot-container2";
  let plotContainerId2d = "plot-container2d";
  let plotContainerId3d = "plot-container3d";
  let training_history = "traininghistory"
  let trainplot = "trainplot";
  let plotlyready=false;

  // Mounting
  onMount(async () => {
    //visualize the environment
    await loadPlotly();
    plotlyready = true;
    plotEnvironment(Plotly, plotContainerId, $gaussians, {title: null});
    plotEnvironment(Plotly, plotContainerId2, $gaussians, {title: null});
    plotEnvironment(Plotly, plotContainerId2d, $gaussians, {title: null});
    plotEnvironment(Plotly, plotContainerId3d, $gaussians, {title: null});
    // add listeners for changing the Environment
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopDrag);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopDrag);
    };
  });
  let display_trainhistory=false;
  let active_tab = 'Basic';

  let n_iterations_select = ["128", "1024", "2048", "4096", "8192", "10240"];
  let n_iterations_str = "2048";
  $: n_iterations_value = parseInt(n_iterations_str, 10);
  let losses_select = ["Trajectory Balance", "Flow Matching"];
  let loss_choice = "Trajectory Balance";

  let view = "Environment";
  $: viewChange(view);
  function viewChange (view){
    if (plotlyready) {
      setTimeout(() => {
        if (view === "Environment"){
          console.log("Env View")
          plotEnvironment(Plotly, plotContainerId2d, $gaussians, {title: null});
          plotEnvironment(Plotly, plotContainerId3d, $gaussians, {title: null});
        } else if (view ==="Training"){
          console.log("Train View");
          plot_trainingframe(training_frame);
        } else {
          console.log("Flow View")
        }
      }, 5);
    }

  }


  let pg_button = false;




</script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.15.2/dist/katex.min.css" integrity="sha384-MlJdn/WNKDGXveldHDdyRP1R4CTHr3FeuDNfhsLPYrq2t0UBkUdK2jyTnXPEK1NQ" crossorigin="anonymous">
<link
  href="https://fonts.googleapis.com/css2?family=Material+Icons&display=swap"
  rel="stylesheet"
/>




<main class="main-content">
  <header class="header-top">
    <div class="container">
      <h1 class="title">Understanding GFlowNets</h1>
      <p class="subtitle">Gaining intuition for Generative Flow Networks and how to train them</p>
    </div>
  </header>



  <!-- Playground -->
  <div class="pg-views">
    <TabBar
            tabs={["Environment", "Training", "Flow"]}
            let:tab
            bind:active={view}
    >
      <Tab {tab} disabled={isRunning}>
        <Label>{tab}</Label>
      </Tab>
    </TabBar>
    {#if view === 'Environment'}


      <!-- Environment View -->
      <div class="pg-container">
        <div class="pg-top">
          <div class="pg-reset">
            <IconButton
                    class="material-icons"
                    on:click={resetGaussians}
                    style="font-size: 32px;display: flex; justify-content: flex-start; align-items: center;"
                    disabled="{isRunning}"
            >replay</IconButton>
          </div>
          <div class="pg-play">
            <IconButton
                    class="material-icons"
                    on:click={() => view="Training"}
                    style="font-size: 50px;display: flex; justify-content: center; align-items: center;"
                    disabled={isRunning}
            >play_circle</IconButton>
          </div>

        </div>
        <div id={plotContainerId2d} class = "pg-2dplot">
        </div>
        <div id={plotContainerId3d} class = "pg-3dplot">
        </div>
      </div>


    {:else if view === "Training"}


      <!-- Training View -->
      <div class="pg-container">
        <div class="pg-top">
          <div class="pg-reset">
            <IconButton
                    class="material-icons"
                    on:click={resetSliders}
                    style="font-size: 32px;display: flex; justify-content: center; align-items: center;"
                    disabled="{isRunning}"
            >replay</IconButton>
          </div>
          <div class="pg-play">
            <IconButton
                    on:click={isRunning ? stopTraining : startTraining}
                    toggle
                    bind:pressed={pg_button}
            >
              <Icon class="material-icons" style="font-size: 50px" on>stop_circle</Icon>
              <Icon class="material-icons" style="font-size: 50px">play_circle</Icon>
            </IconButton>
          </div>
          <div class="pg-loss">
            <div class="columns margins" style="justify-content: flex-start;">
              <Select bind:value="{loss_choice}" label="Loss" disabled="{isRunning}">
                {#each losses_select as select}
                  <Option value={select}>{select}</Option>
                {/each}
              </Select>
            </div>
            <div class="pg-iterations">
              <div class="columns margins" style="justify-content: flex-start;">
                <Select
                  bind:value="{n_iterations_str}"
                  label="Iterations"
                  disabled="{isRunning}"
                >
                  {#each n_iterations_select as select}
                    <Option value={select}>{select}</Option>
                  {/each}
                </Select>
              </div>
            </div>
          </div>
        </div>

        <div class="pg-side">
          <div>
            <TabBar tabs={['Basic', 'Advanced']} let:tab bind:active={active_tab}>
              <Tab {tab}>
                <Label>{tab}</Label>
              </Tab>
            </TabBar>

            {#if active_tab === 'Basic'}
              <Paper variant="unelevated">
                <Content>
                  Batch size: {batch_size_value}
                  <Slider
                    bind:value="{batch_size_exponent}"
                    min={3}
                    max={11}
                    step={1}
                    disabled="{isRunning}"
                    input$aria-label="Set the batch size: 2 to the power of n"
                  />
                  <br>
                  Trajectory length: {trajectory_length_value}
                  <Slider
                    bind:value="{trajectory_length_value}"
                    min={1}
                    max={10}
                    step={1}
                    disabled="{isRunning}"
                    input$aria-label="Set the length of the trajectory"
                  />
                  <br>
                  Learning rate of the model: {lr_model_value.toFixed(4)}
                  <Slider
                    bind:value="{lr_model_value}"
                    min={0.0001}
                    max={0.1}
                    step={0.0001}
                    disabled="{isRunning}"
                    input$aria-label="Set the learning rate of the model"
                  />
                  <br>
                  Learning rate of <br> logZ: {lr_logz_value.toFixed(3)}
                  <Slider
                    bind:value="{lr_logz_value}"
                    min={0.001}
                    max={0.3}
                    step={0.001}
                    disabled="{isRunning}"
                    input$aria-label="Set the learning rate of logZ"
                  />
                </Content>
              </Paper>
            {:else if active_tab === 'Advanced'}
              <Paper variant="unelevated">
                <Content>
                  Off-policy: {off_policy_value}
                  <Slider
                    bind:value="{off_policy_value}"
                    min={0}
                    max={3}
                    step={0.1}
                    disabled="{isRunning}"
                    input$aria-label="Set the Off-policy training"
                  />
                  <br>
                  Number of hidden layers: {hidden_layer_value}
                  <Slider
                    bind:value="{hidden_layer_value}"
                    min={1}
                    max={6}
                    step={1}
                    disabled="{isRunning}"
                    input$aria-label="Set the number of hidden layers"
                  />
                  <br>
                  Size of the hidden layers: {hidden_dim_value}
                  <Slider
                    bind:value="{hidden_dim_value}"
                    min={8}
                    max={128}
                    step={8}
                    disabled="{isRunning}"
                    input$aria-label="Set the dimension of the hidden layers"
                  />
                  <br>
                  Seed: {seed_value}
                  <Slider
                    bind:value="{seed_value}"
                    min={1}
                    max={99}
                    step={1}
                    disabled="{isRunning}"
                    input$aria-label="Set the seed"
                  />
                </Content>
              </Paper>
            {/if}
          </div>
        </div>
        <div class="pg-vis" id="trainplot">
        </div>

        <div class="pg-bottom">
          {#if !isRunning & display_trainhistory}
            <Slider
              bind:value="{training_frame}"
              min={0}
              max={frames.length}
              step={1}
              input$aria-label="View the iterations"
            />
      {:else if isRunning}
        <div class = "pg-progress">
          <LinearProgress progress="{ training_progress / n_iterations_value}" />
        </div>
      {/if}
    </div>
  </div>

    {:else if view === "Flow"}
      <!-- FlowView -->
      <div class="pg-container">
        Flow
      </div>
    {/if}
  </div>





  <section class="section">
    <h2 class="section-title">What is a GFlowNet?</h2>
    <p class="section-text">

      In short, a generative flow network is a model class which allows sampling from an arbitrary probability distribution (similar to MCMC). GFlowNets allow for generating objects with sequentially built compositional structure like trees or graphs.

      <br>We train a model to learn a distribution <Katex>\pi(x)</Katex> (our policy), so we can sample from it. For this, we need a reward function R(x) which assigns value to each final object x and we want <Katex>\pi(x)</Katex> to sample proportional to it:  <Katex>\pi(x) \propto R(x)</Katex>. This allows us later on to sample a diversity of solutions instead of just the reward-maximizing one.

      <br>As we do not rely on a external dataset but only on our internal reward function we are only limited by compute - we can generate objects and query the reward function as often as we like.

    </p>
      <div class="image-container">
        <Accordion multiple>
          <Panel color="secondary">
            <Header>Example (And more introduction)</Header>
            <Content>
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

            </Content>
          </Panel>
        </Accordion>
      </div>
    <p class="section-text">
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
      <div class="image-container-small">
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
    </p>
    <div class="image-container">
      <Accordion multiple>
        <Panel color="secondary">
          <Header>More math</Header>
          <Content>
            Let's look at the parts of this loss function:
            <ul>
              <li>
                <Katex>P_F(s_{"t+1"}|s_t;\theta)</Katex>
                The forward policy. It represents the distribution over the next states (the children) of the current state.
              </li>
              <li>
                <Katex>P_B(s_t|s_{"t+1"};\theta)</Katex>
                The backward policy. Similar to as we defined the forward policy, we can define the backward policy as a distribution over the previous states (the parents) of a state.
                We can also estimate it using a NN (not the same as for the forward policy).
              </li>
              <li>
                <Katex>Z_{"\\theta"}</Katex>
                The partition function. It is equal to the total flow of the system.
                It is another parameter to be learned by our agent and should approach the true partition function given enough training.
                In our case, the true partition function is 2 (the number of gaussians), however it is usually not known.
                The partition function for a mixture of gaussians is the sum of its mixture weights, so always 1 (therefore logZ is 0).
                However we do not compute a real mixture of gaussians here, as we do not use mixture weights but simply sum up over all gaussians.
              </li>
              <li>
                <Katex>R(x)</Katex>
                The reward for the final object x of the trajectory. Note that if we propagate the reward backward using our backward policy, only a small part of it goes through one trajectory, as there are usually many ways to sample x using different trajectories.
              </li>
            </ul>
          </Content>
        </Panel>
        <Panel color="secondary">
          <Header>The algorithm</Header>
          <Content style="white-space: pre;">
              Input: Reward function (part of the environment), model, hyperparameters
              <br>  1. Initialize model parameters for PF, PB, logZ
              <br>  2. Repeat for a number of iterations or until convergence:
              <br>  3.      Repeat for trajectory length:
              <br>  4.            Sample action for current state from PF
              <br>  5.            Take step according to action
              <br>  6.            Add new state to trajectory
              <br>  7.      Calculate reward of final state according to reward function
              <br>  8.      Calculate the sum of the log probabilities of all actions of the trajectory for each PF and PB
              <br>  9.      Calculate the TB-Loss: (logZ + log probabilities PF - log probabilities PB - log reward)^2
              <br>  10.    Update the parameters PF, PB, logZ
          </Content>
        </Panel>
      </Accordion>
    </div>
    <p class="section-text">
      We trained a GFlowNet on this environment for 2000 Iterations.
      Below you see the progress of our GFlowNet during training. While it first samples randomly, it learns to match the true distribution of our environment.


    </p>
    <div class="image-container">
      <img src="{run1}" class="image" alt="GFN samples from the underlying distribution">
    </div>
    <div style="width: 600px; margin: auto; text-align:center;">
    <Slider
        bind:value="{run1_value}"
        min={0}
        max={2048}
        step={128}
        discrete
        input$aria-label="Discrete slider"
      />
      Show training Progress
    </div>
    <p class="section-text">
      Sampling according to the underlying distribution is one of the big advantages of GFlowNets: Other approaches usually learn to maximize the reward, so they would not sample from both of our modes (or everything in between), but they would find one of them and then just sample from it (especially if one of our modes would be greater than the other). This might be suboptimal e.g. in molecule discovery, where you might not want the most promising molecule, but many different of themmight be interesting.
    </p>


    <h2 class="section-title">Mode Collapse</h2>
    <p class="section-text">
      So far, our distribution to match was very easy. Lets make it more challenging: If we lower the variance, we see the two modes are more seperated.
    </p>
    <div class="image-container">
      <img src="{run2}" class="image" alt="The model samples only from one mode of the distribution">
    </div>
    <div style="width: 600px; margin: auto; text-align:center;">
    <Slider
        bind:value="{run2_value}"
        min={0}
        max={4096}
        step={128}
        discrete
        input$aria-label="Discrete slider"
      />
    </div>
    <p class="section-text">
      Well thats not what we want! Instead of sampling from the true distribution we only sample from one mode, thats what common RL methods do. We can do better!
      <br><br>
      There are two main possibilities to fix this:
      <span class="li">We could introduce a temperature parameter <Katex>\beta</Katex> into our reward function:<Katex>R_{"new"}(x)=R(x)^\beta</Katex>. This would change the "peakyness" of the reward function and we would not sample proportional to the reward function but according to <Katex>\pi(x|\beta) \propto R(x)^\beta</Katex>. It is also possible to use <Katex>\beta</Katex> as a trainable parameter and condition the model on it.</span>
      <span class="li">A similar but simpler way is to just train off-policy. By adding a fixed variance to the logits of the forward policy, we explore more during training. As this is a very easy implementation let's go with this one.</span>
    </p>
    <div class="image-container">
      <Accordion multiple>
        <Panel color="secondary">
          <Header>Changes to the algorithm</Header>
          <Content>
            Training off-policy is even more helpful when we schedule it. We start with more a higher variance and scale it down during training until we reach on-policy training.
            <br>Our new hyperparameter is the initial value for the off policy training, during each step we gradually decrease it until we reach 0.
            <br>
            <br>Important changes:
            <ul>
              <li>
                Define schedule in the beginning: [start=initial value, stop=0, step=-initial value/number of iterations\]
              </li>
              <li>
                When sampling the actions we compute the logits as usual.
              </li>
              <li>
                Instead of just defining the policy distribution with them, we also define a exploratory distribution by adding the scheduled value to the variance.
              </li>
              <li>
                We then sample our actions from the exploratory distribution. We need the policy distribution later to compute the log probabilities of our actions.
              </li>
              <li>
                We do not use the scheduled values with the backward policy and during inference.
              </li>
            </ul>
          </Content>
        </Panel>
      </Accordion>
    </div>
    <div class="image-container">
      <img src="{run3}" class="image" alt="Training off policy helps to discover modes">
    </div>
    <div style="width: 600px; margin: auto; text-align:center;">
    <Slider
        bind:value="{run3_value}"
        min={0}
        max={4096}
        step={128}
        discrete
        input$aria-label="Discrete slider"
      />
    </div>

  </section>

  <section class="section">
    <h2 class="section-title">Flow</h2>
    <p class="section-text">
      Add vectorfield (done) or program Flow Field?
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
      <button class="reset-button" on:click="{isRunning ? stopTraining : startTraining}">
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
    <!--
    <div class="image-container" id="trainplot">
    </div>
    {#if !isRunning & display_trainhistory}
      <div class="slider-container">
        <div class="slider">
          <label for="training_history">Training progress</label>
          <input
            type="range"
            min="0"
            max="{frames.length}"
            step="1"
            bind:value="{training_frame}"
            id="training_history"
            on:input={plotStates(
                    Plotly,
                    frames[training_frame]['gaussians'],
                    frames[training_frame]['states'],
                    frames[training_frame]['losses']
                    )}
          />
        </div>
      </div>
    {/if}
    -->

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

  span {
    width: 50px;
    text-align: center;
    color: black;
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
    width: 500px;
    margin: 5px auto 1rem;
  }


</style>
