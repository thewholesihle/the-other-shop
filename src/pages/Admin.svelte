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

  const SECTIONS = ['dashboard', 'products', 'categories', 'orders', 'status', 'lookbook', 'community', 'pages', 'subscribers', 'newsletter', 'settings'];

  function sectionFromPath(path) {
    const seg = path.replace(/^\/admin\/?/, '').split('/').filter(Boolean)[0];
    return SECTIONS.includes(seg) ? seg : 'dashboard';
  }

  let data = null;
  let loading = true;
  let saving = false;
  let saveError = null;
  let saveSuccess = false;
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
      saveSuccess = true;
      setTimeout(() => (saveSuccess = false), 2000);
      // The blob we just sent IS what's now persisted — trust it instead of a
      // second round-trip GET, so the UI doesn't flash/reset after every save.
      data = updated;
    } finally {
      saving = false;
    }
  }

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
    pollTimer = setInterval(async () => {
      if (saving || loading || !data) return;
      try {
        const fresh = await loadData();
        data = { ...data, orders: fresh.orders, products: fresh.products };
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
      saveError = e.message;
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

  async function resetData() {
    if (!confirm('Reset ALL store data? This cannot be undone.')) return;
    data = await loadData();
  }

  function navigate(section) {
    activeSection = section;
    const path = section === 'dashboard' ? '/admin' : `/admin/${section}`;
    if (window.location.pathname !== path) {
      history.pushState({}, '', path);
    }
  }
</script>

{#if loading}
  <Loader />
{:else if !data}
  <div class="flex min-h-screen items-center justify-center flex-col gap-4">
    <p class="text-muted-foreground">Could not connect to the database.</p>
    {#if saveError}<p class="text-xs text-destructive">{saveError}</p>{/if}
    <button onclick={() => location.reload()} class="border border-border px-4 py-2 text-sm hover:bg-muted transition-colors">Retry</button>
  </div>
{:else}
  <!-- Global save/error toast -->
  {#if saving}
    <div class="fixed bottom-4 right-4 z-50 bg-foreground text-primary-foreground px-4 py-2 text-sm shadow-lg animate-fade-up flex items-center gap-2">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
      Saving…
    </div>
  {:else if saveError}
    <div class="fixed bottom-4 right-4 z-50 bg-destructive text-destructive-foreground px-4 py-2 text-sm shadow-lg animate-fade-up max-w-xs">
      {saveError}
    </div>
  {/if}
  {#if !saving && saveSuccess}
    <div class="fixed bottom-4 right-4 z-50 bg-foreground text-primary-foreground px-4 py-2 text-sm shadow-lg animate-fade-up flex items-center gap-2">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>
      Saved to database
    </div>
  {/if}

  <AdminLayout {activeSection} {navigate}>
    {#if activeSection === 'dashboard'}
      <AdminDashboard {data} />
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
      <AdminSettings site={data.site} lookbooks={data.lookbooks} articles={data.community} onUpdate={updateSite} onReset={resetData} />
    {/if}
  </AdminLayout>
{/if}