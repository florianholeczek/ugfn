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
  import {plot_discrete, plot_continuous} from "./DC_vis.js"
  import {nodeById, edgeById, previousStatesFormula, nextStatesFormula, previousStatesValues, nextStatesValues} from "./DAG.js"
  import {policyFormula, policyValue, lossValue} from "./DAG.js"
  import { initMoleculeFlow } from './molecule_flow.js';
  import {nodes, edges} from "./DAG.js"
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
  import { flow_velocity, flow_n_particles,flow_vectorfield, flow_vectors, flow_changed, A_molecule_prop} from './store.js';



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
  let n_iterations_str = "4096";
  $: n_iterations_value = parseInt(n_iterations_str, 10);
  let losses_select = ["Trajectory Balance", "Flow Matching"];
  let view = "1. Environment";
  let showTooltip = false;

  let vectorgrid_size=31;

  // ranges for means and variances
  const range = { min: -3, max: 3 };
  const varianceRange = { min: 0.1, max: 1.0 };

  // flow visualization
  let flow_velocity_value = 0.5;
  let flow_n_particles_value = 1000;
  let flow_vectorfield_value = false; //for toggling between vector and flow vis
  let flow_vis_type = "Particles" //for UI of vectorfield_value
  let flow_trajectory_step_value = 1; //Trajectory slider
  let t_flow_step_value = 0; //as above for the Tutorial Flow vis
  let t_flow_trajectory_step_value = 1;

  // PG iteration slider and textfield for flow and training view.
  // complicated as steps may not be regular if training is stopped early
  let training_step_value_slider = 0;
  let training_step_value_text = 0;
  let training_step_value_update = false;
  let flow_step_value_slider = 0;
  let flow_step_value_text = 0;
  let flow_step_value_update = false;

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
  current_parameters["n_iterations_value"] = 4096
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

  //Discrete Continuous section
  let DC_view=0;
  let stopContinuousAnimation;
  let stopDiscreteAnimation;

  //other
  let session_id = null; // for handling multiple training sessions of multiple users
  let isMobile = false; // to display mobile disclaimer
  const BACKEND_URL = ""//process.env.BACKEND_URL ?? ""; //"https://back:8000";
  const POLLING_INTERVAL = 100; //polling every n ms




  // reactive
  $: DC_viewchange(DC_view);
  function DC_viewchange(v){
    if (plotlyready){
      console.log(v)
      // Stop previous animations before purging
      if (stopContinuousAnimation) stopContinuousAnimation();
      if (stopDiscreteAnimation) stopDiscreteAnimation();
      Plotly.purge("DC_continuous_plot");
      stopContinuousAnimation = plot_continuous(Plotly, v);
      Plotly.purge("DC_discrete_plot");
      stopDiscreteAnimation = plot_discrete(Plotly, v);
    }
  }
  $:run1_plot(run1_value);
  function run1_plot(v) {
    const check = (v % 128 === 0) && v>=0 && v <=4096
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
  $: plot_traininghist(training_step_value_slider);
  function plot_traininghist(step) {
    if (!isRunning && display_trainhistory){
      let iter = Math.min(step*current_parameters["n_iterations_value"]/32,
                      current_losses['losses'].length)
      if (!training_step_value_update) {
        training_step_value_update = true;
        training_step_value_text = iter;
        training_step_value_update = false;
      }
      let trajectory_temp = slice_trajectories(step,current_parameters["trajectory_length_value"],current_trajectories);

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
          if (flowvis_instance) {
            flowvis_instance.remove();
            flowvis_instance = null;
          }
          plotEnv();
        } else if (view ==="2. Training"){
          //to prevent loading the tooltip too early as mouse hovers over next/prev buttons
          showTooltip = false;
            setTimeout(() => {
              showTooltip = true;
            }, 100);

          if (flowvis_instance) {
            flowvis_instance.remove();
            flowvis_instance = null;
          }
          plot_traininghist(training_step_value_slider)
        } else {
          if(display_trainhistory){
            updateflows=false;
            flow_step_value_slider=current_nSteps-1
            flow_trajectory_step_value=current_parameters["trajectory_length_value"]
            updateflows=true;
            flowvis_instance = createVectorfield(
                    flowvis_instance,
                    flowContainer,
                    current_parameters["trajectory_length_value"],
                    current_flows,
                    flow_step_value_slider,
                    flow_trajectory_step_value,
                    current_env_image
            );
          }

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
          flow_step_value_slider,
          flow_trajectory_step_value,
          t_flow_step_value,
          t_flow_trajectory_step_value
  );
  function update_flowparameters(
          velocity,
          nParticles,
          vectorfield,
          flow_step_value_slider,
          flow_trajectory_step_value,
          t_flow_step_value,
          t_flow_trajectory_step_value
  ) {
    if(((view === "3. Flow" && flowvis_instance) || (tutorial_flowvis_instance)) && updateflows){
      flow_velocity.set(velocity);
      flow_n_particles.set(nParticles);
      flow_vectorfield.set(vectorfield);
      if (flowvis_instance) {
        if (!flow_step_value_update) {
          flow_step_value_update = true;
          flow_step_value_text = Math.min(flow_step_value_slider*current_parameters["n_iterations_value"]/32,
                      current_losses['losses'].length);
          flow_step_value_update = false;
        }

        flow_vectors.set(slice_flows(
              flow_step_value_slider,
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
      n_iterations_str = "4096";
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
  async function loadONNX() {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js';
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
    let d = 128;
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
    let d = 128;
    let value = parseInt(e.target.value);
    if (isNaN(value)) value=0;
    value = value - (value % d)
    value = Math.min(d*32, Math.max(0, value));
  }

  function training_step_textinput(e){
    let value = parseInt(e.target.value);
    let d = current_parameters["n_iterations_value"]/32;
    if (isNaN(value)) value=0;
    value = Math.min(current_losses['losses'].length, Math.max(0, value));
    if (value<current_losses['losses'].length) value = Math.floor(value / d);
    if (!training_step_value_update) {
        training_step_value_update = true;
        training_step_value_slider = value;
        training_step_value_update = false;
      }
  }
  function flow_step_textinput(e){
    let value = parseInt(e.target.value);
    let d = current_parameters["n_iterations_value"]/32;
    if (isNaN(value)) value=0;
    value = Math.min(current_losses['losses'].length, Math.max(0, value));
    if (value<current_losses['losses'].length) value = Math.floor(value / d);
    if (!flow_step_value_update) {
        flow_step_value_update = true;
        flow_step_value_slider = value;
        flow_step_value_update = false;
      }
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
          training_step_value_slider = 0;
          await tick();
          isRunning = false;
          await tick();
          snackbar_training_done.open();
          training_step_value_slider = current_nSteps-1; //also triggers plot for trainhistory
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
        gs.push({ mean: { x: gs.length -1, y: 0 }, variance: 0.4 });
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
    if (run===1 && run1_value===4096) run1_value = 0;
    if (run===2 && run2_value===4096) run2_value = 0;
    if (run===3 && run3_value===4096) run3_value = 0;
    AnimInterval = setInterval(() => increase_run(run), 500)
  }
  function increase_run(run) {
    if (run===1) run1_value += 128;
    if (run===2) run2_value += 128;
    if (run===3) run3_value += 128;
    if (run===1 && run1_value >= 4096) stop_animation_run();
    if (run===2 && run2_value >= 4096) stop_animation_run();
    if (run===3 && run3_value >= 4096) stop_animation_run();
  }
  function stop_animation_run() {
    clearInterval(AnimInterval);
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

  //DAG Handling




  let hoveredNode= null;
  let hoveredEdge = null;

  $: nodeColors = {};
  $: {
    for (const node of nodes) {
      if (!hoveredNode) {
        nodeColors[node.id] = 'gray';
      } else if (node.id === hoveredNode) {
        nodeColors[node.id] = '#d95f02';
      } else if (edges.some(e => e.to === hoveredNode&& e.from === node.id)) {
        nodeColors[node.id] = '#1b9e77';
      } else if (edges.some(e => e.from === hoveredNode&& e.to === node.id)) {
        nodeColors[node.id] = '#7570b3';
      } else {
        nodeColors[node.id] = 'gray';
      }
    }
  }
  $: edgeColors = {};
  $: {
    for (const edge of edges) {
      const key = edge.from + '-' + edge.to;

      if (hoveredEdge) {
        if (edge.from === hoveredEdge.from && edge.to === hoveredEdge.to) {
          edgeColors[key] = '#d95f02'; // the edge being hovered
        } else if (edge.from === hoveredEdge.from) {
          edgeColors[key] = '#1b9e77'; // same source node
        } else {
          edgeColors[key] = 'gray';
        }
      } else if (hoveredNode) {
        if (edge.to === hoveredNode) {
          edgeColors[key] = '#1b9e77';
        } else if (edge.from === hoveredNode) {
          edgeColors[key] = '#7570b3';
        } else {
          edgeColors[key] = 'gray';
        }
      } else {
        edgeColors[key] = 'gray';
      }
    }
  }

  let TB_path = ['s0'];
  let TB_trajectory_complete = false;

  function TB_nodeById(id) {
    return nodes.find(n => n.id === id);
  }

  function TB_outgoingEdges(nodeId) {
    return edges.filter(e => e.from === nodeId);
  }

  function TB_isActive(nodeId) {
    if (TB_path.length === 0 && nodeId === 's0') return true;
    const last = TB_path[TB_path.length - 1];
    return TB_outgoingEdges(last).some(e => e.to === nodeId);
  }

  function TB_handleClick(nodeId) {
    if (TB_trajectory_complete && !TB_path.includes(nodeId)) return;

    const indexInPath = TB_path.indexOf(nodeId);

    if (indexInPath !== -1) {
      // Node already in path: trim back to this point
      TB_path = TB_path.slice(0, indexInPath + 1);
      TB_trajectory_complete = TB_nodeById(nodeId)?.final ?? false;
      return;
    }

    const last = TB_path[TB_path.length - 1];
    const validNext = TB_outgoingEdges(last).some(e => e.to === nodeId);

    if (validNext) {
      TB_path = [...TB_path, nodeId];
      const node = TB_nodeById(nodeId);
      if (node?.final) TB_trajectory_complete = true;
    }
  }


  let TB_nodeColors = {};
  let TB_edgeColors = {};
  $: TB_set_colors(TB_path);
  function TB_set_colors(path) {
    const newNodeColors = {};
    const newEdgeColors = {};

    for (const node of nodes) {
      if (path.includes(node.id)) {
        newNodeColors[node.id] = '#d95f02';
      } else if (TB_isActive(node.id)) {
        newNodeColors[node.id] = '#7570b3';
      } else {
        newNodeColors[node.id] = '#b8b8b8';
      }
    }

    for (const edge of edges) {
      const fromIndex = path.indexOf(edge.from);
      const toIndex = path.indexOf(edge.to);

      if (fromIndex !== -1 && toIndex === fromIndex + 1) {
        newEdgeColors[edge.from + '-' + edge.to] = '#d95f02';
      } else if (path.length && edge.from === path[path.length - 1]) {
        newEdgeColors[edge.from + '-' + edge.to] = '#7570b3';
      } else {
        newEdgeColors[edge.from + '-' + edge.to] = '#b8b8b8';
      }
    }

    TB_nodeColors = newNodeColors;
    TB_edgeColors = newEdgeColors;
  }

  let TB_current = {pf: 0, pb: 0, z:10};

  function TB_calculate_PF () {
    let form = "";
    let calc = "";
    let res = 1;
    for (let i = 0; i < TB_path.length-1; i++) {
      let edge = edgeById(TB_path[i],TB_path[i+1]);
      let denom = edges
        .filter(e => e.from === edge.from)
        .map(e => `${e.flow}`)
        .join(' + ');

      form = form + `P_F(${TB_path[i+1][0]}_${TB_path[i+1][1]}|${TB_path[i][0]}_${TB_path[i][1]})`;
      calc = calc + `\\frac{${edge.flow}}{${denom}}`
      if (i !== TB_path.length-2) {
        form = form + ` \\cdot `;
        calc = calc + ` \\cdot `;
      }
      res = res * (edge.flow / edges
        .filter(e => e.from === edge.from)
        .reduce((sum, e) => sum + e.flow, 0));
    }
    TB_current.pf =res.toFixed(3);
    return form + "=" + calc + "=" + TB_current.pf;
  }

  function TB_calculate_PB () {
    let form = "";
    let calc = "";
    let res = 1;
    for (let i = TB_path.length-1; i > 0; i--) {
      let edge = edgeById(TB_path[i-1],TB_path[i]);
      let denom = edges
        .filter(e => e.to === edge.to)
        .map(e => `${e.flow}`)
        .join(' + ');

      form = form + `P_B(${TB_path[i-1][0]}_${TB_path[i-1][1]}|${TB_path[i][0]}_${TB_path[i][1]})`;
      calc = calc + `\\frac{${edge.flow}}{${denom}}`
      if (i !== 1) {
        form = form + ` \\cdot `;
        calc = calc + ` \\cdot `;
      }
      res = res * (edge.flow / edges
        .filter(e => e.to === edge.to)
        .reduce((sum, e) => sum + e.flow, 0));

    }
    TB_current.pb =res.toFixed(3);
    return form + "=" + calc + "=" + TB_current.pb;
  }



  // Mounting
  onMount(async () => {
    //visualize the environment
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    isMobile = /android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
    await loadPlotly();
    plotlyready = true;
    plotEnv();
    plot_discrete(Plotly);
    plot_continuous(Plotly, 0);
    await load_rundata();
    run1_value = 4096; //triggers drawing the plot for the tutorial runs
    run2_value = 4096;
    run3_value = 4096;
    tutorial_env_image = await create_env_image(Plotly, run_data["run3_density"]);
    await loadp5();
    await loadONNX();
    if (typeof initMoleculeFlow === 'function') {
      initMoleculeFlow('#chart');
    } else {
      console.error('initMoleculeFlow is not defined');
    }


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
  document.title = "GFlowNet Playground";

  onMount(() => {
    if (typeof initFlowConservationDemo === 'function') {
      initFlowConservationDemo();
    }
  });


  function A_maximizeMw() {
    A_molecule_prop.update((weights) => {
      const newWeights = {};

      // Set all keys to 0
      for (const key in weights) {
        newWeights[key] = 0;
      }

      // Set mw to 1
      newWeights.mw = 1;

      return newWeights;
    });
  }


</script>








<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.15.2/dist/katex.min.css" integrity="sha384-MlJdn/WNKDGXveldHDdyRP1R4CTHr3FeuDNfhsLPYrq2t0UBkUdK2jyTnXPEK1NQ" crossorigin="anonymous">
<link
  href="https://fonts.googleapis.com/css2?family=Material+Icons&display=swap"
  rel="stylesheet"
/>

<!-- Save /Load buttons for saving flow and trajectory data

<Fab
  on:click={saveJSON}
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
    <div class="authors-section">
      <hr class="line" />

      <div class="authors-grid">
        <div class="hd">AUTHOR</div>
        <div class="hd">AFFILIATION</div>

        <div class="cell1">Florian Holeczek</div>
        <div class="cell2">Johannes Kepler University Linz</div>
        <div class="cell1">Alexander Hillisch</div>
        <div class="cell2">Johannes Kepler University Linz</div>
        <div class="cell1">Andreas Hinterreiter</div>
        <div class="cell2">Johannes Kepler University Linz</div>
        <div class="cell1">Alex Hernandez-Garcia</div>
        <div class="cell2">Université de Montréal</div>
        <div class="cell1">Marc Streit</div>
        <div class="cell2">Johannes Kepler University Linz</div>
        <div class="cell1">Christina Humer</div>
        <div class="cell2">ETH Zürich / Johannes Kepler University Linz</div>
      </div>

      <hr class="line" />
    </div>
    <section class="section">
      <p class="section-text">
        Imagine you want to discover new molecules for a life-saving drug.
        The space of possible molecular structures is vast, with promising candidates often being potentially sparse and difficult to find.
        Traditional methods might guide you to a single best guess, but what if this guess has side effects, or fails in a later stage of testing?
        What if you need many diverse, high-quality candidates to test?
        This is where Generative Flow Networks (GFlowNets) come in.
        They are a class of generative models that don't just aim for a single optimal solution—they aim to diversely sample from a space of possibilities, with a preference for high-reward outcomes.
        <br>
        Below we present a <b>Tutorial</b> that introduces the core concepts behind GFlowNets, their theoretical foundations, and common pitfalls during training.
        We also provide a <b>Playground</b> for experimenting with GFlowNet training.
        It provides an interactive environment to explore how GFlowNets adapt to changes in both reward functions and training hyperparameters.
      </p>
    </section>












    <section class="section" id="Tutorial" bind:this={tutorialstart}>
      <h2 class="section-title">What is a GFlowNet?</h2>
      <h2 class="annotations-header">Flo</h2>
      <p class="section-annotation">
        In short, a generative flow network is a model class that allows sampling proportional to an unknown distribution.
        In this, it is similar to Markov Chain Monte Carlo, but offers some advantages regarding compute and sparse environments.
        GFlowNets enable the generation of objects with sequentially built compositional structures, such as trees or graphs. They construct the final object stepwise.

        <br>
        If we have a reward function <Katex>R(x)</Katex>, which assigns value to each final object <Katex>x</Katex>,
        we can train a model that learns to sample proportional to the reward.
        This allows us to sample a diversity of solutions later on, instead of just the reward-maximizing one.
        As we do not rely on an external dataset but only on our internal reward function, we are only limited by compute.
        Thus we can generate objects and query the reward function as often as we like.

      </p>
        <div class="image-container">
          <Accordion>
            <Panel color="secondary">
              <Header>Too fast? Expand for an example and a more detailed introduction</Header>
              <Content>
                Imagine building a Lego Pyramid. There are different blocks, and you can place them at various angles and locations.
                <br>You might start with an empty plane, add a 2x4 block, and so on.
                After some steps, you might end up with an object that is more or less pyramid-shaped.
                <br>
                <br>The different possibilities of states of the object form a graph:
                While in the beginning (state 0) you can only place something in the first level,
                later on, you might have different options, and they depend on your first choices.
                One option is always to choose to be finished instead of continuing to build.
                <br>
                <br>If you want to use a GFlowNet for your task, it is important that the resulting graph is acyclic,
                i.e., it is not possible to reach a previous state.
                In terms of our pyramid, this means that taking away blocks is not possible.
                <br>If we built a pyramid, in the end we have a trajectory (a sequence of states <Katex>s_0 \to s_1 \to ... \to s_{"T"}</Katex>). As we can choose to stop anytime, our trajectories can have different lengths, e.g. we can build a pyramid from 1 piece or from 100.
                <br>
                <br>As you might have guessed from the vocabulary, GFlowNets are very similar to Reinforcement learning methods, we sample trajectories and assign a reward R(x) to them (or to the states).
                The main difference is that usual RL methods try to find solutions which maximize the reward,
                whereas GFlowNets learn the underlying distribution p(x). So we want to train a model such that p(x) is proportional to the reward function R(x). This allows us to sample not only from the mode which has the highest reward, but also all other modes which might be almost as good.

                Imagine a pyramid that contains  a 2x4 block, we could just replace it with two 2x2 blocks. Both options are valid and we might be interested in finding many possible ways to build pyramids.
                <br>
                <br>Building Lego Pyramids is maybe not usecase number one for GFlowNets, but they are used for drug discovery (Nica et al., 2022), where sampling from multiple modes is really what you want in order to discover not only the most promising molecule.

              </Content>
            </Panel>
          </Accordion>
        </div>
      <p class="section-annotation">
        When sequentially generating an object, we need to take actions which give us the next state:
        We could add one of the possible components (e.g. adding an atom when generating a molecule)
        or decide we are done by making this state a final state.
        For this we use a neural net which represents our forward policy.
        It gives us the action which leads to the next state.
        Changing the policy leads to changes in the transition probabilities between states and in consequence to different probabilities for the final states.
        During training the network adjusts in a way that the probabilities for sampling the final states is proportional to their reward.

      </p>
      <h2 class="annotations-header">Alex</h2>
      <p class="section-annotation">
        A Generative Flow Network (GFlowNet) is a probabilistic framework for constructing complex objects by sequentially sampling trajectories in a directed acyclic graph (DAG). Each trajectory corresponds to a sequence of actions that produces a complete object (for example, a finished Tetris board or a fully formed molecule). A GFlowNet assigns non-negative flow (probability mass) to each trajectory so that the marginal probability of sampling any complete object is proportional to a user-defined reward for that object.
        Unlike conventional reinforcement learning, which typically converges to a single best policy, GFlowNets aim to learn a distribution over many high-reward outcomes. This property of proportional sampling is especially valuable in applications where multiple viable solutions are required, such as diverse move sequences in games or candidate molecules in drug discovery.
        The figure contrasts the behavior of a standard single-path reinforcement learner with that of a GFlowNet. In the traditional RL approach (left), the policy concentrates probability mass along one “best” trajectory. In contrast, the GFlowNet (right) spreads its flow across several promising paths. Each path in the diagram represents an alternative construction strategy. By maintaining multiple plausible routes, GFlowNets preserve exploration and remain robust if the optimal solution changes over time.
      </p>
    </section>

    <section class="section">
      <h2 class="section-title">Core concepts:  states, actions and trajectories</h2>
      <p class="section-annotation">
        Placeholder to explain core concepts based on the tetris environment: states, actions, trajectories. Reader may skip if already familiar with reinforcement learning?
      </p>
      <p class="section-text">
        In this interactive demonstration, a neural policy trained under the GFlowNet framework is applied to the game of Tetris.
        At each step, the network evaluates every legal placement of the falling tetromino and predicts a flow value that estimates the expected future reward (e.g., line clears plus a survival bonus).
        The sidebar lists all candidate moves ordered by their sampling probabilities (obtained via softmax over the predicted flows).
        By default, the green move is executed automatically, but you may click any other candidate to override the choice.
        You can also pause the game at any time to examine how flow values are redistributed across subsequent moves.
        Conceptually, the GFlowNet constructs a DAG of board configurations.
        The figure below displays only the top three moves from each state for clarity—internally, the GFlowNet still evaluates all legal moves.
        All branches are drawn with uniform width and each branch is labeled with its predicted flow value.
        This focused illustration shows how the GFlowNet maintains multiple promising trajectories, while internally still considering lower‐probability options.
      </p>
    </section>
    <div class="A_centerwrap">
      <div class="A_tetriscontainer">
        <div class="A_board-column">
          <div class="A_board">
          <!-- 1) Background canvas (will be painted with Viridis) -->
          <canvas
            id="tetrisBgCanvas"
            width="300"
            height="600"
            style="position: absolute; top: 0; left: 0; z-index: 0;"
          ></canvas>

          <!-- 2) The existing Tetris canvas on top -->
          <canvas
            id="tetrisCanvas"
            width="180"
            height="600"
            style="position: absolute; top: 0; left: 0; z-index: 1;"
          ></canvas>
          </div>

        </div>

        <div class="A_sidebar">
          <h2>Candidate Moves</h2>
          <div id="candidateList" class="A_candidates"><!-- Populated by Tetris logic --></div>
          <div class="A_controls">
            <Button id="resetBtn" color="secondary" variant="raised" style="height:75px">Reset Game</Button>
            <Button id="pauseBtn" color="secondary" variant="raised" style="height:75px">Pause Game</Button>
          </div>
        </div>
      </div>

    </div>

    <div id="flowConservationContainer" style="max-width:700px;margin:20px auto;">
      <svg id="flowConservationSVG" style="width:100%;height:auto;"></svg>

    </div>





    <section class="section">
      <h2 class="section-title">Domain application </h2>
      <p class="section-text">
        The principles demonstrated in the Tetris demo extend naturally to molecular generation.
        In this context, each node represents a partial molecule and each edge an added fragment.
        In molecular design, a GFlowNet sequentially adds fragments to an evolving structure until a complete molecule is produced and scored by a reward function.
        Thanks to flow conservation, the total incoming probability at each intermediate molecule is redistributed among its possible extensions.
        Higher-reward molecules therefore attract more flow, while alternative structures retain non-zero probability and remain available for sampling.
        The interactive visualization below lets you adjust the reward function using a slider.
        As you move the slider, the percentage of generated molecules shifts in real time.
        Clicking the “Maximize weight” button sets the reward to favor heavy molecules.
        Under this setting, the heaviest molecule appears about 49% of the time, whereas lighter molecules receive minimal flow.
      </p>
      <div class="A_molecule-slider-container">
        <div class="A_molecule-slider">
          Weight: {$A_molecule_prop.mw.toFixed(2)}
          <Slider
            min={0}
            max={1}
            step={0.01}
            bind:value={$A_molecule_prop.mw}
          />
        </div>

        <div class="A_molecule-slider">
          Hydrophobicity: {$A_molecule_prop.logP.toFixed(2)}
          <Slider
            min={0}
            max={1}
            step={0.01}
            bind:value={$A_molecule_prop.logP}
          />
        </div>

        <div class="A_molecule-slider">
          Donors: {$A_molecule_prop.hbd.toFixed(2)}
          <Slider
            min={0}
            max={1}
            step={0.01}
            bind:value={$A_molecule_prop.hbd}
          />
        </div>

        <div class="A_molecule-slider">
          Acceptors: {$A_molecule_prop.hba.toFixed(2)}
          <Slider
            min={0}
            max={1}
            step={0.01}
            bind:value={$A_molecule_prop.hba}
          />
        </div>

        <div class="A_molecule-slider">
          Polarity: {$A_molecule_prop.tpsa.toFixed(2)}
          <Slider
            min={0}
            max={1}
            step={0.01}
            bind:value={$A_molecule_prop.tpsa}
          />
        </div>

        <div class="A_molecule-slider">
          Flexibility: {$A_molecule_prop.rotb.toFixed(2)}
          <Slider
            min={0}
            max={1}
            step={0.01}
            bind:value={$A_molecule_prop.rotb}
          />
        </div>
        <div class="A_molecule-slider">
              <Button id="max-weight-btn"
                      color="secondary"
                      variant="raised"
                      on:click={A_maximizeMw}>
                Maximize Weight</Button>
        </div>
      </div>
      <svg id="chart" style="width: 1000px; display:block; margin: 20px auto"></svg>
    </section>

    <section class="section">
      <h2 class="section-title">Flow, Policies and Training Objective </h2>
      <p class="section-text">
        <br>If you connect all possible states from the start state to the terminal states you obtain a directed graph.
        If you want to use a GFlowNet for your task it is important that the graph is acyclic, meaning it's not possible to revisit a previous state.
        We can now interpret this directed acyclic graph (DAG) as a flow network.
        <br>
        You can compare it to water flowing from the start state through the intermediate states to the final states, following the edges of the DAG like pipes.
        <br>
      </p>

      <svg width="800" height="350" style="display: block; margin: 20px auto;">
        <!-- Marker for arrows -->
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5"
            markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="gray" />
          </marker>
        </defs>

        <!-- Edges (arrows and flow info) -->
        {#each edges as edge (edge.from + '-' + edge.to)}
          {#if nodeById(edge.from) && nodeById(edge.to)}


            <!-- Visible edge -->
            <line
              x1="{nodeById(edge.from).x}"
              y1="{nodeById(edge.from).y}"
              x2="{nodeById(edge.to).x}"
              y2="{nodeById(edge.to).y}"
              stroke="{edgeColors[edge.from + '-' + edge.to]}"
              stroke-width="2"
              marker-end="url(#arrow-{edgeColors[edge.from + '-' + edge.to]})"
            />

            <!-- Flow label-->
            <text
              x="{(nodeById(edge.from).x + nodeById(edge.to).x) / 2}"
              y="{(nodeById(edge.from).y + nodeById(edge.to).y) / 2 - 10}"
              text-anchor="middle"
              font-size="12"
              fill="black"
            >
              {edge.flow}
            </text>


            <!-- Particles -->
            <path
              id="path-{edge.from}-{edge.to}"
              d="M {nodeById(edge.from).x} {nodeById(edge.from).y}
                 L {nodeById(edge.to).x} {nodeById(edge.to).y}"
              fill="none"
              stroke="transparent"
            />

            {#each Array(edge.flow) as _, i}
              <circle r="3" fill="black">
                <animateMotion
                  dur="{3 - i * 0.3}s"
                  repeatCount="indefinite"
                >
                  <mpath href="#path-{edge.from}-{edge.to}" />
                </animateMotion>
              </circle>
            {/each}

            <!-- Invisible hover hitbox -->
            <line
              x1="{nodeById(edge.from).x}"
              y1="{nodeById(edge.from).y}"
              x2="{nodeById(edge.to).x}"
              y2="{nodeById(edge.to).y}"
              stroke="transparent"
              stroke-width="32"
              on:mouseenter={() => hoveredEdge = edge}
              on:mouseleave={() => hoveredEdge = null}
              role="presentation"
            />
          {/if}
        {/each}

        <!-- Nodes (with labels inside shapes) -->
        {#each nodes as node}
        <g
          role="presentation"
          on:mouseenter={() => hoveredNode= node.id}
          on:mouseleave={() => hoveredNode= null}
        >
          {#if node.id === 's0'}
            <!-- Triangle for start state -->
            <polygon
              points="{node.x - 10},{node.y + 20} {node.x - 10},{node.y - 20} {node.x + 30},{node.y}"
              fill="{nodeColors[node.id]}"
              stroke="black"
              stroke-width="1"
            />
          {:else if node.final}
            <!-- Square for final state -->
            <rect
              x="{node.x - 20}"
              y="{node.y - 20}"
              width="40"
              height="40"
              rx="4"
              ry="4"
              fill="{nodeColors[node.id]}"
              stroke="black"
              stroke-width="1"
            />
          {:else}
            <!-- Circle for normal state -->
            <circle
              cx="{node.x}"
              cy="{node.y}"
              r="20"
              fill="{nodeColors[node.id]}"
              stroke="black"
              stroke-width="1"
            />
          {/if}

          <!-- Node label -->
          <text
            x="{node.x}"
            y="{node.y + 5}"
            text-anchor="middle"
            font-size="14"
            fill="white"
          >
            {node.id}
          </text>
        </g>
      {/each}

      </svg>
      <p class="mathexpl">
        Hover over the edges (actions) to see the Policy calculations,
        hover over the nodes (states) to see the Flow and Loss calculations.
      </p>

      <table style="width: 900px; border-collapse: collapse; margin: 20px auto; font-family: 'Georgia', serif; font-size: 16px;">
        <tr>
          <td style="width: 120px; height: 110px; font-weight: bold; padding: 8px 0; border-bottom: 1px solid #aaa; border-top: 2px solid black;">Flow</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #aaa; border-top: 2px solid black;">
            {#if hoveredEdge}
              <Katex>
                {`F(\\textcolor{#d95f02}{s_${hoveredEdge.from[1]} \\to ${hoveredEdge.to[0]}_${hoveredEdge.to[1]}}) = ${hoveredEdge.flow}`}
              </Katex>
            {:else if hoveredNode}
              <Katex>
                {`F_{in}(\\textcolor{#d95f02}{${hoveredNode[0]}_${hoveredNode[1]}}) = \\textcolor{#1b9e77}{${previousStatesFormula(hoveredNode)}} = ${previousStatesValues(hoveredNode)}`}
              </Katex>
              <br>
              <br>
              {#if nodeById(hoveredNode).final}
                <Katex>
                  {`F_{out}(\\textcolor{#d95f02}{x_${hoveredNode[1]}}) = \\textcolor{#7570b3}{R(x_${hoveredNode[1]}) + 0} = ${nextStatesValues(hoveredNode)}`}
                </Katex>
              {:else}
                <Katex>
                  {`F_{out}(\\textcolor{#d95f02}{s_${hoveredNode[1]}}) = \\textcolor{#7570b3}{0 + ${nextStatesFormula(hoveredNode)}} = ${nextStatesValues(hoveredNode)}`}
                </Katex>
              {/if}
            {:else}
              <Katex>
                F_{"{in}"}(s) = \sum_{"{s' \\in \\{children(s)\\}}"} F(s' \to s)
              </Katex>
              <br>
              <br>
              <Katex>
                F_{"{out}"}(s) =R(s) + \sum_{"{s' \\in \\{parents(s)\\}}"} F(s \to s')
              </Katex>
            {/if}
          </td>
        </tr>
        <tr>
          <td style="width: 120px; height: 100px; font-weight: bold; padding: 8px 0; border-bottom: 1px solid #aaa;">Policy</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #aaa;">
            {#if hoveredEdge}
              <Katex>
                {`P_F(\\textcolor{#d95f02}{${hoveredEdge.to[0]}_${hoveredEdge.to[1]}|s_${hoveredEdge.from[1]}}) = \\frac{\\textcolor{#d95f02}{F(s_${hoveredEdge.from[1]} \\to ${hoveredEdge.to[0]}_${hoveredEdge.to[1]})}}{\\textcolor{#d95f02}{F(s_${hoveredEdge.from[1]} \\to ${hoveredEdge.to[0]}_${hoveredEdge.to[1]})} \\textcolor{#1b9e77}{${policyFormula(hoveredEdge)}}} = ${policyValue(hoveredEdge)}`}
              </Katex>
            {:else if hoveredNode}
              The policy is calculated for each action (edge).
            {:else}
              <Katex>
                {`P_F(s'|s) = \\frac{F(s \\to s')}{\\sum_{s' \\in \\{children(s)\\}} F(s \\to s')}`}
              </Katex>
            {/if}
          </td>
        </tr>
        <tr>
          <td style="width: 120px; height: 100px; font-weight: bold; padding: 8px 0; border-bottom: 1px solid #aaa;">Loss</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #aaa;">
            {#if hoveredEdge}
              The Loss is calculated for each state.
            {:else if hoveredNode}
              <Katex>
                {`\\mathcal{L}_{FM}(\\textcolor{#d95f02}{${hoveredNode[0]}_${hoveredNode[1]}}) = \\left( \\log \\frac{\\textcolor{#1b9e77}{${previousStatesFormula(hoveredNode)}}}{\\textcolor{#7570b3}{${nextStatesFormula(hoveredNode)}}} \\right)^2 = ${lossValue(hoveredNode)}`}
              </Katex>
            {:else}
              <Katex>
                {`\\mathcal{L}_{FM}(s) = \\left( \\log \\frac{ \\sum_{s'\\in \\{children(s)\\}}F(s' \\to s)}{\\sum_{s' \\in \\{parents(s)\\}}F(s \\to s')} \\right)^2`}
              </Katex>
            {/if}
          </td>
        </tr>
      </table>







      <p class="section-text">
        Each edge of the network has an assigned <b>flow</b> value, you can see it by hovering over them.
        You can understand it as the amount of water that flows through the edge.

        Hovering also shows the Forward <b>Policy</b> <Katex>P_F(s'|s)</Katex>of an edge,
        it gives us a transition probability from one state <Katex>s</Katex> to one of its children <Katex>s'</Katex>.
        It is simply the flow going to <Katex>s'</Katex> divided by the sum of the outgoing flow of <Katex>s</Katex>.
        Over all children it sums to 1.
        The policy is learned by a small neural network and the agent can use it to sample their next action.
        As the flow determines the transition probabilities it also determines the probabilities for sampling the final states <Katex>x</Katex>.
        <br>
        You can also hover over the states to see their incoming and outgoing flow.
        The example above shows a perfectly trained model and you can see an important property of it:
        For each state, the incoming flow is equal to the outgoing flow.
        This is called Flow Consistency or Flow Matching and is the key to our goal: Sampling diverse candidates.
        If we sample trajectories (a path from <Katex>s_0</Katex> to a final state <Katex>x</Katex>) using our policy and matched flows,
        we will sample the final states proportional to their reward.
        So a final state with half the reward of the best final state will get sampled half as often -
        But in contrast to reward maximizing approaches it <i>will</i> get sampled eventually.
        <br>
        <br>
        If Flow Consistency holds for all states it also holds for the whole DAG.
        In this case the incoming flow at the start state s0 is equal to the outgoing flow of the DAG.
        The outgoing flow is the sum of all rewards and is called the partition function, denoted as <Katex>Z</Katex>.
        While the sum of the reward function is fixed and usually not known,
        the model implicitly learns it during training by adjusting the flow of <Katex>s_0</Katex>.
        <br>
        We now know that the way to diverse candidates is to achieve Flow Matching.
        Turning this into a training objective is actually quite simple, we just use a Mean Squared Error for each state.
        The lower the difference between the incoming and the outgoing flow of a state is the lower its <b>loss</b>.
        You can see its calculation by hovering over the states.
        As there is perfect Flow Matching the result will always be 0.

        In the first GFlowNet paper (Benigo et al., 2021) the authors used this loss, since then many improvements have been proposed.
        In the Playground we use Trajectory Balance loss, you can learn about it below if you want more detail.
      </p>
      <div class="image-container">
        <Accordion multiple>
            <Panel color="secondary">
              <Header>Trajectory Balance: Theory</Header>
              <Content>
               <svg width="800" height="350" style="display: block; margin: 20px auto;">
                  <defs>
                    <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5"
                      markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="gray" />
                    </marker>
                  </defs>

                  {#each edges as edge (edge.from + '-' + edge.to)}
                    {#if TB_nodeById(edge.from) && TB_nodeById(edge.to)}
                      <line
                        x1="{TB_nodeById(edge.from).x}"
                        y1="{TB_nodeById(edge.from).y}"
                        x2="{TB_nodeById(edge.to).x}"
                        y2="{TB_nodeById(edge.to).y}"
                        stroke="{TB_edgeColors[edge.from + '-' + edge.to]}"
                        stroke-width="2"
                        marker-end="url(#arrow)"
                      />
                      <text
                        x="{(nodeById(edge.from).x + nodeById(edge.to).x) / 2}"
                        y="{(nodeById(edge.from).y + nodeById(edge.to).y) / 2 - 10}"
                        text-anchor="middle"
                        font-size="12"
                        fill="black"
                      >
                        {edge.flow}
                      </text>
                      <!-- Particles -->
                      <path
                        id="path-{edge.from}-{edge.to}"
                        d="M {nodeById(edge.from).x} {nodeById(edge.from).y}
                           L {nodeById(edge.to).x} {nodeById(edge.to).y}"
                        fill="none"
                        stroke="transparent"
                      />

                      {#each Array(edge.flow) as _, i}
                        <circle
                          r="3"
                          fill="{TB_edgeColors[edge.from + '-' + edge.to]}"
                        >
                          <animateMotion
                            dur="{3 - i * 0.3}s"
                            repeatCount="indefinite"
                          >
                            <mpath href="#path-{edge.from}-{edge.to}" />
                          </animateMotion>
                        </circle>
                      {/each}
                    {/if}
                  {/each}

                  {#each nodes as node}
                    <g on:click={() => TB_handleClick(node.id)} style="cursor: pointer;" role="presentation">
                      {#if node.id === 's0'}
                        <polygon
                          points="{node.x - 10},{node.y + 20} {node.x - 10},{node.y - 20} {node.x + 30},{node.y}"
                          fill="{TB_nodeColors[node.id]}"
                          stroke="black"
                          stroke-width="1"
                        />
                      {:else if node.final}
                        <rect
                          x="{node.x - 20}"
                          y="{node.y - 20}"
                          width="40"
                          height="40"
                          rx="4"
                          ry="4"
                          fill="{TB_nodeColors[node.id]}"
                          stroke="black"
                          stroke-width="1"
                        />
                      {:else}
                        <circle
                          cx="{node.x}"
                          cy="{node.y}"
                          r="20"
                          fill="{TB_nodeColors[node.id]}"
                          stroke="black"
                          stroke-width="1"
                        />
                      {/if}
                      <text
                        x="{node.x}"
                        y="{node.y + 5}"
                        text-anchor="middle"
                        font-size="14"
                        fill="black"
                      >
                        {node.id}
                      </text>
                    </g>
                  {/each}
                </svg>
                <p class="mathexpl" style="color: white; width:550px;">
                  Choose a trajectory: Select on one of the purple states until you reach a final state.
                  Reset by selecting s0 or another orange state.
                </p>
                <table style="width: 900px; border-collapse: collapse; margin: 20px auto; font-family: 'Georgia', serif; font-size: 16px;">
                  <tr>
                    <td style="width: 130px; height: 110px; font-weight: bold; padding: 8px 0; border-bottom: 1px solid #aaa; border-top: 2px solid white;">Forward- Policy</td>
                    <td style="padding: 8px 0; border-bottom: 1px solid #aaa; border-top: 2px solid white;">
                      {#if TB_trajectory_complete}
                        <Katex>
                          {`\\prod_t P_F(s_{t+1}|s_t) = ${TB_calculate_PF()}`}
                        </Katex>
                      {:else}
                        <Katex>
                          {`P_F(s'|s) = \\frac{F(s \\to s')}{\\sum_{s' \\in \\{children(s)\\}} F(s \\to s')}`}
                        </Katex>
                      {/if}
                    </td>
                  </tr>
                  <tr>
                    <td style="width: 130px; height: 100px; font-weight: bold; padding: 8px 0; border-bottom: 1px solid #aaa;">Backward- Policy</td>
                    <td style="padding: 8px 0; border-bottom: 1px solid #aaa;">
                      {#if TB_trajectory_complete}
                        <Katex>
                          {`\\prod_t P_B(s_{t}|s_{t+1}) = ${TB_calculate_PB()}`}
                        </Katex>
                      {:else}
                        <Katex>
                          {`P_B(s'|s) = \\frac{F(s \\to s')}{\\sum_{s' \\in \\{parents(s')\\}} F(s \\to s')}`}
                        </Katex>
                      {/if}
                    </td>
                  </tr>
                  <tr>
                    <td style="width: 130px; height: 100px; font-weight: bold; padding: 8px 0; border-bottom: 1px solid #aaa;">Loss</td>
                    <td style="padding: 8px 0; border-bottom: 1px solid #aaa;">
                      {#if TB_trajectory_complete}
                        <Katex>
                          {"\\mathcal{L}_{TB}(\\tau) = \\left(\\log\\frac{Z_{\\theta}\\prod_t P_F(s_{t+1}|s_t)}"}{"{R(x)\\prod_t P_B(s_t|s_{t+1})}\\right)^2"}
                          {`= \\left(\\log\\frac{${TB_current.z} \\cdot ${TB_current.pf}}{${edges.filter(e => e.to === TB_path.at(-1))[0].flow} \\cdot ${TB_current.pb}}\\right)^2 = 0`}
                        </Katex>
                      {:else}
                        <Katex>
                          {"\\mathcal{L}_{TB}(\\tau) = \\left(\\log\\frac{Z_{\\theta}\\prod_t P_F(s_{t+1}|s_t)}"}{"{R(x)\\prod_t P_B(s_t|s_{t+1})}"} \right)^2
                        </Katex>
                      {/if}
                    </td>
                  </tr>
                </table>
                Since we calculate the Flow Matching Loss on a state level we might run into inefficiency with longer trajectories.
                A flow mismatch occuring at the final state is propagated backwards only one state per iteration.
                As a result it might take long to update the flows of the earlier states.
                Trajectory Balance solves this by calculating the loss on a trajectory level.
                So we get a gradient for a whole trajectory  <Katex>\tau</Katex>, allowing us to update all states within it simultaneously, which can lead to faster convergence.
                <br><br>
                To calculate the Trajectory Balance we need four things:
                <ul>
                  <li>
                    The partition function <Katex>Z</Katex>: This represents the sum of all rewards (or the total flow entering the DAG).
                    Since the true value is unknown, we estimate it using our model and denote the estimate as <Katex>Z_\theta</Katex> to distinguish it from the true value.
                  </li>
                  <li>
                    The Forward Policy <Katex>P_F(s'|s)</Katex>:
                        We already used it for Flow Matching to estimate the distribution over the children of a state.
                  </li>
                  <li>
                    The Backward Policy <Katex>P_F(s'|s)</Katex>:
                    Analogous to the forward policy, the backward policy defines a distribution over the parents of a state.
                    It is computed as the flow from a specific parent divided by the total incoming flow to that state.
                    We can estimate it using a Neural Network as well.
                  </li>
                  <li>
                    The reward <Katex>R(X)</Katex>of the final state of the trajectory.
                  </li>
                </ul>
                <br>
                To calculate the probability of selecting a trajectory from all possible ones, we take the product of the forward policies along the trajectory.
                Similarly, we compute the product of the backward policies to get the probability of selecting this trajectory among all those that end at the same final state.
                We use this in the calculation of Trajectory Balance, you can see the formula above.
                The numerator represents the fraction of the total flow <Katex>Z</Katex> that goes through this trajectory <Katex>\tau</Katex>.
                The denominator represents the fraction of the reward <Katex>R(X)</Katex> that goes through <Katex>\tau</Katex>.
                <br>
                The DAG above shows the same trained model as before.
                Select a trajectory to see the calculation of the policies and the loss.
                The Trajectory Balance Loss adds a bit more model complexity:
                In addition to the parameters of the forward policy we learn the backward policy and the scalar parameter <Katex>Z_\theta</Katex>.

              </Content>
            </Panel>
            <Panel color="secondary"> <!--bind:open={panel_algo}>-->
              <Header>
                Trajectory Balance: Algorithm
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
                You can find the python code for this implementation <a href="https://github.com/florianholeczek/ugfn" style="color: black" target="_blank">here</a>.
              </Content>
            </Panel>
          </Accordion>
        </div>


      <h2 class="section-title">Towards continuous GFlowNets</h2>
      <p class="section-text">
        So far, we've only looked at discrete spaces,
        however, this is not a limitation for GFlowNets.
        Use the button on the right to learn about continuous GFlowNets and the Playground environment.
      </p>
      <div class="DC-container">
        <!-- Left Button -->
        <Button class="DC-side-button" disabled={DC_view<=0} on:click={() => DC_view--} variant="raised" color="secondary">
          <Icon class="material-icons" style="font-size: 50px; display: flex; align-items: center; justify-content: center;">keyboard_double_arrow_left </Icon>
        </Button>

        <!-- Center Grid -->
        <div class="DC-center-grid">
          <div id="DC_discrete_plot"></div>
          <div>
            {#if DC_view === 0}
              In a grid based environment, the reward function can be defined as a value assigned to each cell.
              An agent moves across the grid and collects the reward of the cell it ends up in.
              The agent is free to move in both the x and y directions, taking steps of size n.
              For simplicity — and to help visualize the flow later on —
              we fix the number of steps (i.e., the trajectory length).
              <br>
              Allowing movement like this violates an assumption of the DAG:
              A state can be visited more than once, so the state-space might become acyclic.
              To solve this we simply change the representation of our states to include a timestamp (the current step) in addition to the position.
            {:else if DC_view ===1}
              In the discrete case, sampling works the same way as in the previous examples.
              One of the possible actions (shown as grey arrows) is sampled based on the transition probabilities
              provided by the policy.
              The agent then moves according to the chosen action (black arrow), and this becomes its new state.
              After a fixed number of steps (in this case, three), the final state is reached (marked by the black tripod),
              and the reward is calculated.
              <br>
              This example illustrates random sampling, representing an untrained GFlowNet.
              <br><br>
              To calculate the transition probabilities we need to sum the flow over all possible next states.
              While this is feasible in the discrete case,
              it becomes intractable in the continuous case due to the infinite number of possible next states.
            {:else if DC_view ===2}
              After training, sampling becomes proportional to the reward function: states with higher rewards are sampled more frequently.
              In our example, the two high-reward states are visited most often, though the agent still occasionally samples lower-reward states.
            {:else}
              When visualizing the flow, we can aggreagte the flows for each  possible state.
              Recall the grey arrows representing possible actions: Each of these has a associated flow value.
              Treating them as vectors with their flow as the magnitude,
              we can sum them up to show the direction of the highest flow.
              Doing this for all states produces a vector field, which reveals the most probable directions the agent will take.
              High-reward states appear as points of convergence in this field.
            {/if}
          </div>
          <div>
            {#if DC_view === 0}
              On a continuous plane we have no cells, but we can specify the reward by a distribution.
              In this case we use the mixture of multivariate gaussians (for now two components).
              The agent moves similar to the discrete case for a fixed number of steps and then collects the reward based on the probability density function (PDF) of the distribution.
              <br>
              This will be the environment of the Playground,
              where we simplified the variance of the gaussians to one parameter,
              so the variance for x and y is the same and there is no covariance <Katex>(\Sigma = \sigma^2 I)</Katex>.
            {:else if DC_view ===1}
              Instead the neural network representing our policy outputs a <b>sampling distribution</b>.
              This distribution is represented by a mean (grey arrow) and a variance (grey circle).
              It represents the flow: for any given state, the network provides a probability distribution over actions.
              We then sample an action from it (black arrow) and the agent moves accordingly.
              As before, after a fixed number of steps, the final state (black tripod) is reached.
              <br>
              Note: Do not confuse the reward distribution with the sampling distribution:
              The reward distribution is fixed for the whole training process and (usually) unknown.
              The sampling distribution belongs to the policy and varies depending on the agent's current state.
            {:else if DC_view ===2}
              The same principle applies in the continuous case.
              If we're interested in obtaining diverse high-reward solutions, we can, for instance, select the top five samples with the highest reward.
              These are likely to come from different modes of the reward distribution, reflecting the GFlowNet’s ability to explore multiple promising regions.
            {:else}
              In the continuous case the flow is represented by the sampling distribution.
              The mean of this distribution corresponds to the expected action, which we interpret as the highest flow.
              By computing the predicted means of the sampling distribution at various points on the plane,
              we can again construct a vector field that shows the dominant flow directions.
              As in the discrete case, the modes of the reward function serve as attractors—clear convergence points in the vector field.
            {/if}
          </div>
          <div id="DC_continuous_plot"></div>
        </div>

        <!-- Right Button -->
        <Button class="DC-side-button" disabled={DC_view>=3} on:click={() => DC_view++} variant="raised" color="secondary">
          <Icon class="material-icons" style="font-size: 50px; display: flex; align-items: center; justify-content: center;">keyboard_double_arrow_right</Icon>
        </Button>
      </div>
    </section>





    <section class="section section-light">
      <h2 class="section-title">Training</h2>
      <p class="section-text">
        Using the environment above we trained a GFlowNet with Trajectory Balance Loss.
        Below you see the progress of the model during training.
        While it first samples randomly, it learns to match the true distribution of our environment.
        Use the controls below to iterate through the training process and load these settings to the Playground.
        You can hover over a sample to see its trajectory.
      </p>
      <div id="runplot1" style="display: flex; justify-content: center;"></div>
      <div style="width: 700px; margin: auto; text-align:center;display:flex; margin-top: 10px">
        <div style="width:56px; margin-right:20px">
          <Wrapper rich>
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
            <Tooltip>
              Animate this training run
            </Tooltip>
          </Wrapper>
        </div>
        <Textfield
          bind:value={run1_value}
          on:change={(e) => runs_textinput(e,1)}
          label="Iteration"
          disabled={isRunningAnim}
          type="number"
          input$step="128"

        ></Textfield>
        <div style="width: 500px; margin-top:10px">
          <Slider
            bind:value="{run1_value}"
            min={0}
            max={4098}
            step={128}
            discrete
            input$aria-label="Discrete slider"
          />
        </div>
        <Wrapper rich style="margin-top:10px">
          <Fab
            on:click={() =>load_pg_settings(1)} disabled={isRunning}
            mini
          ><Icon class="material-icons" style="font-size: 22px">system_update_alt</Icon>
          </Fab>
          <Tooltip>
            Load the settings of this training run for the Playground
          </Tooltip>
        </Wrapper>
      </div>

      <div style="height:50px"></div>
      <p class="section-text">
        So far, our distribution to match was very easy.
        Let's make it more challenging: If we lower the variance, we see the two modes are more separated.
      </p>
      <div id="runplot2" style="display: flex; justify-content: center;"></div>
      <div style="width: 700px; margin: auto; text-align:center;display:flex; margin-top: 10px">
        <div style="width:56px; margin-right:20px">
          <Wrapper rich>
            <Fab
              on:click={isRunningAnim ? stop_animation_run() : animate_run(2)}
              disabled={isRunning}
            >
              {#if isRunningAnim}
                <Icon class="material-icons" style="font-size: 50px">stop</Icon>
              {:else}
                <Icon class="material-icons" style="font-size: 50px">play_arrow</Icon>
              {/if}
            </Fab>
            <Tooltip>
              Animate this training run
            </Tooltip>
          </Wrapper>
        </div>
        <Textfield
          bind:value={run2_value}
          on:change={(e) => runs_textinput(e,2)}
          label="Iteration"
          disabled={isRunningAnim}
          type="number"
          input$step="128"

        ></Textfield>
        <div style="width: 500px; margin-top:10px">
          <Slider
            bind:value="{run2_value}"
            min={0}
            max={4096}
            step={128}
            discrete
            input$aria-label="Discrete slider"
          />
        </div>
        <Wrapper rich style="margin-top:10px">
          <Fab
            on:click={() =>load_pg_settings(2)} disabled={isRunning}
            mini
          ><Icon class="material-icons" style="font-size: 22px">system_update_alt</Icon>
          </Fab>
          <Tooltip>
            Load the settings of this training run for the Playground
          </Tooltip>
        </Wrapper>
      </div>
      <div style="height:50px"></div>
      <p class="section-text">
        This is called mode collapse and a huge problem. The model quickly discovered one mode and only sampled from it.
        This happens as we do not encourage exploration enough, so the model acts greedy.
        <br>
        There are two main possibilities to fix this:
        <span class="li">
          We could introduce a temperature parameter <Katex>\beta</Katex> into our reward function:
          <Katex>R_{"{new}"}(x)=R(x)^\beta</Katex>.
          This would change how "peaky" the reward function is: If the reward is not concentrated on a point but more spread out around the probability to discover it increases.
          It is also possible to use <Katex>\beta</Katex> as a trainable parameter and condition the model on it.</span>
        <span class="li">
          A simpler way is to just train off-policy.
          By adding a fixed variance to the variance of the sampling distribution provided by the forward policy, we explore more during training.
          As this is a very easy implementation we will go with this one.
        </span>
      </p>
      <div class="image-container">
        <Accordion>
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
      <div style="width: 700px; margin: auto; text-align:center;display:flex; margin-top: 10px">
        <div style="width:56px; margin-right:20px">
          <Wrapper rich>
            <Fab
              on:click={isRunningAnim ? stop_animation_run() : animate_run(3)}
              disabled={isRunning}
            >
              {#if isRunningAnim}
                <Icon class="material-icons" style="font-size: 50px">stop</Icon>
              {:else}
                <Icon class="material-icons" style="font-size: 50px">play_arrow</Icon>
              {/if}
            </Fab>
            <Tooltip>
              Animate this training run
            </Tooltip>
          </Wrapper>
        </div>
        <Textfield
          bind:value={run3_value}
          on:change={(e) => runs_textinput(e,3)}
          label="Iteration"
          disabled={isRunningAnim}
          type="number"
          input$step="128"

        ></Textfield>
        <div style="width: 500px; margin-top:10px">
          <Slider
            bind:value="{run3_value}"
            min={0}
            max={4096}
            step={128}
            discrete
            input$aria-label="Discrete slider"
          />
        </div>
        <Wrapper rich style="margin-top:10px">
          <Fab
            on:click={() =>load_pg_settings(3)} disabled={isRunning}
            mini
          ><Icon class="material-icons" style="font-size: 22px">system_update_alt</Icon>
          </Fab>
          <Tooltip>
            Load the settings of this training run for the Playground
          </Tooltip>
        </Wrapper>
      </div>
      <div style="height:50px"></div>
      <p class="section-text">
        Off-policy training helped: We now sample proportional to the reward function again.
      </p>
      <div class="image-container">
        <Accordion>
          <Panel color="secondary">
            <Header>Interpreting Z</Header>
            <Content>
              Recall that the partition function <Katex>Z</Katex> is the sum of all rewards.
              Since we defined a simple environment we actually know the true value:
              The Integral of the PDF of a gaussian is 1,
              and since our reward distribution is the sum of two gaussians,
              we have <Katex>Z=2</Katex> and <Katex>\log Z \approx 0.69</Katex>.
              The orange line in the plot shows <Katex>\log Z_\theta</Katex>,
              the partition function estimated by the model when using Trajectory Balance Loss.
              In the first training run, the model correctly approximates this true value, successfully sampling from both modes.
              During mode collapse, you can see that the learned logZ drops to <Katex>\log(1)=0</Katex> and stays there,
              indicating that the model is only capturing one mode of the reward function (a single Gaussian).
              In the last run (off-policy training), we see that forcing exploration helps the model discover the second mode around iteration 1500,
              when logZ approaches its true value.
              However, due to the high exploration rate, the model continues to sample almost uniformly, keeping the loss high.
              As the model continues to learn, the loss decreases, and it recovers even after logZ diverges again.
              This behavior helps illustrate the regulatory role of the partition function in GFlowNet training.
              However, in practice, the true reward distribution is usually unknown,
              so the true value of <Katex>Z</Katex> is also unknown—making it more difficult to interpret the behavior of <Katex>\log Z_\theta</Katex> during training.
            </Content>
          </Panel>
        </Accordion>
      </div>

    </section>

    <section class="section" style="box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);">
      <h2 class="section-title">Flow</h2>
      <p class="section-text">
        Below you can see the flow of the last training run.
        Use the Step slider to adjust the current step.
        We fixed the number of steps for the agent at 6, so it collects the reward after taking 6 steps.
        Use the Iteration Slider to compare the flow at the start of the training to the end.
        <br>
        You see that for the trained model (last iteration) the flow is different depending on the step.
        In the first step the agent takes, it tends to move to the center.
        Later on in the trajectory the points of convergence split up and move outwards to the modes of the distribution.
        In the last two steps they even move past them, probably to achieve the separation of the modes.
        <br><br>
        You can switch between two views: flow field and vector field.
        Both rely on the same data, but the flow field shows particles moving across the vector field.
        Note that the path of the particles is not the path of the agents.
        The particles follow the most probable direction continuously, while the agent takes discrete steps.
        Also the steps of the agent are probabilistic, they are sampled from the distribution of the policy.
        As a result, the agent's trajectories can appear more erratic or scattered compared to the smooth flow of the particles.
        This visualization however shows the converging points in the flow field which direct the agents' movement.
      </p>

      <div class="flow-container">
        <div bind:this={tutorial_flowContainer}></div>
      </div>
      <div style="width: 750px; margin: auto; display: flex; align-items: flex-start;">
        <!-- Left: Select component centered vertically -->
        <div style="margin-right: 20px">
          <Select bind:value="{flow_vis_type}" label="Visualization" disabled="{isRunning}">
            {#each ["Particles", "Vectors"] as select}
              <Option value={select}>{select}</Option>
            {/each}
          </Select>
        </div>

        <!-- Right: Sliders stacked vertically -->
        <div style="flex-grow: 1; display: flex; flex-direction: column; gap: 16px;">
          <div style="display: flex; align-items: center;">
            <div style="text-align: left; margin-right: 10px;">
              Step <br> {t_flow_trajectory_step_value}
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

          <div style="display: flex; align-items: center;">
            <div style="text-align: left; margin-right: 10px;">
              Iteration <br> {t_flow_step_value}
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
        </div>
      </div>

      <div style="height:50px"></div>























      <!-- Playground -->
    <header class="header-pg">
      <div class="container">
        <h1 class="title">Playground</h1>
      </div>
    </header>
      <section class="section">
      <p class="section-text">
        Below, we present the <b>Playground</b> for experimenting with GFlowNet training.
        It provides an interactive environment to explore how GFlowNets adapt to changes in both reward functions and training hyperparameters.
        Training occurs in a continuous space, where an agent takes a fixed number of steps before receiving a reward defined by a configurable reward function.
        This function can be adjusted in the first of the three Playground views: The <b>Environment</b> view.
        In the <b>Training</b> view, you can modify hyperparameters and initiate training.
        The resulting visualization shows the agent’s final positions.
        When training is successful, the distribution of these positions should approximate the target reward distribution.
        The <b>Flow</b> view visualizes the learned flow.
      </p>
    </section>
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
                  disabled="true"
                >
                  <Icon class="material-icons" style="font-size: 50px">keyboard_double_arrow_left</Icon>
                </Fab>
                <Wrapper rich>
                  <Fab
                  on:click={resetGaussians}
                  mini
                  disabled="{isRunning}"
                ><Icon class="material-icons" style="font-size: 22px">replay</Icon>
                </Fab>
                  <Tooltip>
                    Reset the environment
                  </Tooltip>
                </Wrapper>

                <Fab disabled="true">
                    <Icon class="material-icons" style="font-size: 50px">play_arrow</Icon>
                </Fab>
                <Wrapper rich>
                  <Fab
                    on:click={() => view="2. Training"} disabled="{isRunning}"
                  >
                    <Icon class="material-icons" style="font-size: 50px">keyboard_double_arrow_right</Icon>
                  </Fab>
                    <Tooltip>
                      Environment ready? Start training the model
                    </Tooltip>
                </Wrapper>



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
                  <Title style="text-align: center; color: white">Number of Gaussians</Title>
                  <Content style="text-align: left; color: white; font-size: 12px">
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
                  <Title style="text-align: center; color: white">Parameters of the Gaussians</Title>
                  <Content style="text-align: left; color: white; font-size: 12px">
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
                  <Title style="text-align: center; color: white">Parameters of the Gaussians</Title>
                  <Content style="text-align: left; color: white; font-size: 12px">
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
                <Wrapper rich>
                  <Fab
                    on:click={() => view="1. Environment"} disabled="{isRunning}"
                  >
                    <Icon class="material-icons" style="font-size: 50px">keyboard_double_arrow_left</Icon>
                  </Fab>
                  {#if showTooltip}
                    <Tooltip>
                      Change the environment
                    </Tooltip>
                  {/if}
                </Wrapper>
                <Wrapper rich>
                  <Fab
                    on:click={resetSliders}
                    mini
                    disabled="{isRunning}"
                  ><Icon class="material-icons" style="font-size: 22px">replay</Icon>
                  </Fab>
                  <Tooltip>
                    Reset all hyperparameters
                  </Tooltip>
                </Wrapper>
                <Wrapper rich>
                  <Fab
                    on:click={isRunning ? stopTraining : startTraining}
                  >
                    {#if isRunning}
                      <Icon class="material-icons" style="font-size: 50px">stop</Icon>
                    {:else}
                      <Icon class="material-icons" style="font-size: 50px">play_arrow</Icon>
                    {/if}
                  </Fab>
                  <Tooltip>
                      Start / Stop training the model
                  </Tooltip>
                </Wrapper>
                <Wrapper rich>
                  <Fab
                    on:click={() => view="3. Flow"} disabled="{isRunning || !display_trainhistory}"
                  >
                    <Icon class="material-icons" style="font-size: 50px">keyboard_double_arrow_right</Icon>
                  </Fab>
                  {#if showTooltip}
                    <Tooltip>
                      Training done? Take a look at the flows
                    </Tooltip>
                  {/if}
                </Wrapper>
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

                  </div>
                </div>
              </div>
            </div>

            <div class="pg-side">
              <Select style="margin-bottom: 20px"
                bind:value="{n_iterations_str}"
                label="Iterations"
                disabled="{isRunning}"
              >
                {#each n_iterations_select as select}
                  <Option value={select}>{select}</Option>
                {/each}
              </Select>
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
                            <Title style="text-align: center; color: white">How many samples to train with</Title>
                            <Content style="text-align: left !important; color: white; font-size: 12px !important">
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
                      Trajectory length
                      <div class="hyperparameters">
                        {trajectory_length_value}
                        <Wrapper rich>
                          <IconButton size="button">
                            <Icon class="material-icons">info</Icon>
                          </IconButton>
                          <Tooltip persistent>
                            <Title style="text-align: center; color: white">Fixed number of steps the agent takes</Title>
                            <Content style="text-align: left !important; color: white; font-size: 12px !important">
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
                      Learning rate model
                      <div class="hyperparameters">
                        {lr_model_value.toFixed(4)}
                        <Wrapper rich>
                          <IconButton size="button">
                            <Icon class="material-icons">info</Icon>
                          </IconButton>
                          <Tooltip persistent>
                            <Title style="text-align: center; color: white">The learning rate of the forward and backward policies</Title>
                            <Content style="text-align: left !important; color: white; font-size: 12px !important">
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
                      Learning rate logZ
                      <div class="hyperparameters">
                        {lr_logz_value.toFixed(3)}
                        <Wrapper rich>
                          <IconButton size="button">
                            <Icon class="material-icons">info</Icon>
                          </IconButton>
                          <Tooltip persistent>
                            <Title style="text-align: center; color: white">The learning rate of the partition function</Title>
                            <Content style="text-align: left !important; color: white; font-size: 12px !important">
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
                            <Title style="text-align: center; color: white">Amount of off-policy training</Title>
                            <Content style="text-align: left !important; color: white; font-size: 12px !important">
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
                      Hidden layers:
                      <div class="hyperparameters">
                        {hidden_layer_value}
                        <Wrapper rich>
                          <IconButton size="button">
                            <Icon class="material-icons">info</Icon>
                          </IconButton>
                          <Tooltip persistent>
                            <Title style="text-align: center; color: white">Number of hidden layers in the forward and backward policies</Title>
                            <Content style="text-align: left !important; color: white; font-size: 12px !important">
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
                      Hidden layer size
                      <div class="hyperparameters">
                        {hidden_dim_value}
                        <Wrapper rich>
                          <IconButton size="button">
                            <Icon class="material-icons">info</Icon>
                          </IconButton>
                          <Tooltip persistent>
                            <Title style="text-align: center; color: white">Dimensions of the hidden layers in the forward and backward policies</Title>
                            <Content style="text-align: left !important; color: white; font-size: 12px !important">
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
                      Seed
                      <div class="hyperparameters">
                        {seed_value}
                        <Wrapper rich>
                          <IconButton size="button">
                            <Icon class="material-icons">info</Icon>
                          </IconButton>
                          <Tooltip persistent>
                            <Title style="text-align: center; color: white">Value to seed random number generators with</Title>
                            <Content style="text-align: left !important; color: white; font-size: 12px !important">
                              <br>
                              The RNGs will be seeded with this value to allow for reproducible results.
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


            {#if !isRunning & display_trainhistory}
              <div class="pg-iter">
                <Textfield
                  bind:value={training_step_value_text}
                  on:change={(e) => training_step_textinput(e)}
                  disabled={isRunning}
                  label="Iteration"
                  type="number"
                  input$step="64"

                ></Textfield>
              </div>
              <div class="pg-bottom-slider">
                <Slider
                  bind:value="{training_step_value_slider}"
                  min={0}
                  max={current_nSteps-1}
                  step={1}
                  disabled="{isRunning}"
                  input$aria-label="View the iterations"
                />
              </div>

            {:else if isRunning}
              <div class="pg-iter">
                <Textfield
                  bind:value={training_progress}
                  label="Iteration"
                  disabled={isRunning}
                  type="number"
                  input$step="64"

                ></Textfield>
              </div>
              <div class = "pg-progress">
                <LinearProgress progress="{ training_progress / n_iterations_value}" />
              </div>
            {/if}
      </div>

        {:else if view === "3. Flow"}
          <!-- FlowView -->
          <div class="pg-container">
            <div class="pg-top">
              <div class="pg-play">
                <Wrapper rich>
                  <Fab
                    on:click={() => view="2. Training"} disabled="{isRunning}"
                  >
                    <Icon class="material-icons" style="font-size: 50px">keyboard_double_arrow_left</Icon>
                  </Fab>
                  <Tooltip>
                    Retrain the model
                  </Tooltip>
                </Wrapper>

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
                      <Title style="text-align: center; color: white">The current step of the agent</Title>
                      <Content style="text-align: left; color: white; font-size: 12px">
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
                      <Title style="text-align: center; color: white">Particle Velocity</Title>
                      <Content style="text-align: left; color: white; font-size: 12px">
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
                      <Title style="text-align: center; color: white">Number of particles</Title>
                      <Content style="text-align: left; color: white; font-size: 12px">
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
              </div>

              <div class="pg-vis">
                <div bind:this={flowContainer}></div>
              </div>
              <div class="pg-iter">
                <Textfield
                  bind:value={flow_step_value_text}
                  on:change={(e) => flow_step_textinput(e)}
                  disabled={isRunning}
                  label="Iteration"
                  type="number"
                  input$step="64"

                ></Textfield>
              </div>
              <div class="pg-bottom-slider">
                <Slider
                  bind:value="{flow_step_value_slider}"
                  min={0}
                  max={current_nSteps-1}
                  step={1}
                  disabled="{isRunning}"
                  input$aria-label="View the iterations"
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
      <!--
      <div class="pg-scrollbutton">
        <Wrapper rich>
          <Fab
            on:click={scrollTo(tutorialstart)}
            disabled="{isRunning}"
          >
          <Icon class="material-icons">keyboard_arrow_down</Icon>
          </Fab>
          <Tooltip>
            Go to the tutorial
          </Tooltip>
        </Wrapper>
      </div>
      -->

    </div>

      <section class="section">
        <h2 class="section-title">Conclusion </h2>
        <p class="section-annotation">
          Placeholder for conclusion text <br><br><br><br><br><br><br><br><br><br>
        </p>
      </section>


      <h2 class="section-title" style="position:relative">What next?</h2>
      <div class="whatnext_t">
        <div class="whatnext_b">Train GFlowNets? <br> Go to the playground</div>
        <div class="whatnext_b">Interested in the code? <br>Find it here</div>
        <div class="whatnext_b">Learn more about GFlowNets?<br>Find other tutorials</div>
      </div>



      <div style="position:absolute; width:1000px; left: 50%;transform: translateX(-50%); margin-top:15px">
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
        <br>Some implementations and ideas are based on great work of others:
        <span class="li">The
          <a href="https://github.com/GFNOrg/torchgfn/blob/master/tutorials/notebooks/intro_gfn_continuous_line_simple.ipynb" target="_blank">continuous line</a>
          example by Joseph Viviano & Kolya Malkin.
          The idea for the environment is based on their notebook and much of the training code is adapted from their tutorial.
      </span>
      <span class="li">The
          <a href="https://playground.tensorflow.org/" target="_blank">
            neural network playground</a>
           by Daniel Smilkov and Shan Carter was an inspiration on how to visualize machine learning and the training progress in the browser.
        </span>
        <span class="li">The code for the flow field visualization is adapted from
          <a href="https://editor.p5js.org/Mathcurious/sketches/bdp6luRil" target="_blank">Mathcurious' implementation</a>
        </span>
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
