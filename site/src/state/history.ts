// The store → URL writer + discrete/continuous history discipline (UX-02, RESEARCH Pattern 3).
//
// The store carries no "interaction kind", so the discrete-vs-continuous choice is modelled at
// the CALL SITE via a one-shot flag: a discrete control (width button, year dropdown) calls
// markDiscrete() immediately BEFORE its store.set; the URL-writer subscriber reads-and-CLEARS
// the flag, choosing pushState (discrete → a new, back-button-revertable history entry) when it
// was set, else replaceState (continuous refinements: scrubber drag, map pan/zoom → collapse to
// one entry, no history flooding — T-04-07).
//
// LOOP-PROOF (RESEARCH Pattern 2, CITED MDN): pushState/replaceState do NOT fire popstate, so
// this write can never re-trigger the URL→store read in main.ts. There is deliberately NO
// isUpdating flag — the write-always / read-on-popstate asymmetry makes a loop structurally
// impossible.
import { stateToParams } from "./url.js";
import type { SelectionState } from "./store.js";

/** One-shot flag: true when the NEXT store change came from a discrete control (→ pushState). */
let pendingDiscrete = false;

/**
 * Mark the next store change as discrete (width / year / station) so the URL writer uses
 * pushState (a back-button-revertable entry). Call immediately before the store.set. The flag
 * is auto-cleared by the writer, so it only ever affects the single change it precedes.
 */
export function markDiscrete(): void {
  pendingDiscrete = true;
}

/**
 * Write the current state to the URL. Uses pushState when a discrete change was marked (then
 * clears the mark), otherwise replaceState. Pure history mutation — no DOM, no popstate fired.
 */
export function writeUrl(state: SelectionState): void {
  const url = `${location.pathname}?${stateToParams(state)}`;
  if (pendingDiscrete) {
    pendingDiscrete = false;
    history.pushState(null, "", url);
  } else {
    history.replaceState(null, "", url);
  }
}
