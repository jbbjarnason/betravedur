---
phase: 02-derived-data-pipeline-backfill
plan: 02
subsystem: pipeline
tags: [pipeline, backfill, rawstore, chunking, pacing, resumable, idempotent, retry, ndjson]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "@betravedur/fetch (fetchAwsDay/fetchSynopDay: 404->[], 422->throw, retry/backoff; ApiHttpError extended here) and @betravedur/domain (DailyObservation)"
  - phase: 02-derived-data-pipeline-backfill
    provides: "Plan 01 established the @betravedur/pipeline workspace + Vitest + derive.ts format"
provides:
  - "ApiHttpError (status-carrying) on @betravedur/fetch — 413 surfaces without generic retry backoff; 502/503 backoff-then-surface; 404/422 semantics untouched"
  - "fetchChunk — chunked/halving span fetch: halves on 413/surviving-502 (depth<=3), returns [] for 404 no-data, propagates 503 (never [])"
  - "backfillStation — oldest->newest 5-year-chunk paced (>=250ms) loop; resumable via per-station high-water mark (highWaterYear->startYear handoff)"
  - "rawstore.ts — field-pruned (10-field) idempotent NDJSON store keyed by (station,date), partitioned raw/{station}/{year}.ndjson, byte-identical re-runs, highWaterYear resume"
  - "npm run backfill CLI entry (tsx pipeline/src/backfill.ts)"
affects: [02-04-orchestrator, phase-8-nightly-cron]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Status-aware fetch: ApiHttpError.status lets the loop branch on the measured error taxonomy (413 halve / 502 halve-after-retry / 503 propagate / 404 empty-advance)"
    - "Depth-bounded span halving over disjoint year sub-ranges — merged result never duplicates a (station,date)"
    - "Sequential paced loop (>=250ms, no Promise.all over fetches) — burst concurrency forbidden (503 throttle)"
    - "Idempotent partitioned NDJSON: explicit fixed-order 10-field record build (no spread) + date sort => byte-stable re-serialization"
    - "Dependency-injected fetch + store deps make error-taxonomy, pacing, and resume provable offline"

key-files:
  created:
    - pipeline/src/backfill.ts
    - pipeline/src/rawstore.ts
    - pipeline/test/backfill.test.ts
    - pipeline/test/rawstore.test.ts
    - pipeline/test/fixtures/error-413.json
    - pipeline/test/fixtures/error-502.json
    - pipeline/test/fixtures/error-503.json
  modified:
    - packages/fetch/src/client.ts
    - packages/fetch/src/index.ts
    - pipeline/src/index.ts
    - pipeline/package.json

key-decisions:
  - "413 escapes fetchWithRetry immediately (no backoff) — deterministic size rejection; retrying the identical URL wastes time, the loop halves instead."
  - "502 is halveable alongside 413 (flaky ~20k-row zone) but only AFTER the client's bounded backoff exhausts; 503 is NEVER halved to [] — it propagates as an error."
  - "backfillStation resume wiring landed in THIS plan (not deferred to 02-04): startYear omitted -> read highWaterYear -> start at highWater+1; re-run fetches only newer years."
  - "Raw store record built field-by-field in fixed key order (no {...spread}) — prunes rh/pressure/radiation AND guarantees byte-identical idempotent partitions."

patterns-established:
  - "ApiHttpError taxonomy branch — the single point where measured API failure modes map to loop actions."
  - "raw/{station}/{year}.ndjson partition + highWaterYear scan — the on-disk half of the resumable high-water-mark pattern the nightly cron (Phase 8) leans on."

requirements-completed: [DATA-02, DATA-07]

# Metrics
duration: 6min
completed: 2026-07-20
---

# Phase 2 Plan 02: Resumable Backfill Runner & Partitioned Raw Store Summary

**Chunked/paced/halving backfill loop (`fetchChunk`/`backfillStation`) over a status-aware `ApiHttpError` client, plus a field-pruned idempotent `(station,date)`-keyed NDJSON raw store with a high-water-mark resume that fetches only newer years — the DATA-02/DATA-07 engine proven entirely offline with mocked responses.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-20T06:58:02Z
- **Completed:** 2026-07-20T07:04:08Z
- **Tasks:** 2 (both TDD: RED -> GREEN)
- **Files modified:** 11 (7 created, 4 modified)

## Accomplishments
- **Status-aware fetch client:** `ApiHttpError` carries `.status`; 413 surfaces immediately without the generic multi-retry backoff, 502/503 get bounded backoff then surface, 404/422 body-inspection semantics untouched.
- **Chunked/paced/halving loop:** `fetchChunk` halves the span on 413 (and a surviving 502) down to single years (depth<=3), returns `[]` for 404 no-data and advances, and propagates a persistent 503 as an error — a 503 never resolves to `[]`. `backfillStation` walks a station oldest->newest in 5-year chunks, paces >=250ms, and never bursts (no `Promise.all` over fetches).
- **Field-pruned idempotent raw store:** `upsertPartition` writes `raw/{station}/{year}.ndjson` keyed by `(station,date)`, building each record explicitly in fixed key order (prunes rh/pressure/radiation) so two identical upserts produce a byte-identical file; new value wins on a duplicate date; rows sorted by date; per-calendar-year partitioning.
- **Resume wiring landed here (not deferred):** `backfillStation` with `startYear` omitted reads `highWaterYear` and resumes from `highWater+1`; the E2 test proves a resume fetches only years >= high-water+1 and a second resume when already current fetches nothing.
- **Whole monorepo stays green:** 113 passed / 3 BETRA_LIVE-gated skips; `tsc -p pipeline` and `tsc -p packages/fetch` both clean; Phase-1 fetch suite unaffected by the client change.

## Task Commits

Each task was committed atomically via TDD (RED test -> GREEN feat):

1. **Task 1 (RED):** failing backfill error-taxonomy + pacing tests + 413/502/503 fixtures - `ebb9c8a` (test)
2. **Task 1 (GREEN):** status-aware client + chunked/paced/halving backfill loop - `a00e8c3` (feat)
3. **Task 2 (RED):** failing raw-store + high-water resume tests - `235351d` (test)
4. **Task 2 (GREEN):** field-pruned idempotent raw store + high-water resume - `3b6f1a5` (feat)

_TDD gate: each RED (`test`) precedes its GREEN (`feat`). No refactor commits — both implementations clean on first GREEN._

## Files Created/Modified
- `packages/fetch/src/client.ts` - Added `ApiHttpError` (status-carrying); 413 throws without backoff; 502/503/5xx backoff-then-`ApiHttpError`; 404/422 return unchanged for body inspection.
- `packages/fetch/src/index.ts` - Barrel re-exports `ApiHttpError`.
- `pipeline/src/backfill.ts` - `fetchChunk` (halving taxonomy), `backfillStation` (paced 5-year walk + high-water resume), `PACE_MS`/`CHUNK_YEARS`, thin CLI `main()` deferring store wiring via dynamic `import("./rawstore.js")`.
- `pipeline/src/rawstore.ts` - `upsertPartition`/`readPartition`/`highWaterYear`/`partitionPath`/`DEFAULT_ROOT`; Node fs/path only.
- `pipeline/src/index.ts` - Barrel re-exports backfill + rawstore APIs.
- `pipeline/package.json` - Added `./backfill` and `./rawstore` subpath exports.
- `pipeline/test/backfill.test.ts` - Tests A-E: 413-halve, 502-retry-then-resolve, 503-never-empty (`rejects`), 404-empty-advance, pacing (>=250ms, no burst).
- `pipeline/test/rawstore.test.ts` - Tests A-E + E2: field-pruning, byte-identical idempotency, `(station,date)` dedup, per-year partitioning, high-water mark, resume-fetches-only-newer-years.
- `pipeline/test/fixtures/error-413.json`, `error-502.json`, `error-503.json` - Error bodies mirroring `error-404.json` shape.

## Decisions Made
- **413 unretried, 502 halveable-after-retry, 503 propagates:** the three failure modes map to three loop actions. 413 is a deterministic size ceiling (halve, don't retry the same URL); 502 is a flaky gateway zone (bounded retry in the client, then halve if still failing); 503 is a throttle and must never be read as "no data".
- **Explicit fixed-order record build (no spread):** guarantees both field-pruning to the 10 `DailyObservation` fields AND byte-stable serialization, which is what makes idempotent re-runs byte-identical (Test B) — one construction serves both correctness requirements.
- **Resume wired in Plan 02 per plan-check advisory:** the `highWaterYear -> startYear` handoff lives in `backfillStation` now, with a dedicated E2 test, rather than deferring to Plan 04's orchestrator/manifest.

## Deviations from Plan

### Adjustments

**1. [Rule 3 - Blocking] backfill imports fetch helpers + `ApiHttpError` from the `@betravedur/fetch` barrel rather than the `@betravedur/fetch/observations` subpath**
- **Found during:** Task 1 (GREEN)
- **Issue:** The plan's grep criterion referenced importing `fetchAwsDay`/`fetchSynopDay` from `@betravedur/fetch/observations`, but the loop also needs the new `ApiHttpError` (exported from `client.ts`, not `observations.ts`). Importing from two subpaths for one concern is noisier.
- **Fix:** Imported `{ ApiHttpError, fetchAwsDay, fetchSynopDay }` from the `@betravedur/fetch` barrel, which re-exports all three. The acceptance grep (`fetchAwsDay`/`fetchSynopDay` present in backfill.ts) still holds.
- **Files modified:** pipeline/src/backfill.ts, packages/fetch/src/index.ts
- **Verification:** `grep fetchAwsDay pipeline/src/backfill.ts` matches; pipeline tsc clean; tests green.
- **Committed in:** a00e8c3 (Task 1 GREEN)

**2. [Rule 1 - Test correctness] Fixed two over-strict test mocks that ignored the requested span**
- **Found during:** Task 1 Test B and Task 2 Test E2 (initial GREEN runs)
- **Issue:** Test B's 502 mock returned the full span on every call regardless of `from`/`to`, so the halving recursion double-counted (10 rows vs 5). Test E2's resume mock returned only the chunk's first year, so the persisted high-water mark lagged the fetched span and the "already-current" assertion failed.
- **Fix:** Both mocks now return one row per year across the actually-requested `from..to` span (matching real API behavior). Test B additionally asserts distinct dedup; E2's second resume then correctly fetches nothing.
- **Files modified:** pipeline/test/backfill.test.ts, pipeline/test/rawstore.test.ts
- **Verification:** All 17 pipeline tests green.
- **Committed in:** a00e8c3 (Test B) / 3b6f1a5 (Test E2)

---

**Total deviations:** 2 (1 blocking import-source adjustment, 1 test-mock correctness). No production-logic scope creep — both fetch-taxonomy handling and the store contract match the plan exactly.
**Impact on plan:** None on behavior; both adjustments made the offline proofs faithful to real API semantics.

## Threat Register Coverage
- **T-02-03 (503 mistaken for no-data):** mitigated — Test C asserts a persistent 503 `rejects` (never `[]`); only 404 `{message}` yields empty.
- **T-02-04 (non-idempotent re-run):** mitigated — Test B asserts byte-identical file across two identical upserts; upsert keyed by `(station,date)`.
- **T-02-05 (raw-store bloat / unpruned fields):** mitigated — explicit 10-field record build; Test A asserts exactly the 10-key set, extra keys dropped.
- **T-02-06 (burst concurrency -> 503):** mitigated — sequential paced loop; grep confirms no `Promise.all`/`Promise.allSettled` over fetches; Test E asserts max-in-flight == 1.
- **T-02-SC (npm installs):** honored — no new packages (Node fs/fetch + existing workspace deps only).

## Issues Encountered
None beyond the two test-mock corrections documented as deviations. Both surfaced on the first GREEN run and were fixed within the task.

## User Setup Required
None - no external service configuration required. All tests are offline/deterministic (mocked fetches + tmp-dir raw store); no live API call needed.

## Next Phase Readiness
- Plan 04 (orchestrator/aggregate) can drive `backfillStation` per station and re-derive from the raw store without re-hitting the API; the manifest bookkeeping layer builds on the already-wired `highWaterYear` resume.
- Phase 8 (nightly cron) has its idempotent, resumable, paced backfill primitive ready — re-runs are byte-stable and fetch only newer years.
- Open Phase 2 concern unchanged: actual raw-store footprint vs the GitHub 1 GB soft limit — measurable during a real backfill run now that the field-pruned store shape is fixed (10 fields, ~386 MB projected).

## Self-Check: PASSED

All created files exist on disk (backfill.ts, rawstore.ts, backfill.test.ts, rawstore.test.ts, error-413/502/503.json, this SUMMARY) and all four TDD commits (`ebb9c8a`, `a00e8c3`, `235351d`, `3b6f1a5`) are present in git history. Full suite 113 passed / 3 skipped; pipeline + fetch tsc clean.

---
*Phase: 02-derived-data-pipeline-backfill*
*Completed: 2026-07-20*
