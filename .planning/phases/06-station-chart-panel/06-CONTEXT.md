# Phase 6: Station Chart Panel - Context

**Gathered:** 2026-07-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Clicking a station opens a detail panel showing the distribution of weather across the chosen years: distribution-semantics candlesticks for temperature and wind, precipitation as bars, daylight hours for the period — with explicit missing-data handling ("engin gögn fyrir þetta tímabil") instead of blank/misleading charts. Extends the Phase 5 station-select seam (row/marker click already sets stationId + flies to it; this phase makes that also OPEN the panel). NOT in this phase: mobile bottom-sheet polish / full responsive chrome / info "historical not forecast" panel / loading states (Phase 7), deploy (Phase 8), the meðaltal/dreifing toggle (v1.x).

</domain>

<decisions>
## Implementation Decisions

### Panel Layout (Claude's discretion — decided)
- Right-side detail panel. Because "Bestu staðir" (ranked list) also docks right and both are station-focused, the ranked list YIELDS when a station panel is open — it collapses to a toggle / is hidden behind the panel; closing the panel restores it. You never need both expanded simultaneously.
- Panel opens on station select (marker click OR ranked-row click — both already set stationId via the Phase 5 seam). Add a close affordance that clears the selected station (store.set({stationId: null})) → panel closes, ranked list restores, URL `st` param clears.
- Charts stacked vertically in the panel: temperature (candlestick/box), wind (candlestick/box), precipitation (bars), plus a daylight-hours readout for the period. Map stays visible to the left.
- Narrow screens: functional (panel over map); full bottom-sheet treatment is Phase 7.

### Candlestick / Distribution Encoding (Claude's discretion — decided)
- Per day-of-year in the selected window, across the qualifying baseline years: box = 10th–90th percentile of that day's values, whiskers = min/max, a median line inside the box. This is a distribution ("what most days were like"), NOT financial OHLC — robust to outliers, honest for lay users.
- No green/red directional coloring (that's the finance semantics to avoid). Temperature box in a neutral/warm tone, wind in a neutral/cool tone, distinct from the score BuGn ramp and the accent red.
- A plain-Icelandic reading key beneath the charts: e.g. "kassinn sýnir hvar 8 af hverjum 10 dögum lentu; strikin sýna kaldasta og hlýjasta dag." (temp) — one sentence per chart so the encoding is unmistakable (FEATURES.md candlestick-comprehension risk).
- Precipitation as BARS (per day-of-year: typical total across qualifying years), not candlesticks — matches the user's original "bars for rain". Honest missing (no gauge / no data) shown as an explicit gap/label, not zero.
- Requires per-day-of-year DISTRIBUTION data, not just the means the markers use — see data note below.

### Daylight Hours
- Astronomical computation from station lat/lon + the period's day-of-year (no data dependency — pure calc). Show daylight hours for the period (e.g. range across the window, or the midpoint day). Icelandic label ("birtutími" / "dagsbirta").

### Missing-Data Handling
- Per chart: if a station has no qualifying data for the selected window/years → "engin gögn fyrir þetta tímabil" in place of that chart, never a blank axis or a misleading flat line. Reuse the Phase 1 honest-coverage contract (N≥3 / ≥80%). A station may have temp but not precip (án úrkomu) → show temp/wind charts, precip chart shows the no-gauge message.

### Chart Library
- Apache ECharts 6 with à-la-carte imports (candlestick/custom + bar + line/scatter in one panel). FIRST intentional npm runtime dependency in the project — the charts warrant it (verified STACK pick; hand-rolling box-plots per-day is not worth it). Keep the import tree minimal (~80–130KB gzip target); lazy-load the panel/chart code so the map/initial load isn't burdened (dynamic import on first panel open).
- Respect reduced-motion (disable chart animation), Icelandic number/date formatting, colorblind-safe (encoding is shape/position, not hue-dependent).

### Data Note (load-bearing — flag for research/planning)
- The current derived files + computeMarkerDatum produce per-station AVERAGES (means for the window). The chart panel needs per-DAY-OF-YEAR DISTRIBUTIONS (percentiles/min/max per doy across years). Research must determine whether the Phase 2 derived/{station}.json already carries enough per-(year,doy) daily data to compute these distributions client-side (likely yes — the derived format stores per-year per-doy daily values), or whether a new derived shape is needed. Strongly prefer computing distributions client-side from the EXISTING derived data (no pipeline change). This is the #1 research question.

### Claude's Discretion
- Exact panel width, chart heights, ECharts option shapes, daylight formula lib vs hand-roll, close-affordance styling, percentile interpolation method.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 5 station-select seam: store `stationId`, markDiscrete/setDiscrete, easeTo fly-to, marker + ranked-row highlight. The panel subscribes to the same stationId signal.
- site/src/data/ derived loading + decodeDerived (per-year per-doy daily data) — the source for distributions.
- @betravedur/domain: window (expandWindow, groupBySeasonYear, leap fold), coverage (qualifyingYears/effectiveN) — reuse for the panel's per-doy qualifying-years + honest missing. Percentile helper may be new (small, testable).
- site/src/ui/ patterns (mountRankedList, mountLegend, controlBar) as analogs for the panel component; renderForState recompute hook for panel refresh on selection change.
- tokens.css / score.css design system.

### Established Patterns
- Vite+TS, strict TS (tsc --noEmit -p site now CLEAN — keep it clean), Vitest unit + Playwright E2E on preview build, TDD, no-review directive (visual checks = auto tasks w/ screenshot evidence). Until now zero runtime deps — ECharts is the deliberate first one.

### Integration Points
- Phase 7 turns the panel into a proper mobile bottom-sheet + adds the info/trust/loading chrome; keep the panel structure amenable.
- The per-doy distribution helper could later power the v1.x meðaltal/dreifing toggle.

</code_context>

<specifics>
## Specific Ideas

- User's original ask: "candlesticks for heat, wind and rain or something else for rain" → candlesticks (distribution boxes) for temp + wind, BARS for rain. Honor this exactly.
- Candlestick comprehension is a known risk (FEATURES.md) — the plain-Icelandic reading key is mandatory, not optional.
- Daylight is "cheap, delightful, on-theme" (FEATURES.md) — Iceland's extreme daylight swing makes it genuinely useful.
- Prefer computing distributions client-side from existing derived data (no Phase 2 pipeline change).
- ECharts must be lazy-loaded (dynamic import) so it doesn't bloat the initial map load.

</specifics>

<deferred>
## Deferred Ideas

- Mobile bottom-sheet, info "sögulegt meðaltal, ekki spá" panel, loading/empty chrome — Phase 7 (already holds the accumulated layout/mobile/trust debt).
- meðaltal / dreifing chart toggle (TOG-01, v1.x).
- Station comparison side-by-side (CMP-01, v1.x).
- Sunshine metric (SUN-01, v1.x — only ~8 SYNOP stations).

</deferred>
