---
phase: 02-derived-data-pipeline-backfill
reviewed: 2026-07-20T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - packages/fetch/src/client.ts
  - pipeline/src/aggregate.ts
  - pipeline/src/backfill.ts
  - pipeline/src/derive.ts
  - pipeline/src/manifest.ts
  - pipeline/src/rawstore.ts
  - pipeline/src/stations.ts
  - pipeline/src/index.ts
findings:
  critical: 1
  warning: 6
  info: 4
  total: 11
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-07-20T00:00:00Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Reviewed the new `pipeline/` package (backfill runner, raw store, derive encode/decode,
manifest, stations index, aggregate orchestrator) plus the `@betravedur/fetch` client's
retry layer. The core round-trip logic is sound: `doyToMonthDay` is a verified exact inverse
of `leapFoldedDoy` across all 365 positions, quantization is symmetric, null-preservation and
all-null-column drop are correct, the manifest delta/serialization contracts hold, and the
season-year "store calendar / regroup on decode" convention (WR-03) is faithfully preserved
end-to-end.

The findings concentrate in two areas the passing tests do not exercise: **path-injection
safety of the on-disk store** (untrusted station/year values are interpolated straight into
filesystem paths) and **partial-failure/consistency behavior of the aggregate orchestrator**
(the one BLOCKER is a security concern; several WARNINGs concern orphaned derived files, a
resume/return-value inconsistency, and an entirely untested station-inclusion gate). No
hardcoded secrets were found; raw data is architecturally prevented from shipping via
`shipOutputs()`, though nothing enforces that at write time.

## Critical Issues

### CR-01: Station/year values are interpolated into filesystem paths without validation (path traversal)

**File:** `pipeline/src/rawstore.ts:42-44`, and callers `pipeline/src/aggregate.ts:61-70,116-127`

**Issue:** `partitionPath` builds a path with `join(root, "raw", String(station), \`${year}.ndjson\`)`
and `upsertPartition` / `readPartition` / `highWaterYear` all trust `station` and (for the
directory scan) the on-disk filenames. `station` originates from `DailyObservation.station`
(API-derived) and, in the aggregate CLI, from `Number(idStr)` parsed off argv. `Number(...)`
happily produces negatives, and `String(station)` of a negative or fractional id is not
constrained to `[0-9]+`. A `station` such as `-1` yields `raw/-1/...`, and because these ids
also flow into `manifest.file = \`derived/${station}.${hash}.json\`` (manifest.ts:83) and into
`writeFileSync(join(root, next.stations[station].file), ...)` (aggregate.ts:126), a crafted or
buggy id like `../../evil` (if a non-integer id ever reaches the store — the aggregate CLI
guards with `Number.isInteger`, but `upsertPartition`/`readPartition` are exported library
functions with NO such guard) would write outside the intended `raw/`/`derived/` subtrees. The
raw store functions are part of the public barrel (`index.ts:9-14`) and accept `station: number`
with no `Number.isInteger`/non-negative assertion.

**Fix:** Validate at the store boundary before any path construction:
```typescript
function assertStationId(station: number): void {
  if (!Number.isInteger(station) || station < 0) {
    throw new Error(`invalid station id: ${station}`);
  }
}
// call in partitionPath / upsertPartition / readPartition / highWaterYear
```
Apply the same guard to `year` in `partitionPath`, and in `aggregate.ts` verify the resolved
`outPath` still lives under `root` before `writeFileSync` (e.g. `resolve(outPath).startsWith(resolve(root))`).

## Warnings

### WR-01: Aggregate partial failure orphans derived files and leaves manifest stale

**File:** `pipeline/src/aggregate.ts:164-177`

**Issue:** `main` writes `derived/{station}.{hash}.json` inside `aggregateStation` (line 128)
as each station is processed, but only writes `manifest.json` once, AFTER the whole loop
(line 176). If station 3 of 5 throws (e.g. a `readPartition` JSON parse error, or the CR-01
path error), stations 1–2 have already written new derived files to disk while `manifest.json`
is never updated. Result: orphaned `derived/*.json` files the manifest does not reference, and
a manifest that does not reflect the derived files that ARE on disk. The doc claims "the
manifest stay[s] consistent" on partial failure, but consistency here is accidental (old
manifest + new orphan files), not maintained.

**Fix:** Persist the manifest incrementally (write after each successful `aggregateStation`), or
buffer derived bytes in memory and flush all-or-nothing at the end so a mid-run failure leaves
no partial derived files. At minimum, wrap the loop so a failure still writes the manifest for
the stations that succeeded.

### WR-02: `backfillStation` return value disagrees with what a resume computes after trailing no-data years

**File:** `pipeline/src/backfill.ts:114-122`

**Issue:** `backfillStation` returns `highWater = yEnd` — the last calendar year *attempted*.
But resume reads `highWaterYear(root, station)`, which is derived from partition files that
actually exist on disk. When the newest chunk returns `[]` (404 no-data — an entirely normal
case per PIPELINE.md §2), `upsertPartition([])` writes nothing (rawstore.ts:100 early-returns),
so no partition exists for those years. The returned high-water (`yEnd`, e.g. 2026) then
overstates the on-disk high-water (e.g. 2024). The returned value is logged as authoritative
("high-water year = ${hw}", line 148) and is misleading; any caller that trusts the return
value instead of re-reading the store would skip re-attempting the trailing years. It is not a
data-loss bug (resume re-reads the store and re-fetches, idempotently), but the two sources of
truth diverge.

**Fix:** Return the store-derived high-water (`deps.highWaterYear(id)` after the loop) or
document explicitly that the return value is "last year attempted, not last year with data"
and is advisory only. Prefer deriving it from the store so it matches resume.

### WR-03: stations.json inclusion gate uses a hardcoded 92-day summer window that no test exercises

**File:** `pipeline/src/aggregate.ts:87-94`

**Issue:** `countQualifyingYears` gates map inclusion on a fixed `{startDoy:152,endDoy:243}`
window (~92 days) requiring ≥80% coverage (≈74 days of non-null `t`) per year for ≥3 years.
This function decides which stations appear on the map at all, yet every stations.test case
feeds `buildStationsJson` pre-computed counts directly — the real gate (this window + coverage
math over decoded data) is completely untested. The chosen window and threshold are effectively
a magic policy: a station with sparse summer temperature but rich winter data would be silently
excluded from the map. The comment calls it "representative" but nothing validates that against
real station shapes.

**Fix:** Add a test that drives `countQualifyingYears` (or `aggregateStation` → decode →
count) on realistic sparse fixtures and asserts the inclusion decision. Extract `152`/`243`/
coverage into named constants with a rationale, and consider whether a single summer window is
the right universal gate (vs. any window a station qualifies for).

### WR-04: Redundant re-read + double-encode of every station in aggregate `main`

**File:** `pipeline/src/aggregate.ts:165-167`

**Issue:** For each station, `main` calls `aggregateStation` (which internally does
`readAllRaw` + `encodeDerived`), then on the very next line calls
`decodeDerived(encodeDerived(readAllRaw(root, id), type))` — re-reading every raw partition
from disk and re-encoding a second time purely to obtain decoded rows for the qualifying-year
count. For a 78-year SYNOP station this loads and encodes all rows twice. Beyond the wasted
work, the two encodes could theoretically diverge if `readAllRaw` is non-deterministic (it is
not today, but the coupling is fragile). This is a correctness-adjacent maintainability defect,
not pure performance.

**Fix:** Have `aggregateStation` return (or expose) the encoded `DerivedFile` it already
computed, and decode that once:
```typescript
const { manifest: next, derived } = aggregateStation(...);
qualifyingCounts.set(id, countQualifyingYears(decodeDerived(derived)));
```

### WR-05: `encodeDerived` on an empty station emits `station: 0`, silently mislabeling the file

**File:** `pipeline/src/derive.ts:106-108`, consumed at `pipeline/src/aggregate.ts:110-113`

**Issue:** When `rows.length === 0`, `encodeDerived` returns `{ station: 0, ... }`. In
`aggregateStation` the derived bytes (with `station: 0`) are hashed and written to
`derived/{cliStation}.{hash}.json` — the filename uses the correct CLI id but the file's
internal `station` field is `0`. A station present in the spec list but with no raw data (e.g.
a brand-new station backfilled but all-404) produces a derived artifact whose payload claims
station 0. Any client keying on the in-file `station` would mis-attribute the data.

**Fix:** Thread the true station id into `encodeDerived` (pass it as a parameter rather than
inferring from `rows[0]`), so the empty case still emits the correct id.

### WR-06: `readPartition` does an unguarded `JSON.parse` per line — one corrupt byte crashes the whole run

**File:** `pipeline/src/rawstore.ts:86-90`

**Issue:** `readPartition` calls `JSON.parse(line)` with no try/catch. A truncated or
partially-written partition (e.g. an interrupted nightly write, disk-full, or a manually
edited file on the `data` branch) throws an uncaught `SyntaxError` that aborts `readAllRaw` →
`aggregateStation` → the entire aggregate run, and (per WR-01) leaves orphaned derived files.
`readManifest` deliberately handles corruption gracefully (manifest.ts:117-131); the raw store
does not, despite being the pipeline's source of truth.

**Fix:** Catch parse errors per line and either skip with a warning or fail with a message
identifying the offending partition and line number, so a single bad line is diagnosable and
does not silently take down an unrelated station's aggregation.

## Info

### IN-01: `encodeDerived` can produce `NaN` length if every row has an unparseable year

**File:** `pipeline/src/derive.ts:114-123`

**Issue:** If `rows.length > 0` but every row fails `Number.isInteger(y)` (line 117), `minYear`
stays `Infinity`, `nYears = maxYear - minYear + 1 = NaN`, and `new Array(NaN)` (line 133)
throws `RangeError`. Unreachable with normalized `DailyObservation` (dates are validated
upstream), but there is no defensive guard.

**Fix:** After the min/max scan, guard `if (!Number.isFinite(minYear)) return { station, type, startYear: 0, nYears: 0, quant, cols: {} };`.

### IN-02: `raw/` non-shipping is a documented convention, not an enforced invariant

**File:** `pipeline/src/aggregate.ts:56-58`

**Issue:** `shipOutputs()` returns a static list excluding `raw`, and PIPELINE.md §5 states raw
"NEVER ships," but nothing in code prevents a deploy step from copying `raw/`. The `.gitignore`
does not ignore `data/` either (only `node_modules`/`dist`/`coverage`). The safeguard rests
entirely on downstream discipline. Consider an explicit assertion in the (future) ship step
that the deploy set contains no path under `raw/`.

**Fix:** When the Phase-8 ship step lands, assert the resolved output set excludes any `raw/`
descendant rather than relying on `shipOutputs()` being used correctly.

### IN-03: Magic day-of-year constants duplicated across derive.ts and window.ts

**File:** `pipeline/src/derive.ts:28-30` (and `152`/`243` in `aggregate.ts:89`)

**Issue:** `CUMULATIVE_DAYS_BEFORE_MONTH` is copy-pasted from `packages/domain/src/window.ts:7-21`.
Two independent copies of the same calendar table can drift; the derive round-trip correctness
depends on them staying byte-identical. The `152`/`243` window bounds in aggregate.ts are also
bare magic numbers.

**Fix:** Export the cumulative-days table (or a shared `doyToMonthDay`) from `@betravedur/domain`
and import it in derive.ts, so the inverse pair is single-sourced.

### IN-04: `main` CLI errors surface only via `process.exitCode = 1` with no partial-progress report

**File:** `pipeline/src/aggregate.ts:188-193`, `pipeline/src/backfill.ts:152-157`

**Issue:** On failure the CLI logs the raw error and sets exit code 1, but (see WR-01) gives no
indication of which stations succeeded before the failure, making a nightly-cron failure harder
to triage. Minor; a summary line listing completed vs. failed stations would help operators.

**Fix:** Track completed station ids and print them alongside the error before exiting.

---

_Reviewed: 2026-07-20T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
