<script>
  import { thumb, getOptimizedUrl, getVideoPoster } from '../../lib/cloudinary.js';
  import { uploadImage } from '../../lib/imageUpload.js';
  import { onMount } from 'svelte';
  import { uploadVideo, videoCapabilities } from '../../lib/videoUpload.js';
  import { itemKind, lookbookCover, describeShape, measureImage, measureVideo } from '../../lib/lookbook.js';
  import ImageUpload from './ImageUpload.svelte';
  import VideoUpload from './VideoUpload.svelte';
  import Button from '../ui/Button.svelte';
  import Card from '../ui/Card.svelte';
  import Badge from '../ui/Badge.svelte';
  import { inputCls, textareaCls, labelCls } from '../../lib/ui.js';
  import { toast } from '../../lib/toast.js';
  import { confirmDialog } from '../../lib/confirm.js';
  import Plus from 'lucide-svelte/icons/plus';
  import Pencil from 'lucide-svelte/icons/pencil';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import ArrowLeft from 'lucide-svelte/icons/arrow-left';
  import ArrowUp from 'lucide-svelte/icons/arrow-up';
  import ArrowDown from 'lucide-svelte/icons/arrow-down';
  import X from 'lucide-svelte/icons/x';
  import LoaderCircle from 'lucide-svelte/icons/loader-circle';
  import ImageIcon from 'lucide-svelte/icons/image';
  import Video from 'lucide-svelte/icons/video';
  import Link from 'lucide-svelte/icons/link';
  import Upload from 'lucide-svelte/icons/upload';
  import RotateCw from 'lucide-svelte/icons/rotate-cw';
  import TriangleAlert from 'lucide-svelte/icons/triangle-alert';

  let { lookbooks = [], onUpdate = () => {}, onLocalUpdate = null } = $props();
  const syncLocal = (list) => (onLocalUpdate || onUpdate)(list);

  let editing = $state(null);
  let isNew = $state(false);
  let saving = $state(false);
  let deletingId = $state(null);
  let snapshot = $state('');
  let dirty = $derived(editing ? JSON.stringify(editing) !== snapshot : false);

  const empty = () => ({
    id: '', title: '', description: '', date: new Date().toISOString().slice(0, 10),
    coverImage: '', items: []
  });

  let seq = 0;
  const newKey = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;
  const files = new Map();            // key -> File, so a failed upload can be retried

  function startEditing(lb) {
    const base = lb
      ? { ...lb, items: lb.items ?? lb.images?.map(url => ({ type: 'image', url, caption: '' })) ?? [] }
      : empty();
    editing = { ...base, items: base.items.map(i => ({ width: 0, height: 0, ...i, _k: newKey() })) };
    isNew = !lb;
    snapshot = JSON.stringify(editing);
    backfillSizes();
  }

  // Lookbooks saved before sizes were recorded: read each item's shape once, so the storefront can lay vertical and wide
  // media out correctly. It is part of the loaded state, so it doesn't count as an unsaved change.
  async function backfillSizes() {
    const target = editing;
    const todo = target.items.filter(i => i.url && !(i.width > 0 && i.height > 0) && itemKind(i) !== 'embed');
    if (!todo.length) return;
    const found = new Map();
    await Promise.all(todo.map(async (i) => {
      const video = itemKind(i) === 'video';
      const still = video ? getVideoPoster(i.url, 640) : i.url;
      const size = still ? await measureImage(still) : (video ? await measureVideo(i.url) : null);
      if (size) found.set(i._k, size);
    }));
    if (editing !== target || !found.size) return;                      // closed, or already edited meanwhile
    const wasDirty = dirty;
    editing = { ...editing, items: editing.items.map(i => found.has(i._k) ? { ...i, ...found.get(i._k) } : i) };
    if (!wasDirty) snapshot = JSON.stringify(editing);
  }

  function closeEditor() { files.clear(); editing = null; isNew = false; }

  async function requestClose() {
    if (dirty && !(await confirmDialog.ask({
      title: 'Discard changes?', description: 'You have unsaved changes to this lookbook.',
      confirmLabel: 'Discard', destructive: true,
    }))) return;
    closeEditor();
  }

  async function handleSave() {
    if (saving) return;
    if (!editing.title.trim()) return toast.error('Give the lookbook a title.');
    if (uploading > 0) return toast.error(`${uploading} upload${uploading > 1 ? 's are' : ' is'} still in progress. Save once they finish.`);
    if (failedCount > 0) return toast.error('Some uploads failed. Retry or remove them first.');
    saving = true;
    try {
      const clean = { ...editing, items: editing.items.map(({ _k, _up, ...item }) => item) };
      if (isNew) await onUpdate([...lookbooks, { ...clean, id: `lb-${Date.now()}` }]);
      else await onUpdate(lookbooks.map(l => l.id === editing.id ? clean : l));
      closeEditor();
    } catch {
      // Admin.svelte toasts the failure; keep the editor open.
    } finally {
      saving = false;
    }
  }

  async function handleDelete(lb) {
    const ok = await confirmDialog.ask({
      title: `Delete “${lb.title}”?`,
      description: 'The lookbook and its uploaded images are permanently removed.',
      confirmLabel: 'Delete lookbook', destructive: true,
    });
    if (!ok) return;
    deletingId = lb.id;
    try {
      const res = await fetch('/api/lookbooks/' + lb.id, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to delete lookbook.');
      syncLocal(lookbooks.filter(l => l.id !== lb.id));
      toast.success('Lookbook deleted');
    } catch (err) {
      toast.error(err.message);
    } finally {
      deletingId = null;
    }
  }

  // ── Item helpers ────────────────────────────────────────────────────────────
  const blank = (type) => ({ type, url: '', caption: '', width: 0, height: 0, _k: newKey() });
  function addItem(type) { editing = { ...editing, items: [...editing.items, blank(type)] }; }
  function removeItem(i) { files.delete(editing.items[i]._k); editing = { ...editing, items: editing.items.filter((_, idx) => idx !== i) }; }
  function updateItem(i, field, val) {
    editing = { ...editing, items: editing.items.map((item, idx) => idx === i ? { ...item, [field]: val } : item) };
  }
  // A new URL means the old size no longer applies; `size` carries the new one when we know it.
  function setMedia(i, url, size) {
    editing = { ...editing, items: editing.items.map((item, idx) => idx === i ? { ...item, url, width: size?.width || 0, height: size?.height || 0 } : item) };
    if (url && !(size?.width > 0)) backfillSizes();
  }
  const patchByKey = (k, patch) => { if (editing) editing = { ...editing, items: editing.items.map(i => i._k === k ? { ...i, ...patch } : i) }; };
  function moveItem(i, dir) {
    const items = [...editing.items];
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    editing = { ...editing, items };
  }

  // ── Batch upload ────────────────────────────────────────────────────────────
  // Pick or drop any number of photos and videos at once. Each becomes a row straight away (in the order picked) that fills
  // in as its upload finishes. Photos upload a few at a time; videos are compressed by the server one after another.
  const IMAGE_OK = /^image\/(jpeg|png|webp|gif)$/;
  const VIDEO_OK = /^video\/(mp4|quicktime|webm|x-m4v|3gpp2?|x-matroska|mpeg)$/;
  let dragging = $state(false);
  let stripAudio = $state(false);
  let videoCaps = $state(null);
  onMount(async () => { videoCaps = await videoCapabilities(); });
  let uploading = $derived(editing ? editing.items.filter(i => i._up && !i._up.error).length : 0);
  let failedCount = $derived(editing ? editing.items.filter(i => i._up?.error).length : 0);

  async function pool(tasks, limit) {
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (next < tasks.length) await tasks[next++]();
    }));
  }

  async function runUpload(k) {
    const file = files.get(k);
    if (!file) return;
    const name = file.name;
    patchByKey(k, { _up: { name, progress: 0, message: 'Starting…', error: '' } });
    try {
      if (VIDEO_OK.test(file.type)) {
        const { url, stats } = await uploadVideo(file, {
          audio: stripAudio ? 'strip' : 'keep',
          onUpdate: (u) => patchByKey(k, { _up: { name, progress: u.progress, message: u.message, error: '' } }),
        });
        const size = stats?.to?.width ? { width: stats.to.width, height: stats.to.height } : await measureVideo(file);
        patchByKey(k, { type: 'video', url, width: size?.width || 0, height: size?.height || 0, _up: undefined });
      } else {
        const { url, width, height } = await uploadImage(file);
        patchByKey(k, { type: 'image', url, width, height, _up: undefined });
      }
      files.delete(k);
    } catch (e) {
      patchByKey(k, { _up: { name, progress: 0, message: '', error: e.message || 'Upload failed.' } });
    }
  }

  function addFiles(list) {
    const picked = Array.from(list || []);
    if (!picked.length || !editing) return;
    const usable = picked.filter(f => IMAGE_OK.test(f.type) || VIDEO_OK.test(f.type));
    const skipped = picked.length - usable.length;
    if (skipped) toast.error(`${skipped} file${skipped > 1 ? 's were' : ' was'} skipped: only JPG, PNG, WebP, GIF, MP4, MOV and WebM are supported.`);
    if (!usable.length) return;
    const rows = usable.map(f => ({ ...blank(VIDEO_OK.test(f.type) ? 'video' : 'image'), _up: { name: f.name, progress: 0, message: 'Waiting…', error: '' } }));
    rows.forEach((row, i) => files.set(row._k, usable[i]));
    editing = { ...editing, items: [...editing.items, ...rows] };
    pool(rows.filter(r => r.type === 'image').map(r => () => runUpload(r._k)), 3);
    pool(rows.filter(r => r.type === 'video').map(r => () => runUpload(r._k)), 2);
  }

  const retry = (i) => runUpload(editing.items[i]._k);
  function replaceImage(i, file) {
    if (!file || !IMAGE_OK.test(file.type)) return;
    const k = editing.items[i]._k;
    files.set(k, file);
    runUpload(k);
  }

  const TYPE_LABEL = { image: 'Image', video: 'Video', embed: 'Embed' };
</script>

{#if !editing}
  <div class="space-y-6">
    <div class="flex items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Lookbook</h1>
        <p class="text-sm text-muted-foreground">{lookbooks.length} lookbook{lookbooks.length !== 1 ? 's' : ''} — editorial imagery and campaigns.</p>
      </div>
      <Button onclick={() => startEditing(null)}><Plus size={16} /> New lookbook</Button>
    </div>

    {#if lookbooks.length === 0}
      <Card><div class="flex flex-col items-center gap-2 py-16 text-center">
        <ImageIcon size={28} class="text-muted-foreground" />
        <p class="font-medium">No lookbooks yet</p>
        <p class="text-sm text-muted-foreground">Create one to showcase your campaigns.</p>
      </div></Card>
    {:else}
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {#each lookbooks as lb (lb.id)}
          {@const cover = lookbookCover(lb)}
          {@const count = (lb.items ?? lb.images ?? []).length}
          <Card class="group overflow-hidden">
            <button type="button" class="block w-full text-left" onclick={() => startEditing(lb)} aria-label="Edit {lb.title}">
              {#if cover}
                <img src={getOptimizedUrl(cover, 640)} loading="lazy" decoding="async" alt="" class="aspect-[4/3] w-full bg-muted object-cover" />
              {:else}
                <div class="flex aspect-[4/3] w-full items-center justify-center bg-muted text-sm text-muted-foreground">No cover</div>
              {/if}
            </button>
            <div class="flex items-start justify-between gap-2 p-4">
              <div class="min-w-0">
                <p class="truncate font-medium">{lb.title}</p>
                <p class="mt-0.5 text-xs text-muted-foreground">{lb.date} · {count} item{count !== 1 ? 's' : ''}</p>
              </div>
              <div class="flex shrink-0 gap-1">
                <Button variant="ghost" size="icon" aria-label="Edit {lb.title}" onclick={() => startEditing(lb)}><Pencil size={15} /></Button>
                <Button variant="ghost" size="icon" aria-label="Delete {lb.title}" class="hover:text-destructive" disabled={deletingId === lb.id} onclick={() => handleDelete(lb)}>
                  {#if deletingId === lb.id}<LoaderCircle size={15} class="animate-spin" />{:else}<Trash2 size={15} />{/if}
                </Button>
              </div>
            </div>
          </Card>
        {/each}
      </div>
    {/if}
  </div>
{:else}
  <div class="max-w-3xl space-y-6 pb-24">
    <div>
      <button type="button" onclick={requestClose} class="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft size={14} /> Lookbook</button>
      <h1 class="text-2xl font-semibold tracking-tight">{isNew ? 'New lookbook' : editing.title || 'Edit lookbook'}</h1>
    </div>

    <Card title="Details">
      <div class="space-y-5 p-6 pt-4">
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_180px]">
          <div><label for="lb-title" class={labelCls}>Title</label><input id="lb-title" bind:value={editing.title} class={inputCls} /></div>
          <div><label for="lb-date" class={labelCls}>Date</label><input id="lb-date" type="date" bind:value={editing.date} class={inputCls} /></div>
        </div>
        <div><label for="lb-desc" class={labelCls}>Description</label><textarea id="lb-desc" bind:value={editing.description} rows={2} class={textareaCls}></textarea></div>
        <div class="space-y-2">
          <ImageUpload label="Cover image" value={editing.coverImage ?? ''} onChange={(url) => (editing = { ...editing, coverImage: url })} />
          {#if !editing.coverImage}
            {@const auto = lookbookCover(editing)}
            <p class="text-xs text-muted-foreground">
              {#if auto}Optional. Without one, the first image in Media is used as the cover.{:else}Optional. Without one, the first image you add to Media becomes the cover.{/if}
            </p>
            {#if auto}
              <div class="flex items-center gap-3 rounded-lg border border-dashed border-border p-2">
                <img src={thumb(auto, 56)} alt="" class="h-14 w-14 shrink-0 rounded-md object-cover" />
                <p class="text-xs text-muted-foreground">Currently using the first image from Media.</p>
              </div>
            {/if}
          {/if}
        </div>
      </div>
    </Card>

    <Card title="Media" description="Photos, videos and embeds, in the order they appear. Vertical and wide media are both shown at their true shape.">
      <div class="space-y-4 p-6 pt-4">
        <!-- Batch upload -->
        <label
          class="flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-8 text-center transition-colors focus-within:ring-2 focus-within:ring-ring/40 hover:bg-muted/50 {dragging ? 'border-ring bg-muted/60' : 'border-input'}"
          ondragover={(e) => { e.preventDefault(); dragging = true; }}
          ondragleave={() => (dragging = false)}
          ondrop={(e) => { e.preventDefault(); dragging = false; addFiles(e.dataTransfer.files); }}
        >
          <input id="lb-batch" type="file" multiple class="sr-only" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm" onchange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          <Upload size={22} class="mb-2 text-muted-foreground" />
          <span class="text-sm text-muted-foreground"><span class="font-medium text-foreground">Click to upload</span> or drag photos and videos here</span>
          <span class="mt-0.5 text-xs text-muted-foreground">Select as many as you like at once. Videos are optimised for the web automatically{videoCaps ? ` (up to ${videoCaps.maxMb} MB each)` : ''}.</span>
        </label>
        {#if videoCaps?.mode !== 'cloudinary'}
        <label class="flex items-start gap-2 text-sm">
          <input type="checkbox" bind:checked={stripAudio} class="mt-0.5 h-4 w-4 rounded-[0.25rem] border-input accent-primary" />
          <span>Remove the sound from videos I upload <span class="text-muted-foreground">(applies to videos added from now on)</span></span>
        </label>
        {/if}

        {#if uploading > 0}
          <p class="flex items-center gap-2 text-sm text-muted-foreground" role="status"><LoaderCircle size={14} class="animate-spin" /> {uploading} upload{uploading > 1 ? 's' : ''} in progress. You can keep editing, but wait for them to finish before saving.</p>
        {/if}

        <div class="space-y-3">
          {#each editing.items as item, i (item._k)}
            {@const kind = itemKind(item)}
            {@const shape = describeShape(item.width, item.height)}
            {@const up = item._up}
            <div class="rounded-lg border p-3 {up?.error ? 'border-destructive/50' : 'border-border'}">
              <div class="flex gap-3">
                {#if item.url || up}
                  <!-- Thumbnail -->
                  <div class="relative h-24 w-24 shrink-0 overflow-hidden rounded-md bg-muted">
                    {#if up && !up.error}
                      <div class="flex h-full w-full flex-col items-center justify-center gap-1.5 px-2">
                        <LoaderCircle size={18} class="animate-spin text-muted-foreground" />
                        {#if kind === 'video'}
                          <div class="h-1 w-full overflow-hidden rounded-full bg-border" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={up.progress} aria-label="Upload progress"><div class="h-full rounded-full bg-primary transition-[width] duration-500" style="width: {up.progress}%"></div></div>
                        {/if}
                      </div>
                    {:else if up?.error}
                      <div class="flex h-full w-full items-center justify-center text-destructive"><TriangleAlert size={22} /></div>
                    {:else if kind === 'image'}
                      <img src={thumb(item.url, 96)} alt="" loading="lazy" decoding="async" class="h-full w-full object-cover" />
                    {:else if kind === 'video'}
                      <!-- svelte-ignore a11y_media_has_caption -->
                      <video src={item.url} poster={getVideoPoster(item.url, 192) || undefined} muted playsinline preload="metadata" class="h-full w-full object-cover"></video>
                    {:else}
                      <div class="flex h-full w-full items-center justify-center text-muted-foreground"><Link size={20} /></div>
                    {/if}
                  </div>
                {/if}

                <div class="min-w-0 flex-1 space-y-2">
                  <div class="flex items-center justify-between gap-2">
                    <div class="flex min-w-0 flex-wrap items-center gap-1.5">
                      <Badge variant="outline">{i + 1}. {TYPE_LABEL[kind] || kind}</Badge>
                      {#if shape}<Badge variant="secondary" title="{item.width}×{item.height}">{shape.shape} · {shape.label}</Badge>{/if}
                    </div>
                    <div class="flex shrink-0 items-center gap-0.5">
                      <Button variant="ghost" size="icon" class="h-8 w-8" aria-label="Move up" disabled={i === 0} onclick={() => moveItem(i, -1)}><ArrowUp size={14} /></Button>
                      <Button variant="ghost" size="icon" class="h-8 w-8" aria-label="Move down" disabled={i === editing.items.length - 1} onclick={() => moveItem(i, 1)}><ArrowDown size={14} /></Button>
                      <Button variant="ghost" size="icon" class="h-8 w-8 hover:text-destructive" aria-label="Remove item {i + 1}" onclick={() => removeItem(i)}><X size={14} /></Button>
                    </div>
                  </div>

                  {#if up && !up.error}
                    <p class="truncate text-xs text-muted-foreground" title={up.name}>{up.name} · {up.message}</p>
                  {:else if up?.error}
                    <p role="alert" class="text-xs text-destructive"><span class="font-medium">{up.name}:</span> {up.error}</p>
                    {#if files.has(item._k)}<Button variant="outline" size="sm" onclick={() => retry(i)}><RotateCw size={13} /> Try again</Button>{/if}
                  {:else if kind === 'image' && item.url}
                    <label class="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline">
                      <Upload size={12} /> Replace photo
                      <input type="file" class="sr-only" accept="image/jpeg,image/png,image/webp,image/gif" onchange={(e) => { replaceImage(i, e.target.files[0]); e.target.value = ''; }} />
                    </label>
                  {:else if kind === 'video' && item.url}
                    <input value={item.url} onchange={(e) => setMedia(i, e.target.value.trim())} aria-label="Video URL" class="{inputCls} h-8 font-mono text-[12px]" />
                  {/if}
                </div>
              </div>

              <!-- An empty row added by hand -->
              {#if !item.url && !up}
                <div class="space-y-3">
                  {#if kind === 'image'}
                    <ImageUpload label="" value="" onChange={(url) => url && setMedia(i, url)} />
                  {:else if kind === 'video'}
                    <VideoUpload label="" value="" onChange={(url, size) => setMedia(i, url, size)} />
                    <input value="" onchange={(e) => setMedia(i, e.target.value.trim())} placeholder="…or paste a video file URL" aria-label="Video URL" class="{inputCls} font-mono text-[13px]" />
                  {:else}
                    <input value="" onchange={(e) => setMedia(i, e.target.value.trim())} placeholder="YouTube or Vimeo URL" aria-label="Embed URL" class="{inputCls} font-mono text-[13px]" />
                  {/if}
                </div>
              {:else if kind === 'embed' && !up}
                <input value={item.url} oninput={(e) => updateItem(i, 'url', e.target.value)} aria-label="Embed URL" class="{inputCls} mt-2 font-mono text-[13px]" />
              {/if}

              {#if !up?.error}
                <input value={item.caption} oninput={(e) => updateItem(i, 'caption', e.target.value)} placeholder="Caption (optional)" aria-label="Caption" class="{inputCls} mt-2" />
              {/if}
            </div>
          {/each}
        </div>

        <div class="flex flex-wrap gap-2 pt-1">
          <Button variant="outline" size="sm" onclick={() => addItem('image')}><ImageIcon size={14} /> Add one image</Button>
          <Button variant="outline" size="sm" onclick={() => addItem('video')}><Video size={14} /> Add one video</Button>
          <Button variant="outline" size="sm" onclick={() => addItem('embed')}><Link size={14} /> Embed YouTube / Vimeo</Button>
        </div>
      </div>
    </Card>

    <div class="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/90 backdrop-blur-sm md:left-60">
      <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-8">
        <p class="text-sm {dirty ? 'text-foreground' : 'text-muted-foreground'}">{dirty ? 'You have unsaved changes' : 'No changes yet'}</p>
        <div class="flex gap-2">
          <Button variant="outline" disabled={saving} onclick={requestClose}>Cancel</Button>
          <Button disabled={saving || uploading > 0} onclick={handleSave}>{#if saving}<LoaderCircle size={15} class="animate-spin" /> Saving…{:else}Save lookbook{/if}</Button>
        </div>
      </div>
    </div>
  </div>
{/if}
