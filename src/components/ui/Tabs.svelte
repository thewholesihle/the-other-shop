<script>
  import { cn } from '../../lib/cn.js';

  // items: [{ value, label, count? }]
  let { items = [], value = $bindable(''), class: className = '', label = 'Tabs' } = $props();
</script>

<div role="tablist" aria-label={label} class={cn('inline-flex h-9 items-center rounded-lg bg-muted p-1 text-muted-foreground', className)}>
  {#each items as item (item.value)}
    <button
      type="button"
      role="tab"
      aria-selected={value === item.value}
      onclick={() => (value = item.value)}
      class={cn(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        value === item.value ? 'bg-background text-foreground shadow' : 'hover:text-foreground'
      )}
    >
      {item.label}
      {#if item.count !== undefined}<span class="text-xs font-normal tabular-nums opacity-70">{item.count}</span>{/if}
    </button>
  {/each}
</div>
