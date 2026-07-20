---
phase: 02-derived-data-pipeline-backfill
plan: 03
subsystem: pipeline
tags: [pipeline, manifest, content-hash, stations, cache-busting, registry, sha256]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "@betravedur/domain (StationMeta, effectiveN N>=3 gate) and @betravedur/fetch (no-splice parseStationsBody/registry for the fetch-edge wiring Plan 04 does)"
  - phase: 02-derived-data-pipeline-backfill
    provides: "Plan 01 derived-file format (the bytes manifest content-hashes); Plan 02 rawstore highWaterYear (the on-disk half of the marks manifest records)"
provides:
  - "contentHash — truncated (12-hex) sha256 content address of derived bytes (immutable-cache delta key)"
  - "updateManifest / serializeManifest / readManifest — per-station hashed filename + high-water marks, byte-stable delta serialization"
  - "buildStationsJson / serializeStationsJson — marker manifest generated from the no-splice registry, gated on >=3 qualifying years of REAL data"
  - "Manifest / ManifestEntry / StationEntry type contracts Phase 3's client consumes"
affects: [02-04-orchestrator, phase-3-client-markers, phase-8-nightly-cron]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Content-addressed derived filenames: derived/{station}.{hash}.json where hash = sha256(bytes).slice(0,12); hash changes IFF bytes change (returning-visitor cache deltas)"
    - "Pure/referentially-safe manifest update: updateManifest never mutates input, touches only the target station's entry, and short-circuits to a byte-identical entry when bytes are unchanged"
    - "Filter-on-real-data gate: buildStationsJson includes a station via effectiveN(qualifyingCount).sufficient (>=3), NOT on `start` — keeps 'meðaltal N ára' honest"
    - "Field-by-field entry build (no {...spread}) so registry-only keys (abbr/wigos) never leak into the shipped marker manifest"

key-files:
  created:
    - pipeline/src/manifest.ts
    - pipeline/src/stations.ts
    - pipeline/test/manifest.test.ts
    - pipeline/test/stations.test.ts
  modified:
    - pipeline/src/index.ts
    - pipeline/package.json

key-decisions:
  - "HASH_LEN = 12 hex chars (48 bits): collision-safe far beyond the ~518 day-servable stations while keeping filenames short; documented in code and asserted by the hash test."
  - "updateManifest short-circuits on an unchanged hash — returns the existing entry verbatim (only a shallow stations-map copy) so an unchanged station serializes byte-identically (delta-friendly nightly commits)."
  - "buildStationsJson is PURE over StationMeta[] + a qualifying-years count Map; the real fetch-edge (parseStationsBody/toStationMeta) and count computation are wired by Plan 04's aggregator — this module stays offline-testable and never fetches."
  - "effectiveN(new Array(count)).sufficient reuses the domain N>=3 gate rather than re-implementing >=3 in the pipeline (single source of truth for the display bar)."

patterns-established:
  - "Manifest shape { stations: Record<number, {file,hash,from,to,lastFetched}> }: station-id-sorted, fixed field order => byte-stable serialization for minimal nightly diffs."
  - "StationEntry is StationMeta's field set built explicitly at the artifact boundary — no field invention, no splicing, integer-keyed (DATA-06 carried forward)."

requirements-completed: [DATA-04, DATA-07]

# Metrics
duration: 3min
completed: 2026-07-20
---

# Phase 2 Plan 03: Manifest & Stations Index Layer Summary

**Content-addressed manifest (`contentHash`/`updateManifest`) that turns each nightly redeploy into a delta — a station's `derived/{station}.{hash}.json` and high-water marks change IFF its derived bytes change — plus `buildStationsJson`, the no-splice marker manifest gated on >=3 qualifying years of REAL daily data (not `start`), keeping qualifying decommissioned stations.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-07-20T07:08:13Z
- **Completed:** 2026-07-20T07:11:11Z
- **Tasks:** 2 (both TDD: RED -> GREEN)
- **Files modified:** 6 (4 created, 2 modified)

## Accomplishments
- **Content-hashed cache-busting manifest:** `contentHash` is a deterministic 12-hex-char sha256 content address of the derived bytes; `updateManifest` is pure and rewrites a station's hashed filename + `{from,to,lastFetched}` high-water marks ONLY when its bytes change, leaving every other station's entry untouched — the "hash changes iff bytes change" delta property that makes returning-visitor caches deltas.
- **Byte-stable delta serialization:** `serializeManifest` re-keys stations in ascending id with a fixed field order, so an unchanged manifest serializes byte-identically (verified via insertion-order-independent re-serialization) — minimal nightly `data`-branch diffs.
- **Honest marker manifest:** `buildStationsJson` filters the no-splice registry to stations with >=3 qualifying years of ACTUAL daily data via the domain `effectiveN` gate (NOT `start`), so a station with a 1949 `start` but <3 real qualifying years is excluded while a decommissioned station (`ending != null`) clearing the bar is retained with `ending` carried through.
- **No-splice / no field invention:** each `StationEntry` is built field-by-field from `StationMeta` (no `{...spread}`), keyed by integer station id; two ids at one place (990 synop vs 1350 aws) stay distinct — Phase-1 DATA-06 carried forward.
- **Whole monorepo stays green:** 121 passed / 3 BETRA_LIVE-gated skips (pipeline 25/25); `tsc -p pipeline/tsconfig.json --noEmit` clean. Zero new npm dependencies (Node `crypto`/`fs` + existing workspace deps only).

## Task Commits

Each task was committed atomically via TDD (RED test -> GREEN feat):

1. **Task 1 (RED):** failing manifest + content-hash tests - `e9fd9c2` (test)
2. **Task 1 (GREEN):** content-hash + manifest read/update/serialize - `8a25964` (feat)
3. **Task 2 (RED):** failing stations.json generation tests - `a40bdb1` (test)
4. **Task 2 (GREEN):** generate stations.json from registry, gated on >=3 qualifying years - `2912a20` (feat)

_TDD gate: each RED (`test`) precedes its GREEN (`feat`). No refactor commits — both implementations clean on first GREEN._

## Files Created/Modified
- `pipeline/src/manifest.ts` - `contentHash` (truncated sha256), `updateManifest` (pure, delta-property), `serializeManifest` (byte-stable id-sorted), `readManifest` (tolerant load); `Manifest`/`ManifestEntry`/`HighWaterMarks` types; `HASH_LEN` documented. Node crypto/fs only.
- `pipeline/src/stations.ts` - `buildStationsJson` (pure filter on qualifying-years via `effectiveN`, field-by-field entry build, id-sorted), `serializeStationsJson`; `StationEntry` type. Pure over `StationMeta[]` — no fetch/parse re-impl.
- `pipeline/test/manifest.test.ts` - Tests A-D: stable hash, delta property (unchanged-untouched + changed-only-that-station + untouched-neighbor), high-water marks + byte-identical re-serialization, filename convention.
- `pipeline/test/stations.test.ts` - Tests A-D: filter-on-data-not-start exclusion, decommissioned retention, no-splice integer keys / exact fields, deterministic id-sorted serialization.
- `pipeline/src/index.ts` - Barrel re-exports manifest + stations APIs and types.
- `pipeline/package.json` - Added `./manifest` and `./stations` subpath exports.

## Decisions Made
- **HASH_LEN = 12 hex (48 bits):** collision-safe far beyond the ~518 day-servable stations; short filenames. Documented in code and asserted by Test A's length regex.
- **Unchanged-bytes short-circuit in `updateManifest`:** returns the existing entry verbatim (only a shallow map copy) so an unchanged station is byte-identical on re-serialize — the delta-friendly-commit guarantee.
- **`effectiveN` reuse for the >=3 bar:** the pipeline calls the domain N>=3 gate (`effectiveN(new Array(count)).sufficient`) rather than re-implementing `>=3`, keeping the display-honesty bar single-sourced in `@betravedur/domain`.
- **Pure modules, edge-wired later:** both `buildStationsJson` (over `StationMeta[]` + a count Map) and the manifest functions (over bytes) are pure and offline-testable; Plan 04's aggregator supplies the real registry (`parseStationsBody`) and the qualifying-years counts computed from actual data.

## Deviations from Plan

None - plan executed exactly as written. Both tasks followed the specified RED->GREEN TDD cycle; every acceptance-criteria grep and test passed on the first GREEN.

## Threat Register Coverage
- **T-02-07 (station splicing / field invention):** mitigated — `StationEntry` built field-by-field from `StationMeta` (grep confirms no `{...station}` spread in code); Test C asserts distinct ids never merged and fields carried exactly; registry-only keys (abbr/wigos) cannot leak.
- **T-02-08 (stale manifest hash serves wrong derived file):** mitigated — `contentHash` addresses the actual bytes; Test B's delta property proves the hash+filename change IFF the bytes change and never spuriously for an untouched station.
- **T-02-09 (data-thin stations break "meðaltal N ára" honesty):** mitigated — `buildStationsJson` filters on real qualifying-years via `effectiveN` (>=3), not `start`; Test A explicitly excludes an early-`start`/<3-year station.
- **T-02-SC (npm installs):** honored — zero new packages; `manifest.ts` imports only `node:crypto`/`node:fs`, `stations.ts` only the existing `@betravedur/domain`.

## Issues Encountered
None. Both RED phases failed for the right reason (missing `../src/*.js` module), and both implementations reached GREEN on the first attempt with full-suite + tsc clean.

## User Setup Required
None - no external service configuration required. All tests are offline/deterministic (in-memory bytes + station fixtures shaped like the fetch registry); no live API call needed.

## Next Phase Readiness
- Plan 04 (orchestrator/aggregate) can now assemble the full derived output: drive `backfillStation` (Plan 02) -> `encodeDerived` (Plan 01) -> `updateManifest` for cache-busting bookkeeping, and `buildStationsJson` over the real `parseStationsBody` registry with qualifying-years counts computed from the raw/derived data.
- Phase 3's client contract is pinned: `stations.json` (markers) + `manifest.json` (immutable derived URLs via `{station}.{hash}.json`).
- Phase 8's nightly cron gets delta-friendly commits — byte-stable manifest + stations serialization means only genuinely changed stations produce diffs.
- Open Phase 2 concern unchanged: actual raw-store footprint vs the GitHub 1 GB soft limit (measurable during a real backfill run in Plan 04).

## Self-Check: PASSED

All created files exist on disk (manifest.ts, stations.ts, manifest.test.ts, stations.test.ts, this SUMMARY) and all four TDD commits (`e9fd9c2` RED, `8a25964` GREEN, `a40bdb1` RED, `2912a20` GREEN) are present in git history. Pipeline suite 25/25; full suite 121 passed / 3 skipped; pipeline tsc clean.

---
*Phase: 02-derived-data-pipeline-backfill*
*Completed: 2026-07-20*
