import { test } from 'node:test';
import assert from 'node:assert/strict';

import { unfold, unescapeValue, parseIcsDate, easternToIso, parseIcs, assertIcs } from '../scripts/lib/ics.mjs';

test('unfolds continuation lines that start with a space or tab', () => {
  // The fold marker itself is consumed, so a space-folded line rejoins with
  // whatever whitespace the sender left after it.
  assert.equal(unfold('SUMMARY:Long\r\n  title'), 'SUMMARY:Long title');
  assert.equal(unfold('SUMMARY:Long\r\n\ttitle'), 'SUMMARY:Longtitle');
  assert.equal(unfold('A:1\r\nB:2'), 'A:1\nB:2');
});

test('unescapes the RFC 5545 escape sequences', () => {
  assert.equal(unescapeValue('Chapel Hill\\, N.C.'), 'Chapel Hill, N.C.');
  assert.equal(unescapeValue('line one\\nline two'), 'line one\nline two');
  assert.equal(unescapeValue('a\\;b'), 'a;b');
});

test('parses a UTC timestamp exactly', () => {
  const got = parseIcsDate('20260813T230000Z');
  assert.equal(got.iso, '2026-08-13T23:00:00.000Z');
  assert.equal(got.allDay, false);
});

test('parses a date-only value as an all-day event', () => {
  const got = parseIcsDate('20260826');
  assert.equal(got.allDay, true);
  assert.match(got.iso, /^2026-08-26T04:00:00/); // midnight Eastern in August is 04:00Z
});

test('treats a New York TZID as Eastern wall-clock time', () => {
  // 8am on Aug 26 is EDT (UTC-4), so 12:00Z.
  const got = parseIcsDate('20260826T080000', 'TZID=America/New_York');
  assert.equal(got.iso, '2026-08-26T12:00:00.000Z');
});

test('handles the EST half of the year, not just EDT', () => {
  // 8am on Jan 14 is EST (UTC-5), so 13:00Z.
  const got = parseIcsDate('20260114T080000', 'TZID=America/New_York');
  assert.equal(got.iso, '2026-01-14T13:00:00.000Z');
});

test('easternToIso picks the correct offset either side of a DST change', () => {
  assert.equal(easternToIso(2026, 7, 1, 12, 0), '2026-07-01T16:00:00.000Z');
  assert.equal(easternToIso(2026, 12, 1, 12, 0), '2026-12-01T17:00:00.000Z');
});

test('returns null on junk rather than an Invalid Date', () => {
  assert.equal(parseIcsDate('not-a-date'), null);
  assert.equal(parseIcsDate(''), null);
});

test('parses a full VEVENT the way the goheels feed emits it', () => {
  const raw = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:vcal_26995-admin.goheels.com',
    'DTSTART:20260813T230000Z',
    'DTEND:20260814T010000Z',
    'LOCATION:Chapel Hill\\, N.C.\\, Dorrance Field',
    "SUMMARY:[W] North Carolina Women's Soccer vs Fairfield ",
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const [ev] = parseIcs(raw);
  assert.equal(ev.UID, 'vcal_26995-admin.goheels.com');
  assert.equal(ev.DTSTART.iso, '2026-08-13T23:00:00.000Z');
  assert.equal(ev.LOCATION, 'Chapel Hill, N.C., Dorrance Field');
  assert.match(ev.SUMMARY, /Women's Soccer vs Fairfield/);
});

test('parses multiple events and ignores content outside VEVENT blocks', () => {
  const raw = [
    'BEGIN:VCALENDAR',
    'PRODID:-//test//EN',
    'BEGIN:VEVENT', 'UID:a', 'DTSTART:20260101T120000Z', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:b', 'DTSTART:20260102T120000Z', 'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const events = parseIcs(raw);
  assert.equal(events.length, 2);
  assert.deepEqual(events.map((e) => e.UID), ['a', 'b']);
});

test('a folded DESCRIPTION rejoins into one value', () => {
  const raw = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:x',
    'DTSTART:20260826T120000Z',
    'DESCRIPTION:Stop by for bagels and coffee\\, while supplies',
    '  last.',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const [ev] = parseIcs(raw);
  assert.equal(ev.DESCRIPTION, 'Stop by for bagels and coffee, while supplies last.');
});

test('assertIcs rejects an HTML bot-challenge page served with HTTP 200', () => {
  // The exact failure that made a live source report zero events as success.
  assert.throws(
    () => assertIcs('<!DOCTYPE html><html><head><title>Just a moment...</title>', 'https://x/ical'),
    /HTML instead of iCalendar/,
  );
});

test('assertIcs rejects any other non-calendar body', () => {
  assert.throws(() => assertIcs('{"error":"nope"}', 'https://x/ical'), /did not return an iCalendar/);
  assert.throws(() => assertIcs('', 'https://x/ical'), /did not return an iCalendar/);
});

test('assertIcs passes a real calendar through untouched', () => {
  const raw = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR';
  assert.equal(assertIcs(raw, 'https://x/ical'), raw);
});
