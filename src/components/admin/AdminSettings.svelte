<script>
  import ImageUpload from './ImageUpload.svelte';

  export let site = {};
  export let onUpdate = () => {};
  export let onReset = () => {};
  export let lookbooks = [];
  export let articles = [];

  let form = JSON.parse(JSON.stringify(site));
  if (!form.shipping) form.shipping = { freeMinimum: 500, standardRate: 99, country: 'South Africa' };
  if (!form.hero) form.hero = {};
  if (form.hero.ctaLink === undefined) form.hero.ctaLink = '/shop';
  if (form.hero.video === undefined) form.hero.video = '';
  if (!form.maintenance) form.maintenance = { enabled: false, collectEmails: false, title: "We'll be back soon.", message: 'Our store is currently undergoing scheduled maintenance. Please check back shortly.', background: '' };
  if (form.maintenance.collectEmails === undefined) form.maintenance.collectEmails = false;
  if (!form.socials) form.socials = { instagram: '', twitter: '', tiktok: '', youtube: '' };
  if (form.socials.youtube === undefined) form.socials.youtube = '';
  
  // Backwards compat for old DB schema
  if (form.featuredLookbook === undefined) form.featuredLookbook = '';
  if (form.featuredEditorialType === undefined) form.featuredEditorialType = 'lookbook';

  if (!form.colors) form.colors = { background: '#f8f5f2', foreground: '#211c1a', primary: '#211c1a', border: '#dbd8d4', hover: '#ff4400' };
  if (form.colors.hover === undefined) form.colors.hover = form.colors.primary || '#ff4400';
  if (form.footerLogo === undefined) form.footerLogo = '';
  if (form.footerTagline === undefined) form.footerTagline = '';
  if (form.metaTitle === undefined) form.metaTitle = '';
  if (form.metaDescription === undefined) form.metaDescription = '';
  if (form.navLogoSize === undefined) form.navLogoSize = 28;
  if (form.favicon === undefined) form.favicon = '';
  if (!form.emailTemplates) {
    form.emailTemplates = {
      paid: 'Your payment for order {orderId} has been confirmed. We are now preparing your items for dispatch.',
      shipped: 'Great news! Your order {orderId} has been shipped and is on its way to you.',
      delivered: 'Your order {orderId} has been delivered. We hope you enjoy your new pieces!',
      cancelled: 'Your order {orderId} has been cancelled. If you have any questions, please contact our support team.'
    };
  }
  if (form.adminNotificationEmails === undefined) form.adminNotificationEmails = 'othersworldwide@gmail.com';
  let saved = false;

  function handleSave() {
    onUpdate(form);
    saved = true;
    setTimeout(() => (saved = false), 2000);
  }
</script>

<div class="space-y-8 max-w-2xl">
  <div>
    <h2 class="text-2xl font-display font-bold mb-1">Settings</h2>
    <p class="text-sm text-muted-foreground">Manage store settings, branding and content.</p>
  </div>

  <div class="space-y-6">
    <!-- Branding -->
    <div class="space-y-6 pt-10 pb-4 border-t border-border mt-10 first:mt-0 first:border-0 first:pt-0">
      <h2 class="text-2xl font-display font-bold tracking-tight">BRANDING</h2>
      <div>
        <label for="s-name" class="text-label block mb-1.5">STORE NAME</label>
        <input id="s-name" bind:value={form.name} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
      </div>
      <div>
        <label for="s-tagline" class="text-label block mb-1.5">TAGLINE</label>
        <input id="s-tagline" bind:value={form.tagline} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
      </div>
      <div>
        <label for="s-meta-title" class="text-label block mb-1.5">META TITLE (SEO)</label>
        <p class="text-xs text-muted-foreground mb-1.5">Overrides the title shown in browser tabs and search engines.</p>
        <input id="s-meta-title" bind:value={form.metaTitle} placeholder="e.g. Others. — Official Store" class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
      </div>
      <div>
        <label for="s-meta-desc" class="text-label block mb-1.5">META DESCRIPTION (SEO)</label>
        <p class="text-xs text-muted-foreground mb-1.5">The snippet shown under your website in Google and social previews.</p>
        <textarea id="s-meta-desc" bind:value={form.metaDescription} rows={2} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors resize-none"></textarea>
      </div>
      <div>
        <label for="s-desc" class="text-label block mb-1.5">ABOUT DESCRIPTION</label>
        <p class="text-xs text-muted-foreground mb-1.5">The short paragraph shown in your website footer.</p>
        <textarea id="s-desc" bind:value={form.description} rows={2} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors resize-none"></textarea>
      </div>
      <!-- Logo -->
      <div class="grid md:grid-cols-2 gap-6">
        <div>
          <p class="text-label block mb-1.5">LOGO IMAGE</p>
          <p class="text-xs text-muted-foreground mb-2">Upload a logo image. If none, the store name text is shown.</p>
          <div class="flex items-start gap-4">
            {#if form.logo}
              <div class="flex items-center gap-3">
                <img src={form.logo} alt="Logo" class="h-10 w-auto max-w-[120px] object-contain bg-secondary p-1" />
                <button onclick={() => (form.logo = null)} class="text-xs text-destructive hover:underline">Remove</button>
              </div>
            {/if}
            <ImageUpload label="" value={form.logo || ''} onChange={(url) => (form.logo = url)} />
          </div>
          {#if form.logo}
            <button 
              onclick={() => { form.favicon = form.logo; alert('Favicon updated to use brand logo.'); }}
              class="mt-3 text-[10px] uppercase tracking-wider font-bold border border-border px-3 py-1.5 hover:bg-muted transition-colors active:scale-95"
            >
              USE LOGO AS FAVICON
            </button>
          {/if}
        </div>
        <div>
          <label for="s-logo-size" class="text-label block mb-1.5">NAV LOGO SIZE (PX)</label>
          <p class="text-xs text-muted-foreground mb-2">Adjust the height of your logo in the navigation bar.</p>
          <div class="flex items-center gap-4">
            <input id="s-logo-size" type="range" min="16" max="64" step="2" bind:value={form.navLogoSize} class="flex-1 accent-foreground" />
            <span class="text-sm font-mono w-10 text-right">{form.navLogoSize}px</span>
          </div>
        </div>

        <div>
          <p class="text-label block mb-1.5">EMAIL LOGO (optional)</p>
          <p class="text-xs text-muted-foreground mb-2">Dedicated logo for order emails. Fallback is main logo.</p>
          <div class="flex items-start gap-4">
            {#if form.emailLogo}
              <div class="space-y-2">
                <img src={form.emailLogo} alt="Email Logo" class="h-10 w-auto max-w-[120px] object-contain bg-secondary p-1" />
                <button onclick={() => (form.emailLogo = null)} class="text-xs text-destructive hover:underline">Remove</button>
              </div>
            {/if}
            <ImageUpload label="" value={form.emailLogo || ''} onChange={(url) => (form.emailLogo = url)} />
          </div>
        </div>
      </div>
    </div>

    <!-- Notifications -->
    <div class="space-y-6 pt-10 pb-4 border-t border-border mt-10 first:mt-0 first:border-0 first:pt-0">
      <h2 class="text-2xl font-display font-bold tracking-tight uppercase">Notifications</h2>
      <p class="text-xs text-muted-foreground mb-4">Manage who gets notified of new orders and site events.</p>
      <div>
        <label for="s-admin-emails" class="text-label block mb-1.5 uppercase tracking-widest font-bold">Admin Notification Emails</label>
        <p class="text-xs text-muted-foreground mb-2">Separate multiple email addresses with commas. All selected admins will be notified of new orders and system alerts.</p>
        <input id="s-admin-emails" bind:value={form.adminNotificationEmails} placeholder="othersworldwide@gmail.com, admin@store.com" class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
      </div>
    </div>

    <!-- Color Palette -->
    <div class="space-y-6 pt-10 pb-4 border-t border-border mt-10 first:mt-0 first:border-0 first:pt-0">
      <h2 class="text-2xl font-display font-bold tracking-tight">COLOR PALETTE</h2>
      <p class="text-xs text-muted-foreground mb-4">Customize the global colors of the website.</p>
      <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div>
          <label for="c-bg" class="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Background</label>
          <div class="flex items-center gap-2 border border-border p-1 bg-background">
            <input id="c-bg" type="color" bind:value={form.colors.background} class="w-8 h-8 cursor-pointer rounded-none border-0 p-0" />
            <span class="text-xs font-mono">{form.colors.background}</span>
          </div>
        </div>
        <div>
          <label for="c-fg" class="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Foreground (Text)</label>
          <div class="flex items-center gap-2 border border-border p-1 bg-background">
            <input id="c-fg" type="color" bind:value={form.colors.foreground} class="w-8 h-8 cursor-pointer rounded-none border-0 p-0" />
            <span class="text-xs font-mono">{form.colors.foreground}</span>
          </div>
        </div>
        <div>
          <label for="c-pr" class="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Primary Accents</label>
          <div class="flex items-center gap-2 border border-border p-1 bg-background">
            <input id="c-pr" type="color" bind:value={form.colors.primary} class="w-8 h-8 cursor-pointer rounded-none border-0 p-0" />
            <span class="text-xs font-mono">{form.colors.primary}</span>
          </div>
        </div>
        <div>
          <label for="c-bo" class="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Borders</label>
          <div class="flex items-center gap-2 border border-border p-1 bg-background">
            <input id="c-bo" type="color" bind:value={form.colors.border} class="w-8 h-8 cursor-pointer rounded-none border-0 p-0" />
            <span class="text-xs font-mono">{form.colors.border}</span>
          </div>
        </div>
        <div>
          <label for="c-ho" class="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Hover State</label>
          <div class="flex items-center gap-2 border border-border p-1 bg-background">
            <input id="c-ho" type="color" bind:value={form.colors.hover} class="w-8 h-8 cursor-pointer rounded-none border-0 p-0" />
            <span class="text-xs font-mono">{form.colors.hover}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Announcement -->
    <div class="space-y-6 pt-10 pb-4 border-t border-border mt-10 first:mt-0 first:border-0 first:pt-0">
      <h2 class="text-2xl font-display font-bold tracking-tight">ANNOUNCEMENT BAR</h2>
      <div>
        <label for="s-ann" class="text-label block mb-1.5">ANNOUNCEMENT TEXT</label>
        <input id="s-ann" bind:value={form.announcement} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
      </div>
      <div>
        <label for="s-cur" class="text-label block mb-1.5">CURRENCY SYMBOL</label>
        <input id="s-cur" bind:value={form.currency} class="w-full max-w-[80px] bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
      </div>
    </div>

    <!-- Shipping -->
    <div class="space-y-6 pt-10 pb-4 border-t border-border mt-10 first:mt-0 first:border-0 first:pt-0">
      <h2 class="text-2xl font-display font-bold tracking-tight">SHIPPING</h2>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label for="s-free-min" class="text-label block mb-1.5">FREE SHIPPING MINIMUM ({form.currency})</label>
          <input id="s-free-min" type="number" min="0" bind:value={form.shipping.freeMinimum} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors tabular-nums" />
        </div>
        <div>
          <label for="s-std-rate" class="text-label block mb-1.5">STANDARD RATE ({form.currency})</label>
          <input id="s-std-rate" type="number" min="0" bind:value={form.shipping.standardRate} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors tabular-nums" />
        </div>
      </div>
      <p class="text-xs text-muted-foreground">Orders above the free shipping minimum qualify for free delivery. Checkout is restricted to South Africa only.</p>
    </div>

    <!-- Hero -->
    <div class="space-y-6 pt-10 pb-4 border-t border-border mt-10 first:mt-0 first:border-0 first:pt-0">
      <h2 class="text-2xl font-display font-bold tracking-tight">HERO SECTION</h2>
      <div>
        <label for="h-label" class="text-label block mb-1.5">SEASON LABEL</label>
        <input id="h-label" bind:value={form.hero.label} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
      </div>
      <div>
        <label for="h-heading" class="text-label block mb-1.5">HERO TITLE</label>
        <input id="h-heading" bind:value={form.hero.heading} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
      </div>
      <div>
        <label for="h-sub" class="text-label block mb-1.5">HERO SUBTITLE</label>
        <input id="h-sub" bind:value={form.hero.subheading} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
      </div>
      <div>
        <label for="h-cta" class="text-label block mb-1.5">CTA BUTTON TEXT</label>
        <input id="h-cta" bind:value={form.hero.cta} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
      </div>
      <div>
        <label for="h-cta-link" class="text-label block mb-1.5">CTA BUTTON LINK</label>
        <input id="h-cta-link" bind:value={form.hero.ctaLink} placeholder="/shop" class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
        <p class="text-xs text-muted-foreground mt-1">Use a relative path (e.g. /shop, /lookbook) or a full URL.</p>
      </div>
      <!-- Hero background: image OR video/gif -->
      <div class="space-y-3">
        <p class="text-label">HERO BACKGROUND</p>
        <p class="text-xs text-muted-foreground">Upload an image <em>or</em> a video/GIF. If both are set, video takes priority.</p>
        <ImageUpload label="IMAGE (JPG/PNG/WEBP)" value={form.hero.image} onChange={(url) => (form.hero.image = url)} />
        <div>
          <p class="text-label block mb-1.5">VIDEO / GIF (MP4, WEBM, GIF)</p>
          {#if form.hero.video}
            <div class="flex items-center gap-3 mb-2">
              <span class="text-xs text-muted-foreground truncate max-w-[200px]">{form.hero.video}</span>
              <button onclick={() => (form.hero.video = '')} class="text-xs text-destructive hover:underline">Remove</button>
            </div>
          {/if}
          <label class="cursor-pointer inline-flex items-center gap-2 border border-border px-3 py-2 text-label hover:bg-muted transition-colors text-xs">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
            UPLOAD VIDEO/GIF
            <input
              type="file"
              accept="video/mp4,video/webm,image/gif"
              class="sr-only"
              onchange={async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const fd = new FormData();
                fd.append('image', file);
                const res = await fetch('/api/upload', { method: 'POST', body: fd, credentials: 'include' });
                if (res.ok) { const { url } = await res.json(); form.hero.video = url; }
              }}
            />
          </label>
        </div>
      </div>
    </div>

    <!-- Maintenance Mode -->
    <div class="space-y-4 bg-card border {form.maintenance.enabled ? 'border-red-400' : 'border-border'} p-5">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h3 class="text-label text-red-500">MAINTENANCE MODE</h3>
          <p class="text-xs text-muted-foreground mt-0.5">When enabled, visitors see a maintenance page. Admins can still access /admin.</p>
        </div>
        <!-- Toggle switch -->
        <button
          role="switch"
          aria-label="Toggle maintenance mode"
          aria-checked={form.maintenance.enabled}
          onclick={() => (form.maintenance.enabled = !form.maintenance.enabled)}
          class="relative flex-shrink-0 w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none {form.maintenance.enabled ? 'bg-red-500' : 'bg-muted'}"
        >
          <span class="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 {form.maintenance.enabled ? 'translate-x-6' : 'translate-x-0'}"></span>
        </button>
      </div>

      {#if form.maintenance.enabled}
        <div class="pt-2 space-y-4 border-t border-border/50">
          <p class="text-[11px] uppercase tracking-widest text-red-500 font-medium">⚠ Maintenance mode is ON — visitors cannot access the store.</p>

          <!-- Collect emails toggle -->
          <div class="flex items-center justify-between bg-muted/40 px-4 py-3 rounded">
            <div>
              <p class="text-sm font-medium">Collect email addresses</p>
              <p class="text-xs text-muted-foreground mt-0.5">Show a "Notify me" form on the maintenance page.</p>
            </div>
            <button
              role="switch"
              aria-label="Toggle email collection"
              aria-checked={form.maintenance.collectEmails}
              onclick={() => (form.maintenance.collectEmails = !form.maintenance.collectEmails)}
              class="relative flex-shrink-0 w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none {form.maintenance.collectEmails ? 'bg-foreground' : 'bg-muted'}"
            >
              <span class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 {form.maintenance.collectEmails ? 'translate-x-5' : 'translate-x-0'}"></span>
            </button>
          </div>

          <div>
            <label for="maint-title" class="text-label block mb-1.5">MAINTENANCE TITLE</label>
            <input id="maint-title" bind:value={form.maintenance.title} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
          </div>
          <div>
            <label for="maint-msg" class="text-label block mb-1.5">MAINTENANCE MESSAGE</label>
            <textarea id="maint-msg" bind:value={form.maintenance.message} rows={3} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors resize-none"></textarea>
          </div>
          <div>
            <p class="text-label block mb-1.5">BACKGROUND IMAGE (optional)</p>
            <p class="text-xs text-muted-foreground mb-2">Shown behind the maintenance message. Recommended: a dark or moody image.</p>
            <div class="flex items-start gap-4">
              {#if form.maintenance.background}
                <div class="flex items-center gap-3">
                  <img src={form.maintenance.background} alt="Maintenance BG" class="h-16 w-24 object-cover bg-secondary" />
                  <button onclick={() => (form.maintenance.background = '')} class="text-xs text-destructive hover:underline">Remove</button>
                </div>
              {/if}
              <ImageUpload label="" value={form.maintenance.background || ''} onChange={(url) => (form.maintenance.background = url)} />
            </div>
          </div>
        </div>
      {/if}
    </div>

    <!-- Featured Editorial -->
    <div class="space-y-6 pt-10 pb-4 border-t border-border mt-10 first:mt-0 first:border-0 first:pt-0">
      <h2 class="text-2xl font-display font-bold tracking-tight">FEATURED EDITORIAL</h2>
      <p class="text-xs text-muted-foreground">Choose an Article or Lookbook to promote natively on the home page.</p>

      <div class="grid grid-cols-2 gap-4">
        <select bind:value={form.featuredEditorialType} class="col-span-2 md:col-span-1 border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors cursor-pointer bg-background">
          <option value="lookbook">Lookbook</option>
          <option value="article">Article</option>
        </select>

        {#if form.featuredEditorialType === 'article'}
          {#if !articles || articles.length === 0}
            <p class="text-xs text-muted-foreground italic col-span-2 md:col-span-1 flex items-center">No articles found.</p>
          {:else}
            <select bind:value={form.featuredLookbook} class="col-span-2 md:col-span-1 border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors cursor-pointer bg-background">
              <option value="">— Latest article (default) —</option>
              {#each articles.filter(a => a.published) as a}
                <option value={a.id}>{a.title}</option>
              {/each}
            </select>
          {/if}
          
          <div class="col-span-2 space-y-4 mt-2">
             <div>
               <label class="text-[10px] tracking-[0.15em] text-muted-foreground uppercase font-bold">Heading Override (Optional)</label>
               <input bind:value={form.featuredEditorialHeading} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm mt-1.5 focus:outline-none focus:border-foreground transition-colors" placeholder="e.g. LATEST EDITORIAL" />
             </div>
             <div>
               <label class="text-[10px] tracking-[0.15em] text-muted-foreground uppercase font-bold">Message Override (Optional)</label>
               <textarea bind:value={form.featuredEditorialMessage} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm mt-1.5 focus:outline-none focus:border-foreground transition-colors" rows="2" placeholder="e.g. Read the full story behind the collection..."></textarea>
             </div>
             <div>
               <label class="text-[10px] tracking-[0.15em] text-muted-foreground uppercase font-bold">CTA Button Text (Optional)</label>
               <input bind:value={form.featuredEditorialCta} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm mt-1.5 focus:outline-none focus:border-foreground transition-colors" placeholder="e.g. Read Article" />
             </div>
          </div>
        {:else}
          {#if !lookbooks || lookbooks.length === 0}
            <p class="text-xs text-muted-foreground italic col-span-2 md:col-span-1 flex items-center">No lookbooks found.</p>
          {:else}
            <select bind:value={form.featuredLookbook} class="col-span-2 md:col-span-1 border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors cursor-pointer bg-background">
              <option value="">— Latest lookbook (default) —</option>
              {#each lookbooks as lb}
                <option value={lb.id}>{lb.title}</option>
              {/each}
            </select>
          {/if}
        {/if}
      </div>
    </div>

    <!-- Socials -->
    <div class="space-y-6 pt-10 pb-4 border-t border-border mt-10 first:mt-0 first:border-0 first:pt-0">
      <h2 class="text-2xl font-display font-bold tracking-tight">SOCIAL LINKS</h2>
      {#each [['instagram','Instagram'],['twitter','X / Twitter'],['tiktok','TikTok'],['youtube','YouTube']] as [key, label]}
        <div>
          <label for="social-{key}" class="text-label block mb-1.5">{label}</label>
          <input id="social-{key}" bind:value={form.socials[key]} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
        </div>
      {/each}
    </div>

    <!-- Order Emails -->
    <div class="space-y-6 pt-10 pb-4 border-t border-border mt-10 first:mt-0 first:border-0 first:pt-0">
      <h2 class="text-2xl font-display font-bold tracking-tight">ORDER NOTIFICATIONS</h2>
      <p class="text-xs text-muted-foreground mb-4">Customize the automated messages sent to customers when their order status changes. Use <code class="bg-muted px-1 rounded">{"{orderId}"}</code> to inject the order reference.</p>
      
      <div class="space-y-4">
        {#each [
          { key: 'paid', label: 'PAYMENT CONFIRMED (PAID)' },
          { key: 'shipped', label: 'ORDER SHIPPED' },
          { key: 'delivered', label: 'ORDER DELIVERED' },
          { key: 'cancelled', label: 'ORDER CANCELLED' }
        ] as template}
          <div>
            <label for="template-{template.key}" class="text-label block mb-1.5">{template.label}</label>
            <textarea id="template-{template.key}" bind:value={form.emailTemplates[template.key]} rows={2} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors resize-none"></textarea>
          </div>
        {/each}
      </div>
    </div>

    <!-- Footer Content -->
    <div class="space-y-6 pt-10 pb-4 border-t border-border mt-10 first:mt-0 first:border-0 first:pt-0">
      <h2 class="text-2xl font-display font-bold tracking-tight">FOOTER CONTENT</h2>
      <div>
        <label for="f-tagline" class="text-label block mb-1.5">FOOTER TAGLINE</label>
        <input id="f-tagline" bind:value={form.footerTagline} placeholder="Sign up for drops, exclusives & community news." class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
      </div>
      <div>
        <p class="text-label block mb-1.5">FOOTER LOGO (optional)</p>
        <p class="text-xs text-muted-foreground mb-2">Upload a specific logo for the footer area. Uses main site name if blank.</p>
        <div class="flex items-start gap-4">
          {#if form.footerLogo}
            <div class="flex items-center gap-3">
              <img src={form.footerLogo} alt="Footer Logo" class="h-10 w-auto max-w-[120px] object-contain bg-secondary p-1" />
              <button onclick={() => (form.footerLogo = '')} class="text-xs text-destructive hover:underline">Remove</button>
            </div>
          {/if}
          <ImageUpload label="" value={form.footerLogo || ''} onChange={(url) => (form.footerLogo = url)} />
        </div>
      </div>
    </div>

    <div class="flex gap-3">
      <button onclick={handleSave} class="flex items-center gap-2 bg-foreground text-primary-foreground px-5 py-2.5 text-label tracking-[0.15em] hover:bg-foreground/90 transition-colors active:scale-[0.97]">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 6 9 17l-5-5"/></svg>
        {saved ? 'SAVED!' : 'SAVE CHANGES'}
      </button>
      <button onclick={onReset} class="flex items-center gap-2 px-5 py-2.5 text-label tracking-[0.15em] border border-border hover:bg-muted transition-colors active:scale-[0.97] text-destructive">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
        RESET ALL DATA
      </button>
    </div>
  </div>
</div>
