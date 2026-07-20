// Coverage-honest mean: per-year mean within each qualifying year, then average
// those year-means with EQUAL weight per year. Mirrors sumPerYearThenAverage
// (precip.ts) for scalar metrics (temperature, wind speed) so the displayed value
// is the same coverage-vouched average the qualifying-years gate stands behind.
//
// Contrast with a flat pooled mean over all in-window rows: that (a) includes
// non-qualifying (sparse) years the gate has already rejected, and (b) weights
// each year by its day count (a 14-day year counts 14x, a 3-day year 3x). This
// helper does neither — only qualifying years contribute, each weighted equally.
import type { DailyObservation } from "./types.js";

/**
 * For each qualifying year, take the MEAN of the metric over that year's in-window
 * days with a present (non-null) value; then average those per-year means across the
 * qualifying years with equal weight. A year with no present in-window value for the
 * metric contributes nothing (it is skipped, not counted as 0). Returns null when no
 * qualifying year yields a usable per-year mean.
 *
 * Duplicate policy (mirrors sumPerYearThenAverage): each window day contributes AT
 * MOST ONCE per year — the FIRST row with a present value for that doy wins,
 * deterministic given row order; null rows never consume a day.
 */
export function meanPerYearThenAverage(
  rowsByYear: Map<number, DailyObservation[]>,
  windowDays: Set<number>,
  qualifying: number[],
  metric: (o: DailyObservation) => number | null,
): number | null {
  if (qualifying.length === 0) return null;
  const yearMeans: number[] = [];
  for (const year of qualifying) {
    const rows = rowsByYear.get(year) ?? [];
    let sum = 0;
    let count = 0;
    const consumed = new Set<number>();
    for (const r of rows) {
      const v = metric(r);
      if (windowDays.has(r.doy) && v != null && !consumed.has(r.doy)) {
        sum += v;
        count += 1;
        consumed.add(r.doy);
      }
    }
    if (count > 0) yearMeans.push(sum / count);
  }
  if (yearMeans.length === 0) return null;
  return yearMeans.reduce((a, b) => a + b, 0) / yearMeans.length;
}
