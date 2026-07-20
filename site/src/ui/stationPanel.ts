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
//   * NO innerHTML — every node via createElement/createElementNS + textContent (T-06-04 XSS /
//     the continued T-05-05 grep gate on the station-name path).
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
} from "@betravedur/domain";
import { anchorToWindow } from "../data/window.js";
import { daylightHours, type DaylightResult } from "../data/daylight.js";
import type { SelectionStore } from "../state/store.js";
import type { StationCache } from "../state/recompute.js";
import type { RankedListHandle } from "./rankedList.js";
import type { MarkerDatum } from "../data/types.js";

/** Copy — UI-SPEC Copywriting Contract, final Icelandic strings (verbatim). */
const COPY = {
  close: "Loka",
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
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = document.createElementNS(SVGNS, "path");
  path.setAttribute("d", "M3 3l10 10M13 3L3 13");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.5");
  path.setAttribute("stroke-linecap", "round");
  svg.appendChild(path);
  return svg;
}

/**
 * The chart-render SEAM (Plan 03 fills this). In THIS plan it is a STUB: a sufficient metric's
 * slot shows the `hleð riti…` loading line (real DOM text, muted). Plan 03 replaces the body with
 * a dynamic import('./chartPanel.js') that mounts an ECharts <canvas> into `slot` from `spec`.
 *
 * Exported so Plan 03 can swap the implementation (or the panel can call a provided override)
 * without restructuring the shell.
 */
export function renderChartInto(slot: HTMLElement): void {
  const loading = document.createElement("p");
  loading.className = "station-panel__nodata";
  loading.textContent = COPY.chartLoading;
  slot.appendChild(loading);
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
  readingKey: string,
  swatchClass: string,
  slotState: { kind: "chart" } | { kind: "nodata"; message: string },
): HTMLElement {
  const figure = document.createElement("figure");
  figure.className = "station-panel__figure";

  const caption = document.createElement("figcaption");
  caption.className = "station-panel__figure-title";
  caption.textContent = title;
  figure.appendChild(caption);

  const slot = document.createElement("div");
  slot.className = "station-panel__chart-slot";
  if (slotState.kind === "chart") renderChartInto(slot);
  else appendNoData(slot, slotState.message);
  figure.appendChild(slot);

  // The mandatory plain-Icelandic reading key (real DOM text). A tiny series swatch precedes it
  // (redundant to the titled figure + geometry — color is never the sole channel).
  const key = document.createElement("p");
  key.className = "station-panel__reading-key";
  const swatch = document.createElement("span");
  swatch.className = `station-panel__swatch ${swatchClass}`;
  swatch.setAttribute("aria-hidden", "true");
  key.append(swatch, document.createTextNode(readingKey));
  figure.appendChild(key);

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

  const close = (): void => {
    // Single close path for the button, Escape, and a store-driven deselect: clear stationId.
    // The existing main.ts subscribers then clear the URL `st` param and deselect the marker;
    // the store subscription below (on the null transition) tears down the DOM + un-yields.
    store.set({ stationId: null });
  };

  const teardown = (): void => {
    if (!panel) return;
    panel.remove();
    panel = null;
    rankedList.setYielded(false);
    // Return focus to the element that launched the panel (the marker pill / ranked row), else
    // let it fall to <body> — continues the Phase-5 select-seam focus intent.
    if (returnFocusTo && document.contains(returnFocusTo)) returnFocusTo.focus();
    returnFocusTo = null;
  };

  const open = (stationId: number): void => {
    // Rebuild from scratch on every open (a fresh selection) — the panel is cheap DOM.
    if (panel) panel.remove();

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

    // ── Header: name + close ─────────────────────────────────────────────────
    const header = document.createElement("header");
    header.className = "station-panel__header";
    const titleEl = document.createElement("h2");
    titleEl.className = "station-panel__title";
    titleEl.textContent = name; // textContent ONLY (T-06-04 — never innerHTML for the name)
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

    // Compute per-metric sufficiency from the cached, decoded rows (NO fetch). An uncached/muted
    // station has no file → all three are insufficient (whole-station no-data), which is honest.
    let tempSufficient = false;
    let windSufficient = false;
    let precipSufficient = false;
    if (entry) {
      const rows = decodeDerived(entry.file);
      tempSufficient = perDoyDistribution(rows, window, yearRange, tempSelector).sufficient;
      windSufficient = perDoyDistribution(rows, window, yearRange, windSelector).sufficient;
      precipSufficient = perDoyPrecip(rows, window, yearRange).sufficient;
    }
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
      // Temperature figure.
      body.appendChild(
        buildFigure(
          COPY.chartTitles.temp,
          COPY.readingKeys.temp,
          "station-panel__swatch--temp",
          tempSufficient ? { kind: "chart" } : { kind: "nodata", message: COPY.noData },
        ),
      );
      // Wind figure.
      body.appendChild(
        buildFigure(
          COPY.chartTitles.wind,
          COPY.readingKeys.wind,
          "station-panel__swatch--wind",
          windSufficient ? { kind: "chart" } : { kind: "nodata", message: COPY.noData },
        ),
      );
      // Precip figure: no-gauge message wins over both chart and per-chart no-data (án úrkomu ≠
      // "it was dry"). Otherwise sufficient → chart stub; insufficient → per-chart no-data.
      const precipSlot: { kind: "chart" } | { kind: "nodata"; message: string } = !hasPrecipGauge
        ? { kind: "nodata", message: COPY.precipNoGauge }
        : precipSufficient
          ? { kind: "chart" }
          : { kind: "nodata", message: COPY.noData };
      body.appendChild(
        buildFigure(
          COPY.chartTitles.precip,
          COPY.readingKeys.precip,
          "station-panel__swatch--precip",
          precipSlot,
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

    // Escape anywhere in the panel closes it (criterion 9). Keydown on the panel container
    // catches focus in the close button or any child.
    section.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        close();
      }
    });

    document.body.appendChild(section);
    panel = section;
    // Yield the ranked list (hide-not-destroy) while the panel is open (criterion 8).
    rankedList.setYielded(true);
    // Move focus to the close button so keyboard/SR users land in the new content (and Escape is
    // immediately live). Remember the launcher so focus returns there on close.
    returnFocusTo = (document.activeElement as HTMLElement | null) ?? null;
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
