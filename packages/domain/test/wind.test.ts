import { describe, expect, it } from "vitest";
import { circularMeanDirection, scalarMeanSpeed } from "../src/wind.js";

// Helper: circular distance between two bearings in degrees (0..180).
function angularDistance(a: number, b: number): number {
  const d = Math.abs(((a - b + 540) % 360) - 180);
  return d;
}

describe("circularMeanDirection — circular mean 350 10", () => {
  it("averages 350 and 10 to ~north (0/360), NEVER ~180 (the named bug)", () => {
    const result = circularMeanDirection([
      { speed: 1, dirDeg: 350 },
      { speed: 1, dirDeg: 10 },
    ]);
    expect(result).not.toBeNull();
    // within 0.5 of north (0 or 360)
    expect(angularDistance(result!.dirDeg, 0)).toBeLessThanOrEqual(0.5);
    // explicit NOT-180 assertion: must not be near due south
    expect(angularDistance(result!.dirDeg, 180)).toBeGreaterThan(10);
  });

  it("returns null for an empty sample set", () => {
    expect(circularMeanDirection([])).toBeNull();
  });

  it("returns a small resultantSpeed for a near-cancelling N/S pair (breytileg átt)", () => {
    const result = circularMeanDirection([
      { speed: 5, dirDeg: 0 },
      { speed: 5, dirDeg: 180 },
    ]);
    expect(result).not.toBeNull();
    // near-perfect cancellation -> resultant speed near zero despite 5 m/s samples
    expect(result!.resultantSpeed).toBeLessThan(0.001);
  });

  it("returns a plausible direction for a coherent set (all ~90 -> ~east)", () => {
    const result = circularMeanDirection([
      { speed: 3, dirDeg: 88 },
      { speed: 3, dirDeg: 92 },
      { speed: 3, dirDeg: 90 },
    ]);
    expect(result).not.toBeNull();
    expect(angularDistance(result!.dirDeg, 90)).toBeLessThan(1);
  });
});

describe("scalarMeanSpeed — scalar wind speed", () => {
  it("averages non-null speeds, skipping nulls (not treating them as 0)", () => {
    expect(scalarMeanSpeed([5, null, 7])).toBe(6);
  });

  it("returns null when there are no usable speeds", () => {
    expect(scalarMeanSpeed([null])).toBeNull();
    expect(scalarMeanSpeed([])).toBeNull();
  });
});
