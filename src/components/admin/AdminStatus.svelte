<script>
  import { onMount } from 'svelte';
  import Button from '../ui/Button.svelte';
  import Badge from '../ui/Badge.svelte';
  import Card from '../ui/Card.svelte';
  import { toast } from '../../lib/toast.js';
  import { confirmDialog } from '../../lib/confirm.js';
  import Database from 'lucide-svelte/icons/database';
  import Mail from 'lucide-svelte/icons/mail';
  import Cloud from 'lucide-svelte/icons/cloud';
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import CircleAlert from 'lucide-svelte/icons/circle-alert';
  import TriangleAlert from 'lucide-svelte/icons/triangle-alert';
  import Info from 'lucide-svelte/icons/info';
  import CircleCheck from 'lucide-svelte/icons/circle-check';

  let status = $state(null);
  let logs = $state([]);
  let loading = $state(true);
  let refreshing = $state(false);

  async function loadDiagnostics() {
    refreshing = true;
    try {
      const [statusRes, logsRes] = await Promise.all([
        fetch('/api/admin/status', { credentials: 'include' }),
        fetch('/api/admin/logs', { credentials: 'include' })
      ]);
      if (statusRes.ok) status = await statusRes.json();
      if (logsRes.ok) logs = await logsRes.json();
    } catch (e) {
      console.error('Failed to load diagnostics', e);
      toast.error('Could not load diagnostics.');
    } finally {
      loading = false;
      refreshing = false;
    }
  }

  async function clearLogs() {
    const ok = await confirmDialog.ask({
      title: 'Clear all system logs?', description: 'This removes the log history permanently.',
      confirmLabel: 'Clear logs', destructive: true,
    });
    if (!ok) return;
    try {
      const res = await fetch('/api/admin/logs', { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error();
      logs = [];
      toast.success('Logs cleared');
    } catch {
      toast.error('Failed to clear logs');
    }
  }

  onMount(loadDiagnostics);

  const isGood = (v) => ['connected', 'configured', 'ready'].includes(v);
  const label = (v) => String(v || 'unknown').replace(/_/g, ' ');

  let services = $derived(status ? [
    { name: 'Database', icon: Database, value: status.db, note: status.db === 'connected' ? 'MongoDB connection is active.' : 'The store is showing its maintenance page until the database reconnects.' },
    { name: 'Email', icon: Mail, value: status.email, note: status.email === 'configured' ? 'Order emails and alerts are sent via Resend.' : 'Set RESEND_API_KEY to send order emails and alerts.' },
    { name: 'Image hosting', icon: Cloud, value: status.cloudinary, note: status.cloudinary === 'configured' ? 'Cloudinary uploads are available.' : 'Cloudinary credentials are missing — uploads will fail.' },
  ] : []);

  let stats = $derived(status ? [
    { label: 'Orders', value: status.stats.orders },
    { label: 'Products', value: status.stats.products },
    { label: 'Subscribers', value: status.stats.subscribers },
    { label: 'Errors logged', value: status.stats.logs, bad: status.stats.logs > 0 },
  ] : []);
</script>

<div class="max-w-5xl space-y-6">
  <div class="flex items-end justify-between gap-4">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Site status</h1>
      <p class="text-sm text-muted-foreground">Live health of your services and recent system logs.</p>
    </div>
    <Button variant="outline" disabled={refreshing} onclick={loadDiagnostics}><RefreshCw size={15} class={refreshing ? 'animate-spin' : ''} /> Refresh</Button>
  </div>

  {#if loading}
    <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
      {#each Array(3) as _}<div class="h-32 animate-pulse rounded-xl border border-border bg-muted"></div>{/each}
    </div>
  {:else if status}
    <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
      {#each services as svc}
        <Card class="p-6">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 text-sm font-medium text-muted-foreground"><svc.icon size={16} /> {svc.name}</div>
            <Badge variant={isGood(svc.value) ? 'success' : 'destructive'} class="capitalize">{label(svc.value)}</Badge>
          </div>
          <p class="mt-3 text-sm text-muted-foreground">{svc.note}</p>
        </Card>
      {/each}
    </div>

    <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {#each stats as s}
        <Card class="p-5">
          <p class="text-sm font-medium text-muted-foreground">{s.label}</p>
          <p class="mt-1 text-2xl font-semibold tabular-nums {s.bad ? 'text-destructive' : ''}">{s.value}</p>
        </Card>
      {/each}
    </div>
  {/if}

  <Card title="System logs" description="Most recent 100 events, newest first." class="overflow-hidden">
    {#snippet actions()}
      {#if logs.length > 0}<Button variant="outline" size="sm" class="text-destructive hover:text-destructive" onclick={clearLogs}><Trash2 size={14} /> Clear</Button>{/if}
    {/snippet}
    <div class="mt-4 border-t border-border">
      {#if logs.length === 0}
        <div class="flex flex-col items-center gap-2 py-14 text-center">
          <CircleCheck size={28} class="text-emerald-600" />
          <p class="text-sm text-muted-foreground">No system events logged.</p>
        </div>
      {:else}
        <ul class="max-h-[480px] divide-y divide-border overflow-y-auto">
          {#each logs as log}
            <li class="flex gap-3 px-6 py-4">
              <span class="mt-0.5 shrink-0 {log.type === 'error' ? 'text-destructive' : log.type === 'warn' ? 'text-amber-600' : 'text-blue-600'}">
                {#if log.type === 'error'}<CircleAlert size={16} />{:else if log.type === 'warn'}<TriangleAlert size={16} />{:else}<Info size={16} />{/if}
              </span>
              <div class="min-w-0 flex-1">
                <div class="mb-1 flex items-center justify-between gap-4 text-xs text-muted-foreground">
                  <span class="font-medium uppercase tracking-wide">{log.context || 'SYSTEM'}</span>
                  <time class="tabular-nums">{new Date(log.timestamp).toLocaleString()}</time>
                </div>
                <p class="break-words text-sm font-medium">{log.message}</p>
                {#if log.data?.path}
                  <p class="mt-1.5 inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{log.data.method} {log.data.path}</p>
                {/if}
                {#if log.data?.stack}
                  <details class="mt-2 text-xs text-muted-foreground">
                    <summary class="cursor-pointer hover:text-foreground">Stack trace</summary>
                    <pre class="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md bg-zinc-950 p-3 font-mono leading-tight text-zinc-100">{log.data.stack}</pre>
                  </details>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </Card>
</div>
