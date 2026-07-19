// Coverage-honest qualifying-year test (>=80%) and effective N (>=3).
// Coverage is derived from the data, never from the picker's window size alone.
import type { DailyObservation } from "./types.js";

/**
 * Return the years whose window coverage is >= minCoverage (default 0.8):
 * a year qualifies when the fraction of window days with a usable metric value
 * is at least minCoverage. A present row whose metric is null does NOT count.
 * Result is sorted ascending.
 */
export function qualifyingYears(
  rowsByYear: Map<number, DailyObservation[]>,
  windowDays: Set<number>,
  metric: (o: DailyObservation) => number | null,
  minCoverage = 0.8,
): number[] {
  const need = windowDays.size;
  if (need === 0) return [];
  const out: number[] = [];
  for (const [year, rows] of rowsByYear) {
    const present = rows.filter(
      (r) => windowDays.has(r.doy) && metric(r) != null,
    ).length;
    if (present / need >= minCoverage) out.push(year);
  }
  return out.sort((a, b) => a - b);
}

/**
 * Effective N from the qualifying years, with the N >= 3 display gate.
 */
export function effectiveN(qualifying: number[]): { n: number; sufficient: boolean } {
  return { n: qualifying.length, sufficient: qualifying.length >= 3 };
}
