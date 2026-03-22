<script>
  import { onMount } from 'svelte';
  import GeoBlock from './components/GeoBlock.svelte';
  import { cartCount } from './stores/cart.js';
  import { loadStoreData } from './lib/storeData.js';

  // ── Pages ──────────────────────────────────────────────────────────────────
  import Index        from './pages/Index.svelte';
  import Admin        from './pages/Admin.svelte';
  import Products     from './pages/Products.svelte';
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
    if (p === '/products')                   return { page: 'products' };
    if (p.startsWith('/products/'))          return { page: 'product', id: p.slice('/products/'.length) };
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
</script>

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
  <Products />
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
