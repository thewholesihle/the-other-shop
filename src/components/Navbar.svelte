<script>
  import { onMount } from 'svelte';
  import LetterSwap from './LetterSwap.svelte';
  import AdaptiveLogo from './AdaptiveLogo.svelte';
  import { cartCount } from "../stores/cart.js";
  import { loadStoreData } from '../lib/storeData.js';

  export let siteName = "Others.";
  export let logo = null;
  export let logoHeight = 28;

  const navLinks = [
    { label: "SHOP", href: "/shop" },
    { label: "LOOKBOOK", href: "/lookbook" },
    { label: "COMMUNITY", href: "/community" },
  ];

  // Two treatments, chosen in Settings → Navigation bar:
  //   solid  a frosted bar with a background (the original look)
  //   blend  no background; every element is white and blended with `mix-blend-mode: difference`, so it reads against
  //          whatever is behind it, light or dark.
  // The server writes the choice onto <html data-nav-style> so the first paint is already right.
  let blend = typeof document !== 'undefined' && document.documentElement.dataset.navStyle === 'blend';
  onMount(() => { loadStoreData().then(d => { blend = d?.site?.navStyle === 'blend'; }).catch(() => {}); });

  let mobileOpen = false;

  // The bar's height depends on the logo-size setting, so publish the real value as --nav-h for pages that
  // need to start below the fixed bar (the home page without a hero). The mobile menu isn't counted.
  function publishHeight(node) {
    const set = () => document.documentElement.style.setProperty('--nav-h', `${node.offsetHeight + 1}px`); // +1 = border
    set();
    const ro = new ResizeObserver(set);
    ro.observe(node);
    return { destroy: () => ro.disconnect() };
  }

  function nav(e, href) {
    e.preventDefault();
    if (window.__navigate) window.__navigate(href);
    mobileOpen = false;
  }

  // While the menu is open the page behind it doesn't scroll.
  $: if (typeof document !== 'undefined') document.body.style.overflow = mobileOpen ? 'hidden' : '';

  const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
  $: ink = blend ? 'text-white' : 'text-foreground';
  // A white copy of the logo in the blended style, so it inverts against the page like the text does.
  $: logoStyle = blend ? 'filter: brightness(0) invert(1)' : '';
</script>

<svelte:window
  onkeydown={(e) => { if (e.key === 'Escape') mobileOpen = false; }}
  onresize={() => { if (window.innerWidth >= 768) mobileOpen = false; }}
/>

<nav
  class="fixed top-0 left-0 right-0 z-50 {blend ? 'mix-blend-difference' : 'bg-background/80 backdrop-blur-md border-b border-border/40'}"
>
  <div
    use:publishHeight
    class="flex items-center justify-between px-5 md:px-10 py-4 max-w-screen-2xl mx-auto"
  >
    <!-- Logo -->
    <a
      href="/"
      onclick={(e) => nav(e, "/")}
      class="{ink} font-display text-xl font-bold tracking-tight"
      style={logoStyle}
    >
      {#if logo}
        <AdaptiveLogo src={logo} alt={siteName} surface="--background" widths={[160, 320, 480]} fallbackWidth={320} sizes="200px" priority style="height: {logoHeight}px" class="w-auto object-contain" />
      {:else}
        {siteName}
      {/if}
    </a>

    <!-- Desktop nav -->
    <div class="hidden md:flex items-center gap-8">
      {#each navLinks as link}
        <a
          href={link.href}
          onclick={(e) => nav(e, link.href)}
          class="{ink} text-label"
          ><LetterSwap text={link.label} /></a
        >
      {/each}
    </div>

    <!-- Actions: cart + hamburger only (search & admin removed) -->
    <div class="flex items-center gap-5">
      <!-- Cart with badge -->
      <a
        href="/cart"
        onclick={(e) => nav(e, "/cart")}
        class="relative {ink} hover:opacity-60 transition-opacity active:scale-95"
        aria-label="Cart"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          ><circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" /><path
            d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"
          /></svg
        >
        {#if $cartCount > 0}
          <span
            class="absolute -top-2 -right-2 {blend ? 'bg-white text-black' : 'bg-accent text-accent-foreground'} text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none tabular-nums"
            >{$cartCount > 9 ? "9+" : $cartCount}</span
          >
        {/if}
      </a>

      <!-- Hamburger: three lines that turn into a cross -->
      <button
        type="button"
        class="md:hidden relative -mr-1.5 h-8 w-8 {ink} hover:opacity-60 transition-opacity active:scale-95"
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={mobileOpen}
        aria-controls="mobile-menu"
        onclick={() => (mobileOpen = !mobileOpen)}
      >
        <span class="pointer-events-none absolute left-1.5 top-[10px] h-[1.5px] w-5 bg-current motion-reduce:transition-none" style="transition: transform 400ms {EASE}; transform: {mobileOpen ? 'translateY(6px) rotate(45deg)' : 'none'}"></span>
        <span class="pointer-events-none absolute left-1.5 top-[16px] h-[1.5px] w-5 bg-current motion-reduce:transition-none" style="transition: transform 300ms {EASE}, opacity 200ms; transform: {mobileOpen ? 'scaleX(0)' : 'none'}; opacity: {mobileOpen ? 0 : 1}"></span>
        <span class="pointer-events-none absolute left-1.5 top-[22px] h-[1.5px] w-5 bg-current motion-reduce:transition-none" style="transition: transform 400ms {EASE}; transform: {mobileOpen ? 'translateY(-6px) rotate(-45deg)' : 'none'}"></span>
      </button>
    </div>
  </div>
</nav>

<!-- Mobile menu: unrolls from the top under the bar (the bar stays above it). A separate element, not inside the bar, so the
     blended style's `mix-blend-mode` only ever touches the bar. -->
<div
  id="mobile-menu"
  class="md:hidden fixed inset-x-0 top-0 z-40 overflow-hidden bg-background text-foreground motion-reduce:!transition-none {blend ? 'h-dvh' : 'border-b border-border'}"
  style="padding-top: var(--nav-h, 61px); clip-path: {mobileOpen ? 'inset(0 0 0% 0)' : 'inset(0 0 100% 0)'}; visibility: {mobileOpen ? 'visible' : 'hidden'}; transition: clip-path 550ms {EASE}, visibility 0s linear {mobileOpen ? '0s' : '550ms'};"
  inert={!mobileOpen}
  aria-hidden={!mobileOpen}
>
  <div class="px-5 {blend ? 'pt-6 pb-10' : 'pb-6 pt-3'}">
    {#each [...navLinks, { label: 'CART', href: '/cart' }] as link, i}
      <a
        href={link.href}
        onclick={(e) => nav(e, link.href)}
        class="block {blend ? 'font-display text-4xl font-bold tracking-tight py-3' : `text-label py-3 ${i < navLinks.length ? 'border-b border-border' : ''}`}"
        style="transition: opacity 450ms ease, transform 550ms {EASE}; transition-delay: {mobileOpen ? 140 + i * 70 : 0}ms; opacity: {mobileOpen ? 1 : 0}; transform: translateY({mobileOpen ? '0' : '16px'});"
      >{link.label}{#if link.href === '/cart' && $cartCount > 0}<span class="{blend ? 'text-xl align-top ml-2' : 'ml-1'}">({$cartCount})</span>{/if}</a>
    {/each}
  </div>
</div>
