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
  const ns = data.filter((d) => d.sufficient && d.n >= 3).map((d) => d.n).sort((a, b) => a - b);
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
export function mountControlBar(
  store: SelectionStore,
  bounds: YearBounds,
  getLatestData: () => ReadonlyArray<MarkerDatum>,
): void {
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

  // Width buttons → store.set widthDays (and keep the scrubber's window paint in sync).
  const widthButtons = createWidthButtons({
    initialWidth: state.widthDays,
    onWidthChange: (days) => {
      scrubber.setWidth(days);
      store.set({ widthDays: days });
    },
  });

  // Frá/Til dropdowns → store.set yearFrom/yearTil (bounds are manifest-derived).
  const yearRange = createYearRange({
    min: bounds.min,
    max: bounds.max,
    initialFrom: state.yearFrom,
    initialTil: state.yearTil,
    onRangeChange: ({ from, til }) => store.set({ yearFrom: from, yearTil: til }),
  });

  inner.append(readout, scrubber.el, widthButtons.el, yearRange.el);
  bar.appendChild(inner);
  document.body.appendChild(bar);

  // The readout updates on every recompute: the store change is the trigger; getLatestData
  // returns the freshly recomputed data main.ts stored. Debounce-align to the recompute so
  // the readout reflects the SAME frame the markers show.
  store.subscribe(() => {
    // Read after a microtask-plus so the recompute subscriber (also on this store) has run.
    // main.ts's recompute is debounced 120ms; poll once just past it for the settled data.
    setTimeout(() => {
      readout.textContent = readoutText(getLatestData());
    }, 140);
  });
}
