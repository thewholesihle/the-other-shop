<script>
  import { onMount } from 'svelte';

  let visible = false;
  let ref;

  onMount(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) visible = true;
    }, { threshold: 0.15 });
    if (ref) observer.observe(ref);
    return () => observer.disconnect();
  });

  function goLookbook(e) {
    e.preventDefault();
    if (window.__navigate) window.__navigate('/lookbook');
  }
</script>

<section bind:this={ref} class="px-6 md:px-10 pb-20 md:pb-32">
  <div class="mb-12 {visible ? 'opacity-0 animate-fade-up' : 'opacity-0'}">
    <p class="text-label mb-2">Editorial</p>
    <h2 class="text-3xl md:text-4xl font-display font-bold leading-tight">SS26 Lookbook</h2>
  </div>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
    <a
      href="/lookbook"
      onclick={goLookbook}
      class="relative aspect-[3/4] overflow-hidden group {visible ? 'opacity-0 animate-fade-up' : 'opacity-0'}"
      style="animation-delay:0.15s"
    >
      <img src="/images/lookbook-1.jpg" alt="SS26 Lookbook" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" />
      <div class="absolute bottom-0 left-0 right-0 p-6">
        <span class="inline-block bg-background/90 backdrop-blur-sm px-4 py-2 text-label text-foreground">VIEW LOOKBOOK</span>
      </div>
    </a>
    <a
      href="/lookbook"
      onclick={goLookbook}
      class="relative aspect-[3/4] overflow-hidden group {visible ? 'opacity-0 animate-fade-up' : 'opacity-0'}"
      style="animation-delay:0.25s"
    >
      <img src="/images/lookbook-2.jpg" alt="SS26 Behind the Scenes" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" />
      <div class="absolute bottom-0 left-0 right-0 p-6">
        <span class="inline-block bg-background/90 backdrop-blur-sm px-4 py-2 text-label text-foreground">BEHIND THE SCENES</span>
      </div>
    </a>
  </div>
  <!-- Full lookbook CTA -->
  <div class="text-center mt-10 {visible ? 'opacity-0 animate-fade-up' : 'opacity-0'}" style="animation-delay:0.35s">
    <a href="/lookbook" onclick={goLookbook} class="inline-block border border-foreground px-10 py-4 text-label tracking-[0.25em] hover:bg-foreground hover:text-primary-foreground transition-all duration-300 active:scale-[0.97]">
      EXPLORE FULL LOOKBOOK
    </a>
  </div>
</section>
