// No-splice station registry keyed strictly on integer station ID (DATA-06, T-01-11).
//
// Invariants:
//   - Keyed on the integer `station` ID, never on name or physical location.
//   - Two IDs at the same place (Keflavík synop 990 vs AWS 1350) stay DISTINCT — never merged.
//   - Decommissioned stations (`ending != null`) are RETAINED (needed for historical windows;
//     429 of 776 stations are decommissioned as of research).
//   - A genuine duplicate ID keeps ONE coherent record (last wins) rather than fabricating a
//     spliced average of two places.
import type { StationMeta } from "@betravedur/domain";

/**
 * Build the registry from a flat StationMeta[]: a Map keyed on integer station ID.
 * No collision-merge by name/location; decommissioned entries retained.
 */
export function buildRegistry(stations: StationMeta[]): Map<number, StationMeta> {
  const registry = new Map<number, StationMeta>();
  for (const station of stations) {
    // Keep the whole record verbatim under its ID. Last write wins on a duplicate ID —
    // we never blend two records into a spliced series.
    registry.set(station.station, station);
  }
  return registry;
}

/**
 * Serialize the registry to a deterministic, ID-sorted JSON array — the committed
 * stations.json artifact the pipeline regenerates. Pure string return: writing to
 * disk is the caller's job (tests never touch the repo).
 */
export function serializeRegistry(registry: Map<number, StationMeta>): string {
  const sorted = [...registry.values()].sort((a, b) => a.station - b.station);
  return JSON.stringify(sorted, null, 2) + "\n";
}
