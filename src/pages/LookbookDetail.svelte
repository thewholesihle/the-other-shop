<script>
  import { onMount } from 'svelte';
  import { loadStoreData } from '../lib/storeData.js';
  import Navbar from '../components/Navbar.svelte';
  import Footer from '../components/Footer.svelte';
  import Loader from '../components/Loader.svelte';
  import { getSrcset, getOptimizedUrl } from '../lib/cloudinary.js';

  export let lookbookId = '';

  let data = null;
  let lb = null;
  let loading = true;
  let expanded = null;

  onMount(async () => {
    try {
      data = await loadStoreData();
      const lookbooks = data.lookbooks || [];
      lb = lookbooks.find(l => l.id === lookbookId) ?? null;
    } finally { loading = false; }
  });

  $: items = lb?.items ?? lb?.images?.map(url => ({ type: 'image', url, caption: '' })) ?? [];

  function isVideo(item) {
    return item.type === 'video' || (item.url && /\.(mp4|webm)$/.test(item.url.toLowerCase()));
  }
  function isEmbed(item) {
    return item.type === 'embed' || (item.url && (item.url.includes('youtube') || item.url.includes('vimeo')));
  }
</script>

<svelte:head>
  {#if lb}
    <title>{lb.title} — {data?.site?.name ?? 'Others.'} Lookbook</title>
    <meta name="description" content={lb.description} />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="{lb.title} Lookbook" />
    <meta property="og:description" content={lb.description} />
    {#if lb.coverImage || lb.images?.[0]}<meta property="og:image" content={lb.coverImage ?? lb.images[0]} />{/if}
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
  <div class="min-h-screen">
    <Navbar siteName={data.site.name} logo={data.site.logo} logoHeight={data.site.navLogoSize} />

    <div class="pt-28 pb-20 px-6 md:px-10 max-w-7xl mx-auto">
      <!-- Header -->
      <nav class="mb-6 text-xs text-muted-foreground flex items-center gap-2">
        <a href="/" onclick={(e) => { e.preventDefault(); window.__navigate('/'); }} class="hover:text-foreground transition-colors">Home</a>
        <span>/</span>
        <a href="/lookbook" onclick={(e) => { e.preventDefault(); window.__navigate('/lookbook'); }} class="hover:text-foreground transition-colors">Lookbook</a>
        <span>/</span>
        <span class="text-foreground">{lb.title}</span>
      </nav>

      <div class="mb-12">
        <p class="text-label text-muted-foreground mb-2">{lb.date}</p>
        <h1 class="text-4xl md:text-5xl font-display font-bold mb-4">{lb.title}</h1>
        {#if lb.description}
          <p class="text-muted-foreground max-w-xl">{lb.description}</p>
        {/if}
      </div>

      <!-- Clean, responsive 3-column max grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {#each items as item, i}
          <div class="flex flex-col">
            {#if isEmbed(item)}
              <div class="relative w-full aspect-video bg-black">
                <iframe src={item.url} class="absolute inset-0 w-full h-full" frameborder="0" allowfullscreen title={item.caption || 'Video'}></iframe>
              </div>
            {:else if isVideo(item)}
              <video src={item.url} controls class="w-full aspect-[4/5] object-cover bg-secondary" preload="metadata">
                <track kind="captions" />
              </video>
            {:else}
              <button
                aria-label="View full image"
                onclick={() => (expanded = { items, index: i })}
                class="group w-full aspect-[4/5] overflow-hidden bg-secondary block"
              >
                <!-- w-full h-full object-cover ensures the image perfectly crops the aspect ratio without stretching the actual pixels -->
                <img src={getOptimizedUrl(item.url, 1200)} srcset={getSrcset(item.url)} sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" alt={item.caption || lb.title} class="w-full h-full object-cover object-center group-hover:scale-[1.02] transition-transform duration-700" loading="lazy" />
              </button>
            {/if}
            {#if item.caption}
              <p class="text-xs text-muted-foreground mt-2 italic px-1">{item.caption}</p>
            {/if}
          </div>
        {/each}
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

<!-- Lightbox -->
{#if expanded}
  {@const cur = expanded.items[expanded.index]}
  <div class="fixed inset-0 z-50 bg-foreground/95 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Image lightbox">
    <button aria-label="Close" onclick={() => (expanded = null)} class="absolute top-4 right-4 z-10 text-primary-foreground/70 hover:text-primary-foreground">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
    </button>
    <img src={getOptimizedUrl(cur.url, 2000)} srcset={getSrcset(cur.url)} sizes="100vw" alt={cur.caption || ''} class="max-h-[90vh] max-w-full object-contain" />
    {#if expanded.items.length > 1}
      <button aria-label="Previous" onclick={() => (expanded = { ...expanded, index: (expanded.index - 1 + expanded.items.length) % expanded.items.length })} class="absolute left-4 text-primary-foreground/70 hover:text-primary-foreground">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m15 18-6-6 6-6"/></svg>
      </button>
      <button aria-label="Next" onclick={() => (expanded = { ...expanded, index: (expanded.index + 1) % expanded.items.length })} class="absolute right-12 text-primary-foreground/70 hover:text-primary-foreground">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m9 18 6-6-6-6"/></svg>
      </button>
    {/if}
  </div>
{/if}
