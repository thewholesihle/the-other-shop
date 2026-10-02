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

  let { orders = [], currency = 'R', site = {}, contactAddress = '', onUpdate = () => {} } = $props();

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

  // The PDF libraries are self-hosted (public/vendor) and loaded on first use, so the
  // admin never executes third-party scripts. (A <script> inside <svelte:head> is inserted
  // without being executed, which is why the old button silently did nothing.)
  const loadScript = (src) => new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = resolve;
    el.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(el);
  });
  let pdfLibs = null;
  function loadPdfLibs() {
    if (window.jspdf?.jsPDF?.API?.autoTable) return Promise.resolve();
    pdfLibs ??= loadScript('/vendor/jspdf.umd.min.js')
      .then(() => loadScript('/vendor/jspdf.plugin.autotable.min.js'))
      .catch((e) => { pdfLibs = null; throw e; });
    return pdfLibs;
  }

  let pdfBusyId = $state(null);
  async function exportPDF(order) {
    pdfBusyId = order.id;
    try {
      await loadPdfLibs();
      await buildInvoice(order);
    } catch (e) {
      toast.error(`Couldn't create the invoice: ${e.message}`);
    } finally {
      pdfBusyId = null;
    }
  }

  // ── Invoice PDF ───────────────────────────────────────────────────────────
  // Same visual language as the admin: zinc neutrals, hairline rules, a dark brand band
  // (the same treatment as the order emails, so the same logo file works on it).
  const INK = [9, 9, 11], MUTED = [113, 113, 122], RULE = [228, 228, 231], SOFT = [244, 244, 245];
  const PILL = {
    paid: { bg: [220, 252, 231], fg: [22, 101, 52], label: 'PAID' },
    processing: { bg: [237, 233, 254], fg: [91, 33, 182], label: 'PROCESSING' },
    shipped: { bg: [219, 234, 254], fg: [30, 64, 175], label: 'SHIPPED' },
    delivered: { bg: [244, 244, 245], fg: [63, 63, 70], label: 'DELIVERED' },
    pending_payment: { bg: [254, 243, 199], fg: [146, 64, 14], label: 'AWAITING PAYMENT' },
    cancelled: { bg: [254, 226, 226], fg: [153, 27, 27], label: 'CANCELLED' },
  };

  // Rasterises the logo so jsPDF can embed it. Cloudinary is asked for a PNG (jsPDF can't
  // embed webp/avif) and served with CORS headers, so the canvas stays readable.
  function loadLogo(url) {
    if (!url) return Promise.resolve(null);
    const src = url.includes('res.cloudinary.com') ? url.replace('/upload/', '/upload/f_png,w_600/') : url;
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 6000);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        clearTimeout(timer);
        try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          resolve({ data: c.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight });
        } catch { resolve(null); }
      };
      img.onerror = () => { clearTimeout(timer); resolve(null); };
      img.src = src;
    });
  }

  // Helvetica (built into PDFs) has no glyph for the thin/narrow spaces toLocaleString emits,
  // so thousands are grouped by hand with a plain space.
  const pdfMoney = (n) => `${currency}${Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;

  async function buildInvoice(order) {
    const { jsPDF } = window.jspdf;
    const logo = await loadLogo(site?.emailLogo || site?.logo);
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, M = 18, R = W - M;
    const siteName = site?.name || 'Others.';
    const issued = dateOf(order);
    const pill = PILL[order.status] || { bg: SOFT, fg: INK, label: String(order.status || '').toUpperCase() };

    // Brand band
    doc.setFillColor(...INK);
    doc.rect(0, 0, W, 30, 'F');
    if (logo) {
      const maxH = 11, maxW = 56;
      let h = maxH, w = (logo.w / logo.h) * h;
      if (w > maxW) { w = maxW; h = (logo.h / logo.w) * w; }
      doc.addImage(logo.data, 'PNG', M, (30 - h) / 2, w, h);
    } else {
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
      doc.text(siteName, M, 18.5);
    }
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('INVOICE', R, 14.5, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(212, 212, 216);
    doc.text(order.id, R, 20, { align: 'right' });

    // Title row: amount + status pill
    let y = 46;
    doc.setTextColor(...MUTED); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text('Amount', M, y);
    doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(26);
    doc.text(pdfMoney(order.total), M, y + 11);

    doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    const pw = doc.getTextWidth(pill.label) + 8;
    doc.setFillColor(...pill.bg);
    doc.roundedRect(R - pw, y + 3.2, pw, 7, 3.5, 3.5, 'F');
    doc.setTextColor(...pill.fg);
    doc.text(pill.label, R - pw / 2, y + 7.9, { align: 'center' });

    // Meta (issued / reference / payment)
    y += 24;
    doc.setDrawColor(...RULE); doc.setLineWidth(0.3);
    doc.line(M, y, R, y);
    y += 7;
    const meta = [
      ['Issued', issued.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })],
      ['Order', order.id],
      ['Payment ref', order.payfastId || '—'],
    ];
    const colW = (R - M) / 3;
    meta.forEach(([label, value], i) => {
      const x = M + i * colW;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED);
      doc.text(label, x, y);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...INK);
      doc.text(doc.splitTextToSize(String(value), colW - 4), x, y + 5.5);
    });

    // Billed to / From
    y += 18;
    doc.line(M, y, R, y);
    y += 8;
    const block = (x, heading, lines) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED);
      doc.text(heading, x, y);
      let yy = y + 5.5;
      lines.filter(Boolean).forEach((line, i) => {
        doc.setFont('helvetica', i === 0 ? 'bold' : 'normal'); doc.setFontSize(10); doc.setTextColor(...(i === 0 ? INK : [63, 63, 70]));
        const wrapped = doc.splitTextToSize(String(line), (R - M) / 2 - 8);
        doc.text(wrapped, x, yy);
        yy += wrapped.length * 4.6;
      });
      return yy;
    };
    const addressLines = (order.address || '').split(',').map(t => t.trim()).filter(Boolean).join('\n').split('\n');
    const endLeft = block(M, 'BILLED TO', [order.customer || 'Customer', order.email, order.phone, ...addressLines]);
    const endRight = block(M + (R - M) / 2 + 4, 'FROM', [siteName, ...String(contactAddress || '').split(/\n|,/).map(t => t.trim()), (site?.adminNotificationEmails || '').split(',')[0]?.trim()]);
    y = Math.max(endLeft, endRight) + 4;

    // Items
    doc.autoTable({
      startY: y,
      margin: { left: M, right: M },
      head: [['Item', 'Qty', 'Unit price', 'Amount']],
      body: (order.items || []).map(item => [
        { content: item.name + ([item.size, item.color].filter(Boolean).length ? '\n' + [item.size, item.color].filter(Boolean).join(' / ') : ''), styles: {} },
        String(item.quantity),
        pdfMoney(item.price),
        pdfMoney(item.price * item.quantity),
      ]),
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 9.5, textColor: INK, cellPadding: { top: 4, bottom: 4, left: 3, right: 3 }, lineColor: RULE, lineWidth: 0 },
      headStyles: { fillColor: SOFT, textColor: MUTED, fontStyle: 'bold', fontSize: 8, cellPadding: { top: 3.2, bottom: 3.2, left: 3, right: 3 } },
      columnStyles: { 0: { cellWidth: 'auto' }, 1: { halign: 'center', cellWidth: 16 }, 2: { halign: 'right', cellWidth: 32 }, 3: { halign: 'right', cellWidth: 32, fontStyle: 'bold' } },
      didParseCell: (d) => { if (d.section === 'head' && d.column.index > 0) d.cell.styles.halign = d.column.index === 1 ? 'center' : 'right'; },
      didDrawCell: (d) => {
        if (d.section === 'body') {
          doc.setDrawColor(...RULE); doc.setLineWidth(0.2);
          doc.line(d.cell.x, d.cell.y + d.cell.height, d.cell.x + d.cell.width, d.cell.y + d.cell.height);
        }
      },
    });

    // Totals
    let ty = (doc.lastAutoTable?.finalY || y) + 8;
    if (ty > 245) { doc.addPage(); ty = 24; }
    const subtotal = (order.total || 0) - (order.shippingCost || 0);
    const labelX = R - 70;
    const row = (label, value, strong = false) => {
      doc.setFont('helvetica', strong ? 'bold' : 'normal'); doc.setFontSize(strong ? 12 : 9.5);
      doc.setTextColor(...(strong ? INK : MUTED));
      doc.text(label, labelX, ty);
      doc.setTextColor(...INK);
      doc.text(value, R, ty, { align: 'right' });
      ty += strong ? 0 : 6.5;
    };
    row('Subtotal', pdfMoney(subtotal));
    row('Shipping', order.shippingCost ? pdfMoney(order.shippingCost) : 'Free');
    doc.setDrawColor(...INK); doc.setLineWidth(0.4);
    doc.line(labelX, ty - 2.5, R, ty - 2.5);
    ty += 4;
    row('Total', pdfMoney(order.total), true);

    // Delivery / tracking
    if (order.carrier || order.trackingNumber || order.estimatedDelivery) {
      ty += 14;
      doc.setFillColor(...SOFT);
      doc.roundedRect(M, ty, R - M, 20, 2, 2, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED);
      const cells = [['CARRIER', order.carrier], ['TRACKING NO.', order.trackingNumber], ['EST. DELIVERY', order.estimatedDelivery]];
      cells.forEach(([label, value], i) => {
        const x = M + 6 + i * ((R - M - 6) / 3);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED);
        doc.text(label, x, ty + 7);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...INK);
        doc.text(String(value || '—'), x, ty + 13.5);
      });
    }

    // Footer on every page
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setDrawColor(...RULE); doc.setLineWidth(0.3);
      doc.line(M, 280, R, 280);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED);
      doc.text(`Thank you for shopping with ${siteName}.`, M, 285);
      doc.text(`Page ${p} of ${pages}`, R, 285, { align: 'right' });
    }

    doc.save(`Invoice-${order.id}.pdf`);
  }

  // Progress through the happy path, for the stepper in the detail panel.
  const STEPS = ['paid', 'processing', 'shipped', 'delivered'];
  const stepIndex = (status) => STEPS.indexOf(status);
</script>

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
      <Button variant="outline" disabled={pdfBusyId === selected.id} onclick={() => exportPDF(selected)}>
        {#if pdfBusyId === selected.id}<LoaderCircle size={15} class="animate-spin" />{:else}<Download size={15} />{/if} Invoice PDF
      </Button>
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
