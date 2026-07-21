---
phase: 08-nightly-pipeline-repo-hardening
verified: 2026-07-21T07:00:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
re_verification: false
---

# Phase 8: Nightly Pipeline & Repo Hardening — Verification Report

**Phase Goal:** The site stays fresh unattended for years — a nightly GitHub Actions cron fetches new observations, appends them idempotently with gap-fill, aggregates only touched stations, and redeploys, with monitoring against silent failure and bounded repo growth.
**Verified:** 2026-07-21T07:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A nightly cron (plus workflow_dispatch) fetches since last stored obs, upserts by station+date, is safe to re-run, and self-heals a missed night | VERIFIED | `nightly.yml` cron `"37 4 * * *"` + `workflow_dispatch`; `resolveRoot` in `rawstore.ts`; `backfillStation` resumes from `highWaterYear+1`; `backfill.test.ts` "self-heal a missed multi-year gap" test asserts 2021..2024 fetched when high-water=2020, nowYear=2024 |
| 2 | On new data the workflow aggregates touched stations, commits to the data branch, builds, and deploys to Pages automatically | VERIFIED | `nightly.yml`: aggregate step (`--root ./data-wt synop:1 aws:1350`); skip-empty commit gate (`git status --porcelain`); `copyShipSet` stages ship-set; `npm --prefix site run build`; `upload-pages-artifact@v3`; `deploy-pages@v4` in deploy job gated on `changed=='true'` |
| 3 | The pipeline runs off-peak with an external heartbeat so a silent stall is detectable, and the UI surfaces the resulting freshness date | VERIFIED | Cron `"37 4 * * *"` (not 00:00); heartbeat step `if: success()`, guarded `[ -n "$HEARTBEAT_URL" ] && curl -fsS -m 10 "$HEARTBEAT_URL" \|\| true`; Phase 7 info panel reads `manifest.json` max `lastFetched` for freshness display |
| 4 | Nightly commits do not balloon .git history — data-branch partitioning / squash strategy keeps the repo within Pages limits | VERIFIED | `squash-reset.yml`: monthly cron + workflow_dispatch; branch assertion `test "$(git rev-parse --abbrev-ref HEAD)" = "data"` before `git push --force origin data`; skip-empty in `nightly.yml` prevents empty commits; `squash-workflow.test.ts` asserts force-push scoped to data only, never main |

**Score:** 4/4 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `pipeline/src/rawstore.ts` | `resolveRoot` function; --root threaded through CLIs | VERIFIED | Exports `resolveRoot(argv, env)` at line 32; strips `--root <dir>` pair from returned `rest`; fallback chain: arg > `PIPELINE_ROOT` env > `DEFAULT_ROOT` |
| `pipeline/src/stations-list.ts` | `enumerateStations`, `toAggregateSpec` for full_backfill | VERIFIED | Exports both functions; `toAggregateSpec` maps sj→`aws:<id>`, sk→`synop:<id>`, returns null for ur/vf |
| `pipeline/src/ship.ts` | `SHIP_OUTPUTS`, `copyShipSet`; raw/ excluded | VERIFIED | `SHIP_OUTPUTS = ["derived","stations.json","manifest.json"]`; `copyShipSet` only walks those names; `raw` never appears in copy logic |
| `.github/workflows/nightly.yml` | Off-peak cron, full_backfill dispatch, concurrency, permissions, test gate, skip-empty, heartbeat, deploy-pages@v4 | VERIFIED | All required properties present and confirmed by `workflow.test.ts` (40 test files pass) |
| `.github/workflows/squash-reset.yml` | Force-push scoped to data, branch-asserted, never main, contents:write only | VERIFIED | Branch assertion on line 50; `git push --force origin data` is sole force-push; no `pages`/`id-token` permissions |
| `PIPELINE.md` | §8 documents prerequisites, cron, full_backfill, heartbeat, squash cadence | VERIFIED | Section "## 8. Nightly automation (Phase 8)" present; contains `GitHub Actions`, `full_backfill`, `HEARTBEAT_URL`, `37 4`, `squash-reset`, `data-wt` |
| `pipeline/test/backfill.test.ts` | Multi-year-gap self-heal case | VERIFIED | `describe("DATA-03 self-heal…")` asserts `fetchedYears` = [2021,2022,2023,2024] when high-water=2020, nowYear=2024 |
| `pipeline/test/workflow.test.ts` | YAML parse + key-assertion gate over nightly.yml | VERIFIED | Asserts cron `37 4`, full_backfill boolean, cancel-in-progress:false, contents/pages/id-token:write, test-gate-before-push ordering, `--root ./data-wt` ≥2 occurrences, skip-empty outputs, no push to main, no `--force`, heartbeat guarded + `\|\| true`, deploy-pages@v4 |
| `pipeline/test/squash-workflow.test.ts` | Force-push scoping gate | VERIFIED | Asserts branch-assertion-before-force-push ordering; only `git push --force origin data`; no `main` reference; no pages/id-token |
| `pipeline/test/ship.test.ts` | raw/ excluded, ship-set present | VERIFIED | Test exists and passes (part of 353-test green suite) |
| `pipeline/test/stations-list.test.ts` | Type mapping + mocked enumerate | VERIFIED | Tests pass: sj→aws, sk→synop, ur/vf→null, enumerate filter |
| `pipeline/test/root-flag.test.ts` | resolveRoot extracts --root, env fallback, default | VERIFIED | Tests pass as part of full suite |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `backfill.ts main()` | `rawstore.ts resolveRoot` | `const { root, rest } = resolveRoot(argv)` | WIRED | `grep -n "resolveRoot" backfill.ts` → line 141 import, line 144 call |
| `aggregate.ts main()` | `rawstore.ts resolveRoot` | `const { root, rest } = resolveRoot(argv)` | WIRED | `grep -n "resolveRoot" aggregate.ts` → lines 47, 246 |
| `nightly.yml ingest step` | `pipeline --root ./data-wt` | `npm run backfill -- --root ./data-wt` and `npm run aggregate -- --root ./data-wt` | WIRED | 2+ occurrences of `--root ./data-wt` confirmed; workflow.test.ts asserts this |
| `nightly.yml deploy job` | `actions/deploy-pages@v4` | `upload-pages-artifact@v3` then `deploy-pages@v4` | WIRED | Both actions present; environment `github-pages` configured |
| `squash-reset.yml` | `git push --force origin data` | Branch assertion `test "$(git rev-parse --abbrev-ref HEAD)" = "data"` before force-push | WIRED | Assertion line 50, force-push line 64; squash-workflow.test.ts asserts ordering |
| `ship.ts copyShipSet` | Excludes `raw/` | Only walks `SHIP_OUTPUTS` which never contains `raw` | WIRED | `SHIP_OUTPUTS = ["derived","stations.json","manifest.json"]`; raw not in list |

---

### Data-Flow Trace (Level 4)

Not applicable — Phase 8 delivers workflow orchestration, CLI helpers, and tests, not UI components rendering dynamic data. The UI freshness path was established in Phase 7.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite passes | `npx vitest run` | 40 test files, 353 passed, 3 skipped, 0 failed | PASS |
| Pipeline typecheck clean | `npx tsc -p pipeline/tsconfig.json --noEmit` | 0 errors | PASS |
| Site typecheck clean | `npx tsc -p site/tsconfig.json --noEmit` | 0 errors | PASS |
| nightly.yml off-peak cron | `grep -c '37 4 \* \* \*' nightly.yml` | 2 (schedule + comment) | PASS |
| nightly.yml no --force | `grep -v '^\s*#' nightly.yml \| grep '\-\-force' \| wc -l` | 0 | PASS |
| squash-reset.yml branch assertion present | `grep -c 'abbrev-ref HEAD' squash-reset.yml` | 1 | PASS |
| squash-reset.yml force-push scoped to data | `grep -c 'push --force origin data' squash-reset.yml` | 1 | PASS |
| PIPELINE.md §8 present | `grep -c '## 8' PIPELINE.md` | 1 | PASS |

---

### Probe Execution

No probe scripts declared or discovered for this phase. The workflow YAML is validated by `pipeline/test/workflow.test.ts` and `pipeline/test/squash-workflow.test.ts` (both pass). The real scheduled cron and Pages deploy are documented post-push prerequisites (two human one-time setup steps: push repo to GitHub + set Pages source = GitHub Actions), which is correct-by-design per the PLAN `user_setup` block and PIPELINE.md §8(a).

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| DATA-03 | 08-01, 08-02, 08-03 | Nightly GitHub Actions cron appends observations idempotently (upsert by station+date, gap-fill on missed runs, safe to re-run, off-peak schedule) | SATISFIED | `nightly.yml` cron `37 4 * * *`; `resolveRoot` root-collision fix; `backfillStation` high-water resume; self-heal test proves multi-year gap-fill; `squash-reset.yml` bounds repo growth; all four ROADMAP success criteria verified |

---

### Anti-Patterns Found

Scanned all Phase 8 modified files: `rawstore.ts`, `backfill.ts`, `aggregate.ts`, `stations-list.ts`, `ship.ts`, `.github/workflows/nightly.yml`, `.github/workflows/squash-reset.yml`, `PIPELINE.md`, and all new test files.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No TBD/FIXME/XXX markers found | — | — |
| — | — | No unresolved stub patterns found | — | — |

The `full_backfill` branch in `nightly.yml` (lines 76–79) does not yet enumerate the full national station set at runtime (it falls back to the same seed stations as the incremental path). This is intentional and documented: PLAN 08-01 Task 2 explicitly states "Wire-only this phase (not run)" and PIPELINE.md §8(c) documents the one-command seed as an operator-triggered action. Not a gap.

---

### Human Verification Required

None. Per the user directive, the real scheduled cron and Pages deploy are correct-by-design post-push prerequisites. All logic, YAML, and test correctness is verifiable locally (and was verified). No human checks required.

---

### Summary

Phase 8 goal is fully achieved. All four ROADMAP success criteria are verified against actual code:

1. **Self-healing idempotent ingest** — `resolveRoot` closes the data-dir/data-branch collision; `backfillStation` resumes from `highWaterYear+1`; the multi-year-gap test in `backfill.test.ts` proves the gap-fill spans the whole missed range.

2. **On new data: aggregate → commit → build → deploy** — `nightly.yml` executes the full pipeline with touched-only aggregate, skip-empty commit guard, `copyShipSet` staging (raw/ excluded), `vite build`, and `deploy-pages@v4`.

3. **Off-peak + heartbeat + UI freshness** — Cron `37 4 * * *`; heartbeat guarded on non-empty secret + `|| true`; Phase 7 freshness panel reads manifest `lastFetched`.

4. **Bounded repo growth** — `squash-reset.yml` asserts branch=data before the only force-push; skip-empty prevents empty commits; `squash-workflow.test.ts` gates the safety invariants.

Full test suite: **353 passed, 3 skipped, 0 failed** across 40 test files. TypeScript: **0 errors** on both pipeline and site. Zero new npm dependencies introduced. Zero unreferenced debt markers.

---

_Verified: 2026-07-21T07:00:00Z_
_Verifier: Claude (gsd-verifier)_
