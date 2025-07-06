// Initialize 7x7 grid filled with zeros
let grid = Array.from({length: 7}, () => Array(7).fill(0));

// Coordinate to index conversion
const coordToIndex = coord => coord + 3;

// Peaks at (1,1) and (-1,-1)
const peaks = [[1, 1], [-1, -1]];

export function plot_discrete(Plotly){
    peaks.forEach(([x, y]) => {
      const xi = coordToIndex(x);
      const yi = coordToIndex(y);
      grid[yi][xi] = 1;

      // Set neighbors to 4
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= -3 && nx <= 3 && ny >= -3 && ny <= 3) {
            const ni = coordToIndex(nx);
            const nj = coordToIndex(ny);
            if (grid[nj][ni] !== 1) grid[nj][ni] = 0.4;
          }
        }
      }
    });




    // Axis labels from -3 to 3
    const axisLabels = [-3, -2, -1, 0, 1, 2, 3];

    const data = [{
      z: grid,
      x: axisLabels,
      y: axisLabels,
      type: 'heatmap',
      colorscale: 'Viridis',
      zmin: 0,
      zmax: 1,
      showscale: false,
      hoverongaps: false,
      text: grid.map(row => row.map(val => `Reward ${val}`)),
      hovertemplate: "%{text}<extra></extra>"
    }];

    let shapes = [];
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        shapes.push({
          type: 'rect',
          x0: axisLabels[j] - 0.5,
          x1: axisLabels[j] + 0.5,
          y0: axisLabels[i] - 0.5,
          y1: axisLabels[i] + 0.5,
          line: {
            color: 'white',
            width: 1
          },
          fillcolor: 'rgba(0,0,0,0)' // transparent fill
        });
      }
    }

    const layout = {
      xaxis: {
        showgrid: false,
        tickmode: 'array',
        tickvals: axisLabels,
        ticktext: axisLabels,
        scaleanchor: 'y',
        gridcolor: 'rgba(0,0,0,0.3)',
        zeroline: false
      },
      yaxis: {
        showgrid: false,
        tickmode: 'array',
        tickvals: axisLabels,
        ticktext: axisLabels,
        gridcolor: 'rgba(0,0,0,0.3)',
        zeroline: false
      },
      shapes: shapes,
      margin: { t: 50, l: 50, r: 20, b: 50 },
      plot_bgcolor: 'white',
      paper_bgcolor: 'white'
    };

    Plotly.newPlot('DC_discrete_plot', data, layout);
}


export function plot_continuous(Plotly, view = 0) {
  const container = 'DC_continuous_plot';
  const range = [-3, 3];
  const resolution = 100;
  const variance = 0.4;
  const sigma2 = variance;

  Plotly.purge(container);

  const gauss = (x, y, muX, muY) => {
    const dx = x - muX;
    const dy = y - muY;
    return Math.exp(-(dx * dx + dy * dy) / (2 * sigma2));
  };

  const xVals = Array.from({ length: resolution }, (_, i) =>
    range[0] + ((range[1] - range[0]) * i) / (resolution - 1)
  );
  const yVals = Array.from({ length: resolution }, (_, i) =>
    range[0] + ((range[1] - range[0]) * i) / (resolution - 1)
  );

  const z = yVals.map(y =>
    xVals.map(x => gauss(x, y, 1, 1) + gauss(x, y, -1, -1))
  );

  const heatmapTrace = {
    z,
    x: xVals,
    y: yVals,
    type: 'heatmap',
    colorscale: 'Viridis',
    zsmooth: 'best',
    showscale: false,
    hoverongaps: false,
    text: z.map(row => row.map(val => `Reward ${val.toFixed(2)}`)),
    hovertemplate: "%{text}<extra></extra>"
  };

  const baseLayout = {
    xaxis: {
      showgrid: false,
      zeroline: false,
      range: range,
      scaleanchor: 'y',
      tickvals: [-3, -2, -1, 0, 1, 2, 3]
    },
    yaxis: {
      showgrid: false,
      zeroline: false,
      range: range,
      tickvals: [-3, -2, -1, 0, 1, 2, 3]
    },
    margin: { t: 50, l: 50, r: 20, b: 50 },
    plot_bgcolor: 'white',
    paper_bgcolor: 'white',
    annotations: []
  };

  Plotly.newPlot(container, [heatmapTrace], baseLayout).then(() => {
    if (view < 1) return;

    let currentPos = { x: 0, y: 0 };
    let stepCounter = 0;
    const arrowAnnotations = [];
    const permanentTraces = [heatmapTrace];

    const addArrowAnnotation = (x0, y0, x1, y1, color) => ({
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
      arrowcolor: color
    });

    const greyCircleTrace = (x, y) => ({
      x: [x],
      y: [y],
      mode: 'markers',
      type: 'scatter',
      marker: {
        color: 'gray',
        size: 100,
        symbol: 'circle',
        opacity: 0.5
      },
      hoverinfo: 'none',
      showlegend: false
    });

    const tripodMarkerTrace = (x, y) => ({
      x: [x],
      y: [y],
      mode: 'markers',
      type: 'scatter',
      marker: {
        color: 'black',
        size: 14,
        symbol: 137 // tripod-down symbol
      },
      hoverinfo: 'none',
      showlegend: false
    });

    const updatePlot = (tempTraces = [], tempAnnotations = []) => {
      Plotly.react(container, [...permanentTraces, ...tempTraces], {
        ...baseLayout,
        annotations: [...arrowAnnotations, ...tempAnnotations]
      });
    };

    const nextStep = () => {
      if (stepCounter >= 3) {
        // Add tripod marker at final position
        permanentTraces.push(tripodMarkerTrace(currentPos.x, currentPos.y));
        updatePlot();
        return;
      }

      stepCounter++;

      const muX = Math.random() * 4 - 2;
      const muY = Math.random() * 4 - 2;

      const halfSide = Math.SQRT1_2;
      const sampleX = muX + (Math.random() * 2 - 1) * halfSide;
      const sampleY = muY + (Math.random() * 2 - 1) * halfSide;

      // Step A: Gray arrow + planning circle
      const planningArrow = addArrowAnnotation(currentPos.x, currentPos.y, muX, muY, 'gray');
      const planningCircle = greyCircleTrace(muX, muY);
      updatePlot([planningCircle], [planningArrow]);

      setTimeout(() => {
        // Step B: Show black sampling arrow
        const samplingArrow = addArrowAnnotation(currentPos.x, currentPos.y, sampleX, sampleY, 'black');
        updatePlot([planningCircle], [planningArrow, samplingArrow]);

        setTimeout(() => {
          // Step C: Commit arrow and update current position
          arrowAnnotations.push(samplingArrow);
          currentPos = { x: sampleX, y: sampleY };
          updatePlot();
          setTimeout(nextStep, 1000);
        }, 1000);
      }, 1000);
    };

    setTimeout(nextStep, 1000);
  });
}




