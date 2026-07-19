// Day-of-year window selection with Feb-29 fold and year-end wrap-around.
// Pure arithmetic only — no date library (domain package stays dependency-free).
import type { WindowSpec } from "./types.js";

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
  return CUMULATIVE_DAYS_BEFORE_MONTH[month] + day;
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
