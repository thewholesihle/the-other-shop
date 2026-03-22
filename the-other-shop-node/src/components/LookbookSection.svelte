<script>
  import { onMount } from 'svelte';
  import { getSrcset, getOptimizedUrl } from '../lib/cloudinary.js';

  export let lookbook = null; // single lookbook object from parent
  export let allLookbooks = [];

  let visible = false;
  let ref;

  onMount(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) visible = true;
    }, { threshold: 0.15 });
    if (ref) observer.observe(ref);
    return () => observer.disconnect();
  });

  function goTo(path, e) {
    e?.preventDefault();
    if (window.__navigate) window.__navigate(path);
  }

  $: lb = lookbook || allLookbooks[0] || null;
  $: images = lb ? (lb.images?.length ? lb.images : [lb.cover].filter(Boolean)) : [];
  
  // Showcase up to 4 images
  $: showcase = images.slice(0, 4);
  $: lbPath = lb ? `/lookbook/${lb.id}` : '/lookbook';

  function getGridClass(total, index) {
    let base = "relative overflow-hidden group w-full h-full ";
    
    if (total === 1) {
      return base + "col-span-2 md:col-span-4 md:row-span-2 aspect-[4/5] md:aspect-auto";
    }
    if (total === 2) {
      return base + "col-span-2 md:col-span-2 md:row-span-2 aspect-square md:aspect-auto";
    }
    if (total === 3) {
      if (index === 0) return base + "col-span-2 md:row-span-2 aspect-[4/5] md:aspect-auto";
      return base + "col-span-2 md:row-span-1 aspect-square md:aspect-auto";
    }
    if (total === 4) {
      if (index === 0) return base + "col-span-2 md:row-span-2 aspect-[4/5] md:aspect-auto";
      if (index === 1) return base + "col-span-2 md:row-span-1 aspect-video md:aspect-auto";
      return base + "col-span-1 md:row-span-1 aspect-square md:aspect-auto";
    }
    return base;
  }
</script>

<section bind:this={ref} class="px-6 md:px-10 pb-20 md:pb-32">
  <div class="mb-12 {visible ? 'opacity-0 animate-fade-up' : 'opacity-0'}">
    <p class="text-label mb-2">Editorial</p>
    <h2 class="text-3xl md:text-4xl font-display font-bold leading-tight">
      {lb ? lb.title : 'Lookbook'}
    </h2>
  </div>

  {#if lb && showcase.length > 0}
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 md:auto-rows-[300px] lg:auto-rows-[360px]">
      {#each showcase as img, i}
        <a
          href={lbPath}
          onclick={(e) => goTo(lbPath, e)}
          class="{getGridClass(showcase.length, i)} {visible ? 'opacity-0 animate-fade-up' : 'opacity-0'}"
          style="animation-delay:{0.1 + i * 0.15}s"
        >
          <img src={getOptimizedUrl(img, 800)} srcset={getSrcset(img)} sizes="(max-width: 768px) 50vw, 25vw" alt={lb.title} class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" />
          <div class="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors duration-500"></div>
          <div class="absolute bottom-0 left-0 right-0 p-6 flex flex-col justify-end bg-gradient-to-t from-black/60 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <span class="text-label text-white tracking-widest">{i === 0 ? 'VIEW LOOKBOOK' : 'EXPLORE'}</span>
          </div>
        </a>
      {/each}
    </div>
  {:else}
    <!-- Fallback asymmetrical placeholder grid -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 md:auto-rows-[300px] lg:auto-rows-[360px]">
      {#each [1, 2, 3] as item, i}
        <a href="/lookbook" onclick={(e) => goTo('/lookbook', e)}
          class="{getGridClass(3, i)} {visible ? 'opacity-0 animate-fade-up' : 'opacity-0'} bg-secondary"
          style="animation-delay:{0.1 + i * 0.15}s">
          <div class="absolute bottom-0 left-0 right-0 p-6 flex flex-col justify-end bg-gradient-to-t from-black/60 to-transparent">
            <span class="text-label text-white">{i === 0 ? 'VIEW LOOKBOOK' : 'EXPLORE'}</span>
          </div>
        </a>
      {/each}
    </div>
  {/if}

  <!-- Full lookbook CTA -->
  <div class="text-center mt-10 {visible ? 'opacity-0 animate-fade-up' : 'opacity-0'}" style="animation-delay:0.35s">
    <a href="/lookbook" onclick={(e) => goTo('/lookbook', e)} class="inline-block border border-foreground px-10 py-4 text-label tracking-[0.25em] hover:bg-foreground hover:text-primary-foreground transition-all duration-300 active:scale-[0.97]">
      EXPLORE FULL LOOKBOOK
    </a>
  </div>
</section>
