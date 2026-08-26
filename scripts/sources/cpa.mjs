// Carolina Performing Arts publishes no feed and no structured dates in its
// REST output, but its season listing renders one tidy card per show with the
// date and time as separate elements. Small feed, high value: these are the
// Memorial Hall shows nothing else on campus lists.

import { getText } from '../lib/fetch.mjs';
import { makeEvent } from '../lib/normalize.mjs';
import { parseDateList, parseClockList, combine } from '../lib/dates.mjs';
import { cleanLine } from '../lib/text.mjs';

const LISTING = 'https://carolinaperformingarts.org/events/';

export const meta = { key: 'cpa', label: 'Carolina Performing Arts', home: LISTING };

const pick = (html, re) => cleanLine(re.exec(html)?.[1] ?? '');

/** Split the listing into individual card-event blocks. */
export function splitCards(html) {
  return html.split(/<div class="card-event[\s"]/).slice(1);
}

export function parseCard(card) {
  const url = /<a href="(https:\/\/carolinaperformingarts\.org\/events\/[^"]+)"/.exec(card)?.[1];
  const artist = pick(card, /card-event__content--artist-name[^"]*"[^>]*>([\s\S]*?)<\//);
  const name = pick(card, /card-event__content--event-name[^"]*"[^>]*>([\s\S]*?)<\//);
  const location = pick(card, /<div class="location"[^>]*>([\s\S]*?)<\/div>/);
  const dateText = pick(card, /<div class="date"[^>]*>([\s\S]*?)<\/div>/);
  const timeText = pick(card, /<div class="time"[^>]*>([\s\S]*?)<\/div>/);
  const type = pick(card, /card-event__content--type[^"]*"[^>]*>([\s\S]*?)<\/span>/);
  const image = /<img[^>]+src="([^"]+)"/.exec(card)?.[1] ?? null;

  if (!dateText) return null;
  // Cards carry both an artist and a work title; join them when both exist.
  const title = [artist, name].filter(Boolean).join(': ') || artist || name;
  if (!title) return null;

  return { url, title, location, dateText, timeText, type, image };
}

export async function fetchEvents() {
  const html = await getText(LISTING);
  const events = [];
  const cards = splitCards(html);
  let unparsed = 0;

  // This is the one source with no feed behind it, so the scrape is the most
  // likely thing to quietly degrade. Log the shape of what came back: a run
  // that suddenly sees fewer cards is a site change, not fewer concerts.
  if (cards.length === 0) {
    throw new Error(`${LISTING} returned no event cards (markup probably changed)`);
  }

  for (const card of cards) {
    const parsed = parseCard(card);
    if (!parsed) { unparsed++; continue; }

    const dates = parseDateList(parsed.dateText);
    if (dates.length === 0) continue;
    const starts = combine(dates, parseClockList(parsed.timeText));

    starts.forEach((start, i) => {
      const slug = (parsed.url || parsed.title).split('/').filter(Boolean).pop();
      const ev = makeEvent({
        source: meta.key,
        sourceLabel: meta.label,
        sourceId: `${slug}-${start.slice(0, 10)}-${i}`,
        title: parsed.title,
        description: `${parsed.type ? `${parsed.type}. ` : ''}Carolina Performing Arts presentation${parsed.location ? ` at ${parsed.location}` : ''}.`,
        start,
        venue: parsed.location || 'Memorial Hall',
        address: 'Chapel Hill, NC',
        org: meta.label,
        url: parsed.url || meta.home,
        image: parsed.image,
        categories: ['Performing Arts', parsed.type].filter(Boolean),
        themeHint: 'Arts',
      });
      if (ev) events.push(ev);
    });
  }

  console.log(
    `       cpa: ${cards.length} cards, ${unparsed} unparsed, ${events.length} dated occurrences`,
  );
  return events;
}
