# Phase 6: Station Chart Panel - Research

**Researched:** 2026-07-20
**Domain:** Client-side distribution charting (ECharts 6 à-la-carte) + astronomical daylight calc, over the existing derived data
**Confidence:** HIGH

## Summary

The load-bearing gate is **GREEN**: per-day-of-year distributions (10th/50th/90th percentile + min/max per doy across qualifying years) are fully computable **client-side from the EXISTING derived data with NO Phase 2 pipeline change**. `decodeDerived` (already imported browser-side via `@betravedur/pipeline/derive`) returns `DailyObservation[]` carrying every per-`(year, doy)` daily value for `t/tx/tn/f/fx/fg/dv/r` — not aggregates. The chart panel reshapes those rows into per-doy arrays and computes percentiles with the same `expandWindow` / `groupBySeasonYear` / `qualifyingYears` domain helpers the markers already use. The only genuinely new domain code is a small, pure, testable percentile helper.

The chart library is **Apache ECharts 6.1.0** (locked in CONTEXT.md and STACK), imported **à-la-carte** (`echarts/core` + `BoxplotChart` + `BarChart` + a handful of components + `CanvasRenderer`) and **lazy-loaded via `import()`** so it splits into its own Vite chunk and never burdens the initial map load. The honest 5-number distribution is a **`boxplot` series** (`[min, Q1, median, Q3, max]` per box, no financial up/down coloring) — NOT `candlestick` (candlestick is OHLC and carries directional green/red coloring we must avoid). "Candlestick" in CONTEXT.md is the user's lay term for the box shape; the correct ECharts series is `boxplot`.

Daylight uses **suncalc 2.0.1** (published 2026-07-11), which ships its own TypeScript types and — critically — **native polar-day/polar-night handling** (`sunrise`/`sunset` become `null`, and `alwaysUp`/`alwaysDown` flags are set) so Iceland's near-24h/near-0h daylight edges do **not** produce NaN or Invalid Date. Both new runtime deps (`echarts`, `suncalc`) passed slopcheck `[OK]` and are mainstream (4.3M and 235K weekly downloads, first-party repos).

**Primary recommendation:** Build a pure `perDoyDistribution` domain helper (reusing `expandWindow`/`groupBySeasonYear`/`qualifyingYears`) + a pure `daylightForWindow` helper (suncalc, polar-flag-aware); mount a lazy-loaded, store-`stationId`-subscribed right-side panel that dynamic-imports an `echarts/core` à-la-carte module rendering boxplot (temp, wind) + bar (precip) + a daylight readout, with per-chart honest "engin gögn" fallbacks and a plain-Icelandic reading key.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Per-doy distribution math (percentiles, qualifying-years filter) | Browser (pure domain helper) | — | Data is already downloaded per-station; no backend exists; reuses existing domain functions. NO pipeline change. |
| Distribution rendering (boxplot/bar charts) | Browser (lazy ECharts chunk) | — | Canvas charting is inherently client-side; lazy-split so it's off the critical map path. |
| Daylight hours | Browser (pure suncalc calc) | — | Pure lat/lon+doy astronomy, zero data dependency (CHART-03). |
| Panel open/close + station selection | Browser (store subscriber) | — | Reuses the Phase 4/5 single `store.stationId` seam; no new state channel. |
| Derived data supply | Build/pipeline (unchanged) | — | Phase 2 `derived/{station}.json` already carries per-(year,doy) daily values — sufficient as-is. |

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Right-side detail panel.** The ranked "Bestu staðir" list YIELDS (collapses/hides behind the panel) when a station panel is open; closing the panel restores it. Never both expanded simultaneously.
- **Panel opens on station select** (marker click OR ranked-row click — both already set `stationId` via the Phase 5 seam). A close affordance clears the station: `store.set({ stationId: null })` → panel closes, ranked list restores, URL `st` param clears.
- **Charts stacked vertically:** temperature (box), wind (box), precipitation (bars), plus a daylight-hours readout. Map stays visible to the left.
- **Distribution encoding (per day-of-year in window, across qualifying baseline years):** box = 10th–90th percentile, whiskers = min/max, median line inside the box. This is a **distribution** ("what most days were like"), NOT financial OHLC.
- **No green/red directional coloring.** Temperature box neutral/warm tone, wind neutral/cool tone — distinct from the score BuGn ramp and the accent red.
- **Plain-Icelandic reading key** beneath the charts (one sentence per chart) — MANDATORY, not optional (candlestick-comprehension risk). Example: "kassinn sýnir hvar 8 af hverjum 10 dögum lentu; strikin sýna kaldasta og hlýjasta dag."
- **Precipitation as BARS** (per day-of-year: typical total across qualifying years), not boxes. Honest missing (no gauge / no data) shown as an explicit gap/label, never zero.
- **Daylight:** astronomical computation from station lat/lon + the period's day-of-year (pure calc, no data dependency). Icelandic label ("birtutími" / "dagsbirta").
- **Missing-data handling per chart:** no qualifying data for the window/years → "engin gögn fyrir þetta tímabil" in place of that chart, never a blank axis or misleading flat line. Reuse the Phase 1 honest-coverage contract (N≥3 / ≥80%). A station may have temp but not precip → show temp/wind, precip chart shows the no-gauge message.
- **Chart library:** Apache ECharts 6 with à-la-carte imports. FIRST intentional npm runtime dependency. Keep import tree minimal (~80–130KB gzip target); lazy-load the panel/chart code (dynamic import on first panel open).
- **Respect reduced-motion** (disable chart animation), Icelandic number/date formatting, colorblind-safe (encoding is shape/position, not hue-dependent).
- **Compute distributions client-side from EXISTING derived data — no Phase 2 pipeline change** (strongly preferred; this research confirms it is possible).

### Claude's Discretion
- Exact panel width, chart heights, ECharts option shapes, daylight formula lib vs hand-roll, close-affordance styling, percentile interpolation method.

### Deferred Ideas (OUT OF SCOPE)
- Mobile bottom-sheet, info "sögulegt meðaltal, ekki spá" panel, loading/empty chrome — **Phase 7**.
- meðaltal / dreifing chart toggle (TOG-01) — v1.x.
- Station comparison side-by-side (CMP-01) — v1.x.
- Sunshine metric (SUN-01) — v1.x.
- Full responsive chrome / mobile bottom-sheet polish / info panel / loading states — **Phase 7**. Deploy — Phase 8.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CHART-01 | Clicking a station opens a chart panel: distribution charts (temp, wind) per day across chosen years, precip as bars | `store.stationId` subscriber (Phase 5 seam, main.ts:216) opens a lazy-loaded ECharts panel; `boxplot` series for temp/wind, `bar` for precip; per-doy data from `decodeDerived` + new `perDoyDistribution` helper. |
| CHART-02 | Distribution semantics (min/typical range/max — not OHLC) + plain-Icelandic reading key | ECharts `boxplot` series (`[min,Q1,median,Q3,max]`, no directional coloring) with box=10th/90th, whiskers=min/max; static Icelandic key strings via `textContent`. |
| CHART-03 | Panel shows daylight hours for the selected period (astronomical computation) | suncalc 2.0.1 `getTimes(date, lat, lng)`; polar-aware (`alwaysUp`/`alwaysDown`); lat/lon from `StationMeta`. |
| CHART-04 | Missing data handled explicitly ("engin gögn fyrir þetta tímabil") | Per-chart coverage gate reusing `qualifyingYears`/`effectiveN` (N≥3, ≥80%); each metric independently → chart or no-data message. |

## THE GATE — Client-Side Per-Doy Distributions (answer: YES, no pipeline change)

**Question:** Can we compute per-day-of-year distributions (10th/50th/90th pct + min/max per doy across qualifying years) client-side from the existing derived data, with no Phase 2 change?

**Answer: YES.** The evidence, from `pipeline/src/derive.ts` and `site/src/data/averages.ts`:

1. **The derived file carries per-`(year, doy)` daily values, not aggregates.** `DerivedFile.cols` is a set of flat columns (`t/tx/tn/f/fx/fg/dv/r`), each length `nYears*365`, where position `i` decodes to `calendarYear = startYear + floor(i/365)` and `leapFoldedDoy = (i % 365) + 1`. Every individual day's measurement is stored (integer-quantized: temp/wind ×10, precip/dv ×1). `[VERIFIED: pipeline/src/derive.ts]`

2. **`decodeDerived` is already browser-side and returns full daily rows.** `averages.ts` imports `decodeDerived` from the `@betravedur/pipeline/derive` **subpath** (never the root barrel — the root pulls Node built-ins and breaks the bundle). It returns `DailyObservation[]`, each row `{ station, date, doy, t, tx, tn, f, fx, fg, dv, r }` — one row per stored `(year, doy)` with a non-null cell. `[VERIFIED: site/src/data/averages.ts:20,97]`

3. **The qualifying-years machinery already exists and is per-metric.** `expandWindow(window) → Set<doy>`, `groupBySeasonYear(rows, window) → Map<seasonYear, rows>`, `qualifyingYears(byYear, windowDays, metric, 0.8)`, `effectiveN(qYears) → {n, sufficient}` — all pure, all reused by the markers. `[VERIFIED: packages/domain/src/{window,coverage}.ts]`

**Exact reshape recipe (the panel's new pure helper):**

```
computePerDoyDistribution(file, window, yearRange, metricSelector):
  rows        = decodeDerived(file)                    // DailyObservation[]
  windowDays  = expandWindow(window)                   // Set<doy> (handles wrap)
  byYear      = groupBySeasonYear(rows, window)         // Map<seasonYear, rows[]>
  byYear      = filter byYear to [yearRange.from..til]  // SEL-02, same as averages.ts:110
  qYears      = qualifyingYears(byYear, windowDays, metricSelector, 0.8)
  { n, sufficient } = effectiveN(qYears)                // N>=3 gate
  if !sufficient: return { sufficient:false }           // -> "engin gögn" (CHART-04)

  // Bucket each in-window day's value BY doy, across qualifying years only:
  buckets: Map<doy, number[]> = {}
  for y in qYears:
    for r in byYear.get(y):
      v = metricSelector(r)
      if windowDays.has(r.doy) and v != null:
        buckets[r.doy].push(v)

  // Per doy, in window order (respecting wrap), emit the 5-number summary:
  for doy in expandWindow-order:
    vals = buckets[doy] ?? []
    if vals.length == 0: emit { doy, missing:true }     // gap, not a fake box
    else:
      sort vals asc
      emit { doy,
             min: vals[0], max: vals[last],
             p10: percentile(vals, 0.10),
             p50: percentile(vals, 0.50),   // median line
             p90: percentile(vals, 0.90) }
  return { sufficient:true, n, perDoy }
```

**Percentile interpolation (Claude's discretion — recommend linear / type-7):** Use linear interpolation between closest ranks (the R type-7 / NumPy default: `rank = p*(len-1)`, interpolate between floor/ceil). Deterministic, standard, unit-testable at boundaries. Document the choice in the helper so tests pin it. `[ASSUMED]` (method is a free choice; type-7 is the conventional default).

**Metric mapping to charts:**
- **Temperature box:** selector `o => o.t` (mean temp). Box = p10..p90 of that doy's mean-temps; whiskers min/max; median p50. (Alternative: use `tn`/`tx` for whiskers to show coldest/warmest *within* a day — but CONTEXT says "kaldasta og hlýjasta dag" = coldest/warmest *day*, so min/max of the per-day `t` across years is the honest fit. Keep to `t`.)
- **Wind box:** selector `o => o.f` (mean wind speed).
- **Precip bars:** per doy, the **typical total** across qualifying years. Precip is a per-day total already; per doy, take the mean (or median — discretion) of `o.r` across qualifying years. Missing (`r` column absent → AWS "án úrkomu", or no qualifying rain) → explicit gap/label, never a zero bar (mirrors `averages.ts` rain nullability discipline, Pitfall 2 there).

**Wrap-around correctness:** For a Dec→Jan window, `groupBySeasonYear` already assigns the January tail to the *previous* season-year (WR-03). The per-doy buckets key on `doy` (leap-folded), and the x-axis must render doys in **window order** (`expandWindow` insertion order: startDoy..365 then 1..endDoy), not numeric 1..365 order — otherwise a wrapping window plots Jan before Dec. Use the ordered array `[...expandWindow(window)]` (Set preserves insertion order) as the x-axis category order.

**Verdict:** No new derived shape needed. The only new code is (a) a pure `percentile` + `perDoyDistribution` domain helper and (b) the panel/chart UI. Both are unit-testable in isolation.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `echarts` (à-la-carte) | 6.1.0 | boxplot (temp, wind) + bar (precip) in one panel | Locked in CONTEXT.md + STACK.md. First-class boxplot + bar series, canvas-fast for ≤366 points, tree-shakeable to keep bundle small. `[VERIFIED: npm registry — 6.1.0, modified 2026-05-19, 4.29M weekly dl, apache/echarts]` but see provenance note. |
| `suncalc` | 2.0.1 | Astronomical daylight (CHART-03), polar-aware | Tiny, ships own TS types, native `alwaysUp`/`alwaysDown` polar handling (critical at Iceland's latitude). `[VERIFIED: npm registry — 2.0.1, modified 2026-07-11, 235K weekly dl, mourner/suncalc]` but see provenance note. |

**Provenance note:** Both package names come from STACK.md/CONTEXT.md (project-authoritative) and were confirmed on the npm registry AND passed slopcheck `[OK]`. Registry existence alone is not proof; here the source is the project's own locked stack decision, so treat as approved. See Package Legitimacy Audit.

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@types/suncalc` | — | **NOT NEEDED** | suncalc 2.0.1 ships `index.d.ts` (bundled types incl. `alwaysUp`/`alwaysDown`, `sunrise: Date \| null`). Do NOT install `@types/suncalc` (it's a stale, separate v1.9.2 stub that would conflict). `[VERIFIED: unpacked suncalc-2.0.1 index.d.ts]` |
| `@types/echarts` | — | **NOT NEEDED / DEPRECATED** | echarts ships its own types; the `@types/echarts` stub is deprecated ("echarts provides its own type definitions, so you do not need this installed"). `[VERIFIED: npm view @types/echarts deprecated]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `boxplot` series | `candlestick` series | Candlestick is OHLC/financial with built-in up/down (green/red) coloring — exactly the semantics CONTEXT.md forbids. Boxplot is the honest 5-number-summary fit. Use boxplot. |
| suncalc dependency | Hand-rolled NOAA sunrise-equation | Hand-rolling risks the exact high-latitude NaN/acos-out-of-range bug (Iceland edges) that suncalc 2.0.1 already solves with `alwaysUp`/`alwaysDown`. Not worth re-deriving; suncalc is 1 tiny file, own types. |
| ECharts | Lightweight-Charts / uPlot | Rejected in STACK: LC is finance-only OHLC (fights bars + custom day-of-year axis); uPlot has no native boxplot (hand-roll). ECharts' unified boxplot+bar model wins. |

**Installation:**
```bash
cd site && npm install echarts@6.1.0 suncalc@2.0.1
```
(Both go in `site/package.json` `dependencies` — they are the site's first runtime deps beyond map libs. Do NOT install `@types/echarts` or `@types/suncalc`.)

**Version verification (all confirmed against npm registry 2026-07-20):**
- `echarts` → 6.1.0 (modified 2026-05-19), no postinstall script, repo `apache/echarts`.
- `suncalc` → 2.0.1 (modified 2026-07-11), no postinstall script, repo `mourner/suncalc`.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `echarts` | npm | first pub 2013; 6.1.0 (2026-05) | 4.29M/wk | github.com/apache/echarts | [OK] | Approved |
| `suncalc` | npm | created 2011-12; 2.0.1 (2026-07-11) | 235K/wk | github.com/mourner/suncalc | [OK] | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

- slopcheck ran successfully (`slopcheck install echarts suncalc` → "2 OK") — no CLI JSON flag exists, used text output.
- No `postinstall` script on either package (`npm view <pkg> scripts.postinstall` empty for both) — no network/filesystem side-effect risk.
- Both verified on the **npm** ecosystem (correct registry for this Node/Vite frontend) — no cross-ecosystem confusion.

## Architecture Patterns

### System Architecture Diagram

```
 [marker click] ──┐
                  ├──► store.set({ stationId }) ──► store "stationId" subscriber (main.ts)
 [ranked row] ────┘         (Phase 5 seam)              │
                                                        ├─► (existing) easeTo fly-to + setSelectedStation highlight
                                                        │
                                                        └─► NEW: openStationPanel(stationId)
                                                                   │
                          (first open) dynamic import('./ui/chartPanel.js') ──► ECharts chunk (lazy, split)
                                                                   │
   station's DerivedFile (already in the boot-time StationCache — NO fetch)
                                                                   │
                                                                   ▼
                        perDoyDistribution(file, window, yearRange, selector)   [pure domain helper]
                          decodeDerived → expandWindow → groupBySeasonYear
                          → yearRange filter → qualifyingYears → effectiveN(N>=3)
                          → per-doy bucket → percentile(p10/p50/p90)+min/max
                                                                   │
                        ┌──────────────┬───────────────┬──────────────────────┐
                        ▼              ▼               ▼                      ▼
                  temp boxplot    wind boxplot    precip bars           daylight readout
                  (or "engin      (or "engin      (or "án úrkomu"/      suncalc.getTimes
                   gögn")          gögn")          "engin gögn")        (polar-aware)
                        └──────────────┴───────────────┴──────────────────────┘
                                          │
                              plain-Icelandic reading key (per chart)
                                          │
                        [close affordance] ──► store.set({ stationId: null })
                                          │           └─► panel closes, ranked list restores, URL st clears
```

### Recommended Project Structure
```
site/src/
├── ui/
│   ├── stationPanel.ts      # NEW: panel shell — subscribes stationId, open/close, ranked-list yield, lazy-loads chartPanel
│   └── chartPanel.ts        # NEW: the lazy chunk — imports echarts/core à-la-carte, builds boxplot+bar options + daylight
├── data/ (or a domain helper in packages/domain)
│   └── distribution.ts      # NEW: pure perDoyDistribution + percentile (unit-tested; no DOM, no echarts)
└── styles/
    └── panel.css            # NEW: right-dock panel + reading-key + no-data styles (tokens.css vars)
```
Put `percentile` + `perDoyDistribution` in **`@betravedur/domain`** (pure, browser-safe, zero-dep) so it is unit-tested with the rest of the domain and reusable by the v1.x meðaltal/dreifing toggle. Keep all `echarts` imports isolated to `chartPanel.ts` (the lazy chunk) so nothing in the main bundle references echarts.

### Pattern 1: à-la-carte ECharts registration (in the lazy chunk only)
**What:** Import only the pieces used, register with `echarts.use`, keep types composed.
**When:** In `chartPanel.ts`, which is only reached via `import()`.
```typescript
// Source: https://echarts.apache.org/handbook/en/basics/import/ (CITED)
import * as echarts from "echarts/core";
import { BoxplotChart, BarChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  TitleComponent,
  DataZoomComponent, // only if horizontal scroll for long windows is wanted
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { ComposeOption } from "echarts/core";
import type { BoxplotSeriesOption, BarSeriesOption } from "echarts/charts";
import type {
  GridComponentOption,
  TooltipComponentOption,
  TitleComponentOption,
} from "echarts/components";

echarts.use([
  BoxplotChart, BarChart,
  GridComponent, TooltipComponent, TitleComponent, DataZoomComponent,
  CanvasRenderer,
]);

type ECOption = ComposeOption<
  | BoxplotSeriesOption | BarSeriesOption
  | GridComponentOption | TooltipComponentOption | TitleComponentOption
>;
```
Note: à-la-carte deliberately does NOT register `LegendComponent`/`ToolboxComponent`/`MarkLineComponent` etc. — every unregistered piece is tree-shaken out. The ~80–130KB gzip target (STACK) is met by keeping this list minimal.

### Pattern 2: boxplot with custom 5-number data + no directional color
**What:** Feed each box `[min, Q1, median, Q3, max]`; boxplot has NO up/down coloring (unlike candlestick), so just set a single neutral `itemStyle`.
```typescript
// Source: ECharts boxplot series docs + apache/echarts issue #18204 (CITED)
// perDoy from the domain helper; box uses p10/p50/p90 as [min,Q1,median,Q3,max]-shaped 5-number summary:
//   [min, p10, p50, p90, max]  -> box spans p10..p90, median line at p50, whiskers to min/max
const boxData = perDoy
  .filter((d) => !d.missing)
  .map((d) => [d.min, d.p10, d.p50, d.p90, d.max]);

const option: ECOption = {
  animation: false, // reduced-motion (see Pitfall 3 for conditional)
  xAxis: { type: "category", data: orderedDoyLabels /* Icelandic dd. mmm */ },
  yAxis: { type: "value" },
  tooltip: { trigger: "item" },
  series: [{
    type: "boxplot",
    data: boxData,
    itemStyle: { color: "var-resolved-warm-tone", borderColor: "…" }, // ONE neutral tone, no green/red
  }],
};
```
- Boxplot value order is `[min, Q1, median, Q3, max]`. We map our distribution as `[min, p10, p50, p90, max]` so the **box** is the 10th–90th band (per CONTEXT), the **median line** is p50, and **whiskers** reach true min/max. `[VERIFIED: WebSearch cross-checked ECharts boxplot data format]`
- **Do NOT use candlestick** — its `itemStyle.color`/`color0` are up/down financial colors, the exact semantics to avoid.

### Pattern 3: lazy-load the chart chunk (Vite automatic code-splitting)
**What:** `import()` splits `chartPanel.ts` (and its `echarts` deps) into a separate chunk fetched only on first panel open.
```typescript
// Source: https://vite.dev/guide/features (CITED — dynamic imports auto-split, no manualChunks needed)
let chartMod: typeof import("./chartPanel.js") | null = null;
async function ensureChartModule() {
  if (!chartMod) chartMod = await import("./chartPanel.js"); // separate chunk, incl. echarts
  return chartMod;
}
```
Vite automatically creates a separate chunk for dynamically imported modules — no `build.rollupOptions.output.manualChunks` config required. `[VERIFIED: vite.dev docs]` Verify with `npm run build` that the main bundle size is unchanged and a distinct `chartPanel-*.js` chunk appears containing echarts.

### Pattern 4: reuse the single stationId seam (no new state channel)
**What:** The panel is another `store.subscribe` consumer keyed on `stationId` — mirroring the existing fly-to subscriber (main.ts:216-228). Open on non-null, close on null. Closing = `store.set({ stationId: null })` (Phase 5 already clears the URL `st` param and marker highlight on deselect).
**Ranked-list yield:** when `stationId != null`, hide/collapse the ranked list (it already has a collapse mechanism from Phase 5); restore on close. Both dock right; never both expanded.

### Anti-Patterns to Avoid
- **Using `candlestick` series** for the distribution — brings financial up/down coloring. Use `boxplot`.
- **Importing `import * as echarts from "echarts"`** (the full build) — defeats the ~80–130KB target. Use `echarts/core` + explicit pieces.
- **Referencing echarts anywhere in the main bundle** (e.g. a type import in `main.ts`) — pulls it into the initial chunk. Keep ALL echarts references inside the lazy `chartPanel.ts`.
- **Importing `decodeDerived` from `@betravedur/pipeline` root** — pulls Node built-ins and breaks the browser bundle. Use the `@betravedur/pipeline/derive` subpath (as `averages.ts` does).
- **Re-fetching the station's derived file** on panel open — the boot-time `StationCache` already holds every `DerivedFile` (main.ts). Read from it; never fetch.
- **Plotting a wrapping window in numeric doy order** — use `[...expandWindow(window)]` insertion order for the x-axis.
- **A zero precip bar for a rain-less station** — missing precip must render as an explicit gap/label ("án úrkomu"/"engin gögn"), never 0 (mirrors the `averages.ts` rain-nullability discipline).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Box/whisker rendering per day-of-year | A custom SVG/canvas box-plot | ECharts `boxplot` series | Axis scaling, tooltips, whisker/box geometry, responsive resize — all free; CONTEXT already accepted the dep. |
| Sunrise/sunset at high latitude | NOAA sunrise-equation by hand | suncalc 2.0.1 | The acos-out-of-range NaN at Iceland's polar edges is a real, documented trap suncalc already solves with `alwaysUp`/`alwaysDown`. |
| Qualifying-years / coverage filter | New per-doy coverage logic | `qualifyingYears`/`effectiveN`/`groupBySeasonYear`/`expandWindow` | Already unit-tested, WR-03 wrap-correct, used by markers — reuse verbatim. |
| Derived decode | A new per-doy parser | `decodeDerived` (subpath) | Already browser-safe, quant-aware, null-preserving. |

**Key insight:** The distribution math is a thin reshape over already-proven domain primitives; only `percentile` is genuinely new. Rendering and astronomy are exactly the two places a hand-rolled solution silently breaks (axis edge cases; polar NaN) — both are covered by the two vetted deps.

## Runtime State Inventory

Not a rename/refactor/migration phase — greenfield UI + one pure helper + two new npm deps. Section omitted (no stored data, service config, OS-registered state, or build-artifact renames involved).

## Common Pitfalls

### Pitfall 1: Using candlestick and inheriting financial coloring
**What goes wrong:** Picking `candlestick` (the user's lay word) gives green/red up-vs-down bars — the exact semantics CONTEXT forbids, and it needs OHLC data not a 5-number summary.
**Why it happens:** "Candlestick" in the requirement is a shape metaphor, not the ECharts series name.
**How to avoid:** Use `boxplot`. Map distribution as `[min, p10, p50, p90, max]`, single neutral `itemStyle`.
**Warning signs:** `type: "candlestick"`, `color0`, up/down colors in the option.

### Pitfall 2: Polar-edge NaN in daylight at Iceland's latitude
**What goes wrong:** Near summer solstice (sun never sets) or winter solstice (never rises) at 63–67°N, naive `sunset - sunrise` on Invalid Dates yields NaN; a hand-rolled acos formula throws or NaNs.
**Why it happens:** The hour-angle equation has no solution when |cos H₀| > 1.
**How to avoid:** Use suncalc 2.0.1; **branch on `times.alwaysUp` / `times.alwaysDown` FIRST** (render "sólarhringsbirta" ≈ 24h / "engin dagsbirta" ≈ 0h) before computing `sunset - sunrise`. Also handle `sunrise`/`sunset === null`.
**Warning signs:** "NaN klst" or "Invalid Date" in the daylight readout for a June/December window.

### Pitfall 3: Reduced-motion not honored / animation left on
**What goes wrong:** Chart animates on open even when the user prefers reduced motion.
**Why it happens:** ECharts `animation` defaults to `true`.
**How to avoid:** Set `animation: false` when `matchMedia("(prefers-reduced-motion: reduce)").matches` (the same guard main.ts already uses for easeTo). Simplest honest default given CONTEXT says "disable chart animation" — consider `animation: false` unconditionally for these static distribution charts.
**Warning signs:** Boxes grow/slide in on panel open under reduced-motion.

### Pitfall 4: Wrapping-window x-axis mis-ordered
**What goes wrong:** A Dec→Jan window renders January boxes before December.
**Why it happens:** Sorting doys numerically (1..365) instead of window order.
**How to avoid:** Use `[...expandWindow(window)]` (insertion order: startDoy..365 then 1..endDoy) as the category axis order, and label with reconstructed Icelandic dates.
**Warning signs:** A visual discontinuity / time going backwards mid-axis for a wrapping selection.

### Pitfall 5: Canvas charts are invisible to screen readers
**What goes wrong:** ECharts renders to `<canvas>`; a screen reader sees nothing.
**Why it happens:** Canvas has no DOM semantics.
**How to avoid:** Enable ECharts built-in `aria: { enabled: true }` (auto-generates an aria-label description; add `aria.decal` if hue ever mattered — here it doesn't since encoding is positional). Additionally provide a visually-hidden data-table alternative (per-doy min/median/max) as the accessible fallback, since the reading key + table make the distribution readable without the canvas. `[CITED: ECharts aria option]`
**Warning signs:** No `aria-label` on the chart container; nothing announced on focus.

### Pitfall 6: echarts leaks into the main bundle
**What goes wrong:** A stray `import type { EChartsOption } from "echarts"` in `main.ts` or `stationPanel.ts` pulls echarts into the initial chunk, blowing the map load budget.
**Why it happens:** Even type-only imports can defeat splitting if not `import type` from the right subpath, or if a value import sneaks in.
**How to avoid:** Confine ALL echarts imports (value AND type) to `chartPanel.ts`; the panel shell references it only via `await import()`. Verify post-build that the entry chunk contains no echarts.
**Warning signs:** `npm run build` shows the main chunk jump by ~100KB+; no separate `chartPanel-*.js`.

### Pitfall 7: N-gate divergence between markers and panel
**What goes wrong:** The panel shows a confident distribution for a station/metric the markers muted as "ófullnægjandi gögn" (or vice versa).
**Why it happens:** Using a different coverage rule per-doy than the marker's per-window rule.
**How to avoid:** Gate each chart on the SAME `qualifyingYears(..., 0.8)` + `effectiveN` (N≥3) over the window as `computeMarkerDatum` — temp/wind/precip independently. Below the gate → "engin gögn fyrir þetta tímabil" (CHART-04). This keeps the panel's honesty identical to the map's.
**Warning signs:** A station muted on the map that nonetheless renders full boxes in the panel.

## Code Examples

### Daylight for the window (polar-safe)
```typescript
// Source: suncalc 2.0.1 index.d.ts (bundled types) + README (CITED)
import { getTimes } from "suncalc";
// Reconstruct a representative calendar date from the window (e.g. midpoint doy) for the
// display year; suncalc is date-based. Iterate window doys or use the midpoint per CONTEXT.
function daylightHours(date: Date, lat: number, lon: number):
  | { kind: "hours"; hours: number }
  | { kind: "polar-day" }
  | { kind: "polar-night" } {
  const t = getTimes(date, lat, lon);
  if (t.alwaysUp) return { kind: "polar-day" };     // ~24h — "sólarhringsbirta"
  if (t.alwaysDown) return { kind: "polar-night" }; // ~0h  — "nær engin dagsbirta"
  if (!t.sunrise || !t.sunset) return { kind: "polar-day" }; // defensive: null times
  const hours = (t.sunset.getTime() - t.sunrise.getTime()) / 3_600_000;
  return { kind: "hours", hours };
}
```

### Percentile (type-7 linear interpolation)
```typescript
// Pure, unit-testable. Assumes `sorted` ascending, non-empty.
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0]!;
  const rank = p * (sorted.length - 1);
  const lo = Math.floor(rank), hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (rank - lo) * (sorted[hi]! - sorted[lo]!);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@types/echarts` stub | echarts ships own types | echarts 5+ | Do not install the deprecated stub. |
| suncalc returns Invalid Date at poles | `alwaysUp`/`alwaysDown` flags + `null` times | suncalc 2.0.x | No NaN at Iceland's latitude if you branch on the flags. |
| Manual `manualChunks` for lazy chunks | Automatic dynamic-import splitting | Vite (current) | `import()` alone splits the chart chunk; no rollup config. |

**Deprecated/outdated:**
- `@types/echarts`, `@types/suncalc` — both superseded by bundled types; installing them risks version-skew type errors.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Percentile interpolation = type-7 linear (median at p50) | The Gate / Code Examples | Low — free choice per CONTEXT discretion; only affects exact box edges. Pin it in a unit test. |
| A2 | Precip "typical total per doy" = mean (or median) of `o.r` across qualifying years | The Gate | Low-Med — either is defensible; median is more robust to a single storm. Confirm with user/planner which. |
| A3 | Temp/wind box whiskers use min/max of per-day mean `t`/`f` across years (not `tn`/`tx`) | The Gate | Low — CONTEXT "kaldasta/hlýjasta dag" (coldest/warmest day) supports per-day mean min/max. |
| A4 | ~80–130KB gzip target is met by the minimal import set (boxplot+bar+grid+tooltip+title+canvas) | Standard Stack | Med — must be VERIFIED at build time (`npm run build`), not assumed. Add a size check task. |
| A5 | Daylight display uses the window midpoint doy (vs a range) | Daylight | Low — CONTEXT allows either ("range across the window, or the midpoint day"). |

## Open Questions

1. **Precip aggregation: mean vs median per doy?**
   - What we know: CONTEXT says "typical total across qualifying years"; both mean and median are honest.
   - What's unclear: which the user prefers.
   - Recommendation: default to **median** (robust to one wet year); expose the choice to the planner. Unit-test whichever is chosen.

2. **Daylight: single midpoint readout vs start/end range?**
   - What we know: CONTEXT permits either.
   - Recommendation: show the **range** (e.g. "16–18 klst dagsbirta") when the window spans a meaningful change, else the midpoint; keep the polar-flag branch.

3. **ECharts bundle size — actual gzip?**
   - What we know: STACK targets 80–130KB gzip for the à-la-carte tree.
   - What's unclear: the exact figure for THIS import set until built.
   - Recommendation: add a post-build verification task asserting the chart chunk is a separate file and within budget.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | Vite build | ✓ | (Vite 8 needs Node 20+) | — |
| npm | install echarts/suncalc | ✓ | — | — |
| echarts (npm) | CHART-01/02 | ✓ (installable, [OK]) | 6.1.0 | none needed |
| suncalc (npm) | CHART-03 | ✓ (installable, [OK]) | 2.0.1 | hand-rolled NOAA (NOT recommended) |

**Missing dependencies with no fallback:** none — both new deps install cleanly and passed slopcheck.
**Missing dependencies with fallback:** suncalc has a (dispreferred) hand-rolled fallback; not needed.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (unit) + Playwright 1.61.1 (E2E on preview build) |
| Config file | root `vitest` (workspace) + `site/playwright` (preview harness from Phase 4) |
| Quick run command | `npx vitest run` (unit) |
| Full suite command | `cd site && npx playwright test --project=chromium` (E2E) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHART-01 | Panel opens on stationId select; temp/wind box + precip bar canvases present; closes clearing stationId + URL st | e2e | `npx playwright test tests/e2e/panel.spec.ts` | ❌ Wave 0 |
| CHART-01 | `perDoyDistribution` reshapes decoded rows into per-doy 5-number summaries (qualifying-years filter, window order, wrap) | unit | `npx vitest run distribution` | ❌ Wave 0 |
| CHART-02 | `percentile` type-7 boundaries (p0=min, p100=max, p50=median, interpolation) | unit | `npx vitest run distribution` | ❌ Wave 0 |
| CHART-02 | Reading key text present; boxplot (not candlestick) series used; no directional color | e2e/unit | `npx playwright test tests/e2e/panel.spec.ts` | ❌ Wave 0 |
| CHART-03 | `daylightHours` normal + polar-day (June solstice) + polar-night (Dec solstice) at Iceland lat → no NaN | unit | `npx vitest run daylight` | ❌ Wave 0 |
| CHART-03 | Daylight readout renders in the panel (Icelandic label) | e2e | `npx playwright test tests/e2e/panel.spec.ts` | ❌ Wave 0 |
| CHART-04 | Below-N-gate metric → "engin gögn fyrir þetta tímabil"; rain-less station → precip no-data (never zero bar) | unit + e2e | `npx vitest run distribution` / panel.spec | ❌ Wave 0 |
| — | Lazy chunk: main bundle excludes echarts; separate chart chunk emitted | build | `cd site && npm run build` (inspect chunk list) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run <touched>` (fast; distribution/daylight helpers)
- **Per wave merge:** `npx vitest run` (full unit) + `cd site && npx playwright test --project=chromium`
- **Phase gate:** full unit + E2E green + `npm run build` clean (chunk split verified) + `tsc --noEmit -p site` clean (keep the zero-error site typecheck intact) before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `packages/domain/src/distribution.ts` (+ `.test.ts`) — `percentile` + `perDoyDistribution`, covers CHART-01/02/04 math. Add exports to the domain barrel.
- [ ] `site/src/ui/daylight.ts` (or domain) (+ `.test.ts`) — `daylightHours` incl. polar solstice edges, covers CHART-03.
- [ ] `site/tests/e2e/panel.spec.ts` — panel open/close, canvases present, reading key, daylight, no-data message, ranked-list yields/restores, URL `st` clears on close.
- [ ] Framework install: none — Vitest + Playwright already present. New deps install: `cd site && npm install echarts@6.1.0 suncalc@2.0.1`.

## Security Domain

`security_enforcement` not disabled in config → included.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Static site, no auth. |
| V3 Session Management | no | No sessions. |
| V4 Access Control | no | Public read-only data. |
| V5 Input Validation | yes | `stationId` from URL/click is a number used to index a cache; already validated by Phase 4/5 (`paramsToState` clamps). Defensive decode discipline (never throw on empty/all-null) continues (T-03-04). Chart data is numeric-only. |
| V6 Cryptography | no | None. |
| V7 Error Handling | yes | Panel must degrade to "engin gögn" on missing/malformed data, never white-screen (mirrors the marker per-station guard). |
| V11 Output Encoding (XSS) | yes | Station name + all Icelandic labels via `textContent` ONLY (the T-05-05 no-innerHTML gate established in Phase 5). ECharts renders to canvas (no HTML injection surface) — but any tooltip formatter returning a string must NOT interpolate untrusted HTML; prefer plain strings / avoid `formatter` HTML with station-derived text. |

### Known Threat Patterns for static TS + ECharts
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via station name in DOM/tooltip | Tampering | `textContent` for all DOM text; no `innerHTML`; keep tooltip formatters non-HTML or escape. |
| Supply-chain (new npm deps) | Tampering | slopcheck `[OK]` on both; pinned exact versions; no postinstall scripts; first-party repos. |
| Malformed derived file → panel crash | DoS | Reuse defensive decode (never throw); per-metric N-gate → no-data message. |

## Sources

### Primary (HIGH confidence)
- `pipeline/src/derive.ts`, `site/src/data/averages.ts`, `site/src/data/load.ts` — decoded shape, subpath import, boot-time cache (the gate answer). Direct read.
- `packages/domain/src/window.ts`, `coverage.ts`, `index.ts`, `types.ts` — reusable helpers + `StationMeta` lat/lon. Direct read.
- `site/src/state/store.ts`, `site/src/main.ts` — the `stationId` subscriber seam + no-refetch cache. Direct read.
- suncalc 2.0.1 unpacked `index.d.ts` + `suncalc.cjs` — native `alwaysUp`/`alwaysDown` polar handling (lines 178-179), bundled types. Direct inspection.
- `npm view echarts@6.1.0` / `suncalc@2.0.1` + `npm install` slopcheck run — versions, no postinstall, [OK]. Direct tool.
- https://echarts.apache.org/handbook/en/basics/import/ — à-la-carte import + `echarts.use` + `ComposeOption`. (CITED)
- https://vite.dev/guide/features — automatic dynamic-import code-splitting. (CITED)

### Secondary (MEDIUM confidence)
- ECharts boxplot data format `[min,Q1,median,Q3,max]` + custom `itemStyle` — WebSearch cross-checked against apache/echarts issue #18204 and multiple boxplot docs.
- suncalc high-latitude NaN history — GitHub issues #45/#70/#134 (confirms the risk the 2.0.1 flags now solve).

### Tertiary (LOW confidence)
- Exact à-la-carte gzip figure (~80–130KB) — from STACK; must be build-verified (A4).

## Metadata

**Confidence breakdown:**
- The Gate (client-side distributions): HIGH — read directly from derive.ts/averages.ts; the decoded shape carries per-(year,doy) daily values and the reuse path is proven.
- Standard stack (echarts/suncalc versions + legitimacy): HIGH — npm-verified, slopcheck [OK], suncalc source inspected for polar flags.
- Architecture (lazy split, boxplot, stationId seam): HIGH — Vite/ECharts docs + existing main.ts patterns.
- Pitfalls: HIGH — polar edge and candlestick-vs-boxplot are concretely evidenced.
- Bundle size figure: MEDIUM — target from STACK, needs a build-time check.

**Research date:** 2026-07-20
**Valid until:** 2026-08-19 (stable stack; echarts/suncalc/Vite all current)
