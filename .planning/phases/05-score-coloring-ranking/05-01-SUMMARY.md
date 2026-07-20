---
phase: 05-score-coloring-ranking
plan: 01
subsystem: ui
tags: [maplibre, colorbrewer, score, vitest, playwright, domain, typescript]

# Dependency graph
requires:
  - phase: 01-data-domain
    provides: "@betravedur/domain combine() + tempComponent/rainComponent/windComponent curves + sumPerYearThenAverage (window-total mm)"
  - phase: 03-static-site-shell-interactive-map
    provides: "MarkerDatum contract + computeMarkerDatum producer + hybrid #marker-overlay pill renderer + window.__map/__store E2E hooks"
  - phase: 04-selection-state-url
    provides: "observable store + debounced no-fetch recompute path + mutedDatum single-source muted shape + playwright preview-build harness"
provides:
  - "MarkerDatum.score:number|null + missingRain:boolean — the single field every downstream Phase 5 UI (marker ring/badge, ranked list, legend) reads"
  - "scoreColor(0-10)->#rrggbb pure BuGn ramp helper (site/src/map/score-color.ts)"
  - "Wave-0 score.spec.ts Playwright skeleton (green smoke + 14 fixme acceptance-criteria placeholders) for 05-02/05-03 to extend"
affects: [05-02-marker-coloring-legend, 05-03-ranked-list, 06-station-chart-panel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Score wiring stays in the data layer (computeMarkerDatum), score MATH stays in @betravedur/domain — the UI only reads datum.score, never recomputes"
    - "Rain nullability gate: a station with no in-window rain passes null (not sumPerYearThenAverage's 0) to combine() so it renormalizes 'án úrkomu'"
    - "Pure, boundary-unit-tested color helper (no DOM/map dep) — the ColorBrewer BuGn lerp, zero new deps"
    - "Wave-0 test skeleton: a green smoke test + named test.fixme placeholders so downstream UI plans inherit a passing harness"

key-files:
  created:
    - "site/src/map/score-color.ts"
    - "site/src/map/score-color.test.ts"
    - "site/tests/e2e/score.spec.ts"
  modified:
    - "site/src/data/types.ts"
    - "site/src/data/averages.ts"
    - "site/src/data/averages.test.ts"
    - "site/src/state/recompute.ts"
    - "site/src/map/markers.test.ts"

key-decisions:
  - "Followed the plan's BuGn 6-stop ramp (#edf8fb->#006d2c) for scoreColor, NOT the 11-stop slate->yellow-green table in 05-UI-SPEC — the plan's Task 2 pins the BuGn boundary hexes explicitly and is the authoritative execution contract; both ramps avoid accent red and are luminance-monotonic. 05-02 (which owns the legend swatches/tokens) should reconcile the two before shipping visible chrome."
  - "Rain component is gated on hasPrecipQual (rain actually recorded), because sumPerYearThenAverage returns 0 — not null — for a qualifying-but-rain-less station; feeding 0 would score a dry AWS station as rain 10/10 (RESEARCH Pitfall 2)."
  - "scoreColor clamp is total: a non-finite input resolves to the low stop (defensive belt over the combine() number|null contract, T-05-01)."

patterns-established:
  - "MarkerDatum.score is the ONE Phase-5 gate: null ⇔ off-scale/unranked (insufficient OR empty contributing); missingRain=true does NOT imply score=null (án úrkomu is scored + ranked)"
  - "Muted shape parity: mutedDatum and the insufficient path in computeMarkerDatum both produce score:null + missingRain:true — never drift"

requirements-completed: [MAP-03]

# Metrics
duration: 8min
completed: 2026-07-20
---

# Phase 5 Plan 01: Score Data Layer + Color Ramp + Wave-0 Tests Summary

**MarkerDatum now carries a domain-computed 0-10 score (rain-total mm → combine() over temp/rain/wind), backed by a rain-unit pinning fixture; plus a pure ColorBrewer BuGn scoreColor ramp and a green Wave-0 Playwright skeleton for the downstream coloring/ranking UI.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-07-20T12:02:00Z
- **Completed:** 2026-07-20T12:07:42Z
- **Tasks:** 3
- **Files modified:** 8 (3 created, 5 modified)

## Accomplishments
- Closed the load-bearing data gap: `computeMarkerDatum` now derives the window-total rain mm (`sumPerYearThenAverage`, 3-arg), feeds temp/rain/wind through the domain component curves, calls `combine()`, and surfaces `score:number|null` + `missingRain:boolean` on `MarkerDatum`.
- Pinned the one genuinely load-bearing assumption (RESEARCH A3): a fixture asserts the value fed to `rainComponent` is the **mm window-total** across qualifying years, distinct from the daily-mean and boolean mistakes.
- Correctly scores the three data realities: SYNOP (three-component), AWS **án úrkomu** (renormalized, non-null, `missingRain=true`), and insufficient coverage (`score=null`, off-scale).
- Added the pure `scoreColor(0-10)->#rrggbb` BuGn ramp helper (zero new deps), clamped and boundary-tested, provably never the accent red `#c0392b`.
- Scaffolded `score.spec.ts` with a green smoke test and 14 named `test.fixme` acceptance-criteria placeholders for 05-02/05-03.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend MarkerDatum + computeMarkerDatum with the domain score** — `e035798` (feat)
2. **Task 2: scoreColor BuGn ramp helper + boundary tests** — `4a0d85a` (feat)
3. **Task 3: Wave-0 Playwright score.spec skeleton** — `118ca1d` (test)

**Plan metadata:** committed with this SUMMARY (docs).

_Note: Task 1 and Task 2 were `tdd="true"`; the RED test scaffolds and GREEN implementations landed in each task's single commit (tests + impl staged together)._

## Files Created/Modified
- `site/src/data/types.ts` — added `MarkerDatum.score` + `missingRain` with the null/án-úrkomu contract documented.
- `site/src/data/averages.ts` — imports the domain curves + `combine`; derives `rainTotalMm`; builds a `ComponentScores` gated by `sufficient` (and rain gated by `hasPrecipQual`); calls `combine()`; returns `score`/`missingRain`.
- `site/src/data/averages.test.ts` — new `score (MAP-03)` describe: rain-unit mm pin, án úrkomu non-null, SYNOP three-component, insufficient→null, never-NaN, real-sample scores.
- `site/src/state/recompute.ts` — `mutedDatum` sets `score:null, missingRain:true` (no muted-shape drift).
- `site/src/map/markers.test.ts` — `fullDatum` helper carries the new required `score`/`missingRain` fields (required-field sync).
- `site/src/map/score-color.ts` — pure `scoreColor` BuGn lerp.
- `site/src/map/score-color.test.ts` — boundary/clamp/format/monotonicity/accent-red assertions.
- `site/tests/e2e/score.spec.ts` — Wave-0 smoke + fixme criteria 1-14.

## Decisions Made
See `key-decisions` in frontmatter. The material one for downstream: **this plan used the plan's BuGn ramp, not the 05-UI-SPEC 11-stop slate ramp** — 05-02 owns the legend tokens and must reconcile.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Rain-less station was scored dry-as-10 (sumPerYearThenAverage returns 0, not null)**
- **Found during:** Task 1 (score wiring)
- **Issue:** The plan's action said to gate rain on `rainTotalMm != null`. But `sumPerYearThenAverage` returns `0` (never null) for a qualifying station that carries no in-window rain — so `rainComponent(0) === 10` contributed, making every rain-less AWS station score as a perfect-dry 10/10 with `missingRain=false`. This is exactly RESEARCH Pitfall 2 / the A3 trap, and it broke the án-úrkomu behavior tests.
- **Fix:** Additionally gated the rain component on the pre-existing `hasPrecipQual` (rain actually recorded in-window), so a genuinely rain-less station passes `null` to `combine()` and is renormalized "án úrkomu".
- **Files modified:** `site/src/data/averages.ts`
- **Verification:** `averages.test.ts` án-úrkomu fixtures (synthetic AWS + real #1350) now assert `score !== null` AND `missingRain === true`; all 20 tests green.
- **Committed in:** `e035798` (Task 1 commit)

**2. [Rule 3 - Blocking] markers.test.ts fullDatum missing the new required fields**
- **Found during:** Task 1 (after adding required `score`/`missingRain` to `MarkerDatum`)
- **Issue:** `site/src/map/markers.test.ts`'s `fullDatum` helper constructs a full `MarkerDatum`; the two new required fields made it a type error (TS2322).
- **Fix:** Added `score: 7.4, missingRain: false` to the happy-path `fullDatum`.
- **Files modified:** `site/src/map/markers.test.ts`
- **Verification:** `tsc --noEmit -p site` no longer reports the markers.test.ts error; the marker unit suite stays green.
- **Committed in:** `e035798` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both essential for correctness. Deviation #1 is the load-bearing correctness fix the plan's own A3 warning anticipated. No scope creep.

## Issues Encountered
- **Pre-existing `tsc --noEmit -p site` errors (out of scope):** 9 errors in `recompute.test.ts`, `store.test.ts`, and `url.ts:66` exist on clean HEAD (`8bc7477`) — verified by stashing all Phase-5 changes and re-running tsc. They are unrelated to the score field and were left untouched per the SCOPE BOUNDARY rule; logged to `.planning/phases/05-score-coloring-ranking/deferred-items.md`. This plan introduced ZERO new tsc errors (the one it would have introduced was fixed in `markers.test.ts`).

## Known Stubs
- `site/tests/e2e/score.spec.ts` carries 14 `test.fixme` placeholders (criteria 1-14). These are intentional Wave-0 scaffolds: the smoke test passes green, and each fixme names the owning plan (05-02 coloring/legend, 05-03 ranked list) that will implement and un-fixme it. Not a data stub — no UI element is faked; the placeholders simply do not run until the UI exists.

## User Setup Required
None - no external service configuration required. Zero new npm deps (RESEARCH Package Legitimacy Audit was a no-op).

## Next Phase Readiness
- `datum.score` / `datum.missingRain` are live on every recompute — 05-02 (marker ring + badge + legend) and 05-03 (ranked "Bestu staðir" list) can read them directly, no fetch, no recompute.
- `scoreColor()` is ready for the marker ring + legend swatches; **05-02 must reconcile the BuGn ramp used here with the 05-UI-SPEC 11-stop token table** (both colorblind-safe; pick one, tokenize `--score-*`).
- `score.spec.ts` is the green harness to extend; the 14 fixmes name each criterion's owning plan.

## Verification
- `npx vitest run` — 28 files, 249 passed / 3 pre-existing skips (full root unit suite green; no Phase 1-4 regression).
- `npx vitest run site/src/data/averages.test.ts` — 20 passed (rain-unit pin included).
- `npx vitest run site/src/map/score-color.test.ts` — 8 passed (boundaries + clamp + no-accent-red).
- `cd site && npm run build` — clean.
- `cd site && npx playwright test --project=chromium` — 31 passed / 14 skipped (score.spec smoke green, full e2e suite unaffected).

## Self-Check: PASSED

- Created files verified present: `site/src/map/score-color.ts`, `site/src/map/score-color.test.ts`, `site/tests/e2e/score.spec.ts`, `.planning/phases/05-score-coloring-ranking/05-01-SUMMARY.md`.
- Commits verified in git log: `e035798` (Task 1), `4a0d85a` (Task 2), `118ca1d` (Task 3).

---
*Phase: 05-score-coloring-ranking*
*Completed: 2026-07-20*
