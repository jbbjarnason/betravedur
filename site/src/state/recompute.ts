// Instant client-side recompute over already-loaded derived files (SEL-04).
//
// The load-bearing "no fetch" path: derived files are fetched ONCE at boot (main.ts) and
// cached here as a station→{meta, file} Map. A selection change re-runs the PURE
// computeMarkerDatum producer over that cache — never `loadDerived`, never the network
// (RESEARCH Pitfall 2). Cost is bounded by station count, not by the selection values.
import { computeMarkerDatum } from "../data/averages.js";
import { anchorToWindow } from "../data/window.js";
import type { SelectionState } from "./store.js";
import type { MarkerDatum } from "../data/types.js";
import type { StationMeta } from "@betravedur/domain";
import type { DerivedFile } from "@betravedur/pipeline/derive";

/** One cached station: its metadata + the decoded-on-demand derived file (fetched once at boot). */
export interface StationCacheEntry {
  meta: StationMeta;
  file: DerivedFile;
}

/** station id → {meta, file}. Built once at boot; iterated on every recompute. */
export type StationCache = Map<number, StationCacheEntry>;

/**
 * A muted, insufficient datum for a station whose recompute failed (corrupt file, etc.).
 * SINGLE SOURCE OF TRUTH for the muted shape — main.ts imports this rather than keeping a
 * copy, so the boot-time fallback and the recompute-time fallback never drift.
 */
export function mutedDatum(meta: {
  station: number;
  name: string;
  lon: number;
  lat: number;
}): MarkerDatum {
  return {
    station: meta.station,
    name: meta.name,
    lon: meta.lon,
    lat: meta.lat,
    tempC: null,
    windSpeed: null,
    windDir: null,
    windVariable: true,
    hasPrecip: false,
    n: 0,
    sufficient: false,
    // A muted station is off the color scale and unranked (Phase 5): score:null,
    // missingRain:true keeps the muted shape in lockstep with the insufficient path
    // in computeMarkerDatum (combine() over all-null components → score:null,
    // missingRain:true). Never let the muted shape drift from the real one.
    score: null,
    missingRain: true,
    priority: 9999,
  };
}

/** Build the station→{meta, file} cache from the boot fetch results. */
export function buildStationCache(entries: StationCacheEntry[]): StationCache {
  const cache: StationCache = new Map();
  for (const entry of entries) cache.set(entry.meta.station, entry);
  return cache;
}

/**
 * Recompute every cached station's MarkerDatum for the current selection — NO fetch.
 * Derives the WindowSpec from (anchorDoy, widthDays) and the baseline YearRange from
 * (yearFrom, yearTil), then runs the pure producer over each cached file. A single station
 * whose compute throws (corrupt file) degrades to a muted datum; recompute NEVER throws, so
 * one bad file can't sink the whole map (mirrors the boot-time per-station guard).
 */
export function recompute(cache: StationCache, state: Readonly<SelectionState>): MarkerDatum[] {
  const window = anchorToWindow(state.anchorDoy, state.widthDays);
  const range = { from: state.yearFrom, til: state.yearTil };
  const out: MarkerDatum[] = [];
  for (const { meta, file } of cache.values()) {
    try {
      out.push(computeMarkerDatum(meta, file, window, range));
    } catch {
      out.push(mutedDatum(meta));
    }
  }
  return out;
}
