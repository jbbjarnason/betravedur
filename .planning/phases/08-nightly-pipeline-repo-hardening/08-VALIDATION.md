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
| **Framework** | vitest 4.1.10 (pipeline logic) + workflow YAML lint/validation + shellcheck-style asserts |
| **Config file** | `vitest.config.ts` (root) |
| **Quick run command** | `npx vitest run --changed` |
| **Full suite command** | `npx vitest run` |
| **Typecheck gate** | `npx tsc --noEmit -p site && npx tsc --noEmit -p pipeline` (0 errors) |
| **Workflow validation** | YAML parse + assert required keys (cron, workflow_dispatch input, concurrency, permissions, deploy-pages, skip-empty, heartbeat-guarded, data-branch-only push) |
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
| (filled by planner) | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] **The data-dir-vs-branch collision fix** (research #1 risk): pipeline runs with an explicit root (cwd=./data-wt or a `--root` flag on backfill/rawstore/aggregate) so `rawstore.DEFAULT_ROOT="data"` doesn't write to the wrong place. Unit-tested (a `--root` run writes/reads the intended path).
- [ ] Nightly pipeline orchestration logic (incremental-from-high-water vs full_backfill flag; skip-empty when no new data; touched-only aggregate) — unit-tested against fixtures/the sample, NOT a live cron.
- [ ] Workflow YAML validation test: parses; has cron (off-peak, not 00:00) + workflow_dispatch full_backfill input + concurrency group + correct permissions (contents:write data, pages:write, id-token) + npm test gate before deploy + skip-empty + heartbeat guarded (never fails run) + push scoped to data branch only.

---

## Manual-Only Verifications

Per the no-review directive these are Claude `auto` tasks (run command, inspect output, evidence in SUMMARY) — NOT human checkpoints. The actual scheduled cron + Pages deploy run on GitHub post-push (documented prereqs), out of local scope.

| Behavior | Requirement | Why "Manual" | Test Instructions |
|----------|-------------|------------|-------------------|
| Pipeline incremental run appends only new days, skip-empty on no data | DATA-03 | Integration over the data worktree | Run the orchestration locally against ./data-wt in a dry/real mode; confirm high-water advance, no empty commit; evidence in SUMMARY |
| Squash-reset keeps .git bounded, force-push scoped to data only | DATA-03/07 | Git side effects | Demonstrate squash-reset on the data branch locally (as Phase 2 did); confirm main untouched; evidence in SUMMARY |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (root-collision fix gates the workflow)
- [ ] No watch-mode flags
- [ ] tsc stays 0 errors; no new runtime deps; workflow YAML validated; site build clean
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
