import { describe, expect, it } from "vitest";
import { paramsToState, stateToParams } from "./url.js";
import type { SelectionState } from "./store.js";
import type { YearBounds } from "./defaults.js";

const BOUNDS: YearBounds = { min: 1949, max: 2026 };

const FALLBACK: SelectionState = {
  anchorDoy: 197,
  widthDays: 7,
  yearFrom: 2017,
  yearTil: 2026,
  stationId: null,
  lng: -19.0,
  lat: 65.0,
  zoom: 6,
};

// A representative in-bounds selection whose viewport is expressible at the param precision.
const REP: SelectionState = {
  anchorDoy: 30,
  widthDays: 30,
  yearFrom: 2015,
  yearTil: 2026,
  stationId: 1350,
  lng: -20.0,
  lat: 64.5,
  zoom: 7,
};

describe("stateToParams / paramsToState round-trip (UX-02)", () => {
  it("round-trips the numeric fields to identity (within param precision)", () => {
    const back = paramsToState(stateToParams(REP), BOUNDS, FALLBACK);
    expect(back.anchorDoy).toBe(REP.anchorDoy);
    expect(back.widthDays).toBe(REP.widthDays);
    expect(back.yearFrom).toBe(REP.yearFrom);
    expect(back.yearTil).toBe(REP.yearTil);
    expect(back.stationId).toBe(REP.stationId);
    expect(back.lat).toBeCloseTo(REP.lat, 4);
    expect(back.lng).toBeCloseTo(REP.lng, 4);
    expect(back.zoom).toBeCloseTo(REP.zoom, 2);
  });

  it("omits st entirely when stationId is null and preserves null on parse", () => {
    const qs = stateToParams(FALLBACK); // stationId: null
    expect(qs.includes("st=")).toBe(false);
    expect(paramsToState(qs, BOUNDS, FALLBACK).stationId).toBeNull();
  });

  it("parses st to an integer when present", () => {
    const s = paramsToState("st=1350", BOUNDS, FALLBACK);
    expect(s.stationId).toBe(1350);
    // A fractional st is rounded to an integer, never left as a float.
    expect(paramsToState("st=1350.9", BOUNDS, FALLBACK).stationId).toBe(1351);
  });
});

describe("paramsToState defensive parse (T-04-05: no throw, no NaN)", () => {
  it("never throws and never yields NaN on garbage input", () => {
    const garbage = [
      "doy=NaN&w=999999&fra=abc&til=&v=garbage",
      "doy=&w=&fra=&til=&st=&v=",
      "doy=-500&w=-3&fra=999999&til=-1&v=1000,-1000,999",
      "v=only,two",
      "totally=unrelated&junk=1",
      "", // empty query
    ];
    for (const qs of garbage) {
      const s = paramsToState(qs, BOUNDS, FALLBACK);
      for (const v of [s.anchorDoy, s.widthDays, s.yearFrom, s.yearTil, s.lat, s.lng, s.zoom]) {
        expect(Number.isNaN(v)).toBe(false);
        expect(Number.isFinite(v)).toBe(true);
      }
      // stationId is either null or a finite integer, never NaN.
      expect(s.stationId === null || Number.isInteger(s.stationId)).toBe(true);
    }
  });

  it("garbage numeric params fall back to the fallback values", () => {
    const s = paramsToState("doy=NaN&w=abc&fra=xyz&til=nope&v=garbage", BOUNDS, FALLBACK);
    expect(s.anchorDoy).toBe(FALLBACK.anchorDoy);
    expect(s.widthDays).toBe(FALLBACK.widthDays);
    expect(s.yearFrom).toBe(FALLBACK.yearFrom);
    expect(s.yearTil).toBe(FALLBACK.yearTil);
    expect(s.lat).toBe(FALLBACK.lat);
    expect(s.lng).toBe(FALLBACK.lng);
    expect(s.zoom).toBe(FALLBACK.zoom);
  });
});

describe("paramsToState partial-URL falls back, not the Number(null)===0 trap (CR-01)", () => {
  it("a viewport-only URL restores the fallback anchor + fallback year range (not Jan 1 / [min,min])", () => {
    // A truncated share link or a Phase-6 station deep link carries no doy/fra/til. Absent params
    // must fall back to the intended defaults, NOT be coerced to 0 (→ doy 1, fra/til bounds.min).
    const s = paramsToState("v=64.5,-20.0,7", BOUNDS, FALLBACK);
    expect(s.anchorDoy).toBe(FALLBACK.anchorDoy); // NOT 1 (Jan 1)
    expect(s.widthDays).toBe(FALLBACK.widthDays);
    expect(s.yearFrom).toBe(FALLBACK.yearFrom); // NOT bounds.min
    expect(s.yearTil).toBe(FALLBACK.yearTil); // NOT bounds.min (range NOT collapsed)
  });

  it("?w=14 with no doy/fra/til restores fallback anchor + fallback year range (regression)", () => {
    const s = paramsToState("w=14", BOUNDS, FALLBACK);
    expect(s.widthDays).toBe(14); // the one present param is honoured
    expect(s.anchorDoy).toBe(FALLBACK.anchorDoy); // NOT 1
    expect(s.yearFrom).toBe(FALLBACK.yearFrom); // NOT bounds.min
    expect(s.yearTil).toBe(FALLBACK.yearTil); // NOT bounds.min → NOT [min,min]
  });

  it("empty-string params (?doy=&fra=&til=) fall back, NOT to 0 (Number('')===0 trap)", () => {
    const s = paramsToState("doy=&w=&fra=&til=&st=", BOUNDS, FALLBACK);
    expect(s.anchorDoy).toBe(FALLBACK.anchorDoy); // NOT clamp(0)→1
    expect(s.widthDays).toBe(FALLBACK.widthDays);
    expect(s.yearFrom).toBe(FALLBACK.yearFrom); // NOT bounds.min
    expect(s.yearTil).toBe(FALLBACK.yearTil); // NOT bounds.min
    expect(s.stationId).toBe(FALLBACK.stationId); // NOT station 0
  });

  it("a Phase-6-style ?st=42-only deep link keeps the fallback selection intact", () => {
    const s = paramsToState("st=42", BOUNDS, FALLBACK);
    expect(s.stationId).toBe(42);
    expect(s.anchorDoy).toBe(FALLBACK.anchorDoy);
    expect(s.yearFrom).toBe(FALLBACK.yearFrom);
    expect(s.yearTil).toBe(FALLBACK.yearTil);
  });
});

describe("paramsToState clamps (ASVS V5)", () => {
  it("clamps doy into [1, 365]", () => {
    expect(paramsToState("doy=0", BOUNDS, FALLBACK).anchorDoy).toBe(1);
    expect(paramsToState("doy=999", BOUNDS, FALLBACK).anchorDoy).toBe(365);
    expect(paramsToState("doy=100", BOUNDS, FALLBACK).anchorDoy).toBe(100);
  });

  it("snaps w to the nearest allowed {7,14,21,30}", () => {
    expect(paramsToState("w=8", BOUNDS, FALLBACK).widthDays).toBe(7);
    expect(paramsToState("w=13", BOUNDS, FALLBACK).widthDays).toBe(14);
    expect(paramsToState("w=25", BOUNDS, FALLBACK).widthDays).toBe(21);
    expect(paramsToState("w=999999", BOUNDS, FALLBACK).widthDays).toBe(30);
    expect(paramsToState("w=30", BOUNDS, FALLBACK).widthDays).toBe(30);
  });

  it("clamps fra/til into bounds and enforces fra ≤ til", () => {
    const lo = paramsToState("fra=1800&til=1900", BOUNDS, FALLBACK);
    expect(lo.yearFrom).toBe(1949);
    expect(lo.yearTil).toBe(1949);
    const hi = paramsToState("fra=3000&til=3100", BOUNDS, FALLBACK);
    expect(hi.yearFrom).toBe(2026);
    expect(hi.yearTil).toBe(2026);
    // Inverted range: fra > til → til bumped up to fra.
    const inv = paramsToState("fra=2020&til=2000", BOUNDS, FALLBACK);
    expect(inv.yearFrom).toBe(2020);
    expect(inv.yearTil).toBe(2020);
  });

  it("clamps viewport lat/lng within Iceland maxBounds and zoom within [4,12]", () => {
    const s = paramsToState("v=1000,-1000,999", BOUNDS, FALLBACK);
    expect(s.lat).toBe(67.5);
    expect(s.lng).toBe(-26);
    expect(s.zoom).toBe(12);
    const s2 = paramsToState("v=0,0,0", BOUNDS, FALLBACK);
    expect(s2.lat).toBe(62.5);
    expect(s2.lng).toBe(-12);
    expect(s2.zoom).toBe(4);
  });
});
