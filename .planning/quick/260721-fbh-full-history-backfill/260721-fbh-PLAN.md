---
quick_id: 260721-fbh
slug: full-history-backfill
title: full_backfill must fetch each station's full history (not just the current year)
mode: quick
created: 2026-07-21
---

# Quick Task 260721-fbh — full_backfill full-history

## Problem (diagnosed against the live data branch)

`workflow_dispatch full_backfill=true` ran green (10m) and enumerated **518** national
stations into `manifest.json` + `derived/`, but the deployed **`stations.json` still lists
only 2 stations** → the live map shows 2 markers.

Root cause: `pipeline/src/backfill.ts::backfillStation` resolves the start year for a **fresh**
station (no prior high-water mark) as `y0 = hw === null ? nowYear : hw + 1` (line ~116). The
full_backfill workflow loop calls `npm run backfill -- <kind> <id>` with **no explicit start
year**, so every fresh national station fetches **only the current (partial) year 2026**. The 2
seed stations (1, 1350) had prior high-water marks on the `data` branch, so they resumed full
history. Result: 304 new stations get 1 partial year each → 0 qualifying years → all fail the
`buildStationsJson` ≥3-qualifying-years coverage gate (`pipeline/src/stations.ts`) → excluded
from `stations.json` → no markers.

The fix must make the full_backfill sweep fetch each station from its registry `start` year.

## Tasks

### Task 1 — emit backfill specs carrying the start year
- **files:** `pipeline/src/stations-list.ts`, `pipeline/test/stations-list.test.ts`
- **action:** Add `backfillSpecsFor(stations): string` → one `${kind}:${id}:${startYear}` line
  per survivor, reusing `toAggregateSpec` for `kind:id` and appending the station's
  `StationMeta.start` (guarded: if `start` is not a finite year ≥ 1900, fall back to a
  `HISTORY_FLOOR_YEAR = 1949` constant so a bad/absent start never sends `NaN`/current-year).
  Change the CLI `main()` to print `backfillSpecsFor(stations)` instead of `specsFor(stations)`.
  Keep `specsFor` (`kind:id`) intact — the aggregate spec contract + its existing tests are
  unchanged. Add unit tests for `backfillSpecsFor` (start emitted; floor fallback; empty set).
- **verify:** `npm --prefix pipeline test` (or root vitest) green incl. new cases; `specsFor`
  tests still pass unchanged.
- **done:** CLI stdout is `kind:id:start` per line; `specsFor` untouched.

### Task 2 — drive backfill from start + keep aggregate spec clean; make the sweep resilient
- **files:** `.github/workflows/nightly.yml` (full_backfill branch of the "Backfill + aggregate" step)
- **action:** In the `full_backfill=true` branch: capture `specs=$(npx tsx pipeline/src/stations-list.ts)`
  (now `kind:id:start`). For each spec parse `kind`/`id`/`start` and call
  `npm run backfill -- --root ./data-wt "$kind" "$id" "$start"`. Make the per-station backfill
  **tolerant** so one station's hard error (e.g. a 503 throttle) does not abort the whole
  national sweep: run each backfill under a guard that records the failed spec and continues
  (the high-water resume self-heals a failed station on the next run). Derive the aggregate spec
  list by stripping the trailing `:start` (`aggspecs=$(printf '%s\n' $specs | sed 's/:[0-9]\{1,\}$//')`)
  and run `npm run aggregate -- --root ./data-wt $aggspecs` over ALL enumerated stations (empty
  shells fail the coverage gate harmlessly). Print a summary of any failed specs at the end. Keep
  `set -uo pipefail` semantics but do NOT let a single station kill the sweep. The nightly
  (non-full) branch is UNCHANGED (still high-water resume for the 2 seed stations).
- **verify:** `npx tsx pipeline/src/stations-list.ts` output shape sanity (kind:id:start); the
  `sed` strip yields `kind:id`; `pipeline/test/workflow.test.ts` invariants still hold (off-peak
  cron, full_backfill boolean, zero force-push, gate-before-push, `--root ./data-wt`).
- **done:** workflow full_backfill loop passes start per station, aggregate gets clean specs,
  one station failure cannot abort the sweep.

### Task 3 — typecheck + full gate, then push + re-run + verify live
- **files:** none (verification + ops)
- **action:** `npm test && npm run typecheck` (root) green. Commit Task 1+2 atomically. Push
  `main` so the workflow's `checkout main` sees the fix (the UI v1.1 fixes ride along and deploy
  too). Trigger `gh workflow run nightly.yml -f full_backfill=true`; monitor to green (this run
  is longer — it fetches decades per station, paced ≤4 req/s). Then verify the deployed
  `stations.json` now lists many stations and the live map renders a national marker field
  (Playwright), and the attribution/a11y v1.1 fixes are live.
- **done:** deployed `stations.json` ≫ 2 entries; live map shows national markers with real
  multi-year coverage; zero console errors.

## must_haves
- **truths:** fresh national stations fetch from their registry `start` year, not `nowYear`;
  `stations.json` includes every station clearing the ≥3-qualifying-years gate.
- **artifacts:** `backfillSpecsFor` + tests; updated nightly.yml full_backfill loop.
- **key_links:** backfill.ts (fresh-station default), stations-list.ts (CLI output), stations.ts
  (coverage gate), nightly.yml (sweep loop).
