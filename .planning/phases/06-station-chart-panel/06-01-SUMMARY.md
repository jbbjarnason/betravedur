---
phase: 06-station-chart-panel
plan: 01
subsystem: ui
tags: [echarts, suncalc, distribution, percentile, boxplot, daylight, playwright, tdd]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: expandWindow / groupBySeasonYear / qualifyingYears / effectiveN domain helpers (reused verbatim for the per-doy reshape + N-gate)
  - phase: 02-derived-data
    provides: decodeDerived + the per-(year,doy) DerivedFile columns the distributions read client-side (no pipeline change)
  - phase: 04-selection
    provides: WindowSpec / YearRange selection dimensions + the store stationId seam the panel subscribes to
  - phase: 05-score-coloring-ranking
    provides: the ranked "Bestu staðir" panel that YIELDS while the station panel is open; score.spec E2E conventions mirrored
provides:
  - "percentile (type-7) + perDoyDistribution + perDoyPrecip pure helpers in @betravedur/domain (per-doy 5-number summary + median precip, honest missing, N>=3 gate)"
  - "daylightHours polar-safe helper in the site data layer (suncalc, tagged union hours|polar-day|polar-night)"
  - "echarts 6.1.0 + suncalc 2.0.1 pinned runtime deps (first chart/astronomy deps)"
  - "panel.spec.ts E2E skeleton: 14 UI-SPEC criteria as fixme + a build-size chunk-split gate"
affects: [06-02 panel shell + DOM/daylight/no-data, 06-03 lazy ECharts chart render + chunk split, 07-loading-empty-states]

# Tech tracking
tech-stack:
  added: [echarts@6.1.0, suncalc@2.0.1]
  patterns:
    - "Domain stays zero-dep: perDoyDistribution operates on decoded DailyObservation[] rows, NOT a DerivedFile — the site layer decodes (via @betravedur/pipeline/derive subpath) and passes rows in, so the domain never imports the pipeline"
    - "Per-doy reshape mirrors computeMarkerDatum exactly (expandWindow -> groupBySeasonYear -> yearRange -> qualifyingYears 0.8 -> effectiveN N>=3), keeping panel coverage honesty identical to the map"
    - "Polar-safe daylight: branch on alwaysUp/alwaysDown FIRST, then null/Invalid sunrise/sunset resolved by the sun's noon altitude — no NaN escapes to the DOM"
    - "Wave-0 E2E skeleton: one active harness smoke + test.fixme placeholders encoding exact selectors/asserts for downstream plans to un-fixme"

key-files:
  created:
    - packages/domain/src/distribution.ts
    - packages/domain/test/distribution.test.ts
    - site/src/data/daylight.ts
    - site/src/data/daylight.test.ts
    - site/tests/e2e/panel.spec.ts
  modified:
    - packages/domain/src/index.ts
    - site/package.json
    - package.json
    - package-lock.json

key-decisions:
  - "percentile precip aggregation = MEDIAN per doy (research A2 / Open-Q-1: robust to a single wet year), pinned in a test"
  - "perDoyDistribution placed in @betravedur/domain but operates on decoded rows (not DerivedFile) to preserve the domain's zero-dependency / browser-safe invariant — resolves the plan's cycle concern without splitting the helper into the site layer"
  - "suncalc 2.0.1 does NOT expose alwaysUp/alwaysDown at runtime for Iceland/deep-polar; the actual polar signal is sunrise===null / sunset===null — helper handles both the type-declared flags AND the null case via a sun-noon-altitude polar-day/night decision"

patterns-established:
  - "Per-doy distribution helper: reuse the marker N-gate verbatim; empty bucket -> { missing:true } explicit gap, never a zero box/bar"
  - "Build-size chunk-split gate: inspect dist/assets after the preview build, assert echarts is absent from every eager chunk and present only in the lazy chartPanel chunk"

requirements-completed: [CHART-01, CHART-02, CHART-03, CHART-04]

# Metrics
duration: 8min
completed: 2026-07-20
---

# Phase 6 Plan 01: Station Chart Panel Foundation Summary

**Pure, unit-tested per-doy distribution math (percentile type-7 + perDoyDistribution/perDoyPrecip with median precip and honest missing) plus a polar-safe suncalc daylight helper, echarts+suncalc pinned, and a panel.spec E2E skeleton with a build-size chunk-split gate — every number the panel will draw, proven in isolation before any DOM/ECharts wiring.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-07-20T14:00:00Z
- **Completed:** 2026-07-20T14:08:00Z
- **Tasks:** 3 (2 TDD, 1 auto)
- **Files modified:** 9 (5 created, 4 modified)

## Accomplishments
- `percentile` (type-7 linear), `perDoyDistribution` (per-doy [min,p10,p50,p90,max] across qualifying years, wrap-correct, N>=3 gate, explicit missing gaps), and `perDoyPrecip` (per-doy MEDIAN total, honest missing) — all pure, zero-dep, exported from the domain barrel, 13 unit tests green.
- `daylightHours` polar-safe helper — never NaN/Invalid Date at Iceland's summer/winter solstice or at deep-polar (78°N) latitudes; 5 unit tests green.
- echarts 6.1.0 + suncalc 2.0.1 installed pinned-exact in `site/package.json`, no `@types/*` stubs (both ship own types), no postinstall scripts, lockfile pins confirmed.
- `panel.spec.ts` scaffolds all 14 UI-SPEC acceptance criteria as `test.fixme` with exact selectors/asserts + one active wave-0 smoke test + a build-size chunk-split gate asserting echarts stays out of the entry bundle.
- Full site E2E suite green (51 passed, 15 skipped = the 14 panel fixmes + 1 build gate); full unit suite green (281 passed); `tsc --noEmit -p site` = 0 errors.

## Task Commits

1. **Task 1: percentile + perDoyDistribution (TDD)** — RED `3474eaa` (test) → GREEN `c2cc15b` (feat)
2. **Task 2: install echarts+suncalc; daylightHours (TDD)** — RED `022e4eb` (test) → GREEN `56caf1c` (feat)
3. **Task 3: panel.spec skeleton + build-size gate** — `4725114` (test)

## Files Created/Modified
- `packages/domain/src/distribution.ts` — percentile (type-7) + perDoyDistribution + perDoyPrecip pure helpers (operate on decoded rows; zero-dep).
- `packages/domain/test/distribution.test.ts` — 13 unit tests: percentile boundaries, N-gate, 5-number summary, missing gap, wrap order, yearRange filter, median precip, honest-missing precip.
- `packages/domain/src/index.ts` — added named re-exports (percentile/perDoyDistribution/perDoyPrecip + result types).
- `site/src/data/daylight.ts` — daylightHours (suncalc, polar-branch-first, noon-altitude fallback).
- `site/src/data/daylight.test.ts` — 5 unit tests: Iceland solstice edges + deep-polar, no NaN.
- `site/tests/e2e/panel.spec.ts` — E2E skeleton (smoke + 14 fixme criteria + build-size gate).
- `site/package.json` — echarts 6.1.0 + suncalc 2.0.1 pinned exact.
- `package.json` / `package-lock.json` — lockfile pins the two deps.

## Decisions Made
- **Precip = MEDIAN per doy** (not mean) — research Open-Q-1 recommendation; robust to one wet year; pinned in `perDoyPrecip` median test.
- **perDoyDistribution lives in the domain but takes decoded `DailyObservation[]` rows** — the plan flagged a potential domain→pipeline cycle; taking pre-decoded rows keeps the domain zero-dep and browser-safe (its stated invariant) while still shipping the helper from the domain barrel. The site layer owns the `decodeDerived` subpath call.
- **suncalc polar handling via null-times + noon altitude** — verified at runtime that suncalc 2.0.1 returns `null` sunrise/sunset (not the `alwaysUp`/`alwaysDown` flags) for deep-polar cases; the helper branches on the type-declared flags first (defensive) then falls back to the sun's solar-noon altitude to classify polar-day vs polar-night.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected a precip missing-gap unit test's window**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** The initial "missing:true for a doy with no qualifying rain" test used a 3-day window with rain absent on 1 of 3 doys — that is 2/3 = 0.667 `r`-coverage, below the 0.8 qualifying gate, so NO year qualified and the result was correctly `{ sufficient:false }` rather than a per-doy gap. The test expectation (sufficient with a missing doy) was the error, not the implementation.
- **Fix:** Widened the test to a 10-day window with rain absent on only 1 of 10 doys (90% coverage clears the 0.8 gate), correctly isolating a per-doy missing bucket inside an otherwise-covered window.
- **Files modified:** packages/domain/test/distribution.test.ts
- **Verification:** `npx vitest run distribution` — 13/13 green.
- **Committed in:** c2cc15b (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 test-correctness bug).
**Impact on plan:** The fix hardened a test against the real coverage-gate semantics; it surfaced (and documents) an honest edge — a per-doy precip gap can only appear when the year still clears the 0.8 `r`-coverage gate. No scope creep.

## Issues Encountered
- The RESEARCH doc claimed suncalc exposes `alwaysUp`/`alwaysDown` flags at runtime for Iceland's edges; runtime probing showed it returns valid Dates at 65°N solstice (sunset on the next day, ~22h — correct) and `null` sunrise/sunset only at deep-polar latitudes, without setting the flags. Resolved by branching on the flags first (still type-safe/defensive) then handling `null` via the sun's noon altitude. No blocker.

## User Setup Required
None — echarts/suncalc install cleanly with no postinstall and no external service configuration.

## Next Phase Readiness
- **06-02** (panel shell): can wire `perDoyDistribution`/`perDoyPrecip` + `daylightHours` into the DOM and un-fixme the DOM-text/no-data/close/Escape/ranked-yield criteria — the math and daylight are proven and typed.
- **06-03** (lazy ECharts render): can build `site/src/ui/chartPanel.ts` with a dynamic `import()`, feed the boxplot/bar options from the pure helpers, and turn the build-size chunk-split gate + canvas/token/reduced-motion criteria green.
- No blockers. tsc 0 errors, full unit + E2E suites green.

---
*Phase: 06-station-chart-panel*
*Completed: 2026-07-20*

## TDD Gate Compliance

Both TDD tasks show the required RED → GREEN commit sequence in the git log:
- Task 1: `test(06-01)` `3474eaa` (RED, module-missing failure) → `feat(06-01)` `c2cc15b` (GREEN)
- Task 2: `test(06-01)` `022e4eb` (RED, module-missing failure) → `feat(06-01)` `56caf1c` (GREEN)
No REFACTOR commits (implementations were minimal and clean). No gate violations.

## Self-Check: PASSED

All 6 created/summary files present on disk; all 5 task commit hashes present in the git log.
