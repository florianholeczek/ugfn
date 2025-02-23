<script>
  import { onMount } from 'svelte';
  import {writable} from 'svelte/store';
  import Katex from 'svelte-katex'
  import 'katex/dist/katex.min.css';
  import {plotEnvironment} from "./env.js";
  import './styles.css';
  import {plotStates} from "./training_vis.js"
  import {plot_flow} from "./flow_vis.js";
  import Accordion, {Panel, Header, Content } from '@smui-extra/accordion';
  import Slider from '@smui/slider';
  import Button, { Label } from '@smui/button';
  import IconButton, { Icon } from '@smui/icon-button';
  //import 'svelte-material-ui/themes/fixation.css';
  import "./theme.css"
  import Tab from '@smui/tab';
  import TabBar from '@smui/tab-bar';
  import Paper from '@smui/paper';
  import LinearProgress from '@smui/linear-progress';
  import Select, { Option } from '@smui/select';
  import DataTable, { Head, Body, Row, Cell } from '@smui/data-table';
  import Textfield from '@smui/textfield';
  import Fab from '@smui/fab';



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
  let n_gaussians="2";
  let loss_choice = "Trajectory Balance";
  const gaussians = writable([
    { mean: { x: -1, y: -1 }, variance: 0.4 },
    { mean: { x: 1, y: 1 }, variance: 0.4 }
  ]);

  // elements
  let plotContainerEnv2d = "plot-container2d";
  let plotContainerEnv3d = "plot-container3d";
  let tutorialstart;
  let active_tab = 'Basic';
  let n_iterations_select = ["128", "1024", "2048", "4096", "8192", "10240"];
  let n_iterations_str = "2048";
  $: n_iterations_value = parseInt(n_iterations_str, 10);
  let losses_select = ["Trajectory Balance", "Flow Matching"];
  let view = "Environment";
  let Plotly;
  let p5;
  let flowContainer;
  let flowvis_instance;

  // ranges for means and variances
  const range = { min: -3, max: 3 };
  const varianceRange = { min: 0.1, max: 1.0 };

  // Gaussian tracking
  let selectedGaussian = null; // Tracks the currently selected Gaussian
  let hoveredGaussian = null; // Tracks the Gaussian to be highlighted for deletion

  // Mouse interaction handlers
  let isDraggingMean = false;
  let isDraggingVariance = false;
  let initialMouse = { x: 0, y: 0 };

  //others
  let plotlyready=false;
  let display_trainhistory=false;
  let frames = []; //saves all frames for plotting them after training
  let training_frame = 0;
  let training_progress = 0; //for progressbar
  let current_states;
  let current_losses;
  let current_vectorfield;
  let run1_value = 2048;
  let run2_value = 4096;
  let run3_value = 4096;

  //polling every n ms
  const POLLING_INTERVAL = 30;
  let isRunning = false;
  let pollingTimer;


  // reactive
  $:changeNGaussians(n_gaussians);
  function changeNGaussians(n) {
    while ($gaussians.length < parseInt(n)) {
      addGaussian();
    }
    while ($gaussians.length > parseInt(n)) {
      removeGaussian();
    }
    if (plotlyready){
      plotEnv();
    }
  }
  $: plot_trainingframe(training_frame);
  function plot_trainingframe(frame) {
    if (!isRunning && display_trainhistory){
      plotStates(
        Plotly,
        frames[frame]['gaussians'],
        frames[frame]['states'],
        frames[frame]['losses']
      );
    }
  }
  $: run1 = `./images/run1/run1_${run1_value}.png`
  $: run2 = `./images/run2/run2_${run2_value}.png`
  $: run3 = `./images/run3/run3_${run3_value}.png`
  $: viewChange(view);
  function viewChange (view){
    if (plotlyready) {
      setTimeout(() => {
        if (view === "Environment"){
          console.log("Env View")
          stop_flow();
          plotEnv();
        } else if (view ==="Training"){
          console.log("Train View");
          stop_flow();
          plot_trainingframe(training_frame);
        } else {
          console.log("Flow View")
          updateVectorfield();




        }
      }, 5);
    }

  }

  async function updateVectorfield() {
    await get_vectorfield(750)
    if (!flowvis_instance){
            flowvis_instance = new p5((p) => plot_flow(p, current_vectorfield), flowContainer);
          }
  }


  // Utility functions
  function stop_flow() {
    if (flowvis_instance) {
      flowvis_instance.remove();
      flowvis_instance = null;
    }
  }
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
  async function loadp5() {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.4.0/p5.js';
    document.head.appendChild(script);

    return new Promise((resolve) => {
      script.onload = () => {
        p5 = window.p5;
        resolve();
      };
    });
  }

  function scrollToTutorial() {
    if (tutorialstart) {
      tutorialstart.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }


  // Functions used to start, stop and update the training process
  async function startTraining() {
    try {
      // Disable sliders and switch button state
      isRunning = true;
      display_trainhistory = true;
      training_progress = 0;
      const curr_gaussians = $gaussians;
      const send_params = JSON.stringify({
          off_policy_value,
          loss_choice,
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
      // Start training
      const response = await fetch('http://localhost:8000/start_training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: send_params
      });
      console.log("Training params sent:", send_params)

      if (!response.ok) {
        throw new Error('Failed to start training.');
      }
      frames = [];

      // Start polling for trainings
      pollTraining();
    } catch (error) {
      console.error(error);
      isRunning = false;
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
          clearInterval(pollingTimer); // Stop the polling
          return; // Stop polling
        }
      } catch (error) {
        console.error(error);
      }
    }, POLLING_INTERVAL);
  }

  // Functions for setting the environment

  function resetGaussians(){
    gaussians.set([
      { mean: { x: -1, y: -1 }, variance: 0.4 },
      { mean: { x: 1, y: 1 }, variance: 0.4 }
    ]);
    n_gaussians="2";
    plotEnv();
  }

  const addGaussian = () => {
    gaussians.update(gs => {
      if (gs.length < 4) {
        gs.push({ mean: { x: 0, y: 0 }, variance: 0.5 });
      }
      return gs;
    });
    plotEnv();
  };

  const removeGaussian = () => {
    gaussians.update(gs => {
      if (gs.length > 1) {
        gs.pop();
      }
      return gs;
    });
    plotEnv();
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

    const dx = (event.clientX - initialMouse.x) / 44;
    const dy = (event.clientY - initialMouse.y) / 44;

    gaussians.update(gs => {
      const g = gs.find(g => g === selectedGaussian);

      if (isDraggingMean && g) {
        g.mean.x = clamp(g.mean.x + dx, range.min, range.max);
        g.mean.y = clamp(g.mean.y - dy, range.min, range.max);
      } else if (isDraggingVariance && g) {
        const newVariance = g.variance + dx+dy;
        g.variance = clamp(newVariance, varianceRange.min, varianceRange.max);
      }

      return gs;
    });
    plotEnv();

    initialMouse = { x: event.clientX, y: event.clientY };
  };

  const stopDrag = () => {
    if(isDraggingMean || isDraggingVariance){
      console.log($gaussians);
      plotEnv();
    }

    isDraggingMean = false;
    isDraggingVariance = false;
    selectedGaussian = null;
  };
  function plotEnv(){
    plotEnvironment(Plotly, plotContainerEnv2d, $gaussians, {title: null});
    plotEnvironment(Plotly, plotContainerEnv3d, $gaussians, {title: null});
  }
  function gaussians_textinput(e,i,param) {
    let value = parseFloat(e.target.value);
    if (isNaN(value)) value=0;
    if (param==="variance"){
      value = Math.min(1, Math.max(0.1, value));
      $gaussians[i][param] = value;
    } else {
      value = Math.min(3, Math.max(-3, value));
      $gaussians[i]["mean"][param] = value;
    }
    plotEnv();
  }

  //get vectorfield from backend
  async function get_vectorfield(size) {
    try {
      // params: width and heigth
      const response = await fetch('http://localhost:8000/get_vectorfield',{
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ size: size })
      });
      console.log("Field params sent:", size)

      if (!response.ok) {
        throw new Error(`Failed to get Vectorfield HTTP error! Status: ${response.status}`);
      }
      const data = await response.json();
      console.log(data)
      current_vectorfield = data;
    } catch (error) {
      console.error(error);
    }
  }




  // Mounting
  onMount(async () => {
    //visualize the environment
    await loadPlotly();
    await loadp5();
    plotlyready = true;
    plotEnv();
    // add listeners for changing the Environment
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopDrag);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopDrag);
    };
  });



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

  <div class="pg-background">
  <div class = "pg-top-background">
  </div>

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
          <div class="pg-play">
            <Fab
              on:click={resetGaussians}
              mini
              disabled="{isRunning}"
            ><Icon class="material-icons" style="font-size: 22px">replay</Icon>
            </Fab>
            <Fab
              on:click={() => view="Training"}
              disabled="{isRunning}"
            >
                <Icon class="material-icons" style="font-size: 50px">play_arrow</Icon>
            </Fab>

          </div>
          <div class="pg-ngaussians">
            <div class="columns margins" style="justify-content: flex-start;">
              <Select bind:value="{n_gaussians}" label="N Gaussians" disabled="{isRunning}">
                {#each ["1","2","3","4"] as select}
                  <Option value={select}>{select}</Option>
                {/each}
              </Select>
            </div>
          </div>


        </div>
        <div id={plotContainerEnv2d} class = "pg-2dplot">
          <div class="pg-circles-container">
            {#each $gaussians as g, i}
              <!-- Variance circle -->
              <div
                class="variance-circle"
                class:highlight={i === hoveredGaussian || isRunning}
                style="
                  width: {129 * g.variance}px;
                  height: {129 * g.variance}px;
                  left: {132 + 132/3 * g.mean.x}px;
                  top: {132 - 132/3 * g.mean.y}px;
                "
                on:mousedown={(e) => startDragVariance(e, g)}
                role="slider"
                aria-valuenow="{g.variance}"
                aria-valuemin="0.1"
                aria-valuemax="1"
                tabindex="0"
              ></div>

              <!-- Mean circle -->
              <div
                class="mean-circle"
                class:highlight={i === hoveredGaussian}
                style="
                  left: {132 + 132/3 * g.mean.x}px;
                  top: {132 - 132/3 * g.mean.y}px;
                "
                on:mousedown={(e) => startDragMean(e, g)}
                role="slider"
                aria-valuenow="{g.mean.x}, {g.mean.y}"
                aria-valuemin="-3"
                aria-valuemax="3"
                tabindex="0"
              ></div>
            {/each}
          </div>
        </div>

        <div id={plotContainerEnv3d} class = "pg-3dplot">
        </div>
        <div class= "pg-gauss-table">
          <DataTable table$aria-label="Parameters of Gaussians" style="width: 100%;border-radius: 1px">
            <Head>
              <Row>
                <Cell><Katex>\mu_x</Katex></Cell>
                <Cell><Katex>\mu_y</Katex></Cell>
                <Cell><Katex>\sigma^2</Katex></Cell>
              </Row>
            </Head>
            <Body>
              {#each [...Array($gaussians.length).keys()] as i}
                <Row>
                  <Cell>
                    <Textfield
                            bind:value={$gaussians[i]["mean"]["x"]}
                            on:input={(e) => gaussians_textinput(e,i,"x")}
                            type="number"
                            input$step="0.1"
                            style="width:100%" helperLine$style="width: 100%;"
                    ></Textfield>
                  </Cell>

                  <Cell>
                    <Textfield
                            bind:value={$gaussians[i]["mean"]["y"]}
                            on:input={(e) => gaussians_textinput(e,i,"y")}
                            type="number"
                            input$step="0.1"
                            style="width:100%" helperLine$style="width: 100%;"
                    ></Textfield>
                  </Cell>
                  <Cell>
                    <Textfield
                            bind:value={$gaussians[i]["variance"]}
                            on:input={(e) => gaussians_textinput(e,i,"variance")}
                            type="number"
                            input$step="0.1"
                            style="width:100%" helperLine$style="width: 100%;"
                    ></Textfield>
                  </Cell>
                </Row>
              {/each}
            </Body>
          </DataTable>
        </div>
        <div class="pg-env-help">
          Adjust the reward function by dragging the circles and dots in the left plot or by setting the parameters in the table.
          <br>By setting the mean and variance of multiple 2D Multivariate Gaussians we get the reward function on the right as a mixture.
          <br>Then switch to the "Training" tab to start training.
        </div>
      </div>


    {:else if view === "Training"}


      <!-- Training View -->
      <div class="pg-container">
        <div class="pg-top">
          <div class="pg-play">
            <Fab
              on:click={resetSliders}
              mini
              disabled="{isRunning}"
            ><Icon class="material-icons" style="font-size: 22px">replay</Icon>
            </Fab>
            <Fab
              on:click={isRunning ? stopTraining : startTraining}
            >
              {#if isRunning}
                <Icon class="material-icons" style="font-size: 50px">stop</Icon>
              {:else}
                <Icon class="material-icons" style="font-size: 50px">play_arrow</Icon>
              {/if}
            </Fab>

          </div>
          <div class="pg-loss">
            <div class="columns margins" style="justify-content: flex-start; display: None">
              <Select bind:value="{loss_choice}" label="Loss" color="primary" disabled="true" >
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
                    max={0.01}
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
        {#if !display_trainhistory && !isRunning}
          <div class="pg-vis" style="text-align:center; padding:100px; color: #323232;">
            Press Play to start training a GFlowNet
          </div>
        {:else}
          <div class="pg-vis" id="trainplot">
          </div>
        {/if}

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
        <div bind:this={flowContainer}></div>
    {/if}
  </div>
    <div class="pg-scrollbutton">
      <Fab
        on:click={scrollToTutorial}
        disabled="{isRunning}"
      >
        <Icon class="material-icons">keyboard_arrow_down</Icon></Fab>
    </div>



  </div>





  <section class="section" id="Tutorial" bind:this={tutorialstart}>
    <h2 class="section-title">What is this about?</h2>
    <p class="section-text">
      Here you can explore how GFlowNets learn.
      <br>Make your own reward function, adjust the hyperparameters and watch the training progress.
      If you have no idea what a GFlowNet actually is you might want to look into this basic tutorial first.
      <br> Or just explore!
    </p>
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
      Well thats not what we want! Instead of sampling from the true distribution we only sample from one mode, thats what common RL methods do. We had another goal!
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
    <p class="section-text">
      It took some iterations, but now we match the distribution again.
    </p>

  </section>

  <section class="section">
    <h2 class="section-title">Flow</h2>
    <p class="section-text">
      Add vectorfield (done) or program Flow Field?
    </p>
  </section>
  <section class="section">
    <h2 class="section-title">Acknowledgements</h2>
    <p class="section-text">
      Thanks to Christina Humer for the feedback and resources.
      <br>Some implementations and ideas are based on other great work:
      <span class="li">The
        <a href="https://github.com/GFNOrg/torchgfn/blob/master/tutorials/notebooks/intro_gfn_continuous_line_simple.ipynb" target="_blank">continuous line</a>
        example by Joseph Viviano & Kolya Malkin.
        The idea for the environment is based on their notebook and much of the training code is adapted from theirs.
    </span>
    <span class="li">The
        <a href="https://playground.tensorflow.org/" target="_blank">
          neural network playgroud</a>
         by Daniel Smilkov and Shan Carter was an inspiration on how to visualize machine learning and the training progress in the browser.
      </span>
      <span class="li">The code for the flow field visualization is mostly taken from
        <a href="https://editor.p5js.org/Mathcurious/sketches/bdp6luRil" target="_blank">Mathcurious' implementation</a>


      </span>
    </p>

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
        <br><br>
        https://github.com/GFNOrg/torchgfn/blob/master/tutorials/notebooks/intro_gfn_continuous_line_simple.ipynb

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
