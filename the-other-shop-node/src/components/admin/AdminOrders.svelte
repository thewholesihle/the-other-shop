<script>
  export let orders = [];
  export let currency = '€';
  export let onUpdate = () => {};

  const statusOptions = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];

  function handleStatusChange(orderId, newStatus) {
    onUpdate(orders.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
  }
</script>

<div class="space-y-6">
  <div>
    <h2 class="text-2xl font-display font-bold mb-1">Orders</h2>
    <p class="text-sm text-muted-foreground">{orders.length} orders total</p>
  </div>

  <div class="space-y-4">
    {#each orders as order}
      <div class="bg-card border border-border p-5 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p class="font-medium tabular-nums text-foreground">{order.id}</p>
            <p class="text-sm text-muted-foreground">{order.customer} · {order.date}</p>
          </div>
          <div class="flex items-center gap-3">
            <select
              value={order.status}
              on:change={(e) => handleStatusChange(order.id, e.target.value)}
              class="bg-transparent border border-border px-3 py-1.5 text-xs uppercase tracking-[0.1em] focus:outline-none focus:border-foreground transition-colors cursor-pointer"
            >
              {#each statusOptions as s}
                <option value={s} selected={order.status === s}>{s}</option>
              {/each}
            </select>
            <span class="text-lg font-display font-bold tabular-nums">{currency}{order.total.toFixed(2).replace('.', ',')}</span>
          </div>
        </div>

        <div class="border-t border-border/50 pt-3 space-y-2">
          {#each order.items as item}
            <div class="flex items-center justify-between text-sm">
              <span class="text-muted-foreground">
                {item.quantity}× {item.name} <span class="text-xs">({item.size})</span>
              </span>
              <span class="tabular-nums">{currency}{(item.price * item.quantity).toFixed(2).replace('.', ',')}</span>
            </div>
          {/each}
        </div>

        <div class="text-xs text-muted-foreground">
          <span class="text-label">SHIPPING:</span> {order.address}
        </div>
        <div class="text-xs text-muted-foreground">
          <span class="text-label">EMAIL:</span> {order.email}
        </div>
      </div>
    {/each}
  </div>
</div>
