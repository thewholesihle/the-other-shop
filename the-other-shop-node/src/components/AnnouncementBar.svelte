<script>
  export let text = '';
  $: repeated = Array(8).fill(text + ' — ').join('');
</script>

<div class="bg-foreground text-primary-foreground overflow-hidden whitespace-nowrap py-2">
  <div class="animate-marquee inline-block">
    <span class="text-label tracking-[0.3em] text-[10px]">{repeated}</span>
    <span class="text-label tracking-[0.3em] text-[10px]">{repeated}</span>
  </div>
</div>
