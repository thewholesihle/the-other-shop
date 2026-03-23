<script>
  export let data = { site: {}, products: [], orders: [] };

  $: totalRevenue = data.orders.filter(o => ['paid', 'shipped', 'delivered'].includes(o.status)).reduce((sum, o) => sum + o.total, 0);
  $: totalProducts = data.products.length;
  $: totalOrders = data.orders.length;
  $: lowStock = data.products.filter(p => p.stock > 0 && p.stock <= 10).length;
  $: outOfStock = data.products.filter(p => p.stock === 0).length;
  $: pendingOrders = data.orders.filter(o => o.status === 'pending_payment').length;
  $: recentOrders = data.orders.slice(0, 5);
  $: stockAlerts = data.products.filter(p => p.stock <= 10);

  function statusClass(status) {
    if (status === 'shipped' || status === 'delivered' || status === 'paid') return 'bg-green-100 text-green-700';
    if (status === 'cancelled') return 'bg-red-100 text-red-700';
    return 'bg-orange-100 text-orange-700';
  }
</script>

<div class="space-y-8">
  <div>
    <h2 class="text-2xl font-display font-bold mb-1">Dashboard</h2>
    <p class="text-sm text-muted-foreground">Overview of your store performance.</p>
  </div>

  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    <div class="bg-card border border-border p-5 hover:shadow-md transition-shadow duration-200">
      <div class="flex items-start justify-between mb-3">
        <span class="text-label">REVENUE</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
      </div>
      <p class="text-2xl font-display font-bold text-foreground tabular-nums">R{totalRevenue.toFixed(2).replace('.', ',')}</p>
      <p class="text-xs text-muted-foreground mt-1">All time</p>
    </div>
    <div class="bg-card border border-border p-5 hover:shadow-md transition-shadow duration-200">
      <div class="flex items-start justify-between mb-3">
        <span class="text-label">ORDERS</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
      </div>
      <p class="text-2xl font-display font-bold text-foreground tabular-nums">{totalOrders}</p>
      <p class="text-xs text-muted-foreground mt-1">{pendingOrders} pending</p>
    </div>
    <div class="bg-card border border-border p-5 hover:shadow-md transition-shadow duration-200">
      <div class="flex items-start justify-between mb-3">
        <span class="text-label">PRODUCTS</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
      </div>
      <p class="text-2xl font-display font-bold text-foreground tabular-nums">{totalProducts}</p>
      <p class="text-xs text-muted-foreground mt-1">{outOfStock} out of stock</p>
    </div>
    <div class="bg-card border border-border p-5 hover:shadow-md transition-shadow duration-200">
      <div class="flex items-start justify-between mb-3">
        <span class="text-label">LOW STOCK</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
      </div>
      <p class="text-2xl font-display font-bold text-foreground tabular-nums">{lowStock}</p>
      <p class="text-xs text-muted-foreground mt-1">Items below 10 units</p>
    </div>
  </div>

  <div>
    <h3 class="text-lg font-display font-bold mb-4">Recent Orders</h3>
    <div class="bg-card border border-border overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-border">
            <th class="text-left text-label p-3">ORDER</th>
            <th class="text-left text-label p-3">DATE</th>
            <th class="text-left text-label p-3">CUSTOMER</th>
            <th class="text-left text-label p-3">STATUS</th>
            <th class="text-right text-label p-3">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          {#each recentOrders as order}
            <tr class="border-b border-border/50 hover:bg-muted/50 transition-colors">
              <td class="p-3 font-medium tabular-nums">{order.id}</td>
              <td class="p-3 text-muted-foreground text-[10px] tabular-nums">{new Date(order.createdAt || order.date || Date.now()).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
              <td class="p-3 text-muted-foreground">{order.customer}</td>
              <td class="p-3">
                <span class="inline-block text-[10px] tracking-[0.15em] uppercase px-2 py-0.5 font-medium {statusClass(order.status)}">{order.status}</span>
              </td>
              <td class="p-3 text-right tabular-nums">R{order.total.toFixed(2).replace('.', ',')}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>

  {#if stockAlerts.length > 0}
    <div>
      <h3 class="text-lg font-display font-bold mb-4">Stock Alerts</h3>
      <div class="space-y-2">
        {#each stockAlerts as p}
          <div class="flex items-center justify-between bg-card border border-border p-3">
            <div class="flex items-center gap-3">
              <img src={p.image} alt={p.name} class="w-10 h-10 object-cover bg-secondary" />
              <span class="text-sm font-medium">{p.name}</span>
            </div>
            <span class="text-sm tabular-nums font-medium {p.stock === 0 ? 'text-destructive' : 'text-orange-600'}">
              {p.stock === 0 ? 'Out of stock' : `${p.stock} left`}
            </span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
