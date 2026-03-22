<script>
  import { onMount } from 'svelte';

  let show = false;
  let checked = false;

  onMount(async () => {
    // Only check once per session
    if (sessionStorage.getItem('geo-checked')) return;
    try {
      const res = await fetch('https://ipapi.co/country/', { signal: AbortSignal.timeout(4000) });
      const country = (await res.text()).trim();
      sessionStorage.setItem('geo-checked', country);
      if (country !== 'ZA') show = true;
    } catch {
      // Network failure → don't block
      sessionStorage.setItem('geo-checked', 'unknown');
    }
  });

  function dismiss() { show = false; }
</script>

{#if show}
  <div
    class="fixed inset-0 z-[999] bg-foreground/80 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-6 animate-fade-in"
    role="dialog"
    aria-modal="true"
    aria-label="Shipping restriction notice"
  >
    <div class="bg-background w-full md:max-w-md p-8 md:p-10 border-t md:border border-border animate-fade-up">
      <!-- Icon -->
      <div class="w-12 h-12 border border-border flex items-center justify-center mb-6">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
      </div>

      <p class="text-label text-muted-foreground mb-2">Shipping Notice</p>
      <h2 class="text-2xl font-display font-bold mb-3 leading-tight">
        We Ship Within<br/>South Africa Only
      </h2>
      <p class="text-sm text-muted-foreground leading-relaxed mb-8">
        Currently Others. only ships within South Africa. It looks like you're visiting from outside the country — you're welcome to browse, but orders can only be delivered to South African addresses.
      </p>

      <div class="space-y-3">
        <button
          onclick={dismiss}
          class="w-full py-4 bg-foreground text-primary-foreground text-label tracking-[0.2em] hover:bg-foreground/90 transition-colors active:scale-[0.97]">
          BROWSE THE STORE
        </button>
        <p class="text-xs text-center text-muted-foreground">
          Checkout is restricted to South African addresses.
        </p>
      </div>
    </div>
  </div>
{/if}
