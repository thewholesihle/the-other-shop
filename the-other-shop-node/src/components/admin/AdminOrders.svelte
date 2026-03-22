<script>
  export let orders = [];
  export let currency = 'R';
  export let onUpdate = () => {};

  let filter = 'all';
  const statusOptions = ['all', 'pending', 'pending_payment', 'paid', 'processing', 'shipped', 'cancelled'];
  
  let rejectingId = null;
  let rejectReason = '';

  // Sort orders newest first
  $: sortedOrders = [...orders].sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
  $: filteredOrders = filter === 'all' ? sortedOrders : sortedOrders.filter(o => o.status === filter);

  async function patchStatus(orderId, status, reason = '') {
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reason }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      onUpdate(orders.map(o => o.id === orderId ? { ...o, status, adminNote: reason || o.adminNote } : o));
    } catch (e) {
      alert(`Failed to update order: ${e.message}`);
    }
  }

  function handleAccept(orderId) {
    patchStatus(orderId, 'processing');
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
    doc.text(`Date: ${new Date(order.createdAt || order.date || Date.now()).toLocaleDateString()}`, 14, 50);
    doc.text(`Status: ${order.status.toUpperCase().replace('_', ' ')}`, 14, 56);

    const tableData = (order.items || []).map(item => [
      item.name,
      item.size || '-',
      item.quantity.toString(),
      `${currency}${item.price.toFixed(2)}`,
      `${currency}${(item.price * item.quantity).toFixed(2)}`
    ]);

    doc.autoTable({
      startY: 65,
      head: [['Item', 'Size', 'Qty', 'Unit Price', 'Total']],
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
    <select bind:value={filter} class="bg-transparent border border-border px-4 py-2 text-sm focus:outline-none focus:border-foreground transition-colors cursor-pointer">
      <option value="all">All Orders</option>
      {#each statusOptions as s}
        <option value={s}>{s.replace('_', ' ').toUpperCase()}</option>
      {/each}
    </select>
  </div>

  <div class="space-y-4">
    {#each filteredOrders as order (order.id)}
      <div class="bg-card border border-border p-5 space-y-4 animate-fade-in relative">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p class="font-medium tabular-nums text-foreground">{order.id} • {currency}{order.total.toFixed(2).replace('.', ',')}</p>
            <p class="text-sm text-muted-foreground">{order.customer} · {new Date(order.createdAt || order.date || Date.now()).toLocaleDateString()}</p>
          </div>
        <div class="flex flex-wrap items-center gap-2">
            <!-- Status badge -->
            <span class="text-[10px] uppercase font-medium tracking-[0.1em] px-2 py-1 rounded
              {order.status === 'paid'           ? 'bg-green-100 text-green-700' :
               order.status === 'processing'     ? 'bg-blue-100 text-blue-700' :
               order.status === 'shipped'        ? 'bg-purple-100 text-purple-700' :
               order.status === 'cancelled'      ? 'bg-red-100 text-red-700' :
               order.status === 'pending_payment'? 'bg-yellow-100 text-yellow-700' :
                                                   'bg-muted text-muted-foreground'}"
            >{order.status.replace('_', ' ')}</span>

            <!-- Accept/Reject (shown for paid orders awaiting fulfillment decision) -->
            {#if order.status === 'paid'}
              <button onclick={() => handleAccept(order.id)}
                class="text-[10px] uppercase font-medium tracking-wider px-3 py-1 bg-green-600 text-white hover:bg-green-700 transition-colors active:scale-95">
                ✓ ACCEPT
              </button>
              <button onclick={() => handleReject(order.id)}
                class="text-[10px] uppercase font-medium tracking-wider px-3 py-1 bg-red-600 text-white hover:bg-red-700 transition-colors active:scale-95">
                ✕ REJECT
              </button>
            {/if}

            <!-- Manual status override dropdown (advanced) -->
            <select
              value={order.status}
              onchange={(e) => patchStatus(order.id, e.target.value)}
              class="bg-transparent border border-border px-2 py-1 text-[10px] uppercase font-medium tracking-[0.1em] focus:outline-none focus:border-foreground transition-colors cursor-pointer ml-auto"
            >
              {#each ['pending', 'pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'] as s}
                <option value={s}>{s.replace('_', ' ')}</option>
              {/each}
            </select>

            <button onclick={() => exportPDF(order)} class="text-[10px] uppercase text-muted-foreground hover:text-foreground border border-border px-2 py-1 transition-colors">
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
        </div>

        <div class="border-t border-border/50 pt-3 space-y-2">
          {#each order.items || [] as item}
            <div class="flex items-center justify-between text-sm">
              <span class="text-muted-foreground flex items-center gap-2">
                {#if item.image}<img src={item.image} alt="" class="w-6 h-6 object-cover bg-secondary" />{/if}
                <span>{item.quantity}× {item.name} <span class="text-xs">({item.size})</span></span>
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
      </div>
    {/each}

    {#if filteredOrders.length === 0}
      <div class="py-12 border border-dashed border-border text-center">
        <p class="text-muted-foreground text-sm">No orders found for this filter.</p>
      </div>
    {/if}
  </div>
</div>
