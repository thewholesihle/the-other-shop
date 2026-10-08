<script>
  import { cutReveal } from '../lib/cutReveal.js';
  import { onMount } from 'svelte';
  import ProductCard from './ProductCard.svelte';

  // The home page section that promotes one category (Settings → Homepage). Every piece of text can be customised there.
  export let category = null;     // { id, name }
  export let products = [];
  export let currency = '€';
  export let label = '';          // small line above the heading
  export let heading = '';
  export let message = '';
  export let cta = '';            // button text

  $: href = `/shop?category=${encodeURIComponent(category?.id || '')}`;
  $: title = heading.trim() || category?.name || '';
  $: buttonText = cta.trim() || `Shop ${category?.name || 'the collection'}`;

  let visible = false;
  let ref;
  onMount(() => {
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) visible = true; }, { threshold: 0.1 });
    if (ref) observer.observe(ref);
    return () => observer.disconnect();
  });

  function go(e) {
    e.preventDefault();
    if (window.__navigate) window.__navigate(href);
  }
</script>

{#if category && products.length}
  <section bind:this={ref} class="px-6 md:px-10 pb-20 md:pb-32" aria-labelledby="category-promo-heading">
    <div class="flex items-end justify-between gap-6 mb-12">
      <div class="max-w-xl">
        {#if label.trim()}<p class="text-label mb-2">{label.trim()}</p>{/if}
        <h2 id="category-promo-heading" use:cutReveal class="text-3xl md:text-4xl font-display font-bold leading-tight md:leading-[1.1111]">{title}</h2>
        {#if message.trim()}<p class="text-muted-foreground mt-3">{message.trim()}</p>{/if}
      </div>
      <a {href} onclick={go} class="shrink-0 text-label hover:text-foreground transition-colors border-b border-current pb-0.5">VIEW ALL</a>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
      {#each products as p, i (p.id)}
        <div class={visible ? 'opacity-0 animate-fade-up' : 'opacity-0'} style="animation-delay:{i * 0.1}s">
          <ProductCard product={p} {currency} />
        </div>
      {/each}
    </div>

    <div class="text-center mt-12">
      <a {href} onclick={go} class="inline-block border border-foreground px-10 py-4 text-label tracking-[0.25em] hover:bg-foreground hover:text-primary-foreground transition-all duration-300 active:scale-[0.97]">
        {buttonText.toUpperCase()}
      </a>
    </div>
  </section>
{/if}
