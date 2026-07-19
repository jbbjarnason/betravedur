# Project Research Summary

**Project:** Betra Veður
**Domain:** Static historical-weather / climatology interactive map (Iceland), GitHub Pages + nightly GitHub Actions data pipeline
**Researched:** 2026-07-19
**Confidence:** HIGH (stack and pitfalls grounded in verified sources; architecture patterns HIGH; feature landscape MEDIUM-HIGH)

## Executive Summary

Betra Veður is a "baked-data + thin client" static site that inverts the typical weather-site question: instead of "what will the weather be," it answers "where in Iceland has the weather historically been best for a given time-of-year window." Research confirms the viability of the entire concept: Veðurstofa Íslands now publishes a modern, unauthenticated, CC BY 4.0 REST API (api.vedur.is/weather/) with daily-aggregated station observations (min/mean/max temperature, wind speed and direction, precipitation) going back to at least 2005 for automatic stations and 1920 for Reykjavík — exactly the fields and depth the design requires. The basemap can be self-hosted as a PMTiles file from the Protomaps project, eliminating all vendor accounts and API keys. The recommended runtime stack is MapLibre GL JS + Apache ECharts + Vite + TypeScript, with a Python nightly pipeline running in GitHub Actions.

The correct architecture is "precompute the invariant, aggregate the variable": store one compact file per station containing per-(year, day-of-year) daily summaries, then let the browser aggregate across whatever year-range and day-of-year window the user selects. This keeps build artifacts tractable (~200 stations × ~30 years × 366 days-of-year is tens of KB gzipped per station), makes selection changes instant with no network round-trip, and avoids the combinatorial explosion of pre-baking one file per query combination. The single most structurally important decision is keeping raw and derived data on a dedicated data branch separate from main so that nightly commits do not inflate the Pages-build repository history toward the 1 GB limit.

The dominant risks are data-integrity rather than architecture risks. Three are non-negotiable to get right before any UI work: (1) computing "meðaltal N ára" from data actually present, not from the UI year-range picker; (2) using a vector/circular mean for wind direction (arithmetic mean of 350° and 10° gives 180° — the opposite direction); and (3) treating missing observations as absent, not as zero (especially for precipitation, where missing-as-zero makes a data-sparse station look implausibly dry). A fourth gate is confirming Veðurstofan's redistribution terms before the first data ingest — the API is CC BY 4.0 per research but "open" does not equal "unrestricted redistribution."

## Key Findings

### Recommended Stack

The frontend is vanilla TypeScript + Vite: no framework overhead is warranted for a single-page app. MapLibre GL JS (v5.24.0) renders the interactive Iceland map over a self-hosted PMTiles basemap extracted from the Protomaps daily planet build — zero vendor account, zero API key, no non-commercial-use risk. Apache ECharts (v6.1.0) handles the station chart panel: candlestick series for temperature and wind distribution, bar series for precipitation, sharing one chart instance with à-la-carte imports (~80–130 KB gzipped). The Python nightly pipeline uses httpx for async per-station fetches and polars for aggregation.

**Core technologies:**
- **MapLibre GL JS 5.24.0:** interactive vector map — open-source, no API key, GPU rendering, native PMTiles support
- **PMTiles (self-hosted Iceland extract):** static basemap via HTTP range requests — zero ops, zero vendor dependency, fits within GitHub Pages 1 GB limit
- **Apache ECharts 6.1.0:** unified candlestick + bar + line charting — à-la-carte imports keep bundle small; eliminates need for a separate candlestick library
- **Vite 8.1.5 + TypeScript 5.x:** build tooling — fast HMR, tree-shaking, trivial static deploy
- **Python 3.12+ (httpx + polars):** nightly data pipeline — concise async fetch, fast aggregation; runs in Actions, independent of the frontend language
- **api.vedur.is/weather/ (CC BY 4.0):** primary data source — unauthenticated, OpenAPI 3.1, daily aggregation, real station measurements (not reanalysis grids)

### Expected Features

**Must have (table stakes) — v1:**
- Interactive pan/zoom map with station markers showing temp, wind arrow+speed, and condition
- Period selector (1-week, 2-week, 3-week, 1-month day-of-year window)
- Baseline year-range picker with visible "meðaltal N ára" label (credibility, not decoration)
- Combined weather score coloring markers + a legend explaining the scale
- Ranked "best stations for this period" list — this is the core answer to the user's question
- Station click -> chart panel (candlestick temp/wind distribution, rain bars)
- Mobile-responsive map with bottom-sheet detail panel
- Shareable URL state (period + year-range + station + map viewport) — substitutes entirely for user accounts/saved preferences
- Info panel clarifying "historical, not forecast" + Veðurstofan attribution + data freshness date
- Daylight hours for selected period (pure astronomical computation, no data dependency)

**Should have (competitive) — v1.x:**
- Sunshine / cloud-cover metric in score — data-gated (confirm availability first; many automatic stations lack sunshine sensors)
- Station comparison (2 stations side by side)
- "Meðaltal / dreifing" toggle on the chart panel (addresses candlestick comprehension risk)
- Reverse "worst weather" ranking (trivial once ranking exists)

**Defer — v2+:**
- Adjustable score weights (temp/rain/wind sliders) — needs component-level precompute in place regardless; decide data shape early even if sliders ship late
- English UI — only if a non-Icelandic tourist audience is validated
- Additional metrics (humidity, gusts) — only if they earn their UI space

**Anti-features (deliberately excluded):**
- Weather forecasts / current conditions (vedur.is owns this; would dilute the premise)
- Raw CSV export / arbitrary date queries (static-hostile; link out to Veðurstofan's own portal instead)
- User accounts (URL permalink is the save mechanism)
- Climate-change trend analysis (different product; statistically fraught with uneven station records)

### Architecture Approach

The system separates cleanly into three worlds that never run simultaneously: (1) an offline nightly pipeline (GitHub Actions cron) that fetches, normalizes, appends to the raw store, recomputes derived files, commits, and deploys; (2) deployed artifacts on the data branch and GitHub Pages CDN; and (3) a thin client that loads derived files, aggregates the user's selection in-browser, and renders the map and chart. The key pattern is "precompute the invariant (per-station per-year-doy summaries), aggregate the variable (user's year-range x window selection) in the browser." Client aggregation over <= 366 days × <= 30 years per station is negligible JS work and makes selection changes instant with no network traffic.

**Major components:**
1. **Fetcher + Normalizer + Appender** (pipeline) — pulls new VÍ observations since last high-water mark, QC-flags, upserts by (station, date) into the raw store on a data branch; idempotent and append-only
2. **Aggregator** (pipeline, imports src/domain/) — rebuilds derived/{station}.json (per-year, per-doy summaries) + stations.json + content-hashed manifest.json for touched stations only
3. **src/domain/** (pure TypeScript, shared) — window selection, aggregation, combined score, box stats; imported identically by the pipeline aggregator and the browser Aggregation Engine, guaranteeing consistency
4. **Data Loader + Aggregation Engine** (browser) — fetches the all-stations derived file once, caches it, and recomputes scores and box stats purely in-memory on each selection change
5. **Map View** (MapLibre) — data-driven paint expressions for score coloring, zoom-dependent marker density, station selection
6. **Chart Panel** (ECharts) — percentile-box/whisker encoded as candlestick style for temperature and wind speed, bar series for precipitation; lazy-loaded on station click
7. **App State <-> URL State** — single source of truth; URL is a serialized projection written with replaceState, parsed once on load; enables free shareability with no backend

### Critical Pitfalls

1. **"Meðaltal N ára" that lies about missing years** — compute N from distinct years that have qualifying data in the window, not from the picker range. Store per-cell contributing year count; set a minimum coverage threshold. This is the product's core trust promise — getting it wrong is a fatal credibility failure.

2. **Wind direction averaged with arithmetic mean** — 350° and 10° average to 180° (south) not 0° (north). Use the vector/circular mean: decompose to u/v components, sum, atan2 the resultant. Add a regression test with this exact case before shipping. Never average wind direction like temperature.

3. **Missing observations treated as zero** — especially for precipitation, where missing-as-zero makes a data-sparse station appear implausibly dry and corrupt rankings. Store and propagate nulls explicitly; exclude missing days from denominators; carry coverage through to the UI.

4. **Repo history bloat from nightly append commits** — nightly commits that rewrite even small files accumulate unboundedly in .git. Partition data into small per-station / per-year files (additive diffs), keep all data on a dedicated data branch separate from main, and plan a periodic orphan-branch squash strategy from day one. Retrofitting this after months of history is painful.

5. **Nightly pipeline silently stops** — GitHub schedules delay under load and auto-disable after 60 days with no commits. Schedule at an off-peak minute (not :00 UTC), add an external heartbeat (healthchecks.io), surface a data-freshness date in the UI, and implement gap-filling ("fetch everything since last stored observation," not "fetch last 24h") so a missed night self-heals on the next run.

6. **Candlestick encoding inheriting financial semantics** — chart libraries default to green-up/red-down OHLC coloring that implies directional gain/loss, which is meaningless and misleading for weather. Define the encoding as percentile box/whisker (body = IQR or 25th-75th percentile, whiskers = 10th-90th or min/max), use a single color or temperature colormap, add a plain-language Icelandic legend ("dæmigert bil"), and settle the encoding before implementation.

7. **Data redistribution terms not confirmed** — the API is CC BY 4.0 per STACK research, but the full conditions page timed out during PITFALLS research. Read en.vedur.is/about-imo/the-web/conditions and athuganir.vedur.is terms before the first data ingest. Attribution in the UI is mandatory regardless.

## Implications for Roadmap

Based on combined research, the dependency graph imposes a clear build order: data access gates everything; domain math gates both the pipeline and the browser; the map gates the chart; the pipeline productionizes what the static fixture already proved. Suggested phase structure:

### Phase 1: Data Source Integration and Domain Core
**Rationale:** Everything downstream depends on confirmed data access (history depth, field names, terms) and correct domain math (circular wind mean, honest N, precipitation semantics). These are the project's non-negotiable foundations; building any UI on unvalidated assumptions here means rework. The architecture explicitly names this as the only blocking step.
**Delivers:** Confirmed API access with real sample data for 2-3 stations; validated station metadata (IDs, active windows, coordinates); terms/license confirmed; pure TypeScript domain modules (window selection, aggregation, circular wind mean, combined score, box stats) with unit tests including the 350/10 degree regression case; a working aggregator that produces derived/*.json, stations.json, and manifest.json from real data.
**Addresses:** Table-stakes features (period selector math, year-range picker math, combined score); pitfalls 1, 2, 3, 5, 7, 10.
**Avoids:** Building UI on fictitious fixtures; splicing station moves; inheriting wrong wind math.
**Research flag:** Needs --research-phase during planning — specifically to confirm the Veðurstofan terms/conditions page content and verify the api.vedur.is field schema against live responses.

### Phase 2: Map View and Interactive Selection
**Rationale:** The map is the product. With real derived data available and domain logic validated, the map can be built against actual numbers. The period selector, year-range picker, App State, and URL state all belong in this phase because they are tightly coupled to the map's repaint loop — changing any selector must trigger instant in-browser recomputation with no network traffic (the Pattern 1 UX win).
**Delivers:** MapLibre GL JS map of Iceland with PMTiles basemap, station markers colored by combined score, zoom-dependent clustering, period selector and year-range picker wired to App State, instant score recomputation on selection change (no network), shareable URL state, mobile-responsive layout with Iceland bounds constraint, score legend and info panel.
**Uses:** MapLibre GL JS 5.24.0, PMTiles self-hosted Iceland extract, src/domain/ score and aggregation logic, protomaps-themes-base for dark/light mode.
**Implements:** Map View, Data Loader, Aggregation Engine, App State, URL State components.
**Avoids:** Marker clustering pitfall (Pitfall 9), URL-as-store anti-pattern.
**Research flag:** Standard patterns (MapLibre data-driven paint, PMTiles protocol registration, URL state management) — skip research phase unless MapLibre 5.x API has breaking changes from prior experience.

### Phase 3: Station Chart Panel and Ranking
**Rationale:** The chart panel and ranking list are both dependent on the score and aggregation infrastructure built in Phase 1 and the map selection wiring built in Phase 2. They share the derived data already loaded. The "best stations" ranked list is the feature that makes this Betra Veður rather than a generic climate atlas — ship it in the same phase as the chart so the UI coherently answers both "where" (map + ranking) and "why" (chart).
**Delivers:** Station click -> ECharts chart panel with candlestick temperature distribution (percentile body + whiskers, neutral color, Icelandic legend), candlestick wind speed distribution, precipitation bar series, "meðaltal N ára" label from actual data coverage; ranked "best stations for this period" list alongside the map; daylight hours computation for the selected period; mobile bottom-sheet panel.
**Uses:** Apache ECharts 6.1.0 (à-la-carte imports), src/domain/boxstats.ts, lazy per-station file load on click.
**Implements:** Chart Panel, ranked list, mobile bottom-sheet.
**Avoids:** Financial candlestick semantics (Pitfall 7), raw-data-to-browser payload blowout (Pitfall 8).
**Research flag:** ECharts candlestick percentile encoding and box-plot configuration may need targeted research — the library's OHLC defaults must be overridden and the custom legend built. Flag for research phase if the team is unfamiliar with ECharts configuration.

### Phase 4: Production Pipeline and Repo Hardening
**Rationale:** Phases 1-3 prove the product against committed fixtures or a manually-triggered fetch. Phase 4 productionizes the nightly automation and repo-hygiene decisions that determine whether the site remains healthy over months/years of nightly data growth. These are not afterthoughts — repo structure decisions made here (data branch vs. main, file partitioning, content-hashing) are expensive to retrofit.
**Delivers:** Full nightly GitHub Actions workflow (cron + workflow_dispatch): fetch -> normalize -> idempotent upsert -> aggregate touched stations -> commit data branch -> build -> deploy-pages; off-peak schedule; external heartbeat monitor wired to Actions success step; data-freshness date surfaced in the UI from manifest.json; content-hashed derived files with immutable CDN headers; data branch with squash/orphan strategy documented; backfill script (chunked, resumable via workflow_dispatch) for historical load; .git size monitoring in CI.
**Implements:** Fetcher, Normalizer, Appender, nightly workflow, backfill workflow, repo-size strategy.
**Avoids:** Cron silent failure (Pitfall 6), repo bloat (Pitfall 4), blind append (Anti-Pattern 3), full-history re-pull nightly.
**Research flag:** Standard patterns (GitHub Actions cron, deploy-pages action, orphan branch strategy) — skip research phase. The idempotent append pattern and data-branch architecture are already specified in detail in ARCHITECTURE.md.

### Phase Ordering Rationale

- Data first because ARCHITECTURE.md explicitly designates the data-source spike as the only blocking step: "if history/licensing is inadequate the product must pivot." Building the map on wrong assumptions about field names, history depth, or wind direction math means full rework.
- Domain math before any pipeline or UI because src/domain/ is shared — the same aggregation and score code runs in the nightly aggregator and the browser. Getting it right once, with unit tests, before either consumer is built prevents the aggregation-drift failure mode.
- Map before chart because the map is the primary interaction surface and its data loading architecture (all-stations file) determines what the chart can lazily load. The chart is a detail view that plugs into established state.
- Pipeline last because it productionizes what already works against fixtures. The nightly automation runs exactly the same pipeline code already validated locally — no surprises.
- Score weights deliberately deferred to v2+ but data shape decided in Phase 1: precompute component-level aggregates (temp/rain/wind separately), not a single baked score, so sliders can be added later without schema rework.

### Research Flags

Phases likely needing --research-phase during planning:
- **Phase 1:** Veðurstofan API terms/conditions page content needs direct retrieval (timed out during pitfalls research); confirm field schema of aws/day vs synop/day responses against live API for the specific fields used in the score; confirm sunshine data availability (gates v1.x feature).
- **Phase 3:** ECharts percentile/box-plot configuration for the candlestick-style weather encoding is non-trivial if the team is unfamiliar with overriding OHLC defaults; targeted research recommended.

Phases with standard patterns (skip research phase):
- **Phase 2:** MapLibre data-driven paint expressions, PMTiles protocol registration, and URL state management (URLSearchParams + replaceState) are well-documented with official examples.
- **Phase 4:** GitHub Actions cron, deploy-pages, and orphan branch strategy are standard patterns with official documentation. The specific pipeline logic is already designed — implementation is mechanical.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | API verified live (unauthenticated, CC BY 4.0, field names confirmed); npm package versions verified; PMTiles and GitHub Pages limits from official docs |
| Features | MEDIUM-HIGH | Competitor feature set verified via WebFetch; candlestick comprehension concern WebSearch-verified; sunshine data availability is the one unconfirmed dependency |
| Architecture | HIGH | "Baked data + thin client" pattern is well-established; component boundaries and data flows grounded in the confirmed stack; scaling concerns based on official GitHub Pages limits |
| Pitfalls | HIGH (structural), MEDIUM (Veðurstofan terms) | Structural pitfalls (repo bloat, cron, wind math, precipitation) grounded in official docs and technical literature; conditions page timed out — must be read before ingest |

**Overall confidence:** HIGH for technical approach; one hard gate (data terms) must be cleared in Phase 1 before ingest begins.

### Gaps to Address

- **Veðurstofan redistribution terms:** en.vedur.is/about-imo/the-web/conditions timed out during research. This is a Phase 1 gate — must be read before any data ingest or public deployment. The CC BY 4.0 license was confirmed from the OpenAPI spec, but bulk redistribution and rate-limit rules need direct confirmation from the conditions page and possibly direct contact with IMO if ambiguous.
- **Sunshine / cloud-cover data availability:** Many automatic stations lack sunshine sensors. Phase 1 station-metadata audit should explicitly check which stations have sun (sun hours) in SYNOP records and whether coverage is sufficient to include it in the score. If coverage is thin, this feature drops to "link out to climate atlas" rather than v1.x.
- **PMTiles basemap size:** Research estimates 20-80 MB for an Iceland extract at maxzoom 12 (MEDIUM confidence). Run an actual pmtiles extract --bbox=-25,63,-13,67 --maxzoom=12 early in Phase 2 and choose maxzoom based on result.
- **Adjustable score weights data shape:** Even though weight sliders are deferred to v2+, the decision to precompute component-level aggregates (temp/rain/wind separately) rather than a single baked score must be made in Phase 1's schema design. Revisit this explicitly at Phase 1 schema-lock.
- **Station elevation/exposure comparability:** PITFALLS research flags that ranking stations at wildly different elevations as equivalent is misleading. Phase 1 station-metadata audit should tag highland vs. lowland stations and decide whether to exclude outliers from the main ranking or display a caveat.

## Sources

### Primary (HIGH confidence)
- https://api.vedur.is/weather/openapi.json — full OpenAPI 3.1 spec; field names, aggregation enums, CC BY 4.0 license, version 2026-02-17; live API calls confirmed unauthenticated access and history depth
- https://docs.protomaps.com/basemaps/downloads — PMTiles self-hosted basemap, region extraction, maxzoom/size relationship
- https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits — 1 GB site limit, 100 GB/mo bandwidth, ~10 builds/hr
- https://docs.github.com/actions/managing-workflow-runs/disabling-and-enabling-a-workflow — 60-day auto-disable behavior
- npm registry — current package versions (maplibre-gl 5.24.0, pmtiles 4.4.1, echarts 6.1.0, vite 8.1.5)
- https://www.ncl.ucar.edu/Document/Functions/Contributed/wind_stats.shtml — vector/circular wind mean methodology

### Secondary (MEDIUM confidence)
- https://weatherspark.com/ — competitor feature set, Tourism Score pattern, sunshine/daylight features
- https://maplibre.org/maplibre-gl-js/docs/ — data-driven paint expressions, GeoJSON sources
- https://dev.meteostat.net/data/bulk — analogous static per-station data layout (validated architecture pattern)
- https://github.com/orgs/community/discussions/156282 — GitHub Actions cron delay/drop behavior in production
- https://gottvedur.is/en/ — reference UI (MapTiler SDK / MapLibre wrapper, station marker design)

### Tertiary (LOW confidence — must validate in Phase 1)
- https://en.vedur.is/about-imo/the-web/conditions — IMO terms and conditions (page timed out during research; must be read before ingest)
- https://athuganir.vedur.is/ — bulk download portal terms (timed out; may have different terms than API)
- https://en.vedur.is/climatology/data/ — climatology data page; daily/bulk depth details unconfirmed

---
*Research completed: 2026-07-19*
*Ready for roadmap: yes*
