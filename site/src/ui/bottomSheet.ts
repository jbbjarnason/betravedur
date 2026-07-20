// Bottom-sheet PURE helpers + a typed drag-controller STUB (Phase 7, UX-03).
//
// COUPLING: MOBILE_QUERY must stay byte-identical to the `@media (max-width: 640px)` breakpoint in
// controls.css / panel.css (RESEARCH Pitfall 2). It is the single 640px source of truth so the JS
// drag controller enables at exactly the width the CSS switches the layout — no dead zone where a
// side-panel layout gets sheet-drag behavior (or vice versa).
//
// This plan (01) ships ONLY the constant + the pure `snapNearest` math + a typed no-op `attachSheet`
// stub so tsc passes and Plan 03 can fill the Pointer-Events drag body without changing the seam.

/** The single desktop↔mobile breakpoint — identical to the CSS `@media (max-width: 640px)`. */
export const MOBILE_QUERY = "(max-width: 640px)";

/**
 * Pure snap math: given the sheet's current translateY and the two snap targets, return whichever
 * target `currentY` is numerically CLOSER to. An exact midpoint tie resolves to `expandedY` (prefer
 * the more-open snap — a tie should reveal, not hide, the station panel). No DOM, trivially unit-
 * checkable; the drag controller (Plan 03) calls this on pointer release.
 */
export function snapNearest(currentY: number, peekY: number, expandedY: number): number {
  const dPeek = Math.abs(currentY - peekY);
  const dExpanded = Math.abs(currentY - expandedY);
  // `<=` so an exact tie (dExpanded === dPeek) chooses expandedY.
  return dExpanded <= dPeek ? expandedY : peekY;
}

/**
 * Pure keyboard-toggle math: given the sheet's current translateY and the two snap targets, return
 * whichever snap is NOT the one `currentY` is currently at (its nearest). This is the keyboard/tap
 * equivalent of the drag — Enter/Space on the handle flips peek↔expanded. Built on `snapNearest`
 * so the "current" snap resolution is identical to the pointer-release snap (a midpoint tie counts
 * as expanded, so a toggle from the exact middle collapses to peek). No DOM — unit-checkable.
 */
export function toggleTarget(currentY: number, peekY: number, expandedY: number): number {
  const current = snapNearest(currentY, peekY, expandedY);
  return current === expandedY ? peekY : expandedY;
}

/** Options for the sheet drag controller: the two snap positions + an optional settle callback. */
export interface AttachSheetOptions {
  peekY: number;
  expandedY: number;
  /** Called with the settled translateY after every snap (drag release OR keyboard toggle). */
  onSnap?: (y: number) => void;
}

/** Read the sheet's current translateY (px) from its inline transform; 0 when unset/none. */
function currentTranslateY(el: HTMLElement): number {
  const t = el.style.transform;
  const m = /translateY\(\s*(-?[\d.]+)px\s*\)/.exec(t);
  return m ? parseFloat(m[1]!) : 0;
}

/** Write a translateY(px) transform (the sheet's only inline geometry the controller owns). */
function setTranslateY(el: HTMLElement, y: number): void {
  el.style.transform = `translateY(${y}px)`;
}

/**
 * The Pointer-Events bottom-sheet drag controller (UX-03). Promotes the mobile `.station-panel`
 * to a draggable sheet between two snap points (peek ↔ expanded) driven by `handleEl` (the drag
 * grabber). Returns a teardown `() => void` that removes EVERY listener it added.
 *
 * matchMedia-gated: only wires drag when `matchMedia(MOBILE_QUERY).matches` (the CSS `@media
 * (max-width: 640px)` owns the desktop side-panel layout, so on desktop this is a no-op teardown).
 *
 * Non-modal (RESEARCH anti-pattern): the sheet occupies only its own box — NO backdrop, NO focus
 * trap — so the map above it stays pannable. The keyboard equivalent (Enter/Space on the handle)
 * toggles peek↔expanded via `toggleTarget`, so no functionality is drag-only (a11y criterion 17).
 *
 * Transitions: `transition: none` while dragging (raw finger-follow); the CSS `.station-panel`
 * transition (zeroed under prefers-reduced-motion via panel.css) is restored on release so the
 * snap eases — the controller never sets an inline transition-duration, so reduced-motion stays
 * CSS-owned. `onSnap(settledY)` fires after every settle so the caller can raise the attribution
 * safe-zone to the sheet's current top.
 */
export function attachSheet(
  sheetEl: HTMLElement,
  handleEl: HTMLElement,
  opts: AttachSheetOptions,
): () => void {
  // Desktop: the CSS @media owns the side-panel layout — wire nothing (no-op teardown).
  if (typeof matchMedia === "undefined" || !matchMedia(MOBILE_QUERY).matches) {
    // The sheet still starts at peek visually via CSS; announce that top once so a caller that
    // raises --attrib-safe-bottom on mount has nothing to do on desktop (guarded by MOBILE_QUERY
    // in the caller too). Return a no-op teardown.
    return () => {};
  }

  const { peekY, expandedY } = opts;
  // Start the sheet at PEEK (the CSS default is also peek; keep JS + CSS agreed so the first
  // onSnap the caller triggers reflects the real position).
  setTranslateY(sheetEl, peekY);
  opts.onSnap?.(peekY);

  let dragging = false;
  let startY = 0;
  let startTranslate = 0;

  const snapTo = (y: number): void => {
    setTranslateY(sheetEl, y);
    opts.onSnap?.(y);
  };

  const onDown = (e: PointerEvent): void => {
    dragging = true;
    startY = e.clientY;
    startTranslate = currentTranslateY(sheetEl);
    // Capture so pointermove/up keep firing even when the finger leaves the handle box.
    try {
      handleEl.setPointerCapture(e.pointerId);
    } catch {
      /* setPointerCapture can throw on a stale pointer id — drag still works via the handle. */
    }
    // Raw finger-follow while dragging — no easing between frames.
    sheetEl.style.transition = "none";
    e.preventDefault();
  };

  const onMove = (e: PointerEvent): void => {
    if (!dragging) return;
    // Clamp to [expandedY, peekY]: never drag above the fully-expanded top, never below peek
    // (the sheet's own box is its floor — no over-drag past the peek reveal).
    const raw = startTranslate + (e.clientY - startY);
    const y = Math.min(peekY, Math.max(expandedY, raw));
    setTranslateY(sheetEl, y);
  };

  const onUp = (e: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    try {
      handleEl.releasePointerCapture(e.pointerId);
    } catch {
      /* already released / never captured — harmless. */
    }
    // Restore the CSS-owned transition (reduced-motion-aware in panel.css) so the snap eases,
    // then settle to the nearest snap point.
    sheetEl.style.transition = "";
    snapTo(snapNearest(currentTranslateY(sheetEl), peekY, expandedY));
  };

  // Keyboard equivalent of the drag: Enter/Space on the handle toggles peek↔expanded.
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
    e.preventDefault();
    sheetEl.style.transition = ""; // ensure the CSS ease (or reduced-motion instant) applies
    snapTo(toggleTarget(currentTranslateY(sheetEl), peekY, expandedY));
  };

  handleEl.addEventListener("pointerdown", onDown);
  handleEl.addEventListener("pointermove", onMove);
  handleEl.addEventListener("pointerup", onUp);
  handleEl.addEventListener("pointercancel", onUp);
  handleEl.addEventListener("keydown", onKey);

  return () => {
    handleEl.removeEventListener("pointerdown", onDown);
    handleEl.removeEventListener("pointermove", onMove);
    handleEl.removeEventListener("pointerup", onUp);
    handleEl.removeEventListener("pointercancel", onUp);
    handleEl.removeEventListener("keydown", onKey);
  };
}
