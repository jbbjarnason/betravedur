---
phase: 2
slug: derived-data-pipeline-backfill
status: draft
nyquist_compliant: false
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
| (filled by planner) | | | | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Fixtures for multi-year station data (reuse/extend packages/fetch fixtures)
- [ ] Mandated round-trip test: raw daily rows → columnar derived encoding → decode → `groupBySeasonYear` output identical to direct domain-path output (incl. Dec→Jan wrap)
- [ ] Size-budget assertion test: derived encoding of fixture station-years ≤ 4KB/station-year (gzip)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real backfill run (subset) | DATA-02 | Live network, multi-minute | Run backfill CLI for 2-3 stations with full history; verify high-water marks, resume after interrupt, derived output sizes (self-verified per no-review directive, evidence in SUMMARY) |
| Data branch integrity | DATA-07 | Git side effects | Verify orphan `data` branch exists, main worktree undisturbed, squash-reset recipe works (evidence in SUMMARY) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
