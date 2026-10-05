<script>
  import Button from '../ui/Button.svelte';
  import Card from '../ui/Card.svelte';
  import Tabs from '../ui/Tabs.svelte';
  import { inputCls, textareaCls, labelCls, hintCls } from '../../lib/ui.js';
  import Plus from 'lucide-svelte/icons/plus';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import LoaderCircle from 'lucide-svelte/icons/loader-circle';

  let { pages = {}, onUpdate = () => {} } = $props();

  const clone = (v) => JSON.parse(JSON.stringify(v));

  let section = $state('shipping');
  // The form owns an editable copy of the saved pages, captured once on mount.
  /* svelte-ignore state_referenced_locally */
  let shipping = $state(pages.shipping?.content ?? '');
  /* svelte-ignore state_referenced_locally */
  let faq = $state(Array.isArray(pages.faq) ? clone(pages.faq) : (pages.faq?.items ? clone(pages.faq.items) : []));
  /* svelte-ignore state_referenced_locally */
  let contact = $state(pages.contact ? clone(pages.contact) : { address: '', details: [] });
  contact.details ??= [];
  let saving = $state(false);
  /* svelte-ignore state_referenced_locally */
  let snapshot = $state(JSON.stringify({ shipping, faq, contact }));
  let dirty = $derived(JSON.stringify({ shipping, faq, contact }) !== snapshot);

  const tabs = [
    { value: 'shipping', label: 'Shipping & returns' },
    { value: 'faq', label: 'FAQ' },
    { value: 'contact', label: 'Contact' },
  ];

  async function save() {
    if (saving) return;
    saving = true;
    try {
      await onUpdate({ shipping: { content: shipping }, faq: { items: $state.snapshot(faq) }, contact: $state.snapshot(contact) });
      snapshot = JSON.stringify({ shipping, faq, contact });
    } catch {
      // Admin.svelte toasts the failure; keep edits on screen.
    } finally {
      saving = false;
    }
  }

  function addFaq() { faq = [...faq, { id: `faq-${Date.now()}`, question: '', answer: '' }]; }
  function removeFaq(id) { faq = faq.filter(f => f.id !== id); }
  function addContact() { contact.details = [...contact.details, { id: `c-${Date.now()}`, label: '', value: '' }]; }
  function removeContact(id) { contact.details = contact.details.filter(d => d.id !== id); }
</script>

<div class="max-w-3xl space-y-6 pb-24">
  <div>
    <h1 class="text-2xl font-semibold tracking-tight">Pages</h1>
    <p class="text-sm text-muted-foreground">Edit the public information pages.</p>
  </div>

  <Tabs items={tabs} bind:value={section} label="Page" />

  {#if section === 'shipping'}
    <Card title="Shipping & returns" description="Supports HTML — use &lt;h2&gt;, &lt;p&gt;, &lt;ul&gt; and so on.">
      <div class="p-6 pt-4">
        <label for="pg-shipping" class="sr-only">Shipping and returns content</label>
        <textarea id="pg-shipping" bind:value={shipping} rows={16} class="{textareaCls} resize-y font-mono text-[13px]"></textarea>
      </div>
    </Card>

  {:else if section === 'faq'}
    <div class="space-y-4">
      {#each faq as item, i (item.id)}
        <Card>
          <div class="space-y-3 p-6">
            <div class="flex items-center justify-between">
              <p class="text-sm font-semibold">Question {i + 1}</p>
              <Button variant="ghost" size="icon" aria-label="Remove question {i + 1}" class="hover:text-destructive" onclick={() => removeFaq(item.id)}><Trash2 size={15} /></Button>
            </div>
            <input bind:value={item.question} placeholder="Question" aria-label="Question {i + 1}" class={inputCls} />
            <textarea bind:value={item.answer} placeholder="Answer" aria-label="Answer {i + 1}" rows={3} class={textareaCls}></textarea>
          </div>
        </Card>
      {:else}
        <Card><p class="p-10 text-center text-sm text-muted-foreground">No questions yet.</p></Card>
      {/each}
      <Button variant="outline" class="w-full border-dashed" onclick={addFaq}><Plus size={15} /> Add question</Button>
    </div>

  {:else if section === 'contact'}
    <Card title="Contact page" description="The address also appears in the footer of marketing emails (required by anti-spam law).">
      <div class="space-y-5 p-6 pt-4">
        <div>
          <label for="contact-address" class={labelCls}>Address</label>
          <textarea id="contact-address" bind:value={contact.address} rows={2} class={textareaCls}></textarea>
        </div>
        <div class="space-y-3">
          <p class={labelCls}>Contact details</p>
          {#each contact.details as detail (detail.id)}
            <div class="flex items-start gap-2">
              <input bind:value={detail.label} placeholder="Label (e.g. General enquiries)" aria-label="Contact label" class={inputCls} />
              <input bind:value={detail.value} placeholder="Email or phone" aria-label="Contact value" class={inputCls} />
              <Button variant="ghost" size="icon" aria-label="Remove contact" class="shrink-0 hover:text-destructive" onclick={() => removeContact(detail.id)}><Trash2 size={15} /></Button>
            </div>
          {/each}
          <Button variant="outline" class="w-full border-dashed" onclick={addContact}><Plus size={15} /> Add contact detail</Button>
        </div>
      </div>
    </Card>
  {/if}

  <div class="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/90 backdrop-blur-sm md:left-60">
    <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-8">
      <p class="text-sm {dirty ? 'text-foreground' : 'text-muted-foreground'}">{dirty ? 'You have unsaved changes' : 'All changes saved'}</p>
      <Button disabled={!dirty || saving} onclick={save}>
        {#if saving}<LoaderCircle size={15} class="animate-spin" /> Saving…{:else}Save changes{/if}
      </Button>
    </div>
  </div>
</div>
