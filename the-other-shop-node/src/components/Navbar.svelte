<script>
  import { cartCount } from "../stores/cart.js";

  export let siteName = "Others.";
  export let logo = null;

  const navLinks = [
    { label: "SHOP", href: "/products" },
    { label: "LOOKBOOK", href: "/lookbook" },
    { label: "COMMUNITY", href: "/community" },
  ];

  let mobileOpen = false;

  function nav(e, href) {
    e.preventDefault();
    if (window.__navigate) window.__navigate(href);
    mobileOpen = false;
  }
</script>

<nav
  class="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/40"
>
  <div
    class="flex items-center justify-between px-5 md:px-10 py-4 max-w-screen-2xl mx-auto"
  >
    <!-- Logo -->
    <a
      href="/"
      onclick={(e) => nav(e, "/")}
      class="text-foreground font-display text-xl font-bold tracking-tight"
    >
      {#if logo}
        <img src={logo} alt={siteName} class="h-7 w-auto object-contain" />
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
          class="text-foreground text-label hover:opacity-60 transition-opacity duration-200"
          >{link.label}</a
        >
      {/each}
    </div>

    <!-- Actions: cart + hamburger only (search & admin removed) -->
    <div class="flex items-center gap-5">
      <!-- Cart with badge -->
      <a
        href="/cart"
        onclick={(e) => nav(e, "/cart")}
        class="relative text-foreground hover:opacity-60 transition-opacity active:scale-95"
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
            class="absolute -top-2 -right-2 bg-accent text-accent-foreground text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none tabular-nums"
            >{$cartCount > 9 ? "9+" : $cartCount}</span
          >
        {/if}
      </a>
      <!-- Hamburger -->
      <button
        class="md:hidden text-foreground hover:opacity-60 transition-opacity active:scale-95"
        aria-label="Menu"
        onclick={() => (mobileOpen = !mobileOpen)}
      >
        {#if mobileOpen}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            ><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg
          >
        {:else}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            ><line x1="4" x2="20" y1="12" y2="12" /><line
              x1="4"
              x2="20"
              y1="6"
              y2="6"
            /><line x1="4" x2="20" y1="18" y2="18" /></svg
          >
        {/if}
      </button>
    </div>
  </div>

  {#if mobileOpen}
    <div
      class="md:hidden bg-background border-t border-border px-5 pb-6 pt-3 animate-fade-in"
    >
      {#each navLinks as link}
        <a
          href={link.href}
          onclick={(e) => nav(e, link.href)}
          class="block text-foreground text-label py-3 border-b border-border"
          >{link.label}</a
        >
      {/each}
      <a
        href="/cart"
        onclick={(e) => nav(e, "/cart")}
        class="block text-foreground text-label py-3"
        >CART {#if $cartCount > 0}({$cartCount}){/if}</a
      >
    </div>
  {/if}
</nav>
