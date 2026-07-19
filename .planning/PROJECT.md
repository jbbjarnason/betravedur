# Betra Veður

## What This Is

Betra Veður is a static website — a historical counterpart to gottvedur.is. Where gottvedur.is shows where the weather *will be* good in Iceland, Betra Veður shows where it *has been* good: an interactive map of Iceland with weather-station markers displaying multi-year historical averages for a user-selected time-of-year window. It answers the question "I'm free in week 30 — where in Iceland has the weather historically been best?" for Icelanders planning trips.

## Core Value

A visitor picks a time-of-year period and instantly sees, on a map, where in Iceland the weather has historically been best — backed by real Veðurstofan station history.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Interactive map of Iceland (gottvedur.is/kort-style: pan/zoom, station callout markers, zoom-dependent station density)
- [ ] Station markers show historical averages: temperature, wind (speed + direction arrow), precipitation/condition indicator
- [ ] Period selector: choose a time-of-year window of 1 week, 2 weeks, 3 weeks, or 1 month (climatology — the period is a time-of-year, not a specific year)
- [ ] Baseline year-range picker: user selects which years the averages are computed over (e.g. 2010–2015)
- [ ] Every average visibly states how many years it is based on (e.g. "meðaltal 14 ára")
- [ ] Combined weather score (temperature + rain + wind) used to color/rank stations for "where has it been best"
- [ ] Clicking a station opens a chart panel: candlestick charts for temperature and wind per day across the chosen years, rain as bars (or similar) underneath
- [ ] Data sourced from Veðurstofa Íslands station observations
- [ ] Nightly GitHub Actions workflow fetches new observations and appends them to the repo's data
- [ ] Fully static site — no backend, no server-side runtime
- [ ] Hosted on GitHub Pages
- [ ] Icelandic-language UI

### Out of Scope

- Weather forecasts — gottvedur.is/vedur.is already do this; the entire point is history
- Backend/API server — static-only keeps hosting free and maintenance near zero
- English (or other) translations — Icelandic audience; may revisit if tourists become an audience
- Real-time/current conditions — nightly data granularity is sufficient for climatology
- User accounts, saved preferences, or any per-user state — static site, no need

## Context

- **Reference UI**: gottvedur.is/kort (operated by Veðurstofa Íslands, MapTiler + OpenStreetMap base map). The user shared a screenshot: station callouts show temperature (red), wind arrow + m/s, and a condition icon; a day/hour scrubber runs along the bottom; toolbar on the right (info, search, layers, dark-mode toggle). Betra Veður should feel like this, but the bottom scrubber becomes a time-of-year selector and markers show historical averages.
- **Data source**: Veðurstofa Íslands observation data (vedur.is open data / APIs). Exact API/dataset to be confirmed during research — needs enough history per station to support user-selected year ranges like 2010–2015.
- **Candlestick semantics**: for weather this likely maps to min/max/typical range per day-of-year across the baseline years (box/whisker-like), rendered candlestick-style for temperature and wind; rain likely as bars. Exact encoding to be settled during design.
- **Data pipeline**: GitHub Actions cron job runs nightly, fetches the latest observations, appends to committed data files, and redeploys the site. Data lives in the repo (or in a data branch) — no external storage.
- **Greenfield**: empty repository, no prior code.

## Constraints

- **Architecture**: Fully static site — must be servable from GitHub Pages with no server component
- **Data pipeline**: GitHub Actions nightly cron is the only data-update mechanism — pipeline must be idempotent and append-only
- **Data source**: Veðurstofa Íslands — chosen for real station measurements; availability/terms of their open data may shape what's possible
- **Hosting**: GitHub Pages — free tier; repo size limits matter since historical data is committed to the repo
- **Language**: Icelandic-only UI

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Historical climatology, not forecasts | Forecasts are covered by gottvedur.is; the gap is "where has weather been good" | — Pending |
| Veðurstofan as data source | Real station measurements over reanalysis grids; official Icelandic source | — Pending |
| Combined weather score (temp + rain + wind) | Single at-a-glance ranking for "where to go"; possibly user-adjustable weights later | — Pending |
| Static site + GitHub Pages + nightly Actions | Zero hosting cost, zero ops; data committed to repo | — Pending |
| Candlesticks for temp & wind, bars for rain | User's preferred visual language; rain encoding still open | — Pending |
| Chart panel on station click | Keeps map context while showing detail, like gottvedur.is feel | — Pending |
| Icelandic-only | Primary audience is Icelanders planning domestic trips | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-19 after initialization*
