// Day-of-year scrubber (SEL-01 anchor): a native <input type="range" min=1 max=365> restyled
// to the Phase 3 tokens, plus an Icelandic date readout, month tick labels, and a narrow-screen
// ‹ [date] › stepper. Framework-free: this module builds DOM + takes an onAnchorChange callback;
// it does NOT import the store (controlBar.ts wires the callback to store.set).
//
// The window is [anchor, anchor + widthDays − 1] folded to 1..365 (wrapping late-Dec windows
// are legal — the domain owns the wrap). The date readout shows the window form "20.–26. júlí"
// via windowLabel; the range fires `input` (continuous) and the stepper buttons step ±1.

/** Lowercase 3-letter Icelandic month abbreviations, indexed 0..11 (UI-SPEC tick labels). */
const MONTHS_ABBR = [
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

/** Day-of-year (1-based) of the 1st of each month in the non-leap 2001 reference year. */
const MONTH_START_DOY = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335] as const;

/** Fold any integer day-of-year into 1..365 (the domain's leap-folded doy range). */
function foldDoy(doy: number): number {
  return (((doy - 1) % 365) + 365) % 365 + 1;
}

/** Map a folded doy onto its calendar date in the fixed NON-leap 2001 reference year. */
function refDate(doy: number): Date {
  const d = new Date(Date.UTC(2001, 0, 1));
  d.setUTCDate(foldDoy(doy));
  return d;
}

/**
 * Icelandic full date for a day-of-year, day-then-lowercase-month, e.g. doy 197 → "16. júlí".
 * Uses Intl "is-IS" over the fixed non-leap 2001 reference (UI-SPEC / RESEARCH-verified).
 */
export function doyLabel(doy: number): string {
  return new Intl.DateTimeFormat("is-IS", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(refDate(doy));
}

/** Abbreviated Icelandic date, e.g. doy 360 → "26. des" (matches the month tick labels). */
function doyLabelShort(doy: number): string {
  const d = refDate(doy);
  return `${d.getUTCDate()}. ${MONTHS_ABBR[d.getUTCMonth()]}`;
}

/**
 * The window's two endpoints as an abbreviated Icelandic label, e.g. anchor 360 width 14 →
 * "26. des – 8. jan" (wrapping) or anchor 197 width 14 → "16. júl – 29. júl". The window is
 * [anchor, anchor + widthDays − 1] folded to 1..365.
 */
export function windowLabel(anchorDoy: number, widthDays: number): string {
  const startDoy = foldDoy(anchorDoy);
  const endDoy = foldDoy(anchorDoy + widthDays - 1);
  return `${doyLabelShort(startDoy)} – ${doyLabelShort(endDoy)}`;
}

/** ±7-day keyboard page step (one week) documented on the native range. */
const PAGE_STEP_DAYS = 7;

export interface ScrubberOptions {
  initialDoy: number;
  initialWidth: number;
  /** Called with the new anchor doy (1..365) on range input and on stepper clicks. */
  onAnchorChange: (doy: number) => void;
}

export interface ScrubberHandle {
  /** The scrubber block element to mount into the control bar. */
  el: HTMLElement;
  /** Update the visible date readout + track fill when the width changes externally. */
  setWidth(widthDays: number): void;
}

/**
 * Build the day-of-year scrubber block: an aria-live date readout, a native range slider
 * (with the selected-window span painted on the track), month tick labels, and a narrow-screen
 * ‹ [date] › stepper. The range fires continuous `input`; ArrowLeft/Right = ±1 (native),
 * PageUp/Down = ±7. Every anchor change calls onAnchorChange with the folded doy.
 */
export function createScrubber(opts: ScrubberOptions): ScrubberHandle {
  let width = opts.initialWidth;

  const block = document.createElement("div");
  block.className = "scrubber";

  // Live date readout (aria-live so SR users hear the anchor date as it changes).
  const readout = document.createElement("div");
  readout.className = "scrubber__readout";
  readout.setAttribute("aria-live", "polite");

  // Native range — role="slider" + aria-valuemin/max/now for free.
  const range = document.createElement("input");
  range.type = "range";
  range.className = "scrubber__range";
  range.min = "1";
  range.max = "365";
  range.step = "1";
  range.value = String(foldDoy(opts.initialDoy));
  range.setAttribute("aria-label", "Velja tímabil");

  // Month tick labels (jan feb … des).
  const ticks = document.createElement("div");
  ticks.className = "scrubber__ticks";
  for (const m of MONTHS_ABBR) {
    const t = document.createElement("span");
    t.textContent = m;
    ticks.appendChild(t);
  }

  // Narrow-screen ‹ [date] › stepper (CSS shows it under ~640px; buttons step anchor ±1).
  const stepper = document.createElement("div");
  stepper.className = "scrubber__stepper";
  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "scrubber__step";
  prev.setAttribute("aria-label", "Fyrri dagur");
  prev.textContent = "‹";
  const stepReadout = document.createElement("span");
  stepReadout.className = "scrubber__readout";
  stepReadout.setAttribute("aria-live", "polite");
  const next = document.createElement("button");
  next.type = "button";
  next.className = "scrubber__step";
  next.setAttribute("aria-label", "Næsti dagur");
  next.textContent = "›";
  stepper.append(prev, stepReadout, next);

  const paintTrack = (doy: number): void => {
    // Paint the selected-window span (anchor → anchor+width) as an --ink region on the
    // --dominant track. On a wrapping window the fill wraps from the right edge to the left.
    const start = foldDoy(doy);
    const end = foldDoy(doy + width - 1);
    const pct = (d: number): number => ((d - 1) / 364) * 100;
    const ink = "var(--ink)";
    const dim = "var(--dominant)";
    let grad: string;
    if (end >= start) {
      grad = `linear-gradient(to right, ${dim} 0 ${pct(start)}%, ${ink} ${pct(start)}% ${pct(end)}%, ${dim} ${pct(end)}% 100%)`;
    } else {
      // Wrap: ink from 0→end and start→100, dominant in the middle.
      grad = `linear-gradient(to right, ${ink} 0 ${pct(end)}%, ${dim} ${pct(end)}% ${pct(start)}%, ${ink} ${pct(start)}% 100%)`;
    }
    range.style.setProperty("--scrubber-fill", grad);
  };

  const syncReadouts = (doy: number): void => {
    const label = windowLabel(doy, width);
    readout.textContent = label;
    stepReadout.textContent = doyLabel(doy);
    paintTrack(doy);
  };

  const emit = (doy: number): void => {
    const folded = foldDoy(doy);
    range.value = String(folded);
    syncReadouts(folded);
    opts.onAnchorChange(folded);
  };

  range.addEventListener("input", () => {
    const doy = Number(range.value);
    // PageUp/Down is native ±? — enforce a documented ±7 week step via keydown below; here
    // just reflect the current value.
    syncReadouts(doy);
    opts.onAnchorChange(doy);
  });

  // Documented ±7-day (one week) page step on PageUp/PageDown.
  range.addEventListener("keydown", (e) => {
    if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      const delta = e.key === "PageUp" ? PAGE_STEP_DAYS : -PAGE_STEP_DAYS;
      emit(Number(range.value) + delta);
    }
  });

  prev.addEventListener("click", () => emit(Number(range.value) - 1));
  next.addEventListener("click", () => emit(Number(range.value) + 1));

  block.append(readout, range, ticks, stepper);
  syncReadouts(foldDoy(opts.initialDoy));

  return {
    el: block,
    setWidth(widthDays: number): void {
      width = widthDays;
      syncReadouts(Number(range.value));
    },
  };
}
