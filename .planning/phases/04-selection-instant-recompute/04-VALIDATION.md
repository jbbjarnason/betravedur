---
phase: 4
slug: selection-instant-recompute
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-20
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.10 (unit) + @playwright/test 1.61.1 (E2E on preview build) |
| **Config file** | `vitest.config.ts` (root) + `site/playwright.config.ts` (exists) |
| **Quick run command** | `npx vitest run --changed` |
| **Full suite command** | `npx vitest run` |
| **E2E command** | `npm run e2e -w site` (drives `vite preview` production build) |
| **Estimated runtime** | unit ~20s; E2E ~40–70s (Chromium) |

---

## Sampling Rate

- **After every task commit:** `npx vitest run --changed`
- **After every plan wave:** `npx vitest run`
- **Before phase verification:** full unit suite green AND `npm run e2e -w site` green (incl. the no-network-on-recompute assertion + URL round-trip restore)
- **Max feedback latency:** 30s unit; E2E gates at wave close

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| (filled by planner) | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Selection store module + its unit test (state↔URL round-trip, loop-prevention)
- [ ] `computeMarkerDatum` yearRange param + updated unit tests (honest-N within picked range)
- [ ] `window.__store` exposed in main.ts (mirrors `window.__map`) so E2E can drive selection deterministically
- [ ] Playwright specs: selectors render, no-network recompute (request interception), URL param presence + crafted-URL restore

---

## Manual-Only Verifications

Per the no-review directive these are Claude `auto` tasks (run command, inspect screenshot, evidence in SUMMARY) — NOT human checkpoints.

| Behavior | Requirement | Why "Manual" | Test Instructions |
|----------|-------------|------------|-------------------|
| Scrubber + controls legible over the map, don't occlude Iceland | SEL-01/UX | Visual judgement | Playwright screenshot at default + after selection change; Claude inspects, evidence in SUMMARY |
| Markers visibly recompute on selection change | SEL-04 | Visual confirmation | Before/after screenshots on year-range change; Claude confirms marker values changed |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] E2E gates on production preview build, incl. no-network + URL-restore assertions
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
