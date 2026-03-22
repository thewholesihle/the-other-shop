<script>
  export let orders = [];
  export let currency = 'R';
  export let onUpdate = () => {};

  let filter = 'all';
  const statusOptions = ['pending', 'pending_payment', 'paid', 'processing', 'shipped', 'cancelled'];
  
  // Sort orders newest first
  $: sortedOrders = [...orders].sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
  $: filteredOrders = filter === 'all' ? sortedOrders : sortedOrders.filter(o => o.status === filter);

  function handleStatusChange(orderId, newStatus) {
    onUpdate(orders.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
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
          <div class="flex items-center gap-3">
            <button onclick={() => exportPDF(order)} class="text-xs text-muted-foreground hover:text-foreground border border-border px-3 py-1.5 transition-colors hidden sm:block">
              DOWNLOAD PDF
            </button>
            <select
              value={order.status}
              onchange={(e) => handleStatusChange(order.id, e.target.value)}
              class="bg-transparent border border-border px-3 py-1.5 text-[10px] uppercase font-medium tracking-[0.1em] focus:outline-none focus:border-foreground transition-colors cursor-pointer {order.status === 'paid' ? 'bg-green-50/5 text-green-600 border-green-200' : ''}"
            >
              {#each statusOptions as s}
                <option value={s}>{s.replace('_', ' ')}</option>
              {/each}
            </select>
          </div>
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
