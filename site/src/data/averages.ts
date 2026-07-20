// Period → MarkerDatum transform (MAP-02): decode a derived file, run the
// @betravedur/domain climatology math for the selected window, and produce the single
// MarkerDatum the map renders. PURE — no fetch, no DOM — so it is 100% unit-testable
// and reusable by a Phase-4 period selector (which swaps `window` without touching this).
//
// Risk #1: `decodeDerived` is imported from the `@betravedur/pipeline/derive` SUBPATH,
// never the package root barrel (the root pulls Node fs/crypto/path built-ins and breaks
// the browser bundle). No Node built-ins appear in this module.
//
// Coverage honesty (WR-01/WR-02): effective N comes from the qualifying DATA-coverage
// years, NOT the picker span. The SAME N≥3 gate governs EVERY displayed metric — below
// it, temp, wind speed, wind direction and precip ALL collapse to the muted
// "ófullnægjandi gögn" state; we never show a confident wind arrow/speed/drop on data
// too thin to qualify. When sufficient, every metric is computed from the qualifying-
// year in-window rows only, equal-weight-per-year (meanPerYearThenAverage) — never a flat
// pool over all years that includes sparse non-qualifying ones or day-weights the years.
// Missing metrics are null, never 0 — a station with no rain is "án úrkomu" (still shown),
// a station with no/near-cancelling direction is "breytileg átt". Nothing here ever throws
// on empty/all-null input (defensive decode — ASVS V5 / threat T-03-04).
import { decodeDerived, type DerivedFile } from "@betravedur/pipeline/derive";
import {
  expandWindow,
  groupBySeasonYear,
  qualifyingYears,
  effectiveN,
  circularMeanDirection,
  meanPerYearThenAverage,
  type DailyObservation,
  type WindowSpec,
  type StationMeta,
} from "@betravedur/domain";
import { DEFAULT_WINDOW, type MarkerDatum } from "./types.js";

/**
 * Resultant-speed floor below which a circular-mean direction is treated as
 * undefined ("breytileg átt"): near-cancelling samples produce a tiny resultant
 * whose angle is not meaningful. Mirrors the Phase-1 atan2(0,0) honesty.
 */
const VARIABLE_DIRECTION_FLOOR = 0.5;

/**
 * Stable collision priority for the map symbol layer (lower = higher priority,
 * wins collisions). Heuristic, documented so Plan 03 and future maintainers can rely
 * on it: manned SYNOP/climate stations (deeper, richer history) outrank automatic ones,
 * then longer record (earlier `start`) wins, then the lower station id breaks ties.
 * Deterministic and independent of the period so markers don't reshuffle on zoom.
 */
function stationPriority(meta: StationMeta): number {
  // Type rank: SYNOP (sk) and climate (vf) are the "major" manned stations.
  const typeRank = meta.type === "sk" || meta.type === "vf" ? 0 : 1;
  // Earlier start = deeper record = higher priority; normalize into a small band
  // (~0.19–0.20 for 1900s–2000s starts). IN-02: a MISSING `start` falls back to
  // 9999/10000 ≈ 1.0 — nearly a full unit worse than any real start within the same
  // typeRank, so unknown record depth deterministically sorts LAST within its rank
  // (the intended "we can't vouch for its history, rank it lowest" behavior).
  const startPenalty = (meta.start ?? 9999) / 10000;
  // Lower station id breaks remaining ties (stable, tiny contribution).
  const idPenalty = (meta.station ?? 0) / 1_000_000;
  return typeRank * 1000 + startPenalty + idPenalty;
}

/**
 * The baseline year range (SEL-02): restrict the season-years used for averaging to
 * [from, til] inclusive. WindowSpec carries NO year field by contract (it is day-of-year
 * only), so the year range is a SEPARATE dimension applied here — over the season-year
 * groups, before qualifyingYears/effectiveN. Omit it (undefined) to use every year in the
 * file (the pre-Phase-4 behaviour, byte-identical).
 */
export interface YearRange {
  from: number;
  til: number;
}

/**
 * Compute the MarkerDatum for one station over `window` (default: the fixed
 * summer window until Phase 4). Never throws: empty / all-null metrics yield an
 * insufficient, muted datum rather than NaN or an exception.
 *
 * `yearRange` (SEL-02/03): when provided, only season-years within [from, til] contribute.
 * Because the filter is applied BEFORE qualifyingYears/effectiveN, `n` (the "meðaltal N ára"
 * label) then reports the honest count of QUALIFYING years within the picked baseline — never
 * the raw picker span `til - from + 1` (SEL-03, RESEARCH Pitfall 3). A range that leaves fewer
 * than 3 qualifying years collapses to the muted "ófullnægjandi gögn" state, same as always.
 * A NaN/undefined-bounded range simply matches nothing → n=0 muted (never throws, T-04-01).
 */
export function computeMarkerDatum(
  meta: StationMeta,
  file: DerivedFile,
  window: WindowSpec = DEFAULT_WINDOW,
  yearRange?: YearRange,
): MarkerDatum {
  const rows = decodeDerived(file);
  const windowDays = expandWindow(window);

  // Effective N from the data actually used — season-year grouped so a wrapping
  // window is counted correctly (harmless for a non-wrapping summer window).
  // Temperature drives the qualifying-years / N gate that ALL displayed metrics
  // honour (WR-02): if temperature coverage is too thin to vouch for an average,
  // the whole datum is the muted "ófullnægjandi gögn" state — we never show a
  // confident wind arrow or precip drop drawn from data below the gate.
  const allYears = groupBySeasonYear(rows, window);
  // SEL-02: keep only season-years inside the selected baseline range. A comparison
  // against a NaN/undefined bound yields an empty map (n=0 muted), never a throw (T-04-01).
  // When yearRange is undefined this is a no-op — byYear === allYears semantically.
  const byYear = yearRange
    ? new Map(
        [...allYears].filter(([y]) => y >= yearRange.from && y <= yearRange.til),
      )
    : allYears;
  const qYears = qualifyingYears(byYear, windowDays, (o) => o.t);
  const { n, sufficient } = effectiveN(qYears);

  // The rows that back every displayed metric: in-window days of the QUALIFYING
  // years only. Pooling all in-window rows across all years (including sparse,
  // non-qualifying ones) is the coverage-dishonesty pitfall WR-01/WR-02 flags.
  const inWinQual: DailyObservation[] = [];
  for (const y of qYears) {
    for (const r of byYear.get(y) ?? []) {
      if (windowDays.has(r.doy)) inWinQual.push(r);
    }
  }

  // Temperature: per-year mean over qualifying years, then equal-weight average of
  // those year-means (WR-01) — the same average the coverage gate vouches for.
  const meanTemp = meanPerYearThenAverage(byYear, windowDays, qYears, (o) => o.t);

  // Wind speed: per-year scalar mean over qualifying years, equally weighted (WR-02).
  const meanWindSpeed = meanPerYearThenAverage(byYear, windowDays, qYears, (o) => o.f);

  // Wind direction: circular mean over the qualifying-year in-window samples only.
  const dirSamples = inWinQual
    .filter((r) => r.f != null && r.dv != null)
    .map((r) => ({ speed: r.f as number, dirDeg: r.dv as number }));
  const dir = circularMeanDirection(dirSamples);

  // "breytileg átt": no usable samples (dir null) OR a near-cancelling resultant.
  const dirVariable = dir === null || dir.resultantSpeed < VARIABLE_DIRECTION_FLOOR;

  // Precip presence over qualifying-year in-window rows only (WR-02). false ⇒
  // "án úrkomu" (omit glyph, keep station) — but only when the gate is met.
  const hasPrecipQual = inWinQual.some((r) => r.r != null);

  // Coverage gate applied uniformly (WR-02): below N≥3 nothing metric-bearing is
  // shown — temp, wind speed, direction and precip all collapse to the muted state.
  const tempC = sufficient ? meanTemp : null;
  const windSpeed = sufficient ? meanWindSpeed : null;
  const windVariable = sufficient ? dirVariable : true;
  const windDir = sufficient && !dirVariable ? dir!.dirDeg : null;
  const hasPrecip = sufficient ? hasPrecipQual : false;

  return {
    station: meta.station,
    name: meta.name,
    lon: meta.lon,
    lat: meta.lat,
    tempC,
    windSpeed,
    windDir,
    windVariable,
    hasPrecip,
    n,
    sufficient,
    priority: stationPriority(meta),
  };
}
