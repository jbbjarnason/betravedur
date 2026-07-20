// The single source of truth for all Phase-4 selection state (RESEARCH Pattern 1).
//
// A ~40-line vanilla-TS observable store — zero dependencies (no redux/zustand/nanostores;
// contradicts the project's zero-new-dep discipline, STACK). It holds one flat, frozen
// SelectionState snapshot and notifies a Set<Listener> on every real change. Two deliberate
// disciplines make it loop-proof and cheap for the scrubber:
//   1. Frozen snapshots — `get()` returns an Object.frozen object, so a subscriber can never
//      mutate shared state; each change produces a fresh frozen snapshot (structural sharing
//      of the previous values, new object identity).
//   2. No-op skip — a `set(patch)` whose every patched key already equals the current value
//      does NOT notify. Scrubber `input` ticks that land on the same doy must not churn the
//      recompute or flood history (RESEARCH Pattern 1 "skip no-op sets").
//
// The URL-writer (Plan 03) and the recompute subscriber (Task 3 here) are just subscribers;
// UI controls (Plan 02) write via `set`. This asymmetry — many writers via `set`, many
// readers via `subscribe` — keeps selection state a clean single choke point that Phase 5/6
// read from without re-plumbing.

/**
 * The complete selection the whole app derives from. Flat by design (no nesting) so a
 * `set(patch)` is a shallow merge and equality checks are per-key primitive comparisons.
 *
 * WR-04 — INVARIANT (do not break without updating store.ts): every field here MUST be a
 * primitive (`number | number | null`). The no-op-skip in `set` compares patched keys with
 * strict `===`, which is correct ONLY for primitives. Adding a non-primitive field (e.g. a
 * `bbox: number[]` viewport or `selectedStations: number[]`) would defeat the skip — a freshly
 * constructed but value-equal array/object is always `!==`, so every such `set` would notify
 * and churn the recompute/history-flood-prevention the whole loop-prevention design leans on.
 * If a non-primitive field is ever needed, make the no-op check value-aware for that key first.
 */
export interface SelectionState {
  /** Window anchor as a leap-folded day-of-year, 1–365 (Feb 29 unreachable by construction). */
  anchorDoy: number;
  /** Window width in days: 7 | 14 | 21 | 30 (SEL-01). */
  widthDays: number;
  /** Baseline range lower bound (inclusive) — data-derived, yearFrom ≤ yearTil (SEL-02). */
  yearFrom: number;
  /** Baseline range upper bound (inclusive) (SEL-02). */
  yearTil: number;
  /** Selected station id, or null when none is selected (Phase-6 seam; encoded now for UX-02). */
  stationId: number | null;
  /** Map viewport longitude (deg). */
  lng: number;
  /** Map viewport latitude (deg). */
  lat: number;
  /** Map viewport zoom. */
  zoom: number;
}

/** A subscriber invoked with the frozen snapshot after every real (non-no-op) change. */
type Listener = (state: Readonly<SelectionState>) => void;

/** The observable store surface: read-only `get`, write via `set`, observe via `subscribe`. */
export interface SelectionStore {
  /** The current frozen snapshot (never mutate — it is Object.frozen). */
  get(): Readonly<SelectionState>;
  /** Register a listener; returns an unsubscribe closure that removes exactly that listener. */
  subscribe(fn: Listener): () => void;
  /** Shallow-merge a partial patch. No-ops (every patched key unchanged) do NOT notify. */
  set(patch: Partial<SelectionState>): void;
}

/**
 * Create a fresh observable selection store seeded with `initial`.
 * The initial snapshot is frozen; every `set` produces a new frozen snapshot and notifies
 * all listeners once, unless the patch changes nothing (then it returns early, no notify).
 */
export function createStore(initial: SelectionState): SelectionStore {
  let state: Readonly<SelectionState> = Object.freeze({ ...initial });
  const listeners = new Set<Listener>();

  return {
    get: (): Readonly<SelectionState> => state,

    subscribe(fn: Listener): () => void {
      listeners.add(fn);
      // Unsubscribe closure: removing the SAME fn reference stops all further notifications.
      return () => {
        listeners.delete(fn);
      };
    },

    set(patch: Partial<SelectionState>): void {
      const next = Object.freeze({ ...state, ...patch });
      // No-op skip: if every key the caller touched already equals its current value, this
      // set changes nothing observable — do not churn subscribers (scrubber same-tick guard).
      const patchedKeys = Object.keys(patch) as (keyof SelectionState)[];
      if (patchedKeys.every((k) => next[k] === state[k])) return;
      state = next;
      // Snapshot the listener set is unnecessary here (we don't mutate during iteration),
      // but iterating a Set is stable for add/delete outside the loop.
      for (const fn of listeners) fn(state);
    },
  };
}
