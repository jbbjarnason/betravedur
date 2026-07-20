---
phase: 4
slug: selection-instant-recompute
status: draft
nyquist_compliant: true
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
| 04-01-T1 | 01 | 1 | SEL-01 | unit | `npx vitest run site/src/state/store.test.ts site/src/data/window.test.ts` | ⬜ pending |
| 04-01-T2 | 01 | 1 | SEL-02, SEL-03 | unit | `npx vitest run site/src/data/averages.test.ts` | ⬜ pending |
| 04-01-T3 | 01 | 1 | SEL-04 | unit + build | `npx vitest run site/src/state/recompute.test.ts && npm run build -w site` | ⬜ pending |
| 04-02-T1 | 02 | 2 | SEL-01, SEL-02 | unit | `npx vitest run site/src/ui/scrubber.test.ts` (+ `grep -c var(--accent) controls.css` = 0) | ⬜ pending |
| 04-02-T2 | 02 | 2 | SEL-01/02/03 | build | `npm run build -w site` | ⬜ pending |
| 04-02-T3 | 02 | 2 | SEL-04 | E2E | `cd site && npm run e2e -- selection.spec.ts` (controls render, recompute-visible, no-network, narrow stepper) | ⬜ pending |
| 04-03-T1 | 03 | 3 | UX-02, SEL-02 | unit | `npx vitest run site/src/state/url.test.ts site/src/state/defaults.test.ts` | ⬜ pending |
| 04-03-T2 | 03 | 3 | UX-02 | build | `npm run build -w site` | ⬜ pending |
| 04-03-T3 | 03 | 3 | UX-02 | E2E | `cd site && npm run e2e -- selection.spec.ts` (crafted-URL restore, default-no-params, back-button, no-reload) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Selection store module + its unit test (state↔URL round-trip, loop-prevention) — `store.test.ts` (04-01-T1), `url.test.ts` (04-03-T1)
- [ ] `computeMarkerDatum` yearRange param + updated unit tests (honest-N within picked range) — `averages.test.ts` (04-01-T2)
- [ ] `window.__store` exposed in main.ts (mirrors `window.__map`) so E2E can drive selection deterministically — 04-01-T3
- [ ] Playwright specs: selectors render, no-network recompute (request interception), URL param presence + crafted-URL restore — `selection.spec.ts` (04-02-T3, 04-03-T3)

---

## Manual-Only Verifications

Per the no-review directive these are Claude `auto` tasks (run command, inspect screenshot, evidence in SUMMARY) — NOT human checkpoints.

| Behavior | Requirement | Why "Manual" | Test Instructions |
|----------|-------------|------------|-------------------|
| Scrubber + controls legible over the map, don't occlude Iceland | SEL-01/UX | Visual judgement | Playwright screenshot at default + after selection change (04-02-T3); Claude inspects, evidence in 04-02-SUMMARY |
| Markers visibly recompute on selection change | SEL-04 | Visual confirmation | Before/after screenshots on year-range change (04-02-T3); Claude confirms marker values changed |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] E2E gates on production preview build, incl. no-network + URL-restore assertions
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
