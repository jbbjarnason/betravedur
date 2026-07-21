# Roadmap: Betra Veður

## Overview

Betra Veður is a static "baked-data + thin client" site answering "where in Iceland has the weather historically been best for a given time-of-year window." The build order is dictated by dependency: confirmed data access and correct domain math gate everything, so they come first (Phase 1). A derived-data pipeline turns real observations into compact per-station static files (Phase 2). From there the product surfaces are built against real numbers — the interactive map shell (Phase 3), the instant client-side selection loop (Phase 4), score coloring and the ranked "best stations" answer (Phase 5), the station chart panel (Phase 6), and responsive UX plus trust/empty states (Phase 7). Finally the nightly GitHub Actions automation and repo-hygiene decisions are hardened for years of unattended data growth (Phase 8). Each phase after Phase 2 delivers an observable slice of the running site.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Data Access & Domain Core** - Confirm Veðurstofan API/terms and build the tested, shared domain math (circular wind mean, honest N, precipitation-as-missing, combined score) (completed 2026-07-19)
- [x] **Phase 2: Derived Data Pipeline & Backfill** - Backfill history and precompute compact per-station derived files the browser can aggregate, kept within Pages limits (completed 2026-07-20)
- [x] **Phase 3: Static Site Shell & Interactive Map** - Vite/TS static site with an Icelandic-branded MapLibre map of Iceland showing station markers with historical averages (completed 2026-07-20)
- [x] **Phase 4: Selection & Instant Recompute** - Period and year-range selectors that recompute the map instantly client-side, with honest "meðaltal N ára" and shareable URL state (completed 2026-07-20)
- [x] **Phase 5: Score Coloring & Ranking** - Markers colored by combined score with a legend, a ranked "best stations" list, and a transparent score explainer (completed 2026-07-20)
- [x] **Phase 6: Station Chart Panel** - Station-click chart panel with distribution candlesticks for temp/wind, precipitation bars, daylight hours, and explicit no-data handling (completed 2026-07-20)
- [x] **Phase 7: Responsive UX & Trust States** - Mobile-responsive layout, "historical not forecast" info panel with attribution/freshness, and loading/empty/no-data states throughout (completed 2026-07-20)
- [ ] **Phase 8: Nightly Pipeline & Repo Hardening** - Idempotent nightly GitHub Actions cron that fetches, appends, aggregates, and deploys, with monitoring and bounded repo growth

## Phase Details

### Phase 1: Data Access & Domain Core
**Goal**: Confirmed, license-clear access to real Veðurstofan station data plus a tested, shared TypeScript domain layer that computes correct climatology (window selection, circular wind mean, coverage-honest averages, component-level combined score).
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: DATA-01, DATA-05, DATA-06, DATA-08, SCORE-01
**Success Criteria** (what must be TRUE):
  1. Real daily observations (temp, wind speed+direction, precipitation) can be fetched for 2-3 stations from api.vedur.is with the field schema verified against live responses
  2. Veðurstofan CC BY 4.0 redistribution terms are confirmed and the required attribution text is documented for the UI
  3. A station metadata registry keyed on station ID with active-date windows resolves moves/closures without splicing records
  4. Domain unit tests pass, including the 350°/10° wind case (result ≈ 0°, not 180°), precipitation-missing treated as absent, and "N years" derived from qualifying data coverage
  5. The combined score is computed from separately-precomputed temperature, precipitation, and wind components (weights swappable later)
**Plans**: 4 plans
Plans:
- [x] 01-01-PLAN.md — Walking Skeleton: npm-workspaces TS monorepo, pure @betravedur/domain contracts+stubs, live fetch client, end-to-end demo CLI on real data
- [x] 01-02-PLAN.md — Domain math (DATA-05): leap-folded window, circular wind mean (350/10), coverage-honest N (>=80%, N>=3), precip missing != zero
- [x] 01-03-PLAN.md — Data access (DATA-01/06/08): schema-assert+normalize fetchers, no-splice station registry, CC BY 4.0 attribution constant, live fixtures
- [x] 01-04-PLAN.md — Combined score (SCORE-01): 0-10 component curves, renormalizing combine() with "án úrkomu" flag, close the Walking Skeleton loop
**Research flag**: Retrieve Veðurstofan terms/conditions page directly; verify aws/day vs synop/day field schema live; check sunshine sensor coverage (gates v1.x)

### Phase 2: Derived Data Pipeline & Backfill
**Goal**: A local/manually-triggered pipeline that backfills per-station daily history deep enough for 2010–2015-style ranges and precomputes compact derived files the browser can aggregate over any period × year-range selection, stored within GitHub Pages size limits.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: DATA-02, DATA-04, DATA-07
**Success Criteria** (what must be TRUE):
  1. A one-time backfill produces per-station daily history covering baseline year ranges like 2010–2015
  2. The aggregator emits derived/{station}.json (per-year, per-day-of-year summaries), stations.json, and a content-hashed manifest.json from real data
  3. Derived files are small enough (tens of KB gzipped per station) that the browser can aggregate any selection with no backend
  4. Data lives on a dedicated data branch / partitioned additive files so committing it does not balloon the Pages-build repo history
**Plans**: 4 plans
Plans:
- [x] 02-01-PLAN.md — Pipeline workspace + derive.ts columnar encoder/decoder (season-year round-trip + ≤4KB/station-year size budget)
- [x] 02-02-PLAN.md — Resumable chunked/paced backfill loop + field-pruned idempotent raw store + 413/502/503 fetch taxonomy
- [x] 02-03-PLAN.md — Content-hashed manifest.json (delta property) + stations.json from no-splice registry (≥3 qualifying years)
- [x] 02-04-PLAN.md — Aggregate orchestrator (touched-only) + orphan data branch + real subset backfill (self-verified) + PIPELINE.md

### Phase 3: Static Site Shell & Interactive Map
**Goal**: A deployable Vite/TypeScript static site, Icelandic-branded with "Leitin að betra veðri", showing an interactive pan/zoom MapLibre map of Iceland with station markers displaying the selected period's historical averages at appropriate zoom density.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: MAP-01, MAP-02, MAP-04, UX-01, SITE-01
**Success Criteria** (what must be TRUE):
  1. A visitor can pan and zoom an interactive map of Iceland rendered from a self-hosted PMTiles basemap with no API keys
  2. Station markers show historical averages for the current period: temperature, wind speed + direction arrow, and a precipitation indicator
  3. Marker density adapts to zoom so stations become readable rather than overlapping as the user zooms in
  4. The site is fully static (Vite/TS build), Icelandic-only, carries the slogan in the branding, and builds and deploys to GitHub Pages
**Plans**: 3 plans
Plans:
- [x] 03-01-PLAN.md — Foundation slice: site/ Vite+TS workspace, committed PMTiles Iceland basemap + sample data, MapLibre map + Icelandic header/slogan + CC BY 4.0 attribution, preview-build E2E gate (MAP-01, UX-01, SITE-01)
- [x] 03-02-PLAN.md — Data layer (TDD): manifest hashed-filename resolution + decodeDerived → domain averages → MarkerDatum (án úrkomu / breytileg átt / ófullnægjandi gögn) (MAP-02)
- [x] 03-03-PLAN.md — Marker render slice: symbol-layer collision + hybrid white-pill composite at zoom-adaptive density + full 11-criterion UI-SPEC E2E gate (MAP-02, MAP-04)
**UI hint**: yes

### Phase 4: Selection & Instant Recompute
**Goal**: The core interaction loop — the visitor picks a time-of-year window and a baseline year range and the map recomputes and recolors instantly in-browser with no network fetch, every average honestly labeled with the years it is based on, and the full selection encoded in a shareable URL.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: SEL-01, SEL-02, SEL-03, SEL-04, UX-02
**Success Criteria** (what must be TRUE):
  1. User can select a time-of-year window of 1 week, 2 weeks, 3 weeks, or 1 month
  2. User can select the baseline year range averages are computed over (e.g. 2010–2015)
  3. Every displayed average shows "meðaltal N ára" where N reflects actual data coverage, not the picker range
  4. Changing period or year range recomputes and recolors the map instantly client-side, with no page reload and no network fetch
  5. Period, year range, selected station, and map viewport are encoded in the URL so a copied link restores the exact view
**Plans**: 3 plans
Plans:
- [x] 04-01-PLAN.md — Foundation slice: observable selection store + anchorToWindow + computeMarkerDatum yearRange param + boot-cache recompute (no fetch) + window.__store (SEL-01/02/03/04)
- [x] 04-02-PLAN.md — Bottom control bar: scrubber + width buttons + Frá/Til dropdowns + meðaltal N ára readout wired to the store, no-network recompute E2E (SEL-01/02/03/04)
- [x] 04-03-PLAN.md — URL state: loop-proof round-trip + defensive clamp + union year bounds + default selection + viewport sync + crafted-URL restore E2E (UX-02, SEL-02)
**UI hint**: yes

### Phase 5: Score Coloring & Ranking
**Goal**: The map directly answers "where has it been best" — markers are colored by the combined weather score with a legend, a ranked best-stations list surfaces the answer explicitly, and an explainer makes the score transparent.
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: MAP-03, SCORE-02, SCORE-03
**Success Criteria** (what must be TRUE):
  1. Markers are colored by the combined weather score, with a visible legend explaining the color scale
  2. A ranked "best stations for this period" list is shown and updates with the current selection
  3. An explainer ("hvernig er einkunnin reiknuð?") shows how the score combines temperature, precipitation, and wind
**Plans**: 3 plans
- [x] 05-01-PLAN.md — Data-layer score extension (MarkerDatum.score via combine()) + scoreColor BuGn helper + Wave-0 test scaffolds
- [x] 05-02-PLAN.md — Score-colored markers (ring/badge) + legend & transparent explainer
- [x] 05-03-PLAN.md — Ranked "Bestu staðir" list + row-click fly-to/select
**UI hint**: yes

### Phase 6: Station Chart Panel
**Goal**: Clicking a station opens a detail panel that shows the distribution of weather across the chosen years — distribution-semantics candlesticks for temperature and wind, precipitation as bars, daylight hours for the period — and handles missing data explicitly instead of rendering blank charts.
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: CHART-01, CHART-02, CHART-03, CHART-04
**Success Criteria** (what must be TRUE):
  1. Clicking a station opens a chart panel with per-day candlestick-style temperature and wind distributions and precipitation as bars across the chosen years
  2. Charts use distribution semantics (min / typical range / max, not financial OHLC) with a plain-Icelandic reading key
  3. The panel shows daylight hours for the selected period
  4. When data is absent the panel shows "engin gögn fyrir þetta tímabil" instead of a blank or misleading chart
**Plans**: 3 plans
Plans:
- [x] 06-01-PLAN.md — Wave-0 foundation: pure percentile + perDoyDistribution domain helper, polar-safe daylightHours (suncalc), echarts/suncalc install, panel.spec skeleton + build-size chunk-split gate
- [x] 06-02-PLAN.md — Panel shell: stationId-seam subscriber, open/close + Escape, ranked-list yield/restore, daylight readout, per-/whole-station no-data states, chart-series tokens + panel.css (no fetch)
- [x] 06-03-PLAN.md — Lazy ECharts chart chunk: à-la-carte boxplot (temp/wind) + precip bars, reading keys, aria summaries, reduced-motion, dynamic-import code-split (echarts out of the entry bundle)
**UI hint**: yes
**Research flag**: ECharts percentile/box-plot configuration overriding OHLC defaults may need targeted research

### Phase 7: Responsive UX & Trust States
**Goal**: The site is trustworthy and usable on any device — mobile-responsive with a bottom-sheet panel on phones, an info panel that frames the data as historical (not forecast) with attribution and freshness, and consistent loading/empty/no-data states.
**Mode:** mvp
**Depends on**: Phase 6
**Requirements**: UX-03, UX-04, UX-05
**Success Criteria** (what must be TRUE):
  1. On a phone the station detail appears as a bottom sheet; on desktop it appears as a side panel, and the map remains usable at both sizes
  2. An info panel explains "sögulegt meðaltal, ekki spá" and shows Veðurstofan attribution plus data currency ("uppfært í nótt")
  3. Map and panels show clear loading, empty, and no-data states rather than blank or broken screens
**Plans**: 3 plans
Plans:
- [x] 07-01-PLAN.md — Trust-states foundation: Wave-0 test harness + freshness/bottom-sheet pure helpers + the three UX-05 state seams (loading / map-error / empty-stations)
- [x] 07-02-PLAN.md — Info/trust panel (UX-04) + attribution-solve-once: i button + native <dialog> ("ekki spá" + ATTRIBUTION + uppfært freshness) + first-visit localStorage; delete controls.css hacks for --attrib-safe-bottom
- [x] 07-03-PLAN.md — Mobile bottom sheet (UX-03): matchMedia-gated Pointer-Events drag controller + ranked/legend chips + responsive control bar + attribution reflow above the sheet peek
**UI hint**: yes

### Phase 8: Nightly Pipeline & Repo Hardening
**Goal**: The site stays fresh unattended for years — a nightly GitHub Actions cron fetches new observations, appends them idempotently with gap-fill, aggregates only touched stations, and redeploys, with monitoring against silent failure and bounded repo growth.
**Mode:** mvp
**Depends on**: Phase 7
**Requirements**: DATA-03
**Success Criteria** (what must be TRUE):
  1. A nightly cron (plus workflow_dispatch) fetches everything since the last stored observation, upserts by station+date, is safe to re-run, and self-heals a missed night
  2. On new data the workflow aggregates touched stations, commits to the data branch, builds, and deploys to Pages automatically
  3. The pipeline runs off-peak with an external heartbeat so a silent stall is detectable, and the UI surfaces the resulting freshness date
  4. Nightly commits do not balloon .git history — data-branch partitioning / squash strategy keeps the repo within Pages limits
**Plans**: 3 plans
Plans:
- [x] 08-01-PLAN.md — Wave 0 foundation: --root flag on all pipeline CLIs (data dir vs branch collision fix) + missed-night self-heal test + full_backfill station enumeration + ship-set copy (no raw/)
- [ ] 08-02-PLAN.md — nightly.yml workflow (off-peak cron + full_backfill dispatch + concurrency + least-privilege perms + test-gate + skip-empty + guarded heartbeat + deploy-pages@v4) + workflow-assertion test
- [ ] 08-03-PLAN.md — Repo hardening: squash-reset.yml (force-push scoped to data, branch-asserted, never main) + PIPELINE.md live prereqs & squash cadence + force-push-scoping gate test

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Access & Domain Core | 4/4 | Complete   | 2026-07-19 |
| 2. Derived Data Pipeline & Backfill | 4/4 | Complete   | 2026-07-20 |
| 3. Static Site Shell & Interactive Map | 3/3 | Complete   | 2026-07-20 |
| 4. Selection & Instant Recompute | 3/3 | Complete   | 2026-07-20 |
| 5. Score Coloring & Ranking | 3/3 | Complete   | 2026-07-20 |
| 6. Station Chart Panel | 3/3 | Complete   | 2026-07-20 |
| 7. Responsive UX & Trust States | 3/3 | Complete   | 2026-07-20 |
| 8. Nightly Pipeline & Repo Hardening | 1/3 | In Progress|  |
