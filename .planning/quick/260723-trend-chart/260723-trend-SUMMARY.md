# Quick Summary — Yearly average-temperature TREND chart (260723-trend-chart)

**One-liner:** Added a 4th station-panel figure "Þróun hita" — a per-year mean-temperature
line chart (warming view) over the station's full history with an ár/mánuður/vika resolution
toggle, backed by a new pure-domain `meanPerYearSeries` helper.

## What shipped

- **Domain (`packages/domain/src/trend.ts`):** `meanPerYearSeries(rowsByYear, windowDays, selector)`
  → `{year, mean}[]` ascending. One point per season-year; per-year in-window mean with
  first-row-per-doy dedup, null-skip, and omission (not 0) of years with no present value.
  Pure, dependency-free. Exported (`meanPerYearSeries`, `YearMean`) from the index barrel.
- **Chart (`site/src/ui/chartPanel.ts`):** registered `LineChart` (+ `LineSeriesOption` in the
  composed `ECOption`); `renderTrend(host, {series, unit, tone, metricLabel})`. Value x-axis with
  integer year ticks (`minInterval:1`), y-axis `scale:true` so a few-°C warming drift is visible
  (not flattened by a forced 0), single `--chart-temp` line with circle symbols, Icelandic
  comma-decimal tooltip `"{year}: {mean} °C"`, reduced-motion `animation:false`, aria summary
  (first→last year + delta, hlýnun/kólnun) + hidden per-year `<table>`. Returns `null` on empty
  series (slot falls back to no-data text). Records option on `window.__chartOptions`.
- **Panel (`site/src/ui/stationPanel.ts`):** `ChartSpec` gained `kind:"trend"`; `renderChartInto`
  dispatches to `renderTrend`. `buildTrendFigure` builds the 4th figure below Úrkoma / above the
  daylight readout, using the station's FULL history (all season-years in the decoded rows, NOT
  clamped to the Frá/Til baseline — warming needs many years) via `computeTrendSeries` + the temp
  selector. Segmented toggle "Upplausn" (ár=whole 365-day year / mánuður≈30d / vika=7d centred on
  the anchor doy); default **ár**; changing recomputes the series and re-renders in place, clearing
  the slot and registering the new handle with the existing `registerChart`/`liveCharts` dispose
  lifecycle (no instance leak). `<2` usable years → the honesty no-data text `of fá ár til að sýna
  þróun`. Plain-Icelandic reading key + aria table. `rows` hoisted so it is decoded once.
- **CSS (`site/src/styles/panel.css`):** `.station-panel__resolution` segmented control with
  `aria-pressed` state (color is not the sole channel — pressed weight + label carry it too).
- **E2E (`site/tests/e2e/panel.spec.ts`):** new test asserts (a) a 4th "Þróun hita" figure below
  Úrkoma, (b) a 3-button ár/mánuður/vika toggle with ár pressed by default, (c) switching to
  mánuður then vika keeps the panel visible with the chart host present and NO pageerror.

## Gate results

- **Unit (`npm test`):** 380 passed | 3 skipped (41 files) — includes new `trend.test.ts` (5 tests).
- **Typecheck:** root `npm run typecheck` = exit 0; `cd site && npx tsc --noEmit` = exit 0.
- **E2E (`cd site && npx playwright test`):** **92 passed / 0 failed** (exit 0). Build-size gate
  still passes (chartPanel-*.js chunk exists, entry chunk echarts-free — LineChart added only a
  small amount to the lazy chunk, gate untripped).

## How the trend chart + toggle were verified

The new Playwright test opens Reykjavík (#1, deep history) via the store seam and confirms the
warming figure renders a chart (not the no-data text), the toggle has exactly the three
ár/mánuður/vika buttons with ár pressed by default, and that clicking mánuður then vika flips
`aria-pressed`, keeps the `.station-panel__chart-slot` host mounted, keeps the panel visible, and
raises no `pageerror` — proving the in-place recompute/re-render + dispose lifecycle is sound.

## Deviations from plan

- **[Rule 3 — Blocking test breakage]** Adding the 4th figure made two prior panel E2E tests
  (criterion 2 and criterion 14) fail: they matched figures via whole-figure `filter({ hasText:
  "Hiti" })`, which now also matched the trend figure's aria summary "Hiti eftir árum" (strict-mode
  2-element violation). Fixed by scoping those matches to the figcaption title
  (`filter({ has: page.locator(".station-panel__figure-title", { hasText: title }) })`) — precise,
  no behavior change. Files: `site/tests/e2e/panel.spec.ts`.

## Known stubs
None.

## Self-Check: PASSED
- `packages/domain/src/trend.ts`, `packages/domain/test/trend.test.ts` — created.
- `site/src/ui/chartPanel.ts`, `site/src/ui/stationPanel.ts`, `site/src/styles/panel.css`,
  `site/tests/e2e/panel.spec.ts` — modified.
- Commits: Step 1 `9e28021`, Step 2 `56d33cb`, Step 3 `6b524d8`, Step 4 (this commit).
