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
import { dirname, join } from "node:path";
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
import { readPartition, highWaterYear, DEFAULT_ROOT } from "./rawstore.js";
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
 * Count qualifying years (>=3 gate feeds this) for a station over a REPRESENTATIVE window,
 * from decoded derived rows. The stations.json filter needs a qualifying-years count; we use a
 * full-summer window (the widest reliably-covered season) grouped by season-year so the count
 * reflects real data depth, not `start`. Temperature is the always-present metric (AWS + SYNOP).
 */
function countQualifyingYears(rows: DailyObservation[]): number {
  // A broad mid-year window: doy 152..243 (~Jun 1..Aug 31 in the leap-folded calendar).
  const spec: WindowSpec = { startDoy: 152, endDoy: 243 };
  const windowDays = expandWindow(spec);
  const bySeason = groupBySeasonYear(rows, spec);
  const qy = qualifyingYears(bySeason, windowDays, (o) => o.t);
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
  const rows = readAllRaw(root, station);
  const derived = encodeDerived(rows, type);
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
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, bytes);
  }
  return next;
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

  // Aggregate each station; collect qualifying-years counts for the stations.json filter.
  const qualifyingCounts = new Map<number, number>();
  for (const { type, id } of specs) {
    manifest = aggregateStation(root, id, type, manifest);
    const decoded = decodeDerived(encodeDerived(readAllRaw(root, id), type));
    qualifyingCounts.set(id, countQualifyingYears(decoded));
  }

  // Regenerate stations.json from the no-splice registry (fetched at the edge in Plan 03 style).
  const { fetchStations } = await import("@betravedur/fetch");
  const ids = specs.map((s) => s.id);
  const registry: StationMeta[] = await fetchStations(ids);
  const entries = buildStationsJson(registry, qualifyingCounts);

  writeFileSync(manifestPath, serializeManifest(manifest));
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
