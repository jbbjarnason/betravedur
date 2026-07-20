import { describe, expect, it } from "vitest";
import { daylightHours } from "./daylight.js";

// Iceland reference coordinates (mid-country, ~Egilsstaðir latitude band).
const ICELAND_LAT = 65;
const ICELAND_LON = -18;

/** True when a daylight result is a finite, in-range hours reading. */
function isFiniteHours(
  r: ReturnType<typeof daylightHours>,
): r is { kind: "hours"; hours: number } {
  return r.kind === "hours" && Number.isFinite(r.hours);
}

describe("daylightHours — polar-safe astronomical daylight (CHART-03)", () => {
  it("summer solstice at Iceland latitude → NEVER NaN (large hours or polar-day)", () => {
    const r = daylightHours(new Date("2020-06-21T12:00:00Z"), ICELAND_LAT, ICELAND_LON);
    if (r.kind === "hours") {
      expect(Number.isNaN(r.hours)).toBe(false);
      expect(Number.isFinite(r.hours)).toBe(true);
      // Near-24h at 65N in high summer.
      expect(r.hours).toBeGreaterThan(18);
      expect(r.hours).toBeLessThanOrEqual(24);
    } else {
      expect(r.kind).toBe("polar-day");
    }
  });

  it("winter solstice at Iceland latitude → NEVER NaN (small hours or polar-night)", () => {
    const r = daylightHours(new Date("2020-12-21T12:00:00Z"), ICELAND_LAT, ICELAND_LON);
    if (r.kind === "hours") {
      expect(Number.isNaN(r.hours)).toBe(false);
      expect(Number.isFinite(r.hours)).toBe(true);
      // Near-0h (a few hours) at 65N in deep winter.
      expect(r.hours).toBeGreaterThanOrEqual(0);
      expect(r.hours).toBeLessThan(6);
    } else {
      expect(r.kind).toBe("polar-night");
    }
  });

  it("a normal spring day at Iceland latitude → kind:'hours' with 0 < hours < 24", () => {
    const r = daylightHours(new Date("2020-04-15T12:00:00Z"), ICELAND_LAT, ICELAND_LON);
    expect(isFiniteHours(r)).toBe(true);
    if (!isFiniteHours(r)) return;
    expect(r.hours).toBeGreaterThan(0);
    expect(r.hours).toBeLessThan(24);
  });

  it("deep-polar summer (78N) → polar-day, never NaN", () => {
    const r = daylightHours(new Date("2020-06-21T12:00:00Z"), 78, 15);
    expect(r.kind).toBe("polar-day");
    // A polar-day result carries no NaN hours field.
    if (r.kind === "hours") expect(Number.isNaN(r.hours)).toBe(false);
  });

  it("deep-polar winter (78N) → polar-night, never NaN", () => {
    const r = daylightHours(new Date("2020-12-21T12:00:00Z"), 78, 15);
    expect(r.kind).toBe("polar-night");
    if (r.kind === "hours") expect(Number.isNaN(r.hours)).toBe(false);
  });
});
