// Attribution constant tests (DATA-08). The ATTRIBUTION const is the UI-consumable
// record of the verified CC BY 4.0 wording from athuganir.vedur.is/disclaimer.
import { describe, expect, it } from "vitest";
import { ATTRIBUTION } from "../src/attribution.js";

describe("attribution", () => {
  it("attribution: license is CC BY 4.0", () => {
    expect(ATTRIBUTION.license).toBe("CC BY 4.0");
  });

  it("attribution: Icelandic text credits Veðurstofa Íslands", () => {
    expect(ATTRIBUTION.text_is.length).toBeGreaterThan(0);
    expect(ATTRIBUTION.text_is).toContain("Veðurstofa Íslands");
  });

  it("attribution: English text is present and non-empty", () => {
    expect(ATTRIBUTION.text_en.length).toBeGreaterThan(0);
  });

  it("attribution: sourceUrl points at a vedur.is source", () => {
    expect(ATTRIBUTION.sourceUrl.length).toBeGreaterThan(0);
    expect(ATTRIBUTION.sourceUrl).toContain("vedur.is");
  });

  it("attribution: modified-data notice is present (CC BY 4.0 modified clause)", () => {
    expect(ATTRIBUTION.modifiedNotice_is.length).toBeGreaterThan(0);
    expect(ATTRIBUTION.modifiedNotice_is.toLowerCase()).toContain("breytt");
  });

  it("attribution: no NOT_IMPLEMENTED / stub placeholder remains", () => {
    const all = Object.values(ATTRIBUTION).join(" ");
    expect(all).not.toContain("NOT_IMPLEMENTED");
    expect(all.trim().length).toBeGreaterThan(0);
  });
});
