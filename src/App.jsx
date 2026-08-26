import { useEffect, useMemo, useState } from 'react';
import Filters from './components/Filters.jsx';
import EventCard from './components/EventCard.jsx';
import { dayKey, todayKey, addDays, formatDayHeader, formatRelative } from './lib/format.js';

const PAGE = 120;

const SOURCE_LABELS = {
  heellife: 'Heel Life',
  localist: 'UNC Calendar',
  goheels: 'Athletics',
  ackland: 'Ackland',
  morehead: 'Morehead',
  alumni: 'Alumni',
  cpa: 'Perf. Arts',
};

const initialFilters = () => ({
  range: 'week',
  query: '',
  freeFood: false,
  free: false,
  categories: new Set(),
  sources: new Set(),
});

function rangeBounds(range) {
  const start = todayKey();
  switch (range) {
    case 'today': return [start, start];
    case 'tomorrow': return [addDays(start, 1), addDays(start, 1)];
    case 'week': return [start, addDays(start, 7)];
    case 'month': return [start, addDays(start, 30)];
    default: return [start, addDays(start, 400)];
  }
}

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState(initialFilters);
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    const url = `${import.meta.env.BASE_URL}data/events.json`;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`could not load events (${r.status})`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  // Reset paging whenever the filter set changes, so a narrower filter does
  // not leave the user scrolled past the end of a shorter list.
  useEffect(() => { setLimit(PAGE); }, [filters]);

  const events = data?.events ?? [];

  const inRange = useMemo(() => {
    const [from, to] = rangeBounds(filters.range);
    return events.filter((e) => {
      const key = dayKey(e.start);
      return key >= from && key <= to;
    });
  }, [events, filters.range]);

  // Facet counts come from the date-scoped set so the numbers on the chips
  // match what clicking them will actually show.
  const categories = useMemo(() => {
    const counts = new Map();
    for (const e of inRange) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [inRange]);

  const sources = useMemo(() => {
    const counts = new Map();
    for (const e of inRange) counts.set(e.source, (counts.get(e.source) ?? 0) + 1);
    return [...counts.entries()]
      .map(([key, count]) => ({ key, label: SOURCE_LABELS[key] ?? key, count }))
      .sort((a, b) => b.count - a.count);
  }, [inRange]);

  // Everything except the date range, so the same predicate can answer both
  // "what matches now" and "would this match if the range were wider".
  const matchesFilters = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return (e) => {
      if (filters.freeFood && !e.freeFood) return false;
      if (filters.free && !e.free && !e.freeFood) return false;
      if (filters.categories.size && !filters.categories.has(e.category)) return false;
      if (filters.sources.size && !filters.sources.has(e.source)) return false;
      if (q) {
        const hay = `${e.title} ${e.org ?? ''} ${e.venue ?? ''} ${e.description ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    };
  }, [filters]);

  const filtered = useMemo(() => inRange.filter(matchesFilters), [inRange, matchesFilters]);

  /**
   * Searching "basketball" in August legitimately returns nothing, because the
   * default window is seven days and the season starts in October. Silently
   * showing an empty list makes the app look broken, so when the only thing
   * excluding results is the date range, say so and offer to widen it.
   */
  const beyondRange = useMemo(() => {
    if (filtered.length > 0 || filters.range === 'all') return 0;
    return events.filter(matchesFilters).length;
  }, [filtered.length, filters.range, events, matchesFilters]);

  const visible = filtered.slice(0, limit);

  const grouped = useMemo(() => {
    const out = [];
    let currentKey = null;
    for (const e of visible) {
      const key = dayKey(e.start);
      if (key !== currentKey) {
        out.push({ key, events: [] });
        currentKey = key;
      }
      out[out.length - 1].events.push(e);
    }
    return out;
  }, [visible]);

  const counts = useMemo(() => ({
    freeFood: inRange.filter((e) => e.freeFood).length,
    free: inRange.filter((e) => e.free || e.freeFood).length,
  }), [inRange]);

  if (error) {
    return (
      <main className="shell">
        <h1 className="logo">HEELSEEK</h1>
        <p className="error">{error}</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="shell">
        <h1 className="logo">HEELSEEK</h1>
        <p className="loading">Loading every event on campus...</p>
      </main>
    );
  }

  /**
   * A failed fetch is not the same as bad data. The alumni host blocks CI
   * permanently, so that source is carried forward on essentially every run
   * even when its copy is hours old and completely correct. Warning about that
   * every time would put a permanent scary banner on a page meant to be shared.
   * Only speak up once the copy is actually old enough to be wrong.
   */
  const STALE_WARN_HOURS = 48;
  const down = data.sources.filter((s) => !s.ok);
  const carried = down.filter((s) => s.stale && (s.staleAgeHours ?? 0) >= STALE_WARN_HOURS);
  const missing = down.filter((s) => !s.stale);
  const degraded = carried.length + missing.length;

  return (
    <main className="shell">
      <a className="skip" href="#results">Skip to events</a>
      <header className="hero">
        <h1 className="logo">HEELSEEK</h1>
        <p className="tagline">
          All UNC events
        </p>
        <div className="stats">
          <span><strong>{data.counts.total}</strong> events</span>
          <span><strong>{data.counts.freeFood}</strong> with free food</span>
          <span>
            {/* Say "6/7" while degraded rather than "6", which reads as if a
                calendar never existed instead of being temporarily stale. */}
            <strong>
              {degraded > 0
                ? `${data.sources.length - degraded}/${data.sources.length}`
                : data.sources.length}
            </strong>{' '}
            sources
          </span>
          <span className="stats__updated">updated {formatRelative(data.generatedAt)}</span>
        </div>
        {carried.length > 0 && (
          <p className="warning">
            {carried.map((s) => s.label).join(', ')} has not refreshed in about{' '}
            {Math.round(Math.max(...carried.map((s) => s.staleAgeHours ?? 0)) / 24)} days,
            so those events may be out of date.
          </p>
        )}
        {missing.length > 0 && (
          <p className="warning">
            {missing.map((s) => s.label).join(', ')} did not respond and had no recent copy
            to fall back on, so events from there are missing right now.
          </p>
        )}
      </header>

      <div className="layout">
        <aside className="layout__side">
          <Filters
            filters={filters}
            setFilters={setFilters}
            categories={categories}
            sources={sources}
            counts={counts}
            onReset={() => setFilters(initialFilters())}
          />
        </aside>

        <div className="layout__main" id="results">
          <div className="resultcount" role="status" aria-live="polite">
            {filtered.length === 0
              ? 'Nothing matches those filters.'
              : `${filtered.length} event${filtered.length === 1 ? '' : 's'}`}
          </div>

          {filtered.length === 0 ? (
            <div className="empty">
              {beyondRange > 0 ? (
                <>
                  <p>
                    Nothing in this date range, but <strong>{beyondRange}</strong>{' '}
                    {beyondRange === 1 ? 'event matches' : 'events match'} further out.
                  </p>
                  <button
                    className="linkbtn"
                    onClick={() => setFilters((f) => ({ ...f, range: 'all' }))}
                  >
                    Search the whole year
                  </button>
                </>
              ) : (
                <>
                  <p>No events match what you picked.</p>
                  <button className="linkbtn" onClick={() => setFilters(initialFilters())}>
                    Clear filters
                  </button>
                </>
              )}
            </div>
          ) : (
            <section className="results">
              {grouped.map((group) => (
                <div className="daygroup" key={group.key}>
                  <h2 className="daygroup__header">{formatDayHeader(group.key)}</h2>
                  <div className="daygroup__list">
                    {group.events.map((e) => <EventCard key={e.id} event={e} />)}
                  </div>
                </div>
              ))}
            </section>
          )}

          {filtered.length > limit && (
            <button className="loadmore" onClick={() => setLimit((l) => l + PAGE)}>
              Show {Math.min(PAGE, filtered.length - limit)} more
            </button>
          )}
        </div>
      </div>

      <footer className="foot">
        <p>
          HeelSeek pulls from {data.sources.length} separate UNC calendars that do not talk
          to each other. Times are Chapel Hill local.
        </p>
        <p className="foot__sources">
          {data.sources.map((s) => (
            <a key={s.key} href={s.home} target="_blank" rel="noopener noreferrer">{s.label}</a>
          ))}
        </p>
      </footer>
    </main>
  );
}
