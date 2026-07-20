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
import type { SelectionState, SelectionStore } from "./store.js";

/** One-shot flag: true when the NEXT store change came from a discrete control (→ pushState). */
let pendingDiscrete = false;

/**
 * Mark the next store change as discrete (width / year / station) so the URL writer uses
 * pushState (a back-button-revertable entry). Call immediately before the store.set. The flag
 * is auto-cleared by the writer, so it only ever affects the single change it precedes.
 *
 * WR-01 CAVEAT: on its own this can leave the flag dangling. If the store.set that follows is a
 * no-op (every patched key already equals its current value), the store skips notification, the
 * URL-writer subscriber never runs, and writeUrl (the only place the flag is cleared) never
 * fires — so the flag stays armed and the NEXT genuinely-continuous change (a scrubber drag)
 * wrongly pushState's. Prefer `setDiscrete(store, patch)` at call sites, which arms the flag
 * ONLY when the patch will actually change state (so a re-select of the already-selected value
 * never arms a dangling flag).
 */
export function markDiscrete(): void {
  pendingDiscrete = true;
}

/**
 * Discrete-change seam (WR-01): arm the discrete-history flag and apply `patch`, but ONLY arm
 * the flag when `patch` will actually change the store — i.e. at least one patched key differs
 * from the current snapshot. Re-selecting the already-selected station / width / year is a
 * store no-op, so it must NOT arm the flag (otherwise the flag dangles and corrupts the next
 * continuous change's history discipline). This is the shared fix for every discrete control
 * (ranked-row re-click, width re-press, year re-select).
 */
export function setDiscrete(store: SelectionStore, patch: Partial<SelectionState>): void {
  const current = store.get();
  const changes = (Object.keys(patch) as (keyof SelectionState)[]).some(
    (k) => patch[k] !== current[k],
  );
  if (changes) markDiscrete();
  store.set(patch);
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
