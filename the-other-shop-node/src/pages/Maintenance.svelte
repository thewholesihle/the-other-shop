<script>
  export let title   = "We'll be back soon.";
  export let message = "Our store is currently undergoing scheduled maintenance. Please check back shortly.";
  export let background = '';
  export let siteName   = 'Others.';
  export let logo       = '';
  export let socials    = {};
  export let collectEmails = false;

  let email = '';
  let submitted = false;
  let submitting = false;
  let submitError = '';

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email || submitting) return;
    submitting = true;
    submitError = '';
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Something went wrong.');
      submitted = true;
    } catch (err) {
      submitError = err.message;
    } finally {
      submitting = false;
    }
  }
</script>

<svelte:head>
  <title>Maintenance — {siteName}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div
  class="min-h-screen flex flex-col items-center justify-center relative overflow-hidden bg-background"
  style={background ? `background-image: url('${background}'); background-size: cover; background-position: center;` : ''}
>
  {#if background}
    <div class="absolute inset-0 bg-black/60 backdrop-blur-[2px]"></div>
  {/if}

  <div class="relative z-10 text-center max-w-lg px-8 py-16 {background ? 'text-white' : ''}">
    {#if logo}
      <img src={logo} alt={siteName} class="h-10 w-auto mx-auto mb-10 object-contain drop-shadow" />
    {:else}
      <p class="text-label tracking-[0.4em] mb-10 opacity-60">{siteName}</p>
    {/if}

    <div class="w-16 h-16 mx-auto mb-8 rounded-full flex items-center justify-center border {background ? 'border-white/30' : 'border-border'}">
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83"/>
      </svg>
    </div>

    <h1 class="font-display text-3xl md:text-4xl font-bold mb-5 leading-tight">{title}</h1>
    <p class="text-sm leading-relaxed opacity-75 max-w-sm mx-auto">{message}</p>

    {#if collectEmails}
      <div class="mt-10">
        {#if submitted}
          <div class="flex items-center justify-center gap-2 text-sm {background ? 'text-white' : 'text-foreground'} opacity-80">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>
            You're on the list — we'll notify you when we're back!
          </div>
        {:else}
          <p class="text-xs opacity-60 mb-3 tracking-widest uppercase">Notify me when you're back</p>
          <form onsubmit={handleSubmit} class="flex gap-2 max-w-sm mx-auto">
            <input
              type="email"
              required
              bind:value={email}
              placeholder="your@email.com"
              class="flex-1 px-4 py-2.5 text-sm bg-transparent border focus:outline-none transition-colors
                {background ? 'border-white/40 text-white placeholder-white/40 focus:border-white/80' : 'border-border focus:border-foreground'}"
            />
            <button
              type="submit"
              disabled={submitting}
              aria-label="Notify me"
              class="px-5 py-2.5 text-[10px] tracking-[0.2em] uppercase font-medium transition-colors disabled:opacity-60
                {background ? 'bg-white text-black hover:bg-white/90' : 'bg-foreground text-primary-foreground hover:bg-foreground/90'}"
            >
              {submitting ? '…' : 'NOTIFY'}
            </button>
          </form>
          {#if submitError}
            <p class="text-xs text-red-400 mt-2">{submitError}</p>
          {/if}
        {/if}
      </div>
    {/if}

    <div class="w-12 h-px mx-auto mt-12 {background ? 'bg-white/30' : 'bg-border'}"></div>
    <p class="text-xs mt-4 opacity-40 tracking-widest uppercase">Back Soon</p>

    <!-- Social Links -->
    {#if socials && (socials.instagram?.trim() || socials.twitter?.trim() || socials.tiktok?.trim())}
      <div class="flex items-center justify-center gap-6 mt-10">
        {#if socials.instagram?.trim()}
          <a href={socials.instagram.trim()} target="_blank" rel="noopener noreferrer" class="opacity-60 hover:opacity-100 transition-opacity" aria-label="Instagram">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
          </a>
        {/if}
        {#if socials.twitter?.trim()}
          <a href={socials.twitter.trim()} target="_blank" rel="noopener noreferrer" class="opacity-60 hover:opacity-100 transition-opacity" aria-label="X (Twitter)">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          </a>
        {/if}
        {#if socials.tiktok?.trim()}
          <a href={socials.tiktok.trim()} target="_blank" rel="noopener noreferrer" class="opacity-60 hover:opacity-100 transition-opacity" aria-label="TikTok">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"></path></svg>
          </a>
        {/if}
      </div>
    {/if}
  </div>
</div>
