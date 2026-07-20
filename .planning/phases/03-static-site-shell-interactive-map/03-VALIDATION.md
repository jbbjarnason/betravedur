---
phase: 3
slug: static-site-shell-interactive-map
status: draft
nyquist_compliant: false
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
| **Config file** | `vitest.config.ts` (root) + `playwright.config.ts` (Wave 0) |
| **Quick run command** | `npx vitest run --changed` |
| **Full suite command** | `npx vitest run` |
| **E2E command** | `npx playwright test` (drives `vite preview` production build) |
| **Estimated runtime** | unit ~15s; E2E ~30–60s (Chromium) |

---

## Sampling Rate

- **After every task commit:** `npx vitest run --changed`
- **After every plan wave:** `npx vitest run`
- **Before phase verification:** full unit suite green AND `npx playwright test` green on the preview (production) build — this is the phase gate that also pins the Vite×MapLibre worker risk (A1)
- **Max feedback latency:** 30s unit; E2E gates at wave close

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| (filled by planner) | | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `site/` (or `app/`) Vite+TS workspace + `playwright.config.ts` + Chromium install
- [ ] PMTiles Iceland extract committed to site/public (measured size recorded)
- [ ] Committed real derived sample (Keflavík #1350 + Reykjavík #1) + stations.json + manifest.json in site/public
- [ ] Unit test stubs for decode→domain-average→marker-datum transform
- [ ] Playwright E2E skeleton mapping the 11 UI-SPEC acceptance criteria (runs against `vite preview`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Muted basemap look matches gottvedur reference | UX-01/MAP-01 | Visual aesthetic judgement | Playwright screenshot inspected by orchestrator (no-review directive → Claude judges, evidence in SUMMARY) |
| Marker legibility / no overlap at rest | MAP-04 | Visual density judgement | Screenshot at zoom 6 + zoomed-in; orchestrator asserts no overlapping pills |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags (Playwright runs headless one-shot)
- [ ] E2E gates on production preview build (A1 risk mitigation)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
