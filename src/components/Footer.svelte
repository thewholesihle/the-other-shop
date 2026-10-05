<script>
  import LetterSwap from './LetterSwap.svelte';
  import Img from './Img.svelte';
  import AdaptiveLogo from './AdaptiveLogo.svelte';
  import PaymentLogo from './PaymentLogo.svelte';
  export let data = { site: {}, categories: [] };
  
  $: site = data.site || {};
  $: products = data.products || [];
  // Only list categories that currently have at least one product — an empty
  // category has nothing to show at /shop?category=x, so it's left off both
  // the shop filter tabs and here rather than linking to an empty result.
  $: categories = (data.categories || []).filter(c => products.some(p => p.category === c.id));

  // Payment brands shown in the footer: the providers the admin has switched on, then the cards and
  // wallets they take (same switches as Settings → Payments; PayFast on / Yoco off until enabled).
  $: paymentLogos = [
    site.payments?.yoco?.enabled === true && 'yoco',
    site.payments?.payfast?.enabled !== false && 'payfast',
    'applepay', 'googlepay', 'visa', 'mastercard', 'amex',
  ].filter(Boolean);

  $: footerLinks = {
    Shop: [
      { label: 'New Arrivals', href: '/shop?filter=new' },
      ...categories.map(c => ({ label: c.name, href: `/shop?category=${c.id}` }))
    ],
    Brand: [
      { label: 'Community',  href: '/community' },
      { label: 'Lookbook',   href: '/lookbook' },
      { label: 'Contact',    href: '/contact' },
    ],
    Help: [
      { label: 'Shipping & Returns', href: '/shipping-returns' },
      { label: 'FAQ',                href: '/faq' },
      { label: 'Contact',            href: '/contact' },
    ],
  };

  $: socials = site.socials ? Object.entries(site.socials).filter(([_, href]) => href && href.trim() !== '') : [];

  let email = '';
  let subState = 'idle'; // 'idle' | 'loading' | 'done' | 'pending' (check your inbox) | 'error' | 'exists'

  async function subscribe() {
    if (!email || subState === 'loading') return;
    subState = 'loading';
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) { subState = 'error'; return; }
      subState = data.already ? 'exists' : data.pending ? 'pending' : 'done';
      if (subState === 'done' || subState === 'pending') email = '';
    } catch { subState = 'error'; }
  }

  function nav(e, href) {
    e.preventDefault();
    if (window.__navigate) window.__navigate(href);
  }
</script>

<footer class="bg-foreground text-primary-foreground px-6 md:px-10 pt-16 pb-8">
  <div class="grid grid-cols-2 md:grid-cols-4 gap-10 mb-16">
    <div class="col-span-2 md:col-span-1">
      {#if site.footerLogo}
        <AdaptiveLogo src={site.footerLogo} alt={site.name} surface="--foreground" widths={[160, 320, 480]} fallbackWidth={320} sizes="200px" class="h-10 w-auto mb-4 object-contain !border-0 bg-transparent" />
      {:else}
        <h3 class="font-display text-2xl font-bold mb-4">{site.name}</h3>
      {/if}
      <p class="text-sm text-on-dark max-w-xs leading-relaxed">{site.footerTagline || site.description}</p>
    </div>
    {#each Object.entries(footerLinks) as [title, links]}
      <div>
        <p class="text-label text-on-dark mb-4">{title.toUpperCase()}</p>
        <ul class="space-y-2.5">
          {#each links as link}
            <li>
              <a
                href={link.href}
                onclick={(e) => nav(e, link.href)}
                class="text-sm text-on-dark hover:text-primary-foreground transition-colors duration-200"
              ><LetterSwap text={link.label} /></a>
            </li>
          {/each}
        </ul>
      </div>
    {/each}
  </div>

  <!-- Newsletter -->
  <div class="border-t border-primary-foreground/10 pt-10 pb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
    <div>
      <p class="text-label text-on-dark mb-2">NEWSLETTER</p>
      <p class="text-sm text-on-dark">Sign up for drops, exclusives &amp; community news.</p>
    </div>
    {#if subState === 'pending'}
      <div class="flex items-center gap-2 text-sm text-on-dark" role="status">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
        Almost there — check your inbox to confirm.
      </div>
    {:else if subState === 'done'}
      <div class="flex items-center gap-2 text-sm text-on-dark">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 6 9 17l-5-5"/></svg>
        You're subscribed!
      </div>
    {:else if subState === 'exists'}
      <p class="text-sm text-on-dark">Already subscribed.</p>
    {:else}
      <div class="flex w-full md:w-auto flex-col gap-1">
        <div class="flex">
          <input
            type="email"
            placeholder="Email address"
            bind:value={email}
            onkeydown={(e) => e.key === 'Enter' && subscribe()}
            class="bg-transparent border border-primary-foreground/20 px-4 py-3 text-sm text-primary-foreground placeholder:text-on-dark flex-1 md:w-64 focus:outline-hidden focus:border-primary-foreground/50 transition-colors"
          />
          <button
            onclick={subscribe}
            disabled={subState === 'loading'}
            class="bg-primary-foreground text-foreground px-6 py-3 text-label tracking-[0.2em] hover:bg-primary-foreground/90 transition-colors active:scale-[0.97] disabled:opacity-60">
            {subState === 'loading' ? '…' : 'JOIN'}
          </button>
        </div>
        {#if subState === 'error'}
          <p class="text-xs text-destructive-on-dark">Something went wrong. Try again.</p>
        {/if}
      </div>
    {/if}
  </div>

  <div role="group" aria-label="Accepted payment methods" class="border-t border-primary-foreground/10 pt-6 pb-6 flex flex-col md:flex-row items-center justify-between gap-x-8 gap-y-4">
    <p class="text-xs text-on-dark">Secure payments</p>
    <ul class="flex flex-wrap items-center justify-center md:justify-end gap-x-6 gap-y-3 text-on-dark">
      {#each paymentLogos as id (id)}
        <li class="flex items-center"><PaymentLogo {id} height={id === 'yoco' ? 14 : id === 'amex' ? 22 : id === 'applepay' ? 22 : 18} /></li>
      {/each}
    </ul>
  </div>

  <div class="border-t border-primary-foreground/10 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
    <p class="text-xs text-on-dark">© 2026 {site.name} All rights reserved.</p>
    <div class="flex gap-6">
      {#each socials as [name, href]}
        <a {href} target="_blank" rel="noopener noreferrer" class="text-xs text-on-dark hover:text-primary-foreground transition-colors capitalize"><LetterSwap text={name} /></a>
      {/each}
    </div>
  </div>
</footer>
