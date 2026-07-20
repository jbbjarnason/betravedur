---
phase: 06-station-chart-panel
reviewed: 2026-07-20T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - packages/domain/src/distribution.ts
  - site/src/data/daylight.ts
  - site/src/ui/stationPanel.ts
  - site/src/ui/chartPanel.ts
  - site/src/ui/rankedList.ts
  - site/src/main.ts
  - site/src/styles/panel.css
findings:
  critical: 1
  warning: 5
  info: 3
  total: 9
status: fixed
fixed_at: 2026-07-20T00:00:00Z
fixed_findings:
  - id: CR-01
    commits: [292c77e, c2f5b5c]
  - id: WR-01
    commits: [292c77e]
  - id: WR-02
    commits: [c2f5b5c]
  - id: WR-03
    commits: [c2f5b5c]
  - id: WR-04
    commits: [5ff7bc2]
  - id: WR-05
    commits: [292c77e]
  - id: IN-01
    commits: [7fd60ec]
notes: >
  CR-01, WR-01–05, IN-01 fixed in this consolidated pass. IN-02 (O(1) station
  index) and IN-03 (doyLabel boundary test) were out of the requested fix scope
  and remain as maintainability notes.
---

# Phase 6: Code Review Report

**Reviewed:** 2026-07-20T00:00:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** fixed

## Summary

Phase 6 adds the station chart panel: `distribution.ts` (pure per-doy percentile/median helpers), `daylight.ts` (polar-safe suncalc wrapper), `stationPanel.ts` (panel shell + lazy chart mount), `chartPanel.ts` (lazy ECharts boxplot/bar chunk), plus the rankedList yield seam and the main.ts marker-click/panel wiring.

Overall the code is careful and well-documented. The two new runtime deps (`echarts`, `suncalc`) are exact-pinned in `site/package.json` (6.1.0 / 2.0.1). The XSS surface is clean: the ECharts tooltip formatters interpolate only numeric values into plain strings, the station name reaches the DOM only via `textContent` / `aria-label` (not markup), and no chart code uses `innerHTML`. The percentile (type-7) math, the wrap-window bucketing reuse, and the polar branch order in `daylight.ts` are all correct.

The dominant defect is the ONE the E2E suite cannot catch: **ECharts instances are never disposed.** Every panel open, every station-to-station switch, and every re-open calls `echarts.init(container, ...)` on a fresh host and drops the returned instance on the floor. The old DOM is removed but the ECharts instance (its canvas, its global-resize registration, its render loop) is never `dispose()`d — a canvas/instance/listener leak that accumulates for the life of the tab. There is also no resize handling, so charts do not reflow with the panel/viewport.

## Critical Issues

### CR-01: ECharts instances are never disposed — canvas + instance + global-listener leak on every open/switch/re-open

> **FIXED** (292c77e render side + c2f5b5c lifecycle): `renderBoxplot`/`renderBars` now return a `ChartHandle` owning the ECharts instance + its ResizeObserver; the panel tracks every handle in `liveCharts` and disposes them in `teardown()` AND at the top of `open()` before any re-render, so no instance/canvas/global-registry entry outlives the panel. New E2E (`panel.spec.ts`) opens→closes→reopens and asserts the live-instance count returns to 0 and the document canvas count does not accumulate.

**File:** `site/src/ui/chartPanel.ts:343`, `site/src/ui/chartPanel.ts:414` (and the teardown/re-open paths in `site/src/ui/stationPanel.ts:300-313`)

**Issue:** `renderBoxplot` and `renderBars` both do:
```ts
const chart = echarts.init(container, undefined, { renderer: "canvas" });
chart.setOption(option);
```
The returned `EChartsType` is never stored and `chart.dispose()` is never called. `echarts.init` allocates a canvas, an internal render/animation context, and (in ECharts 6) registers the instance in a global registry for auto-resize/theme bookkeeping. When the panel closes (`teardown` → `panel.remove()`), and when a different station is selected (`open` → `panel.remove()` at line 313, then a fresh `renderChartInto` builds new hosts and calls `echarts.init` again), the previous ECharts instances are orphaned: their canvases are detached but the instances themselves stay alive and reachable from ECharts internals, so they are NOT garbage-collected. A user who clicks through N stations leaks up to 3×N live ECharts instances + canvases for the tab's lifetime.

`grep -n "dispose" site/src/**` returns zero hits in Phase-6 code; `echarts.dispose()` / `chart.dispose()` exist in the installed 6.1.0 types (`echarts.d.ts:1515,1536,1578`) but are unused. The passing E2E cannot see this — `panel.spec.ts` only asserts canvas presence/text and `window.__chartOptions`; nothing opens→closes→re-opens and asserts instance/canvas counts do not grow.

**Fix:** Have each render return its instance (or register it on the host) and dispose it on teardown/re-render. Minimal seam-preserving fix:
```ts
// chartPanel.ts — return the instance so the shell can own its lifecycle
export function renderBoxplot(container: HTMLElement, spec: BoxplotSpec): echarts.EChartsType | null {
  // ...
  const chart = echarts.init(container, undefined, { renderer: "canvas" });
  chart.setOption(option);
  (window.__chartOptions ??= []).push(option);
  // ...a11y...
  return chart;
}
```
```ts
// stationPanel.ts — track live instances and dispose them on close AND before every re-open
let liveCharts: Array<{ dispose(): void }> = [];
// in renderChartInto's .then(): const chart = mod.renderBoxplot(host, ...); if (chart) liveCharts.push(chart);
// in teardown() AND at the top of open() (before panel.remove()):
for (const c of liveCharts) c.dispose();
liveCharts = [];
```
Alternatively use `echarts.getInstanceByDom(host)?.dispose()` in teardown before removing hosts. Either way, no ECharts instance may outlive the panel node it was mounted into.

## Warnings

### WR-01: No resize handling — charts do not reflow with the panel or viewport

> **FIXED** (292c77e): `initChart` wires a `ResizeObserver` on the host that calls `chart.resize()`; it is disconnected in the same dispose path as the instance (CR-01). Guarded for headless/older runtimes.

**File:** `site/src/ui/chartPanel.ts:343,414`

**Issue:** ECharts sizes its canvas to the host's box at `init` time and does not auto-track element resizes; the app must call `chart.resize()` on layout changes. Neither chart wires a `ResizeObserver` on `.station-panel__chart-host` nor a `window` `resize` listener. On the `@media (max-width: 640px)` breakpoint the panel goes full-width (`panel.css:239-247`), but a chart initialized at 340px stays 340px wide — clipped/stretched until the panel is re-opened. Any viewport resize while the panel is open leaves stale-sized canvases.

**Fix:** After `echarts.init`, observe the host and resize (and disconnect the observer in the same dispose path as CR-01):
```ts
const ro = new ResizeObserver(() => chart.resize());
ro.observe(container);
// on dispose: ro.disconnect(); chart.dispose();
```
Guard `ResizeObserver` existence for the headless runtime if needed.

### WR-02: Focus does not return to the launcher on a station-to-station switch, and can return to a detached node

> **FIXED** (c2f5b5c): `open()` captures the launcher (`document.activeElement`) BEFORE detaching the old panel and only adopts it as `returnFocusTo` when it is a live, non-panel node — so a re-select returns focus to the original marker/row instead of dropping to `<body>`.

**File:** `site/src/ui/stationPanel.ts:496`, `site/src/ui/stationPanel.ts:307`

**Issue:** `open()` captures `returnFocusTo = document.activeElement` at line 496 — but only AFTER the new panel DOM has been built and appended (line 490) and just before `closeBtn.focus()`. On a station→station switch the panel is already open, so at the moment of capture the active element is the OLD panel's close button, which was already detached at line 313 (`if (panel) panel.remove()`). `returnFocusTo` is therefore a removed node; `teardown` guards with `document.contains(returnFocusTo)` (line 307) so focus silently falls to `<body>` instead of returning to the marker pill / ranked row that launched the panel. The "return focus to trigger" intent is lost for the common re-select case. (First open from a marker/row works because the launcher is still the active element at capture time.)

**Fix:** Capture the launcher BEFORE rebuilding the DOM, and only overwrite it on a genuine open (not a switch):
```ts
const open = (stationId: number): void => {
  const launcher = (document.activeElement as HTMLElement | null) ?? null;
  if (panel) panel.remove();
  // ...build panel...
  document.body.appendChild(section);
  panel = section;
  // Only set returnFocusTo when it points at a live, non-panel element.
  if (launcher && !section.contains(launcher) && document.contains(launcher)) {
    returnFocusTo = launcher;
  }
  closeBtn.focus();
};
```

### WR-03: No focus trap — Tab escapes the modal-style panel to the map/DOM behind it

> **FIXED** (c2f5b5c): the panel `keydown` handler now traps `Tab`/`Shift+Tab`, cycling focus at the first/last focusable (falling back to the panel container) so keyboard/SR users stay within the panel until they close it.

**File:** `site/src/ui/stationPanel.ts:483-498`

**Issue:** The panel behaves like a modal (it yields the ranked list, moves focus in, closes on Escape) but installs no focus trap. Only `Escape` is handled (line 483-488); `Tab`/`Shift+Tab` are free to move focus out of the panel into the map canvas, the control bar, and the (hidden-but-not-inert) rest of the page. A keyboard/SR user tabbing forward leaves the panel without closing it, landing on controls behind an overlay that visually occludes them. The ranked list is hidden via `hidden` (inert), but the map and control bar are not.

**Fix:** Either trap Tab within the panel (cycle first/last focusables) or mark the rest of the app `inert`/`aria-hidden` while the panel is open and restore on close. A minimal trap:
```ts
section.addEventListener("keydown", (ev) => {
  if (ev.key !== "Tab") return;
  const f = section.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])');
  if (f.length === 0) return;
  const first = f[0], last = f[f.length - 1];
  if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
  else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
});
```

### WR-04: Per-doy box rendered from a single value shows false precision (no per-doy N floor)

> **FIXED** (5ff7bc2): added a per-doy `MIN_PER_DOY = 3` floor in `distribution.ts` — a doy backed by fewer than 3 qualifying-year values is emitted as `{ doy, missing:true }` (an explicit gap) in BOTH `perDoyDistribution` and `perDoyPrecip`, never a degenerate min==p50==max box/bar. New unit tests pin the floor (2 values → gap, 3 → renders) for boxes and bars.

**File:** `packages/domain/src/distribution.ts:117-133`

**Issue:** The N≥3 gate is applied only at the STATION level (`effectiveN(qYears)` in `bucketByDoy`, line 80). Per doy, any bucket with ≥1 value renders a full 5-number box. A doy that happens to have exactly one qualifying-year observation produces `min == p10 == p50 == p90 == max` (`percentile` returns `sorted[0]` for a length-1 array, line 53) — a visually "confident" zero-width box drawn from a single sample, indistinguishable from a doy backed by many years. The station passes the gate (≥3 qualifying years overall), but individual doys inside the window can be backed by far fewer values (a year qualifies at 80% window coverage, so a given doy may be present in only one of the qualifying years). This undercuts the RESEARCH Pitfall 7 "coverage honesty" the module is designed to enforce: the box edges imply a distribution that does not exist for that day.

**Fix:** Decide the intended contract and encode it. If a per-doy floor is intended, treat a doy with `vals.length < K` (e.g. `< 3`) as `{ doy, missing: true }` rather than a degenerate box:
```ts
if (!vals || vals.length < MIN_PER_DOY) { perDoy.push({ doy, missing: true }); continue; }
```
If single-value boxes ARE intended, document it explicitly in the `PerDoyBox` contract so the "honesty" claim is not overstated. Same consideration applies to `perDoyPrecip` (a single-year median is just that year's value).

### WR-05: Boxplot tooltip formatter silently returns empty on any value array shorter than 6 — brittle coupling to an internal ECharts param shape

> **FIXED** (292c77e): the tooltip formatter now reads `params.data` (the source `[min,p10,p50,p90,max]` array we supplied) with an explicit 5-length/`"-"` guard, instead of ECharts' internal dimension-prefixed processed `value`.

**File:** `site/src/ui/chartPanel.ts:303-315`

**Issue:** The tooltip formatter assumes `params.value` is the 6-element `[categoryIndex, min, Q1, median, Q3, max]` array ECharts builds internally for a boxplot item, and bails to `""` if `v.length < 6` (line 306). This is an undocumented internal shape: ECharts hands the boxplot tooltip the *processed* value (dimension-prefixed with the category index), not the source `[min,p10,p50,p90,max]`. If a future ECharts minor changes how boxplot tooltip values are shaped (or if `trigger`/`dimensions` config changes), the guard silently produces a blank tooltip rather than a visible error — a degradation the E2E (which asserts option shape, not rendered tooltip text) will not catch. The `!` non-null assertions on `med!/q1!/q3!/min!/max!` (lines 311-313) also assume the destructure succeeded.

**Fix:** Make the mapping explicit and defensive against both the 5- and 6-length shapes, and prefer reading from `params.data` (the source array you supplied) rather than the processed `value`:
```ts
formatter: (params: unknown) => {
  const p = params as { name?: string; data?: (number | "-")[] };
  const d = p.data;
  if (!Array.isArray(d) || d.length < 5 || d.some((x) => x === "-")) return "";
  const [min, q1, med, q3, max] = d as number[];
  return /* ... */;
}
```
This ties the tooltip to the data YOU passed, not ECharts' internal reshaping.

## Info

### IN-01: Root `package.json` uses caret ranges for the two new deps while `site/package.json` pins exact

> **FIXED** (7fd60ec): root `package.json` now pins `echarts: 6.1.0` and `suncalc: 2.0.1` exactly, matching the site workspace; the lockfile was regenerated (`--package-lock-only`, resolved versions unchanged).

**File:** `package.json:29`, `package.json:32`

**Issue:** The site workspace pins exactly (`echarts: 6.1.0`, `suncalc: 2.0.1` in `site/package.json:17,20`), matching the STACK.md contract, but the repo-root `package.json` declares `"echarts": "^6.1.0"` and `"suncalc": "^2.0.1"`. The caret ranges allow a root install to resolve a different (newer) minor/patch than the pinned site build, a supply-chain/reproducibility smell for deps the project explicitly version-pinned. (A lockfile may constrain this in practice, but the manifests disagree.)

**Fix:** Pin the root manifest to the same exact versions (`"echarts": "6.1.0"`, `"suncalc": "2.0.1"`) so both manifests agree, or hoist the dependency to a single manifest to avoid duplication.

### IN-02: `latestData.find(...)` scans the full array on every marker/row select

**File:** `site/src/main.ts:248`, `site/src/ui/stationPanel.ts:323`

**Issue:** Both the fly-to subscriber and the panel open path resolve a station by `getLatestData().find(d => d.station === id)`. Correct, but noted for maintainability: the marker-datum snapshot is rebuilt each recompute and could be indexed by station id once for O(1) lookups if the station set grows. (Performance is explicitly out of v1 review scope — flagged as a maintainability note only, not a defect.)

### IN-03: `refDate` mutates via `setUTCDate` past a month boundary — relies on JS Date rollover, worth an assertion

**File:** `site/src/ui/stationPanel.ts:76-80`, `site/src/ui/chartPanel.ts:92-96`

**Issue:** Both `refDate`/`doyLabel` build a Jan-1-2001 UTC date then `setUTCDate(foldDoy(doy))` with values up to 365. This relies on `Date.prototype.setUTCDate` rolling a day-of-month of e.g. 200 forward across months/the year — which JS does correctly, but it is a non-obvious idiom repeated in two files with no test pinning the boundary (doy 365 → 31 Dec, doy 60 → 1 Mar in the non-leap 2001 reference). Since 2001 is non-leap, doy 365 maps to 31 Dec correctly; a leap reference year would shift labels by one day after Feb.

**Fix:** No behavior change needed, but add a unit test pinning `doyLabel(1) === "1. jan"`, `doyLabel(365) === "31. des"`, `doyLabel(60) === "1. mar"` so a future refactor of the reference year cannot silently shift every date label. Consider extracting the shared `foldDoy`+date logic into one helper rather than duplicating it across `stationPanel.ts` and `chartPanel.ts`.

---

_Reviewed: 2026-07-20T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
