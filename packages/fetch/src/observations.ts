// Fetch daily observations (AWS + SYNOP) and normalize into DailyObservation[].
// Thin skeleton normalizer — full schema-assert / value-clamping lands in Plan 03 (DATA-01).
import type { DailyObservation } from "@betravedur/domain";
import { leapFoldedDoy } from "@betravedur/domain";
import { BASE_URL, fetchWithRetry } from "./client.js";

/** Raw day row as returned by the API (superset; fields vary AWS vs SYNOP). */
interface RawDayRow {
  station: number;
  name?: string;
  time: string;
  t?: number | null;
  tx?: number | null;
  tn?: number | null;
  f?: number | null;
  fx?: number | null;
  fg?: number | null;
  dv?: number | null;
  r?: number | null;
  [k: string]: unknown;
}

function buildQuery(stationIds: number[], from: string, to: string): URLSearchParams {
  const qs = new URLSearchParams({
    day_from: from,
    day_to: to,
    parameters: "basic",
    format: "json",
  });
  for (const id of stationIds) qs.append("station_id", String(id));
  return qs;
}

function toNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Compute leap-folded day-of-year, tolerating the Plan-02 stub.
 * The domain `leapFoldedDoy` throws NOT_IMPLEMENTED until Plan 02 lands the math;
 * the skeleton normalizer must not crash on that — it falls back to doy=0 so real
 * rows still reach the domain boundary. Full doy population arrives with Plan 02/03.
 */
function safeDoy(date: string): number {
  try {
    return leapFoldedDoy(date) ?? 0;
  } catch (err) {
    if (err instanceof Error && err.message === "NOT_IMPLEMENTED") return 0;
    throw err;
  }
}

/**
 * Normalize a raw day row into DailyObservation.
 * `keepDv`/`keepR` encode the structural network split: AWS has dv but r=null;
 * SYNOP has r but no dv. We force the absent field to null explicitly.
 */
function normalize(raw: RawDayRow, keepDv: boolean, keepR: boolean): DailyObservation {
  return {
    station: raw.station,
    date: raw.time,
    doy: safeDoy(raw.time),
    t: toNum(raw.t),
    tx: toNum(raw.tx),
    tn: toNum(raw.tn),
    f: toNum(raw.f),
    fx: toNum(raw.fx),
    fg: toNum(raw.fg),
    dv: keepDv ? toNum(raw.dv) : null,
    r: keepR ? toNum(raw.r) : null,
  };
}

/** Fetch AWS daily observations (type sj): dv present, r structurally null. */
export async function fetchAwsDay(
  stationIds: number[],
  from: string,
  to: string,
): Promise<DailyObservation[]> {
  const qs = buildQuery(stationIds, from, to);
  const res = await fetchWithRetry(`${BASE_URL}/observations/aws/day?${qs}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`aws/day ${res.status}: ${body}`);
  }
  const rows = (await res.json()) as RawDayRow[];
  return rows.map((r) => normalize(r, /*keepDv*/ true, /*keepR*/ false));
}

/** Fetch SYNOP daily observations (type sk): r present, dv structurally absent. */
export async function fetchSynopDay(
  stationIds: number[],
  from: string,
  to: string,
): Promise<DailyObservation[]> {
  const qs = buildQuery(stationIds, from, to);
  const res = await fetchWithRetry(`${BASE_URL}/observations/synop/day?${qs}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`synop/day ${res.status}: ${body}`);
  }
  const rows = (await res.json()) as RawDayRow[];
  return rows.map((r) => normalize(r, /*keepDv*/ false, /*keepR*/ true));
}
