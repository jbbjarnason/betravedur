---
phase: 5
slug: score-coloring-ranking
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-20
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.10 (unit) + @playwright/test 1.61.1 (E2E on preview build) |
| **Config file** | `vitest.config.ts` (root) + `site/playwright.config.ts` (exists) |
| **Quick run command** | `npx vitest run --changed` |
| **Full suite command** | `npx vitest run` |
| **E2E command** | `npm run e2e -w site` (full suite: shell + markers + selection + score specs) |
| **Estimated runtime** | unit ~20s; E2E ~50–80s (Chromium) |

---

## Sampling Rate

- **After every task commit:** `npx vitest run --changed`
- **After every plan wave:** `npx vitest run`
- **Before phase verification:** full unit suite green AND `npm run e2e -w site` green (whole suite, no regressions to Phase 3/4 specs)
- **Max feedback latency:** 30s unit; E2E gates at wave close

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| (filled by planner) | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] **Data-layer score extension** (load-bearing): computeMarkerDatum derives rain-total mm + calls domain component curves + combine() → `MarkerDatum.score: number|null` + missingRain/contributing surfaced. Rain-unit pinning unit test (mm, not boolean).
- [ ] score→color unit test (BuGn boundaries 0/5/10, null → muted/off-scale)
- [ ] ranked-sort unit test (desc, tie-stability, score:null excluded)
- [ ] Playwright score.spec skeleton (marker color present + changes with selection, legend, explainer expand, list order desc, row-click fly/select, ófullnægjandi absent)

---

## Manual-Only Verifications

Per the no-review directive these are Claude `auto` tasks (run command, inspect screenshot, evidence in SUMMARY) — NOT human checkpoints.

| Behavior | Requirement | Why "Manual" | Test Instructions |
|----------|-------------|------------|-------------------|
| Score colors read as "good=green", legible on basemap, colorblind-safe | MAP-03 | Visual judgement | Playwright screenshot; Claude inspects ramp legibility + that color is not sole channel (numeric present), evidence in SUMMARY |
| Ranked list + legend coexist with control bar without occluding Iceland | SCORE-02 | Layout judgement | Screenshot desktop + narrow; Claude confirms no collision, evidence in SUMMARY |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (score field is the gating Wave 0 item)
- [ ] No watch-mode flags
- [ ] E2E gates on production preview build; no Phase 3/4 spec regressions
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
