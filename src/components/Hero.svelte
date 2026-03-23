<script>
  export let hero = { label: '', heading: '', subheading: '', cta: '', ctaLink: '/shop', image: '', video: '' };

  $: words = hero.heading ? hero.heading.split(' ') : [];
  $: isVideo = hero.video && (hero.video.endsWith('.mp4') || hero.video.endsWith('.webm') || hero.video.endsWith('.gif'));

  function nav(e) {
    const href = hero.ctaLink || '/shop';
    if (href.startsWith('/') && window.__navigate) {
      e.preventDefault();
      window.__navigate(href);
    }
  }
</script>

<section class="relative h-screen w-full overflow-hidden">
  <!-- Background: video/gif takes precedence over image -->
  {#if isVideo && hero.video.endsWith('.gif')}
    <img src={hero.video} alt="" class="absolute inset-0 w-full h-full object-cover" aria-hidden="true" loading="eager" />
  {:else if isVideo}
    <video
      src={hero.video}
      class="absolute inset-0 w-full h-full object-cover"
      autoplay muted loop playsinline
      aria-hidden="true"
    >
      <track kind="captions" />
    </video>
  {:else if hero.image}
    <img src={hero.image} alt="Others. collection editorial" class="absolute inset-0 w-full h-full object-cover" loading="eager" />
  {/if}

  <!-- Dark overlay for legibility -->
  <div class="absolute inset-0 bg-black/20"></div>

  <div class="absolute inset-0 flex items-end">
    <div class="px-6 md:px-10 pb-16 md:pb-20 max-w-lg">
      {#if hero.label}
        <p class="text-label mb-3 opacity-0 animate-fade-up" style="animation-delay:0.3s;color:hsl(40,20%,97%)">
          {hero.label}
        </p>
      {/if}
      <h1 class="text-5xl md:text-7xl font-display font-bold leading-[0.9] mb-4 opacity-0 animate-fade-up" style="animation-delay:0.5s;color:hsl(40,20%,97%)">
        {#each words as word}
          {word}<br />
        {/each}
      </h1>
      {#if hero.subheading}
        <p class="text-sm md:text-base mb-6 opacity-0 animate-fade-up" style="animation-delay:0.6s;color:hsl(40,20%,97%);opacity:0.85">
          {hero.subheading}
        </p>
      {/if}
      {#if hero.cta}
        <a
          href={hero.ctaLink || '/shop'}
          onclick={nav}
          class="inline-block border border-[hsl(40,20%,97%)] px-8 py-3 text-label tracking-[0.25em] hover:bg-[hsl(40,20%,97%)] hover:text-foreground transition-all duration-300 opacity-0 animate-fade-up active:scale-[0.97]"
          style="animation-delay:0.7s;color:hsl(40,20%,97%)"
        >
          {hero.cta}
        </a>
      {/if}
    </div>
  </div>
</section>
