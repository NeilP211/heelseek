import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeEvent, categorize, dedupe, dedupeKey, toIso, CATEGORIES } from '../scripts/lib/normalize.mjs';

const base = {
  source: 'heellife',
  sourceLabel: 'Heel Life (clubs)',
  sourceId: '1',
  title: 'Test Event',
  start: '2026-09-01T18:00:00Z',
};

test('toIso normalises anything Date can parse and rejects the rest', () => {
  assert.equal(toIso('2026-09-01T18:00:00Z'), '2026-09-01T18:00:00.000Z');
  assert.equal(toIso('2026-09-01 18:00:00'), new Date('2026-09-01 18:00:00').toISOString());
  assert.equal(toIso('garbage'), null);
  assert.equal(toIso(null), null);
});

test('an event without a usable start is dropped, not emitted broken', () => {
  assert.equal(makeEvent({ ...base, start: 'nope' }), null);
  assert.equal(makeEvent({ ...base, start: null }), null);
});

test('an event without a title is dropped', () => {
  assert.equal(makeEvent({ ...base, title: '   ' }), null);
});

test('a valid event gets a stable namespaced id', () => {
  const ev = makeEvent({ ...base, sourceId: 'abc' });
  assert.equal(ev.id, 'heellife:abc');
});

test('an end before the start is discarded rather than trusted', () => {
  const ev = makeEvent({ ...base, end: '2026-08-01T00:00:00Z' });
  assert.equal(ev.end, null);
});

test('a valid end is kept', () => {
  const ev = makeEvent({ ...base, end: '2026-09-01T20:00:00Z' });
  assert.equal(ev.end, '2026-09-01T20:00:00.000Z');
});

test('description HTML is cleaned and capped', () => {
  const ev = makeEvent({ ...base, description: `<p>${'x '.repeat(500)}</p>` });
  assert.ok(ev.description.length <= 425, `too long: ${ev.description.length}`);
  assert.ok(!ev.description.includes('<'));
});

test('every event lands in a known category', () => {
  const ev = makeEvent({ ...base, title: 'Random gathering' });
  assert.ok(CATEGORIES.includes(ev.category));
});

test('a title keyword beats the source theme, because the title is written for humans', () => {
  assert.equal(categorize(['ThoughtfulLearning'], 'Career Fair for Seniors', 'ThoughtfulLearning'), 'Career');
});

test('the source theme decides when the title says nothing useful', () => {
  assert.equal(categorize(['whatever'], 'Weekly Gathering', 'Spirituality'), 'Faith');
  assert.equal(categorize(['whatever'], 'Weekly Gathering', 'ThoughtfulLearning'), 'Academic');
  assert.equal(categorize(['whatever'], 'Weekly Gathering', 'CommunityService'), 'Service');
});

test('label soup is the last resort, not the first', () => {
  // This is the real failure that sent 212 club events to Career: orgs tag
  // everything with Career Exploration, so labels must not outrank the theme.
  const labels = ['Career Exploration & Development', 'Campus Life Experience'];
  assert.equal(categorize(labels, 'ADHD, Me, & UNC', 'ThoughtfulLearning'), 'Academic');
});

test('the word class in a label no longer forces Academic', () => {
  // "Senior Class" used to match a bare /class/ rule.
  const cat = categorize(['Students', 'Senior Class'], 'Welcome Wednesdays With Bagels and Coffee', '');
  assert.equal(cat, 'Social');
});

test('unknown input falls through to Other rather than throwing', () => {
  assert.equal(categorize([], '', ''), 'Other');
  assert.equal(categorize(['zzz'], 'qqq', 'nonsense-theme'), 'Other');
});

test('dedupeKey ignores punctuation, case and filler words', () => {
  const a = { title: 'The UNC Career Fair!', start: '2026-09-01T18:00:00.000Z' };
  const b = { title: 'unc career fair', start: '2026-09-01T18:00:00.000Z' };
  assert.equal(dedupeKey(a), dedupeKey(b));
});

test('dedupeKey keeps genuinely different times apart', () => {
  const a = { title: 'Same Show', start: '2026-09-01T18:00:00.000Z' };
  const b = { title: 'Same Show', start: '2026-09-02T18:00:00.000Z' };
  assert.notEqual(dedupeKey(a), dedupeKey(b));
});

test('dedupe prefers the venue source over the umbrella calendar', () => {
  const fromLocalist = makeEvent({ ...base, source: 'localist', sourceId: 'l1', title: 'Gallery Talk' });
  const fromAckland = makeEvent({ ...base, source: 'ackland', sourceId: 'a1', title: 'Gallery Talk' });
  const [winner] = dedupe([fromLocalist, fromAckland]);
  assert.equal(winner.source, 'ackland');
});

test('dedupe never loses a positive free-food tag from the discarded copy', () => {
  const rich = makeEvent({ ...base, source: 'ackland', sourceId: 'a1', title: 'Opening Reception' });
  const tagged = makeEvent({
    ...base, source: 'localist', sourceId: 'l1', title: 'Opening Reception',
    description: 'Free pizza will be provided.',
  });
  assert.equal(tagged.freeFood, true);
  const [winner] = dedupe([rich, tagged]);
  assert.equal(winner.source, 'ackland');
  assert.equal(winner.freeFood, true, 'the tag was dropped with the losing copy');
});

test('dedupe leaves distinct events alone', () => {
  const a = makeEvent({ ...base, sourceId: '1', title: 'Alpha' });
  const b = makeEvent({ ...base, sourceId: '2', title: 'Beta' });
  assert.equal(dedupe([a, b]).length, 2);
});
