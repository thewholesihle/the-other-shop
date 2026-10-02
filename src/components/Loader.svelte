<script>
  import { onMount, onDestroy } from 'svelte';
  import { softFade } from '../lib/motion.js';
  import { getOptimizedUrl } from '../lib/cloudinary.js';
  import { getBrand } from '../lib/brand.js';

  // The loading screen is the brand: the store's logo (or wordmark) with a quiet progress line,
  // identical to the static #boot screen the page ships with, so there's no visible hand-off.
  //
  // It still waits a beat before appearing — a loader that flashes for a few frames before a
  // fast load finishes is more jarring than showing nothing — and fades out as the reveal.
  const APPEAR_DELAY = 150;
  const brand = getBrand();
  let logoFailed = false;
  let show = false;
  let timer;

  onMount(() => {
    timer = setTimeout(() => { show = true; }, APPEAR_DELAY);
  });
  onDestroy(() => clearTimeout(timer));
</script>

{#if show}
<div
  class="fixed inset-0 z-[9999] bg-background text-foreground flex flex-col items-center justify-center gap-7"
  role="status"
  aria-label="Loading"
  transition:softFade={{ duration: 200 }}
>
  {#if brand.logo && !logoFailed}
    <img src={getOptimizedUrl(brand.logo, 440)} alt={brand.name} class="h-10 w-auto max-w-[220px] object-contain" decoding="async" onerror={() => (logoFailed = true)} />
  {:else}
    <span class="font-display text-3xl md:text-4xl font-bold tracking-[-0.02em]">{brand.name}</span>
  {/if}
  <span class="brand-bar" aria-hidden="true"></span>
</div>
{/if}

<style>
  .brand-bar {
    position: relative;
    display: block;
    width: 72px;
    height: 2px;
    overflow: hidden;
    border-radius: 1px;
    background: hsl(var(--border));
  }
  .brand-bar::after {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 40%;
    background: hsl(var(--foreground));
    animation: brand-slide 1.1s cubic-bezier(0.65, 0, 0.35, 1) infinite;
  }
  @keyframes brand-slide {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(250%); }
  }
  @media (prefers-reduced-motion: reduce) {
    .brand-bar::after { animation: none; width: 100%; opacity: 0.35; }
  }
</style>
