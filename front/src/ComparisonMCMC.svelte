<script>
  // Fig. 2: MCMC vs. GFlowNet on the example DAG of the flow section (src/DAG.js).
  import { onMount, onDestroy } from 'svelte';
  import { nodes, edges } from './DAG.js';

  let svg, overlay, card;
  let running = true, speed = 1;
  let api = null;

  function togglePlay() { running = !running; }
  function setSpeed(s) { speed = s; api?.schedule(); }

  onMount(() => {
    const N = Object.fromEntries(nodes.map(n => [n.id, n]));
    const out = Object.fromEntries(nodes.map(n => [n.id, edges.filter(e => e.from === n.id)]));
    const par = id => edges.filter(e => e.to === id).map(e => e.from);
    const terminals = ['x5', 'x7', 'x9', 'x8'];
    const R = Object.fromEntries(terminals.map(t => [t, edges.filter(e => e.to === t).reduce((s, e) => s + e.flow, 0)]));
    const Z = terminals.reduce((s, t) => s + R[t], 0);
    const COL = { x5: '#d95f02', x7: '#7570b3', x9: '#66a61e', x8: '#e7298a' };

    // MCMC neighbourhood over complete objects: x ~ x' if their parent states are adjacent or siblings
    const adjacent = (a, b) => edges.some(e => (e.from === a && e.to === b) || (e.from === b && e.to === a))
                            || par(a).some(p => par(b).includes(p));
    const nbr = Object.fromEntries(terminals.map(t => [t, terminals.filter(u => u !== t && adjacent(par(t)[0], par(u)[0]))]));
    const nbrPairs = terminals.flatMap(t => nbr[t].filter(u => terminals.indexOf(u) > terminals.indexOf(t)).map(u => [t, u]));

    // ---------- Drawing ----------
    const NS = 'http://www.w3.org/2000/svg';
    const el = (tag, attrs, parent = svg) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; };
    const SC = 0.6, DY = 44;
    const P = { mcmc: { x0: 10, color: 'var(--cmp-mcmc)', name: 'MCMC' }, gfn: { x0: 515, color: 'var(--cmp-gfn)', name: 'GFlowNet' } };

    function drawDag(p, faint) {
      el('text', { x: p.x0, y: 20, class: 'title', fill: p.color }).textContent = p.name;
      p.stat = el('text', { x: p.x0, y: 38, class: 'stat' });
      const g = el('g', { transform: `translate(${p.x0},${DY}) scale(${SC})` });
      p.g = g; p.edge = {};
      const ge = el('g', { opacity: faint ? .25 : 1 }, g);
      for (const e of edges) {
        const a = N[e.from], b = N[e.to];
        p.edge[e.from + '>' + e.to] = el('path', { d: `M${a.x},${a.y} L${b.x},${b.y}`, fill: 'none',
          stroke: faint ? '#bbb' : '#9fcfcc', 'stroke-width': faint ? 3 : 2 + 2.5 * e.flow }, ge);   // GFN: width ∝ learned flow
      }
      p.extra = el('g', {}, g);
      const gn = el('g', {}, g);
      for (const n of nodes) {
        const gg = el('g', { opacity: faint && !n.final ? .25 : 1 }, gn);
        if (n.id === 's0') el('polygon', { points: `${n.x-10},${n.y+20} ${n.x-10},${n.y-20} ${n.x+30},${n.y}`, fill: 'gray', stroke: 'black' }, gg);
        else if (n.final) el('rect', { x: n.x-20, y: n.y-20, width: 40, height: 40, rx: 4, fill: COL[n.id], stroke: 'black' }, gg);
        else el('circle', { cx: n.x, cy: n.y, r: 20, fill: 'gray', stroke: 'black' }, gg);
        el('text', { x: n.x, y: n.y + 6, 'text-anchor': 'middle', 'font-size': 17, fill: 'white' }, gg).textContent = n.id;
        if (n.final) el('text', { x: n.x + 26, y: n.y + 34, 'font-size': 18, fill: '#666' }, gg).textContent = `R=${R[n.id]}`;
      }
    }
    drawDag(P.mcmc, true); drawDag(P.gfn, false);

    const arcPath = (a, b, bend = 38) => {
      const A = N[a], B = N[b], mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy);
      const s = dy >= 0 ? 1 : -1;
      return `M${A.x},${A.y} Q${mx + s * dy / L * bend},${my - s * dx / L * bend} ${B.x},${B.y}`;
    };
    const arcEl = {};
    for (const [a, b] of nbrPairs) arcEl[a + b] = arcEl[b + a] =
      el('path', { d: arcPath(a, b), fill: 'none', stroke: 'var(--cmp-mcmc)', 'stroke-width': 3, 'stroke-dasharray': '6 5', opacity: .45 }, P.mcmc.extra);
    const ring = el('rect', { width: 56, height: 56, rx: 8, fill: 'none', stroke: 'var(--cmp-mcmc)', 'stroke-width': 5 }, P.mcmc.extra);
    el('text', { x: 20, y: 290, 'font-size': 19, fill: 'var(--cmp-mcmc)' }, P.mcmc.g).textContent = '- - - proposals between';
    el('text', { x: 20, y: 314, 'font-size': 19, fill: 'var(--cmp-mcmc)' }, P.mcmc.g).textContent = 'neighbouring objects (red = rejected)';

    const SY = 268, SN = 30, SW = 15, BY = 340, BX = 40, BW = 300, BH = 14, GAP = 22;
    for (const k in P) {
      const p = P[k];
      el('text', { x: p.x0, y: SY - 8, class: 'small' }).textContent = `last ${SN} samples (newest right)`;
      p.strip = el('g', {});
      el('text', { x: p.x0, y: BY - 10, class: 'small' }).textContent = 'share of samples';
      p.bars = {};
      terminals.forEach((t, r) => {
        const y = BY + r * GAP, x = p.x0 + BX;
        el('rect', { x: p.x0, y: y + 1, width: 12, height: 12, rx: 2, fill: COL[t] });
        el('text', { x: p.x0 + 17, y: y + 12, class: 'lbl' }).textContent = t;
        el('line', { x1: x, x2: x + BW, y1: y + BH/2, y2: y + BH/2, stroke: '#e3e3e3' });
        const fill = el('rect', { x, y, height: BH, width: 0, fill: COL[t], opacity: .85 });
        el('rect', { x, y, height: BH, width: R[t] / Z * BW, fill: 'none', stroke: '#222', 'stroke-dasharray': '3 3' });
        p.bars[t] = { fill, pct: el('text', { x: x + BW + 6, y: y + 12, class: 'stat' }) };
      });
    }
    el('rect', { x: P.gfn.x0 + 250, y: BY - 20, width: 14, height: 9, fill: 'none', stroke: '#222', 'stroke-dasharray': '3 3' });
    el('text', { x: P.gfn.x0 + 269, y: BY - 12, class: 'small' }).textContent = 'target R(x)/Z';

    // ---------- Samplers ----------
    function mhStep(x) {
      const prop = nbr[x][Math.random() * nbr[x].length | 0];
      const a = Math.min(1, (R[prop] * nbr[x].length) / (R[x] * nbr[prop].length));
      const acc = Math.random() < a;
      return { prop, acc, next: acc ? prop : x };
    }
    function gfnTraj() {
      const path = ['s0'];
      while (out[path.at(-1)].length) {
        const es = out[path.at(-1)], tot = es.reduce((s, e) => s + e.flow, 0);
        let u = Math.random() * tot, e = es[0];
        for (e of es) if ((u -= e.flow) < 0) break;
        path.push(e.to);
      }
      return path;
    }

    // ---------- Loop ----------
    let st, timer, visible = false, destroyed = false;
    function reset() {
      st = { mc: { x: 'x9', seq: [], counts: {}, n: 0, runs: 0, acc: 0 }, gf: { seq: [], counts: {}, n: 0, runs: 0 } };
      for (const s of [st.mc, st.gf]) terminals.forEach(t => s.counts[t] = 0);
      for (const d of live) d.remove();
      live.clear();
      draw();
    }
    function record(s, x) {
      if (!s.seq.length || s.seq.at(-1) !== x) s.runs++;
      s.seq.push(x); if (s.seq.length > SN) s.seq.shift();
      s.counts[x]++; s.n++;
    }
    function tick() {
      if (!running || !visible) return;
      const T = 600 / speed;
      const r = mhStep(st.mc.x), arc = arcEl[st.mc.x + r.prop];
      arc.setAttribute('stroke', r.acc ? 'var(--cmp-mcmc)' : '#c33'); arc.setAttribute('opacity', 1); arc.setAttribute('stroke-dasharray', 'none');
      setTimeout(() => { arc.setAttribute('stroke', 'var(--cmp-mcmc)'); arc.setAttribute('opacity', .45); arc.setAttribute('stroke-dasharray', '6 5'); }, T * .7);
      st.mc.x = r.next; if (r.acc) st.mc.acc++;
      record(st.mc, st.mc.x);
      animate(gfnTraj(), Math.min(1300, 3 * T));
      draw();
    }
    // Particles: HTML dots on an overlay, moved with Web Animations on `transform` only, so the browser
    // runs them on the compositor without main-thread work, layout or SVG repaint per frame.
    const live = new Set();
    function animate(path, dur) {
      const k = overlay.clientWidth / 1000;                       // px per viewBox unit
      const pts = path.map(id => [(P.gfn.x0 + SC * N[id].x) * k, (DY + SC * N[id].y) * k]);
      const lens = pts.slice(1).map((b, i) => Math.hypot(b[0] - pts[i][0], b[1] - pts[i][1]));
      const total = lens.reduce((a, b) => a + b);
      let acc = 0;
      const frames = pts.map(([x, y], i) => {
        if (i) acc += lens[i - 1];
        return { transform: `translate(${x}px, ${y}px)`, offset: acc / total };
      });
      const dot = document.createElement('div');
      dot.className = 'cmp-dot';
      overlay.appendChild(dot);
      const anim = dot.animate(frames, { duration: dur, easing: 'linear', fill: 'forwards' });
      live.add(dot);
      anim.onfinish = () => { if (!live.delete(dot)) return; dot.remove(); record(st.gf, path.at(-1)); draw(); };
    }
    // Sequence strips: fixed set of rects, only their fill changes
    for (const k in P) P[k].cells = Array.from({ length: SN }, (_, i) =>
      el('rect', { x: P[k].x0 + i * SW, y: SY, width: SW - 2, height: 22, rx: 2, fill: 'none' }, P[k].strip));
    function draw() {
      const X = N[st.mc.x]; ring.setAttribute('x', X.x - 28); ring.setAttribute('y', X.y - 28);
      for (const [k, s] of [['mcmc', st.mc], ['gfn', st.gf]]) {
        const p = P[k], off = SN - s.seq.length;
        p.cells.forEach((c, i) => c.setAttribute('fill', i < off ? 'none' : COL[s.seq[i - off]]));
        for (const t of terminals) {
          const f = s.n ? s.counts[t] / s.n : 0;
          p.bars[t].fill.setAttribute('width', f * BW); p.bars[t].pct.textContent = (f * 100).toFixed(0) + '%';
        }
        const runLen = s.runs ? (s.n / s.runs).toFixed(2) : '–';
        p.stat.textContent = `${s.n} samples · mean run length ${runLen}` + (k === 'mcmc' && s.n ? ` · acceptance ${(st.mc.acc / s.n * 100).toFixed(0)}%` : '');
      }
    }
    function schedule() { clearInterval(timer); timer = setInterval(tick, 600 / speed); }

    // Only run while the figure is on screen (e.g. not while the accordion panel is closed)
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(card);

    api = { reset, schedule, destroy() { destroyed = true; clearInterval(timer); io.disconnect(); } };
    reset(); schedule();
  });

  onDestroy(() => api?.destroy());
</script>

<div class="cmp-card" bind:this={card}>
  <div class="cmp-stack">
    <svg bind:this={svg} viewBox="0 0 1000 440" role="img" aria-label="MCMC chain over terminal objects vs. GFlowNet constructing samples in the example DAG"></svg>
    <div bind:this={overlay} class="cmp-overlay" aria-hidden="true"></div>
  </div>
  <div class="cmp-controls">
    <button on:click={togglePlay}>{running ? 'Pause' : 'Play'}</button>
    <span>speed</span>
    <button class:on={speed === 1} on:click={() => setSpeed(1)}>1×</button>
    <button class:on={speed === 8} on:click={() => setSpeed(8)}>8×</button>
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
  .cmp-overlay { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
  .cmp-overlay :global(.cmp-dot) {
    position: absolute; left: -4px; top: -4px; width: 8px; height: 8px; border-radius: 50%;
    background: rgba(34, 34, 34, .75); will-change: transform;
  }
  .cmp-controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 13px; color: #888; margin-top: 4px; }
  .cmp-controls button { font: inherit; font-size: 13px; padding: 4px 10px; border-radius: 6px; border: 1px solid #bbb; background: #fafafa; color: #222; cursor: pointer; }
  .cmp-controls button.on { background: #222; color: #fff; border-color: #222; }
  svg :global(.title) { font-size: 17px; font-weight: 600; }
  svg :global(.lbl) { font-size: 14px; fill: #222; }
  svg :global(.small) { font-size: 13px; fill: #888; }
  svg :global(.stat) { font-size: 13px; fill: #888; font-variant-numeric: tabular-nums; }
</style>
