// Shared adapter for the UNC venues running The Events Calendar on WordPress.
// Ackland and Morehead both expose the plugin's public REST route, and between
// them they carry far more programming than the handful that reaches Localist.

import { getJson, sleep } from '../lib/fetch.mjs';
import { makeEvent } from '../lib/normalize.mjs';

const PER_PAGE = 50;
const MAX_PAGES = 10;

export const SITES = [
  {
    key: 'ackland',
    label: 'Ackland Art Museum',
    home: 'https://ackland.org',
    api: 'https://events.ackland.org/wp-json/tribe/events/v1/events',
    defaultCategory: 'Arts',
  },
  {
    key: 'morehead',
    label: 'Morehead Planetarium',
    home: 'https://moreheadplanetarium.org',
    api: 'https://moreheadplanetarium.org/wp-json/tribe/events/v1/events',
    defaultCategory: 'Academic',
  },
];

function isFree(e) {
  const cost = String(e.cost ?? '').trim();
  if (!cost) return false;
  if (/^\$?0(\.00)?$/.test(cost)) return true;
  return /free/i.test(cost);
}

export async function fetchSite(site, { since = new Date() } = {}) {
  const events = [];
  const startDate = new Date(since).toISOString().slice(0, 10);

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${site.api}?per_page=${PER_PAGE}&page=${page}&start_date=${startDate}&status=publish`;
    const data = await getJson(url);
    const items = data.events || [];
    if (items.length === 0) break;

    for (const e of items) {
      if (e.hide_from_listings) continue;
      const venue = e.venue || {};
      const cats = (e.categories || []).map((c) => c.name).filter(Boolean);
      const tags = (e.tags || []).map((t) => t.name).filter(Boolean);

      const ev = makeEvent({
        source: site.key,
        sourceLabel: site.label,
        sourceId: String(e.id),
        title: e.title,
        description: e.description || e.excerpt,
        // utc_* fields are unambiguous; the local ones carry no offset.
        start: e.utc_start_date ? `${e.utc_start_date.replace(' ', 'T')}Z` : e.start_date,
        end: e.utc_end_date ? `${e.utc_end_date.replace(' ', 'T')}Z` : e.end_date,
        allDay: Boolean(e.all_day),
        venue: venue.venue || site.label,
        address: [venue.address, venue.city, venue.state].filter(Boolean).join(', '),
        org: site.label,
        url: e.url,
        image: e.image?.url || null,
        categories: cats.length || tags.length ? [...cats, ...tags] : [site.defaultCategory],
        themeHint: site.defaultCategory,
        explicitFree: isFree(e),
        ticketCost: e.cost,
      });
      if (ev) events.push(ev);
    }

    if (page >= (data.total_pages ?? 1)) break;
    await sleep(300);
  }
  return events;
}

export async function fetchEvents(opts) {
  const all = [];
  for (const site of SITES) {
    all.push(...(await fetchSite(site, opts)));
    await sleep(400);
  }
  return all;
}
