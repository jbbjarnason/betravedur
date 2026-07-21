---
quick_id: 260721-prune
slug: prune-derived
status: complete
date: 2026-07-21
commit: <pipeline fix> + data-branch b70377a
---

# Quick Task 260721-prune — Summary

## Storing mechanism updated (no more stale accumulation)

`pipeline/src/aggregate.ts`:
- **prune-on-write** — `aggregateStationWithDerived` now `rmSync`es the superseded
  `derived/{station}.{oldhash}.json` when a content change writes a new hash file.
- **self-healing sweep** — new `pruneOrphanedDerived(root, manifest)` removes every
  `derived/*.json` the manifest does not reference; called at the end of `aggregate main()`, so
  every run leaves `derived/` == exactly the manifest-referenced set (also mops up pre-existing
  orphans and any crash-orphaned file).
- tests: prune-on-rewrite + orphan sweep. Unit **375** green; tsc 0.

## One-time cleanup of the live data branch

Ran `pruneOrphanedDerived` against the `betravedur-data` worktree: **965 → 518 derived files**
(447 orphaned old content-hash versions removed — the tiny 1-year versions left by the runner's
first sweep before the full local re-fetch). Committed (`b70377a`) + pushed; redeployed so the
slimmed `derived/` ships.

## Sizes now (data branch)

| Store | Size | Files | Ships to Pages? |
|-------|------|-------|-----------------|
| `raw/` (archive, source of truth) | 330.9 MB | 8512 | ❌ no |
| `derived/` (browser reads on demand) | 198.2 MB | 518 | ✅ yes |
| **data branch total** | ~529 MB | | |

`derived/` is legitimate full-history data (518 stations); it is fetched **lazily** — the browser
only downloads `stations.json` + `manifest.json` on boot and then ONE derived file per opened
station panel, so the 198 MB is deploy/repo size, not a user download. We sit at ~half the 1 GB
Pages/repo soft limit, and the prune keeps it from creeping upward.

## Append-only note
Raw partitions remain append-only (never rewritten). Derived is fully regenerable from raw, so
pruning abandoned derived files is a cache cleanup, not a history rewrite — idempotency + byte-
stable output unchanged.

## Deferred / possible further trims (not done — legitimate data, low urgency)
- 143 stations are in the manifest but not in `stations.json` (fail the ≥3-qualifying-years marker
  gate); their derived still ships so a `?st=<id>` deep link resolves. Could prune empty-shell
  stations (no data at all) from the manifest if repo size ever pressures the limit.
