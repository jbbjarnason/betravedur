// The LAZY ECharts chunk (Phase 6, CHART-01/02) — reached ONLY via a dynamic
// `import("./chartPanel.js")` from the stationPanel `renderChartInto` seam, so Vite code-splits
// ECharts (and this module) OUT of the entry/main bundle. Nothing in main.ts / stationPanel.ts
// imports echarts (value OR type) — the build-size gate (panel.spec) asserts the entry chunk is
// echarts-free (RESEARCH Pitfall 6 / A4). ALL echarts references are confined to THIS file.
//
// À-LA-CARTE ONLY (RESEARCH Pattern 1 — minimal tree for the ~80–130KB gzip target): echarts/core
// + BoxplotChart + BarChart + GridComponent + TooltipComponent + TitleComponent + CanvasRenderer,
// registered via echarts.use(). NEVER `import * as echarts from "echarts"` (the full build defeats
// the size target and is grep-gated to 0).
//
// SEMANTICS: temp/wind render an ECharts BOXPLOT series (deliberately NOT the finance OHLC series,
// which carries the green/red up/down coloring CONTEXT forbids). Each box is [min, p10, p50, p90,
// max]: the box spans p10..p90, the median line sits at p50, the whiskers reach true min/max. ONE
// neutral itemStyle (the resolved --chart-temp / --chart-wind hex) — no directional up/down tone.
// Precip renders BARS (per-doy median total, --chart-precip); a missing doy is an explicit GAP
// (null datum), NEVER a zero-height bar (a zero would falsely claim "measured, and it was dry").
//
// A11Y (RESEARCH Pitfall 5): the canvas is opaque to screen readers, so every render ALSO writes a
// visually-hidden per-figure distribution summary + a hidden per-day table, and sets the chart
// container role="img" + aria-label mirroring the summary. ECharts `aria.enabled` is on too.
// Reduced-motion → `animation: false` (the charts are static; disabling is honest and cheap).
// Tooltips use an ECharts formatter returning PLAIN Icelandic strings — never interpolated HTML
// (T-06-07 / V11: the numeric values + fixed labels only, no station-derived HTML injection).
import * as echarts from "echarts/core";
import { BoxplotChart, BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent, TitleComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { ComposeOption } from "echarts/core";
import type { BoxplotSeriesOption, BarSeriesOption } from "echarts/charts";
import type {
  GridComponentOption,
  TooltipComponentOption,
  TitleComponentOption,
} from "echarts/components";
import type { PerDoyBox, PerDoyBar } from "@betravedur/domain";

echarts.use([
  BoxplotChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  TitleComponent,
  CanvasRenderer,
]);

/** The composed option type for the minimal registered set (no legend/toolbox/markline). */
type ECOption = ComposeOption<
  | BoxplotSeriesOption
  | BarSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | TitleComponentOption
>;

/**
 * The rendered chart options are recorded on `window.__chartOptions` so the E2E can assert the
 * built option shape (criterion 12: `animation: false` under reduced-motion) without reading the
 * canvas pixels. Reset per panel open by the seam before it renders the figures.
 */
declare global {
  interface Window {
    __chartOptions?: ECOption[];
  }
}

/** Icelandic month abbreviations for short-date tick labels (`d. mmm`). */
const IS_MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "maí",
  "jún",
  "júl",
  "ágú",
  "sep",
  "okt",
  "nóv",
  "des",
] as const;

/** Fold any integer doy into 1..365 (mirrors the stationPanel/domain leap-folded range). */
function foldDoy(doy: number): number {
  return ((((doy - 1) % 365) + 365) % 365) + 1;
}

/**
 * Short Icelandic date label for a leap-folded doy, using the fixed non-leap 2001 reference year
 * (the same reference stationPanel/scrubber use). Pure day→"d. mmm" — no locale dependency.
 */
function doyLabel(doy: number): string {
  const d = new Date(Date.UTC(2001, 0, 1));
  d.setUTCDate(foldDoy(doy));
  return `${d.getUTCDate()}. ${IS_MONTHS[d.getUTCMonth()]}`;
}

/**
 * Icelandic comma-decimal number (deterministic, matching stationPanel.formatIce / formatScore).
 * A locale formatter is deliberately NOT used — `Intl.NumberFormat("is-IS")` falls back to a DOT
 * separator in ICU builds without full is-IS data (observed in the headless test runtime), which
 * would silently emit "18.8". We own the separator so every panel number is comma-decimal
 * (criterion 13), never locale-dependent.
 */
function formatIce(n: number, digits: number): string {
  return n.toFixed(digits).replace(".", ",");
}

/** Resolve a CSS custom-property hex from :root (ECharts options take colors, not `var()` strings). */
function resolveToken(name: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || "#5B6670"; // defensive fallback to a neutral muted-ink-ish tone
}

/** The app font stack, resolved so ECharts text matches the app's type system (never ECharts default). */
function resolveFontFamily(): string {
  return resolveToken("--font-stack") || "sans-serif";
}

/** True when the user prefers reduced motion (charts are static → `animation:false`). */
function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Thin category tick labels at wide windows so date ticks don't collide (every Nth). */
function tickInterval(count: number): number {
  if (count <= 8) return 0; // show all
  return Math.ceil(count / 8) - 1; // ~8 labels max across the axis
}

/** A visually-hidden element (off-screen, still in the a11y tree) carrying the text alternative. */
function buildVisuallyHidden(tag: string): HTMLElement {
  const el = document.createElement(tag);
  const s = el.style;
  s.position = "absolute";
  s.width = "1px";
  s.height = "1px";
  s.padding = "0";
  s.margin = "-1px";
  s.overflow = "hidden";
  s.clip = "rect(0 0 0 0)";
  s.whiteSpace = "nowrap";
  s.border = "0";
  return el;
}

/** Shared spec for both chart builders: the per-figure aria label prefix + resolved tone. */
export interface BoxplotSpec {
  /** Per-doy 5-number boxes (window insertion order, wrap-correct), some possibly `missing`. */
  perDoy: PerDoyBox[];
  /** Y-axis unit label (`°C` / `m/s`). */
  unit: string;
  /** The resolved series hex tone (from --chart-temp / --chart-wind). */
  tone: string;
  /** Metric name in Icelandic for the aria summary (`Hiti` / `Vindur`). */
  metricLabel: string;
  /** True for wind (zero-floored y-axis; wind is never below 0). */
  zeroFloor?: boolean;
}

export interface BarsSpec {
  /** Per-doy median precip bars (window order), some possibly `missing` (explicit gap). */
  perDoy: PerDoyBar[];
  /** The resolved bar hex tone (from --chart-precip). */
  tone: string;
  /** Metric name in Icelandic for the aria summary (`Úrkoma`). */
  metricLabel: string;
}

/** Common ECharts grid + axis text styling (compact, app font, muted ticks). */
function baseGridAndText(fontFamily: string): {
  grid: GridComponentOption;
  tickTextStyle: { color: string; fontFamily: string; fontSize: number };
} {
  return {
    grid: { left: 44, right: 12, top: 12, bottom: 28, containLabel: false },
    tickTextStyle: { color: resolveToken("--muted-ink"), fontFamily, fontSize: 11 },
  };
}

/**
 * Compute an aria distribution summary for a boxplot metric from its non-missing boxes: the
 * typical p10–p90 band, the median-of-medians "dæmigerður dagur", and the overall min→max reach.
 * Plain Icelandic, comma-decimal — the text alternative for the opaque canvas (criterion 14).
 */
function boxplotAriaSummary(spec: BoxplotSpec): string {
  const boxes = spec.perDoy.filter((d): d is Extract<PerDoyBox, { min: number }> => !d.missing);
  if (boxes.length === 0) return `${spec.metricLabel}: engin gögn fyrir þetta tímabil.`;
  const min = Math.min(...boxes.map((b) => b.min));
  const max = Math.max(...boxes.map((b) => b.max));
  const p10 = boxes.reduce((s, b) => s + b.p10, 0) / boxes.length;
  const p90 = boxes.reduce((s, b) => s + b.p90, 0) / boxes.length;
  const medians = boxes.map((b) => b.p50).sort((a, b) => a - b);
  const median = medians[Math.floor(medians.length / 2)]!;
  const u = spec.unit;
  return (
    `${spec.metricLabel}: dæmigert bil ${formatIce(p10, 1)}–${formatIce(p90, 1)} ${u}, ` +
    `dæmigerður dagur ${formatIce(median, 1)} ${u}, frá ${formatIce(min, 1)} ${u} til ` +
    `${formatIce(max, 1)} ${u} yfir tímabilið.`
  );
}

/** Aria summary for the precip bars: typical daily total + the reach across the window. */
function barsAriaSummary(spec: BarsSpec): string {
  const bars = spec.perDoy.filter((d): d is Extract<PerDoyBar, { value: number }> => !d.missing);
  if (bars.length === 0) return `${spec.metricLabel}: engin gögn fyrir þetta tímabil.`;
  const vals = bars.map((b) => b.value).sort((a, b) => a - b);
  const median = vals[Math.floor(vals.length / 2)]!;
  const max = vals[vals.length - 1]!;
  return (
    `${spec.metricLabel}: dæmigerð dagsúrkoma ${formatIce(median, 1)} mm, ` +
    `mest ${formatIce(max, 1)} mm yfir tímabilið.`
  );
}

/**
 * Write the accessible text alternative into a chart container: set role="img" + an aria-label
 * mirroring the summary, and append a visually-hidden per-day <table> so a screen-reader user gets
 * the numbers the canvas draws (criterion 14 — the canvas is never the sole data carrier).
 */
function attachA11y(
  container: HTMLElement,
  summary: string,
  headers: string[],
  rows: Array<Array<string>>,
): void {
  container.setAttribute("role", "img");
  container.setAttribute("aria-label", summary);

  const table = buildVisuallyHidden("table") as HTMLTableElement;
  const thead = document.createElement("thead");
  const htr = document.createElement("tr");
  for (const h of headers) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = h;
    htr.appendChild(th);
  }
  thead.appendChild(htr);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  for (const r of rows) {
    const tr = document.createElement("tr");
    for (const cell of r) {
      const td = document.createElement("td");
      td.textContent = cell;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  container.appendChild(table);
}

/** The empty/failure text (defensive) — a muted line, never an empty chart (matches Plan 02). */
function writeNoData(container: HTMLElement): void {
  container.textContent = "";
  const p = document.createElement("p");
  p.className = "station-panel__nodata";
  p.textContent = "engin gögn fyrir þetta tímabil";
  container.appendChild(p);
}

/**
 * Render a distribution BOXPLOT (temp / wind) into `container` from the per-doy 5-number boxes.
 * Single neutral tone (no directional coloring); category x-axis in window order with thinned
 * Icelandic date labels; `animation:false` under reduced-motion; a11y summary + hidden table.
 * Records the built option on window.__chartOptions. Defensive: empty → the no-data line.
 */
export function renderBoxplot(container: HTMLElement, spec: BoxplotSpec): void {
  const boxes = spec.perDoy;
  const present = boxes.filter((d): d is Extract<PerDoyBox, { min: number }> => !d.missing);
  if (present.length === 0) {
    writeNoData(container);
    return;
  }

  const fontFamily = resolveFontFamily();
  const { grid, tickTextStyle } = baseGridAndText(fontFamily);

  // Category axis in window insertion order. ECharts' empty-value marker `"-"` for a missing doy
  // → an explicit gap (no box drawn) so a missing doy never draws a fake box.
  const labels = boxes.map((d) => doyLabel(d.doy));
  // A missing doy is the 5-slot ECharts empty-value marker `["-","-","-","-","-"]` → an explicit
  // gap (no box drawn); a present doy is the 5-number value array [min,p10,p50,p90,max]. ECharts'
  // `BoxplotDataValue` is `(number | "-")[]`, so the empty marker keeps the categories aligned.
  const GAP = ["-", "-", "-", "-", "-"] as Array<number | "-">;
  const data: Array<Array<number | "-">> = boxes.map((d) =>
    d.missing ? GAP : [d.min, d.p10, d.p50, d.p90, d.max],
  );
  const unit = spec.unit;

  const option: ECOption = {
    animation: !prefersReducedMotion(),
    aria: { enabled: true },
    grid,
    tooltip: {
      trigger: "item",
      // PLAIN string formatter — no HTML injection of any station-derived text (V11). ECharts
      // passes the boxplot 5-number value array; we format the numbers only.
      formatter: (params: unknown) => {
        const p = params as { name?: string; value?: number[] };
        const v = p.value;
        if (!Array.isArray(v) || v.length < 6) return "";
        // boxplot value array is [categoryIndex, min, Q1, median, Q3, max] in ECharts params.
        const [, min, q1, med, q3, max] = v as number[];
        return (
          `${p.name ?? ""}\n` +
          `dæmigerður: ${formatIce(med!, 1)} ${unit}\n` +
          `bil: ${formatIce(q1!, 1)}–${formatIce(q3!, 1)} ${unit}\n` +
          `lægst–hæst: ${formatIce(min!, 1)}–${formatIce(max!, 1)} ${unit}`
        );
      },
    },
    xAxis: {
      type: "category",
      data: labels,
      axisLabel: { ...tickTextStyle, interval: tickInterval(labels.length) },
      axisLine: { lineStyle: { color: resolveToken("--hairline") } },
    },
    yAxis: {
      type: "value",
      name: unit,
      nameTextStyle: tickTextStyle,
      min: spec.zeroFloor ? 0 : undefined,
      axisLabel: tickTextStyle,
      splitLine: { lineStyle: { color: resolveToken("--hairline") } },
    },
    series: [
      {
        type: "boxplot",
        data,
        // ONE neutral tone — the box fill (reduced-alpha via ECharts opacity), median + whiskers
        // in the full-opacity tone. No second directional tone, no up/down. Distribution, not finance.
        itemStyle: { color: spec.tone, borderColor: spec.tone, opacity: 0.85 },
        boxWidth: [10, 40],
      },
    ],
  };

  const chart = echarts.init(container, undefined, { renderer: "canvas" });
  chart.setOption(option);
  (window.__chartOptions ??= []).push(option);

  // A11y: aria-label summary + a visually-hidden per-day min/median/max table.
  const summary = boxplotAriaSummary(spec);
  const rows = present.map((b) => [
    doyLabel(b.doy),
    formatIce(b.min, 1),
    formatIce(b.p50, 1),
    formatIce(b.max, 1),
  ]);
  attachA11y(container, summary, ["Dagur", `Lægst (${unit})`, `Dæmigert (${unit})`, `Hæst (${unit})`], rows);
}

/**
 * Render a precip BAR chart (per-doy median total) into `container`. A missing doy is a `null`
 * datum → an explicit GAP (no bar), never a zero-height bar. Single --chart-precip tone;
 * `animation:false` under reduced-motion; a11y summary + hidden table. Defensive: empty → no-data.
 */
export function renderBars(container: HTMLElement, spec: BarsSpec): void {
  const bars = spec.perDoy;
  const present = bars.filter((d): d is Extract<PerDoyBar, { value: number }> => !d.missing);
  if (present.length === 0) {
    writeNoData(container);
    return;
  }

  const fontFamily = resolveFontFamily();
  const { grid, tickTextStyle } = baseGridAndText(fontFamily);

  const labels = bars.map((d) => doyLabel(d.doy));
  // ECharts' empty-value marker `"-"` for a missing doy → an explicit gap (no bar), NEVER a 0
  // (which would falsely claim "measured, and it was dry").
  const data: Array<number | "-"> = bars.map((d) => (d.missing ? "-" : d.value));

  const option: ECOption = {
    animation: !prefersReducedMotion(),
    aria: { enabled: true },
    grid,
    tooltip: {
      trigger: "item",
      formatter: (params: unknown) => {
        const p = params as { name?: string; value?: number | null };
        if (p.value == null) return `${p.name ?? ""}\núrkoma ekki mæld`;
        return `${p.name ?? ""}\n${formatIce(p.value, 1)} mm`;
      },
    },
    xAxis: {
      type: "category",
      data: labels,
      axisLabel: { ...tickTextStyle, interval: tickInterval(labels.length) },
      axisLine: { lineStyle: { color: resolveToken("--hairline") } },
    },
    yAxis: {
      type: "value",
      name: "mm",
      nameTextStyle: tickTextStyle,
      min: 0,
      axisLabel: tickTextStyle,
      splitLine: { lineStyle: { color: resolveToken("--hairline") } },
    },
    series: [
      {
        type: "bar",
        data,
        itemStyle: { color: spec.tone },
      },
    ],
  };

  const chart = echarts.init(container, undefined, { renderer: "canvas" });
  chart.setOption(option);
  (window.__chartOptions ??= []).push(option);

  const summary = barsAriaSummary(spec);
  const rows = present.map((b) => [doyLabel(b.doy), formatIce(b.value, 1)]);
  attachA11y(container, summary, ["Dagur", "Úrkoma (mm)"], rows);
}
