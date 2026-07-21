// Partitioned raw store: field-pruned, idempotent NDJSON keyed by (station, date).
//
// The on-disk source of truth the pipeline re-derives from without re-hitting the API
// (02-RESEARCH Pitfalls 3 & 6, DATA-07). Contracts:
//   - Persist ONLY the 10 DailyObservation fields (station,date,doy,t,tx,tn,f,fx,fg,dv,r).
//     No rh/pressure/radiation — an explicit field-by-field record build, never a spread,
//     keeps the raw store ~386 MB uncompressed instead of ~2 GB.
//   - Partition per station-year at raw/{station}/{year}.ndjson, one JSON object per line,
//     keys in a FIXED order, rows sorted by date -> re-serialization is byte-stable, so
//     re-running the same chunk yields a byte-identical file (idempotent upsert).
//   - Upsert by date: a new row for an existing date wins; no duplicate (station,date).
//   - A high-water mark (max partition year) drives resumable backfill.
//
// Node built-ins only (fs/path) — no npm deps; never bundled into the browser.
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DailyObservation } from "@betravedur/domain";

/** Default on-disk root for the raw store (the `data`-branch layout lives under here). */
export const DEFAULT_ROOT = "data";

/**
 * Resolve the pipeline store root from CLI argv (RESEARCH Pitfall 1: the relative `data`
 * DIR collides with the `data` BRANCH, so a run on `main` can silently write into the wrong
 * place). Precedence: an explicit `--root <dir>` arg > `env.PIPELINE_ROOT` > `DEFAULT_ROOT`.
 *
 * The `--root <dir>` pair is stripped from the returned `rest` so downstream spec/id parsing
 * (aggregate `<aws|synop>:<id>`, backfill `<kind> <id> [startYear]`) is unaffected. The
 * workflow runs `npm run backfill -- --root ./data-wt ...` so relative writes land in the
 * worktree, not the ambiguous `data` dir.
 */
export function resolveRoot(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): { root: string; rest: string[] } {
  const rest: string[] = [];
  let root: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--root") {
      const value = argv[i + 1];
      if (value === undefined) {
        throw new Error("usage: --root <dir> requires a directory value");
      }
      root = value;
      i += 1; // skip the value token too
      continue;
    }
    rest.push(argv[i]!);
  }
  return { root: root ?? env.PIPELINE_ROOT ?? DEFAULT_ROOT, rest };
}

/**
 * The 10 persisted keys, in FIXED serialization order. Building each record in this exact
 * order (rather than spreading arbitrary input) is what guarantees byte-stable NDJSON and
 * prunes every non-DailyObservation field the API might carry.
 */
const FIELD_ORDER = [
  "station",
  "date",
  "doy",
  "t",
  "tx",
  "tn",
  "f",
  "fx",
  "fg",
  "dv",
  "r",
] as const;

/**
 * Reject any station id that is not a non-negative integer BEFORE it is interpolated into a
 * filesystem path. `station` originates from API-derived `DailyObservation.station` and from
 * `Number(argv)` in the aggregate CLI; `Number(...)` happily yields negatives/fractions and
 * `String(station)` of such a value is not constrained to `[0-9]+`. Without this guard a
 * crafted or buggy id (e.g. `-1`, `1.5`, or a non-integer that stringifies with path
 * separators) could write outside the intended `raw/` subtree (CR-01, path traversal).
 */
export function assertStationId(station: number): void {
  if (!Number.isInteger(station) || station < 0) {
    throw new Error(`invalid station id: ${String(station)}`);
  }
}

/** Reject any year that is not a non-negative integer before path construction (CR-01). */
export function assertYear(year: number): void {
  if (!Number.isInteger(year) || year < 0) {
    throw new Error(`invalid year: ${String(year)}`);
  }
}

/** Absolute path to a station-year partition: {root}/raw/{station}/{year}.ndjson. */
export function partitionPath(root: string, station: number, year: number): string {
  assertStationId(station);
  assertYear(year);
  return join(root, "raw", String(station), `${year}.ndjson`);
}

/** Calendar year from a "YYYY-MM-DD" date string. */
function yearOf(date: string): number {
  return Number(date.slice(0, 4));
}

/**
 * Build the pruned 10-field record in fixed key order. Explicit and total: every key is
 * assigned from the typed source, so no extra input property can leak into the store and
 * the JSON serialization is deterministic byte-for-byte.
 */
function toRecord(o: DailyObservation): DailyObservation {
  return {
    station: o.station,
    date: o.date,
    doy: o.doy,
    t: o.t,
    tx: o.tx,
    tn: o.tn,
    f: o.f,
    fx: o.fx,
    fg: o.fg,
    dv: o.dv,
    r: o.r,
  };
}

/** Serialize one record with keys strictly in FIELD_ORDER (json key order is insertion order). */
function serializeLine(o: DailyObservation): string {
  return JSON.stringify(toRecord(o));
}

/**
 * Read a station-year partition back into DailyObservation[] (empty when absent).
 * Rows are returned in stored (date-sorted) order.
 */
export function readPartition(root: string, station: number, year: number): DailyObservation[] {
  assertStationId(station);
  assertYear(year);
  const path = partitionPath(root, station, year);
  if (!existsSync(path)) return [];
  const text = readFileSync(path, "utf8");
  const out: DailyObservation[] = [];
  let lineNo = 0;
  let skipped = 0;
  for (const line of text.split("\n")) {
    lineNo += 1;
    if (line.trim() === "") continue;
    // A truncated/partially-written partition (interrupted nightly write, disk-full, or a
    // hand-edited file on the `data` branch) must NOT abort the whole aggregate run with an
    // uncaught SyntaxError (WR-06). Skip the offending line with a diagnosable warning —
    // mirroring readManifest's graceful corruption handling — rather than crashing an
    // unrelated station's aggregation.
    try {
      out.push(JSON.parse(line) as DailyObservation);
    } catch {
      skipped += 1;
      console.warn(`[rawstore] skipping malformed line ${lineNo} in ${path}`);
    }
  }
  if (skipped > 0) {
    console.warn(`[rawstore] ${skipped} malformed line(s) skipped in ${path}`);
  }
  return out;
}

/**
 * Upsert rows into their station-year partitions, keyed by (station, date).
 * For each affected year: merge existing + new into a Map keyed by date (new value wins),
 * sort by date, and write back as fixed-order NDJSON. Re-running with identical rows yields
 * a byte-identical file — the store is idempotent.
 */
export function upsertPartition(root: string, station: number, rows: DailyObservation[]): void {
  // Validate the station id even on the empty-rows fast path, so an invalid id never slips
  // through just because there is nothing to write (CR-01).
  assertStationId(station);
  if (rows.length === 0) return;

  // Group incoming rows by calendar year so each partition is written once.
  const byYear = new Map<number, DailyObservation[]>();
  for (const row of rows) {
    const year = yearOf(row.date);
    const bucket = byYear.get(year);
    if (bucket) bucket.push(row);
    else byYear.set(year, [row]);
  }

  for (const [year, incoming] of byYear) {
    // Seed with existing rows, then apply upserts (new value wins on a duplicate date).
    const merged = new Map<string, DailyObservation>();
    for (const existing of readPartition(root, station, year)) {
      merged.set(existing.date, toRecord(existing));
    }
    for (const row of incoming) {
      merged.set(row.date, toRecord(row));
    }

    // Deterministic order: sort by date so re-serialization is byte-stable.
    const sorted = [...merged.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const body = sorted.map(serializeLine).join("\n") + "\n";

    const path = partitionPath(root, station, year);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body);
  }
}

/**
 * The highest calendar year with any data for a station, or null if the station has no
 * partitions. Drives resumable backfill: the next run starts at highWaterYear + 1, so a
 * re-run fetches only newer years.
 */
export function highWaterYear(root: string, station: number): number | null {
  assertStationId(station);
  const dir = join(root, "raw", String(station));
  if (!existsSync(dir)) return null;
  let max: number | null = null;
  for (const name of readdirSync(dir)) {
    const m = /^(\d{4})\.ndjson$/.exec(name);
    if (!m) continue;
    const year = Number(m[1]);
    if (max === null || year > max) max = year;
  }
  return max;
}
