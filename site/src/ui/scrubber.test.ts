// Unit tests for the scrubber's PURE date-label helpers (the DOM builder itself is
// exercised in the Playwright E2E — vitest here runs in Node with no DOM).
//
// Pins the Icelandic date formatting the whole scrubber readout rests on: doyLabel over
// the fixed NON-leap 2001 reference (UI-SPEC Copywriting: day-then-lowercase-month), and
// the wrapping-window label form "26. desember–8. janúar" that the readout shows when the
// window crosses the year end. windowLabel uses the long month + no-space en-dash per the
// UI-SPEC Scrubber Anatomy example "20.–26. júlí".
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

describe("windowLabel (both endpoints, long month, no-space en-dash — UI-SPEC '20.–26. júlí')", () => {
  it("wrapping window anchor 360 width 14 → '26. desember–8. janúar'", () => {
    // window is [360 .. 360+14-1 = 373 → wraps to doy 8]
    expect(windowLabel(360, 14)).toBe("26. desember–8. janúar");
  });

  it("non-wrapping window anchor 197 width 14 → '16. júlí–29. júlí'", () => {
    expect(windowLabel(197, 14)).toBe("16. júlí–29. júlí");
  });

  it("matches the spec example shape: anchor 197 width 7 → '16.–22. júlí'-style long month", () => {
    // The spec's canonical example is "20.–26. júlí"; verify the long month + no-space en-dash.
    const label = windowLabel(197, 7);
    expect(label).toContain("–"); // en-dash
    expect(label).not.toContain(" – "); // no surrounding spaces
    expect(label).toContain("júlí"); // long month, not the abbreviated "júl"
  });
});
