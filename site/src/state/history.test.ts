// Regression tests for the discrete/continuous history discipline (UX-02) and the WR-01 fix.
//
// vitest runs in Node with no `history`/`location` global, so these tests stub a minimal
// history spy and drive writeUrl directly — mirroring exactly how main.ts wires the URL-writer
// subscriber (`store.subscribe((state) => writeUrl(state))`). The store itself is pure, so the
// full markDiscrete → set → writeUrl loop is reproducible without a DOM.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markDiscrete, setDiscrete, writeUrl } from "./history.js";
import { createStore, type SelectionState } from "./store.js";

const BASE: SelectionState = {
  anchorDoy: 197,
  widthDays: 14,
  yearFrom: 2016,
  yearTil: 2024,
  stationId: null,
  lng: -19,
  lat: 65,
  zoom: 6,
};

let pushSpy: ReturnType<typeof vi.fn>;
let replaceSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  pushSpy = vi.fn();
  replaceSpy = vi.fn();
  // Minimal history/location stubs so writeUrl (pure history mutation) runs in Node.
  vi.stubGlobal("history", { pushState: pushSpy, replaceState: replaceSpy });
  vi.stubGlobal("location", { pathname: "/" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Wire a fresh store to the URL-writer subscriber exactly as main.ts does. */
function wire(initial: SelectionState = BASE) {
  const store = createStore(initial);
  store.subscribe((state) => writeUrl(state));
  return store;
}

describe("history discipline: discrete → pushState, continuous → replaceState", () => {
  it("a discrete change (setDiscrete) that actually changes state pushState's once", () => {
    const store = wire();
    setDiscrete(store, { stationId: 42 });
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(replaceSpy).toHaveBeenCalledTimes(0);
  });

  it("a continuous change (bare store.set) replaceState's, never pushState's", () => {
    const store = wire();
    store.set({ anchorDoy: 200 }); // scrubber drag — continuous
    expect(pushSpy).toHaveBeenCalledTimes(0);
    expect(replaceSpy).toHaveBeenCalledTimes(1);
  });
});

describe("WR-01: re-selecting the already-selected value never leaves the discrete flag dangling", () => {
  it("re-clicking the already-selected station is a no-op, and the NEXT continuous change replaceState's (no spurious pushState)", () => {
    const store = wire({ ...BASE, stationId: 42 });

    // Re-select the SAME station via the shared discrete seam. This is a store no-op (stationId
    // already 42) → no notify → no writeUrl. Crucially setDiscrete must NOT arm the flag.
    setDiscrete(store, { stationId: 42 });
    expect(pushSpy).toHaveBeenCalledTimes(0);
    expect(replaceSpy).toHaveBeenCalledTimes(0); // the set itself was a no-op

    // Now a genuinely-continuous change (scrubber drag). Before the WR-01 fix the dangling flag
    // made this wrongly pushState. It must replaceState.
    store.set({ anchorDoy: 210 });
    expect(pushSpy).toHaveBeenCalledTimes(0);
    expect(replaceSpy).toHaveBeenCalledTimes(1);
  });

  it("re-pressing the already-active width is a no-op that does not corrupt the next continuous change", () => {
    const store = wire({ ...BASE, widthDays: 14 });
    setDiscrete(store, { widthDays: 14 }); // re-press active width → no-op
    store.set({ anchorDoy: 205 }); // continuous
    expect(pushSpy).toHaveBeenCalledTimes(0);
    expect(replaceSpy).toHaveBeenCalledTimes(1);
  });

  it("demonstrates the bare markDiscrete danger the seam guards against: an armed-but-no-op set leaves the flag dangling", () => {
    // This test documents WHY setDiscrete exists: the raw markDiscrete + no-op set path is the
    // exact bug WR-01 describes. Arming then a no-op set leaves the flag set, so the following
    // continuous change wrongly pushState's. setDiscrete is the fix; the raw pair is unsafe.
    const store = wire({ ...BASE, stationId: 42 });
    markDiscrete(); // armed
    store.set({ stationId: 42 }); // no-op → subscriber never runs → flag stays armed
    expect(pushSpy).toHaveBeenCalledTimes(0);
    // The dangling flag now poisons the next continuous change:
    store.set({ anchorDoy: 210 });
    expect(pushSpy).toHaveBeenCalledTimes(1); // <-- the bug, reproduced with the raw pair
    // Clean the leaked flag so it cannot bleed into a later test (writeUrl clears on the push).
  });
});
