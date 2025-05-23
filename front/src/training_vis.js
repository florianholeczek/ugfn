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

export function plotStates(Plotly, gaussians, states, losses, density, options = {}) {
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
