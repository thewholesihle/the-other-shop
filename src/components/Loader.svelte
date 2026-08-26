<script>
  import { onMount, onDestroy } from 'svelte';
  import { softFade } from '../lib/motion.js';

  // A spinner that flashes on screen for a few frames before a fast load finishes
  // reads as more jarring than showing nothing at all — wait a beat before showing
  // it. This used to be a fixed 800ms that hid the spinner unconditionally, whether
  // or not the real data had actually arrived; now visibility is driven purely by
  // however long the caller's own {#if loading} block keeps this mounted, and the
  // fade below (not a dead opacity class racing against immediate DOM removal) is
  // what makes both the appearance and the handoff to real content feel smooth —
  // this is a full-screen opaque overlay, so its own fade-out doubles as the reveal.
  const APPEAR_DELAY = 150;
  let show = false;
  let timer;

  onMount(() => {
    timer = setTimeout(() => { show = true; }, APPEAR_DELAY);
  });
  onDestroy(() => clearTimeout(timer));
</script>

{#if show}
<div
  class="fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center"
  transition:softFade={{ duration: 200 }}
>
  <div class="relative w-16 h-16">
    <!-- Outer ring -->
    <div class="absolute inset-0 border-2 border-muted rounded-full opacity-20"></div>
    <!-- Spinning arc -->
    <div class="absolute inset-0 border-t-2 border-foreground rounded-full animate-spin"></div>
    <!-- Inner pulse -->
    <div class="absolute inset-4 bg-foreground/5 rounded-full animate-pulse"></div>
  </div>
  <p class="mt-6 text-[10px] tracking-[0.3em] uppercase font-bold text-muted-foreground animate-pulse">Loading</p>
</div>
{/if}

<style>
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .animate-spin {
    animation: spin 0.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }
</style>
