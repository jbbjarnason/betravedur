---
quick_id: 260721-fbh
slug: full-history-backfill
status: complete
date: 2026-07-21
commit: cb8b820
---

# Quick Task 260721-fbh — Summary

## What & why

The first `full_backfill=true` run (260721) went green and enumerated **518** national
stations into `manifest.json` + `derived/`, but the deployed **`stations.json` still listed
only 2 stations** → the live map showed 2 markers. Diagnosed to `pipeline/src/backfill.ts`:
a fresh station (no on-disk high-water) resolves `y0 = nowYear`, and the workflow loop called
`backfill <kind> <id>` with **no start year**, so every new national station fetched only the
current partial year (2026) → 0 qualifying years → filtered out by the ≥3-qualifying-years
coverage gate in `stations.ts::buildStationsJson`. The 2 seed stations had prior high-water
marks, so they resumed full history and passed the gate.

## Changes

| File | Change |
|------|--------|
| `pipeline/src/stations-list.ts` | Added `backfillSpecsFor()` → `<kind>:<id>:<start>` per line (guarded by `HISTORY_FLOOR_YEAR = 1949` for missing/implausible/NaN starts). CLI `main()` now prints it. `specsFor` (`kind:id`, aggregate contract) left untouched. |
| `.github/workflows/nightly.yml` | full_backfill loop parses `kind/id/start` and passes `$start` to backfill; derives clean `kind:id` aggregate specs by stripping `:start`; makes the sweep resilient (`if ! npm run backfill` → record + continue so one 503 can't abort the national sweep; high-water resume self-heals). Nightly (non-full) branch unchanged. |
| `pipeline/test/stations-list.test.ts` | New `backfillSpecsFor` suite (start emitted, floor fallback, NaN guard, plausible-kept, empty). `meta()` gained an optional `start` param. |
| `pipeline/test/workflow.test.ts` | Updated the full_backfill invariants: backfill passes `"$start"`, start parsed from spec, aggregate uses stripped `$aggspecs`, and the `if !` resilience guard. |

## Verification

- pipeline stations-list + workflow tests: **30 passed**
- Root typecheck (domain/fetch/pipeline): **0 errors**; site `tsc --noEmit`: **0**
- Full unit suite: **370 passed, 3 skipped (40 files)**

## Ops (Task 3)

- Committed `cb8b820`; pushed `main` (carries the v1.1 UI fixes too — they deploy on the run).
- Re-triggered `nightly.yml full_backfill=true`; this run is longer (fetches decades/station,
  paced ≤4 req/s). Verify deployed `stations.json` ≫ 2 and the live map shows a national marker
  field. (See STATE / continue-here for the live-verification result.)

## Additional bugs found while verifying the deploy path (same go-live goal)

- **Bug 2 — nightly clobbers stations.json (commit `62e6945`).** `stations.json` is *regenerated*
  (not accumulated) each aggregate run, from only that run's specs. So the incremental nightly
  (`aggregate synop:1 aws:1350`) would shrink a populated national `stations.json` back to 2
  markers on the very next 03:37 cron. Fixed: `aggregate.main()` now rebuilds `stations.json`
  from the WHOLE manifest via `fullStoreQualifyingCounts` (reuse touched counts + decode untouched
  derived files; one batched `fetchStations` call for registry meta). +3 tests.
- **Contrast — muted marker pill (commit `7246847`).** Deeper-verify WCAG audit found
  `--marker-empty-fg #9aa5ae` on `--marker-empty-bg` = 2.32:1 (AA needs 4.5). Darkened to
  `#646e77` (4.8:1). All other text passes AA (muted-ink 5.82:1 on the 0.97 glass; score colors
  are decorative + numerically redundant).

## Notes / follow-ups

- Explicit-start backfill re-fetches from `start` on every full_backfill run (no mid-run resume
  for a station already partially filled by the broken first run) — idempotent upsert makes this
  correct, just redundant for the ~304 stations that got 2026 only. Acceptable one-time cost.
- Stations with < 3 qualifying years still (correctly) stay out of `stations.json` — honest
  "meðaltal N ára" coverage, not a bug.
