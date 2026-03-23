<script>
  export let activeSection = 'dashboard';
  export let navigate = () => {};

  let sidebarOpen = false;

  const sidebarItems = [
    { key: 'dashboard',   label: 'Dashboard'   },
    { key: 'products',    label: 'Products'    },
    { key: 'orders',      label: 'Orders'      },
    { key: 'status',      label: 'Site Status' },
    { key: 'lookbook',    label: 'Lookbook'    },
    { key: 'community',   label: 'Community'   },
    { key: 'pages',       label: 'Pages'       },
    { key: 'subscribers', label: 'Subscribers' },
    { key: 'newsletter',  label: 'Newsletter'  },
    { key: 'settings',    label: 'Settings'    },
  ];

  const icons = {
    dashboard: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`,
    products:  `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`,
    orders:    `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>`,
    status:    `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v10"/><path d="M18.4 4.6a10 10 0 1 1-12.8 0"/></svg>`,
    lookbook:  `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>`,
    community: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    pages:     `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
    settings:     `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
    subscribers:  `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,
    newsletter:   `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>`,
  };

  function goTo(key) { navigate(key); sidebarOpen = false; }
</script>

<div class="min-h-screen bg-background flex">
  <aside class="fixed inset-y-0 left-0 z-50 w-56 bg-foreground text-primary-foreground transform transition-transform duration-300 md:translate-x-0 {sidebarOpen ? 'translate-x-0' : '-translate-x-full'}">
    <div class="flex items-center justify-between px-5 py-4 border-b border-primary-foreground/10">
      <span class="font-display text-base font-bold">Others. Admin</span>
      <button class="md:hidden text-primary-foreground/60 hover:text-primary-foreground" aria-label="Close sidebar" onclick={() => (sidebarOpen = false)}>
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
    </div>
    <nav class="px-2 py-3 space-y-0.5">
      {#each sidebarItems as item}
        {@const isActive = activeSection === item.key}
        <button class="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] tracking-[0.1em] uppercase font-medium transition-colors text-left {isActive ? 'bg-primary-foreground/10 text-primary-foreground' : 'text-primary-foreground/50 hover:text-primary-foreground hover:bg-primary-foreground/5'}" onclick={() => goTo(item.key)}>
          {@html icons[item.key]}
          {item.label}
        </button>
      {/each}
    </nav>
    <div class="absolute bottom-0 left-0 right-0 px-2 py-3 border-t border-primary-foreground/10">
      <a href="/" class="flex items-center gap-2.5 px-3 py-2 text-[11px] tracking-[0.1em] uppercase font-medium text-primary-foreground/50 hover:text-primary-foreground transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
        Back to Store
      </a>
    </div>
  </aside>

  {#if sidebarOpen}
    <button class="fixed inset-0 bg-foreground/50 z-40 md:hidden w-full h-full cursor-default" aria-label="Close sidebar overlay" onclick={() => (sidebarOpen = false)}></button>
  {/if}

  <main class="flex-1 md:ml-56">
    <header class="sticky top-0 z-30 bg-background/80 backdrop-blur-sm border-b border-border px-6 py-3 flex items-center gap-4">
      <button class="md:hidden text-foreground" aria-label="Open sidebar" onclick={() => (sidebarOpen = true)}>
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
      </button>
      <h1 class="text-sm font-medium text-foreground capitalize">{sidebarItems.find(i => i.key === activeSection)?.label ?? 'Admin'}</h1>
    </header>
    <div class="p-6 md:p-8">
      <slot />
    </div>
  </main>
</div>
