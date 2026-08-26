// The canonical event shape every adapter must produce, plus the category
// taxonomy that flattens six different source vocabularies into one filter bar.

import { cleanLine, clean } from './text.mjs';
import { detectFree, detectFreeFood } from './tags.mjs';

export const CATEGORIES = [
  'Athletics', 'Arts', 'Music', 'Film', 'Academic', 'Career',
  'Social', 'Service', 'Health', 'Faith', 'Culture', 'Other',
];

/**
 * Some sources hand us one authoritative theme per event. Trusting it beats
 * any keyword guess: Heel Life orgs tag their events with a dozen loosely
 * related categories, so scoring raw labels alone sends almost everything to
 * whichever rule happens to sit highest.
 */
const THEME_MAP = {
  arts: 'Arts', athletics: 'Athletics', communityservice: 'Service',
  cultural: 'Culture', fundraising: 'Service', groupbusiness: 'Social',
  social: 'Social', spirituality: 'Faith', thoughtfullearning: 'Academic',
  academic: 'Academic', music: 'Music', film: 'Film', career: 'Career',
  health: 'Health', service: 'Service', culture: 'Culture', other: 'Other',
};

const CATEGORY_RULES = [
  [/athlet|sport|intramural|recreation|tournament|basketball|football|soccer|lacrosse|baseball|softball|volleyball|tennis|swim|track and field|golf|wrestl|gymnastics|rowing|field hockey|tailgate/i, 'Athletics'],
  [/film|movie|cinema|screening/i, 'Film'],
  [/music|concert|choir|orchestra|symphony|recital|jazz|opera|a cappella|open mic/i, 'Music'],
  [/\bart\b|gallery|exhibit|museum|theatre|theater|dance|performance|poetry|literary|craft/i, 'Arts'],
  [/career fair|job fair|networking|employer|internship|resume|recruit|entrepreneur|professional development|career exploration/i, 'Career'],
  [/volunteer|community service|philanthropy|fundrais|charity|donation|advocacy|service project/i, 'Service'],
  [/wellness|fitness|yoga|meditation|mental health|counsel|nutrition|mindful|wellbeing|well-being/i, 'Health'],
  [/faith|spiritual|worship|church|bible|ministry|religio|prayer|jewish|muslim|hindu|christian|shabbat|chapel/i, 'Faith'],
  [/cultural|heritage|international|diversity|identity month|language table/i, 'Culture'],
  [/lecture|seminar|colloqui|symposium|workshop|research|academic|dissertation|defense|conference|info ?session|panel discussion|study break|tutoring/i, 'Academic'],
  // "Social" needs a guard: social isolation, social media and social work are
  // lecture topics, not parties, and they are common enough on this campus to
  // pollute the whole category without it.
  [/\bsocial(?!\s+(?:isolation|media|work|justice|science|studies|polic|determinant|change|movement|inequal|network))\b|party|mixer|hangout|game night|trivia|coffee|breakfast|cookout|barbecue|welcome week|interest meeting|kickoff/i, 'Social'],
];

/**
 * Score every rule across the labels and title, then take the strongest.
 * The title is weighted heavier than labels because it is the one field an
 * organiser actually writes for humans.
 */
function bestRule(text) {
  let best = null;
  let bestScore = 0;
  for (const [re, cat] of CATEGORY_RULES) {
    const hits = (text.match(new RegExp(re.source, 'gi')) || []).length;
    if (hits > bestScore) {
      bestScore = hits;
      best = cat;
    }
  }
  return best;
}

export function categorize(labels = [], title = '', themeHint = '') {
  // 1. The title is the one field written for humans, so a hit there wins.
  const fromTitle = bestRule(title || '');
  if (fromTitle) return fromTitle;

  // 2. Otherwise trust the source's own single declared theme.
  if (themeHint) {
    const mapped = THEME_MAP[String(themeHint).toLowerCase().replace(/[^a-z]/g, '')];
    if (mapped) return mapped;
  }

  // 3. Last resort: the org's own label soup, scored.
  return bestRule(labels.filter(Boolean).join(' | ')) ?? 'Other';
}

/** Best-effort ISO string. Returns null when a source hands us junk. */
export function toIso(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Build a canonical event. Adapters pass raw-ish fields; this does the
 * cleaning, tagging and validation so the rules live in exactly one place.
 */
export function makeEvent(raw) {
  const start = toIso(raw.start);
  if (!start) return null;
  const title = cleanLine(raw.title, 180);
  if (!title) return null;

  const description = clean(raw.description || '', { maxLength: 420 });
  const categories = (raw.categories || []).map((c) => cleanLine(c)).filter(Boolean);
  const benefits = raw.benefits || [];

  const forTagging = { title, description, categories, benefits, explicitFree: raw.explicitFree, ticketCost: raw.ticketCost };

  let end = toIso(raw.end);
  // Some feeds emit end before start; drop the bad value rather than trust it.
  if (end && end < start) end = null;

  return {
    id: `${raw.source}:${raw.sourceId}`,
    source: raw.source,
    sourceLabel: raw.sourceLabel,
    title,
    description,
    start,
    end,
    allDay: Boolean(raw.allDay),
    venue: cleanLine(raw.venue || '', 120) || null,
    address: cleanLine(raw.address || '', 160) || null,
    org: cleanLine(raw.org || '', 120) || null,
    url: raw.url || null,
    image: raw.image || null,
    categories,
    category: categorize([...categories, raw.org || ''], title, raw.themeHint),
    free: detectFree(forTagging),
    freeFood: detectFreeFood(forTagging),
    rsvps: Number.isFinite(raw.rsvps) ? raw.rsvps : null,
    lat: Number.isFinite(raw.lat) ? raw.lat : null,
    lon: Number.isFinite(raw.lon) ? raw.lon : null,
  };
}

/** Loose key used to spot the same event arriving from two feeds. */
export function dedupeKey(event) {
  const title = event.title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\b(the|a|an|at|of|for|and|unc|carolina)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `${title}|${event.start.slice(0, 16)}`;
}

// Whoever actually runs the event wins. A venue posts its own programming to
// Heel Life too, so when a tour shows up from both, the museum's own listing
// is the authoritative copy and the one whose name belongs on the badge.
// Heel Life still outranks the umbrella calendar for everything else.
const SOURCE_PRIORITY = {
  goheels: 8, ackland: 7, morehead: 7, cpa: 7, alumni: 6, heellife: 5, localist: 3,
};

export function dedupe(events) {
  const byKey = new Map();
  for (const ev of events) {
    const key = dedupeKey(ev);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, ev);
      continue;
    }
    const a = SOURCE_PRIORITY[ev.source] ?? 0;
    const b = SOURCE_PRIORITY[existing.source] ?? 0;
    const winner = a > b ? ev : existing;
    const loser = a > b ? existing : ev;
    // Keep the richer record but never lose a positive tag.
    winner.freeFood = winner.freeFood || loser.freeFood;
    winner.free = winner.free || loser.free;
    if (!winner.description && loser.description) winner.description = loser.description;
    if (!winner.image && loser.image) winner.image = loser.image;
    byKey.set(key, winner);
  }
  return [...byKey.values()];
}
