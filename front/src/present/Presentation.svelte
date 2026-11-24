<script>
  // Talk version of the article (NeurIPS educational track, 15 min). Layout follows the JKU VDS Lab template
  // (Poppins, left-aligned titles, segmented color bar, logo top right), colors follow the article.
  // Keys: → / Space / PageDown next step, ← / PageUp back, 0–7 jump to section, F fullscreen,
  // N open the speaker-notes window, Home / End first / last slide.
  // Mouse: left click next, right click back (not on interactive figures), side buttons back / forward.
  import { onMount } from 'svelte';
  import Katex from 'svelte-katex';
  import 'katex/dist/katex.min.css';
  import ComparisonRL from '../ComparisonRL.svelte';
  import ComparisonMCMC from '../ComparisonMCMC.svelte';
  import FlowDAG from '../FlowDAG.svelte';
  import { edgeById } from '../DAG.js';
  import Media from './Media.svelte';

  const notesMode = new URLSearchParams(location.search).has('notes');

  // Sections of the talk (the article's "Reward functions" section is left out).
  const sections = [
    { n: 0, t: 'Intro' },
    { n: 1, t: 'Core ideas' },
    { n: 2, t: 'Tetris' },
    { n: 3, t: 'Flow & objective' },
    { n: 4, t: 'Continuous' },
    { n: 5, t: 'Training' },
    { n: 6, t: 'Playground' },
    { n: 7, t: 'Applications' },
  ];

  // steps = number of extra key presses on the slide before moving on
  const slides = [
    { id: 'title', section: 0, title: 'GFlowNet Playground', steps: 0,
      notes: 'Title. Introduce yourself and co-authors.' },
    { id: 'what', section: 0, title: 'What is the Playground?', steps: 3,
      notes: 'Interactive article explaining GFlowNets. Train them in the browser. Accompanying notebook, linked at relevant sections, goes through implementations. This talk follows the outline of the article.' },
    { id: 'gfn', section: 1, title: 'What are GFlowNets?', steps: 3,
      notes: 'Generative probabilistic model. Builds objects sequentially (like Lego). Learns from a reward, no dataset. Key property: P(x) ∝ R(x).' },
    { id: 'why', section: 1, title: 'Why proportional sampling?', steps: 3,
      notes: 'Domains where many high-reward candidates are wanted. Sampling from all modes, not just the biggest one. Drug discovery: ~10^60 molecules, expensive testing; candidates from the same region may fail for the same reasons → diversity is crucial.' },
    { id: 'rl', section: 1, title: 'GFlowNets and RL', steps: 1,
      notes: 'Reward maximization vs. proportional sampling. Starts on RL: one path to x9. Next → GFlowNet: proportional. Draw 50 samples.' },
    { id: 'mcmc', section: 1, title: 'GFlowNets and MCMC', steps: 3,
      notes: 'Same objective: distribution matching. GFlowNet infers location of modes via learned policy in structured reward spaces. Amortization: uses information of previous samples → faster discovery of modes, esp. with sparse reward. Press Play, then 8×.' },
    { id: 'tetris', section: 2, title: 'Fundamentals with Tetris', steps: 3,
      notes: 'State = board. Action = piece + rotation + column. Start with blank state, select action with policy, continue for fixed length or until stop action, collect reward. During training: update policy based on it.' },
    { id: 'dag', section: 3, title: 'Flow, policies and objective', steps: 3,
      notes: 'Policy predicts flow to each next state; transition probabilities = normalized flows. Flow matching: inflow = outflow. Steps: (1) edge s2→s4: policy, (2) state s4: inflow/outflow/loss, (3) free hover.' },
    { id: 'continuous', section: 4, title: 'Continuous GFlowNets', steps: 2,
      notes: 'GFlowNets also work in continuous domains. Policy outputs parameters of a Gaussian (mean + variance) instead of flows per action; sample action from it. Playground environment: 2D plane, reward = mixture of n Gaussians, fixed number of steps.' },
    { id: 'training', section: 5, title: 'Training', steps: 2,
      notes: 'Recorded runs. (1) matches the distribution, (2) mode collapse: only one mode, (3) off-policy training (extra exploration variance, annealed to 0) finds the second mode.' },
    { id: 'playground', section: 6, title: 'Playground', steps: 0,
      notes: 'Adjust the reward function, set hyperparameters, start training, inspect how learned flows change during training.' },
    { id: 'apps', section: 7, title: 'Domain applications', steps: 0,
      notes: 'Where diverse sampling matters. Name 2–3 examples.' },
    { id: 'end', section: 7, title: 'Thank you', steps: 0,
      notes: 'Thank you. QR codes: Playground, notebook, code.' },
  ];

  let slide = 0;
  let step = 0;

  // ---------- navigation ----------
  function go(s, st = 0) {
    slide = Math.max(0, Math.min(slides.length - 1, s));
    step = Math.max(0, Math.min(slides[slide].steps, st));
    syncOut();
  }
  function next() {
    if (step < slides[slide].steps) { step++; syncOut(); }
    else if (slide < slides.length - 1) go(slide + 1, 0);
  }
  function prev() {
    if (step > 0) { step--; syncOut(); }
    else if (slide > 0) go(slide - 1, slides[slide - 1].steps);
  }
  function jumpSection(n) {
    const i = slides.findIndex(s => s.section === n);
    if (i >= 0) go(i, 0);
  }

  // ---------- sync between slides window and notes window, and keep position on reload ----------
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('gfn-present') : null;
  function syncOut() {
    if (!notesMode) history.replaceState(null, '', `#${slide}.${step}`);
    channel?.postMessage({ slide, step });
  }
  if (channel) channel.onmessage = e => {
    if (e.data === 'hello') { if (!notesMode) channel.postMessage({ slide, step }); return; }
    slide = e.data.slide; step = e.data.step;
    if (!notesMode) history.replaceState(null, '', `#${slide}.${step}`);
  };

  function onKey(e) {
    if (e.target.closest?.('input, textarea, select')) return;
    const k = e.key;
    if (['ArrowRight', 'PageDown', ' ', 'ArrowDown'].includes(k)) { e.preventDefault(); next(); }
    else if (['ArrowLeft', 'PageUp', 'ArrowUp'].includes(k)) { e.preventDefault(); prev(); }
    else if (k === 'Home') go(0);
    else if (k === 'End') go(slides.length - 1);
    else if (/^[0-7]$/.test(k)) jumpSection(+k);
    else if (k === 'f' || k === 'F') document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    else if ((k === 'n' || k === 'N') && !notesMode) window.open(location.pathname + '?notes', 'gfn-notes', 'width=900,height=700');
  }

  // ---------- mouse: clicks outside interactive elements navigate ----------
  const interactive = 'button, a, input, select, textarea, video, .widget, .dag-wrap';
  function onClick(e) {
    if (e.button !== 0 || e.target.closest(interactive)) return;
    next();
  }
  function onContext(e) {
    if (e.target.closest(interactive)) return;
    e.preventDefault();
    prev();
  }
  function onMouseUp(e) {
    // side buttons: 3 = back, 4 = forward (preventDefault stops browser history navigation)
    if (e.button === 3) { e.preventDefault(); prev(); }
    else if (e.button === 4) { e.preventDefault(); next(); }
  }

  // ---------- 1920×1080 stage scaled to the window ----------
  let scale = 1, offX = 0, offY = 0;
  function fit() {
    scale = Math.min(innerWidth / 1920, innerHeight / 1080);
    offX = (innerWidth - 1920 * scale) / 2;
    offY = (innerHeight - 1080 * scale) / 2;
  }

  // ---------- notes window timer ----------
  let t0 = Date.now(), elapsed = '0:00';
  const fmt = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

  onMount(() => {
    const m = location.hash.match(/^#(\d+)\.(\d+)$/);
    if (m && !notesMode) go(+m[1], +m[2]);
    if (notesMode) channel?.postMessage('hello');
    fit();
    const iv = notesMode ? setInterval(() => elapsed = fmt(Date.now() - t0), 500) : null;
    return () => clearInterval(iv);
  });

  // ---------- DAG slide: key presses drive the highlight, hover still works ----------
  let dagNode = null, dagEdge = null;
  $: if (slides[slide].id === 'dag') {
    dagEdge = step === 1 ? edgeById('s2', 's4') : null;
    dagNode = step === 2 ? 's4' : null;
  }

  $: cur = slides[slide];
  $: curSection = cur.section;
  $: cover = cur.id === 'title' || cur.id === 'end';

  // colors of the five-segment bar (viridis, like the article's figures)
  const barColors = ['#443983', '#31688e', '#21918c', '#35b779', '#90d743'];
</script>

<svelte:window on:keydown={onKey} on:resize={fit} on:mouseup={notesMode ? null : onMouseUp} />

{#if notesMode}
  <!-- ================= speaker notes window ================= -->
  <div class="notes">
    <div class="notes-top">
      <span class="timer">{elapsed}</span>
      <button on:click={() => { t0 = Date.now(); elapsed = '0:00'; }}>reset timer</button>
      <span class="pos">slide {slide + 1}/{slides.length} · step {step}/{cur.steps}</span>
    </div>
    <h1>{cur.title}</h1>
    <p class="notes-text">{cur.notes}</p>
    {#if slides[slide + 1]}
      <p class="notes-next">next: {slides[slide + 1].title}</p>
    {/if}
    <div class="notes-nav">
      <button on:click={prev}>← back</button>
      <button on:click={next}>next →</button>
    </div>
  </div>
{:else}
  <!-- ================= slides ================= -->
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="viewport" on:click={onClick} on:contextmenu={onContext}>
    <div class="stage" style="transform: translate({offX}px, {offY}px) scale({scale})">

      {#if cover}
        <!-- ===== title and end slide, after the template's title / end slide ===== -->
        <div class="logos-top">
          <img src="present/mila.svg" alt="Mila">
          <img src="present/ivia.svg" alt="IVIA Lab, ETH Zürich">
          <img class="vds" src="present/vds.svg" alt="JKU Visual Data Science Lab">
        </div>

        <div class="cover" class:end={cur.id === 'end'}>
          <h1 class="cover-title">GFlowNet Playground</h1>
          <p class="cover-sub">Theory and Examples for an Intuitive Understanding</p>
          <div class="colorbar">
            {#each barColors as c}<span style="background:{c}"></span>{/each}
          </div>
          <p class="authors">
            Florian Holeczek<sup>1</sup>, Alexander Hillisch<sup>1</sup>, Andreas Hinterreiter<sup>1</sup>,
            Alex Hernández-García<sup>2</sup>, Marc Streit<sup>1</sup>, Christina Humer<sup>3,1</sup>
          </p>
          <p class="affil"><sup>1</sup>Johannes Kepler University Linz &nbsp; <sup>2</sup>Université de Montréal, Mila &nbsp; <sup>3</sup>ETH Zürich</p>
          {#if cur.id === 'end'}
            <p class="email">florian.holeczek@jku.at</p>
          {/if}
        </div>

        {#if cur.id === 'title'}
          <div class="title-qr">
            <img src="present/qr-playground.svg" alt="QR code to the GFlowNet Playground">
            <div class="qr-url">gfn-playground.jku-vds-lab.at</div>
          </div>
        {:else}
          <!-- where the template has its grey band -->
          <div class="end-band">
            <div class="qrs">
              <figure><img src="present/qr-playground.svg" alt="QR Playground"><figcaption style="color:#443983">Playground</figcaption></figure>
              <figure><img src="present/qr-notebook.svg" alt="QR notebook"><figcaption style="color:#21918c">Notebook</figcaption></figure>
              <figure><img src="present/qr-github.svg" alt="QR GitHub"><figcaption style="color:#55565c">Code</figcaption></figure>
            </div>
          </div>
        {/if}

      {:else}
        <header class="bar">
          <h1>{cur.title}</h1>
        </header>

        <main class="content">
          {#if cur.id === 'what'}
            <div class="cols">
              <ul class="ticks">
                <li class="frag" class:in={step >= 0}>Interactive article explaining GFlowNets</li>
                <li class="frag" class:in={step >= 1}>Train GFlowNets in the browser</li>
                <li class="frag" class:in={step >= 2}>Accompanying notebook, linked at the relevant sections</li>
              </ul>
              <div class="shots">
                <img src="present/pg-environment.png" alt="Playground environment">
                <img src="present/pg-training.png" alt="Playground training">
                <img src="present/pg-flow.png" alt="Playground flow">
              </div>
            </div>

          {:else if cur.id === 'gfn'}
            <div class="cols">
              <ul class="ticks">
                <li class="frag" class:in={step >= 0}><b>Generative</b> probabilistic model</li>
                <li class="frag" class:in={step >= 1}>Builds objects <b>sequentially</b>, step by step</li>
                <li class="frag" class:in={step >= 2}>Learns from a <b>reward</b> function, no dataset</li>
              </ul>
              <div class="keyprop frag" class:in={step >= 3}>
                <Katex displayMode>{'P(x) = \\frac{R(x)}{Z}'}</Katex>
                <div class="lbl">sampling ∝ reward &nbsp;·&nbsp; <i>Z</i> = sum of all rewards</div>
              </div>
            </div>

          {:else if cur.id === 'why'}
            <ul class="ticks">
              <li class="frag" class:in={step >= 0}>Domains where <b>many</b> high-reward candidates are wanted</li>
              <li class="frag" class:in={step >= 1}>Proportional sampling covers <b>all modes</b>, not just the biggest one</li>
              <li class="frag" class:in={step >= 2}>Drug discovery: <Katex>{'\\sim 10^{60}'}</Katex> molecules, expensive testing</li>
              <li class="frag" class:in={step >= 3}>Similar candidates fail for similar reasons → <b>diversity is crucial</b></li>
            </ul>

          {:else if cur.id === 'rl'}
            <div class="cols cmp">
              <div class="side">
                <p class="lead"><b>RL</b> maximizes reward</p>
                <p class="lead frag" class:in={step >= 1}><b>GFlowNet</b> samples proportionally to reward</p>
              </div>
              <div class="widget"><ComparisonRL methods={['rl', 'gfn']} current={['rl', 'gfn'][step]} /></div>
            </div>

          {:else if cur.id === 'mcmc'}
            <div class="cols cmp">
              <div class="side">
                <p class="lead frag" class:in={step >= 0}>Same objective: <b>distribution matching</b></p>
                <p class="lead frag" class:in={step >= 1}>Learned policy infers where modes are in <b>structured</b> reward spaces</p>
                <p class="lead frag" class:in={step >= 2}><b>Amortization</b>: uses information from previous samples</p>
                <p class="lead frag" class:in={step >= 3}>→ faster discovery of modes, especially with sparse reward</p>
              </div>
              <div class="widget"><ComparisonMCMC /></div>
            </div>

          {:else if cur.id === 'tetris'}
            <div class="cols tetris">
              <div class="tetris-figs">
                <figure class="frag" class:in={step >= 0}><img src="images/tetris-state-v2.svg" alt="State"><figcaption><b>State</b>: the current board</figcaption></figure>
                <figure class="frag" class:in={step >= 1}><img src="images/tetris-action-v2.svg" alt="Action"><figcaption><b>Action</b>: piece + rotation + column</figcaption></figure>
                <figure class="frag wide" class:in={step >= 2}><img src="images/tetris-reward-v2.svg" alt="Reward"><figcaption><b>Reward</b>: filled cells at the end of the trajectory</figcaption></figure>
              </div>
              <div class="frag video-col" class:in={step >= 3}>
                <Media src="present/media/tetris.webm" label="Tetris: sample construction" active={cur.id === 'tetris' && step >= 3} />
              </div>
            </div>

          {:else if cur.id === 'dag'}
            <div class="dag-wrap">
              <FlowDAG bind:hoveredNode={dagNode} bind:hoveredEdge={dagEdge} />
            </div>

          {:else if cur.id === 'continuous'}
            <div class="cols">
              <ul class="ticks narrow">
                <li class="frag" class:in={step >= 0}>GFlowNets also work in <b>continuous</b> domains</li>
                <li class="frag" class:in={step >= 1}>Policy outputs a <b>distribution</b> (mean + variance) to sample the next action from</li>
                <li class="frag" class:in={step >= 2}>Playground: 2D plane, reward = mixture of <i>n</i> Gaussians</li>
              </ul>
              <div class="video-col">
                <Media src="present/media/continuous.webm" label="Discrete vs. continuous sampling" active={cur.id === 'continuous'} />
              </div>
            </div>

          {:else if cur.id === 'training'}
            <div class="runs">
              <figure class="frag" class:in={step >= 0}><img src="images/run1.png" alt="Run 1"><figcaption>Matching the distribution</figcaption></figure>
              <figure class="frag" class:in={step >= 1}><img src="images/run2.png" alt="Run 2"><figcaption>Mode collapse</figcaption></figure>
              <figure class="frag" class:in={step >= 2}><img src="images/run3.png" alt="Run 3"><figcaption>Off-policy training</figcaption></figure>
            </div>

          {:else if cur.id === 'playground'}
            <figure class="pg">
              <Media src="present/media/playground.webm" fallback="present/pg-training.png" label="Playground" active={cur.id === 'playground'} />
              <figcaption>Adjust the reward, set hyperparameters, train, and inspect the learned flow</figcaption>
            </figure>

          {:else if cur.id === 'apps'}
            <ul class="ticks apps">
              <li>Molecule generation <span class="cite">Nica et al. 2022</span></li>
              <li>Biological sequence design <span class="cite">Jain et al. 2022</span></li>
              <li>Recommendation lists <span class="cite">Liu et al. 2023</span></li>
              <li>Phylogenetic inference <span class="cite">Zhou et al. 2024</span></li>
              <li>Crystal structures <span class="cite">Mistal et al. 2023</span></li>
              <li>Combinatorial optimization <span class="cite">Zhang et al. 2023</span></li>
              <li>Games (AFlowNets) <span class="cite">Jiralerspong et al. 2024</span></li>
              <li>LLM red-teaming <span class="cite">Lee et al. 2025</span></li>
            </ul>
          {/if}
        </main>

        <!-- section progress, styled like the template's segmented section bar -->
        <footer class="path">
          {#each sections as s}
            <button class="seg" class:active={s.n === curSection} class:done={s.n < curSection} on:click={() => jumpSection(s.n)}>
              <span class="line"></span><span class="t">{s.t}</span>
            </button>
          {/each}
        </footer>
      {/if}

      <div class="slide-num">{slide + 1}</div>
    </div>
  </div>
{/if}

<style>
  /* Poppins (SIL OFL), served locally so the talk works offline */
  @font-face { font-family: 'Poppins'; font-weight: 300; font-display: block; src: url('../present/fonts/poppins-latin-300-normal.woff2') format('woff2'); }
  @font-face { font-family: 'Poppins'; font-weight: 400; font-display: block; src: url('../present/fonts/poppins-latin-400-normal.woff2') format('woff2'); }
  @font-face { font-family: 'Poppins'; font-weight: 500; font-display: block; src: url('../present/fonts/poppins-latin-500-normal.woff2') format('woff2'); }
  @font-face { font-family: 'Poppins'; font-weight: 600; font-display: block; src: url('../present/fonts/poppins-latin-600-normal.woff2') format('woff2'); }

  :global(html), :global(body) { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #fff; }
  .viewport { position: fixed; inset: 0; background: #fff; }
  .stage {
    --purple: #443983; --teal: #21918c; --ink: #000; --title: #333; --muted: #6b6b70; --light: #eeeeee; --line: #d9d6e8;
    --mx: 150px;
    position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; transform-origin: 0 0;
    display: flex; flex-direction: column; overflow: hidden;
    font-family: 'Poppins', sans-serif; font-weight: 300; color: var(--ink); font-size: 40px; line-height: 1.4;
  }
  b { color: var(--purple); font-weight: 600; }

  /* header (template: title top left, SemiBold) */
  .bar { padding: 100px var(--mx) 0; }
  .bar h1 { margin: 0; font-size: 60px; font-weight: 600; line-height: 1.2; color: var(--title); }

  .content { flex: 1; min-height: 0; padding: 40px var(--mx) 30px; display: flex; flex-direction: column; justify-content: center; }

  /* fragments */
  .frag { opacity: 0; transform: translateY(12px); transition: opacity .35s ease, transform .35s ease; }
  .frag.in { opacity: 1; transform: none; }

  .cols { display: flex; gap: 80px; align-items: center; height: 100%; }
  .cols > * { flex: 1; min-width: 0; }

  /* bullets (template: small dark dot) */
  ul.ticks { margin: 0; padding: 0; list-style: none; }
  ul.ticks li { position: relative; padding-left: 40px; margin-bottom: 30px; }
  ul.ticks li::before { content: ""; position: absolute; left: 4px; top: 0.62em; width: 11px; height: 11px; border-radius: 50%; background: var(--title); }
  ul.ticks.narrow { flex: 0 0 640px; }

  /* slide number (template: bottom right, light grey) */
  .slide-num { position: absolute; right: 52px; bottom: 30px; font-size: 22px; color: #bfbfbf; font-weight: 400; }

  /* ===== title / end slide ===== */
  .logos-top { position: absolute; top: 70px; right: 130px; display: flex; align-items: center; gap: 56px; }
  .logos-top img { height: 64px; }
  .logos-top img.vds { height: 150px; }

  .cover { position: absolute; left: var(--mx); top: 470px; width: 1320px; }
  .cover.end { top: 240px; width: 1620px; }
  .cover-title { margin: 0; font-size: 104px; font-weight: 600; line-height: 1.1; color: var(--title); white-space: nowrap; }
  .cover-sub { margin: 26px 0 0; font-size: 48px; font-weight: 300; }
  .cover.end .cover-title { font-size: 76px; }
  .cover.end .cover-sub { font-size: 40px; margin-top: 16px; }
  .colorbar { display: flex; gap: 16px; margin: 44px 0 0; width: 1210px; }
  .colorbar span { flex: 1; height: 14px; }
  .cover.end .colorbar { margin-top: 34px; }
  .authors { margin: 44px 0 0; font-size: 28px; font-weight: 500; }
  .cover.end .authors { margin-top: 34px; }
  .affil { margin: 8px 0 0; font-size: 24px; color: var(--muted); }
  .email { margin: 10px 0 0; font-size: 26px; color: var(--teal); }

  .title-qr { position: absolute; right: 150px; bottom: 120px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
  .title-qr img { width: 280px; height: 280px; }
  .qr-url { font-size: 20px; color: var(--muted); }

  .end-band { position: absolute; left: 0; right: 0; bottom: 0; height: 360px; padding: 0 var(--mx); display: flex; align-items: center; }
  .qrs { display: flex; gap: 70px; }
  .qrs figure { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .qrs img { width: 260px; height: 260px; }
  .qrs figcaption { font-size: 26px; font-weight: 600; }

  /* ===== content slides ===== */
  /* what */
  .shots { display: flex; flex-direction: column; gap: 18px; flex: 0 0 720px !important; }
  .shots img { width: 100%; max-height: 250px; object-fit: cover; object-position: top; }

  /* gfn */
  .keyprop { flex: 0 0 600px !important; background: var(--light); padding: 30px 40px; text-align: center; font-size: 46px; }
  .keyprop .lbl { font-size: 24px; color: var(--muted); }

  /* comparisons */
  .cols.cmp { align-items: center; gap: 60px; }
  .side { flex: 0 0 500px !important; }
  .lead { font-size: 36px; margin: 0 0 30px; }
  .widget { flex: 1; }
  .widget :global(.cmp-card) { margin: 0; font-size: 20px; }
  .widget :global(.cmp-tabs button), .widget :global(.cmp-controls button) { font-size: 20px !important; padding: 8px 16px !important; }
  .widget :global(.cmp-controls) { font-size: 20px !important; }

  /* tetris */
  .tetris-figs { display: grid; grid-template-columns: 1fr 1fr; gap: 30px 40px; align-items: end; }
  .tetris-figs figure { margin: 0; text-align: center; }
  .tetris-figs figure.wide { grid-column: span 2; }
  .tetris-figs img { max-height: 250px; max-width: 100%; }
  figcaption { font-size: 26px; color: var(--muted); margin-top: 10px; text-align: center; }
  .video-col { height: 100%; display: flex; align-items: center; }

  /* DAG: the article figure, enlarged; anchored to the top so it does not move when the formulas change */
  .dag-wrap { display: flex; flex-direction: column; align-items: center; justify-content: flex-start; height: 100%; }
  .dag-wrap :global(.dag-svg) { width: 960px !important; height: auto; flex: none; margin: 0 auto !important; }
  .dag-wrap :global(.mathexpl) { display: none; }
  .dag-wrap :global(.formula-table) { width: 1500px !important; font-size: 24px !important; margin: 0 auto !important; }
  .dag-wrap :global(.formula-table td) { height: auto !important; padding: 8px 0 !important; }
  .dag-wrap :global(.formula-table td:first-child) { width: 180px !important; font-family: 'Poppins', sans-serif; font-weight: 600; }

  /* training */
  .runs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 40px; align-items: start; }
  .runs figure { margin: 0; }
  .runs img { width: 100%; }

  /* playground */
  figure.pg { margin: 0; height: 100%; display: flex; flex-direction: column; min-height: 0; }
  figure.pg :global(.media) { flex: 1; min-height: 0; }

  /* applications */
  .apps { columns: 2; column-gap: 80px; }
  .apps li { break-inside: avoid; }
  .cite { display: block; font-size: 24px; color: var(--muted); }

  /* section progress (template: segmented bar, current section colored, others light grey) */
  .path { display: grid; grid-template-columns: repeat(8, 1fr); gap: 16px; padding: 0 var(--mx) 34px; }
  .path .seg { background: none; border: 0; padding: 0; font: inherit; cursor: pointer; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; text-align: left; }
  .path .line { display: block; width: 100%; height: 8px; background: var(--light); }
  .path .t { font-size: 18px; color: #bfbfbf; font-weight: 400; }
  .path .seg.done .line { background: var(--purple); opacity: .35; }
  .path .seg.active .line { background: var(--teal); }
  .path .seg.active .t { color: var(--title); font-weight: 600; }

  /* notes window */
  .notes { font-family: 'Poppins', sans-serif; padding: 24px 36px; height: 100vh; box-sizing: border-box; overflow: auto; background: #1d1d1f; color: #eee; }
  .notes-top { display: flex; gap: 20px; align-items: center; color: #aaa; }
  .timer { font-size: 44px; font-weight: 600; color: #fff; font-variant-numeric: tabular-nums; }
  .notes h1 { color: #9f95e0; margin: 18px 0 8px; font-weight: 600; }
  .notes-text { font-size: 26px; line-height: 1.5; font-weight: 300; }
  .notes-next { color: #888; font-size: 20px; }
  .notes-nav { display: flex; gap: 12px; margin-top: 20px; }
  .notes button { font: inherit; font-size: 18px; padding: 8px 16px; border-radius: 6px; border: 1px solid #555; background: #333; color: #eee; cursor: pointer; }
</style>
