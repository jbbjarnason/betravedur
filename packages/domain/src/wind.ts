// Circular (unit-vector) mean wind direction + scalar mean wind speed.
// STUB: implementations land in Plan 02. The 350deg/10deg -> ~0deg case is a named test.

/**
 * Unit-vector circular mean of wind direction, weighted by speed.
 * Returns the resultant direction (deg) and resultant speed, or null if no usable samples.
 * 350deg & 10deg must average to ~0deg (north), never 180deg.
 */
export function circularMeanDirection(
  _samples: { speed: number; dirDeg: number }[],
): { dirDeg: number; resultantSpeed: number } | null {
  throw new Error("NOT_IMPLEMENTED");
}

/**
 * Scalar mean of wind speeds, skipping nulls. Averaged separately from direction.
 * Returns null when there are no usable speeds.
 */
export function scalarMeanSpeed(_speeds: (number | null)[]): number | null {
  throw new Error("NOT_IMPLEMENTED");
}
