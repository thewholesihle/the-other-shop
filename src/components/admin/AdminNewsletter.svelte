<script>
  import RichEditor from './RichEditor.svelte';

  export let subscribers = [];
  export let siteName = 'Others.';

  let subject = '';
  let htmlContent = '<p>Write your newsletter here...</p>';
  let isSending = false;
  let errorMsg = '';
  let successMsg = '';

  let selectedIds = new Set(subscribers.map(s => s._id || s.id));
  
  $: allSelected = selectedIds.size === subscribers.length && subscribers.length > 0;

  function toggleSelectAll() {
    if (allSelected) {
      selectedIds = new Set();
    } else {
      selectedIds = new Set(subscribers.map(s => s._id || s.id));
    }
  }

  function toggleSubscriber(id) {
    if (selectedIds.has(id)) {
      selectedIds.delete(id);
    } else {
      selectedIds.add(id);
    }
    selectedIds = selectedIds; // trigger reactivity
  }

  async function handleSend() {
    if (!subject.trim() || !htmlContent.trim()) {
      errorMsg = 'Subject and message are required.';
      return;
    }
    if (subscribers.length === 0) {
      errorMsg = 'No subscribers to mail.';
      return;
    }
    
    if (!confirm(`Are you sure you want to broadcast this to ${subscribers.length} subscriber(s)?`)) return;

    isSending = true;
    errorMsg = '';
    successMsg = '';

    try {
      const res = await fetch('/api/newsletter/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          subject, 
          html: htmlContent,
          subscriberIds: Array.from(selectedIds)
        }),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Broadcast failed.');
      successMsg = `Successfully delivered to ${data.sentCount} subscriber(s).`;
      subject = '';
      htmlContent = '<p>Write your newsletter here...</p>';
    } catch (e) {
      errorMsg = e.message;
    } finally {
      isSending = false;
    }
  }
</script>

<div class="space-y-6 max-w-4xl">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-display font-bold mb-1">Newsletter Broadcast</h2>
      <p class="text-sm text-muted-foreground">Send custom HTML emails from {siteName} directly to your {subscribers.length} active subscriber(s).</p>
    </div>
  </div>

  {#if errorMsg}
    <div class="bg-red-50 text-red-600 px-4 py-3 border border-red-200 text-sm">{errorMsg}</div>
  {/if}
  {#if successMsg}
    <div class="bg-green-50 text-green-700 px-4 py-3 border border-green-200 text-sm">{successMsg}</div>
  {/if}

  <div class="space-y-4 bg-card border border-border p-5">
    <div>
      <label for="n-sub" class="text-label block mb-1.5">EMAIL SUBJECT LINE</label>
      <input id="n-sub" bind:value={subject} placeholder="e.g. The Spring Collection is Live" class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
    </div>

    <div>
      <p class="text-label block mb-1.5">EMAIL MESSAGE BODY</p>
      <p class="text-[10px] text-muted-foreground uppercase tracking-widest mb-3">Your store logo, header, and footer will be automatically injected around this message.</p>
      <div class="border border-border">
        <RichEditor value={htmlContent} onChange={val => htmlContent = val} />
      </div>
    </div>
    
    <div>
      <p class="text-label block mb-1.5">RECIPIENTS ({selectedIds.size})</p>
      <div class="border border-border p-3 max-h-48 overflow-y-auto space-y-2 bg-muted/30">
        <label class="flex items-center gap-2 text-xs font-medium cursor-pointer pb-2 border-b border-border/50 mb-2">
          <input type="checkbox" checked={allSelected} onchange={toggleSelectAll} class="rounded border-border" />
          SELECT ALL
        </label>
        {#each subscribers as sub}
          <label class="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted p-1 transition-colors">
            <input 
              type="checkbox" 
              checked={selectedIds.has(sub._id || sub.id)} 
              onchange={() => toggleSubscriber(sub._id || sub.id)} 
              class="rounded border-border text-foreground focus:ring-foreground" 
            />
            <span class="truncate">{sub.email}</span>
          </label>
        {/each}
        {#if subscribers.length === 0}
          <p class="text-xs text-muted-foreground italic">No subscribers found.</p>
        {/if}
      </div>
    </div>

    <div class="pt-4 border-t border-border">
      <button 
        onclick={handleSend}
        disabled={isSending || selectedIds.size === 0}
        class="flex items-center gap-2 bg-foreground text-primary-foreground px-6 py-3 text-label tracking-[0.15em] hover:bg-foreground/90 transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class={isSending ? 'animate-bounce' : ''}><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
        {isSending ? 'BROADCASTING...' : 'SEND TO SELECTED'}
      </button>
    </div>
  </div>
</div>
