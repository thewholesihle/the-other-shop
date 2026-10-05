<script>
  import { cn } from '../../lib/cn.js';

  let { checked = $bindable(false), class: className = '', ...rest } = $props();
</script>

<button
  type="button"
  role="switch"
  aria-checked={checked}
  onclick={() => (checked = !checked)}
  class={cn(
    'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-xs transition-colors',
    'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
    checked ? 'bg-primary' : 'bg-input', className
  )}
  {...rest}
>
  <span class={cn('pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform', checked ? 'translate-x-4' : 'translate-x-0')}></span>
</button>
