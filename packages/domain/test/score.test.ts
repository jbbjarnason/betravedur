// SCORE-01: fixed 0-10 component curves (temp/rain/wind) + weight-renormalizing
// combine() that scores a station fairly over ONLY the components it actually has,
// records the contributing components, and flags missing rain ("án úrkomu").
//
// Named selectors match the RESEARCH test map: "component score",
// "missing component excluded" / "renormalize".
import { describe, expect, it } from "vitest";
import {
  tempComponent,
  rainComponent,
  windComponent,
  combine,
} from "../src/score.js";
import type { ComponentScores } from "../src/types.js";

describe("component score — fixed 0-10 curves", () => {
  it("component score: tempComponent peaks near 10 in the comfortable band and clamps to [0,10]", () => {
    const comfy = tempComponent(17);
    expect(comfy).toBeGreaterThanOrEqual(9);
    expect(comfy).toBeLessThanOrEqual(10);
    // Monotone-decreasing away from the peak on each side.
    expect(tempComponent(5)).toBeLessThan(tempComponent(12));
    expect(tempComponent(25)).toBeLessThan(tempComponent(20));
    // Cold + hot extremes clamp to the floor, never below 0.
    expect(tempComponent(-40)).toBe(0);
    expect(tempComponent(50)).toBe(0);
    // Never exceeds the ceiling.
    expect(tempComponent(16)).toBeLessThanOrEqual(10);
  });

  it("component score: rainComponent is less-is-better, 10 at 0mm, clamped [0,10]", () => {
    expect(rainComponent(0)).toBe(10);
    expect(rainComponent(20)).toBeLessThan(rainComponent(5));
    expect(rainComponent(5)).toBeLessThan(rainComponent(0));
    // Far past the threshold clamps to 0, never negative.
    expect(rainComponent(1000)).toBe(0);
    expect(rainComponent(500)).toBeGreaterThanOrEqual(0);
  });

  it("component score: windComponent is less-is-better, 10 at 0 m/s, clamped [0,10]", () => {
    expect(windComponent(0)).toBe(10);
    expect(windComponent(10)).toBeLessThan(windComponent(3));
    expect(windComponent(3)).toBeLessThan(windComponent(0));
    // Far past the threshold clamps to 0, never negative.
    expect(windComponent(100)).toBe(0);
    expect(windComponent(50)).toBeGreaterThanOrEqual(0);
  });
});

describe("combine — weight renormalization over available components", () => {
  it("component score: all three present uses default weights and reports full contributing set", () => {
    const c: ComponentScores = { temp: 8, rain: 6, wind: 7 };
    const out = combine(c);
    // rain 0.4 / wind 0.3 / temp 0.3 -> 6*0.4 + 7*0.3 + 8*0.3 = 2.4 + 2.1 + 2.4 = 6.9
    expect(out.score).toBeCloseTo(6.9, 5);
    expect(out.contributing.slice().sort()).toEqual(["rain", "temp", "wind"]);
    expect(out.missingRain).toBe(false);
  });

  it("missing component excluded / renormalize: rain=null renormalizes wind+temp to 0.5/0.5 and flags missingRain", () => {
    const c: ComponentScores = { temp: 8, rain: null, wind: 6 };
    const out = combine(c);
    // renormalized: wind 0.3/0.6=0.5, temp 0.3/0.6=0.5 -> 6*0.5 + 8*0.5 = 7.0 (pinned)
    expect(out.score).toBe(7.0);
    expect(out.contributing.slice().sort()).toEqual(["temp", "wind"]);
    expect(out.contributing).not.toContain("rain");
    expect(out.missingRain).toBe(true);
  });

  it("renormalize: a single present component returns that component's score directly (weight -> 1)", () => {
    const out = combine({ temp: null, rain: null, wind: 4 });
    expect(out.score).toBe(4);
    expect(out.contributing).toEqual(["wind"]);
    expect(out.missingRain).toBe(true);
  });

  it("renormalize: rain present but wind/temp null keeps rain only and missingRain=false", () => {
    const out = combine({ temp: null, rain: 5, wind: null });
    expect(out.score).toBe(5);
    expect(out.contributing).toEqual(["rain"]);
    expect(out.missingRain).toBe(false);
  });

  it("missing component excluded: all components null returns score 0, empty contributing, missingRain=true", () => {
    const out = combine({ temp: null, rain: null, wind: null });
    expect(out.score).toBe(0);
    expect(out.contributing).toEqual([]);
    expect(out.missingRain).toBe(true);
  });

  it("renormalize: custom weights are renormalized over present components", () => {
    // Only temp + wind present, custom weights temp 0.2 / wind 0.6 (rain 0.2 dropped).
    // renormalized: temp 0.2/0.8=0.25, wind 0.6/0.8=0.75 -> 10*0.25 + 2*0.75 = 2.5 + 1.5 = 4.0
    const out = combine(
      { temp: 10, rain: null, wind: 2 },
      { temp: 0.2, rain: 0.2, wind: 0.6 },
    );
    expect(out.score).toBe(4.0);
    expect(out.contributing.slice().sort()).toEqual(["temp", "wind"]);
    expect(out.missingRain).toBe(true);
  });
});
