// Unit tests for the scrubber's PURE date-label helpers (the DOM builder itself is
// exercised in the Playwright E2E — vitest here runs in Node with no DOM).
//
// Pins the Icelandic date formatting the whole scrubber readout rests on: doyLabel over
// the fixed NON-leap 2001 reference (UI-SPEC Copywriting: day-then-lowercase-month), and
// the wrapping-window label form "26. des – 8. jan" that the readout shows when the window
// crosses the year end.
import { describe, it, expect } from "vitest";
import { doyLabel, windowLabel } from "./scrubber.js";

describe("doyLabel (Icelandic, non-leap 2001 reference)", () => {
  it("doy 197 → '16. júlí'", () => {
    expect(doyLabel(197)).toBe("16. júlí");
  });

  it("doy 1 → '1. janúar'", () => {
    expect(doyLabel(1)).toBe("1. janúar");
  });

  it("doy 365 → '31. desember'", () => {
    expect(doyLabel(365)).toBe("31. desember");
  });
});

describe("windowLabel (both endpoints, abbreviated months)", () => {
  it("wrapping window anchor 360 width 14 → '26. des – 8. jan'", () => {
    // window is [360 .. 360+14-1 = 373 → wraps to doy 8]
    expect(windowLabel(360, 14)).toBe("26. des – 8. jan");
  });

  it("non-wrapping window anchor 197 width 14 → '16. júl – 29. júl'", () => {
    expect(windowLabel(197, 14)).toBe("16. júl – 29. júl");
  });
});
