---
phase: 06-station-chart-panel
plan: 02
subsystem: ui
tags: [panel, station-detail, daylight, suncalc, no-data-states, ranked-yield, playwright, tdd]

# Dependency graph
requires:
  - phase: 06-station-chart-panel (Plan 01)
    provides: perDoyDistribution / perDoyPrecip (per-doy sufficiency gate) + daylightHours (polar-safe) + the panel.spec E2E skeleton this plan un-fixmes
  - phase: 04-selection-instant-recompute
    provides: the store stationId seam (open/close signal), anchorToWindow, the StationCache (read, never fetch), and the URL `st` clearing subscriber reused on close
  - phase: 05-score-coloring-ranking
    provides: the ranked "Bestu staðir" list that YIELDS while the panel is open; the discrete select seam (setDiscrete) reused by the marker-click open
provides:
  - "mountStationPanel(store, cache, getLatestData, rankedList): the store-driven station chart panel shell — opens a right-side <section.station-panel aria-label={name}> on non-null stationId, tears down + un-yields the ranked list on null"
  - "RankedListHandle.setYielded(bool): hide-not-destroy yield/restore for the ranked list while the panel is open"
  - "--chart-temp/--chart-wind/--chart-precip series tokens (distinct from --score-* and --accent) + panel.css right-dock chrome"
  - "The renderChartInto seam (stub showing `hleð riti…`) Plan 03 fills with the lazy ECharts render"
  - "The marker-click open seam: #marker-overlay click delegation → setDiscrete stationId (the marker half of 'marker OR ranked-row click both open the panel')"
affects: [06-03 lazy ECharts chart render (fills renderChartInto + un-fixmes criteria 2/11/12/14 + the chunk-split gate), 07-loading-empty-states (promotes the panel to a bottom sheet; owns the fuller loading/no-data chrome)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Store-driven panel lifecycle: a single stationId subscriber owns open(non-null)/teardown(null); the close button + Escape both funnel through store.set({stationId:null}) so the existing Phase-4 URL/marker subscribers clear `st` and deselect for free (no new URL/highlight code in the panel)"
    - "Yield-not-destroy: setYielded toggles the ranked list's `hidden`/`.ranked-list--yielded` (display:none override) — the row subscriptions, reconcile map, and collapsed state all survive, so the list restores exactly as the user left it"
    - "markers.ts stays store-free: the marker-click open is a delegated listener on the persistent #marker-overlay in main.ts (reads the queryable data-station id), mirroring the ranked-row select seam — no store import leaks into the render layer"
    - "Deterministic Icelandic comma decimal via toFixed(d).replace('.',',') (matching formatScore), NOT Intl.NumberFormat('is-IS') — the headless runtime's ICU falls back to a dot separator, which would silently emit '18.8'"

key-files:
  created:
    - site/src/ui/stationPanel.ts
    - site/src/styles/panel.css
  modified:
    - site/src/ui/rankedList.ts
    - site/src/styles/tokens.css
    - site/src/styles/score.css
    - site/src/map/markers.ts
    - site/src/main.ts
    - site/tests/e2e/panel.spec.ts

key-decisions:
  - "Daylight uses the window MIDPOINT doy (UI-SPEC permitted midpoint over range — simpler and honest for a short window); polar cases render the Icelandic copy 'sólarhringsbirta' / 'nær engin dagsbirta', never a NaN"
  - "Comma decimal owned deterministically (toFixed+replace), not the is-IS locale — the locale fell back to a dot in the headless Chromium runtime (would have silently failed criteria 4 + 13)"
  - "Marker pills enter the tab order (tabIndex 0) so keyboard users can select a station to open the panel; the click/keyboard handler is delegated from #marker-overlay in main.ts (markers.ts stays store-free)"
  - "An uncached/muted station (no derived file) still gets a panel — name+daylight from lat/lon, whole-station 'Engin gögn' body — never a throw or white-screen (T-06-05 / V7 honesty)"

patterns-established:
  - "Panel figure builder: title (figcaption) + chart slot (chart stub OR no-data text) + reading key with a per-series swatch; the slot content is chosen by a three-way {chart | nodata} state per metric"
  - "Three-granularity no-data (CHART-04): per-metric insufficiency → per-chart 'engin gögn fyrir þetta tímabil'; hasPrecip===false → 'engin úrkomumæling á þessari stöð'; all-three-insufficient → panel-level 'Engin gögn' (daylight still renders)"
  - "CSS yield fix: an explicit .ranked-list--yielded/[hidden] { display:none } is required because the .ranked-list { display:flex } rule overrides the UA [hidden] rule"

requirements-completed: [CHART-01, CHART-03, CHART-04]

# Metrics
duration: 12min
completed: 2026-07-20
---

# Phase 6 Plan 02: Station Chart Panel Shell Summary

**A store-driven right-side station panel that opens on marker/ranked-row select (yielding the "Bestu staðir" list), renders a polar-safe comma-decimal daylight readout and honest three-granularity no-data text immediately from the in-memory StationCache (zero data fetch), and exposes a `renderChartInto` stub (`hleð riti…`) Plan 03 fills with the lazy ECharts charts — with panel.spec criteria 1,3,4,5,6-text,7,8,9,10,13 flipped green.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-20T14:14:26Z
- **Completed:** 2026-07-20T14:26:33Z
- **Tasks:** 2 (both TDD)
- **Files modified:** 9 (2 created, 7 modified)

## Accomplishments
- `mountStationPanel` — the whole open/close/yield lifecycle wired to the single Phase-5 `stationId` seam: opens a titled right-side panel (station name via textContent + a `Loka` close button ≥44px with an ink focus ring) on select, tears it down and restores the ranked list on deselect. Close button AND Escape both `store.set({ stationId: null })`, so the existing Phase-4 subscribers clear the URL `st` and deselect the marker for free.
- Live, data-independent **daylight readout** (Dagsbirta + comma-decimal `klst.`) from `daylightHours` over the window midpoint — renders even for a data-less station (whole-station-empty), polar-safe (Icelandic copy, never NaN).
- **Three-granularity no-data** (CHART-04) computed from `perDoyDistribution`/`perDoyPrecip` over the same window+yearRange the markers use: per-chart `engin gögn fyrir þetta tímabil`, án-úrkomu `engin úrkomumæling á þessari stöð`, and panel-level `Engin gögn` — all real text, never a blank canvas.
- **Ranked-list yield/restore** (hide-not-destroy) via the new `RankedListHandle.setYielded`; the three chart-series tokens (`--chart-temp`/`--chart-wind`/`--chart-precip`, distinct from the score ramp + reserved accent) and the right-dock `panel.css` chrome.
- **Marker-click open seam**: `#marker-overlay` click delegation → the Phase-4 discrete select seam, completing the "marker OR ranked-row click both open the panel" contract (markers.ts stays store-free).
- **Zero data fetch on open** (E2E criterion 10 green — reads the boot cache). `tsc` 0 errors; full site E2E green (61 passed, 5 Plan-03 fixmes skipped); full unit suite green (281 passed).

## Task Commits

Each task was committed atomically (both TDD → RED test then GREEN feat):

1. **Task 1: Ranked-list yield seam + chart-series tokens + panel.css** — `569b670` (feat) [verify = `tsc --noEmit`, no separate RED test — CSS/token/handle scaffolding]
2. **Task 2: stationPanel shell + main.ts wiring** — RED `8eb2828` (test: un-fixme criteria) → GREEN `af73a40` (feat) → `67c99d1` (docs: clear the no-innerHTML grep gate)

## Files Created/Modified
- `site/src/ui/stationPanel.ts` — the panel shell: stationId subscriber, open/close/yield lifecycle, header (name + Loka close), scrollable body with three titled figures + reading keys + three-granularity no-data, daylight readout, and the `renderChartInto` stub seam.
- `site/src/styles/panel.css` — right-dock `station-panel` chrome (surface treatment reused from the Phase 3/4/5 header/legend/ranked list), header/close, scrollable body, figure/reading-key/no-data/daylight styles, narrow-screen over-map treatment; zero `--accent`/`--score-*` references.
- `site/src/ui/rankedList.ts` — `RankedListHandle.setYielded(bool)` (hide-not-destroy yield/restore).
- `site/src/styles/tokens.css` — `--chart-temp #b26a3d` / `--chart-wind #3d6e8c` / `--chart-precip #4a5a6a` after the `--score-*` family.
- `site/src/styles/score.css` — explicit `.ranked-list--yielded`/`.ranked-list[hidden] { display:none }` (overrides the `display:flex` that beat the UA `[hidden]` rule).
- `site/src/map/markers.ts` — pills enter the tab order (tabIndex 0) for keyboard select.
- `site/src/main.ts` — import panel.css; mount the panel after the ranked list; delegate `#marker-overlay` clicks to `setDiscrete(store, { stationId })`.
- `site/tests/e2e/panel.spec.ts` — un-fixme'd criteria 1,3,4,5,6-text,7,8,9,10,13 (criterion 6's canvas assertions deferred to 06-03).

## Decisions Made
- **Daylight = window midpoint doy** (UI-SPEC permitted midpoint over range). Polar cases render `sólarhringsbirta` / `nær engin dagsbirta`, never a NaN.
- **Comma decimal owned deterministically** (`toFixed(1).replace('.', ',')`, matching `formatScore`) rather than `Intl.NumberFormat("is-IS")` — the headless Chromium runtime's ICU fell back to a DOT separator (`18.8`), which would have silently failed criteria 4 + 13. Documented in `formatIce`.
- **Marker pills tabbable (tabIndex 0)** so keyboard users can open the panel; the handler is delegated from `#marker-overlay` in main.ts so markers.ts never imports the store.
- **Uncached/muted station still gets a panel** (name+daylight from lat/lon, whole-station `Engin gögn`), never a throw — the honest degrade path (T-06-05 / V7).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] is-IS locale emitted a dot decimal in the headless runtime**
- **Found during:** Task 2 (GREEN — criteria 4 + 13 failed)
- **Issue:** `Intl.NumberFormat("is-IS")` returned `18.8 klst.` (dot separator) in the Playwright/headless Chromium runtime whose ICU lacks full is-IS data — violating the Icelandic comma-decimal contract (criteria 4 + 13 expect `\d+,\d+`).
- **Fix:** Format the daylight value deterministically as `toFixed(1).replace('.', ',')` (the same approach `formatScore` already uses for the marker badge), so the comma separator is owned, never locale-dependent.
- **Files modified:** site/src/ui/stationPanel.ts (`formatIce`)
- **Verification:** criteria 4 + 13 green; the on-screen readout shows `18,8 klst.` (evidence screenshot).
- **Committed in:** af73a40 (Task 2 GREEN)

**2. [Rule 1 - Bug] `hidden` attribute did not hide the ranked list (CSS override)**
- **Found during:** Task 2 (GREEN — criterion 8 failed: ranked list still "visible" while the panel was open)
- **Issue:** `setYielded(true)` set the section's `hidden` attribute + `.ranked-list--yielded` class, but the `.ranked-list { display: flex }` rule OVERRIDES the UA `[hidden] { display:none }` rule, so the list stayed visible.
- **Fix:** Added an explicit `.ranked-list--yielded, .ranked-list[hidden] { display: none }` rule (equal specificity, later in the cascade) to score.css.
- **Files modified:** site/src/styles/score.css
- **Verification:** criterion 8 green (ranked list `toBeHidden` while the panel is open); the close/restore evidence screenshot shows the list back.
- **Committed in:** af73a40 (Task 2 GREEN)

**3. [Rule 3 - Blocking] Marker pills had no click handler (open seam missing)**
- **Found during:** Task 2 (GREEN — criterion 1 could not open the panel via a marker click)
- **Issue:** Phase 3 left the marker pills as focus-ready skeletons with NO click handler and `tabIndex = -1` (the Phase-6 select seam). Criterion 1's `openPanelViaMarker` clicks a pill and expects the panel to open, so the marker half of the select seam had to exist for the panel to be reachable.
- **Fix:** Delegated `#marker-overlay` clicks in main.ts to `setDiscrete(store, { stationId })` (reusing the Phase-4 discrete seam, mirroring the ranked-row) and set the pill `tabIndex` to 0 for keyboard select. markers.ts stays store-free (RESEARCH Pattern 2). This is squarely in-plan (the plan's own truth: "Clicking a station (marker or ranked row) opens a right-side station-panel").
- **Files modified:** site/src/main.ts, site/src/map/markers.ts
- **Verification:** criteria 1/7/8/9 green; evidence screenshot shows the panel opening on the first marker.
- **Committed in:** af73a40 (Task 2 GREEN)

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking). **Impact on plan:** All three were necessary to make the plan's stated open/yield/close behaviour real and correct; no scope creep (the marker-open seam is the plan's own "marker OR ranked-row click opens the panel" truth, and the two CSS/locale fixes are honesty/correctness bugs). No architectural change.

## Issues Encountered
None beyond the three auto-fixed items above — each surfaced as a red E2E criterion during the GREEN phase and was fixed inline.

## Known Stubs
- **`renderChartInto(slot)` → `hleð riti…`** (site/src/ui/stationPanel.ts). INTENTIONAL seam, per plan: a sufficient metric's chart slot shows the `hleð riti…` loading line in THIS wave; **Plan 06-03** replaces this stub with a dynamic `import('./chartPanel.js')` that mounts the ECharts `<canvas>`. This is not a data stub — the no-data TEXT states, daylight, yield, and open/close are all fully real now; only the CHART CANVAS is deferred (the plan's explicit scope boundary). The deferred panel.spec criteria (2, 11, 12, 14, and the build-size chunk-split gate) remain `test.fixme` tagged `[06-03]`.

## Threat Flags
None — no new security surface beyond the plan's `<threat_model>`. All three registered threats were mitigated as planned: T-06-04 (station name via textContent, no innerHTML — grep gate reads 0), T-06-05 (insufficient/uncached station → honest no-data text, never a blank/crashing panel), T-06-06 (zero `/data/` fetch on open — criterion 10 green).

## Next Phase Readiness
- **06-03** (lazy ECharts render): the `renderChartInto` seam is the single swap point — replace the stub with a dynamic `import()` that reads the pure `perDoyDistribution`/`perDoyPrecip` results (already available in the panel) and mounts the boxplot/bar into the figure's slot. Un-fixme criteria 2/11/12/14 + the build-size chunk-split gate; add the accessible per-figure summary (criterion 14). The three chart-series tokens are in place; the sufficiency gate is already computed per metric in the panel.
- **07** (loading/empty-states): the panel is structured (header + independently-rendered scrollable figures) so it can be promoted to a bottom sheet; the narrow-screen over-map treatment is functional now.
- No blockers. tsc 0 errors; full unit (281) + site E2E (61 passed, 5 Plan-03 fixmes) green.

## TDD Gate Compliance
- Task 1: no separate RED test (its `<verify>` is `tsc --noEmit` — CSS/token/handle scaffolding, no runtime behavior to assert in isolation); GREEN `569b670`.
- Task 2: RED `8eb2828` (`test(06-02)` — un-fixme'd panel.spec criteria fail against the no-panel build, confirmed criterion 1 TimeoutError) → GREEN `af73a40` (`feat(06-02)`). Required RED → GREEN sequence present in the git log.

## Self-Check: PASSED

All created/evidence/summary files present on disk (stationPanel.ts, panel.css, 06-02-SUMMARY.md, three evidence PNGs); all four task commit hashes (569b670, 8eb2828, af73a40, 67c99d1) present in the git log.

---
*Phase: 06-station-chart-panel*
*Completed: 2026-07-20*
