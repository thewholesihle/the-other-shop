<script>
  import { onMount } from 'svelte';
  import Navbar from '../components/Navbar.svelte';
  import AnnouncementBar from '../components/AnnouncementBar.svelte';
  import Hero from '../components/Hero.svelte';
  import ProductGrid from '../components/ProductGrid.svelte';
  import LookbookSection from '../components/LookbookSection.svelte';
  import Footer from '../components/Footer.svelte';
  import { loadStoreData } from '../lib/storeData.js';

  let data = null;
  let loading = true;

  onMount(async () => {
    try { data = await loadStoreData(); }
    catch (e) { console.error(e); }
    finally { loading = false; }
  });

  $: featuredId = data?.site?.featuredLookbook;
  $: allLookbooks = data?.lookbooks ?? [];
  $: featuredLookbook = featuredId
    ? allLookbooks.find(lb => lb.id === featuredId) || allLookbooks[0] || null
    : allLookbooks[0] || null;
</script>

<svelte:head>
  <title>{data ? (data.site.metaTitle || data.site.name) : 'Others.'}</title>
  <meta name="description" content={data ? (data.site.metaDescription || data.site.description || 'Streetwear rooted in culture, built for everyone else.') : 'Streetwear rooted in culture, built for everyone else.'} />
</svelte:head>

{#if loading || !data}
  <div class="flex min-h-screen items-center justify-center bg-background">
    <div class="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin"></div>
  </div>
{:else}
  <div class="min-h-screen">
    <Navbar siteName={data.site.name} logo={data.site.logo} />
    <Hero hero={data.site.hero} />
    <AnnouncementBar text={data.site.announcement} />
    <ProductGrid products={data.products} currency={data.site.currency} />
    <LookbookSection lookbook={featuredLookbook} allLookbooks={allLookbooks} />
    <Footer site={data.site} />
  </div>
{/if}