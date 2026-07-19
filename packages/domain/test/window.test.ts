import { describe, expect, it } from "vitest";
import { expandWindow, groupBySeasonYear, leapFoldedDoy } from "../src/window.js";
import { qualifyingYears } from "../src/coverage.js";
import type { DailyObservation } from "../src/types.js";

/** Minimal row factory: only date/doy/t matter for the grouping tests. */
function obs(date: string, t: number | null = 10): DailyObservation {
  return {
    station: 1,
    date,
    doy: leapFoldedDoy(date)!,
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

  it("WR-04 regression: malformed day slices return null, never NaN", () => {
    expect(leapFoldedDoy("2024-07-")).toBeNull(); // empty day slice -> NaN before
    expect(leapFoldedDoy("2024-07-ab")).toBeNull(); // non-numeric day
    expect(leapFoldedDoy("2024-07-00")).toBeNull(); // day 0, below documented range
    expect(leapFoldedDoy("2024-07-32")).toBeNull(); // day beyond any month
    expect(leapFoldedDoy("2024--x-15")).toBeNull(); // non-numeric month
    expect(leapFoldedDoy("2024-00-15")).toBeNull(); // month 0
    expect(leapFoldedDoy("")).toBeNull(); // empty string
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

describe("groupBySeasonYear — season-anchored grouping for wrapping windows (WR-03)", () => {
  // Dec 28 -> Jan 3: startDoy 362, endDoy 3 (wraps the year end).
  const SPEC = {
    startDoy: leapFoldedDoy("2011-12-28")!,
    endDoy: leapFoldedDoy("2012-01-03")!,
  };

  it("assigns the full Dec 28 2011 – Jan 3 2012 window to season 2011 (the year it starts)", () => {
    const rows = [
      obs("2011-12-28"),
      obs("2011-12-29"),
      obs("2011-12-30"),
      obs("2011-12-31"),
      obs("2012-01-01"),
      obs("2012-01-02"),
      obs("2012-01-03"),
    ];
    const grouped = groupBySeasonYear(rows, SPEC);
    expect([...grouped.keys()]).toEqual([2011]);
    expect(grouped.get(2011)).toHaveLength(7);
  });

  it("splits Jan tail vs Dec head of the SAME calendar year into two different seasons", () => {
    // Calendar 2011 contains the tail of season 2010 AND the head of season 2011:
    // these must never be spliced into one "year".
    const rows = [
      obs("2011-01-01"), // tail of season 2010
      obs("2011-01-02"),
      obs("2011-12-28"), // head of season 2011
      obs("2011-12-29"),
    ];
    const grouped = groupBySeasonYear(rows, SPEC);
    expect([...grouped.keys()].sort()).toEqual([2010, 2011]);
    expect(grouped.get(2010)!.map((r) => r.date)).toEqual(["2011-01-01", "2011-01-02"]);
    expect(grouped.get(2011)!.map((r) => r.date)).toEqual(["2011-12-28", "2011-12-29"]);
  });

  it("drops rows outside a wrapping window (no unambiguous season)", () => {
    const grouped = groupBySeasonYear([obs("2011-07-19")], SPEC);
    expect(grouped.size).toBe(0);
  });

  it("behaves as plain calendar-year grouping for a non-wrapping window", () => {
    const spec = { startDoy: 196, endDoy: 206 }; // mid-July
    const rows = [obs("2011-07-19"), obs("2012-07-20"), obs("2011-01-01")];
    const grouped = groupBySeasonYear(rows, spec);
    expect(grouped.get(2011)!.map((r) => r.date)).toEqual(["2011-07-19", "2011-01-01"]);
    expect(grouped.get(2012)!.map((r) => r.date)).toEqual(["2012-07-20"]);
  });

  it("end-to-end: season-keyed coverage qualifies a complete Dec 28–Jan 3 season that calendar grouping would splice", () => {
    const windowDays = expandWindow(SPEC); // 7 days: 362..365, 1..3
    // Two complete back-to-back seasons: 2011/12 and 2012/13.
    const dates = [
      "2011-12-28", "2011-12-29", "2011-12-30", "2011-12-31",
      "2012-01-01", "2012-01-02", "2012-01-03",
      "2012-12-28", "2012-12-29", "2012-12-30", "2012-12-31",
      "2013-01-01", "2013-01-02", "2013-01-03",
    ];
    const grouped = groupBySeasonYear(dates.map((d) => obs(d)), SPEC);
    expect(qualifyingYears(grouped, windowDays, (o) => o.t)).toEqual([2011, 2012]);
  });
});
