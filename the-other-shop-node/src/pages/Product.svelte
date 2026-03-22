<script>
  import { onMount } from 'svelte';
  import { loadStoreData } from '../lib/storeData.js';
  import Navbar from '../components/Navbar.svelte';
  import Footer from '../components/Footer.svelte';
  import { cart } from '../stores/cart.js';
  import { getSrcset, getOptimizedUrl } from '../lib/cloudinary.js';

  export let productId = '';

  let data = null;
  let product = null;
  let loading = true;
  let selectedSize = '';
  let selectedImage = 0;
  let added = false;


  onMount(async () => {
    try {
      data = await loadStoreData();
      product = data.products.find(p => p.id === productId) ?? null;
      if (product) selectedSize = product.sizes[0] || '';
    } finally { loading = false; }
  });

  function addToCart() {
    if (!selectedSize || !product) return;
    cart.addItem(product, selectedSize);
    added = true;
    setTimeout(() => (added = false), 2000);
  }

  $: images = product ? (product.images?.length ? product.images : [product.image]) : [];
</script>

<svelte:head>
  {#if product}
    <title>{product.name} — {data?.site?.name ?? 'Others.'}</title>
    <meta name="description" content={product.description} />
  {:else}
    <title>Product — Others.</title>
  {/if}
</svelte:head>

{#if loading}
  <div class="flex min-h-screen items-center justify-center bg-background">
    <div class="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin"></div>
  </div>
{:else if !product}
  <div class="flex min-h-screen items-center justify-center bg-background flex-col gap-4">
    <p class="text-muted-foreground">Product not found.</p>
    <a href="/products" class="text-label border-b border-current">← Back to Shop</a>
  </div>
{:else}
  <div class="min-h-screen">
    <Navbar siteName={data.site.name} logo={data.site.logo} />

    <div class="pt-24 pb-20 px-6 md:px-10 max-w-6xl mx-auto">
      <!-- Breadcrumb -->
      <nav class="mb-8 text-xs text-muted-foreground flex items-center gap-2">
        <a href="/" class="hover:text-foreground transition-colors">Home</a>
        <span>/</span>
        <a href="/products" class="hover:text-foreground transition-colors">Shop</a>
        <span>/</span>
        <span class="text-foreground">{product.name}</span>
      </nav>

      <div class="grid md:grid-cols-2 gap-10 lg:gap-16">
        <!-- Image gallery -->
        <div class="space-y-3">
          <div class="aspect-[4/5] bg-secondary overflow-hidden">
            <img src={getOptimizedUrl(images[selectedImage], 1200)} srcset={getSrcset(images[selectedImage])} sizes="(max-width: 768px) 100vw, 50vw" alt={product.name} class="w-full h-full object-cover transition-opacity duration-300" />
          </div>
          {#if images.length > 1}
            <div class="flex gap-2 flex-wrap">
              {#each images as img, i}
                <button
                  aria-label="View image {i + 1}"
                  onclick={() => (selectedImage = i)}
                  class="w-16 h-16 border-2 transition-colors overflow-hidden flex-shrink-0 {selectedImage === i ? 'border-foreground' : 'border-transparent'}">
                  <img src={getOptimizedUrl(img, 200)} srcset={getSrcset(img)} sizes="64px" alt="" class="w-full h-full object-cover" loading="lazy" />
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Product info -->
        <div class="space-y-6">
          <div>
            {#if product.isNew}
              <span class="inline-block text-[10px] tracking-[0.2em] uppercase bg-foreground text-primary-foreground px-2 py-0.5 mb-3">New</span>
            {/if}
            <h1 class="text-3xl md:text-4xl font-display font-bold leading-tight mb-2">{product.name}</h1>
            <p class="text-2xl font-medium tabular-nums">{data.site.currency}{product.price.toFixed(2)}</p>
          </div>

          <p class="text-sm text-muted-foreground leading-relaxed">{product.description}</p>

          <!-- Colors -->
          {#if product.colors?.length}
            <div>
              <p class="text-label mb-3">COLOR: {product.colors[0]}</p>
              <div class="flex gap-2">
                {#each product.colors as color}
                  <span class="text-xs border border-border px-3 py-1.5">{color}</span>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Size selector -->
          {#if product.sizes?.length}
            <div>
              <p class="text-label mb-3">SIZE</p>
              <div class="flex flex-wrap gap-2">
                {#each product.sizes as size}
                  <button
                    onclick={() => (selectedSize = size)}
                    disabled={product.stock === 0}
                    class="border px-4 py-2 text-sm transition-colors {selectedSize === size ? 'bg-foreground text-primary-foreground border-foreground' : 'border-border hover:border-foreground'} {product.stock === 0 ? 'opacity-40 cursor-not-allowed line-through' : ''}">
                    {size}
                  </button>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Add to cart -->
          <div class="space-y-3 pt-2">
            <button
              onclick={addToCart}
              disabled={product.stock === 0 || !selectedSize}
              class="w-full py-4 text-label tracking-[0.25em] transition-all duration-300 {product.stock === 0 ? 'bg-muted text-muted-foreground cursor-not-allowed' : added ? 'bg-green-700 text-white' : 'bg-foreground text-primary-foreground hover:bg-foreground/90 active:scale-[0.97]'}">
              {product.stock === 0 ? 'SOLD OUT' : added ? 'ADDED TO CART ✓' : 'ADD TO CART'}
            </button>
            <a href="/cart" class="block w-full py-3.5 text-label tracking-[0.25em] text-center border border-border hover:bg-muted transition-colors">
              VIEW CART
            </a>
          </div>

          <!-- Stock note -->
          {#if product.stock > 0 && product.stock <= 5}
            <p class="text-xs text-store-rust font-medium">Only {product.stock} left in stock</p>
          {/if}
        </div>
      </div>
    </div>

    <Footer site={data.site} />
  </div>
{/if}
