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

  $: contact = data?.pages?.contact ?? { address: '', details: [] };
</script>

<svelte:head>
  <title>{data ? `Contact — ${data.site.name}` : 'Contact'}</title>
  <meta name="description" content="Get in touch with the Others. team. Enquiries, returns, press and collaborations." />
</svelte:head>

{#if loading || !data}
  <Loader />
{:else}
  <div class="min-h-screen flex flex-col">
    <Navbar siteName={data.site.name} logo={data.site.logo} logoHeight={data.site.navLogoSize} />
    <div class="flex-1 pt-28 pb-20 px-6 md:px-10 max-w-4xl mx-auto">
      <h1 class="text-3xl md:text-4xl font-display font-bold mb-10">Contact</h1>

      <div class="grid md:grid-cols-2 gap-12">
        <!-- Contact details -->
        <div class="space-y-6">
          {#each contact.details as detail}
            <div>
              <p class="text-label mb-1">{detail.label.toUpperCase()}</p>
              <a href={detail.value.includes('@') ? `mailto:${detail.value}` : `tel:${detail.value}`}
                class="text-sm hover:underline underline-offset-2 transition-all">{detail.value}</a>
            </div>
          {/each}
        </div>

        <!-- Address -->
        {#if contact.address}
          <div>
            <p class="text-label mb-1">FIND US</p>
            <address class="text-sm not-italic text-muted-foreground leading-relaxed">{contact.address}</address>
          </div>
        {/if}
      </div>
    </div>
    <Footer {data} />
  </div>
{/if}
