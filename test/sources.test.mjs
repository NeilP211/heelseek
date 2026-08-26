import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractSport } from '../scripts/sources/goheels.mjs';
import { parseGeo, stripDateHeader } from '../scripts/sources/alumni.mjs';
import { splitCards, parseCard } from '../scripts/sources/cpa.mjs';

test('extracts the sport from a SIDEARM summary line', () => {
  assert.equal(extractSport("[W] North Carolina Women's Soccer vs Fairfield"), "Women's Soccer");
  assert.equal(extractSport('North Carolina Field Hockey at Duke'), 'Field Hockey');
  assert.equal(extractSport('[L] North Carolina Baseball vs NC State'), 'Baseball');
});

test('sport extraction survives a summary with no opponent clause', () => {
  assert.equal(extractSport('North Carolina Football'), 'Football');
  assert.equal(extractSport('Something unrelated'), '');
});

test('parses an ICS GEO pair', () => {
  assert.deepEqual(parseGeo('35.9073125;-79.04496670000003'), {
    lat: 35.9073125,
    lon: -79.04496670000003,
  });
});

test('a malformed GEO yields nulls instead of NaN', () => {
  assert.deepEqual(parseGeo(''), { lat: null, lon: null });
  assert.deepEqual(parseGeo('abc;def'), { lat: null, lon: null });
});

test('strips the duplicated human date header from an alumni description', () => {
  const raw = 'Wednesday, Aug. 26 | 8 a.m.\nGeorge Watts Hill Alumni Center\n\nStop by for bagels.';
  const out = stripDateHeader(raw);
  assert.ok(!out.startsWith('Wednesday'), out);
  assert.match(out, /^George Watts Hill/);
});

test('a description with no date header is left alone', () => {
  const raw = 'Just a normal description.';
  assert.equal(stripDateHeader(raw), raw);
});

// One real card, copied from the CPA season listing. Note the trailing space
// inside the artist-name class attribute: that exact quirk silently dropped
// 14 of 21 shows until the class regexes were made tolerant.
const CPA_CARD = `<div class="card-event js-visible" data-type="cpa-season">
  <div class="card-event__image">
    <a href="https://carolinaperformingarts.org/events/alexi-kenney-janice-carissa/">
      <img width="1024" src="https://carolinaperformingarts.org/img/kenney.jpg" />
    </a>
  </div>
  <div class="card-event__content">
    <span class="card-event__content--type"> CPA Season </span>
    <h2 class="card-event__content--artist-name ">Alexi Kenney, violin | Janice Carissa, piano</h2>
    <div class="card-event__content--details-wrap">
      <div class="location"> Moeser Auditorium </div>
      <div class="date">October 22, 2026</div>
      <div class="time">7 PM</div>
    </div>
  </div>
</div>`;

test('splits the listing into one block per card', () => {
  const html = `<div class="wrap">${CPA_CARD}${CPA_CARD}</div>`;
  assert.equal(splitCards(html).length, 2);
});

test('parses a card whose class attribute has a trailing space', () => {
  const [card] = splitCards(CPA_CARD);
  const parsed = parseCard(card);
  assert.ok(parsed, 'card failed to parse');
  assert.equal(parsed.dateText, 'October 22, 2026');
  assert.equal(parsed.timeText, '7 PM');
  assert.equal(parsed.location, 'Moeser Auditorium');
  assert.equal(parsed.type, 'CPA Season');
  assert.match(parsed.title, /Alexi Kenney/);
  assert.equal(parsed.url, 'https://carolinaperformingarts.org/events/alexi-kenney-janice-carissa/');
});

test('a card with no date is skipped rather than dated to now', () => {
  const noDate = CPA_CARD.replace('<div class="date">October 22, 2026</div>', '');
  const [card] = splitCards(noDate);
  assert.equal(parseCard(card), null);
});

test('a card with an artist but no separate work title still parses', () => {
  const single = CPA_CARD.replace(/<h2 class="card-event__content--artist-name ">.*?<\/h2>/, '<h2 class="card-event__content--artist-name">Josh Johnson</h2>');
  const [card] = splitCards(single);
  assert.equal(parseCard(card).title, 'Josh Johnson');
});
