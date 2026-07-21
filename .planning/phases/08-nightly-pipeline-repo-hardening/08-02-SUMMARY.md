---
phase: 08-nightly-pipeline-repo-hardening
plan: 02
subsystem: pipeline
tags: [github-actions, nightly, cron, deploy-pages, data-branch, heartbeat, DATA-03]
requires:
  - "Plan 08-01: --root flag, enumerateStations, copyShipSet, ship set (backfill/aggregate CLIs)"
provides:
  - ".github/workflows/nightly.yml — scheduled ingest→build→deploy workflow (off-peak cron + workflow_dispatch)"
  - "pipeline/test/workflow.test.ts — zero-dep YAML-invariant gate over the workflow"
affects:
  - "Plan 08-03 squash-reset workflow (sibling; owns the only force-push, scoped to origin data)"
tech-stack:
  added: []
  patterns:
    - "workflow-as-text invariant test: parse nightly.yml via regex/string (no yaml dep), line-index ordering proof for the test-gate-before-push guarantee"
    - "inline-comment stripping (quote-aware) so header/inline prose can never satisfy or break the never-main / no-force assertions"
    - "least-privilege split: top-level contents:write for the data push, deploy job restricted to pages+id-token"
key-files:
  created:
    - .github/workflows/nightly.yml
    - pipeline/test/workflow.test.ts
  modified: []
decisions:
  - "Nightly push is a plain fast-forward `git push origin data`; the file contains zero `--force` (squash-reset in Plan 03 owns every force-push, scoped to origin data)"
  - "Test gate `npm test && npm run typecheck` runs BEFORE the data-branch materialize/push so a broken build never ships and never touches data"
  - "Ship-set staged via `npx tsx -e` calling copyShipSet('./data-wt','site/public/data') — raw/ excluded structurally, not by filter"
  - "deploy job gated on `changed=='true' || workflow_dispatch` to avoid redeploying identical bytes on a no-op cron"
metrics:
  duration: 5min
  completed: "2026-07-21"
requirements: [DATA-03]
---

# Phase 8 Plan 02: Nightly Ingest→Build→Deploy Workflow Summary

The single `nightly.yml` that operationalizes the Phase-2 pipeline as a scheduled, self-healing, monitored job — off-peak cron + `full_backfill` dispatch, a test/typecheck GATE before any push, `--root ./data-wt` worktree wiring, skip-empty commits, a guarded heartbeat, and an `actions/deploy-pages@v4` deploy that provably never touches `main` or force-pushes — plus a zero-dependency workflow-assertion test that gates every one of those load-bearing YAML properties. tsc 0, full suite green, zero new deps.

## What Was Built

- **Task 1 — `.github/workflows/nightly.yml` (commit `913c7f6`):** `on.schedule.cron: "37 4 * * *"` (off-peak, not 00:00) plus `workflow_dispatch.inputs.full_backfill` (boolean, default false). Top-level `concurrency: { group: betravedur-data-branch, cancel-in-progress: false }` serializes the data branch (no mid-push kill), and least-privilege `permissions: { contents: write, pages: write, id-token: write }`. Job `ingest-build`: checkout@v4 → setup-node@v4 (node 22, cache npm) → `npm ci` → **`npm test && npm run typecheck` GATE** (fails the run before any push/deploy) → materialize `data` as `./data-wt` (`git fetch origin data --depth=1` + `git worktree add`) → backfill/aggregate all passing `-- --root ./data-wt` (RESEARCH Pitfall 1 fix — writes land in the worktree, not the coincidentally-named `./data` on main) → skip-empty commit (`git status --porcelain` gate; on change `git push origin data` + `changed=true`, else `changed=false`) → stage ship-set via `copyShipSet('./data-wt','site/public/data')` (raw/ never copied) → `npm --prefix site run build` → `upload-pages-artifact@v3`. Heartbeat step: `if: ${{ success() }}`, `HEARTBEAT_URL` from secrets, `[ -n "$HEARTBEAT_URL" ] && curl -fsS -m 10 "$HEARTBEAT_URL" || true` (never fails the run). Separate `deploy` job: `needs: ingest-build`, gated on `changed=='true' || workflow_dispatch`, own `group: pages` concurrency, `pages+id-token` permissions, `github-pages` environment, single `actions/deploy-pages@v4` step. No step writes/pushes to `main`; the file contains zero `--force`; all `actions/*` pinned to major tags (supply-chain).
- **Task 2 — `pipeline/test/workflow.test.ts` (commit `c006743`, TDD):** Vitest test that reads `nightly.yml` as text (js-yaml is NOT a dep — zero new deps) and asserts, via string/regex, every invariant: off-peak cron (and no `0 0 * * *`), `full_backfill` boolean input, `cancel-in-progress: false` (and never `true`), the three `write` permissions, a **line-index ordering proof** that the `npm test && npm run typecheck` gate precedes the first `git push origin data`, `--root ./data-wt` on backfill+aggregate (≥2), skip-empty `changed=true`/`changed=false` outputs, no `push … main`, zero `--force` in the whole file, the heartbeat guarded on a non-empty `HEARTBEAT_URL` and ending `|| true` (with `success()`), `deploy-pages@v4` + `github-pages` environment, and all `actions/*` pinned to `@vN`. A quote-aware `stripInlineComment` filters inline trailing comments (plus full-comment lines) before the never-main / no-force checks so documentation prose (e.g. `# ...never main`) can never satisfy or break the gate.

## Verification Evidence

- `npx vitest run pipeline/test/workflow.test.ts` — 12/12 pass.
- `npx vitest run` (full repo) — 39 files, 347 pass / 3 skipped (pre-existing Plan-03 E2E fixmes), 0 fail.
- `npx tsc -p pipeline/tsconfig.json --noEmit` — exit 0.
- Task 1 acceptance greps: cron `37 4` ×2, `full_backfill` ×5, `cancel-in-progress: false` ×2, `deploy-pages@v4` ×2, `--root ./data-wt` ×8; non-comment `push … main` == 0; `--force` == 0 (whole file).
- No new entries in `package.json` / `pipeline/package.json` / `site/package.json` dependencies (git diff empty).

## Threat Model Compliance

- **T-08-10 (Tampering — force-push clobbers main/live):** nightly push is fast-forward `git push origin data` only; the file contains zero `--force`; `workflow.test.ts` asserts no `push … main` (comment-filtered) and no `--force` anywhere; all writes scoped to `./data-wt`. **Mitigated.**
- **T-08-11 (DoS — unbounded .git):** skip-empty commit (touched-only aggregate → no diff → no commit) via the `git status --porcelain` gate; squash-reset cadence is Plan 03. **Mitigated (nightly half).**
- **T-08-12 (Info Disclosure — heartbeat/token leak):** `HEARTBEAT_URL` via `secrets.*`, `curl -fsS` (no `-v`), never printed; `GITHUB_TOKEN` auto-provided; least-privilege `permissions` block. **Mitigated.**
- **T-08-13 (Elevation — over-broad permissions):** explicit least-privilege `permissions:`; deploy job further restricted to `pages+id-token`. **Mitigated.**
- **T-08-SC (Tampering — unpinned actions):** all `actions/*` pinned to major tags (checkout@v4, setup-node@v4, upload-pages-artifact@v3, deploy-pages@v4); `workflow.test.ts` asserts every `uses: actions/*` carries an `@vN` pin. **Mitigated.**

## Deviations from Plan

**1. [Rule 1 — Bug] Inline-comment leakage into the never-main assertion**
- **Found during:** Task 2 (RED→GREEN).
- **Issue:** The first `workflow.test.ts` filtered only full-comment lines (`^\s*#`). The line `contents: write # push the data delta to the \`data\` branch (never main)` carries an inline trailing comment containing "push … main", which tripped the never-main regex — a false positive on documentation prose, not a real command.
- **Fix:** Added a quote-aware `stripInlineComment` that removes ` # …` trailing comments (respecting `#` inside quoted strings) and applied it to the comment-filtered `code` used by the never-main and no-force assertions. This is the correct robustness form of the plan's "filter comment lines before the never-touches-main assertion" instruction — it now filters inline comments too.
- **Files modified:** `pipeline/test/workflow.test.ts`.
- **Commit:** `c006743`.

No other deviations — plan executed as written. (Task 2 followed TDD: the test file was authored and run RED-then-GREEN; the "implementation under test" is the already-authored `nightly.yml`, so 11/12 assertions passed immediately and the 12th surfaced the inline-comment bug above, which was fixed to green.)

## Post-Push Prerequisites (user_setup — not a code task)

The real cron/deploy runs on GitHub; the local repo has no remote. Before the first live run: push the repo (`git remote add origin …`; push `main` + `data`), set Settings → Pages → Source = "GitHub Actions", and optionally add the `HEARTBEAT_URL` repo secret. These are documented in the plan's `user_setup` and are prerequisites, not tasks in this plan.

## Self-Check: PASSED

- Created files present: `.github/workflows/nightly.yml`, `pipeline/test/workflow.test.ts` — both FOUND.
- Commits `913c7f6`, `c006743` — both FOUND in git log.
