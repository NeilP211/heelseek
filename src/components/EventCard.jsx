import { useState } from 'react';
import { formatTime, calendarLink } from '../lib/format.js';

const SOURCE_SHORT = {
  heellife: 'HEEL LIFE',
  localist: 'UNC CAL',
  goheels: 'ATHLETICS',
  ackland: 'ACKLAND',
  morehead: 'MOREHEAD',
  alumni: 'ALUMNI',
  cpa: 'CPA',
};

export default function EventCard({ event }) {
  const [open, setOpen] = useState(false);
  const hasDetail = Boolean(event.description) || Boolean(event.url);

  return (
    <article className={`card${event.freeFood ? ' card--food' : ''}`}>
      <div className="card__time">
        <span className="card__time-value">{formatTime(event.start, event.allDay)}</span>
        {event.end && !event.allDay && (
          <span className="card__time-end">to {formatTime(event.end)}</span>
        )}
      </div>

      <div className="card__body">
        <div className="card__toprow">
          <span className={`badge badge--${event.category.toLowerCase()}`}>{event.category}</span>
          {event.freeFood && <span className="badge badge--food">FREE FOOD</span>}
          {event.free && !event.freeFood && <span className="badge badge--free">FREE</span>}
          <span className="badge badge--source">{SOURCE_SHORT[event.source] ?? event.source}</span>
        </div>

        <h3 className="card__title">
          {event.url ? (
            <a href={event.url} target="_blank" rel="noopener noreferrer">
              {event.title}
            </a>
          ) : (
            event.title
          )}
        </h3>

        <div className="card__meta">
          {event.org && <span className="card__org">{event.org}</span>}
          {event.venue && <span className="card__venue">{event.venue}</span>}
          {event.rsvps > 0 && <span className="card__rsvp">{event.rsvps} going</span>}
        </div>

        {open && event.description && <p className="card__desc">{event.description}</p>}

        {open && (
          <div className="card__actions">
            {event.url && (
              <a className="linkbtn" href={event.url} target="_blank" rel="noopener noreferrer">
                Open source page
              </a>
            )}
            <a className="linkbtn" href={calendarLink(event)} target="_blank" rel="noopener noreferrer">
              Add to Google Calendar
            </a>
          </div>
        )}
      </div>

      {hasDetail && (
        <button
          className="card__expand"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? `Hide details for ${event.title}` : `Show details for ${event.title}`}
        >
          {open ? '-' : '+'}
        </button>
      )}
    </article>
  );
}
