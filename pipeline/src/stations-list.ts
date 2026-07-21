// full_backfill national station enumeration + type->spec mapping (DATA-03 wire-only).
//
// The seam `workflow_dispatch full_backfill=true` calls to know WHICH stations to backfill
// and WHICH aggregate spec each maps to. It is WIRED into the dispatch path but the full
// national backfill is NOT run this phase (08-CONTEXT): enumerate the set, do not sweep it.
//
// Thin trust-boundary pass-through: the heavy /stations parsing (WR-08/09) already lives in
// @betravedur/fetch fetchStations; here we only filter to stations whose type maps to an
// aggregate spec (AWS "sj" / SYNOP "sk") so the dispatch never emits an ur/vf spec the
// aggregate CLI would reject. Node-side build-time helper — never bundled into the browser.
import type { StationMeta } from "@betravedur/domain";

/** Fetch dep injected so tests never hit the network; defaults to @betravedur/fetch. */
export interface EnumerateDeps {
  fetchStations: (ids: number[]) => Promise<StationMeta[]>;
}

/**
 * Map a station's type to the aggregate CLI spec convention (`<aws|synop>:<id>`):
 *   - "sj" (AWS)   -> `aws:<id>`
 *   - "sk" (SYNOP) -> `synop:<id>`
 *   - "ur"/"vf" (unsupported by the daily aggregate) -> null, so the caller skips them.
 * Returning null (rather than defaulting) keeps the aggregate spec list AWS/SYNOP-only —
 * an "ur" precip-only station has no daily AWS/SYNOP endpoint the backfill can drive.
 */
export function toAggregateSpec(meta: StationMeta): string | null {
  if (meta.type === "sj") return `aws:${meta.station}`;
  if (meta.type === "sk") return `synop:${meta.station}`;
  return null;
}

/**
 * Enumerate the national station set for full_backfill: fetch metadata for `ids` and keep
 * only the stations whose type maps to an aggregate spec (drops ur/vf). Returns the survivors
 * in fetch order — the dispatch derives one `<aws|synop>:<id>` spec per entry via
 * `toAggregateSpec`. Wire-only: this phase enumerates but does not run the national sweep.
 */
export async function enumerateStations(
  ids: number[],
  deps?: EnumerateDeps,
): Promise<StationMeta[]> {
  const fetchStations =
    deps?.fetchStations ?? (await import("@betravedur/fetch")).fetchStations;
  const stations = await fetchStations(ids);
  return stations.filter((s) => toAggregateSpec(s) !== null);
}

/**
 * Pure spec projection for the dispatch loop: map an enumerated station set to the
 * newline-joined `<aws|synop>:<id>` list the backfill/aggregate CLIs consume. Every station
 * here already survived `enumerateStations`' filter, so `toAggregateSpec` is non-null for all;
 * the `!== null` guard keeps this total (never emits an empty `synop:` line). Tested pure so
 * the CI wiring can be proven offline.
 */
export function specsFor(stations: StationMeta[]): string {
  return stations
    .map(toAggregateSpec)
    .filter((s): s is string => s !== null)
    .join("\n");
}

/**
 * CLI entry for `workflow_dispatch full_backfill=true`: enumerate the national station set
 * (empty `ids` -> the full `/stations` registry) and print one `<aws|synop>:<id>` spec per
 * line to stdout. The nightly workflow captures this list and drives `backfill` + `aggregate`
 * over each spec (via `npx tsx`, never bare `node <file>.ts` — type-stripping is version-
 * fragile on the pinned Node 22). This is what makes a dispatched full_backfill genuinely
 * sweep the national set rather than the two hardcoded seed stations.
 */
export async function main(): Promise<void> {
  const stations = await enumerateStations([]);
  const specs = specsFor(stations);
  if (specs.length > 0) process.stdout.write(specs + "\n");
}

// Guarded CLI invocation (skipped when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
