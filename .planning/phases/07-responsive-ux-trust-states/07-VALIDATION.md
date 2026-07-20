---
phase: 7
slug: responsive-ux-trust-states
status: draft
nyquist_compliant: true
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
| 07-01-T1 freshness + bottomSheet pure helpers | 07-01 | 1 | UX-04, UX-03 | unit | `cd site && npx vitest run freshness bottomSheet` | ⬜ pending |
| 07-01-T2 UX-05 state renderers + 3 seams (loading/map-error/empty) | 07-01 | 1 | UX-05 | grep + tsc | `cd site && grep -q 'map.on("error"' src/map/init.ts && grep -Eq 'showLoading|hideLoading|showEmptyState' src/main.ts && npx tsc --noEmit -p .` | ⬜ pending |
| 07-01-T3 Wave-0 E2E skeletons (states active; responsive/info fixmes) | 07-01 | 1 | UX-05 | E2E | `cd site && npx playwright test states responsive info -x` | ⬜ pending |
| 07-02-T1 infoPanel dialog + ATTRIBUTION + freshness (pure builder) | 07-02 | 2 | UX-04 | unit | `cd site && npx vitest run infoPanel` | ⬜ pending |
| 07-02-T2 wire info panel + attribution-solve-once + activate E2E | 07-02 | 2 | UX-04 | E2E + grep | `cd site && grep -q attrib-safe-bottom src/styles/controls.css && ! grep -Eq 60vw src/styles/controls.css && npx playwright test info shell -x` | ⬜ pending |
| 07-03-T1 attachSheet Pointer-Events controller + sheet CSS | 07-03 | 3 | UX-03 | unit + grep | `cd site && npx vitest run bottomSheet && grep -q setPointerCapture src/ui/bottomSheet.ts && grep -q translateY src/styles/panel.css` | ⬜ pending |
| 07-03-T2 wire sheet + mobile chips + attribution reflow + activate E2E | 07-03 | 3 | UX-03 | E2E | `cd site && npx playwright test responsive -x` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**UI-SPEC criterion → test coverage (both viewports 1280 + 390 unless noted):**

| Criterion | Covered by | Plan |
|-----------|------------|------|
| 1 mobile sheet vs desktop side panel | responsive.spec | 07-03 |
| 2 map pannable with sheet open (390) | responsive.spec | 07-03 |
| 3 no horizontal overflow (390) | responsive.spec | 07-03 |
| 4 touch targets ≥44px (390) | responsive.spec | 07-03 |
| 5 chips on mobile | responsive.spec | 07-03 |
| 6 info button opens panel (both) | info.spec | 07-02 |
| 7 first-visit auto-open once | info.spec | 07-02 |
| 8 permalink not blocked | info.spec | 07-02 |
| 9 freshness not hardcoded | info.spec + freshness.test | 07-01/07-02 |
| 10 attribution legible + panel open (desktop) | shell.spec | 07-02 |
| 11 attribution legible + sheet open (mobile) | responsive.spec | 07-03 |
| 12 no legacy attribution hacks (grep) | shell.spec / grep gate | 07-02 |
| 13 initial loading affordance | states.spec | 07-01 |
| 14 map-load error (route-abort pmtiles) | states.spec | 07-01 |
| 15 empty stations (route-fulfill []) | states.spec | 07-01 |
| 16 no-data non-regression | panel.spec / score.spec (existing) | 07-01 (verify) |
| 17 sheet Escape + keyboard | responsive.spec | 07-03 |
| 18 info panel Escape/focus | info.spec | 07-02 |
| 19 reduced motion | responsive.spec / info.spec | 07-02/07-03 |

---

## Wave 0 Requirements

- [ ] freshness helper: derive newest data date from manifest `max(lastFetched)` client-side (NO pipeline/manifest change, NO determinism break) + Icelandic date format (verify Intl is-IS in headless; hand-roll month array if it falls back — like the Phase 6 NumberFormat gap). Unit-tested (incl. missing/empty → omit, never "Invalid Date"). — **Plan 07-01 Task 1**
- [ ] matchMedia(640px) responsive-mode signal + snap-nearest pure helper + attachSheet stub (drag controller filled in Plan 07-03). — **Plan 07-01 Task 1**
- [ ] responsive.spec / info.spec / states.spec Playwright skeletons at 1280 + 390 (states active; responsive/info fixmes activated in Plans 02/03). — **Plan 07-01 Task 3**

---

## Manual-Only Verifications

Per the no-review directive these are Claude `auto` tasks (run command, inspect screenshot at BOTH viewports, evidence in SUMMARY) — NOT human checkpoints.

| Behavior | Requirement | Why "Manual" | Test Instructions |
|----------|-------------|------------|-------------------|
| Bottom sheet drags peek↔expanded, map pannable above, chrome coexists | UX-03 | Visual/interaction judgement | Playwright mobile (390) screenshots peek + expanded; Claude confirms drag + map visible + no overflow; evidence in SUMMARY (Plan 07-03) |
| Attribution legible in ALL states both sizes | UX-04 | Licensing/visual | Screenshots desktop+mobile, panel open+closed; Claude confirms CC BY 4.0/OSM findable (compact control + info-panel credit) (Plans 07-02/07-03) |
| Info/trust panel frames historical-not-forecast | UX-04 | Content/visual | Screenshot info panel open; Claude confirms "ekki spá" prominent + attribution + uppfært date (Plan 07-02) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] tsc stays 0 errors; no new runtime deps; E2E at BOTH viewports; no prior-phase regression
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
