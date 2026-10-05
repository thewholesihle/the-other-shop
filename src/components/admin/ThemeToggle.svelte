<script>
  import { themeMode, setThemeMode } from '../../lib/adminTheme.js';
  import { cn } from '../../lib/cn.js';
  import Sun from 'lucide-svelte/icons/sun';
  import Moon from 'lucide-svelte/icons/moon';
  import Monitor from 'lucide-svelte/icons/monitor';

  const options = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ];
</script>

<div role="radiogroup" aria-label="Theme" class="mx-1 mb-1.5 mt-1 grid grid-cols-3 gap-0.5 rounded-md bg-muted p-0.5">
  {#each options as o}
    <button
      type="button"
      role="radio"
      aria-checked={$themeMode === o.value}
      aria-label="{o.label} theme"
      title="{o.label}"
      onclick={() => setThemeMode(o.value)}
      class={cn(
        'flex h-7 items-center justify-center rounded-[5px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
        $themeMode === o.value && 'bg-background text-foreground shadow-xs'
      )}
    >
      <o.icon size={14} />
    </button>
  {/each}
</div>
