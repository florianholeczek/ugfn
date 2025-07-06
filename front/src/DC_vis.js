export function plot_discrete(Plotly, view = 0) {
  const container = 'DC_discrete_plot';
  const gridSize = 7;
  const coordToIndex = coord => coord + 3;
  const axisLabels = [-3, -2, -1, 0, 1, 2, 3];

  Plotly.purge(container);

  // Grid with peaks and surroundings
  let grid = Array.from({ length: gridSize }, () => Array(gridSize).fill(0));
  const peaks = [[1, 1], [-1, -1]];

  peaks.forEach(([x, y]) => {
    const xi = coordToIndex(x), yi = coordToIndex(y);
    grid[yi][xi] = 1;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (nx >= -3 && nx <= 3 && ny >= -3 && ny <= 3) {
          const ni = coordToIndex(nx), nj = coordToIndex(ny);
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

  // Base grid rectangles
  const baseShapes = [];
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
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
    paper_bgcolor: 'white',
    shapes: baseShapes,
    annotations: []
  };

  if (view === 0) {
    Plotly.newPlot(container, [heatmap], layoutBase);
    return () => {}; // no animation, no stop needed
  }

  if (view === 2) {
    const tripodPositions = [
      [1.25, 1.25],
      [1.25, 0.75],
      [0.75, 1.25],
      [0.75, 0.75],
      [-1.25, -1.25],
      [-1.25, -0.75],
      [-0.75, -1.25],
      [-0.75, -0.75],
      [-1, 0],
      [2, 0],
    ];

    const tripods = {
      type: 'scatter',
      x: tripodPositions.map(p => p[0]),
      y: tripodPositions.map(p => p[1]),
      mode: 'markers',
      marker: {
        color: 'black',
        size: 14,
        symbol: 137
      },
      hoverinfo: 'skip',
      showlegend: false
    };

    Plotly.newPlot(container, [heatmap, tripods], layoutBase);
    return () => {}; // no animation to stop here either
  }

  // Animation for view 1 or other

  const makeArrowAnno = (x0, y0, x1, y1, color) => ({
    ax: x0, ay: y0, x: x1, y: y1,
    xref: 'x', yref: 'y', axref: 'x', ayref: 'y',
    showarrow: true, arrowhead: 3, arrowsize: 1, arrowwidth: 1.5, arrowcolor: color
  });

  const randomNext = () => [
    Math.floor(Math.random() * gridSize) - 3,
    Math.floor(Math.random() * gridSize) - 3
  ];

  let isActive = true;

  let current = [0, 0];
  const blackPaths = [];
  const permanentAnnotations = [];

  const updatePlot = (extraAnnotations = []) => {
    const annotations = [...permanentAnnotations, ...extraAnnotations];
    const shapes = [...baseShapes, ...blackPaths.map(p => p.shape)];
    Plotly.react(container, [heatmap], { ...layoutBase, shapes, annotations });
  };

  const stepAnimation = (step = 0) => {
    if (!isActive) return;

    if (step >= 3) {
      // Reset animation state and loop after 1s pause
      current = [0, 0];
      blackPaths.length = 0;
      permanentAnnotations.length = 0;
      updatePlot();
      setTimeout(() => { if (isActive) stepAnimation(0); }, 1000);
      return;
    }

    const cx = current[0];
    const cy = current[1];

    // 1️⃣ Grey arrows (except current position)
    const greyAnnos = [];
    for (let tx = -3; tx <= 3; tx++) {
      for (let ty = -3; ty <= 3; ty++) {
        if (tx === cx && ty === cy) continue;
        greyAnnos.push(makeArrowAnno(cx, cy, tx, ty, '#444444'));
      }
    }

    updatePlot(greyAnnos);

    setTimeout(() => {
      if (!isActive) return;

      // 2️⃣ Black arrow sampled
      const [nx, ny] = randomNext();
      const blackShape = {
        type: 'line',
        x0: cx, y0: cy, x1: nx, y1: ny,
        line: { color: 'black', width: 2 }
      };
      const blackAnno = makeArrowAnno(cx, cy, nx, ny, 'black');
      blackPaths.push({ shape: blackShape, anno: blackAnno });

      updatePlot([...greyAnnos, blackAnno]);

      setTimeout(() => {
        if (!isActive) return;

        // 3️⃣ Show only black arrows + tripod if last step of cycle
        permanentAnnotations.push(blackAnno);
        current = [nx, ny];
        updatePlot(permanentAnnotations);

        setTimeout(() => {
          stepAnimation(step + 1);
        }, 1000);
      }, 1200);
    }, 1200);
  };

  Plotly.newPlot(container, [heatmap], layoutBase).then(() => {
    stepAnimation();
  });

  return () => {
    isActive = false;
  };
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

  const tripodPositions = [
    [1.66, 1.1],
    [1.05, 0.99],
    [0.87, 1.21],
    [0.66, 0.87],
    [-1.43, -1.05],
    [-1.66, -0.98],
    [-0.86, -1.1],
    [-0.86, -0.79],
    [-0.5, 0.5],
    [1.6, 0.2],
  ];

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

  if (view === 2) {
    const tripodTraces = tripodPositions.map(pos => tripodMarkerTrace(pos[0], pos[1]));
    Plotly.newPlot(container, [heatmapTrace, ...tripodTraces], baseLayout);
    // No animation for view 2, so return a no-op stop function
    return () => {};
  }

  // Animation logic for view 0 or 1 with looping and stoppable control
  let isActive = true;

  Plotly.newPlot(container, [heatmapTrace], baseLayout).then(() => {
    if (view === 0) return; // No animation for view 0 as per original code

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
        color: '#444444',
        size: 100,
        symbol: 'circle',
        opacity: 0.5
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
      if (!isActive) return;  // stop immediately if requested

      if (stepCounter >= 3) {
        permanentTraces.push(tripodMarkerTrace(currentPos.x, currentPos.y));
        updatePlot();

        // reset to loop animation
        stepCounter = 0;
        currentPos = { x: 0, y: 0 };
        arrowAnnotations.length = 0;

        setTimeout(() => {
          if (isActive) nextStep();
        }, 1000);

        return;
      }

      stepCounter++;

      const muX = Math.random() * 4 - 2;
      const muY = Math.random() * 4 - 2;

      const halfSide = Math.SQRT1_2;
      const sampleX = muX + (Math.random() * 2 - 1) * halfSide;
      const sampleY = muY + (Math.random() * 2 - 1) * halfSide;

      const planningArrow = addArrowAnnotation(currentPos.x, currentPos.y, muX, muY, '#444444');
      const planningCircle = greyCircleTrace(muX, muY);
      updatePlot([planningCircle], [planningArrow]);

      setTimeout(() => {
        if (!isActive) return;

        const samplingArrow = addArrowAnnotation(currentPos.x, currentPos.y, sampleX, sampleY, 'black');
        updatePlot([planningCircle], [planningArrow, samplingArrow]);

        setTimeout(() => {
          if (!isActive) return;

          arrowAnnotations.push(samplingArrow);
          currentPos = { x: sampleX, y: sampleY };
          updatePlot();

          setTimeout(nextStep, 1000);
        }, 1000);
      }, 1000);
    };

    setTimeout(nextStep, 1000);
  });

  // Return stop function to stop the animation on view change
  return () => {
    isActive = false;
  };
}
