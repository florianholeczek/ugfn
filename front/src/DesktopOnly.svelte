<script>
  /** Name of the interactive element that is not available on phones. */
  export let what = 'This interactive demo';
  /** Optional extra explanation. */
  export let detail = '';
</script>

<div class="desktop-only" role="note">
  <span class="material-icons desktop-only-icon" aria-hidden="true">desktop_windows</span>
  <div>
    <strong>{what} is only available on desktop.</strong>
    It needs a larger screen and more computing power than most phones offer.
    {#if detail}{detail}{/if}
    Open this page on a computer to try it.
  </div>
</div>

<style>
  .desktop-only {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    box-sizing: border-box;
    width: calc(100% - 32px);
    max-width: 1000px;
    margin: 1rem auto 1.5rem;
    padding: 14px 16px;
    background: #f9f5fc;
    border: 1px solid #ddd2e6;
    border-radius: 10px;
    color: #3a3a3a;
    font-size: 0.95rem;
    line-height: 1.5;
  }

  .desktop-only-icon {
    font-size: 28px;
    color: #6a4c82;
    flex-shrink: 0;
  }
</style>
