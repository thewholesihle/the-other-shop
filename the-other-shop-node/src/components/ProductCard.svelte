<script>
  export let product;
  export let currency = '€';

  let isHovered = false;
  let liked = false;

  function toggleLike(e) {
    e.stopPropagation();
    liked = !liked;
  }

  function goToProduct() {
    if (window.__navigate) window.__navigate(`/products/${product.id}`);
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
  onmouseenter={() => (isHovered = true)}
  onmouseleave={() => (isHovered = false)}
  onclick={goToProduct}
  onkeydown={(e) => e.key === 'Enter' && goToProduct()}
>
  <!-- Image container -->
  <div class="relative aspect-[3/4] overflow-hidden bg-secondary mb-3">
    <img
      src={isHovered ? hoverImage : primaryImage}
      alt={product.name}
      class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
    />

    {#if isOutOfStock}
      <span class="absolute top-3 left-3 bg-store-rust text-accent-foreground text-[10px] tracking-[0.2em] uppercase px-3 py-1 font-medium">Sold Out</span>
    {:else if product.isNew}
      <span class="absolute top-3 left-3 bg-foreground text-primary-foreground text-[10px] tracking-[0.2em] uppercase px-3 py-1 font-medium">New</span>
    {/if}

    <!-- Wishlist button -->
    <button
      aria-label="Toggle wishlist"
      onclick={toggleLike}
      class="absolute top-3 right-3 p-2 transition-all duration-200 active:scale-90 {isHovered || liked ? 'opacity-100' : 'opacity-0'}"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
        fill={liked ? 'currentColor' : 'none'}
        class="{liked ? 'text-store-rust' : 'text-foreground'}">
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
      </svg>
    </button>
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
