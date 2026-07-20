import { describe, expect, it } from "vitest";
import { meanPerYearThenAverage } from "../src/meanPerYear.js";
import type { DailyObservation } from "../src/types.js";

function obs(doy: number, t: number | null): DailyObservation {
  return {
    station: 1,
    date: "2020-01-01",
    doy,
    t,
    tx: null,
    tn: null,
    f: null,
    fx: null,
    fg: null,
    dv: null,
    r: null,
  };
}

const windowDays = new Set([1, 2, 3, 4, 5]); // 5-day window

describe("meanPerYearThenAverage", () => {
  it("takes the per-year mean, then averages those year-means equally", () => {
    const rowsByYear = new Map<number, DailyObservation[]>([
      // year A mean = 10
      [2011, [obs(1, 8), obs(2, 12)]],
      // year B mean = 20
      [2012, [obs(1, 18), obs(2, 22)]],
    ]);
    // (10 + 20) / 2 = 15 — NOT the pooled (8+12+18+22)/4 = 15 here, but the
    // divergence shows below when day counts differ.
    expect(meanPerYearThenAverage(rowsByYear, windowDays, [2011, 2012], (o) => o.t)).toBe(15);
  });

  it("weights each qualifying year EQUALLY, not by its day count", () => {
    const rowsByYear = new Map<number, DailyObservation[]>([
      // year A: 4 days all at 0 → year-mean 0
      [2011, [obs(1, 0), obs(2, 0), obs(3, 0), obs(4, 0)]],
      // year B: 1 day at 30 → year-mean 30
      [2012, [obs(1, 30)]],
    ]);
    // Equal-weight: (0 + 30) / 2 = 15. A day-weighted pool would be
    // (0*4 + 30*1)/5 = 6 — this asserts we do NOT day-weight.
    expect(meanPerYearThenAverage(rowsByYear, windowDays, [2011, 2012], (o) => o.t)).toBe(15);
  });

  it("only the qualifying years passed in contribute (non-qualifying years ignored)", () => {
    const rowsByYear = new Map<number, DailyObservation[]>([
      [2011, [obs(1, 10)]],
      [2012, [obs(1, 100)]], // present but NOT in the qualifying list
    ]);
    expect(meanPerYearThenAverage(rowsByYear, windowDays, [2011], (o) => o.t)).toBe(10);
  });

  it("skips null values (never counts them as 0) and out-of-window days", () => {
    const rowsByYear = new Map<number, DailyObservation[]>([
      [2011, [obs(1, 10), obs(2, null), obs(99, 999)]], // doy 99 out of window
    ]);
    // Only doy 1 (=10) counts → year-mean 10 → overall 10.
    expect(meanPerYearThenAverage(rowsByYear, windowDays, [2011], (o) => o.t)).toBe(10);
  });

  it("first present value per doy wins; duplicate rows never double-count", () => {
    const rowsByYear = new Map<number, DailyObservation[]>([
      [2011, [obs(1, 10), obs(1, 999), obs(2, 20)]], // duplicate doy 1
    ]);
    // doy 1 → 10 (first wins), doy 2 → 20; year-mean = 15.
    expect(meanPerYearThenAverage(rowsByYear, windowDays, [2011], (o) => o.t)).toBe(15);
  });

  it("returns null when no qualifying years", () => {
    expect(meanPerYearThenAverage(new Map(), windowDays, [], (o) => o.t)).toBeNull();
  });

  it("returns null when qualifying years carry no present in-window value", () => {
    const rowsByYear = new Map<number, DailyObservation[]>([
      [2011, [obs(1, null), obs(2, null)]],
    ]);
    expect(meanPerYearThenAverage(rowsByYear, windowDays, [2011], (o) => o.t)).toBeNull();
  });
});
