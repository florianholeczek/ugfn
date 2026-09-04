<script context="module">
  /**
   * Shared position ticker.
   *
   * Rather than recomputing each button's position only on discrete events
   * (resize, timeouts, ResizeObserver) — which goes stale whenever a slow
   * visualization reflows the page between those events — every mounted button
   * re-measures its anchor once per animation frame from a single shared loop.
   * The position is therefore always derived from the current layout.
   */
  const _subscribers = new Set();
  let _rafId = null;

  function _tick() {
    _subscribers.forEach((fn) => fn());
    _rafId = _subscribers.size ? requestAnimationFrame(_tick) : null;
  }

  function subscribe(fn) {
    _subscribers.add(fn);
    if (_rafId == null && typeof requestAnimationFrame !== 'undefined') {
      _rafId = requestAnimationFrame(_tick);
    }
    return () => {
      _subscribers.delete(fn);
      if (_subscribers.size === 0 && _rafId != null) {
        cancelAnimationFrame(_rafId);
        _rafId = null;
      }
    };
  }
</script>

<script>
  import { onMount } from 'svelte';

  /** Text shown on the button (supports two lines / wrapping). */
  export let text = 'ExampleText';
  /** Where the button links to (opens in a new tab). */
  export let href = 'https://www.google.com';
  /** Icon shown on the left. Any path under /public (png or svg). */
  export let logo = '/images/colab.svg';

  let anchorEl;          // zero-size marker sitting inline in the text
  let top = 0;           // viewport-Y of the anchor, in px (position: fixed)
  let visible = false;   // toggled by the IntersectionObserver
  let lastTop = null;

  function measure() {
    if (!anchorEl) return;
    const t = anchorEl.getBoundingClientRect().top;
    if (t !== lastTop) {
      lastTop = t;
      top = t;
    }
  }

  onMount(() => {
    measure();
    const unsubscribe = subscribe(measure);

    // The button fades in while its anchor sits in the central band of the
    // viewport, and fades back out once the anchor leaves that band (in either
    // scroll direction).
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
      },
      { rootMargin: '-10% 0px -10% 0px', threshold: 0 }
    );
    io.observe(anchorEl);

    return () => {
      unsubscribe();
      io.disconnect();
    };
  });
</script>

<span class="anchored-btn-anchor" bind:this={anchorEl}></span>

<a
  class="anchored-btn"
  class:visible
  style="top: {top}px"
  href={href}
  target="_blank"
  rel="noopener noreferrer"
>
  <img class="anchored-btn-logo" src={logo} alt="" aria-hidden="true" />
  <span class="anchored-btn-text">{text}</span>
</a>

<style>
  .anchored-btn-anchor {
    display: inline;
    width: 0;
  }

  .anchored-btn {
    position: fixed;
    /* Right margin next to the 1000px-wide, centred text column. */
    left: calc(50% + 570px);
    z-index: 500;

    display: inline-flex;
    align-items: center;
    gap: 12px;
    max-width: 260px;
    box-sizing: border-box;
    padding: 10px 16px;

    background: #f2f2f2;
    border: 1px solid #d9d9d9;
    border-radius: 14px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.16);

    font-family: inherit;
    font-size: 15px;
    font-weight: 600;
    line-height: 1.2;
    color: #444;
    text-align: left;
    text-decoration: none;

    cursor: pointer;
    opacity: 0;
    transform: translateX(28px);
    transition: opacity 0.35s ease, transform 0.35s ease, background 0.15s ease;
    pointer-events: none;
  }

  .anchored-btn.visible {
    opacity: 1;
    transform: translateX(0);
    pointer-events: auto;
  }

  .anchored-btn:hover {
    background: #e8e8e8;
  }

  .anchored-btn:active {
    background: #e0e0e0;
  }

  .anchored-btn:focus-visible {
    outline: 2px solid #e8710a;
    outline-offset: 2px;
  }

  .anchored-btn-logo {
    height: 2.5em;
    width: auto;
    flex-shrink: 0;
  }

  .anchored-btn-text {
    white-space: normal;
  }
</style>
