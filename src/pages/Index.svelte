<script>
  import { onMount } from 'svelte';
  import Navbar from '../components/Navbar.svelte';
  import AnnouncementBar from '../components/AnnouncementBar.svelte';
  import Hero from '../components/Hero.svelte';
  import ProductGrid from '../components/ProductGrid.svelte';
  import LookbookSection from '../components/LookbookSection.svelte';
  import ArticleSection from '../components/ArticleSection.svelte';
  import Footer from '../components/Footer.svelte';
  import Loader from '../components/Loader.svelte';
  import { loadStoreData } from '../lib/storeData.js';

  let data = null;
  let loading = true;

  onMount(async () => {
    try { data = await loadStoreData(); }
    catch (e) { console.error(e); }
    finally { loading = false; }
  });

  $: featuredId = data?.site?.featuredLookbook;
  $: editorialType = data?.site?.featuredEditorialType || 'lookbook';
  
  $: allLookbooks = data?.lookbooks ?? [];
  $: allArticles = data?.community ?? [];
  
  $: featuredLookbook = editorialType === 'lookbook' 
    ? (featuredId ? allLookbooks.find(lb => lb.id === featuredId) || allLookbooks[0] || null : allLookbooks[0] || null)
    : null;
    
  $: featuredArticle = editorialType === 'article'
    ? (featuredId ? allArticles.find(a => a.id === featuredId) || allArticles.find(a => a.published) || null : allArticles.find(a => a.published) || null)
    : null;
</script>

<svelte:head>
  <title>{data ? (data.site.metaTitle || data.site.name) : 'Others.'}</title>
  <meta name="description" content={data ? (data.site.metaDescription || data.site.description || 'Streetwear rooted in culture, built for everyone else.') : 'Streetwear rooted in culture, built for everyone else.'} />
  {#if data}
    <meta property="og:type" content="website" />
    <meta property="og:title" content={data.site.metaTitle || data.site.name} />
    <meta property="og:description" content={data.site.metaDescription || data.site.description || 'Streetwear rooted in culture, built for everyone else.'} />
    {#if data.site.ogImage || data.site.logo}<meta property="og:image" content={data.site.ogImage || data.site.logo} />{/if}
  {/if}
</svelte:head>

{#if loading || !data}
  <Loader />
{:else}
  <div class="min-h-screen">
    <Navbar siteName={data.site.name} logo={data.site.logo} logoHeight={data.site.navLogoSize} />
    <Hero hero={data.site.hero} />
    <AnnouncementBar text={data.site.announcement} />
    <ProductGrid products={data.products} currency={data.site.currency} />
    
    {#if editorialType === 'article'}
      <ArticleSection article={featuredArticle} {allArticles} heading={data.site.featuredEditorialHeading} message={data.site.featuredEditorialMessage} cta={data.site.featuredEditorialCta} />
    {:else}
      <LookbookSection lookbook={featuredLookbook} {allLookbooks} />
    {/if}

    <Footer {data} />
  </div>
{/if}