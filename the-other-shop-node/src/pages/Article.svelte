<script>
  import { onMount } from 'svelte';
  import { loadStoreData } from '../lib/storeData.js';
  import Navbar from '../components/Navbar.svelte';
  import Footer from '../components/Footer.svelte';

  export let slug = '';

  let data = null;
  let post = null;
  let loading = true;

  onMount(async () => {
    try {
      data = await loadStoreData();
      const community = ov?.community ?? base.community ?? [];
      post = community.find(p => p.slug === slug && p.published) ?? null;
    } finally { loading = false; }
  });
</script>

<svelte:head>
  {#if post}
    <title>{post.title} — {data?.site?.name ?? 'Others.'}</title>
    <meta name="description" content={post.excerpt} />
    <meta property="og:type" content="article" />
    <meta property="og:title" content={post.title} />
    <meta property="og:description" content={post.excerpt} />
    {#if post.image}<meta property="og:image" content={post.image} />{/if}
    <meta property="article:published_time" content={post.date} />
    <meta property="article:author" content={post.author} />
  {:else}
    <title>Article — Others.</title>
  {/if}
</svelte:head>

{#if loading}
  <div class="flex min-h-screen items-center justify-center bg-background">
    <div class="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin"></div>
  </div>
{:else if !post}
  <div class="flex min-h-screen items-center justify-center flex-col gap-4">
    <p class="text-muted-foreground">Article not found.</p>
    <a href="/community" class="text-label border-b border-current">← Back to Community</a>
  </div>
{:else}
  <div class="min-h-screen">
    <Navbar siteName={data.site.name} logo={data.site.logo} />

    <div class="pt-24 pb-20 px-6 md:px-10 max-w-3xl mx-auto">
      <!-- Breadcrumb -->
      <nav class="mb-8 text-xs text-muted-foreground flex items-center gap-2">
        <a href="/" class="hover:text-foreground transition-colors">Home</a>
        <span>/</span>
        <a href="/community" class="hover:text-foreground transition-colors">Community</a>
        <span>/</span>
        <span class="text-foreground truncate max-w-[200px]">{post.title}</span>
      </nav>

      {#if post.image}
        <div class="aspect-[16/7] bg-secondary overflow-hidden mb-8">
          <img src={post.image} alt={post.title} class="w-full h-full object-cover" />
        </div>
      {/if}

      <header class="mb-8">
        <span class="text-label text-xs text-muted-foreground">{post.category} · {post.date} · {post.author}</span>
        <h1 class="text-3xl md:text-4xl font-display font-bold leading-tight mt-2">{post.title}</h1>
        {#if post.excerpt}
          <p class="text-lg text-muted-foreground mt-3 leading-relaxed">{post.excerpt}</p>
        {/if}
      </header>

      <article class="prose prose-sm max-w-none text-foreground [&_h2]:font-display [&_h2]:font-bold [&_h2]:text-xl [&_h2]:mt-6 [&_h2]:mb-3 [&_p]:text-muted-foreground [&_p]:leading-relaxed [&_p]:mb-4">
        {@html post.content}
      </article>

      <div class="mt-12 pt-8 border-t border-border">
        <a href="/community" class="text-label hover:opacity-60 transition-opacity">← Back to Community</a>
      </div>
    </div>

    <Footer site={data.site} />
  </div>
{/if}
