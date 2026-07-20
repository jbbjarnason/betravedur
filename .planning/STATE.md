---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 04-01-PLAN.md
last_updated: "2026-07-20T10:08:06.894Z"
last_activity: 2026-07-20
progress:
  total_phases: 8
  completed_phases: 3
  total_plans: 14
  completed_plans: 12
  percent: 38
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-19)

**Core value:** A visitor picks a time-of-year period and instantly sees, on a map, where in Iceland the weather has historically been best — backed by real Veðurstofan station history.
**Current focus:** Phase 4 — Selection & Instant Recompute

## Current Position

Phase: 4 (Selection & Instant Recompute) — EXECUTING
Plan: 2 of 3
Status: Ready to execute
Last activity: 2026-07-20

Progress: [█████████░] 86%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: - min
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
| Phase 1 P01 | 8 | 4 tasks | 43 files |
| Phase 1 P02 | 6 | 2 tasks | 8 files |
| Phase 1 P03 | 12 | 2 tasks | 13 files |
| Phase 1 P04 | 5 | 2 tasks | 4 files |
| Phase 2 P01 | 20 | 2 tasks | 5 files |
| Phase 02 P02 | 6min | 2 tasks | 11 files |
| Phase 02 P03 | 3min | 2 tasks | 6 files |
| Phase 2 P04 | 7min | 2 tasks | 5 files |
| Phase 03 P01 | 12 | 2 tasks | 17 files |
| Phase 03 P02 | 5 | 2 tasks | 6 files |
| Phase 03 P03 | 7min | 2 tasks | 5 files |
| Phase 04 P01 | 4 min | 3 tasks | 9 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: Data access + domain math is the sole blocking foundation (Phase 1) — no UI is built on unvalidated data assumptions.
- Roadmap: Precompute component-level aggregates (temp/rain/wind separately), not a single baked score, so weight sliders remain possible later.
- Roadmap: Data lives on a dedicated data branch to keep nightly commits out of the Pages-build repo history.
- User directive (2026-07-19): No human review checkpoints — Claude performs all `checkpoint:human-verify` tasks and `human_needed` verification items itself, thoroughly (run the commands, inspect real output, cross-check acceptance criteria, document evidence). Pause only for real blockers or product-level grey areas.
- User directive (2026-07-19): UI phases (3–7) must be verified with Playwright driving the real built site (installed via npm in-repo; no Playwright MCP available) — exercise map/selectors/panels and capture screenshots as evidence.
- Contract (Phase 1 fix WR-01): `combine()` returns `score: null` (never NaN/0) when no components contribute — downstream display must render null as "unscorable" ("ófullnægjandi gögn"), never as 0/10.
- Domain API (Phase 1 fix WR-03): wrapping Dec→Jan windows use `groupBySeasonYear` (Dec head owns the year) — Phase 2 aggregator must use season-year grouping, not calendar-year.
- Research finding (Phase 1): precipitation exists only on ~8 active SYNOP stations; AWS stations have temp+wind only. Score uses weight renormalization over available components with "án úrkomu" badge (locked in 01-CONTEXT.md).
- [Phase ?]: Plan 01-01 walking skeleton: npm-workspaces TS monorepo; @betravedur/domain pure/zero-dep/browser-safe with interface-first stubs; live fetch client + demo CLI verified real api.vedur.is data reaches the domain boundary (AWS dv-present/rain-null, SYNOP rain-present/dv-null).
- [Phase ?]: Plan 01-02: coverage-honest climatology math (leap-fold, >=80%/N>=3, unit-vector wind mean 350/10->~0, precip missing!=zero) implemented TDD; domain stays dependency-free.
- [Phase ?]: Plan 01-03: hardened api.vedur.is trust boundary (SCHEMA_DRIFT assert, error-body detect, range-clamp, leap-folded doy Feb-29 drop) + no-splice integer-keyed registry + CC BY 4.0 ATTRIBUTION.
- [Phase ?]: Plan 01-04: combined weather score (SCORE-01) — fixed explainable 0-10 curves + renormalizing combine() with contributing/missingRain 'án úrkomu'; Walking Skeleton closed end-to-end on real data.
- [Phase ?]: Plan 02-01: derived-file format is columnar integer-quantized implicit-date (encodeDerived/decodeDerived); columns stored by CALENDAR year, both pipeline and client re-group via groupBySeasonYear after decode (WR-03) — December never pre-shifted in storage.
- [Phase ?]: Plan 02-01: derived encoding holds 1757 B/station-year gzip on a real 6-year Keflavik AWS fixture (<4 KB budget); nulls preserved (never 0), all-null columns dropped, AWS omits r / SYNOP omits dv.
- [Phase ?]: Plan 02-02: backfill error-taxonomy — 413 unretried/halve, 502 backoff-then-halve, 503 propagates (never []), 404 empty-advance; ApiHttpError.status is the single branch point.
- [Phase ?]: Plan 02-02: raw store persists exactly 10 DailyObservation fields via explicit fixed-order record build (no spread) => field-pruned AND byte-identical idempotent partitions; highWaterYear drives resume, wired now not in 02-04.
- [Phase 02]: Plan 02-03: content-addressed manifest — contentHash = sha256(derivedBytes).slice(0,12); updateManifest is pure and rewrites a station's hashed filename derived/{station}.{hash}.json + high-water marks IFF its bytes change (returning-visitor cache deltas).
- [Phase 02]: Plan 02-03: buildStationsJson gates the no-splice registry on >=3 qualifying years of REAL data via domain effectiveN (not start); decommissioned stations clearing the bar retained; entries built field-by-field (no spread).
- [Phase 03]: Plan 03-01: site/ Vite+TS workspace ships a deployable /betravedur/ base-path dist; self-hosted iceland.pmtiles maxzoom-9 extract is 7.3 MiB (no API keys); grayscale basemap muted to #E8EBED via pure paint override; preview-build Playwright E2E pins the Vite×MapLibre A1 worker risk (5/5 green); attribution sourced from domain ATTRIBUTION.
- [Phase 03]: Plan 03-02: pure Node-free client data slice — resolveDerivedFile reads manifest.stations[id].file (hashed name, null on unknown/malformed, never throws); computeMarkerDatum decodes via @betravedur/pipeline/derive then runs domain math into MarkerDatum with án úrkomu (hasPrecip=false, still emitted), breytileg átt (dir null or resultantSpeed<0.5), and ófullnægjandi gögn (N<3 → tempC null); DEFAULT_WINDOW {197,210} is the single fixed-period source until Phase 4.
- [Phase ?]: [Phase 03] Plan 03-03: hybrid marker system — invisible MapLibre symbol layer owns native zoom-adaptive collision (text-allow-overlap:false + symbol-sort-key + text-opacity:0); rich white-pill callouts drawn ONLY for post-collision queryRenderedFeatures survivors into a single reused #marker-overlay (no maplibregl.Marker, grep-gated); accent red reserved to temp numeral; insufficient stations emitted muted (ófullnægjandi gögn) not filtered; pills are focus-ready <button data-station> skeletons, NO click handler (Phase-6 seam); all 11 UI-SPEC criteria green on preview build — MAP-02, MAP-04, Phase 3 complete.
- [Phase 04]: [Phase 04] Plan 04-01: SelectionState SoT = vanilla observable store (Object.freeze + Set<Listener> + no-op-skip, zero deps); anchorToWindow -> wrap-aware WindowSpec (anchor=start); computeMarkerDatum yearRange filters season-year keys before effectiveN so N is honest qualifying-years-in-range; boot caches derived files once, debounced 120ms store subscriber recomputes over cache with NO fetch (SEL-04); window.__store exposed; temporary bootstrap default left for Plan 03. — Phase-4 core: the load-bearing selection + instant-recompute slice Plans 02/03 and Phase 5/6 build on.

### Pending Todos

- Phase 7 (UX-05): map-load error UI ("Ekki tókst að hlaða kortið" / "Reyndu að hlaða síðunni aftur.") — Phase 3 UI review flagged the map error path silently console.errors. Belongs to Phase 7's loading/empty/no-data states.
- Phase 7 (UX-05): empty "Engar veðurstöðvar" state when stations.json is empty/404 — deferred from Phase 3 UI review; matters for full-dataset deploy.
- Basemap: country renders both "ICELAND" and "Ísland" despite lang:"is" (Protomaps grayscale flavor limitation) — revisit at a future basemap refresh, not blocking.

### Blockers/Concerns

- Phase 1 gate: Veðurstofan redistribution terms (en.vedur.is/about-imo/the-web/conditions) timed out during research — must be read/confirmed before any data ingest or public deploy.
- Phase 1 gate: sunshine/cloud-cover sensor coverage unconfirmed — determines whether SUN-01 (v2) is ever viable.
- Phase 2 concern: PMTiles Iceland extract size (est. 20–80 MB) unverified — run an actual extract early to pick maxzoom.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-07-20T10:07:40.640Z
Stopped at: Completed 04-01-PLAN.md
Resume file: None
