# Requirements: Betra Veður

**Defined:** 2026-07-19
**Core Value:** A visitor picks a time-of-year period and instantly sees, on a map, where in Iceland the weather has historically been best — backed by real Veðurstofan station history.
**Mode:** Auto-scoped (fully-automatic bridge) — all table stakes + discussed features included; data-gated and complexity-heavy differentiators deferred.

## v1 Requirements

### Data Pipeline

- [x] **DATA-01**: Pipeline fetches daily station observations (temp mean/max/min, wind mean/max/gust + direction, precipitation) from the Veðurstofa Íslands open API (`api.vedur.is/weather/`)
- [x] **DATA-02**: One-time backfill ingests available per-station daily history deep enough to support baseline year ranges like 2010–2015
- [ ] **DATA-03**: Nightly GitHub Actions cron appends new observations idempotently (upsert by station+date, gap-fill on missed runs, safe to re-run, off-peak schedule)
- [x] **DATA-04**: Pipeline precomputes per-station, per-year, day-of-year summaries as static files the client can aggregate over any {period × year-range} selection without a backend
- [x] **DATA-05**: Aggregation statistics are correct: wind direction uses circular mean, missing precipitation is treated as missing (never zero), and every average tracks actual data coverage
- [x] **DATA-06**: Station metadata registry keys on station ID with active-date windows (handles moves, closures, and network churn without splicing records)
- [x] **DATA-07**: Data storage keeps the repo within GitHub Pages limits (dedicated data branch or partitioned additive files; nightly commits must not balloon `.git` history)
- [x] **DATA-08**: Site complies with Veðurstofan CC BY 4.0 terms — attribution displayed, terms verified before ingest

### Map

- [x] **MAP-01**: Interactive pan/zoom map of Iceland (MapLibre GL + self-hosted PMTiles basemap, no API keys)
- [x] **MAP-02**: Station markers show historical averages for the selected period: temperature, wind speed + direction arrow, precipitation indicator
- [x] **MAP-03**: Markers are colored by the combined weather score, with a legend explaining the color scale
- [x] **MAP-04**: Marker density adapts to zoom level (more stations appear as user zooms in; no unreadable overlap)

### Selection

- [x] **SEL-01**: User can select a time-of-year window of 1 week, 2 weeks, 3 weeks, or 1 month
- [x] **SEL-02**: User can select the baseline year range the averages are computed over (e.g. 2010–2015)
- [x] **SEL-03**: Every displayed average shows how many years it is actually based on ("meðaltal N ára"), where N derives from real data coverage, not the picker range
- [x] **SEL-04**: Changing period or year range recomputes and recolors the map instantly client-side (no page reload, no network fetch)

### Score & Ranking

- [x] **SCORE-01**: Combined weather score computed from temperature, precipitation, and wind components (components precomputed separately so weights can change later)
- [ ] **SCORE-02**: Ranked "best stations for this period" list answers the core question directly
- [ ] **SCORE-03**: Score formula is transparent — an explainer shows how the score is calculated ("hvernig er einkunnin reiknuð?")

### Station Detail

- [ ] **CHART-01**: Clicking a station opens a chart panel: candlestick-style distribution charts for temperature and wind per day across the chosen years, precipitation as bars
- [ ] **CHART-02**: Charts use distribution semantics (min/typical range/max — not financial OHLC) with a plain-Icelandic reading key
- [ ] **CHART-03**: Panel shows daylight hours for the selected period (astronomical computation)
- [ ] **CHART-04**: Panel handles missing data explicitly ("engin gögn fyrir þetta tímabil") instead of blank charts

### UX & Site

- [x] **UX-01**: Icelandic-only UI with the slogan "Leitin að betra veðri" in the site branding
- [x] **UX-02**: Full UI state (period, year range, selected station, map view) is encoded in the URL — permalinks are shareable and bookmarkable
- [ ] **UX-03**: Mobile-responsive: bottom-sheet station panel on phones, side panel on desktop
- [ ] **UX-04**: Info panel explains "sögulegt meðaltal, ekki spá" (historical, not forecast), shows Veðurstofan attribution and data currency ("uppfært í nótt")
- [ ] **UX-05**: Loading, empty, and no-data states for map and panels
- [x] **SITE-01**: Fully static site built with Vite/TypeScript, deployed to GitHub Pages by CI on every data update

## v2 Requirements (Deferred)

- **SUN-01**: Sunshine / cloud-cover metric in the score — gated on Veðurstofan data availability per station
- **CMP-01**: Side-by-side comparison of 2+ stations
- **TOG-01**: "Meðaltal / dreifing" chart toggle (simpler mean-line default view)
- **RANK-04**: Reverse "worst weather" ranking
- **WGT-01**: User-adjustable score weights (temp/rain/wind sliders) — component precompute in DATA-04/SCORE-01 keeps this possible
- **LANG-01**: English UI — only if a non-Icelandic audience is validated

## Out of Scope

| Exclusion | Reasoning |
|-----------|-----------|
| Weather forecasts / current conditions | gottvedur.is and vedur.is own this; dilutes the historical premise — link out instead |
| Backend/API server | Static-only keeps hosting free and maintenance near zero |
| Raw data download / CSV re-hosting | Repo bloat + licensing surface; link to Veðurstofan's own open-data portal |
| Arbitrary start–end date queries | Combinatorial explosion, static-hostile; designed windows cover the use case |
| User accounts / saved preferences | URL permalink is the save mechanism |
| Climate-change trend analysis | Different product (Climate Atlas of Iceland); statistically fraught with uneven station records |
| Real-time / hourly granularity | Nightly pipeline; daily granularity is correct for climatology |
| Heavy marker animations / condition sprites | Mobile performance killer; color-as-score does the visual work |

## Traceability

Which phases cover which requirements.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 1 | Complete |
| DATA-05 | Phase 1 | Complete |
| DATA-06 | Phase 1 | Complete |
| DATA-08 | Phase 1 | Complete |
| SCORE-01 | Phase 1 | Complete |
| DATA-02 | Phase 2 | Complete |
| DATA-04 | Phase 2 | Complete |
| DATA-07 | Phase 2 | Complete |
| MAP-01 | Phase 3 | Complete |
| MAP-02 | Phase 3 | Complete |
| MAP-04 | Phase 3 | Complete |
| UX-01 | Phase 3 | Complete |
| SITE-01 | Phase 3 | Complete |
| SEL-01 | Phase 4 | Complete |
| SEL-02 | Phase 4 | Complete |
| SEL-03 | Phase 4 | Complete |
| SEL-04 | Phase 4 | Complete |
| UX-02 | Phase 4 | Complete |
| MAP-03 | Phase 5 | Complete |
| SCORE-02 | Phase 5 | Pending |
| SCORE-03 | Phase 5 | Pending |
| CHART-01 | Phase 6 | Pending |
| CHART-02 | Phase 6 | Pending |
| CHART-03 | Phase 6 | Pending |
| CHART-04 | Phase 6 | Pending |
| UX-03 | Phase 7 | Pending |
| UX-04 | Phase 7 | Pending |
| UX-05 | Phase 7 | Pending |
| DATA-03 | Phase 8 | Pending |

---
*Requirements scoped from .planning/research/FEATURES.md (MVP definition) + questioning session, 2026-07-19*
