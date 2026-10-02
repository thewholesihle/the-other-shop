<script>
  import RichEditor from './RichEditor.svelte';
  import Button from '../ui/Button.svelte';
  import Card from '../ui/Card.svelte';
  import { inputCls, labelCls, hintCls } from '../../lib/ui.js';
  import { toast } from '../../lib/toast.js';
  import { confirmDialog } from '../../lib/confirm.js';
  import Send from 'lucide-svelte/icons/send';
  import LoaderCircle from 'lucide-svelte/icons/loader-circle';

  let { subscribers = [], siteName = 'Others.' } = $props();

  const DEFAULT_BODY = '<p>Write your newsletter here...</p>';
  const idOf = (s) => s._id || s.id;

  let subject = $state('');
  let htmlContent = $state(DEFAULT_BODY);
  let isSending = $state(false);
  // svelte-ignore state_referenced_locally
  let selectedIds = $state(new Set(subscribers.map(idOf)));

  let allSelected = $derived(selectedIds.size === subscribers.length && subscribers.length > 0);

  function toggleSelectAll() {
    selectedIds = allSelected ? new Set() : new Set(subscribers.map(idOf));
  }

  function toggleSubscriber(id) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    selectedIds = next;
  }

  async function handleSend() {
    if (!subject.trim() || !htmlContent.trim()) return toast.error('Subject and message are required.');
    if (selectedIds.size === 0) return toast.error('Select at least one recipient.');

    const ok = await confirmDialog.ask({
      title: `Send to ${selectedIds.size} subscriber${selectedIds.size === 1 ? '' : 's'}?`,
      description: `“${subject.trim()}” will be emailed individually to each selected recipient. This cannot be undone.`,
      confirmLabel: 'Send newsletter',
    });
    if (!ok) return;

    isSending = true;
    try {
      const res = await fetch('/api/newsletter/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, html: htmlContent, subscriberIds: Array.from(selectedIds) }),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Broadcast failed.');
      toast.success(`Delivered to ${data.sentCount} subscriber(s).`);
      // Deliverability advice for next time (spam-filter triggers spotted in the subject or body).
      for (const w of data.warnings || []) toast.info(`Deliverability tip: ${w}`, 9000);
      subject = '';
      htmlContent = DEFAULT_BODY;
    } catch (e) {
      toast.error(e.message);
    } finally {
      isSending = false;
    }
  }
</script>

<div class="max-w-4xl space-y-6">
  <div>
    <h1 class="text-2xl font-semibold tracking-tight">Newsletter</h1>
    <p class="text-sm text-muted-foreground">Email your {subscribers.length} subscriber{subscribers.length === 1 ? '' : 's'} from {siteName}.</p>
  </div>

  <Card title="Compose" description="Your logo, header and footer are added around the message automatically.">
    <div class="space-y-5 p-6 pt-4">
      <div>
        <label for="n-sub" class={labelCls}>Subject line</label>
        <input id="n-sub" bind:value={subject} placeholder="e.g. The Spring Collection is live" class={inputCls} />
      </div>
      <div>
        <p class={labelCls}>Message</p>
        <RichEditor value={htmlContent} onChange={(val) => (htmlContent = val)} />
        <p class={hintCls}>Each recipient gets their own copy with a personal unsubscribe link.</p>
      </div>
    </div>
  </Card>

  <Card title="Recipients" description="{selectedIds.size} of {subscribers.length} selected">
    <div class="p-6 pt-4">
      {#if subscribers.length === 0}
        <p class="py-6 text-center text-sm text-muted-foreground">No subscribers yet.</p>
      {:else}
        <div class="max-h-56 overflow-y-auto rounded-lg border border-border">
          <label class="sticky top-0 flex cursor-pointer items-center gap-3 border-b border-border bg-muted/60 px-4 py-2.5 text-sm font-medium backdrop-blur">
            <input type="checkbox" checked={allSelected} onchange={toggleSelectAll} class="h-4 w-4 accent-primary" /> Select all
          </label>
          {#each subscribers as sub (idOf(sub))}
            <label class="flex cursor-pointer items-center gap-3 border-b border-border/60 px-4 py-2 text-sm last:border-0 hover:bg-muted/40">
              <input type="checkbox" checked={selectedIds.has(idOf(sub))} onchange={() => toggleSubscriber(idOf(sub))} class="h-4 w-4 accent-primary" />
              <span class="truncate">{sub.email}</span>
            </label>
          {/each}
        </div>
      {/if}
    </div>
  </Card>

  <div class="flex justify-end">
    <Button disabled={isSending || selectedIds.size === 0} onclick={handleSend}>
      {#if isSending}<LoaderCircle size={15} class="animate-spin" /> Sending…{:else}<Send size={15} /> Send newsletter{/if}
    </Button>
  </div>
</div>
