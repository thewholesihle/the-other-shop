<script>
  import { getOptimizedUrl, getSrcset, DEFAULT_WIDTHS } from '../lib/cloudinary.js';

  // One image component for the whole storefront:
  //  • Cloudinary URLs become responsive (srcset/sizes) AVIF/WebP at auto quality
  //  • below-the-fold images are lazy + async-decoded; `priority` (LCP/hero) is eager + high priority
  //  • images fade in once loaded instead of popping in, and never leave a broken-image icon
  let {
    src = '',
    alt = '',
    sizes = '100vw',
    widths = DEFAULT_WIDTHS,
    fallbackWidth = 960,
    priority = false,
    fadeIn = true,
    crop = '',          // e.g. '3:4': Cloudinary crops to that shape around the subject, so a wide photo isn't cut through the middle
    class: className = '',
    ...rest
  } = $props();

  let el = $state(null);
  let loaded = $state(false);
  let failed = $state(false);

  $effect(() => {
    void src;
    loaded = false;
    failed = false;
    // Cached images can finish before the onload handler is attached.
    queueMicrotask(() => { if (el?.complete && el.naturalWidth > 0) loaded = true; });
  });

  let srcset = $derived(getSrcset(src, widths, crop ? { ratio: crop } : {}));
  // Priority (LCP) images paint immediately — no fade, so they're never held back at opacity 0.
  let fade = $derived(fadeIn && !priority);
  let visible = $derived(!fade || loaded || failed);
</script>

{#if src}
  <img
    bind:this={el}
    src={getOptimizedUrl(src, fallbackWidth, crop ? { ratio: crop } : {})}
    srcset={srcset || undefined}
    sizes={srcset ? sizes : undefined}
    {alt}
    loading={priority ? 'eager' : 'lazy'}
    decoding={priority ? 'sync' : 'async'}
    fetchpriority={priority ? 'high' : undefined}
    class="{className} {fade && loaded ? 'animate-fade-in' : ''} {visible ? '' : 'opacity-0'}"
    onload={() => (loaded = true)}
    onerror={() => (failed = true)}
    {...rest}
  />
{/if}
