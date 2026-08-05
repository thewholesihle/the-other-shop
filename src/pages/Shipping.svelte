<script>
  import { onMount } from 'svelte';
  import { loadStoreData } from '../lib/storeData.js';
  import Navbar from '../components/Navbar.svelte';
  import Footer from '../components/Footer.svelte';
  import Loader from '../components/Loader.svelte';

  let data = null;
  let loading = true;
  onMount(async () => {
    try { data = await loadStoreData(); }
    finally { loading = false; }
  });
</script>

<svelte:head>
  <title>{data ? `Shipping & Returns — ${data.site.name}` : 'Shipping & Returns'}</title>
  <meta name="description" content="Others. shipping policy, return information and delivery times." />
</svelte:head>

{#if loading || !data}
  <Loader />
{:else}
  <div class="min-h-screen flex flex-col">
    <Navbar siteName={data.site.name} logo={data.site.logo} logoHeight={data.site.navLogoSize} />
    <div class="flex-1 pt-28 pb-20 px-6 md:px-10 max-w-3xl mx-auto">
      <h1 class="text-3xl md:text-4xl font-display font-bold mb-10">Shipping &amp; Returns</h1>
      <div class="prose prose-sm max-w-none text-foreground [&_h2]:font-display [&_h2]:font-bold [&_h2]:text-xl [&_h2]:mt-6 [&_h2]:mb-3 [&_p]:text-muted-foreground [&_p]:leading-relaxed [&_p]:mb-4">
        {@html data.pages?.shipping?.content ?? '<p>Shipping information coming soon.</p>'}
      </div>
    </div>
    <Footer {data} />
  </div>
{/if}
