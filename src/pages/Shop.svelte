<script>
  import { onMount } from 'svelte';
  import Navbar from '../components/Navbar.svelte';
  import ProductCard from '../components/ProductCard.svelte';
  import Footer from '../components/Footer.svelte';
  import Loader from '../components/Loader.svelte';
  import { loadStoreData } from '../lib/storeData.js';

  // The query string for the current URL — App.svelte passes this down (and
  // updates it) so a link like a footer category href ("/shop?category=xyz")
  // is picked up even when clicked while already sitting on /shop, where the
  // SPA router doesn't remount this component and onMount alone would never see it.
  export let search = '';

  const SORT_MODES = ['newest', 'price-asc', 'price-desc'];
  const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '2XL', '3XL', '4XL'];

  function sortSizes(sizes) {
    return [...sizes].sort((a, b) => {
      const ai = SIZE_ORDER.indexOf(a.toUpperCase());
      const bi = SIZE_ORDER.indexOf(b.toUpperCase());
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }

  let data = null;
  let loading = true;
  let activeCategory = 'all';
  let activeSize = 'all';
  let sortMode = 'newest';
  let urlSynced = false; // guards against overwriting the just-parsed URL before the user interacts

  // Every size that appears on at least one product, in a sensible wearing order.
  $: allSizes = data ? sortSizes([...new Set(data.products.flatMap(p => p.sizes || []))]) : [];

  function applyQuery(qs) {
    if (!data) return;
    const query = new URLSearchParams(qs);
    const catId = query.get('category');
    const filter = query.get('filter');
    const sortParam = query.get('sort');
    const sizeParam = query.get('size');

    if (filter === 'new') activeCategory = 'new';
    else if (catId) {
      const found = data.categories.find(c => c.id === catId);
      activeCategory = found ? found.id : 'all';
    } else {
      activeCategory = 'all';
    }
    sortMode = SORT_MODES.includes(sortParam) ? sortParam : 'newest';
    activeSize = sizeParam && allSizes.includes(sizeParam) ? sizeParam : 'all';
  }

  // Re-parses whenever `data` first loads (initial URL) and whenever the app
  // router hands us a new `search` string thereafter (a link clicked to a
  // different /shop?... filter while this component is already mounted).
  $: if (data) applyQuery(search);

  onMount(async () => {
    try {
      data = await loadStoreData();
    }
    finally {
      loading = false;
      urlSynced = true;
    }
  });

  // Keep the URL in sync with the active filter/sort so the current view is
  // shareable/bookmarkable and survives a refresh. replaceState (not pushState)
  // so clicking through filters doesn't spam browser history.
  $: if (urlSynced) {
    const params = new URLSearchParams();
    if (activeCategory === 'new') params.set('filter', 'new');
    else if (activeCategory !== 'all') params.set('category', activeCategory);
    if (activeSize !== 'all') params.set('size', activeSize);
    if (sortMode !== 'newest') params.set('sort', sortMode);
    const qs = params.toString();
    history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
  }

  $: filtered = data
    ? data.products
        .filter(p => {
          if (activeCategory === 'new' && !p.isNew) return false;
          if (activeCategory !== 'all' && activeCategory !== 'new' && p.category !== activeCategory) return false;
          if (activeSize !== 'all' && !p.sizes?.includes(activeSize)) return false;
          return true;
        })
        .sort((a, b) => {
          if (sortMode === 'price-asc') return a.price - b.price;
          if (sortMode === 'price-desc') return b.price - a.price;
          return 0; // Default/newest
        })
    : [];

  $: newCount = data ? data.products.filter(p => p.isNew).length : 0;
</script>

<svelte:head>
  <title>{data ? `Shop All — ${data.site.metaTitle || data.site.name}` : 'Shop'}</title>
  <meta name="description" content={data?.site?.metaDescription || "Browse the full Others. collection — hoodies, tees, cargo pants, jackets and accessories."} />
</svelte:head>

{#if loading || !data}
  <Loader />
{:else}
  <div class="min-h-screen flex flex-col">
    <Navbar siteName={data.site.name} logo={data.site.logo} logoHeight={data.site.navLogoSize} />

    <div class="flex-1 pt-28 pb-20 px-6 md:px-10 max-w-7xl mx-auto">
      <div class="mb-10">
        <p class="text-label mb-2">Collection</p>
        <h1 class="text-4xl md:text-5xl font-display font-bold">All Products</h1>
      </div>

      <!-- Filters & Sort -->
      <div class="mb-10 border-b border-border pb-6 space-y-5">
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">

        <!-- Category filters -->
        <div class="flex flex-wrap gap-2">
          <button
            onclick={() => (activeCategory = 'all')}
            class="px-4 py-2 text-label tracking-[0.15em] transition-colors {activeCategory === 'all' ? 'bg-foreground text-primary-foreground' : 'border border-border hover:bg-muted'}">
            ALL ({data.products.length})
          </button>
          
          {#if newCount > 0}
            <button
              onclick={() => (activeCategory = 'new')}
              class="px-4 py-2 text-label tracking-[0.15em] transition-colors {activeCategory === 'new' ? 'bg-foreground text-primary-foreground' : 'border border-border hover:bg-muted'}">
              NEW ARRIVALS ({newCount})
            </button>
          {/if}

          {#each data.categories as cat}
            {@const count = data.products.filter(p => p.category === cat.id).length}
            {#if count > 0}
              <button
                onclick={() => (activeCategory = cat.id)}
                class="px-4 py-2 text-label tracking-[0.15em] transition-colors {activeCategory === cat.id ? 'bg-foreground text-primary-foreground' : 'border border-border hover:bg-muted'}">
                {cat.name.toUpperCase()} ({count})
              </button>
            {/if}
          {/each}
        </div>

        <!-- Sorter -->
        <div class="flex items-center gap-3 w-full md:w-auto">
          <span class="text-xs tracking-[0.15em] uppercase text-muted-foreground whitespace-nowrap">Sort By</span>
          <select
            bind:value={sortMode}
            class="bg-transparent border border-border px-3 py-2 text-[11px] uppercase tracking-[0.15em] focus:outline-none focus:border-foreground transition-colors cursor-pointer w-full md:w-auto"
          >
            <option value="newest">Featured / Newest</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
          </select>
        </div>
      </div>

      {#if allSizes.length}
        <!-- Size filter -->
        <div class="flex items-center flex-wrap gap-3">
          <span class="text-xs tracking-[0.15em] uppercase text-muted-foreground whitespace-nowrap">Size</span>
          <div class="flex flex-wrap gap-2">
            <button
              onclick={() => (activeSize = 'all')}
              class="min-w-[2.5rem] px-3 py-1.5 text-xs border transition-colors {activeSize === 'all' ? 'bg-foreground text-primary-foreground border-foreground' : 'border-border hover:border-foreground'}">
              ALL
            </button>
            {#each allSizes as size}
              <button
                onclick={() => (activeSize = size)}
                class="min-w-[2.5rem] px-3 py-1.5 text-xs border transition-colors {activeSize === size ? 'bg-foreground text-primary-foreground border-foreground' : 'border-border hover:border-foreground'}">
                {size}
              </button>
            {/each}
          </div>
        </div>
      {/if}
      </div>

      <!-- Grid -->
      {#if filtered.length}
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
          {#each filtered as product}
            <ProductCard {product} currency={data.site.currency} />
          {/each}
        </div>
      {:else}
        <div class="text-center py-24 text-muted-foreground">No products match these filters.</div>
      {/if}
    </div>

    <Footer {data} />
  </div>
{/if}
