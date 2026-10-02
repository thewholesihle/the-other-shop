<script>
  export let text = '';
  $: clean = (text || '').trim();
  $: repeated = Array(8).fill(clean + ' — ').join('');
</script>

<!-- No announcement set → no bar at all (an empty one is just a black strip). -->
{#if clean}
<div class="bg-foreground text-primary-foreground overflow-hidden whitespace-nowrap py-2">
  <div class="animate-marquee inline-block">
    <span class="text-label text-primary-foreground tracking-[0.3em] text-[10px]">{repeated}</span>
    <span class="text-label text-primary-foreground tracking-[0.3em] text-[10px]">{repeated}</span>
  </div>
</div>
{/if}
