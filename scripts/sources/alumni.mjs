// Carolina Alumni (the GAA) runs the Events Manager plugin on its own
// WordPress install, entirely separate from calendar.unc.edu. This is the feed
// that carries things like Welcome Wednesdays, which never reach the main
// university calendar at all.
//
// The host sits behind a WAF that answers datacenter IPs with 403, so the
// iCal route works from a laptop and fails from CI. We therefore try routes in
// order and use the first that actually returns events. RSS is the more
// forgiving route and, for this plugin, is in one way better: it emits every
// recurrence as its own item with a correct UTC instant, where the iCal feed
// folds a weekly series into a single entry.

import { getText } from '../lib/fetch.mjs';
import { parseIcs, assertIcs } from '../lib/ics.mjs';
import { parseRss, assertRss } from '../lib/rss.mjs';
import { makeEvent } from '../lib/normalize.mjs';
import { clean } from '../lib/text.mjs';

const ICS_FEED = 'https://alumni.unc.edu/?ical=1';
const RSS_FEED = 'https://alumni.unc.edu/events/feed/';

// Last resort only. The WAF blocks GitHub Actions IP ranges specifically, not
// datacenters in general, so a plain public relay is enough to reach a feed
// that is already world-readable from any normal browser. Nothing private,
// authenticated or user-specific ever goes through here, and this route is
// only attempted after both direct routes have failed.
const PROXY = (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;

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
 * The iCal description repeats the human date header as its first line
 * ("Wednesday, Aug. 26 | 8 a.m."). Drop it, since we already have real dates.
 */
export function stripDateHeader(description = '') {
  return description
    .replace(/^[A-Z][a-z]+day,\s+[A-Z][a-z]*\.?\s+\d{1,2}[^\n]*\n?/, '')
    .trim();
}

/**
 * RSS descriptions look like:
 *   "08/26/2026 - 8:00 am - 9:00 am <br/>George Watts Hill Alumni Center <br/>106 Stadium Drive"
 *   "08/20/2026 - 09/01/2026 - All Day <br/> <br/>"
 * Everything after the leading date clause is venue and address lines.
 */
export function parseRssDescription(description = '') {
  const parts = description.split(/<br\s*\/?>/i).map((p) => clean(p));
  const head = parts.shift() ?? '';
  const lines = parts.filter(Boolean);
  return {
    allDay: /all day/i.test(head),
    venue: lines[0] ?? null,
    address: lines.slice(1).join(', ') || null,
  };
}

async function fromIcs() {
  const raw = assertIcs(await getText(ICS_FEED), ICS_FEED);
  const events = [];

  for (const v of parseIcs(raw)) {
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
      categories: (v.CATEGORIES || '').split(',').map((c) => c.trim()).filter(Boolean),
      lat,
      lon,
    });
    if (ev) events.push(ev);
  }
  return events;
}

async function fromRss(url = RSS_FEED) {
  const raw = assertRss(await getText(url), url);
  const events = [];

  for (const item of parseRss(raw)) {
    // pubDate carries the event start as a real instant with an offset, so it
    // already accounts for whether the date falls in EST or EDT.
    if (!item.pubDate) continue;
    const { allDay, venue, address } = parseRssDescription(item.description);

    const ev = makeEvent({
      source: meta.key,
      sourceLabel: meta.label,
      sourceId: (item.guid || item.link || item.title).replace(/[^\w-]/g, '').slice(0, 60),
      title: item.title,
      description: '',
      start: item.pubDate,
      allDay,
      venue,
      address,
      org: meta.label,
      url: item.link || meta.home,
    });
    if (ev) events.push(ev);
  }
  return events;
}

export async function fetchEvents() {
  const routes = [
    ['ical', () => fromIcs()],
    ['rss', () => fromRss()],
    ['rss via relay', () => fromRss(PROXY(RSS_FEED))],
  ];
  const problems = [];

  for (const [name, run] of routes) {
    try {
      const events = await run();
      if (events.length > 0) {
        if (problems.length) console.log(`       alumni: fell back to ${name}`);
        return events;
      }
      problems.push(`${name} returned no events`);
    } catch (err) {
      problems.push(`${name}: ${err.message}`);
    }
  }
  throw new Error(`all alumni routes failed (${problems.join('; ')})`);
}
