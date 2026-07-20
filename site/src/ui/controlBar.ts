// The bottom control bar (SEL-01/02/03): mounts the scrubber + width buttons + Frá/Til
// dropdowns + the always-visible global "meðaltal N ára" readout, and wires every control to
// the Plan 01 store via `set`. The store is the single source of truth — controls only WRITE
// via set; the readout only READS (via subscribe + the getLatestData getter passed from main).
//
// Region order left→right (UI-SPEC Layout): global N readout · scrubber (grows) · width
// buttons · Frá/Til. No fetch, no marker code — the debounced store subscriber in main.ts
// recomputes over the boot cache and re-renders (SEL-04).
import "../styles/controls.css";
import { createScrubber } from "./scrubber.js";
import { createWidthButtons } from "./widthButtons.js";
import { createYearRange } from "./yearRange.js";
import { setDiscrete } from "../state/history.js";
import type { SelectionStore } from "../state/store.js";
import type { MarkerDatum } from "../data/types.js";

/** Manifest-derived year bounds for the Frá/Til dropdowns (union across stations). */
export interface YearBounds {
  min: number;
  max: number;
}

/**
 * Compute the global "meðaltal N ára" readout string from the latest recomputed data.
 * N reflects HONEST coverage (MarkerDatum.n from the qualifying-year gate), NOT the picker
 * span. Renders `meðaltal N ára` for a single representative (median) N, `meðaltal N–M ára`
 * when sufficient stations' coverage varies, or `ófullnægjandi gögn` when the whole selection
 * is thin (no sufficient station). All values are integers rendered via textContent (T-04-03:
 * no URL/user string is ever innerHTML'd here).
 */
export function readoutText(data: ReadonlyArray<MarkerDatum>): string {
  // IN-01: `sufficient` is defined as exactly `qualifying.length >= 3`, so it already implies
  // `n >= 3` — filter on `sufficient` alone (the extra `n >= 3` clause was dead weight).
  const ns = data.filter((d) => d.sufficient).map((d) => d.n).sort((a, b) => a - b);
  if (ns.length === 0) return "ófullnægjandi gögn";
  const min = ns[0]!;
  const max = ns[ns.length - 1]!;
  if (min === max) return `meðaltal ${min} ára`;
  return `meðaltal ${min}–${max} ára`;
}

/**
 * Mount the bottom control bar into document.body and wire it to the store.
 * @param store   the Plan 01 selection store (controls write via store.set)
 * @param bounds  manifest-derived {min, max} year bounds for the dropdowns
 * @param getLatestData reads the latest recomputed MarkerDatum[] for the N readout — main.ts
 *   keeps a module-level `latestData` updated on every recompute and passes this getter, so
 *   the readout updates on every recompute (the store subscription is the update trigger).
 */
/** The control-bar handle: a `refreshReadout` main.ts calls after each recompute settles. */
export interface ControlBarHandle {
  /**
   * Re-render the global "meðaltal N ára" readout from the latest recomputed data. main.ts calls
   * this right after it updates `latestData` in renderForState, so the readout reflects the SAME
   * frame the markers show — no timer, no 140>120 race, no per-change timer pile-up (WR-01).
   */
  refreshReadout(): void;
}

export function mountControlBar(
  store: SelectionStore,
  bounds: YearBounds,
  getLatestData: () => ReadonlyArray<MarkerDatum>,
): ControlBarHandle {
  const state = store.get();

  const bar = document.createElement("div");
  bar.className = "control-bar";

  const inner = document.createElement("div");
  inner.className = "control-bar__inner";

  // Global "meðaltal N ára" readout (left-aligned, 11px muted, always visible).
  const readout = document.createElement("div");
  readout.className = "control-bar__readout";
  readout.textContent = readoutText(getLatestData());

  // Scrubber (grows) → store.set anchorDoy.
  const scrubber = createScrubber({
    initialDoy: state.anchorDoy,
    initialWidth: state.widthDays,
    onAnchorChange: (doy) => store.set({ anchorDoy: doy }),
  });

  // Width buttons → store.set widthDays (DISCRETE → pushState via markDiscrete: back-button
  // reverts the width). Also keep the scrubber's window paint in sync.
  const widthButtons = createWidthButtons({
    initialWidth: state.widthDays,
    onWidthChange: (days) => {
      scrubber.setWidth(days);
      // Arm pushState ONLY when the width actually changes — a re-press of the active width is a
      // store no-op and must not leave the discrete flag dangling (WR-01, shared seam).
      setDiscrete(store, { widthDays: days });
    },
  });

  // Frá/Til dropdowns → store.set yearFrom/yearTil (DISCRETE → pushState; bounds manifest-derived).
  const yearRange = createYearRange({
    min: bounds.min,
    max: bounds.max,
    initialFrom: state.yearFrom,
    initialTil: state.yearTil,
    onRangeChange: ({ from, til }) => {
      // Arm pushState ONLY when the range actually changes (WR-01, shared seam).
      setDiscrete(store, { yearFrom: from, yearTil: til });
    },
  });

  inner.append(readout, scrubber.el, widthButtons.el, yearRange.el);
  bar.appendChild(inner);
  document.body.appendChild(bar);

  // Report the bar's measured height into --bar-height so controls.css can lift the MapLibre
  // attribution above the bar (LICENSING: the CC BY 4.0 / OSM / Protomaps / Veðurstofa credit
  // must stay legible). The bar height varies with content + breakpoint (~88-96px desktop,
  // taller on the narrow two-row layout), so measure it live rather than hard-coding a value.
  const reportBarHeight = (): void => {
    document.documentElement.style.setProperty("--bar-height", `${bar.offsetHeight}px`);
  };
  reportBarHeight();
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(reportBarHeight).observe(bar);
  } else {
    window.addEventListener("resize", reportBarHeight);
  }

  // Re-sync every control's DOM to the store on external changes (popstate restore / boot
  // hydration). The sync* methods set DOM WITHOUT firing their onChange callbacks, so this is a
  // pure URL→DOM mirror and never loops. Controls' own click/input already updated their DOM;
  // re-syncing to the same value is idempotent.
  store.subscribe((s) => {
    scrubber.setWidth(s.widthDays);
    scrubber.syncDoy(s.anchorDoy);
    widthButtons.syncWidth(s.widthDays);
    yearRange.syncRange(s.yearFrom, s.yearTil);
  });

  // The readout is refreshed by main.ts via the returned refreshReadout(), invoked right after
  // each recompute updates latestData (WR-01). This replaces the old per-store-change
  // setTimeout(140) — no timer pile-up during a scrubber drag, and no fragile 140>120ms race
  // against the recompute debounce (the readout reads the SAME settled frame the markers show).
  return {
    refreshReadout(): void {
      readout.textContent = readoutText(getLatestData());
    },
  };
}
