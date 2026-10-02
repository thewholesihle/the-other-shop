<script>
  import Button from './Button.svelte';
  import { confirmDialog } from '../../lib/confirm.js';

  let current = $state(null);

  // Wires the shared promise-style helper (lib/confirm.js) to this mounted dialog.
  confirmDialog.ask = (opts) => new Promise((resolve) => { current = { ...opts, resolve }; });

  function answer(v) { current?.resolve(v); current = null; }
</script>

<svelte:window onkeydown={(e) => { if (current && e.key === 'Escape') answer(false); }} />

{#if current}
  <button type="button" aria-label="Dismiss" class="fixed inset-0 z-[60] bg-black/40 cursor-default" onclick={() => answer(false)}></button>
  <div role="alertdialog" aria-modal="true" aria-label={current.title} class="fixed left-1/2 top-1/2 z-[60] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-background p-6 shadow-xl">
    <h2 class="text-lg font-semibold">{current.title}</h2>
    {#if current.description}<p class="mt-2 text-sm text-muted-foreground">{current.description}</p>{/if}
    <div class="mt-6 flex justify-end gap-2">
      <Button variant="outline" onclick={() => answer(false)}>Cancel</Button>
      <Button variant={current.destructive ? 'destructive' : 'default'} onclick={() => answer(true)}>{current.confirmLabel || 'Confirm'}</Button>
    </div>
  </div>
{/if}
