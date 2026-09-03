<script context="module">
  /**
   * Shared layout watcher.
   * Every AnchoredButton registers a callback that recomputes its vertical
   * position. Instead of giving every instance its own ResizeObserver / resize
   * listener (there may be many buttons), we keep a single shared set.
   */
  const _subscribers = new Set();

  function _notify() {
    _subscribers.forEach((cb) => cb());
  }

  let _initialized = false;
  function _ensureWatcher() {
    if (_initialized || typeof window === 'undefined') return;
    _initialized = true;
    window.addEventListener('resize', _notify);
    // Content on this page (plots, images, fonts) loads asynchronously and
    // shifts the layout. A ResizeObserver on <body> catches those reflows.
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(_notify);
      ro.observe(document.body);
    }
  }

  function registerWatcher(cb) {
    _ensureWatcher();
    _subscribers.add(cb);
    return () => _subscribers.delete(cb);
  }
</script>

<script>
  import { onMount } from 'svelte';
  import Button, { Label } from '@smui/button';

  /** Text shown on the button. */
  export let text = 'ExampleText';
  /** Where the button links to (opens in a new tab). */
  export let href = 'https://www.google.com';

  let anchorEl;          // zero-size marker sitting inline in the text
  let top = 0;           // document-Y position of the anchor, in px
  let visible = false;   // toggled by the IntersectionObserver

  function updatePosition() {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    top = rect.top + window.scrollY;
  }

  function open() {
    window.open(href, '_blank', 'noopener');
  }

  onMount(() => {
    updatePosition();

    const unregister = registerWatcher(updatePosition);

    // Catch late layout shifts from async-loaded content.
    const timers = [150, 500, 1500, 4000].map((t) => setTimeout(updatePosition, t));

    // The button fades in while its anchor sits in the central band of the
    // viewport, and fades back out once the anchor leaves that band (in either
    // scroll direction).
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
      },
      { rootMargin: '-15% 0px -15% 0px', threshold: 0 }
    );
    io.observe(anchorEl);

    return () => {
      unregister();
      io.disconnect();
      timers.forEach(clearTimeout);
    };
  });
</script>

<span class="anchored-btn-anchor" bind:this={anchorEl}></span>

<span class="anchored-btn" class:visible style="top: {top}px">
  <Button variant="raised" color="secondary" on:click={open}>
    <Label>{text}</Label>
  </Button>
</span>

<style>
  .anchored-btn-anchor {
    display: inline;
    width: 0;
  }

  .anchored-btn {
    position: absolute;
    /* Right margin next to the 1000px-wide, centred text column. */
    left: calc(50% + 570px);
    display: block;
    opacity: 0;
    transform: translateX(28px);
    transition: opacity 0.35s ease, transform 0.35s ease;
    pointer-events: none;
    z-index: 500;
    white-space: nowrap;
  }

  .anchored-btn.visible {
    opacity: 1;
    transform: translateX(0);
    pointer-events: auto;
  }
</style>
