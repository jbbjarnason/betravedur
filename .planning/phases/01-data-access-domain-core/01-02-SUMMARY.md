---
phase: 01-data-access-domain-core
plan: 02
subsystem: domain-climatology-math
tags: [domain, climatology, tdd, circular-mean, coverage, leap-fold, precip]
dependency_graph:
  requires:
    - "@betravedur/domain contracts + interface-first stubs (Plan 01-01: DailyObservation, WindowSpec, and the window/coverage/wind/precip stub signatures)"
  provides:
    - "leapFoldedDoy + expandWindow: Feb-29-folded day-of-year and wrap-around window sets"
    - "qualifyingYears (>=80% coverage gate) + effectiveN (N>=3 sufficiency)"
    - "circularMeanDirection (speed-weighted unit-vector mean) + scalarMeanSpeed"
    - "sumPerYearThenAverage (per-year window sum, missing skipped, averaged over qualifying years)"
  affects:
    - "Plan 01-04 (score component curves consume these averages) and the fetch normalizer (leapFoldedDoy now real, no longer a throwing stub)"
    - "Phase 2 pipeline + Phase 3+ browser client both import this math verbatim"
tech-stack:
  added: []
  patterns:
    - "Pure dependency-free climatology math (no date library; plain arithmetic day-of-year)"
    - "Coverage-honest N derived from data (>=80%), never from the picker window size"
    - "Unit-vector (u/v, atan2) circular mean for wind direction; speed averaged as a scalar separately"
    - "Missing != zero everywhere (null precip/speed skipped, never coerced to 0)"
    - "TDD RED->GREEN per task with named -t test selectors matching the RESEARCH test map"
key-files:
  created:
    - "packages/domain/test/window.test.ts"
    - "packages/domain/test/coverage.test.ts"
    - "packages/domain/test/wind.test.ts"
    - "packages/domain/test/precip.test.ts"
  modified:
    - "packages/domain/src/window.ts"
    - "packages/domain/src/coverage.ts"
    - "packages/domain/src/wind.ts"
    - "packages/domain/src/precip.ts"
decisions:
  - "leapFoldedDoy uses a fixed 28-day-February cumulative-month table so the same calendar date yields an identical integer in every year (no per-year leap branching)"
  - "Added an out-of-range-month guard in leapFoldedDoy to satisfy strict noUncheckedIndexedAccess without changing behavior for valid dates"
  - "sumPerYearThenAverage does NOT scale/impute for the residual <=20% coverage gap (Pitfall 3): the >=80% gate bounds the bias; honesty over a fabricated fill"
metrics:
  duration_min: 6
  completed: 2026-07-19
  tasks: 2
  files_created: 4
---

# Phase 1 Plan 02: Coverage-Honest Climatology Math Summary

Implemented the correctness heart of Betra Veður: leap-folded day-of-year window selection, coverage-honest qualifying-years / effective-N, speed-weighted unit-vector circular wind mean (the named 350°/10° → ~0° case, never 180°), scalar wind-speed mean, and precipitation sum-per-year-then-average with missing treated as missing — every function replacing a `NOT_IMPLEMENTED` stub against the signatures fixed in Plan 01, delivered TDD (tests red, then green). DATA-05 satisfied at the math level; full domain suite green (28/28).

## What Was Built

- **Task 1 — Window selection + coverage-honest N** (RED `c13145e`, GREEN `b782d2c`):
  - `leapFoldedDoy(date)`: fixed 28-day-February cumulative-month table; Feb 29 → `null`; July 19 (and every non-Feb-29 date) folds to an identical index in leap and non-leap years. Range 1–365, no date library.
  - `expandWindow(spec)`: inclusive `Set<number>` of day-of-year indices, wrapping the year-end when `endDoy < startDoy` (360→5 spans 360..365 + 1..5).
  - `qualifyingYears(rowsByYear, windowDays, metric, minCoverage=0.8)`: a year qualifies iff `present / windowDays.size >= 0.8`, where `present` counts only in-window rows whose metric is non-null; returns sorted ascending. Boundary case (exactly 0.8) qualifies.
  - `effectiveN(qualifying)`: `{ n, sufficient: n >= 3 }`.
- **Task 2 — Circular wind mean + scalar speed + honest precip** (RED `3f852c6`, GREEN `2add222`, type-fix `a473fe1`):
  - `circularMeanDirection(samples)`: speed-weighted unit-vector accumulation (`u += speed·sin`, `v += speed·cos`), `atan2(meanU, meanV)` → degrees (+360 if negative), `resultantSpeed = hypot(meanU, meanV)`; `null` on no usable samples. 350/10 → ~0 (asserted NOT within 10° of 180°); near-cancelling N/S → resultantSpeed ≈ 0 (caller's "breytileg átt" signal).
  - `scalarMeanSpeed(speeds)`: mean of non-null entries (nulls skipped, not 0); `null` when none.
  - `sumPerYearThenAverage(rowsByYear, windowDays, qualifying)`: per qualifying year, sum in-window days where `r != null` (null skipped, never 0); average those per-year sums; `null` when no qualifying years. Code comment documents the Pitfall-3 coverage-gate bound (no scale/impute).

## Verification Results

- Full domain suite: **5 files, 28 tests passed** (`npx vitest run packages/domain`, exit 0).
- Named `-t` selectors all pass: `circular mean 350 10`, `leap day fold`, `qualifying years coverage`, `min N 3`, `precip missing not zero`, `scalar wind speed`.
- `atan2` present in `wind.ts` (vector mean, not arithmetic).
- No `NOT_IMPLEMENTED` remains in `window.ts` / `coverage.ts` / `wind.ts` / `precip.ts`.
- `@betravedur/domain` still has zero runtime dependencies (no `dependencies` field); no `dayjs|luxon|date-fns|moment` import in `window.ts`.
- `tsc -p packages/domain/tsconfig.json --noEmit` clean (browser-safe strict, `noUncheckedIndexedAccess`).

## TDD Gate Compliance

Plan type is `tdd`; both tasks followed RED → GREEN:
- Task 1: `test(01-02)` `c13145e` (16 failing) → `feat(01-02)` `b782d2c` (green).
- Task 2: `test(01-02)` `3f852c6` (11 failing, NOT_IMPLEMENTED) → `feat(01-02)` `2add222` (green).
Every RED commit was verified to fail with `NOT_IMPLEMENTED` before implementation. No REFACTOR commits were needed beyond the strict-typing fix below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `leapFoldedDoy` index lookup tripped `noUncheckedIndexedAccess`**
- **Found during:** Task 2 verification (`tsc -p packages/domain/tsconfig.json --noEmit`).
- **Issue:** `CUMULATIVE_DAYS_BEFORE_MONTH[month]` is typed `number | undefined` under the strict browser-safe tsconfig, so `before + day` failed `tsc` (TS2532) — the domain package must compile clean.
- **Fix:** Capture the lookup, guard `if (before === undefined) return null;` (out-of-range month), then `return before + day`. No behavior change for valid `YYYY-MM-DD` dates; all tests still green.
- **Files modified:** `packages/domain/src/window.ts`
- **Commit:** `a473fe1`

Note: `window.ts` and `coverage.ts` were committed in the Task-1 GREEN commit (`b782d2c`); the tsc issue surfaced during Task-2 verification, so its fix is a follow-up commit rather than part of the Task-1 GREEN.

## Threat Surface / Threat Flags

None new. This plan implements the exact mitigations the plan's `<threat_model>` assigns as `mitigate`:
- **T-01-05** (precip null handling): nulls skipped in the sum, unit-tested `precip missing not zero`.
- **T-01-06** (wind direction mean): unit-vector `atan2` mean, named `circular mean 350 10` regression with an explicit NOT-180 assertion.
- **T-01-07** (N inflation): N derives from ≥80% data coverage, sparse years excluded, unit-tested `qualifying years coverage` + `min N 3`.
- **T-01-08** (supply chain): domain package remains dependency-free; no date-library import.

No new network endpoints, auth paths, file access, or schema changes introduced.

## Known Stubs

None introduced by this plan. All four target modules are fully implemented. Remaining stubs in `@betravedur/domain` are out of this plan's scope and scheduled elsewhere: `score.ts` (tempComponent/rainComponent/windComponent/combine → Plan 01-04) and `attribution.ts` (ATTRIBUTION → Plan 01-03).

## Self-Check: PASSED

All four created test files and four modified source files exist on disk. All five task commits verified in git history: `c13145e` (test), `b782d2c` (feat), `3f852c6` (test), `2add222` (feat), `a473fe1` (fix).
