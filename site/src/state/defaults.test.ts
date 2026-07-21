import { describe, expect, it } from "vitest";
import { defaultSelection, yearBounds } from "./defaults.js";
import type { Manifest } from "../data/load.js";

function manifest(stations: Record<string, { from?: number; to?: number }>): Manifest {
  const out: Manifest = { stations: {} };
  for (const [id, e] of Object.entries(stations)) {
    out.stations[id] = { file: `derived/${id}.abc.json`, from: e.from, to: e.to };
  }
  return out;
}

describe("yearBounds (SEL-02) — union, not intersection", () => {
  it("returns the union {min: min-of-from, max: max-of-to} across stations", () => {
    const m = manifest({ "1": { from: 1949, to: 2026 }, "1350": { from: 2008, to: 2026 } });
    expect(yearBounds(m)).toEqual({ min: 1949, max: 2026 });
  });

  it("is the union even when one station's window is wider on the high end", () => {
    const m = manifest({ "a": { from: 1990, to: 2010 }, "b": { from: 2000, to: 2026 } });
    // Union → {1990, 2026}; an INTERSECTION would (wrongly) give {2000, 2010}.
    const b = yearBounds(m);
    expect(b).toEqual({ min: 1990, max: 2026 });
    expect(b).not.toEqual({ min: 2000, max: 2010 });
  });

  it("falls back to {thisYear-10, thisYear} on a malformed/empty manifest (never NaN)", () => {
    const y = new Date().getUTCFullYear();
    expect(yearBounds({ stations: {} })).toEqual({ min: y - 10, max: y });
    const bad = yearBounds(manifest({ "x": {}, "y": {} }));
    expect(Number.isFinite(bad.min)).toBe(true);
    expect(Number.isFinite(bad.max)).toBe(true);
    expect(bad).toEqual({ min: y - 10, max: y });
  });
});

describe("defaultSelection (SEL-02) — today's week over the last 10 years", () => {
  const bounds = { min: 1949, max: 2026 };

  it("anchors on today's leap-folded doy with a fixed now", () => {
    // 2026-07-16 → doy 197 ("16. júlí", per the leap-fold contract).
    const s = defaultSelection(bounds, new Date("2026-07-16T12:00:00Z"));
    expect(s.anchorDoy).toBe(197);
  });

  it("uses widthDays 7, yearTil = bounds.max, yearFrom = max(bounds.min, bounds.max-9)", () => {
    const s = defaultSelection(bounds, new Date("2026-03-01T00:00:00Z"));
    expect(s.widthDays).toBe(7);
    expect(s.yearTil).toBe(2026);
    expect(s.yearFrom).toBe(2017); // max(1949, 2026-9)
    expect(s.stationId).toBeNull();
    expect(s.lng).toBe(-18.7);
    expect(s.lat).toBe(64.9);
    expect(s.zoom).toBe(5.4);
  });

  it("clamps yearFrom to bounds.min when fewer than 10 years are available", () => {
    const s = defaultSelection({ min: 2020, max: 2026 }, new Date("2026-07-16T12:00:00Z"));
    expect(s.yearFrom).toBe(2020); // max(2020, 2026-9=2017) → 2020
    expect(s.yearTil).toBe(2026);
  });
});
