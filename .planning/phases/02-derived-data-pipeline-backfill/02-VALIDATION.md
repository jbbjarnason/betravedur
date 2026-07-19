---
phase: 2
slug: derived-data-pipeline-backfill
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-19
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.10 (existing root config) |
| **Config file** | `vitest.config.ts` (root, exists) |
| **Quick run command** | `npx vitest run --changed` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds (offline fixtures; live/backfill tests BETRA_LIVE-gated) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --changed`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite green, incl. the season-year round-trip test
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-T1 | 01 | 1 | DATA-04 | T-02-SC | pipeline workspace registered; zero new runtime deps | integration | `npm install && node -e "…workspaces.includes('pipeline')"` | ❌ Wave 0 | ⬜ pending |
| 02-01-T2 | 01 | 1 | DATA-04, DATA-07 | T-02-01, T-02-02 | round-trip season-year (incl. Dec→Jan wrap); null-preservation; ≤4KB/station-year gzip | unit (fixture) | `npx vitest run pipeline -t "round-trip"` · `-t "size budget"` · `-t "null"` | ❌ Wave 0 | ⬜ pending |
| 02-02-T1 | 02 | 2 | DATA-02 | T-02-03, T-02-06 | 413-halve / 502-retry / 503-never-empty / 404-empty; paced ≤4 req/s, no burst | unit (mock fetch) | `npx vitest run pipeline -t "backfill"` | ❌ Wave 0 | ⬜ pending |
| 02-02-T2 | 02 | 2 | DATA-07 | T-02-04, T-02-05 | field-pruned 10 fields; idempotent byte-identical upsert by (station,date); high-water resume | unit (tmp dir) | `npx vitest run pipeline -t "raw store"` | ❌ Wave 0 | ⬜ pending |
| 02-03-T1 | 03 | 2 | DATA-04, DATA-07 | T-02-08 | content hash stable; manifest hash changes iff derived bytes change (delta) | unit | `npx vitest run pipeline -t "manifest"` · `-t "content hash"` | ❌ Wave 0 | ⬜ pending |
| 02-03-T2 | 03 | 2 | DATA-04 | T-02-07, T-02-09 | stations.json from no-splice registry; filter ≥3 qualifying years (not `start`); keep decommissioned | unit | `npx vitest run pipeline -t "stations"` | ❌ Wave 0 | ⬜ pending |
| 02-04-T1 | 04 | 3 | DATA-02, DATA-04, DATA-07 | T-02-02 | full-chain raw→derived→decode→domain round-trip incl. wrap; touched-only re-derive; raw never shipped | integration (tmp store) | `npx vitest run pipeline -t "aggregate"` | ❌ Wave 0 | ⬜ pending |
| 02-04-T2 | 04 | 3 | DATA-02, DATA-07 | T-02-10, T-02-11, T-02-12 | orphan data branch (main undisturbed); real subset backfill resume/idempotency; squash-reset; PIPELINE.md | manual-self-verified + grep gate | `test -f PIPELINE.md && node -e "…grep policy keys"` (+ evidence in SUMMARY) | ❌ Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*All `❌ Wave 0` file-exists markers clear once 02-01 lands the `pipeline/` workspace, fixtures, and mock-error harness (the Wave 0 scaffolding).*

---

## Wave 0 Requirements

- [ ] `pipeline/` workspace: `package.json` (`@betravedur/pipeline`, deps domain+fetch), `tsconfig.json`, added to root `workspaces` + `vitest.config.ts include` — **Plan 01 Task 1**
- [ ] Fixtures for multi-year station data (AWS Keflavík #1350, SYNOP Reykjavík #1) committed under `pipeline/test/fixtures/`, reusing packages/fetch fixture row shape — **Plan 01 Task 2**
- [ ] Mock-fetch error-taxonomy fixtures (`error-413.json`/`error-502.json`/`error-503.json`) mirroring `error-404.json` — **Plan 02 Task 1**
- [ ] Mandated round-trip test: raw daily rows → columnar derived encoding → decode → `groupBySeasonYear` output identical to direct domain-path output (incl. Dec→Jan wrap) — **Plan 01 Task 2**, extended full-chain in **Plan 04 Task 1**
- [ ] Size-budget assertion test: derived encoding of fixture station-years ≤ 4KB/station-year (gzip) — **Plan 01 Task 2**

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real backfill run (subset) | DATA-02 | Live network, multi-minute | Run backfill CLI for 2-3 stations (incl. AWS #1350 + deep SYNOP #1) with full history; verify high-water marks advance, resume-after-interrupt fetches only newer years, byte-identical partitions, and record measured derived sizes (self-verified per no-review directive, evidence in **02-04-SUMMARY.md**) |
| Data branch integrity | DATA-07 | Git side effects | Verify orphan `data` branch exists, `main` worktree undisturbed, squash-reset recipe collapses history with working tree preserved (evidence in **02-04-SUMMARY.md**) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planner-signed 2026-07-19 (pending execution)
