// Circular (unit-vector) mean wind direction + scalar mean wind speed.
// The 350deg/10deg -> ~0deg case is a named regression test (never the arithmetic
// mean of 180). Speed is averaged as a scalar, separately from direction.

/**
 * Unit-vector circular mean of wind direction, weighted by speed.
 * Accumulates east (u = speed*sin) and north (v = speed*cos) components, then
 * takes atan2 of the means. Returns the resultant direction (deg, 0-360) and
 * resultant speed, or null if no usable samples. Samples with null speed/dir
 * are filtered out. A near-cancelling set yields a small resultantSpeed, which
 * the caller can surface as "breytileg átt".
 */
export function circularMeanDirection(
  samples: { speed: number; dirDeg: number }[],
): { dirDeg: number; resultantSpeed: number } | null {
  const usable = samples.filter((s) => s.dirDeg != null && s.speed != null);
  if (usable.length === 0) return null;
  let u = 0;
  let v = 0;
  for (const s of usable) {
    const rad = (s.dirDeg * Math.PI) / 180;
    u += s.speed * Math.sin(rad); // east component
    v += s.speed * Math.cos(rad); // north component
  }
  const n = usable.length;
  const meanU = u / n;
  const meanV = v / n;
  let dir = (Math.atan2(meanU, meanV) * 180) / Math.PI;
  if (dir < 0) dir += 360;
  return { dirDeg: dir, resultantSpeed: Math.hypot(meanU, meanV) };
}

/**
 * Scalar mean of wind speeds, skipping nulls. Averaged separately from direction.
 * Nulls are treated as missing (never coerced to 0). Returns null when there are
 * no usable speeds.
 */
export function scalarMeanSpeed(speeds: (number | null)[]): number | null {
  const usable = speeds.filter((s): s is number => s != null);
  if (usable.length === 0) return null;
  return usable.reduce((acc, s) => acc + s, 0) / usable.length;
}
