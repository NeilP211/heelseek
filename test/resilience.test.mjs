import { test } from 'node:test';
import assert from 'node:assert/strict';

import { flagSilentDropouts, carryForwardFailed, MAX_STALE_DAYS } from '../scripts/ingest.mjs';

const NOW = new Date('2026-08-26T12:00:00Z');
const future = (days) => new Date(NOW.getTime() + days * 86_400_000).toISOString();
const past = (days) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

const prevRun = (overrides = {}) => ({
  generatedAt: past(0.25),
  sources: [{ key: 'alumni', label: 'Carolina Alumni', ok: true, count: 47 }],
  events: [
    { id: 'alumni:1', source: 'alumni', title: 'Bagels', start: future(1) },
    { id: 'alumni:2', source: 'alumni', title: 'Bagels later', start: future(30) },
    { id: 'alumni:3', source: 'alumni', title: 'Bagels gone by', start: past(3) },
    { id: 'heellife:9', source: 'heellife', title: 'Club thing', start: future(2) },
  ],
  ...overrides,
});

test('a source that drops from many events to zero is marked failed, not believed', () => {
  const statuses = [{ key: 'alumni', ok: true, count: 0 }];
  flagSilentDropouts(statuses, prevRun());
  assert.equal(statuses[0].ok, false);
  assert.match(statuses[0].error, /0 events but had 47/);
});

test('a source that was already small is left alone', () => {
  const statuses = [{ key: 'cpa', ok: true, count: 0 }];
  flagSilentDropouts(statuses, { sources: [{ key: 'cpa', count: 3 }], events: [] });
  assert.equal(statuses[0].ok, true);
});

test('a failed source is carried forward from the last good run', () => {
  const statuses = [{ key: 'alumni', ok: false, count: 0 }];
  const rescued = carryForwardFailed(statuses, prevRun(), NOW);
  assert.equal(rescued.length, 2, 'should keep only the two future events');
  assert.ok(rescued.every((e) => e.source === 'alumni'));
  assert.equal(statuses[0].stale, true);
  assert.equal(statuses[0].count, 2);
});

test('past events are never resurrected by the carry-forward', () => {
  const statuses = [{ key: 'alumni', ok: false, count: 0 }];
  const rescued = carryForwardFailed(statuses, prevRun(), NOW);
  assert.ok(!rescued.some((e) => e.title === 'Bagels gone by'));
});

test('a healthy source is not touched', () => {
  const statuses = [{ key: 'alumni', ok: true, count: 47 }];
  const rescued = carryForwardFailed(statuses, prevRun(), NOW);
  assert.equal(rescued.length, 0);
  assert.equal(statuses[0].stale, undefined);
});

test('only the failed source is carried, not the whole previous run', () => {
  const statuses = [{ key: 'alumni', ok: false, count: 0 }];
  const rescued = carryForwardFailed(statuses, prevRun(), NOW);
  assert.ok(!rescued.some((e) => e.source === 'heellife'));
});

test('a snapshot older than the staleness limit is refused', () => {
  const statuses = [{ key: 'alumni', ok: false, count: 0 }];
  const old = prevRun({ generatedAt: past(MAX_STALE_DAYS + 1) });
  assert.deepEqual(carryForwardFailed(statuses, old, NOW), []);
  assert.equal(statuses[0].stale, undefined, 'must not claim stale data it did not use');
});

test('a snapshot just inside the limit is still used', () => {
  const statuses = [{ key: 'alumni', ok: false, count: 0 }];
  const old = prevRun({ generatedAt: past(MAX_STALE_DAYS - 1) });
  assert.equal(carryForwardFailed(statuses, old, NOW).length, 2);
});

test('no previous run at all is handled without throwing', () => {
  const statuses = [{ key: 'alumni', ok: false, count: 0 }];
  assert.deepEqual(carryForwardFailed(statuses, null, NOW), []);
  assert.deepEqual(carryForwardFailed(statuses, { events: [] }, NOW), []);
  flagSilentDropouts(statuses, null);
});

test('staleAgeHours is reported so the page can say how old the copy is', () => {
  const statuses = [{ key: 'alumni', ok: false, count: 0 }];
  carryForwardFailed(statuses, prevRun({ generatedAt: past(0.5) }), NOW);
  assert.equal(statuses[0].staleAgeHours, 12);
});

test('staleness is measured from the last real fetch, not the payload timestamp', () => {
  // Carrying data forward rewrites generatedAt every run. If age came from
  // that, stale data would look fresh forever and never age out.
  const statuses = [{ key: 'alumni', ok: false, count: 0 }];
  const prev = prevRun({
    generatedAt: past(0),                  // rewritten by the last carry-forward
    sources: [{ key: 'alumni', ok: false, stale: true, lastFetchedAt: past(MAX_STALE_DAYS + 2) }],
  });
  assert.deepEqual(carryForwardFailed(statuses, prev, NOW), [],
    'should refuse data whose last real fetch is beyond the limit');
  assert.equal(statuses[0].stale, undefined);
});

test('a preserved lastFetchedAt keeps counting up across successive failures', () => {
  const statuses = [{ key: 'alumni', ok: false, count: 0 }];
  const prev = prevRun({
    generatedAt: past(0),
    sources: [{ key: 'alumni', ok: false, stale: true, lastFetchedAt: past(2) }],
  });
  carryForwardFailed(statuses, prev, NOW);
  assert.equal(statuses[0].staleAgeHours, 48);
  assert.equal(statuses[0].lastFetchedAt, past(2), 'the original fetch time must be carried, not reset');
});
