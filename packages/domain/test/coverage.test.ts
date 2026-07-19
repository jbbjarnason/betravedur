import { describe, expect, it } from "vitest";
import { effectiveN, qualifyingYears } from "../src/coverage.js";
import type { DailyObservation } from "../src/types.js";

// Minimal row factory: only doy + the metric under test matter here.
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

const windowDays = new Set([1, 2, 3, 4, 5, 6, 7]); // 7-day window
const temp = (o: DailyObservation) => o.t;

describe("qualifyingYears — qualifying years coverage", () => {
  it("qualifies a year with 6 of 7 window days present (0.857 >= 0.8)", () => {
    const rowsByYear = new Map<number, DailyObservation[]>([
      [2011, [1, 2, 3, 4, 5, 6].map((d) => obs(d, 10))], // 6/7
    ]);
    expect(qualifyingYears(rowsByYear, windowDays, temp)).toEqual([2011]);
  });

  it("rejects a year with 5 of 7 window days present (0.714 < 0.8)", () => {
    const rowsByYear = new Map<number, DailyObservation[]>([
      [2011, [1, 2, 3, 4, 5].map((d) => obs(d, 10))], // 5/7
    ]);
    expect(qualifyingYears(rowsByYear, windowDays, temp)).toEqual([]);
  });

  it("qualifies at exactly the 0.8 boundary (8 of 10 days)", () => {
    const tenDayWindow = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const rowsByYear = new Map<number, DailyObservation[]>([
      [2011, [1, 2, 3, 4, 5, 6, 7, 8].map((d) => obs(d, 10))], // exactly 0.8
    ]);
    expect(qualifyingYears(rowsByYear, tenDayWindow, temp)).toEqual([2011]);
  });

  it("does NOT count a present row whose metric is null", () => {
    const rowsByYear = new Map<number, DailyObservation[]>([
      // 7 rows present, but 2 have null temp -> 5 usable -> 0.714 < 0.8
      [
        2011,
        [
          obs(1, 10),
          obs(2, 10),
          obs(3, 10),
          obs(4, 10),
          obs(5, 10),
          obs(6, null),
          obs(7, null),
        ],
      ],
    ]);
    expect(qualifyingYears(rowsByYear, windowDays, temp)).toEqual([]);
  });

  it("WR-02 regression: duplicate rows for the same doy count as ONE window day", () => {
    // 4 distinct days covered, but 8 rows (each day duplicated). Row-counting
    // would yield 8/7 > 0.8 and wrongly qualify; distinct-day counting gives
    // 4/7 = 0.571 < 0.8 -> reject.
    const dup = [1, 2, 3, 4].flatMap((d) => [obs(d, 10), obs(d, 11)]);
    const rowsByYear = new Map<number, DailyObservation[]>([[2011, dup]]);
    expect(qualifyingYears(rowsByYear, windowDays, temp)).toEqual([]);
  });

  it("WR-02 regression: duplicates of already-covered days do not change a qualifying year", () => {
    // 6 distinct days (qualifies at 6/7) plus duplicates — still qualifies, once.
    const rows = [1, 2, 3, 4, 5, 6].map((d) => obs(d, 10)).concat([obs(1, 9), obs(2, 9)]);
    const rowsByYear = new Map<number, DailyObservation[]>([[2011, rows]]);
    expect(qualifyingYears(rowsByYear, windowDays, temp)).toEqual([2011]);
  });

  it("ignores rows outside the window and returns sorted ascending", () => {
    const rowsByYear = new Map<number, DailyObservation[]>([
      [2013, [1, 2, 3, 4, 5, 6, 7].map((d) => obs(d, 10))],
      [2011, [1, 2, 3, 4, 5, 6, 7].map((d) => obs(d, 10))],
      // rows at doy 100/200 are outside the window and must not count
      [2012, [1, 2, 3, 4, 5, 100, 200].map((d) => obs(d, 10))], // only 5 in-window -> reject
    ]);
    expect(qualifyingYears(rowsByYear, windowDays, temp)).toEqual([2011, 2013]);
  });
});

describe("effectiveN — min N 3", () => {
  it("is insufficient below 3 qualifying years", () => {
    expect(effectiveN([2011, 2012])).toEqual({ n: 2, sufficient: false });
  });

  it("is sufficient at exactly 3 qualifying years", () => {
    expect(effectiveN([2011, 2012, 2013])).toEqual({ n: 3, sufficient: true });
  });

  it("is insufficient with zero qualifying years", () => {
    expect(effectiveN([])).toEqual({ n: 0, sufficient: false });
  });
});
