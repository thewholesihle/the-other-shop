<script>
  import ImageUpload from './ImageUpload.svelte';

  export let products = [];
  export let categories = [];
  export let currency = '€';
  export let onUpdate = () => {};

  let editing = null;
  let isNew = false;

  const emptyProduct = {
    id: '', name: '', category: '', price: 0,
    image: '', images: [],
    description: '',
    sizes: ['S', 'M', 'L', 'XL'], colors: [], stock: 0,
    isNew: false, isFeatured: false,
  };

  function handleSave() {
    if (!editing) return;
    // Keep image in sync with first images[]
    const p = { ...editing, image: editing.images[0] || editing.image || '' };
    if (isNew) {
      onUpdate([...products, { ...p, id: `prod-${Date.now()}` }]);
    } else {
      onUpdate(products.map(prod => prod.id === p.id ? p : prod));
    }
    editing = null; isNew = false;
  }

  async function handleDelete(id, name) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error((await res.json()).error);
      onUpdate(products.filter(p => p.id !== id));
    } catch (e) {
      alert(`Failed to delete: ${e.message}`);
    }
  }
  function handleAdd() { editing = { ...emptyProduct, images: [] }; isNew = true; }

  function statusClass(p) {
    if (p.stock === 0) return 'bg-red-100 text-red-700';
    if (p.isNew) return 'bg-green-100 text-green-700';
    return 'bg-muted text-muted-foreground';
  }
  function statusLabel(p) {
    if (p.stock === 0) return 'Out of stock';
    if (p.isNew) return 'New';
    return 'Active';
  }

  $: sizesStr = editing ? editing.sizes.join(', ') : '';
  $: colorsStr = editing ? editing.colors.join(', ') : '';

  function updateSizes(e) {
    editing = { ...editing, sizes: e.target.value.split(',').map(s => s.trim()).filter(Boolean) };
  }
  function updateColors(e) {
    editing = { ...editing, colors: e.target.value.split(',').map(s => s.trim()).filter(Boolean) };
  }
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-display font-bold mb-1">Products</h2>
      <p class="text-sm text-muted-foreground">{products.length} products total</p>
    </div>
    <button onclick={handleAdd} class="flex items-center gap-2 bg-foreground text-primary-foreground px-4 py-2.5 text-label tracking-[0.15em] hover:bg-foreground/90 transition-colors active:scale-[0.97]">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
      ADD PRODUCT
    </button>
  </div>

  <div class="bg-card border border-border overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-border">
          <th class="text-left text-label p-3">PRODUCT</th>
          <th class="text-left text-label p-3 hidden md:table-cell">CATEGORY</th>
          <th class="text-right text-label p-3">PRICE</th>
          <th class="text-right text-label p-3">STOCK</th>
          <th class="text-center text-label p-3">STATUS</th>
          <th class="text-right text-label p-3">ACTIONS</th>
        </tr>
      </thead>
      <tbody>
        {#each products as p}
          <tr class="border-b border-border/50 hover:bg-muted/50 transition-colors">
            <td class="p-3">
              <div class="flex items-center gap-3">
                <img src={p.image || p.images?.[0] || '/images/product-1.jpg'} alt={p.name} class="w-10 h-10 object-cover bg-secondary flex-shrink-0" />
                <div>
                  <span class="font-medium block">{p.name}</span>
                  <span class="text-xs text-muted-foreground">{(p.images || []).length} image{(p.images || []).length !== 1 ? 's' : ''}</span>
                </div>
              </div>
            </td>
            <td class="p-3 text-muted-foreground capitalize hidden md:table-cell">{p.category}</td>
            <td class="p-3 text-right tabular-nums">{currency}{p.price.toFixed(2)}</td>
            <td class="p-3 text-right tabular-nums">{p.stock}</td>
            <td class="p-3 text-center">
              <span class="inline-block text-[10px] tracking-[0.15em] uppercase px-2 py-0.5 font-medium {statusClass(p)}">{statusLabel(p)}</span>
            </td>
            <td class="p-3 text-right">
              <div class="flex items-center justify-end gap-1">
                <button aria-label="Edit product" onclick={() => { editing = { ...p, images: [...(p.images || [p.image].filter(Boolean))] }; isNew = false; }} class="p-1.5 text-muted-foreground hover:text-foreground transition-colors active:scale-90">
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                </button>
                <button aria-label="Delete product" onclick={() => handleDelete(p.id, p.name)} class="p-1.5 text-muted-foreground hover:text-destructive transition-colors active:scale-90">
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                </button>
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  {#if editing}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4">
      <div class="bg-background border border-border w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 space-y-5 animate-fade-up">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-display font-bold">{isNew ? 'Add Product' : 'Edit Product'}</h3>
          <button aria-label="Close" onclick={() => { editing = null; isNew = false; }} class="text-muted-foreground hover:text-foreground active:scale-90">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
        <div class="space-y-4">
          <div>
            <label for="edit-name" class="text-label block mb-1.5">NAME</label>
            <input id="edit-name" bind:value={editing.name} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="edit-category" class="text-label block mb-1.5">CATEGORY</label>
              <select id="edit-category" bind:value={editing.category} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors cursor-pointer bg-background">
                <option value="">— Select Category —</option>
                {#each categories as cat}
                  <option value={cat.id}>{cat.name}</option>
                {/each}
              </select>
            </div>
            <div>
              <label for="edit-price" class="text-label block mb-1.5">PRICE ({currency})</label>
              <input id="edit-price" type="number" bind:value={editing.price} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors tabular-nums" />
            </div>
          </div>
          <div>
            <label for="edit-desc" class="text-label block mb-1.5">DESCRIPTION</label>
            <textarea id="edit-desc" bind:value={editing.description} rows={3} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors resize-none"></textarea>
          </div>
          <!-- Multi-image upload -->
          <ImageUpload
            multi
            label="PRODUCT IMAGES (first image = primary)"
            values={editing.images}
            onChange={(urls) => (editing = { ...editing, images: urls, image: urls[0] || '' })}
          />
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="edit-stock" class="text-label block mb-1.5">STOCK</label>
              <input id="edit-stock" type="number" bind:value={editing.stock} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors tabular-nums" />
            </div>
            <div>
              <label for="edit-sizes" class="text-label block mb-1.5">SIZES (comma sep.)</label>
              <input id="edit-sizes" value={sizesStr} oninput={updateSizes} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
            </div>
          </div>
          <div>
            <label for="edit-colors" class="text-label block mb-1.5">COLORS (comma sep.)</label>
            <input id="edit-colors" value={colorsStr} oninput={updateColors} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
          </div>
          <div class="flex items-center gap-6">
            <label class="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" bind:checked={editing.isNew} class="accent-foreground" />
              Mark as New
            </label>
            <label class="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" bind:checked={editing.isFeatured} class="accent-foreground" />
              Featured on Homepage
            </label>
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
