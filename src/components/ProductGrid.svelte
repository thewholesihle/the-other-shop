<script>
  import { cutReveal } from '../lib/cutReveal.js';
  import { onMount } from 'svelte';
  import ProductCard from './ProductCard.svelte';
  import { pickDrops } from '../lib/homepage.js';

  export let products = [];
  export let currency = '€';
  // 'featured' → the home page's usual "New Drops" strip (products marked Featured, max 6).
  // 'arrivals' → used when the hero is switched off: this grid leads the page and shows the newest products (marked New).
  // Either way, when nothing qualifies the strip shows what is available instead of going empty (see lib/homepage.js).
  export let mode = 'featured';

  $: picked = pickDrops(products, mode);
  $: featured = picked.items;
  $: nothingNew = picked.source === 'available';
  $: viewAllHref = picked.source === 'new' ? '/shop?filter=new' : '/shop';

  let visible = false;
  let ref;

  onMount(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) visible = true;
    }, { threshold: 0.1 });
    if (ref) observer.observe(ref);
    return () => observer.disconnect();
  });

  function shopAll(e) {
    e.preventDefault();
    if (window.__navigate) window.__navigate(viewAllHref);
  }
</script>

{#if featured.length}
<section id="products" bind:this={ref} class="px-6 md:px-10 {mode === 'arrivals' ? 'pt-10 pb-16 md:pt-14 md:pb-24' : 'py-20 md:py-32'}">
  <div class="flex items-end justify-between mb-12">
    <div>
      <p class="text-label mb-2">{nothingNew ? 'In stock' : mode === 'arrivals' ? 'Just landed' : 'Latest'}</p>
      <h2 use:cutReveal class="text-3xl md:text-4xl font-display font-bold leading-tight md:leading-[1.1111]">{nothingNew ? 'Available Now' : mode === 'arrivals' ? 'New Arrivals' : 'New Drops'}</h2>
    </div>
    <a href={viewAllHref} onclick={shopAll} class="text-label hover:text-foreground transition-colors border-b border-current pb-0.5">VIEW ALL</a>
  </div>

  <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
    {#each featured as p, i}
      <div class={visible ? 'opacity-0 animate-fade-up' : 'opacity-0'} style="animation-delay:{i * 0.1}s">
        <ProductCard product={p} {currency} />
      </div>
    {/each}
  </div>

  <!-- Shop all CTA -->
  <div class="text-center mt-12">
    <a href={viewAllHref} onclick={shopAll} class="inline-block border border-foreground px-10 py-4 text-label tracking-[0.25em] hover:bg-foreground hover:text-primary-foreground transition-all duration-300 active:scale-[0.97]">
      SHOP ALL PRODUCTS
    </a>
  </div>
</section>
{/if}
