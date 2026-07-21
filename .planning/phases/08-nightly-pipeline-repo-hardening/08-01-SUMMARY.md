---
phase: 08-nightly-pipeline-repo-hardening
plan: 01
subsystem: pipeline
tags: [backfill, aggregate, rawstore, ship, full_backfill, root-collision, DATA-03]
requires:
  - "Phase 2 pipeline (rawstore/backfill/aggregate/manifest) — reused, not rewritten"
provides:
  - "resolveRoot: --root arg / PIPELINE_ROOT env / DEFAULT_ROOT — closes the data-dir vs data-branch collision"
  - "--root-aware backfill + aggregate CLIs"
  - "stations-list.ts: enumerateStations + toAggregateSpec (full_backfill enumeration, wire-only)"
  - "ship.ts: SHIP_OUTPUTS + copyShipSet (ship-set staging, raw/ excluded)"
affects:
  - "Plan 08-02 workflow YAML (calls backfill --root ./data-wt, aggregate --root, copyShipSet)"
tech-stack:
  added: []
  patterns:
    - "CLI root resolution: strip --root pair off argv before positional spec parsing"
    - "wire-only helper: enumerate the national set but do not run the national sweep this phase"
    - "ship-rule enforcement by construction: copy only SHIP_OUTPUTS, raw/ is never in the list"
key-files:
  created:
    - pipeline/src/stations-list.ts
    - pipeline/src/ship.ts
    - pipeline/test/root-flag.test.ts
    - pipeline/test/stations-list.test.ts
    - pipeline/test/ship.test.ts
  modified:
    - pipeline/src/rawstore.ts
    - pipeline/src/backfill.ts
    - pipeline/src/aggregate.ts
    - pipeline/test/backfill.test.ts
decisions:
  - "resolveRoot keeps DEFAULT_ROOT='data' for back-compat; the workflow supplies --root ./data-wt explicitly"
  - "toAggregateSpec returns null for ur/vf so the aggregate spec list stays AWS/SYNOP-only"
  - "copyShipSet walks only SHIP_OUTPUTS (derived + 2 json) — raw/ exclusion is structural, not a filter"
metrics:
  duration: 3min
  completed: "2026-07-21"
requirements: [DATA-03]
---

# Phase 8 Plan 01: Nightly Pipeline Wave-0 Foundation Summary

Explicit `--root` on the backfill/aggregate CLIs (kills the `data`-dir vs `data`-branch collision), a proven multi-year-gap self-heal, the `full_backfill` station-enumeration helper (wired, not run), and a `copyShipSet` staging helper that ships derived + stations + manifest and never `raw/`. Zero new deps, tsc 0, full suite green.

## What Was Built

- **Task 1 — `--root` on the three CLIs (commit `6f40b4f`):** Added `resolveRoot(argv, env)` to `rawstore.ts` (precedence: `--root <dir>` arg > `PIPELINE_ROOT` env > `DEFAULT_ROOT`), stripping the `--root` pair from the returned `rest` so downstream spec/id parsing is untouched. Rewrote `backfill.ts` and `aggregate.ts` `main()` to resolve the root instead of hardcoding `DEFAULT_ROOT`. This closes RESEARCH Pitfall 1: on `main`, the relative `data` dir collides with the `data` branch; the workflow now runs `npm run backfill -- --root ./data-wt ...` so relative writes land in the worktree.
- **Task 2 — self-heal test + enumeration helper (commit `6eab386`):** Added a `self-heal a missed multi-year gap` case to `backfill.test.ts` proving resume from high-water+1 spans the WHOLE gap (2021..2024 with high-water 2020, now 2024), not just yesterday — it passed immediately against the existing Phase-2 `backfillStation`, confirming the gap-fill was already correct (DATA-03). Created `stations-list.ts` exporting `enumerateStations(ids, deps?)` (injectable fetch, defaults to `@betravedur/fetch`) and `toAggregateSpec(meta)` (`sj`->`aws:`, `sk`->`synop:`, `ur`/`vf`->null). Wire-only for `workflow_dispatch full_backfill=true`; the national sweep is not run this phase.
- **Task 3 — ship-set copy (commit `34aaad5`):** Created `ship.ts` exporting `SHIP_OUTPUTS` (`derived`, `stations.json`, `manifest.json` — mirrors `aggregate.shipOutputs()`) and `copyShipSet(srcRoot, destDir)` (cpSync derived/ recursively, copyFileSync the two json files, mkdirSync dest). Because it only walks `SHIP_OUTPUTS` and `raw` is not among them, `raw/` can never leak into the build input — the exclusion is structural. This is the build-step staging seam (RESEARCH Pattern 5b): copy from `./data-wt` into `public/data` so the build uses the just-written bytes on the first full_backfill, before `data` is pushed.

## Verification Evidence

- `npx vitest run pipeline/` — 9 files, 65 tests pass (incl. root-flag 6, stations-list 8, ship 4, self-heal case).
- `npx vitest run` (full repo) — 38 files, 335 pass / 3 skipped (pre-existing E2E fixmes), 0 fail.
- `npx tsc -p pipeline/tsconfig.json --noEmit` — exit 0.
- No new entries in `package.json` / `pipeline/package.json` dependencies (git diff empty).

## Threat Model Compliance

- T-08-01/02 (Tampering, path-vs-collision): `assertStationId`/`assertYear`/`assertUnderRoot` still guard every partition/derived write — `resolveRoot` only sets the base dir, station/year segments remain validated. `--root ./data-wt` routes writes into the worktree.
- T-08-03 (Integrity, enumeration): `enumerateStations` is a thin pass-through/filter over the Phase-2-hardened `fetchStations` trust boundary; wire-only, national sweep not run.
- T-08-SC (npm installs): zero new deps added.

## Deviations from Plan

None — plan executed exactly as written. All three tasks followed TDD (RED confirmed before GREEN for `resolveRoot`, `stations-list`, and `ship`; the self-heal case passed on first run, confirming the existing backfill loop already gap-fills correctly).

## Self-Check: PASSED

- Created files present: `pipeline/src/stations-list.ts`, `pipeline/src/ship.ts`, `pipeline/test/root-flag.test.ts`, `pipeline/test/stations-list.test.ts`, `pipeline/test/ship.test.ts` — all FOUND.
- Modified files present: `rawstore.ts`, `backfill.ts`, `aggregate.ts`, `backfill.test.ts` — all FOUND.
- Commits `6f40b4f`, `6eab386`, `34aaad5` — all FOUND in git log.
