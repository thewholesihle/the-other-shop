<script>
  import { thumb, getOptimizedUrl } from '../../lib/cloudinary.js';
  import ImageUpload from './ImageUpload.svelte';
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
  import Search from 'lucide-svelte/icons/search';
  import ArrowLeft from 'lucide-svelte/icons/arrow-left';
  import LoaderCircle from 'lucide-svelte/icons/loader-circle';
  import Package from 'lucide-svelte/icons/package';

  let { products = [], categories = [], currency = 'R', onUpdate = () => {}, onLocalUpdate = null } = $props();
  const syncLocal = (list) => (onLocalUpdate || onUpdate)(list);

  let editing = $state(null);
  let isNew = $state(false);
  let deletingId = $state(null);
  let saving = $state(false);
  let query = $state('');
  let snapshot = $state('');

  const emptyProduct = () => ({
    id: '', name: '', category: '', price: 0,
    image: '', images: [], colorImages: [],
    description: '',
    sizes: ['S', 'M', 'L', 'XL'], colors: [], stock: 0, variants: [],
    isNew: false, isFeatured: false,
  });

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

  let totalStock = $derived((editing?.variants || []).reduce((sum, v) => sum + (v.stock || 0), 0));
  let dirty = $derived(editing ? JSON.stringify(editing) !== snapshot : false);

  function colorImages(color) {
    return (editing?.colorImages || []).find(ci => ci.color === color)?.images || [];
  }
  function updateColorImages(color, urls) {
    const list = (editing.colorImages || []).filter(ci => ci.color !== color);
    if (urls.length) list.push({ color, images: urls });
    editing = { ...editing, colorImages: list };
  }

  function startEditing(p, creating) {
    const base = creating ? emptyProduct() : p;
    const sizes = base.sizes || [];
    const colors = base.colors || [];
    editing = {
      ...base,
      images: [...(base.images || [base.image].filter(Boolean))],
      colorImages: [...(base.colorImages || [])],
      sizes, colors,
      variants: buildVariants(sizes, colors, base.variants || []),
    };
    isNew = creating;
    snapshot = JSON.stringify(editing);
  }

  function closeEditor() { editing = null; isNew = false; }

  async function requestClose() {
    if (dirty && !(await confirmDialog.ask({
      title: 'Discard changes?', description: 'You have unsaved changes to this product.',
      confirmLabel: 'Discard', destructive: true,
    }))) return;
    closeEditor();
  }

  async function handleSave() {
    if (!editing || saving) return;
    if (!editing.name.trim()) return toast.error('Give the product a name.');
    if (!editing.category) return toast.error('Choose a category.');
    if (!(Number(editing.price) >= 0)) return toast.error('Enter a valid price.');
    saving = true;
    try {
      // Keep image and aggregate stock in sync with the edited fields
      const p = { ...editing, image: editing.images[0] || editing.image || '', stock: totalStock };
      if (isNew) {
        await onUpdate([...products, { ...p, id: `prod-${Date.now()}` }]);
      } else {
        await onUpdate(products.map(prod => prod.id === p.id ? p : prod));
      }
      closeEditor();
    } catch (e) {
      // Admin.svelte surfaces save failures via its own toast; keep the editor open.
    } finally {
      saving = false;
    }
  }

  async function handleDelete(id, name) {
    const ok = await confirmDialog.ask({
      title: `Delete “${name}”?`,
      description: 'The product and its uploaded images are permanently removed. This cannot be undone.',
      confirmLabel: 'Delete product', destructive: true,
    });
    if (!ok) return;
    deletingId = id;
    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Request failed');
      // Deletion (and its stock/asset cleanup) is already persisted server-side —
      // sync local state only, don't trigger another full-blob save.
      syncLocal(products.filter(p => p.id !== id));
      toast.success('Product deleted');
    } catch (e) {
      toast.error(`Failed to delete: ${e.message}`);
    } finally {
      deletingId = null;
    }
  }

  const categoryName = (id) => categories.find(c => c.id === id)?.name || id || '—';
  const money = (n) => `${currency}${Number(n || 0).toFixed(2)}`;

  function stockBadge(p) {
    if (p.stock === 0) return { label: 'Sold out', variant: 'destructive' };
    if (p.stock <= 10) return { label: `${p.stock} left`, variant: 'warning' };
    return { label: 'In stock', variant: 'success' };
  }

  let filtered = $derived(products.filter(p => {
    const q = query.toLowerCase().trim();
    return !q || p.name.toLowerCase().includes(q) || categoryName(p.category).toLowerCase().includes(q);
  }));

  let sizesStr = $derived(editing ? editing.sizes.join(', ') : '');
  let colorsStr = $derived(editing ? editing.colors.join(', ') : '');

  function updateSizes(e) {
    const sizes = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
    editing = { ...editing, sizes, variants: buildVariants(sizes, editing.colors, editing.variants) };
  }
  function updateColors(e) {
    const colors = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
    // Drop per-color image sets for colors that no longer exist on this product.
    const colorImgs = (editing.colorImages || []).filter(ci => colors.includes(ci.color));
    editing = { ...editing, colors, colorImages: colorImgs, variants: buildVariants(editing.sizes, colors, editing.variants) };
  }
</script>

{#if !editing}
  <div class="space-y-6">
    <div class="flex items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Products</h1>
        <p class="text-sm text-muted-foreground">{products.length} product{products.length === 1 ? '' : 's'} in your catalogue.</p>
      </div>
      <Button onclick={() => startEditing(null, true)}><Plus size={16} /> Add product</Button>
    </div>

    <div class="relative max-w-sm">
      <Search size={15} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input type="search" bind:value={query} placeholder="Search products or categories" aria-label="Search products" class="{inputCls} pl-9" />
    </div>

    <Card class="overflow-hidden">
      {#if filtered.length === 0}
        <div class="flex flex-col items-center gap-2 py-16 text-center">
          <Package size={28} class="text-muted-foreground" />
          <p class="font-medium">{products.length ? 'No matching products' : 'No products yet'}</p>
          <p class="text-sm text-muted-foreground">{products.length ? 'Try a different search.' : 'Add your first product to start selling.'}</p>
        </div>
      {:else}
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="border-b border-border">
              <tr>
                <th class={thCls}>Product</th>
                <th class="{thCls} hidden md:table-cell">Category</th>
                <th class="{thCls} text-right">Price</th>
                <th class="{thCls} text-right">Stock</th>
                <th class={thCls}>Status</th>
                <th class="{thCls} w-24 text-right"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {#each filtered as p (p.id)}
                {@const sb = stockBadge(p)}
                <tr class="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50">
                  <td class={tdCls}>
                    <button type="button" class="flex items-center gap-3 text-left" onclick={() => startEditing(p, false)}>
                      {#if p.image || p.images?.[0]}
                        <img src={thumb(p.image || p.images?.[0], 40)} loading="lazy" decoding="async" alt="" class="h-10 w-10 flex-shrink-0 rounded-md bg-muted object-cover" />
                      {:else}
                        <div class="h-10 w-10 flex-shrink-0 rounded-md bg-muted"></div>
                      {/if}
                      <span>
                        <span class="block font-medium">{p.name}</span>
                        <span class="text-xs text-muted-foreground">{(p.images || []).length} image{(p.images || []).length !== 1 ? 's' : ''}{p.isNew ? ' · New' : ''}{p.isFeatured ? ' · Featured' : ''}</span>
                      </span>
                    </button>
                  </td>
                  <td class="{tdCls} hidden text-muted-foreground md:table-cell">{categoryName(p.category)}</td>
                  <td class="{tdCls} text-right tabular-nums">{money(p.price)}</td>
                  <td class="{tdCls} text-right tabular-nums">{p.stock}</td>
                  <td class={tdCls}><Badge variant={sb.variant}>{sb.label}</Badge></td>
                  <td class="{tdCls} text-right">
                    <div class="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" aria-label="Edit {p.name}" onclick={() => startEditing(p, false)}><Pencil size={15} /></Button>
                      <Button variant="ghost" size="icon" aria-label="Delete {p.name}" class="hover:text-destructive" disabled={deletingId === p.id} onclick={() => handleDelete(p.id, p.name)}>
                        {#if deletingId === p.id}<LoaderCircle size={15} class="animate-spin" />{:else}<Trash2 size={15} />{/if}
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
      <button type="button" onclick={requestClose} class="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft size={14} /> Products</button>
      <h1 class="text-2xl font-semibold tracking-tight">{isNew ? 'New product' : editing.name || 'Edit product'}</h1>
    </div>

    <div class="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
      <div class="space-y-6 lg:col-span-2">
        <Card title="Details">
          <div class="space-y-4 p-6 pt-4">
            <div>
              <label for="edit-name" class={labelCls}>Name</label>
              <input id="edit-name" bind:value={editing.name} class={inputCls} />
            </div>
            <div>
              <label for="edit-desc" class={labelCls}>Description</label>
              <textarea id="edit-desc" bind:value={editing.description} rows={4} class={textareaCls}></textarea>
            </div>
          </div>
        </Card>

        <Card title="Media" description="The first image is the cover shown in the shop.">
          <div class="p-6 pt-4">
            <ImageUpload
              multi
              label=""
              values={editing.images}
              onChange={(urls) => (editing = { ...editing, images: urls, image: urls[0] || '' })}
            />
          </div>
        </Card>

        <Card title="Variants & stock" description="List the sizes and colours you offer, then set the stock for each combination.">
          <div class="space-y-6 p-6 pt-4">
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label for="edit-sizes" class={labelCls}>Sizes</label>
                <input id="edit-sizes" value={sizesStr} oninput={updateSizes} placeholder="S, M, L, XL" class={inputCls} />
                <p class={hintCls}>Separate with commas.</p>
              </div>
              <div>
                <label for="edit-colors" class={labelCls}>Colours</label>
                <input id="edit-colors" value={colorsStr} oninput={updateColors} placeholder="Black, Bone" class={inputCls} />
                <p class={hintCls}>Separate with commas. Leave empty if there is one colour.</p>
              </div>
            </div>

            <div>
              <div class="mb-2 flex items-center justify-between">
                <p class="text-sm font-medium">Stock {editing.sizes.length && editing.colors.length ? 'per size and colour' : editing.sizes.length ? 'per size' : editing.colors.length ? 'per colour' : ''}</p>
                <p class="text-sm text-muted-foreground">Total <span class="font-semibold text-foreground tabular-nums">{totalStock}</span></p>
              </div>
              {#if editing.sizes.length && editing.colors.length}
                <div class="overflow-x-auto rounded-lg border border-border">
                  <table class="w-full text-sm">
                    <thead class="bg-muted/50">
                      <tr class="border-b border-border">
                        <th class="{thCls} h-9"></th>
                        {#each editing.colors as color}<th class="{thCls} h-9 text-center">{color}</th>{/each}
                      </tr>
                    </thead>
                    <tbody>
                      {#each editing.sizes as size}
                        <tr class="border-b border-border/60 last:border-0">
                          <td class="px-4 py-2 font-medium">{size}</td>
                          {#each editing.colors as color}
                            <td class="px-4 py-2">
                              <input
                                type="number" min="0"
                                aria-label="Stock for {size} {color}"
                                value={variantStock(size, color)}
                                oninput={(e) => updateVariantStock(size, color, e.target.value)}
                                class="{inputCls} mx-auto h-8 w-20 text-center tabular-nums"
                              />
                            </td>
                          {/each}
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {:else}
                <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {#each (editing.sizes.length ? editing.sizes : editing.colors.length ? editing.colors : ['Stock']) as label}
                    <div>
                      <p class="mb-1 truncate text-xs text-muted-foreground">{label}</p>
                      <input
                        type="number" min="0"
                        aria-label="Stock for {label}"
                        value={variantStock(editing.sizes.length ? label : '', editing.colors.length ? label : '')}
                        oninput={(e) => updateVariantStock(editing.sizes.length ? label : '', editing.colors.length ? label : '', e.target.value)}
                        class="{inputCls} text-center tabular-nums"
                      />
                    </div>
                  {/each}
                </div>
              {/if}
            </div>

            {#if editing.colors.length}
              <div class="border-t border-border pt-6">
                <p class="text-sm font-medium">Per-colour images <span class="font-normal text-muted-foreground">(optional)</span></p>
                <p class="mb-4 mt-1 text-sm text-muted-foreground">Give a colour its own photos, shown once a shopper picks it. A colour left empty uses the general images above.</p>
                <div class="space-y-4">
                  {#each editing.colors as color}
                    <div class="rounded-lg border border-border p-4">
                      <ImageUpload multi label={color} values={colorImages(color)} onChange={(urls) => updateColorImages(color, urls)} />
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        </Card>
      </div>

      <div class="space-y-6">
        <Card title="Pricing & category">
          <div class="space-y-4 p-6 pt-4">
            <div>
              <label for="edit-price" class={labelCls}>Price ({currency})</label>
              <input id="edit-price" type="number" min="0" step="0.01" bind:value={editing.price} class="{inputCls} tabular-nums" />
            </div>
            <div>
              <label for="edit-category" class={labelCls}>Category</label>
              <select id="edit-category" bind:value={editing.category} class={selectCls}>
                <option value="">Select a category…</option>
                {#each categories as cat}<option value={cat.id}>{cat.name}</option>{/each}
              </select>
            </div>
          </div>
        </Card>

        <Card title="Visibility">
          <div class="space-y-5 p-6 pt-4">
            <div class="flex items-center justify-between gap-4">
              <div class="text-sm"><p class="font-medium">New arrival</p><p class="text-muted-foreground">Show the “New” tag</p></div>
              <Switch bind:checked={editing.isNew} aria-label="New arrival" />
            </div>
            <div class="flex items-center justify-between gap-4">
              <div class="text-sm"><p class="font-medium">Featured</p><p class="text-muted-foreground">Show on the homepage</p></div>
              <Switch bind:checked={editing.isFeatured} aria-label="Featured on homepage" />
            </div>
          </div>
        </Card>
      </div>
    </div>

    <div class="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/90 backdrop-blur md:left-60">
      <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-8">
        <p class="text-sm {dirty ? 'text-foreground' : 'text-muted-foreground'}">{dirty ? 'You have unsaved changes' : 'No changes yet'}</p>
        <div class="flex gap-2">
          <Button variant="outline" disabled={saving} onclick={requestClose}>Cancel</Button>
          <Button disabled={saving} onclick={handleSave}>
            {#if saving}<LoaderCircle size={15} class="animate-spin" /> Saving…{:else}Save product{/if}
          </Button>
        </div>
      </div>
    </div>
  </div>
{/if}
