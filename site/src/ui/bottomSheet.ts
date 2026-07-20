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

/** Options for the (Plan-03) sheet drag controller: the two snap positions + an optional callback. */
export interface AttachSheetOptions {
  peekY: number;
  expandedY: number;
  onSnap?: (y: number) => void;
}

/**
 * TYPED STUB for the Pointer-Events drag controller. Plan 03 implements the real body (pointerdown/
 * pointermove/pointerup + setPointerCapture, snapping via `snapNearest`); for now it wires nothing
 * and returns a no-op teardown so the seam is stable and tsc passes. Keeping the signature here lets
 * stationPanel.ts import + call it in Plan 03 without a later import churn.
 */
export function attachSheet(
  _sheetEl: HTMLElement,
  _handleEl: HTMLElement,
  _opts: AttachSheetOptions,
): () => void {
  return () => {};
}
