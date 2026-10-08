<script>
  import { youtubeId } from '../lib/cloudinary.js';

  // YouTube/Vimeo players are heavy (hundreds of KB of JS each, before anything plays). YouTube
  // embeds are shown as a lightweight thumbnail and only load the real player on click;
  // anything else loads lazily when scrolled near.
  let { url = '', title = 'Video', fill = false } = $props();   // fill: sized by its parent instead of forcing 16:9

  let active = $state(false);
  let id = $derived(youtubeId(url));
</script>

<div class="relative w-full bg-black {fill ? 'h-full' : 'aspect-video'}">
  {#if id && !active}
    <button type="button" class="group absolute inset-0 flex items-center justify-center" onclick={() => (active = true)} aria-label="Play video: {title}">
      <img src="https://i.ytimg.com/vi/{id}/hqdefault.jpg" alt="" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100" />
      <span class="relative flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-black shadow-lg transition-transform group-hover:scale-110">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
      </span>
    </button>
  {:else if id}
    <iframe src="https://www.youtube-nocookie.com/embed/{id}?autoplay=1&rel=0" class="absolute inset-0 h-full w-full" frameborder="0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen {title}></iframe>
  {:else}
    <iframe src={url} class="absolute inset-0 h-full w-full" frameborder="0" loading="lazy" allowfullscreen {title}></iframe>
  {/if}
</div>
