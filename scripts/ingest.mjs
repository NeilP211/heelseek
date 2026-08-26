#!/usr/bin/env node
// Pulls every source, normalises, dedupes and writes public/data/events.json.
//
// Design rule: a single dead source must never produce an empty site. Each
// adapter runs inside runSource, which records the failure and moves on, and
// the writer refuses to overwrite a good file with a suspiciously empty one.

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as localist from './sources/localist.mjs';
import * as heellife from './sources/heellife.mjs';
import * as goheels from './sources/goheels.mjs';
import * as tribe from './sources/tribe.mjs';
import * as alumni from './sources/alumni.mjs';
import * as cpa from './sources/cpa.mjs';
import { dedupe } from './lib/normalize.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'public/data/events.json');

// Horizon: far enough to cover a full season of athletics and arts.
const HORIZON_DAYS = 365;
// A refresh that loses more than this share of events is treated as suspect.
const SHRINK_GUARD = 0.5;

// One entry per calendar, deliberately not per adapter: Ackland and Morehead
// share the tribe adapter but are separate calendars, and collapsing them made
// the site report six sources while its own events carried seven.
const SOURCES = [
  { key: 'heellife', label: 'Heel Life (clubs)', home: heellife.meta.home, run: () => heellife.fetchEvents() },
  { key: 'localist', label: 'UNC Main Calendar', home: localist.meta.home, run: () => localist.fetchEvents({ days: HORIZON_DAYS }) },
  { key: 'goheels', label: 'Carolina Athletics', home: goheels.meta.home, run: () => goheels.fetchEvents() },
  ...tribe.SITES.map((site) => ({
    key: site.key,
    label: site.label,
    home: site.home,
    run: () => tribe.fetchSite(site),
  })),
  { key: 'alumni', label: 'Carolina Alumni', home: alumni.meta.home, run: () => alumni.fetchEvents() },
  { key: 'cpa', label: 'Carolina Performing Arts', home: cpa.meta.home, run: () => cpa.fetchEvents() },
];

async function runSource(source) {
  const started = Date.now();
  try {
    const events = await source.run();
    const ms = Date.now() - started;
    console.log(`  ok   ${source.key.padEnd(9)} ${String(events.length).padStart(5)} events  ${ms}ms`);
    return { events, status: { key: source.key, label: source.label, ok: true, count: events.length, ms } };
  } catch (err) {
    console.error(`  FAIL ${source.key.padEnd(9)} ${err.message}`);
    return { events: [], status: { key: source.key, label: source.label, ok: false, count: 0, error: err.message } };
  }
}

function withinHorizon(events, now) {
  const floor = now.getTime() - 12 * 60 * 60 * 1000; // keep today's earlier events
  const ceil = now.getTime() + HORIZON_DAYS * 24 * 60 * 60 * 1000;
  return events.filter((e) => {
    const t = Date.parse(e.start);
    return Number.isFinite(t) && t >= floor && t <= ceil;
  });
}

async function previousRun() {
  try {
    return JSON.parse(await readFile(OUT, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * A source that used to return events and now returns none did not become
 * genuinely empty overnight. Treat that as a failure so the run is marked
 * degraded and the site names the calendar that went quiet, rather than
 * shipping a smaller world and calling it success.
 */
export function flagSilentDropouts(statuses, prev) {
  if (!prev?.sources) return;
  const before = new Map(prev.sources.map((s) => [s.key, s.count]));
  for (const s of statuses) {
    if (s.ok && s.count === 0 && (before.get(s.key) ?? 0) > 5) {
      s.ok = false;
      s.error = `returned 0 events but had ${before.get(s.key)} last run`;
      console.error(`  DROP ${s.key.padEnd(9)} ${s.error}`);
    }
  }
}

// How long a carried-over copy of a source stays usable.
export const MAX_STALE_DAYS = 45;

/**
 * Carry a failed source forward from the last good run instead of dropping it.
 *
 * The committed events.json is a real last-known-good snapshot, and campus
 * events are scheduled well in advance, so yesterday's copy of a calendar is
 * far more useful than no calendar. This exists because the alumni host blocks
 * CI and the public relay standing in for it is a free service with no uptime
 * promise: one 522 should not delete Welcome Wednesdays from the site.
 *
 * Only still-future events are reused, and the status stays ok:false so the
 * page keeps telling the truth about what did not respond.
 */
export function carryForwardFailed(statuses, prev, now) {
  if (!prev?.events?.length) return [];
  const ageDays = (now - new Date(prev.generatedAt)) / 86_400_000;
  if (!Number.isFinite(ageDays) || ageDays > MAX_STALE_DAYS) return [];

  const rescued = [];
  for (const s of statuses) {
    if (s.ok) continue;
    const kept = prev.events.filter(
      (e) => e.source === s.key && Date.parse(e.start) >= now.getTime(),
    );
    if (kept.length === 0) continue;
    rescued.push(...kept);
    s.stale = true;
    s.count = kept.length;
    s.staleAgeHours = Math.round(ageDays * 24);
    console.log(`  KEEP ${s.key.padEnd(9)} ${kept.length} events carried over from the last good run`);
  }
  return rescued;
}

async function main() {
  const now = new Date();
  console.log(`HeelSeek ingest at ${now.toISOString()}`);

  const results = [];
  for (const source of SOURCES) {
    results.push(await runSource(source));
  }

  const statuses = results.map((r) => r.status);
  const prev = await previousRun();
  flagSilentDropouts(statuses, prev);

  const all = [...results.flatMap((r) => r.events), ...carryForwardFailed(statuses, prev, now)];
  const scoped = withinHorizon(all, now);
  const deduped = dedupe(scoped).sort((a, b) => a.start.localeCompare(b.start));

  const okCount = statuses.filter((s) => s.ok).length;
  if (okCount === 0) {
    console.error('every source failed, refusing to write');
    process.exit(1);
  }

  const before = Array.isArray(prev?.events) ? prev.events.length : 0;
  if (before > 50 && deduped.length < before * SHRINK_GUARD) {
    console.error(
      `refusing to write: ${deduped.length} events is a big drop from ${before}. ` +
      'Likely a source outage rather than a real change.',
    );
    process.exit(1);
  }

  // Ship only what the UI reads. The raw records carry source taxonomies and
  // image URLs nothing renders, and this is a file phones download on campus
  // wifi, so the trim is worth roughly a quarter of the payload.
  const SHIP = new Set([
    'id', 'source', 'title', 'description', 'start', 'end', 'allDay',
    'venue', 'address', 'org', 'url', 'category', 'free', 'freeFood',
    'rsvps', 'lat', 'lon',
  ]);
  const slim = deduped.map((e) =>
    Object.fromEntries(Object.entries(e).filter(([k, v]) => SHIP.has(k) && v !== null)),
  );

  const payload = {
    generatedAt: now.toISOString(),
    horizonDays: HORIZON_DAYS,
    counts: {
      total: deduped.length,
      raw: all.length,
      deduped: all.length - scoped.length + (scoped.length - deduped.length),
      freeFood: deduped.filter((e) => e.freeFood).length,
      free: deduped.filter((e) => e.free).length,
    },
    sources: statuses,
    events: slim,
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(payload));

  console.log(
    `\nwrote ${deduped.length} events ` +
    `(${payload.counts.freeFood} with free food) from ${okCount}/${SOURCES.length} sources`,
  );
}

// Only run the pipeline when invoked directly, so tests can import the guards.
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
