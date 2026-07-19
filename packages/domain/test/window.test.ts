import { describe, expect, it } from "vitest";
import { expandWindow, leapFoldedDoy } from "../src/window.js";

describe("leapFoldedDoy — leap day fold", () => {
  it("maps July 19 to the SAME index in a leap and a non-leap year", () => {
    // 2024 is a leap year, 2023 is not — July 19 must fold to one index.
    expect(leapFoldedDoy("2024-07-19")).toBe(leapFoldedDoy("2023-07-19"));
  });

  it("folds Feb 29 out (returns null)", () => {
    expect(leapFoldedDoy("2024-02-29")).toBeNull();
  });

  it("keeps March 1 unaffected by the leap day before it", () => {
    expect(leapFoldedDoy("2024-03-01")).toBe(leapFoldedDoy("2023-03-01"));
  });

  it("returns 1 for Jan 1 and 365 for Dec 31 in both year kinds", () => {
    expect(leapFoldedDoy("2023-01-01")).toBe(1);
    expect(leapFoldedDoy("2024-01-01")).toBe(1);
    expect(leapFoldedDoy("2023-12-31")).toBe(365);
    expect(leapFoldedDoy("2024-12-31")).toBe(365);
  });

  it("maps Feb 28 the same in both year kinds", () => {
    expect(leapFoldedDoy("2024-02-28")).toBe(leapFoldedDoy("2023-02-28"));
    expect(leapFoldedDoy("2023-02-28")).toBe(59);
  });
});

describe("expandWindow", () => {
  it("returns an inclusive set for a normal (non-wrapping) window", () => {
    const days = expandWindow({ startDoy: 10, endDoy: 14 });
    expect([...days].sort((a, b) => a - b)).toEqual([10, 11, 12, 13, 14]);
  });

  it("wraps the year-end when endDoy < startDoy", () => {
    const days = expandWindow({ startDoy: 360, endDoy: 5 });
    // spans 360..365 and 1..5
    for (const d of [360, 361, 362, 363, 364, 365, 1, 2, 3, 4, 5]) {
      expect(days.has(d)).toBe(true);
    }
    expect(days.size).toBe(11);
    // days strictly between the two ranges are NOT included
    expect(days.has(6)).toBe(false);
    expect(days.has(359)).toBe(false);
  });

  it("returns a single-day set when start === end", () => {
    const days = expandWindow({ startDoy: 200, endDoy: 200 });
    expect([...days]).toEqual([200]);
  });
});
