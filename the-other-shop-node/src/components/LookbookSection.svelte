<script>
  import { onMount } from 'svelte';

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
  $: images = lb ? (lb.images || [lb.cover].filter(Boolean)) : [];
  $: primary   = images[0] || '';
  $: secondary = images[1] || images[0] || '';
  $: lbPath    = lb ? `/lookbook/${lb.id}` : '/lookbook';
</script>

<section bind:this={ref} class="px-6 md:px-10 pb-20 md:pb-32">
  <div class="mb-12 {visible ? 'opacity-0 animate-fade-up' : 'opacity-0'}">
    <p class="text-label mb-2">Editorial</p>
    <h2 class="text-3xl md:text-4xl font-display font-bold leading-tight">
      {lb ? lb.title : 'Lookbook'}
    </h2>
  </div>

  {#if lb && (primary || secondary)}
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
      <!-- Primary image -->
      <a
        href={lbPath}
        onclick={(e) => goTo(lbPath, e)}
        class="relative aspect-square md:aspect-[3/4] overflow-hidden group {visible ? 'opacity-0 animate-fade-up' : 'opacity-0'}"
        style="animation-delay:0.15s"
      >
        <img src={primary} alt={lb.title} class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" />
        <div class="absolute bottom-0 left-0 right-0 p-6 flex flex-col justify-end bg-gradient-to-t from-black/60 to-transparent">
          <span class="text-label text-white group-hover:underline underline-offset-4">VIEW LOOKBOOK</span>
        </div>
      </a>

      <!-- Secondary image (or same if only one) -->
      <a
        href={lbPath}
        onclick={(e) => goTo(lbPath, e)}
        class="relative aspect-square md:aspect-[3/4] overflow-hidden group {visible ? 'opacity-0 animate-fade-up' : 'opacity-0'}"
        style="animation-delay:0.25s"
      >
        <img src={secondary} alt="{lb.title} — behind the scenes" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" />
        <div class="absolute bottom-0 left-0 right-0 p-6 flex flex-col justify-end bg-gradient-to-t from-black/60 to-transparent">
          <span class="text-label text-white group-hover:underline underline-offset-4">EXPLORE</span>
        </div>
      </a>
    </div>
  {:else}
    <!-- Fallback placeholder grid when no lookbook data is available yet -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
      {#each ['/images/lookbook-1.jpg', '/images/lookbook-2.jpg'] as src, i}
        <a href="/lookbook" onclick={(e) => goTo('/lookbook', e)}
          class="relative aspect-square md:aspect-[3/4] overflow-hidden group {visible ? 'opacity-0 animate-fade-up' : 'opacity-0'}"
          style="animation-delay:{0.15 + i * 0.1}s">
          <img {src} alt="Lookbook" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" />
          <div class="absolute bottom-0 left-0 right-0 p-6 flex flex-col justify-end bg-gradient-to-t from-black/60 to-transparent">
            <span class="text-label text-white group-hover:underline underline-offset-4">{i === 0 ? 'VIEW LOOKBOOK' : 'EXPLORE'}</span>
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
