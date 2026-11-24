<script>
  // Video or image slot. If the video file is missing, shows `fallback` (an image) or a placeholder box,
  // so slides can be built before the recordings exist.
  export let src;               // e.g. "present/media/tetris.webm" or an image path
  export let fallback = null;   // image shown while the video is missing
  export let label = '';        // placeholder text
  export let active = true;     // play only while the slide is visible
  export let height = '100%';

  const isVideo = /\.(webm|mp4|mov)$/i.test(src);
  let failed = false;
  let video;

  $: if (video && !failed) {
    if (active) { video.currentTime = 0; video.play().catch(() => {}); }
    else video.pause();
  }
</script>

<div class="media" style="height:{height}">
  {#if isVideo && !failed}
    <video bind:this={video} {src} muted loop playsinline preload="auto" on:error={() => failed = true}></video>
  {:else if isVideo && fallback}
    <img src={fallback} alt={label} />
    <div class="missing">missing video: {src}</div>
  {:else if isVideo}
    <div class="placeholder">
      <div class="ph-label">{label}</div>
      <div class="ph-src">record and save as <code>public/{src}</code></div>
    </div>
  {:else}
    <img {src} alt={label} />
  {/if}
</div>

<style>
  .media { position: relative; display: flex; align-items: center; justify-content: center; width: 100%; }
  video, img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
  .placeholder {
    width: 100%; height: 100%; min-height: 200px; border: 3px dashed #c9c5dd; border-radius: 16px;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
    color: #55565c; background: #f4f3f9;
  }
  .ph-label { font-size: 30px; font-weight: 700; color: #443983; }
  .ph-src { font-size: 18px; }
  .missing {
    position: absolute; top: 8px; left: 8px; font-size: 14px; padding: 2px 8px; border-radius: 4px;
    background: #b71c1c; color: #fff;
  }
</style>
