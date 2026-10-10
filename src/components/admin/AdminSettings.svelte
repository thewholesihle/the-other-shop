<script>
  import { thumb, getOptimizedUrl } from '../../lib/cloudinary.js';
  import ImageUpload from './ImageUpload.svelte';
  import VideoUpload from './VideoUpload.svelte';
  import FontSettings from './FontSettings.svelte';
  import Button from '../ui/Button.svelte';
  import Card from '../ui/Card.svelte';
  import Badge from '../ui/Badge.svelte';
  import Switch from '../ui/Switch.svelte';
  import { inputCls, textareaCls, selectCls, labelCls, hintCls } from '../../lib/ui.js';
  import { toast } from '../../lib/toast.js';
  import { confirmDialog } from '../../lib/confirm.js';
  import LoaderCircle from 'lucide-svelte/icons/loader-circle';
  import Upload from 'lucide-svelte/icons/upload';
  import { buildTheme } from '../../lib/theme.js';
  import Check from 'lucide-svelte/icons/check';
  import Wand from 'lucide-svelte/icons/wand-sparkles';
  import Copy from 'lucide-svelte/icons/copy';
  import TriangleAlert from 'lucide-svelte/icons/triangle-alert';
  import { onMount } from 'svelte';

  let { site = {}, onUpdate = () => {}, lookbooks = [], articles = [], categories = [], products = [] } = $props();

  /** Fills in defaults for settings that older databases don't have yet. */
  function normalize(src) {
    const f = JSON.parse(JSON.stringify(src || {}));
    f.shipping ??= { freeMinimum: 500, standardRate: 99, country: 'South Africa' };
    f.payments ??= {};
    f.payments.payfast ??= {};
    f.payments.payfast.enabled ??= true;  // existing stores keep PayFast on
    f.payments.yoco ??= {};
    f.payments.yoco.enabled ??= false;    // Yoco is opt-in
    f.payments.abandonAfterMinutes ??= 60;
    f.hero ??= {};
    f.hero.enabled ??= true;
    f.hero.ctaLink ??= '/shop';
    f.hero.video ??= '';
    f.maintenance ??= { enabled: false, collectEmails: false, title: "We'll be back soon.", message: 'Our store is currently undergoing scheduled maintenance. Please check back shortly.', background: '' };
    f.maintenance.collectEmails ??= false;
    f.socials ??= { instagram: '', twitter: '', tiktok: '', youtube: '' };
    f.socials.youtube ??= '';
    f.featuredLookbook ??= '';
    f.featuredEditorialType ??= 'lookbook';
    f.featuredEditorialEnabled ??= true;
    f.navStyle = f.navStyle === 'blend' ? 'blend' : 'solid';
    f.navAutoHide ??= true;
    const slot = (v) => ({ source: 'default', family: '', url: '', file: '', format: '', ...(v || {}) });
    f.fonts = { heading: slot(f.fonts?.heading), body: slot(f.fonts?.body) };
    f.promotedCategory = { enabled: false, category: '', label: '', heading: '', message: '', cta: '', count: 4, position: 'after-drops', ...(f.promotedCategory || {}) };
    f.colors ??= { background: '#f8f5f2', foreground: '#211c1a', primary: '#211c1a', border: '#dbd8d4', hover: '#ff4400' };
    f.colors.hover ??= f.colors.primary || '#ff4400';
    f.footerLogo ??= '';
    f.footerTagline ??= '';
    f.metaTitle ??= '';
    f.metaDescription ??= '';
    f.ogImage ??= '';
    f.navLogoSize ??= 28;
    f.favicon ??= '';
    f.emailTemplates ??= {
      paid: 'Your payment for order {orderId} has been confirmed. We are now preparing your items for dispatch.',
      processing: 'We are currently processing your order {orderId}. You will be notified once it has been shipped.',
      shipped: 'Great news! Your order {orderId} has been shipped and is on its way to you.',
      delivered: 'Your order {orderId} has been delivered. We hope you enjoy your new pieces!',
      cancelled: 'Your order {orderId} has been cancelled. If you have any questions, please contact our support team.'
    };
    f.adminNotificationEmails ??= 'othersworldwide@gmail.com';
    // Two lists now; a store that only had the single one starts with that address in both.
    f.orderNotificationEmails ||= f.adminNotificationEmails;
    f.systemAlertEmails ||= f.adminNotificationEmails;
    return f;
  }

  // The form owns an editable copy of the saved settings, captured once on mount.
  // svelte-ignore state_referenced_locally
  let form = $state(normalize(site));
  // svelte-ignore state_referenced_locally
  let snapshot = $state(JSON.stringify(form));
  let saving = $state(false);
  let dirty = $derived(JSON.stringify(form) !== snapshot);

  // What the storefront will actually render: the picked colours, adjusted where needed so text stays readable.
  // Live check of the two recipient lists (the server validates again when saving).
  const parseEmails = (v) => String(v || '').split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
  const badEmails = (v) => parseEmails(v).filter(e => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  let badOrderEmails = $derived(badEmails(form.orderNotificationEmails));
  let badSystemEmails = $derived(badEmails(form.systemAlertEmails));
  let theme = $derived(buildTheme(form.colors));
  let adjusted = $derived(theme.checks.filter(c => !c.pass).length);

  async function handleSave() {
    if (saving) return;
    saving = true;
    try {
      await onUpdate($state.snapshot(form));
      snapshot = JSON.stringify(form);
    } catch {
      // Admin.svelte already toasts the failure; keep the form as-is so nothing is lost.
    } finally {
      saving = false;
    }
  }

  async function handleDiscard() {
    const ok = await confirmDialog.ask({
      title: 'Discard unsaved changes?',
      description: 'Settings go back to what is currently saved.',
      confirmLabel: 'Discard', destructive: true,
    });
    if (!ok) return;
    form = normalize(site);
    snapshot = JSON.stringify(form);
  }

  const SECTIONS = [
    { id: 'identity', label: 'Store identity' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'typography', label: 'Typography' },
    { id: 'navigation', label: 'Navigation bar' },
    { id: 'storefront', label: 'Homepage' },
    { id: 'shipping', label: 'Shipping' },
    { id: 'payments', label: 'Payments' },
    { id: 'emails', label: 'Emails & alerts' },
    { id: 'seo', label: 'SEO & sharing' },
    { id: 'social', label: 'Social & footer' },
    { id: 'maintenance', label: 'Maintenance' },
  ];

  // Which providers have their credentials in place on the server (it never sends the credentials themselves).
  let pay = $state(null);
  let payError = $state(false);
  onMount(async () => {
    try {
      const res = await fetch('/api/admin/payments', { credentials: 'include' });
      if (!res.ok) throw new Error();
      pay = await res.json();
    } catch { payError = true; }
  });
  // A method only reaches customers when it is switched on here AND configured on the server.
  let providers = $derived([
    { id: 'payfast', name: 'PayFast', blurb: 'Cards, Instant EFT and more.', info: pay?.payfast },
    { id: 'yoco', name: 'Yoco', blurb: 'Card payments through Yoco’s hosted checkout.', info: pay?.yoco },
  ]);
  let liveMethods = $derived(pay ? providers.filter(p => form.payments?.[p.id]?.enabled && p.info?.configured) : null);
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); toast.success('Copied'); }
    catch { toast.error('Copy failed — select the text and copy it manually.'); }
  }

  // The side list follows the page: the section whose card is under the top of the screen is highlighted, and clicking a
  // name highlights it straight away (the scroll then takes a moment to arrive).
  let activeSection = $state(SECTIONS[0].id);
  let lockUntil = 0;
  function jump(id) {
    activeSection = id;
    lockUntil = Date.now() + 900;
    document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function spy() {
    if (Date.now() < lockUntil) return;
    const line = 120;                                                            // just under the sticky header
    let current = SECTIONS[0].id;
    for (const s of SECTIONS) {
      const el = document.getElementById(`settings-${s.id}`);
      if (el && el.getBoundingClientRect().top <= line) current = s.id;
    }
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = SECTIONS[SECTIONS.length - 1].id;
    activeSection = current;
  }
  onMount(() => {
    let raf = 0;
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(spy); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    spy();
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf); };
  });

  const COLOR_FIELDS = [
    ['background', 'Background'], ['foreground', 'Text'], ['primary', 'Primary'], ['border', 'Borders'], ['hover', 'Hover'],
  ];
  const EMAIL_TEMPLATES = [
    ['paid', 'Payment confirmed'], ['processing', 'Order processing'], ['shipped', 'Order shipped'],
    ['delivered', 'Order delivered'], ['cancelled', 'Order cancelled'],
  ];
  const SOCIALS = [['instagram', 'Instagram'], ['twitter', 'X / Twitter'], ['tiktok', 'TikTok'], ['youtube', 'YouTube']];
</script>

{#snippet imageField(id, label, hint, get, set, shape = 'wide')}
  <div>
    <p class={labelCls}>{label}</p>
    {#if hint}<p class="{hintCls} mb-3 mt-0">{hint}</p>{/if}
    <div class="flex items-start gap-4">
      {#if get()}
        <div class="space-y-2">
          <img src={getOptimizedUrl(get(), 320)} decoding="async" alt="{label} preview" class="rounded-md border border-border bg-muted object-contain {shape === 'square' ? 'h-14 w-14' : 'h-14 w-auto max-w-[160px]'}" />
          <button type="button" onclick={() => set('')} class="text-xs text-destructive hover:underline">Remove</button>
        </div>
      {/if}
      <div class="flex-1"><ImageUpload label="" value={get() || ''} onChange={(url) => set(url)} /></div>
    </div>
  </div>
{/snippet}

<div class="space-y-6 pb-24">
  <div>
    <h1 class="text-2xl font-semibold tracking-tight">Settings</h1>
    <p class="text-sm text-muted-foreground">Branding, shipping rules, emails and the storefront content.</p>
  </div>

  <div class="grid grid-cols-1 items-start gap-8 lg:grid-cols-[180px_minmax(0,1fr)]">
    <nav aria-label="Settings sections" class="hidden lg:sticky lg:top-20 lg:flex lg:flex-col lg:gap-0.5">
      {#each SECTIONS as s}
        <button type="button" onclick={() => jump(s.id)} aria-current={activeSection === s.id ? 'true' : undefined}
          class="rounded-md px-3 py-2 text-left text-sm font-medium transition-colors {activeSection === s.id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'}">{s.label}</button>
      {/each}
    </nav>

    <div class="max-w-3xl space-y-6">
      <!-- Store identity -->
      <Card id="settings-identity" title="Store identity" description="Your name, logo and the details shown across the site." class="scroll-mt-20">
        <div class="space-y-5 p-6 pt-4">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div><label for="s-name" class={labelCls}>Store name</label><input id="s-name" bind:value={form.name} class={inputCls} /></div>
            <div><label for="s-tagline" class={labelCls}>Tagline</label><input id="s-tagline" bind:value={form.tagline} class={inputCls} /></div>
          </div>
          <div>
            <label for="s-desc" class={labelCls}>About description</label>
            <textarea id="s-desc" bind:value={form.description} rows={2} class={textareaCls}></textarea>
            <p class={hintCls}>The short paragraph shown in the website footer.</p>
          </div>
          <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {@render imageField('logo', 'Logo', 'If none is set, the store name is shown as text.', () => form.logo, (v) => (form.logo = v))}
            <div>
              <label for="s-logo-size" class={labelCls}>Navigation logo height</label>
              <div class="flex items-center gap-4">
                <input id="s-logo-size" type="range" min="16" max="64" step="2" bind:value={form.navLogoSize} class="flex-1 accent-primary" />
                <span class="w-12 text-right text-sm tabular-nums">{form.navLogoSize}px</span>
              </div>
            </div>
            {@render imageField('emaillogo', 'Email logo (optional)', 'A dedicated logo for order emails. Falls back to the main logo.', () => form.emailLogo, (v) => (form.emailLogo = v))}
            <div>
              {@render imageField('favicon', 'Favicon', 'Optional. Leave empty to use the built-in Others. icons (tab, home screen and app). Upload an image here only to replace them.', () => form.favicon, (v) => (form.favicon = v), 'square')}
            </div>
          </div>
        </div>
      </Card>

      <!-- Appearance -->
      <Card id="settings-appearance" title="Colour palette" description="Global colours of the storefront." class="scroll-mt-20">
        <div class="grid grid-cols-2 gap-4 p-6 pt-4 sm:grid-cols-3 md:grid-cols-5">
          {#each COLOR_FIELDS as [key, label]}
            <div>
              <label for="c-{key}" class="mb-2 block text-sm font-medium leading-none">{label}</label>
              <div class="flex items-center gap-2 rounded-md border border-input bg-background p-1">
                <input id="c-{key}" type="color" bind:value={form.colors[key]} class="h-8 w-8 cursor-pointer rounded-[0.25rem] border-0 bg-transparent p-0" />
                <span class="text-xs uppercase tabular-nums text-muted-foreground">{form.colors[key]}</span>
              </div>
            </div>
          {/each}
        </div>

        <!-- Contrast checker: every pair the storefront actually uses, before and after automatic correction -->
        <div class="space-y-4 border-t border-border p-6">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm font-semibold">Readability check</p>
            <Badge variant={adjusted ? 'warning' : 'success'}>
              {#if adjusted}<Wand size={12} class="mr-1" /> {adjusted} colour{adjusted === 1 ? '' : 's'} auto-adjusted{:else}<Check size={12} class="mr-1" /> All combinations pass{/if}
            </Badge>
          </div>
          <p class="text-sm text-muted-foreground">Colours are tested against WCAG contrast guidelines. Where a combination would be hard to read (or invisible to low-vision visitors) the storefront quietly uses the closest colour that passes, so you can pick freely.</p>
          <ul class="divide-y divide-border rounded-lg border border-border text-sm">
            {#each theme.checks as c}
              <li class="flex items-center gap-3 px-4 py-2.5">
                <span class="h-3 w-3 shrink-0 rounded-full border border-border" style="background:{c.applied}"></span>
                <span class="flex-1">{c.label}</span>
                <span class="tabular-nums text-muted-foreground">{c.ratio}:1 <span class="text-xs">(needs {c.min}:1)</span></span>
                {#if c.pass}<Badge variant="success">Pass</Badge>{:else}<Badge variant="warning">Adjusted → {c.appliedRatio}:1</Badge>{/if}
              </li>
            {/each}
          </ul>

          <div class="rounded-lg border border-border p-5" style="background:{theme.hex.background}; color:{theme.hex.foreground}">
            <p class="text-xs uppercase tracking-widest" style="color:{theme.hex.mutedForeground}">Preview</p>
            <p class="mt-1 text-xl font-bold">New season, new pieces</p>
            <p class="mt-1 text-sm" style="color:{theme.hex.mutedForeground}">Muted text such as product descriptions and captions.</p>
            <p class="mt-3 text-sm"><span class="underline" style="color:{theme.hex.hover}">A link in its hover colour</span></p>
          </div>
        </div>
      </Card>

      <!-- Typography -->
      <Card id="settings-typography" title="Typography" description="The fonts used across the storefront. Choose a Google Font or upload your own." class="scroll-mt-20">
        <FontSettings bind:fonts={form.fonts} />
      </Card>

      <!-- Navigation bar -->
      <Card id="settings-navigation" title="Navigation bar" description="How the bar at the top of every storefront page looks." class="scroll-mt-20">
        <fieldset class="grid grid-cols-1 gap-4 p-6 pt-4 sm:grid-cols-2">
          <legend class="sr-only">Navigation bar style</legend>
          {#each [['solid', 'Solid', 'A frosted bar with a background, so the links always sit on a clean strip.'], ['blend', 'Blended', 'No background. Logo, links and icons are white and blended with the page behind them (mix-blend-mode: difference), so they stay readable over any image or colour.']] as [value, name, blurb]}
            <label class="flex cursor-pointer flex-col gap-3 rounded-lg border p-3 transition-colors focus-within:ring-2 focus-within:ring-ring/40 {form.navStyle === value ? 'border-foreground bg-accent/40' : 'border-border hover:bg-accent/30'}">
              <input type="radio" name="nav-style" {value} bind:group={form.navStyle} class="sr-only" />
              <!-- a small drawing of the result -->
              <div class="relative h-24 overflow-hidden rounded-md border border-border" style="background: linear-gradient(100deg, #1c1917 0 38%, #f5f1ec 38% 100%)" aria-hidden="true">
                {#if value === 'solid'}
                  <div class="absolute inset-x-0 top-0 flex items-center justify-between border-b border-black/10 bg-white/80 px-3 py-2 backdrop-blur-sm">
                    <span class="h-2 w-8 rounded-sm bg-neutral-900"></span>
                    <span class="flex gap-2"><span class="h-1.5 w-6 rounded-sm bg-neutral-900"></span><span class="h-1.5 w-6 rounded-sm bg-neutral-900"></span><span class="h-1.5 w-6 rounded-sm bg-neutral-900"></span></span>
                  </div>
                {:else}
                  <div class="absolute inset-x-0 top-0 flex items-center justify-between px-3 py-2 mix-blend-difference">
                    <span class="h-2 w-8 rounded-sm bg-white"></span>
                    <span class="flex gap-2"><span class="h-1.5 w-6 rounded-sm bg-white"></span><span class="h-1.5 w-6 rounded-sm bg-white"></span><span class="h-1.5 w-6 rounded-sm bg-white"></span></span>
                  </div>
                {/if}
              </div>
              <div>
                <p class="flex items-center gap-2 text-sm font-semibold">{name}{#if form.navStyle === value}<Check size={14} />{/if}</p>
                <p class="mt-0.5 text-sm text-muted-foreground">{blurb}</p>
              </div>
            </label>
          {/each}
        </fieldset>
        <div class="flex items-center justify-between gap-4 border-t border-border p-6">
          <div>
            <p class="text-sm font-semibold">Hide while scrolling down</p>
            <p class="text-sm text-muted-foreground">The bar slides out of the way as visitors scroll down the page and comes straight back when they scroll up, so it never covers the content.</p>
          </div>
          <Switch bind:checked={form.navAutoHide} aria-label="Hide the navigation bar while scrolling down" />
        </div>
      </Card>

      <!-- Homepage -->
      <Card id="settings-storefront" title="Homepage" description="The announcement bar, hero, featured editorial and promoted category." class="scroll-mt-20">
        <div class="space-y-6 p-6 pt-4">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_120px]">
            <div><label for="s-ann" class={labelCls}>Announcement bar</label><input id="s-ann" bind:value={form.announcement} class={inputCls} /></div>
            <div><label for="s-cur" class={labelCls}>Currency</label><input id="s-cur" bind:value={form.currency} class={inputCls} /></div>
          </div>

          <div class="space-y-4 border-t border-border pt-6">
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-sm font-semibold">Hero</p>
                <p class="text-sm text-muted-foreground">The full-screen banner at the top of the home page. Turn it off and the home page opens straight on <strong>New Arrivals</strong> (products marked “New”).</p>
              </div>
              <Switch bind:checked={form.hero.enabled} aria-label="Show the hero" />
            </div>
            {#if form.hero.enabled}
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><label for="h-label" class={labelCls}>Season label</label><input id="h-label" bind:value={form.hero.label} class={inputCls} /></div>
              <div><label for="h-heading" class={labelCls}>Title</label><input id="h-heading" bind:value={form.hero.heading} class={inputCls} /></div>
            </div>
            <div><label for="h-sub" class={labelCls}>Subtitle</label><input id="h-sub" bind:value={form.hero.subheading} class={inputCls} /></div>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><label for="h-cta" class={labelCls}>Button text</label><input id="h-cta" bind:value={form.hero.cta} class={inputCls} /></div>
              <div>
                <label for="h-cta-link" class={labelCls}>Button link</label>
                <input id="h-cta-link" bind:value={form.hero.ctaLink} placeholder="/shop" class={inputCls} />
                <p class={hintCls}>A path like /shop or a full URL.</p>
              </div>
            </div>
            <div class="space-y-4">
              <p class="text-sm text-muted-foreground">Upload an image <em>or</em> a video/GIF. If both are set, the video takes priority.</p>
              <ImageUpload label="Background image" value={form.hero.image} onChange={(url) => (form.hero.image = url)} />
              <VideoUpload label="Background video / GIF" value={form.hero.video} stripAudio onChange={(url) => (form.hero.video = url)} />
            </div>
            {/if}
          </div>

          <div class="space-y-4 border-t border-border pt-6">
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-sm font-semibold">Featured editorial</p>
                <p class="text-sm text-muted-foreground">Promote an article or lookbook on the home page. Turn it off and the section disappears from the home page.</p>
              </div>
              <Switch bind:checked={form.featuredEditorialEnabled} aria-label="Show the featured editorial" />
            </div>
            {#if form.featuredEditorialEnabled}
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label for="fe-type" class={labelCls}>Type</label>
                <select id="fe-type" bind:value={form.featuredEditorialType} class={selectCls}>
                  <option value="lookbook">Lookbook</option>
                  <option value="article">Article</option>
                </select>
              </div>
              <div>
                <label for="fe-item" class={labelCls}>{form.featuredEditorialType === 'article' ? 'Article' : 'Lookbook'}</label>
                {#if form.featuredEditorialType === 'article'}
                  {#if !articles?.length}
                    <p class="py-2 text-sm italic text-muted-foreground">No articles found.</p>
                  {:else}
                    <select id="fe-item" bind:value={form.featuredLookbook} class={selectCls}>
                      <option value="">Latest article (default)</option>
                      {#each articles.filter(a => a.published) as a}<option value={a.id}>{a.title}</option>{/each}
                    </select>
                  {/if}
                {:else if !lookbooks?.length}
                  <p class="py-2 text-sm italic text-muted-foreground">No lookbooks found.</p>
                {:else}
                  <select id="fe-item" bind:value={form.featuredLookbook} class={selectCls}>
                    <option value="">Latest lookbook (default)</option>
                    {#each lookbooks as lb}<option value={lb.id}>{lb.title}</option>{/each}
                  </select>
                {/if}
              </div>
            </div>
            {#if form.featuredEditorialType === 'article'}
              <div><label for="fe-heading" class={labelCls}>Heading override (optional)</label><input id="fe-heading" bind:value={form.featuredEditorialHeading} class={inputCls} placeholder="e.g. Latest editorial" /></div>
              <div><label for="fe-msg" class={labelCls}>Message override (optional)</label><textarea id="fe-msg" bind:value={form.featuredEditorialMessage} rows={2} class={textareaCls} placeholder="e.g. Read the full story behind the collection…"></textarea></div>
              <div><label for="fe-cta" class={labelCls}>Button text (optional)</label><input id="fe-cta" bind:value={form.featuredEditorialCta} class={inputCls} placeholder="e.g. Read article" /></div>
            {/if}
            {/if}
          </div>

          <div class="space-y-4 border-t border-border pt-6">
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-sm font-semibold">Promote a category</p>
                <p class="text-sm text-muted-foreground">Give one category its own section on the home page, with your own heading. It stays hidden while the category has no products.</p>
              </div>
              <Switch bind:checked={form.promotedCategory.enabled} aria-label="Promote a category on the home page" />
            </div>
            {#if form.promotedCategory.enabled}
              {@const chosen = categories.find(c => c.id === form.promotedCategory.category)}
              {@const inCat = chosen ? products.filter(p => p.category === chosen.id).length : 0}
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label for="pc-cat" class={labelCls}>Category</label>
                  {#if !categories.length}
                    <p class="py-2 text-sm italic text-muted-foreground">No categories yet. Create one under Categories first.</p>
                  {:else}
                    <select id="pc-cat" bind:value={form.promotedCategory.category} class={selectCls}>
                      <option value="">Choose a category…</option>
                      {#each categories as c}<option value={c.id}>{c.name}</option>{/each}
                    </select>
                  {/if}
                </div>
                <div>
                  <label for="pc-count" class={labelCls}>Products to show</label>
                  <select id="pc-count" bind:value={form.promotedCategory.count} class={selectCls}>
                    {#each [4, 6, 8, 10] as n}<option value={n}>{n}</option>{/each}
                  </select>
                </div>
              </div>
              {#if !form.promotedCategory.category && categories.length}
                <p class="text-xs text-muted-foreground">Choose a category and the section appears on the home page.</p>
              {:else if chosen && inCat === 0}
                <p class="flex items-start gap-1.5 text-xs text-destructive"><TriangleAlert size={13} class="mt-px shrink-0" /> “{chosen.name}” has no products yet, so the section stays hidden until it does.</p>
              {:else if chosen}
                <p class="text-xs text-muted-foreground">{inCat} product{inCat === 1 ? '' : 's'} in “{chosen.name}”. In-stock ones are shown first, newest first.</p>
              {/if}
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><label for="pc-label" class={labelCls}>Small line above the heading</label><input id="pc-label" bind:value={form.promotedCategory.label} maxlength="60" class={inputCls} placeholder="e.g. Winter essentials" /></div>
                <div><label for="pc-heading" class={labelCls}>Heading</label><input id="pc-heading" bind:value={form.promotedCategory.heading} maxlength="100" class={inputCls} placeholder={chosen?.name || 'Defaults to the category name'} /></div>
              </div>
              <div><label for="pc-msg" class={labelCls}>Message (optional)</label><textarea id="pc-msg" bind:value={form.promotedCategory.message} maxlength="300" rows={2} class={textareaCls} placeholder="e.g. Heavyweight layers built for the cold."></textarea></div>
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><label for="pc-cta" class={labelCls}>Button text</label><input id="pc-cta" bind:value={form.promotedCategory.cta} maxlength="40" class={inputCls} placeholder={chosen ? `Shop ${chosen.name}` : 'Shop the collection'} /></div>
                <div>
                  <label for="pc-pos" class={labelCls}>Where it appears</label>
                  <select id="pc-pos" bind:value={form.promotedCategory.position} class={selectCls}>
                    <option value="after-drops">Below New Drops</option>
                    <option value="after-editorial">Below the featured editorial</option>
                  </select>
                </div>
              </div>
            {/if}
          </div>
        </div>
      </Card>

      <!-- Shipping -->
      <Card id="settings-shipping" title="Shipping" description="Charged at checkout. You post orders yourself." class="scroll-mt-20">
        <div class="space-y-3 p-6 pt-4">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div><label for="s-free-min" class={labelCls}>Free shipping from ({form.currency})</label><input id="s-free-min" type="number" min="0" bind:value={form.shipping.freeMinimum} class="{inputCls} tabular-nums" /></div>
            <div><label for="s-std-rate" class={labelCls}>Standard rate ({form.currency})</label><input id="s-std-rate" type="number" min="0" bind:value={form.shipping.standardRate} class="{inputCls} tabular-nums" /></div>
          </div>
          <p class={hintCls}>Orders at or above the free-shipping minimum ship free. Checkout is restricted to South Africa.</p>
        </div>
      </Card>

      <!-- Payments -->
      <Card id="settings-payments" title="Payments" description="Choose how customers can pay. Turn a method off and it disappears from checkout straight away." class="scroll-mt-20">
        <div class="space-y-5 p-6 pt-4">
          {#each providers as p (p.id)}
            {@const enabled = form.payments[p.id].enabled}
            <div class="rounded-md border border-border p-4">
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <p class="text-sm font-semibold">{p.name}</p>
                    {#if pay}
                      {#if p.info?.configured}
                        <Badge variant="success">Ready</Badge>
                        <Badge variant="outline">{p.info.mode === 'live' ? 'Live' : p.info.mode === 'test' ? 'Test mode' : 'Sandbox'}</Badge>
                      {:else}
                        <Badge variant="warning">Not set up</Badge>
                      {/if}
                    {/if}
                  </div>
                  <p class="mt-1 text-sm text-muted-foreground">{p.blurb}</p>
                </div>
                <Switch bind:checked={form.payments[p.id].enabled} aria-label="Accept payments with {p.name}" />
              </div>

              {#if pay && !p.info?.configured}
                <div class="mt-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                  <TriangleAlert size={15} class="mt-0.5 shrink-0" />
                  <p>
                    {#if p.id === 'payfast'}
                      PayFast credentials aren’t set on the server, so it won’t be offered{enabled ? '' : ' even if switched on'}. Add <code class="rounded-[0.25rem] bg-muted px-1 text-xs text-foreground">PAYFAST_MERCHANT_ID_*</code> and <code class="rounded-[0.25rem] bg-muted px-1 text-xs text-foreground">PAYFAST_MERCHANT_KEY_*</code>, then restart.
                    {:else if p.info?.keyMismatch}
                      The Yoco key doesn’t match the mode: a {p.info.mode === 'test' ? 'live' : 'test'} key is set while the server is in <strong>{p.info.mode}</strong> mode. Fix <code class="rounded-[0.25rem] bg-muted px-1 text-xs text-foreground">YOCO_SANDBOX</code> or the key, then restart.
                    {:else}
                      Yoco isn’t finished being set up{enabled ? '' : ', so switching it on won’t show it yet'}:
                      {#if !p.info?.hasKey}add <code class="rounded-[0.25rem] bg-muted px-1 text-xs text-foreground">YOCO_SECRET_KEY_{p.info?.mode === 'live' ? 'LIVE' : 'TEST'}</code>{/if}{#if !p.info?.hasKey && !p.info?.hasWebhookSecret} and {/if}{#if !p.info?.hasWebhookSecret}register the webhook (below) and add <code class="rounded-[0.25rem] bg-muted px-1 text-xs text-foreground">YOCO_WEBHOOK_SECRET_{p.info?.mode === 'live' ? 'LIVE' : 'TEST'}</code>{/if}. Restart the server afterwards.
                    {/if}
                  </p>
                </div>
              {/if}

              {#if p.id === 'yoco' && pay}
                <div class="mt-4 space-y-2 border-t border-border pt-4">
                  <p class="text-sm font-medium">Webhook address</p>
                  <p class="{hintCls} mt-0">Yoco tells this address when a payment succeeds — that is the only thing that marks an order paid. It must be https and publicly reachable.</p>
                  <div class="flex items-center gap-2">
                    <code class="min-w-0 flex-1 truncate rounded-md border border-input bg-muted px-3 py-2 text-xs" title={pay.yoco.webhookUrl}>{pay.yoco.webhookUrl}</code>
                    <Button variant="outline" size="sm" onclick={() => copyText(pay.yoco.webhookUrl)} aria-label="Copy webhook address"><Copy size={14} /> Copy</Button>
                  </div>
                  <p class={hintCls}>Register it once with <code class="rounded-[0.25rem] bg-muted px-1 text-xs">node scripts/yoco-webhook.js {pay.yoco.webhookUrl}</code> and save the printed secret as <code class="rounded-[0.25rem] bg-muted px-1 text-xs">YOCO_WEBHOOK_SECRET_{pay.yoco.mode === 'live' ? 'LIVE' : 'TEST'}</code>.</p>
                </div>
              {/if}
            </div>
          {/each}

          <div class="border-t border-border pt-5">
            <label for="s-abandon" class={labelCls}>Release unpaid orders after (minutes)</label>
            <input id="s-abandon" type="number" min="15" max="1440" step="5" bind:value={form.payments.abandonAfterMinutes} class="{inputCls} max-w-[10rem] tabular-nums" />
            <p class={hintCls}>If a customer reaches the payment page but never pays, their order is cancelled after this long and the stock goes back on sale. Between 15 minutes and 24 hours. If they do pay late, the order is still marked paid and the stock is re-reserved.</p>
          </div>

          {#if payError}
            <p class="{hintCls} mt-0">Couldn’t check which providers are set up on the server. Switches still save normally.</p>
          {:else if liveMethods && liveMethods.length === 0}
            <div role="alert" class="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <TriangleAlert size={15} class="mt-0.5 shrink-0" />
              <p><strong>No payment method will be available.</strong> Customers won’t be able to check out until at least one method is switched on and set up. To pause the store on purpose, use Maintenance mode instead.</p>
            </div>
          {:else if liveMethods}
            <p class="{hintCls} mt-0">Checkout offers: <strong>{liveMethods.map(p => p.name).join(' and ')}</strong>{liveMethods.length > 1 ? ' — customers choose at checkout.' : '.'}</p>
          {/if}
        </div>
      </Card>

      <!-- Emails & alerts -->
      <Card id="settings-emails" title="Emails & alerts" description="Who is notified, and what customers are told when an order changes." class="scroll-mt-20">
        <div class="space-y-5 p-6 pt-4">
          <div>
            <label for="s-order-emails" class={labelCls}>Order notification emails</label>
            <input id="s-order-emails" bind:value={form.orderNotificationEmails} placeholder="orders@store.com, packing@store.com" aria-invalid={badOrderEmails.length > 0} class={inputCls} />
            <p class={hintCls}>Who is emailed when a customer pays for an order. Separate several addresses with commas (up to 10). The first one is also shown to customers as the address to write to.</p>
            {#if badOrderEmails.length}<p role="alert" class="mt-1.5 text-[0.8rem] text-destructive">Not a valid email address: {badOrderEmails.join(', ')}</p>{/if}
          </div>
          <div>
            <label for="s-system-emails" class={labelCls}>System alert emails</label>
            <input id="s-system-emails" bind:value={form.systemAlertEmails} placeholder="you@store.com" aria-invalid={badSystemEmails.length > 0} class={inputCls} />
            <p class={hintCls}>Who is emailed about the site itself: new admin sign-ins, errors, database outages, the weekly summary and log backups. Keep this to people who look after the site.</p>
            {#if badSystemEmails.length}<p role="alert" class="mt-1.5 text-[0.8rem] text-destructive">Not a valid email address: {badSystemEmails.join(', ')}</p>{/if}
          </div>
          <div class="space-y-4 border-t border-border pt-5">
            <p class="text-sm text-muted-foreground">Use <code class="rounded-[0.25rem] bg-muted px-1.5 py-0.5 text-xs">{'{orderId}'}</code> to insert the order reference.</p>
            {#each EMAIL_TEMPLATES as [key, label]}
              <div>
                <label for="template-{key}" class={labelCls}>{label}</label>
                <textarea id="template-{key}" bind:value={form.emailTemplates[key]} rows={2} class={textareaCls}></textarea>
              </div>
            {/each}
          </div>
        </div>
      </Card>

      <!-- SEO -->
      <Card id="settings-seo" title="SEO & sharing" description="How the store appears in search results and shared links." class="scroll-mt-20">
        <div class="space-y-5 p-6 pt-4">
          <div>
            <label for="s-meta-title" class={labelCls}>Meta title</label>
            <input id="s-meta-title" bind:value={form.metaTitle} placeholder="e.g. Others. — Official Store" class={inputCls} />
            <p class={hintCls}>Overrides the title shown in browser tabs and search engines.</p>
          </div>
          <div>
            <label for="s-meta-desc" class={labelCls}>Meta description</label>
            <textarea id="s-meta-desc" bind:value={form.metaDescription} rows={2} class={textareaCls}></textarea>
            <p class={hintCls}>The snippet shown under your site in Google and social previews.</p>
          </div>
          {@render imageField('og', 'Default share image', 'Shown when the home, shop, lookbook or community pages are shared. Products, articles and lookbooks use their own image when they have one. 1200×630 works best.', () => form.ogImage, (v) => (form.ogImage = v))}
        </div>
      </Card>

      <!-- Social & footer -->
      <Card id="settings-social" title="Social links & footer" class="scroll-mt-20">
        <div class="space-y-5 p-6 pt-4">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {#each SOCIALS as [key, label]}
              <div><label for="social-{key}" class={labelCls}>{label}</label><input id="social-{key}" bind:value={form.socials[key]} placeholder="https://" class={inputCls} /></div>
            {/each}
          </div>
          <div class="space-y-5 border-t border-border pt-5">
            <div><label for="f-tagline" class={labelCls}>Footer tagline</label><input id="f-tagline" bind:value={form.footerTagline} placeholder="Sign up for drops, exclusives & community news." class={inputCls} /></div>
            {@render imageField('footerlogo', 'Footer logo (optional)', 'Uses the store name when blank.', () => form.footerLogo, (v) => (form.footerLogo = v))}
          </div>
        </div>
      </Card>

      <!-- Maintenance -->
      <Card id="settings-maintenance" class="scroll-mt-20 {form.maintenance.enabled ? 'border-destructive/50' : ''}">
        <div class="space-y-5 p-6">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h3 class="font-semibold leading-none tracking-tight">Maintenance mode</h3>
              <p class="mt-1.5 text-sm text-muted-foreground">Visitors see a holding page. The admin panel stays available.</p>
            </div>
            <Switch bind:checked={form.maintenance.enabled} aria-label="Toggle maintenance mode" />
          </div>

          {#if form.maintenance.enabled}
            <div class="space-y-4 border-t border-border pt-5">
              <p class="rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">Maintenance mode is ON — visitors cannot access the store.</p>
              <div class="flex items-center justify-between gap-4 rounded-lg bg-muted/60 px-4 py-3">
                <div class="text-sm"><p class="font-medium">Collect email addresses</p><p class="text-muted-foreground">Show a “Notify me” form on the maintenance page.</p></div>
                <Switch bind:checked={form.maintenance.collectEmails} aria-label="Toggle email collection" />
              </div>
              <div><label for="maint-title" class={labelCls}>Title</label><input id="maint-title" bind:value={form.maintenance.title} class={inputCls} /></div>
              <div><label for="maint-msg" class={labelCls}>Message</label><textarea id="maint-msg" bind:value={form.maintenance.message} rows={3} class={textareaCls}></textarea></div>
              {@render imageField('maintbg', 'Background image (optional)', 'Shown behind the message. A dark or moody image works well.', () => form.maintenance.background, (v) => (form.maintenance.background = v))}
            </div>
          {/if}
        </div>
      </Card>
    </div>
  </div>

  <div class="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/90 backdrop-blur-sm md:left-60">
    <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-8">
      <p class="text-sm {dirty ? 'text-foreground' : 'text-muted-foreground'}">{dirty ? 'You have unsaved changes' : 'All changes saved'}</p>
      <div class="flex gap-2">
        <Button variant="outline" disabled={!dirty || saving} onclick={handleDiscard}>Discard</Button>
        <Button disabled={!dirty || saving} onclick={handleSave}>
          {#if saving}<LoaderCircle size={15} class="animate-spin" /> Saving…{:else}Save changes{/if}
        </Button>
      </div>
    </div>
  </div>
</div>
