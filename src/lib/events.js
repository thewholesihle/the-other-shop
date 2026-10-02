// Helpers for events & pop-ups. Dates/times are stored as the store's wall-clock strings
// ("2026-10-18", "18:00") in South African time (UTC+2, no daylight saving).
const TZ_OFFSET = '+02:00';

/** First moment of the event as a Date (all-day events start at 00:00). */
export function eventStart(ev) {
  return new Date(`${ev.date}T${ev.startTime || '00:00'}:00${TZ_OFFSET}`);
}

/** Last moment of the event: the end date/time if given, else end of the (first) day. */
export function eventEnd(ev) {
  const endDate = ev.endDate || ev.date;
  if (ev.endTime) return new Date(`${endDate}T${ev.endTime}:00${TZ_OFFSET}`);
  if (ev.endDate || !ev.startTime) return new Date(`${endDate}T23:59:59${TZ_OFFSET}`);
  // single-day, has a start time but no end time: assume it runs about 3 hours
  return new Date(eventStart(ev).getTime() + 3 * 3600 * 1000);
}

export const isPast = (ev, now = new Date()) => eventEnd(ev) < now;
export const isLive = (ev, now = new Date()) => eventStart(ev) <= now && eventEnd(ev) >= now;

/** 'live' | 'upcoming' | 'past' */
export function eventPhase(ev, now = new Date()) {
  if (isPast(ev, now)) return 'past';
  return isLive(ev, now) ? 'live' : 'upcoming';
}

const noonSA = (d) => new Date(`${d}T12:00:00${TZ_OFFSET}`); // noon: stays on the same calendar day in any timezone

// Built from Intl parts so the shape is always "Sat 18 October" (en-ZA would pad the day: "Sat, 07 October").
const fmt = (d, opts) => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Johannesburg', ...opts }).formatToParts(noonSA(d));
  const get = (t) => (parts.find(p => p.type === t)?.value || '').replace('.', '');
  return [get('weekday'), get('day'), get('month')].filter(Boolean).join(' ');
};

/** "Sat 18 October" or "12–14 October" / "30 Oct – 2 Nov". */
export function formatEventDate(ev, { weekday = true } = {}) {
  if (!ev.endDate || ev.endDate === ev.date) return fmt(ev.date, weekday ? { weekday: 'short', day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long' });
  const a = noonSA(ev.date), b = noonSA(ev.endDate);
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  return sameMonth
    ? `${fmt(ev.date, { day: 'numeric' })}\u2013${fmt(ev.endDate, { day: 'numeric', month: 'long' })}`
    : `${fmt(ev.date, { day: 'numeric', month: 'short' })} \u2013 ${fmt(ev.endDate, { day: 'numeric', month: 'short' })}`;
}

export const formatEventTime = (ev) =>
  ev.startTime ? (ev.endTime ? `${ev.startTime} \u2013 ${ev.endTime}` : ev.startTime) : 'All day';

export const dayParts = (ev) => ({ day: fmt(ev.date, { day: 'numeric' }), month: fmt(ev.date, { month: 'short' }).replace('.', '') });

export const eventPlace = (ev) => [ev.venue, ev.city].filter(Boolean).join(', ');

/** Downloads an .ics calendar file (works with Apple, Google, Outlook calendars). */
export function downloadIcs(ev, siteName = 'Others.') {
  const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (t) => String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const start = eventStart(ev), end = eventEnd(ev);
  const allDay = !ev.startTime;
  const day = (d) => ev[d].replace(/-/g, '');
  const nextDay = (iso) => { const d = noonSA(iso); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10).replace(/-/g, ''); };
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${siteName}//Events//EN`, 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${ev.id}@${location.hostname}`,
    `DTSTAMP:${stamp(new Date())}`,
    allDay ? `DTSTART;VALUE=DATE:${day('date')}` : `DTSTART:${stamp(start)}`,
    allDay ? `DTEND;VALUE=DATE:${nextDay(ev.endDate || ev.date)}` : `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(ev.title)}`,
    ev.description ? `DESCRIPTION:${esc(ev.description)}` : '',
    eventPlace(ev) || ev.address ? `LOCATION:${esc([ev.venue, ev.address, ev.city].filter(Boolean).join(', '))}` : '',
    ev.link ? `URL:${ev.link}` : '',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean);
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${ev.title.replace(/[^\w]+/g, '-').toLowerCase() || 'event'}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
