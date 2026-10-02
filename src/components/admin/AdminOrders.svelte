<script>
  import Button from '../ui/Button.svelte';
  import Badge from '../ui/Badge.svelte';
  import Card from '../ui/Card.svelte';
  import Tabs from '../ui/Tabs.svelte';
  import Sheet from '../ui/Sheet.svelte';
  import { inputCls, textareaCls, labelCls, hintCls, thCls, tdCls } from '../../lib/ui.js';
  import { toast } from '../../lib/toast.js';
  import { confirmDialog } from '../../lib/confirm.js';
  import Search from 'lucide-svelte/icons/search';
  import Download from 'lucide-svelte/icons/download';
  import Truck from 'lucide-svelte/icons/truck';
  import LoaderCircle from 'lucide-svelte/icons/loader-circle';
  import ShoppingBag from 'lucide-svelte/icons/shopping-bag';

  let { orders = [], currency = 'R', onUpdate = () => {} } = $props();

  const STATUS = {
    pending_payment: { label: 'Pending payment', variant: 'warning' },
    pending:         { label: 'Pending',         variant: 'warning' },
    paid:            { label: 'Paid',            variant: 'success' },
    processing:      { label: 'Processing',      variant: 'violet' },
    shipped:         { label: 'Shipped',         variant: 'info' },
    delivered:       { label: 'Delivered',       variant: 'secondary' },
    cancelled:       { label: 'Cancelled',       variant: 'destructive' },
  };
  const statusOf = (s) => STATUS[s] || { label: s, variant: 'secondary' };

  const EMAIL_TYPE_LABELS = {
    paid: 'Order confirmation', processing: 'Processing update', shipped: 'Shipped',
    delivered: 'Delivered', cancelled: 'Cancellation',
  };

  let filter = $state('all');
  let searchQuery = $state('');
  let selectedId = $state(null);
  let sheetOpen = $state(false);
  let pendingId = $state(null); // order id mid-request (status patch or delete)
  let cancelling = $state(false);
  let cancelReason = $state('');
  let shippingForm = $state({ carrier: '', trackingNumber: '', estimatedDelivery: '' });

  const money = (n) => `${currency}${Number(n || 0).toFixed(2)}`;
  const dateOf = (o) => new Date(o.createdAt || o.date || Date.now());
  const fmtDate = (o, opts = { dateStyle: 'medium', timeStyle: 'short' }) => dateOf(o).toLocaleString([], opts);

  let sortedOrders = $derived([...orders].sort((a, b) => dateOf(b) - dateOf(a)));
  let counts = $derived(Object.fromEntries(
    ['all', ...Object.keys(STATUS).filter(s => s !== 'pending')].map(s => [s, s === 'all' ? orders.length : orders.filter(o => o.status === s).length])
  ));
  let tabItems = $derived([
    { value: 'all', label: 'All', count: counts.all },
    { value: 'paid', label: 'To ship', count: counts.paid },
    { value: 'processing', label: 'Processing', count: counts.processing },
    { value: 'shipped', label: 'Shipped', count: counts.shipped },
    { value: 'delivered', label: 'Delivered', count: counts.delivered },
    { value: 'pending_payment', label: 'Unpaid', count: counts.pending_payment },
    { value: 'cancelled', label: 'Cancelled', count: counts.cancelled },
  ]);
  let filteredOrders = $derived(sortedOrders.filter(o => {
    if (filter !== 'all' && o.status !== filter) return false;
    const q = searchQuery.toLowerCase().trim();
    return !q ||
      o.id.toLowerCase().includes(q) ||
      (o.customer || '').toLowerCase().includes(q) ||
      (o.email || '').toLowerCase().includes(q) ||
      (o.phone || '').toLowerCase().includes(q) ||
      (o.trackingNumber || '').toLowerCase().includes(q);
  }));
  let selected = $derived(orders.find(o => o.id === selectedId) || null);

  function openOrder(order) {
    selectedId = order.id;
    cancelling = false;
    cancelReason = '';
    shippingForm = {
      carrier: order.carrier || '',
      trackingNumber: order.trackingNumber || '',
      estimatedDelivery: order.estimatedDelivery || '',
    };
    sheetOpen = true;
  }

  async function patchStatus(orderId, status, reason = '', extra = {}) {
    pendingId = orderId;
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reason, ...extra }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Request failed');
      onUpdate(orders.map(o => o.id === orderId ? { ...o, status, adminNote: reason || o.adminNote, ...extra } : o));
      const r = body.emailResult;
      if (r?.sent) toast.success(`${EMAIL_TYPE_LABELS[r.type] || r.type} email sent to ${r.to}`);
      else if (r) toast.error(`Order updated, but the email wasn't sent (${r.reason})`);
      else toast.success('Order updated');
      return true;
    } catch (e) {
      toast.error(`Failed to update order: ${e.message}`);
      return false;
    } finally {
      pendingId = null;
    }
  }

  async function confirmCancel(orderId) {
    if (await patchStatus(orderId, 'cancelled', cancelReason)) {
      cancelling = false;
      cancelReason = '';
    }
  }

  async function markShipped(orderId) {
    await patchStatus(orderId, 'shipped', '', { ...shippingForm });
  }

  async function handleDelete(order) {
    const ok = await confirmDialog.ask({
      title: `Delete order ${order.id}?`,
      description: 'This permanently removes the order. Reserved stock is returned to inventory.',
      confirmLabel: 'Delete order',
      destructive: true,
    });
    if (!ok) return;
    pendingId = order.id;
    try {
      const res = await fetch(`/api/orders/${order.id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Request failed');
      sheetOpen = false;
      onUpdate(orders.filter(o => o.id !== order.id));
      toast.success('Order deleted');
    } catch (e) {
      toast.error(`Failed to delete order: ${e.message}`);
    } finally {
      pendingId = null;
    }
  }

  function exportPDF(order) {
    if (!window.jspdf) return toast.info('PDF library is still loading — try again in a moment.');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text(`Invoice - ${order.id}`, 14, 22);

    doc.setFontSize(11);
    doc.text(`Customer: ${order.customer}`, 14, 32);
    doc.text(`Email: ${order.email}`, 14, 38);
    doc.text(`Address: ${order.address}`, 14, 44);
    doc.text(`Date: ${dateOf(order).toLocaleString()}`, 14, 50);
    doc.text(`Status: ${order.status.toUpperCase().replace('_', ' ')}`, 14, 56);

    const tableData = (order.items || []).map(item => [
      item.name,
      [item.size, item.color].filter(Boolean).join(' / ') || '-',
      item.quantity.toString(),
      `${currency}${item.price.toFixed(2)}`,
      `${currency}${(item.price * item.quantity).toFixed(2)}`
    ]);

    doc.autoTable({
      startY: 65,
      head: [['Item', 'Size/Color', 'Qty', 'Unit Price', 'Total']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [20, 20, 20] }
    });

    const finalY = doc.lastAutoTable.finalY || 65;
    doc.text(`Shipping: ${currency}${(order.shippingCost || 0).toFixed(2)}`, 14, finalY + 10);
    doc.setFontSize(14);
    doc.text(`Grand Total: ${currency}${order.total.toFixed(2)}`, 14, finalY + 20);

    doc.save(`${order.id}.pdf`);
  }

  // Progress through the happy path, for the stepper in the detail panel.
  const STEPS = ['paid', 'processing', 'shipped', 'delivered'];
  const stepIndex = (status) => STEPS.indexOf(status);
</script>

<svelte:head>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"></script>
</svelte:head>

<div class="space-y-6">
  <div>
    <h1 class="text-2xl font-semibold tracking-tight">Orders</h1>
    <p class="text-sm text-muted-foreground">Pack and post paid orders yourself, then add the carrier and tracking number when you ship.</p>
  </div>

  <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
    <div class="overflow-x-auto"><Tabs items={tabItems} bind:value={filter} label="Filter orders by status" /></div>
    <div class="relative w-full lg:w-80">
      <Search size={15} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input type="search" bind:value={searchQuery} placeholder="Search name, email, order or tracking #" aria-label="Search orders" class="{inputCls} pl-9" />
    </div>
  </div>

  <Card class="overflow-hidden">
    {#if filteredOrders.length === 0}
      <div class="flex flex-col items-center gap-2 py-16 text-center">
        <ShoppingBag size={28} class="text-muted-foreground" />
        <p class="font-medium">No orders found</p>
        <p class="text-sm text-muted-foreground">{searchQuery ? 'Try a different search.' : 'Nothing in this status yet.'}</p>
      </div>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full caption-bottom text-sm">
          <thead class="border-b border-border">
            <tr>
              <th class={thCls}>Order</th>
              <th class="{thCls} hidden md:table-cell">Customer</th>
              <th class="{thCls} hidden lg:table-cell">Items</th>
              <th class={thCls}>Status</th>
              <th class="{thCls} text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredOrders as order (order.id)}
              {@const st = statusOf(order.status)}
              <tr class="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50 {selectedId === order.id && sheetOpen ? 'bg-muted/60' : ''}" onclick={() => openOrder(order)}>
                <td class={tdCls}>
                  <button type="button" class="text-left font-medium tabular-nums focus-visible:underline focus-visible:outline-none">{order.id}</button>
                  <div class="text-xs text-muted-foreground">{fmtDate(order, { dateStyle: 'medium', timeStyle: 'short' })}</div>
                </td>
                <td class="{tdCls} hidden md:table-cell">
                  <div class="font-medium">{order.customer || '—'}</div>
                  <div class="text-xs text-muted-foreground">{order.email || ''}</div>
                </td>
                <td class="{tdCls} hidden lg:table-cell text-muted-foreground">{(order.items || []).reduce((n, i) => n + (i.quantity || 0), 0)} item(s)</td>
                <td class={tdCls}>
                  <span class="inline-flex items-center gap-2">
                    <Badge variant={st.variant}>{st.label}</Badge>
                    {#if pendingId === order.id}<LoaderCircle size={14} class="animate-spin text-muted-foreground" />{/if}
                  </span>
                </td>
                <td class="{tdCls} text-right font-medium tabular-nums">{money(order.total)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="border-t border-border px-4 py-3 text-xs text-muted-foreground">Showing {filteredOrders.length} of {orders.length} orders</div>
    {/if}
  </Card>
</div>

<Sheet bind:open={sheetOpen} title={selected ? selected.id : 'Order'} description={selected ? fmtDate(selected) : ''}>
  {#if selected}
    {@const st = statusOf(selected.status)}
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-lg font-semibold">{selected.customer || 'Customer'}</p>
          <p class="text-sm text-muted-foreground">{money(selected.total)} total</p>
        </div>
        <Badge variant={st.variant}>{st.label}</Badge>
      </div>

      {#if stepIndex(selected.status) >= 0}
        <ol class="flex gap-2" aria-label="Order progress">
          {#each STEPS as step, i}
            <li class="flex-1">
              <div class="h-1 rounded-full {i <= stepIndex(selected.status) ? 'bg-primary' : 'bg-border'}"></div>
              <p class="mt-1.5 text-xs {i <= stepIndex(selected.status) ? 'font-medium' : 'text-muted-foreground'}">{statusOf(step).label}</p>
            </li>
          {/each}
        </ol>
      {/if}

      <dl class="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
        <div><dt class="text-xs text-muted-foreground mb-0.5">Email</dt><dd class="break-all">{selected.email || '—'}</dd></div>
        <div><dt class="text-xs text-muted-foreground mb-0.5">Phone</dt><dd>{selected.phone || '—'}</dd></div>
        <div class="col-span-2"><dt class="text-xs text-muted-foreground mb-0.5">Deliver to</dt><dd class="whitespace-pre-line">{selected.address || '—'}</dd></div>
      </dl>

      <div class="rounded-lg border border-border">
        {#each selected.items || [] as item}
          <div class="flex items-center gap-3 border-b border-border/60 p-3">
            {#if item.image}<img src={item.image} alt="" class="h-11 w-11 rounded-md bg-muted object-cover" />{:else}<div class="h-11 w-11 rounded-md bg-muted"></div>{/if}
            <div class="min-w-0 flex-1 text-sm">
              <p class="truncate font-medium">{item.name}</p>
              <p class="text-xs text-muted-foreground">{[item.size, item.color].filter(Boolean).join(' / ') || '—'} · Qty {item.quantity}</p>
            </div>
            <p class="text-sm font-medium tabular-nums">{money(item.price * item.quantity)}</p>
          </div>
        {/each}
        <div class="flex justify-between px-3 pt-3 text-sm text-muted-foreground"><span>Shipping</span><span class="tabular-nums">{selected.shippingCost ? money(selected.shippingCost) : 'Free'}</span></div>
        <div class="flex justify-between px-3 py-3 font-semibold"><span>Total</span><span class="tabular-nums">{money(selected.total)}</span></div>
      </div>

      {#if selected.adminNote}
        <p class="rounded-lg bg-muted p-3 text-sm"><span class="font-medium">Note:</span> {selected.adminNote}</p>
      {/if}

      {#if selected.status === 'processing'}
        <div class="space-y-4 rounded-lg border border-border p-4">
          <p class="flex items-center gap-2 text-sm font-semibold"><Truck size={16} /> Shipping details</p>
          <div>
            <label for="ship-carrier" class={labelCls}>Carrier</label>
            <input id="ship-carrier" class={inputCls} bind:value={shippingForm.carrier} placeholder="e.g. The Courier Guy, PostNet, Aramex" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label for="ship-track" class={labelCls}>Tracking number</label>
              <input id="ship-track" class={inputCls} bind:value={shippingForm.trackingNumber} placeholder="Optional" />
            </div>
            <div>
              <label for="ship-eta" class={labelCls}>Est. delivery</label>
              <input id="ship-eta" type="date" class={inputCls} bind:value={shippingForm.estimatedDelivery} />
            </div>
          </div>
          <p class={hintCls}>These details are included in the “shipped” email to the customer.</p>
          <Button class="w-full" disabled={pendingId === selected.id} onclick={() => markShipped(selected.id)}>
            {#if pendingId === selected.id}<LoaderCircle size={15} class="animate-spin" />{/if} Mark as shipped
          </Button>
        </div>
      {:else if (selected.carrier || selected.trackingNumber || selected.estimatedDelivery)}
        <dl class="grid grid-cols-3 gap-4 rounded-lg border border-border p-4 text-sm">
          <div><dt class="text-xs text-muted-foreground mb-0.5">Carrier</dt><dd>{selected.carrier || '—'}</dd></div>
          <div><dt class="text-xs text-muted-foreground mb-0.5">Tracking #</dt><dd class="break-all">{selected.trackingNumber || '—'}</dd></div>
          <div><dt class="text-xs text-muted-foreground mb-0.5">Est. delivery</dt><dd>{selected.estimatedDelivery || '—'}</dd></div>
        </dl>
      {/if}

      {#if cancelling}
        <div class="space-y-3 rounded-lg border border-destructive/40 p-4">
          <label for="cancel-reason" class={labelCls}>Reason for cancelling (shown to the customer)</label>
          <textarea id="cancel-reason" class={textareaCls} bind:value={cancelReason} placeholder="Optional"></textarea>
          <div class="flex gap-2">
            <Button variant="destructive" size="sm" disabled={pendingId === selected.id} onclick={() => confirmCancel(selected.id)}>Cancel order &amp; restock</Button>
            <Button variant="ghost" size="sm" onclick={() => (cancelling = false)}>Keep order</Button>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  {#snippet footer()}
    {#if selected}
      <Button variant="outline" onclick={() => exportPDF(selected)}><Download size={15} /> Invoice PDF</Button>
      <div class="flex-1"></div>
      {#if selected.status.includes('pending')}
        <Button variant="destructive" disabled={pendingId === selected.id} onclick={() => handleDelete(selected)}>Delete order</Button>
      {/if}
      {#if (selected.status === 'paid' || selected.status === 'processing') && !cancelling}
        <Button variant="outline" onclick={() => (cancelling = true)}>Cancel order</Button>
      {/if}
      {#if selected.status === 'paid'}
        <Button disabled={pendingId === selected.id} onclick={() => patchStatus(selected.id, 'processing')}>Mark processing</Button>
      {/if}
      {#if selected.status === 'shipped'}
        <Button disabled={pendingId === selected.id} onclick={() => patchStatus(selected.id, 'delivered')}>Mark delivered</Button>
      {/if}
    {/if}
  {/snippet}
</Sheet>
