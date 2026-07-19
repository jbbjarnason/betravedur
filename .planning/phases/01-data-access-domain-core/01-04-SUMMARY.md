---
phase: 01-data-access-domain-core
plan: 04
subsystem: domain-score
tags: [domain, scoring, piecewise-linear, weight-renormalization, walking-skeleton, e2e, tdd]

# Dependency graph
requires:
  - phase: 01-02
    provides: "coverage-honest climatology math (expandWindow, leapFoldedDoy, qualifyingYears, effectiveN, scalarMeanSpeed, circularMeanDirection, sumPerYearThenAverage)"
  - phase: 01-03
    provides: "hardened fetchAwsDay/fetchSynopDay (normalized DailyObservation[]) + fetchStations registry"
provides:
  - "tempComponent/rainComponent/windComponent — fixed, explainable 0-10 piecewise-linear curves (temp peak ~13-20C; rain/wind less-is-better)"
  - "combine() — renormalizes rain 0.4/wind 0.3/temp 0.3 over ONLY present components, records contributing[], flags missingRain ('án úrkomu')"
  - "Closed Walking Skeleton: real Veðurstofan data -> full domain chain -> real per-station combined score, end-to-end"
  - "Deterministic offline full-chain e2e integration tests (SYNOP 3-component, AWS renormalized 2-component, N<3 gate)"
affects:
  - "Phase 2 pipeline (combine() is the display-time scoring the aggregation feeds)"
  - "Phase 3+ browser UI (component curves + weights are the WGT-01 slider basis; missingRain drives the 'án úrkomu' badge; SCORE-03 explainability panel)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fixed, documented piecewise-linear component curves (breakpoints in comments) for explainable, sliderable scoring"
    - "Weight renormalization over available components (missing rain is scored fairly, never as dry paradise)"
    - "combine() records contributing components + missingRain so the score is auditable (SCORE-03 groundwork)"
    - "Deterministic offline full-chain e2e test drives the exact domain functions the demo uses (no network in CI)"

key-files:
  created:
    - "packages/domain/test/score.test.ts"
  modified:
    - "packages/domain/src/score.ts"
    - "scripts/skeleton-demo.ts"
    - "test/e2e/skeleton.test.ts"

key-decisions:
  - "Curve breakpoints: temp flat-10 across 13-20C, 0 by -5C/30C; rain 10@0mm->0@60mm typical window total; wind 10@0->0@15 m/s mean — simple, explainable, tunable in the SCORE-03 panel"
  - "combine() with zero present components returns { score: 0, contributing: [], missingRain: true } (tested explicitly) rather than a null score, so callers always get a number"
  - "score rounded to one decimal but kept a number; weights renormalized by dividing each present weight by the present-weight sum"
  - "Offline e2e drives the domain functions directly (not by importing the demo script) to avoid main()/process.exit side effects and keep the full-chain assertion deterministic"

patterns-established:
  - "Explainable-scoring: piecewise-linear curves with commented breakpoints + recorded contributing components (no hidden weighting)"
  - "Renormalize-over-present: any missing component drops out and its weight is redistributed, with a flag recorded for the UI"

requirements-completed: [SCORE-01]

# Metrics
duration: 5min
completed: 2026-07-19
---

# Phase 1 Plan 04: Combined Weather Score + Closed Walking Skeleton Summary

**Fixed, explainable 0-10 temp/rain/wind piecewise-linear curves plus a `combine()` that renormalizes the rain 0.4/wind 0.3/temp 0.3 weights over only the components a station actually has (recording `contributing` + `missingRain`), then closes the Walking Skeleton: real Veðurstofan data flows through the full domain chain to a real per-station combined score, proven live and pinned by a deterministic offline full-chain e2e test.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-07-19T19:23:00Z
- **Completed:** 2026-07-19T19:27:00Z
- **Tasks:** 2 (Task 1 TDD RED->GREEN)
- **Files created/modified:** 4

## Accomplishments

- **SCORE-01 at the math level** — three fixed, explainable 0-10 piecewise-linear component curves (temp peaks in the comfortable 13-20C band, rain/wind less-is-better), each clamped to [0,10] with breakpoints documented in comments for the SCORE-03 panel.
- **Honest renormalization** — `combine()` collects the non-null components, renormalizes the default rain 0.4/wind 0.3/temp 0.3 weights over just those, records `contributing`, and sets `missingRain` so an AWS station without rain is scored fairly on temp+wind and flagged "án úrkomu" (RESEARCH Pitfall 1 mitigated).
- **Pinned math** — a test asserts the exact renormalized value wind=6,temp=8 -> 7.0, plus a custom-weights renormalization case and the all-null empty result.
- **Closed Walking Skeleton** — the demo now runs the complete real chain (fetch multi-year -> expandWindow -> qualifyingYears/effectiveN -> means -> component curves -> combine) and prints real per-station EINKUNN with contributing components, the "án úrkomu" badge, and "ófullnægjandi gögn" for N<3.
- **Deterministic CI proof** — an offline full-chain e2e integration test feeds hand-built multi-year `DailyObservation[]` through the exact domain functions and asserts a numeric `CombinedScore` with correct `contributing`/`missingRain` (SYNOP 3-component, AWS renormalized 2-component, and the N<3 gate) — no network required.

## Task Commits

Executed atomically (Task 1 TDD RED -> GREEN):

1. **Task 1 RED — failing component-curve + renormalization tests** - `6a3e3c0` (test)
2. **Task 1 GREEN — 0-10 curves + renormalizing combine** - `9e1af20` (feat)
3. **Task 2 — close the walking skeleton loop (demo + e2e full chain)** - `cb16bc5` (feat)

**Plan metadata:** committed with SUMMARY/STATE/ROADMAP/REQUIREMENTS.

## Files Created/Modified

- `packages/domain/src/score.ts` - Implemented `tempComponent`/`rainComponent`/`windComponent` (piecewise-linear, clamped [0,10]) + `combine()` (renormalizes present-component weights, records `contributing`, sets `missingRain`; empty result on all-null). Replaced the NOT_IMPLEMENTED stubs.
- `packages/domain/test/score.test.ts` (new) - 9 tests: component-curve shape/monotonicity/clamp, full 3-component combine, rain-null renormalization to wind/temp 0.5/0.5 (pinned 7.0), single-component pass-through, rain-only, all-null empty result, custom-weights renormalization.
- `scripts/skeleton-demo.ts` - Upgraded to the full real chain across 2011-2015 July windows; prints real combined scores, contributing components, "án úrkomu" badge, and "ófullnægjandi gögn" N<3 gate. Removed the "[domain math pending Plan 02]" placeholders and the tryDomain stub-catcher.
- `test/e2e/skeleton.test.ts` - Added a deterministic offline FULL-CHAIN describe block (SYNOP 3-component, AWS renormalized 2-component + missingRain, N<3 gate) driving the real domain functions; live path stays BETRA_LIVE-gated.

## Decisions Made

- Curve breakpoints chosen for explainability (temp 13-20C flat peak, 0 by -5C/30C; rain 0 by 60mm typical window total; wind 0 by 15 m/s mean) — simple linear ramps, commented, tunable later.
- All-null `combine()` returns `{ score: 0, contributing: [], missingRain: true }` (a number, not null) and is tested explicitly, so downstream callers never branch on null.
- Offline e2e drives the domain functions directly rather than importing the demo script, avoiding `main()`/`process.exit` side effects and keeping the assertion deterministic.

## Deviations from Plan

None - plan executed exactly as written. (Task 1 followed the TDD RED->GREEN gate; no REFACTOR commit was needed; no auto-fixes triggered.)

## Issues Encountered

None blocking. Observation during the live run: AWS Reykjavík #1470 returns N=0 for the 2011-2015 window (that AWS station's daily record begins later), so the demo correctly prints "ófullnægjandi gögn (N=0 < 3)" — this is honest N-gating behavior, not a defect, and it demonstrates the N<3 guard on real data. The two AWS stations with data (Keflavík #1350, Eyrarbakki #1395) produce renormalized temp+wind scores with the "án úrkomu" badge; the SYNOP Reykjavík #1 produces a full temp+rain+wind score.

## TDD Gate Compliance

Plan type is `tdd`. Task 1 (behavior-adding: `score.ts` curves + combine) followed RED -> GREEN:
- RED `6a3e3c0` (test) — 9 tests failing with NOT_IMPLEMENTED, verified before implementation.
- GREEN `9e1af20` (feat) — all 9 green.
No test passed unexpectedly during RED (fail-fast satisfied). Task 2 is a `type="auto"` integration/wiring task (upgrades the demo + strengthens e2e); its e2e additions were written and run green in the same commit — no separate RED gate is required for a non-tdd task, but the added tests are deterministic and assert real numeric output.

## Live Verification (BETRA_LIVE=1)

`BETRA_LIVE=1 npx tsx scripts/skeleton-demo.ts` (real api.vedur.is), exit 0:

```
Betra Veður — Walking Skeleton demo (closed loop)
Window 07-15…07-25 over 2011–2015 — real combined scores from api.vedur.is

— AWS stations (vindátt til staðar; án úrkomu) —
[AWS] Keflavíkurflugvöllur (#1350)  N=5
    meðalhiti=11.5°C  meðalvindur=5.4 m/s  vindátt=86° @ 1.4 m/s  úrkoma=án úrkomu
    EINKUNN 7.8/10  (temp+wind)  [án úrkomu]
[AWS] Eyrarbakki (#1395)  N=5
    meðalhiti=11.8°C  meðalvindur=4.4 m/s  vindátt=138° @ 1.5 m/s  úrkoma=án úrkomu
    EINKUNN 8.2/10  (temp+wind)  [án úrkomu]
[AWS] Reykjavík (#1470)  N=0
    meðalhiti=—°C  meðalvindur=— m/s  vindátt=—  úrkoma=án úrkomu
    ófullnægjandi gögn (N=0 < 3)

— SYNOP station (úrkoma til staðar) —
[SYNOP] Reykjavík (#1)  N=5
    meðalhiti=12.2°C  meðalvindur=2.7 m/s  vindátt=—  úrkoma=27.8 mm
    EINKUNN 7.5/10  (temp+rain+wind)

Skeleton chain OK: real data → @betravedur/domain → real combined score, end-to-end.
```

The chain produces genuine combined scores: two AWS stations get renormalized temp+wind scores with the "án úrkomu" badge, the SYNOP station gets a full temp+rain+wind score, and the N<3 gate correctly withholds a score for the station lacking history in the window.

## Verification Results

- Full suite green: **10 files, 66 passed / 3 skipped** (`npx vitest run`, exit 0). Skipped = BETRA_LIVE-gated live e2e checks.
- Named selectors: `component score` (4 pass), `renormal` (6 pass) — both pass.
- Exact renormalized value pinned: wind=6,temp=8 -> 7.0 passes; custom-weights renormalization -> 4.0 passes.
- `grep contributing` and `grep missingRain` succeed in `score.ts`; no `NOT_IMPLEMENTED` remains.
- Demo greps: `combine(`, `án úrkomu`/`missingRain`, `ófullnægjandi`/`sufficient` all present; no "pending Plan 02" placeholder remains.
- `tsc -p packages/domain/tsconfig.json --noEmit` clean; `tsc -p packages/fetch/tsconfig.json --noEmit` clean; demo type-checks clean with node types (as tsx runs it).
- Live demo (BETRA_LIVE=1) prints real per-station combined scores, exit 0 (see above).

## Known Stubs

None. `score.ts` was the last remaining `@betravedur/domain` stub; every domain function is now fully implemented. No new stubs introduced.

## Threat Flags

None. Surface matches the plan's `<threat_model>`:
- **T-01-13** (missing-component handling): `combine()` renormalizes over present components and flags `missingRain` — an AWS station without rain cannot silently score as dry paradise; verified by the AWS renormalization test + the "án úrkomu" badge.
- **T-01-14** (score transparency): fixed, documented piecewise-linear curves + recorded `contributing` make the score explainable; no hidden weighting.
- **T-01-15** (supply chain): score math stays in the dependency-free `@betravedur/domain` package; no new runtime deps.

No new network endpoints, auth paths, file access, or schema changes at trust boundaries.

## Next Phase Readiness

- **Phase 1 complete.** The domain core is fully implemented (window/coverage/wind/precip/score) and the data-access half is hardened; the Walking Skeleton is closed end-to-end on real data.
- `combine()` + the component curves are the display-time scoring the Phase 2 pipeline will feed and the Phase 3+ UI will slider (WGT-01) and badge (`missingRain` -> "án úrkomu").
- Carried-forward gates (unchanged): Veðurstofan redistribution terms confirmation before public deploy; sunshine/cloud-cover sensor coverage for SUN-01 (v2); PMTiles Iceland extract size for Phase 2.

## Self-Check: PASSED

All claimed files exist on disk; all three task commits (`6a3e3c0`, `9e1af20`, `cb16bc5`) exist in git history.

---
*Phase: 01-data-access-domain-core*
*Completed: 2026-07-19*
