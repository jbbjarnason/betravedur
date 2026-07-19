// Component 0-10 curves (temp/rain/wind) + weight-renormalized combine().
// STUB: implementations land in Plan 04.
import type { ComponentScores, CombinedScore } from "./types.js";

/** 0-10 temperature component (better toward ~15-20degC). */
export function tempComponent(_meanTempC: number): number {
  throw new Error("NOT_IMPLEMENTED");
}

/** 0-10 rain component (less-is-better) from a typical window total (mm). */
export function rainComponent(_typicalTotalMm: number): number {
  throw new Error("NOT_IMPLEMENTED");
}

/** 0-10 wind component (less-is-better) from mean speed (m/s). */
export function windComponent(_meanSpeedMs: number): number {
  throw new Error("NOT_IMPLEMENTED");
}

/**
 * Combine available components into a 0-10 score, renormalizing weights over the
 * components that are non-null. Default weights: rain 40% / wind 30% / temp 30%.
 * Records which components contributed and whether rain was missing.
 */
export function combine(
  _components: ComponentScores,
  _weights?: { temp: number; rain: number; wind: number },
): CombinedScore {
  throw new Error("NOT_IMPLEMENTED");
}
