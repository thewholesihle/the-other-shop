<script>
  import { cutReveal } from '../lib/cutReveal.js';
  import Img from '../components/Img.svelte';
  import Embed from '../components/Embed.svelte';
  import Video from '../components/Video.svelte';
  import { onMount } from 'svelte';
  import { loadStoreData } from '../lib/storeData.js';
  import Navbar from '../components/Navbar.svelte';
  import Footer from '../components/Footer.svelte';
  import Loader from '../components/Loader.svelte';
  import { getOptimizedUrl, getVideoPoster } from '../lib/cloudinary.js';
  import { itemKind, itemStill, lookbookCover, layoutRatio, ratioOf, measureImage } from '../lib/lookbook.js';

  export let lookbookId = '';

  let data = null;
  let lb = null;
  let loading = true;
  let expanded = null;
  let measured = {};           // shapes we had to read from the files themselves (lookbooks saved before sizes were stored)

  onMount(async () => {
    try {
      data = await loadStoreData();
      const lookbooks = data.lookbooks || [];
      lb = lookbooks.find(l => l.id === lookbookId) ?? null;
    } finally { loading = false; }
  });

  $: items = lb?.items ?? lb?.images?.map(url => ({ type: 'image', url, caption: '' })) ?? [];

  // Media with a known size is laid out at its true shape straight away. Anything without one is measured here (its picture,
  // or a still from its video) and the layout settles when the answer arrives; the admin saves the sizes on the next edit.
  $: for (const item of items) {
    const k = item.url;
    if (!k || measured[k] !== undefined || ratioOf(item.width, item.height) || itemKind(item) === 'embed') continue;
    measured[k] = 0;
    const still = itemKind(item) === 'video' ? getVideoPoster(k, 480) : k;
    if (still) measureImage(getOptimizedUrl(still, 480)).then(size => { measured = { ...measured, [k]: size ? ratioOf(size.width, size.height) : 0 }; });
  }
  $: shaped = items.map((item) => ({ item, kind: itemKind(item), ratio: layoutRatio(item, measured[item.url] || 0) }));
  $: gallery = shaped.filter(s => s.kind === 'image').map(s => s.item);

  function onKey(e) {
    if (!expanded) return;
    if (e.key === 'Escape') expanded = null;
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  }
  const step = (d) => (expanded = { ...expanded, index: (expanded.index + d + expanded.items.length) % expanded.items.length });
  const openImage = (item) => (expanded = { items: gallery, index: Math.max(0, gallery.indexOf(item)) });
</script>

<svelte:head>
  {#if lb}
    <title>{lb.title} — {data?.site?.name ?? 'Others.'} Lookbook</title>
    <meta name="description" content={lb.description} />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="{lb.title} Lookbook" />
    <meta property="og:description" content={lb.description} />
    {#if lookbookCover(lb)}<meta property="og:image" content={getOptimizedUrl(lookbookCover(lb), 1200)} />{/if}
  {:else}
    <title>Lookbook — Others.</title>
  {/if}
</svelte:head>

{#if loading || !data}
  <Loader />
{:else if !lb}
  <div class="flex min-h-screen items-center justify-center flex-col gap-4">
    <p class="text-muted-foreground">Lookbook not found.</p>
    <a href="/lookbook" class="text-label border-b border-current">← Back to Lookbook</a>
  </div>
{:else}
  <div class="min-h-screen flex flex-col">
    <Navbar siteName={data.site.name} logo={data.site.logo} logoHeight={data.site.navLogoSize} />

    <div class="flex-1 w-full pt-24 md:pt-28 pb-16 md:pb-20 px-3 sm:px-6 md:px-10 max-w-7xl mx-auto">
      <!-- Header -->
      <nav class="mb-5 md:mb-6 px-1 sm:px-0 text-xs text-muted-foreground flex flex-wrap items-center gap-x-2">
        <a href="/" onclick={(e) => { e.preventDefault(); window.__navigate('/'); }} class="hover:text-foreground transition-colors">Home</a>
        <span>/</span>
        <a href="/lookbook" onclick={(e) => { e.preventDefault(); window.__navigate('/lookbook'); }} class="hover:text-foreground transition-colors">Lookbook</a>
        <span>/</span>
        <span class="text-foreground">{lb.title}</span>
      </nav>

      <div class="mb-8 md:mb-12 px-1 sm:px-0">
        <p class="text-label text-muted-foreground mb-2">{lb.date}</p>
        <h1 use:cutReveal class="text-4xl md:text-5xl font-display font-bold mb-4">{lb.title}</h1>
        {#if lb.description}
          <p class="text-muted-foreground max-w-xl">{lb.description}</p>
        {/if}
      </div>

      <!-- Shape-aware flow: every item keeps its own proportions (no cropping) and items pack into rows of equal height, so
           vertical (9:16, 4:5) and wide (16:9, 3:2) media sit together. A phone gets one wide item per row, or two vertical ones side by side. -->
      <div class="flex flex-wrap items-start justify-center gap-2 sm:gap-4 md:gap-6 [--row:280px] [--cap:640px] sm:[--row:320px] md:[--row:380px] md:[--cap:760px]">
        {#each shaped as { item, kind, ratio }, i (item.url + i)}
          <figure class="m-0 min-w-0" style="flex: {Math.round(ratio * 1000)} 1 calc(var(--row) * {ratio.toFixed(4)}); max-width: calc(var(--cap) * {ratio.toFixed(4)});">
            <div class="relative w-full overflow-hidden bg-secondary" style="aspect-ratio: {ratio.toFixed(4)};">
              {#if kind === 'embed'}
                <div class="absolute inset-0"><Embed url={item.url} title={item.caption || 'Video'} fill /></div>
              {:else if kind === 'video'}
                <Video src={item.url} mode="player" label={item.caption} class="absolute inset-0 h-full w-full object-cover" />
              {:else}
                <button aria-label="View full image" onclick={() => openImage(item)} class="group absolute inset-0 block">
                  <Img src={item.url} alt={item.caption || lb.title} sizes="(max-width: 640px) {ratio < 0.7 ? '50vw' : '100vw'}, (max-width: 1024px) 50vw, 33vw" class="h-full w-full object-cover object-center transition-transform duration-700 group-hover:scale-[1.02]" />
                </button>
              {/if}
            </div>
            {#if item.caption}
              <figcaption class="mt-2 px-1 text-xs italic text-muted-foreground">{item.caption}</figcaption>
            {/if}
          </figure>
        {/each}
        <!-- keeps the last row from stretching across the page on larger screens -->
        <div class="hidden h-0 grow-[100000] basis-0 md:block" aria-hidden="true"></div>
      </div>

      {#if items.length === 0}
        <div class="text-center py-24 text-muted-foreground">No media in this lookbook yet.</div>
      {/if}

      <div class="mt-14 pt-8 border-t border-border">
        <a href="/lookbook" onclick={(e) => { e.preventDefault(); window.__navigate('/lookbook'); }} class="text-label hover:opacity-60 transition-opacity">← All Lookbooks</a>
      </div>
    </div>

    <Footer {data} />
  </div>
{/if}

<svelte:window onkeydown={onKey} />

<!-- Lightbox -->
{#if expanded}
  {@const cur = expanded.items[expanded.index]}
  <div class="fixed inset-0 z-50 bg-foreground/95 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Image lightbox">
    <button aria-label="Close" onclick={() => (expanded = null)} class="absolute top-4 right-4 z-10 text-primary-foreground/70 hover:text-primary-foreground">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
    </button>
    <Img src={cur.url} alt={cur.caption || ''} sizes="100vw" priority class="max-h-[90vh] max-w-full object-contain" />
    {#if expanded.items.length > 1}
      <button aria-label="Previous" onclick={() => step(-1)} class="absolute left-4 text-primary-foreground/70 hover:text-primary-foreground">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m15 18-6-6 6-6"/></svg>
      </button>
      <button aria-label="Next" onclick={() => step(1)} class="absolute right-12 text-primary-foreground/70 hover:text-primary-foreground">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m9 18 6-6-6-6"/></svg>
      </button>
    {/if}
  </div>
{/if}
