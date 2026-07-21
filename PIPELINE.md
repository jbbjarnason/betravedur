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
- **Push / force-push to a remote is owned by Phase 8.** In Phase 2 the `data` branch was a
  **local** commit only (satisfying DATA-07 there). Phase 8 gives `data` its first push and wires
  the nightly append + the scoped squash-reset force-push. No remote push ever touches `main`.
  See **§8** for the live prerequisites and the exercised force-push safety.

---

## 7. Season-year (WR-03)

Derived columns are stored by **calendar** year; December is **not** pre-shifted. Both the
pipeline and the browser re-group via `groupBySeasonYear` **after** `decodeDerived`, where the
"December head owns the season-year" wrap logic lives. Storing calendar years and re-grouping on
decode keeps a wrapping Dec→Jan window's per-season N and mean identical to the raw-row domain
path (locked by the wrapping round-trip test).

---

## 8. Nightly automation (Phase 8)

Phase 8 schedules the pipeline in GitHub Actions: an off-peak cron ingests new observations,
commits deltas to the orphan `data` branch, builds the site over the fresh derived files, and
deploys to GitHub Pages. The data *logic* is unchanged from §1–§7 — Phase 8 is pure orchestration.

### (a) Live prerequisites — do these ONCE before the first run

The repo currently has **no git remote** (`git remote -v` is empty) and the `data` branch is
**local-only** (Phase 2 never pushed it). Two one-time human setup steps unblock the first live run:

1. **Push the repo to GitHub.** Create the GitHub repo and push `main`. The `data` branch gets its
   **first push automatically** from the nightly workflow (the incremental commit step force-adds
   `origin data` on first run); or push it manually once (`git push -u origin data`) to seed it.
   Nothing the workflow does ever pushes or force-pushes `main`.
2. **Set GitHub Pages Source = "GitHub Actions"** (Settings → Pages → Source), **not**
   "Deploy from a branch". This creates the `github-pages` deployment environment the deploy job
   targets via `actions/deploy-pages@v4`. Without this the deploy job cannot publish.

Until both are done the workflow YAML is valid but the first run cannot complete — these are
user-setup prerequisites, not code.

### (b) How the nightly workflow works (`.github/workflows/nightly.yml`)

- **Trigger:** off-peak cron `37 4 * * *` (never `0 0` — highest drop probability), plus
  `workflow_dispatch` for manual re-runs / self-heal / 60-day-disable recovery.
- **Data-branch wiring:** the job materializes the `data` branch as a `./data-wt` worktree
  (`git fetch origin data`; `git worktree add ./data-wt data`) and runs the pipeline CLIs with
  `--root ./data-wt` so relative writes land inside the worktree — **not** the `./data` dir on
  `main` (the name-collision Pitfall closed in Plan 08-01).
- **Incremental resume:** each known station backfills from its per-station high-water mark
  (`highWater + 1`), so a missed night **self-heals** — the resume fetches the whole gap, not just
  yesterday.
- **Skip-empty:** because `aggregate.ts` re-derives only touched stations and serialization is
  byte-stable, a night with no new data produces **no diff** → **no commit** (`git status
  --porcelain` gates the commit; no empty commits).
- **Build & deploy:** the ship set (`derived/`, `stations.json`, `manifest.json` — never `raw/`,
  §5) is copied from `./data-wt` into `site/public/data/`, then `vite build` runs and
  `actions/deploy-pages@v4` publishes `site/dist/`.

### (c) Full national backfill — the one-command seed

Run the workflow via **`workflow_dispatch` with `full_backfill: true`** **once** to seed the whole
national station set from scratch (enumerate all stations → paced backfill each → aggregate all).
The default cron run is always incremental; `full_backfill` is the manual seed trigger and is
**not** run automatically. (Enumeration is wired in `stations-list.ts`; the national sweep is
operator-triggered.)

### (d) Monitoring

- **Optional `HEARTBEAT_URL` repo secret** (healthchecks.io-style dead-man's switch): the workflow
  pings it on a successful run. When the secret is **unset the ping is a no-op** and the run stays
  green — it degrades gracefully.
- **Actions status UI** shows each scheduled run. Note GitHub's **60-day auto-disable**: a repo
  with no commits for 60 days has its scheduled workflow silently disabled — a **successful nightly
  `data` commit resets that timer**, so keeping the ingest green is itself the keepalive.

### (e) Squash-reset cadence (`.github/workflows/squash-reset.yml`)

Nightly appends grow `.git` over years (T-08-11). The **recommended cadence is documented-manual**:
run the `squash-reset` workflow via `workflow_dispatch` when `.git` warrants it. An **optional
monthly cron** (`17 5 1 * *`) automates it — monthly comfortably bounds KB-scale nightly deltas.

**Force-push safety (restated, T-08-10):** the squash-reset is the ONLY force-pushing writer. It
**asserts the current branch IS `data`** (`git rev-parse --abbrev-ref HEAD == data`) **before** any
force-push, and force-pushes **ONLY `git push --force origin data`** (explicit ref). It **never**
references or force-pushes `main`, and carries `contents: write` only (no deploy permissions). The
squash preserves a **byte-identical working tree** (proven 02-04 E7). The `squash-workflow.test.ts`
gate asserts this scoping so a mis-scoped force-push can never merge.
