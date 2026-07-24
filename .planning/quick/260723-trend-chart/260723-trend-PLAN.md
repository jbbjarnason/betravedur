# Quick Plan — Yearly average-temperature TREND chart (260723-trend-chart)

## Goal
Add a fourth chart figure to the station panel — a line chart of mean temperature per
year (one point per year) showing the warming trend for the chosen time-of-year slice,
with a resolution toggle **ár / mánuður / vika**. Placed BELOW the Úrkoma figure and
ABOVE the daylight readout.

User ask: "below úrkoma show a chart of average temperature — I want to see how global
warming is affecting places — one point per year, and make the resolution optional:
year / month / week."

## Steps (commit after each)

1. **domain: per-year mean series** — `packages/domain/src/trend.ts`
   `meanPerYearSeries(rowsByYear, windowDays, selector) → {year, mean}[]`, sorted
   ascending, mirroring `meanPerYearThenAverage` duplicate/null policy; a year with no
   present in-window value is omitted (not 0). Exported from index. Unit-tested.

2. **chartPanel: renderTrend line chart** — add `LineChart` to echarts imports/use,
   `renderTrend(host, {series, unit, tone, metricLabel})`. Value x-axis integer years,
   y-axis `scale:true` (no forced 0), single `--chart-temp` line, Icelandic comma-decimal
   tooltip, reduced-motion `animation:false`, aria summary + hidden per-year table.
   Returns null on empty series.

3. **stationPanel: trend figure + resolution toggle** — extend `ChartSpec` with
   `kind:"trend"`; `renderChartInto` dispatches to `renderTrend`. `buildTrendFigure`
   builds the 4th figure "Þróun hita" using the station's FULL history (all season-years,
   NOT Frá/Til clamped) via the new domain fn + temp selector. Segmented toggle
   (ár=whole year / mánuður=30d / vika=7d centred on anchor), default ár; changing
   recomputes + re-renders in place via the registerChart/liveCharts lifecycle. <2 years →
   honesty no-data text. Reading key + aria table. Toggle CSS in panel.css.

4. **verify + tests + docs** — E2E in `tests/e2e/panel.spec.ts` (4th figure below Úrkoma,
   3-button toggle, switching keeps panel alive / no pageerror). Gates: unit, typecheck
   (root + site), full Playwright, build-size gate. PLAN + SUMMARY. No deploy.

## Constraints
Icelandic-only UI; comma decimals via hand-rolled `.toFixed(1).replace(".", ",")`; no new
runtime deps beyond the echarts LineChart module. Match token/aria/reduced-motion patterns.
