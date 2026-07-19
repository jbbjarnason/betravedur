// Fetch station metadata from /stations and map into StationMeta[].
// Thin skeleton — the committed stations.json registry writer lands in Plan 03 (DATA-06).
import type { StationMeta, StationType } from "@betravedur/domain";
import { BASE_URL, fetchWithRetry } from "./client.js";

interface RawStation {
  station: number;
  name: string;
  type: string;
  owner: string;
  lat: number;
  lon: number;
  ele: number;
  start: number;
  ending: number | null;
  [k: string]: unknown;
}

const STATION_TYPES: readonly StationType[] = ["sj", "sk", "ur", "vf"];

function toStationType(v: string): StationType {
  return (STATION_TYPES as readonly string[]).includes(v) ? (v as StationType) : "sj";
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
  const rows = (await res.json()) as RawStation[];
  return rows.map((s) => ({
    station: s.station,
    name: s.name,
    type: toStationType(s.type),
    owner: s.owner,
    lat: s.lat,
    lon: s.lon,
    ele: s.ele,
    start: s.start,
    ending: s.ending,
  }));
}
