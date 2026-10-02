<script>
  import { onMount, onDestroy } from 'svelte';
  import AdminLayout from '../components/admin/AdminLayout.svelte';
  import AdminDashboard from '../components/admin/AdminDashboard.svelte';
  import AdminProducts from '../components/admin/AdminProducts.svelte';
  import AdminOrders from '../components/admin/AdminOrders.svelte';
  import AdminSettings from '../components/admin/AdminSettings.svelte';
  import AdminLookbook from '../components/admin/AdminLookbook.svelte';
  import AdminCommunity from '../components/admin/AdminCommunity.svelte';
  import AdminPages from '../components/admin/AdminPages.svelte';
  import AdminSubscribers from '../components/admin/AdminSubscribers.svelte';
  import AdminNewsletter from '../components/admin/AdminNewsletter.svelte';
  import AdminStatus from '../components/admin/AdminStatus.svelte';
  import AdminCategories from '../components/admin/AdminCategories.svelte';
  import Loader from '../components/Loader.svelte';
  import Toaster from '../components/ui/Toaster.svelte';
  import ConfirmDialog from '../components/ui/ConfirmDialog.svelte';
  import { toast } from '../lib/toast.js';

  const SECTIONS = ['dashboard', 'products', 'categories', 'orders', 'status', 'lookbook', 'community', 'pages', 'subscribers', 'newsletter', 'settings'];

  function sectionFromPath(path) {
    const seg = path.replace(/^\/admin\/?/, '').split('/').filter(Boolean)[0];
    return SECTIONS.includes(seg) ? seg : 'dashboard';
  }

  let data = null;
  let loading = true;
  let saving = false;
  let saveError = null;
  let activeSection = sectionFromPath(window.location.pathname);

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
  async function saveData(updated) {
    saveError = null;
    saving = true;
    try {
      const res = await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Save failed: ${res.status}`);
      }
      toast.success('Saved to database');
      // The blob we just sent IS what's now persisted — trust it instead of a
      // second round-trip GET, so the UI doesn't flash/reset after every save.
      data = updated;
    } finally {
      saving = false;
    }
  }

  // Orders waiting on the shop (paid, not yet shipped) — shown as a nav badge.
  $: badges = { orders: data ? data.orders.filter(o => ['paid', 'processing'].includes(o.status)).length : 0 };

  let pollTimer = null;

  const handlePopState = () => { activeSection = sectionFromPath(window.location.pathname); };

  onMount(() => {
    window.addEventListener('popstate', handlePopState);

    (async () => {
      try {
        data = await loadData();
      } catch (e) {
        console.error('Admin load error:', e);
        saveError = e.message;
      } finally {
        loading = false;
      }
    })();

    // Light polling so incoming orders / PayFast-driven status changes / stock
    // movements show up on their own, without the admin needing to reload the
    // page. Skipped while a save is in flight so it can never race a write.
    // Uses the lean /api/orders + /api/products endpoints rather than the full
    // /api/data blob — no need to refetch categories/lookbooks/community/pages/
    // subscribers every 20 seconds just to pick up order and stock changes.
    pollTimer = setInterval(async () => {
      if (saving || loading || !data) return;
      try {
        const [orders, products] = await Promise.all([
          fetch('/api/orders', { credentials: 'include' }).then(r => r.ok ? r.json() : Promise.reject()),
          fetch('/api/products').then(r => r.ok ? r.json() : Promise.reject()),
        ]);
        data = { ...data, orders, products };
      } catch {
        // Transient network hiccup — keep showing the last known-good data.
      }
    }, 20000);
  });

  onDestroy(() => {
    window.removeEventListener('popstate', handlePopState);
    clearInterval(pollTimer);
  });

  // ── Section update handlers — each fetches the latest data, merges the
  // changed section on top of it, and saves that. Fetching fresh right before
  // merging (rather than merging into whatever this tab loaded at mount time)
  // avoids clobbering fields — like product stock — that another process
  // (a customer checkout, an order cancellation) may have changed since.
  async function updateSection(key, value) {
    try {
      const fresh = await loadData();
      const updated = { ...fresh, [key]: value };
      data = updated; // optimistic update
      await saveData(updated);
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
  function updateOrders(orders)         { return updateSection('orders',      orders);       }
  function updateSite(site)             { return updateSection('site',        site);         }
  function updateLookbooks(lookbooks)   { return updateSection('lookbooks',   lookbooks);    }
  function updateCommunity(community)   { return updateSection('community',   community);    }
  function updatePages(pages)           { return updateSection('pages',       pages);        }
  function updateSubscribers(subs)      { return updateSection('subscribers', subs);         }
  function updateCategories(cats)       { return updateSection('categories',  cats);         }

  function updateOrdersLocal(orders)       { updateLocal('orders',   orders); }
  function updateProductsLocal(products)   { updateLocal('products', products); }
  function updateLookbooksLocal(lookbooks) { updateLocal('lookbooks', lookbooks); }
  function updateCommunityLocal(community) { updateLocal('community', community); }

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

<div class="admin-root min-h-screen">
{#if loading}
  <Loader />
{:else if !data}
  <div class="flex min-h-screen items-center justify-center flex-col gap-4">
    <p class="text-muted-foreground">Could not connect to the database.</p>
    {#if saveError}<p class="text-xs text-destructive">{saveError}</p>{/if}
    <button onclick={() => location.reload()} class="inline-flex h-9 items-center rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm hover:bg-accent transition-colors">Retry</button>
  </div>
{:else}
  <AdminLayout {activeSection} {navigate} {badges}>
    {#if activeSection === 'dashboard'}
      <AdminDashboard {data} {navigate} />
    {:else if activeSection === 'products'}
      <AdminProducts products={data.products} categories={data.categories} currency={data.site.currency} onUpdate={updateProducts} onLocalUpdate={updateProductsLocal} />
    {:else if activeSection === 'categories'}
      <AdminCategories categories={data.categories} onUpdate={updateCategories} />
    {:else if activeSection === 'orders'}
      <AdminOrders orders={data.orders} currency={data.site.currency} onUpdate={updateOrdersLocal} />
    {:else if activeSection === 'lookbook'}
      <AdminLookbook lookbooks={data.lookbooks} onUpdate={updateLookbooks} onLocalUpdate={updateLookbooksLocal} />
    {:else if activeSection === 'community'}
      <AdminCommunity community={data.community} onUpdate={updateCommunity} onLocalUpdate={updateCommunityLocal} />
    {:else if activeSection === 'pages'}
      <AdminPages pages={data.pages} onUpdate={updatePages} />
    {:else if activeSection === 'subscribers'}
      <AdminSubscribers subscribers={data.subscribers} onUpdate={updateSubscribers} />
    {:else if activeSection === 'newsletter'}
      <AdminNewsletter subscribers={data.subscribers} siteName={data.site?.name} />
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