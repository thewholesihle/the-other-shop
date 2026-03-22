<script>
  import ImageUpload from './ImageUpload.svelte';

  export let lookbooks = [];
  export let onUpdate = () => {};

  let editing = null;
  let isNew = false;

  const empty = () => ({
    id: '', title: '', description: '', date: new Date().toISOString().slice(0,10),
    coverImage: '', items: []
  });

  function handleSave() {
    if (isNew) {
      onUpdate([...lookbooks, { ...editing, id: `lb-${Date.now()}` }]);
    } else {
      onUpdate(lookbooks.map(l => l.id === editing.id ? editing : l));
    }
    editing = null; isNew = false;
  }

  function handleDelete(id) { onUpdate(lookbooks.filter(l => l.id !== id)); }

  // ── Item helpers ────────────────────────────────────────────────────────────
  function addItem(type) {
    editing = { ...editing, items: [...editing.items, { type, url: '', caption: '' }] };
  }
  function removeItem(i) {
    editing = { ...editing, items: editing.items.filter((_, idx) => idx !== i) };
  }
  function updateItem(i, field, val) {
    editing = {
      ...editing,
      items: editing.items.map((item, idx) => idx === i ? { ...item, [field]: val } : item)
    };
  }
  function moveItem(i, dir) {
    const items = [...editing.items];
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    editing = { ...editing, items };
  }
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-display font-bold mb-1">Lookbook</h2>
      <p class="text-sm text-muted-foreground">{lookbooks.length} lookbook{lookbooks.length !== 1 ? 's' : ''}</p>
    </div>
    <button onclick={() => { editing = empty(); isNew = true; }}
      class="flex items-center gap-2 bg-foreground text-primary-foreground px-4 py-2.5 text-label tracking-[0.15em] hover:bg-foreground/90 transition-colors active:scale-[0.97]">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
      ADD LOOKBOOK
    </button>
  </div>

  <div class="grid gap-4">
    {#each lookbooks as lb}
      {@const cover = lb.coverImage ?? lb.items?.find(i => i.type !== 'video')?.url ?? lb.images?.[0]}
      <div class="bg-card border border-border p-4 flex gap-4 items-start">
        {#if cover}
          <img src={cover} alt={lb.title} class="w-20 h-24 object-cover flex-shrink-0 bg-secondary" />
        {:else}
          <div class="w-20 h-24 bg-secondary flex-shrink-0 flex items-center justify-center text-muted-foreground text-xs">No cover</div>
        {/if}
        <div class="flex-1 min-w-0">
          <p class="font-medium">{lb.title}</p>
          <p class="text-xs text-muted-foreground mt-0.5">{lb.date} · {(lb.items ?? lb.images ?? []).length} item{(lb.items ?? lb.images ?? []).length !== 1 ? 's' : ''}</p>
          <p class="text-sm text-muted-foreground mt-1 truncate">{lb.description}</p>
        </div>
        <div class="flex gap-1 flex-shrink-0">
          <button aria-label="Edit lookbook" onclick={() => { editing = { ...lb, items: lb.items ?? lb.images?.map(url => ({ type: 'image', url, caption: '' })) ?? [] }; isNew = false; }} class="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
          </button>
          <button aria-label="Delete lookbook" onclick={() => handleDelete(lb.id)} class="p-1.5 text-muted-foreground hover:text-destructive transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/></svg>
          </button>
        </div>
      </div>
    {/each}
    {#if !lookbooks.length}
      <div class="text-center py-16 border border-dashed border-border text-muted-foreground text-sm">No lookbooks yet. Click ADD LOOKBOOK to create one.</div>
    {/if}
  </div>

  {#if editing}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4">
      <div class="bg-background border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5 animate-fade-up">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-display font-bold">{isNew ? 'Add Lookbook' : 'Edit Lookbook'}</h3>
          <button aria-label="Close" onclick={() => { editing = null; isNew = false; }} class="text-muted-foreground hover:text-foreground">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="lb-title" class="text-label block mb-1.5">TITLE</label>
              <input id="lb-title" bind:value={editing.title} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
            </div>
            <div>
              <label for="lb-date" class="text-label block mb-1.5">DATE</label>
              <input id="lb-date" type="date" bind:value={editing.date} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
            </div>
          </div>
          <div>
            <label for="lb-desc" class="text-label block mb-1.5">DESCRIPTION</label>
            <textarea id="lb-desc" bind:value={editing.description} rows={2} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors resize-none"></textarea>
          </div>

          <!-- Cover image -->
          <ImageUpload label="COVER IMAGE" value={editing.coverImage ?? ''} onChange={(url) => (editing = { ...editing, coverImage: url })} />

          <!-- Media items -->
          <div>
            <p class="text-label mb-3">MEDIA ITEMS <span class="text-muted-foreground font-normal normal-case text-xs">({editing.items.length} items)</span></p>

            {#each editing.items as item, i}
              <div class="border border-border p-3 mb-2 space-y-2">
                <div class="flex items-center justify-between">
                  <span class="text-[10px] tracking-[0.15em] uppercase text-muted-foreground">{item.type}</span>
                  <div class="flex items-center gap-1">
                    <button aria-label="Move up" onclick={() => moveItem(i, -1)} class="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === 0}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m18 15-6-6-6 6"/></svg>
                    </button>
                    <button aria-label="Move down" onclick={() => moveItem(i, 1)} class="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === editing.items.length - 1}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
                    </button>
                    <button aria-label="Remove item" onclick={() => removeItem(i)} class="p-1 text-muted-foreground hover:text-destructive">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                    </button>
                  </div>
                </div>

                {#if item.type === 'image'}
                  <ImageUpload label="" value={item.url} onChange={(url) => updateItem(i, 'url', url)} />
                {:else}
                  <input
                    value={item.url}
                    oninput={(e) => updateItem(i, 'url', e.target.value)}
                    placeholder={item.type === 'embed' ? 'YouTube or Vimeo URL' : 'Video file URL'}
                    class="w-full bg-transparent border border-border px-3 py-2 text-sm focus:outline-none focus:border-foreground transition-colors font-mono"
                  />
                {/if}
                <input
                  value={item.caption}
                  oninput={(e) => updateItem(i, 'caption', e.target.value)}
                  placeholder="Caption (optional)"
                  class="w-full bg-transparent border border-border px-3 py-2 text-sm focus:outline-none focus:border-foreground transition-colors"
                />
              </div>
            {/each}

            <!-- Add item buttons -->
            <div class="flex gap-2 flex-wrap pt-1">
              <button onclick={() => addItem('image')} class="flex items-center gap-1.5 border border-dashed border-border px-3 py-2 text-label text-xs text-muted-foreground hover:text-foreground hover:border-foreground transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                ADD IMAGE
              </button>
              <button onclick={() => addItem('video')} class="flex items-center gap-1.5 border border-dashed border-border px-3 py-2 text-label text-xs text-muted-foreground hover:text-foreground hover:border-foreground transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>
                ADD VIDEO
              </button>
              <button onclick={() => addItem('embed')} class="flex items-center gap-1.5 border border-dashed border-border px-3 py-2 text-label text-xs text-muted-foreground hover:text-foreground hover:border-foreground transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2.5 17a24.12 24.12 0 0 1 0-10"/><path d="m10 15 5-3-5-3z"/></svg>
                EMBED YT/VIMEO
              </button>
            </div>
          </div>
        </div>

        <div class="flex gap-3 pt-2">
          <button onclick={handleSave} class="flex items-center gap-2 bg-foreground text-primary-foreground px-5 py-2.5 text-label tracking-[0.15em] hover:bg-foreground/90 transition-colors active:scale-[0.97]">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 6 9 17l-5-5"/></svg>
            SAVE
          </button>
          <button onclick={() => { editing = null; isNew = false; }} class="px-5 py-2.5 text-label tracking-[0.15em] border border-border hover:bg-muted transition-colors active:scale-[0.97]">CANCEL</button>
        </div>
      </div>
    </div>
  {/if}
</div>
