// Generate stations.json from the Phase-1 no-splice registry, gated on real qualifying-years.
//
// The marker/registry manifest Phase 3's client fetches to place map markers (DATA-04).
// Contracts (02-RESEARCH "stations.json", "filter-on-data-not-start"):
//   - Filter on ACTUAL daily data: include a station IFF it has >=3 qualifying years
//     (effectiveN().sufficient), NOT on its `start` year — a 1949 `start` with <3 real
//     qualifying years is EXCLUDED so "meðaltal N ára" stays honest.
//   - Keep decommissioned stations (`ending != null`) that clear the >=3 bar (locked decision).
//   - No splicing / no field invention: each entry is built field-by-field from StationMeta,
//     keyed by integer station id; two ids at one place stay distinct (DATA-06 carried forward).
//   - Deterministic serialization: sorted by station id so nightly diffs stay minimal.
//
// PURE over StationMeta[] + a qualifying-years count map (the aggregator in Plan 04 computes
// counts from real data and wires the fetch-edge `parseStationsBody`/`toStationMeta`). This
// module never fetches and never re-implements registry parsing.
import type { StationMeta } from "@betravedur/domain";
import { effectiveN } from "@betravedur/domain";

/**
 * One stations.json entry: exactly the Phase-1 StationMeta fields, no invention.
 * (Structurally identical to StationMeta; named for intent at the artifact boundary.)
 */
export interface StationEntry {
  station: number;
  name: string;
  type: StationMeta["type"];
  owner: string;
  lat: number;
  lon: number;
  ele: number;
  start: number;
  ending: number | null;
}

/**
 * Build the entry explicitly, field-by-field, from StationMeta. NOT a `{...station}` spread:
 * the registry may carry extra keys (abbr/wigos in the raw /stations rows) that must never
 * leak into the marker manifest, and explicit construction guarantees a stable field set.
 */
function toEntry(s: StationMeta): StationEntry {
  return {
    station: s.station,
    name: s.name,
    type: s.type,
    owner: s.owner,
    lat: s.lat,
    lon: s.lon,
    ele: s.ele,
    start: s.start,
    ending: s.ending,
  };
}

/**
 * Filter the registry to stations with >=3 qualifying years of real daily data and emit the
 * marker manifest, sorted by station id.
 *
 * @param stations         no-splice registry (StationMeta[], from @betravedur/fetch at the edge).
 * @param qualifyingCounts station id -> count of qualifying years (>=80% coverage), computed
 *                         upstream from the ACTUAL raw/derived data (never from `start`).
 */
export function buildStationsJson(
  stations: StationMeta[],
  qualifyingCounts: Map<number, number>,
): StationEntry[] {
  const out: StationEntry[] = [];
  for (const s of stations) {
    const qualifying = qualifyingCounts.get(s.station) ?? 0;
    // The >=3 bar via the domain gate — filter on real data, not on `start`.
    // effectiveN takes the qualifying-years array; we only have its length here, so build a
    // length-`qualifying` array (contents irrelevant to the N>=3 gate).
    if (!effectiveN(new Array<number>(qualifying)).sufficient) continue;
    out.push(toEntry(s));
  }
  // Decommissioned stations that cleared the bar are already retained above (no ending filter).
  return out.sort((a, b) => a.station - b.station);
}

/**
 * Serialize to deterministic, station-id-sorted JSON. buildStationsJson already sorts, but we
 * re-sort defensively so serialization is order-independent (byte-identical on identical input).
 */
export function serializeStationsJson(entries: StationEntry[]): string {
  const sorted = [...entries].sort((a, b) => a.station - b.station);
  return JSON.stringify(sorted, null, 2) + "\n";
}
