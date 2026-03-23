<script>
  import { onMount } from 'svelte';
  import Navbar from '../components/Navbar.svelte';
  import ProductCard from '../components/ProductCard.svelte';
  import Footer from '../components/Footer.svelte';

  import { loadStoreData } from '../lib/storeData.js';

  let data = null;
  let loading = true;
  let activeCategory = 'all';
  let sortMode = 'newest';

  onMount(async () => {
    try { 
      data = await loadStoreData(); 
      const query = new URLSearchParams(window.location.search || window.location.hash.split('?')[1]);
      const catSlug = query.get('category');
      const filter = query.get('filter');
      
      if (filter === 'new') activeCategory = 'new';
      else if (catSlug && data.categories) {
        const found = data.categories.find(c => c.slug === catSlug);
        if (found) activeCategory = found.id;
      }
    }
    finally { loading = false; }
  });

  $: filtered = data
    ? data.products
        .filter(p => {
          if (activeCategory === 'new') return p.isNew;
          if (activeCategory !== 'all') return p.category === activeCategory;
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
  <div class="flex min-h-screen items-center justify-center bg-background">
    <div class="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin"></div>
  </div>
{:else}
  <div class="min-h-screen">
    <Navbar siteName={data.site.name} logo={data.site.logo} />

    <div class="pt-28 pb-20 px-6 md:px-10 max-w-7xl mx-auto">
      <div class="mb-10">
        <p class="text-label mb-2">Collection</p>
        <h1 class="text-4xl md:text-5xl font-display font-bold">All Products</h1>
      </div>

      <!-- Filters & Sort -->
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10 border-b border-border pb-6">
        
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

      <!-- Grid -->
      {#if filtered.length}
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
          {#each filtered as product}
            <ProductCard {product} currency={data.site.currency} />
          {/each}
        </div>
      {:else}
        <div class="text-center py-24 text-muted-foreground">No products in this category.</div>
      {/if}
    </div>

    <Footer {data} />
  </div>
{/if}
