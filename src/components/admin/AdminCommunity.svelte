<script>
  import ImageUpload from './ImageUpload.svelte';
  import RichEditor from './RichEditor.svelte';

  export let community = [];
  export let onUpdate = () => {};

  let editing = null;
  let isNew = false;
  let saving = false;
  let deletingId = null;

  const empty = () => ({
    id: '', slug: '', title: '', excerpt: '', content: '',
    author: 'Others.', date: new Date().toISOString().slice(0,10),
    category: 'Collection', image: '', published: true,
  });

  function slugify(str) {
    return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  async function handleSave() {
    if (saving) return;
    saving = true;
    try {
      const post = { ...editing, slug: editing.slug || slugify(editing.title) };
      if (isNew) {
        await onUpdate([...community, { ...post, id: `post-${Date.now()}` }]);
      } else {
        await onUpdate(community.map(p => p.id === editing.id ? post : p));
      }
      editing = null; isNew = false;
    } finally {
      saving = false;
    }
  }
  async function handleDelete(id) {
    if (!confirm('Are you sure you want to delete this post?')) return;
    deletingId = id;
    try {
      const res = await fetch('/api/community/' + id, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete post.');
      onUpdate(community.filter(p => p.id !== id));
    } catch (err) {
      alert(err.message);
    } finally {
      deletingId = null;
    }
  }

  const CATEGORIES = ['Collection', 'Community', 'News', 'Collaboration', 'Culture', 'Other'];
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-display font-bold mb-1">Community</h2>
      <p class="text-sm text-muted-foreground">{community.length} post{community.length !== 1 ? 's' : ''}</p>
    </div>
    <button onclick={() => { editing = empty(); isNew = true; }}
      class="flex items-center gap-2 bg-foreground text-primary-foreground px-4 py-2.5 text-label tracking-[0.15em] hover:bg-foreground/90 transition-colors active:scale-[0.97]">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
      ADD POST
    </button>
  </div>

  <div class="bg-card border border-border overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-border">
          <th class="text-left text-label p-3">TITLE</th>
          <th class="text-left text-label p-3 hidden md:table-cell">CATEGORY</th>
          <th class="text-left text-label p-3 hidden md:table-cell">DATE</th>
          <th class="text-center text-label p-3">STATUS</th>
          <th class="text-right text-label p-3">ACTIONS</th>
        </tr>
      </thead>
      <tbody>
        {#each community as post}
          <tr class="border-b border-border/50 hover:bg-muted/50 transition-colors">
            <td class="p-3 font-medium">{post.title}</td>
            <td class="p-3 text-muted-foreground hidden md:table-cell">{post.category}</td>
            <td class="p-3 text-muted-foreground hidden md:table-cell">{post.date}</td>
            <td class="p-3 text-center">
              <span class="inline-block text-[10px] tracking-[0.15em] uppercase px-2 py-0.5 font-medium {post.published ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}">{post.published ? 'Published' : 'Draft'}</span>
            </td>
            <td class="p-3 text-right">
              <div class="flex items-center justify-end gap-1">
                <button aria-label="Edit post" onclick={() => { editing = { ...post }; isNew = false; }} class="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                </button>
                <button aria-label="Delete post" onclick={() => handleDelete(post.id)} disabled={deletingId === post.id} class="p-1.5 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40 disabled:cursor-wait">
                  {#if deletingId === post.id}
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  {:else}
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/></svg>
                  {/if}
                </button>
              </div>
            </td>
          </tr>
        {/each}
        {#if !community.length}
          <tr><td colspan="5" class="p-8 text-center text-muted-foreground text-sm">No posts yet.</td></tr>
        {/if}
      </tbody>
    </table>
  </div>

  {#if editing}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4">
      <div class="bg-background border border-border w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-5 animate-fade-up">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-display font-bold">{isNew ? 'New Post' : 'Edit Post'}</h3>
          <button aria-label="Close" onclick={() => { editing = null; isNew = false; }} class="text-muted-foreground hover:text-foreground">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        <div class="space-y-4">
          <!-- Metadata row -->
          <div>
            <label for="post-title" class="text-label block mb-1.5">TITLE</label>
            <input id="post-title" bind:value={editing.title}
              oninput={() => { if (isNew) editing.slug = slugify(editing.title); }}
              class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="post-slug" class="text-label block mb-1.5">SLUG</label>
              <input id="post-slug" bind:value={editing.slug} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors font-mono" />
            </div>
            <div>
              <label for="post-cat" class="text-label block mb-1.5">CATEGORY</label>
              <select id="post-cat" bind:value={editing.category} class="w-full bg-background border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors">
                {#each CATEGORIES as c}<option value={c}>{c}</option>{/each}
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="post-author" class="text-label block mb-1.5">AUTHOR</label>
              <input id="post-author" bind:value={editing.author} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
            </div>
            <div>
              <label for="post-date" class="text-label block mb-1.5">DATE</label>
              <input id="post-date" type="date" bind:value={editing.date} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
            </div>
          </div>

          <div>
            <label for="post-excerpt" class="text-label block mb-1.5">EXCERPT</label>
            <textarea id="post-excerpt" bind:value={editing.excerpt} rows={2} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors resize-none"></textarea>
          </div>

          <!-- Rich content editor -->
          <div>
            <p class="text-label block mb-1.5">CONTENT</p>
            <RichEditor value={editing.content} onChange={(html) => (editing = { ...editing, content: html })} />
          </div>

          <ImageUpload label="COVER IMAGE" value={editing.image} onChange={(url) => (editing = { ...editing, image: url })} />

          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" bind:checked={editing.published} class="accent-foreground" />
            Published (visible on site)
          </label>
        </div>

        <div class="flex gap-3 pt-2">
          <button onclick={handleSave} disabled={saving} class="flex items-center gap-2 bg-foreground text-primary-foreground px-5 py-2.5 text-label tracking-[0.15em] hover:bg-foreground/90 transition-colors active:scale-[0.97] disabled:opacity-60 disabled:cursor-wait">
            {#if saving}
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              SAVING…
            {:else}
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 6 9 17l-5-5"/></svg>
              SAVE
            {/if}
          </button>
          <button onclick={() => { editing = null; isNew = false; }} disabled={saving} class="px-5 py-2.5 text-label tracking-[0.15em] border border-border hover:bg-muted transition-colors active:scale-[0.97] disabled:opacity-40">CANCEL</button>
        </div>
      </div>
    </div>
  {/if}
</div>
