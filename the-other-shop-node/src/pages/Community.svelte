<script>
  import { onMount } from 'svelte';
  import { loadStoreData } from '../lib/storeData.js';
  import Navbar from '../components/Navbar.svelte';
  import Footer from '../components/Footer.svelte';

  let data = null;
  let loading = true;
  let activeCategory = 'all';

  onMount(async () => {
    try {
      data = await loadStoreData();
      } finally { loading = false; }
  });

  $: posts = data ? (activeCategory === 'all' ? data.community : data.community.filter(p => p.category === activeCategory)) : [];
  $: categories = data ? [...new Set(data.community.map(p => p.category))] : [];

  function goArticle(slug) {
    if (window.__navigate) window.__navigate('/community/' + slug);
  }
</script>

<svelte:head>
  <title>{data ? `Community — ${data.site.name}` : 'Community'}</title>
  <meta name="description" content="Stories, news, and culture from the Others. community. Collections, collaborations and announcements." />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="Community — Others." />
  <meta property="og:description" content="Stories, news, and culture from the Others. community." />
</svelte:head>

{#if loading || !data}
  <div class="flex min-h-screen items-center justify-center bg-background">
    <div class="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin"></div>
  </div>
{:else}
  <div class="min-h-screen">
    <Navbar siteName={data.site.name} logo={data.site.logo} />

    <div class="pt-28 pb-20 px-6 md:px-10 max-w-7xl mx-auto">
      <div class="mb-10">
        <p class="text-label mb-2">Journal</p>
        <h1 class="text-4xl md:text-5xl font-display font-bold">Community</h1>
      </div>

      <!-- Category filter -->
      {#if categories.length > 1}
        <div class="flex flex-wrap gap-2 mb-10 border-b border-border pb-6">
          <button onclick={() => (activeCategory = 'all')} class="px-4 py-2 text-label tracking-[0.15em] transition-colors {activeCategory === 'all' ? 'bg-foreground text-primary-foreground' : 'border border-border hover:bg-muted'}">ALL</button>
          {#each categories as cat}
            <button onclick={() => (activeCategory = cat)} class="px-4 py-2 text-label tracking-[0.15em] transition-colors {activeCategory === cat ? 'bg-foreground text-primary-foreground' : 'border border-border hover:bg-muted'}">{cat.toUpperCase()}</button>
          {/each}
        </div>
      {/if}

      <!-- Posts grid -->
      {#if posts.length}
        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {#each posts as post}
            <a href={`/community/${post.slug}`} onclick={(e) => { e.preventDefault(); goArticle(post.slug); }} class="group block cursor-pointer">
              <div class="aspect-[16/9] bg-secondary overflow-hidden mb-4">
                {#if post.image}
                  <img src={post.image} alt={post.title} class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                {:else}
                  <div class="w-full h-full flex items-center justify-center text-xs text-muted-foreground">{post.category}</div>
                {/if}
              </div>
              <div>
                <span class="text-label text-xs text-muted-foreground">{post.category} · {post.date}</span>
                <h2 class="text-lg font-display font-bold mt-1 mb-2 group-hover:underline underline-offset-2 transition-all">{post.title}</h2>
                <p class="text-sm text-muted-foreground line-clamp-2">{post.excerpt}</p>
              </div>
            </a>
          {/each}
        </div>
      {:else}
        <div class="text-center py-24 text-muted-foreground">No posts yet.</div>
      {/if}
    </div>

    <Footer site={data.site} />
  </div>
{/if}
