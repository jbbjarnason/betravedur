# Betra Veður Data Pipeline — Operator Guide

The pipeline backfills per-station daily observations from **api.vedur.is** (CC BY 4.0),
stores them as a field-pruned raw NDJSON source of truth, and precomputes compact
content-hashed **derived** files the browser aggregates over any period × year-range
selection. This document is the operational contract Phase 8 (nightly cron) schedules.

Pipeline code lives in `@betravedur/pipeline` (`pipeline/src/`). All of it is **Node-only**
(fs / path / crypto / zlib / fetch) and is **never bundled into the browser**.

---

## 1. Data flow

```
api.vedur.is  --backfill-->  raw/{station}/{year}.ndjson   (source of truth; NEVER ships)
                                   |
                                   |  aggregate
                                   v
              derived/{station}.{hash}.json  +  manifest.json  +  stations.json   (ships to Pages)
```

- `backfill.ts` — `backfillStation(kind, id, startYear?, deps)`: resumable, chunked, paced
  fetch loop; writes raw partitions.
- `rawstore.ts` — `upsertPartition` / `readPartition` / `highWaterYear`: the field-pruned
  idempotent `(station,date)`-keyed NDJSON store.
- `derive.ts` — `encodeDerived` / `decodeDerived`: columnar integer-quantized implicit-date
  derived format.
- `manifest.ts` — `contentHash` / `updateManifest` / `serializeManifest`: content-addressed
  cache-busting index.
- `stations.ts` — `buildStationsJson`: the marker manifest, gated on ≥3 qualifying years.
- `aggregate.ts` — `aggregateStation` / `main`: orchestrates raw → derived + manifest +
  stations, re-deriving only touched stations.

---

## 2. Backfill policy (chunk / pace / retry)

Measured against the live API (02-RESEARCH, 2026-07-19) and re-confirmed on the real subset
backfill (02-04):

| Policy | Value | Rationale |
|--------|-------|-----------|
| **Chunk size** | 5 **station-year** spans (`CHUNK_YEARS`, ~1826 rows) | The reliable request-size zone; larger spans risk 413/502. |
| **Pacing** | ≥250 ms between requests (`PACE_MS`), **≤4 req/s** | Polite throttle; bursting triggers 503. **Never** `Promise.all` over fetches. |
| **413** (payload too large) | Halve the span and recurse (depth ≤3); give up at the single-year floor | Deterministic size ceiling — retrying the same URL is pointless. |
| **502** (bad gateway) | Bounded client backoff, then halve like 413 | Flaky ~20k-row gateway zone. |
| **503** (service unavailable) | **Propagate as an error — never `[]`** | A throttle is NOT "no data"; recording it as empty would create permanent data holes. |
| **404** (no data) | Return `[]` and advance the cursor | A year with genuinely no observations. |

**Resume** is driven by the per-station **high-water mark**: `backfillStation` with `startYear`
omitted reads `highWaterYear(root, station)` and resumes from `highWater + 1`, so a re-run
fetches **only newer years**. Re-runs over already-present years are byte-identical (idempotent).

Note on history depth: the `/stations` metadata `start` year can predate the earliest year the
**daily** observation endpoint actually returns (e.g. Reykjavík #1 has `start:1920` but SYNOP
daily data begins **1949**). Early empty years 404-advance silently; the recorded `from` reflects
real data, not `start`.

---

## 3. Field pruning (raw store)

The raw store persists **exactly 10 fields** in fixed key order, built field-by-field (never a
spread):

```
station, date, doy, t, tx, tn, f, fx, fg, dv, r
```

`rh` / `pressure` / `radiation` and any other API-carried columns are **dropped**. Field-pruning
keeps the raw store at **~110–120 B/row** (measured: AWS 119.9 B/row, SYNOP 116.6 B/row) instead
of ~580 B/row unpruned. Fixed key order + date-sorted rows make each partition byte-stable, which
is what makes idempotent re-runs byte-identical.

---

## 4. Derived size budget & the deep-SYNOP exception

- **Per-station-year budget: ≤4 KB gzip/station-year** (enforced by a test in derive.ts / Plan 01).
- Measured on the real subset backfill (02-04):

  | Station | Type | Years | Derived gzip | gzip/station-year | Budget |
  |---------|------|-------|--------------|-------------------|--------|
  | #1350 Keflavík | AWS (sj) | 2008–2026 (19) | 62 KB | 3278 B | PASS |
  | #1 Reykjavík | SYNOP (sk) | 1949–2026 (78) | 151 KB | 1941 B | PASS |

- **Deep-SYNOP exception (documented, NOT a bug):** the ~8 century-deep SYNOP stations produce
  **total** derived files of ~150–200 KB **because of history depth**, not per-year bloat — their
  per-station-year size (1941 B for #1) is well *under* the 4 KB budget. We do **not** cap history
  (that would contradict "backfill full history"). Tens-of-KB-per-shallow-station and
  ~150–200-KB-per-deep-SYNOP-station is the expected, accepted shape.

---

## 5. Ship rule (what deploys to GitHub Pages)

Only these ship to Pages — the ship set is `shipOutputs()` in `aggregate.ts`:

```
derived/    stations.json    manifest.json
```

**`raw/` NEVER ships.** It is the pipeline's private source of truth for re-deriving without
re-hitting the API. Committing raw to `dist/` would balloon the Pages repo toward the 1 GB limit.

---

## 6. The `data` branch

Raw + derived + manifest + stations live on a dedicated **orphan `data` branch**, keeping
nightly data commits out of the Pages-build (`main`) history.

### Create (git 2.39 two-step — this machine)

`git worktree add --orphan` requires git ≥2.42, which is **not** available on the 2.39.5 build
here. Use the verified two-step recipe:

```bash
git worktree add --detach ../betravedur-data      # 1. detached worktree, sibling dir
cd ../betravedur-data
git checkout --orphan data                          # 2. unborn orphan branch (no history)
git rm -rf . 2>/dev/null || true                    #    clear the inherited index/tree
mkdir -p raw derived
# pipeline writes raw/ derived/ stations.json manifest.json here
git add -A && git commit -m "data: initial subset backfill $(date +%F)"
```

**Verified properties (02-04):** the `main` worktree is left undisturbed (still on `main`, no
tracked changes, files intact); a branch is checked out in only one worktree at a time.

### Create (CI, git ≥2.42 one-liner)

On a runner with git ≥2.42:

```bash
git worktree add --orphan data ./data-wt
```

### Incremental update (nightly)

```bash
cd ../betravedur-data                # the data worktree, on branch `data`
# resume backfill (fetches only newer years via the high-water mark) then aggregate
npm run backfill -- aws 1350         # startYear omitted -> resume from high-water+1
npm run aggregate -- aws:1350 synop:1
git add -A && git commit -m "data: nightly $(date +%F)"
```

Because `contentHash` + `updateManifest` re-derive **only touched stations** and serialization is
byte-stable, unchanged stations produce **no diff** — nightly commits are minimal deltas.

### Periodic squash-reset (cap `.git` growth) — force-push-owned by the pipeline

Additive daily commits grow `.git` unboundedly. Periodically collapse the `data` branch to a
single commit, preserving the working tree:

```bash
cd ../betravedur-data
git checkout --orphan data-fresh
git add -A
git commit -m "data: squashed subset backfill $(date +%F)"
git branch -D data
git branch -m data-fresh data
git push --force origin data          # ONLY the data branch — see rule below
```

**Verified (02-04):** the squash collapses history (2 commits → 1) while the committed **tree hash
is byte-identical** — the working tree is fully preserved.

### Force-push safety rule

- The `data` branch is **single-writer, force-push-owned by the pipeline**. It never has PRs and
  the squash-reset **force-pushes ONLY `data`**.
- **NEVER force-push `main`.** The two-step recipe leaves the `main` worktree untouched by design.
- **Push / force-push to a remote is deferred to Phase 8.** In Phase 2 the `data` branch is a
  **local** commit only (this satisfies DATA-07 here). No remote is configured, and nothing that
  touches `main` is ever force-pushed. Push and force-push safety are wired and exercised in
  Phase 8 (nightly cron), not here.

---

## 7. Season-year (WR-03)

Derived columns are stored by **calendar** year; December is **not** pre-shifted. Both the
pipeline and the browser re-group via `groupBySeasonYear` **after** `decodeDerived`, where the
"December head owns the season-year" wrap logic lives. Storing calendar years and re-grouping on
decode keeps a wrapping Dec→Jan window's per-season N and mean identical to the raw-row domain
path (locked by the wrapping round-trip test).
