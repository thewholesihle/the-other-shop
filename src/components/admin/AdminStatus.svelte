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
  import Bell from 'lucide-svelte/icons/bell';
  import ShieldCheck from 'lucide-svelte/icons/shield-check';
  import LoaderCircle from 'lucide-svelte/icons/loader-circle';
  import { desktopAlertsSupported, desktopAlertsEnabled, enableDesktopAlerts, beep } from '../../lib/alerts.js';

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

  // ── Notification checks ───────────────────────────────────────────────────
  let testing = $state(false);
  let testResult = $state(null); // { ok, message, hint }
  async function sendTestEmail() {
    testing = true;
    testResult = null;
    try {
      const res = await fetch('/api/admin/test-email', { method: 'POST', credentials: 'include' });
      const body = await res.json().catch(() => ({}));
      testResult = res.ok
        ? { ok: true, message: `Sent to ${body.to.join(', ')} from ${body.from}. Check that inbox (and spam).` }
        : { ok: false, message: body.error || 'Could not send the test email.', hint: body.hint };
    } catch {
      testResult = { ok: false, message: 'Could not reach the server.' };
    } finally {
      testing = false;
    }
  }

  let desktopOn = $state(desktopAlertsEnabled());
  async function turnOnDesktopAlerts() {
    const result = await enableDesktopAlerts();
    desktopOn = result === 'granted';
    if (desktopOn) { toast.success('Desktop alerts on. You’ll be notified of new paid orders when this tab is in the background.'); beep(); }
    else toast.error(result === 'unsupported' ? 'This browser does not support desktop notifications.' : 'Desktop alerts were blocked — allow notifications for this site in your browser settings.');
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

    <Card title="Notifications" description="Make sure you hear about new orders and problems.">
      <div class="space-y-5 p-6 pt-4 text-sm">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="font-medium">Order & alert emails</p>
            <p class="text-muted-foreground">Sent from <span class="font-mono text-xs">{status.emailFrom}</span> to the addresses in Settings.</p>
          </div>
          <Button variant="outline" disabled={testing || status.email !== 'configured'} onclick={sendTestEmail}>
            {#if testing}<LoaderCircle size={15} class="animate-spin" /> Sending…{:else}<Mail size={15} /> Send test email{/if}
          </Button>
        </div>
        {#if status.emailSandbox}
          <p class="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">You are sending from Resend’s shared sandbox address. It can only deliver to your own Resend account’s email, so <strong>customers will not receive order emails</strong> until you verify a domain in Resend and set <span class="font-mono text-xs">SMTP_FROM</span> to an address on it.</p>
        {/if}
        {#if testResult}
          <p role="status" class="rounded-md border px-3 py-2 {testResult.ok ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-destructive/40 bg-destructive/10 text-destructive'}">
            {testResult.message}{#if testResult.hint}<span class="mt-1 block opacity-90">{testResult.hint}</span>{/if}
          </p>
        {/if}

        <div class="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="font-medium">Live order alerts</p>
            <p class="text-muted-foreground">New orders appear here instantly with a chime. Turn on desktop alerts to hear about them from another tab.</p>
          </div>
          {#if desktopOn}
            <Badge variant="success"><Bell size={12} class="mr-1" /> Desktop alerts on</Badge>
          {:else if desktopAlertsSupported()}
            <Button variant="outline" onclick={turnOnDesktopAlerts}><Bell size={15} /> Enable desktop alerts</Button>
          {:else}
            <Badge variant="secondary">Not supported in this browser</Badge>
          {/if}
        </div>

        <div class="flex flex-col gap-1 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="font-medium">Sign-in security</p>
            <p class="text-muted-foreground">Two-factor codes protect the admin even if the password leaks.</p>
          </div>
          <Badge variant={status.twoFactor ? 'success' : 'warning'}><ShieldCheck size={12} class="mr-1" /> {status.twoFactor ? 'Two-factor on' : 'Two-factor off'}</Badge>
        </div>
      </div>
    </Card>

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
