---
phase: 8
slug: nightly-pipeline-repo-hardening
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-21
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.10 (pipeline logic) + workflow YAML parse/key-assertion tests (zero-dep text/regex) |
| **Config file** | `vitest.config.ts` (root) |
| **Quick run command** | `npx vitest run --changed` |
| **Full suite command** | `npx vitest run` |
| **Typecheck gate** | `npx tsc -p pipeline/tsconfig.json --noEmit` (0 errors) |
| **Workflow validation** | YAML parse + assert required keys (cron off-peak, workflow_dispatch full_backfill, concurrency cancel-in-progress:false, permissions contents/pages/id-token, test-gate-before-deploy, --root wiring, skip-empty, heartbeat guarded, deploy-pages@v4, force-push scoped to data / never main) |
| **Estimated runtime** | unit ~25s |

---

## Sampling Rate

- **After every task commit:** `npx vitest run --changed`
- **After every plan wave:** `npx vitest run` + tsc 0 errors
- **Before phase verification:** full unit suite green, tsc 0 errors, workflow YAML valid + key-assertions pass, site build clean. NOTE: the real cron/deploy runs post-merge on GitHub (requires the repo pushed + Pages=Actions — documented prereqs); validate the LOGIC + YAML here, not a live cron.
- **Max feedback latency:** 30s

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| P01-T1 root-collision `--root` flag | 08-01 | 1 | DATA-03 | unit | `npx vitest run pipeline/test/root-flag.test.ts && npx tsc -p pipeline/tsconfig.json --noEmit` | ⬜ pending |
| P01-T2 self-heal gap + enumerate | 08-01 | 1 | DATA-03 | unit | `npx vitest run pipeline/test/backfill.test.ts pipeline/test/stations-list.test.ts` | ⬜ pending |
| P01-T3 ship-set copy (no raw/) | 08-01 | 1 | DATA-03 | unit | `npx vitest run pipeline/test/ship.test.ts && npx tsc -p pipeline/tsconfig.json --noEmit` | ⬜ pending |
| P02-T1 author nightly.yml | 08-02 | 2 | DATA-03 | lint/assert | `node -e "…cron/deploy/never-main asserts…"` (see plan) | ⬜ pending |
| P02-T2 workflow-assertion test | 08-02 | 2 | DATA-03 | assert | `npx vitest run pipeline/test/workflow.test.ts` | ⬜ pending |
| P03-T1 squash-reset.yml | 08-03 | 2 | DATA-03 | lint/assert | `node -e "…scoped force-push / branch assertion / never-main…"` (see plan) | ⬜ pending |
| P03-T2 PIPELINE.md prereqs + cadence | 08-03 | 2 | DATA-03 | assert | `node -e "…GitHub Actions/full_backfill/HEARTBEAT_URL/37 4/squash-reset/data-wt…"` | ⬜ pending |
| P03-T3 force-push-scoping gate | 08-03 | 2 | DATA-03 | assert | `npx vitest run pipeline/test/squash-workflow.test.ts` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### DATA-03 Success-Criterion → Test coverage

| ROADMAP Success Criterion | Covered by |
|---------------------------|-----------|
| 1. Nightly incremental + idempotent + self-heal a missed night | P01-T2 (self-heal multi-year gap); rawstore/aggregate idempotency (Phase 2, still green); P02-T2 (cron+dispatch+resume wiring asserts) |
| 2. On new data: aggregate touched → commit data → build → deploy | P02-T1/T2 (touched-only aggregate step, skip-empty commit, upload-artifact + deploy-pages@v4); P01-T3 (ship-set staged into build, raw/ excluded) |
| 3. Off-peak + heartbeat + UI freshness | P02-T2 (cron `37 4`, heartbeat guarded + `|| true`); UI freshness already reads manifest max(lastFetched) (Phase 7) and auto-updates on commit |
| 4. Bounded .git (partition + squash strategy) | P03-T1/T3 (squash-reset scoped to data, branch-asserted); P02-T2 (skip-empty = no empty commits); P03-T2 (documented cadence) |

---

## Wave 0 Requirements

- [x] **The data-dir-vs-branch collision fix** (research #1 risk): Plan 08-01 Task 1 adds `--root` to backfill/rawstore/aggregate CLIs (`resolveRoot`), unit-tested in `root-flag.test.ts`.
- [x] Nightly pipeline orchestration logic (incremental-from-high-water vs full_backfill; skip-empty; touched-only) — self-heal tested (P01-T2), enumeration helper (P01-T2), ship-set (P01-T3); wired into nightly.yml (P02) and asserted by workflow.test.
- [x] Workflow YAML validation test: P02-T2 (`workflow.test.ts`) asserts cron off-peak + full_backfill + concurrency + permissions + test-gate-before-deploy + skip-empty + heartbeat-guarded + push-scoped-to-data + never-force/never-main; P03-T3 (`squash-workflow.test.ts`) asserts the scoped force-push.

---

## Manual-Only Verifications

Per the no-review directive these are Claude `auto` tasks (run command, inspect output, evidence in SUMMARY) — NOT human checkpoints. The actual scheduled cron + Pages deploy run on GitHub post-push (documented prereqs), out of local scope.

| Behavior | Requirement | Why "Manual" | Test Instructions |
|----------|-------------|------------|-------------------|
| Pipeline incremental run appends only new days, skip-empty on no data | DATA-03 | Integration over the data worktree | Run backfill+aggregate with `--root ./data-wt` locally; confirm high-water advance, no empty commit on no-change; evidence in SUMMARY |
| Squash-reset keeps .git bounded, force-push scoped to data only | DATA-03 | Git side effects | Demonstrate squash-reset on the data branch locally (as Phase 2 did); confirm main untouched; evidence in SUMMARY |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (root-collision fix gates the workflow)
- [x] No watch-mode flags
- [x] tsc stays 0 errors; no new runtime deps; workflow YAML validated; site build clean
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planner-filled 2026-07-21
