<script>
  import Card from '../ui/Card.svelte';
  import Badge from '../ui/Badge.svelte';
  import Button from '../ui/Button.svelte';
  import { thCls, tdCls } from '../../lib/ui.js';
  import DollarSign from 'lucide-svelte/icons/circle-dollar-sign';
  import ShoppingBag from 'lucide-svelte/icons/shopping-bag';
  import Package from 'lucide-svelte/icons/package';
  import TriangleAlert from 'lucide-svelte/icons/triangle-alert';
  import ArrowRight from 'lucide-svelte/icons/arrow-right';

  let { data = { site: {}, products: [], orders: [] }, navigate = () => {} } = $props();

  const REVENUE_STATUSES = ['paid', 'processing', 'shipped', 'delivered'];
  const STATUS = {
    pending_payment: { label: 'Pending payment', variant: 'warning' },
    pending:         { label: 'Pending',         variant: 'warning' },
    paid:            { label: 'Paid',            variant: 'success' },
    processing:      { label: 'Processing',      variant: 'violet' },
    shipped:         { label: 'Shipped',         variant: 'info' },
    delivered:       { label: 'Delivered',       variant: 'secondary' },
    cancelled:       { label: 'Cancelled',       variant: 'destructive' },
  };

  let currency = $derived(data.site?.currency ?? 'R');
  const money = (n) => `${currency}${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  let orders = $derived(data.orders || []);
  let products = $derived(data.products || []);

  let totalRevenue = $derived(orders.filter(o => REVENUE_STATUSES.includes(o.status)).reduce((sum, o) => sum + o.total, 0));
  // Cancelled orders had their stock returned and aren't real order volume.
  let totalOrders = $derived(orders.filter(o => o.status !== 'cancelled').length);
  let toShip = $derived(orders.filter(o => o.status === 'paid' || o.status === 'processing').length);
  let unpaid = $derived(orders.filter(o => o.status === 'pending_payment').length);
  let outOfStock = $derived(products.filter(p => p.stock === 0));
  let lowStock = $derived(products.filter(p => p.stock > 0 && p.stock <= 10));
  let recentOrders = $derived(orders.slice(0, 6));
  let stockAlerts = $derived(products.filter(p => p.stock <= 10).sort((a, b) => a.stock - b.stock).slice(0, 6));

  // Revenue per day, last 14 days (today last).
  let days = $derived.by(() => {
    const out = [];
    const start = new Date(); start.setHours(0, 0, 0, 0);
    for (let i = 13; i >= 0; i--) {
      const d = new Date(start); d.setDate(d.getDate() - i);
      out.push({ date: d, key: d.toDateString(), total: 0 });
    }
    const byKey = new Map(out.map(d => [d.key, d]));
    for (const o of orders) {
      if (!REVENUE_STATUSES.includes(o.status)) continue;
      const bucket = byKey.get(new Date(o.createdAt || o.date || 0).toDateString());
      if (bucket) bucket.total += o.total;
    }
    return out;
  });
  let maxDay = $derived(Math.max(...days.map(d => d.total), 1));
  let periodTotal = $derived(days.reduce((s, d) => s + d.total, 0));

  let stats = $derived([
    { label: 'Revenue', value: money(totalRevenue), note: 'All time, excluding cancelled', icon: DollarSign },
    { label: 'Orders', value: String(totalOrders), note: `${unpaid} awaiting payment`, icon: ShoppingBag },
    { label: 'Products', value: String(products.length), note: `${outOfStock.length} out of stock`, icon: Package },
    { label: 'Low stock', value: String(lowStock.length), note: 'Products with 10 units or fewer', icon: TriangleAlert },
  ]);

  let todos = $derived([
    toShip > 0 && { title: `${toShip} order${toShip === 1 ? '' : 's'} to pack and ship`, sub: 'Paid, not yet shipped', section: 'orders', dot: 'bg-primary' },
    unpaid > 0 && { title: `${unpaid} awaiting payment`, sub: 'Customers who haven’t completed PayFast', section: 'orders', dot: 'bg-amber-500' },
    outOfStock.length > 0 && { title: `${outOfStock.length} product${outOfStock.length === 1 ? '' : 's'} sold out`, sub: outOfStock.slice(0, 2).map(p => p.name).join(', '), section: 'products', dot: 'bg-red-500' },
  ].filter(Boolean));
</script>

<div class="space-y-6">
  <div>
    <h1 class="text-2xl font-semibold tracking-tight">Dashboard</h1>
    <p class="text-sm text-muted-foreground">What needs your attention today.</p>
  </div>

  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
    {#each stats as s}
      <Card class="p-6">
        <div class="flex items-center justify-between">
          <p class="text-sm font-medium text-muted-foreground">{s.label}</p>
          <s.icon size={16} class="text-muted-foreground" />
        </div>
        <p class="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{s.value}</p>
        <p class="mt-1 text-xs text-muted-foreground">{s.note}</p>
      </Card>
    {/each}
  </div>

  <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
    <Card class="lg:col-span-2" title="Revenue" description="Paid orders, last 14 days">
      <div class="p-6 pt-4">
        <p class="mb-3 text-sm text-muted-foreground">Total <span class="font-semibold text-foreground tabular-nums">{money(periodTotal)}</span></p>
        <div class="flex h-44 items-end gap-1.5 border-b border-border" role="img" aria-label="Daily revenue for the last 14 days">
          {#each days as d, i}
            <div class="group relative flex h-full flex-1 flex-col justify-end" title="{d.date.toLocaleDateString([], { day: 'numeric', month: 'short' })}: {money(d.total)}">
              <div class="w-full rounded-t-sm transition-colors {i === days.length - 1 ? 'bg-primary' : 'bg-primary/25 group-hover:bg-primary/60'}" style="height: {d.total > 0 ? Math.max(4, (d.total / maxDay) * 100) : 2}%"></div>
            </div>
          {/each}
        </div>
        <div class="mt-2 flex gap-1.5">
          {#each days as d}<span class="flex-1 text-center text-[10px] text-muted-foreground tabular-nums">{d.date.getDate()}</span>{/each}
        </div>
      </div>
    </Card>

    <Card title="Needs attention" description="Tackle these first.">
      <div class="space-y-1.5 p-6 pt-4">
        {#each todos as t}
          <button type="button" onclick={() => navigate(t.section)} class="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/60">
            <span class="h-2 w-2 shrink-0 rounded-full {t.dot}"></span>
            <span class="min-w-0 flex-1 text-sm">
              <span class="block font-medium">{t.title}</span>
              {#if t.sub}<span class="block truncate text-xs text-muted-foreground">{t.sub}</span>{/if}
            </span>
            <ArrowRight size={14} class="text-muted-foreground" />
          </button>
        {:else}
          <p class="py-6 text-center text-sm text-muted-foreground">You’re all caught up.</p>
        {/each}
      </div>
    </Card>
  </div>

  <Card title="Recent orders" description="Latest activity across all statuses" class="overflow-hidden">
    {#snippet actions()}<Button variant="outline" size="sm" onclick={() => navigate('orders')}>View all</Button>{/snippet}
    <div class="mt-4 overflow-x-auto border-t border-border">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-border">
            <th class={thCls}>Order</th>
            <th class="{thCls} hidden sm:table-cell">Customer</th>
            <th class={thCls}>Status</th>
            <th class="{thCls} text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {#each recentOrders as order}
            {@const st = STATUS[order.status] || { label: order.status, variant: 'secondary' }}
            <tr class="border-b border-border/60 last:border-0">
              <td class={tdCls}>
                <div class="font-medium tabular-nums">{order.id}</div>
                <div class="text-xs text-muted-foreground">{new Date(order.createdAt || order.date || Date.now()).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</div>
              </td>
              <td class="{tdCls} hidden text-muted-foreground sm:table-cell">{order.customer}</td>
              <td class={tdCls}><Badge variant={st.variant}>{st.label}</Badge></td>
              <td class="{tdCls} text-right font-medium tabular-nums">{money(order.total)}</td>
            </tr>
          {:else}
            <tr><td colspan="4" class="py-10 text-center text-sm text-muted-foreground">No orders yet.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </Card>

  {#if stockAlerts.length > 0}
    <Card title="Stock alerts" description="Products running low or sold out" class="overflow-hidden">
      <ul class="mt-4 divide-y divide-border border-t border-border">
        {#each stockAlerts as p}
          <li class="flex items-center gap-3 px-6 py-3">
            {#if p.image}<img src={p.image} alt="" class="h-10 w-10 rounded-md bg-muted object-cover" />{:else}<div class="h-10 w-10 rounded-md bg-muted"></div>{/if}
            <span class="flex-1 truncate text-sm font-medium">{p.name}</span>
            <Badge variant={p.stock === 0 ? 'destructive' : 'warning'}>{p.stock === 0 ? 'Sold out' : `${p.stock} left`}</Badge>
          </li>
        {/each}
      </ul>
    </Card>
  {/if}
</div>
