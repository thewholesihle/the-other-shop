<script>
  // Settings → Typography: pick the storefront's heading and body fonts from Google Fonts or upload your own.
  // The server validates and applies them (src/fonts.js); this shows a live preview while you choose.
  import { selectCls, inputCls, labelCls, hintCls } from '../../lib/ui.js';
  import Button from '../ui/Button.svelte';
  import { toast } from '../../lib/toast.js';
  import LoaderCircle from 'lucide-svelte/icons/loader-circle';
  import CircleCheck from 'lucide-svelte/icons/circle-check';
  import TriangleAlert from 'lucide-svelte/icons/triangle-alert';
  import Upload from 'lucide-svelte/icons/upload';
  import X from 'lucide-svelte/icons/x';

  let { fonts = $bindable() } = $props();

  const SLOTS = [
    { key: 'heading', title: 'Headings', blurb: 'Page titles, section headings and product names.', sample: 'New season, new silhouettes' },
    { key: 'body', title: 'Body text', blurb: 'Paragraphs, menus, buttons and prices.', sample: 'Heavyweight cotton, cut boxy and made to last. Free shipping over R500.' },
  ];
  const POPULAR = ['Inter', 'Poppins', 'DM Sans', 'Manrope', 'Montserrat', 'Work Sans', 'Archivo', 'Syne', 'Outfit', 'Sora', 'Space Mono', 'Playfair Display', 'Cormorant Garamond', 'Lora', 'DM Serif Display', 'Bebas Neue', 'Oswald', 'Anton', 'Roboto', 'Open Sans'];

  let status = $state({ heading: null, body: null });        // { checking } | { ok, weights } | { error }
  let uploading = $state({ heading: false, body: false });

  const safe = (name) => String(name || '').replace(/[^A-Za-z0-9 _-]/g, '');
  const options = (slot) => (slot === 'heading'
    ? [['default', 'Default (Space Grotesk)'], ['body', 'Same as body text'], ['google', 'A Google Font'], ['upload', 'Upload my own font']]
    : [['default', 'Default (Space Grotesk)'], ['google', 'A Google Font'], ['upload', 'Upload my own font']]);

  async function check(slot) {
    const family = (fonts[slot].family || '').trim();
    if (!family) { status[slot] = null; return; }
    status[slot] = { checking: true };
    try {
      const res = await fetch('/api/admin/fonts/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ family }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not check that font.');
      fonts[slot].family = body.family; fonts[slot].url = body.url;
      status[slot] = { ok: true, weights: body.weights };
    } catch (e) {
      fonts[slot].url = '';
      status[slot] = { error: e.message };
    }
  }

  async function upload(slot, file) {
    if (!file) return;
    uploading[slot] = true; status[slot] = null;
    try {
      const fd = new FormData();
      fd.append('font', file);
      const res = await fetch('/api/upload/font', { method: 'POST', body: fd, credentials: 'include' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Upload failed.');
      fonts[slot].file = body.url; fonts[slot].family = body.family; fonts[slot].format = body.format;
      toast.success('Font uploaded. Save to apply it.');
    } catch (e) {
      status[slot] = { error: e.message };
    } finally {
      uploading[slot] = false;
    }
  }

  function change(slot, source) {
    fonts[slot] = { source, family: '', url: '', file: '', format: '' };
    status[slot] = null;
  }

  // Everything the preview needs in <head>: Google stylesheets and @font-face rules for uploaded files. Only values the
  // server produced (or sanitised here) go in.
  let previewHead = $derived.by(() => {
    let out = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&amp;display=swap">';
    let css = '';
    for (const { key } of SLOTS) {
      const f = fonts?.[key];
      if (f?.source === 'google' && f.url?.startsWith('https://fonts.googleapis.com/css2?family=')) out += `<link rel="stylesheet" href="${f.url.replace(/&/g, '&amp;').replace(/"/g, '')}">`;
      if (f?.source === 'upload' && f.file && /^(https:\/\/res\.cloudinary\.com\/|\/dev-uploads\/)[\w\-./%]+$/.test(f.file)) css += `@font-face{font-family:"${safe(f.family)}";src:url("${f.file}");font-weight:100 900;font-display:swap}`;
    }
    return out + (css ? `<style>${css}</style>` : '');
  });

  function previewFamily(slot) {
    const f = fonts?.[slot];
    if (slot === 'heading' && f?.source === 'body') return previewFamily('body');
    if ((f?.source === 'google' && f.url) || (f?.source === 'upload' && f.file)) return `"${safe(f.family)}", ui-sans-serif, system-ui, sans-serif`;
    return '"Space Grotesk", ui-sans-serif, system-ui, sans-serif';
  }
</script>

<svelte:head>{@html previewHead}</svelte:head>

<datalist id="popular-fonts">{#each POPULAR as name}<option value={name}></option>{/each}</datalist>

<div class="space-y-6 p-6 pt-4">
  {#each SLOTS as { key, title, blurb, sample }}
    {@const f = fonts[key]}
    {@const st = status[key]}
    <div class="space-y-3">
      <div>
        <p class="text-sm font-semibold">{title}</p>
        <p class="text-sm text-muted-foreground">{blurb}</p>
      </div>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-[220px_minmax(0,1fr)]">
        <div>
          <label for="font-src-{key}" class={labelCls}>Font</label>
          <select id="font-src-{key}" value={f.source} onchange={(e) => change(key, e.target.value)} class={selectCls}>
            {#each options(key) as [value, text]}<option {value}>{text}</option>{/each}
          </select>
        </div>

        {#if f.source === 'google'}
          <div>
            <label for="font-fam-{key}" class={labelCls}>Google Font name</label>
            <div class="flex gap-2">
              <input
                id="font-fam-{key}" list="popular-fonts" bind:value={f.family} maxlength="60" autocomplete="off" spellcheck="false"
                placeholder="e.g. Playfair Display" aria-invalid={st?.error ? 'true' : undefined} aria-describedby="font-msg-{key}"
                oninput={() => { f.url = ''; status[key] = null; }}
                onchange={() => check(key)} onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); check(key); } }}
                class={inputCls} />
              <Button variant="outline" onclick={() => check(key)} disabled={!f.family?.trim() || st?.checking}>
                {#if st?.checking}<LoaderCircle size={14} class="animate-spin" />{/if} Check
              </Button>
            </div>
          </div>
        {:else if f.source === 'upload'}
          <div>
            <p class={labelCls}>Font file</p>
            <div class="flex flex-wrap items-center gap-3">
              <label class="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-2 text-sm font-medium transition-colors hover:bg-accent focus-within:ring-2 focus-within:ring-ring/40 {uploading[key] ? 'pointer-events-none opacity-60' : ''}">
                {#if uploading[key]}<LoaderCircle size={14} class="animate-spin" /> Uploading…{:else}<Upload size={14} /> {f.file ? 'Replace file' : 'Choose file'}{/if}
                <input type="file" class="sr-only" accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf" onchange={(e) => { upload(key, e.target.files[0]); e.target.value = ''; }} />
              </label>
              {#if f.file}
                <span class="text-sm text-muted-foreground">{f.family}.{f.format}</span>
                <button type="button" class="inline-flex items-center gap-1 text-xs text-destructive hover:underline" onclick={() => change(key, 'upload')}><X size={12} /> Remove</button>
              {/if}
            </div>
          </div>
        {/if}
      </div>

      <div id="font-msg-{key}" aria-live="polite">
        {#if st?.ok}<p class="flex items-center gap-1.5 text-xs text-muted-foreground"><CircleCheck size={13} class="text-success" /> Found on Google Fonts (weights {st.weights}).</p>{/if}
        {#if st?.error}<p role="alert" class="flex items-start gap-1.5 text-xs text-destructive"><TriangleAlert size={13} class="mt-px shrink-0" /> {st.error}</p>{/if}
        {#if f.source === 'google' && f.family && !f.url && !st}<p class="text-xs text-muted-foreground">Press Check to confirm the name and preview it. It is also checked when you save.</p>{/if}
        {#if f.source === 'upload'}<p class="text-xs text-muted-foreground">.woff2 is best (smallest). One file is used for every weight, so use a variable font if you want true bold.</p>{/if}
      </div>

      <!-- Live preview -->
      <div class="rounded-lg border border-border bg-muted/40 p-4" style="font-family: {previewFamily(key)}">
        {#if key === 'heading'}
          <p class="text-2xl font-bold leading-tight">{sample}</p>
        {:else}
          <p class="text-sm leading-relaxed">{sample}</p>
          <p class="mt-2 text-xs font-semibold uppercase tracking-[0.2em]">Shop all &nbsp; R450.00</p>
        {/if}
      </div>
    </div>
  {/each}

  <p class={hintCls}>The admin panel always keeps its own typeface. Emails use standard system fonts, because most email apps ignore web fonts.</p>
</div>
