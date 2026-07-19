// Day-of-year window selection with Feb-29 fold and year-end wrap-around.
// STUB: implementations land in Plan 02.
import type { WindowSpec } from "./types.js";

/**
 * Leap-folded day-of-year for a "YYYY-MM-DD" date.
 * Returns null for Feb 29 (folded out so day-of-year stays comparable across years).
 * Range: 1-365.
 */
export function leapFoldedDoy(_date: string): number | null {
  throw new Error("NOT_IMPLEMENTED");
}

/**
 * Expand a WindowSpec into the set of leap-folded day-of-year indices it covers,
 * handling year-end wrap-around (endDoy < startDoy).
 */
export function expandWindow(_spec: WindowSpec): Set<number> {
  throw new Error("NOT_IMPLEMENTED");
}
