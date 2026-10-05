<script>
  import { thumb, getOptimizedUrl } from '../../lib/cloudinary.js';
  import ImageUpload from './ImageUpload.svelte';
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

  function startEditing(lb) {
    editing = lb
      ? { ...lb, items: lb.items ?? lb.images?.map(url => ({ type: 'image', url, caption: '' })) ?? [] }
      : empty();
    isNew = !lb;
    snapshot = JSON.stringify(editing);
  }

  function closeEditor() { editing = null; isNew = false; }

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
    saving = true;
    try {
      if (isNew) await onUpdate([...lookbooks, { ...editing, id: `lb-${Date.now()}` }]);
      else await onUpdate(lookbooks.map(l => l.id === editing.id ? editing : l));
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
  function addItem(type) { editing = { ...editing, items: [...editing.items, { type, url: '', caption: '' }] }; }
  function removeItem(i) { editing = { ...editing, items: editing.items.filter((_, idx) => idx !== i) }; }
  function updateItem(i, field, val) {
    editing = { ...editing, items: editing.items.map((item, idx) => idx === i ? { ...item, [field]: val } : item) };
  }
  function moveItem(i, dir) {
    const items = [...editing.items];
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    editing = { ...editing, items };
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
          {@const cover = lb.coverImage || lb.items?.find(i => i.type === 'image')?.url || lb.images?.[0]}
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
        <ImageUpload label="Cover image" value={editing.coverImage ?? ''} onChange={(url) => (editing = { ...editing, coverImage: url })} />
      </div>
    </Card>

    <Card title="Media" description="Images, videos and embeds, in the order they appear.">
      <div class="space-y-3 p-6 pt-4">
        {#each editing.items as item, i}
          <div class="space-y-3 rounded-lg border border-border p-4">
            <div class="flex items-center justify-between">
              <Badge variant="outline">{i + 1}. {TYPE_LABEL[item.type] || item.type}</Badge>
              <div class="flex items-center gap-0.5">
                <Button variant="ghost" size="icon" class="h-8 w-8" aria-label="Move up" disabled={i === 0} onclick={() => moveItem(i, -1)}><ArrowUp size={14} /></Button>
                <Button variant="ghost" size="icon" class="h-8 w-8" aria-label="Move down" disabled={i === editing.items.length - 1} onclick={() => moveItem(i, 1)}><ArrowDown size={14} /></Button>
                <Button variant="ghost" size="icon" class="h-8 w-8 hover:text-destructive" aria-label="Remove item {i + 1}" onclick={() => removeItem(i)}><X size={14} /></Button>
              </div>
            </div>
            {#if item.type === 'image'}
              <ImageUpload label="" value={item.url} onChange={(url) => updateItem(i, 'url', url)} />
            {:else}
              <input
                value={item.url}
                oninput={(e) => updateItem(i, 'url', e.target.value)}
                placeholder={item.type === 'embed' ? 'YouTube or Vimeo URL' : 'Video file URL'}
                aria-label="{TYPE_LABEL[item.type]} URL"
                class="{inputCls} font-mono text-[13px]"
              />
            {/if}
            <input value={item.caption} oninput={(e) => updateItem(i, 'caption', e.target.value)} placeholder="Caption (optional)" aria-label="Caption" class={inputCls} />
          </div>
        {/each}

        <div class="flex flex-wrap gap-2 pt-1">
          <Button variant="outline" size="sm" onclick={() => addItem('image')}><ImageIcon size={14} /> Add image</Button>
          <Button variant="outline" size="sm" onclick={() => addItem('video')}><Video size={14} /> Add video</Button>
          <Button variant="outline" size="sm" onclick={() => addItem('embed')}><Link size={14} /> Embed YouTube / Vimeo</Button>
        </div>
      </div>
    </Card>

    <div class="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/90 backdrop-blur-sm md:left-60">
      <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-8">
        <p class="text-sm {dirty ? 'text-foreground' : 'text-muted-foreground'}">{dirty ? 'You have unsaved changes' : 'No changes yet'}</p>
        <div class="flex gap-2">
          <Button variant="outline" disabled={saving} onclick={requestClose}>Cancel</Button>
          <Button disabled={saving} onclick={handleSave}>{#if saving}<LoaderCircle size={15} class="animate-spin" /> Saving…{:else}Save lookbook{/if}</Button>
        </div>
      </div>
    </div>
  </div>
{/if}
