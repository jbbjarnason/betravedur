---
phase: 03-static-site-shell-interactive-map
plan: 02
subsystem: ui
tags: [vite, typescript, vitest, tdd, climatology, decodeDerived, markerdatum, manifest]

# Dependency graph
requires:
  - phase: 01-walking-skeleton
    provides: "@betravedur/domain window/coverage/wind math (expandWindow, groupBySeasonYear, qualifyingYears, effectiveN, scalarMeanSpeed, circularMeanDirection) + StationMeta/WindowSpec types"
  - phase: 02-derived-data-pipeline-backfill
    provides: "@betravedur/pipeline/derive decodeDerived/encodeDerived codec + committed content-hashed derived sample (manifest.json, stations.json, derived/{1,1350}.<hash>.json)"
  - phase: 03-static-site-shell-interactive-map
    provides: "Plan 01 site/ Vite+TS workspace with public/data sample copied in"
provides:
  - "site/src/data/types.ts — MarkerDatum contract + DEFAULT_WINDOW (doy 197–210) single source for Plan 03 to render and Phase 4 to reparametrize"
  - "site/src/data/load.ts — content-hashed derived-filename resolution from manifest.json + BASE_URL-aware asset URLs (Node-free)"
  - "site/src/data/averages.ts — pure decodeDerived → domain math → MarkerDatum transform with án úrkomu / breytileg átt / ófullnægjandi-gögn edges"
  - "unit test suites (load.test.ts, averages.test.ts) green offline against the committed real sample"
affects: [03-03, markers, symbol-layer, period-selector, score-coloring, station-chart]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "decodeDerived imported ONLY from @betravedur/pipeline/derive subpath (grep-gated; root barrel would pull Node built-ins into the browser bundle)"
    - "Effective N from qualifying DATA-coverage years via domain effectiveN, never the picker span (WR-01 coverage honesty carried to the client)"
    - "MarkerDatum contract isolated from the fetch/decode/average producer so Plan 03 depends on the shape and Phase 4 swaps only DEFAULT_WINDOW"
    - "Defensive decode: malformed manifest / empty / all-null metrics degrade to null-or-muted datum, never throw (threat T-03-04 / T-03-05)"
    - "Site unit tests co-located as site/src/**/*.test.ts, registered in the root vitest include"

key-files:
  created:
    - site/src/data/types.ts
    - site/src/data/load.ts
    - site/src/data/load.test.ts
    - site/src/data/averages.ts
    - site/src/data/averages.test.ts
  modified:
    - vitest.config.ts

key-decisions:
  - "DEFAULT_WINDOW = {startDoy:197,endDoy:210} (≈ week 30 summer, non-wrapping) as the single fixed-period source until Phase 4 (RESEARCH A5)"
  - "windVariable when circularMeanDirection is null OR resultantSpeed < 0.5 (VARIABLE_DIRECTION_FLOOR) → 'breytileg átt', windDir null"
  - "priority heuristic: manned SYNOP/climate stations outrank AWS, then earlier start, then lower id — deterministic and period-independent so markers don't reshuffle on zoom"
  - "Added site/src/**/*.test.ts to the root vitest include so the co-located data-layer specs are discovered by `vitest run`"

patterns-established:
  - "Pattern: period → MarkerDatum producer is pure (no fetch/DOM), 100% unit-tested, reusable by a Phase-4 selector"
  - "Pattern: content-hashed derived URLs are ALWAYS resolved via manifest.stations[id].file, never constructed as derived/{id}.json"

requirements-completed: [MAP-02]

# Metrics
duration: 5min
completed: 2026-07-20
---

# Phase 3 Plan 02: Data Slice (manifest resolution + decode → averages → MarkerDatum) Summary

**Pure, Node-free client data layer that resolves content-hashed derived filenames from `manifest.json`, decodes them via `decodeDerived` (from the `/derive` subpath), and computes default-period per-station `MarkerDatum`s with coverage-honest temp, scalar/circular wind, and the án úrkomu / breytileg átt / ófullnægjandi-gögn edge cases — all TDD, all green offline against the committed real sample.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-07-20T08:46:38Z
- **Completed:** 2026-07-20T08:51Z
- **Tasks:** 2 (both TDD: RED test → GREEN feat)
- **Files modified:** 6 (5 created + 1 modified)

## Accomplishments

- **Loader + contract (Task 1):** `resolveDerivedFile(manifest, id)` returns the exact hashed filename (`derived/1.c1cf25669d53.json`, `derived/1350.eaecfc5ae78f.json`) — never `derived/{id}.json` — and degrades to `null` (never a throw) on unknown ids and malformed manifests. `assetUrl(base, path)` prefixes runtime fetch strings with `import.meta.env.BASE_URL`. The `MarkerDatum` contract and `DEFAULT_WINDOW` (doy 197–210) are exported as the single source Plan 03 renders and Phase 4 reparametrizes.
- **Transform (Task 2):** `computeMarkerDatum(meta, file, window=DEFAULT_WINDOW)` runs `decodeDerived` (from `@betravedur/pipeline/derive`) → `expandWindow`/`groupBySeasonYear`/`qualifyingYears`/`effectiveN` + `scalarMeanSpeed`/`circularMeanDirection` — no domain math reimplemented.
- **Edge cases pinned by tests against the real committed sample:**
  - **án úrkomu:** AWS #1350 (all-null `r`) → `hasPrecip=false` and the station is STILL emitted with real temp/wind (never hidden, never a zero).
  - **breytileg átt:** SYNOP #1 has no `dv` column → `circularMeanDirection` null → `windVariable=true`, `windDir=null`, scalar speed still present; plus a synthetic near-cancelling (0°/180°) fixture forcing `resultantSpeed < 0.5`.
  - **ófullnægjandi gögn:** a synthetic 2-year fixture → `sufficient=false`, `tempC=null`, no throw; an empty (no-rows) fixture never NaNs or throws.
- **Coverage honesty carried to the client:** effective N comes from qualifying data-coverage years (SYNOP #1 → n=77, AWS #1350 → n=15), not the 14-day picker span.
- **Bundle-safety gates green:** `decodeDerived` sourced only from `@betravedur/pipeline/derive` (root barrel grep count 0); no `node:` specifier in any of the three production modules.
- Full repo suite: **19 files, 162 passed / 3 pre-existing skips** — no regressions from the vitest include change.

## Task Commits

Each task was committed atomically (TDD RED → GREEN):

1. **Task 1 (RED): failing loader tests** — `78ed98d` (test) — also registers `site/src/**/*.test.ts` in the vitest include (blocking fix, see Deviations)
2. **Task 1 (GREEN): loader + MarkerDatum contract** — `d8e979b` (feat)
3. **Task 2 (RED): failing period→MarkerDatum tests** — `56a0332` (test)
4. **Task 2 (GREEN): period→MarkerDatum transform** — `a2d0ece` (feat)

**Plan metadata:** _(final docs commit — this SUMMARY + STATE + ROADMAP + REQUIREMENTS)_

## Files Created/Modified

- `site/src/data/types.ts` — `MarkerDatum` contract (temp/wind speed/dir/variable/precip/coverage/priority) + `DEFAULT_WINDOW {197,210}`
- `site/src/data/load.ts` — `resolveDerivedFile` (hashed name, null-safe), `assetUrl` (BASE_URL prefix), `loadStations`/`loadManifest`/`loadDerived` fetch helpers; Node-free
- `site/src/data/load.test.ts` — hashed-filename resolution + BASE_URL tests against the real committed manifest
- `site/src/data/averages.ts` — `computeMarkerDatum` pure transform (decode → domain math → datum) with all three edge cases; `stationPriority` heuristic
- `site/src/data/averages.test.ts` — real-sample + synthetic-fixture tests (temp/N gate, án úrkomu, precip present, breytileg átt ×2, ófullnægjandi, empty no-throw)
- `vitest.config.ts` — added `site/src/**/*.test.ts` to the test `include`

## Decisions Made

- **DEFAULT_WINDOW {197,210}** (≈ week 30 summer, non-wrapping) is the single fixed-period source until Phase 4's selector replaces it — season-year grouping is trivial for a non-wrapping window (RESEARCH A5).
- **breytileg átt threshold:** `windVariable` when `circularMeanDirection` is null OR `resultantSpeed < 0.5` (`VARIABLE_DIRECTION_FLOOR`). Mirrors the Phase-1 atan2(0,0) honesty; the real AWS #1350 case (resultantSpeed 0.68) stays a concrete direction.
- **priority heuristic** (for Plan 03's `symbol-sort-key`, lower = wins): manned SYNOP/climate (sk/vf) outrank AWS (sj), then earlier `start`, then lower station id. Deterministic and period-independent so markers don't reshuffle across zoom/period changes.
- **`encodeDerived` (also on the `/derive` subpath) is used in tests** to build synthetic fixtures for the breytileg/ófullnægjandi edges — keeps the fixtures readable and guarantees they round-trip through the exact production codec.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Registered site unit tests in the vitest include**
- **Found during:** Task 1 (RED run)
- **Issue:** The root `vitest.config.ts` `include` only covered `packages/**`, `pipeline/**`, and `test/**`. A `vitest run site/src/data/load.test.ts` reported "No test files found" because an explicit CLI path is filtered against `include` — so the new co-located site specs (the plan's verify command targets) were undiscoverable.
- **Fix:** Added `"site/src/**/*.test.ts"` to `test.include`.
- **Files modified:** `vitest.config.ts`
- **Verification:** `npx vitest run site/src/data/load.test.ts` now discovers and runs the suite; full `vitest run` stays green (162 passed / 3 skipped), no other suites affected.
- **Committed in:** `78ed98d` (Task 1 RED commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking).
**Impact on plan:** Necessary for the plan's own verify commands to execute; no scope creep, no behavior change to shipped code (test-runner config only).

## Issues Encountered

- The pipeline package lives at `pipeline/` (not `packages/pipeline/`); `derive.ts` and its `./derive` subpath export were confirmed there. No impact — the `@betravedur/pipeline/derive` import specifier is unchanged.
- A throwaway probe script could not resolve workspace packages from `/tmp` (module resolution); it was run from inside the repo tree, then deleted before committing. No probe artifact remains.

## User Setup Required

None — no external services, secrets, or API keys. The transform runs entirely offline against the committed static sample.

## Next Phase Readiness

- **Ready for Plan 03 (markers):** `computeMarkerDatum` + `MarkerDatum` + `DEFAULT_WINDOW` give the renderer a fully-typed, coverage-honest datum per station, with `priority` ready for the symbol-layer `symbol-sort-key` and the án úrkomu / breytileg átt / muted states already resolved in the data (no rendering-time branching on raw rows).
- **Ready for Phase 4 (selectors):** the producer takes `window` as a parameter defaulting to the single `DEFAULT_WINDOW` source — a selector swaps the period without re-architecting.
- No new blockers. Pre-existing Phase-1 gates (Veðurstofan redistribution terms; sunshine/cloud coverage) are unrelated to this pure data slice.

## Self-Check: PASSED

All five created files verified present; `vitest.config.ts` modification verified. All four task commits (`78ed98d`, `d8e979b`, `56a0332`, `a2d0ece`) found in git history. Acceptance grep gates confirmed: `@betravedur/pipeline/derive` present (2), root barrel absent (0), `node:` absent in all three production modules (0). Both unit suites green (17 tests); full repo suite green (162 passed / 3 skipped).

## TDD Gate Compliance

Both tasks (`type="tdd"`) followed RED → GREEN with the test commit preceding the feat commit:
- Task 1: `78ed98d` (test — RED, module missing) → `d8e979b` (feat — GREEN, 9/9).
- Task 2: `56a0332` (test — RED, module missing) → `a2d0ece` (feat — GREEN, 8/8).
No REFACTOR commits needed (implementations were clean; the one comment reword to satisfy the literal `node:` grep gate was folded into the Task-2 GREEN commit before it landed).

---
*Phase: 03-static-site-shell-interactive-map*
*Completed: 2026-07-20*
