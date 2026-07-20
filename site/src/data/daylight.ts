// Polar-safe astronomical daylight for the station panel (CHART-03).
//
// PURE lat/lon + date astronomy — NO data dependency, so the daylight readout renders even
// for a station with no weather data (UI-SPEC "always available"). Uses suncalc 2.0.1.
//
// Iceland (63–67°N) sits right on the edge where the naive `sunset - sunrise` breaks:
//   - At 65°N summer solstice suncalc returns VALID Dates but the sunset lands on the NEXT
//     calendar day, so the raw subtraction is ~22h (correct, non-NaN) — fine.
//   - At DEEP polar latitudes (or Iceland's true midnight-sun band) suncalc returns
//     `sunrise === null` / `sunset === null` (the sun never crosses the rise/set altitude),
//     and MAY set the `alwaysUp` / `alwaysDown` flags. A naive `null.getTime()` would throw
//     or NaN.
//
// Contract (RESEARCH Pitfall 2): branch on `alwaysUp` / `alwaysDown` FIRST, then treat a
// null/invalid sunrise or sunset as a polar case — resolved to polar-day vs polar-night by
// the sun's altitude at solar noon (above the horizon at noon ⇒ the sun is up all day).
// No NaN or Invalid Date ever escapes to the DOM.
import { getTimes, getPosition } from "suncalc";

export type DaylightResult =
  | { kind: "hours"; hours: number }
  | { kind: "polar-day" }
  | { kind: "polar-night" };

/** True for a real, finite Date instant (guards against Invalid Date / null). */
function isValidDate(d: Date | null | undefined): d is Date {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

/**
 * Daylight for a single date at (lat, lon), polar-safe.
 *
 * Returns a tagged union: `{ kind:"hours", hours }` for a normal sunrise/sunset day (hours =
 * (sunset − sunrise) in hours, always finite), `{ kind:"polar-day" }` when the sun stays up
 * all day (≈24h — "sólarhringsbirta"), or `{ kind:"polar-night" }` when it stays down (≈0h).
 */
export function daylightHours(date: Date, lat: number, lon: number): DaylightResult {
  const t = getTimes(date, lat, lon);

  // 1) Explicit polar flags first (suncalc sets these when the sun never crosses the
  //    rise/set altitude). Defensive: undefined is falsy, so this is a no-op at mid-lats.
  if (t.alwaysUp) return { kind: "polar-day" };
  if (t.alwaysDown) return { kind: "polar-night" };

  // 2) Null / Invalid sunrise or sunset ⇒ a polar case suncalc left unflagged. Disambiguate
  //    by the sun's altitude at solar noon: above the horizon ⇒ up all day (polar-day),
  //    otherwise down all day (polar-night). Never subtract a null/Invalid Date.
  if (!isValidDate(t.sunrise) || !isValidDate(t.sunset)) {
    const noon = isValidDate(t.solarNoon) ? t.solarNoon : date;
    const { altitude } = getPosition(noon, lat, lon);
    return altitude > 0 ? { kind: "polar-day" } : { kind: "polar-night" };
  }

  // 3) Normal day: a finite hours span (sunset may be on the following calendar day at high
  //    summer latitudes — the millisecond difference is still correct and positive).
  const hours = (t.sunset.getTime() - t.sunrise.getTime()) / 3_600_000;
  if (!Number.isFinite(hours)) {
    // Belt-and-braces: never let a NaN/Infinity reach the DOM. Fall back to the noon-altitude
    // polar decision rather than emit a bogus hours value.
    const { altitude } = getPosition(isValidDate(t.solarNoon) ? t.solarNoon : date, lat, lon);
    return altitude > 0 ? { kind: "polar-day" } : { kind: "polar-night" };
  }
  return { kind: "hours", hours };
}
