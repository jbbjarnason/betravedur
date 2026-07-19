// Fetch station metadata from /stations and map into StationMeta[] (DATA-06).
import { writeFileSync } from "node:fs";
import type { StationMeta, StationType } from "@betravedur/domain";
import { BASE_URL, fetchWithRetry } from "./client.js";
import { buildRegistry, serializeRegistry } from "./registry.js";

interface RawStation {
  station?: unknown;
  name?: unknown;
  type?: unknown;
  owner?: unknown;
  lat?: unknown;
  lon?: unknown;
  ele?: unknown;
  start?: unknown;
  ending?: unknown;
  [k: string]: unknown;
}

const STATION_TYPES: readonly StationType[] = ["sj", "sk", "ur", "vf"];

function toStationType(v: unknown): StationType | null {
  return typeof v === "string" && (STATION_TYPES as readonly string[]).includes(v)
    ? (v as StationType)
    : null;
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * Map a raw /stations row into the canonical StationMeta, or null when the row
 * fails the trust boundary (WR-09) — we never fabricate identity/placement:
 *   - `station` must be a positive finite number (a defaulted 0 would silently
 *     collide every malformed row on one registry key);
 *   - `type` must be a known StationType (an unknown type defaulted to "sj"/AWS
 *     would mislabel e.g. a "ur" precip-only station and its structural nulls);
 *   - `lat`/`lon` must be finite (a defaulted 0/0 places the station in the
 *     Gulf of Guinea instead of failing).
 * `ending` is coerced to `number | null` (null = still active); relocations/closures
 * are preserved on the record, never spliced away.
 */
export function toStationMeta(raw: unknown): StationMeta | null {
  const s = (raw ?? {}) as RawStation;
  const station = typeof s.station === "number" && Number.isFinite(s.station) ? s.station : null;
  const type = toStationType(s.type);
  const lat = typeof s.lat === "number" && Number.isFinite(s.lat) ? s.lat : null;
  const lon = typeof s.lon === "number" && Number.isFinite(s.lon) ? s.lon : null;
  if (station === null || station <= 0 || type === null || lat === null || lon === null) {
    return null;
  }
  return {
    station,
    name: str(s.name),
    type,
    owner: str(s.owner),
    lat,
    lon,
    ele: num(s.ele),
    start: num(s.start),
    ending: typeof s.ending === "number" && Number.isFinite(s.ending) ? s.ending : null,
  };
}

/**
 * Parse a raw /stations response body (WR-08) — same trust-boundary posture as
 * observations.ts rather than a bare `rows.map`:
 *   - `{detail}` (bad request envelope) -> throws API_BAD_REQUEST;
 *   - `{message}` (no-data envelope) -> [] (legitimate empty result);
 *   - any other non-array body -> throws SCHEMA_DRIFT;
 *   - rows failing toStationMeta are dropped with a counted warning, never
 *     fabricated (WR-09).
 */
export function parseStationsBody(body: unknown): StationMeta[] {
  if (typeof body === "object" && body !== null && !Array.isArray(body)) {
    if ("detail" in body) {
      throw new Error(
        `API_BAD_REQUEST (stations): ${JSON.stringify((body as { detail: unknown }).detail)}`,
      );
    }
    if ("message" in body) return [];
    throw new Error(
      `SCHEMA_DRIFT: expected an array of station rows, got object with keys ${Object.keys(body).join(",")}`,
    );
  }
  if (!Array.isArray(body)) {
    throw new Error(`SCHEMA_DRIFT: expected an array of station rows, got ${typeof body}`);
  }
  const out: StationMeta[] = [];
  let dropped = 0;
  for (const raw of body) {
    const meta = toStationMeta(raw);
    if (meta === null) {
      dropped++;
      continue;
    }
    out.push(meta);
  }
  if (dropped > 0) {
    console.warn(
      `[fetch:stations] dropped ${dropped} invalid station row(s) ` +
        `(non-positive/non-numeric station, unknown type, or non-finite lat/lon)`,
    );
  }
  return out;
}

/** Fetch station metadata for the given station IDs. */
export async function fetchStations(stationIds: number[]): Promise<StationMeta[]> {
  const qs = new URLSearchParams();
  for (const id of stationIds) qs.append("station_id", String(id));
  const res = await fetchWithRetry(`${BASE_URL}/stations?${qs}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`stations ${res.status}: ${body}`);
  }
  const body = (await res.json()) as unknown;
  return parseStationsBody(body);
}

/**
 * Build the no-splice registry from stations and write the deterministic, ID-sorted
 * stations.json artifact to `path`. Pipeline-only helper — never called in tests.
 */
export function writeRegistry(stations: StationMeta[], path: string): void {
  writeFileSync(path, serializeRegistry(buildRegistry(stations)), "utf8");
}
