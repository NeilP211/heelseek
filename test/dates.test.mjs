import { test } from 'node:test';
import assert from 'node:assert/strict';

import { monthNumber, parseDateList, parseClock, parseClockList, combine } from '../scripts/lib/dates.mjs';

const EN = String.fromCharCode(0x2013);

test('maps month names and abbreviations, with or without a period', () => {
  assert.equal(monthNumber('October'), 10);
  assert.equal(monthNumber('Oct'), 10);
  assert.equal(monthNumber('Oct.'), 10);
  assert.equal(monthNumber('Sept'), 9);
  assert.equal(monthNumber('Sep'), 9);
  assert.equal(monthNumber('nonsense'), null);
});

test('parses a single date', () => {
  assert.deepEqual(parseDateList('October 13, 2026'), [{ year: 2026, month: 10, day: 13 }]);
});

test('expands an ampersand pair into both days', () => {
  assert.deepEqual(parseDateList('December 5 & 6, 2026'), [
    { year: 2026, month: 12, day: 5 },
    { year: 2026, month: 12, day: 6 },
  ]);
});

test('expands a hyphen range inclusively', () => {
  assert.deepEqual(parseDateList('February 19-21, 2027'), [
    { year: 2027, month: 2, day: 19 },
    { year: 2027, month: 2, day: 20 },
    { year: 2027, month: 2, day: 21 },
  ]);
});

test('handles an en dash range, which is what the site actually ships', () => {
  assert.deepEqual(parseDateList(`February 19${EN}20, 2027`), [
    { year: 2027, month: 2, day: 19 },
    { year: 2027, month: 2, day: 20 },
  ]);
});

test('handles an HTML-escaped ampersand', () => {
  assert.equal(parseDateList('December 5 &amp; 6, 2026').length, 2);
});

test('returns an empty list for unparseable text instead of guessing', () => {
  assert.deepEqual(parseDateList('Coming soon'), []);
  assert.deepEqual(parseDateList(''), []);
});

test('rejects a backwards range outright rather than guessing a date', () => {
  // Dropping the event is safer than publishing it on the wrong day.
  assert.deepEqual(parseDateList('March 20-2, 2027'), []);
  assert.deepEqual(parseDateList('March 1-99, 2027'), []);
});

test('parses clock times in both site and feed styles', () => {
  assert.deepEqual(parseClock('7 PM'), { hour: 19, minute: 0 });
  assert.deepEqual(parseClock('6:30 PM'), { hour: 18, minute: 30 });
  assert.deepEqual(parseClock('8 a.m.'), { hour: 8, minute: 0 });
  assert.deepEqual(parseClock('12 AM'), { hour: 0, minute: 0 });
  assert.deepEqual(parseClock('12 PM'), { hour: 12, minute: 0 });
  assert.equal(parseClock('doors open early'), null);
});

test('parseClockList returns every time in order', () => {
  assert.deepEqual(parseClockList('6:30 PM, 1 PM'), [
    { hour: 18, minute: 30 },
    { hour: 13, minute: 0 },
  ]);
});

test('combine pairs times to dates when the counts match', () => {
  const dates = [{ year: 2026, month: 12, day: 5 }, { year: 2026, month: 12, day: 6 }];
  const times = [{ hour: 19, minute: 0 }, { hour: 14, minute: 0 }];
  const [a, b] = combine(dates, times);
  assert.equal(a, '2026-12-06T00:00:00.000Z'); // 7pm EST
  assert.equal(b, '2026-12-06T19:00:00.000Z'); // 2pm EST
});

test('combine reuses the first time when the counts disagree', () => {
  const dates = [{ year: 2027, month: 2, day: 19 }, { year: 2027, month: 2, day: 20 }];
  const out = combine(dates, [{ hour: 20, minute: 0 }]);
  assert.equal(out.length, 2);
  assert.ok(out.every((iso) => iso.endsWith('T01:00:00.000Z'))); // 8pm EST next day UTC
});

test('combine falls back to an evening default when no time is given', () => {
  const out = combine([{ year: 2026, month: 10, day: 13 }], []);
  assert.equal(out.length, 1);
  assert.match(out[0], /^2026-10-1[34]T/);
});
