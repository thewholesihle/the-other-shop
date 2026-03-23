<script>
  import { onMount } from 'svelte';
  let visible = true;
  
  onMount(() => {
    // Small delay to ensure it feels "engaging" but doesn't block fast users
    const timer = setTimeout(() => visible = false, 800);
    return () => clearTimeout(timer);
  });
</script>

{#if visible}
<div class="fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center transition-opacity duration-500" class:opacity-0={!visible}>
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
