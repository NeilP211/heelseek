import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  dayKey, addDays, formatTime, formatEndLabel, calendarLink, formatDayHeader,
} from '../src/lib/format.js';

test('dayKey buckets by Chapel Hill date, not the runner timezone', () => {
  // 01:00Z on Aug 26 is still 9pm on Aug 25 in Chapel Hill.
  assert.equal(dayKey('2026-08-26T01:00:00Z'), '2026-08-25');
  assert.equal(dayKey('2026-08-26T12:00:00Z'), '2026-08-26');
});

test('dayKey handles the winter offset too', () => {
  // 01:00Z on Jan 5 is 8pm Jan 4 EST.
  assert.equal(dayKey('2026-01-05T01:00:00Z'), '2026-01-04');
});

test('addDays rolls across month and year boundaries', () => {
  assert.equal(addDays('2026-08-30', 3), '2026-09-02');
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
});

test('formatTime renders Eastern wall clock and drops a zero minute', () => {
  assert.equal(formatTime('2026-08-26T12:00:00Z'), '8 am');
  assert.equal(formatTime('2026-08-25T18:30:00Z'), '2:30 pm');
  assert.equal(formatTime('2026-08-25T18:30:00Z', true), 'All day');
});

test('a same-day end shows only the time', () => {
  assert.equal(formatEndLabel('2026-08-25T16:00:00Z', '2026-08-25T18:30:00Z'), 'to 2:30 pm');
});

test('an end on another day carries its date, so a multi-day event reads correctly', () => {
  // The real bug: a 3 day symposium rendered as "to 2:30 pm".
  assert.equal(
    formatEndLabel('2026-08-25T16:00:00Z', '2026-08-28T18:30:00Z'),
    'to Aug 28, 2:30 pm',
  );
});

test('an event running past midnight shows the next date', () => {
  assert.equal(
    formatEndLabel('2026-08-28T01:30:00Z', '2026-08-28T04:30:00Z'),
    'to Aug 28, 12:30 am',
  );
});

test('no end yields no label', () => {
  assert.equal(formatEndLabel('2026-08-25T16:00:00Z', null), null);
});

test('formatDayHeader names today and tomorrow relative to Chapel Hill', () => {
  const today = dayKey(new Date().toISOString());
  assert.match(formatDayHeader(today), /^Today, /);
  assert.match(formatDayHeader(addDays(today, 1)), /^Tomorrow, /);
  assert.doesNotMatch(formatDayHeader(addDays(today, 5)), /^(Today|Tomorrow)/);
});

test('calendarLink builds a valid Google Calendar template URL', () => {
  const url = new URL(calendarLink({
    title: 'Free Bagels',
    start: '2026-08-26T12:00:00Z',
    end: '2026-08-26T13:00:00Z',
    venue: 'Alumni Center',
    address: 'Chapel Hill, NC',
    description: 'Come get bagels',
    url: 'https://example.com/e',
  }));
  assert.equal(url.searchParams.get('text'), 'Free Bagels');
  assert.equal(url.searchParams.get('dates'), '20260826T120000Z/20260826T130000Z');
  assert.equal(url.searchParams.get('location'), 'Alumni Center, Chapel Hill, NC');
});

test('calendarLink invents a one hour end when the source gave none', () => {
  const url = new URL(calendarLink({ title: 'X', start: '2026-08-26T12:00:00Z' }));
  assert.equal(url.searchParams.get('dates'), '20260826T120000Z/20260826T130000Z');
});
