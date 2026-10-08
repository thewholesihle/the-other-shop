<script>
  import Img from './Img.svelte';
  import { thumb } from '../lib/cloudinary.js';
  export let product;
  export let currency = 'R';

  // Colour options under the photo. Hovering or focusing one previews it on the card; clicking or tapping keeps it, and the
  // product page then opens with that colour already chosen.
  const MAX_SWATCHES = 5;
  let picked = '';
  let previewing = '';

  function goToProduct() {
    const q = picked ? `?color=${encodeURIComponent(picked)}` : '';
    if (window.__navigate) window.__navigate(`/shop/${encodeURIComponent(product.slug || product.id)}${q}`);
  }

  const photosOf = (c) => product.colorImages?.find(ci => ci.color === c)?.images?.filter(Boolean) || [];
  // A colour counts as sold out only when the product tracks stock per colour and every size of it is gone.
  const soldOut = (c) => { const vs = (product.variants || []).filter(v => (v.color || '') === c); return vs.length > 0 && vs.every(v => !(v.stock > 0)); };
  const cssColor = (name) => typeof CSS !== 'undefined' && CSS.supports?.('color', String(name).toLowerCase().replace(/\s+/g, '')) ? String(name).toLowerCase().replace(/\s+/g, '') : '';

  $: active = previewing || picked;
  $: own = active ? photosOf(active) : [];
  $: primaryImage = own[0] || product.images?.[0] || product.image || '';
  $: hoverImage = (active ? own[1] : product.images?.[1]) || primaryImage;
  $: isOutOfStock = product.stock === 0;
  $: colors = product.colors || [];
  $: shown = colors.slice(0, MAX_SWATCHES);
  $: extra = colors.length - shown.length;
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
    <Img
      src={primaryImage}
      sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
      alt={active ? `${product.name} in ${active}` : product.name}
      fallbackWidth={640}
      class="w-full h-full object-cover object-center absolute inset-0"
    />

    <!-- Secondary Image (Fade-In Overlay) -->
    {#if primaryImage !== hoverImage}
      <Img
        src={hoverImage}
        sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
        alt="{product.name} alternate view"
        fallbackWidth={640}
        fadeIn={false}
        class="w-full h-full object-cover object-center absolute inset-0 transition-opacity duration-500 opacity-0 group-hover:opacity-100"
      />
    {/if}

    {#if isOutOfStock}
      <span class="absolute top-3 left-3 bg-destructive text-destructive-foreground text-[10px] tracking-[0.2em] uppercase px-3 py-1 font-medium">Sold Out</span>
    {:else if product.isNew}
      <span class="absolute top-3 left-3 bg-foreground text-primary-foreground text-[10px] tracking-[0.2em] uppercase px-3 py-1 font-medium">New</span>
    {/if}
  </div>

  <!-- Product info -->
  <div>
    <h3 class="text-sm font-medium leading-tight truncate">{product.name}</h3>
    <p class="text-sm text-muted-foreground mt-0.5 tabular-nums">{currency}{product.price.toFixed(2)}</p>
    {#if colors.length > 1}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div class="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Colours" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} onmouseleave={() => (previewing = '')}>
        {#each shown as color (color)}
          {@const photo = photosOf(color)[0]}
          {@const dot = !photo ? cssColor(color) : ''}
          {@const out = soldOut(color)}
          <button
            type="button"
            title="{color}{out ? ' (sold out)' : ''}"
            aria-label="{color}{out ? ' (sold out)' : ''}"
            aria-pressed={picked === color}
            onmouseenter={() => (previewing = color)}
            onfocus={() => (previewing = color)}
            onblur={() => (previewing = '')}
            onclick={() => (picked = picked === color ? '' : color)}
            class="relative flex h-[22px] w-[22px] items-center justify-center overflow-hidden rounded-full border bg-secondary text-[9px] font-semibold uppercase leading-none transition-[box-shadow,opacity] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground {picked === color ? 'border-foreground ring-1 ring-foreground ring-offset-1 ring-offset-background' : 'border-border hover:border-foreground'} {out ? 'opacity-40' : ''}"
            style={dot ? `background:${dot}` : ''}
          >
            {#if photo}
              <img src={thumb(photo, 22)} alt="" loading="lazy" decoding="async" class="h-full w-full object-cover" />
            {:else if !dot}
              {color.trim().charAt(0)}
            {/if}
            {#if out}<span class="absolute inset-x-0 top-1/2 h-px -rotate-45 bg-foreground/70"></span>{/if}
          </button>
        {/each}
        {#if extra > 0}<span class="text-[11px] text-muted-foreground tabular-nums">+{extra}</span>{/if}
      </div>
    {/if}
  </div>
</div>
