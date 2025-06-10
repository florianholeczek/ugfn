<script>
  import { onMount, tick } from 'svelte';
  import {writable} from 'svelte/store';
  import Katex from 'svelte-katex'
  import 'katex/dist/katex.min.css';
  import "./theme.css"
  import './styles.css';
  import {plotEnvironment, compute_density_plotting} from "./env.js";
  import {plotStates, plotStatesHistory, create_env_image} from "./training_vis.js"
  import {plot_flow} from "./flow_vis.js";
  import Accordion, {Panel, Header, Content } from '@smui-extra/accordion';
  import Slider from '@smui/slider';
  import Button, { Label } from '@smui/button';
  import IconButton, { Icon } from '@smui/icon-button';
  import Tooltip, { Wrapper, Title } from '@smui/tooltip';
  import Tab from '@smui/tab';
  import TabBar from '@smui/tab-bar';
  import Paper from '@smui/paper';
  import LinearProgress from '@smui/linear-progress';
  import Select, { Option } from '@smui/select';
  import DataTable, { Head, Body, Row, Cell } from '@smui/data-table';
  import Textfield from '@smui/textfield';
  import Fab from '@smui/fab';
  import Snackbar, { Actions } from '@smui/snackbar';
  import { flow_velocity, flow_n_particles,flow_vectorfield, flow_vectors, flow_changed} from './store.js';



  // default values for training
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
  let sourcesstart;
  let playgroundstart;
  let Plotly;
  let p5;
  let flowContainer;
  let tutorial_flowContainer;
  let flowvis_instance;
  let tutorial_flowvis_instance;
  let tutorial_flow_observer;
  let pollingTimer;
  let snackbar_load;
  let snackbar_training_done;
  let AnimInterval;

  // UI Elements
  let active_tab = 'Basic';
  let n_iterations_select = ["128", "1024", "2048", "4096", "8192", "10240"];
  let n_iterations_str = "2048";
  $: n_iterations_value = parseInt(n_iterations_str, 10);
  let losses_select = ["Trajectory Balance", "Flow Matching"];
  let view = "1. Environment";

  let vectorgrid_size=31;

  // ranges for means and variances
  const range = { min: -3, max: 3 };
  const varianceRange = { min: 0.1, max: 1.0 };

  // flow visualization
  let flow_velocity_value = 0.5;
  let flow_n_particles_value = 1000;
  let flow_vectorfield_value = false; //for toggling between vector and flow vis
  let flow_vis_type = "Particles" //for UI of vectorfield_value
  let flow_step_value = 0; //Iteration slider
  let flow_trajectory_step_value = 1; //Trajectory slider
  let t_flow_step_value = 0; //as above for the Tutorial Flow vis
  let t_flow_trajectory_step_value = 1;
  let training_step_value = 0;

  //disabling UI, preventing too early rendering
  let updateflows=true;
  let plotlyready=false;
  let display_trainhistory=false;
  let isRunning = false;
  let isRunningAnim = false;


  //tutorial visualization data
  let run_data = {};

  // Gaussian tracking
  let selectedGaussian = null; // Tracks the currently selected Gaussian
  let hoveredGaussian = null; // Tracks the Gaussian to be highlighted for deletion

  // Mouse interaction handlers
  let isDraggingMean = false;
  let isDraggingVariance = false;
  let initialMouse = { x: 0, y: 0 };

  // parameters of last or active training run
  let training_progress = 0; //for progressbar
  let current_states;
  let current_losses;
  let current_parameters = {};
  current_parameters["trajectory_length_value"] = 6
  current_parameters["n_iterations_value"] = 2048
  let current_nSteps = 33;
  let current_flows;
  let current_trajectories;
  let current_plotting_density;
  let current_env_image;

  // Tutorial parameters
  let run1_value = 0;
  let run2_value = 0;
  let run3_value = 0;
  let tutorial_gaussians =  [
    { mean: { x: -1, y: -1 }, variance: 0.2 },
    { mean: { x: 1, y: 1 }, variance: 0.2 }
  ]
  let tutorial_env_image;

  //other
  let session_id = null; // for handling multiple training sessions of multiple users
  let isMobile = false; // to display mobile disclaimer
  const BACKEND_URL = ""//process.env.BACKEND_URL ?? ""; //"https://back:8000";
  const POLLING_INTERVAL = 100; //polling every n ms




  // reactive
  $:run1_plot(run1_value);
  function run1_plot(v) {
    const check = (v % 64 === 0) && v>=0 && v <=2048
    if (plotlyready && check){
      plot_run(1, v);
    }
  }
  $:run2_plot(run2_value);
  function run2_plot(v) {
    if (plotlyready){
      plot_run(2, v);
    }
  }
  $:run3_plot(run3_value);
  function run3_plot(v) {
    if (plotlyready){
      plot_run(3, v);
    }
  }

  $:change_flow_vis_value(flow_vis_type);
  function change_flow_vis_value(f) {
    if (f==="Particles") {
      flow_vectorfield_value = false;
    } else if (f==="Vectors") {
      flow_vectorfield_value = true;
    } else{
      console.log("error with flow visualization type")
    }

  }

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
  $: plot_traininghist(training_step_value);
  function plot_traininghist(step) {
    if (!isRunning && display_trainhistory){
      let trajectory_temp = slice_trajectories(step,current_parameters["trajectory_length_value"],current_trajectories);
      let iter = Math.min(step*current_parameters["n_iterations_value"]/32,
                      current_losses['losses'].length)
      plotStatesHistory(
                  Plotly,
                  trajectory_temp,
                  current_losses,
                  current_plotting_density,
                  current_parameters["trajectory_length_value"]+1,
                  iter,
                  'trainplothist'
          );
    }
  }

  $: viewChange(view);
  function viewChange (view){
    if (plotlyready) {
      setTimeout(() => {
        if (view === "1. Environment"){
          console.log("Env View")
          if (flowvis_instance) {
            flowvis_instance.remove();
            flowvis_instance = null;
          }
          plotEnv();
        } else if (view ==="2. Training"){
          console.log("Train View");
          if (flowvis_instance) {
            flowvis_instance.remove();
            flowvis_instance = null;
          }
          plot_traininghist(training_step_value)
        } else {
          if(display_trainhistory){
            updateflows=false;
            flow_step_value=current_nSteps-1
            flow_trajectory_step_value=current_parameters["trajectory_length_value"]
            updateflows=true;
            flowvis_instance = createVectorfield(
                    flowvis_instance,
                    flowContainer,
                    current_parameters["trajectory_length_value"],
                    current_flows,
                    flow_step_value,
                    flow_trajectory_step_value,
                    current_env_image
            );
          }
          console.log("Flow View")

        }
      }, 5);
    }

  }

  function createVectorfield(instance, container, trajectory_length, data, s, t, img) {
    if (!instance){
      flow_vectors.set(slice_flows(
              s,
              t,
              trajectory_length,
              data
      ));
      flow_changed.set(true);
      instance = new p5((p) => plot_flow(p, vectorgrid_size, img), container);
      return instance
    }
  }

  $: update_flowparameters(
          flow_velocity_value,
          flow_n_particles_value,
          flow_vectorfield_value,
          flow_step_value,
          flow_trajectory_step_value,
          t_flow_step_value,
          t_flow_trajectory_step_value
  );
  function update_flowparameters(
          velocity,
          nParticles,
          vectorfield,
          flow_step_value,
          flow_trajectory_step_value,
          t_flow_step_value,
          t_flow_trajectory_step_value
  ) {
    if(((view === "3. Flow" && flowvis_instance) || (tutorial_flowvis_instance)) && updateflows){
      flow_velocity.set(velocity);
      flow_n_particles.set(nParticles);
      flow_vectorfield.set(vectorfield);
      if (flowvis_instance) {
        flow_vectors.set(slice_flows(
              flow_step_value,
              flow_trajectory_step_value,
              current_parameters["trajectory_length_value"],
              current_flows
        ));
      } else {
        flow_vectors.set(slice_flows(
              t_flow_step_value/128,
              t_flow_trajectory_step_value,
              6,
              run_data["run3_flow"]
        ));
      }

      flow_changed.set(true);
    }

  }



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
      display_trainhistory = false;
  }

  async function loadPlotly() {
    const script = document.createElement('script');
    script.src = 'https://cdn.plot.ly/plotly-2.0.0.min.js';
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

  function scrollTo(id) {
    if (id) {
      id.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function slice_flows(s, t, t_length, data){
    const size = vectorgrid_size**2 * 2
    const index = (s*(t_length+1)*size) + (t*size)
    return data.slice(index, index+size)
  }

  function slice_trajectories(s, t_length, data){
    const size = 2048*(t_length+1)*2
    const index = s*size
    return data.slice(index, index+size)
  }

  function save_array(ar) {
		const blob = new Blob([JSON.stringify(Array.from(ar))], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'current_array.json';
		a.click();
		URL.revokeObjectURL(url);
        console.log("saved", ar)
	}

  async function load_array(path, name) {
		try {
			const res = await fetch(path);
			if (!res.ok) throw new Error("File not found or fetch failed");
			const data = await res.json();
			run_data[name] = new Float32Array(data);
		} catch (err) {
			console.error(`Failed to load ${name}.json`, err);
		}
	}

  function saveJSON() {
    const dataStr = JSON.stringify(current_losses, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "losses.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function loadJSON(path) {
    const res = await fetch(path);
    const json = await res.json();
    return json;
  }

  async function load_rundata() {
    await load_array("/Data/run3_flow.json", "run3_flow");
    await load_array("/Data/run1_traj.json", "run1_traj");
    await load_array("/Data/run2_traj.json", "run2_traj");
    await load_array("/Data/run3_traj.json", "run3_traj");
    run_data["run1_density"] = compute_density_plotting($gaussians, 100);
    run_data["run2_density"] = compute_density_plotting(tutorial_gaussians, 100);
    run_data["run3_density"] = compute_density_plotting(tutorial_gaussians, 100);
    run_data["run1_losses"] = await loadJSON("/Data/run1_losses.json");
    run_data["run2_losses"] = await loadJSON("/Data/run2_losses.json");
    run_data["run3_losses"] = await loadJSON("/Data/run3_losses.json");
    console.log("loading data completed")
  }

  function plot_run(run, step) {
    let d = 64;
    if (run>1) {
      d = 128;
    }
    const t = slice_trajectories(step/d, 6, run_data[`run${run}_traj`]);
    plotStatesHistory(Plotly, t, run_data[`run${run}_losses`], run_data[`run${run}_density`], 7, step, `runplot${run}`);
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

  function runs_textinput(e, run){
    let d = 64;
    if (run>1) d=128;
    let value = parseInt(e.target.value);
    if (isNaN(value)) value=0;
    value = value - (value % d)
    value = Math.min(d*32, Math.max(0, value));
  }



  // Functions used to start, stop and update the training process
  async function startTraining() {
    try {
      // Disable sliders and switch button state
      isRunning = true;
      display_trainhistory = true;
      training_progress = 0;
      if (isRunningAnim) stop_animation_run();
      const curr_gaussians = $gaussians;
      current_plotting_density = compute_density_plotting(curr_gaussians, 100)
      current_env_image = await create_env_image(Plotly, current_plotting_density)
      current_parameters = {
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
      }
      const send_params = JSON.stringify(current_parameters)

      const response = await fetch(`${BACKEND_URL}/start_training`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: send_params
      });
      console.log("Training params sent:", current_parameters)

      if (!response.ok) {
        throw new Error('Failed to start training.');
      }
      const data = await response.json();
      session_id = data.session_id;
      console.log("Training started. Session ID:", session_id);

      // Start polling for trainings
      pollTraining();
    } catch (error) {
      console.error(error);
      isRunning = false;
    }
  }

  async function stopTraining() {
    try {
      if (!session_id) throw new Error("No session in progress.");
      // Stop training on backend
      const response = await fetch(`${BACKEND_URL}/stop_training/${session_id}`,{
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to stop training.');
      }
    } catch (error) {
      console.error(error);
    }
  }

  function pollTraining() {
    if (!session_id) {
      console.error("No session ID set.");
      return;
    }

    let completed = false;
    pollingTimer = setInterval(async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/get_training_update/${session_id}`);
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
          plotStates(Plotly, current_states,current_losses, current_plotting_density);
        }

        if (data.completed && !completed) {
          completed = true;
          clearInterval(pollingTimer); //stop polling
          await get_final_data();
          isRunning = false;
          await tick();
          snackbar_training_done.open();
          training_step_value = current_nSteps-1; //also triggers plot for trainhistory
        }
      } catch (error) {
        console.error(error);
      }
    }, POLLING_INTERVAL);
  }

  async function get_final_data() {
    try {
      if (!session_id) throw new Error("No session in progress.");

      const response = await fetch(`${BACKEND_URL}/get_final_data/${session_id}`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to stop training.');
      } else {
        const arrayBuffer = await response.arrayBuffer();
        const floats = new Float32Array(arrayBuffer);
        const t1 = vectorgrid_size*vectorgrid_size*2*(current_parameters["trajectory_length_value"]+1);
        const t2 = 2048*2*(current_parameters["trajectory_length_value"]+1);
        current_nSteps = Math.floor(floats.length / (t1+t2));
        const cutoff = current_nSteps*t2;
        current_trajectories = floats.slice(0, cutoff);
        current_flows = floats.slice(cutoff);
        console.log("Final data recieved, training done.")
      }

    } catch (error) {
      console.error(error);
    }
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
      plotEnv();
    }

    isDraggingMean = false;
    isDraggingVariance = false;
    selectedGaussian = null;
  };
  function plotEnv(){
    if (view === "1. Environment"){
      plotEnvironment(Plotly, plotContainerEnv2d, $gaussians, {title: null});
      plotEnvironment(Plotly, plotContainerEnv3d, $gaussians, {title: null});
    }
  }

  //animation of tutorial runs and loading settings
  function animate_run(run) {
    isRunningAnim = true;
    if (run===1 && run1_value===2048) run1_value = 0;
    if (run===2 && run2_value===4096) run2_value = 0;
    if (run===3 && run3_value===4096) run3_value = 0;
    AnimInterval = setInterval(() => increase_run(run), 500)
  }
  function increase_run(run) {
    if (run===1) run1_value += 64;
    if (run===2) run2_value += 128;
    if (run===3) run3_value += 128;
    console.log("running")
    if (run===1 && run1_value >= 2048) stop_animation_run();
    if (run===2 && run2_value >= 4096) stop_animation_run();
    if (run===3 && run3_value >= 4096) stop_animation_run();
  }
  function stop_animation_run() {
    clearInterval(AnimInterval);
    console.log("stopping")
    isRunningAnim = false;
  }

  function load_pg_settings(run) {
    snackbar_load.open();
    resetSliders();
    resetGaussians();
    if (run>1) {
      gaussians.set(tutorial_gaussians);
      n_iterations_str = "4096";
    }
    if (run>2) {
      off_policy_value = 2.5;
    }
  }






  // Mounting
  onMount(async () => {
    //visualize the environment
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    isMobile = /android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
    await loadPlotly();
    plotlyready = true;
    plotEnv();
    await load_rundata();
    run1_value = 2048; //triggers drawing the plot for the tutorial runs
    run2_value = 4096;
    run3_value = 4096;
    tutorial_env_image = await create_env_image(Plotly, run_data["run3_density"]);
    await loadp5();


    // add listeners for changing the Environment
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopDrag);
    tutorial_flow_observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {

          view = "2. Training"
          if (flowvis_instance) {
            flowvis_instance.remove();
            flowvis_instance = null;
          }

          updateflows = false;
          t_flow_trajectory_step_value=6;
          t_flow_step_value = 4096;
          updateflows = true;

          tutorial_flowvis_instance = createVectorfield(
                  tutorial_flowvis_instance,
                  tutorial_flowContainer,
                  6,
                  run_data["run3_flow"],
                  t_flow_step_value/128,
                  t_flow_trajectory_step_value,
                  tutorial_env_image
          );
        } else {
          if (tutorial_flowvis_instance) {
            tutorial_flowvis_instance.remove();
            tutorial_flowvis_instance = null;
          }
        }
      },
      {
        threshold: 0.1, // 10% visible
        rootMargin: '400px 0px'
      }
    );
    if (tutorial_flowContainer) {
      tutorial_flow_observer.observe(tutorial_flowContainer);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopDrag);
      tutorial_flow_observer.disconnect();
    };
  });

  //Title to display in tab
  document.title = "GFlowNet Playground"









</script>


<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.15.2/dist/katex.min.css" integrity="sha384-MlJdn/WNKDGXveldHDdyRP1R4CTHr3FeuDNfhsLPYrq2t0UBkUdK2jyTnXPEK1NQ" crossorigin="anonymous">
<link
  href="https://fonts.googleapis.com/css2?family=Material+Icons&display=swap"
  rel="stylesheet"
/>

<!-- Save /Load buttons for saving flow and trajectory data

<Fab
  on:click={save_array(current_trajectories)}
  mini
  disabled="{isRunning}"
><Icon class="material-icons" style="font-size: 22px">save</Icon>
</Fab>
<Fab
  on:click={() => load_array("/Data/testrun_flow.json", "Test")}
  mini
  disabled={isRunning}
>
  <Icon class="material-icons" style="font-size: 22px">replay</Icon>
</Fab>
-->

<Snackbar bind:this={snackbar_load} leading>
  <Label>Settings of this training run have been loaded into the playground</Label>
  <Actions>
    <Button on:click={scrollTo(playgroundstart)}>Go to Playground</Button>
  </Actions>
</Snackbar>

<Snackbar bind:this={snackbar_training_done} leading>
  <Label>Training completed</Label>
  <Actions>
    <Button on:click={scrollTo(playgroundstart)}>Go to Playground</Button>
  </Actions>
</Snackbar>



<main class="main-content">

  {#if isMobile}
    <div class="mobile-disclaimer">
      <div class="disclaimer-box">
        <h1>There is no mobile version for the GFlowNet Playground</h1>
        <p>Please visit this website on a desktop device for the best experience.</p>
      </div>
    </div>
  {:else}


    <header class="header-top">
      <div class="container">
        <h1 class="title">GFlowNet Playground</h1>
        <p class="subtitle">Building an intuitive understanding of GFlowNet training</p>
      </div>
    </header>





    <!-- Playground -->

    <div class="pg-background" id="Playground" bind:this={playgroundstart}>
    <div class = "pg-top-background">
    </div>

    <div class="pg-views">
      <TabBar
              tabs={["1. Environment", "2. Training", "3. Flow"]}
              let:tab
              bind:active={view}
      >
        <Tab {tab} disabled={isRunning}>
          <Label>{tab}</Label>
        </Tab>
      </TabBar>
      {#if view === '1. Environment'}


        <!-- Environment View -->
        <div class="pg-container">
          <div class="pg-top">
            <div class="pg-play">
              <Fab
                on:click={() => view="2. Training"} disabled="true"
              >
                <Icon class="material-icons" style="font-size: 50px">keyboard_double_arrow_left</Icon>
              </Fab>
              <Fab
                on:click={resetGaussians}
                mini
                disabled="{isRunning}"
              ><Icon class="material-icons" style="font-size: 22px">replay</Icon>
              </Fab>
              <Fab disabled="true">
                  <Icon class="material-icons" style="font-size: 50px">play_arrow</Icon>
              </Fab>
              <Fab
                on:click={() => view="2. Training"} disabled="{isRunning}"
              >
                <Icon class="material-icons" style="font-size: 50px">keyboard_double_arrow_right</Icon>
              </Fab>
            </div>
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
          <div style="top: 130px; left: 250px; position: absolute;">
            <Wrapper rich>
              <IconButton size="button">
                <Icon class="material-icons">info</Icon>
              </IconButton>
              <Tooltip persistent>
                <Title style="text-align: center">Number of Gaussians</Title>
                <Content style="color: black; font-size: 12px; text-align: left">
                  <br>
                  The reward function is a mixture of Gaussians. Adjust the number of Gaussians for the mixture here.
                </Content>
              </Tooltip>
            </Wrapper>
          </div>

          <div style="top: 230px; left: 30px; position: absolute;">
            Adjust the parameters
          </div>
          <div style="top: 220px; left: 250px; position: absolute;">
            <Wrapper rich>
              <IconButton size="button">
                <Icon class="material-icons">info</Icon>
              </IconButton>
              <Tooltip persistent>
                <Title style="text-align: center">Parameters of the Gaussians</Title>
                <Content style="color: black; font-size: 12px; text-align: left">
                  <br>
                  Here you can adjust the reward function by dragging the grey circles and dots in the plot.
                  The dots represent the means and the circles around them the variances of the Gaussians.
                </Content>
              </Tooltip>
            </Wrapper>
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

          <div style="top: 610px; left: 30px; position: absolute;">
            Parameters
          </div>
          <div style="top: 600px; left: 250px; position: absolute;">
            <Wrapper rich>
              <IconButton size="button">
                <Icon class="material-icons">info</Icon>
              </IconButton>
              <Tooltip persistent>
                <Title style="text-align: center">Parameters of the Gaussians</Title>
                <Content style="color: black; font-size: 12px; text-align: left">
                  <br>
                  The Table shows the parameters of the Gaussians.
                  Each row represents one Gaussian with its mean in x- and y direction as well as its variance.
                  You can also set the values if you want them to be precise.
                </Content>
              </Tooltip>
            </Wrapper>
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

          <div id={plotContainerEnv3d} class = "pg-3dplot">
          </div>
        </div>


      {:else if view === "2. Training"}


        <!-- Training View -->
        <div class="pg-container">
          <div class="pg-top">
            <div class="pg-play">
              <Fab
                on:click={() => view="1. Environment"} disabled="{isRunning}"
              >
                <Icon class="material-icons" style="font-size: 50px">keyboard_double_arrow_left</Icon>
              </Fab>
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
              <Fab
                on:click={() => view="3. Flow"} disabled="{isRunning}"
              >
                <Icon class="material-icons" style="font-size: 50px">keyboard_double_arrow_right</Icon>
              </Fab>

            </div>
            <div class="pg-loss">
              <div class="columns margins" style="justify-content: flex-start; visibility:hidden;">
                <Select bind:value="{loss_choice}" label="Loss" color="primary" disabled="true" style="visibility: hidden" >
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
                    Batch size
                    <div class="hyperparameters">
                      {batch_size_value}
                      <Wrapper rich>
                        <IconButton size="button">
                          <Icon class="material-icons">info</Icon>
                        </IconButton>
                        <Tooltip persistent>
                          <Title style="text-align: center">How many samples to train with</Title>
                          <Content style="color: black; font-size: 12px; text-align: left">
                            <br>
                            Change the batch size to adjust how many samples are created in one iteration during training.
                            Note that a higher batch size leads to longer training time.
                          </Content>
                        </Tooltip>
                      </Wrapper>
                    </div>
                    <Slider
                      bind:value="{batch_size_exponent}"
                      min={3}
                      max={11}
                      step={1}
                      disabled="{isRunning}"
                      input$aria-label="Set the batch size: 2 to the power of n"
                    />
                    <br>
                    <br>
                    Trajectory length
                    <div class="hyperparameters">
                      {trajectory_length_value}
                      <Wrapper rich>
                        <IconButton size="button">
                          <Icon class="material-icons">info</Icon>
                        </IconButton>
                        <Tooltip persistent>
                          <Title style="text-align: center">Fixed number of steps the agent takes</Title>
                          <Content style="color: black; font-size: 12px; text-align: left">
                            <br>
                            Change the trajectory length to adjust how many steps the agent takes.
                            Starting from (0,0), the agent collects the reward after this fixed number of steps.
                            A higher trajectory length tends to give better results, but increases training time.
                          </Content>
                        </Tooltip>
                      </Wrapper>
                    </div>
                    <Slider
                      bind:value="{trajectory_length_value}"
                      min={1}
                      max={10}
                      step={1}
                      disabled="{isRunning}"
                      input$aria-label="Set the length of the trajectory"
                    />
                    <br>
                    <br>
                    Learning rate model
                    <div class="hyperparameters">
                      {lr_model_value.toFixed(4)}
                      <Wrapper rich>
                        <IconButton size="button">
                          <Icon class="material-icons">info</Icon>
                        </IconButton>
                        <Tooltip persistent>
                          <Title style="text-align: center">The learning rate of the forward and backward policies</Title>
                          <Content style="color: black; font-size: 12px; text-align: left">
                            <br>
                            Change the learning rate of the neural nets that represent the forward and backward policy.
                          </Content>
                        </Tooltip>
                      </Wrapper>
                    </div>
                    <Slider
                      bind:value="{lr_model_value}"
                      min={0.0001}
                      max={0.01}
                      step={0.0001}
                      disabled="{isRunning}"
                      input$aria-label="Set the learning rate of the model"
                    />
                    <br>
                    <br>
                    Learning rate logZ
                    <div class="hyperparameters">
                      {lr_logz_value.toFixed(3)}
                      <Wrapper rich>
                        <IconButton size="button">
                          <Icon class="material-icons">info</Icon>
                        </IconButton>
                        <Tooltip persistent>
                          <Title style="text-align: center">The learning rate of the partition function</Title>
                          <Content style="color: black; font-size: 12px; text-align: left">
                            <br>
                            Change the larning rate of the parameter log(Z) which represents the partition function.
                            Malkin et al. (2022) claim that setting this learning rate higher than that of the policies helps in training.
                          </Content>
                        </Tooltip>
                      </Wrapper>
                    </div>
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
                    Off-policy
                    <div class="hyperparameters">
                      {off_policy_value}
                      <Wrapper rich>
                        <IconButton size="button">
                          <Icon class="material-icons">info</Icon>
                        </IconButton>
                        <Tooltip persistent>
                          <Title style="text-align: center">Amount of off-policy training</Title>
                          <Content style="color: black; font-size: 12px; text-align: left">
                            <br>
                            Change to adjust if and to what amount the model trains off-policy.
                            Setting the parameter to 0 is equal to on-policy training.
                            The value gets added to the variance when sampling a new step according to the policy.
                            This leads to higher exploration and is helpful if the modes of the reward function are far apart.
                            The value gets scheduled and decays to 0 during training.
                          </Content>
                        </Tooltip>
                      </Wrapper>
                    </div>
                    <Slider
                      bind:value="{off_policy_value}"
                      min={0}
                      max={3}
                      step={0.1}
                      disabled="{isRunning}"
                      input$aria-label="Set the Off-policy training"
                    />
                    <br>
                    <br>
                    Hidden layers:
                    <div class="hyperparameters">
                      {hidden_layer_value}
                      <Wrapper rich>
                        <IconButton size="button">
                          <Icon class="material-icons">info</Icon>
                        </IconButton>
                        <Tooltip persistent>
                          <Title style="text-align: center">Number of hidden layers in the forward and backward policies</Title>
                          <Content style="color: black; font-size: 12px; text-align: left">
                            <br>
                            Change to adjust the number of hidden layers in the neural nets which represent the policies.
                            Usually shallow networks work fine here and avoid the problems which arise with deeper architectures.
                          </Content>
                        </Tooltip>
                      </Wrapper>
                    </div>
                    <Slider
                      bind:value="{hidden_layer_value}"
                      min={1}
                      max={6}
                      step={1}
                      disabled="{isRunning}"
                      input$aria-label="Set the number of hidden layers"
                    />
                    <br>
                    <br>
                    Hidden layer size
                    <div class="hyperparameters">
                      {hidden_dim_value}
                      <Wrapper rich>
                        <IconButton size="button">
                          <Icon class="material-icons">info</Icon>
                        </IconButton>
                        <Tooltip persistent>
                          <Title style="text-align: center">Dimensions of the hidden layers in the forward and backward policies</Title>
                          <Content style="color: black; font-size: 12px; text-align: left">
                            <br>
                            Change to adjust the size of the hidden layers in the neural nets which represent the policies.
                          </Content>
                        </Tooltip>
                      </Wrapper>
                    </div>
                    <Slider
                      bind:value="{hidden_dim_value}"
                      min={8}
                      max={128}
                      step={8}
                      disabled="{isRunning}"
                      input$aria-label="Set the dimension of the hidden layers"
                    />
                    <br>
                    <br>
                    Seed
                    <div class="hyperparameters">
                      {seed_value}
                      <Wrapper rich>
                        <IconButton size="button">
                          <Icon class="material-icons">info</Icon>
                        </IconButton>
                        <Tooltip persistent>
                          <Title style="text-align: center">Value to seed random number generators with</Title>
                          <Content style="color: black; font-size: 12px; text-align: left">
                            <br>
                            The random number generators will be seeded with this value to allow for reproducible results.
                          </Content>
                        </Tooltip>
                      </Wrapper>
                    </div>
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
              {#if display_trainhistory && !isRunning}
                <div style="position: absolute; bottom: 6px; right: 10px">
                  Iteration: {Math.min(
                        training_step_value*current_parameters["n_iterations_value"]/32,
                        current_losses['losses'].length
                )}
              </div>
              {/if}
            </div>
          </div>
          {#if !display_trainhistory && !isRunning}
            <div class="pg-vis" style="text-align:center; padding:100px; color: #323232;">
              Press Play to start training a GFlowNet
            </div>
          {:else if display_trainhistory && isRunning}
            <div class="pg-vis" id="trainplot">
            </div>
          {:else}
            <div class="pg-vis" id="trainplothist"></div>
          {/if}

          <div class="pg-bottom">
            {#if !isRunning & display_trainhistory}
              <Slider
                bind:value="{training_step_value}"
                min={0}
                max={current_nSteps-1}
                step={1}
                disabled="{isRunning}"
                input$aria-label="View the iterations"
              />
        {:else if isRunning}
          <div class = "pg-progress">
            <LinearProgress progress="{ training_progress / n_iterations_value}" />
          </div>
        {/if}
      </div>
    </div>

      {:else if view === "3. Flow"}
        <!-- FlowView -->
        <div class="pg-container">
          <div class="pg-top">
            <div class="pg-play">
              <Fab
                on:click={() => view="2. Training"} disabled="{isRunning}"
              >
                <Icon class="material-icons" style="font-size: 50px">keyboard_double_arrow_left</Icon>
              </Fab>
              <Fab mini disabled="true">
                <Icon class="material-icons" style="font-size: 22px">replay</Icon>
              </Fab>
              <Fab disabled="true">
                  <Icon class="material-icons" style="font-size: 50px">play_arrow</Icon>
              </Fab>
              <Fab disabled="true">
                <Icon class="material-icons" style="font-size: 50px">keyboard_double_arrow_right</Icon>
              </Fab>
            </div>
          </div>
          {#if display_trainhistory}
            <div class="pg-side">
              <Select bind:value="{flow_vis_type}" label="Visualization" disabled="{isRunning}">
                {#each ["Particles","Vectors"] as select}
                  <Option value={select}>{select}</Option>
                {/each}
              </Select>
              <div style="height:70px"></div>
              Step
              <div class="hyperparameters">
                {flow_trajectory_step_value}
                <Wrapper rich>
                  <IconButton size="button">
                    <Icon class="material-icons">info</Icon>
                  </IconButton>
                  <Tooltip persistent>
                    <Title style="text-align: center">The current step of the agent</Title>
                    <Content style="color: black; font-size: 12px; text-align: left">
                      <br>
                      The policy is learned based on the position (x, y) and the current step. Therefore the flow changes as the agent takes more steps.
                      The number of steps the agent takes is determined by the hyperparameter "Trajectory length".
                      Setting this value to the minimum shows the flow for the first step the agent takes.
                      Setting this value to the maximum shows the flow for the last step before the agent collects the reward.
                      Check the tutorial below for more information how to interpret the flow.
                    </Content>
                  </Tooltip>
                </Wrapper>
              </div>
              <Slider
                bind:value="{flow_trajectory_step_value}"
                min={1}
                max={current_parameters["trajectory_length_value"]}
                step={1}
                disabled="{isRunning}"
                input$aria-label="Set the trajectory step"
              />

              Velocity
              <div class="hyperparameters">
                {flow_velocity_value}
                <Wrapper rich>
                  <IconButton size="button">
                    <Icon class="material-icons">info</Icon>
                  </IconButton>
                  <Tooltip persistent>
                    <Title style="text-align: center">Particle Velocity</Title>
                    <Content style="color: black; font-size: 12px; text-align: left">
                      <br>
                      Adjust the velocity of the particles.
                      This is only an effect for the visualization and does not affect the actual flows.
                    </Content>
                  </Tooltip>
                </Wrapper>
              </div>
                <Slider
                  bind:value="{flow_velocity_value}"
                  disabled="{flow_vectorfield_value}"
                  min={0.1}
                  max={1}
                  step={0.1}
                  discrete
                  input$aria-label="Discrete slider"
                />
              Number of particles
              <div class="hyperparameters">
                {flow_n_particles_value}
                <Wrapper rich>
                  <IconButton size="button">
                    <Icon class="material-icons">info</Icon>
                  </IconButton>
                  <Tooltip persistent>
                    <Title style="text-align: center">Number of particles</Title>
                    <Content style="color: black; font-size: 12px; text-align: left">
                      <br>
                      Adjust the number of particles.
                      This is only an effect for the visualization and does not affect the actual flows.
                    </Content>
                  </Tooltip>
                </Wrapper>
              </div>
                <Slider
                  bind:value="{flow_n_particles_value}"
                  disabled="{flow_vectorfield_value}"
                  min={500}
                  max={2000}
                  step={100}
                  discrete
                  input$aria-label="Discrete slider"
                />

              <div style="position: absolute; bottom: 6px; right: 10px">
                Iteration: {Math.min(
                      flow_step_value*current_parameters["n_iterations_value"]/32,
                      current_losses['losses'].length
              )}


              </div>
            </div>

            <div class="pg-vis">
              <div bind:this={flowContainer}></div>
            </div>
            <div class="pg-bottom">
              <Slider
                bind:value="{flow_step_value}"
                min={0}
                max={current_nSteps-1}
                step={1}
                disabled="{isRunning}"
                input$aria-label="Set the step"
              />
            </div>
          {:else}
            <div class="pg-vis" style="text-align:center; padding:100px; color: #323232;">
              Train a model first to visualize its Flow
            </div>
          {/if}
        </div>
      {/if}
    </div>
      <div class="pg-scrollbutton">
        <Fab
          on:click={scrollTo(tutorialstart)}
          disabled="{isRunning}"
        >
          <Icon class="material-icons">keyboard_arrow_down</Icon></Fab>
      </div>
    </div>





    <section class="section-light" >
      <h2 class="section-title">What is this about?</h2>
      <p class="section-text">
        Here you can explore how GFlowNets learn.
        If you have no idea what a GFlowNet actually is you might want to look into this basic tutorial first to learn more.
        <br>Of course you can always just start exploring!
        <br>
        <br>If you want to start right away, you can adjust the reward function directly in the Environment view. Enter the parameters or drag the circles in the left plot however you wish.
        <br>
        <br>You can then start training in the Training view. Adjust the hyperparameters and press Play to start training a GFlowNet.
        An agent will take a fixed number of steps on the grid and then collect reward according to the previously fixed reward function.
        The visualization shows the final position of an agent. If the training is successful, the distribution of the final samples should match the reward function.
        <br>
        <br>You can view the flow of the trained model in the Flow view. If you want to know more about what the flow shows just continue reading!
      </p>
    </section>
    <section class="section" id="Tutorial" bind:this={tutorialstart}>
      <h2 class="section-title">What is a GFlowNet?</h2>
      <p class="section-text">

        In short, a generative flow network is a model class which allows sampling from an arbitrary probability distribution (similar to MCMC). GFlowNets allow for generating objects with sequentially built compositional structure like trees or graphs.

        <br>We train a model to learn a distribution <Katex>\pi(x)</Katex> (our policy), so we can sample from it. For this, we need a reward function R(x) which assigns value to each final object x and we want <Katex>\pi(x)</Katex> to sample proportional to it:  <Katex>\pi(x) \propto R(x)</Katex>. This allows us later on to sample a diversity of solutions instead of just the reward-maximizing one.

        <br>As we do not rely on a external dataset but only on our internal reward function we are only limited by compute - we can generate objects and query the reward function as often as we like.

      </p>
        <div class="image-container">
          <Accordion multiple>
            <Panel color="secondary">
              <Header>Too fast? Expand for an example and more introduction</Header>
              <Content>
                Imagine building a Lego Pyramid. There are different blocks, and you can place them rotated and at different places.
                <br>You might start with an empty plane,add a 2x4 block and so on. After some steps you might end up with an object which is more or less pyramid-shaped.
                <br>
                <br>The different possibilities of states of the object form a graph: While in the beginning (state 0) you can only place something in the first level, later on you might have different options, and they depend on your first choices. One option is always to choose to be finished instead of continuing building.
                <br>
                <br>If you want to use a GFlowNet for your task, it is important that the resulting graph is acyclic, i.e. it is not possible to reach a previous state. In terms of our pyramid this means taking away blocks is not possible.
                <br>If we built a pyramid, in the end we have a trajectory (a sequence of states <Katex>s_0 \to s_1 \to ... \to s_{"T"}</Katex>). As we can choose to stop anytime, our trajectories can have different lengts, e.g. we can build a pyramid from 1 piece or from 100.
                <br>
                <br>As you might have guessed from the vocabulary, GFlowNets are very similar to Reinforcement learning methods, we sample trajectories and assign a reward R(x) to them (or to the states). The main difference is that usual RL methods try to find solutions which maximize the reward, whereas GFlowNets learn the underlying distribution p(x). So we want to train a model such that p(x) is proportional to the reward function R(x). This allows us to sample not only from the mode which has the highest reward, but also all other modes which might be almost as good.
                Imagine a pyramid which contains 2x4 blocks, we could just replace them with 2 2x2 blocks. Both options are valid and we might be interested in finding many possible ways to build pyramids.
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
        Assuming all flow is stricly positive, we can express the Flow from one state s to its children s' as:


        <Katex displayMode>
          \sum_{"{s'}"} F(s,s') = \sum_{"{s'}"} R(s') + F(s')
        </Katex>
        <span class="mathexpl">The total Flow of a state is the Reward of its terminal children plus the Flow of its non-terminal children</span>


        We now define our forward policy as the proportion of the Flow
        <Katex>
          s \to s'
        </Katex> to the total Flow of s:
        <Katex displayMode>
        P_F(s'|s) = \frac{"{F(s,s')}{F(s)}"}
        </Katex>
        <span class="mathexpl"> The probability to sample an action to get to the next state s' is the flow going from s to s' divided by the total flow through s</span>
        By using this policy we will sample finished objects x proportional to their reward.

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
        <br>For each action, the GFlowNet takes a step along both the x and y direction, this is repeated until the defined length of a trajectory is reached.
        Note that this is unusual: GFlowNets allow for variable trajectory lengths, so the action space usually contains an additional end of sequence action, where the current state becomes the final state.
        However fixing the trajectory length keeps everything a lot simpler.
        <br>
        <br>Above we stated that GFlowNets build an Acyclic Graph, so each state can only be visited once. We currently violate this assumption: While it is unlikely that a state gets visited twice in our continuous environment, it is still possible. To mitigate this we simply include a counter in our state which represents the current step.
        We also simplified the variance of the gaussians to one parameter, so the variance for x and y is the same and there is no covariance (<Katex>\Sigma = \sigma^2 I</Katex>).
    </section>





    <section class="section section-light">
      <h2 class="section-title">Training</h2>
      <p class="section-text">
        Now, how do we train a GFlowNet?
        <br>First we need our model to be able to act in the environment.
        To do this we let it predict the parameters of a distribution from which we then sample the actions.
        To move, we simply add the action to the current state to get the next state.
        <br>That was the easy part.
        We now want to train our GFlowNet using Trajectory Balance loss. Here it is again:
        <Katex displayMode>
        L(\tau) = \log\left(\frac{"{Z_{\\theta}\\prod_t P_F(s_{t+1}|s_t;\\theta)}"}{"{R(x)\\prod_t P_B(s_t|s_{t+1}; \\theta)}"} \right)^2
        </Katex>
        <span class="mathexpl">The trajectory balance loss. <br> If both parts of the fraction are equal our loss goes to 0.</span>
        We want the two parts of the fraction to be equal again.
        Simply put, the upper part tells us what fraction of the total flow goes through this trajectory and the lower part tells us what fraction of the reward of the final object x goes through this trajectory.
        <br>Here <Katex>\theta</Katex> are the parameters of the model. They include the parameters of <Katex>P_F, P_B, Z</Katex> and we can update them using the loss above.
        <br>Below you find more detailed background for the parts of the trajectory balance loss as well as the algorithm for training.
      </p>
      <div class="image-container">
        <Accordion multiple>
          <Panel color="secondary">
            <Header>More Trajectory Balance</Header>
            <Content>
              Let's look at the parts of this loss function:
              <ul>
                <li>
                  <Katex>P_F(s_{"t+1"}|s_t;\theta)</Katex>
                  The forward policy. It represents the distribution over the next states (the children) of the current state.
                </li>
                <li>
                  <Katex>P_B(s_t|s_{"t+1"};\theta)</Katex>
                  The backward policy. Similar to the definition of the forward policy, we can define the backward policy as a distribution over the previous states (the parents) of a state.
                  We can also estimate it using a NN (not the same as for the forward policy). The reason both policies are different is the DAG structure. In a tree these would be the same. But as there are different ways to traverse the DAG from one state to the other, these policies might differ.
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
          <Panel color="secondary"> <!--bind:open={panel_algo}>-->
            <Header>
              The algorithm
              <!--
              <IconButton toggle bind:pressed="{panel_algo}"on:click={panel_algo=!panel_algo} >
                <Icon class="material-icons"  on>expand_less</Icon>
                <Icon class="material-icons">expand_more</Icon>
              </IconButton>
              -->
            </Header>

            <Content style="white-space: pre;">
                Input: Reward function (part of the environment), model, hyperparameters
                <br>  1. Initialize model parameters for PF, PB, logZ
                <br>  2. Repeat for a number of iterations or until convergence:
                <br>  3.  -   Repeat for trajectory length:
                <br>  4.  -     -   Sample action for current state from PF
                <br>  5.  -     -   Take step according to action
                <br>  6.  -     -   Add new state to trajectory
                <br>  7.  -   Calculate reward of final state according to reward function
                <br>  8.  -   Calculate the sum of the log probabilities of all actions of the trajectory for each PF and PB
                <br>  9.  -   Calculate the TB-Loss: (logZ + log probabilities PF - log probabilities PB - log reward)^2
                <br>  10. -  Update the parameters PF, PB, logZ
                <br><br>
              You can find the python code for this implementation on my <a href="https://github.com/florianholeczek/ugfn" target="_blank">github</a>.
            </Content>
          </Panel>
        </Accordion>
      </div>
      <p class="section-text">
        We trained a GFlowNet on this environment for 2000 Iterations.
        Below you see the progress of the model during training. While it first samples randomly, it learns to match the true distribution of our environment.


      </p>
      <div id="runplot1" style="display: flex; justify-content: center;"></div>
      <div style="width: 700px; margin: auto; text-align:center;display:flex; margin-top: 10px">
        <div style="width:56px; margin-right:20px">
          <Fab
            on:click={isRunningAnim ? stop_animation_run() : animate_run(1)}
            disabled={isRunning}
          >
            {#if isRunningAnim}
              <Icon class="material-icons" style="font-size: 50px">stop</Icon>
            {:else}
              <Icon class="material-icons" style="font-size: 50px">play_arrow</Icon>
            {/if}
          </Fab>
        </div>
        <Textfield
          bind:value={run1_value}
          on:change={(e) => runs_textinput(e,1)}
          label="Iteration"
          disabled={isRunningAnim}
          type="number"
          input$step="64"

        ></Textfield>
        <div style="width: 550px; margin-top:10px">
          <Slider
            bind:value="{run1_value}"
            min={0}
            max={2048}
            step={64}
            discrete
            input$aria-label="Discrete slider"
          />
        </div>
      </div>
      <div style="width: 600px; margin: auto; text-align:center">
        <Button on:click={() =>load_pg_settings(1)} disabled={isRunning}>
          <Label>Use these Settings</Label>
        </Button>
      </div>


      <div style="height:50px"></div>
      <p class="section-text">
        Sampling according to the underlying distribution is one of the big advantages of GFlowNets: Other approaches usually learn to maximize the reward, so they would not sample from both of our modes (or everything in between), but they would find one of them and then just sample from it. This might be suboptimal e.g. in molecule discovery, where you might not want the most promising molecule, but many different of them might be interesting.
      </p>


      <h2 class="section-title">Mode Collapse</h2>
      <p class="section-text">
        So far, our distribution to match was very easy. Lets make it more challenging: If we lower the variance, we see the two modes are more seperated.
      </p>
      <div id="runplot2" style="display: flex; justify-content: center;"></div>
      <div style="width: 600px; margin: auto; text-align:center;">
      <Slider
          bind:value="{run2_value}"
          min={0}
          max={4096}
          step={128}
          discrete
          input$aria-label="Discrete slider"
        />
        <Button on:click={() =>load_pg_settings(2)} disabled={isRunning}>
          <Label>Use these Settings</Label>
        </Button>
      </div>
      <p class="section-text">
        Well, thats not what we want! Instead of sampling from the true distribution we only sample from one mode!
        <br><br>
        There are two main possibilities to fix this:
        <span class="li">We could introduce a temperature parameter <Katex>\beta</Katex> into our reward function:<Katex>R_{"{new}"}(x)=R(x)^\beta</Katex>. This would change the "peakyness" of the reward function and we would not sample proportional to the reward function but according to <Katex>\pi(x|\beta) \propto R(x)^\beta</Katex>. It is also possible to use <Katex>\beta</Katex> as a trainable parameter and condition the model on it.</span>
        <span class="li">A similar but simpler way is to just train off-policy. By adding a fixed variance to the logits of the forward policy, we explore more during training. As this is a very easy implementation let's go with this one.</span>
      </p>
      <div class="image-container">
        <Accordion multiple>
          <Panel color="secondary">
            <Header>Changes to the algorithm</Header>
            <Content>
              Training off-policy is even more helpful when we schedule it. We start with a higher variance and scale it down during training until we reach on-policy training.
              <br>Our new hyperparameter is the initial value for off policy training, during each step we gradually decrease it until we reach 0.
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
      <div id="runplot3" style="display: flex; justify-content: center;"></div>
      <div style="width: 600px; margin: auto; text-align:center;">
      <Slider
          bind:value="{run3_value}"
          min={0}
          max={4096}
          step={128}
          discrete
          input$aria-label="Discrete slider"
        />
        <Button on:click={() =>load_pg_settings(3)} disabled={isRunning}>
          <Label>Use these Settings</Label>
        </Button>
      </div>
      <p class="section-text">
        It took some iterations, but now we match the distribution again.
      </p>

    </section>

    <section class="section" style="box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);">
      <h2 class="section-title">Flow</h2>
      <p class="section-text">
        Below you can see the flow the last training run.
        <br>
        Use the Step slider to adjust the current step. We fixed the number of steps for the agent at 6, so it collects the reward after 6 steps on the grid.
        <br>
        Use the Iteration Slider to compare the flow at the start of the training to the end.
        <br>
        <br>
        You see that for the trained model (last iteration) the flow is different depending on the step. In the first step the agent takes, it tends to move to the center. Later on in the trajectory the points of convergence split up and move outwards to the modes of the distribution.
      </p>

      <div class="flow-container">
        <div bind:this={tutorial_flowContainer}></div>
      </div>
      <div style="width: 600px; margin: auto; display: flex; align-items: center;">
        <div style="text-align: left; margin-right: 10px;">
          <span>Step: {t_flow_trajectory_step_value}</span>
        </div>
        <div style="width: 480px; margin-left: auto;">
          <Slider
            bind:value="{t_flow_trajectory_step_value}"
            min={1}
            max={6}
            step={1}
            discrete
            input$aria-label="Discrete slider"
          />

        </div>
      </div>
      <div style="width: 600px; margin: auto; display: flex; align-items: center;">
        <div style="text-align: left; margin-right: 10px;">
          <span>Iteration: {t_flow_step_value}</span>
        </div>
        <div style="width: 480px; margin-left: auto;">
          <Slider
            bind:value="{t_flow_step_value}"
            min={0}
            max={4096}
            step={128}
            discrete
            input$aria-label="Discrete slider"
          />
        </div>
      </div>
      <h2 class="section-title">Flow - Is this what it looks like?</h2>
      <p class="section-text">
        Well, kind of. Imagine our grid would be discrete. If we are in one cell, we would have a certain Flow (a non-negative scalar) to each other cell (technically also to itself given our trick with adding the step to the state).
        <br>Even in a discrete space, this is hard to visualize, as we would have to compute the flow from each state to every other state.
        <br>In our continuous space this gets even more complicated, not only in terms of visualization but also mathematically - look into Lahlou et al. (2023) if you are interested.
        <br>Instead of showing all the flows, the plot shows the <i>highest</i> flow for each state: This is a vector from it to another point on the grid.
        If we do that for some evenly spaced points we get a vectorfield. The visualization above is just a nicer way to show it by letting particles move through the field.
        Note that the path of the particels is not the path of the agents. The particles follow the most probable direction continuously, while the agent takes discrete steps not in the most probable direction but following the distribution of the policy.
        Therefore the trajectories jump around more. This visualization however shows the converging points in the flowfield which direct the agents movement.
      </p>

      <h2 class="section-title" style="position:relative">What next?</h2>
      <div class="whatnext_t">
        <div class="whatnext_b">Train your own GFlowNets? <br> Go to the top</div>
        <div class="whatnext_b">Interested in the code? <br>Find it here</div>
        <div class="whatnext_b">Learn more about GFlowNets?<br>Find other tutorials</div>
      </div>



      <div style="position:absolute; width:1000px; left: 50%;transform: translateX(-50%); ">
        <div class="whatnext_t" >
          <div class="whatnext_b">
            <Fab
            on:click={scrollTo(playgroundstart)}
            disabled="{isRunning}"
          >
            <Icon class="material-icons">keyboard_arrow_up</Icon></Fab>
          </div>
          <div class="whatnext_b">
            <a href={"https://github.com/florianholeczek/ugfn"} target="_blank" rel="noopener noreferrer" class="github-button">
              <Fab>
                <Icon tag="svg">
                  <svg
                    class="github-icon"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M12 0.297C5.373 0.297 0 5.67 0 12.297c0 5.3 3.438 9.8 8.207 11.387.6.11.793-.26.793-.577v-2.17c-3.338.724-4.033-1.61-4.033-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.743.082-.727.082-.727 1.205.085 1.84 1.24 1.84 1.24 1.07 1.835 2.807 1.305 3.493.997.108-.776.418-1.305.76-1.605-2.667-.303-5.467-1.333-5.467-5.93 0-1.31.467-2.384 1.235-3.223-.123-.303-.535-1.524.117-3.176 0 0 1.007-.323 3.3 1.23a11.42 11.42 0 013.003-.404c1.018.005 2.042.137 3.003.404 2.29-1.553 3.296-1.23 3.296-1.23.654 1.652.242 2.873.12 3.176.77.839 1.233 1.913 1.233 3.223 0 4.607-2.805 5.624-5.478 5.92.43.373.814 1.102.814 2.22v3.293c0 .32.19.693.8.576C20.565 22.094 24 17.595 24 12.297 24 5.67 18.627.297 12 .297z"
                    />
                  </svg>
                </Icon>
              </Fab>
            </a>

          </div>
          <div class="whatnext_b">
            <Fab
            on:click={scrollTo(sourcesstart)}
            disabled="{isRunning}"
          >
            <Icon class="material-icons">keyboard_arrow_down</Icon></Fab>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
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
        If you want to learn more about GFlowNets have a look into the literature and tutorials below.
        <br><br><br><br>
        Author: Florian Holeczek
        <br>Created as seminar project in the MSc program Artificial Intelligence at JKU Linz
      </p>

    </section>


    <section class="section" id="Sources" bind:this={sourcesstart}>
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
          <br><br>
          Lahlou, S., Deleu, T., Lemos, P., Zhang, D., Volokhova, A., Hernández-Garcıa, A., ... & Malkin, N. (2023, July). A theory of continuous generative flow networks. In International Conference on Machine Learning (pp. 18269-18300). PMLR.
        </p>
      <h3 class="section-title3">Tutorials</h3>
        <p class="section-text">
          <a href="https://milayb.notion.site/The-GFlowNet-Tutorial-95434ef0e2d94c24aab90e69b30be9b3" target="_blank">MILA Tutorial (Theory)</a>
          <br><br>
          <a href="https://colab.research.google.com/drive/1fUMwgu2OhYpQagpzU5mhe9_Esib3Q2VR" target="_blank">MILA Tutorial (Code)</a>

          <br><br>
          <a href="https://github.com/GFNOrg/torchgfn/blob/master/tutorials/notebooks/intro_gfn_continuous_line_simple.ipynb" target="_blank">Continuous Line Tutorial</a>

        </p>
      <h3 class="section-title3">GFlowNet Libraries</h3>
        <p class="section-text">
          <a href="https://github.com/alexhernandezgarcia/gflownet" target="_blank">https://github.com/alexhernandezgarcia/gflownet</a>
          <br><br>
          <a href="https://github.com/GFNOrg/torchgfn" target="_blank">https://github.com/GFNOrg/torchgfn</a>
          <br><br>
          <a href="https://github.com/augustwester/gflownet" target="_blank">https://github.com/augustwester/gflownet</a>
        </p>
    </section>
  {/if}
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
