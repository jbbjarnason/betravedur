// Precipitation: sum within each qualifying year, then average across years.
// Missing precip is treated as missing (skipped), never coerced to zero.
// STUB: implementation lands in Plan 02.
import type { DailyObservation } from "./types.js";

/**
 * For each qualifying year, SUM the window's daily precip (skipping missing days,
 * never null->0); then average those per-year sums across the qualifying years.
 * Returns null when there are no qualifying years.
 */
export function sumPerYearThenAverage(
  _rowsByYear: Map<number, DailyObservation[]>,
  _windowDays: Set<number>,
  _qualifying: number[],
): number | null {
  throw new Error("NOT_IMPLEMENTED");
}
