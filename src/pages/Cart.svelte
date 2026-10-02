<script>
  import { cutReveal } from '../lib/cutReveal.js';
  import Img from '../components/Img.svelte';
  import { onMount, onDestroy } from 'svelte';
  import Navbar from '../components/Navbar.svelte';
  import Footer from '../components/Footer.svelte';
  import Loader from '../components/Loader.svelte';
  import PaymentLogo from '../components/PaymentLogo.svelte';
  import { cart, cartTotal, cartCount } from '../stores/cart.js';

  import { loadStoreData } from '../lib/storeData.js';
  import { getSrcset, getOptimizedUrl } from '../lib/cloudinary.js';

  let data = null;
  let loading = true;
  let step = 'cart';
  let submitting = false;
  let orderId = '';
  let stockErrors = [];
  let checkoutError = '';
  let processingPayment = false;

  // Payment methods the store currently offers (enabled in the admin AND configured on the server).
  let methods = [];
  let methodsLoaded = false;
  let methodsError = false;
  let paymentMethod = '';
  $: selectedMethod = methods.find(m => m.id === paymentMethod);

  // On the success page: 'confirmed' | 'confirming' (waiting for the provider's webhook) | 'delayed'.
  let successState = 'confirmed';
  let cancelReason = '';
  let pollTimer;
  const PENDING_KEY = 'others-pending-order';
  const readPending = () => { try { return sessionStorage.getItem(PENDING_KEY) || ''; } catch { return ''; } };
  const writePending = (id) => { try { id ? sessionStorage.setItem(PENDING_KEY, id) : sessionStorage.removeItem(PENDING_KEY); } catch { /* private mode */ } };

  async function loadMethods() {
    methodsError = false;
    try {
      const res = await fetch('/api/payment-methods', { cache: 'no-store' });
      if (!res.ok) throw new Error('bad status');
      const body = await res.json();
      methods = Array.isArray(body.methods) ? body.methods : [];
    } catch {
      methods = [];
      methodsError = true;
    }
    methodsLoaded = true;
    if (!methods.some(m => m.id === paymentMethod)) paymentMethod = methods[0]?.id || '';
  }

  // Yoco confirms payments by webhook, which can land a moment after the customer is sent back.
  // Ask the server (not the URL — anyone can type /payment/success) until it says paid.
  function watchPayment(oid) {
    successState = 'confirming';
    const started = Date.now();
    const tick = async () => {
      try {
        const res = await fetch(`/api/checkout/status?orderId=${encodeURIComponent(oid)}`, { cache: 'no-store' });
        const { state } = await res.json();
        if (state === 'paid') { successState = 'confirmed'; return; }
      } catch { /* keep trying until the deadline */ }
      if (Date.now() - started > 45000) { successState = 'delayed'; return; }
      pollTimer = setTimeout(tick, 2500);
    };
    tick();
  }

  // Coming back with the browser's Back button from the payment page restores this page frozen mid-spinner.
  function resetIfRestored(e) {
    if (e.persisted) { processingPayment = false; submitting = false; }
  }
  onMount(() => { window.addEventListener('pageshow', resetIfRestored); });
  onDestroy(() => { clearTimeout(pollTimer); if (typeof window !== 'undefined') window.removeEventListener('pageshow', resetIfRestored); });

  let form = {
    firstName: '', lastName: '', email: '', phone: '',
    address: '', city: '', postcode: '', province: '',
  };

  onMount(async () => {
    try {
      data = await loadStoreData();
      const params = new URLSearchParams(window.location.search);
      const path = window.location.pathname;

      if (path === '/payment/success') {
        step = 'success';
        // The order is placed — only now does the cart empty (cancelling or failing keeps it).
        cart.clear();
        writePending('');
        const oid = params.get('orderId');
        if (oid && params.get('m') === 'yoco') watchPayment(oid);
      } else if (path === '/payment/cancel') {
        step = 'cancel';
        cancelReason = params.get('reason') === 'failed' ? 'failed' : '';
        writePending('');
        const oid = params.get('orderId');
        if (oid) {
          fetch('/api/checkout/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: oid, reason: cancelReason })
          }).catch(console.error);
        }
      } else {
        loadMethods();
      }
    } finally { loading = false; }
  });

  $: shippingConfig = data?.site?.shipping ?? { freeMinimum: 500, standardRate: 99 };
  $: shippingCost = $cartTotal >= shippingConfig.freeMinimum ? 0 : shippingConfig.standardRate;
  $: grandTotal = $cartTotal + shippingCost;
  $: currency = data?.site?.currency ?? 'R';

  async function proceedToPayment() {
    if (submitting) return;
    if (!paymentMethod) { checkoutError = 'Please choose a payment method.'; return; }
    submitting = true;
    stockErrors = [];
    checkoutError = '';
    processingPayment = true;
    // If they went Back from a payment page last time, that unpaid order still holds stock — release it first.
    const stale = readPending();
    if (stale) {
      writePending('');
      fetch('/api/checkout/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: stale }) }).catch(() => {});
    }
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethod,
          order: {
            customer: `${form.firstName} ${form.lastName}`.trim(),
            email: form.email,
            phone: form.phone,
            address: `${form.address}, ${form.city} ${form.postcode}, ${form.province}, South Africa`,
            // Sent alongside the composed string above so each part (esp. postal code)
            // is available on its own when packing the order.
            deliveryStreet: form.address,
            deliveryCity: form.city,
            deliveryProvince: form.province,
            deliveryPostalCode: form.postcode,
            deliveryCountry: 'ZA',
            items: $cart,
            total: $cartTotal,
          }
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        stockErrors = body.stockErrors || [];
        checkoutError = body.error || 'Payment initialization failed. Please try again.';
        // The set of working methods changed (admin switched one off, provider down): show what's left.
        if (['method_unavailable', 'payment_unavailable', 'no_payment_method'].includes(body.code)) await loadMethods();
        processingPayment = false;
        submitting = false;
        
        setTimeout(() => {
          const errEl = document.getElementById('checkout-errors');
          if (errEl) errEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 50);
        return;
      }
      const result = await res.json();
      orderId = result.orderId;
      writePending(result.orderId); // the cart is kept until the payment is actually confirmed

      if (result.redirectUrl) {
        // Hosted checkout (Yoco): just go there. Only ever to an https link (or localhost in development).
        const u = new URL(result.redirectUrl);
        if (u.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(u.hostname)) throw new Error('Unexpected payment link');
        window.location.assign(u.href);
        return;
      }
      const { paymentUrl, params } = result;
      const formEl = document.createElement('form');
      formEl.method = 'POST';
      formEl.action = paymentUrl;
      Object.entries(params).forEach(([k, v]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = k;
        input.value = v;
        formEl.appendChild(input);
      });
      document.body.appendChild(formEl);
      formEl.submit();
    } catch (e) {
      console.error(e);
      checkoutError = 'Connection error. Please try again.';
      processingPayment = false;
      submitting = false;
      
      setTimeout(() => {
        const errEl = document.getElementById('checkout-errors');
        if (errEl) errEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    }
  }

  function inputClass() {
    return 'w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors';
  }

  const SA_PROVINCES = [
    'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal',
    'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape',
  ];
</script>

<svelte:head>
  <title>{data ? `Cart — ${data.site.name}` : 'Cart'}</title>
</svelte:head>

{#if loading || !data}
  <Loader />
{:else}
  <div class="min-h-screen flex flex-col">
    <Navbar siteName={data.site.name} logo={data.site.logo} logoHeight={data.site.navLogoSize} />
    <div class="flex-1 pt-28 pb-20 px-6 md:px-10 max-w-5xl mx-auto">

      {#if processingPayment}
        <div class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
          <div class="bg-card p-10 shadow-2xl text-center border border-border border-b-4 border-b-foreground max-w-md mx-4 animate-fade-up">
            <div class="w-10 h-10 border-4 border-foreground/20 border-t-foreground rounded-full animate-spin mx-auto mb-6"></div>
            <h2 class="text-2xl font-bold font-display mb-3">Processing Payment</h2>
            <p class="text-sm text-muted-foreground leading-relaxed">Securely redirecting to {selectedMethod?.label || 'our payment partner'}.<br/>Please do not refresh or close this page.</p>
          </div>
        </div>
      {/if}

      {#if step === 'success'}
        <div class="text-center py-24">
          <div class="w-16 h-16 border-2 {successState === 'confirming' ? 'border-muted-foreground text-muted-foreground' : 'border-success text-success'} rounded-full flex items-center justify-center mx-auto mb-6">
            {#if successState === 'confirming'}
              <div class="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin"></div>
            {:else}
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 6 9 17l-5-5"/></svg>
            {/if}
          </div>
          {#if successState === 'confirming'}
            <h1 use:cutReveal class="text-3xl font-display font-bold mb-3">Confirming your payment…</h1>
            <p class="text-muted-foreground mb-2" role="status">Hang tight — we're waiting for confirmation from your bank.</p>
            <p class="text-sm text-muted-foreground mb-10">Please don't close this page.</p>
          {:else if successState === 'delayed'}
            <h1 use:cutReveal class="text-3xl font-display font-bold mb-3">Payment received</h1>
            <p class="text-muted-foreground mb-2" role="status">We haven't had final confirmation yet — it can take a few minutes.</p>
            <p class="text-sm text-muted-foreground mb-10">You'll get an email as soon as your order is confirmed. If it doesn't arrive, contact us and we'll sort it out.</p>
          {:else}
            <h1 use:cutReveal class="text-3xl font-display font-bold mb-3">Payment Successful</h1>
            <p class="text-muted-foreground mb-2">Your order has been confirmed and is being processed.</p>
            <p class="text-sm text-muted-foreground mb-10">A confirmation will be sent to your email address.</p>
          {/if}
          <a href="/shop" onclick={(e) => { e.preventDefault(); window.__navigate('/shop'); }} class="inline-block bg-foreground text-primary-foreground px-8 py-3.5 text-label tracking-[0.25em] hover:bg-foreground/90 transition-colors">CONTINUE SHOPPING</a>
        </div>

      {:else if step === 'cancel'}
        <div class="text-center py-24">
          <div class="w-16 h-16 border-2 border-muted-foreground rounded-full flex items-center justify-center mx-auto mb-6 text-muted-foreground">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </div>
          {#if cancelReason === 'failed'}
            <h1 use:cutReveal class="text-3xl font-display font-bold mb-3">Payment Failed</h1>
            <p class="text-muted-foreground mb-10">Your payment didn't go through and you haven't been charged. Your cart is still here — try again or choose another payment method.</p>
          {:else}
            <h1 use:cutReveal class="text-3xl font-display font-bold mb-3">Payment Cancelled</h1>
            <p class="text-muted-foreground mb-10">Your payment was not completed. Your cart has been saved.</p>
          {/if}
          <a href="/cart" onclick={(e) => { e.preventDefault(); window.__navigate('/cart'); }} class="inline-block border border-foreground px-8 py-3.5 text-label tracking-[0.25em] hover:bg-foreground hover:text-primary-foreground transition-all duration-300">BACK TO CART</a>
        </div>

      {:else if step === 'cart'}
        <div class="mb-8">
          <h1 use:cutReveal class="text-3xl md:text-4xl font-display font-bold">Your Cart</h1>
          <p class="text-sm text-muted-foreground mt-1">{$cartCount} item{$cartCount !== 1 ? 's' : ''}</p>
        </div>

        {#if $cart.length === 0}
          <div class="text-center py-24">
            <p class="text-muted-foreground mb-6">Your cart is empty.</p>
            <a href="/shop" onclick={(e) => { e.preventDefault(); window.__navigate('/shop'); }} class="inline-block border border-foreground px-8 py-3 text-label tracking-[0.25em] hover:bg-foreground hover:text-primary-foreground transition-all duration-300">SHOP NOW</a>
          </div>
        {:else}
          <div class="grid md:grid-cols-[1fr_320px] gap-10">
            <!-- Items -->
            <div class="space-y-4">
              {#each $cart as item}
                <div class="flex gap-4 border-b border-border pb-4">
                  <Img src={item.image} alt={item.name} widths={[160, 320]} fallbackWidth={320} sizes="80px" class="w-20 h-24 object-cover bg-secondary flex-shrink-0" />
                  <div class="flex-1 min-w-0">
                    <p class="font-medium">{item.name}</p>
                    <p class="text-xs text-muted-foreground mt-0.5">{[item.size && `Size: ${item.size}`, item.color && `Color: ${item.color}`].filter(Boolean).join(' · ')}</p>
                    <p class="text-sm font-medium mt-1 tabular-nums">{currency}{item.price.toFixed(2)}</p>
                    <div class="flex items-center gap-2 mt-2">
                      <button aria-label="Decrease quantity" onclick={() => cart.updateQuantity(item.key, item.quantity - 1)} class="w-6 h-6 border border-border flex items-center justify-center hover:bg-muted transition-colors text-sm">−</button>
                      <span class="w-6 text-center text-sm tabular-nums">{item.quantity}</span>
                      <button aria-label="Increase quantity" onclick={() => cart.updateQuantity(item.key, item.quantity + 1)} class="w-6 h-6 border border-border flex items-center justify-center hover:bg-muted transition-colors text-sm">+</button>
                      <button aria-label="Remove item" onclick={() => cart.removeItem(item.key)} class="ml-2 text-xs text-muted-foreground hover:text-destructive transition-colors">Remove</button>
                    </div>
                  </div>
                  <p class="font-medium tabular-nums flex-shrink-0">{currency}{(item.price * item.quantity).toFixed(2)}</p>
                </div>
              {/each}
            </div>

            <!-- Summary -->
            <div class="bg-card border border-border p-6 h-fit space-y-4">
              <h2 class="font-display font-bold text-lg">Order Summary</h2>
              <div class="space-y-2 text-sm">
                <div class="flex justify-between"><span class="text-muted-foreground">Subtotal</span><span class="tabular-nums">{currency}{$cartTotal.toFixed(2)}</span></div>
                <div class="flex justify-between">
                  <span class="text-muted-foreground">Shipping</span>
                  <span>
                    {#if shippingCost === 0}
                      <span class="text-success">Free</span>
                    {:else}
                      {currency}{shippingCost.toFixed(2)}
                    {/if}
                  </span>
                </div>
                {#if shippingCost > 0}
                  <p class="text-xs text-muted-foreground">Spend {currency}{(shippingConfig.freeMinimum - $cartTotal).toFixed(2)} more for free shipping</p>
                {/if}
                <div class="border-t border-border pt-2 flex justify-between font-medium">
                  <span>Total</span>
                  <span class="tabular-nums">{currency}{grandTotal.toFixed(2)}</span>
                </div>
              </div>
              <div class="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                {selectedMethod ? `Secured by ${selectedMethod.label}` : 'Secure checkout'} · SA only
              </div>
              <button onclick={() => (step = 'checkout')} class="w-full py-3.5 bg-foreground text-primary-foreground text-label tracking-[0.2em] hover:bg-foreground/90 transition-colors active:scale-[0.97]">CHECKOUT</button>
            </div>
          </div>
        {/if}

      {:else if step === 'checkout'}
        <div class="mb-8">
          <button onclick={() => (step = 'cart')} class="text-xs text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>
            Back to cart
          </button>
          <h1 use:cutReveal class="text-3xl md:text-4xl font-display font-bold">Delivery Details</h1>
          <p class="text-sm text-muted-foreground mt-1 flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            South Africa delivery only
          </p>
        </div>

        <div class="grid md:grid-cols-[1fr_320px] gap-10">
          <form onsubmit={(e) => { e.preventDefault(); proceedToPayment(); }} class="space-y-6">
            <!-- Contact -->
            <div class="space-y-4">
              <h2 class="text-label border-b border-border pb-3">CONTACT INFORMATION</h2>
              <div class="grid sm:grid-cols-2 gap-4">
                <div>
                  <label for="co-first" class="text-label block mb-1.5">FIRST NAME</label>
                  <input id="co-first" required bind:value={form.firstName} class={inputClass()} />
                </div>
                <div>
                  <label for="co-last" class="text-label block mb-1.5">LAST NAME</label>
                  <input id="co-last" required bind:value={form.lastName} class={inputClass()} />
                </div>
              </div>
              <div class="grid sm:grid-cols-2 gap-4">
                <div>
                  <label for="co-email" class="text-label block mb-1.5">EMAIL</label>
                  <input id="co-email" type="email" required bind:value={form.email} class={inputClass()} />
                </div>
                <div>
                  <label for="co-phone" class="text-label block mb-1.5">PHONE</label>
                  <input id="co-phone" type="tel" required bind:value={form.phone} class={inputClass()} />
                </div>
              </div>
            </div>

            <!-- Address -->
            <div class="space-y-4">
              <h2 class="text-label border-b border-border pb-3">DELIVERY ADDRESS</h2>
              <div>
                <label for="co-addr" class="text-label block mb-1.5">STREET ADDRESS</label>
                <input id="co-addr" required bind:value={form.address} class={inputClass()} />
              </div>
              <div class="grid sm:grid-cols-3 gap-4">
                <div class="sm:col-span-1">
                  <label for="co-post" class="text-label block mb-1.5">POSTAL CODE</label>
                  <input id="co-post" required bind:value={form.postcode} class={inputClass()} />
                </div>
                <div class="sm:col-span-2">
                  <label for="co-city" class="text-label block mb-1.5">CITY / SUBURB</label>
                  <input id="co-city" required bind:value={form.city} class={inputClass()} />
                </div>
              </div>
              <div>
                <label for="co-prov" class="text-label block mb-1.5">PROVINCE</label>
                <select id="co-prov" required bind:value={form.province} class="w-full bg-background border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors">
                  <option value="">Select province…</option>
                  {#each SA_PROVINCES as p}<option value={p}>{p}</option>{/each}
                </select>
              </div>
              <div>
                <p class="text-label block mb-1.5">COUNTRY</p>
                <div class="flex items-center gap-2 border border-border/50 bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
                  🇿🇦 South Africa
                  <span class="ml-auto text-xs">(delivery locked to SA)</span>
                </div>
              </div>
            </div>

            <!-- Payment method -->
            <div class="space-y-4">
              <h2 class="text-label border-b border-border pb-3">PAYMENT METHOD</h2>
              {#if !methodsLoaded}
                <p class="text-sm text-muted-foreground" role="status">Loading payment options…</p>
              {:else if methodsError}
                <div class="border border-destructive bg-destructive/5 px-4 py-3 flex items-center justify-between gap-4">
                  <p class="text-sm text-destructive">We couldn't load the payment options.</p>
                  <button type="button" onclick={loadMethods} class="text-xs underline underline-offset-4 hover:no-underline">Try again</button>
                </div>
              {:else if methods.length === 0}
                <div class="border border-destructive bg-destructive/5 px-4 py-3">
                  <p class="text-sm font-medium text-destructive">Online payments are temporarily unavailable.</p>
                  <p class="text-xs text-muted-foreground mt-1">Please try again shortly — your cart is saved.</p>
                </div>
              {:else}
                <div role="radiogroup" aria-label="Payment method" class="grid gap-3 {methods.length > 1 ? 'sm:grid-cols-2' : ''}">
                  {#each methods as m (m.id)}
                    <label class="flex items-start gap-3 border px-4 py-3 cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-foreground/40 {paymentMethod === m.id ? 'border-foreground bg-muted/40' : 'border-border hover:border-foreground/50'}">
                      <input type="radio" name="payment-method" value={m.id} bind:group={paymentMethod} class="mt-1 accent-foreground" />
                      <span class="min-w-0 flex-1">
                        <span class="block text-sm font-medium">{m.label}</span>
                        <span class="block text-xs text-muted-foreground">{m.description}</span>
                      </span>
                      <span class="self-center"><PaymentLogo id={m.id} height={m.id === 'yoco' ? 14 : 18} /></span>
                    </label>
                  {/each}
                </div>
              {/if}
            </div>

            <!-- Stock/checkout errors -->
            <div id="checkout-errors" class="scroll-mt-32">
              {#if stockErrors.length > 0}
                <div class="border border-destructive bg-destructive/5 px-4 py-3 space-y-1">
                  <p class="text-sm font-medium text-destructive">Cannot complete checkout:</p>
                  {#each stockErrors as err}
                    <p class="text-xs text-destructive">{err}</p>
                  {/each}
                  <p class="text-xs text-muted-foreground mt-1">Please update your cart and try again.</p>
                </div>
              {:else if checkoutError}
                <div class="border border-destructive bg-destructive/5 px-4 py-3">
                  <p class="text-sm font-medium text-destructive">{checkoutError}</p>
                </div>
              {/if}
            </div>

            <!-- Pay button -->
            <button type="submit" disabled={submitting || !paymentMethod} class="w-full py-4 bg-foreground text-primary-foreground text-label tracking-[0.2em] hover:bg-foreground/90 transition-colors active:scale-[0.97] disabled:opacity-60 flex items-center justify-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              PAY SECURELY — {currency}{grandTotal.toFixed(2)}
            </button>
            <p class="text-xs text-center text-muted-foreground">{selectedMethod ? `Powered by ${selectedMethod.label} · ` : ''}Secured with 256-bit SSL</p>
          </form>

          <!-- Mini summary -->
          <div class="bg-card border border-border p-5 h-fit space-y-3">
            <h2 class="text-label">ORDER SUMMARY</h2>
            {#each $cart as item}
              <div class="flex gap-3 text-sm">
                <Img src={item.image} alt={item.name} widths={[96, 192]} fallbackWidth={192} sizes="48px" class="w-12 h-12 object-cover bg-secondary flex-shrink-0" />
                <div class="flex-1">
                  <p class="font-medium">{item.name}</p>
                  <p class="text-xs text-muted-foreground">{[item.size, item.color].filter(Boolean).join(' / ')} × {item.quantity}</p>
                </div>
                <span class="tabular-nums">{currency}{(item.price * item.quantity).toFixed(2)}</span>
              </div>
            {/each}
            <div class="border-t border-border pt-3 text-sm space-y-1">
              <div class="flex justify-between"><span class="text-muted-foreground">Shipping</span><span>{shippingCost === 0 ? 'Free' : `${currency}${shippingCost.toFixed(2)}`}</span></div>
              <div class="flex justify-between font-medium"><span>Total</span><span>{currency}{grandTotal.toFixed(2)}</span></div>
            </div>
          </div>
        </div>
      {/if}

    </div>
    <Footer {data} />
  </div>
{/if}
