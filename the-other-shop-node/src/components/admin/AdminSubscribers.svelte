<script>
  export let subscribers = [];
  export let onUpdate = () => {};

  function exportCSV() {
    const rows = [['Email', 'Date'], ...subscribers.map(s => [s.email, s.date])];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `newsletter-subscribers-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function removeSubscriber(id) {
    onUpdate(subscribers.filter(s => s.id !== id));
  }
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-display font-bold mb-1">Newsletter Subscribers</h2>
      <p class="text-sm text-muted-foreground">{subscribers.length} subscriber{subscribers.length !== 1 ? 's' : ''}</p>
    </div>
    {#if subscribers.length > 0}
      <button onclick={exportCSV} class="flex items-center gap-2 border border-border px-4 py-2.5 text-label tracking-[0.15em] hover:bg-muted transition-colors active:scale-[0.97]">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
        EXPORT CSV
      </button>
    {/if}
  </div>

  <div class="bg-card border border-border overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-border">
          <th class="text-left text-label p-3">EMAIL</th>
          <th class="text-left text-label p-3 hidden md:table-cell">DATE SUBSCRIBED</th>
          <th class="text-right text-label p-3">REMOVE</th>
        </tr>
      </thead>
      <tbody>
        {#each subscribers as sub}
          <tr class="border-b border-border/50 hover:bg-muted/50 transition-colors">
            <td class="p-3 font-medium">{sub.email}</td>
            <td class="p-3 text-muted-foreground hidden md:table-cell">{sub.date}</td>
            <td class="p-3 text-right">
              <button
                aria-label="Remove subscriber"
                onclick={() => removeSubscriber(sub.id)}
                class="p-1.5 text-muted-foreground hover:text-destructive transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              </button>
            </td>
          </tr>
        {/each}
        {#if !subscribers.length}
          <tr><td colspan="3" class="p-8 text-center text-muted-foreground text-sm">No subscribers yet. The newsletter form in the footer collects emails.</td></tr>
        {/if}
      </tbody>
    </table>
  </div>
</div>
