// The station detail panel SHELL (Phase 6, CHART-01/03/04) — the thinnest vertical slice that
// makes "click a station → a right-side panel opens; close → it closes and the ranked list
// restores" real, wired to the single Phase-5 `stationId` selection seam.
//
// This plan (06-02) renders EVERYTHING that does NOT need ECharts, immediately from data already
// in the boot StationCache (ZERO data fetch — E2E asserts no /data/ request on open):
//   - the header (station name via textContent + a `Loka` close button, ≥44px, ink focus ring),
//   - three titled chart FIGURES (Hiti / Vindur / Úrkoma) whose slots show either the
//     `hleð riti…` stub (a sufficient metric — Plan 03 fills the seam with a real chart) or the
//     appropriate no-data text (CHART-04 three-granularity honesty),
//   - the mandatory per-chart plain-Icelandic reading key (real DOM text so AT reads it),
//   - the daylight readout (polar-safe, comma-decimal `klst.`) — data-INDEPENDENT, so it renders
//     even for a station with no weather data at all.
//
// DISCIPLINES:
//   * NO fetch — reads the cache (`StationCacheEntry.file`, decoded once here) + the MarkerDatum
//     from getLatestData() (for the hasPrecip honesty gate). recompute never re-runs the network.
//   * NO string-HTML injection — every node via createElement/createElementNS + textContent
//     (T-06-04 XSS / the continued T-05-05 grep gate on the station-name path).
//   * Coverage honesty mirrors the map: per-metric sufficiency comes from perDoyDistribution over
//     the SAME window+yearRange the markers use (RESEARCH Pitfall 7) — a metric the markers muted
//     as "ófullnægjandi gögn" can never render a confident chart here.
//   * The `renderChartInto` seam is a STUB in this plan (writes `hleð riti…`); Plan 03 replaces it
//     with a dynamic import('./chartPanel.js') that mounts the ECharts canvas.
import { decodeDerived } from "@betravedur/pipeline/derive";
import {
  perDoyDistribution,
  perDoyPrecip,
  type DailyObservation,
  type PerDoyBox,
  type PerDoyBar,
  type DistributionResult,
  type PrecipResult,
} from "@betravedur/domain";
import { anchorToWindow } from "../data/window.js";
import { daylightHours, type DaylightResult } from "../data/daylight.js";
import { attachSheet, MOBILE_QUERY } from "./bottomSheet.js";
import type { SelectionStore } from "../state/store.js";
import type { StationCache } from "../state/recompute.js";
import type { RankedListHandle } from "./rankedList.js";
import type { MarkerDatum } from "../data/types.js";

/** Copy — UI-SPEC Copywriting Contract, final Icelandic strings (verbatim). */
const COPY = {
  close: "Loka spjaldi",
  dragHandle: "Stækka eða minnka spjald",
  daylightLabel: "Dagsbirta",
  daylightUnit: "klst.",
  chartTitles: { temp: "Hiti", wind: "Vindur", precip: "Úrkoma" },
  readingKeys: {
    temp: "Kassinn sýnir hitann sem 8 af hverjum 10 dögum lentu í; línan í miðjunni er dæmigerður dagur og strikin sýna kaldasta og hlýjasta dag.",
    wind: "Kassinn sýnir vindstyrkinn sem 8 af hverjum 10 dögum lentu í; línan í miðjunni er dæmigerður dagur og strikin sýna hægasta og hvassasta dag.",
    precip:
      "Súlurnar sýna dæmigerða úrkomu hvers dags yfir árin; eyða þýðir að úrkoma var ekki mæld, ekki að það hafi verið þurrt.",
  },
  noData: "engin gögn fyrir þetta tímabil",
  precipNoGauge: "engin úrkomumæling á þessari stöð",
  emptyHeading: "Engin gögn",
  emptyBody:
    "Þessi stöð hefur engin gögn fyrir valið tímabil. Prófaðu annað tímabil eða víðara árabil.",
  chartLoading: "hleð riti…",
  // Polar daylight copy (research permitted Claude's discretion on exact Icelandic wording):
  polarDay: "sólarhringsbirta",
  polarNight: "nær engin dagsbirta",
} as const;

/** Fold any integer day-of-year into 1..365 (the domain's leap-folded doy range). */
function foldDoy(doy: number): number {
  return ((((doy - 1) % 365) + 365) % 365) + 1;
}

/**
 * Map a folded doy onto a UTC calendar Date in the fixed NON-leap 2001 reference year — the same
 * reference the scrubber uses (site/src/ui/scrubber.ts refDate), so the daylight date matches the
 * window label the user reads. The astronomical daylight depends only on the doy (day of the
 * tropical year), so the reference year is immaterial beyond keeping doy↔date consistent.
 */
function refDate(doy: number): Date {
  const d = new Date(Date.UTC(2001, 0, 1));
  d.setUTCDate(foldDoy(doy));
  return d;
}

/**
 * The window's MIDPOINT doy (UI-SPEC "midpoint is simpler and honest for a short window"). Uses
 * the folded endpoints; for a wrapping window the midpoint is computed along the wrap so a
 * Dec→Jan window's midpoint lands inside the window, not on the far side of the year.
 */
function midpointDoy(anchorDoy: number, widthDays: number): number {
  // The window spans widthDays inclusive days starting at anchorDoy; its centre is
  // anchor + (widthDays-1)/2, folded back into 1..365 (wrap-correct).
  return foldDoy(Math.round(anchorDoy + (widthDays - 1) / 2));
}

/**
 * Icelandic comma-decimal number. Iceland uses a COMMA decimal separator; we format the fixed-
 * digit value and swap the decimal point for a comma deterministically (matching the map badge's
 * `formatScore`). A locale formatter is deliberately NOT used here: `Intl.NumberFormat("is-IS")`
 * falls back to a DOT separator in ICU builds without full is-IS data (observed in the headless
 * test runtime), which would silently emit "18.8" — so we own the separator, never the locale.
 */
function formatIce(n: number, digits: number): string {
  return n.toFixed(digits).replace(".", ",");
}

/**
 * Render the daylight value string for a DaylightResult. Polar cases return their Icelandic copy
 * (never a NaN or a bogus hours number); the normal case returns "H,H klst." with an is-IS comma
 * decimal (criteria 4 + 13). Kept pure so it is trivially unit-checkable.
 */
export function daylightValueText(d: DaylightResult): string {
  if (d.kind === "polar-day") return COPY.polarDay;
  if (d.kind === "polar-night") return COPY.polarNight;
  return `${formatIce(d.hours, 1)} ${COPY.daylightUnit}`;
}

/** The three metric selectors mirror computeMarkerDatum: temp = o.t, wind = o.f. */
const tempSelector = (o: DailyObservation): number | null => o.t;
const windSelector = (o: DailyObservation): number | null => o.f;

/** SVG namespace for the inline close glyph (built via the DOM API — never string-HTML). */
const SVGNS = "http://www.w3.org/2000/svg";

/** Build the inline × close glyph (static chrome; createElementNS only). */
function buildCloseGlyph(): SVGSVGElement {
  // 24×24 glyph inside the ≥44px hit target (UI-SPEC: "inline SVG, 24×24 in a ≥44px hit target").
  // The path uses a 24-unit viewBox with a matching stroke inset (was 16px — UI FIX-NOW #5).
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "24");
  svg.setAttribute("height", "24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = document.createElementNS(SVGNS, "path");
  path.setAttribute("d", "M5 5l14 14M19 5L5 19");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.5");
  path.setAttribute("stroke-linecap", "round");
  svg.appendChild(path);
  return svg;
}

/**
 * A chart render request handed to the lazy seam. `kind` selects the chart builder; the payload
 * carries the pure per-doy data (from perDoyDistribution/perDoyPrecip) + the display metadata. NO
 * charting-library type crosses this boundary — the shell stays free of the chart lib (RESEARCH
 * Pitfall 6); only the domain PerDoyBox/PerDoyBar shapes travel to the lazy chunk, which owns all
 * of the charting-library imports.
 */
type ChartSpec =
  | {
      kind: "boxplot";
      perDoy: PerDoyBox[];
      unit: string;
      tone: string;
      metricLabel: string;
      zeroFloor?: boolean;
    }
  | { kind: "bars"; perDoy: PerDoyBar[]; tone: string; metricLabel: string };

/**
 * Memoized lazy import of the chart chunk. The FIRST sufficient-metric render triggers
 * `import("./chartPanel.js")`, which Vite code-splits into its own chunk (the chart lib included)
 * — so the entry/main bundle never pays for the chart library (the build-size gate asserts this).
 * Subsequent renders reuse the resolved module. A rejection is surfaced to the caller so the slot
 * degrades to the no-data text rather than hanging or throwing (T-06-08 / V7).
 */
let chartModPromise: Promise<typeof import("./chartPanel.js")> | null = null;
function loadChartModule(): Promise<typeof import("./chartPanel.js")> {
  if (!chartModPromise) chartModPromise = import("./chartPanel.js");
  return chartModPromise;
}

/**
 * A disposable chart handle (the lazy chunk returns one per mounted ECharts instance). Kept as a
 * local structural type so the shell never imports the charting library (RESEARCH Pitfall 6) — it
 * only ever calls `.dispose()` on the panel-lifecycle teardown/re-open path (CR-01).
 */
export interface DisposableChart {
  dispose(): void;
}

/**
 * The chart-render SEAM (Plan 03). Shows the `hleð riti…` loading line immediately (real DOM
 * text), then lazily imports the ECharts chunk and mounts the boxplot/bar into a fresh canvas host
 * inside `slot`. On a chunk-load rejection (or an empty/insufficient spec surfaced by the builder)
 * the slot falls back to the `engin gögn fyrir þetta tímabil` message — never a hang or a throw.
 *
 * `registerChart` is invoked with the mounted chart handle (if any) so the panel lifecycle can
 * dispose it on close AND before every re-open (CR-01 — the ECharts instance + its ResizeObserver
 * must never outlive the panel node). The handle may arrive AFTER a teardown (the chunk resolves
 * async); the callback re-checks `document.contains(slot)` before mounting and the lifecycle owner
 * disposes any late arrival too.
 *
 * Exported so a test/override can swap the implementation without restructuring the shell.
 */
export function renderChartInto(
  slot: HTMLElement,
  spec: ChartSpec,
  registerChart?: (chart: DisposableChart | null) => void,
): void {
  const loading = document.createElement("p");
  loading.className = "station-panel__nodata";
  loading.textContent = COPY.chartLoading;
  slot.appendChild(loading);

  void loadChartModule()
    .then((mod) => {
      // The panel may have been torn down (or re-opened) before the chunk resolved — bail if the
      // slot is no longer in the document so we never mount into a detached node.
      if (!document.contains(slot)) return;
      loading.remove();
      // A sized host for the ECharts canvas (the slot is a flex centering box; the chart wants a
      // block with an explicit size, which panel.css gives .station-panel__chart-host).
      const host = document.createElement("div");
      host.className = "station-panel__chart-host";
      slot.appendChild(host);
      // Mount the chart and hand the disposable handle to the lifecycle owner (CR-01). renderBoxplot
      // / renderBars return `null` on their internal no-data path (no instance created).
      const chart =
        spec.kind === "boxplot"
          ? mod.renderBoxplot(host, {
              perDoy: spec.perDoy,
              unit: spec.unit,
              tone: spec.tone,
              metricLabel: spec.metricLabel,
              zeroFloor: spec.zeroFloor,
            })
          : mod.renderBars(host, {
              perDoy: spec.perDoy,
              tone: spec.tone,
              metricLabel: spec.metricLabel,
            });
      registerChart?.(chart);
    })
    .catch(() => {
      // Chunk failed to load → honest degrade to the no-data text (never hang/throw).
      if (!document.contains(slot)) return;
      loading.remove();
      appendNoData(slot, COPY.noData);
    });
}

/** Resolve a CSS custom-property value from :root (chart tones pass as hex to the ECharts option). */
function resolveToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Append a muted no-data / no-gauge line (text, never a blank canvas — CHART-04) into a slot. */
function appendNoData(slot: HTMLElement, message: string): void {
  const p = document.createElement("p");
  p.className = "station-panel__nodata";
  p.textContent = message;
  slot.appendChild(p);
}

/**
 * Build one titled chart figure. `state` decides the slot content:
 *   - precip figure of an án-úrkomu station (hasPrecip === false) → the no-gauge message,
 *   - an insufficient metric → the per-chart no-data message,
 *   - a sufficient metric → the `hleð riti…` stub (Plan 03 mounts the real chart here).
 */
function buildFigure(
  title: string,
  readingKey: string | null,
  swatchClass: string,
  slotState: { kind: "chart"; spec: ChartSpec } | { kind: "nodata"; message: string },
  registerChart?: (chart: DisposableChart | null) => void,
): HTMLElement {
  const figure = document.createElement("figure");
  figure.className = "station-panel__figure";

  const caption = document.createElement("figcaption");
  caption.className = "station-panel__figure-title";
  caption.textContent = title;
  figure.appendChild(caption);

  const slot = document.createElement("div");
  slot.className = "station-panel__chart-slot";
  if (slotState.kind === "chart") renderChartInto(slot, slotState.spec, registerChart);
  else appendNoData(slot, slotState.message);
  figure.appendChild(slot);

  // The mandatory plain-Icelandic reading key (real DOM text). A tiny series swatch precedes it
  // (redundant to the titled figure + geometry — color is never the sole channel). A `null`
  // readingKey suppresses the key entirely — used for the precip no-gauge slot, whose reading key
  // would otherwise describe bars/gaps that are not rendered (UI FIX-NOW #4).
  if (readingKey !== null) {
    const key = document.createElement("p");
    key.className = "station-panel__reading-key";
    const swatch = document.createElement("span");
    swatch.className = `station-panel__swatch ${swatchClass}`;
    swatch.setAttribute("aria-hidden", "true");
    key.append(swatch, document.createTextNode(readingKey));
    figure.appendChild(key);
  }

  return figure;
}

/**
 * Mount the station chart panel and wire it to the store's `stationId` seam. Idempotent to call
 * once at boot (main.ts): it subscribes to the store and opens/populates the panel whenever
 * `stationId` transitions to a non-null value, tears it down (and un-yields the ranked list) on
 * null. Returns nothing — the panel's whole lifecycle is store-driven.
 *
 * @param store         the Phase-4 selection store (open on non-null stationId, close on null)
 * @param cache         the boot StationCache (station id → {meta, file}) — READ, never fetch
 * @param getLatestData the module-level latestData getter (for the MarkerDatum hasPrecip gate)
 * @param rankedList    the ranked-list handle to yield on open / restore on close
 */
export function mountStationPanel(
  store: SelectionStore,
  cache: StationCache,
  getLatestData: () => ReadonlyArray<MarkerDatum>,
  rankedList: RankedListHandle,
): void {
  // The single live panel element (null when closed) + the element focus returns to on close.
  let panel: HTMLElement | null = null;
  let returnFocusTo: HTMLElement | null = null;
  // Every ECharts instance mounted for the CURRENT panel (CR-01). Disposed on close AND before
  // every re-open so no instance/canvas/ResizeObserver leaks across station-to-station switches.
  let liveCharts: DisposableChart[] = [];
  // The bottom-sheet drag controller teardown (mobile only). Attached per-open (Pitfall 1 — the
  // panel rebuilds every open), removed in teardown() next to disposeCharts(). null on desktop.
  let detachSheet: (() => void) | null = null;

  /**
   * Raise the attribution safe-zone (--attrib-safe-bottom) to the sheet's current VISIBLE height
   * so the CC BY 4.0 + OSM credit stays legible above the sheet peek on mobile (the Plan-02
   * attribution-solve-once contract). `translateY` is the sheet's top offset from the bottom-docked
   * expanded box: visible height = sheetHeight - translateY, i.e. how far the sheet rises above the
   * viewport bottom. The MapLibre bottom controls already clear `--attrib-safe-bottom + --space-sm`.
   * Mobile-only (guarded by the caller); on desktop the safe-zone stays at the control-bar baseline.
   */
  const raiseAttribSafeBottom = (sheetEl: HTMLElement, translateY: number): void => {
    const visible = Math.max(0, sheetEl.offsetHeight - translateY);
    // UI-REVIEW (attribution-at-expanded, licensing justification): at the EXPANDED snap the sheet
    // covers most of the map, so raising --attrib-safe-bottom to the near-full sheet height can push
    // the compact MapLibre (i) attribution control up against the sheet's own top edge. This is an
    // accepted state under the UI-SPEC Attribution Solution: the CC BY 4.0 + OSM + Protomaps + Veðurstofa
    // full credit is ALWAYS reachable and legible in the info panel (a modal, never occludable — the
    // licensing backstop). At PEEK the compact credit sits cleanly above the peek edge; at EXPANDED
    // the info-panel canonical credit satisfies the license, so we deliberately do NOT clamp the raise
    // below the sheet header (which would re-expose the credit only by shrinking the reserved band).
    document.documentElement.style.setProperty("--attrib-safe-bottom", `${Math.round(visible)}px`);
  };

  /** Reset the attribution safe-zone to its control-bar baseline (trust.css :root default). */
  const resetAttribSafeBottom = (): void => {
    document.documentElement.style.removeProperty("--attrib-safe-bottom");
  };

  /** Dispose + clear every tracked chart handle (CR-01). Idempotent. */
  const disposeCharts = (): void => {
    for (const c of liveCharts) {
      try {
        c.dispose();
      } catch {
        // A double-dispose or a torn-down instance must never break teardown.
      }
    }
    liveCharts = [];
  };

  const close = (): void => {
    // Single close path for the button, Escape, and a store-driven deselect: clear stationId.
    // The existing main.ts subscribers then clear the URL `st` param and deselect the marker;
    // the store subscription below (on the null transition) tears down the DOM + un-yields.
    store.set({ stationId: null });
  };

  const teardown = (): void => {
    if (!panel) return;
    // CR-01: dispose every ECharts instance BEFORE the host DOM is removed so no instance (its
    // canvas, render loop, global-registry entry) or ResizeObserver outlives the panel node.
    disposeCharts();
    // Pitfall 1: detach the bottom-sheet drag controller (mobile) — the panel rebuilds per open,
    // so its listeners must be removed here alongside the charts.
    if (detachSheet) {
      detachSheet();
      detachSheet = null;
    }
    // Restore the attribution safe-zone to its control-bar baseline (the sheet no longer raises it).
    resetAttribSafeBottom();
    panel.remove();
    panel = null;
    rankedList.setYielded(false);
    // Attribution legibility (UI licensing): the right-docked panel no longer covers the
    // bottom-right MapLibre credit, so drop the offset class.
    document.body.classList.remove("panel-open");
    // Return focus to the element that launched the panel (the marker pill / ranked row). The
    // marker overlay is re-rendered on every map move/idle (markers.ts replaceChildren), so a
    // captured marker-pill launcher is usually a DETACHED node by teardown — falling to <body>
    // would strand the keyboard user. Never fall to <body>: if the launcher is gone, focus a
    // STABLE always-present element (the top-right info (i) button, else the map container).
    // A valid return target is a live, focusable element that is NOT <body> — the launcher may be
    // a detached marker pill (overlay re-render) OR <body> itself (a store-driven open with no live
    // launcher, e.g. a permalink), and focusing <body> leaves the keyboard user stranded.
    const validReturn =
      returnFocusTo && returnFocusTo !== document.body && document.contains(returnFocusTo);
    if (validReturn) {
      returnFocusTo!.focus();
    } else {
      const fallback =
        document.querySelector<HTMLElement>(".info-button") ??
        (() => {
          const mapEl = document.getElementById("map");
          if (mapEl && !mapEl.hasAttribute("tabindex")) mapEl.setAttribute("tabindex", "-1");
          return mapEl;
        })();
      fallback?.focus();
    }
    returnFocusTo = null;
  };

  const open = (stationId: number): void => {
    // WR-02: capture the launcher (marker pill / ranked row) BEFORE detaching the old panel. On a
    // station→station switch the active element is the OLD panel's close button; capturing after
    // the detach (the previous bug) left `returnFocusTo` pointing at a removed node so focus fell
    // to <body>. We only overwrite returnFocusTo below when this launcher is a live, non-panel
    // element — so a genuine re-select keeps the ORIGINAL launcher as the return target.
    const launcher = (document.activeElement as HTMLElement | null) ?? null;
    // CR-01: dispose the previous open's ECharts instances before its host DOM is removed on a
    // station-to-station switch — otherwise each switch leaks the prior instances/canvases.
    disposeCharts();
    // Rebuild from scratch on every open (a fresh selection) — the panel is cheap DOM.
    if (panel) panel.remove();
    // Reset the per-open chart-option record so an E2E (criterion 12) reads only THIS open's
    // built options, not options accumulated across earlier opens on the same page. (Uses
    // globalThis — a local `window` WindowSpec const below shadows the global identifier here.)
    (globalThis as unknown as { __chartOptions?: unknown[] }).__chartOptions = [];

    const entry = cache.get(stationId);
    // Defensive: an unknown/uncached station (e.g. a muted station with no file) still gets a
    // panel — name from the MarkerDatum, daylight from lat/lon, and the whole-station no-data
    // message (its charts have no data). Never throw, never white-screen (T-06-05 / V7).
    const marker = getLatestData().find((d) => d.station === stationId) ?? null;
    const name = entry?.meta.name ?? marker?.name ?? "";
    const lat = entry?.meta.lat ?? marker?.lat ?? 0;
    const lon = entry?.meta.lon ?? marker?.lon ?? 0;

    const section = document.createElement("section");
    section.className = "station-panel";
    section.setAttribute("aria-label", name); // aria-label = the station name (criterion 1)
    section.tabIndex = -1;

    // ── Drag handle (mobile sheet grabber) — CSS hides it on desktop ─────────
    // A native <button> so it is focusable + keyboard-operable (Enter/Space toggles peek↔expanded
    // via attachSheet). It is the FIRST child of the panel (above the header) so it reads as the
    // sheet's top grabber. On desktop `.station-panel__handle { display:none }` hides it entirely.
    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "station-panel__handle";
    handle.setAttribute("aria-label", COPY.dragHandle);
    section.appendChild(handle);

    // ── Header: name + close ─────────────────────────────────────────────────
    const header = document.createElement("header");
    header.className = "station-panel__header";
    const titleEl = document.createElement("h2");
    titleEl.className = "station-panel__title";
    titleEl.textContent = name; // textContent ONLY (T-06-04 — never string-HTML for the name)
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "station-panel__close";
    closeBtn.setAttribute("aria-label", COPY.close);
    closeBtn.appendChild(buildCloseGlyph());
    closeBtn.addEventListener("click", close);
    header.append(titleEl, closeBtn);
    section.appendChild(header);

    // ── Body: figures (or whole-station empty) + daylight ────────────────────
    const body = document.createElement("div");
    body.className = "station-panel__body";

    const state = store.get();
    const window = anchorToWindow(state.anchorDoy, state.widthDays);
    const yearRange = { from: state.yearFrom, til: state.yearTil };

    // Compute per-metric distributions from the cached, decoded rows (NO fetch). An uncached/muted
    // station has no file → all three are insufficient (whole-station no-data), which is honest.
    // We keep the FULL result (not just `.sufficient`) so a sufficient metric's per-doy boxes/bars
    // flow to the lazy chart chunk (RESEARCH Pitfall 7: same N-gate as the map).
    let tempResult: DistributionResult = { sufficient: false };
    let windResult: DistributionResult = { sufficient: false };
    let precipResult: PrecipResult = { sufficient: false };
    if (entry) {
      const rows = decodeDerived(entry.file);
      tempResult = perDoyDistribution(rows, window, yearRange, tempSelector);
      windResult = perDoyDistribution(rows, window, yearRange, windSelector);
      precipResult = perDoyPrecip(rows, window, yearRange);
    }
    const tempSufficient = tempResult.sufficient;
    const windSufficient = windResult.sufficient;
    const precipSufficient = precipResult.sufficient;
    // án úrkomu (no gauge): the station measures temp/wind but has no precip gauge. Use the
    // MarkerDatum.hasPrecip honesty flag (mirrors the map). When precip is sufficient but the
    // marker says no gauge, the precip figure shows the no-gauge message, not a chart.
    const hasPrecipGauge = marker?.hasPrecip ?? false;

    // Whole-station no-data (CHART-04): ALL three metrics insufficient → a panel-level message
    // instead of the three figures. The daylight readout still renders below (data-independent).
    if (!tempSufficient && !windSufficient && !precipSufficient) {
      const empty = document.createElement("div");
      empty.className = "station-panel__empty";
      const heading = document.createElement("p");
      heading.className = "station-panel__empty-heading";
      heading.textContent = COPY.emptyHeading;
      const bodyText = document.createElement("p");
      bodyText.className = "station-panel__empty-body";
      bodyText.textContent = COPY.emptyBody;
      empty.append(heading, bodyText);
      body.appendChild(empty);
    } else {
      // Resolve the three chart tones ONCE (hex from :root) so the lazy chunk gets colors, never
      // `var()` strings (ECharts options take resolved colors). These are the --chart-* tokens —
      // never --accent or --score-* (criterion 11: distribution, not finance).
      const toneTemp = resolveToken("--chart-temp");
      const toneWind = resolveToken("--chart-wind");
      const tonePrecip = resolveToken("--chart-precip");

      // CR-01: register every mounted chart handle with the panel lifecycle's liveCharts so
      // teardown/re-open can dispose it. A late-arriving handle (the chunk resolves async) is still
      // tracked and disposed by the next teardown/open; if the panel was already torn down, the
      // handle mounts into a detached node only if renderChartInto's document.contains(slot) passes.
      const registerChart = (chart: DisposableChart | null): void => {
        if (chart) liveCharts.push(chart);
      };

      // Temperature figure.
      body.appendChild(
        buildFigure(
          COPY.chartTitles.temp,
          COPY.readingKeys.temp,
          "station-panel__swatch--temp",
          tempResult.sufficient
            ? {
                kind: "chart",
                spec: {
                  kind: "boxplot",
                  perDoy: tempResult.perDoy,
                  unit: "°C",
                  tone: toneTemp,
                  metricLabel: COPY.chartTitles.temp,
                },
              }
            : { kind: "nodata", message: COPY.noData },
          registerChart,
        ),
      );
      // Wind figure (zero-floored — wind is never below 0).
      body.appendChild(
        buildFigure(
          COPY.chartTitles.wind,
          COPY.readingKeys.wind,
          "station-panel__swatch--wind",
          windResult.sufficient
            ? {
                kind: "chart",
                spec: {
                  kind: "boxplot",
                  perDoy: windResult.perDoy,
                  unit: "m/s",
                  tone: toneWind,
                  metricLabel: COPY.chartTitles.wind,
                  zeroFloor: true,
                },
              }
            : { kind: "nodata", message: COPY.noData },
          registerChart,
        ),
      );
      // Precip figure: no-gauge message wins over both chart and per-chart no-data (án úrkomu ≠
      // "it was dry"). Otherwise sufficient → bars; insufficient → per-chart no-data.
      const precipSlot: { kind: "chart"; spec: ChartSpec } | { kind: "nodata"; message: string } =
        !hasPrecipGauge
          ? { kind: "nodata", message: COPY.precipNoGauge }
          : precipResult.sufficient
            ? {
                kind: "chart",
                spec: {
                  kind: "bars",
                  perDoy: precipResult.perDoy,
                  tone: tonePrecip,
                  metricLabel: COPY.chartTitles.precip,
                },
              }
            : { kind: "nodata", message: COPY.noData };
      // UI FIX-NOW #4: suppress the precip reading key when the slot is the no-gauge message — the
      // key describes "súlurnar" (bars) and "eyða" (gaps) that are NOT rendered for an án-úrkomu
      // station, so a user (incl. a screen-reader user) would read a description of an absent chart.
      // Only the no-gauge kind suppresses it; a genuine chart or per-chart no-data keeps the key.
      const precipReadingKey =
        precipSlot.kind === "nodata" && precipSlot.message === COPY.precipNoGauge
          ? null
          : COPY.readingKeys.precip;
      body.appendChild(
        buildFigure(
          COPY.chartTitles.precip,
          precipReadingKey,
          "station-panel__swatch--precip",
          precipSlot,
          registerChart,
        ),
      );
    }

    // ── Daylight readout (always present — pure astronomy, no data dependency) ─
    const mid = midpointDoy(state.anchorDoy, state.widthDays);
    const daylight = daylightHours(refDate(mid), lat, lon);
    const dayRow = document.createElement("div");
    dayRow.className = "station-panel__daylight";
    const dayLabel = document.createElement("span");
    dayLabel.className = "station-panel__daylight-label";
    dayLabel.textContent = COPY.daylightLabel;
    const dayValue = document.createElement("span");
    dayValue.className = "station-panel__daylight-value";
    dayValue.textContent = daylightValueText(daylight);
    dayRow.append(dayLabel, dayValue);
    body.appendChild(dayRow);

    section.appendChild(body);

    // Escape anywhere in the panel closes it (criterion 9). Tab/Shift+Tab cycle within the panel
    // (WR-03 focus trap): the panel behaves like a modal (it yields the ranked list, moves focus
    // in, closes on Escape) but previously let Tab escape to the map/controls behind the overlay.
    // We cycle at the first/last focusable so keyboard/SR users stay inside until they close it.
    section.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        close();
        return;
      }
      if (ev.key !== "Tab") return;
      // Non-modal mobile sheet (RESEARCH anti-pattern): do NOT trap focus on mobile — the map must
      // stay keyboard/pointer reachable above the sheet. The desktop side panel keeps its Tab-cycle
      // trap (it is a modal-like right-dock overlay). Only cycle focus when NOT in sheet mode.
      if (typeof matchMedia !== "undefined" && matchMedia(MOBILE_QUERY).matches) return;
      const focusables = Array.from(
        section.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
      if (focusables.length === 0) {
        // No child focusable → keep focus on the panel container itself.
        ev.preventDefault();
        section.focus();
        return;
      }
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement;
      if (ev.shiftKey && (active === first || active === section)) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && active === last) {
        ev.preventDefault();
        first.focus();
      }
    });

    document.body.appendChild(section);
    panel = section;

    // ── Bottom-sheet drag controller (mobile only) ───────────────────────────
    // Attach AFTER append so offsetHeight is measurable (the CSS @media sizes the sheet to the
    // expanded snap). Compute the two snap points in translateY terms:
    //   expandedY = 0            (sheet fully up — its whole box visible)
    //   peekY     = height - peekVisible   (only the peek band shows above the viewport bottom)
    // peekVisible mirrors the CSS `clamp(96px, 18svh, 140px)` peek height so JS + CSS agree. The
    // controller is matchMedia-gated internally, so on desktop this is a no-op teardown (the CSS
    // @media owns the side-panel layout). onSnap raises --attrib-safe-bottom to the sheet top so
    // the credit stays legible above the peek (Plan-02 contract) — mobile only.
    const isMobile = typeof matchMedia !== "undefined" && matchMedia(MOBILE_QUERY).matches;
    if (isMobile) {
      // Use globalThis.innerHeight — a local `window` (WindowSpec) const shadows the global here.
      const peekVisible = Math.min(140, Math.max(96, 0.18 * globalThis.innerHeight));
      const expandedY = 0;
      const peekY = Math.max(0, section.offsetHeight - peekVisible);
      detachSheet = attachSheet(section, handle, {
        peekY,
        expandedY,
        onSnap: (y) => raiseAttribSafeBottom(section, y),
        // IN-03: a mobile→desktop resize mid-open must drop the mobile px `--attrib-safe-bottom`
        // so the trust.css desktop baseline (var(--bar-height…)) is restored — otherwise the last
        // mobile value lingers on :root until the next open/close. The controller has already
        // cleared the sheet's inline transform/transition (WR-01/WR-04) by the time this fires.
        onLeaveMobile: () => resetAttribSafeBottom(),
      });
    }

    // Yield the ranked list (hide-not-destroy) while the panel is open (criterion 8).
    rankedList.setYielded(true);
    // Attribution legibility (UI licensing): push the bottom-right MapLibre credit clear of the
    // right-docked panel while it is open (a .panel-open rule in controls.css owns the offset).
    document.body.classList.add("panel-open");
    // WR-02: only adopt the pre-detach launcher as the return target when it is a live, non-panel
    // element — so a station→station switch keeps returning focus to the original marker/row, and
    // never to a removed node (which would drop focus to <body>). Capturing document.activeElement
    // HERE (post-append) would point at the old panel's close button on a switch — the fixed bug.
    if (
      launcher &&
      launcher !== document.body && // a store-driven open (permalink) has <body> active — not a launcher
      !section.contains(launcher) &&
      document.contains(launcher)
    ) {
      returnFocusTo = launcher;
    }
    // Move focus to the close button so keyboard/SR users land in the new content (and Escape is
    // immediately live).
    closeBtn.focus();
  };

  // The single open/close driver: subscribe to the store and react to stationId transitions.
  let lastStationId = store.get().stationId;
  const react = (stationId: number | null): void => {
    if (stationId === null) teardown();
    else open(stationId);
  };
  store.subscribe((s) => {
    if (s.stationId === lastStationId) return; // not a station change → ignore (cheap)
    lastStationId = s.stationId;
    react(s.stationId);
  });

  // Hydrate: if the store already carries a selected station at mount (e.g. a crafted URL with
  // `st`), open the panel immediately so a shared link lands on the open panel.
  if (lastStationId !== null) react(lastStationId);
}
