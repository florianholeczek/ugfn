// functions for computing the reward and visualizing the Environment

// calculate reward
function gaussianPDF(x, y, mean, variance) {
const dx = x - mean.x;
const dy = y - mean.y;
// simplified pdf as we do not allow covariance
return Math.exp(-(dx ** 2 + dy ** 2) / (2 * variance)) / (2 * Math.PI * variance);
}

function linspace(start, stop, num) {
    const step = (stop - start) / (num-1);
    return Array.from({length: num}, (_, i) => start + step * i);
}


// Density (reward for whole grid)
export function computeDensity(grid, gaussians) {
  const { x, y } = grid;
  const density = Array.from({ length: x.length }, () => Array(y.length).fill(0));
  for (const { mean, variance } of gaussians) {
    for (let i = 0; i < x.length; i++) {
      for (let j = 0; j < y.length; j++) {
        density[j][i] += gaussianPDF(x[i], y[j], mean, variance);
      }
    }
  }
  return density;
}
export function plotEnvironment(Plotly, containerId, gaussians, options = {}) {
  const gridSize = options.gridSize || 100;
  const alpha2D = options.alpha2D || 1.0;
  const alpha3D = options.alpha3D || 0.8;

  // Generate grid
  const range = [-3, 3];
  const x = Array.from({ length: gridSize }, (_, i) => range[0] + i * (range[1] - range[0]) / (gridSize - 1));
  const y = Array.from({ length: gridSize }, (_, i) => range[0] + i * (range[1] - range[0]) / (gridSize - 1));

  const density = computeDensity({ x, y }, gaussians);

  // 2D plot data
  const contourData = {
    x: x,
    y: y,
    z: density,
    type: "contour",
    colorscale: "Viridis",
    opacity: alpha2D,
    contours: { coloring: "fill", showlines: false },
    //colorbar: { len: 0.8, x: 0.45, thickness: 20 }, // Position shared colorbar in the middle
    showscale: false
  };

  // 3D plot data
  const surfaceData = {
    x: x,
    y: y,
    z: density,
    type: "surface",
    colorscale: "Viridis",
    opacity: alpha3D,
    showscale: false,
  };

  const layout_both = {
    title: options.title || null,
    grid: { rows: 1, columns: 2, pattern: "independent" },
    xaxis: { title: "x", domain: [0, 0.45] }, // Left plot domain
    yaxis: { title: "y", scaleanchor: "x" },
    scene: { domain: { x: [0.55, 1] } }, // Right plot domain for 3D scene
    margin: { t: 50, b: 50, l: 50, r: 50 },
  };

  const layout_2d = {
    width: 300,
    height: 300,
    showlegend: false,
    title: options.title || null,
    xaxis: { title: null, range: [-3, 3] },
    yaxis: { title: null, scaleanchor: "x", range: [-3, 3] },
    margin: { t: 10, b: 25, l: 25, r: 10 },
  };

  const layout_3d = {
    width: 600,
    height: 600,
    showlegend: false,
    title: options.title || null,
    scene: {
        xaxis: { title: "x", range: [-3, 3] },
        yaxis: { title: "y", range: [-3, 3] },
        zaxis: { title: "Reward", range: [0,1] } // Rename the Z axis
    },
    margin: { t: 10, b: 10, l: 10, r: 10 },
  };

  const config = {
    staticplot: true,
    displayModeBar: false, // Hide toolbar
  };

  if (containerId === "plot-container" || containerId === "plot-container2") {
    Plotly.react(containerId, [contourData, surfaceData], layout_both, config);
  } else if (containerId === "plot-container2d") {
    Plotly.react(containerId, [contourData], layout_2d, config);
  } else if (containerId === "plot-container3d") {
    Plotly.react(containerId, [surfaceData], layout_3d, config);
  }

}

export function compute_density_plotting(gaussians, gridSize){
  // Create grid for density plot
    //const [xGrid, yGrid, gridPoints] = grid(gridSize);
    const ls = linspace(-3, 3, gridSize);

    let densityEnv = computeDensity({x:ls,y:ls}, gaussians);
    densityEnv = densityEnv.map(row => row.slice());
    const densityEnvTransposed = densityEnv[0].map((_, colIndex) => densityEnv.map(row => row[colIndex]));

    // Compute marginal densities
    const densityX = densityEnv.reduce((sum, row) => sum.map((v, i) => v + row[i]), Array(gridSize).fill(0));
    const densityY = densityEnvTransposed.reduce((sum, row) => sum.map((v, i) => v + row[i]), Array(gridSize).fill(0));

    // Normalize marginals
    const normfact = 6/((gridSize-1)*gaussians.length)
    densityX.forEach((v, i) => densityX[i] *= normfact);
    densityY.forEach((v, i) => densityY[i] *= normfact);

    return {
      "linspace": ls,
      "densityEnv":densityEnv,
      "densityX": densityX,
      "densityY": densityY,
    }
}
