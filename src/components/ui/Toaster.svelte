<script>
  import { toasts, dismiss } from '../../lib/toast.js';
  import Check from 'lucide-svelte/icons/check';
  import CircleAlert from 'lucide-svelte/icons/circle-alert';
  import X from 'lucide-svelte/icons/x';
</script>

<div class="fixed bottom-4 right-4 z-[70] flex w-full max-w-sm flex-col gap-2" aria-live="polite">
  {#each $toasts as t (t.id)}
    <div class="flex items-start gap-3 rounded-lg border bg-background p-4 text-sm text-foreground shadow-lg animate-fade-in {t.kind === 'error' ? 'border-destructive/40' : 'border-border'}">
      <span class="mt-0.5 shrink-0 {t.kind === 'error' ? 'text-destructive' : t.kind === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}">
        {#if t.kind === 'error'}<CircleAlert size={16} />{:else}<Check size={16} />{/if}
      </span>
      <p class="flex-1 leading-snug">{t.message}</p>
      <button type="button" aria-label="Dismiss" onclick={() => dismiss(t.id)} class="shrink-0 text-muted-foreground hover:text-foreground"><X size={14} /></button>
    </div>
  {/each}
</div>
