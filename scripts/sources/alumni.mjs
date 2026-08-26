// Carolina Alumni (the GAA) runs the Events Manager plugin on its own
// WordPress install, entirely separate from calendar.unc.edu. Its listing page
// is messy HTML, but the plugin quietly publishes a clean iCal feed at ?ical=1.
// This is the feed that carries things like Welcome Wednesdays.

import { getText } from '../lib/fetch.mjs';
import { parseIcs } from '../lib/ics.mjs';
import { makeEvent } from '../lib/normalize.mjs';

const FEED = 'https://alumni.unc.edu/?ical=1';

export const meta = {
  key: 'alumni',
  label: 'Carolina Alumni',
  home: 'https://alumni.unc.edu/things-to-do/events-activities/event-calendar/',
};

/** GEO lines are "lat;lon". */
export function parseGeo(value = '') {
  const [lat, lon] = value.split(';').map((n) => Number(n));
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : { lat: null, lon: null };
}

/**
 * The description repeats the human date header as its first line
 * ("Wednesday, Aug. 26 | 8 a.m."). Drop it, since we already have real dates.
 */
export function stripDateHeader(description = '') {
  return description
    .replace(/^[A-Z][a-z]+day,\s+[A-Z][a-z]*\.?\s+\d{1,2}[^\n]*\n?/, '')
    .trim();
}

export async function fetchEvents() {
  const raw = await getText(FEED);
  const vevents = parseIcs(raw);
  const events = [];

  for (const v of vevents) {
    if (!v.DTSTART?.iso) continue;
    const { lat, lon } = parseGeo(v.GEO || '');
    const locParts = (v.LOCATION || '').split(',').map((s) => s.trim());

    const ev = makeEvent({
      source: meta.key,
      sourceLabel: meta.label,
      sourceId: (v.UID || v.SUMMARY || '').replace(/[^\w-]/g, '').slice(0, 60),
      title: v.SUMMARY,
      description: stripDateHeader(v.DESCRIPTION || ''),
      start: v.DTSTART.iso,
      end: v.DTEND?.iso || null,
      allDay: v.DTSTART.allDay,
      venue: locParts[0] || null,
      address: locParts.slice(1, 4).join(', '),
      org: meta.label,
      url: v.URL || meta.home,
      image: v.ATTACH || null,
      categories: (v.CATEGORIES || '').split(',').map((c) => c.trim()).filter(Boolean),
      lat,
      lon,
    });
    if (ev) events.push(ev);
  }
  return events;
}
