// Everything on this site is Chapel Hill local time, regardless of where the
// browser is. Pinning the zone keeps a game at 7pm Eastern from reading 4pm
// for someone checking from California.
const TZ = 'America/New_York';

const fmt = (opts) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, ...opts });

const timeFmt = fmt({ hour: 'numeric', minute: '2-digit' });
const dayHeaderFmt = fmt({ weekday: 'long', month: 'long', day: 'numeric' });
const shortDayFmt = fmt({ weekday: 'short', month: 'short', day: 'numeric' });
const keyFmt = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' });

/** YYYY-MM-DD in Chapel Hill time, used for grouping and day filters. */
export function dayKey(iso) {
  const parts = keyFmt.formatToParts(new Date(iso));
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function todayKey(now = new Date()) {
  return dayKey(now.toISOString());
}

export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function formatTime(iso, allDay) {
  if (allDay) return 'All day';
  return timeFmt.format(new Date(iso)).replace(':00', '').toLowerCase();
}

/**
 * Label for an event's end. When the event finishes on a different Chapel Hill
 * day, the date has to come with it: a three day symposium rendered as
 * "to 2:30 pm" reads as a two and a half hour afternoon event.
 */
export function formatEndLabel(startIso, endIso) {
  if (!endIso) return null;
  const time = formatTime(endIso);
  if (dayKey(startIso) === dayKey(endIso)) return `to ${time}`;
  const dayLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, month: 'short', day: 'numeric',
  }).format(new Date(endIso));
  return `to ${dayLabel}, ${time}`;
}

export function formatDayHeader(key) {
  const [y, m, d] = key.split('-').map(Number);
  // Noon UTC keeps the label on the intended day in every US zone.
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const today = todayKey();
  if (key === today) return `Today, ${dayHeaderFmt.format(dt)}`;
  if (key === addDays(today, 1)) return `Tomorrow, ${dayHeaderFmt.format(dt)}`;
  return dayHeaderFmt.format(dt);
}

export function formatShortDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return shortDayFmt.format(new Date(Date.UTC(y, m - 1, d, 12)));
}

export function formatRelative(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Build a Google Calendar "add event" link for a single event. */
export function calendarLink(event) {
  const stamp = (iso) => new Date(iso).toISOString().replace(/[-:]|\.\d{3}/g, '');
  const end = event.end ?? new Date(new Date(event.start).getTime() + 3600000).toISOString();
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${stamp(event.start)}/${stamp(end)}`,
    details: `${event.description ?? ''}\n\n${event.url ?? ''}`.trim(),
    location: [event.venue, event.address].filter(Boolean).join(', '),
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}
