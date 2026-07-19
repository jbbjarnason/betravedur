# Architecture Research

**Domain:** Static historical-weather-climatology map site (Iceland) — GitHub Pages + nightly GitHub Actions data pipeline
**Researched:** 2026-07-19
**Confidence:** MEDIUM-HIGH (architecture patterns HIGH; Veðurstofan data-access specifics MEDIUM — see Integration Points and PITFALLS)

## Standard Architecture

This is a **"baked data + thin client" static site**: a batch pipeline precomputes and commits data artifacts on a schedule, and a client-side app queries those pre-shaped files entirely in the browser. There is no runtime backend. The whole system splits cleanly into three worlds that never run at the same time:

1. **Build-time / offline** (GitHub Actions cron): fetch → normalize → append → precompute → commit → deploy.
2. **Deployed artifacts** (Git + Pages CDN): raw store, derived data files, and the site bundle.
3. **Runtime / in-browser** (visitor's machine): load derived files on demand, aggregate over the user-selected window, render map + chart.

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│  OFFLINE / BUILD-TIME  (GitHub Actions, nightly cron + manual)         │
├──────────────────────────────────────────────────────────────────────┤
│  ┌──────────┐   ┌───────────┐   ┌────────────┐   ┌──────────────┐     │
│  │ Fetcher  │──▶│ Normalizer│──▶│ Raw Store   │──▶│ Aggregator   │     │
│  │(VÍ data) │   │(parse/QC) │   │ Appender    │   │(precompute)  │     │
│  └──────────┘   └───────────┘   └─────┬──────┘   └──────┬───────┘     │
│                                        │                  │            │
│                                   commits to         writes derived   │
│                                   data branch         data files      │
└────────────────────────────────────────┬──────────────────────────────┘
                                          │  Site Builder (bundle) → deploy
                                          ▼
┌──────────────────────────────────────────────────────────────────────┐
│  DEPLOYED ARTIFACTS  (Git repo + GitHub Pages CDN)                     │
├──────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌─────────────────────┐  ┌──────────────────────┐  │
│  │ Raw store     │  │ Derived data (JSON) │  │ Site bundle (HTML/JS)│  │
│  │ (data branch) │  │  per-station series │  │  map + chart app     │  │
│  │  append-only  │  │  + stations index   │  │                      │  │
│  └──────────────┘  └─────────┬───────────┘  └──────────┬───────────┘  │
└──────────────────────────────┼─────────────────────────┼──────────────┘
        served by CDN ─────────┘        served by CDN ────┘
                                          ▼
┌──────────────────────────────────────────────────────────────────────┐
│  RUNTIME / IN-BROWSER  (visitor)                                       │
├──────────────────────────────────────────────────────────────────────┤
│  ┌───────────┐   ┌────────────┐   ┌──────────────┐   ┌─────────────┐  │
│  │ URL State │◀─▶│ App State   │──▶│ Data Loader   │──▶│ Aggregation │  │
│  │ (query    │   │ (period,   │   │ (fetch derived│   │ Engine      │  │
│  │  string)  │   │  years,    │   │  JSON, cache) │   │(window avg, │  │
│  └───────────┘   │  station)  │   └──────────────┘   │ score, box) │  │
│                  └─────┬──────┘                       └──────┬──────┘  │
│                        │                                     │         │
│              ┌─────────▼─────────┐              ┌────────────▼──────┐  │
│              │ Map View          │              │ Chart Panel        │  │
│              │ (MapLibre, score  │              │ (candlestick temp/ │  │
│              │  color layer)     │              │  wind, rain bars)  │  │
│              └───────────────────┘              └────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Fetcher | Pull latest VÍ observations (and backfill historical years once) | Node/Python script in Actions; HTTP client with retry/backoff |
| Normalizer | Parse VÍ response, unit-normalize, quality-flag, dedupe by (station, timestamp) | Pure function; schema validation |
| Raw Store + Appender | Canonical append-only source of truth; one compact file per station | Per-station CSV/NDJSON on a `data` branch, sorted by date, idempotent upsert |
| Aggregator | Precompute derived files from raw store (only what the client cannot cheaply do) | Batch script writing per-station daily-series JSON + stations index |
| Site Builder | Bundle the SPA, embed data manifest/version, output to Pages | Vite (or esbuild) → static `dist/` |
| URL State | Serialize/parse period + year-range + selected station + map viewport into query string | `URLSearchParams`, `history.replaceState` |
| App State | Single source of truth for current query; notifies views | Small store (Zustand / signals / plain observable) |
| Data Loader | Fetch derived JSON on demand, in-memory + HTTP cache, dedupe requests | `fetch` + `Map` cache; leverages CDN + immutable file hashes |
| Aggregation Engine | Compute window averages, combined score, and per-day-of-year box stats for chart, over the user's selection | Pure TS module, runs on loaded per-station series |
| Map View | Render Iceland, station markers, score-colored layer, zoom-dependent density, selection | MapLibre GL JS, data-driven paint expressions |
| Chart Panel | Candlestick temp + wind, rain bars, "meðaltal N ára" label | Lightweight charting (uPlot / D3 / ECharts) |

## Recommended Project Structure

```
/                       # main branch (site source + tooling)
├── src/
│   ├── app/            # bootstrap, App State store, URL-state sync
│   │   ├── state.ts        # current query (period, yearRange, station, viewport)
│   │   └── url.ts          # query-string <-> state serialization
│   ├── data/           # runtime data access
│   │   ├── loader.ts       # fetch derived JSON, cache, dedupe
│   │   └── manifest.ts     # data version / station index access
│   ├── domain/         # pure logic, no DOM (shared with pipeline where possible)
│   │   ├── window.ts       # day-of-year window selection + wrap-around
│   │   ├── aggregate.ts    # averages over years x window
│   │   ├── score.ts        # combined temp+rain+wind score
│   │   └── boxstats.ts     # per-day-of-year min/typical/max for candlesticks
│   ├── map/            # Map View
│   │   ├── map.ts          # MapLibre init, sources, layers
│   │   └── scoreLayer.ts   # data-driven color + zoom density
│   ├── chart/          # Chart Panel (candlestick temp/wind, rain bars)
│   ├── ui/             # PeriodSelector, YearRangePicker, station callouts, toolbar
│   └── i18n/           # Icelandic strings (single locale)
├── pipeline/           # offline / build-time data pipeline (its own scripts)
│   ├── fetch.ts            # Fetcher (VÍ)
│   ├── normalize.ts        # Normalizer + QC
│   ├── append.ts           # idempotent Raw Store upsert
│   ├── aggregate.ts        # Aggregator -> derived JSON (imports src/domain/*)
│   ├── backfill.ts         # one-time historical backfill (chunked by year/station)
│   └── stations.ts         # build stations index (id, name, lat/lon, elevation)
├── .github/workflows/
│   ├── nightly.yml         # cron: fetch -> append -> aggregate -> commit -> deploy
│   └── deploy.yml          # (optional) separate build+deploy on main push
└── data/               # (branch, NOT on main) raw store + derived artifacts
    ├── raw/{station}.csv       # append-only canonical series
    ├── derived/{station}.json  # compact per-station daily series for client
    ├── stations.json           # index + bounding info for the map
    └── manifest.json           # version, last-updated, per-station date coverage
```

### Structure Rationale

- **`pipeline/` is fully separate from `src/`:** offline batch code and browser code have different runtimes, dependencies, and failure modes. Keeping them apart prevents pipeline-only deps (heavy parsers, fs access) from leaking into the client bundle.
- **`src/domain/` is pure and shared:** the *same* window/aggregate/score math should run in both the aggregator and the browser. Extracting it as DOM-free TypeScript lets the pipeline precompute exactly what the client would compute, guaranteeing consistency and letting you move the precompute/compute boundary later without rewriting logic.
- **`data/` lives on its own branch, not main:** this is the single most important structural decision for repo-size and deploy-speed health (see Anti-Patterns and Scaling). The site bundle on `main` stays tiny; the growing data lives separately and is fetched at runtime.

## Architectural Patterns

### Pattern 1: Precompute-the-invariant, Aggregate-the-variable ("bake vs. compute" boundary)

**What:** Precompute *offline* everything that does not depend on user input; compute *in-browser* everything the user parameterizes. The user parameters are `(year-range, day-of-year window, station)`. Those combine multiplicatively (any range × any window × any station), so you **cannot** precompute one file per combination — the cartesian product explodes.

The stable, user-independent unit is: **per station, per calendar day-of-year, per year → the daily summary stats** (mean temp, min/max temp, mean wind, wind direction, precip total, etc.). Bake that. Then the client, given a year-range and a window of days-of-year, aggregates across the selected years and days on the fly — this is a small sum/average over at most ~366 days × ~30 years = ~11k rows per station, trivial in JS.

**When to use:** Whenever the query space is a cartesian product of independent axes and the base data per entity is small (a single Icelandic station's daily record for ~15–75 years is tens of KB gzipped).

**Trade-offs:** Client does light work (fine — it is genuinely light). In exchange you get one compact file per station instead of an unbounded matrix of pre-baked answers, and new query shapes need no pipeline change.

**Example:**
```typescript
// derived/{station}.json — compact, columnar, one row per (year, day-of-year)
// Client aggregation over user selection:
function windowClimatology(series: StationSeries, years: [number, number], doyWindow: DayRange) {
  const days = expandWindow(doyWindow);            // handles year-wrap (e.g. wk 52->1)
  const rows = series.rows.filter(r =>
    r.year >= years[0] && r.year <= years[1] && days.has(r.doy));
  return {
    tempMean: mean(rows.map(r => r.tMean)),
    windMean: mean(rows.map(r => r.wMean)),
    precip:   mean(rows.map(r => r.precip)),
    nYears:   new Set(rows.map(r => r.year)).size,  // for "meðaltal N ára"
  };
}
```

### Pattern 2: Two-tier data load (index first, station series lazily)

**What:** The map needs *all* stations to paint the score layer, but only needs the *aggregate* per station for the current selection — not full history. The chart needs full detail for *one* station. So ship a small `stations.json` index (id, name, lat/lon) loaded up front, and load per-station `derived/{station}.json` only when needed.

Two sub-strategies for the map's initial paint:
- **(a) Compact all-station daily file:** one modest file containing every station's per-(year, doy) summaries, letting the client compute the score layer for any selection without N requests. Feasible because Iceland has on the order of ~100–200 relevant stations; total gzipped is a few MB, acceptable to load once.
- **(b) Per-station lazy load with a coarse prebaked score:** ship precomputed scores for a few *common* windows to paint instantly, then upgrade to exact numbers as station files stream in.

**Recommend (a) as the default** — Iceland's station count is small enough that a single columnar all-stations file (gzip/brotli, served immutable by the CDN) keeps the app a true single-fetch experience and eliminates request-fan-out. Fall back to per-station files (Pattern 3 sharding) only if that file grows past a few MB.

**When to use:** Bounded entity count (stations), unbounded query space. Classic "load the small thing eagerly, the big thing lazily."

**Trade-offs:** Approach (a) reloads the whole file when data updates nightly (mitigated by content-hashed filenames + CDN immutable caching). Approach (b) is lighter on cold load but adds request fan-out and a two-phase UI.

### Pattern 3: Content-hashed, immutable, sharded data files

**What:** Name derived files with a content hash (e.g. `derived/akureyri.a1b2c3.json`) and reference them through `manifest.json`. Serve with long-lived immutable cache headers. Nightly updates change only touched stations' hashes; unchanged stations stay cached forever in the CDN and browser.

**When to use:** Any nightly-regenerated static dataset — this is what makes "redeploy every night" cheap for returning visitors.

**Trade-offs:** Requires a manifest indirection and a build step that hashes files. Worth it; it converts a nightly full re-download into a delta.

**Example:**
```json
// manifest.json
{ "version": "2026-07-19", "stations": {
  "akureyri": { "file": "derived/akureyri.a1b2c3.json", "from": "1949-01-01", "to": "2026-07-18" }
}}
```

### Pattern 4: Idempotent append with a high-water mark

**What:** The pipeline is append-only and must survive double-fires, reruns, and partial VÍ responses. Track per-station last-ingested date in `manifest.json`. Each nightly run fetches only `> last date`, upserts by `(station, date)` key (overwrite duplicates rather than duplicating rows), re-sorts, and advances the water mark. Re-running the same day is a no-op.

**When to use:** All scheduled data ingestion. Non-negotiable for cron (a run does not cancel a still-running previous run; a run can fire twice).

**Trade-offs:** Slightly more bookkeeping than blind append. Prevents the classic "duplicate rows / corrupt averages" failure entirely.

## Data Flow

### Nightly pipeline flow (write path)

```
cron 0X:00 (+ workflow_dispatch)
    ↓
checkout main (code) + checkout data branch (raw store, manifest)
    ↓
Fetcher: for each station, request obs since manifest.to[station]
    ↓
Normalizer: parse → unit-normalize → QC-flag → drop malformed
    ↓
Appender: upsert by (station,date) into raw/{station}.csv, re-sort, dedupe
    ↓
Aggregator: rebuild derived/{station}.json for touched stations (uses src/domain)
    ↓  (rebuild stations.json + manifest.json, content-hash changed files)
commit to data branch (skip commit if no changes → idempotent)
    ↓
Site Builder: bundle src/ → dist/ (embeds/points at manifest)
    ↓
deploy dist/ + data artifacts to Pages
```

### Runtime flow (read path)

```
User loads URL (may carry ?period=..&years=..&station=..&map=..)
    ↓
URL State → App State (initial query)
    ↓
Data Loader: fetch stations.json + all-stations derived file (Pattern 2a)
    ↓
Aggregation Engine: for current (years, window) compute score per station
    ↓
Map View: paint data-driven color layer + markers ("meðaltal N ára")
    │
    └─ user changes period / year-range  → App State updates
           → Aggregation Engine recomputes (no network) → Map repaints
    │
    └─ user clicks station → App State.station set → URL updated
           → (data already loaded) Aggregation Engine computes box stats
           → Chart Panel renders candlestick temp/wind + rain bars
```

### State Management

```
URL query string  ⇄  App State (period, yearRange, station, mapViewport)
                          │ subscribe
        ┌─────────────────┼──────────────────┐
     Map View        Aggregation           Chart Panel
   (repaint on     Engine (recompute      (rerender on
    score change)   pure, no I/O)          station change)
```

Single source of truth = App State. **URL is a projection of state, not a second store** — write with `history.replaceState` on change, parse once on load. This gives free shareability ("send me this map") with zero backend, matching the no-per-user-state constraint.

### Key Data Flows

1. **Backfill (one-time):** `backfill.ts` walks history year-by-year / station-by-station, chunked and resumable (checkpoint in manifest), committing in batches so a timeout mid-backfill loses nothing. Runs via `workflow_dispatch`, not cron.
2. **Selection change (hot path, no network):** because the all-stations series is already in memory, changing period or year-range is pure computation → instant map recolor. This is the core UX win and the reason for Pattern 1.

## Scaling Considerations

Scaling here is about **data volume and deploy cost**, not user count (a static CDN serves unlimited readers).

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Launch (few stations, few years) | Single all-stations derived file; everything in one repo branch is fine |
| Full history (~100–200 stations, decades of daily data) | Data on separate `data` branch; content-hashed per-station files; brotli precompression; all-stations file stays load-once |
| Years of nightly commits accumulate | History rewrite / squash of the data branch (or periodic orphan-branch reset) to cap `.git` size; only latest snapshot matters for a static site |

### Scaling Priorities

1. **First bottleneck — repo/deploy size, not runtime.** GitHub's recommended repo limit is ~1 GB and Pages sites are capped near 1 GB. Daily commits of growing data inflate `.git` history far faster than the working tree. **Fix:** keep data off `main`; periodically squash/orphan-reset the `data` branch so history does not accumulate unboundedly. The *derived working set* (what visitors download) stays small regardless.
2. **Second bottleneck — cold-load payload.** If the all-stations file exceeds a few MB gzipped, switch to Pattern 3 sharding (per-station lazy load) + a small prebaked score for common windows so the map paints instantly.
3. **Third — nightly job runtime.** Incremental fetch (only since high-water mark) keeps the nightly run seconds-to-minutes; only backfill is long, and it is chunked/resumable.

## Anti-Patterns

### Anti-Pattern 1: Committing the growing data set to `main`

**What people do:** Append nightly data straight into the same branch that Pages builds from.
**Why it's wrong:** Every deploy re-processes and re-ships a repo whose `.git` grows every night; build times climb, clone times balloon, and you march toward the 1 GB limit. History can never be reclaimed without rewriting the branch people build from.
**Do this instead:** Isolate raw + derived data on a dedicated `data` branch (or orphan branch); `main` holds only site source. Fetch data at runtime from the CDN. Squash/reset the data branch periodically.

### Anti-Pattern 2: Pre-baking one file per query combination

**What people do:** Precompute a JSON for every (year-range × window × station) so the client "just loads the answer."
**Why it's wrong:** The combinations are a cartesian product — tens of thousands of files, most never requested, and every new UI control multiplies them. Nightly regeneration becomes enormous.
**Do this instead:** Precompute only the user-independent unit (per-station per-(year, day-of-year) summary) and aggregate the variable axes in-browser (Pattern 1). The client work is negligible.

### Anti-Pattern 3: Blind append in the cron job

**What people do:** `>> station.csv` every night with whatever the API returned.
**Why it's wrong:** Cron double-fires and reruns duplicate rows; a partial/late API response poisons averages; no way to safely re-run after a failure.
**Do this instead:** Idempotent upsert keyed by (station, date) with a per-station high-water mark; skip the commit entirely when nothing changed (Pattern 4). Add `workflow_dispatch` for manual reruns.

### Anti-Pattern 4: Duplicating the aggregation math in pipeline and client

**What people do:** Write the score/window logic once in Python for the pipeline and again in JS for the browser.
**Why it's wrong:** They drift; the map and chart show numbers that disagree with what was baked.
**Do this instead:** One DOM-free `src/domain/` TS module imported by both the aggregator and the client. Pick a single language (TypeScript throughout) so this sharing is literal.

### Anti-Pattern 5: Treating the URL as authoritative mutable state

**What people do:** Read/write the URL as the live store on every interaction, or push a history entry per change.
**Why it's wrong:** History spam (back button broken), race conditions, re-parse churn.
**Do this instead:** App State is the store; URL is a serialized projection updated via `replaceState`, parsed once on load.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Veðurstofa Íslands observation data | HTTP fetch in the pipeline only (never from the browser) | **KEY RISK / needs confirmation:** exact endpoint, historical depth, bulk vs. per-request, rate limits, and reuse terms are unconfirmed. Known surfaces: `apis.is/weather/observations` (community proxy, appears current-obs oriented), `api.vedur.is/weather/`, and VÍ climatology pages citing monthly/annual values since 1961. **Depth of daily history and licensing directly gate the whole product** and must be validated first (see PITFALLS). Design the Fetcher behind a source-adapter interface so the concrete data source can change without touching the rest of the pipeline. |
| Basemap tiles (MapLibre) | Client fetches vector/raster tiles from a tile provider | Reference UI (gottvedur.is/kort) uses MapTiler + OSM; MapLibre GL JS is the open, no-vendor-lock renderer. Needs a tile source (MapTiler key, or self-hostable/OSM raster). Free-tier tile limits are a consideration but not blocking. |
| GitHub Pages CDN | `git push` → automatic deploy | Serves both the site bundle and the data artifacts as static files; immutable caching via content-hashed filenames. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Pipeline ↔ Raw Store | File I/O on `data` branch | Append-only, idempotent upsert; single writer (the nightly job) |
| Aggregator ↔ `src/domain` | Direct import (shared pure code) | Guarantees baked == computed |
| Data Loader ↔ CDN | `fetch` + in-memory cache | Manifest-driven, content-hashed URLs |
| App State ↔ Views | subscribe/notify | Views are read-only consumers; only user actions mutate state |
| App State ↔ URL | serialize on change / parse on load | `replaceState`, not a second store |
| Aggregation Engine ↔ Map & Chart | function calls returning plain data | Engine is pure; views render its output |

## Suggested Build Order

Ordering follows the data dependency: you cannot render what you have not shaped, and you cannot shape what you have not fetched. But you can de-risk with fixtures.

1. **Data-source spike (BLOCKING):** confirm VÍ endpoint, daily-history depth, station list, and reuse terms. Produce a tiny real sample for 2–3 stations. *Everything downstream depends on this; if history/licensing is inadequate the product must pivot.* (Feeds STACK/PITFALLS decisions.)
2. **Domain core (`src/domain/`):** window selection (with day-of-year wrap), aggregation, combined score, box stats — pure functions, unit-tested against the sample. Defines the derived-file schema.
3. **Aggregator + derived schema:** turn raw sample → `derived/*.json` + `stations.json` + `manifest.json`. Locks the bake/compute boundary.
4. **Runtime data loader + Aggregation Engine wiring:** load derived files, compute a selection in-browser. Verifiable headless before any UI.
5. **Map View:** MapLibre + stations + data-driven score color layer + zoom density + selection. First visible product.
6. **Period selector + Year-range picker + App State + URL state:** make the map interactive and shareable. Hot-path recompute (no network) proves Pattern 1.
7. **Chart Panel:** candlestick temp/wind + rain bars on station click, "meðaltal N ára" label.
8. **Full pipeline in Actions:** Fetcher → Normalizer → idempotent Appender → Aggregator → commit → build → deploy; add `workflow_dispatch`; wire the `data` branch.
9. **Backfill:** chunked, resumable historical load into the raw store (one-off, `workflow_dispatch`).
10. **Repo-size / caching hardening:** content-hashed files, immutable headers, data-branch squash/orphan strategy, brotli precompression.

Steps 2–7 can proceed on committed sample fixtures in parallel with resolving step 1's real access; steps 8–10 productionize what already works locally.

## Sources

- Meteostat bulk data model (one gzip file per station/year, static URL access, no key) — https://dev.meteostat.net/data/bulk and https://dev.meteostat.net/bulk/daily.html (HIGH — directly analogous static-hosted per-station data layout)
- Meteostat climate normals / daily API (per-station, date-range querying) — https://dev.meteostat.net/api/stations/daily and https://dev.meteostat.net/api/stations/normals (HIGH)
- GitHub Pages / repository size limits (~1 GB) and Git LFS / external-storage guidance — https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits and https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits (HIGH)
- Orphan-branch strategy for separating source from generated site data — https://blog.jenkster.com/2016/02/git-for-static-sites.html (MEDIUM)
- Repo optimization for Pages (size/build-time reductions) — https://some-natalie.dev/blog/website-improvements/ (MEDIUM)
- GitHub Actions cron: idempotency, double-fire, workflow_dispatch best practices — https://cronpreview.com/guides/github-actions-cron-in-production and https://jasonet.co/posts/scheduled-actions/ (MEDIUM-HIGH)
- MapLibre GL JS data-driven paint expressions + GeoJSON sources for station styling — https://maplibre.org/maplibre-gl-js/docs/examples/style-lines-with-a-data-driven-property/ and https://maplibre.org/maplibre-gl-js/docs/ (HIGH)
- Veðurstofa Íslands climatology data page (monthly/annual values since 1961; daily/bulk depth unconfirmed) — https://en.vedur.is/climatology/data/ (LOW-MEDIUM — access specifics need validation)
- apis.is weather observations (community endpoint, current-obs oriented) — https://docs.apis.is/ (LOW-MEDIUM)

---
*Architecture research for: static historical-weather-climatology map site (Iceland)*
*Researched: 2026-07-19*
