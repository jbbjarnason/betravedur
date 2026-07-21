---
quick_id: 260721-prune
slug: prune-derived
title: Storing mechanism — prune stale/orphaned derived files (no accumulation)
mode: quick
created: 2026-07-21
---

# Quick Task 260721-prune — derived storage cleanup

## Problem

The `data` branch held **965 derived files for 518 stations** — 447 orphaned old content-hash
versions accumulated across the three backfill+aggregate runs. `aggregate` writes a new
`derived/{station}.{hash}.json` when content changes but never deleted the superseded one; `git
add -A` committed them and `copyShipSet` shipped the whole `derived/` dir → ~90 MB of dead weight
on the branch and in the Pages payload (toward the 1 GB limit). Raw history (331 MB) is committed
too but never ships (private source of truth) — that part is expected.

## Tasks

### Task 1 — storing mechanism: prune on write + self-healing sweep (DONE)
- `pipeline/src/aggregate.ts`:
  - `aggregateStationWithDerived`: on a content change, `rmSync` the SUPERSEDED
    `existing.file` right after writing the new hash file.
  - new `pruneOrphanedDerived(root, manifest)`: removes every `derived/*.json` not referenced by
    the manifest; called at the end of `main()` (self-healing — also cleans pre-existing orphans
    and any crash-orphaned file). Guarantees `derived/` == manifest-referenced set each run.
  - tests: prune-on-rewrite + orphan sweep (keep referenced, remove foreign/old). Unit 375 green.

### Task 2 — one-time cleanup of the live data branch
- Run `pruneOrphanedDerived` against the `betravedur-data` worktree (data branch), commit the
  deletions, push. Then trigger a plain `nightly.yml` so the slimmed `derived/` redeploys.
- Verify: data-branch derived count 965 → 518; committed size drops ~90 MB.

## Note on the append-only constraint
Raw partitions stay append-only (the archive). Pruning ORPHANED derived files is not a history
rewrite — derived is fully regenerable from raw, and we only remove files the manifest already
abandoned. Data correctness (idempotent upsert, byte-stable output) is unchanged.
