// Period → MarkerDatum transform (MAP-02): decode a derived file, run the
// @betravedur/domain climatology math for the selected window, and produce the single
// MarkerDatum the map renders. PURE — no fetch, no DOM — so it is 100% unit-testable
// and reusable by a Phase-4 period selector (which swaps `window` without touching this).
//
// Risk #1: `decodeDerived` is imported from the `@betravedur/pipeline/derive` SUBPATH,
// never the package root barrel (the root pulls Node fs/crypto/path built-ins and breaks
// the browser bundle). No Node built-ins appear in this module.
//
// Coverage honesty (WR-01): effective N comes from the qualifying DATA-coverage years,
// NOT the picker span; below the N≥3 gate, `tempC` is null (muted "ófullnægjandi gögn").
// Missing metrics are null, never 0 — a station with no rain is "án úrkomu" (still shown),
// a station with no/near-cancelling direction is "breytileg átt". Nothing here ever throws
// on empty/all-null input (defensive decode — ASVS V5 / threat T-03-04).
import { decodeDerived, type DerivedFile } from "@betravedur/pipeline/derive";
import {
  expandWindow,
  groupBySeasonYear,
  qualifyingYears,
  effectiveN,
  scalarMeanSpeed,
  circularMeanDirection,
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
  // Earlier start = deeper record = higher priority; normalize into a small band.
  const startPenalty = (meta.start ?? 9999) / 10000; // ~0.19–0.20 for 1900s–2000s
  // Lower station id breaks remaining ties (stable, tiny contribution).
  const idPenalty = (meta.station ?? 0) / 1_000_000;
  return typeRank * 1000 + startPenalty + idPenalty;
}

/**
 * Compute the MarkerDatum for one station over `window` (default: the fixed
 * summer window until Phase 4). Never throws: empty / all-null metrics yield an
 * insufficient, muted datum rather than NaN or an exception.
 */
export function computeMarkerDatum(
  meta: StationMeta,
  file: DerivedFile,
  window: WindowSpec = DEFAULT_WINDOW,
): MarkerDatum {
  const rows = decodeDerived(file);
  const windowDays = expandWindow(window);

  // Effective N from the data actually used — season-year grouped so a wrapping
  // window is counted correctly (harmless for a non-wrapping summer window).
  const byYear = groupBySeasonYear(rows, window);
  const { n, sufficient } = effectiveN(
    qualifyingYears(byYear, windowDays, (o) => o.t),
  );

  // In-window rows drive the metric means.
  const inWin = rows.filter((r) => windowDays.has(r.doy));

  const temps = inWin
    .map((r) => r.t)
    .filter((v): v is number => v != null);
  const meanTemp = temps.length
    ? temps.reduce((a, b) => a + b, 0) / temps.length
    : null;

  const windSpeed = scalarMeanSpeed(inWin.map((r) => r.f));

  const dirSamples = inWin
    .filter((r) => r.f != null && r.dv != null)
    .map((r) => ({ speed: r.f as number, dirDeg: r.dv as number }));
  const dir = circularMeanDirection(dirSamples);

  // "breytileg átt": no usable samples (dir null) OR a near-cancelling resultant.
  const windVariable = dir === null || dir.resultantSpeed < VARIABLE_DIRECTION_FLOOR;
  const windDir = windVariable ? null : dir!.dirDeg;

  // Precip presence only this phase — false ⇒ "án úrkomu" (omit glyph, keep station).
  const hasPrecip = inWin.some((r) => r.r != null);

  // Coverage gate: below N≥3 the temperature mean is not shown (muted state).
  const tempC = sufficient ? meanTemp : null;

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
