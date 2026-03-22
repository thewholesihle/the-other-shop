<script>
  import ImageUpload from './ImageUpload.svelte';

  export let site = {};
  export let onUpdate = () => {};
  export let onReset = () => {};

  let form = JSON.parse(JSON.stringify(site));
  if (!form.shipping) form.shipping = { freeMinimum: 500, standardRate: 99, country: 'South Africa' };
  if (!form.hero) form.hero = {};
  if (form.hero.ctaLink === undefined) form.hero.ctaLink = '/products';
  if (form.hero.video === undefined) form.hero.video = '';
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
    <div class="space-y-4 bg-card border border-border p-5">
      <h3 class="text-label">BRANDING</h3>
      <div>
        <label for="s-name" class="text-label block mb-1.5">STORE NAME</label>
        <input id="s-name" bind:value={form.name} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
      </div>
      <div>
        <label for="s-tagline" class="text-label block mb-1.5">TAGLINE</label>
        <input id="s-tagline" bind:value={form.tagline} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
      </div>
      <div>
        <label for="s-desc" class="text-label block mb-1.5">DESCRIPTION</label>
        <textarea id="s-desc" bind:value={form.description} rows={2} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors resize-none"></textarea>
      </div>
      <!-- Logo -->
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
      </div>
    </div>

    <!-- Announcement -->
    <div class="space-y-4 bg-card border border-border p-5">
      <h3 class="text-label">ANNOUNCEMENT BAR</h3>
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
    <div class="space-y-4 bg-card border border-border p-5">
      <h3 class="text-label">SHIPPING</h3>
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
    <div class="space-y-4 bg-card border border-border p-5">
      <h3 class="text-label">HERO SECTION</h3>
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
        <input id="h-cta-link" bind:value={form.hero.ctaLink} placeholder="/products" class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
        <p class="text-xs text-muted-foreground mt-1">Use a relative path (e.g. /products, /lookbook) or a full URL.</p>
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

    <!-- Socials -->
    <div class="space-y-4 bg-card border border-border p-5">
      <h3 class="text-label">SOCIAL LINKS</h3>
      {#each [['instagram','Instagram'],['twitter','X / Twitter'],['tiktok','TikTok']] as [key, label]}
        <div>
          <label for="social-{key}" class="text-label block mb-1.5">{label}</label>
          <input id="social-{key}" bind:value={form.socials[key]} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
        </div>
      {/each}
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
