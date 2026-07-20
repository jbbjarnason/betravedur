// Per-day-of-year distribution helpers for the station chart panel (CHART-01/02/04).
//
// PURE + zero runtime dependencies (the @betravedur/domain invariant): these helpers
// operate on already-decoded `DailyObservation[]` rows, NOT on a `DerivedFile`. The site
// data layer decodes the boot-time cached derived file (via the `@betravedur/pipeline/derive`
// subpath) once and passes the rows in — so the domain never imports the pipeline (which
// would pull Node built-ins and break the browser bundle, and create a package cycle).
//
// The reshape MIRRORS `computeMarkerDatum` (site/src/data/averages.ts): expandWindow →
// groupBySeasonYear → yearRange filter → qualifyingYears(...,0.8) → effectiveN (N>=3). This
// keeps the panel's coverage honesty IDENTICAL to the map's (RESEARCH Pitfall 7): a metric
// the markers muted as "ófullnægjandi gögn" can never render confident boxes here.
import type { DailyObservation, WindowSpec } from "./types.js";
import { expandWindow, groupBySeasonYear } from "./window.js";
import { qualifyingYears, effectiveN } from "./coverage.js";

/** A year range restricting which season-years contribute (SEL-02), inclusive. */
export interface YearRange {
  from: number;
  til: number;
}

/** A per-doy 5-number summary box, or an explicit gap. */
export type PerDoyBox =
  | { doy: number; missing?: false; min: number; max: number; p10: number; p50: number; p90: number }
  | { doy: number; missing: true };

/** A per-doy precipitation bar value, or an explicit gap. */
export type PerDoyBar =
  | { doy: number; missing?: false; value: number }
  | { doy: number; missing: true };

/** Result of a per-doy distribution: below the N-gate → { sufficient:false }. */
export type DistributionResult =
  | { sufficient: false }
  | { sufficient: true; n: number; perDoy: PerDoyBox[] };

/** Result of a per-doy precipitation bar series. */
export type PrecipResult =
  | { sufficient: false }
  | { sufficient: true; n: number; perDoy: PerDoyBar[] };

/**
 * The p-th percentile of an ASCENDING, NON-EMPTY numeric array, via type-7 linear
 * interpolation (the R type-7 / NumPy default): rank = p*(len-1), interpolate between
 * the floor/ceil order statistics. Deterministic and standard so the box edges (p10/p50/p90)
 * are pinned by unit tests.
 *
 * Contract: `sorted` MUST be ascending and non-empty; `p` in [0,1]. p=0 → min, p=1 → max,
 * p=0.5 → median. A single-element array returns that element for any p.
 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0]!;
  const rank = p * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (rank - lo) * (sorted[hi]! - sorted[lo]!);
}

/**
 * Bucket the in-window daily values by doy across the QUALIFYING years only, skipping
 * null selector values. Shared by the box and bar variants. Returns the qualifying-year
 * count and the buckets keyed by doy.
 */
function bucketByDoy(
  rows: DailyObservation[],
  window: WindowSpec,
  yearRange: YearRange | undefined,
  selector: (o: DailyObservation) => number | null,
): { n: number; sufficient: boolean; windowDays: Set<number>; buckets: Map<number, number[]> } {
  const windowDays = expandWindow(window);
  const allYears = groupBySeasonYear(rows, window);
  // SEL-02: restrict to the baseline range BEFORE the coverage gate, so `n` reports the
  // honest count of qualifying years within the picked range (never the raw picker span).
  const byYear = yearRange
    ? new Map([...allYears].filter(([y]) => y >= yearRange.from && y <= yearRange.til))
    : allYears;
  const qYears = qualifyingYears(byYear, windowDays, selector, 0.8);
  const { n, sufficient } = effectiveN(qYears);

  const buckets = new Map<number, number[]>();
  if (sufficient) {
    for (const year of qYears) {
      for (const r of byYear.get(year) ?? []) {
        if (!windowDays.has(r.doy)) continue;
        const v = selector(r);
        if (v == null) continue;
        const arr = buckets.get(r.doy);
        if (arr) arr.push(v);
        else buckets.set(r.doy, [v]);
      }
    }
  }
  return { n, sufficient, windowDays, buckets };
}

/**
 * Per-doy distribution (temp/wind boxes): for each day-of-year in the window, across the
 * qualifying baseline years, emit [min, p10, p50, p90, max]. Below the N>=3 gate the whole
 * result is { sufficient:false } → the panel shows "engin gögn fyrir þetta tímabil" (CHART-04).
 *
 * The `perDoy` array is in `[...expandWindow(window)]` INSERTION ORDER (wrap-correct: a
 * Dec→Jan window plots December before January, never numeric 1..365 order). A doy with no
 * qualifying values is emitted as `{ doy, missing:true }` — an explicit gap, NEVER a zero box.
 */
export function perDoyDistribution(
  rows: DailyObservation[],
  window: WindowSpec,
  yearRange: YearRange | undefined,
  selector: (o: DailyObservation) => number | null,
): DistributionResult {
  const { n, sufficient, windowDays, buckets } = bucketByDoy(rows, window, yearRange, selector);
  if (!sufficient) return { sufficient: false };

  const perDoy: PerDoyBox[] = [];
  for (const doy of windowDays) {
    const vals = buckets.get(doy);
    if (!vals || vals.length === 0) {
      perDoy.push({ doy, missing: true });
      continue;
    }
    vals.sort((a, b) => a - b);
    perDoy.push({
      doy,
      min: vals[0]!,
      max: vals[vals.length - 1]!,
      p10: percentile(vals, 0.1),
      p50: percentile(vals, 0.5),
      p90: percentile(vals, 0.9),
    });
  }
  return { sufficient: true, n, perDoy };
}

/**
 * Median of an ASCENDING, non-empty array (type-7 median == percentile(sorted, 0.5)).
 */
function median(sorted: number[]): number {
  return percentile(sorted, 0.5);
}

/**
 * Per-doy precipitation bars: for each day-of-year in the window, the per-doy MEDIAN total
 * of `r` across qualifying years (research A2 / Open-Q-1 decision: MEDIAN — robust to a single
 * wet year, unlike the mean). A doy with no qualifying rain (or when the `r` column is absent —
 * AWS "án úrkomu") is `{ doy, missing:true }` — an explicit gap, NEVER a zero bar (a zero would
 * falsely claim "measured, and it was dry"). Below the N>=3 gate → { sufficient:false }.
 *
 * `perDoy` is in window insertion order (wrap-correct), same as perDoyDistribution.
 */
export function perDoyPrecip(
  rows: DailyObservation[],
  window: WindowSpec,
  yearRange: YearRange | undefined,
): PrecipResult {
  const { n, sufficient, windowDays, buckets } = bucketByDoy(rows, window, yearRange, (o) => o.r);
  if (!sufficient) return { sufficient: false };

  const perDoy: PerDoyBar[] = [];
  for (const doy of windowDays) {
    const vals = buckets.get(doy);
    if (!vals || vals.length === 0) {
      perDoy.push({ doy, missing: true });
      continue;
    }
    vals.sort((a, b) => a - b);
    perDoy.push({ doy, value: median(vals) });
  }
  return { sufficient: true, n, perDoy };
}
