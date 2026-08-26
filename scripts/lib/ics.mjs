// Minimal iCalendar reader. Only what the goheels SIDEARM feed actually emits:
// folded lines, escaped text, and DTSTART in UTC, floating or date-only form.

/** RFC 5545 folds long lines with CRLF followed by a space or tab. */
export function unfold(raw) {
  return raw.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}

export function unescapeValue(value = '') {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/** Turn an ICS date value into an ISO string. Returns null if unparseable. */
export function parseIcsDate(value, params = '') {
  if (!value) return null;
  const v = value.trim();

  // Date only: 20260826. Treated as local midnight in Eastern time.
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (m) {
    const [, y, mo, d] = m;
    return { iso: easternToIso(+y, +mo, +d, 0, 0), allDay: true };
  }

  m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (z) {
    const iso = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)).toISOString();
    return { iso, allDay: false };
  }
  // No Z and no TZID means floating local time; UNC feeds mean Eastern.
  const tzid = /TZID=([^;:]+)/.exec(params)?.[1];
  if (tzid && !/New_York|Eastern/i.test(tzid)) {
    const iso = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`).toISOString();
    return { iso, allDay: false };
  }
  return { iso: easternToIso(+y, +mo - 0, +d, +h, +mi, +s), allDay: false };
}

/**
 * Convert an America/New_York wall-clock time to an ISO instant.
 * Probes both candidate offsets and keeps the one that round-trips, which
 * handles EST/EDT without pulling in a timezone library.
 */
export function easternToIso(year, month, day, hour, minute, second = 0) {
  for (const offset of [4, 5]) {
    const guess = new Date(Date.UTC(year, month - 1, day, hour + offset, minute, second));
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(guess);
    const get = (t) => Number(parts.find((p) => p.type === t)?.value);
    if (
      get('year') === year && get('month') === month && get('day') === day &&
      get('hour') % 24 === hour % 24 && get('minute') === minute
    ) {
      return guess.toISOString();
    }
  }
  // Spring-forward gap: no valid wall clock, fall back to EDT.
  return new Date(Date.UTC(year, month - 1, day, hour + 4, minute, second)).toISOString();
}

/**
 * Confirm a response really is an iCalendar document before parsing it.
 *
 * This exists because a WAF in front of a calendar host will happily answer a
 * feed request with HTTP 200 and an HTML challenge page. parseIcs finds no
 * VEVENT blocks in that, returns an empty array, and the source silently
 * reports zero events as a success. Failing loudly here means the run is
 * marked degraded and the site says so, instead of quietly losing a calendar.
 */
export function assertIcs(raw, url) {
  const head = raw.slice(0, 2000);
  if (!/BEGIN:VCALENDAR/i.test(head)) {
    const looksLikeHtml = /<html|<!doctype/i.test(head);
    throw new Error(
      looksLikeHtml
        ? `${url} returned HTML instead of iCalendar (likely a bot challenge or redirect)`
        : `${url} did not return an iCalendar document`,
    );
  }
  return raw;
}

/** Parse a VCALENDAR body into an array of plain VEVENT objects. */
export function parseIcs(raw) {
  const lines = unfold(raw).split('\n');
  const events = [];
  let current = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { current = {}; continue; }
    if (line === 'END:VEVENT') { if (current) events.push(current); current = null; continue; }
    if (!current) continue;

    const sep = line.indexOf(':');
    if (sep === -1) continue;
    const left = line.slice(0, sep);
    const value = line.slice(sep + 1);
    const semi = left.indexOf(';');
    const key = (semi === -1 ? left : left.slice(0, semi)).toUpperCase();
    const params = semi === -1 ? '' : left.slice(semi + 1);

    if (key === 'DTSTART' || key === 'DTEND') {
      current[key] = parseIcsDate(value, params);
    } else {
      current[key] = unescapeValue(value);
    }
  }
  return events;
}
