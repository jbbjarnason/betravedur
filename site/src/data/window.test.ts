// Unit tests for anchorToWindow (SEL-01): anchor+width → wrap-aware WindowSpec.
//
// The property test cross-checks against the domain's expandWindow so the day-count contract
// (a width-w window covers exactly w distinct doys, wrap included) is proven end-to-end.
import { describe, it, expect } from "vitest";
import { expandWindow } from "@betravedur/domain";
import { anchorToWindow } from "./window.js";

describe("anchorToWindow (SEL-01)", () => {
  it("non-wrapping: width 7 spans 7 inclusive days", () => {
    expect(anchorToWindow(197, 7)).toEqual({ startDoy: 197, endDoy: 203 });
  });

  it("non-wrapping from doy 1: width 30", () => {
    expect(anchorToWindow(1, 30)).toEqual({ startDoy: 1, endDoy: 30 });
  });

  it("wraps past year end: anchor 360, width 14 → endDoy 8 (< startDoy)", () => {
    // 360 + 14 - 1 = 373 → 373 - 365 = 8.
    expect(anchorToWindow(360, 14)).toEqual({ startDoy: 360, endDoy: 8 });
  });

  it("wraps from the very last doy: anchor 365, width 7 → endDoy 6", () => {
    // 365 + 7 - 1 = 371 → 371 - 365 = 6.
    expect(anchorToWindow(365, 7)).toEqual({ startDoy: 365, endDoy: 6 });
  });

  it("property: expandWindow(anchorToWindow(a, w)).size === w for representative (a,w) incl. a wrap", () => {
    const cases: [number, number][] = [
      [197, 7],
      [1, 30],
      [100, 21],
      [360, 14], // wrapping case
      [365, 7], // wrapping case
      [350, 30], // wrapping case
    ];
    for (const [a, w] of cases) {
      expect(expandWindow(anchorToWindow(a, w)).size).toBe(w);
    }
  });
});
