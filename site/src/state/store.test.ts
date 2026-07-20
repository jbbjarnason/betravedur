// Unit tests for the vanilla observable selection store (RESEARCH Pattern 1).
//
// Pins the four load-bearing behaviours the whole phase rests on: frozen snapshots,
// notify-on-real-change, no-op skip (the scrubber same-tick guard), and unsubscribe.
import { describe, it, expect, vi } from "vitest";
import { createStore, type SelectionState } from "./store.js";

const BASE: SelectionState = {
  anchorDoy: 197,
  widthDays: 14,
  yearFrom: 2016,
  yearTil: 2026,
  stationId: null,
  lng: -19,
  lat: 65,
  zoom: 6,
};

describe("createStore", () => {
  it("get() returns a frozen snapshot equal to the initial state", () => {
    const store = createStore(BASE);
    const snap = store.get();
    expect(snap).toEqual(BASE);
    expect(Object.isFrozen(snap)).toBe(true);
  });

  it("set() notifies each subscriber once with the merged frozen snapshot; other fields unchanged", () => {
    const store = createStore(BASE);
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe(a);
    store.subscribe(b);

    store.set({ anchorDoy: 30 });

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    // noUncheckedIndexedAccess: calls[0] is `unknown[] | undefined`. The prior toHaveBeenCalledTimes(1)
    // guarantees calls[0] exists; assert it explicitly, then read arg 0.
    expect(a.mock.calls[0]).toBeDefined();
    const snap = a.mock.calls[0]![0] as Readonly<SelectionState>;
    expect(snap.anchorDoy).toBe(30);
    // Untouched fields carry through unchanged.
    expect(snap.widthDays).toBe(14);
    expect(snap.yearFrom).toBe(2016);
    expect(snap.stationId).toBeNull();
    expect(Object.isFrozen(snap)).toBe(true);
    // The store's own get() reflects the new snapshot too.
    expect(store.get().anchorDoy).toBe(30);
  });

  it("a no-op set (patching a key to its current value) does NOT notify", () => {
    const store = createStore(BASE);
    const listener = vi.fn();
    store.subscribe(listener);

    // anchorDoy already 197; widthDays already 14 — nothing changes.
    store.set({ anchorDoy: 197 });
    store.set({ anchorDoy: 197, widthDays: 14 });

    expect(listener).toHaveBeenCalledTimes(0);
    // And an empty patch is likewise a no-op.
    store.set({});
    expect(listener).toHaveBeenCalledTimes(0);
  });

  it("subscribe returns an unsubscribe fn that removes the listener (no further notifications)", () => {
    const store = createStore(BASE);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.set({ anchorDoy: 10 });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.set({ anchorDoy: 20 });
    expect(listener).toHaveBeenCalledTimes(1); // no further notifications after unsubscribe
  });
});
