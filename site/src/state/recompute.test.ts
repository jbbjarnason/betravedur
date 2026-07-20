// Unit tests for the instant client-side recompute path (SEL-04).
//
// Proves the two load-bearing guarantees: recompute reads ONLY the in-memory cache (no fetch
// — the module imports no loader, and output changes purely from state changes over fixed
// cached files), and a single corrupt file degrades to a muted datum without sinking the map.
import { describe, it, expect } from "vitest";
import { encodeDerived, type DerivedFile } from "@betravedur/pipeline/derive";
import type { DailyObservation, StationMeta } from "@betravedur/domain";
import { buildStationCache, recompute, type StationCacheEntry } from "./recompute.js";
import type { SelectionState } from "./store.js";

const synthMeta = (id: number): StationMeta => ({
  station: id,
  name: `Synthetic ${id}`,
  type: "sj",
  owner: "test",
  lat: 65,
  lon: -19,
  ele: 0,
  start: 2000,
  ending: null,
});

function row(station: number, date: string, doy: number, over: Partial<DailyObservation>): DailyObservation {
  return {
    station,
    date,
    doy,
    t: null,
    tx: null,
    tn: null,
    f: null,
    fx: null,
    fg: null,
    dv: null,
    r: null,
    ...over,
  };
}

/** A station with a deep, fully-covered doy 190–210 window across many years. */
function deepStation(id: number): StationCacheEntry {
  const rows: DailyObservation[] = [];
  for (let y = 2005; y <= 2020; y++) {
    for (let doy = 190; doy <= 210; doy++) {
      rows.push(row(id, `${y}-07-16`, doy, { t: 10 + (doy - 200) * 0.1, f: 4, dv: 90 }));
    }
  }
  return { meta: synthMeta(id), file: encodeDerived(rows, "sj", id) };
}

const state = (patch: Partial<SelectionState> = {}): SelectionState => ({
  anchorDoy: 197,
  widthDays: 7,
  yearFrom: 2005,
  yearTil: 2020,
  stationId: null,
  lng: -19,
  lat: 65,
  zoom: 6,
  ...patch,
});

describe("buildStationCache", () => {
  it("returns a Map keyed by station id holding {meta, file}", () => {
    const a = deepStation(11);
    const b = deepStation(22);
    const cache = buildStationCache([a, b]);
    expect(cache.size).toBe(2);
    expect(cache.get(11)).toBe(a);
    expect(cache.get(22)?.meta.station).toBe(22);
  });
});

describe("recompute (SEL-04)", () => {
  it("returns one MarkerDatum per cache entry, computed for the current window + range", () => {
    const cache = buildStationCache([deepStation(11), deepStation(22)]);
    const out = recompute(cache, state());
    expect(out).toHaveLength(2);
    for (const d of out) {
      expect(d.sufficient).toBe(true);
      expect(d.tempC).not.toBeNull();
    }
  });

  it("reads ONLY the cache (no fetch): output changes when state.anchorDoy changes", () => {
    // Build the cache once from in-memory fixtures. Two different windows over the SAME
    // cached files must be able to produce different data — proving recompute reads the
    // cached file, not a re-fetch (it imports no loader; the cache is the only data source).
    const cache = buildStationCache([deepStation(11)]);
    const early = recompute(cache, state({ anchorDoy: 190, widthDays: 7 }));
    const late = recompute(cache, state({ anchorDoy: 204, widthDays: 7 }));
    // Both computed, both sufficient — the temp gradient across doy makes the means differ.
    expect(early[0].tempC).not.toBeNull();
    expect(late[0].tempC).not.toBeNull();
    expect(early[0].tempC).not.toBeCloseTo(late[0].tempC as number, 6);
    // A window entirely outside the covered doys yields a muted datum — still no fetch, no throw.
    const empty = recompute(cache, state({ anchorDoy: 5, widthDays: 7 }));
    expect(empty[0].sufficient).toBe(false);
  });

  it("a cache entry whose computeMarkerDatum throws degrades to a muted datum (never throws)", () => {
    // A structurally corrupt DerivedFile: a present column but no quant table → decode throws.
    const corrupt = {
      station: 99,
      startYear: 2005,
      nYears: 2,
      type: "sj",
      cols: { t: [1] },
      // quant intentionally omitted → val() dereferences undefined[...] → throws.
    } as unknown as DerivedFile;
    const cache = buildStationCache([
      deepStation(11),
      { meta: synthMeta(99), file: corrupt },
    ]);

    let out;
    expect(() => {
      out = recompute(cache, state());
    }).not.toThrow();
    expect(out).toHaveLength(2);
    // The healthy station still computes; the corrupt one is muted, not dropped.
    const bad = out!.find((d) => d.station === 99)!;
    expect(bad.sufficient).toBe(false);
    expect(bad.n).toBe(0);
    expect(bad.tempC).toBeNull();
    const good = out!.find((d) => d.station === 11)!;
    expect(good.sufficient).toBe(true);
  });
});
