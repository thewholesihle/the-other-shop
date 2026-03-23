<script>
  import { getSrcset, getOptimizedUrl } from '../lib/cloudinary.js';
  export let product;
  export let currency = 'R';

  function goToProduct() {
    if (window.__navigate) window.__navigate(`/shop/${product.id}`);
  }

  $: primaryImage = product.images?.[0] || product.image || '';
  $: hoverImage = product.images?.[1] || primaryImage;
  $: isOutOfStock = product.stock === 0;
</script>

<div
  class="group relative cursor-pointer"
  role="button"
  tabindex="0"
  aria-label="View {product.name}"
  onclick={goToProduct}
  onkeydown={(e) => e.key === 'Enter' && goToProduct()}
>
  <!-- Image container -->
  <div class="relative aspect-[3/4] overflow-hidden bg-secondary mb-3">
    <!-- Primary Image (Static Base) -->
    <img
      src={getOptimizedUrl(primaryImage, 600)}
      srcset={getSrcset(primaryImage)}
      sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
      alt={product.name}
      class="w-full h-full object-cover object-center absolute inset-0"
      loading="lazy"
    />

    <!-- Secondary Image (Fade-In Overlay) -->
    {#if primaryImage !== hoverImage}
      <img
        src={getOptimizedUrl(hoverImage, 600)}
        srcset={getSrcset(hoverImage)}
        sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
        alt="{product.name} alternate view"
        class="w-full h-full object-cover object-center absolute inset-0 transition-opacity duration-500 opacity-0 group-hover:opacity-100"
        loading="lazy"
      />
    {/if}

    {#if isOutOfStock}
      <span class="absolute top-3 left-3 bg-store-rust text-accent-foreground text-[10px] tracking-[0.2em] uppercase px-3 py-1 font-medium">Sold Out</span>
    {:else if product.isNew}
      <span class="absolute top-3 left-3 bg-foreground text-primary-foreground text-[10px] tracking-[0.2em] uppercase px-3 py-1 font-medium">New</span>
    {/if}
  </div>

  <!-- Product info -->
  <div>
    <h3 class="text-sm font-medium leading-tight truncate">{product.name}</h3>
    <p class="text-sm text-muted-foreground mt-0.5 tabular-nums">{currency}{product.price.toFixed(2)}</p>
    {#if product.colors?.length > 1}
      <p class="text-[11px] text-muted-foreground mt-0.5">{product.colors.length} colors</p>
    {/if}
  </div>
</div>
