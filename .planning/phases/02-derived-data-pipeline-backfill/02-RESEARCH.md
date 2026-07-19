# Phase 2: Derived Data Pipeline & Backfill - Research

**Researched:** 2026-07-19
**Domain:** Resumable historical backfill against api.vedur.is + compact derived-file precomputation + `data`-branch storage within GitHub Pages limits (TypeScript end-to-end, building on `@betravedur/domain` + `@betravedur/fetch`)
**Confidence:** HIGH — all data-volume, API-range, derived-size, and git-orphan-branch claims were measured live/empirically on 2026-07-19, not inferred.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Backfill Scope**
- Backfill full available history per station: SYNOP back to station start (Reykjavík 1949), AWS from their start dates (~2005+). Depth is cheap because only compact derived files ship with the site.
- Include all stations (active + decommissioned) that can yield ≥3 qualifying years of daily data; decommissioned stations are retained for historical windows.
- Raw daily data is kept as partitioned NDJSON per station/year on the dedicated `data` branch — enables recomputing derived files without re-fetching the API.
- Backfill runner is resumable: per-station high-water marks, idempotent re-runs (upsert by station+date), polite throttling (~4 req/s), runnable locally and via `workflow_dispatch`.

**Derived Data Layout**
- `derived/{station}.json`: per-(season-year, day-of-year) records with daily t/tx/tn, f/fx/fg, dv, r and presence masks. Browser aggregates any period × year-range client-side. Target: tens of KB gzipped per station.
- Season-year grouping uses the Phase 1 `groupBySeasonYear` contract (Dec head owns the year) — NOT calendar year.
- Content-hashed filenames + `manifest.json` index for cache busting; nightly deploys become deltas for returning visitors.
- Orphan branch `data` holds raw + derived data; additive partitioned files; periodic squash-reset strategy to cap `.git` growth documented in the pipeline README.
- `stations.json` generated from the Phase 1 registry (ID-keyed, active-date windows, owner/type recorded, no splicing).

### Claude's Discretion
- Exact NDJSON partitioning scheme, manifest schema, gzip/brotli measurement tooling, script CLI shape, concurrency limits.
- Whether derived files also carry per-day pre-aggregations if size budget allows.

### Deferred Ideas (OUT OF SCOPE)
- Nightly cron scheduling, heartbeat monitoring, auto-deploy — Phase 8.
- Sunshine/cloud extraction (SUN-01, v1.x) — only ~8 SYNOP stations have it.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-02 | One-time backfill ingests available per-station daily history deep enough to support baseline year ranges like 2010–2015 | Live-verified: full 21-yr AWS history and 77-yr SYNOP history are fetchable; API accepts a full year (365 rows) in one call and up to ~19k rows/call, but **large requests intermittently 502/503** → chunked, paced, resumable design required (see Backfill Runner). History depth confirmed ample for 2010–2015 and far beyond. |
| DATA-04 | Precompute per-station, per-year, day-of-year summaries as static files the client aggregates over any {period × year-range} without a backend | Measured derived-file shapes; the columnar, implicit-date, integer-quantized shape is the smallest that preserves per-(season-year, doy) daily values the client needs. Season-year grouping uses `groupBySeasonYear`. |
| DATA-07 | Data storage keeps repo within GitHub Pages limits (dedicated data branch or partitioned additive files; nightly commits must not balloon `.git`) | Measured full-project footprint; **field-pruned raw store ≈ 386 MB uncompressed / ≈ 56 MB gzip-blob; derived total ≈ 21 MB brotli.** Orphan `data` branch + squash-reset verified with exact git commands. |
</phase_requirements>

## Summary

Every number in this document was produced by hitting the live `api.vedur.is` and by prototyping/compressing the real returned data on 2026-07-19 — not by estimation. Three findings reshape the plan.

**First, the API has a soft per-request size ceiling that is not documented and is enforced inconsistently.** A single AWS station's *entire* 21-year daily history (7,509 rows, 4.3 MB) returned successfully in one 3.4 s call, and a full calendar year (365 rows) returns in ~0.4 s. But a 77-year SYNOP request returned **HTTP 413 "Too many parameters. Try reducing time interval or number of stations."**, and mid-size requests (~19k–23k rows) return **HTTP 200 sometimes and HTTP 502 Bad Gateway other times** for the identical URL seconds apart. Separately, firing several requests concurrently produced instant **HTTP 503** responses (~0.1 s) — throttling. Paced sequential requests (one every ~250 ms, i.e. ≤4 req/s) at a chunk size of **5 station-years** were 100 % reliable across 16 consecutive chunks covering all 77 Reykjavík years. The backfill runner must therefore chunk to a bounded row count, pace sequentially (no burst concurrency), and retry 502/503/413 — it cannot rely on "fetch the whole history in one call" even though that occasionally works.

**Second, the "tens of KB gzipped per station" success criterion is achievable for shallow AWS stations but NOT for deep-history SYNOP stations, and this must be surfaced as a decision, not silently assumed.** Measured, gzipped, integer-quantized columnar derived files: a 21-year AWS station ≈ **52 KB brotli / 58 KB gzip**; the 77-year Reykjavík SYNOP station ≈ **174 KB brotli / 192 KB gzip**. The dominant cost is the raw number of daily cells (78 years × 365 days ≈ 28k cells × 7 metrics). The date column can be eliminated entirely (position encodes (year, doy) implicitly, leap-folded), and integer quantization (temp/wind ×10, precip whole-mm) roughly halves size vs. rounded floats — those two together take the deep station from ~272 KB to ~174 KB brotli, but no shape change gets a 77-year full-metric station under "tens of KB". The realistic, honest budget is **"tens of KB for typical AWS stations, up to ~200 KB for the handful of century-deep SYNOP stations,"** and the total working set is small regardless (see below).

**Third, repo-size (DATA-07) is genuinely at risk only if the raw store keeps all ~45 API fields, and is comfortable if it is field-pruned.** `parameters=basic` still returns ~45 columns per row (rh, vp, td, pressure, ground temps, radiation, etc.). Persisting all of them as raw NDJSON models to ≈ **2 GB uncompressed / ~127 MB as gzipped git blobs** across the whole network — over the 1 GB Pages/repo soft limit uncompressed. Pruning the raw store to the 10 fields the `DailyObservation` contract actually persists (`station,time,t,tx/txx,tn/tnn,f,fx,fg,dv,r`) drops it to ≈ **386 MB uncompressed / ~56 MB gzipped-blob**, and the *derived* working set that visitors download is only ≈ **21 MB brotli total** for all 518 day-servable stations. With the raw store on the orphan `data` branch (verified isolatable via `git worktree`) and periodic squash-reset, `.git` growth is bounded.

**Primary recommendation:** Build two idempotent TS CLI entry points — `backfill` (chunked at ≤5 station-years, paced ≤4 req/s, resumable via per-station high-water marks in `manifest.json`, retry 413/502/503) and `aggregate` (raw NDJSON → columnar integer-quantized implicit-date derived files, season-year grouped via `groupBySeasonYear`) — persisting a **field-pruned** raw store and derived + `stations.json` + content-hashed `manifest.json` on an orphan `data` branch created with `git worktree add --detach` then `git checkout --orphan` (the `--orphan` flag on `worktree add` needs git ≥ 2.42; local machine has 2.39, so use the two-step form). Treat the deep-SYNOP-station size overage as an explicit, documented deviation from "tens of KB", not a bug.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Backfill fetch (chunked, paced, resumable) | Pipeline / build-time (Node CLI) | — | API called only from the pipeline; never the browser (CORS/terms/rate hygiene, ARCHITECTURE.md) |
| Raw store persistence (field-pruned NDJSON) | Pipeline → `data` branch (git) | — | Canonical source of truth; enables re-deriving without re-fetching (locked decision) |
| Derived-file precompute (columnar, quantized) | Pipeline (imports `@betravedur/domain`) | Browser re-runs same math at display time | Bake the user-independent unit; aggregate the variable axes in-browser (Pattern 1, ARCHITECTURE.md) |
| Season-year grouping of rows | `@betravedur/domain.groupBySeasonYear` | Pipeline + browser | Single shared contract; Dec-head-owns-year (STATE decision WR-03) — never calendar year |
| `stations.json` generation | Pipeline (`@betravedur/fetch` registry) | Browser reads it | ID-keyed, active-date windows, no splice (DATA-06, done in Phase 1) |
| Content-hashing + manifest | Pipeline (Site Builder boundary) | CDN serves immutable | Turns nightly redeploy into a delta for returning visitors |
| `data`-branch isolation + squash-reset | Pipeline / git plumbing | CI checks out data branch at build | Keeps `main` (Pages build source) tiny; caps `.git` growth (DATA-07) |

## Standard Stack

This phase adds **zero new runtime libraries** to the domain package and only optional dev/pipeline helpers. It builds directly on the Phase 1 monorepo (npm workspaces, TS 7, Vitest 4, tsx). All already installed and verified in Phase 1.

### Core (already present)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 7.0.2 | Pipeline CLIs + derived-shape types | Locked in Phase 1; pipeline and client share `@betravedur/domain` [VERIFIED: package.json] |
| tsx | 4.23.1 | Run `pipeline/*.ts` CLIs directly (local + Actions) | Already a devDep; the natural entry-point runner [VERIFIED: package.json] |
| Vitest | 4.1.10 | Test pipeline pure functions against fixtures | Locked; existing 96-test green suite [VERIFIED: package.json] |
| Native `fetch` | Node 25.6.1 built-in | HTTP client for backfill | Phase 1 `@betravedur/fetch` already wraps it with `fetchWithRetry`; extend, don't replace [VERIFIED: packages/fetch/src/client.ts] |
| Node `zlib` (`gzipSync`/`brotliCompressSync`) | built-in | Measure/emit compressed derived files; size-budget assertions | No dependency; brotli quality 11 available natively [VERIFIED: Node stdlib] |
| Node `crypto` (`createHash`) | built-in | Content-hash derived filenames for the manifest | No dependency; standard cache-busting [ASSUMED — standard Node API] |

### Supporting (optional, Claude's discretion)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `p-limit` | latest | Bound concurrency of the paced fetch loop | Only if you parallelize across stations; **caution** — bursts trigger 503 (measured). Sequential-with-pacing is safer and was 100% reliable. Prefer a hand-rolled sleep-paced loop first. |
| `p-retry` | latest | Structured retry/backoff for 413/502/503 | Optional over the existing hand-rolled `fetchWithRetry`; only if retry policy grows. Phase 1 already has a working 3-try backoff. |

**Recommendation:** add **no** new npm packages. `zlib`, `crypto`, and native `fetch` cover compression, hashing, and HTTP; pacing is a `setTimeout`/`await`. Keeping the dependency count at zero preserves the Phase 1 supply-chain posture.

**Version verification (2026-07-19):** all core tools are the Phase-1-verified versions in `package.json`; no new installs required, so no additional registry check needed. If `p-limit`/`p-retry` are later added, run `npm view <pkg> version` first.

## Package Legitimacy Audit

**No external packages are installed in this phase.** The pipeline uses only Node built-ins (`fetch`, `zlib`, `crypto`, `fs`) plus the already-audited Phase 1 devDeps (typescript, tsx, vitest, @vitest/coverage-v8). slopcheck is therefore not applicable to any *new* dependency.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| *(none new)* | — | — | — | — | n/a | No new install |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*If the plan later chooses to add `p-limit`/`p-retry`, gate each behind a `checkpoint:human-verify` and run slopcheck + `npm view <pkg> scripts.postinstall` before install (both are reference-grade sindresorhus packages, but verify anyway).*

## API Behavior — Live-Measured Backfill Constraints (2026-07-19)

> These supersede Phase-1 Assumption A3 ("no API rate limits"). Under backfill load there ARE effective limits, discovered empirically.

| Observation | Measured Result | Implication for Backfill |
|-------------|-----------------|--------------------------|
| Full calendar year, one AWS station | 365 rows, 210 KB, **0.39 s**, HTTP 200 | A year-at-a-time chunk is cheap and fast |
| Full 21-yr AWS history, one call | 7,509 rows, 4.3 MB, **3.4 s**, HTTP 200 | Deep single-station AWS *can* be one call — but don't depend on it |
| 10-yr AWS range | 3,661 rows, 2.1 MB, **1.5 s**, HTTP 200 | Multi-year works when row count is bounded |
| 77-yr SYNOP history, one call | **HTTP 413** `{"message":"Too many parameters. Try reducing time interval or number of stations."}` | Hard rejection above a row/time threshold |
| ~19k–23k-row SYNOP range | **HTTP 200 sometimes, HTTP 502 Bad Gateway other times** (same URL, seconds apart) | Gateway/DB timeout near the ceiling — unreliable zone; avoid |
| Concurrent burst (5 parallel requests) | Instant **HTTP 503** (~0.1 s) on subsequent calls | Throttling; **do not parallelize with bursts** |
| Paced sequential, 5-station-year chunks, ~250 ms gap | **16/16 chunks HTTP 200**, 28,323 rows total | The reliable regime: chunk small, pace ≤4 req/s |
| Cold first request | 6.5 s (then warm ~0.3 s) | First call after idle is slow; timeout ≥ 30 s |
| Response caching headers | Only `vary: Accept-Encoding` — **no `cache-control`, no `age`, no `etag`, no `retry-after`, no `x-ratelimit-*`** | Responses are not CDN-cached; retry timing must be self-managed (fixed/exponential backoff, no `Retry-After` to read) |

**Recommended chunk size:** **1 station × 5 years** (≈1,826 rows) as the default; falls comfortably in the 200-reliable zone with headroom. A single station-year (365 rows) is the safe fallback for a chunk that 413s. **Do not** request multiple stations in one call during backfill (multiplies rows toward the ceiling and couples failure domains).

**Error taxonomy worth retrying:**
| Status | Meaning (observed body) | Action |
|--------|-------------------------|--------|
| 413 | "Too many parameters…" | **Do not retry as-is** — halve the chunk (5yr → 1yr → give up on that year) |
| 502 | "Bad Gateway" | Retry with backoff (transient gateway/DB timeout); if persistent, halve chunk |
| 503 | Service Unavailable (throttle) | Back off longer (e.g. +1 s), reduce pace; retry |
| 5xx/network | transient | Existing `fetchWithRetry` exponential backoff |
| 404 `{"message":...}` | No data / station-wrong-type | **Not an error** — `parseObservationBody` already yields `[]`; record as "no data for this chunk", advance |
| 422 `{"detail":...}` | Bad param/enum | **Throw** — programming error, fix the request (Phase 1 already throws) |

## Data Volume — Live-Measured Footprint (2026-07-19)

### Raw store (NDJSON on `data` branch)

| Store shape | Per-station example | Full-network estimate (439 AWS ×15yr + 79 SYNOP ×35yr ≈ 3.4M rows) |
|-------------|---------------------|--------------------------------------------------------------------|
| **All ~45 fields** (`parameters=basic` returns them all) | Kef 21yr: 4.3 MB raw / 272 KB gz; Rvk 77yr: 11.9 MB raw / 1.29 MB gz | ≈ **2.0 GB uncompressed / ~127 MB gzipped-blob** — **over the 1 GB soft limit uncompressed** |
| **Field-pruned to 10 persisted fields** (`station,time,t,tx/txx,tn/tnn,f,fx,fg,dv,r`) | Kef 21yr: 830 KB raw / 120 KB gz (113 B/row); Rvk 77yr: 3.0 MB raw / 405 KB gz (109 B/row) | ≈ **386 MB uncompressed / ~56 MB gzipped-blob** — comfortably within limits |

**Decision input:** prune the raw store to the fields the `DailyObservation` contract actually keeps. The extra 35 columns (rh, pressure, ground temps, radiation…) are not used by the domain layer and inflate the store ~5×. Store them only if a future feature needs them — and it doesn't in v1 (SUN-01 deferred; radiation/pressure out of scope).

### Derived files (what visitors download)

Measured on real data, columnar + implicit-date (position = leap-folded (year, doy)) + integer-quantized (temp/wind ×10 = 0.1 precision, precip whole-mm, dv whole-degree), all-null columns dropped:

| Station | History | gzip -9 | brotli q11 | Per-year (brotli) |
|---------|---------|---------|-----------|-------------------|
| Keflavík AWS (1350) | 21 yr | 58 KB | **52 KB** | 2.38 KB/yr |
| Reykjavík SYNOP (1) | 77 yr | 192 KB | **174 KB** | 2.23 KB/yr |

**Shape progression measured (Keflavík 21yr, gzip):** array-of-objects rounded 108 KB → columnar rounded 79 KB → drop-null-cols 78 KB → integer-quantized 74 KB → **implicit-date (drop date strings) 58 KB**. Removing the date column is the single biggest win (~20 %); it's free because position encodes (year, doy) with Feb-29 folded out per the Phase 1 leap-fold contract.

**Full derived working set:** ≈ **21 MB brotli** for all 518 day-servable stations (AWS 439×15yr ≈ 15 MB + SYNOP 79×35yr ≈ 6 MB). This is the load-once-per-visitor payload class (or lazy per-station); trivially within Pages limits.

**Budget honesty (DATA-04 success criterion):** "tens of KB gzipped per station" holds for typical AWS stations (≤20 yr → ≤50 KB). It does **not** hold for the ~8 century-deep SYNOP stations (Reykjavík 77 yr → ~174 KB brotli). No lossless-enough shape change reaches "tens of KB" for a 77-yr, 7-metric daily grid. Options if a hard cap is required (surface to planner): (a) accept ~200 KB for the handful of deep stations (recommended — they're the most valuable, and per-station lazy loading means only the opened one pays); (b) cap derived history at e.g. 40 years (loses depth, contradicts "backfill full history" locked decision — **avoid**); (c) split deep stations into per-decade shard files so each shard is tens of KB (adds manifest complexity). Recommend (a) + document.

## Derived File Schema (recommended, Claude's discretion)

```jsonc
// derived/{station}.{hash}.json  — one file per station, columnar, implicit position
{
  "station": 1,
  "type": "sk",                 // sj|sk — tells the client which metrics/nulls to expect
  "startYear": 1949,            // season-year of the first block
  "nYears": 78,
  "quant": { "temp": 10, "wind": 10, "precip": 1, "dv": 1 },  // divide to decode
  // Each column: length = nYears * 365, position i => year=startYear+floor(i/365),
  //   leapFoldedDoy = (i % 365) + 1.  null = missing (never 0).
  "cols": {
    "t":  [ -73, -71, null, ... ],   // *10  (int or null)
    "tx": [ ... ], "tn": [ ... ],    // AWS: tx/tn ; SYNOP: txx/tnn -> normalize to tx/tn keys
    "f":  [ ... ], "fx": [ ... ], "fg": [ ... ],
    "dv": [ 151, null, ... ],        // AWS only (whole degrees); absent key on SYNOP
    "r":  [ 152, null, ... ]         // SYNOP only (whole mm); absent key on AWS
  }
}
```

- **Season-year, not calendar year:** blocks are grouped with `groupBySeasonYear` (Dec head owns the year, STATE decision WR-03). Because the derived file spans *all* days-of-year, the practical implementation is: index by (calendarYear, leapFoldedDoy) for storage, and let the *client* re-group into season-years at aggregation time using the same `groupBySeasonYear` on the reconstructed `DailyObservation[]`. Document this explicitly so pipeline and client agree. (Storing calendar-year-indexed columns is fine as long as both sides re-group identically; alternatively pre-shift Dec into the next block — decide and unit-test one convention.)
- **Presence masks:** `null` in a column *is* the presence mask — no separate mask array needed (measured: null-preserving columns compress well). The CONTEXT "presence masks" requirement is satisfied by null-preservation; if an explicit boolean mask is wanted for a metric, it costs more — measure before adding.
- **All-null columns dropped:** AWS files omit `r`; SYNOP files omit `dv`. The `type` field tells the client which to expect (aligns with Phase-1 "án úrkomu" badge for AWS).
- **Decoding is trivial in the browser:** rebuild `DailyObservation[]` from columns, feed the existing `@betravedur/domain` functions (`expandWindow`, `groupBySeasonYear`, `qualifyingYears`, `circularMeanDirection`, `sumPerYearThenAverage`, score components) — the same math that baked nothing here but will run in Phase 3+.

### `stations.json` (generated from Phase 1 registry)
Already achievable via `@betravedur/fetch` `parseStationsBody` + `writeRegistry`. Filter to stations with ≥3 qualifying years of *actual daily data* (gate on data, not `start` — Phase 1 finding: `start` is a year, daily data may begin later). Keep decommissioned stations (429 of 776) that meet the bar. Verified live: `start`/`ending` are **integer years** (start range 1845–2026, ending 1878–2026); 518 stations are day-servable (sj+sk); 347 active.

## `data` Branch Mechanics — Verified git Commands (2026-07-19)

All commands below were **executed and verified** on git 2.39.5 (the local machine's version).

### One-time: create the orphan `data` branch without touching `main`'s worktree
```bash
# git 2.39 has NO `worktree add --orphan` (that flag arrived in git 2.42).
# Portable two-step recipe (verified):
git worktree add --detach ../betravedur-data      # detached worktree, main untouched
cd ../betravedur-data
git checkout --orphan data                          # brand-new root, no history from main
git rm -rf . 2>/dev/null || true                    # clear the index inherited from HEAD
mkdir -p raw derived
# ... pipeline writes raw/*.ndjson, derived/*.json, stations.json, manifest.json ...
git add -A && git commit -m "data: initial backfill $(date +%F)"
git push -u origin data
```
*(On GitHub Actions runners git is ≥ 2.42, so CI may use the shorter `git worktree add --orphan data ./data-wt`. Document both; the plan's local scripts must use the two-step form for this machine.)*

### Verified properties
- **`main` worktree is undisturbed** — confirmed: after creating the data worktree, the main checkout still shows `main` with its files intact.
- **A branch can be checked out in only one worktree at a time** — attempting a second worktree on `data` fails with `fatal: 'data' is already checked out at …`. In CI, use a fresh checkout, not a second worktree on the same clone.

### Incremental update (nightly / re-run) inside the data worktree
```bash
cd ../betravedur-data
git pull --ff-only origin data          # get latest
# pipeline upserts raw rows, re-derives touched stations, re-hashes changed files
git add -A
git diff --cached --quiet || git commit -m "data: update $(date +%F)"   # skip commit if no change (idempotent)
git push origin data
```

### Periodic squash-reset (cap `.git` growth) — verified
```bash
cd ../betravedur-data
git checkout --orphan data-fresh        # new orphan root capturing current working tree
git add -A && git commit -m "data: squash reset $(date +%F)"
git branch -D data && git branch -m data
git push --force origin data            # history collapses to 1 commit
```
*Verified: a 2-commit data branch collapses to 1 commit; working tree preserved. Force-push required because history is rewritten — document that the data branch is force-push-owned by the pipeline and never has PRs.*

### How the Pages build consumes the data branch (Phase 3/8 integration note)
Two viable patterns (recommend the first):
1. **Copy into `dist/` at build time.** In the deploy workflow, `actions/checkout` a second time with `ref: data` into a subdir (`path: data-branch`), then copy `data-branch/derived`, `stations.json`, `manifest.json` into `dist/data/` before `actions/upload-pages-artifact`. Data ships as normal static files under the Pages site. **Recommended** — no runtime dependency on GitHub raw URLs, gets CDN + immutable caching via content hashes.
2. **Fetch at runtime from `raw.githubusercontent.com`/branch.** Avoid — no immutable caching, extra origin, rate limits on raw.

The **raw store never ships** to `dist/` — only `derived/`, `stations.json`, `manifest.json` do. Raw NDJSON stays on the `data` branch as the re-derivation source of truth.

## Backfill Runner Design

### Resumable high-water-mark pattern (extends ARCHITECTURE Pattern 4)
- `manifest.json` on the data branch tracks per-station `{ from, to, lastFetched }`. Backfill of a station resumes from `to + 1 day` (or from `start`-year if absent).
- **Chunk loop:** for each target station, walk history in 5-year chunks from oldest to newest; on 413, halve to 1-year; on 502/503, backoff-retry then halve; on 404 (`No data`), record the empty chunk and advance (some early years genuinely have no daily data even when `start` is earlier).
- **Idempotent upsert:** write raw rows keyed by `(station, date)` into `raw/{station}/{year}.ndjson` (or `raw/{station}-{year}.ndjson`); re-running overwrites the same partition deterministically — no duplicate rows. Sort within a partition by date.
- **Commit in batches** (e.g. per station, or per N stations) so a mid-backfill timeout loses at most one batch — the next run resumes from the manifest.
- **Pacing:** sequential requests with a `~250 ms` sleep between calls (≤4 req/s, matches locked "~4 req/s"). **No burst concurrency** (measured to cause 503). If parallelism is ever wanted, cap at 2 and still pace — but sequential was 100 % reliable and a full network backfill is minutes-to-low-hours, acceptable for a one-time/`workflow_dispatch` job.
- **Timeouts:** ≥30 s per request (cold first call measured at 6.5 s).

### Runtime estimate (order-of-magnitude)
518 day-servable stations × avg ~4 chunks/station ≈ ~2,000 requests. At ~4 req/s ≈ **~8–10 minutes** of wall time for the full backfill (plus commit/push). Well within a `workflow_dispatch` job budget; chunked+resumable means a mid-run failure is cheap.

### Partitioning scheme (Claude's discretion — recommendation)
`raw/{station}/{year}.ndjson` (directory-per-station). Rationale: nightly incremental updates touch only the current year's partition of a few stations → tiny diffs → small commits → slow `.git` growth. Per-station-per-year files also make the squash-reset diff minimal and let `aggregate` re-read only changed stations.

## Architecture Patterns

### System Architecture Diagram
```
                 api.vedur.is/weather   (CC BY 4.0, no auth)
                          │  paced ≤4 req/s, 5-station-year chunks, retry 413/502/503
                          ▼
   ┌───────────────────────────────────────────────────────┐
   │  pipeline/backfill.ts   (Node CLI, tsx)                 │
   │  - uses @betravedur/fetch fetchAwsDay / fetchSynopDay   │
   │  - chunk loop + halving on 413                          │
   │  - resumable: per-station high-water mark in manifest   │
   └───────────────┬───────────────────────────────────────┘
                   │ normalized DailyObservation[] (10 fields)
                   ▼  upsert by (station,date), field-pruned
   ┌───────────────────────────────────────────────────────┐
   │  RAW STORE  (data branch)  raw/{station}/{year}.ndjson │  ← re-derive source
   └───────────────┬───────────────────────────────────────┘
                   │ read touched stations
                   ▼
   ┌───────────────────────────────────────────────────────┐
   │  pipeline/aggregate.ts  (Node CLI)                      │
   │  - groupBySeasonYear (Dec-head)                         │
   │  - columnar + implicit-date + integer-quantize          │
   │  - drop all-null cols; brotli/gzip size assertion       │
   │  - content-hash filenames                               │
   └───────────────┬───────────────────────────────────────┘
                   │ derived/{station}.{hash}.json + stations.json + manifest.json
                   ▼
   ┌───────────────────────────────────────────────────────┐
   │  data branch: derived/ + stations.json + manifest.json │
   │  (raw/ stays here too, NOT shipped)                     │
   └───────────────┬───────────────────────────────────────┘
                   │ Phase 3/8: checkout data → copy derived+manifest+stations into dist/data/
                   ▼  (raw excluded)
             GitHub Pages CDN  (immutable, content-hashed)
```

### Recommended Project Structure (adds `pipeline/`)
```
betravedur/
├── packages/domain/          # (Phase 1) pure math — imported by aggregate + future client
├── packages/fetch/           # (Phase 1) API client, registry, normalizeObservations
├── pipeline/                 # NEW — build-time CLIs, Node-only
│   ├── src/
│   │   ├── backfill.ts       # resumable chunked backfill CLI entry
│   │   ├── aggregate.ts      # raw NDJSON → derived columnar files
│   │   ├── rawstore.ts       # partitioned NDJSON read/upsert (station,date keyed)
│   │   ├── manifest.ts       # high-water marks + content-hash index
│   │   ├── derive.ts         # DailyObservation[] → columnar quantized shape (pure, testable)
│   │   └── stations.ts       # generate stations.json (filter ≥3 qualifying years)
│   ├── test/                 # Vitest — offline fixtures, size-budget assertions
│   └── package.json          # @betravedur/pipeline, deps: @betravedur/domain, @betravedur/fetch
├── data/  (BRANCH, not on main)  raw/ derived/ stations.json manifest.json
└── PIPELINE.md               # documents chunk/pace/retry + data-branch squash-reset (locked req)
```
- `pipeline/` mirrors ARCHITECTURE.md's separation of build-time code from `src/`. It depends on both Phase-1 packages; it must not leak into any future browser bundle.
- Add `pipeline` to the workspaces glob (or make it a workspace under `packages/`). `derive.ts` is a **pure** function (rows → shape) so it is Vitest-testable offline with the committed fixtures — put the size-budget assertion here.

### Pattern: Bake-the-invariant, quantize-for-size, decode-in-client
**What:** The pipeline bakes only the user-independent per-(year, doy) daily grid; the browser re-groups by season-year and aggregates over the selected window × year-range using `@betravedur/domain`. Integer quantization + implicit dates are a *storage encoding*, not a semantic change — the client decodes back to floats before domain math.
**Why:** Preserves the Phase-1 shared-math single-source-of-truth (Anti-Pattern 4) while hitting size budget. Measured to work.

### Anti-Patterns to Avoid
- **Fetching whole multi-decade history in one call** — 413s / flaky 502s (measured). Chunk to ≤5 station-years.
- **Burst/parallel fetching** — instant 503 throttle (measured). Pace sequentially.
- **Storing all ~45 API fields in the raw store** — ~5× bloat, pushes over 1 GB uncompressed (measured). Prune to the 10 persisted fields.
- **Committing derived data to `main`** — inflates the Pages-build repo; keep raw+derived on the `data` branch (ARCHITECTURE Anti-Pattern 1).
- **Shipping the raw store to `dist/`** — only derived+manifest+stations belong on Pages.
- **Calendar-year grouping** — must use `groupBySeasonYear` (STATE WR-03); a wrapping Dec→Jan window would be mis-sliced.
- **Coercing `null`→0 in quantization** — keep `null` cells as JSON `null` (they are the presence mask); Phase-1 missing≠zero contract extends here.
- **Blind append to NDJSON partitions** — upsert by (station,date); re-runs must be no-ops (idempotency, cron will re-fire in Phase 8).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| API fetch + schema-assert + error taxonomy | New fetch client | `@betravedur/fetch` `fetchAwsDay`/`fetchSynopDay`/`parseObservationBody` | Phase 1 already handles 404→[], 422→throw, SCHEMA_DRIFT, range-clamp, dv/r nulling by kind |
| Row normalization (clamp, leap-fold, drop Feb 29) | Re-parse in pipeline | `normalizeObservations` (already exported) | Produces the exact `DailyObservation` the domain expects |
| Season-year grouping | Custom year bucketing | `groupBySeasonYear` (domain) | Locked contract; Dec-head-owns-year; unit-tested in Phase 1 |
| Window/coverage/wind/precip/score math | Re-implement in pipeline | `@betravedur/domain` functions | Single source of truth (Anti-Pattern 4) |
| Registry / `stations.json` | New station parser | `parseStationsBody` + `writeRegistry` | No-splice, integer-keyed, done in Phase 1 |
| gzip/brotli measurement | Shell-out to `gzip` CLI | Node `zlib.gzipSync` / `brotliCompressSync` | In-process, deterministic, testable in Vitest size assertions |
| Content hashing | Custom hash | Node `crypto.createHash('sha256')` (truncate) | Standard; no dep |

**Key insight:** Phase 2 is almost entirely *orchestration* over Phase-1 primitives + Node built-ins. The genuinely new code is: the chunked/paced/resumable backfill loop, the partitioned NDJSON raw store, the columnar-quantized `derive.ts` encoder, and the manifest/content-hash bookkeeping. Everything else is a call into `@betravedur/fetch` or `@betravedur/domain`.

## Common Pitfalls

### Pitfall 1: Assuming one big request per station works
**What goes wrong:** Plan fetches full history per station in one call; works in testing for a shallow AWS station, then 413s on deep SYNOP stations and intermittently 502s in the flaky zone — backfill fails non-deterministically.
**Why:** Undocumented soft row/time ceiling; gateway timeout near it (measured HTTP 413 at 77 yr, flapping 200/502 at ~20k rows).
**How to avoid:** Fixed small chunk (5 station-years), halve on 413, retry-with-backoff on 502/503. Never assume a large range succeeds.
**Warning signs:** Green locally on a few stations, red on the full run; identical URL returns 200 then 502.

### Pitfall 2: Silent throttling from concurrency
**What goes wrong:** Parallelizing fetches for speed → instant 503s → chunks silently recorded as "no data" if the runner treats 503 like 404.
**Why:** Burst concurrency trips throttling (measured ~0.1 s 503).
**How to avoid:** Sequential + paced (≤4 req/s). Treat 503 as retryable, **never** as empty-data. (404 = empty; 503 = back off.)
**Warning signs:** Missing years for stations that should have data; run finishes suspiciously fast.

### Pitfall 3: Raw store bloat from unpruned fields
**What goes wrong:** Persist `parameters=basic`'s full ~45 columns → ~2 GB uncompressed raw store → over the 1 GB soft limit, slow clones, `.git` balloons.
**Why:** `basic` is not slim; it returns pressure/humidity/radiation/ground-temp columns v1 never uses.
**How to avoid:** Persist only the 10 `DailyObservation` fields (use `normalizeObservations` output as the store record, not the raw API row). Measured to cut store ~5× → 386 MB uncompressed.
**Warning signs:** Raw partitions ~580 B/row instead of ~110 B/row.

### Pitfall 4: "tens of KB per station" mis-set as a hard gate
**What goes wrong:** A CI size assertion fails the build for deep SYNOP stations (~174 KB brotli), blocking a correct pipeline.
**Why:** The success criterion is achievable only for shallow AWS stations; a 77-yr 7-metric daily grid cannot compress to tens of KB.
**How to avoid:** Set the size assertion per-station-year (e.g. **≤4 KB gzip/station-year** — measured ~2.4–2.6) rather than an absolute per-file cap, or set separate caps for AWS vs deep SYNOP. Document the deep-station overage.
**Warning signs:** Only the oldest, most valuable stations fail the budget check.

### Pitfall 5: Losing the season-year contract in the columnar encoding
**What goes wrong:** Derived columns are indexed by calendar year; the client's wrapping Dec→Jan window aggregation mis-attributes December to the wrong season-year, disagreeing with the pipeline.
**Why:** `groupBySeasonYear` (Dec head owns the year) is a *grouping-time* operation; a naive calendar-year column layout drops the contract.
**How to avoid:** Pick ONE convention and unit-test it end-to-end: either (a) store calendar-year columns and have BOTH pipeline and client re-group via `groupBySeasonYear` after decode (simplest — the column layout is just storage), or (b) pre-shift. Test a Dec 30 → Jan 3 window across a year boundary produces identical N and averages in pipeline and reconstructed-from-derived.
**Warning signs:** Off-by-one N ("meðaltal N ára") for winter windows vs. computing directly from raw.

### Pitfall 6: Non-idempotent raw store or accidental duplicate rows
**What goes wrong:** Re-running backfill appends duplicate (station,date) rows → corrupt coverage counts and precip sums.
**Why:** Append instead of upsert; Phase 8 cron *will* re-fire.
**How to avoid:** Overwrite the whole `{station}/{year}.ndjson` partition per fetch (deterministic), or upsert by (station,date). Add a test: fetch same chunk twice → identical file bytes.
**Warning signs:** Partition row counts exceed 365/366 per year; averages shift on re-run.

### Pitfall 7: git-version skew on `worktree add --orphan`
**What goes wrong:** Local dev script uses `git worktree add --orphan data` → fails on this machine (git 2.39; flag added in 2.42).
**Why:** `--orphan` on `worktree add` is git ≥ 2.42.
**How to avoid:** Use the verified two-step (`worktree add --detach` then `checkout --orphan`) in local scripts; CI runners (newer git) may use the one-liner. Document both in `PIPELINE.md`.
**Warning signs:** `error: unknown option 'orphan'` locally.

## Code Examples

### Chunked, paced, halving backfill loop (skeleton)
```typescript
// pipeline/src/backfill.ts — Source: live-measured API behavior 2026-07-19
import { fetchAwsDay, fetchSynopDay } from "@betravedur/fetch/observations";

const PACE_MS = 250;                 // ≤4 req/s (measured reliable)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchChunk(kind: "aws"|"synop", id: number, y0: number, y1: number, depth = 0) {
  const from = `${y0}-01-01`, to = `${y1}-12-31`;
  const fn = kind === "aws" ? fetchAwsDay : fetchSynopDay;
  try {
    const rows = await fn([id], from, to);   // Phase 1: 404→[], 422→throw, retries 5xx
    return rows;                              // may be [] (legit no-data)
  } catch (e) {
    // 413/502/503 surface here (or as thrown); on size errors, halve the span.
    if (depth < 3 && y1 > y0) {
      const mid = Math.floor((y0 + y1) / 2);
      await sleep(PACE_MS);
      const a = await fetchChunk(kind, id, y0, mid, depth + 1);
      await sleep(PACE_MS);
      const b = await fetchChunk(kind, id, mid + 1, y1, depth + 1);
      return [...a, ...b];
    }
    throw e;
  }
}

// walk a station oldest→newest in 5-year chunks, upsert, advance high-water mark
export async function backfillStation(kind: "aws"|"synop", id: number, startYear: number) {
  const nowYear = new Date().getUTCFullYear();
  for (let y = startYear; y <= nowYear; y += 5) {
    const rows = await fetchChunk(kind, id, y, Math.min(y + 4, nowYear));
    upsertPartitions(id, rows);              // write raw/{id}/{year}.ndjson, keyed (station,date)
    await sleep(PACE_MS);
  }
}
```
*Note: extend `@betravedur/fetch`'s `fetchWithRetry` to also retry 502/503 (currently retries generic non-ok 5xx via backoff; verify 413 is NOT retried as-is but surfaces for halving).*

### Columnar quantized encoder (pure, testable)
```typescript
// pipeline/src/derive.ts — pure: DailyObservation[] → derived shape (Vitest-testable)
import type { DailyObservation, StationType } from "@betravedur/domain";

const QUANT = { temp: 10, wind: 10, precip: 1, dv: 1 } as const;
const q = (v: number|null, s: number) => (v == null ? null : Math.round(v * s));

export function encodeDerived(rows: DailyObservation[], type: StationType) {
  const byYear = new Map<number, Map<number, DailyObservation>>();
  for (const r of rows) {                    // r.doy already leap-folded 1..365 (Phase 1)
    const y = Number(r.date.slice(0, 4));
    (byYear.get(y) ?? byYear.set(y, new Map()).get(y)!).set(r.doy, r);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  const startYear = years[0]!, nYears = years.at(-1)! - startYear + 1;
  const col = (pick: (o: DailyObservation) => number|null, s: number) => {
    const out: (number|null)[] = [];
    for (let i = 0; i < nYears; i++) {
      const yr = byYear.get(startYear + i);
      for (let d = 1; d <= 365; d++) out.push(yr ? q(pick(yr.get(d) ?? nullObs) , s) : null);
    }
    return out.some(x => x != null) ? out : undefined;   // drop all-null columns
  };
  // build cols { t, tx, tn, f, fx, fg, dv?(aws), r?(synop) } ... (omitted for brevity)
}
```

### Size-budget assertion (Vitest)
```typescript
// pipeline/test/derive.size.test.ts
import { gzipSync } from "node:zlib";
import { encodeDerived } from "../src/derive.js";
import awsFixture from "./fixtures/kef-multiyear.json";   // committed real rows

test("derived AWS station stays within per-station-year budget", () => {
  const rows = normalizeFixture(awsFixture);
  const json = Buffer.from(JSON.stringify(encodeDerived(rows, "sj")));
  const nYears = new Set(rows.map(r => r.date.slice(0,4))).size;
  const gzPerYear = gzipSync(json, { level: 9 }).length / nYears;
  expect(gzPerYear).toBeLessThan(4096);   // measured ~2.4 KB/yr; 4 KB is safe headroom
});
```

## Runtime State Inventory

This is an additive greenfield data-generation phase, not a rename/refactor. No pre-existing runtime state carries a string being renamed. Explicitly per category:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **None yet** — no `data` branch exists (verified: `git branch -a` shows only `main`). This phase *creates* the raw + derived stores. | Create orphan `data` branch |
| Live service config | **None** — no external service holds project state; api.vedur.is is read-only upstream. | None |
| OS-registered state | **None** — no scheduled tasks/cron yet (Phase 8 adds the GitHub Actions schedule). | None |
| Secrets/env vars | **None** — API needs no auth/key (Phase 1 verified). Backfill uses no secrets; `data`-branch push in CI uses the default `GITHUB_TOKEN`. | None (Phase 8 wires CI token) |
| Build artifacts | **None stale** — no prior pipeline artifacts. `coverage/` exists from Phase 1 tests (gitignored). | None |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | pipeline CLIs + tests | ✓ | 25.6.1 | — |
| npm | workspaces | ✓ | 11.9.0 | — |
| tsx | run pipeline TS directly | ✓ | 4.23.1 (devDep) | `node --experimental-strip-types` |
| git | orphan `data` branch, worktree, squash-reset | ✓ | **2.39.5** | — (but `worktree add --orphan` needs ≥2.42 → use two-step form) |
| Node `zlib` (brotli/gzip) | size measurement + emit | ✓ | built-in | — |
| Node `crypto` | content-hash filenames | ✓ | built-in | — |
| api.vedur.is | DATA-02 backfill | ✓ | spec 2026-02-17 | Open-Meteo (labeled gap-filler only; not for backfill) |
| Python `brotli` (research only) | size measurement in this research | ✓ | 1.2.0 (installed for measurement) | Node `zlib.brotliCompressSync` in the actual pipeline |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** `git worktree add --orphan` unavailable at 2.39 → verified two-step recipe is the fallback (and the primary for local scripts).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (+ @vitest/coverage-v8 4.1.10) — existing |
| Config file | `vitest.config.ts` (existing; `include` already globs `packages/**/test/**`; add `pipeline/test/**` when `pipeline/` lands) |
| Quick run command | `npx vitest run pipeline` |
| Full suite command | `npx vitest run --coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-02 | Chunk loop halves span on a simulated 413; retries a simulated 502; treats 404 as empty (not error) | unit (mocked fetch) | `npx vitest run pipeline -t "backfill chunk error taxonomy"` | ❌ Wave 0 |
| DATA-02 | Resumable: high-water mark advances; re-run from manifest fetches only newer years | unit | `npx vitest run pipeline -t "high-water resume"` | ❌ Wave 0 |
| DATA-02 | Idempotent upsert: fetching same chunk twice yields byte-identical partition | unit | `npx vitest run pipeline -t "raw store idempotent"` | ❌ Wave 0 |
| DATA-04 | `encodeDerived` round-trips: decode → domain math == math on raw rows (season-year window, incl. wrapping Dec→Jan) | unit (fixture) | `npx vitest run pipeline -t "derived round-trip season-year"` | ❌ Wave 0 |
| DATA-04 | null cells preserved (never 0); all-null columns dropped; AWS omits `r`, SYNOP omits `dv` | unit | `npx vitest run pipeline -t "derived null preservation"` | ❌ Wave 0 |
| DATA-04 | stations.json filters to ≥3 qualifying years on real data (not `start`); keeps decommissioned | unit | `npx vitest run pipeline -t "stations qualifying filter"` | ❌ Wave 0 |
| DATA-07 | Size budget: derived gzip ≤ ~4 KB/station-year (AWS fixture); deep-station cap documented | unit (size assertion) | `npx vitest run pipeline -t "derived size budget"` | ❌ Wave 0 |
| DATA-07 | Raw store record uses 10 pruned fields only (no rh/pressure/radiation) | unit | `npx vitest run pipeline -t "raw store field pruning"` | ❌ Wave 0 |
| DATA-07 | manifest content-hash changes iff a station's derived bytes change | unit | `npx vitest run pipeline -t "content hash delta"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run pipeline` (fast; all offline against committed fixtures)
- **Per wave merge:** `npx vitest run --coverage` (full monorepo suite incl. Phase 1)
- **Phase gate:** full suite green (incl. size-budget + season-year round-trip) before `/gsd:verify-work`; plus one `BETRA_LIVE`-gated smoke that fetches one real station-year and re-derives it (matches Phase 1's live-gated pattern)

### Wave 0 Gaps
- [ ] `pipeline/` workspace: `package.json` (`@betravedur/pipeline`, deps on domain+fetch), `tsconfig.json`, add to root `workspaces` + `vitest.config.ts include`
- [ ] `pipeline/test/fixtures/` — commit real multi-year rows captured this session: an AWS multi-year set (Keflavík 1350) and a deep SYNOP set (Reykjavík 1) so `derive`/round-trip/size tests are offline-deterministic (mirrors `packages/fetch/test/fixtures/`)
- [ ] Mock-fetch harness for backfill error-taxonomy tests (413/502/503/404 bodies — reuse Phase 1 `error-404.json`/`error-422.json` shapes, add 413/502/503)
- [ ] `PIPELINE.md` documenting chunk/pace/retry policy + `data`-branch two-step-orphan + squash-reset (locked CONTEXT requirement)

## Security Domain

> `security_enforcement` not set in config → treated as enabled. Build-time data pipeline; no auth, no user input, no browser surface in this phase.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | API unauthenticated; `data`-branch push uses CI `GITHUB_TOKEN` (Phase 8) |
| V3 Session Management | no | batch job, no sessions |
| V4 Access Control | no | public read-only open data; single-writer (pipeline) to data branch |
| V5 Input Validation | yes | Phase-1 `assertObservationSchema` + range-clamp already guard the trust boundary; keep SCHEMA_DRIFT assertion in the backfill path; validate chunk row counts (≤366/yr) before persisting |
| V6 Cryptography | no | `crypto.createHash` used only for content-addressing filenames, not security |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Upstream schema drift silently corrupts backfilled aggregates | Tampering | Assert `x-vi-api-version` + expected field set per chunk (Phase 1 guard); fail loudly |
| Partial/flaky response (502) recorded as permanent "no data" | Tampering / Availability | 502/503 are retryable, never treated as 404-empty; only `{"message":...}` 404 = empty |
| Duplicate rows from non-idempotent re-run poison averages | Tampering | Upsert by (station,date); idempotency test; skip commit when no diff |
| Committing a secret to the data branch | Info disclosure | Nothing secret is fetched/stored; API needs no key; CI uses ephemeral `GITHUB_TOKEN` |
| Supply chain (new npm dep) | Tampering | Add **no** new runtime deps; use Node built-ins (`zlib`/`crypto`/`fetch`) |
| `.git` DoS via unbounded data history | Availability | Data on orphan branch + periodic squash-reset (verified); raw store field-pruned |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Avg histories used for the footprint model (AWS ~15 yr, SYNOP ~35 yr) approximate the real network | Data Volume | Footprint scales linearly; measured per-station-year rates are firm, so total is off only if avg-history guess is off. MEDIUM — refine by reading `start`/`ending` per station during backfill and recomputing the total before final commit. |
| A2 | The 5-station-year chunk + 250 ms pace stays reliable across the *whole* 518-station backfill (tested on 2 stations, 16 consecutive chunks) | API Behavior / Backfill | If throttling tightens under a long run, add longer backoff/lower pace. LOW-MEDIUM — the halving+retry design already degrades gracefully. |
| A3 | AWS `parameters=basic` returns all ~45 fields for *all* stations (verified on Keflavík; assumed uniform) | Data Volume | If some stations return fewer fields, pruning still works (we select a fixed subset). LOW. |
| A4 | Integer quantization (temp/wind 0.1°/0.1 m/s, precip 1 mm, dv 1°) is precise enough for climatology display | Derived Schema | If sub-0.1 precision is ever needed for charts, revert that metric to ×10 float; size grows ~2×. LOW — 0.1 matches the API's own reported precision. |
| A5 | Client-side re-grouping via `groupBySeasonYear` after decode reproduces pipeline results exactly | Derived Schema / Pitfall 5 | If a convention mismatch slips in, winter-window N is off by one. Mitigated by the mandated round-trip test. LOW once tested. |
| A6 | No new npm deps needed (Node `zlib`/`crypto`/`fetch` suffice) | Standard Stack | If pacing/retry grows complex, `p-retry`/`p-limit` are the escape hatch (gated by legitimacy audit). LOW. |

## Open Questions

1. **Exact season-year storage convention in the derived file (calendar-year columns + re-group vs. pre-shifted blocks).**
   - What we know: both work if pipeline and client agree; `groupBySeasonYear` is the shared contract.
   - What's unclear: which is simpler to keep correct.
   - Recommendation: store calendar-year-indexed columns (simplest encoder), re-group with `groupBySeasonYear` on decode in BOTH tiers, and lock it with the round-trip test. Decide in planning.

2. **Should the deep-SYNOP-station derived files be sharded (per-decade) to honor a hard "tens of KB" cap, or is ~200 KB accepted?**
   - What we know: only ~8 stations exceed the budget; per-station lazy load means only an opened deep station pays; sharding adds manifest complexity.
   - Recommendation: accept ~200 KB for deep stations and document; revisit only if Phase 3 cold-load proves it a problem.

3. **Where does the manifest's high-water mark live during the *first* backfill (before a `data` branch exists)?**
   - Recommendation: create the orphan `data` branch first (empty manifest), then backfill writes into that worktree, committing in batches. Documented in the git recipe above.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| "No API rate limits" (Phase-1 A3) | Effective limits under backfill load: 413 size cap, 502 flaky zone, 503 burst throttle | This phase (measured) | Backfill MUST chunk + pace + retry; supersedes A3 |
| Assume "tens of KB/station" universal | Tens of KB for AWS, ~200 KB for deep SYNOP; per-station-year budget is the right gate | This phase (measured) | Size assertion is per-station-year, not per-file |
| Store raw API rows verbatim | Field-prune to the 10 `DailyObservation` fields | This phase (measured) | Raw store ~5× smaller, fits under 1 GB |
| `git worktree add --orphan` (docs/blogs) | Two-step `worktree add --detach` + `checkout --orphan` on git < 2.42 | This phase (git 2.39 verified) | Local scripts use the two-step form |

**Deprecated/outdated:**
- Any plan step that fetches a station's full history in one request — replaced by the chunked loop.
- Storing `parameters=basic` rows unpruned — replaced by pruned records.

## Sources

### Primary (HIGH confidence — direct live measurement 2026-07-19)
- Live `api.vedur.is/weather/observations/{aws,synop}/day` — full-year (365-row) fetch, 21-yr AWS single-call (7,509 rows), 77-yr SYNOP 413, ~20k-row 200/502 flapping, concurrent-burst 503, paced 5-yr-chunk 16/16 success, response headers (`vary: Accept-Encoding` only, no cache-control/retry-after) — all direct observation
- Live `/stations` — 776 stations, type breakdown (sj 439, sk 79, ur 153, vf 105), 347 active, `start`/`ending` integer years (1845–2026) — direct observation
- Prototyped derived-shape compression on the real returned data via Python `gzip` + `brotli` 1.2.0 — measured Keflavík AWS 52 KB brotli / 58 KB gzip (21 yr), Reykjavík SYNOP 174 KB brotli / 192 KB gzip (77 yr), full-network footprint model
- Executed git 2.39.5 commands — orphan-via-worktree creation (main undisturbed), single-worktree-per-branch constraint, squash-reset collapse (2→1 commit), `worktree add --orphan` unsupported at 2.39 — direct observation
- Repo inspection — `@betravedur/domain` + `@betravedur/fetch` exports/signatures, existing Vitest config, fixtures, tsconfig, package.json (all read this session)

### Secondary (MEDIUM confidence)
- `.planning/phases/01-data-access-domain-core/01-RESEARCH.md` — API field cheat-sheet, error shapes, AWS-no-precip finding, history depth (cross-checked, still current)
- `.planning/research/ARCHITECTURE.md` — bake/compute boundary (Pattern 1), data-branch isolation (Anti-Pattern 1), idempotent high-water mark (Pattern 4), content-hashed immutable files (Pattern 3)
- `.planning/STATE.md` — WR-03 season-year contract, data-branch decision, no-human-checkpoint directive

### Tertiary (LOW confidence)
- GitHub Pages ~1 GB soft repo/site limit — cited from Phase-1 STACK.md sources (not re-fetched this session; stable, HIGH in original)

## Metadata

**Confidence breakdown:**
- API backfill constraints (413/502/503, chunk size, pacing): HIGH — directly measured, reproducible
- Data volume / footprint (raw pruned, derived brotli/gzip): HIGH — measured on real deepest+shallowest cases; total is a linear model over firm per-year rates (A1)
- Derived schema recommendation: HIGH for size, MEDIUM for the season-year storage convention (Open Q1, mitigated by mandated round-trip test)
- `data`-branch git mechanics: HIGH — commands executed on this machine's git
- Reuse of Phase-1 packages: HIGH — signatures read directly

**Research date:** 2026-07-19
**Valid until:** API behavior — re-confirm chunk reliability if backfill fails (VÍ may change gateway limits); data-volume model — stable (structural). Stack — no new deps, inherits Phase-1 30-day window.
