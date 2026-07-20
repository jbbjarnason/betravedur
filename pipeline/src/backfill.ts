// Resumable, chunked, paced backfill runner for api.vedur.is daily observations.
//
// Encodes the live-measured API reality (02-RESEARCH, 2026-07-19):
//   - Chunk a station oldest->newest in <=5 station-year spans (~1826 rows, the reliable zone).
//   - Pace sequentially at PACE_MS (>=250ms gap, <=4 req/s). NEVER burst-parallelize (503 throttle).
//   - On 413 (size ceiling) OR a surviving 502 (flaky gateway): halve the span and recurse
//     (depth-bounded); at the single-year floor, give up and rethrow.
//   - On 404 no-data: Phase-1 fetch already yields [] — return it, advance the cursor.
//   - On persistent 503: propagate as an error — a throttle is NOT an empty result.
//
// The testable logic (fetchChunk / backfillStation) takes injected dependencies so the
// error taxonomy, pacing, and high-water resume can be proven offline with mocked fetches.
import type { DailyObservation } from "@betravedur/domain";
import { ApiHttpError, fetchAwsDay, fetchSynopDay } from "@betravedur/fetch";

/** Sequential pacing floor: <=4 req/s (measured reliable across 16 consecutive chunks). */
export const PACE_MS = 250;

/** Backfill one station in steps of this many years (<=5 station-years is the reliable zone). */
export const CHUNK_YEARS = 5;

/** Max halving depth: 5yr -> 2-3yr -> 1yr; give up a single year after depth 3. */
const MAX_HALVE_DEPTH = 3;

export type ObservationKind = "aws" | "synop";

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((res) => setTimeout(res, ms));

/** Fetch functions injected so tests never hit the network. */
export interface FetchDeps {
  fetchAws: (ids: number[], from: string, to: string) => Promise<DailyObservation[]>;
  fetchSynop: (ids: number[], from: string, to: string) => Promise<DailyObservation[]>;
  sleep?: (ms: number) => Promise<void>;
}

/** Store + fetch deps for a full station backfill (resume reads the high-water mark). */
export interface BackfillDeps extends FetchDeps {
  upsertPartition: (station: number, rows: DailyObservation[]) => void;
  highWaterYear: (station: number) => number | null;
  nowYear?: number;
}

/** True for the deterministic size rejection (413) or a surviving flaky-gateway 502. */
function isHalveable(err: unknown): boolean {
  return err instanceof ApiHttpError && (err.status === 413 || err.status === 502);
}

/**
 * Fetch a [y0, y1] span for one station, halving on 413/502 down to single years.
 * - 404 no-data surfaces from Phase-1 fetch as [] and is returned as-is (not an error).
 * - 503 (throttle) and any non-halveable error propagate — a 503 must NEVER become [].
 * - On a halveable error with y1 > y0 and depth budget left: split, pace, recurse, concat.
 *   The two halves cover disjoint year ranges, so the merged result never duplicates a date.
 */
export async function fetchChunk(
  kind: ObservationKind,
  id: number,
  y0: number,
  y1: number,
  deps: FetchDeps,
  depth = 0,
): Promise<DailyObservation[]> {
  const sleep = deps.sleep ?? defaultSleep;
  const fn = kind === "aws" ? deps.fetchAws : deps.fetchSynop;
  const from = `${y0}-01-01`;
  const to = `${y1}-12-31`;
  try {
    // Phase-1 fetch: 404 -> [] (no-data), 422 -> throw, 5xx retried then ApiHttpError.
    return await fn([id], from, to);
  } catch (err) {
    // Only 413 / surviving-502 are halveable, and only while the span is splittable.
    if (isHalveable(err) && y1 > y0 && depth < MAX_HALVE_DEPTH) {
      const mid = Math.floor((y0 + y1) / 2);
      await sleep(PACE_MS);
      const a = await fetchChunk(kind, id, y0, mid, deps, depth + 1);
      await sleep(PACE_MS);
      const b = await fetchChunk(kind, id, mid + 1, y1, deps, depth + 1);
      return [...a, ...b];
    }
    // 503, exhausted-at-floor 413/502, 422, network — all propagate. Never [].
    throw err;
  }
}

/**
 * Walk a station oldest->newest in CHUNK_YEARS steps, upserting each chunk and pacing between.
 *
 * Resume contract (the highWaterYear->startYear handoff): when `startYear` is undefined,
 * read the per-station high-water mark from the raw store and resume from `highWater + 1`
 * so a re-run fetches ONLY newer years. When the store is already current (high-water ==
 * current year), the loop performs no fetch at all.
 *
 * Returns the STORE-DERIVED high-water year — the last calendar year that actually has data
 * on disk (`deps.highWaterYear(id)` after the loop), NOT `yEnd` (the last year *attempted*).
 * When the newest chunk 404s (a normal no-data case per PIPELINE.md §2), `upsertPartition([])`
 * writes nothing, so no partition exists for those trailing years; returning the attempted
 * `yEnd` would overstate the on-disk high-water and diverge from what a resume reads (WR-02).
 * Falls back to the last attempted year only when the store has no partitions at all.
 */
export async function backfillStation(
  kind: ObservationKind,
  id: number,
  startYear: number | undefined,
  deps: BackfillDeps,
): Promise<number> {
  const sleep = deps.sleep ?? defaultSleep;
  const nowYear = deps.nowYear ?? new Date().getUTCFullYear();

  // Resume: derive the start year from the on-disk high-water mark when not given.
  let y0: number;
  if (typeof startYear === "number") {
    y0 = startYear;
  } else {
    const hw = deps.highWaterYear(id);
    y0 = hw === null ? nowYear : hw + 1;
  }

  let lastAttempted = y0 - 1;
  for (let y = y0; y <= nowYear; y += CHUNK_YEARS) {
    const yEnd = Math.min(y + CHUNK_YEARS - 1, nowYear);
    const rows = await fetchChunk(kind, id, y, yEnd, deps);
    deps.upsertPartition(id, rows);
    lastAttempted = yEnd;
    await sleep(PACE_MS);
  }
  // Return the store's ACTUAL high-water (last year with data on disk), not the last year
  // attempted — trailing 404 years write no partition, so `lastAttempted` would overstate it
  // and disagree with a resume that re-reads the store (WR-02). Fall back to `lastAttempted`
  // only when the store is entirely empty (no partitions at all).
  const storeHw = deps.highWaterYear(id);
  return storeHw ?? lastAttempted;
}

/**
 * CLI entry: `npm run backfill -- <aws|synop> <stationId> [startYear]`.
 * Thin wrapper — wires the real fetchers + raw store and defers resume to the store's
 * high-water mark when startYear is omitted. Kept out of the tested code path.
 */
export async function main(argv: string[]): Promise<void> {
  const [kindArg, idArg, startArg] = argv;
  if (kindArg !== "aws" && kindArg !== "synop") {
    throw new Error(`usage: backfill <aws|synop> <stationId> [startYear] (got kind "${kindArg}")`);
  }
  const id = Number(idArg);
  if (!Number.isInteger(id)) {
    throw new Error(`usage: backfill <aws|synop> <stationId> [startYear] (bad stationId "${idArg}")`);
  }
  const startYear = startArg !== undefined ? Number(startArg) : undefined;

  const { upsertPartition, highWaterYear, DEFAULT_ROOT } = await import("./rawstore.js");
  const hw = await backfillStation(kindArg, id, startYear, {
    fetchAws: fetchAwsDay,
    fetchSynop: fetchSynopDay,
    upsertPartition: (station, rows) => upsertPartition(DEFAULT_ROOT, station, rows),
    highWaterYear: (station) => highWaterYear(DEFAULT_ROOT, station),
  });
  console.log(`[backfill:${kindArg}] station ${id} complete; high-water year = ${hw}`);
}

// Guarded CLI invocation (skipped when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
