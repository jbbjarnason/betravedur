---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: milestone_complete
stopped_at: v1.0 milestone complete — all 8 phases verified, milestone audit passed
last_updated: "2026-07-21T06:54:55.351Z"
last_activity: 2026-07-21
progress:
  total_phases: 8
  completed_phases: 8
  total_plans: 26
  completed_plans: 26
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-19)

**Core value:** A visitor picks a time-of-year period and instantly sees, on a map, where in Iceland the weather has historically been best — backed by real Veðurstofan station history.
**Current focus:** Phase 8 — Nightly Pipeline & Repo Hardening

## Current Position

Phase: 8 (Nightly Pipeline & Repo Hardening) — COMPLETE
Plan: 3 of 3
Status: Phase complete
Last activity: 2026-07-21

Progress: [██████████] 96%

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
| Phase 04 P02 | 15min | 3 tasks | 8 files |
| Phase 04 P03 | 7.5min | 3 tasks | 11 files |
| Phase 05 P01 | 8 | 3 tasks | 8 files |
| Phase 05 P02 | 7min | 3 tasks | 9 files |
| Phase 05 P03 | 12 | 3 tasks | 6 files |
| Phase 06 P01 | 8min | 3 tasks | 9 files |
| Phase 06 P02 | 12min | 2 tasks | 9 files |
| Phase 06 P03 | 12 | 2 tasks | 4 files |
| Phase 07 P01 | 8min | 3 tasks | 11 files |
| Phase 07 P02 | 60min | 2 tasks | 12 files |
| Phase 07 P03 | 12 | 2 tasks | 9 files |
| Phase 08 P02 | 5min | 2 tasks | 2 files |
| Phase 08 P03 | 4min | 3 tasks | 3 files |

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
- [Phase 04]: Plan 04-02: bottom control bar — framework-free control builders (scrubber/width/year) store-agnostic, wired via controlBar to store.set; global meðaltal N ára readout reads a module-level latestData snapshot via a getLatestData getter (pinned, not optional); year bounds derived from manifest union; native range/select/button for free a11y; selection.spec proves width/scrubber/year recompute re-renders markers with ZERO /data/ requests + 500px stepper; controls.css uses 0 accent refs.
- [Phase 04]: Plan 04-03: loop-proof state↔URL round-trip (write-always via writeUrl / read-on-popstate-only; NO isUpdating flag) + defensive paramsToState (clamp/fallback, never throws/NaN, T-04-05/06); data-derived defaultSelection (today's leap-folded doy, 1 vika, last-10 manifest-union years) REPLACES the Phase-3 fixed DEFAULT_WINDOW; map owns its viewport (moveend→store→replaceState, jumpTo only on boot/popstate); crafted-URL→exact-view restore proven E2E (16 tests). Phase 4 complete.
- [Phase ?]: [Phase 05] Plan 05-01: MarkerDatum carries score:number|null + missingRain via domain combine(); rain gated on hasPrecipQual so rain-less AWS scores 'án úrkomu' renormalized (never dry-as-10); score:null ⇔ off-scale; pure scoreColor BuGn ramp (never accent red); Wave-0 score.spec skeleton green — MAP-03 data gate closed.
- [Phase ?]: [Phase 05] Plan 05-02: score-colored markers — BuGn 4-6px left color-bar (inline --pill-score=scoreColor) over a --hairline floor (Pitfall 3, not a thin ring) + always-visible ink-on-white numeric badge (Icelandic comma); muted/null pills stay off-ramp (T-05-04). Bottom-left legend (BuGn scale + 0-10 ticks + verra/betra) with a native <details> explainer (úrkoma 40% / vindur 30% / hiti 30% + án-úrkomu renormalization, SCORE-03). RECONCILED ramp to BuGn end-to-end (--score-* = scoreColor sampled; UI-SPEC slate table superseded). MAP-03 + SCORE-03.
- [Phase ?]: Plan 05-03: ranked Bestu staðir panel (SCORE-02) complete — sorted-desc list, row-click easeTo/select via Phase-4 st seam, reciprocal marker+row highlight, no chart panel; all 14 UI-SPEC criteria green; Phase 5 complete.
- [Phase 06]: [Phase 06] Plan 06-01: per-doy distribution foundation — percentile (type-7) + perDoyDistribution + perDoyPrecip in @betravedur/domain operating on DECODED DailyObservation[] (not DerivedFile) so the domain stays zero-dep; reshape mirrors computeMarkerDatum (qualifyingYears 0.8 + effectiveN N>=3) so panel coverage honesty == map; precip = per-doy MEDIAN total, empty bucket -> {missing:true} explicit gap never a zero box/bar. daylightHours polar-safe via suncalc 2.0.1 (branch alwaysUp/alwaysDown then null sunrise/sunset -> sun noon-altitude), no NaN at Iceland solstices. echarts 6.1.0 + suncalc 2.0.1 pinned exact in site, no @types stubs, no postinstall. panel.spec skeleton: 14 UI-SPEC criteria fixme + build-size chunk-split gate. tsc 0 errors, full unit+E2E green.
- [Phase 06]: [Phase 06] Plan 06-02: station chart panel SHELL — mountStationPanel subscribes to the single Phase-5 stationId seam (open on non-null, teardown + un-yield on null); close button AND Escape both store.set({stationId:null}) so the existing Phase-4 URL st clearing + marker deselect run for free. Ranked "Bestu staðir" list YIELDS (hide-not-destroy setYielded) while open, restores exactly on close. Marker-click open delegated from #marker-overlay -> setDiscrete stationId (markers.ts stays store-free). Daylight readout (midpoint doy, polar-safe Icelandic copy) + three-granularity no-data (per-chart / án-úrkomu / whole-station Engin gögn) render immediately from the boot StationCache — ZERO data fetch on open (E2E criterion 10). renderChartInto is a hleð riti… stub Plan 03 fills with lazy ECharts. Comma decimal owned via toFixed+replace (is-IS locale fell back to a dot in headless). --chart-temp/wind/precip tokens distinct from --score-*/--accent. tsc 0, full E2E green (61 pass, 5 Plan-03 fixmes), 281 unit pass.
- [Phase 06]: [Phase 06] Plan 06-03: lazy ECharts chart chunk — chartPanel.ts (à-la-carte echarts/core + BoxplotChart/BarChart + Grid/Tooltip/Title + CanvasRenderer, echarts.use) renders honest distribution BOXPLOTS for temp/wind (box p10–p90, median line, min/max whiskers, single neutral --chart-temp/--chart-wind tone, NOT candlestick, no directional color) + precip BARS (per-doy median; missing doy = ECharts empty-value '-' marker = explicit gap, never a zero bar), reached via memoized import('./chartPanel.js') from the stationPanel renderChartInto seam so Vite code-splits echarts OUT of the entry bundle (build-size gate green: echarts in chartPanel-*.js chunk, entry chunk echarts-free). Chart tones resolved in the shell (getComputedStyle :root) and passed as hex across the seam — no charting-lib type crosses the boundary. Canvas a11y = role=img + aria-label distribution summary + visually-hidden per-day table; reduced-motion -> animation:false (window.__chartOptions reset per open, E2E asserts it); tooltip formatters return plain Icelandic strings (no HTML injection, V11); chunk-load rejection -> engin gögn fallback (never hang/throw, T-06-08). All 14 panel.spec criteria + build gate green; full E2E 66 pass + unit 281 pass; tsc 0. Phase 6 COMPLETE (CHART-01/02/03/04).
- [Phase 07]: Plan 07-01: trust-states foundation — freshness client-side from manifest max(lastFetched) (no pipeline change, preserves Phase-2 determinism) + hand-rolled Icelandic date (null-tolerant, never Invalid Date); three distinct UX-05 seams (init.ts map.on error->showMapError, main.ts showLoading/hideLoading, empty/catch->showEmptyState); states.ts z30 overlay + aria-live, trust.css .bv-state no accent/score/chart; bottomSheet MOBILE_QUERY 640px + snapNearest + typed attachSheet stub; Wave-0 E2E states active + responsive/info fixmes; 74 E2E/302 unit pass, tsc 0, no new deps.
- [Phase 07]: Plan 07-02: info/trust panel (UX-04) — native <dialog> (i button top-right) with the prominent "Þetta er sögulegt meðaltal, ekki spá." lead + domain-ATTRIBUTION CC BY 4.0/OSM/Protomaps credit + Icelandic "uppfært {date}" (createElement/textContent only, real <a> anchors — T-07-04 no innerHTML); first-visit auto-open once via localStorage bv:info-dismissed, permalink-guarded (location.search.length>1 suppresses). ATTRIBUTION-SOLVE-ONCE: the three controls.css hacks (--bar-height lift, 60vw cap, .panel-open push) DELETED, replaced by one --attrib-safe-bottom safe-zone rule; compact:true (i) control + always-legible info-panel credit satisfy the CC BY 4.0 collapse-behind-(i) allowance. Info-panel unit test uses a pure infoPanelSections content model (Node vitest, no jsdom/new dep). E2E: info.spec 6-9/18 active (6 at 1280+390), shell.spec harmonized licensing 10-12 green before/after; prior-phase specs seed bv:info-dismissed so the auto-open modal never intercepts clicks. 82 E2E pass, 8 skip (Plan-03 fixmes), 308 unit, tsc 0, no new deps.
- [Phase ?]: [Phase 07] Plan 07-03: mobile bottom sheet (UX-03) — filled attachSheet with a matchMedia(640px)-gated Pointer-Events drag controller (setPointerCapture, translateY peek↔expanded via snapNearest, NON-MODAL so the map stays pannable, keyboard toggle via toggleTarget); per-open attach/detach in stationPanel (Pitfall 1). panel.css promotes .station-panel to a bottom sheet (svh clamps, z20, .station-panel__handle grabber). Mobile 'Bestu staðir'/'Einkunn' chips (ranked force-collapsed by setYielded while the sheet is open). onSnap raises --attrib-safe-bottom to the sheet top so the CC BY 4.0/OSM credit stays above the peek; Tab focus-trap gated to desktop. controls.css <640px reflow => no overflow at 390. responsive.spec 1-5/10-12/17/19 green; full E2E 92 pass/0 fail, 312 unit, tsc 0, no new deps. Phase 7 COMPLETE.
- [Phase ?]: [Phase 08] Plan 08-02: nightly.yml operationalizes the Phase-2 pipeline — off-peak cron 37 4 + workflow_dispatch full_backfill, test/typecheck GATE before any push, --root ./data-wt worktree wiring, skip-empty commit, guarded heartbeat, deploy-pages@v4; fast-forward push origin data only (zero --force, never main). workflow.test.ts gates every invariant via zero-dep text/regex + line-index ordering proof + quote-aware inline-comment stripping. DATA-03.
- [Phase ?]: [Phase 08] Plan 08-03: repo hardening — squash-reset.yml (workflow_dispatch + optional monthly cron 17 5 1 * *, contents:write ONLY, no pages/id-token) bounds .git growth by asserting abbrev-ref HEAD == data BEFORE the only force-push (git push --force origin data, explicit ref; never main); shares the betravedur-data-branch concurrency group so a squash never races a nightly push; checkout pinned @v4. PIPELINE.md §8 documents the two live prerequisites (push repo to GitHub — data branch's first push comes from the workflow — + Pages Source=GitHub Actions), off-peak cron 37 4, full_backfill one-command national seed, HEARTBEAT_URL graceful no-op + 60-day-disable keepalive, and the squash cadence; the Phase-2 push-deferred-to-Phase-8 note is resolved (§1-7 intact). squash-workflow.test.ts is the T-08-10 gate: zero-dep text parse, comment-strip, proves branch-assertion-before-force-push + scoped-to-origin-data + no main + no pages/id-token. Full suite 353 pass/3 skip, tsc 0, zero new deps. Phase 8 COMPLETE (DATA-03).

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

Last session: 2026-07-21T06:54:50.670Z
Stopped at: Completed 08-03-PLAN.md
Resume file: None
