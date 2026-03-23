<script>
  import { onMount } from 'svelte';
  import { Shield, Activity, Database, Mail, Cloud, AlertCircle, Trash2, RefreshCw, CheckCircle2, Clock } from 'lucide-svelte';

  let status = null;
  let logs = [];
  let loading = true;
  let refreshing = false;

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
    } finally {
      loading = false;
      refreshing = false;
    }
  }

  async function clearLogs() {
    if (!confirm('Are you sure you want to clear all system logs?')) return;
    try {
      const res = await fetch('/api/admin/logs', { method: 'DELETE', credentials: 'include' });
      if (res.ok) logs = [];
    } catch (e) {
      alert('Failed to clear logs');
    }
  }

  onMount(loadDiagnostics);

  function getStatusColor(val) {
    if (val === 'connected' || val === 'configured' || val === 'ready') return 'text-green-500';
    if (val === 'connecting' || val === 'pending') return 'text-yellow-500';
    return 'text-red-500';
  }
</script>

<div class="space-y-8 max-w-5xl">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-display font-bold mb-1 flex items-center gap-2">
        <Shield class="w-6 h-6" /> SYSTEM HEALTH
      </h2>
      <p class="text-sm text-muted-foreground">Real-time status and diagnostic logs.</p>
    </div>
    <button 
      onclick={loadDiagnostics} 
      disabled={refreshing}
      class="flex items-center gap-2 px-4 py-2 border border-border hover:bg-muted transition-colors text-xs font-bold tracking-widest uppercase disabled:opacity-50"
    >
      <RefreshCw class="w-3.5 h-3.5 {refreshing ? 'animate-spin' : ''}" />
      Refresh
    </button>
  </div>

  {#if loading}
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse">
      {#each Array(3) as _}
        <div class="h-32 bg-muted rounded-none border border-border"></div>
      {/each}
    </div>
  {:else if status}
    <!-- Status Grid -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="bg-card border border-border p-6 relative overflow-hidden group">
        <Database class="w-12 h-12 absolute -right-2 -bottom-2 text-foreground/5 group-hover:text-foreground/10 transition-colors" />
        <div class="flex items-center gap-3 mb-4">
          <div class="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
            <Database class="w-5 h-5" />
          </div>
          <div>
            <p class="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Database</p>
            <p class="text-lg font-display font-bold {getStatusColor(status.db)}">{status.db.toUpperCase()}</p>
          </div>
        </div>
        <p class="text-xs text-muted-foreground">Connection to MongoDB Atlas is active and stable.</p>
      </div>

      <div class="bg-card border border-border p-6 relative overflow-hidden group">
        <Mail class="w-12 h-12 absolute -right-2 -bottom-2 text-foreground/5 group-hover:text-foreground/10 transition-colors" />
        <div class="flex items-center gap-3 mb-4">
          <div class="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
            <Mail class="w-5 h-5" />
          </div>
          <div>
            <p class="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Email (SMTP)</p>
            <p class="text-lg font-display font-bold {getStatusColor(status.email)}">{status.email.toUpperCase().replace('_', ' ')}</p>
          </div>
        </div>
        <p class="text-xs text-muted-foreground">Automated order notifications and alerts system.</p>
      </div>

      <div class="bg-card border border-border p-6 relative overflow-hidden group">
        <Cloud class="w-12 h-12 absolute -right-2 -bottom-2 text-foreground/5 group-hover:text-foreground/10 transition-colors" />
        <div class="flex items-center gap-3 mb-4">
          <div class="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
            <Cloud class="w-5 h-5" />
          </div>
          <div>
            <p class="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">CDN (Cloudinary)</p>
            <p class="text-lg font-display font-bold {getStatusColor(status.cloudinary)}">{status.cloudinary.toUpperCase()}</p>
          </div>
        </div>
        <p class="text-xs text-muted-foreground">Image hosting and optimization services status.</p>
      </div>
    </div>

    <!-- Quick Stats -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="bg-muted/30 border border-border p-4 text-center">
        <p class="text-[10px] uppercase font-bold tracking-tighter text-muted-foreground mb-1">Total Orders</p>
        <p class="text-2xl font-display font-bold">{status.stats.orders}</p>
      </div>
      <div class="bg-muted/30 border border-border p-4 text-center">
        <p class="text-[10px] uppercase font-bold tracking-tighter text-muted-foreground mb-1">Stock Items</p>
        <p class="text-2xl font-display font-bold">{status.stats.products}</p>
      </div>
      <div class="bg-muted/30 border border-border p-4 text-center">
        <p class="text-[10px] uppercase font-bold tracking-tighter text-muted-foreground mb-1">Newsletter</p>
        <p class="text-2xl font-display font-bold">{status.stats.subscribers}</p>
      </div>
      <div class="bg-muted/30 border border-border p-4 text-center">
        <p class="text-[10px] uppercase font-bold tracking-tighter text-muted-foreground mb-1 group">System Errors</p>
        <p class="text-2xl font-display font-bold {status.stats.logs > 0 ? 'text-red-500' : 'text-foreground'}">{status.stats.logs}</p>
      </div>
    </div>
  {/if}

  <!-- Error Logs -->
  <div class="space-y-4 pt-4">
    <div class="flex items-center justify-between border-b border-border pb-4">
      <h3 class="text-lg font-display font-bold flex items-center gap-2">
        <Activity class="w-5 h-5 text-muted-foreground" /> SYSTEM LOGS
      </h3>
      {#if logs.length > 0}
        <button onclick={clearLogs} class="flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase text-destructive hover:underline">
          <Trash2 class="w-3 h-3" /> Clear History
        </button>
      {/if}
    </div>

    <div class="bg-muted/10 border border-border rounded-none overflow-hidden">
      {#if logs.length === 0}
        <div class="py-12 text-center text-muted-foreground">
          <CheckCircle2 class="w-8 h-8 mx-auto mb-3 opacity-20" />
          <p class="text-sm italic">No system errors detected recently.</p>
        </div>
      {:else}
        <div class="divide-y divide-border max-h-[400px] overflow-y-auto">
          {#each logs as log}
            <div class="p-4 flex gap-4 hover:bg-muted/20 transition-colors">
              <div class="flex-shrink-0 pt-1">
                {#if log.type === 'error'}
                  <AlertCircle class="w-4 h-4 text-red-500" />
                {:else if log.type === 'warn'}
                  <AlertCircle class="w-4 h-4 text-yellow-500" />
                {:else}
                  <Clock class="w-4 h-4 text-blue-500" />
                {/if}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between gap-4 mb-1">
                  <span class="text-[10px] font-bold font-mono text-muted-foreground uppercase">{log.context || 'SYSTEM'}</span>
                  <span class="text-[10px] font-mono text-muted-foreground">{new Date(log.timestamp).toLocaleString()}</span>
                </div>
                <p class="text-sm font-medium mb-1 break-words">{log.message}</p>
                {#if log.data?.path}
                  <p class="text-[10px] font-mono bg-muted px-1.5 py-0.5 inline-block rounded mb-2">{log.data.method} {log.data.path}</p>
                {/if}
                {#if log.data?.stack}
                  <details class="text-[10px] font-mono text-muted-foreground cursor-pointer">
                    <summary class="hover:text-foreground">View Stack Trace</summary>
                    <pre class="mt-2 p-2 bg-black text-green-500 overflow-x-auto whitespace-pre-wrap leading-tight">{log.data.stack}</pre>
                  </details>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>
