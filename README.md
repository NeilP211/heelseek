# HeelSeek

Every event happening at UNC Chapel Hill, in one place, including the club ones.

**Live: https://neilp211.github.io/heelseek/**

## Why

UNC does not have one calendar. It has at least seven, and they do not talk to each other.

The one most people know, `calendar.unc.edu`, is opt-in: a department has to
choose to publish into it, and most do not. It carries a few hundred events a
year, heavily weighted toward lectures and seminars. Meanwhile every registered
student org posts to Heel Life, athletics lives on GoHeels, the Ackland and
Morehead each run their own WordPress calendar, Carolina Performing Arts
publishes only to its own season page, and Carolina Alumni runs a completely
separate site for things like Welcome Wednesdays.

So if you get an email about free bagels at the Alumni Center and go looking for
it on the main calendar, it is not there. It was never there.

HeelSeek pulls all of them every three hours, normalises them into one shape,
dedupes the overlap, and puts them behind one filter bar.

## What it pulls

| Source | How | Roughly |
| --- | --- | --- |
| Heel Life (student orgs) | Campus Labs Engage JSON API | 640 |
| Carolina Athletics | SIDEARM public iCal feed | 230 |
| calendar.unc.edu | Localist JSON API | 180 |
| Morehead Planetarium | The Events Calendar REST API | 130 |
| Ackland Art Museum | The Events Calendar REST API | 50 |
| Carolina Alumni | Events Manager iCal feed | 45 |
| Carolina Performing Arts | Season page scrape | 30 |

Around 1,300 events on a 365 day horizon. Every source is public and
unauthenticated, so **this project needs no API keys and no secrets.**

### The alumni feed is special

`alumni.unc.edu` sits behind a WAF that returns **403 to GitHub Actions IP
ranges specifically**, while serving the same feed happily to a normal browser.
Header spoofing does not help; it is an IP reputation block, not a bot check.

So that adapter tries three routes and takes the first that returns events:

1. `?ical=1` (richest: full descriptions, categories, geo)
2. `/events/feed/` RSS (works when iCal is blocked)
3. the same RSS through a public relay (only reached when both direct routes
   fail, which in practice means only in CI)

The RSS route turned out to be better in one way anyway: Events Manager emits
every recurrence as its own item, so RSS gives all 13 Welcome Wednesdays where
iCal folds the series into one entry.

## The free food filter

The one students actually use. It combines three signals:

1. Heel Life's own `Free Food` benefit tag, trusted first.
2. An explicit phrase list (`free pizza`, `dinner provided`, `while supplies last`).
3. A bare food noun only when a giving verb sits within about 60 characters,
   so "a lecture on the pizza industry" does not count as free pizza.

And an exclusion list, because "food insecurity panel", "food drive" and
"food for thought" are all common on this campus and none of them feed you.

## Running it

```bash
npm install
npm run ingest     # pull all seven feeds into public/data/events.json
npm run dev        # local dev server
npm test           # 75 unit tests
npm run build      # static site into dist/
```

`npm run ingest` takes about 15 seconds and is polite: sequential sources,
delays between pages, bounded retries.

## How it stays fresh

A GitHub Actions cron runs every three hours: test, ingest, build, deploy to
Pages. No secrets, no server, no database.

Two guards keep a bad refresh from wrecking the site:

- **Per source isolation.** Each adapter runs inside a wrapper that catches its
  failure and records it. One dead feed degrades the site instead of emptying
  it, and the UI shows a banner naming what did not respond.
- **A shrink guard.** If a refresh produces less than half the events of the
  previous one, the write is refused and the job fails loudly, because that is
  almost always an outage rather than a real drop in campus activity.
- **A silent dropout guard.** A source that returned events last run and zero
  this run is marked failed rather than believed. This one is not theoretical:
  the first live deploy shipped with the alumni feed reporting zero events as a
  success, because a WAF answered the feed request with HTTP 200 and an HTML
  page. `assertIcs` and `assertRss` now reject a non-calendar body outright, so
  the run fails honestly instead of quietly losing a whole calendar.

## Layout

```
scripts/
  ingest.mjs          orchestration, dedupe, guards, output
  sources/            one adapter per calendar
  lib/
    normalize.mjs     canonical event shape, categories, dedupe
    tags.mjs          free food and free admission detection
    ics.mjs           iCalendar parser with real Eastern time handling
    dates.mjs         human date parsing for the scraped source
    text.mjs          HTML and entity cleanup
src/                  Vite and React frontend
test/                 unit tests, no network
```

## Notes for future me

- Times are stored as UTC instants and rendered in `America/New_York`, always.
  A student in California checking a 7pm game should still see 7pm.
- The ICS parser resolves floating times by probing both Eastern offsets and
  keeping the one that round-trips, which handles EST and EDT without a
  timezone library.
- Carolina Performing Arts writes `class="card-event__content--artist-name "`
  with a trailing space. That quirk silently dropped 14 of 21 shows until the
  class regexes were made tolerant. Assume the others will do this too.
- Category assignment prefers the title, then the source's own declared theme,
  then the org's label soup. Label soup last matters: clubs tag nearly
  everything "Career Exploration & Development", and trusting labels first sent
  212 events to the wrong category.
- `calendar.unc.edu` runs Localist. If UNC ever migrates it, the API shape in
  `sources/localist.mjs` is the thing that breaks.
