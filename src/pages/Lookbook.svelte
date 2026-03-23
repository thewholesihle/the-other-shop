<script>
  import { onMount } from 'svelte';
  import { loadStoreData } from '../lib/storeData.js';
  import Navbar from '../components/Navbar.svelte';
  import Footer from '../components/Footer.svelte';
  import { getSrcset, getOptimizedUrl } from '../lib/cloudinary.js';

  let data = null;
  let loading = true;

  onMount(async () => {
    try {
      data = await loadStoreData();
      } finally { loading = false; }
  });

  function goLookbook(id) {
    if (window.__navigate) window.__navigate(`/lookbook/${id}`);
  }
</script>

<svelte:head>
  <title>{data ? `Lookbook — ${data.site.metaTitle || data.site.name}` : 'Lookbook'}</title>
  <meta name="description" content={data?.site?.metaDescription || "Browse the Others. lookbook — editorial photography and campaign imagery from our latest collections."} />
</svelte:head>

{#if loading || !data}
  <div class="flex min-h-screen items-center justify-center bg-background">
    <div class="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin"></div>
  </div>
{:else}
  <div class="min-h-screen">
    <Navbar siteName={data.site.name} logo={data.site.logo} />

    <div class="pt-28 pb-20 px-6 md:px-10 max-w-7xl mx-auto">
      <div class="mb-12">
        <p class="text-label mb-2">Editorial</p>
        <h1 class="text-4xl md:text-5xl font-display font-bold">Lookbook</h1>
      </div>

      {#if data.lookbooks.length}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {#each data.lookbooks as lb}
            {@const cover = lb.coverImage ?? lb.items?.find(i => i.type !== 'video')?.url ?? lb.images?.[0] ?? ''}
            {@const count = (lb.items ?? lb.images ?? []).length}
            <button
              onclick={() => goLookbook(lb.id)}
              class="group text-left"
              aria-label="Open {lb.title} lookbook"
            >
              <!-- Cover image -->
              <div class="aspect-[3/4] overflow-hidden bg-secondary mb-4 relative">
                {#if cover}
                  <img
                    src={getOptimizedUrl(cover, 800)}
                    srcset={getSrcset(cover)}
                    sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    alt={lb.title}
                    class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    loading="lazy"
                  />
                {:else}
                  <div class="w-full h-full flex items-center justify-center text-muted-foreground text-sm">No cover</div>
                {/if}
                <!-- Count badge -->
                {#if count > 0}
                  <span class="absolute bottom-3 right-3 bg-background/90 backdrop-blur-sm text-foreground text-[10px] tracking-[0.15em] uppercase px-2 py-1">
                    {count} {count === 1 ? 'image' : 'images'}
                  </span>
                {/if}
              </div>

              <div>
                <h2 class="font-display font-bold text-lg group-hover:underline underline-offset-2 transition-all">{lb.title}</h2>
                <p class="text-xs text-muted-foreground mt-0.5">{lb.date}</p>
                {#if lb.description}
                  <p class="text-sm text-muted-foreground mt-1 line-clamp-2">{lb.description}</p>
                {/if}
              </div>
            </button>
          {/each}
        </div>
      {:else}
        <div class="text-center py-24 text-muted-foreground">No lookbooks yet.</div>
      {/if}
    </div>

    <Footer {data} />
  </div>
{/if}
