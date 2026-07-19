// @betravedur/domain — public barrel. Pure, zero runtime dependencies, browser-safe.
export const DOMAIN_VERSION = "0.1.0";

// Star re-exports keep the barrel exhaustive as modules grow.
export * from "./types.js";
export * from "./window.js";
export * from "./coverage.js";
export * from "./wind.js";
export * from "./precip.js";
export * from "./score.js";
export * from "./attribution.js";

// Explicit named re-exports document the public function surface for downstream
// consumers (@betravedur/domain) and make the barrel greppable per module.
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
export { leapFoldedDoy, expandWindow } from "./window.js";
export { qualifyingYears, effectiveN } from "./coverage.js";
export { circularMeanDirection, scalarMeanSpeed } from "./wind.js";
export { sumPerYearThenAverage } from "./precip.js";
export { tempComponent, rainComponent, windComponent, combine } from "./score.js";
export { ATTRIBUTION } from "./attribution.js";
