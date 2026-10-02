<script>
  import { thumb, getOptimizedUrl } from '../../lib/cloudinary.js';
  import { onMount } from 'svelte';
  import Button from '../ui/Button.svelte';
  import Card from '../ui/Card.svelte';
  import { inputCls, labelCls } from '../../lib/ui.js';
  import Eye from 'lucide-svelte/icons/eye';
  import EyeOff from 'lucide-svelte/icons/eye-off';
  import LoaderCircle from 'lucide-svelte/icons/loader-circle';
  import ShieldCheck from 'lucide-svelte/icons/shield-check';

  let { onSuccess = () => {} } = $props();

  let username = $state('');
  let password = $state('');
  let code = $state('');
  let showPassword = $state(false);
  let needsCode = $state(false);
  let submitting = $state(false);
  let error = $state('');
  let heroImage = $state('');
  let siteName = $state('Others.');
  let logo = $state('');
  let logoFailed = $state(false);

  // Two things worth knowing before the user types anything: whether a second factor is
  // required, and (purely cosmetic) the store's hero image for the side panel.
  onMount(async () => {
    try {
      const cfg = await (await fetch('/api/admin/auth-config')).json();
      needsCode = Boolean(cfg.totp);
    } catch { /* the form still works without it */ }
    try {
      const d = await (await fetch('/api/data')).json();
      heroImage = d?.site?.hero?.image || '';
      siteName = d?.site?.name || 'Others.';
      logo = d?.site?.logo || '';
    } catch { /* plain panel */ }
  });

  async function submit(e) {
    e.preventDefault();
    if (submitting) return;
    error = '';
    if (!username.trim() || !password) { error = 'Enter your username and password.'; return; }
    if (needsCode && !/^\d{6}$/.test(code.replace(/\s/g, ''))) { error = 'Enter the 6-digit code from your authenticator app.'; return; }
    submitting = true;
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password, code: code.replace(/\s/g, '') }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { const err = new Error(body.error || 'Sign-in failed. Please try again.'); err.field = body.field; throw err; }
      password = ''; code = '';
      onSuccess(body.csrf);
    } catch (err) {
      error = err.message;
      code = '';
      if (err.field === 'code') {
        // password was right — keep it, just ask for a fresh code
        document.getElementById('login-code')?.focus();
      } else {
        password = '';
      }
    } finally {
      submitting = false;
    }
  }
</script>

<div class="flex min-h-screen flex-col items-center justify-center bg-muted p-6 md:p-10">
  <div class="flex w-full max-w-sm flex-col gap-6 md:max-w-3xl">
    <Card class="overflow-hidden">
      <div class="grid md:grid-cols-2">
        <form class="p-6 md:p-8" onsubmit={submit} novalidate>
          <div class="flex flex-col gap-6">
            <div class="flex flex-col items-center gap-2 text-center">
              {#if logo && !logoFailed}
                <img src={getOptimizedUrl(logo, 440)} alt={siteName} class="mb-3 h-9 w-auto max-w-[180px] object-contain" decoding="async" onerror={() => (logoFailed = true)} />
              {/if}
              <h1 class="text-2xl font-bold tracking-tight">Welcome back</h1>
              <p class="text-balance text-sm text-muted-foreground">Sign in to the {siteName} admin panel</p>
            </div>

            <div>
              <label for="login-username" class={labelCls}>Username</label>
              <!-- svelte-ignore a11y_autofocus -->
              <input id="login-username" bind:value={username} class={inputCls} type="text" autocomplete="username" autocapitalize="none" spellcheck="false" autofocus required />
            </div>

            <div>
              <label for="login-password" class={labelCls}>Password</label>
              <div class="relative">
                <input id="login-password" bind:value={password} class="{inputCls} pr-10" type={showPassword ? 'text' : 'password'} autocomplete="current-password" required />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  onclick={() => (showPassword = !showPassword)}
                  class="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:text-foreground"
                >
                  {#if showPassword}<EyeOff size={16} />{:else}<Eye size={16} />{/if}
                </button>
              </div>
            </div>

            {#if needsCode}
              <div>
                <label for="login-code" class={labelCls}>Authentication code</label>
                <input id="login-code" bind:value={code} class="{inputCls} tracking-[0.4em] tabular-nums" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="7" autocomplete="one-time-code" placeholder="000000" required />
                <p class="mt-1.5 text-[0.8rem] text-muted-foreground">From your authenticator app.</p>
              </div>
            {/if}

            {#if error}
              <p role="alert" class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
            {/if}

            <Button type="submit" class="w-full" disabled={submitting}>
              {#if submitting}<LoaderCircle size={15} class="animate-spin" /> Signing in…{:else}Sign in{/if}
            </Button>

            <p class="flex items-start justify-center gap-2 text-center text-xs text-muted-foreground">
              <ShieldCheck size={14} class="mt-px shrink-0" />
              <span>Private area. Sign-in attempts are rate-limited and logged.</span>
            </p>
          </div>
        </form>

        <div class="relative hidden bg-primary md:block">
          {#if heroImage}
            <img src={getOptimizedUrl(heroImage, 960)} decoding="async" alt="" class="absolute inset-0 h-full w-full object-cover" />
          {/if}
        </div>
      </div>
    </Card>
    <p class="text-balance text-center text-xs text-muted-foreground">Sessions end automatically after 30 minutes of inactivity.</p>
  </div>
</div>
