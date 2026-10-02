<script>
  import { thumb, getOptimizedUrl } from '../../lib/cloudinary.js';
  import Card from '../ui/Card.svelte';
  import Badge from '../ui/Badge.svelte';
  import Button from '../ui/Button.svelte';
  import Tabs from '../ui/Tabs.svelte';
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

  // ── Chart state ───────────────────────────────────────────────────────────
  let view = $state('revenue');   // revenue | orders | status | products
  let range = $state('14');       // days
  let hovered = $state(null);     // index of the hovered bar, for the readout line

  const VIEWS = [
    { value: 'revenue', label: 'Revenue' },
    { value: 'orders', label: 'Orders' },
    { value: 'status', label: 'Status' },
    { value: 'products', label: 'Top products' },
  ];
  const RANGES = [
    { value: '7', label: '7d' }, { value: '14', label: '14d' },
    { value: '30', label: '30d' }, { value: '90', label: '90d' },
  ];

  const dayStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const orderDate = (o) => new Date(o.createdAt || o.date || 0);
  let rangeDays = $derived(Number(range));
  let cutoff = $derived.by(() => { const d = dayStart(new Date()); d.setDate(d.getDate() - (rangeDays - 1)); return d; });
  let prevCutoff = $derived.by(() => { const d = new Date(cutoff); d.setDate(d.getDate() - rangeDays); return d; });

  // One bucket per day in range (today last): revenue from paid-or-later orders, and a
  // count of all non-cancelled orders placed that day.
  let days = $derived.by(() => {
    const out = [];
    for (let i = 0; i < rangeDays; i++) {
      const d = new Date(cutoff); d.setDate(d.getDate() + i);
      out.push({ date: d, key: d.toDateString(), revenue: 0, count: 0 });
    }
    const byKey = new Map(out.map(d => [d.key, d]));
    for (const o of orders) {
      const bucket = byKey.get(orderDate(o).toDateString());
      if (!bucket) continue;
      if (o.status !== 'cancelled') bucket.count += 1;
      if (REVENUE_STATUSES.includes(o.status)) bucket.revenue += o.total;
    }
    return out;
  });

  let metric = $derived(view === 'orders' ? 'count' : 'revenue');
  let maxDay = $derived(Math.max(...days.map(d => d[metric]), 1));
  let periodTotal = $derived(days.reduce((s, d) => s + d[metric], 0));
  let prevTotal = $derived.by(() => {
    let sum = 0;
    for (const o of orders) {
      const t = orderDate(o);
      if (t < prevCutoff || t >= cutoff) continue;
      if (metric === 'count') { if (o.status !== 'cancelled') sum += 1; }
      else if (REVENUE_STATUSES.includes(o.status)) sum += o.total;
    }
    return sum;
  });
  let delta = $derived(prevTotal > 0 ? Math.round(((periodTotal - prevTotal) / prevTotal) * 100) : null);
  const fmtVal = (v) => (metric === 'count' ? String(v) : money(v));
  const fmtShort = (v) => (metric === 'count' ? String(v) : `${currency}${v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k' : Math.round(v)}`);
  // Label roughly 7 ticks however many days are shown.
  let labelEvery = $derived(Math.max(1, Math.ceil(rangeDays / 7)));
  const dayLabel = (d) => d.toLocaleDateString([], { day: 'numeric', month: 'short' });

  // Orders in the selected range (all statuses), for the status and product views.
  let rangeOrders = $derived(orders.filter(o => orderDate(o) >= cutoff));

  const STATUS_META = [
    { key: 'paid', label: 'Paid', bar: 'bg-emerald-500' },
    { key: 'processing', label: 'Processing', bar: 'bg-violet-500' },
    { key: 'shipped', label: 'Shipped', bar: 'bg-blue-500' },
    { key: 'delivered', label: 'Delivered', bar: 'bg-zinc-500' },
    { key: 'pending_payment', label: 'Awaiting payment', bar: 'bg-amber-500' },
    { key: 'cancelled', label: 'Cancelled', bar: 'bg-red-500' },
  ];
  let statusRows = $derived.by(() => {
    const total = rangeOrders.length || 1;
    return STATUS_META
      .map(m => ({ ...m, count: rangeOrders.filter(o => o.status === m.key).length }))
      .map(m => ({ ...m, pct: Math.round((m.count / total) * 100) }));
  });

  let topProducts = $derived.by(() => {
    const byName = new Map();
    for (const o of rangeOrders) {
      if (o.status === 'cancelled' || o.status === 'pending_payment') continue;
      for (const i of o.items || []) {
        const row = byName.get(i.name) || { name: i.name, units: 0, revenue: 0 };
        row.units += i.quantity || 0;
        row.revenue += (i.price || 0) * (i.quantity || 0);
        byName.set(i.name, row);
      }
    }
    return [...byName.values()].sort((a, b) => b.units - a.units).slice(0, 6);
  });
  let maxUnits = $derived(Math.max(...topProducts.map(p => p.units), 1));

  // Readout line above the chart: the hovered day, or the whole period.
  let readout = $derived(hovered !== null && days[hovered]
    ? { label: dayLabel(days[hovered].date), value: fmtVal(days[hovered][metric]), note: '' }
    : { label: `Last ${rangeDays} days`, value: fmtVal(periodTotal),
        note: delta === null ? '' : `${delta >= 0 ? '↑' : '↓'} ${Math.abs(delta)}% vs previous ${rangeDays} days` });

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
    <Card class="lg:col-span-2" title="Sales overview" description="Paid orders and activity over time">
      {#snippet actions()}
        <Tabs items={RANGES} bind:value={range} label="Date range" />
      {/snippet}
      <div class="p-6 pt-4">
        <Tabs items={VIEWS} bind:value={view} label="Chart view" class="mb-5" />

        {#if view === 'revenue' || view === 'orders'}
          <div class="mb-4 flex flex-wrap items-baseline gap-x-3" aria-live="polite">
            <span class="text-sm text-muted-foreground">{readout.label}</span>
            <span class="text-2xl font-semibold tracking-tight tabular-nums">{readout.value}</span>
            {#if readout.note}<span class="text-sm {delta !== null && delta < 0 ? 'text-destructive' : 'text-emerald-700'}">{readout.note}</span>{/if}
          </div>
          <div class="relative">
            <span class="absolute -top-1 left-0 text-[10px] tabular-nums text-muted-foreground">{fmtShort(maxDay)}</span>
            <div class="flex h-44 items-end border-b border-border pt-3" role="img" aria-label="{view === 'orders' ? 'Orders' : 'Revenue'} per day for the last {rangeDays} days"
                 onpointerleave={() => (hovered = null)} style="gap: {rangeDays > 30 ? 1 : 3}px">
              {#each days as d, i}
                <div class="flex h-full flex-1 cursor-default flex-col justify-end" onpointerenter={() => (hovered = i)} role="presentation">
                  <div class="w-full rounded-t-sm transition-colors {hovered === i ? 'bg-primary' : i === days.length - 1 && hovered === null ? 'bg-primary' : 'bg-primary/30'}"
                       style="height: {d[metric] > 0 ? Math.max(3, (d[metric] / maxDay) * 100) : 1}%"></div>
                </div>
              {/each}
            </div>
            <div class="mt-1.5 flex" style="gap: {rangeDays > 30 ? 1 : 3}px">
              {#each days as d, i}<span class="flex-1 overflow-visible whitespace-nowrap text-center text-[10px] text-muted-foreground tabular-nums">{i % labelEvery === 0 || i === days.length - 1 ? (rangeDays > 14 ? dayLabel(d.date) : d.date.getDate()) : ''}</span>{/each}
            </div>
          </div>
          <table class="sr-only">
            <caption>{view === 'orders' ? 'Orders' : 'Revenue'} per day</caption>
            <thead><tr><th>Day</th><th>Value</th></tr></thead>
            <tbody>{#each days as d}<tr><td>{dayLabel(d.date)}</td><td>{fmtVal(d[metric])}</td></tr>{/each}</tbody>
          </table>

        {:else if view === 'status'}
          <p class="mb-3 text-sm text-muted-foreground">{rangeOrders.length} order{rangeOrders.length === 1 ? '' : 's'} in the last {rangeDays} days</p>
          {#if rangeOrders.length === 0}
            <p class="py-12 text-center text-sm text-muted-foreground">No orders in this period.</p>
          {:else}
            <div class="flex h-4 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label="Orders by status" style="gap: 2px">
              {#each statusRows.filter(r => r.count > 0) as r}<div class="{r.bar}" style="width: {r.pct}%" title="{r.label}: {r.count}"></div>{/each}
            </div>
            <ul class="mt-5 divide-y divide-border">
              {#each statusRows as r}
                <li class="flex items-center gap-3 py-2.5 text-sm">
                  <span class="h-2.5 w-2.5 shrink-0 rounded-sm {r.bar}"></span>
                  <span class="flex-1">{r.label}</span>
                  <span class="tabular-nums text-muted-foreground">{r.pct}%</span>
                  <span class="w-8 text-right font-medium tabular-nums">{r.count}</span>
                </li>
              {/each}
            </ul>
          {/if}

        {:else}
          <p class="mb-4 text-sm text-muted-foreground">Best sellers by units, last {rangeDays} days (cancelled and unpaid orders excluded)</p>
          {#if topProducts.length === 0}
            <p class="py-12 text-center text-sm text-muted-foreground">No sales in this period.</p>
          {:else}
            <ul class="space-y-3">
              {#each topProducts as p}
                <li>
                  <div class="mb-1 flex items-baseline justify-between gap-3 text-sm">
                    <span class="truncate font-medium">{p.name}</span>
                    <span class="shrink-0 tabular-nums text-muted-foreground">{p.units} sold · {money(p.revenue)}</span>
                  </div>
                  <div class="h-2.5 w-full rounded-full bg-muted"><div class="h-full rounded-full bg-primary" style="width: {Math.max(3, (p.units / maxUnits) * 100)}%"></div></div>
                </li>
              {/each}
            </ul>
          {/if}
        {/if}
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
            {#if p.image}<img src={thumb(p.image, 40)} loading="lazy" decoding="async" alt="" class="h-10 w-10 rounded-md bg-muted object-cover" />{:else}<div class="h-10 w-10 rounded-md bg-muted"></div>{/if}
            <span class="flex-1 truncate text-sm font-medium">{p.name}</span>
            <Badge variant={p.stock === 0 ? 'destructive' : 'warning'}>{p.stock === 0 ? 'Sold out' : `${p.stock} left`}</Badge>
          </li>
        {/each}
      </ul>
    </Card>
  {/if}
</div>
