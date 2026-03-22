<script>
  import { onMount } from 'svelte';
  import Navbar from '../components/Navbar.svelte';
  import ProductCard from '../components/ProductCard.svelte';
  import Footer from '../components/Footer.svelte';

  import { loadStoreData } from '../lib/storeData.js';

  let data = null;
  let loading = true;
  let activeCategory = 'all';

  onMount(async () => {
    try { data = await loadStoreData(); }
    finally { loading = false; }
  });

  $: filtered = data
    ? (activeCategory === 'all' ? data.products : data.products.filter(p => p.category === activeCategory))
    : [];
</script>

<svelte:head>
  <title>{data ? `Shop All — ${data.site.name}` : 'Shop'}</title>
  <meta name="description" content="Browse the full Others. collection — hoodies, tees, cargo pants, jackets and accessories." />
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

      <!-- Category filters -->
      <div class="flex flex-wrap gap-2 mb-10 border-b border-border pb-6">
        <button
          onclick={() => (activeCategory = 'all')}
          class="px-4 py-2 text-label tracking-[0.15em] transition-colors {activeCategory === 'all' ? 'bg-foreground text-primary-foreground' : 'border border-border hover:bg-muted'}">
          ALL ({data.products.length})
        </button>
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

    <Footer site={data.site} />
  </div>
{/if}
