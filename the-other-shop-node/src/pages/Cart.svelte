<script>
  import { onMount } from 'svelte';
  import Navbar from '../components/Navbar.svelte';
  import Footer from '../components/Footer.svelte';
  import { cart, cartTotal, cartCount } from '../stores/cart.js';

  import { loadStoreData } from '../lib/storeData.js';

  let data = null;
  let loading = true;
  let step = 'cart';
  let submitting = false;
  let orderId = '';

  let form = {
    firstName: '', lastName: '', email: '', phone: '',
    address: '', city: '', postcode: '', province: '',
  };

  onMount(async () => {
    try {
      data = await loadStoreData();
      const path = window.location.pathname;
      if (path === '/payment/success') step = 'success';
      else if (path === '/payment/cancel') step = 'cancel';
    } finally { loading = false; }
  });

  $: shippingConfig = data?.site?.shipping ?? { freeMinimum: 500, standardRate: 99 };
  $: shippingCost = $cartTotal >= shippingConfig.freeMinimum ? 0 : shippingConfig.standardRate;
  $: grandTotal = $cartTotal + shippingCost;
  $: currency = data?.site?.currency ?? 'R';

  async function proceedToPayment() {
    if (submitting) return;
    submitting = true;
    step = 'processing';
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order: {
            customer: `${form.firstName} ${form.lastName}`.trim(),
            email: form.email,
            phone: form.phone,
            address: `${form.address}, ${form.city} ${form.postcode}, ${form.province}, South Africa`,
            items: $cart,
            total: $cartTotal,
          }
        }),
      });
      const { paymentUrl, params, orderId: oid } = await res.json();
      orderId = oid;
      // Clear cart before redirect
      cart.clear();
      // Build auto-submitting form and submit
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
      step = 'checkout';
      submitting = false;
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
  <div class="flex min-h-screen items-center justify-center bg-background">
    <div class="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin"></div>
  </div>
{:else}
  <div class="min-h-screen">
    <Navbar siteName={data.site.name} logo={data.site.logo} />
    <div class="pt-24 pb-20 px-6 md:px-10 max-w-5xl mx-auto">

      {#if step === 'processing'}
        <div class="flex flex-col items-center justify-center py-32 gap-6">
          <div class="w-10 h-10 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin"></div>
          <p class="text-sm text-muted-foreground">Redirecting to secure payment…</p>
        </div>

      {:else if step === 'success'}
        <div class="text-center py-24">
          <div class="w-16 h-16 border-2 border-green-600 rounded-full flex items-center justify-center mx-auto mb-6 text-green-600">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 6 9 17l-5-5"/></svg>
          </div>
          <h1 class="text-3xl font-display font-bold mb-3">Payment Successful</h1>
          <p class="text-muted-foreground mb-2">Your order has been confirmed and is being processed.</p>
          <p class="text-sm text-muted-foreground mb-10">A confirmation will be sent to your email address.</p>
          <a href="/products" onclick={(e) => { e.preventDefault(); window.__navigate('/products'); }} class="inline-block bg-foreground text-primary-foreground px-8 py-3.5 text-label tracking-[0.25em] hover:bg-foreground/90 transition-colors">CONTINUE SHOPPING</a>
        </div>

      {:else if step === 'cancel'}
        <div class="text-center py-24">
          <div class="w-16 h-16 border-2 border-muted-foreground rounded-full flex items-center justify-center mx-auto mb-6 text-muted-foreground">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </div>
          <h1 class="text-3xl font-display font-bold mb-3">Payment Cancelled</h1>
          <p class="text-muted-foreground mb-10">Your payment was not completed. Your cart has been saved.</p>
          <a href="/cart" onclick={(e) => { e.preventDefault(); window.__navigate('/cart'); }} class="inline-block border border-foreground px-8 py-3.5 text-label tracking-[0.25em] hover:bg-foreground hover:text-primary-foreground transition-all duration-300">BACK TO CART</a>
        </div>

      {:else if step === 'cart'}
        <div class="mb-8">
          <h1 class="text-3xl md:text-4xl font-display font-bold">Your Cart</h1>
          <p class="text-sm text-muted-foreground mt-1">{$cartCount} item{$cartCount !== 1 ? 's' : ''}</p>
        </div>

        {#if $cart.length === 0}
          <div class="text-center py-24">
            <p class="text-muted-foreground mb-6">Your cart is empty.</p>
            <a href="/products" onclick={(e) => { e.preventDefault(); window.__navigate('/products'); }} class="inline-block border border-foreground px-8 py-3 text-label tracking-[0.25em] hover:bg-foreground hover:text-primary-foreground transition-all duration-300">SHOP NOW</a>
          </div>
        {:else}
          <div class="grid md:grid-cols-[1fr_320px] gap-10">
            <!-- Items -->
            <div class="space-y-4">
              {#each $cart as item}
                <div class="flex gap-4 border-b border-border pb-4">
                  <img src={item.image} alt={item.name} class="w-20 h-24 object-cover bg-secondary flex-shrink-0" />
                  <div class="flex-1 min-w-0">
                    <p class="font-medium">{item.name}</p>
                    <p class="text-xs text-muted-foreground mt-0.5">Size: {item.size}</p>
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
                      <span class="text-green-600">Free</span>
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
                Secured by PayFast · SA only
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
          <h1 class="text-3xl md:text-4xl font-display font-bold">Delivery Details</h1>
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

            <!-- Pay button -->
            <button type="submit" disabled={submitting} class="w-full py-4 bg-foreground text-primary-foreground text-label tracking-[0.2em] hover:bg-foreground/90 transition-colors active:scale-[0.97] disabled:opacity-60 flex items-center justify-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              PAY SECURELY — {currency}{grandTotal.toFixed(2)}
            </button>
            <p class="text-xs text-center text-muted-foreground">Powered by PayFast · Secured with 256-bit SSL</p>
          </form>

          <!-- Mini summary -->
          <div class="bg-card border border-border p-5 h-fit space-y-3">
            <h2 class="text-label">ORDER SUMMARY</h2>
            {#each $cart as item}
              <div class="flex gap-3 text-sm">
                <img src={item.image} alt={item.name} class="w-12 h-12 object-cover bg-secondary flex-shrink-0" />
                <div class="flex-1">
                  <p class="font-medium">{item.name}</p>
                  <p class="text-xs text-muted-foreground">{item.size} × {item.quantity}</p>
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
    <Footer site={data.site} />
  </div>
{/if}
