// Precipitation: sum within each qualifying year, then average across years.
// Missing precip is treated as missing (skipped), never coerced to zero.
import type { DailyObservation } from "./types.js";

/**
 * For each qualifying year, SUM the window's daily precip (skipping missing days,
 * never null->0); then average those per-year sums across the qualifying years.
 * Returns null when there are no qualifying years.
 *
 * Coverage note (RESEARCH Pitfall 3): a qualifying year still has >=80% of window
 * days present, so summing over only the present days leaves a bounded residual
 * under-count. We deliberately do NOT scale or impute — the >=80% coverage gate
 * (qualifyingYears) already filters the too-sparse years, and honesty beats a
 * fabricated fill. Missing stays missing.
 */
export function sumPerYearThenAverage(
  rowsByYear: Map<number, DailyObservation[]>,
  windowDays: Set<number>,
  qualifying: number[],
): number | null {
  if (qualifying.length === 0) return null;
  let totalOfYearSums = 0;
  for (const year of qualifying) {
    const rows = rowsByYear.get(year) ?? [];
    let yearSum = 0;
    for (const r of rows) {
      // Only in-window days with a present value contribute; null is skipped,
      // never added as 0 (a data gap must not inflate dryness).
      if (windowDays.has(r.doy) && r.r != null) yearSum += r.r;
    }
    totalOfYearSums += yearSum;
  }
  return totalOfYearSums / qualifying.length;
}
