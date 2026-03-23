<script>
  import { Plus, Trash2, Edit2, Check, X } from 'lucide-svelte';
  
  export let categories = [];
  export let onUpdate = () => {};

  let editing = null;
  let newName = '';
  let newSlug = '';

  function addCategory() {
    if (!newName) return;
    const slug = newSlug || newName.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
    const id = `cat-${Date.now()}`;
    onUpdate([...categories, { id, name: newName, slug }]);
    newName = ''; newSlug = '';
  }

  function deleteCategory(id, name) {
    if (!confirm(`Delete category "${name}"? Products in this category will become uncategorized.`)) return;
    onUpdate(categories.filter(c => c.id !== id));
  }

  function startEdit(cat) { editing = { ...cat }; }
  function saveEdit() {
    onUpdate(categories.map(c => c.id === editing.id ? editing : c));
    editing = null;
  }
</script>

<div class="space-y-6 max-w-2xl">
  <div>
    <h2 class="text-2xl font-display font-bold mb-1 uppercase tracking-tight">Product Categories</h2>
    <p class="text-sm text-muted-foreground">Manage the collections shown in your shop and footer.</p>
  </div>

  <!-- Add Category -->
  <div class="bg-card border border-border p-6 space-y-4 shadow-sm">
    <h3 class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Add New Category</h3>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="space-y-1.5">
        <label for="cat-name-new" class="text-[10px] uppercase font-bold tracking-wider">Display Name</label>
        <input id="cat-name-new" bind:value={newName} placeholder="e.g. Hoodies" class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
      </div>
      <div class="space-y-1.5">
        <label for="cat-slug-new" class="text-[10px] uppercase font-bold tracking-wider">Slug (Identifier)</label>
        <input id="cat-slug-new" bind:value={newSlug} placeholder="e.g. hoodies" class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
      </div>
    </div>
    <button onclick={addCategory} class="w-full flex items-center justify-center gap-2 bg-foreground text-primary-foreground py-3 text-label tracking-[0.2em] hover:bg-foreground/90 transition-colors active:scale-[0.98]">
      <Plus class="w-4 h-4" /> ADD CATEGORY
    </button>
  </div>

  <!-- List Categories -->
  <div class="bg-card border border-border divide-y divide-border overflow-hidden">
    {#each categories as cat}
      <div class="p-4 flex flex-col md:flex-row md:items-center justify-between group hover:bg-muted/50 transition-colors gap-3">
        {#if editing?.id === cat.id}
          <div class="flex-1 flex flex-col md:flex-row gap-2">
            <input bind:value={editing.name} class="flex-1 bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:border-foreground" />
            <input bind:value={editing.slug} class="flex-1 bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:border-foreground" />
            <div class="flex gap-1 justify-end">
              <button onclick={saveEdit} class="p-2 border border-border bg-foreground text-background hover:bg-muted-foreground transition-colors"><Check class="w-4 h-4" /></button>
              <button onclick={() => editing = null} class="p-2 border border-border hover:bg-muted transition-colors"><X class="w-4 h-4" /></button>
            </div>
          </div>
        {:else}
          <div>
            <span class="font-display font-bold text-lg">{cat.name}</span>
            <span class="ml-2 text-[10px] font-mono text-muted-foreground uppercase opacity-60">ID: {cat.id}</span>
            <p class="text-[10px] text-muted-foreground font-mono mt-0.5 uppercase tracking-widest">Slug: {cat.slug}</p>
          </div>
          <div class="flex items-center gap-2 justify-end">
            <button onclick={() => startEdit(cat)} class="flex items-center gap-2 px-3 py-1.5 border border-border text-[10px] font-bold tracking-widest uppercase hover:bg-muted transition-colors">
              <Edit2 class="w-3.5 h-3.5" /> Edit
            </button>
            <button onclick={() => deleteCategory(cat.id, cat.name)} class="flex items-center gap-2 px-3 py-1.5 border border-destructive/20 text-destructive text-[10px] font-bold tracking-widest uppercase hover:bg-destructive hover:text-white transition-colors">
              <Trash2 class="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        {/if}
      </div>
    {:else}
      <div class="p-12 text-center text-muted-foreground flex flex-col items-center gap-4">
        <div class="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
          <Trash2 class="w-6 h-6 opacity-20" />
        </div>
        <p class="text-sm italic">No categories created yet. Add one above to start organizing your catalog.</p>
      </div>
    {/each}
  </div>
</div>
