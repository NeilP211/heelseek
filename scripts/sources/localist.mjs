// calendar.unc.edu is a Localist install with an open JSON API.
// This is the umbrella calendar: departments opt in, so coverage is thin and
// academic-heavy, but it is the only feed carrying most lectures and seminars.

import { getJson, sleep } from '../lib/fetch.mjs';
import { makeEvent } from '../lib/normalize.mjs';

const BASE = 'https://calendar.unc.edu/api/2/events';
const PER_PAGE = 100;
const MAX_PAGES = 12;
const MAX_INSTANCES_PER_EVENT = 40;

export const meta = { key: 'localist', label: 'UNC Main Calendar', home: 'https://calendar.unc.edu' };

function labelsFrom(event) {
  const out = [];
  const filters = event.filters || {};
  for (const group of Object.values(filters)) {
    if (!Array.isArray(group)) continue;
    for (const f of group) if (f?.name) out.push(f.name);
  }
  for (const d of event.departments || []) if (d?.name) out.push(d.name);
  for (const t of event.tags || []) if (typeof t === 'string') out.push(t);
  return out;
}

export async function fetchEvents({ days = 365 } = {}) {
  const seen = new Set();
  const raw = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${BASE}?days=${days}&pp=${PER_PAGE}&page=${page}`;
    const data = await getJson(url);
    const items = data.events || [];
    for (const wrapper of items) {
      const e = wrapper.event;
      if (!e || e.status === 'canceled') continue;
      raw.push(e);
    }
    const total = data.page?.total ?? 1;
    if (page >= total || items.length === 0) break;
    await sleep(250);
  }

  const events = [];
  for (const e of raw) {
    const labels = labelsFrom(e);
    const instances = (e.event_instances || []).map((i) => i.event_instance).filter(Boolean);
    const pool = instances.length ? instances.slice(0, MAX_INSTANCES_PER_EVENT) : [null];

    for (const inst of pool) {
      const start = inst?.start || e.first_date;
      if (!start) continue;
      const key = `${e.id}:${start}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const geo = e.geo || {};
      const ev = makeEvent({
        source: meta.key,
        sourceLabel: meta.label,
        sourceId: inst?.id ? `${e.id}-${inst.id}` : String(e.id),
        title: e.title,
        description: e.description_text || e.description,
        start,
        end: inst?.end || null,
        allDay: Boolean(inst?.all_day),
        venue: e.location_name || e.location,
        address: [geo.street, geo.city, geo.state].filter(Boolean).join(', '),
        org: (e.departments || [])[0]?.name || null,
        url: e.localist_url || e.url,
        image: e.photo_url || null,
        categories: labels,
        explicitFree: e.free === true,
        ticketCost: e.ticket_cost,
        rsvps: inst?.num_attending,
        lat: geo.latitude ? Number(geo.latitude) : null,
        lon: geo.longitude ? Number(geo.longitude) : null,
      });
      if (ev) events.push(ev);
    }
  }
  return events;
}
