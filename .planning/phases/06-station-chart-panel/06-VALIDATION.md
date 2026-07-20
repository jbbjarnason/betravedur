---
phase: 6
slug: station-chart-panel
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-20
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.10 (unit) + @playwright/test 1.61.1 (E2E on preview build) |
| **Config file** | `vitest.config.ts` (root) + `site/playwright.config.ts` (exists) |
| **Quick run command** | `npx vitest run --changed` |
| **Full suite command** | `npx vitest run` |
| **Typecheck gate** | `npx tsc --noEmit -p site` (MUST stay 0 errors — cleaned in Phase 5) |
| **E2E command** | `npm run e2e -w site` (full suite: shell + markers + selection + score + panel specs) |
| **Estimated runtime** | unit ~25s; E2E ~60–90s (Chromium) |

---

## Sampling Rate

- **After every task commit:** `npx vitest run --changed`
- **After every plan wave:** `npx vitest run` + `npx tsc --noEmit -p site` (0 errors)
- **Before phase verification:** full unit suite green, tsc 0 errors, AND `npm run e2e -w site` green (no Phase 3/4/5 regressions)
- **Max feedback latency:** 30s unit; E2E gates at wave close

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| (filled by planner) | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] **perDoyDistribution + percentile domain helper** (pure): per-doy [min,p10,p50,p90,max] across qualifying years, reusing expandWindow/groupBySeasonYear/qualifyingYears/effectiveN. Unit tests incl. boundaries, qualifying-years filter, missing→explicit, median precip.
- [ ] **daylight helper** via suncalc with polar branch (alwaysUp/alwaysDown FIRST) — unit tests incl. Iceland summer/winter solstice edges (no NaN, near-24h / near-0h).
- [ ] ECharts install (echarts 6.1.0) + suncalc (2.0.1) — deps legitimacy already verified in research (slopcheck OK); install task confirms no postinstall, lockfile pinned. NOT a human checkpoint.
- [ ] Playwright panel.spec skeleton (open/close, 3 chart canvases, reading key, daylight, no-data, án úrkomu, ranked-list-yields, no-fetch, reduced-motion, a11y summary).
- [ ] Build-size/chunk-split verification: ECharts confined to a lazy chunk, NOT in the main/entry bundle (A4).

---

## Manual-Only Verifications

Per the no-review directive these are Claude `auto` tasks (run command, inspect screenshot, evidence in SUMMARY) — NOT human checkpoints.

| Behavior | Requirement | Why "Manual" | Test Instructions |
|----------|-------------|------------|-------------------|
| Charts render as honest distributions (box=10–90, whiskers min/max, median), not finance | CHART-01/02 | Visual judgement | Playwright screenshot of open panel; Claude confirms box/whisker shape, no green/red directional color, reading key legible; evidence in SUMMARY |
| Panel coexists with map/legend/control bar; ranked list yields | CHART-01 | Layout judgement | Screenshot panel open + closed; Claude confirms ranked list hidden while open, restored on close |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (distribution + daylight helpers gate the panel)
- [ ] No watch-mode flags
- [ ] tsc stays 0 errors; ECharts confined to a lazy chunk (not main bundle)
- [ ] E2E gates on production preview build; no prior-phase spec regressions
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
