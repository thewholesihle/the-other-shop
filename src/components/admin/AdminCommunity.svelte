<script>
  import ImageUpload from './ImageUpload.svelte';
  import RichEditor from './RichEditor.svelte';
  import Button from '../ui/Button.svelte';
  import Badge from '../ui/Badge.svelte';
  import Card from '../ui/Card.svelte';
  import Switch from '../ui/Switch.svelte';
  import { inputCls, textareaCls, selectCls, labelCls, hintCls, thCls, tdCls } from '../../lib/ui.js';
  import { toast } from '../../lib/toast.js';
  import { confirmDialog } from '../../lib/confirm.js';
  import Plus from 'lucide-svelte/icons/plus';
  import Pencil from 'lucide-svelte/icons/pencil';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import ArrowLeft from 'lucide-svelte/icons/arrow-left';
  import LoaderCircle from 'lucide-svelte/icons/loader-circle';
  import FileText from 'lucide-svelte/icons/file-text';

  let { community = [], onUpdate = () => {}, onLocalUpdate = null } = $props();
  const syncLocal = (list) => (onLocalUpdate || onUpdate)(list);

  let editing = $state(null);
  let isNew = $state(false);
  let saving = $state(false);
  let deletingId = $state(null);
  let snapshot = $state('');
  let dirty = $derived(editing ? JSON.stringify(editing) !== snapshot : false);

  const CATEGORIES = ['Collection', 'Community', 'News', 'Collaboration', 'Culture', 'Other'];

  const empty = () => ({
    id: '', slug: '', title: '', excerpt: '', content: '',
    author: 'Others.', date: new Date().toISOString().slice(0, 10),
    category: 'Collection', image: '', published: true,
  });

  const slugify = (str) => str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  function startEditing(post) {
    editing = post ? { ...post } : empty();
    isNew = !post;
    snapshot = JSON.stringify(editing);
  }

  function closeEditor() { editing = null; isNew = false; }

  async function requestClose() {
    if (dirty && !(await confirmDialog.ask({
      title: 'Discard changes?', description: 'You have unsaved changes to this post.',
      confirmLabel: 'Discard', destructive: true,
    }))) return;
    closeEditor();
  }

  async function handleSave() {
    if (saving) return;
    if (!editing.title.trim()) return toast.error('Give the post a title.');
    saving = true;
    try {
      const post = { ...editing, slug: editing.slug || slugify(editing.title) };
      if (isNew) await onUpdate([...community, { ...post, id: `post-${Date.now()}` }]);
      else await onUpdate(community.map(p => p.id === editing.id ? post : p));
      closeEditor();
    } catch {
      // Admin.svelte toasts the failure; keep the editor open.
    } finally {
      saving = false;
    }
  }

  async function handleDelete(post) {
    const ok = await confirmDialog.ask({
      title: `Delete “${post.title}”?`,
      description: 'The post and its cover image are permanently removed.',
      confirmLabel: 'Delete post', destructive: true,
    });
    if (!ok) return;
    deletingId = post.id;
    try {
      const res = await fetch('/api/community/' + post.id, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to delete post.');
      syncLocal(community.filter(p => p.id !== post.id));
      toast.success('Post deleted');
    } catch (err) {
      toast.error(err.message);
    } finally {
      deletingId = null;
    }
  }
</script>

{#if !editing}
  <div class="space-y-6">
    <div class="flex items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Community</h1>
        <p class="text-sm text-muted-foreground">{community.length} post{community.length !== 1 ? 's' : ''} — stories, news and culture.</p>
      </div>
      <Button onclick={() => startEditing(null)}><Plus size={16} /> New post</Button>
    </div>

    <Card class="overflow-hidden">
      {#if community.length === 0}
        <div class="flex flex-col items-center gap-2 py-16 text-center">
          <FileText size={28} class="text-muted-foreground" />
          <p class="font-medium">No posts yet</p>
          <p class="text-sm text-muted-foreground">Write your first story to start the community feed.</p>
        </div>
      {:else}
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="border-b border-border">
              <tr>
                <th class={thCls}>Title</th>
                <th class="{thCls} hidden md:table-cell">Category</th>
                <th class="{thCls} hidden md:table-cell">Date</th>
                <th class={thCls}>Status</th>
                <th class="{thCls} w-24 text-right"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {#each community as post (post.id)}
                <tr class="border-b border-border/60 last:border-0 hover:bg-muted/50">
                  <td class="{tdCls} font-medium"><button type="button" class="text-left hover:underline" onclick={() => startEditing(post)}>{post.title}</button></td>
                  <td class="{tdCls} hidden text-muted-foreground md:table-cell">{post.category}</td>
                  <td class="{tdCls} hidden text-muted-foreground md:table-cell">{post.date}</td>
                  <td class={tdCls}><Badge variant={post.published ? 'success' : 'secondary'}>{post.published ? 'Published' : 'Draft'}</Badge></td>
                  <td class="{tdCls} text-right">
                    <div class="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" aria-label="Edit {post.title}" onclick={() => startEditing(post)}><Pencil size={15} /></Button>
                      <Button variant="ghost" size="icon" aria-label="Delete {post.title}" class="hover:text-destructive" disabled={deletingId === post.id} onclick={() => handleDelete(post)}>
                        {#if deletingId === post.id}<LoaderCircle size={15} class="animate-spin" />{:else}<Trash2 size={15} />{/if}
                      </Button>
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </Card>
  </div>
{:else}
  <div class="space-y-6 pb-24">
    <div>
      <button type="button" onclick={requestClose} class="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft size={14} /> Community</button>
      <h1 class="text-2xl font-semibold tracking-tight">{isNew ? 'New post' : editing.title || 'Edit post'}</h1>
    </div>

    <div class="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
      <div class="space-y-6 lg:col-span-2">
        <Card title="Content">
          <div class="space-y-5 p-6 pt-4">
            <div>
              <label for="post-title" class={labelCls}>Title</label>
              <input id="post-title" bind:value={editing.title} oninput={() => { if (isNew) editing.slug = slugify(editing.title); }} class={inputCls} />
            </div>
            <div>
              <label for="post-excerpt" class={labelCls}>Excerpt</label>
              <textarea id="post-excerpt" bind:value={editing.excerpt} rows={2} class={textareaCls}></textarea>
              <p class={hintCls}>Shown on the community page and in link previews.</p>
            </div>
            <div>
              <p class={labelCls}>Body</p>
              <RichEditor value={editing.content} onChange={(html) => (editing = { ...editing, content: html })} />
            </div>
          </div>
        </Card>
      </div>

      <div class="space-y-6">
        <Card title="Publishing">
          <div class="space-y-5 p-6 pt-4">
            <div class="flex items-center justify-between gap-4">
              <div class="text-sm"><p class="font-medium">Published</p><p class="text-muted-foreground">Visible on the site</p></div>
              <Switch bind:checked={editing.published} aria-label="Published" />
            </div>
            <div>
              <label for="post-cat" class={labelCls}>Category</label>
              <select id="post-cat" bind:value={editing.category} class={selectCls}>
                {#each CATEGORIES as c}<option value={c}>{c}</option>{/each}
              </select>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div><label for="post-author" class={labelCls}>Author</label><input id="post-author" bind:value={editing.author} class={inputCls} /></div>
              <div><label for="post-date" class={labelCls}>Date</label><input id="post-date" type="date" bind:value={editing.date} class={inputCls} /></div>
            </div>
            <div>
              <label for="post-slug" class={labelCls}>Slug</label>
              <input id="post-slug" bind:value={editing.slug} class="{inputCls} font-mono text-[13px]" />
              <p class={hintCls}>The post’s address: /community/{editing.slug || '…'}</p>
            </div>
          </div>
        </Card>

        <Card title="Cover image">
          <div class="p-6 pt-4"><ImageUpload label="" value={editing.image} onChange={(url) => (editing = { ...editing, image: url })} /></div>
        </Card>
      </div>
    </div>

    <div class="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/90 backdrop-blur-sm md:left-60">
      <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-8">
        <p class="text-sm {dirty ? 'text-foreground' : 'text-muted-foreground'}">{dirty ? 'You have unsaved changes' : 'No changes yet'}</p>
        <div class="flex gap-2">
          <Button variant="outline" disabled={saving} onclick={requestClose}>Cancel</Button>
          <Button disabled={saving} onclick={handleSave}>{#if saving}<LoaderCircle size={15} class="animate-spin" /> Saving…{:else}Save post{/if}</Button>
        </div>
      </div>
    </div>
  </div>
{/if}
