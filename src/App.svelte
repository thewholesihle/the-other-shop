<script>
  import { onMount } from 'svelte';
  import GeoBlock from './components/GeoBlock.svelte';
  import { cartCount } from './stores/cart.js';
  import { loadStoreData } from './lib/storeData.js';
  import { softFade } from './lib/motion.js';
  import Loader from './components/Loader.svelte';
  import { saveBrand, hideBoot } from './lib/brand.js';
  import { buildTheme, themeCss } from './lib/theme.js';

  // ── Pages ──────────────────────────────────────────────────────────────────
  import Index        from './pages/Index.svelte';
  import Admin        from './pages/Admin.svelte';
  import Shop         from './pages/Shop.svelte';
  import Product      from './pages/Product.svelte';
  import Lookbook     from './pages/Lookbook.svelte';
  import LookbookDetail from './pages/LookbookDetail.svelte';
  import Community    from './pages/Community.svelte';
  import Article      from './pages/Article.svelte';
  import Cart         from './pages/Cart.svelte';
  import Shipping     from './pages/Shipping.svelte';
  import FAQ          from './pages/FAQ.svelte';
  import Contact      from './pages/Contact.svelte';
  import NotFound     from './pages/NotFound.svelte';
  import Maintenance  from './pages/Maintenance.svelte';

  let path = window.location.pathname;
  // Tracked separately from `path` — pathname never includes the query string, so
  // a link like /shop?category=xyz needs both: `path` for route matching and
  // `search` passed down so pages can react to filter changes in the URL.
  let search = window.location.search;
  let maintenance = null; // null = not yet checked
  let site = null;

  onMount(async () => {
    const handler = () => { path = window.location.pathname; search = window.location.search; };
    window.addEventListener('popstate', handler);
    try {
      const data = await loadStoreData();
      site = data?.site;
      saveBrand(site);
      maintenance = data?.site?.maintenance?.enabled ? data.site.maintenance : false;
    } catch {
      maintenance = false;
    }
    return () => window.removeEventListener('popstate', handler);
  });

  window.__navigate = (to) => {
    history.pushState({}, '', to);
    // `to` may carry a query string (e.g. a footer category link, "/shop?category=xyz").
    // resolveRoute only ever matches on the bare pathname — splitting here is what
    // stops "/shop?category=xyz" !== "/shop" from falling through to the 404 route.
    const [pathname, queryString] = to.split('?');
    path = pathname;
    search = queryString ? `?${queryString}` : '';
    window.scrollTo(0, 0);
  };

  // ── Route resolver ─────────────────────────────────────────────────────────
  $: route = resolveRoute(path);
  // Hand over from the static boot screen once the app has its own loader/content up.
  $: if (site !== null || route.page === 'admin') hideBoot();
  // Identifies not just which page type is showing but which specific record (a
  // product/lookbook/article id) — {#key} below remounts on change. That's what
  // makes navigating directly between two records fetch the new one: Product,
  // LookbookDetail and Article only ever read their id/slug prop in onMount, so
  // without a remount, clicking straight from one product to another left the
  // first product's data on screen. Staying within the same record (e.g. a Shop
  // filter changing the query string) leaves this key untouched, so it doesn't
  // remount — and doesn't discard state — for anything that isn't a real navigation.
  $: routeKey = `${route.page}:${route.id || route.slug || ''}`;

  function resolveRoute(p) {
    if (p === '/')                           return { page: 'index' };
    if (p.startsWith('/admin'))              return { page: 'admin' };
    if (p === '/shop')                       return { page: 'products' };
    if (p.startsWith('/shop/'))              return { page: 'product', id: p.slice('/shop/'.length) };
    if (p === '/lookbook')                   return { page: 'lookbook' };
    if (p.startsWith('/lookbook/'))          return { page: 'lookbook-detail', id: p.slice('/lookbook/'.length) };
    if (p === '/community')                  return { page: 'community' };
    if (p.startsWith('/community/'))         return { page: 'article', slug: p.slice('/community/'.length) };
    if (p === '/cart')                       return { page: 'cart' };
    if (p === '/payment/success')            return { page: 'cart' }; // Cart handles this step
    if (p === '/payment/cancel')             return { page: 'cart' };
    if (p === '/shipping-returns')           return { page: 'shipping' };
    if (p === '/faq')                        return { page: 'faq' };
    if (p === '/contact')                    return { page: 'contact' };
    return { page: 'notfound' };
  }

  // Colours: the five the admin picks are turned into a full set of tokens whose text/background pairs
  // are guaranteed readable (WCAG) — see src/lib/theme.js.
  $: theme = site?.colors ? buildTheme(site.colors) : null;
  $: themeStyle = theme ? `<style>
    :root {
      ${themeCss(theme.vars)}
    }
    ::selection { background: hsl(var(--foreground)); color: hsl(var(--background)); }

    /* Hover: link/text colour on light surfaces, a lighter/darker variant on the dark footer, and a
       filled button whose label is picked for contrast. */
    @media (hover: hover) {
      a:not(.bg-foreground):hover,
      button:not(.bg-foreground):hover {
        color: hsl(var(--hover)) !important;
      }
      .bg-foreground a:not(.bg-foreground):hover,
      .bg-foreground button:not(.bg-foreground):hover {
        color: hsl(var(--hover-on-dark)) !important;
      }
      a.bg-foreground:hover,
      button.bg-foreground:hover {
        background-color: hsl(var(--hover-fill)) !important;
        border-color: hsl(var(--hover-fill)) !important;
        color: hsl(var(--on-hover)) !important;
      }
    }

    /* Keyboard focus: a visible two-tone ring-3 on every control (the page colour fills the gap so it
       reads on photos and on the dark footer alike). */
    body *:focus-visible {
      outline: 2px solid hsl(var(--ring)) !important;
      outline-offset: 2px;
      box-shadow: 0 0 0 2px hsl(var(--background));
    }
    .bg-foreground *:focus-visible {
      outline-color: hsl(var(--hover-on-dark)) !important;
      box-shadow: 0 0 0 2px hsl(var(--foreground));
    }
  </style>` : '';
</script>

<svelte:head>
  {#if site?.favicon || site?.logo}
    {@const iconBase = site.favicon || site.logo}
    <link rel="icon" type="image/png" sizes="32x32" href={iconBase.includes('cloudinary.com') ? iconBase.replace('/upload/', '/upload/c_pad,f_png,q_auto,w_32,h_32/') : iconBase} />
    <link rel="icon" type="image/png" sizes="16x16" href={iconBase.includes('cloudinary.com') ? iconBase.replace('/upload/', '/upload/c_pad,f_png,q_auto,w_16,h_16/') : iconBase} />
    <link rel="shortcut icon" href={iconBase.includes('cloudinary.com') ? iconBase.replace('/upload/', '/upload/c_pad,f_png,q_auto,w_32,h_32/') : iconBase} />
    <link rel="apple-touch-icon" sizes="180x180" href={iconBase.includes('cloudinary.com') ? iconBase.replace('/upload/', '/upload/c_pad,f_png,q_auto,w_180,h_180/') : iconBase} />
    <link rel="manifest" href="/manifest.json" />
    <meta property="og:image" content={site.logo || site.favicon} />
  {:else}
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  {/if}
  {#if themeStyle && route.page !== 'admin'}
    {@html themeStyle}
  {/if}
</svelte:head>

{#if site === null}
  <Loader />
{/if}

<!-- SA Geo-gating popup (silent on network failure) -->
<GeoBlock />

<!-- Maintenance mode intercept (admin route always bypasses it) -->
<!-- Keyed on routeKey (not just wrapped) so a real navigation — a different page,
     or a different product/lookbook/article — remounts; staying on the same record
     (e.g. Shop's filters changing the query string) doesn't. Admin is exempt: it
     manages its own internal view state client-side, and a fade on top of its
     live-polling dashboard would just be a distracting flicker.
     `in:` only, deliberately not `transition:` — a two-way transition here runs the
     outgoing page's outro and the incoming page's intro at the same time, which for
     that overlap window left BOTH full page trees (navbar, content, footer — all of
     it) mounted and stacked in the document simultaneously: a real layout jump plus
     duplicated navbar/footer flashing on screen. `in:` removes the old page the
     instant the key changes (no outro, no overlap) and only fades the new one in. -->
{#if route.page === 'admin'}
  <Admin />
{:else}
  {#key routeKey}
    <div in:softFade={{ duration: 150 }}>
      {#if maintenance !== null && maintenance !== false}
        <Maintenance
          title={maintenance.title}
          message={maintenance.message}
          background={maintenance.background}
          collectEmails={maintenance.collectEmails}
          siteName={site?.name}
          logo={site?.logo}
          colors={site?.colors}
          socials={site?.socials}
        />
      {:else if route.page === 'index'}
        <Index />
      {:else if route.page === 'products'}
        <Shop {search} />
      {:else if route.page === 'product'}
        <Product productId={route.id} />
      {:else if route.page === 'lookbook'}
        <Lookbook />
      {:else if route.page === 'lookbook-detail'}
        <LookbookDetail lookbookId={route.id} />
      {:else if route.page === 'community'}
        <Community />
      {:else if route.page === 'article'}
        <Article slug={route.slug} />
      {:else if route.page === 'cart'}
        <Cart />
      {:else if route.page === 'shipping'}
        <Shipping />
      {:else if route.page === 'faq'}
        <FAQ />
      {:else if route.page === 'contact'}
        <Contact />
      {:else}
        <NotFound />
      {/if}
    </div>
  {/key}
{/if}
