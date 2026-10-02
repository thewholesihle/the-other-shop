<script>
  import Img from './Img.svelte';
  import { cutReveal } from '../lib/cutReveal.js';
  import { eventPhase, eventStart, formatEventDate, formatEventTime, dayParts, eventPlace, downloadIcs } from '../lib/events.js';

  export let events = [];
  export let siteName = 'Others.';

  let kind = 'all'; // all | event | popup

  // Upcoming and happening-now only, soonest first. Past events drop off automatically.
  $: upcoming = (events || [])
    .filter(e => e.published !== false && eventPhase(e) !== 'past')
    .sort((a, b) => eventStart(a) - eventStart(b));
  $: hasBoth = upcoming.some(e => e.kind === 'popup') && upcoming.some(e => e.kind !== 'popup');
  $: shown = kind === 'all' ? upcoming : upcoming.filter(e => (kind === 'popup') === (e.kind === 'popup'));

  const KIND_LABEL = { event: 'Event', popup: 'Pop-up' };

  // Structured data so search engines can show upcoming events.
  $: jsonLd = upcoming.length ? JSON.stringify(upcoming.map(e => ({
    '@context': 'https://schema.org', '@type': 'Event', name: e.title,
    startDate: `${e.date}${e.startTime ? 'T' + e.startTime : ''}`,
    endDate: e.endDate || e.date ? `${e.endDate || e.date}${e.endTime ? 'T' + e.endTime : ''}` : undefined,
    location: eventPlace(e) ? { '@type': 'Place', name: e.venue || e.city, address: [e.address, e.city].filter(Boolean).join(', ') } : undefined,
    description: e.description || undefined, image: e.image || undefined,
    eventStatus: 'https://schema.org/EventScheduled',
  }))).replace(/</g, '\\u003c') : '';
</script>

<svelte:head>
  {#if jsonLd}{@html `<script type="application/ld+json">${jsonLd}</script>`}{/if}
</svelte:head>

<section class="mb-16" aria-labelledby="events-heading">
  <div class="flex flex-wrap items-end justify-between gap-4 mb-8">
    <div>
      <p class="text-label mb-2">What’s on</p>
      <h2 id="events-heading" use:cutReveal class="text-3xl md:text-4xl font-display font-bold leading-tight">Events &amp; Pop-ups</h2>
    </div>
    {#if hasBoth}
      <div class="flex gap-2" role="group" aria-label="Filter events">
        {#each [['all', 'All'], ['event', 'Events'], ['popup', 'Pop-ups']] as [value, label]}
          <button onclick={() => (kind = value)} aria-pressed={kind === value} class="px-4 py-2 text-label tracking-[0.15em] transition-colors {kind === value ? 'bg-foreground text-primary-foreground' : 'border border-border hover:border-foreground'}">{label}</button>
        {/each}
      </div>
    {/if}
  </div>

  {#if shown.length}
    <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {#each shown as ev (ev.id)}
        {@const phase = eventPhase(ev)}
        {@const parts = dayParts(ev)}
        <article class="group flex flex-col border border-border bg-card">
          <div class="relative aspect-[16/10] bg-secondary overflow-hidden">
            {#if ev.image}
              <Img src={ev.image} alt="" sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
            {:else}
              <div class="w-full h-full flex items-center justify-center text-muted-foreground font-display text-5xl font-bold tabular-nums">{parts.day}</div>
            {/if}
            <!-- Date block -->
            <div class="absolute top-0 left-0 bg-background text-foreground px-3 py-2 text-center leading-none border-r border-b border-border">
              <span class="block text-2xl font-display font-bold tabular-nums">{parts.day}</span>
              <span class="block text-[10px] tracking-[0.2em] uppercase mt-1">{parts.month}</span>
            </div>
            <span class="absolute top-3 right-3 text-[10px] tracking-[0.2em] uppercase px-3 py-1 font-medium {phase === 'live' ? 'bg-destructive text-destructive-foreground' : 'bg-foreground text-primary-foreground'}">{phase === 'live' ? 'Happening now' : KIND_LABEL[ev.kind] || 'Event'}</span>
          </div>

          <div class="flex flex-1 flex-col p-5">
            <h3 class="text-xl font-display font-bold leading-tight">{ev.title}</h3>
            <dl class="mt-3 space-y-1 text-sm text-muted-foreground">
              <div class="flex gap-2"><dt class="sr-only">When</dt><dd>{formatEventDate(ev)} · {formatEventTime(ev)}</dd></div>
              {#if eventPlace(ev)}<div class="flex gap-2"><dt class="sr-only">Where</dt><dd>{eventPlace(ev)}{#if ev.address}<span class="block text-xs">{ev.address}</span>{/if}</dd></div>{/if}
              {#if ev.price}<div class="flex gap-2"><dt class="sr-only">Price</dt><dd class="text-foreground font-medium">{ev.price}</dd></div>{/if}
            </dl>
            {#if ev.description}<p class="mt-3 text-sm text-muted-foreground leading-relaxed line-clamp-3">{ev.description}</p>{/if}

            <div class="mt-auto flex flex-wrap gap-2 pt-5">
              {#if ev.link}
                <a href={ev.link} target="_blank" rel="noopener noreferrer" class="bg-foreground text-primary-foreground px-5 py-2.5 text-label tracking-[0.2em] transition-colors">{ev.linkLabel || 'RSVP'}</a>
              {/if}
              <button type="button" onclick={() => downloadIcs(ev, siteName)} class="border border-border px-5 py-2.5 text-label tracking-[0.2em] transition-colors hover:border-foreground">ADD TO CALENDAR</button>
            </div>
          </div>
        </article>
      {/each}
    </div>
  {:else}
    <div class="border border-dashed border-border px-6 py-14 text-center">
      <p class="font-display text-xl font-bold">Nothing on the calendar right now</p>
      <p class="mt-2 text-sm text-muted-foreground">New events and pop-ups are announced here first — check back soon.</p>
    </div>
  {/if}
</section>
