import { describe, expect, it } from "vitest";
import { meanPerYearSeries } from "../src/trend.js";
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

describe("meanPerYearSeries", () => {
  it("emits one ascending point per year with a clear upward trend", () => {
    const rowsByYear = new Map<number, DailyObservation[]>([
      // Intentionally out of insertion order to prove the ascending sort.
      [2012, [obs(1, 2), obs(2, 4)]], // mean 3
      [2010, [obs(1, 0), obs(2, 2)]], // mean 1
      [2011, [obs(1, 1), obs(2, 3)]], // mean 2
    ]);
    expect(meanPerYearSeries(rowsByYear, windowDays, (o) => o.t)).toEqual([
      { year: 2010, mean: 1 },
      { year: 2011, mean: 2 },
      { year: 2012, mean: 3 },
    ]);
  });

  it("skips null values (never counts them as 0) and out-of-window days", () => {
    const rowsByYear = new Map<number, DailyObservation[]>([
      [2011, [obs(1, 10), obs(2, null), obs(99, 999)]], // doy 99 out of window
    ]);
    // Only doy 1 (=10) counts → year-mean 10.
    expect(meanPerYearSeries(rowsByYear, windowDays, (o) => o.t)).toEqual([{ year: 2011, mean: 10 }]);
  });

  it("omits a year with no present in-window value (not emitted as 0)", () => {
    const rowsByYear = new Map<number, DailyObservation[]>([
      [2010, [obs(1, 5)]], // present → kept
      [2011, [obs(1, null), obs(2, null)]], // all null → omitted
      [2012, [obs(99, 12)]], // out of window → omitted
    ]);
    expect(meanPerYearSeries(rowsByYear, windowDays, (o) => o.t)).toEqual([{ year: 2010, mean: 5 }]);
  });

  it("first present value per doy wins; duplicate rows never double-count", () => {
    const rowsByYear = new Map<number, DailyObservation[]>([
      [2011, [obs(1, 10), obs(1, 999), obs(2, 20)]], // duplicate doy 1
    ]);
    // doy 1 → 10 (first wins), doy 2 → 20; year-mean 15.
    expect(meanPerYearSeries(rowsByYear, windowDays, (o) => o.t)).toEqual([{ year: 2011, mean: 15 }]);
  });

  it("returns [] on an empty map", () => {
    expect(meanPerYearSeries(new Map(), windowDays, (o) => o.t)).toEqual([]);
  });
});
