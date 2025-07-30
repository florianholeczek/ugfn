(function () {
  const PAD = 8,
    CS_ROOT = 6,
    CS_ACT = 4,
    W = 500,
    H = 600,
    SPAWN_INT = 200,
    DURATION = 10000,
    MAX_PARTICLES = 300,
    DIAG_Y_DELTA = 40; // Controls how much vertical space the diagonal spans

  const drawMini = (svg, board, x, y, bw, bh, cs, label = "") => {
    const g = svg.append("g").attr("transform", `translate(${x},${y})`);
    g.append("rect")
      .attr("width", bw)
      .attr("height", bh)
      .attr("fill", "#31688e")
      .attr("stroke", "#5ec962")
      .attr("stroke-width", 2);
    board.forEach((row, r) =>
      row.forEach((v, c) => {
        g.append("rect")
          .attr("x", PAD + c * cs)
          .attr("y", PAD + r * cs)
          .attr("width", cs)
          .attr("height", cs)
          .attr("fill", v === 1 ? "#31688e" : v === 2 ? "#fde725" : "#111")
          .attr("stroke", "#333")
          .attr("stroke-width", 0.5);
      })
    );
    if (label)
      g
        .append("text")
        .attr("x", bw / 2)
        .attr("y", -12)
        .attr("text-anchor", "middle")
        .attr("fill", "#000")
        .text(label);
  };

  window.initFlowConservationDemo = (data) => {
    if (!data || typeof d3 === "undefined") return;

    let svg = d3.select("#flowConservationSVG");
    if (svg.empty()) {
      let c = d3.select("#flowConservationContainer");
      if (c.empty()) {
        const h = Array.from(document.querySelectorAll("h2.section-title")).find((d) =>
          d.textContent.trim().toLowerCase().startsWith("domain application")
        );
        c = d3
          .select(h ? h.parentNode : document.body)
          .insert("div", h ? () => h : null)
          .attr("id", "flowConservationContainer")
          .style("max-width", "400px")
          .style("margin", "10px auto");
      }
      svg = c
        .append("svg")
        .attr("id", "flowConservationSVG")
        .style("width", "100%")
        .style("height", "500px");
    }

    if (window._spawnTimer) {
      clearInterval(window._spawnTimer);
      window._spawnTimer = null;
    }
    if (window._spawnParentTimer) {
      clearInterval(window._spawnParentTimer);
      window._spawnParentTimer = null;
    }

    svg.attr("viewBox", `0 0 ${W} ${H}`).style("background", "#fff").selectAll("*").remove();

    const defs = svg.append("defs");
    const addMarker = (id, color) =>
      defs
        .append("marker")
        .attr("id", id)
        .attr("viewBox", "0 0 10 10")
        .attr("refX", 5)
        .attr("refY", 5)
        .attr("markerWidth", 4)
        .attr("markerHeight", 4)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,0L0,10L10,5Z")
        .attr("fill", color);
    addMarker("mBlack", "#000");
    addMarker("mGreen", "#000000");

    const parents = data.parents || [];
    const cols = data.root.board[0].length,
      rows = data.root.board.length;
    const bwRoot = cols * CS_ROOT + PAD * 2,
      bhRoot = rows * CS_ROOT + PAD * 2;
    const bwAct = cols * CS_ACT + PAD * 2,
      bhAct = rows * CS_ACT + PAD * 2;
    const yRoot = parents.length ? 200 : PAD,
      yAction = yRoot + 300,
      yResult = H - bhRoot - PAD - 40;
    const lanes = [W / 4, W / 2, (3 * W) / 4];
    const pLanes = parents.map((_, i) => ((i + 1) / (parents.length + 1)) * W);

    const parentPaths = [];
    parents.forEach((p, i) => {
      drawMini(svg, p.board, pLanes[i] - bwRoot / 2, PAD+20, bwRoot, bhRoot, CS_ROOT, "Parent");
      svg
        .append("line")
        .attr("x1", pLanes[i])
        .attr("y1", PAD + bhRoot+20)
        .attr("x2", lanes[1])
        .attr("y2", yRoot-30)
        .attr("stroke", "#000")
        .attr("stroke-width", 2)
        .attr("marker-end", "url(#mBlack)");
      parentPaths.push([
        { x: pLanes[i], y: PAD + bhRoot },
        { x: lanes[1], y: yRoot }
      ]);
    });

    drawMini(svg, data.root.board, lanes[1] - bwRoot / 2, yRoot, bwRoot, bhRoot, CS_ROOT, "State");

    const totalFlow = d3.sum(data.actions, (a) => a.flow) || 1;
    const weights = data.actions.map((a) => a.flow / totalFlow);

    const paths = data.actions.map((a, i) => {
      const midY = yRoot + bhRoot + DIAG_Y_DELTA;
      return [
        { x: lanes[1], y: yRoot + bhRoot },
        { x: lanes[i], y: midY },
        { x: lanes[i], y: yResult - 10 }
      ];
    });

    data.actions.forEach((a, i) => {
      const x = lanes[i];
      const midY = yRoot + bhRoot + DIAG_Y_DELTA;

      // Diagonal from root to mid
      svg
        .append("line")
        .attr("x1", lanes[1])
        .attr("y1", yRoot + bhRoot)
        .attr("x2", x)
        .attr("y2", midY)
        .attr("stroke", "#000")
        .attr("stroke-width", 2);

      drawMini(svg, a.board, x - bwAct / 2 -30, yAction -160, bwAct, bhAct, CS_ACT, "Action");

      // Vertical line from mid to result
      svg
        .append("line")
        .attr("x1", x)
        .attr("y1", midY)
        .attr("x2", x)
        .attr("y2", yResult - 10)
        .attr("stroke", "#000")
        .attr("stroke-width", 2)
        .attr("marker-end", "url(#mGreen)");

      svg
        .append("text")
        .attr("x", x - bwAct / 2 -40)
        .attr("y", yAction-90)
        .attr("fill", "#000")
        .attr("font-size", 12)
        .text("Flow: " + a.flow.toFixed(2));

      drawMini(svg, data.results[i].board, x - bwRoot / 2, yResult+20, bwRoot, bhRoot, CS_ROOT, "Next State");
    });

    const spawn = () => {
      if (svg.selectAll("circle.flow").size() >= MAX_PARTICLES) return;
      let r = Math.random(),
        cum = 0,
        idx = weights.length - 1;
      for (let j = 0; j < weights.length; j++) {
        cum += weights[j];
        if (r < cum) {
          idx = j;
          break;
        }
      }
      const seg = paths[idx];
      const color = idx === 0 ? "#1b9e77" : idx === 1 ? "#d95f02" : "#7570b3";
      const circ = svg
        .append("circle")
        .attr("class", "flow")
        .attr("r", 5)
        .attr("fill", color)
        .attr("cx", seg[0].x)
        .attr("cy", seg[0].y);

      circ
        .transition()
        .duration(DURATION)
        .attrTween("transform", () => (t) => {
          const tt = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
          const p = t < 0.5 ? 1 : 2;
          const x = seg[p - 1].x + (seg[p].x - seg[p - 1].x) * tt;
          const y = seg[p - 1].y + (seg[p].y - seg[p - 1].y) * tt;
          return `translate(${x - seg[0].x},${y - seg[0].y})`;
        })
        .on("end", function () {
          d3.select(this).remove();
        });
    };

    const spawnParent = () => {
      if (!parentPaths.length) return;
      if (svg.selectAll("circle.parent-flow").size() >= MAX_PARTICLES) return;
      const idx = Math.floor(Math.random() * parentPaths.length);
      const seg = parentPaths[idx];
      const circ = svg
        .append("circle")
        .attr("class", "parent-flow")
        .attr("r", 4)
        .attr("fill", "#000")
        .attr("cx", seg[0].x)
        .attr("cy", seg[0].y);

      circ
        .transition()
        .duration(DURATION / 2)
        .attrTween("transform", () => (t) => {
          const x = seg[0].x + (seg[1].x - seg[0].x) * t;
          const y = seg[0].y + (seg[1].y - seg[0].y) * t;
          return `translate(${x - seg[0].x},${y - seg[0].y})`;
        })
        .on("end", function () {
          d3.select(this).remove();
        });
    };

    window._spawnTimer = setInterval(spawn, SPAWN_INT);
    // Uncomment to enable parent-to-root particles
    // if (parentPaths.length) {
    //   window._spawnParentTimer = setInterval(spawnParent, SPAWN_INT);
    // }

    return {
      stop: () => {
        clearInterval(window._spawnTimer);
        window._spawnTimer = null;
        if (window._spawnParentTimer) {
          clearInterval(window._spawnParentTimer);
          window._spawnParentTimer = null;
        }
      }
    };
  };
})();
