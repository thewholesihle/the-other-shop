<script>
  import { onMount } from 'svelte';
  import { loadStoreData } from '../lib/storeData.js';
  import Navbar from '../components/Navbar.svelte';
  import Footer from '../components/Footer.svelte';

  let data = null;
  let loading = true;
  onMount(async () => {
    try {
      const base = await (await fetch('/data/store.json')).json();
      const ov = (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; } })();
      data = {
        site:    ov?.site ?? base.site,
        contact: ov?.pages?.contact ?? base.pages?.contact ?? { address: '', details: [] },
      };
    } finally { loading = false; }
  });
</script>

<svelte:head>
  <title>{data ? `Contact — ${data.site.name}` : 'Contact'}</title>
  <meta name="description" content="Get in touch with the Others. team. Enquiries, returns, press and collaborations." />
</svelte:head>

{#if loading || !data}
  <div class="flex min-h-screen items-center justify-center bg-background"><div class="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin"></div></div>
{:else}
  <div class="min-h-screen">
    <Navbar siteName={data.site.name} logo={data.site.logo} />
    <div class="pt-28 pb-20 px-6 md:px-10 max-w-4xl mx-auto">
      <h1 class="text-3xl md:text-4xl font-display font-bold mb-10">Contact</h1>

      <div class="grid md:grid-cols-2 gap-12">
        <!-- Contact details -->
        <div class="space-y-6">
          {#each data.contact.details as detail}
            <div>
              <p class="text-label mb-1">{detail.label.toUpperCase()}</p>
              <a href={detail.value.includes('@') ? `mailto:${detail.value}` : `tel:${detail.value}`}
                class="text-sm hover:underline underline-offset-2 transition-all">{detail.value}</a>
            </div>
          {/each}
        </div>

        <!-- Address -->
        {#if data.contact.address}
          <div>
            <p class="text-label mb-1">FIND US</p>
            <address class="text-sm not-italic text-muted-foreground leading-relaxed">{data.contact.address}</address>
          </div>
        {/if}
      </div>
    </div>
    <Footer site={data.site} />
  </div>
{/if}
