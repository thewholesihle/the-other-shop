<script>
  import { cn } from '../../lib/cn.js';

  // `title`/`description` render the standard header; omit both for a bare card.
  let { title = '', description = '', class: className = '', actions, children, ...rest } = $props();
</script>

<section class={cn('rounded-xl border border-border bg-card text-card-foreground shadow-sm', className)} {...rest}>
  {#if title || actions}
    <header class="flex items-start justify-between gap-4 p-6 pb-0">
      <div class="space-y-1">
        <h3 class="font-semibold leading-none tracking-tight">{title}</h3>
        {#if description}<p class="text-sm text-muted-foreground">{description}</p>{/if}
      </div>
      {#if actions}<div class="flex items-center gap-2">{@render actions()}</div>{/if}
    </header>
  {/if}
  {@render children?.()}
</section>
