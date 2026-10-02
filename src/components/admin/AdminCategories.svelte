<script>
  import Button from '../ui/Button.svelte';
  import Card from '../ui/Card.svelte';
  import { inputCls, labelCls, thCls, tdCls } from '../../lib/ui.js';
  import { toast } from '../../lib/toast.js';
  import { confirmDialog } from '../../lib/confirm.js';
  import Plus from 'lucide-svelte/icons/plus';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Pencil from 'lucide-svelte/icons/pencil';
  import Check from 'lucide-svelte/icons/check';
  import X from 'lucide-svelte/icons/x';
  import Tags from 'lucide-svelte/icons/tags';

  let { categories = [], onUpdate = () => {} } = $props();

  let editing = $state(null);
  let newName = $state('');
  let newSlug = $state('');

  const slugify = (s) => s.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w-]/g, '');

  async function addCategory() {
    if (!newName.trim()) return toast.error('Enter a category name.');
    const slug = newSlug.trim() || slugify(newName);
    try {
      await onUpdate([...categories, { id: `cat-${Date.now()}`, name: newName.trim(), slug }]);
      newName = ''; newSlug = '';
    } catch { /* Admin.svelte toasts the failure */ }
  }

  async function deleteCategory(id, name) {
    const ok = await confirmDialog.ask({
      title: `Delete “${name}”?`,
      description: 'Products in this category will become uncategorized.',
      confirmLabel: 'Delete category', destructive: true,
    });
    if (!ok) return;
    try { await onUpdate(categories.filter(c => c.id !== id)); } catch { /* toasted upstream */ }
  }

  function startEdit(cat) { editing = { ...cat }; }

  async function saveEdit() {
    if (!editing.name.trim()) return toast.error('A category needs a name.');
    try {
      await onUpdate(categories.map(c => c.id === editing.id ? { ...editing, name: editing.name.trim() } : c));
      editing = null;
    } catch { /* toasted upstream */ }
  }
</script>

<div class="max-w-3xl space-y-6">
  <div>
    <h1 class="text-2xl font-semibold tracking-tight">Categories</h1>
    <p class="text-sm text-muted-foreground">The collections shown in your shop and footer.</p>
  </div>

  <Card title="Add a category">
    <form class="p-6 pt-4" onsubmit={(e) => { e.preventDefault(); addCategory(); }}>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <div>
          <label for="cat-name-new" class={labelCls}>Display name</label>
          <input id="cat-name-new" bind:value={newName} placeholder="e.g. Hoodies" class={inputCls} />
        </div>
        <div>
          <label for="cat-slug-new" class={labelCls}>Slug <span class="font-normal text-muted-foreground">(optional)</span></label>
          <input id="cat-slug-new" bind:value={newSlug} placeholder="e.g. hoodies" class={inputCls} />
        </div>
        <Button type="submit"><Plus size={16} /> Add</Button>
      </div>
    </form>
  </Card>

  <Card class="overflow-hidden">
    {#if categories.length === 0}
      <div class="flex flex-col items-center gap-2 py-16 text-center">
        <Tags size={28} class="text-muted-foreground" />
        <p class="font-medium">No categories yet</p>
        <p class="text-sm text-muted-foreground">Add one above to start organising your catalogue.</p>
      </div>
    {:else}
      <table class="w-full text-sm">
        <thead class="border-b border-border">
          <tr><th class={thCls}>Name</th><th class="{thCls} hidden sm:table-cell">Slug</th><th class="{thCls} w-28 text-right"><span class="sr-only">Actions</span></th></tr>
        </thead>
        <tbody>
          {#each categories as cat (cat.id)}
            <tr class="border-b border-border/60 last:border-0">
              {#if editing?.id === cat.id}
                <td class={tdCls}><input bind:value={editing.name} aria-label="Category name" class="{inputCls} h-8" /></td>
                <td class="{tdCls} hidden sm:table-cell"><input bind:value={editing.slug} aria-label="Category slug" class="{inputCls} h-8" /></td>
                <td class="{tdCls} text-right">
                  <div class="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" aria-label="Save" onclick={saveEdit}><Check size={16} /></Button>
                    <Button variant="ghost" size="icon" aria-label="Cancel" onclick={() => (editing = null)}><X size={16} /></Button>
                  </div>
                </td>
              {:else}
                <td class="{tdCls} font-medium">{cat.name}</td>
                <td class="{tdCls} hidden text-muted-foreground sm:table-cell">{cat.slug}</td>
                <td class="{tdCls} text-right">
                  <div class="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" aria-label="Edit {cat.name}" onclick={() => startEdit(cat)}><Pencil size={15} /></Button>
                    <Button variant="ghost" size="icon" aria-label="Delete {cat.name}" class="hover:text-destructive" onclick={() => deleteCategory(cat.id, cat.name)}><Trash2 size={15} /></Button>
                  </div>
                </td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </Card>
</div>
