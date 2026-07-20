---
phase: 7
slug: responsive-ux-trust-states
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-20
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.10 (unit) + @playwright/test 1.61.1 (E2E on preview build, MULTI-VIEWPORT) |
| **Config file** | `vitest.config.ts` (root) + `site/playwright.config.ts` (exists) |
| **Quick run command** | `npx vitest run --changed` |
| **Full suite command** | `npx vitest run` |
| **Typecheck gate** | `npx tsc --noEmit -p site` (MUST stay 0 errors) |
| **E2E command** | `npm run e2e -w site` (full suite; new responsive.spec drives 1280 + 390 via setViewportSize) |
| **Estimated runtime** | unit ~25s; E2E ~70–100s (Chromium, both viewports) |

---

## Sampling Rate

- **After every task commit:** `npx vitest run --changed`
- **After every plan wave:** `npx vitest run` + `npx tsc --noEmit -p site` (0 errors)
- **Before phase verification:** full unit suite green, tsc 0 errors, AND `npm run e2e -w site` green at BOTH viewports (no prior-phase regression). Attribution-not-occluded re-asserted at 1280 + 390 with panel open before/after removing the old margin hacks.
- **Max feedback latency:** 30s unit; E2E gates at wave close

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| (filled by planner) | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] freshness helper: derive newest data date from manifest `max(lastFetched)` client-side (NO pipeline/manifest change, NO determinism break) + Icelandic date format (verify Intl is-IS in headless; hand-roll month array if it falls back — like the Phase 6 NumberFormat gap). Unit-tested (incl. missing/empty → omit, never "Invalid Date").
- [ ] matchMedia(640px) responsive-mode signal + bottom-sheet drag controller (pointer events) — unit/interaction-testable where feasible.
- [ ] responsive.spec Playwright skeleton at 1280 + 390 (bottom-sheet vs side-panel, map pannable at 390, info panel, first-visit, attribution-not-occluded both sizes, map-error, empty-stations).

---

## Manual-Only Verifications

Per the no-review directive these are Claude `auto` tasks (run command, inspect screenshot at BOTH viewports, evidence in SUMMARY) — NOT human checkpoints.

| Behavior | Requirement | Why "Manual" | Test Instructions |
|----------|-------------|------------|-------------------|
| Bottom sheet drags peek↔expanded, map pannable above, chrome coexists | UX-03 | Visual/interaction judgement | Playwright mobile (390) screenshots peek + expanded; Claude confirms drag + map visible + no overflow; evidence in SUMMARY |
| Attribution legible in ALL states both sizes | UX-04 | Licensing/visual | Screenshots desktop+mobile, panel open+closed; Claude confirms CC BY 4.0/OSM findable (compact control + info-panel credit) |
| Info/trust panel frames historical-not-forecast | UX-04 | Content/visual | Screenshot info panel open; Claude confirms "ekki spá" prominent + attribution + uppfært date |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] tsc stays 0 errors; no new runtime deps; E2E at BOTH viewports; no prior-phase regression
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
