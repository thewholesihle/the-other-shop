<script>
  import { cn } from '../../lib/cn.js';
  import LayoutDashboard from 'lucide-svelte/icons/layout-dashboard';
  import ShoppingBag from 'lucide-svelte/icons/shopping-bag';
  import Package from 'lucide-svelte/icons/package';
  import Tags from 'lucide-svelte/icons/tags';
  import ImageIcon from 'lucide-svelte/icons/image';
  import FileText from 'lucide-svelte/icons/file-text';
  import Files from 'lucide-svelte/icons/files';
  import CalendarDays from 'lucide-svelte/icons/calendar-days';
  import Megaphone from 'lucide-svelte/icons/megaphone';
  import Users from 'lucide-svelte/icons/users';
  import Settings2 from 'lucide-svelte/icons/settings-2';
  import Activity from 'lucide-svelte/icons/activity';
  import ArrowUpRight from 'lucide-svelte/icons/arrow-up-right';
  import LogOut from 'lucide-svelte/icons/log-out';
  import { getOptimizedUrl } from '../../lib/cloudinary.js';
  import Menu from 'lucide-svelte/icons/menu';
  import X from 'lucide-svelte/icons/x';

  // `badges` maps a section key to a count shown beside its nav label (e.g. orders to ship).
  let { activeSection = 'dashboard', navigate = () => {}, badges = {}, onLogout = null, site = {}, children } = $props();

  // The store's own logo (falls back to its name if none is set or it fails to load).
  let logoFailed = $state(false);
  let logoSrc = $derived(site?.logo && !logoFailed ? getOptimizedUrl(site.logo, 360) : '');
  let brandName = $derived(site?.name || 'Others.');

  let sidebarOpen = $state(false);

  const groups = [
    { title: 'Store', items: [
      { key: 'dashboard',  label: 'Dashboard',  icon: LayoutDashboard },
      { key: 'orders',     label: 'Orders',     icon: ShoppingBag },
      { key: 'products',   label: 'Products',   icon: Package },
      { key: 'categories', label: 'Categories', icon: Tags },
    ]},
    { title: 'Content', items: [
      { key: 'lookbook',    label: 'Lookbook',    icon: ImageIcon },
      { key: 'community',   label: 'Community',   icon: FileText },
      { key: 'events',      label: 'Events',      icon: CalendarDays },
      { key: 'pages',       label: 'Pages',       icon: Files },
      { key: 'newsletter',  label: 'Newsletter',  icon: Megaphone },
      { key: 'subscribers', label: 'Subscribers', icon: Users },
    ]},
    { title: 'System', items: [
      { key: 'settings', label: 'Settings',    icon: Settings2 },
      { key: 'status',   label: 'Site status', icon: Activity },
    ]},
  ];

  const allItems = groups.flatMap(g => g.items);
  let activeLabel = $derived(allItems.find(i => i.key === activeSection)?.label ?? 'Admin');

  function hrefFor(key) { return key === 'dashboard' ? '/admin' : `/admin/${key}`; }

  function go(e, key) {
    // Let modified clicks (new tab etc.) behave like normal links.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    navigate(key);
    sidebarOpen = false;
  }
</script>

{#snippet nav()}
  <div class="flex h-full flex-col">
    <div class="flex h-14 items-center justify-between px-5">
      <a href="/admin" onclick={(e) => go(e, 'dashboard')} class="flex items-center gap-2.5" aria-label="{brandName} admin — dashboard">
        {#if logoSrc}
          <img src={logoSrc} alt={brandName} class="h-7 w-auto max-w-[140px] object-contain" decoding="async" onerror={() => (logoFailed = true)} />
        {:else}
          <span class="text-lg font-bold tracking-tight">{brandName}</span>
        {/if}
        <span class="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Admin</span>
      </a>
      <button type="button" class="md:hidden rounded-md p-1.5 text-muted-foreground hover:bg-accent" aria-label="Close menu" onclick={() => (sidebarOpen = false)}><X size={18} /></button>
    </div>

    <nav class="flex-1 space-y-5 overflow-y-auto px-3 py-2" aria-label="Admin sections">
      {#each groups as group}
        <div>
          <p class="px-3 pb-1.5 text-xs font-medium text-muted-foreground">{group.title}</p>
          <ul class="space-y-0.5">
            {#each group.items as item}
              {@const active = activeSection === item.key}
              <li>
                <a
                  href={hrefFor(item.key)}
                  onclick={(e) => go(e, item.key)}
                  aria-current={active ? 'page' : undefined}
                  class={cn(
                    'flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
                    active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                  )}
                >
                  <item.icon size={16} />
                  <span class="flex-1">{item.label}</span>
                  {#if badges[item.key]}
                    <span class="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold leading-none text-primary-foreground tabular-nums">{badges[item.key]}</span>
                  {/if}
                </a>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    </nav>

    <div class="space-y-0.5 border-t border-border p-3">
      <a href="/" class="flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground">
        <ArrowUpRight size={16} /> View storefront
      </a>
      {#if onLogout}
        <button type="button" onclick={onLogout} class="flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground">
          <LogOut size={16} /> Sign out
        </button>
      {/if}
    </div>
  </div>
{/snippet}

<div class="min-h-screen">
  <aside class="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-border bg-card md:block">
    {@render nav()}
  </aside>

  {#if sidebarOpen}
    <button type="button" class="fixed inset-0 z-40 bg-black/40 md:hidden cursor-default" aria-label="Close menu overlay" onclick={() => (sidebarOpen = false)}></button>
    <aside class="fixed inset-y-0 left-0 z-50 w-64 border-r border-border bg-card shadow-xl md:hidden">
      {@render nav()}
    </aside>
  {/if}

  <div class="md:pl-60">
    <header class="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur md:px-8">
      <button type="button" class="md:hidden rounded-md p-1.5 hover:bg-accent" aria-label="Open menu" onclick={() => (sidebarOpen = true)}><Menu size={20} /></button>
      {#if logoSrc}<img src={logoSrc} alt={brandName} class="h-6 w-auto max-w-[110px] object-contain md:hidden" decoding="async" />{/if}
      <nav aria-label="Breadcrumb" class="flex items-center gap-2 text-sm">
        <span class="text-muted-foreground">Admin</span>
        <span class="text-muted-foreground">/</span>
        <span class="font-medium" aria-current="page">{activeLabel}</span>
      </nav>
    </header>
    <main class="mx-auto max-w-6xl p-4 md:p-8">
      {@render children?.()}
    </main>
  </div>
</div>
