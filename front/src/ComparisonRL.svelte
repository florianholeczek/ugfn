<script>
  // Fig. 1: RL vs. GFlowNet vs. max-entropy RL on the example DAG of the flow section (src/DAG.js).
  import { onMount, onDestroy } from 'svelte';
  import { nodes, edges } from './DAG.js';

  let svg;
  let current = 'gfn';
  let status = '';
  let api = null;

  const methodOrder = ['rl', 'gfn', 'me'];
  const methodMeta = {
    rl:  { name: 'Reinforcement learning', color: 'var(--cmp-rl)' },
    gfn: { name: 'GFlowNet', color: 'var(--cmp-gfn)' },
    me:  { name: 'Max-entropy RL', color: 'var(--cmp-maxent)' },
  };

  function select(k) { current = k; api?.select(k); }

  onMount(() => {
    const N = Object.fromEntries(nodes.map(n => [n.id, n]));
    const out = Object.fromEntries(nodes.map(n => [n.id, edges.filter(e => e.from === n.id)]));
    const terminals = nodes.filter(n => n.final).map(n => n.id);
    const R = Object.fromEntries(terminals.map(t => [t, N[t].reward]));
    const Z = terminals.reduce((s, t) => s + R[t], 0);

    const trajs = [];
    (function walk(p) { const s = p.at(-1); if (!out[s].length) { trajs.push(p); return; } for (const e of out[s]) walk([...p, e.to]); })(['s0']);

    const edgeOf = (a, b) => edges.find(e => e.from === a && e.to === b);
    const Fout = s => out[s].reduce((t, e) => t + e.flow, 0);
    // GFlowNet: forward policy P_F(s'|s) = F(s->s') / F_out(s)
    const pGFN = trajs.map(p => p.slice(1).reduce((pr, s, i) => pr * edgeOf(p[i], s).flow / Fout(p[i]), 1));
    // Max-entropy RL: P(tau) ∝ R(x(tau))  ->  P(x) ∝ #paths(x) · R(x)
    const sumR = trajs.reduce((s, p) => s + R[p.at(-1)], 0);
    const pME = trajs.map(p => R[p.at(-1)] / sumR);
    // Standard RL: deterministic policy along one optimal trajectory
    const best = trajs.findIndex(p => R[p.at(-1)] === Math.max(...Object.values(R)));
    const pRL = trajs.map((_, i) => +(i === best));
    const probs = { rl: pRL, gfn: pGFN, me: pME };

    // ---------- Drawing ----------
    const NS = 'http://www.w3.org/2000/svg';
    const el = (tag, attrs, parent = svg) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; };
    const OY = 20;
    const gEdges = el('g', {}), gParticles = el('g', {}), gNodes = el('g', {});
    const edgeEl = {};
    for (const e of edges) {
      const a = N[e.from], b = N[e.to];
      edgeEl[e.from + '>' + e.to] = el('path', { class: 'edge', d: `M${a.x},${a.y + OY} L${b.x},${b.y + OY}` }, gEdges);
    }
    for (const n of nodes) {   // same shapes as Fig. 8
      const g = el('g', {}, gNodes), y = n.y + OY;
      if (n.id === 's0') el('polygon', { points: `${n.x-10},${y+20} ${n.x-10},${y-20} ${n.x+30},${y}`, fill: 'gray', stroke: 'black' }, g);
      else if (n.final) el('rect', { x: n.x-20, y: y-20, width: 40, height: 40, rx: 4, fill: 'gray', stroke: 'black' }, g);
      else el('circle', { cx: n.x, cy: y, r: 20, fill: 'gray', stroke: 'black' }, g);
      el('text', { x: n.x, y: y + 5, 'text-anchor': 'middle', 'font-size': 14, fill: 'white' }, g).textContent = n.id;
      if (n.final) el('text', { x: n.x, y: y + 36, 'text-anchor': 'middle', class: 'small' }, g).textContent = `R = ${R[n.id]}`;
    }

    const BY = 395, BX = 90, BW = 560, BH = 18, GAP = 26;
    el('text', { x: BX, y: BY - 12, class: 'small' }).textContent = 'sampling probability P(x)';
    const barEl = {};
    terminals.forEach((t, r) => {
      const y = BY + r * GAP;
      el('text', { x: BX - 12, y: y + 14, class: 'lbl', 'text-anchor': 'end' }).textContent = t;
      el('line', { x1: BX, x2: BX + BW, y1: y + BH/2, y2: y + BH/2, stroke: '#e3e3e3' });
      const fill = el('rect', { class: 'bar', x: BX, y, height: BH, width: 0, rx: 2 });
      const emp = el('rect', { x: BX, y: y + BH - 4, height: 4, width: 0, fill: '#222', opacity: .55 });
      el('rect', { x: BX, y, height: BH, width: R[t] / Z * BW, fill: 'none', stroke: '#222', 'stroke-dasharray': '3 3' });
      barEl[t] = { fill, emp, pct: el('text', { y: y + 14, class: 'pct' }) };
    });
    el('rect', { x: BX + BW - 230, y: BY - 22, width: 14, height: 9, fill: 'none', stroke: '#222', 'stroke-dasharray': '3 3' });
    el('text', { x: BX + BW - 211, y: BY - 14, class: 'small' }).textContent = 'target R(x)/Z';
    el('rect', { x: BX + BW - 110, y: BY - 18, width: 14, height: 4, fill: '#222', opacity: .55 });
    el('text', { x: BX + BW - 91, y: BY - 14, class: 'small' }).textContent = 'drawn samples';

    // ---------- State ----------
    let method = current, counts, nSamples;
    function render() {
      const p = probs[method], color = methodMeta[method].color;
      const eMass = Object.fromEntries(Object.keys(edgeEl).map(k => [k, 0])), tMass = Object.fromEntries(terminals.map(t => [t, 0]));
      trajs.forEach((tr, i) => { for (let j = 1; j < tr.length; j++) eMass[tr[j-1] + '>' + tr[j]] += p[i]; tMass[tr.at(-1)] += p[i]; });
      for (const k in edgeEl) {
        const w = eMass[k], on = w > 1e-9;
        edgeEl[k].style.stroke = on ? color : '#ccc';
        edgeEl[k].style.strokeWidth = on ? 2 + 26 * w : 2;
        edgeEl[k].style.opacity = on ? .85 : 1;
      }
      for (const t of terminals) {
        const b = barEl[t], w = tMass[t] * BW;
        b.fill.style.fill = color; b.fill.style.opacity = .8; b.fill.setAttribute('width', w);
        b.pct.setAttribute('x', BX + Math.max(w, R[t] / Z * BW) + 6);
        b.pct.textContent = (tMass[t] * 100).toFixed(0) + '%';
      }
      renderCounts();
    }
    function renderCounts() {
      for (const t of terminals) barEl[t].emp.setAttribute('width', nSamples ? counts[t] / nSamples * BW : 0);
      status = nSamples ? `${nSamples} samples drawn` : '';
    }
    function resetCounts() { gParticles.replaceChildren(); counts = Object.fromEntries(terminals.map(t => [t, 0])); nSamples = 0; renderCounts(); }

    function sampleTraj() {
      const p = probs[method]; let u = Math.random(), i = 0;
      for (; i < p.length - 1; i++) { u -= p[i]; if (u <= 0) break; }
      while (p[i] === 0) i--;
      return trajs[i];
    }
    function animate(path, delay) {
      const segs = path.slice(1).map((s, j) => edgeEl[path[j] + '>' + s]);
      const lens = segs.map(s => s.getTotalLength()), total = lens.reduce((a, b) => a + b);
      const dot = el('circle', { r: 4, fill: '#222', opacity: 0 }, gParticles);
      const jit = (Math.random() - .5) * 8, m = method, t0 = performance.now() + delay;
      (function step(now) {
        if (m !== method || !dot.isConnected) { dot.remove(); return; }
        const f = (now - t0) / 1400;
        if (f < 0) return requestAnimationFrame(step);
        if (f >= 1) { dot.remove(); counts[path.at(-1)]++; nSamples++; renderCounts(); return; }
        let d = f * total, k = 0; while (k < lens.length - 1 && d > lens[k]) d -= lens[k++];
        const pt = segs[k].getPointAtLength(d);
        dot.setAttribute('cx', pt.x); dot.setAttribute('cy', pt.y + jit); dot.setAttribute('opacity', .75);
        requestAnimationFrame(step);
      })(performance.now());
    }

    api = {
      select(k) { method = k; resetCounts(); render(); },
      sample() { for (let i = 0; i < 50; i++) animate(sampleTraj(), i * 60); },
      reset: resetCounts,
      destroy() { gParticles.replaceChildren(); },
    };
    resetCounts(); render();
  });

  onDestroy(() => api?.destroy());
</script>

<div class="cmp-card">
  <div class="cmp-tabs">
    {#each methodOrder as k}
      <button class:active={current === k} style="--c: {methodMeta[k].color}" on:click={() => select(k)}>{methodMeta[k].name}</button>
    {/each}
  </div>
  <svg bind:this={svg} viewBox="0 0 800 505" role="img" aria-label="Flow through the example DAG and resulting sampling distribution"></svg>
  <div class="cmp-controls">
    <button on:click={() => api?.sample()}>Draw 50 samples</button>
    <button on:click={() => api?.reset()}>Reset counts</button>
    <span>{status}</span>
  </div>
</div>

<style>
  .cmp-card {
    --cmp-rl: #443983; --cmp-gfn: #21918c; --cmp-maxent: #d9822b;
    background: #fff; color: #222; border-radius: 10px; padding: 14px 14px 10px;
    margin: 20px auto 8px; font-family: system-ui, sans-serif; box-sizing: border-box; width: 100%;
  }
  .cmp-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 4px; }
  .cmp-tabs button { border: 2px solid var(--c); background: #fff; color: var(--c); padding: 6px 12px; border-radius: 999px; font: inherit; font-size: 14px; cursor: pointer; }
  .cmp-tabs button.active { background: var(--c); color: #fff; }
  .cmp-controls { display: flex; gap: 8px; align-items: center; font-size: 13px; color: #888; }
  .cmp-controls button { font: inherit; font-size: 13px; padding: 4px 10px; border-radius: 6px; border: 1px solid #bbb; background: #fafafa; color: #222; cursor: pointer; }
  svg { width: 100%; height: auto; display: block; }
  svg :global(.edge) { fill: none; stroke-linecap: round; transition: stroke-width .6s ease, stroke .6s ease; }
  svg :global(.lbl) { font-size: 13px; fill: #222; }
  svg :global(.small) { font-size: 12px; fill: #888; }
  svg :global(.bar) { transition: width .6s ease, fill .6s ease; }
  svg :global(.pct) { font-size: 13px; font-variant-numeric: tabular-nums; fill: #222; }
</style>
