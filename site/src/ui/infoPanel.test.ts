// Info-panel unit tests (Phase 7, UX-04). The Vitest runtime here is Node (no jsdom/document —
// see vitest.config.ts: no `environment: jsdom`, and no DOM lib is installed; adding one is a
// forbidden new dependency). So the DOM builder cannot be exercised directly in this runtime.
//
// Per 07-02-PLAN Task 1 ("If jsdom/localStorage is unavailable in the unit runtime, cover the
// pure DOM builder here and defer first-visit/permalink behavior to the E2E"), we test the PURE
// CONTENT MODEL (`infoPanelSections`) that `buildInfoDialog` renders node-for-node. The first-
// visit localStorage flow, the permalink guard, dialog focus/Escape, and the live DOM assembly
// are all covered by the Playwright info.spec criteria 6-9/18 against the real built site.
import { describe, expect, it } from "vitest";
import { infoPanelSections } from "./infoPanel.js";
import { ATTRIBUTION } from "@betravedur/domain";

describe("infoPanelSections — the pure content model buildInfoDialog renders", () => {
  it("carries the prominent trust lead verbatim (the #1 misconception message)", () => {
    const s = infoPanelSections("20. júlí 2026");
    expect(s.trustLead).toBe("Þetta er sögulegt meðaltal, ekki spá.");
  });

  it("builds the attribution from the domain ATTRIBUTION constant (never hardcoded)", () => {
    const s = infoPanelSections("20. júlí 2026");
    // The license anchor text + href come straight from the constant.
    expect(s.attribution.licenseLabel).toBe(ATTRIBUTION.license); // "CC BY 4.0"
    expect(s.attribution.licenseHref).toBe(ATTRIBUTION.sourceUrl);
    // The Icelandic license + modified-data prose is the constant's text, not a retyped copy.
    expect(s.attribution.text).toContain(ATTRIBUTION.text_is);
    expect(s.attribution.text).toContain(ATTRIBUTION.modifiedNotice_is);
    // The basemap credit (OSM + Protomaps) is present for the flattened acceptance-text checks.
    expect(s.attribution.basemap).toContain("OpenStreetMap");
    expect(s.attribution.basemap).toContain("Protomaps");
  });

  it("exposes CC BY 4.0 and OpenStreetMap somewhere in the flattened attribution text (criterion 6)", () => {
    const flat = infoPanelSections("20. júlí 2026").attributionFlatText;
    expect(flat).toContain("CC BY 4.0");
    expect(flat).toContain("OpenStreetMap");
  });

  it("includes the `uppfært {date}` freshness line only when a date is given", () => {
    const withDate = infoPanelSections("20. júlí 2026");
    expect(withDate.freshnessLine).toBe("uppfært 20. júlí 2026");
  });

  it("OMITS the freshness line when the date is null (never renders Invalid Date / a bare `uppfært`)", () => {
    const noDate = infoPanelSections(null);
    expect(noDate.freshnessLine).toBeNull();
  });

  it("carries the title, what-it-shows and how-to-read prose (verbatim UI-SPEC copy)", () => {
    const s = infoPanelSections(null);
    expect(s.title).toBe("Um kortið");
    expect(s.whatItShows).toContain("Kortið sýnir hvar á landinu");
    expect(s.howToRead).toContain("Grænni stöðvar");
  });
});
