<script>
  import { cn } from '../../lib/cn.js';
  import X from 'lucide-svelte/icons/x';

  let { open = $bindable(false), title = '', description = '', class: className = '', children, footer } = $props();

  function close() { open = false; }
</script>

<svelte:window onkeydown={(e) => { if (open && e.key === 'Escape') close(); }} />

{#if open}
  <button type="button" aria-label="Close panel" class="fixed inset-0 z-50 bg-black/40 cursor-default animate-fade-in" onclick={close}></button>
  <div
    role="dialog"
    aria-modal="true"
    aria-label={title}
    class={cn('fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-border bg-background shadow-xl animate-fade-in', className)}
  >
    <header class="flex items-start justify-between gap-4 border-b border-border p-6">
      <div class="space-y-1 min-w-0">
        <h2 class="text-lg font-semibold leading-none tracking-tight truncate">{title}</h2>
        {#if description}<p class="text-sm text-muted-foreground">{description}</p>{/if}
      </div>
      <button type="button" aria-label="Close" onclick={close} class="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"><X size={18} /></button>
    </header>
    <div class="flex-1 overflow-y-auto p-6">{@render children?.()}</div>
    {#if footer}<footer class="flex items-center justify-end gap-2 border-t border-border p-4">{@render footer()}</footer>{/if}
  </div>
{/if}
