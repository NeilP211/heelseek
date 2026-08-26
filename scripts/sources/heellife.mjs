// heellife.unc.edu is UNC's Campus Labs Engage instance and the only place
// registered student orgs post. This is the club layer that calendar.unc.edu
// is missing entirely, and it is the largest single feed by a wide margin.

import { getJson, sleep } from '../lib/fetch.mjs';
import { makeEvent } from '../lib/normalize.mjs';

const BASE = 'https://heellife.unc.edu/api/discovery/event/search';
const PAGE_SIZE = 250;
const MAX_PAGES = 20;
const IMAGE_CDN = 'https://se-images.campuslabs.com/clink/images/';

export const meta = { key: 'heellife', label: 'Heel Life (clubs)', home: 'https://heellife.unc.edu/events' };

function buildUrl(since, skip) {
  const params = new URLSearchParams({
    endsAfter: since,
    orderByField: 'endsOn',
    orderByDirection: 'ascending',
    status: 'Approved',
    take: String(PAGE_SIZE),
    skip: String(skip),
  });
  return `${BASE}?${params}`;
}

export async function fetchEvents({ since = new Date().toISOString() } = {}) {
  const events = [];
  let skip = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await getJson(buildUrl(since, skip));
    const items = data.value || [];
    if (items.length === 0) break;

    for (const it of items) {
      // Private and invite-only events are visible in the index but useless here.
      if (it.visibility && it.visibility !== 'Public') continue;

      const ev = makeEvent({
        source: meta.key,
        sourceLabel: meta.label,
        sourceId: String(it.id),
        title: it.name,
        description: it.description,
        start: it.startsOn,
        end: it.endsOn,
        venue: it.location,
        org: it.organizationName,
        url: `https://heellife.unc.edu/event/${it.id}`,
        image: it.imagePath ? IMAGE_CDN + it.imagePath : null,
        categories: [...(it.categoryNames || []), it.theme].filter(Boolean),
        themeHint: it.theme,
        benefits: it.benefitNames || [],
        rsvps: it.rsvpTotal,
        lat: it.latitude ? Number(it.latitude) : null,
        lon: it.longitude ? Number(it.longitude) : null,
      });
      if (ev) events.push(ev);
    }

    const total = data['@odata.count'] ?? items.length;
    skip += items.length;
    if (skip >= total) break;
    await sleep(250);
  }
  return events;
}
