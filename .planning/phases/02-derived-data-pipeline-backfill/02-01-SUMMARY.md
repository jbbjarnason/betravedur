---
phase: 02-derived-data-pipeline-backfill
plan: 01
subsystem: pipeline
tags: [pipeline, derived, columnar, quantize, season-year, size-budget, tdd, zlib]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "@betravedur/domain (DailyObservation, StationType, WindowSpec, leapFoldedDoy, groupBySeasonYear) and @betravedur/fetch (schema-asserting fetchers, live fixtures)"
provides:
  - "@betravedur/pipeline workspace registered in monorepo + Vitest"
  - "encodeDerived / decodeDerived — columnar integer-quantized implicit-date derived format (pipeline/src/derive.ts)"
  - "DerivedFile / QuantSpec type contracts for the artifact Phase 3+ consumes"
  - "Real 6-year AWS + SYNOP normalized fixtures for offline-deterministic tests"
  - "Locked season-year round-trip (incl. Dec->Jan wrap, WR-03) and <=4 KB/station-year gzip size-budget contracts"
affects: [02-02-backfill, 02-04-orchestrator, phase-3-client-aggregation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Columnar integer-quantized implicit-date encoding: flat length-nYears*365 arrays; position i -> (calendarYear=startYear+floor(i/365), leapFoldedDoy=(i%365)+1)"
    - "Calendar-year storage + re-group-on-decode via groupBySeasonYear (WR-03): December is NOT pre-shifted in storage"
    - "null preservation with all-null column drop; station-type column omission (AWS omits r, SYNOP omits dv)"

key-files:
  created:
    - pipeline/src/derive.ts
    - pipeline/test/derive.test.ts
    - pipeline/test/fixtures/kef-aws-multiyear.json
    - pipeline/test/fixtures/rvk-synop-multiyear.json
  modified:
    - pipeline/src/index.ts

key-decisions:
  - "Stored columns are CALENDAR-year-indexed; December is not pre-shifted — both pipeline and client re-group via groupBySeasonYear after decode (WR-03, RESEARCH Pitfall 5). Pre-shifting would double-apply the season shift and miscount the boundary season."
  - "Quantization: temp/wind x10 (0.1 precision), dv/precip x1 (whole units) via Math.round; null cells stay JSON null, never 0."
  - "All-null columns are dropped from cols (key absent) and reconstructed as null on decode; AWS structurally omits r, SYNOP omits dv."
  - "decodeDerived emits a row only where at least one present column has a non-null value — it never fabricates fully-missing days the encoder never wrote."

patterns-established:
  - "Derived file shape { station, type, startYear, nYears, quant, cols }: single compact artifact Phase 3+ downloads; decodable back to DailyObservation[] within integer quantization."
  - "Zero new runtime deps — Node built-ins only (node:zlib for the size-budget measurement)."

requirements-completed: [DATA-04, DATA-07]

# Metrics
duration: ~20min (resume of stalled run)
completed: 2026-07-20
---

# Phase 2 Plan 01: Derived Data Pipeline Format Summary

**Columnar integer-quantized implicit-date derived encoder/decoder (`encodeDerived`/`decodeDerived`) that round-trips `DailyObservation[]` losslessly within quant, locks the Dec->Jan season-year wrap contract (WR-03), and holds a 1757 B/station-year gzip budget on a real Keflavík AWS fixture.**

## Performance

- **Duration:** ~20 min (resumed a stalled mid-Task-2 run)
- **Completed:** 2026-07-20T06:55:38Z
- **Tasks:** 2 (Task 1 completed in prior session; Task 2 completed this session)
- **Files modified:** 5 (4 created, 1 modified) this session

## Accomplishments
- `pipeline/src/derive.ts`: pure `encodeDerived`/`decodeDerived` — columnar, integer-quantized, implicit-date shape; groups by calendar-year × leap-folded doy; drops all-null columns; omits `r` on AWS and `dv` on SYNOP.
- Season-year round-trip contract locked by two tests: a non-wrapping mid-July window AND a wrapping Dec->Jan window `{startDoy:364,endDoy:3}` — per-season N and mean are byte-identical to the direct domain path (an off-by-one at the year boundary would fail it).
- Null preservation proven: `null` metric cells survive the round-trip as `null` (never 0); all-null columns are dropped and reconstructed as null.
- Size budget holds with headroom: real 6-year Keflavík AWS fixture encodes to **1757 bytes/station-year gzip (level 9)**, well under the 4096 budget.
- Full monorepo suite stays green (102 passed, 3 BETRA_LIVE-gated skips); `tsc -p pipeline/tsconfig.json --noEmit` clean.

## Task Commits

1. **Task 1: Create pipeline workspace + register in monorepo/Vitest** - `3c17c87` (feat) — *prior session*
2. **Task 2 (RED): failing derive tests + real fixtures** - `ab2d680` (test)
3. **Task 2 (GREEN): implement derive.ts encode/decode** - `f50e5c7` (feat)

_TDD gate: RED (`test`) precedes GREEN (`feat`). No refactor commit — implementation clean on first GREEN._

## Files Created/Modified
- `pipeline/src/derive.ts` - `encodeDerived`/`decodeDerived` columnar quantized encoder/decoder + `DerivedFile`/`QuantSpec` types; top-of-file comment documents the WR-03 calendar-store + re-group-on-decode convention.
- `pipeline/test/derive.test.ts` - Tests A-E: round-trip (non-wrapping + Dec->Jan wrap), null preservation, all-null column drop, column presence by type, gzip size budget.
- `pipeline/test/fixtures/kef-aws-multiyear.json` - Real normalized Keflavík (1350) AWS rows, 2005-2010 (6 years, 1835 rows).
- `pipeline/test/fixtures/rvk-synop-multiyear.json` - Real normalized Reykjavík (1) SYNOP rows, 2005-2010 (6 years, 2190 rows).
- `pipeline/src/index.ts` - Barrel now re-exports `encodeDerived`/`decodeDerived` + `DerivedFile`/`QuantSpec`.

## Decisions Made
- **Calendar-year storage, re-group on decode (WR-03 / Pitfall 5):** columns are indexed by calendar year; December is not pre-shifted. Both pipeline and client re-apply `groupBySeasonYear` after decode. This keeps a wrapping window's boundary season correct; pre-shifting in storage would double-apply the shift.
- **Quantization factors:** temp/wind ×10, dv/precip ×1, via `Math.round`. Round-trip asserts closeness within one quant unit; dv is whole-degree exact.
- **Decode only materializes days the encoder wrote** (at least one present non-null column at that position), avoiding fabrication of the full nYears×365 dense grid as observations.

## Deviations from Plan
None - plan executed exactly as written. The existing RED test authored in the stalled session already matched the Task 2 spec (Tests A-E, both round-trip windows, size budget on a real fixture); it had no unused `StationType` import to clean, so it was kept as-is and committed. `derive.ts` was implemented fresh to GREEN.

## Issues Encountered
None. The stalled run had left the RED test and fixtures uncommitted on disk; resume protocol confirmed RED (missing `../src/derive.js`), committed RED, implemented GREEN, and verified all named tests plus the full suite.

## User Setup Required
None - no external service configuration required. Fixtures are committed for offline determinism; no live fetch needed to run the tests.

## Next Phase Readiness
- The derived-file shape (`DerivedFile`) and `encodeDerived`/`decodeDerived` contract are pinned — Plan 02 (backfill) and Plan 04 (orchestrator) can build against a proven, size-verified format.
- Size headroom confirmed (1757 B/station-year vs 4 KB budget) supports the "tens of KB gzipped per station" phase goal comfortably.
- Open Phase 2 concerns unchanged: raw-data footprint vs GitHub 1 GB limit (to measure during backfill) and PMTiles extract size — both tracked in STATE blockers.

## Self-Check: PASSED

All created files exist on disk (derive.ts, derive.test.ts, both fixtures, this SUMMARY) and both TDD commits (`ab2d680` RED, `f50e5c7` GREEN) are present in git history.

---
*Phase: 02-derived-data-pipeline-backfill*
*Completed: 2026-07-20*
