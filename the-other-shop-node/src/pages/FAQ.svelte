<script>
  import { onMount } from 'svelte';
  import { loadStoreData } from '../lib/storeData.js';
  import Navbar from '../components/Navbar.svelte';
  import Footer from '../components/Footer.svelte';

  let data = null;
  let loading = true;
  let open = null;
  onMount(async () => {
    try {
      data = await loadStoreData();
      } finally { loading = false; }
  });
</script>

<svelte:head>
  <title>{data ? `FAQ — ${data.site.name}` : 'FAQ'}</title>
  <meta name="description" content="Frequently asked questions about Others. products, shipping, returns and more." />
</svelte:head>

{#if loading || !data}
  <div class="flex min-h-screen items-center justify-center bg-background"><div class="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin"></div></div>
{:else}
  <div class="min-h-screen">
    <Navbar siteName={data.site.name} logo={data.site.logo} />
    <div class="pt-28 pb-20 px-6 md:px-10 max-w-3xl mx-auto">
      <h1 class="text-3xl md:text-4xl font-display font-bold mb-10">Frequently Asked Questions</h1>
      <div class="space-y-0 divide-y divide-border">
        {#each data.faq as item}
          <div>
            <button
              onclick={() => (open = open === item.id ? null : item.id)}
              class="w-full flex items-center justify-between py-5 text-left font-medium hover:text-foreground transition-colors">
              <span>{item.question}</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="flex-shrink-0 transition-transform duration-200 {open === item.id ? 'rotate-180' : ''}"><path d="m6 9 6 6 6-6"/></svg>
            </button>
            {#if open === item.id}
              <p class="pb-5 text-sm text-muted-foreground leading-relaxed animate-fade-in">{item.answer}</p>
            {/if}
          </div>
        {/each}
        {#if !data.faq.length}
          <p class="py-8 text-muted-foreground text-sm">No FAQs yet.</p>
        {/if}
      </div>
    </div>
    <Footer site={data.site} />
  </div>
{/if}
