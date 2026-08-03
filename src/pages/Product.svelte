<script>
  import { onMount } from 'svelte';
  import Footer from '../components/Footer.svelte';
  import Loader from '../components/Loader.svelte';
  import { loadStoreData } from '../lib/storeData.js';
  import Navbar from '../components/Navbar.svelte';
  import { cart } from '../stores/cart.js';
  import { getSrcset, getOptimizedUrl } from '../lib/cloudinary.js';

  export let productId = '';

  let data = null;
  let product = null;
  let loading = true;
  let selectedSize = '';
  let selectedColor = '';
  let selectedImage = 0;
  let added = false;


  onMount(async () => {
    try {
      data = await loadStoreData();
      product = data.products.find(p => p.id === productId) ?? null;
      if (product) {
        selectedSize = product.sizes?.length === 1 ? product.sizes[0] : '';
        selectedColor = product.colors?.length === 1 ? product.colors[0] : '';
      }
    } finally { loading = false; }
  });

  function addToCart() {
    if (!product) return;
    if (product.sizes?.length > 0 && !selectedSize) return;
    if (product.colors?.length > 0 && !selectedColor) return;
    if (currentVariantStock <= 0) return;

    cart.addItem(product, selectedSize, selectedColor);
    added = true;
    setTimeout(() => (added = false), 2000);
  }

  function findVariant(size, color) {
    return (product?.variants || []).find(v => (v.size || '') === (size || '') && (v.color || '') === (color || ''));
  }

  // Once both dimensions the product actually has are chosen, disable a size/color
  // if the specific combination has no stock left — this is what prevents ordering
  // a size/color pairing that's actually sold out while the product overall isn't.
  function sizeHasStock(size) {
    if (!hasVariants) return true;
    if (product.colors?.length > 0 && !selectedColor) return true; // don't know yet
    const v = findVariant(size, selectedColor);
    return (v?.stock ?? 0) > 0;
  }
  function colorHasStock(color) {
    if (!hasVariants) return true;
    if (product.sizes?.length > 0 && !selectedSize) return true; // don't know yet
    const v = findVariant(selectedSize, color);
    return (v?.stock ?? 0) > 0;
  }

  $: images = product ? (product.images?.length ? product.images : [product.image]) : [];
  $: hasVariants = product?.variants?.length > 0;
  $: missingSize = product?.sizes?.length > 0 && !selectedSize;
  $: missingColor = product?.colors?.length > 0 && !selectedColor;
  $: currentVariantStock = hasVariants
    ? (missingSize || missingColor ? null : (findVariant(selectedSize, selectedColor)?.stock ?? 0))
    : (product?.stock ?? 0);
  $: disabledAdd = product?.stock === 0 || missingSize || missingColor || currentVariantStock === 0;
</script>

<svelte:head>
  {#if product}
    <title>{product.name} — {data?.site?.name ?? 'Others.'}</title>
    <meta name="description" content={product.description} />
    <meta property="og:title" content={product.name} />
    <meta property="og:description" content={product.description} />
    <meta property="og:image" content={images[0]} />
    <meta property="og:type" content="product" />
  {:else}
    <title>Product — Others.</title>
  {/if}
</svelte:head>

{#if loading || !data}
  <Loader />
{:else if !product}
  <div class="flex min-h-screen items-center justify-center bg-background flex-col gap-4">
    <p class="text-muted-foreground">Product not found.</p>
    <a href="/shop" class="text-label border-b border-current">← Back to Shop</a>
  </div>
{:else}
  <div class="min-h-screen">
    <Navbar siteName={data.site.name} logo={data.site.logo} logoHeight={data.site.navLogoSize} />

    <div class="pt-24 pb-20 px-6 md:px-10 max-w-6xl mx-auto">
      <!-- Back button & Breadcrumb -->
      <div class="mb-8 flex flex-col gap-6">
        <button onclick={() => window.history.length > 1 ? window.history.back() : window.__navigate('/shop')} class="flex items-center gap-2 text-[10px] tracking-[0.2em] uppercase font-bold text-muted-foreground hover:text-foreground transition-colors group w-fit">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="group-hover:-translate-x-1 transition-transform"><path d="m15 18-6-6 6-6"/></svg>
          Back
        </button>

        <nav class="text-xs text-muted-foreground flex items-center gap-2">
          <a href="/" class="hover:text-foreground transition-colors">Home</a>
          <span>/</span>
          <a href="/shop" class="hover:text-foreground transition-colors">Shop</a>
          <span>/</span>
          <span class="text-foreground">{product.name}</span>
        </nav>
      </div>

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
              <p class="text-label mb-3">COLOR <span class="text-destructive text-xs lowercase ml-1">{product.colors.length > 1 && !selectedColor ? '(required)' : ''}</span></p>
              <div class="flex gap-2">
                {#each product.colors as color}
                  <button
                    onclick={() => (selectedColor = color)}
                    disabled={!colorHasStock(color)}
                    class="text-xs border transition-colors px-3 py-1.5 {selectedColor === color ? 'bg-foreground text-primary-foreground border-foreground' : 'border-border hover:border-foreground'} {!colorHasStock(color) ? 'opacity-40 cursor-not-allowed line-through' : ''}">
                    {color}
                  </button>
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
                    disabled={product.stock === 0 || !sizeHasStock(size)}
                    class="border px-4 py-2 text-sm transition-colors {selectedSize === size ? 'bg-foreground text-primary-foreground border-foreground' : 'border-border hover:border-foreground'} {product.stock === 0 || !sizeHasStock(size) ? 'opacity-40 cursor-not-allowed line-through' : ''}">
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
              disabled={disabledAdd}
              class="w-full py-4 text-label tracking-[0.25em] transition-all duration-300 {product.stock === 0 ? 'bg-muted text-muted-foreground cursor-not-allowed' : added ? 'bg-green-700 text-white' : disabledAdd ? 'bg-muted text-foreground cursor-not-allowed border border-border' : 'bg-foreground text-primary-foreground hover:bg-foreground/90 active:scale-[0.97]'}">
              {#if product.stock === 0}
                SOLD OUT
              {:else if added}
                ADDED TO CART ✓
              {:else if missingSize && missingColor}
                SELECT SIZE & COLOR
              {:else if missingSize}
                SELECT SIZE
              {:else if missingColor}
                SELECT COLOR
              {:else if currentVariantStock === 0}
                SOLD OUT IN THIS SIZE/COLOR
              {:else}
                ADD TO CART
              {/if}
            </button>
            <a href="/cart" class="block w-full py-3.5 text-label tracking-[0.25em] text-center border border-border hover:bg-muted transition-colors">
              VIEW CART
            </a>
          </div>

          <!-- Stock note -->
          {#if currentVariantStock !== null && currentVariantStock > 0 && currentVariantStock <= 5}
            <p class="text-xs text-store-rust font-medium">Only {currentVariantStock} left in stock</p>
          {/if}
        </div>
      </div>
    </div>

    <Footer {data} />
  </div>
{/if}
