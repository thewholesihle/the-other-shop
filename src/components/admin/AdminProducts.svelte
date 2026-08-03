<script>
  import ImageUpload from './ImageUpload.svelte';

  export let products = [];
  export let categories = [];
  export let currency = '€';
  export let onUpdate = () => {};
  export let onLocalUpdate = onUpdate;

  let editing = null;
  let isNew = false;

  let deletingId = null;
  let saving = false;

  const emptyProduct = {
    id: '', name: '', category: '', price: 0,
    image: '', images: [],
    description: '',
    sizes: ['S', 'M', 'L', 'XL'], colors: [], stock: 0, variants: [],
    isNew: false, isFeatured: false,
  };

  /** Build a stock row per size/color combination, preserving any stock already entered. */
  function buildVariants(sizes, colors, existing) {
    const sizeList = sizes?.length ? sizes : [''];
    const colorList = colors?.length ? colors : [''];
    const rows = [];
    for (const size of sizeList) {
      for (const color of colorList) {
        const prev = (existing || []).find(v => (v.size || '') === size && (v.color || '') === color);
        rows.push({ size, color, stock: prev ? prev.stock : 0 });
      }
    }
    return rows;
  }

  function variantStock(size, color) {
    const v = (editing?.variants || []).find(v => (v.size || '') === (size || '') && (v.color || '') === (color || ''));
    return v ? v.stock : 0;
  }

  function updateVariantStock(size, color, value) {
    const stock = Math.max(0, parseInt(value, 10) || 0);
    const variants = (editing.variants || []).map(v => ({ ...v }));
    const idx = variants.findIndex(v => (v.size || '') === (size || '') && (v.color || '') === (color || ''));
    if (idx >= 0) variants[idx].stock = stock;
    else variants.push({ size: size || '', color: color || '', stock });
    editing = { ...editing, variants };
  }

  $: totalStock = (editing?.variants || []).reduce((sum, v) => sum + (v.stock || 0), 0);

  async function handleSave() {
    if (!editing || saving) return;
    saving = true;
    try {
      // Keep image and aggregate stock in sync with the edited fields
      const p = { ...editing, image: editing.images[0] || editing.image || '', stock: totalStock };
      if (isNew) {
        await onUpdate([...products, { ...p, id: `prod-${Date.now()}` }]);
      } else {
        await onUpdate(products.map(prod => prod.id === p.id ? p : prod));
      }
      editing = null; isNew = false;
    } catch (e) {
      // Admin.svelte surfaces save failures via its own toast; just keep the dialog open here.
    } finally {
      saving = false;
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    deletingId = id;
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error((await res.json()).error);
      // Deletion (and its stock/asset cleanup) is already persisted server-side —
      // sync local state only, don't trigger another full-blob save.
      onLocalUpdate(products.filter(p => p.id !== id));
    } catch (e) {
      alert(`Failed to delete: ${e.message}`);
    } finally {
      deletingId = null;
    }
  }
  function handleAdd() {
    editing = { ...emptyProduct, images: [], variants: buildVariants(emptyProduct.sizes, emptyProduct.colors, []) };
    isNew = true;
  }

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
    const sizes = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
    editing = { ...editing, sizes, variants: buildVariants(sizes, editing.colors, editing.variants) };
  }
  function updateColors(e) {
    const colors = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
    editing = { ...editing, colors, variants: buildVariants(editing.sizes, colors, editing.variants) };
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
                <button aria-label="Edit product" onclick={() => {
                    const sizes = p.sizes || [];
                    const colors = p.colors || [];
                    editing = { ...p, images: [...(p.images || [p.image].filter(Boolean))], sizes, colors, variants: buildVariants(sizes, colors, p.variants || []) };
                    isNew = false;
                  }} class="p-1.5 text-muted-foreground hover:text-foreground transition-colors active:scale-90">
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                </button>
                <button aria-label="Delete product" onclick={() => handleDelete(p.id, p.name)} disabled={deletingId === p.id} class="p-1.5 text-muted-foreground hover:text-destructive transition-colors active:scale-90 disabled:opacity-40 disabled:cursor-wait">
                  {#if deletingId === p.id}
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  {:else}
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  {/if}
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
              <label for="edit-sizes" class="text-label block mb-1.5">SIZES (comma sep.)</label>
              <input id="edit-sizes" value={sizesStr} oninput={updateSizes} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
            </div>
            <div>
              <label for="edit-colors" class="text-label block mb-1.5">COLORS (comma sep.)</label>
              <input id="edit-colors" value={colorsStr} oninput={updateColors} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors" />
            </div>
          </div>

          <!-- Stock per size/color variant -->
          <div>
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-label">STOCK {editing.sizes.length && editing.colors.length ? 'PER SIZE / COLOR' : editing.sizes.length ? 'PER SIZE' : editing.colors.length ? 'PER COLOR' : ''}</span>
              <span class="text-xs text-muted-foreground tabular-nums">Total: {totalStock}</span>
            </div>
            {#if editing.sizes.length && editing.colors.length}
              <div class="border border-border overflow-x-auto">
                <table class="w-full text-xs">
                  <thead>
                    <tr class="border-b border-border">
                      <th class="p-2 text-left text-label"></th>
                      {#each editing.colors as color}<th class="p-2 text-center text-label font-normal">{color}</th>{/each}
                    </tr>
                  </thead>
                  <tbody>
                    {#each editing.sizes as size}
                      <tr class="border-b border-border/50 last:border-b-0">
                        <td class="p-2 font-medium">{size}</td>
                        {#each editing.colors as color}
                          <td class="p-2">
                            <input
                              type="number" min="0"
                              value={variantStock(size, color)}
                              oninput={(e) => updateVariantStock(size, color, e.target.value)}
                              class="w-16 mx-auto block bg-transparent border border-border px-1.5 py-1 text-center text-xs focus:outline-none focus:border-foreground transition-colors tabular-nums"
                            />
                          </td>
                        {/each}
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {:else}
              <div class="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {#each (editing.sizes.length ? editing.sizes : editing.colors.length ? editing.colors : ['Stock']) as label}
                  <div>
                    <p class="text-[10px] text-muted-foreground mb-1 uppercase tracking-wide truncate">{label}</p>
                    <input
                      type="number" min="0"
                      value={variantStock(editing.sizes.length ? label : '', editing.colors.length ? label : '')}
                      oninput={(e) => updateVariantStock(editing.sizes.length ? label : '', editing.colors.length ? label : '', e.target.value)}
                      class="w-full bg-transparent border border-border px-2 py-1.5 text-sm text-center focus:outline-none focus:border-foreground transition-colors tabular-nums"
                    />
                  </div>
                {/each}
              </div>
            {/if}
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
