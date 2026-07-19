// Coverage-honest qualifying-year test (>=80%) and effective N (>=3).
// STUB: implementations land in Plan 02.
import type { DailyObservation } from "./types.js";

/**
 * Return the years whose window coverage is >= minCoverage (default 0.8):
 * a year qualifies when the fraction of window days with a usable metric value
 * is at least minCoverage. Coverage is derived from data, never from the picker.
 */
export function qualifyingYears(
  _rowsByYear: Map<number, DailyObservation[]>,
  _windowDays: Set<number>,
  _metric: (o: DailyObservation) => number | null,
  _minCoverage = 0.8,
): number[] {
  throw new Error("NOT_IMPLEMENTED");
}

/**
 * Effective N from the qualifying years, with the N >= 3 display gate.
 */
export function effectiveN(_qualifying: number[]): { n: number; sufficient: boolean } {
  throw new Error("NOT_IMPLEMENTED");
}
