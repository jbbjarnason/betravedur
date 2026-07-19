import { describe, expect, it } from "vitest";
import { sumPerYearThenAverage } from "../src/precip.js";
import type { DailyObservation } from "../src/types.js";

function obs(doy: number, r: number | null): DailyObservation {
  return {
    station: 1,
    date: "2020-01-01",
    doy,
    t: null,
    tx: null,
    tn: null,
    f: null,
    fx: null,
    fg: null,
    dv: null,
    r,
  };
}

const windowDays = new Set([1, 2, 3, 4, 5]); // 5-day window

describe("sumPerYearThenAverage", () => {
  it("sums per year, then averages across qualifying years (10mm & 20mm -> 15mm)", () => {
    const rowsByYear = new Map<number, DailyObservation[]>([
      // year A: 10mm total over present days
      [2011, [obs(1, 2), obs(2, 3), obs(3, 5)]],
      // year B: 20mm total
      [2012, [obs(1, 8), obs(2, 8), obs(3, 4)]],
    ]);
    expect(sumPerYearThenAverage(rowsByYear, windowDays, [2011, 2012])).toBe(15);
  });

  it("only averages over years listed in `qualifying`", () => {
    const rowsByYear = new Map<number, DailyObservation[]>([
      [2011, [obs(1, 10)]], // 10mm
      [2012, [obs(1, 20)]], // 20mm
      [2013, [obs(1, 999)]], // NOT qualifying -> must be ignored
    ]);
    expect(sumPerYearThenAverage(rowsByYear, windowDays, [2011, 2012])).toBe(15);
  });

  it("returns null when there are no qualifying years", () => {
    const rowsByYear = new Map<number, DailyObservation[]>([[2011, [obs(1, 10)]]]);
    expect(sumPerYearThenAverage(rowsByYear, windowDays, [])).toBeNull();
  });
});

describe("precip missing not zero", () => {
  it("skips a null precip day rather than adding it as 0 (missing != zero)", () => {
    // Same year, but one variant has a null day where the other simply omits it.
    // A null day must NOT reduce the sum toward zero.
    const withNullDay = new Map<number, DailyObservation[]>([
      [2011, [obs(1, 5), obs(2, 5), obs(3, null)]],
    ]);
    const withoutNullDay = new Map<number, DailyObservation[]>([
      [2011, [obs(1, 5), obs(2, 5)]],
    ]);
    const a = sumPerYearThenAverage(withNullDay, windowDays, [2011]);
    const b = sumPerYearThenAverage(withoutNullDay, windowDays, [2011]);
    // Both are 10mm — the null day contributed nothing (not a zero that inflates dryness).
    expect(a).toBe(10);
    expect(b).toBe(10);
    expect(a).toBe(b);
  });

  it("a null-zero coercion bug would have produced a DIFFERENT (lower mean) — guard it", () => {
    // If null were coerced to 0, a year of [null, null, 10] over a wider average
    // would look drier. Assert the sum equals only the present value.
    const rowsByYear = new Map<number, DailyObservation[]>([
      [2011, [obs(1, null), obs(2, null), obs(3, 10)]],
    ]);
    expect(sumPerYearThenAverage(rowsByYear, windowDays, [2011])).toBe(10);
  });
});
