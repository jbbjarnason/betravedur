// Unit tests for the pure marker helpers (Vitest). These pin the composite-callout
// contract independently of MapLibre/DOM: toFeatureCollection (GeoJSON shape + label
// formatting) and formatCallout (temp red / wind arrow|breytileg átt / precip glyph
// omission / muted ófullnægjandi-gögn). No map, no browser — the rendering core.
import { describe, expect, it } from "vitest";
import type { MarkerDatum } from "../data/types.js";
import type * as maplibregl from "maplibre-gl";
import { toFeatureCollection, formatCallout, formatScore, attachCompositeRenderer } from "./markers.js";

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
    score: 7.4,
    missingRain: false,
    priority: 0.19,
    ...overrides,
  };
}

describe("toFeatureCollection", () => {
  it("emits one feature per datum with [lon,lat] point geometry", () => {
    const fc = toFeatureCollection([fullDatum({ station: 1 }), fullDatum({ station: 1350, lon: -22.6, lat: 63.98 })]);
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(2);
    const a = fc.features[0]!;
    expect(a.type).toBe("Feature");
    expect(a.geometry.type).toBe("Point");
    expect(a.geometry.coordinates).toEqual([-21.9, 64.13]);
  });

  it("carries a rounded-degree label for a sufficient datum", () => {
    const fc = toFeatureCollection([fullDatum({ tempC: 7.4, sufficient: true })]);
    expect(fc.features[0]!.properties.label).toBe("7°");
  });

  it("rounds negative temperatures correctly in the label", () => {
    const fc = toFeatureCollection([fullDatum({ tempC: -3.6, sufficient: true })]);
    expect(fc.features[0]!.properties.label).toBe("-4°");
  });

  it("uses an em-dash label for an insufficient datum", () => {
    const fc = toFeatureCollection([fullDatum({ tempC: null, sufficient: false })]);
    expect(fc.features[0]!.properties.label).toBe("—");
  });

  it("exposes station id and priority (the symbol-sort-key) as feature properties", () => {
    const fc = toFeatureCollection([fullDatum({ station: 42, priority: 3.5 })]);
    expect(fc.features[0]!.properties.station).toBe(42);
    expect(fc.features[0]!.properties.priority).toBe(3.5);
  });
});

describe("formatScore (MAP-03 — Icelandic one-decimal comma badge)", () => {
  it("formats a score to one decimal with an Icelandic comma (never a point)", () => {
    expect(formatScore(7.8)).toBe("7,8");
    expect(formatScore(7.84)).toBe("7,8"); // one-decimal rounding
    expect(formatScore(8)).toBe("8,0");
  });

  it("matches the UI-SPEC badge regex /^\\d{1,2},\\d$/ at both ends of the scale", () => {
    const re = /^\d{1,2},\d$/;
    expect(formatScore(0)).toBe("0,0");
    expect(formatScore(10)).toBe("10,0");
    expect(re.test(formatScore(0))).toBe(true);
    expect(re.test(formatScore(10))).toBe(true);
    expect(re.test(formatScore(6.5))).toBe(true);
  });

  it("clamps out-of-range / non-finite input so the badge never shows NaN, (T-05-03)", () => {
    expect(formatScore(12)).toBe("10,0");
    expect(formatScore(-3)).toBe("0,0");
    // Non-finite (NaN/Infinity) resolves to the LOW stop, mirroring scoreColor's total-clamp
    // contract — the badge can never render NaN, (T-05-03).
    expect(formatScore(Number.NaN)).toBe("0,0");
    expect(formatScore(Number.POSITIVE_INFINITY)).toBe("0,0");
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
    // WR-03: dv is the FROM direction; arrow points TOWARD → rotate(dv + 180).
    // An easterly wind (dv=90, blowing FROM the east) points WEST → rotate(270).
    expect(html).toMatch(/rotate\(270/);
    expect(html).not.toContain("breytileg átt");
  });

  // WR-03: LOCK the wind FROM/TOWARD convention so a future refactor can't silently
  // introduce a 180°-wrong arrow (the invisible-in-review pitfall). dv (Veðurstofan
  // vindátt) is the direction the wind blows FROM; our arrow points TOWARD = dv + 180.
  describe("wind arrow FROM/TOWARD convention (WR-03 lock)", () => {
    const rotationOf = (dv: number): number => {
      const { html } = formatCallout(
        fullDatum({ windDir: dv, windVariable: false, windSpeed: 3 }),
      );
      const m = html.match(/rotate\((\d+(?:\.\d+)?)/);
      if (!m) throw new Error(`no rotate() found in: ${html}`);
      return Number(m[1]);
    };

    it("north wind (dv=0, blows FROM north) → arrow points SOUTH (rotate 180)", () => {
      expect(rotationOf(0)).toBe(180);
    });

    it("south wind (dv=180, blows FROM south) → arrow points NORTH (rotate 0)", () => {
      expect(rotationOf(180)).toBe(0);
    });

    it("east wind (dv=90, blows FROM east) → arrow points WEST (rotate 270)", () => {
      expect(rotationOf(90)).toBe(270);
    });

    it("west wind (dv=270, blows FROM west) → arrow points EAST (rotate 90)", () => {
      expect(rotationOf(270)).toBe(90);
    });
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
    expect(html).toContain(">4<"); // integer speed numeral present
    expect(html).toMatch(/m\/s/); // unit present (nested span between numeral and unit)
    expect(html).toContain("breytileg átt");
  });
});

describe("attachCompositeRenderer — idempotency (WR-04)", () => {
  // A minimal fake map that records on/off calls per event, so we can assert the
  // idle/move handler pairs do not accumulate across re-invocations.
  function fakeMap() {
    const handlers: Record<string, Set<unknown>> = { idle: new Set(), move: new Set() };
    const map = {
      on(evt: string, fn: unknown) {
        (handlers[evt] ??= new Set()).add(fn);
      },
      off(evt: string, fn: unknown) {
        handlers[evt]?.delete(fn);
      },
    } as unknown as maplibregl.Map;
    return { map, handlers };
  }

  it("does not stack idle/move listeners when re-invoked (Phase-4 re-wire)", () => {
    const { map, handlers } = fakeMap();
    attachCompositeRenderer(map);
    expect(handlers.idle!.size).toBe(1);
    expect(handlers.move!.size).toBe(1);

    // Re-wire twice more (as a period change would) — the prior pair must be detached.
    attachCompositeRenderer(map);
    attachCompositeRenderer(map);
    expect(handlers.idle!.size).toBe(1);
    expect(handlers.move!.size).toBe(1);
  });

  it("keeps separate maps independent", () => {
    const a = fakeMap();
    const b = fakeMap();
    attachCompositeRenderer(a.map);
    attachCompositeRenderer(b.map);
    attachCompositeRenderer(a.map);
    expect(a.handlers.idle!.size).toBe(1);
    expect(b.handlers.idle!.size).toBe(1);
  });
});
