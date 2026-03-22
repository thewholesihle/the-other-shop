<script>
  export let pages = {};
  export let onUpdate = () => {};

  let section = 'shipping';
  let shipping = pages.shipping?.content ?? '';
  let faq = pages.faq ? JSON.parse(JSON.stringify(pages.faq)) : [];
  let contact = pages.contact ? JSON.parse(JSON.stringify(pages.contact)) : { address: '', details: [] };
  let saved = false;

  function save() {
    onUpdate({ shipping: { content: shipping }, faq, contact });
    saved = true;
    setTimeout(() => (saved = false), 2000);
  }

  function addFaq() { faq = [...faq, { id: `faq-${Date.now()}`, question: '', answer: '' }]; }
  function removeFaq(id) { faq = faq.filter(f => f.id !== id); }

  function addContact() { contact = { ...contact, details: [...contact.details, { id: `c-${Date.now()}`, label: '', value: '' }] }; }
  function removeContact(id) { contact = { ...contact, details: contact.details.filter(d => d.id !== id) }; }
</script>

<div class="space-y-6 max-w-3xl">
  <div>
    <h2 class="text-2xl font-display font-bold mb-1">Pages</h2>
    <p class="text-sm text-muted-foreground">Edit public-facing informational pages.</p>
  </div>

  <!-- Section tabs -->
  <div class="flex gap-2 border-b border-border pb-4">
    {#each [['shipping','Shipping & Returns'],['faq','FAQ'],['contact','Contact']] as [key, label]}
      <button onclick={() => (section = key)} class="px-4 py-2 text-label tracking-[0.15em] transition-colors {section === key ? 'bg-foreground text-primary-foreground' : 'hover:bg-muted text-muted-foreground hover:text-foreground'}">{label}</button>
    {/each}
  </div>

  {#if section === 'shipping'}
    <div class="space-y-4">
      <p class="text-xs text-muted-foreground">Supports HTML. Use &lt;h2&gt;, &lt;p&gt;, &lt;ul&gt;, etc.</p>
      <textarea bind:value={shipping} rows={16} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors resize-y font-mono"></textarea>
    </div>

  {:else if section === 'faq'}
    <div class="space-y-4">
      {#each faq as item, i}
        <div class="border border-border p-4 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-label">Q{i + 1}</span>
            <button aria-label="Remove FAQ" onclick={() => removeFaq(item.id)} class="text-muted-foreground hover:text-destructive">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
          <input bind:value={item.question} placeholder="Question" class="w-full bg-transparent border border-border px-3 py-2 text-sm focus:outline-none focus:border-foreground transition-colors" />
          <textarea bind:value={item.answer} placeholder="Answer" rows={2} class="w-full bg-transparent border border-border px-3 py-2 text-sm focus:outline-none focus:border-foreground transition-colors resize-none"></textarea>
        </div>
      {/each}
      <button onclick={addFaq} class="flex items-center gap-2 border border-dashed border-border px-4 py-3 w-full text-label text-muted-foreground hover:text-foreground hover:border-foreground transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
        ADD QUESTION
      </button>
    </div>

  {:else if section === 'contact'}
    <div class="space-y-4">
      <div>
        <label for="contact-address" class="text-label block mb-1.5">ADDRESS</label>
        <textarea id="contact-address" bind:value={contact.address} rows={2} class="w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-foreground transition-colors resize-none"></textarea>
      </div>
      <div class="space-y-3">
        <p class="text-label">CONTACT DETAILS</p>
        {#each contact.details as detail}
          <div class="flex gap-2 items-start">
            <input bind:value={detail.label} placeholder="Label (e.g. General Enquiries)" class="flex-1 bg-transparent border border-border px-3 py-2 text-sm focus:outline-none focus:border-foreground transition-colors" />
            <input bind:value={detail.value} placeholder="Value (e.g. email or phone)" class="flex-1 bg-transparent border border-border px-3 py-2 text-sm focus:outline-none focus:border-foreground transition-colors" />
            <button aria-label="Remove contact" onclick={() => removeContact(detail.id)} class="p-2 text-muted-foreground hover:text-destructive transition-colors mt-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        {/each}
        <button onclick={addContact} class="flex items-center gap-2 border border-dashed border-border px-4 py-3 w-full text-label text-muted-foreground hover:text-foreground hover:border-foreground transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
          ADD CONTACT
        </button>
      </div>
    </div>
  {/if}

  <button onclick={save} class="flex items-center gap-2 bg-foreground text-primary-foreground px-5 py-2.5 text-label tracking-[0.15em] hover:bg-foreground/90 transition-colors active:scale-[0.97]">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 6 9 17l-5-5"/></svg>
    {saved ? 'SAVED!' : 'SAVE CHANGES'}
  </button>
</div>
