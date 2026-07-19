// @betravedur/domain — public barrel. Pure, zero runtime dependencies, browser-safe.
export const DOMAIN_VERSION = "0.1.0";

// Explicit named re-exports ONLY (IN-01): one list, the documented public
// surface — a new export ships when it is added here, never silently via a star.
export type {
  DailyObservation,
  StationMeta,
  StationType,
  WindowSpec,
  Component,
  ComponentScores,
  CombinedScore,
  WindowAverage,
} from "./types.js";
export { leapFoldedDoy, expandWindow, groupBySeasonYear } from "./window.js";
export { qualifyingYears, effectiveN } from "./coverage.js";
export { circularMeanDirection, scalarMeanSpeed } from "./wind.js";
export { sumPerYearThenAverage } from "./precip.js";
export { tempComponent, rainComponent, windComponent, combine } from "./score.js";
export type { Attribution } from "./attribution.js";
export { ATTRIBUTION } from "./attribution.js";
