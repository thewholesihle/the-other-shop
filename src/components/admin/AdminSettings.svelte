<script>
  import { thumb, getOptimizedUrl } from '../../lib/cloudinary.js';
  import ImageUpload from './ImageUpload.svelte';
  import Button from '../ui/Button.svelte';
  import Card from '../ui/Card.svelte';
  import Switch from '../ui/Switch.svelte';
  import { inputCls, textareaCls, selectCls, labelCls, hintCls } from '../../lib/ui.js';
  import { toast } from '../../lib/toast.js';
  import { confirmDialog } from '../../lib/confirm.js';
  import LoaderCircle from 'lucide-svelte/icons/loader-circle';
  import Upload from 'lucide-svelte/icons/upload';

  let { site = {}, onUpdate = () => {}, lookbooks = [], articles = [] } = $props();

  /** Fills in defaults for settings that older databases don't have yet. */
  function normalize(src) {
    const f = JSON.parse(JSON.stringify(src || {}));
    f.shipping ??= { freeMinimum: 500, standardRate: 99, country: 'South Africa' };
    f.hero ??= {};
    f.hero.ctaLink ??= '/shop';
    f.hero.video ??= '';
    f.maintenance ??= { enabled: false, collectEmails: false, title: "We'll be back soon.", message: 'Our store is currently undergoing scheduled maintenance. Please check back shortly.', background: '' };
    f.maintenance.collectEmails ??= false;
    f.socials ??= { instagram: '', twitter: '', tiktok: '', youtube: '' };
    f.socials.youtube ??= '';
    f.featuredLookbook ??= '';
    f.featuredEditorialType ??= 'lookbook';
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
    return f;
  }

  // The form owns an editable copy of the saved settings, captured once on mount.
  // svelte-ignore state_referenced_locally
  let form = $state(normalize(site));
  // svelte-ignore state_referenced_locally
  let snapshot = $state(JSON.stringify(form));
  let saving = $state(false);
  let uploadingVideo = $state(false);
  let dirty = $derived(JSON.stringify(form) !== snapshot);

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

  async function uploadHeroVideo(e) {
    const file = e.target.files[0];
    if (!file) return;
    uploadingVideo = true;
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd, credentials: 'include' });
      if (!res.ok) throw new Error('Upload failed');
      const { url } = await res.json();
      form.hero.video = url;
    } catch (err) {
      toast.error(err.message);
    } finally {
      uploadingVideo = false;
      e.target.value = '';
    }
  }

  const SECTIONS = [
    { id: 'identity', label: 'Store identity' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'storefront', label: 'Homepage' },
    { id: 'shipping', label: 'Shipping' },
    { id: 'emails', label: 'Emails & alerts' },
    { id: 'seo', label: 'SEO & sharing' },
    { id: 'social', label: 'Social & footer' },
    { id: 'maintenance', label: 'Maintenance' },
  ];

  function jump(id) {
    document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

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
        <button type="button" onclick={() => jump(s.id)} class="rounded-md px-3 py-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">{s.label}</button>
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
              {@render imageField('favicon', 'Favicon', 'The browser tab icon. A square image works best; falls back to the logo.', () => form.favicon, (v) => (form.favicon = v), 'square')}
              {#if form.logo && !form.favicon}
                <Button variant="outline" size="sm" class="mt-3" onclick={() => (form.favicon = form.logo)}>Use logo as favicon</Button>
              {/if}
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
                <input id="c-{key}" type="color" bind:value={form.colors[key]} class="h-8 w-8 cursor-pointer rounded border-0 bg-transparent p-0" />
                <span class="text-xs uppercase tabular-nums text-muted-foreground">{form.colors[key]}</span>
              </div>
            </div>
          {/each}
        </div>
      </Card>

      <!-- Homepage -->
      <Card id="settings-storefront" title="Homepage" description="The announcement bar, hero and featured editorial." class="scroll-mt-20">
        <div class="space-y-6 p-6 pt-4">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_120px]">
            <div><label for="s-ann" class={labelCls}>Announcement bar</label><input id="s-ann" bind:value={form.announcement} class={inputCls} /></div>
            <div><label for="s-cur" class={labelCls}>Currency</label><input id="s-cur" bind:value={form.currency} class={inputCls} /></div>
          </div>

          <div class="space-y-4 border-t border-border pt-6">
            <p class="text-sm font-semibold">Hero</p>
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
              <div>
                <p class={labelCls}>Background video / GIF</p>
                {#if form.hero.video}
                  <div class="mb-2 flex items-center gap-3 text-sm">
                    <span class="max-w-[260px] truncate text-muted-foreground">{form.hero.video}</span>
                    <button type="button" onclick={() => (form.hero.video = '')} class="text-xs text-destructive hover:underline">Remove</button>
                  </div>
                {/if}
                <label class="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm transition-colors hover:bg-accent focus-within:ring-2 focus-within:ring-ring/50">
                  {#if uploadingVideo}<LoaderCircle size={15} class="animate-spin" /> Uploading…{:else}<Upload size={15} /> Upload video or GIF{/if}
                  <input type="file" accept="video/mp4,video/webm,image/gif" class="sr-only" onchange={uploadHeroVideo} />
                </label>
              </div>
            </div>
          </div>

          <div class="space-y-4 border-t border-border pt-6">
            <p class="text-sm font-semibold">Featured editorial</p>
            <p class="text-sm text-muted-foreground">Promote an article or lookbook on the home page.</p>
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

      <!-- Emails & alerts -->
      <Card id="settings-emails" title="Emails & alerts" description="Who is notified, and what customers are told when an order changes." class="scroll-mt-20">
        <div class="space-y-5 p-6 pt-4">
          <div>
            <label for="s-admin-emails" class={labelCls}>Admin notification emails</label>
            <input id="s-admin-emails" bind:value={form.adminNotificationEmails} placeholder="you@store.com, partner@store.com" class={inputCls} />
            <p class={hintCls}>Separate several addresses with commas. They receive new-order and system alerts.</p>
          </div>
          <div class="space-y-4 border-t border-border pt-5">
            <p class="text-sm text-muted-foreground">Use <code class="rounded bg-muted px-1.5 py-0.5 text-xs">{'{orderId}'}</code> to insert the order reference.</p>
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

  <div class="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/90 backdrop-blur md:left-60">
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
