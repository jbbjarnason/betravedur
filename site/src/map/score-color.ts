// MAP-03: map a 0-10 combined weather score to a #rrggbb ramp color for the marker
// ring/badge. Pure, zero-dependency, unit-testable at its boundaries — no DOM, no map.
//
// Ramp: the ColorBrewer BuGn 6-class sequential scheme (colorbrewer2.org), cool light
// blue at the low end -> vivid dark green at the high end ("gott veður = grænt"). Chosen
// (RESEARCH §Score Color Ramp) because it is colorblind-safe (its stops are monotonic in
// WCAG relative luminance, so it degrades to a clean light->dark gradient under any color-
// vision deficiency) and it never touches the reserved accent red --accent (#c0392b): the
// score family and the temperature numeral can never be confused.
//
// `null` is NEVER passed here: a station with score === null is off the color scale and the
// caller branches to the existing muted "ófullnægjandi gögn" pill BEFORE reaching this fn.
// combine() guarantees the score is number|null (never NaN); the clamp below is still total
// (NaN -> the low stop) as a defensive belt-and-suspenders against a bad caller (T-05-01).

/** ColorBrewer BuGn 6-stop ramp, low (score 0) -> high (score 10). */
const BUGN: readonly (readonly [number, number, number])[] = [
  [0xed, 0xf8, 0xfb],
  [0xcc, 0xec, 0xe6],
  [0x99, 0xd8, 0xc9],
  [0x66, 0xc2, 0xa4],
  [0x2c, 0xa2, 0x5f],
  [0x00, 0x6d, 0x2c],
];

/** Two-hex-digit lowercase channel (e.g. 5 -> "05", 237 -> "ed"). */
function hex2(v: number): string {
  return v.toString(16).padStart(2, "0");
}

/**
 * Map a 0-10 score to a `#rrggbb` BuGn ramp color via a piecewise-linear RGB lerp over
 * the 6 stops. The input is clamped to [0,10] first (T-05-01) so a stray value can never
 * index out of the ramp array or produce NaN; a non-finite input (NaN/Infinity) resolves
 * to the low stop. Boundaries are exact: scoreColor(0) === "#edf8fb",
 * scoreColor(10) === "#006d2c".
 *
 * Callers pass a real number (never null — the muted state is handled upstream).
 */
export function scoreColor(score: number): string {
  // Total clamp to [0,10]: NaN/undefined-ish -> 0 (the low stop), never leaks downstream.
  const clamped = Number.isFinite(score) ? Math.max(0, Math.min(10, score)) : 0;
  const s = clamped / 10; // 0..1
  const seg = s * (BUGN.length - 1); // 0..5
  const i = Math.min(Math.floor(seg), BUGN.length - 2); // stop index (0..4)
  const t = seg - i; // fraction within [stop i, stop i+1]
  const [r0, g0, b0] = BUGN[i]!;
  const [r1, g1, b1] = BUGN[i + 1]!;
  const ch = (a: number, b: number): number => Math.round(a + (b - a) * t);
  return `#${hex2(ch(r0, r1))}${hex2(ch(g0, g1))}${hex2(ch(b0, b1))}`;
}
