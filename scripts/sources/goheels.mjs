// goheels.com runs on SIDEARM Sports, which publishes the whole athletics
// department schedule as one public ICS feed. No API key, every sport included.

import { getText } from '../lib/fetch.mjs';
import { parseIcs, assertIcs } from '../lib/ics.mjs';
import { makeEvent } from '../lib/normalize.mjs';

const FEED = 'https://goheels.com/calendar.ashx/calendar.ics';

export const meta = { key: 'goheels', label: 'Carolina Athletics', home: 'https://goheels.com' };

/** SIDEARM prefixes finished games with a [W] or [L] result marker. */
function stripResultFlag(summary = '') {
  return summary.replace(/^\s*\[[WLT]\]\s*/i, '').trim();
}

/** "North Carolina Women's Soccer vs Fairfield" -> "Women's Soccer". */
export function extractSport(summary = '') {
  const title = stripResultFlag(summary);
  const m = /North Carolina\s+(.+?)\s+(?:vs\.?|at|@)\s+/i.exec(title);
  if (m) return m[1].trim();
  const fallback = /North Carolina\s+(.+)$/i.exec(title);
  return fallback ? fallback[1].trim() : '';
}

export async function fetchEvents() {
  const raw = assertIcs(await getText(FEED), FEED);
  const vevents = parseIcs(raw);
  const events = [];

  for (const v of vevents) {
    if (!v.DTSTART?.iso) continue;
    const title = stripResultFlag(v.SUMMARY || '');
    if (!title) continue;

    const sport = extractSport(v.SUMMARY || '');
    // LOCATION is "Chapel Hill, N.C., Dorrance Field"; the venue is the tail.
    const locParts = (v.LOCATION || '').split(',').map((s) => s.trim()).filter(Boolean);
    const venue = locParts.length > 2 ? locParts.slice(2).join(', ') : locParts.join(', ');
    const homeGame = /chapel hill/i.test(v.LOCATION || '');

    const ev = makeEvent({
      source: meta.key,
      sourceLabel: meta.label,
      sourceId: (v.UID || title).replace(/[^\w-]/g, '').slice(0, 60),
      title,
      description: v.DESCRIPTION || '',
      start: v.DTSTART.iso,
      end: v.DTEND?.iso || null,
      allDay: v.DTSTART.allDay,
      venue: venue || null,
      address: homeGame ? 'Chapel Hill, NC' : locParts.slice(0, 2).join(', '),
      org: sport ? `Carolina ${sport}` : 'Carolina Athletics',
      // The feed points at the admin host, which redirects but looks broken.
      url: (v.URL || meta.home).replace('admin.goheels.com', 'goheels.com').replace(/&amp;/g, '&'),
      categories: ['Athletics', sport, homeGame ? 'Home' : 'Away'].filter(Boolean),
      themeHint: 'Athletics',
    });
    if (ev) events.push(ev);
  }
  return events;
}
