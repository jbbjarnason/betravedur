// Per-year mean SERIES for a metric — the warming-trend view. Where
// meanPerYearThenAverage collapses every qualifying year into ONE average, this
// keeps each season-year as its OWN point so a line chart can show the trend
// across years (e.g. mean temperature drifting upward = warming).
//
// It mirrors meanPerYearThenAverage's per-year semantics exactly — the FIRST row
// with a present value per doy wins (deterministic, duplicate rows never double-
// count), null values are skipped (never counted as 0), and a year with no present
// in-window value is OMITTED (not emitted as 0). Every season-year present in the
// input map is considered (no qualifying-years clamp): the trend view wants the
// station's full available history, and a year is simply skipped when it carries
// no usable value. Pure, dependency-free.
import type { DailyObservation } from "./types.js";

/** One point in the per-year series: a season-year and its in-window metric mean. */
export interface YearMean {
  year: number;
  mean: number;
}

/**
 * For EACH season-year in `rowsByYear`, compute the mean of `selector` over that
 * year's in-window days (`windowDays`) with a present (non-null) value, then emit
 * `{ year, mean }`. A year whose in-window rows are all null/absent is OMITTED
 * (never emitted with mean 0). The result is sorted by year ascending.
 *
 * Duplicate policy (mirrors meanPerYearThenAverage): each window day contributes
 * AT MOST ONCE per year — the FIRST row with a present value for that doy wins;
 * null rows never consume a day. Pure, no dependencies.
 */
export function meanPerYearSeries(
  rowsByYear: Map<number, DailyObservation[]>,
  windowDays: Set<number>,
  selector: (o: DailyObservation) => number | null,
): YearMean[] {
  const out: YearMean[] = [];
  for (const [year, rows] of rowsByYear) {
    let sum = 0;
    let count = 0;
    const consumed = new Set<number>();
    for (const r of rows) {
      const v = selector(r);
      if (windowDays.has(r.doy) && v != null && !consumed.has(r.doy)) {
        sum += v;
        count += 1;
        consumed.add(r.doy);
      }
    }
    if (count > 0) out.push({ year, mean: sum / count });
  }
  out.sort((a, b) => a.year - b.year);
  return out;
}
