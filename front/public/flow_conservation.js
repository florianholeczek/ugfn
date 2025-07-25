/**
 * Compact Flow-Conservation demo with optional parent states.
 */
(function () {
  const PAD = 8,
    CS_ROOT = 6,
    CS_ACT = 4,
    W = 900,
    H = 600,
    SPAWN_INT = 200,
    DURATION = 10000,
    MAX_PARTICLES = 300;

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
          .style("max-width", "900px")
          .style("margin", "20px auto");
      }
      svg = c
        .append("svg")
        .attr("id", "flowConservationSVG")
        .style("width", "100%")
        .style("height", "auto");
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
        .attr("refX", 10)
        .attr("refY", 5)
        .attr("markerWidth", 4)
        .attr("markerHeight", 4)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,0L0,10L10,5Z")
        .attr("fill", color);
    addMarker("mBlack", "#000");
    addMarker("mGreen", "#5ec962");

    const parents = data.parents || [];
    const cols = data.root.board[0].length,
      rows = data.root.board.length;
    const bwRoot = cols * CS_ROOT + PAD * 2,
      bhRoot = rows * CS_ROOT + PAD * 2;
    const bwAct = cols * CS_ACT + PAD * 2,
      bhAct = rows * CS_ACT + PAD * 2;
    const xRoot = parents.length ? 200 : PAD,
      xAction = xRoot + 300,
      xResult = W - bwRoot - PAD - 40; // shift next state board left so it isn't cut
    const lanes = [H / 4, H / 2, (3 * H) / 4];
    const pLanes = parents.map((_, i) => ((i + 1) / (parents.length + 1)) * H);

    const parentPaths = [];
    parents.forEach((p, i) => {
      drawMini(svg, p.board, PAD, pLanes[i] - bhRoot / 2, bwRoot, bhRoot, CS_ROOT, "Parent");
      svg
        .append("line")
        .attr("x1", PAD + bwRoot)
        .attr("y1", pLanes[i])
        .attr("x2", xRoot)
        .attr("y2", lanes[1])
        .attr("stroke", "#000")
        .attr("stroke-width", 2)
        .attr("marker-end", "url(#mBlack)");
      parentPaths.push([
        { x: PAD + bwRoot, y: pLanes[i] },
        { x: xRoot, y: lanes[1] }
      ]);
    });

    drawMini(svg, data.root.board, xRoot, lanes[1] - bhRoot / 2, bwRoot, bhRoot, CS_ROOT, "State");

    const totalFlow = d3.sum(data.actions, (a) => a.flow) || 1;
    const weights = data.actions.map((a) => a.flow / totalFlow);
    const paths = data.actions.map((a, i) => [
      { x: xRoot + bwRoot, y: lanes[1] },
      { x: xAction + bwAct / 2, y: lanes[i] },
      { x: xResult - 20, y: lanes[i] }
    ]);

    data.actions.forEach((a, i) => {
      const y = lanes[i];
      svg
        .append("line")
        .attr("x1", xRoot + bwRoot)
        .attr("y1", lanes[1])
        .attr("x2", xAction + bwAct / 2)
        .attr("y2", y)
        .attr("stroke", "#000")
        .attr("stroke-width", 2);

      drawMini(svg, a.board, xAction - bwAct / 2 + 70, y - bhAct - 12, bwAct, bhAct, CS_ACT, "Action");

      svg
        .append("line")
        .attr("x1", xAction + bwAct / 2)
        .attr("y1", y)
        .attr("x2", xResult - 20)
        .attr("y2", y)
        .attr("stroke", "#000")
        .attr("stroke-width", 2)
        .attr("marker-end", "url(#mGreen)");

      svg
        .append("text")
        .attr("x", (xAction + bwAct / 2 + xResult - 20) / 2)
        .attr("y", y - 6)
        .attr("text-anchor", "middle")
        .attr("fill", "#000")
        .attr("font-size", 12)
        .text("Flow: " + a.flow.toFixed(2));

      drawMini(svg, data.results[i].board, xResult, y - bhRoot / 2, bwRoot, bhRoot, CS_ROOT, "Next State");
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
    // disable flow particles from parent state to board
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
