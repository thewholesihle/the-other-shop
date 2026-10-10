<script>
  import { onMount, onDestroy } from 'svelte';
  import { softFade } from '../lib/motion.js';
  import { getBrand } from '../lib/brand.js';

  // The loading screen is the spinning logo (public/brand/loader.webp, a transparent animation built from the brand's GIF),
  // identical to the static #boot screen the page ships with, so there's no visible hand-off. Visitors who ask for reduced
  // motion get its first frame instead. On a dark palette the (black) logo is shown in white.
  //
  // It still waits a beat before appearing: a loader that flashes for a few frames before a fast load finishes is more
  // jarring than showing nothing. It fades out as the reveal.
  const APPEAR_DELAY = 150;
  const dark = getBrand().dark;
  let show = false;
  let timer;

  onMount(() => {
    timer = setTimeout(() => { show = true; }, APPEAR_DELAY);
  });
  onDestroy(() => clearTimeout(timer));
</script>

{#if show}
<div
  class="fixed inset-0 z-[9999] bg-background text-foreground flex items-center justify-center"
  role="status"
  aria-label="Loading"
  transition:softFade={{ duration: 200 }}
>
  <picture>
    <source media="(prefers-reduced-motion: reduce)" srcset="/brand/loader-still.png" />
    <img src="/brand/loader.webp" width="112" height="112" alt="" decoding="async" class="block h-28 w-28 object-contain" style={dark ? 'filter: invert(1)' : ''} />
  </picture>
</div>
{/if}
