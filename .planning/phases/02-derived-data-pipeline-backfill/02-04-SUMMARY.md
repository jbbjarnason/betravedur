---
phase: 02-derived-data-pipeline-backfill
plan: 04
subsystem: pipeline
tags: [pipeline, aggregate, orchestrator, data-branch, git, squash-reset, live-run, e2e]

# Dependency graph
requires:
  - phase: 02-derived-data-pipeline-backfill
    provides: "Plan 01 encodeDerived/decodeDerived; Plan 02 backfillStation + rawstore (upsert/read/highWaterYear); Plan 03 updateManifest/contentHash/serializeManifest + buildStationsJson"
  - phase: 01-foundation
    provides: "@betravedur/domain (groupBySeasonYear, expandWindow, qualifyingYears, effectiveN); @betravedur/fetch (fetchAwsDay/fetchSynopDay, fetchStations)"
provides:
  - "aggregate.ts — aggregateStation (raw -> derived + manifest, touched-only) + main() CLI + shipOutputs()"
  - "The orphan `data` branch: a real subset backfill (AWS #1350 2008-2026, SYNOP #1 1949-2026) with raw/ + derived/ + stations.json + manifest.json"
  - "PIPELINE.md — the full operational contract Phase 8 schedules"
  - "npm run aggregate wired (<aws|synop>:<id> specs)"
affects: [phase-3-client-aggregation, phase-8-nightly-cron]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Touched-only re-derivation: derived/{station}.{hash}.json (re)written ONLY when contentHash changes; unchanged raw -> byte-identical derived + manifest entry (updateManifest delta property)"
    - "Season-year applied at aggregation/decode via groupBySeasonYear (calendar-year storage per Plan 01) — no reimplementation in the orchestrator"
    - "Orphan `data` branch via the git 2.39 two-step recipe (worktree add --detach -> checkout --orphan); main worktree provably undisturbed"
    - "Squash-reset collapses history with a byte-identical committed tree (working tree preserved)"

key-files:
  created:
    - pipeline/src/aggregate.ts
    - pipeline/test/aggregate.test.ts
    - PIPELINE.md
  modified:
    - pipeline/src/index.ts
    - pipeline/package.json

key-decisions:
  - "aggregate main() requires explicit <aws|synop>:<id> specs so each station's type (AWS omits r / SYNOP omits dv) is unambiguous — inference from raw alone can't recover type."
  - "aggregateStation records high-water {from,to} from the raw calendar-year span; derived bytes are pretty-printed JSON (stable), content-hashed via Plan 03 contentHash."
  - "The `data` branch commit is LOCAL only in Phase 2 (satisfies DATA-07 here); push/force-push safety is deferred to Phase 8 (no remote configured, nothing touching main is force-pushed). Documented in PIPELINE.md."
  - "Deep-SYNOP #1 total derived gzip is ~151 KB (the documented ~150-200KB exception) BUT its per-station-year size is 1941 B — well under the 4 KB budget; the total is depth, not per-year bloat. History is not capped."

patterns-established:
  - "shipOutputs() = derived/ + stations.json + manifest.json — raw/ never ships (the ship-boundary is code, not convention)."
  - "Full-chain round-trip test extends Plan 01's derive round-trip through the real on-disk raw->derived->decode->domain path, incl. the wrapping {364,3} Dec->Jan window."

requirements-completed: [DATA-02, DATA-04, DATA-07]

# Metrics
duration: 7min
completed: 2026-07-20
---

# Phase 2 Plan 04: Aggregate Orchestrator, Live Subset Backfill & Data Branch Summary

**The `aggregate.ts` orchestrator ties Plans 01–03 into one runnable pipeline (raw store → content-hashed `derived/*.json` + `manifest.json` + `stations.json`, re-deriving only touched stations), proven end-to-end offline through the on-disk path including the Dec→Jan season-year wrap; then a REAL subset backfill of AWS Keflavík #1350 (2008–2026) and deep SYNOP Reykjavík #1 (1949–2026) was run against live api.vedur.is, committed to a fresh orphan `data` branch, and self-verified for high-water advance, interrupt+resume-fetches-only-newer, byte-identical idempotency, measured sizes, and squash-reset — all with `main` provably undisturbed.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-07-20T07:14:07Z
- **Completed:** 2026-07-20T07:20:50Z
- **Tasks:** 2 (Task 1 TDD RED→GREEN; Task 2 live + docs)
- **Files modified:** 5 (3 created, 2 modified) on `main`; plus the `data` branch populated

## Accomplishments

- **Aggregate orchestrator (`aggregate.ts`):** `aggregateStation` reads all raw year partitions → `encodeDerived` → `contentHash` → `updateManifest` → writes `derived/{station}.{hash}.json` **only when the hash changes** (touched-only). `main()` CLI computes qualifying-years via `groupBySeasonYear`/`qualifyingYears`, regenerates `stations.json` from the no-splice registry, and serializes the manifest. `shipOutputs()` codifies the ship boundary (raw never ships).
- **Full-chain round-trip test (Tests A–D):** proves the on-disk raw→derived→decode→domain path equals the direct domain path on the original rows for **both** a non-wrapping mid-July window **and** the wrapping `{startDoy:364,endDoy:3}` Dec→Jan window; plus touched-only re-derivation (unchanged→byte-identical, changed→only that station re-hashes), column omission by type (AWS omits `r`, SYNOP omits `dv`), and raw-never-shipped.
- **Real subset backfill on the live network:** AWS #1350 (2008–2026, 6451 rows, 19 partitions) and deep SYNOP #1 (1949–2026, 28305 rows, 78 partitions) fetched from api.vedur.is; high-water marks advanced to 2026; resume fetched only newer years; a deliberate interrupt (delete 2 newest partitions) + resume re-fetched exactly the missing chunk and restored a byte-identical store.
- **Orphan `data` branch:** created via the git 2.39 two-step recipe, populated (raw/ + derived/ + stations.json + manifest.json), committed **locally**; `main` worktree provably undisturbed throughout. Squash-reset verified to collapse 2 commits → 1 with a byte-identical tree hash.
- **PIPELINE.md** (189 lines) documents the full operational contract; the automated grep gate (`checkout --orphan`, `squash`, `req/s`, `station-year`, `field-prun`) passes.
- **Whole monorepo green:** 126 passed / 3 BETRA_LIVE-gated skips; `tsc -p pipeline` clean. Zero new npm dependencies.

## Task Commits

1. **Task 1 (RED):** failing full-chain aggregate orchestrator tests — `260fce7` (test)
2. **Task 1 (GREEN):** aggregate orchestrator (raw → derived + manifest + stations, touched-only) — `bff8c3e` (feat)
3. **Task 2:** PIPELINE.md operator guide — `bfa5e0c` (docs)

_On the `data` branch (local, separate history):_ `05cea64` (initial subset backfill) → squash-reset → `52bf461` (squashed).

_TDD gate: Task 1 RED (`test`) precedes GREEN (`feat`). No refactor commit — implementation clean on first GREEN. Task 2 is a live side-effecting + docs task (no TDD)._

## Files Created/Modified
- `pipeline/src/aggregate.ts` — `aggregateStation` (touched-only raw→derived+manifest), `main()` CLI (`<aws|synop>:<id>` specs, qualifying-years via domain, stations.json + manifest serialization), `shipOutputs()`. Imports `encodeDerived` (Plan 01), `updateManifest`/`contentHash` (Plan 03), `groupBySeasonYear`/`qualifyingYears`/`effectiveN` (domain) — no reimplementation.
- `pipeline/test/aggregate.test.ts` — Tests A/A2 (full-chain round-trip incl. wrapping {364,3} for AWS + SYNOP), B (touched-only re-derivation), C (manifest filename convention + column omission), D (ship set excludes raw).
- `PIPELINE.md` — operator guide: backfill policy, field-pruning, size budget + deep-SYNOP exception, ship rule, data-branch two-step recipe + CI one-liner + incremental + squash-reset + force-push rule + Phase-8 push deferral, season-year (WR-03).
- `pipeline/src/index.ts` — barrel re-exports `aggregateStation`, `shipOutputs`, `aggregateMain`.
- `pipeline/package.json` — added `./aggregate` subpath export.

## Decisions Made
- **Explicit type specs for aggregate:** `main()` requires `<aws|synop>:<id>` so column omission (AWS omits `r` / SYNOP omits `dv`) is correct; station type isn't recoverable from raw partitions alone.
- **Data-branch commit is local in Phase 2:** satisfies DATA-07 here; push/force-push safety is explicitly Phase 8 (no remote configured; nothing touching `main` is force-pushed). Recorded in PIPELINE.md.
- **Deep-SYNOP total size is depth, not bloat:** #1's 151 KB total gzip is the documented ~150–200 KB exception; its per-station-year is 1941 B, well under the 4 KB budget. History is not capped.

## Checkpoint Evidence

Per the STATE no-review directive, all live commands were run and their real output inspected and cross-checked here (no human checkpoint). Commands run against live `api.vedur.is` on 2026-07-20.

### E1. Orphan `data` branch created; `main` undisturbed

```
$ git worktree add --detach ../betravedur-data
Preparing worktree (detached HEAD bff8c3e)
$ git -C ../betravedur-data checkout --orphan data
Switched to a new branch 'data'
$ git -C ../betravedur-data rm -rf . ; mkdir -p raw derived
# main check
$ git rev-parse --abbrev-ref HEAD   -> main
$ git status --short (tracked)       -> (empty — clean)
main files intact  ✓
$ git branch -a  -> + data / * main
```
`main` stayed on `main`, no tracked changes, files intact. Data worktree on unborn orphan `data`.

### E2. Real subset backfill — high-water advance

```
$ tsx <runner> <data> aws   1350 2008  -> station 1350 high-water=2026; requests=4;  3.4s
$ tsx <runner> <data> synop 1    1920  -> station 1    high-water=2026; requests=22; 13.8s
```
AWS #1350: 2008→2026 (19 partitions, 6451 rows). SYNOP #1: 1949→2026 (78 partitions, 28305 rows).
Note: SYNOP daily data starts **1949** despite `start:1920` metadata — early empty years 404-advanced.

### E3. Field pruning + no duplicate (station,date)

```
AWS sample keys:   station,date,doy,t,tx,tn,f,fx,fg,dv,r   (exactly 10)
SYNOP sample keys: station,date,doy,t,tx,tn,f,fx,fg,dv,r   (exactly 10)
station 1350: max rows/partition=365 (2009); duplicates=false
station 1:    max rows/partition=365 (1949); duplicates=false
Raw byte rate: AWS 119.9 B/row, SYNOP 116.6 B/row   (field-pruned ~110 B/row, not ~580)
```

### E4. Idempotent + resume-fetches-only-newer

```
# resume with high-water == now:
$ tsx <runner> aws   1350  -> high-water=2026; requests=0; 0.0s   (byte-identical: YES)
$ tsx <runner> synop 1     -> high-water=2026; requests=0; 0.0s   (byte-identical: YES)

# deliberate interrupt: delete 1350/2025 + 1350/2026, then resume:
high-water now 2024
$ tsx <runner> aws 1350    -> high-water=2026; requests=1; 0.6s   (fetched ONLY the 2025-2026 chunk)
INTERRUPT+RESUME BYTE-IDENTICAL TO FULL STORE: YES
```
Resume fetched only years > high-water; the restored store checksum equals the pre-interrupt full store.

### E5. Measured derived sizes (gzip + brotli via node:zlib)

```
station 1    (SYNOP, 78yr): raw-json=1476230B  gzip=151401B  brotli=133946B  gzip/station-year=1941B  budget<=4096: PASS
station 1350 (AWS,   19yr): raw-json= 516101B  gzip= 62281B  brotli= 54270B  gzip/station-year=3278B  budget<=4096: PASS
```
- AWS #1350: **62 KB** total gzip (tens of KB) — PASS.
- Deep SYNOP #1: **151 KB** total gzip — the **documented ~150–200 KB exception** (depth, not per-year bloat); per-station-year 1941 B is well under budget.
- `stations.json`: 2 entries (both clear the ≥3 bar: AWS 15 qualifying years, SYNOP 77).
- manifest: `1 -> derived/1.c1cf25669d53.json (1949-2026)`, `1350 -> derived/1350.eaecfc5ae78f.json (2008-2026)`.

### E6. Live re-derive smoke (Phase-1 pattern)

```
fetched 365 rows for 1350/2020; re-derive temp match on 2020-01-01: orig=2.18 decoded=2.2 -> MATCH
```
A freshly-fetched real station-year encodes and decodes back to the same temp within quant (±0.1).

### E7. Squash-reset collapses history, working tree preserved

```
BEFORE: commit count=2  tree=b63eaf8045c1...  working digest=9ca7c807f1a9...
recipe: git checkout --orphan data-fresh; git add -A; git commit; git branch -D data; git branch -m data-fresh data
AFTER:  commit count=1  tree=b63eaf8045c1...  working digest=9ca7c807f1a9...
TREE IDENTICAL (working tree preserved): YES   history collapsed: 2 -> 1 commit
```
Committed tree hash is byte-identical before/after — history collapsed with zero content change.

### E8. Final `main` integrity

```
$ git worktree list
/Users/jonb/Projects/betravedur       bff8c3e [main]
/Users/jonb/Projects/betravedur-data  52bf461 [data]
main: on `main`, no tracked changes.
```
The `data` branch (single squashed commit `52bf461`) is **local only** — no push, no remote configured, nothing touching `main` force-pushed (push safety deferred to Phase 8 per directive).

## Deviations from Plan

None affecting behavior. Two operational notes recorded as observations (not code changes):

**1. [Observation] SYNOP daily data begins 1949, not the metadata `start:1920`.**
- **Found during:** Task 2 backfill of SYNOP #1.
- **Detail:** `/stations` reports Reykjavík `start:1920`, but the SYNOP daily endpoint returns data from **1949**; earlier years 404-advanced silently (correct behavior — 404→[] no-data). Recorded `from` = 1949 reflects real data, not `start`. Documented in PIPELINE.md §2.

**2. [Observation] Live-run station-year counts differ from the fixtures' 6-year subset.**
- **Detail:** Full-history backfill (19yr AWS / 78yr SYNOP) is expected — the plan asked for full history. The deep-SYNOP total size (151 KB) is the documented ~150–200 KB exception, not a failure; per-station-year budget still PASS.

## Threat Register Coverage
- **T-02-10 (force-push clobbers main):** mitigated — the two-step recipe left `main` provably undisturbed (E1, E8); the `data` commit is local; no force-push touches `main`. Documented in PIPELINE.md §6.
- **T-02-11 (.git DoS via unbounded data history):** mitigated — orphan branch + squash-reset (E7, byte-identical tree) + field-pruned raw store (E3).
- **T-02-12 (live 502 as permanent no-data):** mitigated — no missing-year holes for stations with data; SYNOP #1 has contiguous 1949-2026 partitions; the client taxonomy (503 propagates, never []) from Plan 02 held over 22 real requests.
- **T-02-13 / T-02-SC (secrets / npm installs):** honored — no secrets fetched or committed (keyless API); zero new packages (Node fs/path/crypto/zlib + fetch + tsx only).

## Issues Encountered
None blocking. The live backfill and all git operations completed on the first attempt; both observations above are expected API/data realities, not failures.

## User Setup Required
None. The `data` branch is a local commit in a sibling worktree (`../betravedur-data`). No remote, no push. Phase 8 will wire the remote push + force-push safety.

## Next Phase Readiness
- **Phase 3 (client):** the shippable contract is concrete and measured — `stations.json` (markers), `manifest.json` (immutable `{station}.{hash}.json` URLs), `derived/*.json` (decodable to DailyObservation[], re-grouped via `groupBySeasonYear`). Real derived files exist on the `data` branch to develop against.
- **Phase 8 (nightly cron):** the whole operational contract is documented in PIPELINE.md — resumable paced backfill, touched-only aggregate, incremental commit, squash-reset, and the deferred remote-push/force-push safety this phase intentionally left to Phase 8.
- **Size/footprint concern resolved for the subset:** derived gzip is tens-of-KB (AWS) to ~150 KB (deep SYNOP), all within the per-station-year budget; raw store ~117 B/row field-pruned. Full-registry footprint vs the 1 GB limit remains a Phase-8 measurement at scale.

## Self-Check: PASSED

Created files exist on disk: `pipeline/src/aggregate.ts`, `pipeline/test/aggregate.test.ts`, `PIPELINE.md` (this SUMMARY too). Task commits present in `main` history: `260fce7` (RED), `bff8c3e` (GREEN), `bfa5e0c` (docs). The `data` branch exists with the squashed commit `52bf461`. Full suite 126 passed / 3 skipped; pipeline tsc clean; PIPELINE.md grep gate PASS.

---
*Phase: 02-derived-data-pipeline-backfill*
*Completed: 2026-07-20*
