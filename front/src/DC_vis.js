


export function plot_discrete(Plotly, view = 0) {
  const gridSize = 7;
  const coordToIndex = coord => coord + 3;
  const axisLabels = [-3, -2, -1, 0, 1, 2, 3];

  // Grid setup
  let grid = Array.from({ length: gridSize }, () => Array(gridSize).fill(0));
  const peaks = [[1, 1], [-1, -1]];

  peaks.forEach(([x, y]) => {
    const xi = coordToIndex(x), yi = coordToIndex(y);
    grid[yi][xi] = 1;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        let nx = x + dx, ny = y + dy;
        if (nx >= -3 && nx <= 3 && ny >= -3 && ny <= 3) {
          let ni = coordToIndex(nx), nj = coordToIndex(ny);
          if (grid[nj][ni] !== 1) grid[nj][ni] = 0.4;
        }
      }
    }
  });

  const heatmap = {
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
    hovertemplate: "%{text}<extra></extra>",
    opacity: view === 0 ? 1 : 0.6
  };

  const baseShapes = [];
  for (let i = 0; i < 7; i++) {
    for (let j = 0; j < 7; j++) {
      baseShapes.push({
        type: 'rect',
        x0: axisLabels[j] - 0.5,
        x1: axisLabels[j] + 0.5,
        y0: axisLabels[i] - 0.5,
        y1: axisLabels[i] + 0.5,
        line: { color: 'white', width: 1 },
        fillcolor: 'rgba(0,0,0,0)'
      });
    }
  }

  const layoutBase = {
    xaxis: {
      showgrid: false,
      tickmode: 'array',
      tickvals: axisLabels,
      ticktext: axisLabels,
      scaleanchor: 'y',
      zeroline: false
    },
    yaxis: {
      showgrid: false,
      tickmode: 'array',
      tickvals: axisLabels,
      ticktext: axisLabels,
      zeroline: false
    },
    margin: { t: 50, l: 50, r: 20, b: 50 },
    plot_bgcolor: 'white',
    paper_bgcolor: 'white'
  };

  if (view === 0) {
    Plotly.newPlot('DC_discrete_plot', [heatmap], { ...layoutBase, shapes: baseShapes, annotations: [] });
    return;
  }

  const makeArrowAnno = (x0, y0, x1, y1, color) => ({
    ax: x0, ay: y0, x: x1, y: y1,
    xref: 'x', yref: 'y', axref: 'x', ayref: 'y',
    showarrow: true, arrowhead: 3, arrowsize: 1, arrowwidth: 1.5, arrowcolor: color
  });

  const randomNext = () => [Math.floor(Math.random() * 7) - 3, Math.floor(Math.random() * 7) - 3];

  const frames = [];
  const blackPaths = [];
  let current = [0, 0];
  let tripodPosition = null;

  for (let step = 0; step < 3; step++) {
    const [cx, cy] = current;

    // 1️⃣ Grey arrows
    const greyAnnos = [];
    for (let tx = -3; tx <= 3; tx++) {
      for (let ty = -3; ty <= 3; ty++) {
        if (tx === cx && ty === cy) continue;
        greyAnnos.push(makeArrowAnno(cx, cy, tx, ty, 'grey'));
      }
    }

    frames.push({
      data: [heatmap],
      layout: {
        ...layoutBase,
        shapes: [...baseShapes, ...blackPaths.map(p => p.shape)],
        annotations: greyAnnos
      }
    });

    // 2️⃣ Black arrow sampled
    const [nx, ny] = randomNext();
    const blackShape = {
      type: 'line',
      x0: cx, y0: cy, x1: nx, y1: ny,
      line: { color: 'black', width: 2 }
    };
    const blackAnno = makeArrowAnno(cx, cy, nx, ny, 'black');
    blackPaths.push({ shape: blackShape, anno: blackAnno });

    frames.push({
      data: [heatmap],
      layout: {
        ...layoutBase,
        shapes: [...baseShapes, ...blackPaths.map(p => p.shape)],
        annotations: [...greyAnnos, blackAnno]
      }
    });

    // 3️⃣ Only black arrows + tripod
    const blackOnlyAnnos = blackPaths.map(p => p.anno);
    const dataWithTripod = [heatmap];
    if (step === 2) {
      tripodPosition = [nx, ny];
      dataWithTripod.push({
        type: 'scatter',
        x: [nx],
        y: [ny],
        mode: 'markers',
        marker: {
          color: 'black',
          size: 14,
          symbol: 137 // Plotly symbol: tripod-down
        },
        hoverinfo: 'skip',
        showlegend: false
      });
    }

    frames.push({
      data: dataWithTripod,
      layout: {
        ...layoutBase,
        shapes: [...baseShapes, ...blackPaths.map(p => p.shape)],
        annotations: blackOnlyAnnos
      }
    });

    current = [nx, ny];
  }

  // Initialize and play once
  Plotly.newPlot('DC_discrete_plot', [heatmap], {
    ...layoutBase,
    shapes: baseShapes,
    annotations: []
  }).then(() => {
    const stepOnce = (i = 0) => {
      if (i >= frames.length) return;
      Plotly.react('DC_discrete_plot', frames[i].data, frames[i].layout);
      setTimeout(() => stepOnce(i + 1), 1200);
    };
    stepOnce();
  });
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
    hovertemplate: "%{text}<extra></extra>",
    opacity: view === 0 ? 1 : 0.6
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




