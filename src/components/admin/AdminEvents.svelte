<script>
  import ImageUpload from './ImageUpload.svelte';
  import Button from '../ui/Button.svelte';
  import Badge from '../ui/Badge.svelte';
  import Card from '../ui/Card.svelte';
  import Switch from '../ui/Switch.svelte';
  import Tabs from '../ui/Tabs.svelte';
  import { inputCls, textareaCls, labelCls, hintCls, thCls, tdCls } from '../../lib/ui.js';
  import { toast } from '../../lib/toast.js';
  import { confirmDialog } from '../../lib/confirm.js';
  import { eventPhase, eventStart, formatEventDate, formatEventTime, eventPlace } from '../../lib/events.js';
  import Plus from 'lucide-svelte/icons/plus';
  import Pencil from 'lucide-svelte/icons/pencil';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Copy from 'lucide-svelte/icons/copy';
  import ArrowLeft from 'lucide-svelte/icons/arrow-left';
  import LoaderCircle from 'lucide-svelte/icons/loader-circle';
  import CalendarDays from 'lucide-svelte/icons/calendar-days';

  let { events = [], onUpdate = () => {}, onLocalUpdate = null } = $props();
  const syncLocal = (list) => (onLocalUpdate || onUpdate)(list);

  let editing = $state(null);
  let isNew = $state(false);
  let saving = $state(false);
  let deletingId = $state(null);
  let snapshot = $state('');
  let view = $state('upcoming');
  let dirty = $derived(editing ? JSON.stringify(editing) !== snapshot : false);

  const KINDS = [{ value: 'event', label: 'Event' }, { value: 'popup', label: 'Pop-up' }];

  const today = () => new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10); // today in SA time
  const empty = () => ({
    id: '', kind: 'event', title: '', date: today(), startTime: '18:00', endDate: '', endTime: '',
    venue: '', address: '', city: '', price: '', description: '', image: '', link: '', linkLabel: 'RSVP', published: true,
  });

  let upcoming = $derived(events.filter(e => eventPhase(e) !== 'past').sort((a, b) => eventStart(a) - eventStart(b)));
  let past = $derived(events.filter(e => eventPhase(e) === 'past').sort((a, b) => eventStart(b) - eventStart(a)));
  let tabs = $derived([{ value: 'upcoming', label: 'Upcoming', count: upcoming.length }, { value: 'past', label: 'Past', count: past.length }]);
  let list = $derived(view === 'past' ? past : upcoming);

  function statusOf(e) {
    if (e.published === false) return { label: 'Draft', variant: 'secondary' };
    const p = eventPhase(e);
    return p === 'live' ? { label: 'Happening now', variant: 'success' } : p === 'past' ? { label: 'Past', variant: 'outline' } : { label: 'Upcoming', variant: 'info' };
  }

  function startEditing(ev, mode = 'edit') {
    if (!ev) editing = empty();
    else if (mode === 'duplicate') editing = { ...ev, id: '', title: `${ev.title} (copy)`, published: false };
    else editing = { ...ev };
    isNew = !ev || mode === 'duplicate';
    snapshot = JSON.stringify(editing);
  }
  function closeEditor() { editing = null; isNew = false; }

  async function requestClose() {
    if (dirty && !(await confirmDialog.ask({ title: 'Discard changes?', description: 'You have unsaved changes to this event.', confirmLabel: 'Discard', destructive: true }))) return;
    closeEditor();
  }

  function validate(e) {
    if (!e.title.trim()) return 'Give the event a title.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || '')) return 'Choose a start date.';
    if (e.endDate && e.endDate < e.date) return 'The end date can’t be before the start date.';
    if ((!e.endDate || e.endDate === e.date) && e.startTime && e.endTime && e.endTime <= e.startTime) return 'The end time must be after the start time.';
    if (e.link && !/^https?:\/\//i.test(e.link)) return 'The link must start with https:// (or http://).';
    return '';
  }

  async function handleSave() {
    if (saving) return;
    const problem = validate(editing);
    if (problem) return toast.error(problem);
    saving = true;
    try {
      const ev = { ...editing, title: editing.title.trim(), endDate: editing.endDate === editing.date ? '' : editing.endDate };
      if (isNew) await onUpdate([...events, { ...ev, id: `ev-${Date.now()}` }]);
      else await onUpdate(events.map(x => x.id === ev.id ? ev : x));
      closeEditor();
    } catch {
      // Admin.svelte toasts the failure; keep the editor open.
    } finally {
      saving = false;
    }
  }

  async function handleDelete(ev) {
    const ok = await confirmDialog.ask({
      title: `Delete “${ev.title}”?`,
      description: 'The event and its image are permanently removed from the site.',
      confirmLabel: 'Delete event', destructive: true,
    });
    if (!ok) return;
    deletingId = ev.id;
    try {
      const res = await fetch('/api/events/' + ev.id, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to delete the event.');
      syncLocal(events.filter(e => e.id !== ev.id));
      toast.success('Event deleted');
    } catch (err) {
      toast.error(err.message);
    } finally {
      deletingId = null;
    }
  }
</script>

{#if !editing}
  <div class="space-y-6">
    <div class="flex items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Events &amp; pop-ups</h1>
        <p class="text-sm text-muted-foreground">Shown on the Community page. Past events drop off the site automatically.</p>
      </div>
      <Button onclick={() => startEditing(null)}><Plus size={16} /> New event</Button>
    </div>

    <Tabs items={tabs} bind:value={view} label="Event list" />

    <Card class="overflow-hidden">
      {#if list.length === 0}
        <div class="flex flex-col items-center gap-2 py-16 text-center">
          <CalendarDays size={28} class="text-muted-foreground" />
          <p class="font-medium">{view === 'past' ? 'No past events' : 'Nothing scheduled'}</p>
          <p class="text-sm text-muted-foreground">{view === 'past' ? 'Events appear here once they’ve finished.' : 'Add an event or pop-up and it appears on the Community page.'}</p>
        </div>
      {:else}
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="border-b border-border">
              <tr>
                <th class={thCls}>Event</th>
                <th class="{thCls} hidden md:table-cell">When</th>
                <th class="{thCls} hidden lg:table-cell">Where</th>
                <th class={thCls}>Status</th>
                <th class="{thCls} w-32 text-right"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {#each list as ev (ev.id)}
                {@const st = statusOf(ev)}
                <tr class="border-b border-border/60 last:border-0 hover:bg-muted/50">
                  <td class={tdCls}>
                    <button type="button" class="text-left" onclick={() => startEditing(ev)}>
                      <span class="block font-medium hover:underline">{ev.title}</span>
                      <span class="text-xs text-muted-foreground">{ev.kind === 'popup' ? 'Pop-up' : 'Event'}{ev.price ? ` · ${ev.price}` : ''}</span>
                    </button>
                  </td>
                  <td class="{tdCls} hidden text-muted-foreground md:table-cell">{formatEventDate(ev)}<span class="block text-xs">{formatEventTime(ev)}</span></td>
                  <td class="{tdCls} hidden text-muted-foreground lg:table-cell">{eventPlace(ev) || '—'}</td>
                  <td class={tdCls}><Badge variant={st.variant}>{st.label}</Badge></td>
                  <td class="{tdCls} text-right">
                    <div class="flex items-center justify-end gap-0.5">
                      <Button variant="ghost" size="icon" aria-label="Edit {ev.title}" onclick={() => startEditing(ev)}><Pencil size={15} /></Button>
                      <Button variant="ghost" size="icon" aria-label="Duplicate {ev.title}" onclick={() => startEditing(ev, 'duplicate')}><Copy size={15} /></Button>
                      <Button variant="ghost" size="icon" aria-label="Delete {ev.title}" class="hover:text-destructive" disabled={deletingId === ev.id} onclick={() => handleDelete(ev)}>
                        {#if deletingId === ev.id}<LoaderCircle size={15} class="animate-spin" />{:else}<Trash2 size={15} />{/if}
                      </Button>
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </Card>
  </div>
{:else}
  <div class="space-y-6 pb-24">
    <div>
      <button type="button" onclick={requestClose} class="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft size={14} /> Events &amp; pop-ups</button>
      <h1 class="text-2xl font-semibold tracking-tight">{isNew ? 'New event' : editing.title || 'Edit event'}</h1>
    </div>

    <div class="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
      <div class="space-y-6 lg:col-span-2">
        <Card title="Details">
          <div class="space-y-5 p-6 pt-4">
            <div>
              <p class={labelCls}>Type</p>
              <Tabs items={KINDS} bind:value={editing.kind} label="Event type" />
            </div>
            <div>
              <label for="ev-title" class={labelCls}>Title</label>
              <input id="ev-title" bind:value={editing.title} class={inputCls} placeholder="e.g. Others. Pop-up at Mabu Mabu" />
            </div>
            <div>
              <label for="ev-desc" class={labelCls}>Description</label>
              <textarea id="ev-desc" bind:value={editing.description} rows={4} class={textareaCls} placeholder="What's happening, who's invited, what to expect…"></textarea>
            </div>
          </div>
        </Card>

        <Card title="When" description="South African time. Leave the start time blank for an all-day event.">
          <div class="grid grid-cols-2 gap-4 p-6 pt-4">
            <div><label for="ev-date" class={labelCls}>Start date</label><input id="ev-date" type="date" bind:value={editing.date} class={inputCls} /></div>
            <div><label for="ev-start" class={labelCls}>Start time</label><input id="ev-start" type="time" bind:value={editing.startTime} class={inputCls} /></div>
            <div><label for="ev-end-date" class={labelCls}>End date <span class="font-normal text-muted-foreground">(multi-day)</span></label><input id="ev-end-date" type="date" min={editing.date} bind:value={editing.endDate} class={inputCls} /></div>
            <div><label for="ev-end" class={labelCls}>End time <span class="font-normal text-muted-foreground">(optional)</span></label><input id="ev-end" type="time" bind:value={editing.endTime} class={inputCls} /></div>
          </div>
        </Card>

        <Card title="Where">
          <div class="space-y-4 p-6 pt-4">
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><label for="ev-venue" class={labelCls}>Venue</label><input id="ev-venue" bind:value={editing.venue} class={inputCls} placeholder="e.g. Mabu Mabu" /></div>
              <div><label for="ev-city" class={labelCls}>City</label><input id="ev-city" bind:value={editing.city} class={inputCls} placeholder="e.g. Johannesburg" /></div>
            </div>
            <div><label for="ev-address" class={labelCls}>Street address <span class="font-normal text-muted-foreground">(optional)</span></label><input id="ev-address" bind:value={editing.address} class={inputCls} /></div>
          </div>
        </Card>

        <Card title="Tickets & links">
          <div class="space-y-4 p-6 pt-4">
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr]">
              <div><label for="ev-price" class={labelCls}>Price</label><input id="ev-price" bind:value={editing.price} class={inputCls} placeholder="Free, R150…" /></div>
              <div><label for="ev-link-label" class={labelCls}>Button text</label><input id="ev-link-label" bind:value={editing.linkLabel} class={inputCls} placeholder="RSVP" /></div>
            </div>
            <div>
              <label for="ev-link" class={labelCls}>Link</label>
              <input id="ev-link" type="url" bind:value={editing.link} class={inputCls} placeholder="https://…" />
              <p class={hintCls}>RSVP, tickets or more info. Leave blank to show only “Add to calendar”.</p>
            </div>
          </div>
        </Card>
      </div>

      <div class="space-y-6">
        <Card title="Publishing">
          <div class="space-y-4 p-6 pt-4">
            <div class="flex items-center justify-between gap-4">
              <div class="text-sm"><p class="font-medium">Published</p><p class="text-muted-foreground">Visible on the Community page</p></div>
              <Switch bind:checked={editing.published} aria-label="Published" />
            </div>
            <p class="text-xs text-muted-foreground">Events disappear from the site automatically once they’ve ended.</p>
          </div>
        </Card>
        <Card title="Image">
          <div class="p-6 pt-4"><ImageUpload label="" value={editing.image} onChange={(url) => (editing = { ...editing, image: url })} /></div>
        </Card>
      </div>
    </div>

    <div class="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/90 backdrop-blur-sm md:left-60">
      <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-8">
        <p class="text-sm {dirty ? 'text-foreground' : 'text-muted-foreground'}">{dirty ? 'You have unsaved changes' : 'No changes yet'}</p>
        <div class="flex gap-2">
          <Button variant="outline" disabled={saving} onclick={requestClose}>Cancel</Button>
          <Button disabled={saving} onclick={handleSave}>{#if saving}<LoaderCircle size={15} class="animate-spin" /> Saving…{:else}Save event{/if}</Button>
        </div>
      </div>
    </div>
  </div>
{/if}
