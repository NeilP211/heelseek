// Human date parsing for the sources that publish prose instead of a feed.

import { easternToIso } from './ics.mjs';

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

export function monthNumber(name = '') {
  return MONTHS[name.toLowerCase().replace(/\./g, '').slice(0, 4)] ??
         MONTHS[name.toLowerCase().replace(/\./g, '').slice(0, 3)] ?? null;
}

/**
 * Expand a human date string into every day it covers.
 * Handles "October 13, 2026", "December 5 & 6, 2026" and "February 19-20, 2027".
 * Returns [{year, month, day}].
 */
export function parseDateList(input = '') {
  const text = input.replace(/[‐-―−]/g, '-').replace(/&amp;/g, '&').trim();
  const m = /([A-Za-z]{3,9})\.?\s+([\d\s,&-]+?),?\s*(\d{4})/.exec(text);
  if (!m) return [];
  const month = monthNumber(m[1]);
  const year = Number(m[3]);
  if (!month || !year) return [];

  const days = new Set();
  for (const chunk of m[2].split(/[,&]/)) {
    const part = chunk.trim();
    if (!part) continue;
    const range = /^(\d{1,2})\s*-\s*(\d{1,2})$/.exec(part);
    if (range) {
      const [a, b] = [Number(range[1]), Number(range[2])];
      if (b >= a && b - a < 31) for (let d = a; d <= b; d++) days.add(d);
      continue;
    }
    const single = /^(\d{1,2})$/.exec(part);
    if (single) days.add(Number(single[1]));
  }
  return [...days].sort((a, b) => a - b).map((day) => ({ year, month, day }));
}

/** Parse "7 PM", "6:30 PM", "8 a.m." into {hour, minute}; null when absent. */
export function parseClock(input = '') {
  const m = /(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s?m/i.exec(input);
  if (!m) return null;
  let hour = Number(m[1]) % 12;
  if (m[3].toLowerCase() === 'p') hour += 12;
  return { hour, minute: Number(m[2] ?? 0) };
}

/** Every clock time in a string, in order: "6:30 PM, 1 PM" -> two entries. */
export function parseClockList(input = '') {
  const out = [];
  const re = /(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s?m/gi;
  let m;
  while ((m = re.exec(input)) !== null) {
    let hour = Number(m[1]) % 12;
    if (m[3].toLowerCase() === 'p') hour += 12;
    out.push({ hour, minute: Number(m[2] ?? 0) });
  }
  return out;
}

/**
 * Combine a date list and a time list into ISO instants in Eastern time.
 * When the counts match they pair up; otherwise every date uses the first time.
 */
export function combine(dates, times) {
  const fallback = times[0] ?? { hour: 19, minute: 0 };
  return dates.map((d, i) => {
    const t = times.length === dates.length ? times[i] : fallback;
    return easternToIso(d.year, d.month, d.day, t.hour, t.minute);
  });
}
