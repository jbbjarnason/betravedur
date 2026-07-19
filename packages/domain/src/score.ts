// SCORE-01: fixed, explainable 0-10 component curves (temp/rain/wind) + a
// combine() that renormalizes the default weights over ONLY the components a
// station actually has, records which components contributed, and flags stations
// scored without rain ("án úrkomu"). Components stay separate (weight sliders,
// WGT-01); combination happens at display time with honest renormalization for
// the structural reality that most stations lack precipitation (RESEARCH Pitfall 1).
import type { ComponentScores, CombinedScore, Component } from "./types.js";

/** Clamp a raw curve value into the display range [0,10]. */
function clamp10(x: number): number {
  if (x < 0) return 0;
  if (x > 10) return 10;
  return x;
}

/**
 * Linear ramp from (x0 -> y0) to (x1 -> y1), evaluated at x. Used to build the
 * piecewise-linear curves below. Not clamped here — callers clamp the assembled
 * curve so the breakpoints stay readable.
 */
function ramp(x: number, x0: number, y0: number, x1: number, y1: number): number {
  return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
}

/**
 * 0-10 temperature component (better toward the comfortable band).
 * Piecewise-linear, explainable breakpoints (SCORE-03 panel):
 *   <= -5degC  -> 0    (too cold)
 *   -5 .. 13   -> ramp 0 -> 10
 *   13 .. 20   -> flat 10  (the comfortable Icelandic-summer band)
 *   20 .. 30   -> ramp 10 -> 0
 *   >= 30degC  -> 0    (too hot)
 * Monotone-decreasing on each side of the flat peak; output clamped to [0,10].
 */
export function tempComponent(meanTempC: number): number {
  const COLD_ZERO = -5;
  const PEAK_LO = 13;
  const PEAK_HI = 20;
  const HOT_ZERO = 30;
  let raw: number;
  if (meanTempC <= COLD_ZERO || meanTempC >= HOT_ZERO) {
    raw = 0;
  } else if (meanTempC < PEAK_LO) {
    raw = ramp(meanTempC, COLD_ZERO, 0, PEAK_LO, 10);
  } else if (meanTempC <= PEAK_HI) {
    raw = 10;
  } else {
    raw = ramp(meanTempC, PEAK_HI, 10, HOT_ZERO, 0);
  }
  return clamp10(raw);
}

/**
 * 0-10 rain component from a typical window total (mm), less-is-better.
 * Linear: 10 at 0mm, down to 0 at RAIN_ZERO_MM and beyond; clamped [0,10].
 * RAIN_ZERO_MM ~= 60mm typical total for the window is a wet spell for a short
 * time-of-year window in Iceland (explainable, tunable in the SCORE-03 panel).
 */
export function rainComponent(typicalTotalMm: number): number {
  const RAIN_ZERO_MM = 60;
  return clamp10(ramp(typicalTotalMm, 0, 10, RAIN_ZERO_MM, 0));
}

/**
 * 0-10 wind component from mean speed (m/s), less-is-better.
 * Linear: 10 at 0 m/s, down to 0 at WIND_ZERO_MS and beyond; clamped [0,10].
 * WIND_ZERO_MS = 15 m/s mean is a persistently windy period (explainable).
 */
export function windComponent(meanSpeedMs: number): number {
  const WIND_ZERO_MS = 15;
  return clamp10(ramp(meanSpeedMs, 0, 10, WIND_ZERO_MS, 0));
}

/** Default component weights (CONTEXT): rain 40% / wind 30% / temp 30%. */
const DEFAULT_WEIGHTS = { temp: 0.3, rain: 0.4, wind: 0.3 };

/**
 * Combine available components into a 0-10 score, renormalizing the weights over
 * ONLY the components that are non-null (so an AWS station without rain is scored
 * fairly on wind+temp instead of being penalised or silently scored as dry).
 * Records `contributing` (the components that actually contributed) and sets
 * `missingRain` when rain did not contribute — driving the "án úrkomu" badge.
 * When no component is present, returns { score: 0, contributing: [], missingRain: true }.
 * `score` is rounded to one decimal but kept a number.
 */
export function combine(
  components: ComponentScores,
  weights: { temp: number; rain: number; wind: number } = DEFAULT_WEIGHTS,
): CombinedScore {
  const order: Component[] = ["temp", "rain", "wind"];
  const present = order.filter((c) => components[c] != null);

  if (present.length === 0) {
    return { score: 0, contributing: [], missingRain: true };
  }

  const weightSum = present.reduce((acc, c) => acc + weights[c], 0);
  // Weighted average renormalized over present components (weights sum to 1).
  const weighted = present.reduce(
    (acc, c) => acc + (components[c] as number) * (weights[c] / weightSum),
    0,
  );

  const score = Math.round(weighted * 10) / 10;
  return {
    score,
    contributing: present,
    missingRain: !present.includes("rain"),
  };
}
