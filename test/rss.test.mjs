import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseRss, assertRss } from '../scripts/lib/rss.mjs';
import { parseRssDescription } from '../scripts/sources/alumni.mjs';

// A real item from the Carolina Alumni events feed.
const FEED = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0"><channel>
<title>UNC General Alumni Association - Events</title>
<item>
  <title>For Students: Welcome Wednesdays With Bagels and Coffee</title>
  <link>https://alumni.unc.edu/events/welcome-wednesdays-2/</link>
  <guid>https://alumni.unc.edu/events/welcome-wednesdays-2/</guid>
  <pubDate>Wed, 26 Aug 2026 12:00:00 +0000</pubDate>
  <description><![CDATA[08/26/2026 - 8:00 am - 9:00 am <br/>George Watts Hill Alumni Center <br/>106 Stadium Drive <br/>Chapel Hill]]></description>
</item>
<item>
  <title>Enchanting Ireland</title>
  <link>https://alumni.unc.edu/events/enchanting-ireland-2/</link>
  <guid>https://alumni.unc.edu/events/enchanting-ireland-2/</guid>
  <pubDate>Thu, 20 Aug 2026 04:00:00 +0000</pubDate>
  <description><![CDATA[08/20/2026 - 09/01/2026 - All Day <br/> <br/> <br/>]]></description>
</item>
</channel></rss>`;

test('assertRss accepts a feed and rejects a challenge page', () => {
  assert.equal(assertRss(FEED, 'u'), FEED);
  assert.throws(() => assertRss('<!DOCTYPE html><html>blocked', 'u'), /did not return an RSS feed/);
});

test('parses every item in the feed', () => {
  const items = parseRss(FEED);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'For Students: Welcome Wednesdays With Bagels and Coffee');
  assert.equal(items[0].link, 'https://alumni.unc.edu/events/welcome-wednesdays-2/');
});

test('pubDate is a real instant, so 8am Eastern in August is 12:00Z', () => {
  const [bagels] = parseRss(FEED);
  assert.equal(new Date(bagels.pubDate).toISOString(), '2026-08-26T12:00:00.000Z');
});

test('extracts venue and address from a timed description', () => {
  const [bagels] = parseRss(FEED);
  const parsed = parseRssDescription(bagels.description);
  assert.equal(parsed.allDay, false);
  assert.equal(parsed.venue, 'George Watts Hill Alumni Center');
  assert.equal(parsed.address, '106 Stadium Drive, Chapel Hill');
});

test('detects an all-day range and tolerates its empty venue lines', () => {
  const [, ireland] = parseRss(FEED);
  const parsed = parseRssDescription(ireland.description);
  assert.equal(parsed.allDay, true);
  assert.equal(parsed.venue, null);
  assert.equal(parsed.address, null);
});

test('an empty feed body yields no items rather than throwing', () => {
  assert.deepEqual(parseRss('<rss><channel></channel></rss>'), []);
});
