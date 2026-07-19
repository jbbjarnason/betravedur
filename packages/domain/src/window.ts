// Day-of-year window selection with Feb-29 fold and year-end wrap-around.
// Pure arithmetic only — no date library (domain package stays dependency-free).
import type { DailyObservation, WindowSpec } from "./types.js";

// Cumulative days before each month in a fixed NON-leap year (index 1 = January).
// Feb has 28 days here so July onward never shifts between leap/non-leap years.
const CUMULATIVE_DAYS_BEFORE_MONTH = [
  0, // unused (month is 1-based)
  0, // Jan
  31, // Feb
  59, // Mar
  90, // Apr
  120, // May
  151, // Jun
  181, // Jul
  212, // Aug
  243, // Sep
  273, // Oct
  304, // Nov
  334, // Dec
];

/**
 * Leap-folded day-of-year for a "YYYY-MM-DD" date.
 * Returns null for Feb 29 (folded out so day-of-year stays comparable across years).
 * Range: 1-365. Because the month table is fixed to a 28-day February, the same
 * calendar date yields an identical integer in every year, leap or not.
 */
export function leapFoldedDoy(date: string): number | null {
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  // Feb 29 is folded out entirely.
  if (month === 2 && day === 29) return null;
  const before = CUMULATIVE_DAYS_BEFORE_MONTH[month];
  if (before === undefined) return null; // out-of-range month guard
  return before + day;
}

/**
 * Expand a WindowSpec into the set of leap-folded day-of-year indices it covers,
 * handling year-end wrap-around (endDoy < startDoy).
 */
export function expandWindow(spec: WindowSpec): Set<number> {
  const { startDoy, endDoy } = spec;
  const out = new Set<number>();
  if (startDoy <= endDoy) {
    for (let d = startDoy; d <= endDoy; d++) out.add(d);
  } else {
    // Wrap past the year end: startDoy..365, then 1..endDoy.
    for (let d = startDoy; d <= 365; d++) out.add(d);
    for (let d = 1; d <= endDoy; d++) out.add(d);
  }
  return out;
}

/**
 * Group observations by SEASON year for a window (WR-03).
 *
 * For a non-wrapping window this is plain calendar-year grouping. For a
 * wrap-around window (endDoy < startDoy, e.g. Dec 28 -> Jan 3) a season is
 * anchored to the calendar year it STARTS in:
 *   - rows with doy >= startDoy (the December head) belong to their own
 *     calendar year;
 *   - rows with doy <= endDoy (the January tail) belong to the PREVIOUS
 *     calendar year — the season that began the prior December;
 *   - rows strictly between endDoy and startDoy are outside the window and
 *     have no unambiguous season, so they are dropped.
 *
 * This is the required `rowsByYear` input for `qualifyingYears` and
 * `sumPerYearThenAverage` whenever the window wraps: calendar-year grouping
 * would splice the tail of one season onto the head of the next inside a
 * single "year", miscounting coverage and mixing two seasons' precip sums.
 * Rows with an unparseable year in `date` are dropped.
 */
export function groupBySeasonYear(
  rows: DailyObservation[],
  spec: WindowSpec,
): Map<number, DailyObservation[]> {
  const wraps = spec.endDoy < spec.startDoy;
  const out = new Map<number, DailyObservation[]>();
  for (const r of rows) {
    const calendarYear = Number(r.date.slice(0, 4));
    if (!Number.isInteger(calendarYear)) continue;
    let season: number;
    if (!wraps) {
      season = calendarYear;
    } else if (r.doy >= spec.startDoy) {
      season = calendarYear; // December head: the season starts this year
    } else if (r.doy <= spec.endDoy) {
      season = calendarYear - 1; // January tail: season began the prior December
    } else {
      continue; // outside a wrapping window: no unambiguous season
    }
    const arr = out.get(season);
    if (arr) {
      arr.push(r);
    } else {
      out.set(season, [r]);
    }
  }
  return out;
}
