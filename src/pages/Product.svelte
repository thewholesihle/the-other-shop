<script>
  import { cutReveal } from '../lib/cutReveal.js';
  import Img from '../components/Img.svelte';
  import { onMount, onDestroy, tick } from 'svelte';
  import Footer from '../components/Footer.svelte';
  import Loader from '../components/Loader.svelte';
  import { loadStoreData } from '../lib/storeData.js';
  import Navbar from '../components/Navbar.svelte';
  import { cart } from '../stores/cart.js';
  import { getSrcset, getOptimizedUrl } from '../lib/cloudinary.js';
  import Splide from '@splidejs/splide';
  import '@splidejs/splide/css/core';

  export let productId = '';

  let data = null;
  let product = null;
  let loading = true;
  let selectedSize = '';
  let selectedColor = '';
  let added = false;
  let ready = false;          // flips after first paint so the gallery's entrance animation can play

  // Both sliders are Splide instances (patta's choice too).
  let galleryEl;              // .splide root of the photo gallery
  let gallery = null;
  let carouselIndex = 0;      // which photo the carousel is on, for the "n / total" counter

  // Fullscreen zoom
  let dlg;
  let zoomOpen = false;
  let zoomIndex = 0;
  let zoomEl;
  let zoom = null;

  onMount(async () => {
    try {
      data = await loadStoreData();
      product = data.products.find(p => p.id === productId) ?? null;
      if (product) {
        selectedSize = product.sizes?.length === 1 ? product.sizes[0] : '';
        selectedColor = product.colors?.length === 1 ? product.colors[0] : '';
      }
    } finally { loading = false; }
    // Let the gallery mount at its hidden start state first, then reveal it.
    await tick();
    requestAnimationFrame(() => requestAnimationFrame(() => (ready = true)));
  });

  onDestroy(() => {
    gallery?.destroy();
    zoom?.destroy();
    if (typeof document !== 'undefined') document.body.style.overflow = '';
  });

  // ── Gallery ────────────────────────────────────────────────────────────────
  const altFor = (i) => `${product.name}${selectedColor ? ` in ${selectedColor}` : ''} — photo ${i + 1} of ${images.length}`;

  // One photo list, two layouts: below 1024px a swipe carousel whose slides are narrower than the track,
  // so the next photo peeks in; from 1024px Splide is switched off (`destroy`) and CSS lays the very same
  // list out as a 2-column grid. Each breakpoint states its full set of options (Splide applies one).
  function galleryOptions(count) {
    const single = count < 2;
    const slides = (w) => (single ? '100%' : w);
    return {
      type: 'slide',
      arrows: false,
      pagination: false,
      keyboard: false,            // arrow keys are for the zoom view, not the whole page
      drag: !single,
      gap: 12,
      focus: 0,
      trimSpace: 'move',          // the last photo can still be reached (and counted) without a blank gap
      speed: 450,
      label: `${product.name} photos`,
      mediaQuery: 'max',
      destroy: true,              // ≥ 1024px: plain grid
      breakpoints: {
        1023: { destroy: false, fixedWidth: slides('46%'), padding: { left: 40, right: 40 } },
        767:  { destroy: false, fixedWidth: slides('70%'), padding: { left: 20, right: 20 } },
      },
    };
  }

  // (Re)build the carousel whenever the photo set changes — e.g. a colour with its own photos.
  async function mountGallery() {
    gallery?.destroy(false);
    gallery = null;
    carouselIndex = 0;
    await tick();
    if (!galleryEl || !images.length) return;
    gallery = new Splide(galleryEl, galleryOptions(images.length));
    gallery.on('move', (index) => (carouselIndex = index));
    gallery.mount();
  }

  // ── Zoom ───────────────────────────────────────────────────────────────────
  // A native <dialog> (modal, focus-trapped, Esc closes, focus returns to the photo that opened it)
  // holding a second Splide. Full-resolution images are only rendered while it's open.
  async function openZoom(i) {
    zoomIndex = i;
    zoomOpen = true;
    await tick();
    dlg.showModal();
    document.body.style.overflow = 'hidden';
    zoom = new Splide(zoomEl, {
      type: 'slide', start: i, arrows: false, pagination: false, keyboard: false,
      speed: 400, gap: 0, label: `${product.name} photos, zoomed`,
    });
    zoom.on('move', (index) => (zoomIndex = index));
    zoom.mount();
  }
  function onZoomClose() {
    zoom?.destroy();
    zoom = null;
    zoomOpen = false;
    document.body.style.overflow = '';
  }
  const zoomGo = (delta) => zoom?.go(delta > 0 ? '>' : '<');
  function onZoomKey(e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); zoomGo(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); zoomGo(-1); }
  }

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
  // A size or colour with nothing left in ANY combination is shown as sold out straight away,
  // before the shopper has picked the other option.
  const allGone = (list) => list.length > 0 && list.every(v => (v.stock ?? 0) <= 0);
  // The 2nd argument is unused — passing the other selection in lets the template re-check when it changes.
  function sizeHasStock(size, _color) {
    if (!hasVariants) return true;
    if (allGone(product.variants.filter(v => (v.size || '') === (size || '')))) return false;
    if (product.colors?.length > 0 && !selectedColor) return true; // don't know yet
    const v = findVariant(size, selectedColor);
    return (v?.stock ?? 0) > 0;
  }
  function colorHasStock(color, _size) {
    if (!hasVariants) return true;
    if (allGone(product.variants.filter(v => (v.color || '') === (color || '')))) return false;
    if (product.sizes?.length > 0 && !selectedSize) return true; // don't know yet
    const v = findVariant(selectedSize, color);
    return (v?.stock ?? 0) > 0;
  }

  // Each colour's thumbnail is its own first photo (set per colour in the admin); a colour with no
  // photos of its own falls back to a text button.
  const colorThumb = (color) => product?.colorImages?.find(ci => ci.color === color)?.images?.[0] || '';

  // A selected color with its own dedicated photos takes over the gallery;
  // otherwise fall back to the product's general image set.
  $: activeColorImages = product?.colorImages?.find(ci => ci.color === selectedColor)?.images;
  $: images = product
    ? (activeColorImages?.length ? activeColorImages : (product.images?.length ? product.images : [product.image]))
    : [];
  // Back to the first shot whenever the gallery itself changes (a new colour with its own photos).
  $: images, galleryEl, mountGallery();
  $: hasVariants = product?.variants?.length > 0;
  $: missingSize = product?.sizes?.length > 0 && !selectedSize;
  $: missingColor = product?.colors?.length > 0 && !selectedColor;
  $: currentVariantStock = hasVariants
    ? (missingSize || missingColor ? null : (findVariant(selectedSize, selectedColor)?.stock ?? 0))
    : (product?.stock ?? 0);
  $: disabledAdd = product?.stock === 0 || missingSize || missingColor || currentVariantStock === 0;

  // Stock status, shown right under the price. Once a size
  // and colour are picked it reflects that exact variant; before that it reflects the product as a whole.
  const LOW_STOCK = 5;
  $: stockInfo = !product ? null
    : product.stock === 0 ? { level: 'out', text: 'Sold out' }
    : currentVariantStock === 0 ? { level: 'out', text: 'Sold out in this size / colour' }
    : currentVariantStock !== null && currentVariantStock <= LOW_STOCK ? { level: 'low', text: `Only ${currentVariantStock} left — selling fast` }
    : currentVariantStock === null && product.stock <= LOW_STOCK ? { level: 'low', text: `Only ${product.stock} left in total` }
    : { level: 'ok', text: 'In stock' };
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
  <div class="min-h-screen flex flex-col">
    <Navbar siteName={data.site.name} logo={data.site.logo} logoHeight={data.site.navLogoSize} />

    <!-- Same width and side padding as the navbar, so the page lines up with the header instead of floating in a narrow column. -->
    <div class="flex-1 pt-28 pb-20 px-5 md:px-10 max-w-screen-2xl mx-auto w-full">
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

      <div class="grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-8 lg:gap-10 xl:gap-14">
        <!-- Gallery: Splide carousel below 1024px, 2-column grid above (see .pgallery in index.css) -->
        <div class="min-w-0 -mx-5 md:-mx-10 lg:mx-0">
          <div bind:this={galleryEl} class="splide">
            <div class="splide__track">
              <ul class="splide__list pgallery" class:is-ready={ready} class:pgallery--single={images.length === 1}>
                {#each images as img, i (img + i)}
                  <li class="splide__slide pgallery__item" style="--i: {Math.min(i, 6)}">
                    <button
                      type="button"
                      onclick={() => openZoom(i)}
                      aria-label="Zoom photo {i + 1} of {images.length}"
                      class="block w-full overflow-hidden rounded bg-secondary cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
                    >
                      <Img
                        src={img}
                        alt={altFor(i)}
                        widths={[352, 800, 1200]}
                        fallbackWidth={800}
                        sizes="(min-width: 1024px) 28vw, (min-width: 768px) 46vw, 70vw"
                        priority={i === 0}
                        width="800"
                        height="1000"
                        class="aspect-[4/5] w-full object-cover"
                      />
                    </button>
                  </li>
                {/each}
              </ul>
            </div>
          </div>
          {#if images.length > 1}
            <p class="lg:hidden mt-3 text-center text-xs tabular-nums text-muted-foreground" aria-hidden="true">{carouselIndex + 1} / {images.length}</p>
          {/if}
        </div>

        <!-- Product info: stays in view beside the grid on large screens, so Add to cart is never a long scroll away -->
        <div class="space-y-6 lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100svh-7rem)] lg:overflow-y-auto lg:pr-1">
          <div>
            {#if product.isNew}
              <span class="inline-block text-[10px] tracking-[0.2em] uppercase bg-foreground text-primary-foreground px-2 py-0.5 mb-3">New</span>
            {/if}
            <h1 use:cutReveal class="text-3xl md:text-4xl font-display font-bold leading-tight mb-2">{product.name}</h1>
            <p class="text-2xl font-medium tabular-nums">{data.site.currency}{product.price.toFixed(2)}</p>
            {#if stockInfo}
              <p
                class="mt-3 inline-flex items-center gap-2 text-sm font-medium px-3 py-1.5 border
                  {stockInfo.level === 'low' ? 'border-destructive/50 bg-destructive/10 text-destructive' : stockInfo.level === 'out' ? 'border-border bg-muted text-foreground' : 'border-transparent text-success px-0'}"
                role="status"
              >
                <span class="h-2 w-2 rounded-full {stockInfo.level === 'low' ? 'bg-destructive animate-pulse' : stockInfo.level === 'out' ? 'bg-muted-foreground' : 'bg-success'}"></span>
                {stockInfo.text}
              </p>
            {/if}
          </div>

          <p class="text-sm text-muted-foreground leading-relaxed">{product.description}</p>

          <!-- Colors: thumbnails of each colour's own photo (text button when a colour has none) -->
          {#if product.colors?.length}
            <div>
              <p class="text-label mb-3">COLOR{#if selectedColor}<span class="ml-2 normal-case tracking-normal font-normal text-muted-foreground">{selectedColor}</span>{:else if product.colors.length > 1}<span class="text-destructive text-xs lowercase ml-1">(required)</span>{/if}</p>
              <div class="flex flex-wrap gap-2" role="group" aria-label="Colour">
                {#each product.colors as color}
                  {@const thumbSrc = colorThumb(color)}
                  {@const out = !colorHasStock(color, selectedSize)}
                  {#if thumbSrc}
                    <button
                      type="button"
                      onclick={() => (selectedColor = color)}
                      disabled={out}
                      aria-pressed={selectedColor === color}
                      aria-label="{color}{out ? ' (sold out)' : ''}"
                      title={color}
                      class="relative w-16 sm:w-[72px] overflow-hidden rounded border-2 bg-secondary transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground {selectedColor === color ? 'border-foreground' : 'border-transparent hover:border-foreground/50'} {out ? 'cursor-not-allowed opacity-40' : ''}">
                      <Img src={thumbSrc} alt="" widths={[72, 144, 216]} fallbackWidth={144} sizes="72px" width="72" height="90" class="aspect-[4/5] w-full object-cover" />
                      {#if out}<span class="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top_right,transparent_calc(50%-1px),hsl(var(--foreground)/0.6)_50%,transparent_calc(50%+1px))]"></span>{/if}
                    </button>
                  {:else}
                    <button
                      type="button"
                      onclick={() => (selectedColor = color)}
                      disabled={out}
                      aria-pressed={selectedColor === color}
                      class="text-xs border transition-colors px-3 py-1.5 {selectedColor === color ? 'bg-foreground text-primary-foreground border-foreground' : 'border-border hover:border-foreground'} {out ? 'text-muted-foreground border-dashed cursor-not-allowed line-through' : ''}">
                      {color}{out ? ' (sold out)' : ''}
                    </button>
                  {/if}
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
                    disabled={product.stock === 0 || !sizeHasStock(size, selectedColor)}
                    class="border px-4 py-2 text-sm transition-colors {selectedSize === size ? 'bg-foreground text-primary-foreground border-foreground' : 'border-border hover:border-foreground'} {product.stock === 0 || !sizeHasStock(size, selectedColor) ? 'text-muted-foreground border-dashed cursor-not-allowed line-through' : ''}">
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
              class="w-full py-4 text-label tracking-[0.25em] transition-all duration-300 {product.stock === 0 ? 'bg-muted text-muted-foreground cursor-not-allowed' : added ? 'bg-success text-success-foreground' : disabledAdd ? 'bg-muted text-foreground cursor-not-allowed border border-border' : 'bg-foreground text-primary-foreground hover:bg-foreground/90 active:scale-[0.97]'}">
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

        </div>
      </div>
    </div>

    <!-- Fullscreen zoom -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
    <dialog
      bind:this={dlg}
      onclose={onZoomClose}
      onclick={(e) => { if (e.target === dlg) dlg.close(); }}
      onkeydown={onZoomKey}
      aria-label="{product.name} photos, zoomed"
      class="m-0 h-svh max-h-none w-svw max-w-none overflow-hidden border-0 bg-black p-0 text-white backdrop:bg-black"
    >
      {#if zoomOpen}
        <div class="relative h-full w-full">
          <div bind:this={zoomEl} class="splide h-full">
            <div class="splide__track h-full">
              <ul class="splide__list">
                {#each images as img, i (img + i)}
                  <li role="presentation" class="splide__slide flex h-full items-center justify-center" onclick={(e) => { if (e.target === e.currentTarget) dlg.close(); }}>
                    <img
                      src={getOptimizedUrl(img, 1920)}
                      alt={altFor(i)}
                      decoding="async"
                      loading={Math.abs(i - zoomIndex) <= 1 ? 'eager' : 'lazy'}
                      draggable="false"
                      class="max-h-[calc(100svh-8rem)] max-w-full select-none object-contain lg:max-h-svh"
                    />
                  </li>
                {/each}
              </ul>
            </div>
          </div>

          <div class="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-4">
            <p class="rounded-full bg-black/60 px-3 py-1 text-xs tabular-nums" role="status">{zoomIndex + 1} / {images.length}</p>
            <button type="button" onclick={() => dlg.close()} aria-label="Close zoom" class="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-white hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>

          {#if images.length > 1}
            <button type="button" onclick={() => zoomGo(-1)} disabled={zoomIndex === 0} aria-label="Previous photo" class="absolute left-4 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-white hover:text-black disabled:opacity-30 disabled:hover:bg-black/60 disabled:hover:text-white lg:flex focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <button type="button" onclick={() => zoomGo(1)} disabled={zoomIndex === images.length - 1} aria-label="Next photo" class="absolute right-4 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-white hover:text-black disabled:opacity-30 disabled:hover:bg-black/60 disabled:hover:text-white lg:flex focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          {/if}
        </div>
      {/if}
    </dialog>

    <Footer {data} />
  </div>
{/if}
