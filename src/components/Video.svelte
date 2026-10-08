<script>
  import { onMount } from 'svelte';
  import { getVideoUrl, getVideoPoster, getOptimizedUrl } from '../lib/cloudinary.js';
  import Img from './Img.svelte';

  // mode="background": silent looping hero video. It only plays when it's on screen, and is
  //   replaced by its poster for visitors who asked for reduced motion or are on Data Saver /
  //   a 2G connection.
  // mode="player": a normal controlled video that downloads nothing until it's played.
  let { src = '', poster = '', mode = 'background', class: className = '', label = '' } = $props();

  let el = $state(null);
  let still = $state(false);
  // A freshly uploaded video is optimised in the background; until a size is ready the CDN may refuse it. Rather than
  // showing a dead player, fall back to the original file for that viewer.
  let useOriginal = $state(false);

  // Pick a rendition that matches the screen instead of always shipping the largest.
  const width = typeof window !== 'undefined' && window.innerWidth > 1280 ? 1920 : 1280;
  let videoSrc = $derived(useOriginal ? src : getVideoUrl(src, width));
  let posterSrc = $derived(poster ? getOptimizedUrl(poster, width) : getVideoPoster(src, width));

  onMount(() => {
    if (mode !== 'background') return;
    const conn = navigator.connection;
    const saveData = conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType || '');
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (saveData || reduce) { still = true; return; }

    // Pause off-screen loops so they don't burn CPU, battery and bandwidth.
    const io = new IntersectionObserver(([entry]) => {
      if (!el) return;
      if (entry.isIntersecting) el.play().catch(() => {});
      else el.pause();
    }, { threshold: 0.1 });
    if (el) io.observe(el);
    return () => io.disconnect();
  });
</script>

{#if mode === 'background'}
  {#if still}
    <Img src={posterSrc} alt="" priority class={className} aria-hidden="true" />
  {:else}
    <video
      bind:this={el}
      src={videoSrc}
      poster={posterSrc || undefined}
      class={className}
      onerror={() => (useOriginal = true)}
      autoplay muted loop playsinline
      preload="auto"
      aria-hidden="true"
    >
      <track kind="captions" />
    </video>
  {/if}
{:else}
  <video src={videoSrc} poster={posterSrc || undefined} controls playsinline preload="none" class={className} aria-label={label || undefined} onerror={() => (useOriginal = true)}>
    <track kind="captions" />
  </video>
{/if}
