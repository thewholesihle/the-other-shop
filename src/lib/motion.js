import { fade } from 'svelte/transition';

/**
 * A `fade` transition that collapses to instant (duration 0) for users who've asked
 * the OS for reduced motion. Svelte's built-in transitions don't check this on their
 * own, so every crossfade added for a smoother feel (Loader, page transitions) routes
 * through this instead of importing `fade` directly.
 */
export function softFade(node, params = {}) {
  const reduced = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return fade(node, reduced ? { ...params, duration: 0 } : params);
}
