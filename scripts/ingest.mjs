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

const SOURCES = [
  { key: 'heellife', label: 'Heel Life (clubs)', home: heellife.meta.home, run: () => heellife.fetchEvents() },
  { key: 'localist', label: 'UNC Main Calendar', home: localist.meta.home, run: () => localist.fetchEvents({ days: HORIZON_DAYS }) },
  { key: 'goheels', label: 'Carolina Athletics', home: goheels.meta.home, run: () => goheels.fetchEvents() },
  { key: 'venues', label: 'Ackland and Morehead', home: 'https://ackland.org', run: () => tribe.fetchEvents() },
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

async function previousCount() {
  try {
    const prev = JSON.parse(await readFile(OUT, 'utf8'));
    return Array.isArray(prev.events) ? prev.events.length : 0;
  } catch {
    return 0;
  }
}

async function main() {
  const now = new Date();
  console.log(`HeelSeek ingest at ${now.toISOString()}`);

  const results = [];
  for (const source of SOURCES) {
    results.push(await runSource(source));
  }

  const all = results.flatMap((r) => r.events);
  const statuses = results.map((r) => r.status);
  const scoped = withinHorizon(all, now);
  const deduped = dedupe(scoped).sort((a, b) => a.start.localeCompare(b.start));

  const okCount = statuses.filter((s) => s.ok).length;
  if (okCount === 0) {
    console.error('every source failed, refusing to write');
    process.exit(1);
  }

  const before = await previousCount();
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
