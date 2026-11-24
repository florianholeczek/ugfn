<script>
  // Fig. 2: MCMC vs. GFlowNet on a 2D plane drawn like the Playground environment
  // (filled Viridis contours on [-3, 3]^2). Four modes near the corners; the bottom-left one is smaller.
  // Load notes: static content (background, axes, labels) lives in one SVG that is never touched after setup.
  // Everything that changes lives in a separate overlay SVG on its own compositor layer, updated on a 10 Hz tick
  // (no per-frame work), so the background is never re-rasterized. The simulation pauses while the figure is
  // off screen or its accordion panel is closed.
  import { onMount, onDestroy } from 'svelte';

  let svg, overlay, card;
  let running = true, speed = 1;
  let api = null;

  function togglePlay() { running = !running; }
  function setSpeed(s) { speed = s; }

  onMount(() => {
    // ---------- Reward: four Gaussian bumps near the corners ----------
    const VAR = 0.3, P = 1.8;
    const modes = [
      { name: 'A', x: -P, y:  P, w: 1 },
      { name: 'B', x:  P, y:  P, w: 1 },
      { name: 'C', x:  P, y: -P, w: 1 },
      { name: 'D', x: -P, y: -P, w: 0.3 },   // smaller mode
    ];
    const R = (x, y) => (Math.abs(x) > 3 || Math.abs(y) > 3) ? 0
      : modes.reduce((s, m) => s + m.w * Math.exp(-((x - m.x) ** 2 + (y - m.y) ** 2) / (2 * VAR)), 0);
    const modeOf = (x, y) => {
      for (let k = 0; k < modes.length; k++) if ((x - modes[k].x) ** 2 + (y - modes[k].y) ** 2 < 1.2) return k;
      return modes.length;                     // between modes
    };

    // Discretised target (background grid) used for the exact GFlowNet sampler and the target shares
    const G = 120, CELL = 6 / G;
    const cellR = new Float64Array(G * G);
    const target = Array(modes.length + 1).fill(0);
    let Z = 0;
    for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {
      const x = -3 + (i + .5) * CELL, y = -3 + (j + .5) * CELL, r = R(x, y);
      cellR[i * G + j] = r; Z += r; target[modeOf(x, y)] += r;
    }
    for (let k = 0; k < target.length; k++) target[k] /= Z;
    const cdf = new Float64Array(G * G);
    for (let c = 0, acc = 0; c < G * G; c++) { acc += cellR[c] / Z; cdf[c] = acc; }

    // ---------- Layout ----------
    const NS = 'http://www.w3.org/2000/svg';
    const el = (tag, attrs, parent = svg) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; };
    const S = 380, TOP = 60, PL = 40;
    const panels = { mcmc: { x0: 10, name: 'MCMC', color: 'var(--cmp-mcmc)' }, gfn: { x0: 510, name: 'GFlowNet', color: 'var(--cmp-gfn)' } };
    const sx = (p, x) => p.x0 + PL + (x + 3) / 6 * S, sy = y => TOP + (3 - y) / 6 * S;

    // Background: filled contours (15 equal bands, Viridis, 0.8 opacity on white) like the Playground plots
    const VIRIDIS = ['#440154','#48186a','#472d7b','#424086','#3b528b','#33638d','#2c728e','#26828e','#21918c','#1fa088','#28ae80','#3fbc73','#5ec962','#84d44b','#addc30','#d8e219','#fde725'];
    const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const vir = t => { const f = t * (VIRIDIS.length - 1), i = Math.min(Math.floor(f), VIRIDIS.length - 2), u = f - i, a = hex(VIRIDIS[i]), b = hex(VIRIDIS[i + 1]); return a.map((v, k) => v + (b[k] - v) * u); };
    const BANDS = 15, Rmax = Math.max(...modes.map(m => m.w)), PX = 2 * S;
    const cv = document.createElement('canvas'); cv.width = cv.height = PX;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(PX, PX);
    const bandCol = [...Array(BANDS)].map((_, b) => vir(b / (BANDS - 1)).map(v => Math.round(.8 * v + .2 * 255)));
    for (let py = 0; py < PX; py++) for (let px = 0; px < PX; px++) {
      const x = -3 + (px + .5) / PX * 6, y = 3 - (py + .5) / PX * 6;
      const b = Math.min(BANDS - 1, Math.floor(R(x, y) / Rmax * BANDS)), c = bandCol[b], o = (py * PX + px) * 4;
      img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const bgUrl = cv.toDataURL('image/png');

    // Marker like Plotly symbol 137 used for samples in the Playground plots
    const MARK = 'M0,0V-4.5M0,0L-3.9,2.25M0,0L3.9,2.25';
    const NMARK = 250, TRAIL = 80, MAXTRAJ = 12;

    for (const k in panels) {
      const p = panels[k];
      el('text', { x: p.x0, y: 18, class: 'title', fill: p.color }).textContent = p.name;
      p.stat = el('text', { x: p.x0, y: 36, class: 'stat' }, overlay);
      el('image', { href: bgUrl, x: p.x0 + PL, y: TOP, width: S, height: S, preserveAspectRatio: 'none' });
      // zero lines and axes, Plotly style
      el('line', { x1: sx(p, 0), x2: sx(p, 0), y1: TOP, y2: TOP + S, stroke: '#444', 'stroke-opacity': .35 });
      el('line', { x1: p.x0 + PL, x2: p.x0 + PL + S, y1: sy(0), y2: sy(0), stroke: '#444', 'stroke-opacity': .35 });
      for (let v = -3; v <= 3; v++) {
        el('text', { x: sx(p, v), y: TOP + S + 16, class: 'tick', 'text-anchor': 'middle' }).textContent = v === 0 ? '0' : (v < 0 ? '−' + -v : v);
        el('text', { x: p.x0 + PL - 6, y: sy(v) + 4, class: 'tick', 'text-anchor': 'end' }).textContent = v === 0 ? '0' : (v < 0 ? '−' + -v : v);
      }
      for (const m of modes) el('text', { x: sx(p, m.x) + (m.x < 0 ? -26 : 26), y: sy(m.y) + (m.y > 0 ? -22 : 30), class: 'modelbl', 'text-anchor': 'middle' }).textContent = m.name;
      p.marks = [];
      const gm = el('g', { fill: 'none', stroke: '#000', 'stroke-width': 1 }, overlay);
      for (let i = 0; i < NMARK; i++) p.marks.push(el('path', { d: MARK, visibility: 'hidden' }, gm));
      p.markIdx = 0;
      p.layer = el('g', {}, overlay);
    }
    el('text', { x: sx(panels.gfn, 0) + 8, y: sy(0) - 8, class: 'tick', fill: '#fff' }).textContent = 's₀';

    // arrowhead for GFlowNet trajectories (black arrows as in the Playground)
    const defs = el('defs', {}, overlay);
    const mk = el('marker', { id: 'cmp-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto' }, defs);
    el('path', { d: 'M0,0L10,5L0,10z', fill: '#000' }, mk);

    // MCMC chain: trail + current state
    const trail = el('polyline', { fill: 'none', stroke: '#fff', 'stroke-width': 1.5, 'stroke-opacity': .9, 'stroke-linejoin': 'round' }, panels.mcmc.layer);
    const head = el('circle', { r: 5, fill: '#fff', stroke: '#000', 'stroke-width': 1.5 }, panels.mcmc.layer);
    el('circle', { cx: sx(panels.gfn, 0), cy: sy(0), r: 5, fill: '#fff', stroke: '#000', 'stroke-width': 1.5 }, overlay);

    // Share bars in the panel's colour, as in Fig. 1 (dashed = target)
    const BY = TOP + S + 50, BX = 60, BW = 300, BH = 12, GAP = 18;
    const rowNames = [...modes.map(m => 'mode ' + m.name), 'between'];
    for (const k in panels) {
      const p = panels[k]; p.bars = [];
      el('text', { x: p.x0, y: BY - 8, class: 'small' }).textContent = 'share of samples';
      rowNames.forEach((n, r) => {
        const y = BY + r * GAP, x = p.x0 + BX;
        el('text', { x: p.x0, y: y + 10, class: 'lbl' }).textContent = n;
        el('line', { x1: x, x2: x + BW, y1: y + BH / 2, y2: y + BH / 2, stroke: '#e3e3e3' });
        const fill = el('rect', { x, y, height: BH, width: 0, rx: 2, fill: p.color, opacity: .8 }, overlay);
        el('rect', { x, y, height: BH, width: Math.max(target[r] * BW, .5), fill: 'none', stroke: '#222', 'stroke-dasharray': '3 3' }, overlay);
        p.bars.push({ fill, pct: el('text', { x: x + BW + 6, y: y + 10, class: 'stat' }, overlay) });
      });
    }
    el('rect', { x: panels.gfn.x0 + BX + BW - 96, y: BY - 17, width: 14, height: 9, fill: 'none', stroke: '#000', 'stroke-dasharray': '3 3' });
    el('text', { x: panels.gfn.x0 + BX + BW - 77, y: BY - 9, class: 'small' }).textContent = 'target ∝ R(x)';

    // ---------- Samplers ----------
    const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
    const STEP = 0.3, T = 6;                       // MCMC proposal std; GFlowNet trajectory length
    function gfnSample() {
      // final state ~ R (trained GFlowNet), drawn on the background grid; path from s0 = (0, 0) in T steps
      let u = Math.random(), lo = 0, hi = G * G - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < u) lo = mid + 1; else hi = mid; }
      const i = Math.floor(lo / G), j = lo % G;
      const xe = -3 + (i + Math.random()) * CELL, ye = -3 + (j + Math.random()) * CELL;
      const wx = [0], wy = [0];                     // Brownian bridge for the intermediate states
      for (let t = 1; t <= T; t++) { wx.push(wx[t - 1] + .3 * gauss()); wy.push(wy[t - 1] + .3 * gauss()); }
      return [...Array(T + 1)].map((_, t) => [t / T * xe + wx[t] - t / T * wx[T], t / T * ye + wy[t] - t / T * wy[T]]);
    }

    // ---------- State ----------
    // Rates at 1×: MCMC 24 steps/s, GFlowNet 4 samples/s (= 24 steps/s), spread over a 10 Hz tick
    const TICK = 100, MC_RATE = 24, GF_RATE = 4, REVEAL = T, FADE = 12;
    let st, timer, visible = false;
    function reset() {
      st = {
        mc: { x: 0, y: 0, trail: [[0, 0]], n: 0, counts: Array(5).fill(0), seen: new Set(), acc: 0, due: 0, k: 0 },
        gf: { n: 0, counts: Array(5).fill(0), seen: new Set(), trajs: [], due: 0 },
      };
      for (const k in panels) { panels[k].marks.forEach(m => m.setAttribute('visibility', 'hidden')); panels[k].markIdx = 0; }
      panels.gfn.layer.replaceChildren();
      draw();
    }
    function mark(p, x, y) {
      const m = p.marks[p.markIdx]; p.markIdx = (p.markIdx + 1) % NMARK;
      m.setAttribute('transform', `translate(${sx(p, x).toFixed(1)},${sy(y).toFixed(1)})`); m.setAttribute('visibility', 'visible');
    }
    function count(s, x, y) { const r = modeOf(x, y); s.counts[r]++; s.n++; if (r < modes.length) s.seen.add(r); }

    function tick() {
      if (!running || !visible) return;
      // MCMC: same number of steps per second as the GFlowNet (T steps per sample)
      const m = st.mc;
      m.due += MC_RATE * speed * TICK / 1000;
      for (; m.due >= 1; m.due--) {
        const nx = m.x + STEP * gauss(), ny = m.y + STEP * gauss();
        if (Math.random() < R(nx, ny) / R(m.x, m.y)) { m.x = nx; m.y = ny; m.acc++; }
        count(m, m.x, m.y);
        if (m.k++ % 2 === 0) mark(panels.mcmc, m.x, m.y);
        m.trail.push([m.x, m.y]); if (m.trail.length > TRAIL) m.trail.shift();
      }
      // GFlowNet: trajectories are revealed one step per tick, then fade out
      const g = st.gf, P = panels.gfn;
      for (const t of g.trajs) {
        if (t.shown < t.pts.length) {
          t.shown++; t.el.setAttribute('points', t.pts.slice(0, t.shown).join(' '));
          if (t.shown === t.pts.length) mark(P, t.end[0], t.end[1]);
        } else { t.age++; t.el.setAttribute('opacity', (1 - t.age / FADE).toFixed(2)); }
      }
      while (g.trajs.length && (g.trajs[0].age >= FADE || g.trajs.length > MAXTRAJ)) {
        const t = g.trajs.shift(); t.el.remove(); if (t.shown < t.pts.length) mark(P, t.end[0], t.end[1]);
      }
      g.due += GF_RATE * speed * TICK / 1000;
      for (let k = 0; g.due >= 1; g.due--, k++) {
        const path = gfnSample(), end = path[T];
        count(g, end[0], end[1]);
        if (k > 0) { mark(P, end[0], end[1]); continue; }    // draw at most one new trajectory per tick
        const pts = path.map(([x, y]) => `${sx(P, x).toFixed(1)},${sy(y).toFixed(1)}`);
        g.trajs.push({ pts, end, shown: 1, age: 0, el: el('polyline', { points: pts[0], fill: 'none', stroke: '#000', 'stroke-width': 1.2,
          'marker-mid': 'url(#cmp-arrow)', 'marker-end': 'url(#cmp-arrow)' }, P.layer) });
      }
      draw();
    }
    function draw() {
      const M = panels.mcmc;
      trail.setAttribute('points', st.mc.trail.map(([x, y]) => `${sx(M, x).toFixed(1)},${sy(y).toFixed(1)}`).join(' '));
      head.setAttribute('cx', sx(M, st.mc.x)); head.setAttribute('cy', sy(st.mc.y));
      for (const [k, s] of [['mcmc', st.mc], ['gfn', st.gf]]) {
        const p = panels[k];
        p.bars.forEach((b, r) => { const f = s.n ? s.counts[r] / s.n : 0; b.fill.setAttribute('width', f * BW); b.pct.textContent = (f * 100).toFixed(0) + '%'; });
        p.stat.textContent = `${s.n.toLocaleString('en')} samples · modes found ${s.seen.size}/4`;
      }
    }

    // visible fraction > 0: also false while the closed accordion panel clips the card
    const io = new IntersectionObserver(([e]) => { visible = e.intersectionRatio > 0; }, { threshold: [0, 0.01, 0.1] });
    io.observe(card);
    timer = setInterval(tick, TICK);
    api = { reset, destroy() { clearInterval(timer); io.disconnect(); } };
    reset();
  });

  onDestroy(() => api?.destroy());
</script>

<div class="cmp-card" bind:this={card}>
  <div class="cmp-stack">
    <svg bind:this={svg} viewBox="0 0 1000 597" role="img" aria-label="MCMC random walk vs. GFlowNet trajectories on a 2D reward landscape with four modes"></svg>
    <svg bind:this={overlay} class="cmp-overlay" viewBox="0 0 1000 597" aria-hidden="true"></svg>
  </div>
  <div class="cmp-controls">
    <button on:click={togglePlay}>{running ? 'Pause' : 'Play'}</button>
    <span>speed</span>
    <button class:on={speed === 1} on:click={() => setSpeed(1)}>1×</button>
    <button class:on={speed === 10} on:click={() => setSpeed(10)}>10×</button>
    <button on:click={() => api?.reset()}>Restart</button>
  </div>
</div>

<style>
  .cmp-card {
    --cmp-mcmc: #443983; --cmp-gfn: #21918c;
    background: #fff; color: #222; border-radius: 10px; padding: 14px 14px 10px;
    margin: 20px auto 8px; font-family: system-ui, sans-serif; box-sizing: border-box; width: 100%;
  }
  svg { width: 100%; height: auto; display: block; }
  .cmp-stack { position: relative; }
  /* own compositor layer: overlay changes never re-rasterize the static background */
  .cmp-overlay { position: absolute; inset: 0; height: 100%; pointer-events: none; will-change: transform; }
  .cmp-controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 13px; color: #888; margin-top: 4px; }
  .cmp-controls button { font: inherit; font-size: 13px; padding: 4px 10px; border-radius: 6px; border: 1px solid #bbb; background: #fafafa; color: #222; cursor: pointer; }
  .cmp-controls button.on { background: #222; color: #fff; border-color: #222; }
  svg :global(.title) { font-size: 17px; font-weight: 600; }
  svg :global(.tick) { font-family: 'Open Sans', verdana, arial, sans-serif; font-size: 12px; fill: #444; }
  svg :global(.modelbl) { font-size: 15px; font-weight: 600; fill: #fff; }
  svg :global(.lbl) { font-size: 13px; fill: #222; }
  svg :global(.small) { font-size: 12px; fill: #888; }
  svg :global(.stat) { font-size: 12px; fill: #888; font-variant-numeric: tabular-nums; }
</style>
