// Unit tests for the pure marker helpers (Vitest). These pin the composite-callout
// contract independently of MapLibre/DOM: toFeatureCollection (GeoJSON shape + label
// formatting) and formatCallout (temp red / wind arrow|breytileg átt / precip glyph
// omission / muted ófullnægjandi-gögn). No map, no browser — the rendering core.
import { describe, expect, it } from "vitest";
import type { MarkerDatum } from "../data/types.js";
import { toFeatureCollection, formatCallout } from "./markers.js";

/** A "happy path" sufficient datum: temp + concrete wind dir + precip. */
function fullDatum(overrides: Partial<MarkerDatum> = {}): MarkerDatum {
  return {
    station: 1,
    name: "Reykjavík",
    lon: -21.9,
    lat: 64.13,
    tempC: 7.4,
    windSpeed: 5.2,
    windDir: 135,
    windVariable: false,
    hasPrecip: true,
    n: 77,
    sufficient: true,
    priority: 0.19,
    ...overrides,
  };
}

describe("toFeatureCollection", () => {
  it("emits one feature per datum with [lon,lat] point geometry", () => {
    const fc = toFeatureCollection([fullDatum({ station: 1 }), fullDatum({ station: 1350, lon: -22.6, lat: 63.98 })]);
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(2);
    const [a] = fc.features;
    expect(a.type).toBe("Feature");
    expect(a.geometry.type).toBe("Point");
    expect(a.geometry.coordinates).toEqual([-21.9, 64.13]);
  });

  it("carries a rounded-degree label for a sufficient datum", () => {
    const fc = toFeatureCollection([fullDatum({ tempC: 7.4, sufficient: true })]);
    expect(fc.features[0].properties.label).toBe("7°");
  });

  it("rounds negative temperatures correctly in the label", () => {
    const fc = toFeatureCollection([fullDatum({ tempC: -3.6, sufficient: true })]);
    expect(fc.features[0].properties.label).toBe("-4°");
  });

  it("uses an em-dash label for an insufficient datum", () => {
    const fc = toFeatureCollection([fullDatum({ tempC: null, sufficient: false })]);
    expect(fc.features[0].properties.label).toBe("—");
  });

  it("exposes station id and priority (the symbol-sort-key) as feature properties", () => {
    const fc = toFeatureCollection([fullDatum({ station: 42, priority: 3.5 })]);
    expect(fc.features[0].properties.station).toBe(42);
    expect(fc.features[0].properties.priority).toBe(3.5);
  });
});

describe("formatCallout", () => {
  it("renders temperature with a degree sign in the accent (red) temp slot", () => {
    const { html, muted } = formatCallout(fullDatum({ tempC: 7.4 }));
    expect(muted).toBe(false);
    expect(html).toMatch(/class="[^"]*marker-temp[^"]*"[^>]*>\s*7°/);
    expect(html).toMatch(/-?\d+°/);
  });

  it("renders a rotated wind arrow + integer speed with m/s for a concrete direction", () => {
    const { html } = formatCallout(fullDatum({ windSpeed: 5.2, windDir: 90, windVariable: false }));
    expect(html).toContain("5"); // integer speed
    expect(html).toMatch(/m\/s/);
    expect(html).toContain("marker-wind-arrow"); // the SVG arrow is present
    expect(html).toMatch(/rotate\(90/); // rotated to windDir
    expect(html).not.toContain("breytileg átt");
  });

  it("shows 'breytileg átt' and NO arrow when the wind is variable", () => {
    const { html } = formatCallout(fullDatum({ windVariable: true, windDir: null }));
    expect(html).toContain("breytileg átt");
    expect(html).not.toContain("marker-wind-arrow");
  });

  it("includes a precip glyph when hasPrecip is true", () => {
    const { html } = formatCallout(fullDatum({ hasPrecip: true }));
    expect(html).toContain("marker-precip");
  });

  it("omits the precip glyph entirely for 'án úrkomu' (hasPrecip false)", () => {
    const { html } = formatCallout(fullDatum({ hasPrecip: false }));
    expect(html).not.toContain("marker-precip");
  });

  it("renders a muted 'ófullnægjandi gögn' callout with no accent-red temp when insufficient", () => {
    const { html, muted } = formatCallout(
      fullDatum({ sufficient: false, tempC: null, windSpeed: null, windDir: null }),
    );
    expect(muted).toBe(true);
    expect(html).toContain("ófullnægjandi gögn");
    expect(html).not.toContain("marker-temp"); // no accent-red temperature slot
    expect(html).not.toContain("marker-wind-arrow"); // no arrow in the muted state
  });

  it("still shows temp + wind speed when direction is variable but data is sufficient", () => {
    const { html, muted } = formatCallout(
      fullDatum({ sufficient: true, tempC: 6, windSpeed: 4, windVariable: true, windDir: null }),
    );
    expect(muted).toBe(false);
    expect(html).toMatch(/6°/);
    expect(html).toMatch(/4\s*(&nbsp;|\s)?m\/s|4.{0,6}m\/s/);
    expect(html).toContain("breytileg átt");
  });
});
