<script>
  import { onMount } from 'svelte';
  import GeoBlock from './components/GeoBlock.svelte';
  import { cartCount } from './stores/cart.js';
  import { loadStoreData } from './lib/storeData.js';
  import Loader from './components/Loader.svelte';

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
  let maintenance = null; // null = not yet checked
  let site = null;

  onMount(async () => {
    const handler = () => { path = window.location.pathname; };
    window.addEventListener('popstate', handler);
    try {
      const data = await loadStoreData();
      site = data?.site;
      maintenance = data?.site?.maintenance?.enabled ? data.site.maintenance : false;
    } catch {
      maintenance = false;
    }
    return () => window.removeEventListener('popstate', handler);
  });

  window.__navigate = (to) => {
    history.pushState({}, '', to);
    path = to;
    window.scrollTo(0, 0);
  };

  // ── Route resolver ─────────────────────────────────────────────────────────
  $: route = resolveRoute(path);

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

  function hexToHsl(hex) {
    if (!hex) return '';
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    let r = parseInt(hex.substring(0,2), 16) / 255;
    let g = parseInt(hex.substring(2,4), 16) / 255;
    let b = parseInt(hex.substring(4,6), 16) / 255;
    let max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      let d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  }

  function mixHex(hex1, hex2, weight) {
    if (!hex1 || !hex2) return hex1 || hex2 || '#000000';
    hex1 = hex1.replace('#', '');
    hex2 = hex2.replace('#', '');
    if (hex1.length === 3) hex1 = hex1.split('').map(c=>c+c).join('');
    if (hex2.length === 3) hex2 = hex2.split('').map(c=>c+c).join('');
    let color = "#";
    for (let i = 0; i < 3; i++) {
      let v1 = parseInt(hex1.substring(i*2, i*2+2), 16);
      let v2 = parseInt(hex2.substring(i*2, i*2+2), 16);
      let val = Math.floor(v2 + (v1 - v2) * weight).toString(16).padStart(2, '0');
      color += val;
    }
    return color;
  }
</script>

<svelte:head>
  {#if site?.favicon || site?.logo}
    {@const iconBase = site.favicon || site.logo}
    <link rel="icon" type="image/png" sizes="32x32" href={iconBase.includes('cloudinary.com') ? iconBase.replace('/upload/', '/upload/c_pad,w_32,h_32/') : iconBase} />
    <link rel="icon" type="image/png" sizes="16x16" href={iconBase.includes('cloudinary.com') ? iconBase.replace('/upload/', '/upload/c_pad,w_16,h_16/') : iconBase} />
    <link rel="shortcut icon" href={iconBase.includes('cloudinary.com') ? iconBase.replace('/upload/', '/upload/c_pad,w_32,h_32/') : iconBase} />
    <link rel="apple-touch-icon" sizes="180x180" href={iconBase.includes('cloudinary.com') ? iconBase.replace('/upload/', '/upload/c_pad,w_180,h_180/') : iconBase} />
    <link rel="manifest" href="/manifest.json" />
    <meta property="og:image" content={site.logo || site.favicon} />
  {/if}
  {#if site?.colors && route.page !== 'admin'}
    {@html `
      <style>
        :root {
          --background: ${hexToHsl(site.colors.background)};
          --foreground: ${hexToHsl(site.colors.foreground)};
          --primary: ${hexToHsl(site.colors.primary)};
          --primary-foreground: ${hexToHsl(site.colors.background)};
          --border: ${hexToHsl(site.colors.border)};
          --hover: ${hexToHsl(site.colors.hover)};
          
          /* Derived Theme Variables */
          --card: ${hexToHsl(site.colors.background)};
          --card-foreground: ${hexToHsl(site.colors.foreground)};
          --popover: ${hexToHsl(site.colors.background)};
          --popover-foreground: ${hexToHsl(site.colors.foreground)};
          --secondary: ${hexToHsl(site.colors.border)};
          --secondary-foreground: ${hexToHsl(site.colors.foreground)};
          --muted: ${hexToHsl(mixHex(site.colors.background, site.colors.border, 0.5))};
          --muted-foreground: ${hexToHsl(mixHex(site.colors.background, site.colors.foreground, 0.45))};
          --accent: ${hexToHsl(site.colors.hover)};
          --accent-foreground: ${hexToHsl(site.colors.background)};
          --input: ${hexToHsl(site.colors.border)};
          --ring: ${hexToHsl(site.colors.primary)};
        }

        /* Safely target interactive elements to apply the global hover color */
        @media (hover: hover) {
          a:not(.bg-foreground):hover, 
          button:not(.bg-foreground):hover {
            color: hsl(var(--hover)) !important;
          }

          a.bg-foreground:hover,
          button.bg-foreground:hover {
            background-color: hsl(var(--hover)) !important;
            border-color: hsl(var(--hover)) !important;
            color: hsl(var(--background)) !important;
          }
        }
      </style>
    `}
  {/if}
</svelte:head>

{#if site === null}
  <Loader />
{/if}

<!-- SA Geo-gating popup (silent on network failure) -->
<GeoBlock />

<!-- Maintenance mode intercept (admin route always bypasses it) -->
{#if maintenance !== null && maintenance !== false && route.page !== 'admin'}
  <Maintenance
    title={maintenance.title}
    message={maintenance.message}
    background={maintenance.background}
    collectEmails={maintenance.collectEmails}
    logo={site?.logo}
    socials={site?.socials}
  />
{:else if route.page === 'index'}
  <Index />
{:else if route.page === 'admin'}
  <Admin />
{:else if route.page === 'products'}
  <Shop />
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
