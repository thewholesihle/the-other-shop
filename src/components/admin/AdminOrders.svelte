<script>
  export let orders = [];
  export let currency = 'R';
  export let onUpdate = () => {};

  let filter = 'all';
  const statusOptions = ['all', 'pending_payment', 'paid', 'shipped', 'delivered', 'cancelled'];
  
  let rejectingId = null;
  let rejectReason = '';
  let searchQuery = '';
  let pendingId = null; // order id currently mid-request (status patch or delete)

  let shippingModalId = null;
  let shippingForm = { carrier: '', trackingNumber: '', trackingUrl: '', estimatedDelivery: '' };

  // Sort orders newest first
  $: sortedOrders = [...orders].sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
  $: filteredOrders = sortedOrders.filter(o => {
    const matchesStatus = filter === 'all' || o.status === filter;
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q || 
      o.id.toLowerCase().includes(q) || 
      (o.customer || '').toLowerCase().includes(q) || 
      (o.email || '').toLowerCase().includes(q) || 
      (o.phone || '').toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  async function patchStatus(orderId, status, reason = '', extra = {}) {
    pendingId = orderId;
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reason, ...extra }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      onUpdate(orders.map(o => o.id === orderId ? { ...o, status, adminNote: reason || o.adminNote, ...extra } : o));
    } catch (e) {
      alert(`Failed to update order: ${e.message}`);
    } finally {
      pendingId = null;
    }
  }

  function openShippingModal(orderId) {
    shippingModalId = orderId;
    shippingForm = { carrier: '', trackingNumber: '', trackingUrl: '', estimatedDelivery: '' };
  }

  async function confirmShipped(orderId) {
    await patchStatus(orderId, 'shipped', '', { ...shippingForm });
    shippingModalId = null;
  }

  function handleAccept(orderId) {
    patchStatus(orderId, 'shipped');
  }

  function handleReject(orderId) {
    rejectingId = orderId;
    rejectReason = '';
  }

  function confirmReject(orderId) {
    patchStatus(orderId, 'cancelled', rejectReason);
    rejectingId = null;
    rejectReason = '';
  }

  async function handleDelete(orderId) {
    if (!confirm('Are you sure you want to permanently delete this pending order?')) return;
    pendingId = orderId;
    try {
      const res = await fetch(`/api/orders/${orderId}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error((await res.json()).error);
      onUpdate(orders.filter(o => o.id !== orderId));
    } catch (e) {
      alert(`Failed to delete order: ${e.message}`);
    } finally {
      pendingId = null;
    }
  }

  function exportPDF(order) {
    if (!window.jspdf) return alert('PDF library loading, try again in a moment...');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text(`Invoice - ${order.id}`, 14, 22);

    doc.setFontSize(11);
    doc.text(`Customer: ${order.customer}`, 14, 32);
    doc.text(`Email: ${order.email}`, 14, 38);
    doc.text(`Address: ${order.address}`, 14, 44);
    doc.text(`Date: ${new Date(order.createdAt || order.date || Date.now()).toLocaleString()}`, 14, 50);
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
</script>

<svelte:head>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"></script>
</svelte:head>

<div class="space-y-6 max-w-4xl">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-display font-bold mb-1">Orders</h2>
      <p class="text-sm text-muted-foreground">{filteredOrders.length} orders total</p>
    </div>
    <div class="flex items-center gap-3">
      <div class="relative flex-1 max-w-xs">
        <input 
          type="text" 
          bind:value={searchQuery} 
          placeholder="Search name, email, phone or ID..." 
          class="w-full bg-transparent border border-border pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-foreground transition-colors"
        />
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      </div>
      <select bind:value={filter} class="bg-transparent border border-border px-4 py-2 text-sm focus:outline-none focus:border-foreground transition-colors cursor-pointer">
        <option value="all">All Orders</option>
        {#each statusOptions as s}
          <option value={s}>{s.replace('_', ' ').toUpperCase()}</option>
        {/each}
      </select>
    </div>
  </div>

  <div class="space-y-4">
    {#each filteredOrders as order (order.id)}
      <div class="bg-card border border-border p-5 space-y-4 animate-fade-in relative">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p class="font-medium tabular-nums text-foreground">{order.id} • {currency}{order.total.toFixed(2).replace('.', ',')}</p>
            <p class="text-sm text-muted-foreground">{order.customer} · {new Date(order.createdAt || order.date || Date.now()).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</p>
          </div>
        <div class="flex flex-wrap items-center gap-2">
            <!-- Status badge -->
            <span class="text-[10px] uppercase font-medium tracking-[0.1em] px-2 py-1 rounded
              {order.status === 'paid'           ? 'bg-green-100 text-green-700' :
               order.status === 'processing'     ? 'bg-blue-100 text-blue-700' :
               order.status === 'shipped'        ? 'bg-purple-100 text-purple-700' :
               order.status === 'delivered'      ? 'bg-cyan-100 text-cyan-700' :
               order.status === 'cancelled'      ? 'bg-red-100 text-red-700' :
               order.status === 'pending_payment'? 'bg-yellow-100 text-yellow-700' :
                                                   'bg-muted text-muted-foreground'}"
            >{order.status.replace('_', ' ')}</span>
            {#if pendingId === order.id}
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="animate-spin text-muted-foreground"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            {/if}

            <!-- Delete pending order button -->
            {#if order.status.includes('pending')}
              <button onclick={() => handleDelete(order.id)} disabled={pendingId === order.id}
                class="text-[10px] uppercase font-medium tracking-wider px-2 py-1 bg-red-50 text-red-600 border border-red-200 hover:bg-red-600 hover:text-white transition-colors active:scale-95 ml-2 disabled:opacity-40 disabled:cursor-wait"
                title="Delete Pending Order"
              >
                ✕ DELETE
              </button>
            {/if}

            <!-- Accept/Reject (shown for paid orders awaiting fulfillment decision) -->
            {#if order.status === 'paid'}
              <button onclick={() => patchStatus(order.id, 'processing')} disabled={pendingId === order.id}
                class="text-[10px] uppercase font-medium tracking-wider px-3 py-1 bg-green-600 text-white hover:bg-green-700 transition-colors active:scale-95 disabled:opacity-40 disabled:cursor-wait">
                ✓ MARK PROCESSING
              </button>
              <button onclick={() => handleReject(order.id)} disabled={pendingId === order.id}
                class="text-[10px] uppercase font-medium tracking-wider px-3 py-1 bg-red-600 text-white hover:bg-red-700 transition-colors active:scale-95 disabled:opacity-40 disabled:cursor-wait">
                ✕ CANCEL
              </button>
            {/if}

            <!-- Move from processing to shipped -->
            {#if order.status === 'processing'}
              <button onclick={() => openShippingModal(order.id)} disabled={pendingId === order.id}
                class="text-[10px] uppercase font-medium tracking-wider px-3 py-1 bg-blue-600 text-white hover:bg-blue-700 transition-colors active:scale-95 disabled:opacity-40 disabled:cursor-wait">
                ✓ MARK SHIPPED
              </button>
              <button onclick={() => handleReject(order.id)} disabled={pendingId === order.id}
                class="text-[10px] uppercase font-medium tracking-wider px-3 py-1 bg-red-600 text-white hover:bg-red-700 transition-colors active:scale-95 disabled:opacity-40 disabled:cursor-wait">
                ✕ CANCEL
              </button>
            {/if}

            <!-- Move from shipped to delivered -->
            {#if order.status === 'shipped'}
              <button onclick={() => patchStatus(order.id, 'delivered')} disabled={pendingId === order.id}
                class="text-[10px] uppercase font-medium tracking-wider px-3 py-1 bg-cyan-600 text-white hover:bg-cyan-700 transition-colors active:scale-95 disabled:opacity-40 disabled:cursor-wait">
                ✓ MARK DELIVERED
              </button>
            {/if}

            <button onclick={() => exportPDF(order)} class="text-[10px] uppercase text-muted-foreground hover:text-foreground border border-border px-2 py-1 transition-colors ml-auto">
              PDF
            </button>
          </div>

          <!-- Reject reason input -->
          {#if rejectingId === order.id}
            <div class="flex gap-2 mt-1">
              <input
                bind:value={rejectReason}
                placeholder="Rejection reason (optional)…"
                class="flex-1 bg-transparent border border-red-300 px-3 py-1.5 text-xs focus:outline-none"
              />
              <button onclick={() => confirmReject(order.id)}
                class="bg-red-600 text-white text-[10px] uppercase tracking-wider px-3 py-1.5 hover:bg-red-700 transition-colors">
                Confirm Reject
              </button>
              <button onclick={() => rejectingId = null}
                class="text-xs text-muted-foreground hover:text-foreground px-2 transition-colors">
                Cancel
              </button>
            </div>
          {/if}

          <!-- Shipping details, sent to the customer in the "shipped" email -->
          {#if shippingModalId === order.id}
            <div class="mt-1 p-3 border border-blue-200 bg-blue-50 space-y-2">
              <p class="text-[10px] uppercase tracking-wider font-medium text-blue-900">Shipping details (optional — included in the customer email)</p>
              <div class="grid grid-cols-2 gap-2">
                <input
                  bind:value={shippingForm.carrier}
                  placeholder="Carrier (e.g. UPS, DHL)"
                  class="bg-white border border-border px-2 py-1.5 text-xs focus:outline-none focus:border-foreground"
                />
                <input
                  bind:value={shippingForm.trackingNumber}
                  placeholder="Tracking number"
                  class="bg-white border border-border px-2 py-1.5 text-xs focus:outline-none focus:border-foreground"
                />
              </div>
              <input
                bind:value={shippingForm.trackingUrl}
                placeholder="Tracking URL (paste the courier's tracking link)"
                class="w-full bg-white border border-border px-2 py-1.5 text-xs focus:outline-none focus:border-foreground"
              />
              <div class="flex items-center gap-2">
                <label for="est-delivery-{order.id}" class="text-xs text-muted-foreground whitespace-nowrap">Est. delivery</label>
                <input
                  id="est-delivery-{order.id}"
                  type="date"
                  bind:value={shippingForm.estimatedDelivery}
                  class="bg-white border border-border px-2 py-1 text-xs focus:outline-none focus:border-foreground"
                />
              </div>
              <div class="flex gap-2 pt-1">
                <button onclick={() => confirmShipped(order.id)} disabled={pendingId === order.id}
                  class="bg-blue-600 text-white text-[10px] uppercase tracking-wider px-3 py-1.5 hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-wait">
                  Confirm Shipped
                </button>
                <button onclick={() => shippingModalId = null}
                  class="text-xs text-muted-foreground hover:text-foreground px-2 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          {/if}
        </div>

        <div class="border-t border-border/50 pt-3 space-y-2">
          {#each order.items || [] as item}
            <div class="flex items-center justify-between text-sm">
              <span class="text-muted-foreground flex items-center gap-2">
                {#if item.image}<img src={item.image} alt="" class="w-6 h-6 object-cover bg-secondary" />{/if}
                <span>{item.quantity}× {item.name} <span class="text-xs">({[item.size, item.color].filter(Boolean).join(' / ') || '-'})</span></span>
              </span>
              <span class="tabular-nums">{currency}{(item.price * item.quantity).toFixed(2).replace('.', ',')}</span>
            </div>
          {/each}
        </div>

        <div class="text-xs text-muted-foreground flex flex-col sm:flex-row gap-4 sm:items-center border-t border-border/50 pt-3">
          <div><span class="text-label">ADDRESS:</span> {order.address || '-'}</div>
          <div><span class="text-label">EMAIL:</span> {order.email || '-'}</div>
          <div><span class="text-label">PHONE:</span> {order.phone || '-'}</div>
          <div class="sm:hidden mt-2">
             <button onclick={() => exportPDF(order)} class="text-[10px] uppercase text-muted-foreground hover:text-foreground underline transition-colors">Download PDF</button>
          </div>
        </div>

        {#if order.trackingNumber || order.carrier}
          <div class="text-xs text-muted-foreground flex flex-col sm:flex-row gap-4 sm:items-center border-t border-border/50 pt-3">
            {#if order.carrier}<div><span class="text-label">CARRIER:</span> {order.carrier}</div>{/if}
            {#if order.trackingNumber}<div><span class="text-label">TRACKING #:</span> {order.trackingNumber}</div>{/if}
            {#if order.estimatedDelivery}<div><span class="text-label">EST. DELIVERY:</span> {order.estimatedDelivery}</div>{/if}
          </div>
        {/if}
      </div>
    {/each}

    {#if filteredOrders.length === 0}
      <div class="py-12 border border-dashed border-border text-center">
        <p class="text-muted-foreground text-sm">No orders found for this filter.</p>
      </div>
    {/if}
  </div>
</div>
