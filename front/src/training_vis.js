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

export function plotStates(Plotly, gaussians, states, options = {}) {
    const {
        title = null,
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

    // Create grid for density plot
    //const [xGrid, yGrid, gridPoints] = grid(gridSize);
    const ls = linspace(-3, 3, gridSize);

    let densityEnv = computeDensity({x:ls,y:ls}, gaussians);
    densityEnv = densityEnv.map(row => row.slice());

    // Compute marginal densities
    const densityX = densityEnv.reduce((sum, row) => sum.map((v, i) => v + row[i]), Array(gridSize).fill(0));
    const densityY = densityEnv[0].map((_, i) => densityEnv.reduce((sum, row) => sum + row[i], 0));

    // Normalize marginals
    const normfact = 6/((gridSize-1)*gaussians.length)
    densityX.forEach((v, i) => densityX[i] *= normfact);
    densityY.forEach((v, i) => densityY[i] *= normfact);


    // Contour plot for density
    const contourTrace = {
        x: ls,
        y: ls,
        z: densityEnv,
        type: 'contour',
        colorscale: colormap,
        showscale:false,
        contours: { coloring: 'lines'},
        line:{width: 2}
    };

    // Scatter plot for sampled states
    const samplesTrace = {
        x: x,
        y: y,
        mode: 'markers',
        type: 'scatter',
        marker: { color: sec_col, symbol: 137, opacity: alpha }
    };

    // Marginal histograms
    const histX = {
        x: x,
        type: 'histogram',
        histnorm: 'probability density',
        marker: { color: sec_col },
        xaxis: 'x2',
        yaxis: 'y2',
        xbins: {size:0.2}
    };
    const histY = {
        y: y,
        type: 'histogram',
        histnorm: 'probability density',
        marker: { color: sec_col },
        xaxis: 'x3',
        yaxis: 'y3',
        orientation: 'h',
        ybins: {size:0.2}
    };

    const densX = {
        x: ls,
        y: densityX,
        type: 'scatter',
        xaxis: 'x2',
        yaxis: 'y2',
        mode:'lines',
        marker: { color: f_col },
    };
    const densY = {
        y: ls,
        x: densityY,
        type: 'scatter',
        xaxis: 'x3',
        yaxis: 'y3',
        orientation: 'h',
        mode:'lines',
        marker: { color: f_col },
    };

    // Layout configuration
    const layout = {
        title,
        autosize: false,
        showlegend:false,
        width: 800,
        height: 800,
        grid: { rows: 2, columns: 2, subplots: [['xy', 'x2y2'], ['x3y3', null]] },
        xaxis: { domain: [0, 0.75], title: "x", range: [-3, 3] },
        yaxis: { domain: [0, 0.75], title: "y", range: [-3, 3] },
        xaxis2: { domain: [0, 0.75], showticklabels: false, title: 'Marginal of x', side:'top', anchor: 'y2',  range: [-3, 3]},
        yaxis2: { domain: [0.8, 1], showticklabels: true, range:[0, 0.5] },
        xaxis3: { domain: [0.8, 1], showticklabels: true, range:[0, 0.5] },
        yaxis3: { domain: [0, 0.75], showticklabels: false, title: 'Marginal of y', side:'right', anchor: 'x3', range: [-3, 3]}
    };
    const layout2 = {
        xaxis: { autorange: false, range:[-3, 3]},
        yaxis: { autorange: false, range:[-3, 3]},
    }

    // Render the plot
    Plotly.newPlot('trainplot', [contourTrace, samplesTrace, histX, histY, densY, densX], layout);
}
