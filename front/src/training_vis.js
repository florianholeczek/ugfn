import {computeDensity} from "./env.js";

function linspace(start, stop, num) {
    const step = (stop - start) / (num-1);
    return Array.from({length: num}, (_, i) => start + step * i);
}

function grid(between = [-3, 3], gridSize = 100) {
    const x = linspace(-3, 3, gridSize);
    const y = x.valueOf();
    let xGrid = [];
    let yGrid = [];
    let gridPoints = [];
    for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
            xGrid.push(x[i]);
            yGrid.push(y[j]);
            gridPoints.push([x[i], y[j]]);
        }
    }

    return [xGrid, yGrid, gridPoints];
}

export function plotStates(Plotly, states, losses, density, options = {}) {
    const {
        levels = 10,
        alpha = 1.0,
        gridSize = 100,
        colormap = 'Viridis',
    } = options;

    let sec_col = 'rgb(51, 51, 51)'
    let f_col = "rgb(120, 208, 78)"
    // Extract final states
    const x = states.map(s => s[0]);
    const y = states.map(s => s[1]);


    // Prepare losses
    const iters = Array.from(Array(losses['n_iterations']+1),(x,i)=>i)
    const truelogz_array = new Array(losses['n_iterations']+1).fill(losses['truelogz']);

    // Contour plot for density
    const contourTrace = {
        x: density["linspace"],
        y: density["linspace"],
        z: density["densityEnv"],
        type: 'contour',
        colorscale: colormap,
        showscale:false,
        contours: { coloring: 'lines'},
        line:{width: 2},
        showlegend:false,
    };

    // Scatter plot for sampled states
    const samplesTrace = {
        x: x,
        y: y,
        mode: 'markers',
        type: 'scatter',
        marker: { color: sec_col, symbol: 137, opacity: alpha },
        showlegend:true,
        name: 'Samples',
    };

    // Marginal histograms
    const histX = {
        x: x,
        type: 'histogram',
        histnorm: 'probability density',
        marker: { color: sec_col },
        xaxis: 'x2',
        yaxis: 'y2',
        xbins: {size:0.2},
        showlegend:false,
    };
    const histY = {
        y: y,
        type: 'histogram',
        histnorm: 'probability density',
        marker: { color: sec_col },
        xaxis: 'x3',
        yaxis: 'y3',
        orientation: 'h',
        ybins: {size:0.2},
        showlegend:false,
    };

    // Marginal lines
    const densX = {
        x: density["linspace"],
        y: density["densityX"],
        type: 'scatter',
        xaxis: 'x2',
        yaxis: 'y2',
        mode:'lines',
        marker: { color: f_col },
        showlegend:true,
        name: 'Reward function',
    };
    const densY = {
        y: density["linspace"],
        x: density["densityY"],
        type: 'scatter',
        xaxis: 'x3',
        yaxis: 'y3',
        orientation: 'h',
        mode:'lines',
        marker: { color: f_col },
        showlegend:false,
    };

    //Losses
    const lossplot = {
        x:iters,
        y:losses['losses'],
        name: 'Loss',
        textposition: 'top',
        type:'scatter',
        mode:'lines',
        xaxis: 'x4',
        yaxis: 'y4',
        line: { color: '#1f77b4', width: 1},
    }
    const logzplot = {
        x:iters,
        y:losses['logzs'],
        name: 'logZ',
        type:'scatter',
        mode:'lines',
        xaxis: 'x4',
        yaxis: 'y4',
        line: { color: '#ff7f0e', width: 1},
    }
    const truelogzplot = {
        x:iters,
        y:truelogz_array,
        name: 'True logZ',
        type:'scatter',
        mode:'lines',
        xaxis: 'x4',
        yaxis: 'y4',
        line: { color: '#d62728', width: 1},
    }

    // Layout configuration
    const layout = {
        title: `Iteration ${losses['losses'].length}/${losses['n_iterations']} `,
        showlegend:true,
        legend: {
            x: 1,
            y: 1.2,
            xanchor: 'right',
            yanchor: 'top',
            //orientation: 'h'
        },
        autosize: false,
        width: 775,
        height: 775,
        grid: { rows: 2, columns: 2, subplots: [['xy', 'x2y2'], ['x3y3', 'x4y4']] },
        xaxis: { domain: [0, 0.75], title: "x", range: [-3, 3] },
        yaxis: { domain: [0, 0.75], title: "y", range: [-3, 3] },
        xaxis2: { domain: [0, 0.75], showticklabels: false, title: 'Marginal of x', side:'top', anchor: 'y2',scaleanchor:'x',  range: [-3, 3]},
        yaxis2: { domain: [0.8, 1], showticklabels: true, range:[0, 0.61] },
        xaxis3: { domain: [0.8, 1], showticklabels: true, range:[0, 0.61] },
        yaxis3: { domain: [0, 0.75], showticklabels: false, title: 'Marginal of y', side:'right', anchor: 'x3', scaleanchor:'y', range: [-3,3]},
        xaxis4: { domain: [0.8, 1], showticklabels: true, range:[0, losses['n_iterations']] },
        yaxis4: { domain: [0.8, 1], showticklabels: true, range: [-1, 3]}
    };

    const allplots = [contourTrace, samplesTrace, histX, histY, densY, densX, lossplot, logzplot, truelogzplot]
    Plotly.react('trainplot', allplots, layout)

}


export function plotStatesHistory(
    Plotly,
    trajectoryData,
    losses,
    density,
    trajectory_length,
    iter,
    element,
    options = {}) {
    const {
        levels = 10,
        alpha = 1.0,
        gridSize = 100,
        colormap = 'Viridis',
    } = options;

    let sec_col = 'rgb(51, 51, 51)';
    let f_col = "rgb(120, 208, 78)";
    let hoverTimeout = null;


    const numTrajectories = trajectoryData.length / (trajectory_length * 2);

    // Reshape flat array into [numTrajectories][trajectory_length][2]
    const trajectories = Array.from({ length: numTrajectories }, (_, i) =>
        Array.from({ length: trajectory_length }, (_, t) => {
            const baseIdx = (i * trajectory_length + t) * 2;
            return [trajectoryData[baseIdx], trajectoryData[baseIdx + 1]];
        })
    );

    const finalStates = trajectories.map(traj => traj[trajectory_length - 1]);
    const x = finalStates.map(p => p[0]);
    const y = finalStates.map(p => p[1]);

    // Loss data prep
    const iters = Array.from({ length: losses['n_iterations'] + 1 }, (_, i) => i);
    const truelogz_array = new Array(losses['n_iterations'] + 1).fill(losses['truelogz']);

    // Plot traces
    const contourTrace = {
        x: density["linspace"],
        y: density["linspace"],
        z: density["densityEnv"],
        type: 'contour',
        colorscale: colormap,
        showscale: false,
        contours: { coloring: 'lines' },
        line: { width: 2 },
        showlegend: false,
    };

    const samplesTrace = {
        x: x,
        y: y,
        mode: 'markers',
        type: 'scatter',
        marker: { color: sec_col, symbol: 137, opacity: alpha },
        showlegend: true,
        name: 'Samples',
        hoverinfo: 'x+y',
        customdata: Array.from({ length: numTrajectories }, (_, i) => i),
    };

    // Histograms and marginals (unchanged)
    const histX = {
        x: x,
        type: 'histogram',
        histnorm: 'probability density',
        marker: { color: sec_col },
        xaxis: 'x2',
        yaxis: 'y2',
        xbins: { size: 0.2 },
        showlegend: false,
    };
    const histY = {
        y: y,
        type: 'histogram',
        histnorm: 'probability density',
        marker: { color: sec_col },
        xaxis: 'x3',
        yaxis: 'y3',
        orientation: 'h',
        ybins: { size: 0.2 },
        showlegend: false,
    };
    const densX = {
        x: density["linspace"],
        y: density["densityX"],
        type: 'scatter',
        xaxis: 'x2',
        yaxis: 'y2',
        mode: 'lines',
        marker: { color: f_col },
        showlegend: true,
        name: 'Reward function',
    };
    const densY = {
        y: density["linspace"],
        x: density["densityY"],
        type: 'scatter',
        xaxis: 'x3',
        yaxis: 'y3',
        orientation: 'h',
        mode: 'lines',
        marker: { color: f_col },
        showlegend: false,
    };

    const lossplot = {
        x: iters,
        y: losses['losses'],
        name: 'Loss',
        type: 'scatter',
        mode: 'lines',
        xaxis: 'x4',
        yaxis: 'y4',
        line: { color: '#1f77b4', width: 1 },
    };
    const logzplot = {
        x: iters,
        y: losses['logzs'],
        name: 'logZ',
        type: 'scatter',
        mode: 'lines',
        xaxis: 'x4',
        yaxis: 'y4',
        line: { color: '#ff7f0e', width: 1 },
    };
    const truelogzplot = {
        x: iters,
        y: truelogz_array,
        name: 'True logZ',
        type: 'scatter',
        mode: 'lines',
        xaxis: 'x4',
        yaxis: 'y4',
        line: { color: '#d62728', width: 1 },
    };

    const layout = {
        title: `Iteration ${iter}/${losses['n_iterations']} `,
        showlegend: true,
        autosize: false,
        width: 775,
        height: 775,
        grid: { rows: 2, columns: 2, subplots: [['xy', 'x2y2'], ['x3y3', 'x4y4']] },
        legend: { x: 1, y: 1.2, xanchor: 'right', yanchor: 'top' },
        xaxis: { domain: [0, 0.75], title: "x", range: [-3, 3] },
        yaxis: { domain: [0, 0.75], title: "y", range: [-3, 3] },
        xaxis2: { domain: [0, 0.75], showticklabels: false, title: 'Marginal of x', side: 'top', anchor: 'y2', scaleanchor: 'x', range: [-3, 3] },
        yaxis2: { domain: [0.8, 1], showticklabels: true, range: [0, 0.61] },
        xaxis3: { domain: [0.8, 1], showticklabels: true, range: [0, 0.61] },
        yaxis3: { domain: [0, 0.75], showticklabels: false, title: 'Marginal of y', side: 'right', anchor: 'x3', scaleanchor: 'y', range: [-3, 3] },
        xaxis4: { domain: [0.8, 1], showticklabels: true, range: [0, losses['n_iterations']] },
        yaxis4: { domain: [0.8, 1], showticklabels: true, range: [-1, 3] },
        shapes: [{type: 'line', x0: iter, x1: iter, y0: -1, y1: 3, xref: 'x4', yref: 'y4', line: {color: 'black', width: 1, dash: 'solid'}}]
    };

    const baseTraces = [contourTrace, samplesTrace, histX, histY, densY, densX, lossplot, logzplot, truelogzplot];
    Plotly.react(element, baseTraces, layout);

    const plotDiv = document.getElementById(element);
    plotDiv.removeAllListeners?.('plotly_hover');

    plotDiv.on('plotly_hover', function (data) {
        clearTimeout(hoverTimeout);

        hoverTimeout = setTimeout(() => {
            const point = data.points[0];
            if (point.data.name !== 'Samples') return;

            const pointIndex = point.pointIndex;
            const traj = trajectories[pointIndex];
            if (!traj) return;

            const [x_traj, y_traj] = [traj.map(p => p[0]), traj.map(p => p[1])];

            const annotations = [];

            // Create an arrow annotation for each segment
            for (let i = 0; i < traj.length - 1; i++) {
                const [x0, y0] = traj[i];
                const [x1, y1] = traj[i + 1];

                annotations.push({
                    x: x1,
                    y: y1,
                    ax: x0,
                    ay: y0,
                    xref: 'x',
                    yref: 'y',
                    axref: 'x',
                    ayref: 'y',
                    showarrow: true,
                    arrowhead: 3,
                    arrowsize: 1,
                    arrowwidth: 2,
                    arrowcolor: 'black',
                    opacity: 1,
                });
            }

            const fadedSamples = {
                ...samplesTrace,
                marker: { ...samplesTrace.marker, opacity: 0.4 }
            };

            const layoutWithArrows = {
                ...layout,
                annotations: annotations
            };

            const trajPointsTrace = {
                x: x_traj,
                y: y_traj,
                mode: 'markers',
                type: 'scatter',
                marker: { color: 'black', size: 5 },
                name: 'Trajectory Points',
                hoverinfo: 'skip',
                showlegend: false,
            };

            Plotly.react(
                element,
                [contourTrace, fadedSamples, trajPointsTrace, histX, histY, densY, densX, lossplot, logzplot, truelogzplot],
                layoutWithArrows
            );
        }, 100);
    });


    plotDiv.removeAllListeners?.('plotly_unhover');
    plotDiv.on('plotly_unhover', function () {
        clearTimeout(hoverTimeout);
        Plotly.react(element, baseTraces, layout);
    });
}

export async function create_env_image(Plotly, density, colormap = 'Viridis') {
  // Create hidden div for Plotly plot
  const hiddenDiv = document.createElement('div');
  hiddenDiv.style.position = 'fixed';
  hiddenDiv.style.top = '-10000px';
  hiddenDiv.style.left = '-10000px';
  hiddenDiv.style.width = '256px';
  hiddenDiv.style.height = '256px';
  document.body.appendChild(hiddenDiv);

  const zmin = Math.min(...density.densityEnv.flat());
  const zmax = Math.max(...density.densityEnv.flat());
  const levels = 40;
  const size = (zmax - zmin) / levels;

  const contourTrace = {
    x: density.linspace,
    y: density.linspace,
    z: density.densityEnv,
    type: 'contour',
    colorscale: colormap,
    showscale: false,
    contours: {
        coloring: 'fill', // 'heatmap' or 'fill', or 'lines'
        showlabels: false,
        start: zmin,
        end: zmax,
        size: size,
    },
      line: {
    width: 0
    },
    showlegend: false,
  };
  const r = 3;

  const layout = {
      width: 256,
      height: 256,
      margin: {l: 0, r: 0, t: 0, b: 0},
      paper_bgcolor: 'white', // or transparent if you prefer
      plot_bgcolor: 'white',
      xaxis: {
        visible: false,
        showgrid: false,
        zeroline: false,
        showticklabels: false,
        range: [-r, r],
      },
      yaxis: {
        visible: false,
        showgrid: false,
        zeroline: false,
        showticklabels: false,
        range: [-r, r],
        scaleanchor: 'x',
        scaleratio: 1,
      },
    };


  await Plotly.newPlot(hiddenDiv, [contourTrace], layout, {staticPlot: true, displayModeBar: false});

  // Export to PNG base64
  const base64png = await Plotly.toImage(hiddenDiv, {format: 'png', width: 256, height: 256, scale: 1});

  // Clean up hidden div
  hiddenDiv.remove();

  return base64png; // this is the data URL string you can pass to p5.loadImage()
}