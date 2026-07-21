// Year-range selector (SEL-02): two native <select>s "Frá" / "Til" bounded by the
// data-derived min/max years, guarding Frá ≤ Til. Framework-free — builds DOM + takes an
// onRangeChange callback; controlBar.ts wires it to store.set. Native <select> gives keyboard
// + screen-reader + platform behaviour for free (no custom dropdown, no hand-rolled ARIA).

export interface YearRangeOptions {
  /** Lowest selectable year (manifest-derived — never a hardcoded literal). */
  min: number;
  /** Highest selectable year (manifest-derived). */
  max: number;
  initialFrom: number;
  initialTil: number;
  /** Called with the clamped {from, til} (Frá ≤ Til enforced) on any change. */
  onRangeChange: (range: { from: number; til: number }) => void;
}

export interface YearRangeHandle {
  el: HTMLElement;
  /** Re-sync the Frá/Til selects to an externally-changed range (popstate / boot hydration). */
  syncRange(from: number, til: number): void;
}

/** Populate a <select> with year <option>s min..max, selecting `selected`. */
function fillYears(select: HTMLSelectElement, min: number, max: number, selected: number): void {
  for (let y = min; y <= max; y++) {
    const opt = document.createElement("option");
    opt.value = String(y);
    opt.textContent = String(y);
    if (y === selected) opt.selected = true;
    select.appendChild(opt);
  }
}

/**
 * Build the Frá / Til year selector. Options span the manifest-derived [min, max] union.
 * On any change the range is clamped so Frá ≤ Til (picking a Frá after Til bumps Til up,
 * picking a Til before Frá bumps Frá down) — never an inverted/empty range (T-04-04) — then
 * onRangeChange is called with the corrected values.
 */
export function createYearRange(opts: YearRangeOptions): YearRangeHandle {
  const wrap = document.createElement("div");
  wrap.className = "year-range";

  const fromLabel = document.createElement("label");
  fromLabel.className = "year-range__label";
  fromLabel.htmlFor = "year-from";
  fromLabel.textContent = "Frá";

  const fromSel = document.createElement("select");
  fromSel.className = "year-range__select";
  fromSel.id = "year-from";
  // C.3: explicit aria-label (belt-and-suspenders alongside the <label for> association) so the
  // select has a self-contained, unambiguous Icelandic accessible name.
  fromSel.setAttribute("aria-label", "Frá ári");

  const tilLabel = document.createElement("label");
  tilLabel.className = "year-range__label";
  tilLabel.htmlFor = "year-til";
  tilLabel.textContent = "Til";

  const tilSel = document.createElement("select");
  tilSel.className = "year-range__select";
  tilSel.id = "year-til";
  tilSel.setAttribute("aria-label", "Til árs");

  const clampFrom = Math.min(Math.max(opts.initialFrom, opts.min), opts.max);
  const clampTil = Math.min(Math.max(opts.initialTil, opts.min), opts.max);
  fillYears(fromSel, opts.min, opts.max, clampFrom);
  fillYears(tilSel, opts.min, opts.max, Math.max(clampTil, clampFrom));

  const emit = (from: number, til: number): void => {
    fromSel.value = String(from);
    tilSel.value = String(til);
    opts.onRangeChange({ from, til });
  };

  fromSel.addEventListener("change", () => {
    const from = Number(fromSel.value);
    const til = Number(tilSel.value);
    // Guard Frá ≤ Til: if the new Frá is later than Til, bump Til up to match.
    emit(from, Math.max(from, til));
  });

  tilSel.addEventListener("change", () => {
    const from = Number(fromSel.value);
    const til = Number(tilSel.value);
    // Guard Frá ≤ Til: if the new Til is earlier than Frá, bump Frá down to match.
    emit(Math.min(from, til), til);
  });

  wrap.append(fromLabel, fromSel, tilLabel, tilSel);
  return {
    el: wrap,
    // URL→DOM (popstate restore): set both selects WITHOUT firing onRangeChange. Values are
    // clamped into the option range so an out-of-bounds restore snaps to the nearest year.
    syncRange(from: number, til: number): void {
      fromSel.value = String(Math.min(Math.max(from, opts.min), opts.max));
      tilSel.value = String(Math.min(Math.max(til, opts.min), opts.max));
    },
  };
}
