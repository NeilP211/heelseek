import { useState } from 'react';

const RANGES = [
  ['today', 'Today'],
  ['tomorrow', 'Tomorrow'],
  ['week', 'Next 7 days'],
  ['month', 'Next 30 days'],
  ['all', 'Everything'],
];

function Chip({ active, onClick, children, className = '' }) {
  return (
    <button
      type="button"
      className={`chip ${className}${active ? ' chip--on' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

/**
 * On a phone the type and source chip rows fill the entire first screen, so
 * events start below the fold. Collapse them there and leave them open on
 * desktop, where there is room for everything at once.
 */
const wantsAdvancedOpen = () =>
  typeof window === 'undefined' ? true : window.matchMedia('(min-width: 700px)').matches;

export default function Filters({
  filters, setFilters, categories, sources, counts, onReset,
}) {
  const [advancedOpen, setAdvancedOpen] = useState(wantsAdvancedOpen);
  const activeAdvanced = filters.categories.size + filters.sources.size;

  const toggleSet = (key, value) => {
    setFilters((f) => {
      const next = new Set(f[key]);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { ...f, [key]: next };
    });
  };

  return (
    <section className="filters">
      <div className="filters__search">
        <input
          type="search"
          placeholder="Search events..."
          value={filters.query}
          onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
          aria-label="Search events"
        />
      </div>

      <div className="filters__row">
        <span className="filters__label">When</span>
        <div className="filters__chips">
          {RANGES.map(([key, label]) => (
            <Chip
              key={key}
              active={filters.range === key}
              onClick={() => setFilters((f) => ({ ...f, range: key }))}
            >
              {label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="filters__row">
        <span className="filters__label">Perks</span>
        <div className="filters__chips">
          <Chip
            className="chip--food"
            active={filters.freeFood}
            onClick={() => setFilters((f) => ({ ...f, freeFood: !f.freeFood }))}
          >
            Free food ({counts.freeFood})
          </Chip>
          <Chip
            active={filters.free}
            onClick={() => setFilters((f) => ({ ...f, free: !f.free }))}
          >
            Free to attend ({counts.free})
          </Chip>
        </div>
      </div>

      <button
        type="button"
        className="filters__disclosure"
        onClick={() => setAdvancedOpen((v) => !v)}
        aria-expanded={advancedOpen}
      >
        {advancedOpen ? 'Hide' : 'Show'} type and source filters
        {!advancedOpen && activeAdvanced > 0 && <em> ({activeAdvanced} on)</em>}
      </button>

      {advancedOpen && (
        <>
          <div className="filters__row">
            <span className="filters__label">Type</span>
            <div className="filters__chips">
              {categories.map(({ name, count }) => (
                <Chip
                  key={name}
                  active={filters.categories.has(name)}
                  onClick={() => toggleSet('categories', name)}
                >
                  {name} <em>{count}</em>
                </Chip>
              ))}
            </div>
          </div>

          <div className="filters__row">
            <span className="filters__label">Source</span>
            <div className="filters__chips">
              {sources.map(({ key, label, count }) => (
                <Chip
                  key={key}
                  active={filters.sources.has(key)}
                  onClick={() => toggleSet('sources', key)}
                >
                  {label} <em>{count}</em>
                </Chip>
              ))}
            </div>
          </div>
        </>
      )}

      <button type="button" className="filters__reset" onClick={onReset}>
        Reset filters
      </button>
    </section>
  );
}
