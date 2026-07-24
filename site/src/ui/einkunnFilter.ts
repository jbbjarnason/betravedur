// Minimum-einkunn (score) filter (SEL / control bar): a native <input type="range" 0..10 step 0.5>
// that sets the store's `minScore`. When > 0, the map HIDES markers with score < min and the
// "Bestu staðir" list shows only qualifying stations (main.ts + rankedList.ts own that filtering);
// 0 = no filter (show everything). Framework-free — builds DOM + takes an onMinChange callback; it
// does NOT import the store (controlBar.ts wires it, mirroring scrubber/widthButtons/yearRange).

/** Icelandic comma-decimal readout: "allar" at 0, else "≥ 8,5" (hand-rolled comma — NOT Intl). */
function readout(min: number): string {
  return min <= 0 ? "allar" : `≥ ${min.toFixed(1).replace(".", ",")}`;
}

export interface EinkunnFilterOptions {
  initialMin: number;
  /** Called with the new minimum (0..10) on every range `input`. */
  onMinChange: (min: number) => void;
}

export interface EinkunnFilterHandle {
  /** The filter block to mount into the control bar. */
  el: HTMLElement;
  /** Re-sync the range + readout to an externally-changed minimum (popstate/boot) WITHOUT firing. */
  syncMin(min: number): void;
}

/** Build the minimum-einkunn filter block (label + range + live value readout). */
export function createEinkunnFilter(opts: EinkunnFilterOptions): EinkunnFilterHandle {
  const block = document.createElement("div");
  block.className = "einkunn-filter";

  const label = document.createElement("span");
  label.className = "einkunn-filter__label";
  label.textContent = "Lágmarkseinkunn";

  const range = document.createElement("input");
  range.type = "range";
  range.className = "einkunn-filter__range";
  range.min = "0";
  range.max = "10";
  range.step = "0.5";
  range.value = String(opts.initialMin);
  range.setAttribute("aria-label", "Lágmarkseinkunn");

  const value = document.createElement("span");
  value.className = "einkunn-filter__value";
  value.setAttribute("aria-live", "polite");
  value.setAttribute("aria-hidden", "false");

  const sync = (min: number): void => {
    value.textContent = readout(min);
    // Expose the human readout as aria-valuetext so a screen reader hears "allar" / "≥ 8,5",
    // not the raw slider number.
    range.setAttribute("aria-valuetext", readout(min));
  };
  sync(opts.initialMin);

  range.addEventListener("input", () => {
    const min = Number(range.value);
    sync(min);
    opts.onMinChange(min);
  });

  block.append(label, range, value);

  return {
    el: block,
    syncMin(min: number): void {
      range.value = String(min);
      sync(min);
    },
  };
}
