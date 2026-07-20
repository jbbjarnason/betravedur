---
phase: 06-station-chart-panel
verified: 2026-07-20T14:52:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
re_verification: false
gaps: []
deferred: []
---

# Phase 6: Station Chart Panel Verification Report

**Phase Goal:** Clicking a station opens a detail panel that shows the distribution of weather across the chosen years — distribution-semantics candlesticks for temperature and wind, precipitation as bars, daylight hours for the period — and handles missing data explicitly instead of rendering blank charts.
**Verified:** 2026-07-20T14:52:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Clicking a station opens a chart panel with per-day candlestick-style temperature and wind distributions and precipitation as bars across the chosen years | VERIFIED | E2E criteria 1 + 2 pass: `section.station-panel[aria-label]` appears on pill click; three titled figures with `<canvas>` render for data-complete stations. Panel opens via marker pill or store seam. |
| 2 | Charts use distribution semantics (min/typical range/max, not financial OHLC) with a plain-Icelandic reading key | VERIFIED | `chartPanel.ts` uses `type:"boxplot"` (confirmed by grep: 6 occurrences); zero occurrences of `candlestick` or `color0`. Single neutral `itemStyle` per series. Reading keys are real DOM text (criterion 3 passes). |
| 3 | The panel shows daylight hours for the selected period | VERIFIED | `daylightHours` function in `site/src/data/daylight.ts` uses suncalc 2.0.1; polar branches on `alwaysUp`/`alwaysDown` FIRST. E2E criterion 4 passes: `Dagsbirta` label + `/\d+,\d+\s*klst\./` regex match confirmed. 5 unit tests green including Iceland solstice edges. |
| 4 | When data is absent the panel shows "engin gögn fyrir þetta tímabil" instead of a blank or misleading chart | VERIFIED | Three-granularity no-data honesty: per-chart insufficient (`{ sufficient:false }`) → text message; án-úrkomu precip → "engin úrkomumæling á þessari stöð"; all-three-insufficient → panel-level "Engin gögn" heading. E2E criteria 5 + 6 pass. |

**Score: 4/4 truths verified**

---

### Deferred Items

None.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/domain/src/distribution.ts` | `percentile` + `perDoyDistribution` + `perDoyPrecip` pure helpers | VERIFIED | File exists, substantive (172 lines), exported from `packages/domain/src/index.ts`. Type-7 percentile, per-doy 5-number summary, median-based precip bars, `{ missing:true }` for empty buckets. |
| `packages/domain/test/distribution.test.ts` | Unit tests: boundaries, qualifying-years gate, missing gap, wrap order, median precip | VERIFIED | 13 tests pass. Covers: p=0/0.5/1, single-element, N<3 gate, missing-doy explicit gap, Dec→Jan wrap order, yearRange filter, median precip, AWS absent-r gate. |
| `site/src/data/daylight.ts` | `daylightHours` polar-aware, suncalc import | VERIFIED | File exists. `alwaysUp`/`alwaysDown` branches first. Fallback via solar noon altitude. `isValidDate` guard prevents NaN. 5 unit tests green. |
| `site/src/data/daylight.test.ts` | Solstice-edge unit tests (no NaN) | VERIFIED | Iceland summer/winter solstice edges verified. Deep-polar (78N) polar-day/polar-night cases covered. |
| `site/src/ui/stationPanel.ts` | Panel shell: stationId subscriber, open/close, ranked-list yield, daylight readout, no-data states | VERIFIED | 515 lines, fully substantive. `mountStationPanel` exported and wired in `main.ts`. Zero `innerHTML` occurrences (XSS gate). `store.subscribe`, `setYielded`, `store.set({stationId:null})` all present. |
| `site/src/ui/chartPanel.ts` | Lazy ECharts chunk: à-la-carte boxplot+bar builders, aria summaries | VERIFIED | 421 lines. À-la-carte imports (echarts/core, BoxplotChart, BarChart, GridComponent, TooltipComponent, TitleComponent, CanvasRenderer). Zero `candlestick`/`color0`. Aria summaries + visually-hidden tables. `animation: !prefersReducedMotion()`. |
| `site/src/styles/panel.css` | Right-dock panel chrome | VERIFIED | File exists. `station-panel` selector present. Zero `--accent`/`--score-` references (non-comment lines). |
| `site/src/styles/tokens.css` | `--chart-temp`, `--chart-wind`, `--chart-precip` tokens | VERIFIED | `--chart-temp: #b26a3d`, `--chart-wind: #3d6e8c`, `--chart-precip: #4a5a6a` present after `--score-*` block. |
| `site/tests/e2e/panel.spec.ts` | 14 UI-SPEC criteria + build-size chunk-split gate | VERIFIED | All 14 criteria active (not fixme) and green. Build-size gate active and green. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `packages/domain/src/distribution.ts` | `packages/domain/src/index.ts` | Named re-export | WIRED | `export { percentile, perDoyDistribution, perDoyPrecip }` confirmed in index.ts |
| `site/src/data/daylight.ts` | suncalc | `import { getTimes, getPosition } from "suncalc"` | WIRED | Confirmed in daylight.ts line 18 |
| `site/src/main.ts` | `site/src/ui/stationPanel.ts` | `mountStationPanel(store, cache, () => latestData, rankedList)` | WIRED | Both import and call confirmed in main.ts |
| `site/src/ui/stationPanel.ts` | store stationId seam | `store.subscribe` (open on non-null, close on null) | WIRED | `store.subscribe` drives open/close; `store.set({stationId:null})` in close and Escape handler |
| `site/src/ui/stationPanel.ts` | `site/src/ui/rankedList.ts` | `RankedListHandle.setYielded(bool)` | WIRED | `setYielded(true)` on open, `setYielded(false)` on teardown |
| `site/src/ui/stationPanel.ts` | `site/src/ui/chartPanel.ts` | Dynamic `import("./chartPanel.js")` on first open | WIRED | Memoized `loadChartModule()` using `import("./chartPanel.js")` confirmed; zero static echarts references in stationPanel.ts |
| `site/src/ui/chartPanel.ts` | echarts/core | À-la-carte import + `echarts.use([...])` | WIRED | `import * as echarts from "echarts/core"` + `echarts.use([BoxplotChart, BarChart, GridComponent, TooltipComponent, TitleComponent, CanvasRenderer])` confirmed |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `stationPanel.ts` | `tempResult`, `windResult`, `precipResult` | `decodeDerived(entry.file)` → `perDoyDistribution`/`perDoyPrecip` | Yes — real decoded rows from boot StationCache | FLOWING |
| `stationPanel.ts` | `daylight` | `daylightHours(refDate(mid), lat, lon)` | Yes — pure astronomical computation from station meta lat/lon | FLOWING |
| `chartPanel.ts` | boxplot series data | `spec.perDoy` (passed from stationPanel via ChartSpec) | Yes — per-doy 5-number summaries from qualifying year rows | FLOWING |
| `chartPanel.ts` | bar series data | `spec.perDoy` (PerDoyBar from perDoyPrecip) | Yes — per-doy median precip from qualifying year rows | FLOWING |

Zero `/data/` network requests on panel open (E2E criterion 10 passes). Distributions computed entirely client-side from boot-cached derived files.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `npx vitest run distribution` (13 unit tests) | `npx vitest run distribution` | 13/13 passed | PASS |
| `npx vitest run daylight` (5 unit tests) | `npx vitest run daylight` | 5/5 passed | PASS |
| `npx tsc --noEmit -p site` | TypeScript typecheck | 0 errors (no output) | PASS |
| `npm run build -w site` | Vite production build | Success; `chartPanel-DQytiE69.js` + `index-BquD3mlY.js` emitted | PASS |
| ECharts NOT in entry chunk | `grep -c "echarts" site/dist/assets/index-BquD3mlY.js` | 0 — echarts absent from entry bundle | PASS |
| ECharts IN lazy chunk | `grep -c "echarts" site/dist/assets/chartPanel-DQytiE69.js` | 2 — echarts present in lazy chunk | PASS |
| Full E2E suite (66 tests) | `npm run e2e -w site` | 66/66 passed (shell, markers, selection, score, panel — all green) | PASS |

---

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes declared or conventional for this phase. The verification was performed via the project's own test commands (vitest + playwright + tsc + vite build). Step 7c: SKIPPED (no probe scripts).

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CHART-01 | 06-01, 06-02, 06-03 | Clicking a station opens a chart panel: candlestick-style distribution charts for temperature and wind per day across the chosen years, precipitation as bars | SATISFIED | E2E criteria 1+2 pass. `boxplot` series confirmed. Dynamic import of chartPanel chunk delivers real charts. |
| CHART-02 | 06-01, 06-02, 06-03 | Charts use distribution semantics (min/typical range/max, not financial OHLC) with a plain-Icelandic reading key | SATISFIED | `type:"boxplot"` confirmed; zero `candlestick`/`color0`; reading keys as real DOM text (criterion 3); `--chart-temp`/`--chart-wind`/`--chart-precip` tokens (not `--accent`/`--score-*`) confirmed |
| CHART-03 | 06-01, 06-02 | Panel shows daylight hours for the selected period (astronomical computation) | SATISFIED | `daylightHours` with suncalc 2.0.1, polar-safe. E2E criterion 4 + 13 pass (Dagsbirta + comma-decimal klst.) |
| CHART-04 | 06-01, 06-02 | Panel handles missing data explicitly ("engin gögn fyrir þetta tímabil") instead of blank charts | SATISFIED | Three-granularity no-data logic confirmed in code; E2E criteria 5+6 pass |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

Scanned `site/src/ui/stationPanel.ts`, `site/src/ui/chartPanel.ts`, `packages/domain/src/distribution.ts`, `site/src/data/daylight.ts` for TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER/innerHTML/return null/empty implementations. Results: zero debt markers, zero innerHTML occurrences in stationPanel.ts (XSS gate confirmed), zero unresolved stubs.

---

### Human Verification Required

None. Per the user directive, all verifications were completed programmatically. The 2-station sample data set is correct-by-design. Mobile bottom-sheet/info-trust/loading chrome is the correct Phase 7 boundary, not a gap.

---

### Gaps Summary

No gaps. All 4 roadmap success criteria are VERIFIED by direct code inspection and passing automated test suites (32 unit test files / 281 tests passing, 66 E2E tests passing, 0 TypeScript errors, clean production build with correct chunk-split).

**Key technical verifications completed:**
- Distributions computed CLIENT-SIDE: `perDoyDistribution` reshapes `decodeDerived` output in-browser; no Phase 2 pipeline change; E2E asserts 0 `/data/` requests on panel open
- ECharts BOXPLOT not candlestick: `grep "boxplot"` returns 6 hits in chartPanel.ts; `grep "candlestick"` returns 0; no `color0`
- ECharts confined to lazy dynamic-import chunk: entry chunk `index-BquD3mlY.js` has 0 echarts references; `chartPanel-DQytiE69.js` has 2 echarts references
- Precip = bars with honest missing: `"-"` empty-value marker for missing doys (never 0-height bar)
- Daylight polar-safe: `alwaysUp`/`alwaysDown` branches first; `isValidDate` guard; belt-and-braces `isFinite` check; 5 unit tests green at Iceland solstice edges
- Per-chart N-gate parity: mirrors `computeMarkerDatum` — `qualifyingYears(...,0.8)` + `effectiveN(N>=3)`
- No `@types/echarts` or `@types/suncalc` in `site/package.json`
- No `innerHTML` for station names: `grep -c "innerHTML" site/src/ui/stationPanel.ts` returns 0
- Panel reuses stationId seam: open on non-null, `store.set({stationId:null})` on close/Escape, ranked list setYielded/restored; E2E criteria 7+8+9 pass
- ECharts tooltip formatter returns plain Icelandic strings, never HTML (V11)

---

_Verified: 2026-07-20T14:52:00Z_
_Verifier: Claude (gsd-verifier)_
