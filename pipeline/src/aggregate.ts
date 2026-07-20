// Aggregate orchestrator — turns the field-pruned raw store into the shippable artifact set.
//
// The closing vertical slice of Phase 2: for each touched station read every raw year
// partition, encode the compact columnar derived file (Plan 01), content-hash it and update
// the manifest (Plan 03), and — at the CLI level — regenerate stations.json from the no-splice
// registry (Plan 03) with qualifying-years counts computed from the ACTUAL decoded data.
//
// TOUCHED-ONLY re-derivation (returning-visitor cache deltas): a station's
// derived/{station}.{hash}.json is (re)written only when its content hash changes. Unchanged
// raw -> byte-identical derived bytes -> same hash -> manifest entry preserved byte-identically
// (updateManifest's delta property) and no spurious file rewrite.
//
// SEASON-YEAR (WR-03): the derived store keeps CALENDAR-year columns (Plan 01 convention);
// season-year grouping is applied at AGGREGATION/DECODE time via `groupBySeasonYear` from
// @betravedur/domain. This module never re-implements quantization or season-year grouping.
//
// SHIP RULE: only derived/ + stations.json + manifest.json ship to Pages. The raw store
// (raw/) NEVER ships — see `shipOutputs()`.
//
// Node built-ins only (fs/path) — never bundled into the browser.
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import type {
  DailyObservation,
  StationMeta,
  StationType,
  WindowSpec,
} from "@betravedur/domain";
import {
  effectiveN,
  expandWindow,
  groupBySeasonYear,
  qualifyingYears,
} from "@betravedur/domain";
import { encodeDerived, decodeDerived } from "./derive.js";
import type { DerivedFile } from "./derive.js";
import {
  readPartition,
  highWaterYear,
  assertStationId,
  DEFAULT_ROOT,
} from "./rawstore.js";
import {
  contentHash,
  updateManifest,
  serializeManifest,
  readManifest,
} from "./manifest.js";
import type { Manifest } from "./manifest.js";
import { buildStationsJson, serializeStationsJson } from "./stations.js";

/**
 * The shippable output set: exactly what deploys to GitHub Pages. The raw store (`raw/`) is
 * the pipeline's private source of truth and is deliberately NOT in this list — it never ships.
 */
export function shipOutputs(): string[] {
  return ["derived", "stations.json", "manifest.json"];
}

/**
 * Assert `outPath` resolves to a location strictly under `root` before any write (CR-01,
 * defense-in-depth). Even with the station-id guard, a manifest `file` field flowing from
 * untrusted state could contain `..` segments; a resolved-prefix check makes the write
 * refuse to escape the store root. The `+ sep` guard prevents a sibling like `rootEvil/`
 * from matching a `root` prefix.
 */
function assertUnderRoot(root: string, outPath: string): void {
  const resolvedRoot = resolve(root);
  const resolvedOut = resolve(outPath);
  if (resolvedOut !== resolvedRoot && !resolvedOut.startsWith(resolvedRoot + sep)) {
    throw new Error(`refusing to write outside store root: ${outPath}`);
  }
}

/** All calendar years present in the raw store for a station, ascending (empty when none). */
function rawYears(root: string, station: number): number[] {
  const dir = join(root, "raw", String(station));
  if (!existsSync(dir)) return [];
  const years: number[] = [];
  for (const name of readdirSync(dir)) {
    const m = /^(\d{4})\.ndjson$/.exec(name);
    if (m) years.push(Number(m[1]));
  }
  return years.sort((a, b) => a - b);
}

/** Concatenate every raw year partition for a station into one date-ordered row array. */
function readAllRaw(root: string, station: number): DailyObservation[] {
  const rows: DailyObservation[] = [];
  for (const year of rawYears(root, station)) {
    rows.push(...readPartition(root, station, year));
  }
  return rows;
}

/**
 * The station-inclusion window: a broad mid-year (summer) span used as the REPRESENTATIVE
 * coverage gate for stations.json. Named constants (was bare 152/243/0.8, WR-03) so the policy
 * is explicit and testable:
 *   - SUMMER_WINDOW_START_DOY / SUMMER_WINDOW_END_DOY: leap-folded doy 152..243, i.e. ~Jun 1..
 *     Aug 31 — the widest reliably-covered season for both AWS and SYNOP.
 *   - SUMMER_WINDOW_MIN_COVERAGE: fraction of the ~92 window days that must carry a non-null `t`
 *     for a season-year to qualify (matches the domain default; stated here for the rationale).
 * Temperature is the always-present metric across station types, so it drives the gate.
 */
export const SUMMER_WINDOW_START_DOY = 152;
export const SUMMER_WINDOW_END_DOY = 243;
export const SUMMER_WINDOW_MIN_COVERAGE = 0.8;

/**
 * Count qualifying years (>=3 gate feeds this) for a station over the representative summer
 * window, from decoded derived rows, grouped by season-year so the count reflects real data
 * depth, not `start`.
 */
export function countQualifyingYears(rows: DailyObservation[]): number {
  const spec: WindowSpec = {
    startDoy: SUMMER_WINDOW_START_DOY,
    endDoy: SUMMER_WINDOW_END_DOY,
  };
  const windowDays = expandWindow(spec);
  const bySeason = groupBySeasonYear(rows, spec);
  const qy = qualifyingYears(bySeason, windowDays, (o) => o.t, SUMMER_WINDOW_MIN_COVERAGE);
  return qy.length;
}

/**
 * Aggregate ONE station: read all raw partitions, encode the derived file, content-hash it,
 * update the manifest, and write derived/{station}.{hash}.json ONLY when the hash changed
 * (touched-only). Returns the updated manifest (input is never mutated — updateManifest is pure).
 *
 * The high-water marks recorded are {from,to} = the station's raw calendar-year span and a
 * lastFetched ISO timestamp; these advance whenever new years enter the raw store.
 */
export function aggregateStation(
  root: string,
  station: number,
  type: StationType,
  manifest: Manifest,
): Manifest {
  return aggregateStationWithDerived(root, station, type, manifest).manifest;
}

/**
 * Like `aggregateStation` but ALSO returns the encoded `DerivedFile` it already computed.
 *
 * WR-04: the CLI loop needs decoded rows to count qualifying years. Previously it re-called
 * `decodeDerived(encodeDerived(readAllRaw(root, id), type))` on the very next line — re-reading
 * every raw partition from disk and re-encoding a second time (twice the I/O + encode work for a
 * 78-year station, and a fragile coupling if `readAllRaw` were ever non-deterministic). Returning
 * the derived file here lets the caller decode it ONCE, from the exact bytes just written.
 */
export function aggregateStationWithDerived(
  root: string,
  station: number,
  type: StationType,
  manifest: Manifest,
): { manifest: Manifest; derived: DerivedFile } {
  // Reject an invalid station id before it reaches any path (raw read OR derived write). CR-01.
  assertStationId(station);
  const rows = readAllRaw(root, station);
  const derived = encodeDerived(rows, type, station);
  const bytes = JSON.stringify(derived, null, 2) + "\n";
  const hash = contentHash(bytes);

  const years = rawYears(root, station);
  const from = years.length > 0 ? years[0]! : derived.startYear;
  const to =
    years.length > 0 ? years[years.length - 1]! : derived.startYear + Math.max(0, derived.nYears - 1);
  const marks = { from, to, lastFetched: new Date().toISOString() };

  const existing = manifest.stations[station];
  const next = updateManifest(manifest, station, bytes, marks);

  // Touched-only: write the derived file only when the content hash changed (or is new).
  if (!existing || existing.hash !== hash) {
    const outPath = join(root, next.stations[station]!.file);
    assertUnderRoot(root, outPath);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, bytes);
  }
  return { manifest: next, derived };
}

/**
 * Aggregate a list of station specs, persisting the manifest INCREMENTALLY after each station.
 *
 * WR-01 consistency: `aggregateStation` writes `derived/{station}.{hash}.json` as a side effect;
 * if we only wrote `manifest.json` once after the whole loop, a mid-loop throw (a corrupt
 * partition, a path error) would leave earlier stations' derived files on disk with the manifest
 * never updated — orphaned files the manifest does not reference. Writing the manifest after
 * EACH successful station (and once more in a `finally`) guarantees the manifest on disk always
 * references every derived file already written: a partial run stays internally consistent, and
 * the failure still propagates so the operator sees it.
 *
 * Returns the final manifest and the per-station qualifying-years counts (for stations.json).
 */
export function aggregateAll(
  root: string,
  manifestPath: string,
  specs: { type: StationType; id: number }[],
  initial: Manifest,
): { manifest: Manifest; qualifyingCounts: Map<number, number>; completed: number[] } {
  let manifest = initial;
  const qualifyingCounts = new Map<number, number>();
  const completed: number[] = [];
  try {
    for (const { type, id } of specs) {
      // WR-04: reuse the DerivedFile aggregateStation already encoded — decode it once instead
      // of re-reading + re-encoding every raw partition on the next line.
      const { manifest: nextManifest, derived } = aggregateStationWithDerived(
        root,
        id,
        type,
        manifest,
      );
      manifest = nextManifest;
      qualifyingCounts.set(id, countQualifyingYears(decodeDerived(derived)));
      completed.push(id);
      // Persist progress after every station so derived files never outrun the manifest.
      writeFileSync(manifestPath, serializeManifest(manifest));
    }
  } finally {
    // Belt-and-suspenders: flush once more so even a throw between the last write and here
    // leaves the manifest referencing every derived file written so far.
    writeFileSync(manifestPath, serializeManifest(manifest));
  }
  return { manifest, qualifyingCounts, completed };
}

/**
 * CLI entry: `npm run aggregate -- [stationSpec ...]` where each spec is `<aws|synop>:<id>`
 * (e.g. `aws:1350 synop:1`). With no args, every station present in the raw store is
 * aggregated; the type is inferred from a `<id>:<type>` sidecar convention is NOT assumed —
 * instead an explicit spec list is required to know each station's type (AWS omits r / SYNOP
 * omits dv). Registry StationMeta (for stations.json) is loaded lazily from @betravedur/fetch.
 */
export async function main(argv: string[]): Promise<void> {
  const root = DEFAULT_ROOT;
  const manifestPath = join(root, "manifest.json");
  let manifest = readManifest(manifestPath);

  // Parse `<aws|synop>:<id>` specs. Require explicit type per station so column omission
  // (AWS omits r, SYNOP omits dv) is correct.
  const specs: { type: StationType; id: number }[] = [];
  for (const arg of argv) {
    const [kind, idStr] = arg.split(":");
    const id = Number(idStr);
    if ((kind !== "aws" && kind !== "synop") || !Number.isInteger(id)) {
      throw new Error(`usage: aggregate <aws|synop>:<id> ... (bad spec "${arg}")`);
    }
    specs.push({ type: kind === "aws" ? "sj" : "sk", id });
  }
  if (specs.length === 0) {
    throw new Error(
      "aggregate requires explicit <aws|synop>:<id> specs so each station's type is known",
    );
  }

  // Aggregate each station; the manifest is persisted incrementally so a mid-loop failure
  // never orphans derived files (WR-01). A throw here propagates AFTER the manifest is flushed.
  const { manifest: finalManifest, qualifyingCounts } = aggregateAll(
    root,
    manifestPath,
    specs,
    manifest,
  );
  manifest = finalManifest;

  // Regenerate stations.json from the no-splice registry (fetched at the edge in Plan 03 style).
  const { fetchStations } = await import("@betravedur/fetch");
  const ids = specs.map((s) => s.id);
  const registry: StationMeta[] = await fetchStations(ids);
  const entries = buildStationsJson(registry, qualifyingCounts);

  writeFileSync(join(root, "stations.json"), serializeStationsJson(entries));

  const sizes = specs
    .map((s) => `${s.id}(${manifest.stations[s.id]?.hash ?? "—"})`)
    .join(", ");
  console.log(
    `[aggregate] ${specs.length} station(s) -> derived/ + manifest.json + stations.json; hashes: ${sizes}`,
  );
}

// Guarded CLI invocation (skipped when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
