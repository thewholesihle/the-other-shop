<script>
  import { onMount, onDestroy } from 'svelte';
  import { adminThemeClass } from '../lib/adminTheme.js';
  import AdminLayout from '../components/admin/AdminLayout.svelte';
  import AdminLogin from '../components/admin/AdminLogin.svelte';
  import AdminDashboard from '../components/admin/AdminDashboard.svelte';
  import AdminProducts from '../components/admin/AdminProducts.svelte';
  import AdminOrders from '../components/admin/AdminOrders.svelte';
  import AdminSettings from '../components/admin/AdminSettings.svelte';
  import AdminLookbook from '../components/admin/AdminLookbook.svelte';
  import AdminCommunity from '../components/admin/AdminCommunity.svelte';
  import AdminEvents from '../components/admin/AdminEvents.svelte';
  import AdminPages from '../components/admin/AdminPages.svelte';
  import AdminSubscribers from '../components/admin/AdminSubscribers.svelte';
  import AdminNewsletter from '../components/admin/AdminNewsletter.svelte';
  import AdminStatus from '../components/admin/AdminStatus.svelte';
  import AdminCategories from '../components/admin/AdminCategories.svelte';
  import Loader from '../components/Loader.svelte';
  import Toaster from '../components/ui/Toaster.svelte';
  import ConfirmDialog from '../components/ui/ConfirmDialog.svelte';
  import { toast } from '../lib/toast.js';
  import { notifyDesktop, beep } from '../lib/alerts.js';
  import { saveBrand } from '../lib/brand.js';

  const SECTIONS = ['dashboard', 'products', 'categories', 'orders', 'status', 'lookbook', 'community', 'events', 'pages', 'subscribers', 'newsletter', 'settings'];

  function sectionFromPath(path) {
    const seg = path.replace(/^\/admin\/?/, '').split('/').filter(Boolean)[0];
    return SECTIONS.includes(seg) ? seg : 'dashboard';
  }

  // 'checking' → asking the server whether we already have a session
  // 'login'    → show the sign-in screen
  // 'ready'    → signed in
  let authState = 'checking';
  let csrf = '';

  let data = null;
  let loading = true;
  let saving = false;
  let saveError = null;
  let activeSection = sectionFromPath(window.location.pathname);

  // ── Session-aware fetch ───────────────────────────────────────────────────
  // Every same-origin write automatically carries the session's CSRF token, and a
  // 401 from any admin endpoint (session expired / signed out elsewhere) drops back to
  // the sign-in screen instead of failing silently. Restored when the admin unmounts.
  const nativeFetch = window.fetch.bind(window);
  function installFetchGuard() {
    window.fetch = (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      const sameOrigin = url.startsWith('/') || url.startsWith(location.origin);
      const method = String(init.method || (typeof input !== 'string' && input.method) || 'GET').toUpperCase();
      if (sameOrigin && csrf && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined));
        headers.set('X-CSRF-Token', csrf);
        init = { ...init, headers };
      }
      return nativeFetch(input, init).then((res) => {
        if (res.status === 401 && sameOrigin && url.includes('/api/') && !url.includes('/api/admin/login') && authState === 'ready') {
          signedOut('Your session expired. Please sign in again.');
        }
        return res;
      });
    };
  }

  // ── Read from MongoDB (via /api/data) ─────────────────────────────────────
  async function loadData() {
    const res = await fetch('/api/data');
    if (!res.ok) throw new Error(`Failed to load data: ${res.status}`);
    return res.json();
  }

  // ── Write to MongoDB (via POST /api/data) ──────────────────────────────────
  // `updated` here is always merged against a freshly-fetched copy of the data
  // (see updateSection), so this never re-persists a stale snapshot of
  // sections it didn't intend to touch.
  async function saveData(partial, key, value) {
    saveError = null;
    saving = true;
    try {
      const res = await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Save failed: ${res.status}`);
      }
      toast.success('Saved to database');
      // What we just sent IS what's now persisted — trust it instead of a second round-trip GET,
      // so the UI doesn't flash/reset after every save.
      data = { ...data, [key]: value };
    } finally {
      saving = false;
    }
  }

  // Orders waiting on the shop (paid, not yet shipped) — shown as a nav badge.
  $: badges = { orders: data ? data.orders.filter(o => ['paid', 'processing'].includes(o.status)).length : 0 };

  // ── Orders & stock refresh (lean endpoints, not the whole /api/data blob) ──
  async function refreshOrders() {
    if (saving || !data || authState !== 'ready') return;
    try {
      const [orders, products] = await Promise.all([
        fetch('/api/orders', { credentials: 'include' }).then(r => r.ok ? r.json() : Promise.reject()),
        fetch('/api/products').then(r => r.ok ? r.json() : Promise.reject()),
      ]);
      data = { ...data, orders, products };
    } catch {
      // Transient network hiccup — keep showing the last known-good data.
    }
  }

  // ── Realtime: Server-Sent Events ──────────────────────────────────────────
  // The server pushes an event the moment an order is created, paid, cancelled or
  // changed, so it shows up here instantly. A slow poll stays as a safety net in case
  // the stream is blocked by a proxy.
  let events = null;
  let pollTimer = null;
  let refreshTimer = null;
  const money = (n) => `${data?.site?.currency ?? 'R'}${Number(n || 0).toFixed(2)}`;

  function connectEvents() {
    if (events) events.close();
    events = new EventSource('/api/admin/events');
    events.addEventListener('order', (e) => {
      let evt; try { evt = JSON.parse(e.data); } catch { return; }
      // Coalesce bursts into one refresh.
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refreshOrders, 150);

      if (evt.action === 'paid') {
        toast.success(`New paid order ${evt.id} — ${money(evt.total)}${evt.customer ? ` from ${evt.customer}` : ''}`, 9000);
        notifyDesktop('New paid order', `${evt.id} · ${money(evt.total)}${evt.customer ? ` · ${evt.customer}` : ''}`);
        beep();
      } else if (evt.action === 'created') {
        toast.info(`New checkout started: ${evt.id} (${money(evt.total)}), awaiting payment`, 5000);
      } else if (evt.action === 'cancelled') {
        toast.info(`Order ${evt.id} was cancelled`, 5000);
      }
    });
    events.addEventListener('signed-out', () => signedOut('Your session expired. Please sign in again.'));
  }

  function stopSession() {
    if (events) { events.close(); events = null; }
    clearInterval(pollTimer);
    clearTimeout(refreshTimer);
  }

  // ── Session lifecycle ─────────────────────────────────────────────────────
  async function startSession(token) {
    csrf = token;
    authState = 'ready';
    loading = true;
    try {
      data = await loadData();
      saveBrand(data?.site);
    } catch (e) {
      console.error('Admin load error:', e);
      saveError = e.message;
    } finally {
      loading = false;
    }
    connectEvents();
    clearInterval(pollTimer);
    pollTimer = setInterval(refreshOrders, 30000);
  }

  function signedOut(message) {
    stopSession();
    csrf = '';
    data = null;
    authState = 'login';
    if (message) toast.info(message, 6000);
  }

  async function logout() {
    try { await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' }); } catch { /* signing out locally regardless */ }
    signedOut();
  }

  const handlePopState = () => { activeSection = sectionFromPath(window.location.pathname); };

  onMount(() => {
    window.addEventListener('popstate', handlePopState);
    installFetchGuard();
    (async () => {
      try {
        const res = await nativeFetch('/api/admin/session', { credentials: 'include' });
        if (res.ok) return startSession((await res.json()).csrf);
      } catch { /* fall through to the sign-in screen */ }
      authState = 'login';
    })();
  });

  onDestroy(() => {
    window.removeEventListener('popstate', handlePopState);
    window.fetch = nativeFetch;
    stopSession();
  });

  // ── Section update handlers — each fetches the latest data, merges the
  // changed section on top of it, and saves that. Fetching fresh right before
  // merging (rather than merging into whatever this tab loaded at mount time)
  // avoids clobbering fields — like product stock — that another process
  // (a customer checkout, an order cancellation) may have changed since.
  async function updateSection(key, value) {
    try {
      // Send ONLY what changed. The rest of the store (stock, orders, subscribers…) keeps changing under an open
      // admin tab, and re-sending a copy of it would overwrite those newer values. For lists that means only the
      // documents that differ from what this tab loaded, plus the ids that were removed (deleting by omission would
      // also delete anything added since the tab loaded).
      const prev = data?.[key];
      let payload = { [key]: value };
      if (Array.isArray(value) && Array.isArray(prev)) {
        const before = new Map(prev.map(d => [d.id, JSON.stringify(d)]));
        const now = new Set(value.map(d => d.id));
        let changed = value.filter(d => before.get(d.id) !== JSON.stringify(d));
        if (key === 'products') {
          // Stock changes by sales while this tab is open, so say what stock we started from; the server then applies
          // only the difference to the live number (see mergeProductStock in server.js).
          const loaded = new Map(prev.map(p => [p.id, p]));
          changed = changed.map(p => {
            const old = loaded.get(p.id);
            return old ? { ...p, _base: { stock: old.stock, variants: (old.variants || []).map(v => ({ size: v.size, color: v.color, stock: v.stock })) } } : p;
          });
        }
        payload = {
          [key]: changed,
          removed: { [key]: prev.filter(d => !now.has(d.id)).map(d => d.id) },
        };
      }
      data = { ...data, [key]: value }; // optimistic update
      await saveData(payload, key, value);
    } catch (e) {
      toast.error(e.message);
      throw e;
    }
  }

  // ── Local-only state sync — for actions that already persisted themselves
  // via a dedicated endpoint (order status/delete, product/lookbook/community
  // delete). These must NOT also trigger a full-blob save: `data` here can be
  // stale relative to what the dedicated endpoint just changed server-side
  // (e.g. restored stock after a cancellation), and re-saving the whole blob
  // would silently overwrite that with the stale in-memory value.
  function updateLocal(key, value) {
    data = { ...data, [key]: value };
  }

  function updateProducts(products)     { return updateSection('products',    products);     }
  function updateSite(site)             { return updateSection('site',        site);         }
  function updateLookbooks(lookbooks)   { return updateSection('lookbooks',   lookbooks);    }
  function updateCommunity(community)   { return updateSection('community',   community);    }
  function updateEvents(events)         { return updateSection('events',      events);       }
  function updatePages(pages)           { return updateSection('pages',       pages);        }
  function updateSubscribers(subs)      { return updateSection('subscribers', subs);         }
  function updateCategories(cats)       { return updateSection('categories',  cats);         }

  function updateOrdersLocal(orders)       { updateLocal('orders',   orders); }
  function updateProductsLocal(products)   { updateLocal('products', products); }
  function updateLookbooksLocal(lookbooks) { updateLocal('lookbooks', lookbooks); }
  function updateCommunityLocal(community) { updateLocal('community', community); }
  function updateEventsLocal(events)       { updateLocal('events', events); }

  function navigate(section) {
    activeSection = section;
    const path = section === 'dashboard' ? '/admin' : `/admin/${section}`;
    if (window.location.pathname !== path) {
      history.pushState({}, '', path);
    }
  }
</script>

<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap">
  <title>Admin — Others.</title>
</svelte:head>

<div class="admin-root min-h-screen" use:adminThemeClass>
{#if authState === 'checking'}
  <Loader />
{:else if authState === 'login'}
  <AdminLogin onSuccess={startSession} />
{:else if loading}
  <Loader />
{:else if !data}
  <div class="flex min-h-screen items-center justify-center flex-col gap-4">
    <p class="text-muted-foreground">Could not connect to the database.</p>
    {#if saveError}<p class="text-xs text-destructive">{saveError}</p>{/if}
    <button onclick={() => location.reload()} class="inline-flex h-9 items-center rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm hover:bg-accent transition-colors">Retry</button>
  </div>
{:else}
  <AdminLayout {activeSection} {navigate} {badges} site={data.site} onLogout={logout}>
    {#if activeSection === 'dashboard'}
      <AdminDashboard {data} {navigate} />
    {:else if activeSection === 'products'}
      <AdminProducts products={data.products} categories={data.categories} currency={data.site.currency} onUpdate={updateProducts} onLocalUpdate={updateProductsLocal} />
    {:else if activeSection === 'categories'}
      <AdminCategories categories={data.categories} onUpdate={updateCategories} />
    {:else if activeSection === 'orders'}
      <AdminOrders orders={data.orders} currency={data.site.currency} site={data.site} contactAddress={data.pages?.contact?.address || ''} onUpdate={updateOrdersLocal} />
    {:else if activeSection === 'lookbook'}
      <AdminLookbook lookbooks={data.lookbooks} onUpdate={updateLookbooks} onLocalUpdate={updateLookbooksLocal} />
    {:else if activeSection === 'community'}
      <AdminCommunity community={data.community} onUpdate={updateCommunity} onLocalUpdate={updateCommunityLocal} />
    {:else if activeSection === 'events'}
      <AdminEvents events={data.events || []} onUpdate={updateEvents} onLocalUpdate={updateEventsLocal} />
    {:else if activeSection === 'pages'}
      <AdminPages pages={data.pages} onUpdate={updatePages} />
    {:else if activeSection === 'subscribers'}
      <AdminSubscribers subscribers={data.subscribers} onUpdate={updateSubscribers} />
    {:else if activeSection === 'newsletter'}
      <AdminNewsletter subscribers={data.subscribers.filter(s => s.confirmed !== false)} siteName={data.site?.name} />
    {:else if activeSection === 'status'}
      <AdminStatus />
    {:else if activeSection === 'settings'}
      <AdminSettings site={data.site} lookbooks={data.lookbooks} articles={data.community} onUpdate={updateSite} />
    {/if}
  </AdminLayout>
{/if}

<Toaster />
<ConfirmDialog />
</div>
