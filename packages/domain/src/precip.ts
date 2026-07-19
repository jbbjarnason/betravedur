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
 *
 * Duplicate policy (WR-02): each window day contributes AT MOST ONCE per year.
 * If a year carries duplicate rows for the same doy (overlapping fetch ranges,
 * API duplicates, append-only re-runs), the FIRST row with a present value wins
 * — deterministic given row order — and later duplicates are ignored; null rows
 * never consume a day. Duplicates must never inflate the per-year sum.
 * For wrap-around windows, `rowsByYear` must be season-keyed (groupBySeasonYear
 * in window.ts) — see WR-03.
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
    const consumed = new Set<number>();
    for (const r of rows) {
      // Only in-window days with a present value contribute; null is skipped,
      // never added as 0 (a data gap must not inflate dryness). A doy already
      // consumed by an earlier row is skipped (first present value wins).
      if (windowDays.has(r.doy) && r.r != null && !consumed.has(r.doy)) {
        yearSum += r.r;
        consumed.add(r.doy);
      }
    }
    totalOfYearSums += yearSum;
  }
  return totalOfYearSums / qualifying.length;
}
