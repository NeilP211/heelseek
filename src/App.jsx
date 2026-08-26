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

  const filtered = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return inRange.filter((e) => {
      if (filters.freeFood && !e.freeFood) return false;
      if (filters.free && !e.free && !e.freeFood) return false;
      if (filters.categories.size && !filters.categories.has(e.category)) return false;
      if (filters.sources.size && !filters.sources.has(e.source)) return false;
      if (q) {
        const hay = `${e.title} ${e.org ?? ''} ${e.venue ?? ''} ${e.description ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [inRange, filters]);

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

  const stale = data.sources.filter((s) => !s.ok);

  return (
    <main className="shell">
      <header className="hero">
        <h1 className="logo">HEELSEEK</h1>
        <p className="tagline">
          Every event at UNC Chapel Hill in one place, clubs included.
        </p>
        <div className="stats">
          <span><strong>{data.counts.total}</strong> events</span>
          <span><strong>{data.counts.freeFood}</strong> with free food</span>
          <span><strong>{data.sources.filter((s) => s.ok).length}</strong> sources</span>
          <span className="stats__updated">updated {formatRelative(data.generatedAt)}</span>
        </div>
        {stale.length > 0 && (
          <p className="warning">
            Heads up: {stale.map((s) => s.label).join(', ')} did not respond on the last
            refresh, so events from there may be missing.
          </p>
        )}
      </header>

      <Filters
        filters={filters}
        setFilters={setFilters}
        categories={categories}
        sources={sources}
        counts={counts}
        onReset={() => setFilters(initialFilters())}
      />

      <div className="resultcount">
        {filtered.length === 0
          ? 'Nothing matches those filters.'
          : `${filtered.length} event${filtered.length === 1 ? '' : 's'}`}
      </div>

      <section className="results">
        {grouped.map((group) => (
          <div className="daygroup" key={group.key}>
            <h2 className="daygroup__header">{formatDayHeader(group.key)}</h2>
            {group.events.map((e) => <EventCard key={e.id} event={e} />)}
          </div>
        ))}
      </section>

      {filtered.length > limit && (
        <button className="loadmore" onClick={() => setLimit((l) => l + PAGE)}>
          Show {Math.min(PAGE, filtered.length - limit)} more
        </button>
      )}

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
