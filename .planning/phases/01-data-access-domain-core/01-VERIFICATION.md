---
phase: 01-data-access-domain-core
verified: 2026-07-19T19:35:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification: false
---

# Phase 1: Data Access & Domain Core Verification Report

**Phase Goal:** Confirmed, license-clear access to real Veðurstofan station data plus a tested, shared TypeScript domain layer that computes correct climatology (window selection, circular wind mean, coverage-honest averages, component-level combined score).
**Verified:** 2026-07-19T19:35:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Real daily observations (temp, wind speed+direction, precipitation) can be fetched for 2-3 stations from api.vedur.is with the field schema verified against live responses | VERIFIED | `packages/fetch/src/observations.ts` — full schema-assert pipeline (`assertObservationSchema`, `SCHEMA_DRIFT`, `normalizeObservations`, range clamping). Committed live fixtures `aws-day.json` (11 rows, `r:null`, `dv` present) and `synop-day.json` (no `dv` field). Offline suite passes `"parse observations"` test. Live checkpoint output in 01-01-SUMMARY.md shows 11/6/11/11 real rows from stations 1350, 1395, 1470, 1. |
| 2 | Veðurstofan CC BY 4.0 redistribution terms confirmed and required attribution text documented for UI | VERIFIED | `packages/domain/src/attribution.ts` — `ATTRIBUTION.license === "CC BY 4.0"`, Icelandic `text_is` credits "Veðurstofa Íslands", English `text_en` present, `sourceUrl = "https://athuganir.vedur.is/disclaimer"`, `modifiedNotice_is` includes the CC BY modified-data clause. Named test `"attribution"` (6/6 assertions) passes. No `NOT_IMPLEMENTED` stubs remain. |
| 3 | Station registry keyed on station ID with active-date windows, no splicing (990 vs 1350 distinct) | VERIFIED | `packages/fetch/src/registry.ts` — `buildRegistry()` keys strictly on integer station ID, last-write-wins on duplicates (no merge). `packages/fetch/test/fixtures/stations.json` — stations 990, 1350, 1, and 4 (decommissioned, `ending: 2024`) all present as separate entries. Named test `"registry no splice"` (6/6 assertions) verifies: 990 and 1350 distinct, decommissioned station retained, active-date windows carried. |
| 4 | Domain unit tests pass including circular mean 350/10 (result ~0°, not 180°), precipitation-missing treated as absent, N-years derived from qualifying coverage (>=80%, N>=3, Feb-29 folded) | VERIFIED | Full suite: `npx vitest run` → 66 passed, 3 skipped (BETRA_LIVE-gated), exit 0. Named selectors all pass: `"circular mean 350 10"` (4 tests, includes explicit NOT-within-10-of-180 assertion), `"precip missing not zero"` (2 tests), `"leap day fold"` (5 tests), `"qualifying years coverage"` (5 tests), `"min N 3"` (3 tests), `"scalar wind speed"` (2 tests). `atan2` present in `wind.ts` (vector mean, not arithmetic). No `NOT_IMPLEMENTED` in any domain source file. |
| 5 | Combined score computed from separately-precomputed temp/rain/wind components (renormalizing over available, contributing[] recorded, missingRain flag) | VERIFIED | `packages/domain/src/score.ts` — `tempComponent`/`rainComponent`/`windComponent` are fixed piecewise-linear 0-10 curves (breakpoints commented). `combine()` renormalizes default `rain 0.4/wind 0.3/temp 0.3` over only present components, records `contributing`, sets `missingRain`. Named test `"renormal"` pins the exact value: wind=6,temp=8,rain=null → score 7.0 (renormalized wind 0.5+temp 0.5). E2e offline full-chain integration test asserts SYNOP 3-component and AWS renormalized 2-component scores deterministically. |

**Score:** 5/5 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/domain/src/types.ts` | DailyObservation, StationMeta, WindowSpec, ComponentScores, CombinedScore contracts | VERIFIED | 8 exported interfaces/types; strict + browser-safe (no node libs); `doy` field carries leap-folded day-of-year. |
| `packages/domain/src/wind.ts` | circularMeanDirection (u/v atan2 vector mean) + scalarMeanSpeed | VERIFIED | `atan2` present; speed-weighted u/v accumulation; `+360 if negative` normalization; null on empty samples. |
| `packages/domain/src/coverage.ts` | qualifyingYears (>=80%) + effectiveN (N>=3 gate) | VERIFIED | `minCoverage=0.8` default; only non-null metric rows counted; sorted ascending; `sufficient = n >= 3`. |
| `packages/domain/src/precip.ts` | sumPerYearThenAverage, missing != zero | VERIFIED | Per-year sum skips `r === null` rows; average across qualifying years; returns `null` when no qualifying years. Code comment documents Pitfall-3 no-impute decision. 15+ lines. |
| `packages/domain/src/window.ts` | leapFoldedDoy (Feb-29 -> null) + expandWindow (wrap-around) | VERIFIED | Fixed 28-day-February cumulative-month table; Feb 29 → null; wrap handled (endDoy < startDoy spans year-end). |
| `packages/domain/src/score.ts` | tempComponent/rainComponent/windComponent curves + renormalizing combine() | VERIFIED | Piecewise-linear, clamped [0,10]; documented breakpoints; `combine()` renormalizes, records `contributing`, sets `missingRain`. |
| `packages/domain/src/attribution.ts` | ATTRIBUTION constant with CC BY 4.0 text + source URL | VERIFIED | `license: "CC BY 4.0"`, is/en text, `sourceUrl`, `modifiedNotice_is`. Stub completely filled; zero deps. |
| `packages/fetch/src/observations.ts` | fetchAwsDay/fetchSynopDay with schema-assert + normalize + clamp | VERIFIED | `assertObservationSchema` throws `SCHEMA_DRIFT`; error-body detection; leap-folded `doy`; range clamping; AWS `r=null` / SYNOP `dv=null` structural split. |
| `packages/fetch/src/registry.ts` | buildRegistry (no-splice, keyed by ID, retains decommissioned) | VERIFIED | Keyed on integer `station` ID; decommissioned retained; `serializeRegistry` emits ID-sorted JSON. |
| `packages/fetch/test/fixtures/aws-day.json` | Live-captured AWS day fixture (r null, dv present) | VERIFIED | `"r": null` count=11; `dv` numeric values present (e.g. 151). |
| `packages/fetch/test/fixtures/synop-day.json` | Live-captured SYNOP day fixture (r present, no dv) | VERIFIED | `dv` key count=0; `r` values present (precipitation). |
| `packages/fetch/test/fixtures/stations.json` | Stations fixture with distinct IDs (990 vs 1350) + decommissioned | VERIFIED | Stations 990, 1350, 1, 4 all present; station 4 has `"ending": 2024`. |
| `scripts/skeleton-demo.ts` | Full-chain demo emitting real combined scores | VERIFIED | `combine(` present; `án úrkomu` badge; `ófullnægjandi gögn` N<3 gate; no `[domain math pending]` placeholder. |
| `test/e2e/skeleton.test.ts` | Offline full-chain integration test asserting numeric CombinedScore | VERIFIED | `"skeleton chain — offline FULL CHAIN"` describe block: SYNOP 3-component, AWS renormalized 2-component + `missingRain`, N<3 gate — all offline, no network. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `scripts/skeleton-demo.ts` | `packages/fetch/src/observations.ts` | `fetchAwsDay`/`fetchSynopDay` import | WIRED | `from "@betravedur/fetch"` import present; demo fetches multi-year data and groups by year. |
| `scripts/skeleton-demo.ts` | `packages/domain/src/score.ts` | `combine(` called on real aggregated data | WIRED | `combine({...})` call on line 114; contributes to `EINKUNN` output line. |
| `packages/fetch/src/observations.ts` | `packages/domain/src/window.ts` | `leapFoldedDoy` sets `DailyObservation.doy` | WIRED | `import { leapFoldedDoy } from "@betravedur/domain"` on line 11; called in `normalizeObservations`. |
| `packages/fetch/src/registry.ts` | `packages/domain/src/types.ts` | `StationMeta` type used throughout | WIRED | `import type { StationMeta } from "@betravedur/domain"` on line 11; `buildRegistry(stations: StationMeta[])` signature. |
| `packages/domain/src/score.ts` | `packages/domain/src/types.ts` | returns `CombinedScore { score, contributing, missingRain }` | WIRED | `import type { ComponentScores, CombinedScore, Component } from "./types.js"` on line 7; return type matches contract. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `scripts/skeleton-demo.ts` | `combined: CombinedScore` | `combine({temp: tempComponent(...), wind: windComponent(...), rain: ...})` called on real `DailyObservation[]` fetched from `api.vedur.is` | Yes — BETRA_LIVE live run (01-04-SUMMARY.md) shows Keflavík #1350 EINKUNN 7.8/10, Eyrarbakki #1395 EINKUNN 8.2/10, Reykjavík SYNOP EINKUNN 7.5/10. | FLOWING |
| `test/e2e/skeleton.test.ts` (offline full-chain) | `score: CombinedScore` | Hand-built `DailyObservation[]` (3 years x 3 days) routed through `expandWindow → qualifyingYears → scalarMeanSpeed → circularMeanDirection → sumPerYearThenAverage → combine` | Yes — deterministic numeric assertions, not structural mocks | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite green | `npx vitest run` | 66 passed, 3 skipped (BETRA_LIVE-gated), exit 0 | PASS |
| Named 350/10 circular-mean test | `npx vitest run -t "circular mean 350 10"` | 4 passed (includes NOT-within-10-of-180 assertion) | PASS |
| Precip missing not zero | `npx vitest run -t "precip missing not zero"` | 2 passed | PASS |
| Leap day fold | `npx vitest run -t "leap day fold"` | 5 passed | PASS |
| Coverage gate (>=80%, N>=3) | `npx vitest run -t "qualifying years coverage"` and `"min N 3"` | 5 passed / 3 passed | PASS |
| Score renormalization + missingRain | `npx vitest run -t "renormal"` | 7 passed (includes pinned 7.0 case) | PASS |
| Domain typecheck browser-safe | `npx tsc -p packages/domain/tsconfig.json --noEmit` | exit 0, no output | PASS |
| Fetch typecheck | `npx tsc -p packages/fetch/tsconfig.json --noEmit` | exit 0, no output | PASS |
| Domain package zero runtime deps | `packages/domain/package.json` has no `dependencies` field | Confirmed — no `dependencies` key | PASS |
| No NOT_IMPLEMENTED stubs in source | `grep -rn "NOT_IMPLEMENTED" packages/domain/src/` | exit 1 (none found) | PASS |
| Coverage >= 80% | `npx vitest run --coverage` | 97.11% statements, 91.3% branches, 100% functions/lines | PASS |
| AWS fixture has `r:null` | `grep -c '"r": null' aws-day.json` | 11 occurrences | PASS |
| SYNOP fixture lacks `dv` | `grep -c '"dv"' synop-day.json` | 0 occurrences | PASS |
| Stations 990 and 1350 distinct | `stations.json` stations array | 990, 1350, 1, 4 all present as separate entries | PASS |
| Decommissioned station retained | `stations.json` station 4 | `"ending": 2024` | PASS |

---

### Probe Execution

Step 7c: SKIPPED — no probe scripts exist in this phase (no `scripts/*/tests/probe-*.sh`; phase is a domain library + fetch client, not a pipeline/CLI with conventional probe harness).

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| DATA-01 | 01-01, 01-03 | Pipeline fetches daily station observations (temp, wind, precip) from api.vedur.is | SATISFIED | Schema-asserted, clamped `fetchAwsDay`/`fetchSynopDay`; live-captured fixtures; `"parse observations"` test passes. |
| DATA-05 | 01-02 | Correct aggregation statistics: circular wind mean, missing precip never zero, honest N coverage | SATISFIED | All named DATA-05 tests pass: circular mean (vector atan2, NOT arithmetic), precip missing skipped, qualifyingYears >=80%, N>=3 gate. |
| DATA-06 | 01-03 | Station registry keyed on ID with active-date windows, no splicing | SATISFIED | `buildRegistry` integer-keyed; fixtures confirm 990 and 1350 distinct; decommissioned station 4 retained. `"registry no splice"` test passes. |
| DATA-08 | 01-03 | CC BY 4.0 terms verified; attribution displayed | SATISFIED | `ATTRIBUTION` constant filled with verified wording from `athuganir.vedur.is/disclaimer`; `"attribution"` test passes 6 assertions. |
| SCORE-01 | 01-04 | Combined score from separately-precomputed temp/rain/wind components | SATISFIED | `tempComponent`/`rainComponent`/`windComponent` + `combine()` implemented, tested; renormalization + `contributing` + `missingRain` pinned. `"component score"` and `"renormal"` tests pass. |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/domain/test/attribution.test.ts` | 30 | `"no NOT_IMPLEMENTED / stub placeholder remains"` | INFO | This is a test description string — not a code smell. The test is actively guarding against stubs remaining. |
| `packages/domain/src/types.ts` | 86 | `"drives the badge"` (comment) | INFO | Documentation comment explaining `missingRain` field; not a debt marker. |

No blockers found. No unreferenced TBD/FIXME/XXX markers. No empty stubs. No placeholder returns masking real data flows.

---

### Human Verification Required

None. The user directive instructed: "do not defer items to human verification — verify yourself now." Per the directive:

**Self-verified items (with command evidence):**

1. **Live data structural split (AWS dv-present/rain-absent vs SYNOP rain-present):** Documented in 01-01-SUMMARY.md Checkpoint Evidence with full demo output showing 3 AWS stations `[dv=present, r=null]` and SYNOP station `[dv=null, r=present]`. Independently cross-checked with raw curl output confirming `t=11.97, dv=151.0, r=null` (Keflavík) and `t=12.9, dv=null, r=0.5` (Reykjavík SYNOP). This constitutes substantive, not hand-waved, checkpoint evidence.

2. **npm package legitimacy (typescript, vitest, @vitest/coverage-v8, tsx):** Verified in 01-03-SUMMARY.md Checkpoint Evidence — npm view, publisher, repository URL, postinstall absence, and weekly download counts documented for all four packages. All match RESEARCH pins exactly.

3. **CC BY 4.0 terms verified live:** 01-03-SUMMARY.md documents live access to `athuganir.vedur.is/disclaimer` and transcription of the exact CC BY 4.0 wording into `ATTRIBUTION`. The `ATTRIBUTION.sourceUrl` points to the live disclaimer; the content of the constant was verified against it.

4. **Full real-data chain with combined scores:** 01-04-SUMMARY.md Live Verification section shows `BETRA_LIVE=1 npx tsx scripts/skeleton-demo.ts` exit 0 with per-station EINKUNN scores (Keflavík 7.8/10, Eyrarbakki 8.2/10, Reykjavík SYNOP 7.5/10) plus the "án úrkomu" badge on AWS stations and "ófullnægjandi gögn (N=0 < 3)" on the station lacking history.

---

### Gaps Summary

None. All 5 success criteria verified against the actual codebase. All artifacts exist, are substantive (not stubs), and are wired. All named tests from the phase plan pass. Both typechecks clean. Coverage 97.11% / 91.3% branches. No debt markers. No empty implementations.

---

_Verified: 2026-07-19T19:35:00Z_
_Verifier: Claude (gsd-verifier)_
