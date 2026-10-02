<script>
  import Button from '../ui/Button.svelte';
  import Card from '../ui/Card.svelte';
  import { inputCls, thCls, tdCls } from '../../lib/ui.js';
  import { toast } from '../../lib/toast.js';
  import { confirmDialog } from '../../lib/confirm.js';
  import Download from 'lucide-svelte/icons/download';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Search from 'lucide-svelte/icons/search';
  import Users from 'lucide-svelte/icons/users';

  let { subscribers = [], onUpdate = () => {} } = $props();

  let query = $state('');
  let filtered = $derived(subscribers.filter(s => !query.trim() || s.email.toLowerCase().includes(query.toLowerCase().trim())));

  function exportCSV() {
    const rows = [['Email', 'Date'], ...subscribers.map(s => [s.email, s.date])];
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function removeSubscriber(sub) {
    const ok = await confirmDialog.ask({
      title: 'Remove subscriber?',
      description: `${sub.email} will no longer receive newsletters.`,
      confirmLabel: 'Remove', destructive: true,
    });
    if (!ok) return;
    try {
      await onUpdate(subscribers.filter(s => s.id !== sub.id));
    } catch { /* Admin.svelte toasts the failure */ }
  }
</script>

<div class="space-y-6">
  <div class="flex items-end justify-between gap-4">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Subscribers</h1>
      <p class="text-sm text-muted-foreground">{subscribers.length} newsletter subscriber{subscribers.length !== 1 ? 's' : ''}.</p>
    </div>
    {#if subscribers.length > 0}
      <Button variant="outline" onclick={exportCSV}><Download size={15} /> Export CSV</Button>
    {/if}
  </div>

  {#if subscribers.length > 0}
    <div class="relative max-w-sm">
      <Search size={15} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input type="search" bind:value={query} placeholder="Search by email" aria-label="Search subscribers" class="{inputCls} pl-9" />
    </div>
  {/if}

  <Card class="overflow-hidden">
    {#if subscribers.length === 0}
      <div class="flex flex-col items-center gap-2 py-16 text-center">
        <Users size={28} class="text-muted-foreground" />
        <p class="font-medium">No subscribers yet</p>
        <p class="text-sm text-muted-foreground">The newsletter form in the footer collects emails.</p>
      </div>
    {:else}
      <table class="w-full text-sm">
        <thead class="border-b border-border">
          <tr>
            <th class={thCls}>Email</th>
            <th class="{thCls} hidden md:table-cell">Subscribed</th>
            <th class="{thCls} w-16 text-right"><span class="sr-only">Remove</span></th>
          </tr>
        </thead>
        <tbody>
          {#each filtered as sub (sub.id)}
            <tr class="border-b border-border/60 last:border-0 hover:bg-muted/50">
              <td class="{tdCls} font-medium">{sub.email}</td>
              <td class="{tdCls} hidden text-muted-foreground md:table-cell">{sub.date}</td>
              <td class="{tdCls} text-right">
                <Button variant="ghost" size="icon" aria-label="Remove {sub.email}" class="hover:text-destructive" onclick={() => removeSubscriber(sub)}><Trash2 size={15} /></Button>
              </td>
            </tr>
          {:else}
            <tr><td colspan="3" class="py-10 text-center text-sm text-muted-foreground">No subscribers match “{query}”.</td></tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </Card>
</div>
