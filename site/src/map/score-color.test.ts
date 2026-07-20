// MAP-03: boundary + clamp + format tests for the pure scoreColor() BuGn ramp.
// The ramp is the ColorBrewer BuGn 6-stop sequential scheme (#edf8fb -> #006d2c),
// colorblind-safe (monotonic luminance) and — critically — never the reserved accent
// red #c0392b. `null` never reaches this fn: the caller branches to the muted state.
import { describe, expect, it } from "vitest";
import { scoreColor } from "./score-color.js";

const HEX = /^#[0-9a-f]{6}$/;
const ACCENT_RED = "#c0392b";

describe("scoreColor — BuGn ramp", () => {
  it("pins the low stop: scoreColor(0) === '#edf8fb'", () => {
    expect(scoreColor(0)).toBe("#edf8fb");
  });

  it("pins the high stop: scoreColor(10) === '#006d2c'", () => {
    expect(scoreColor(10)).toBe("#006d2c");
  });

  it("interpolates the middle: scoreColor(5) is a defined #rrggbb between the endpoints", () => {
    const mid = scoreColor(5);
    expect(mid).toMatch(HEX);
    // Not equal to either endpoint.
    expect(mid).not.toBe("#edf8fb");
    expect(mid).not.toBe("#006d2c");
    // Luminance-ish proxy: the green channel of the mid stop sits strictly between the
    // endpoints' green channels (0xf8 high-lightness low end -> 0x6d dark high end).
    const g = parseInt(mid.slice(3, 5), 16);
    expect(g).toBeLessThan(0xf8);
    expect(g).toBeGreaterThan(0x6d);
  });

  it("clamps below 0: scoreColor(-1) === scoreColor(0)", () => {
    expect(scoreColor(-1)).toBe(scoreColor(0));
    expect(scoreColor(-100)).toBe("#edf8fb");
  });

  it("clamps above 10: scoreColor(11) === scoreColor(10)", () => {
    expect(scoreColor(11)).toBe(scoreColor(10));
    expect(scoreColor(1000)).toBe("#006d2c");
  });

  it("every stop across 0..10 is a valid #rrggbb and never the accent red", () => {
    for (let s = 0; s <= 10; s += 0.25) {
      const c = scoreColor(s);
      expect(c, `scoreColor(${s})`).toMatch(HEX);
      expect(c, `scoreColor(${s}) must not be accent red`).not.toBe(ACCENT_RED);
    }
  });

  it("is monotonic in the (dark-green) direction: higher score => lower green channel", () => {
    // BuGn goes light-blue (high g) at 0 -> dark green (low g) at 10, so the green
    // channel decreases monotonically as the score rises. A clean grayscale gradient.
    let prevG = Infinity;
    for (let s = 0; s <= 10; s += 1) {
      const g = parseInt(scoreColor(s).slice(3, 5), 16);
      expect(g, `green channel at ${s} should be <= previous`).toBeLessThanOrEqual(prevG);
      prevG = g;
    }
  });

  it("never returns NaN-derived garbage (defensive: NaN clamps to the low stop)", () => {
    // combine() guarantees a real number reaches here, but assert the clamp is total.
    expect(scoreColor(Number.NaN)).toMatch(HEX);
  });
});
