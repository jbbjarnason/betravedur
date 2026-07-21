---
phase: 08-nightly-pipeline-repo-hardening
plan: 03
subsystem: pipeline
tags: [ci, github-actions, squash-reset, force-push-scoping, repo-hardening, operator-docs, DATA-03]
requires:
  - "Plan 08-01 (--root ./data-wt CLIs, ship-set copy) — the worktree wiring the squash-reset reuses"
  - "Phase 2 PIPELINE.md §6 (orphan data branch + byte-identical squash-reset recipe, 02-04 E7)"
provides:
  - ".github/workflows/squash-reset.yml: manual/monthly squash-reset, force-push scoped to origin data with a branch assertion, contents:write only"
  - "PIPELINE.md §8: live prerequisites (push repo + Pages=Actions), nightly operation, full_backfill seed, HEARTBEAT_URL, squash cadence"
  - "pipeline/test/squash-workflow.test.ts: force-push-scoping gate (T-08-10)"
affects:
  - "First live nightly run (needs the two documented prerequisites); the data branch's .git growth bound"
tech-stack:
  added: []
  patterns:
    - "Branch-assertion-before-force-push: test abbrev-ref HEAD == data gates the only force-push"
    - "Force-push scoping proven by a text-parse gate test (no yaml dep), comment lines stripped so docs may mention main"
    - "Least-privilege CI: squash job carries contents:write only, no pages/id-token (never deploys)"
key-files:
  created:
    - .github/workflows/squash-reset.yml
    - pipeline/test/squash-workflow.test.ts
  modified:
    - PIPELINE.md
decisions:
  - "Squash-reset cadence = documented-manual (workflow_dispatch) recommended + optional monthly cron 17 5 1 * *; monthly bounds KB-scale nightly deltas"
  - "The gate test strips comment lines before asserting 'no main', so the safety-rationale comments may reference main while the executable body may not"
  - "squash-reset shares the betravedur-data-branch concurrency group so a squash never races a nightly push"
metrics:
  duration: 4min
  completed: "2026-07-21"
requirements: [DATA-03]
---

# Phase 8 Plan 03: Repo Hardening — Squash-Reset & Operator Docs Summary

An optional manual/monthly `squash-reset.yml` that bounds `.git` growth on the orphan `data` branch by force-pushing ONLY `origin data` after asserting the current branch IS `data` (never `main`, `contents: write` only), a PIPELINE.md §8 documenting the two live prerequisites plus nightly operation / `full_backfill` seed / heartbeat / squash cadence, and a text-parse gate test proving the force-push scoping. Zero new deps, tsc 0, full suite green.

## What Was Built

- **Task 1 — `squash-reset.yml` (commit `524ba31`):** `workflow_dispatch` + optional monthly `schedule` cron `17 5 1 * *`, single `ubuntu-latest` job, `permissions: contents: write` ONLY (no pages/id-token — it never deploys). Steps: `actions/checkout@v4`; materialize the `data` worktree (`git fetch origin data --depth=1`; `git worktree add ./data-wt data`); then INSIDE `./data-wt` run the Phase-2 squash recipe with the branch assertion `test "$(git rev-parse --abbrev-ref HEAD)" = "data"` BEFORE any force-push, whose only force-push is `git push --force origin data` (explicit ref). Shares the nightly `betravedur-data-branch` concurrency group (`cancel-in-progress: false`) so a squash never races a nightly push. A comment header states it is force-push-owned by the pipeline, data-only (RESEARCH Pitfall 3 / T-08-10). Never references `main` in the executable body.
- **Task 2 — PIPELINE.md §8 (commit `603bc85`):** Appended "## 8. Nightly automation (Phase 8)" covering (a) the two live PREREQUISITES — push the repo to GitHub (no remote exists locally; the `data` branch gets its first push from the workflow) and set Pages Source = "GitHub Actions"; (b) nightly operation — off-peak cron `37 4`, `--root ./data-wt` worktree wiring, high-water incremental self-heal, skip-empty commit, ship-set-only build; (c) the `full_backfill: true` one-command national seed; (d) monitoring — optional `HEARTBEAT_URL` graceful no-op + the 60-day auto-disable / nightly-commit-keepalive; (e) squash-reset cadence (documented-manual + optional monthly) with the force-push-scoped-to-data safety restated. **Resolved the Phase-2 "push-deferred-to-Phase-8" note** (now "owned by Phase 8", pointing at §8). Existing §1–§7 intact (7 headers verified present).
- **Task 3 — `squash-workflow.test.ts` gate (commit `1374be5`):** Reads `squash-reset.yml` as TEXT (no yaml dep), strips comment lines, and asserts the T-08-10 invariants structurally: the ONLY force-push is `git push --force origin data`; no `main` reference in the executable body; no other force-push target; the branch assertion (`rev-parse --abbrev-ref HEAD` == `data`) PRECEDES the force-push (line-index ordering check); permissions carry `contents: write` but NOT `pages`/`id-token`; checkout is pinned `@v4`. 6 tests green.

## Verification Evidence

- `npx vitest run pipeline/test/squash-workflow.test.ts` — 1 file, 6 tests pass.
- Task 1 acceptance: `push --force origin data` = 1, `abbrev-ref HEAD` = 1, non-comment `main` = 0, non-comment `pages:` = 0.
- Task 2 acceptance: `node` doc check passes (all of `GitHub Actions`, `full_backfill`, `HEARTBEAT_URL`, `37 4`, `squash-reset`, `data-wt` present); `## 8` = 1; remote/first-push mentions = 6; `## [1-7].` headers = 7.
- `npx vitest run` (full repo) — 40 files, 353 pass / 3 skipped (pre-existing E2E fixmes), 0 fail.
- `npm run typecheck` (domain + fetch + pipeline `tsc --noEmit`) — exit 0.
- No new entries in any `package.json` dependencies (git diff on the three package.json files empty).

## Threat Model Compliance

- **T-08-10 (Tampering — force-push clobbers main/live):** mitigated — branch assertion `abbrev-ref HEAD == data` gates the only force-push; force-push is the explicit `origin data` ref; `squash-workflow.test.ts` asserts no `main` reference and scoped ref with assertion-before-force-push ordering; shares the nightly concurrency group so no race.
- **T-08-11 (DoS — unbounded .git growth):** mitigated — documented squash-reset cadence + optional monthly automation; byte-identical-tree squash proven Phase 2 (02-04 E7).
- **T-08-14 (Elevation — over-privileged squash job):** mitigated — `permissions: contents: write` only (no pages/id-token); the gate test asserts their absence.
- **T-08-SC (Tampering — unpinned actions):** mitigated — `actions/checkout` pinned `@v4`; zero new npm deps.

## Deviations from Plan

None — plan executed exactly as written. Task 3 is nominally `tdd="true"`; because Task 1 already created `squash-reset.yml`, the gate test validated against the real artifact and passed on first run (GREEN) rather than a synthetic RED — the assertions are genuine safety invariants over the committed workflow, not tautologies (negative assertions on `main`/`--force`/`pages` would fail against a mis-scoped workflow).

## Self-Check: PASSED

- Created files present: `.github/workflows/squash-reset.yml`, `pipeline/test/squash-workflow.test.ts` — both FOUND.
- Modified file present: `PIPELINE.md` (§8 appended, push-deferred note resolved) — FOUND.
- Commits `524ba31`, `603bc85`, `1374be5` — all FOUND in git log.
