<script>
  import { onMount } from 'svelte';
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
  import Loader from '../components/Loader.svelte';

  let data = null;
  let loading = true;
  let saveError = null;
  let saveSuccess = false;
  let activeSection = 'dashboard';

  // ── Read from MongoDB (via /api/data) ─────────────────────────────────────
  async function loadData() {
    const res = await fetch('/api/data');
    if (!res.ok) throw new Error(`Failed to load data: ${res.status}`);
    return res.json();
  }

  // ── Write to MongoDB (via POST /api/data) ──────────────────────────────────
  async function saveData(updated) {
    saveError = null;
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
    // Re-fetch fresh data from DB to confirm what was persisted
    data = await loadData();
  }

  onMount(async () => {
    try {
      data = await loadData();
    } catch (e) {
      console.error('Admin load error:', e);
      saveError = e.message;
    } finally {
      loading = false;
    }
  });

  // ── Section update handlers — each calls saveData with the full merged object
  async function updateSection(key, value) {
    const updated = { ...data, [key]: value };
    data = updated; // optimistic update
    try { await saveData(updated); }
    catch (e) { saveError = e.message; }
  }

  function updateProducts(products)     { updateSection('products',    products);     }
  function updateOrders(orders)         { updateSection('orders',      orders);       }
  function updateSite(site)             { updateSection('site',        site);         }
  function updateLookbooks(lookbooks)   { updateSection('lookbooks',   lookbooks);    }
  function updateCommunity(community)   { updateSection('community',   community);    }
  function updatePages(pages)           { updateSection('pages',       pages);        }
  function updateSubscribers(subs)      { updateSection('subscribers', subs);         }

  async function resetData() {
    if (!confirm('Reset ALL store data? This cannot be undone.')) return;
    data = await loadData();
  }

  function navigate(section) { activeSection = section; }
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
  {#if saveError}
    <div class="fixed bottom-4 right-4 z-50 bg-destructive text-destructive-foreground px-4 py-2 text-sm shadow-lg animate-fade-up max-w-xs">
      {saveError}
    </div>
  {/if}
  {#if saveSuccess}
    <div class="fixed bottom-4 right-4 z-50 bg-foreground text-primary-foreground px-4 py-2 text-sm shadow-lg animate-fade-up flex items-center gap-2">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>
      Saved to database
    </div>
  {/if}

  <AdminLayout {activeSection} {navigate}>
    {#if activeSection === 'dashboard'}
      <AdminDashboard {data} />
    {:else if activeSection === 'products'}
      <AdminProducts products={data.products} currency={data.site.currency} onUpdate={updateProducts} />
    {:else if activeSection === 'orders'}
      <AdminOrders orders={data.orders} currency={data.site.currency} onUpdate={updateOrders} />
    {:else if activeSection === 'lookbook'}
      <AdminLookbook lookbooks={data.lookbooks} onUpdate={updateLookbooks} />
    {:else if activeSection === 'community'}
      <AdminCommunity community={data.community} onUpdate={updateCommunity} />
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