---
phase: 3
slug: static-site-shell-interactive-map
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-20
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.10 (unit) + @playwright/test 1.61.1 (E2E on preview build) |
| **Config file** | `vitest.config.ts` (root) + `site/playwright.config.ts` (Plan 01) |
| **Quick run command** | `npx vitest run --changed` |
| **Full suite command** | `npx vitest run` |
| **E2E command** | `npm run e2e -w site` (drives `vite preview` production build) |
| **Estimated runtime** | unit ~15s; E2E ~30–60s (Chromium) |

---

## Sampling Rate

- **After every task commit:** `npx vitest run --changed`
- **After every plan wave:** `npx vitest run`
- **Before phase verification:** full unit suite green AND `npm run e2e -w site` green on the preview (production) build — this is the phase gate that also pins the Vite×MapLibre worker risk (A1)
- **Max feedback latency:** 30s unit; E2E gates at wave close

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-T1 | 01 | 1 | SITE-01, MAP-01 | scaffold/asset | `test -f site/public/iceland.pmtiles && test -f site/public/data/manifest.json` | ❌ Wave 0 (this task creates it) | ⬜ pending |
| 03-01-T2 | 01 | 1 | MAP-01, UX-01, SITE-01 | E2E (preview) | `npm run build -w site && npm run e2e -w site` (shell.spec — criteria 1–4,8,9) | ❌ Wave 0 (this task creates it) | ⬜ pending |
| 03-02-T1 | 02 | 2 | MAP-02, SITE-01 | unit (TDD) | `npx vitest run site/src/data/load.test.ts` | ❌ Wave 0 (this task creates it) | ⬜ pending |
| 03-02-T2 | 02 | 2 | MAP-02 | unit (TDD) | `npx vitest run site/src/data/averages.test.ts` | ❌ Wave 0 (this task creates it) | ⬜ pending |
| 03-03-T1 | 03 | 3 | MAP-02, MAP-04 | unit (helpers) | `npx vitest run site/src/map` | ❌ (this task creates it) | ⬜ pending |
| 03-03-T2 | 03 | 3 | MAP-02, MAP-04 | E2E (preview) | `npm run build -w site && npm run e2e -w site` (markers.spec — criteria 5,6,7,9,10,11) | ❌ (this task creates it) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**UI-SPEC acceptance-criterion → test coverage (all 11 covered):**
- Criteria 1,2 (slogan/wordmark): 03-01-T2 shell.spec "slogan"
- Criterion 3 (map canvas): 03-01-T2 shell.spec "map canvas"
- Criterion 4 (no API key): 03-01-T2 shell.spec "no api key"
- Criterion 8 (attribution): 03-01-T2 shell.spec "attribution"
- Criterion 9 (interactivity/zoom): 03-01-T2 shell.spec "interactivity" + 03-03-T2 markers.spec "density"
- Criterion 5 (≥1 marker): 03-03-T2 markers.spec "marker present"
- Criterion 6 (temp °): 03-03-T2 markers.spec "marker temperature"
- Criterion 7 (wind m/s or breytileg átt): 03-03-T2 markers.spec "marker wind"
- Criterion 10 (density ≤~25, no overlap): 03-03-T2 markers.spec "density"
- Criterion 11 (graceful missing): 03-03-T2 markers.spec "graceful missing"

---

## Wave 0 Requirements

Wave 0 setup is absorbed into Plan 01 (foundation slice) and Plan 02 Task 1 (loader), since this phase's first deliverable IS the scaffold. Tracked items:

- [ ] `site/` Vite+TS workspace + `site/playwright.config.ts` + `npx playwright install chromium` (03-01-T1)
- [ ] PMTiles Iceland extract committed to `site/public/iceland.pmtiles` (measured size recorded) (03-01-T1)
- [ ] Committed real derived sample (Keflavík #1350 + Reykjavík #1) + stations.json + manifest.json in `site/public/data/` (03-01-T1)
- [ ] Unit tests for decode→domain-average→marker-datum transform (03-02-T1, 03-02-T2)
- [ ] Playwright E2E skeleton mapping the 11 UI-SPEC acceptance criteria against `vite preview` (03-01-T2 shell.spec + 03-03-T2 markers.spec)

---

## Manual-Only Verifications

Per the STATE no-review directive these are performed by Claude as `auto` tasks (run the command, inspect the real screenshot, record evidence in SUMMARY) — NOT human checkpoints.

| Behavior | Requirement | Why "Manual" | Test Instructions |
|----------|-------------|------------|-------------------|
| Muted basemap look matches gottvedur reference | UX-01/MAP-01 | Visual aesthetic judgement | Playwright screenshot inspected by Claude (03-01-T2); evidence in 03-01-SUMMARY |
| Marker legibility / no overlap at rest | MAP-04 | Visual density judgement | Screenshot at zoom 6 + zoomed-in (03-03-T2); Claude asserts no overlapping pills; evidence in 03-03-SUMMARY (criterion 10 also asserted programmatically) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (folded into 03-01 / 03-02-T1)
- [x] No watch-mode flags (Playwright runs headless one-shot)
- [x] E2E gates on production preview build (A1 risk mitigation)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready
