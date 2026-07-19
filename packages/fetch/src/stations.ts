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

function toStationType(v: unknown): StationType {
  return typeof v === "string" && (STATION_TYPES as readonly string[]).includes(v)
    ? (v as StationType)
    : "sj";
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * Map a raw /stations row into the canonical StationMeta.
 * `ending` is coerced to `number | null` (null = still active); relocations/closures
 * are preserved on the record, never spliced away.
 */
export function toStationMeta(raw: unknown): StationMeta {
  const s = (raw ?? {}) as RawStation;
  return {
    station: num(s.station),
    name: str(s.name),
    type: toStationType(s.type),
    owner: str(s.owner),
    lat: num(s.lat),
    lon: num(s.lon),
    ele: num(s.ele),
    start: num(s.start),
    ending: typeof s.ending === "number" && Number.isFinite(s.ending) ? s.ending : null,
  };
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
  const rows = (await res.json()) as unknown[];
  return rows.map(toStationMeta);
}

/**
 * Build the no-splice registry from stations and write the deterministic, ID-sorted
 * stations.json artifact to `path`. Pipeline-only helper — never called in tests.
 */
export function writeRegistry(stations: StationMeta[], path: string): void {
  writeFileSync(path, serializeRegistry(buildRegistry(stations)), "utf8");
}
