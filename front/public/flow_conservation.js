(function() {
  function drawMini(svg, board, x, y, BW, BH, CS, label) {
    const g = svg.append('g').attr('transform', `translate(${x},${y})`);
    g.append('rect')
      .attr('width', BW).attr('height', BH)
      .attr('fill', '#31688e')
      .attr('stroke', '#5ec962').attr('stroke-width', 2);
    for (let r = 0; r < board.length; r++) {
      for (let c = 0; c < board[0].length; c++) {
        const v = board[r][c];
        const col = v === 1 ? '#31688e' : v === 2 ? '#fde725' : '#111';
        g.append('rect')
          .attr('x', 8 + c * CS)
          .attr('y', 8 + r * CS)
          .attr('width', CS)
          .attr('height', CS)
          .attr('fill', col)
          .attr('stroke', '#333').attr('stroke-width', 0.5);
      }
    }
    g.append('text')
      .attr('x', BW / 2)
      .attr('y', -12)
      .attr('text-anchor', 'middle')
      .attr('fill', '#000')
      .text(label);
  }

  function initFlowConservationDemo(boardsData) {
    if (!boardsData) return;
    if (typeof d3 === 'undefined') {
      console.error('D3.js is required');
      return;
    }

    const svg = d3.select('#flowConservationSVG');
    if (svg.empty()) {
      console.error('SVG#flowConservationSVG not found');
      return;
    }

    // --- clear any previous demo timer to avoid stacking ---
    if (window._spawnTimer) {
      clearInterval(window._spawnTimer);
      window._spawnTimer = null;
    }

    // Prepare SVG
    const W = 900, H = 600;
    svg
      .attr('viewBox', `0 0 ${W} ${H}`)
      .style('background', '#FFF')
      .selectAll('*').remove();

    // Markers
    const defs = svg.append('defs');
    defs.append('marker').attr('id','mBlack').attr('viewBox','0 0 10 10')
      .attr('refX',10).attr('refY',5).attr('markerWidth',4).attr('markerHeight',4)
      .attr('orient','auto')
      .append('path').attr('d','M0,0L0,10L10,5Z').attr('fill','#000');
    defs.append('marker').attr('id','mGreen').attr('viewBox','0 0 10 10')
      .attr('refX',10).attr('refY',5).attr('markerWidth',4).attr('markerHeight',4)
      .attr('orient','auto')
      .append('path').attr('d','M0,0L0,10L10,5Z').attr('fill','#5ec962');

    // Layout
    const PAD = 8, CS_ROOT = 6, CS_ACT = 4;
    const COLS = boardsData.root.board[0].length, ROWS = boardsData.root.board.length;
    const BW_ROOT = COLS * CS_ROOT + PAD * 2, BH_ROOT = ROWS * CS_ROOT + PAD * 2;
    const BW_ACT  = COLS * CS_ACT  + PAD * 2, BH_ACT  = ROWS * CS_ACT  + PAD * 2;
    const xState = PAD, xAction = 300, xResult = W - BW_ROOT - PAD;
    const lanes = [H/4, H/2, 3*H/4];

    // Draw root state
    drawMini(svg, boardsData.root.board,
             xState, lanes[1] - BH_ROOT/2,
             BW_ROOT, BH_ROOT, CS_ROOT, 'State');

    // Compute flows & paths
    const actions   = boardsData.actions;
    const totalFlow = d3.sum(actions, a => a.flow);
    const weights   = actions.map(a => a.flow / (totalFlow || 1));
    const paths     = actions.map((a, i) => {
      const yR = lanes[1], xS = xState + BW_ROOT, yS = yR;
      const xA = xAction + BW_ACT/2, yA = lanes[i];
      const xF = xResult - 20,       yF = lanes[i];
      return [ {x:xS,y:yS}, {x:xA,y:yA}, {x:xF,y:yF} ];
    });

    // Draw actions, flows, results
    actions.forEach((a, i) => {
      const y = lanes[i];
      svg.append('line')
        .attr('x1', xState + BW_ROOT).attr('y1', lanes[1])
        .attr('x2', xAction + BW_ACT/2).attr('y2', y)
        .attr('stroke', '#000').attr('stroke-width', 2);

      drawMini(svg, a.board,
               xAction - BW_ACT/2 + 70, y - BH_ACT - 12,
               BW_ACT, BH_ACT, CS_ACT, 'Action');

      svg.append('line')
        .attr('x1', xAction + BW_ACT/2).attr('y1', y)
        .attr('x2', xResult - 20).attr('y2', y)
        .attr('stroke', '#000').attr('stroke-width', 2)
        .attr('marker-end', 'url(#mGreen)');

      svg.append('text')
        .attr('x', (xAction + BW_ACT/2 + xResult - 20) / 2)
        .attr('y', y - 6)
        .attr('text-anchor', 'middle')
        .attr('fill', '#000')
        .attr('font-size', 12)
        .text('Flow: ' + a.flow.toFixed(2));

      drawMini(svg, boardsData.results[i].board,
               xResult, y - BH_ROOT/2,
               BW_ROOT, BH_ROOT, CS_ROOT);
    });

    // Particle parameters
    const SPAWN_INT = 200;   // ms
    const DURATION  = 10000; // ms
    const MAX_PARTICLES = 300;

    function spawnParticle() {
      if (svg.selectAll('circle').size() >= MAX_PARTICLES) return;

      let r = Math.random(), cum = 0, idx = weights.length - 1;
      for (let j = 0; j < weights.length; j++) {
        cum += weights[j];
        if (r < cum) { idx = j; break; }
      }

      const pColor = idx === 0
        ? '#33ff66'
        : idx === 1
        ? '#ffd700'
        : '#ff6666';

      const seg = paths[idx];
      const circ = svg.append('circle')
        .attr('r', 5)
        .attr('fill', pColor)
        .attr('opacity', 1)
        .attr('cx', seg[0].x)
        .attr('cy', seg[0].y);

      circ.transition()
        .duration(DURATION)
        .attrTween('transform', () => t => {
          let x, y;
          if (t < 0.5) {
            const tt = t / 0.5;
            x = seg[0].x + (seg[1].x - seg[0].x) * tt;
            y = seg[0].y + (seg[1].y - seg[0].y) * tt;
          } else {
            const tt = (t - 0.5) / 0.5;
            x = seg[1].x + (seg[2].x - seg[1].x) * tt;
            y = seg[1].y + (seg[2].y - seg[1].y) * tt;
          }
          return `translate(${x - seg[0].x},${y - seg[0].y})`;
        })
        .on('end', function() { d3.select(this).remove(); });
    }

    // start fresh timer
    window._spawnTimer = setInterval(spawnParticle, SPAWN_INT);

    // expose stop method if you ever need it
    return {
      stop: () => {
        clearInterval(window._spawnTimer);
        window._spawnTimer = null;
      }
    };
  }

  window.initFlowConservationDemo = initFlowConservationDemo;
})();
