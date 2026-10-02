<script>
  import Img from './Img.svelte';
  import Video from './Video.svelte';
  import { isGif } from '../lib/cloudinary.js';
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
  <!-- Background: video/gif takes precedence over image. All three are optimised: the hero
       image is the page's LCP element, so it loads eagerly at high priority; the video is
       transcoded to the best codec, paused off-screen and swapped for its poster on slow or
       reduced-motion connections. -->
  {#if isVideo && isGif(hero.video)}
    <Img src={hero.video} alt="" aria-hidden="true" priority sizes="100vw" class="absolute inset-0 w-full h-full object-cover" />
  {:else if isVideo}
    <Video src={hero.video} poster={hero.image} class="absolute inset-0 w-full h-full object-cover" />
  {:else if hero.image}
    <Img src={hero.image} alt="Others. collection editorial" priority sizes="100vw" class="absolute inset-0 w-full h-full object-cover" />
  {/if}

  <!-- Dark overlay for legibility -->
  <div class="absolute inset-0 bg-black/25"></div>
  <!-- Bottom-up scrim: the headline and CTA sit low, so that is where light text needs the most help on bright photos. -->
  <div class="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent"></div>

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
