// Tiny RSS 2.0 reader, used as the fallback route into WordPress event feeds
// when the richer iCal route is blocked.

import { decodeEntities, normalizePunctuation } from './text.mjs';

function tag(item, name) {
  const cdata = new RegExp(`<${name}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${name}>`, 'i').exec(item);
  if (cdata) return cdata[1];
  const plain = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(item);
  return plain ? decodeEntities(plain[1]) : '';
}

export function assertRss(raw, url) {
  if (!/<rss[\s>]|<feed[\s>]/i.test(raw.slice(0, 2000))) {
    throw new Error(`${url} did not return an RSS feed`);
  }
  return raw;
}

/** Parse an RSS body into {title, link, guid, pubDate, description} objects. */
export function parseRss(raw) {
  const items = [];
  for (const m of raw.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)) {
    const item = m[1];
    items.push({
      title: normalizePunctuation(tag(item, 'title')).trim(),
      link: tag(item, 'link').trim(),
      guid: tag(item, 'guid').trim(),
      pubDate: tag(item, 'pubDate').trim(),
      description: tag(item, 'description'),
    });
  }
  return items;
}
