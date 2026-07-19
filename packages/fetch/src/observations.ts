// Fetch daily observations (AWS + SYNOP) and normalize into DailyObservation[].
//
// This is the trust boundary where untrusted upstream JSON enters the system
// (DATA-01 / Security Domain V5). The pipeline:
//   1. fetch with retry/backoff (client.ts)
//   2. detect API error bodies ({message} = no-data -> [], {detail} = bad-request -> throw)
//   3. assertObservationSchema: verify the expected field set is present, else throw SCHEMA_DRIFT
//   4. normalize each row into DailyObservation: time->date, leap-folded doy (drop Feb 29),
//      structural AWS/SYNOP null split (AWS r=null, SYNOP dv=null), clamp implausible values
import type { DailyObservation } from "@betravedur/domain";
import { leapFoldedDoy } from "@betravedur/domain";
import { BASE_URL, fetchWithRetry } from "./client.js";

/** The two daily-observation endpoints have structurally different field sets. */
export type ObservationKind = "aws" | "synop";

/** API schema version verified during research; drift only warns (never throws). */
const EXPECTED_API_VERSION = "2026-02-17";

/** Plausible physical ranges — values outside are treated as sensor error (nulled). */
const TEMP_MIN = -60;
const TEMP_MAX = 45;
const WIND_MIN = 0;
const WIND_MAX = 120;

/** Raw day row as returned by the API (superset; fields vary AWS vs SYNOP). */
interface RawDayRow {
  station?: unknown;
  name?: unknown;
  time?: unknown;
  t?: unknown;
  tx?: unknown;
  tn?: unknown;
  f?: unknown;
  fx?: unknown;
  fg?: unknown;
  dv?: unknown;
  r?: unknown;
  [k: string]: unknown;
}

/** The minimum field set each endpoint must supply for a row to be trusted. */
const EXPECTED_FIELDS: Record<ObservationKind, readonly string[]> = {
  // AWS: temp + wind speed + wind direction, precip structurally null.
  aws: ["station", "time", "t", "f", "dv", "r"],
  // SYNOP: temp + wind speed + precip, wind direction absent.
  synop: ["station", "time", "t", "f", "r"],
};

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

/** Coerce to a finite number or null (rejects strings, NaN, Infinity). */
function toNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Clamp to a plausible range: out-of-range or non-finite -> null. */
function clampRange(v: unknown, min: number, max: number): number | null {
  const n = toNum(v);
  if (n === null) return null;
  return n >= min && n <= max ? n : null;
}

/** Wind direction: valid on [0, 360); anything else -> null. */
function clampDir(v: unknown): number | null {
  const n = toNum(v);
  if (n === null) return null;
  return n >= 0 && n < 360 ? n : null;
}

/** Precipitation: non-negative only; negative -> null (never coerced to 0). */
function clampPrecip(v: unknown): number | null {
  const n = toNum(v);
  if (n === null) return null;
  return n >= 0 ? n : null;
}

/** True when the body is an API error envelope rather than a rows array. */
function isErrorBody(body: unknown): body is { message?: string; detail?: unknown } {
  return (
    typeof body === "object" &&
    body !== null &&
    !Array.isArray(body) &&
    ("message" in body || "detail" in body)
  );
}

/**
 * Verify each row carries the expected field set for its endpoint kind.
 * Throws `SCHEMA_DRIFT` on the first row that is missing a required key —
 * fail loudly rather than silently normalizing garbage (Security Domain V5, T-01-09).
 */
export function assertObservationSchema(rows: RawDayRow[], kind: ObservationKind): void {
  if (!Array.isArray(rows)) {
    throw new Error(`SCHEMA_DRIFT: expected an array of ${kind} rows, got ${typeof rows}`);
  }
  const required = EXPECTED_FIELDS[kind];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) {
      throw new Error(`SCHEMA_DRIFT: ${kind} row is not an object`);
    }
    for (const field of required) {
      if (!(field in row)) {
        throw new Error(
          `SCHEMA_DRIFT: ${kind} row missing expected field "${field}" ` +
            `(present: ${Object.keys(row).join(",")})`,
        );
      }
    }
    // Key presence is not enough for the row's identity (WR-05): a string or
    // null station would otherwise be silently attributed to a fabricated ID.
    if (typeof row.station !== "number" || !Number.isFinite(row.station)) {
      throw new Error(
        `SCHEMA_DRIFT: ${kind} row "station" is not a finite number ` +
          `(got ${typeof row.station}: ${JSON.stringify(row.station)})`,
      );
    }
  }
}

/**
 * Normalize raw rows into DailyObservation[].
 * - `time` -> `date`; `doy = leapFoldedDoy(date)`; DROP the row if doy is null (Feb 29).
 * - Structural split: AWS keeps dv / forces r=null; SYNOP keeps r / forces dv=null.
 * - Clamp implausible temp/wind/dir/precip to null before domain math sees them (T-01-10).
 * Assumes the schema has already been asserted (callers use parseObservationBody).
 */
export function normalizeObservations(
  rows: RawDayRow[],
  kind: ObservationKind,
): DailyObservation[] {
  const keepDv = kind === "aws";
  const keepR = kind === "synop";
  const out: DailyObservation[] = [];
  for (const raw of rows) {
    const date = typeof raw.time === "string" ? raw.time : "";
    const doy = date ? leapFoldedDoy(date) : null;
    // Defensive contract guard (WR-04): treat NaN / out-of-range like null so a
    // malformed date can never ship a row violating DailyObservation.doy (1-365).
    if (doy === null || !Number.isInteger(doy) || doy < 1 || doy > 365) {
      continue; // Feb 29 folded out, or unparseable date dropped
    }
    // Never fabricate a station identity (WR-05): a non-numeric station would
    // merge unrelated rows under a fake ID 0 — the exact splicing failure the
    // registry exists to prevent. assertObservationSchema throws before this
    // in the parse path; direct callers get the row skipped.
    const station = toNum(raw.station);
    if (station === null) continue;
    out.push({
      station,
      date,
      doy,
      t: clampRange(raw.t, TEMP_MIN, TEMP_MAX),
      tx: clampRange(raw.tx, TEMP_MIN, TEMP_MAX),
      tn: clampRange(raw.tn, TEMP_MIN, TEMP_MAX),
      f: clampRange(raw.f, WIND_MIN, WIND_MAX),
      fx: clampRange(raw.fx, WIND_MIN, WIND_MAX),
      fg: clampRange(raw.fg, WIND_MIN, WIND_MAX),
      dv: keepDv ? clampDir(raw.dv) : null,
      r: keepR ? clampPrecip(raw.r) : null,
    });
  }
  return out;
}

/**
 * Parse a raw response body into normalized observations.
 * - `{message}` (404 no-data) -> `[]` (empty result, not an error).
 * - `{detail}` (422 bad-request) -> throws (a real client error).
 * - Otherwise schema-assert then normalize; SCHEMA_DRIFT throws on a malformed array.
 */
export function parseObservationBody(
  body: unknown,
  kind: ObservationKind,
): DailyObservation[] {
  if (isErrorBody(body)) {
    if ("detail" in body) {
      throw new Error(`API_BAD_REQUEST (${kind}): ${JSON.stringify(body.detail)}`);
    }
    // {message: "No data found." / "Station/s not found."} — a legitimate empty result.
    return [];
  }
  const rows = body as RawDayRow[];
  assertObservationSchema(rows, kind);
  return normalizeObservations(rows, kind);
}

/** Warn (never throw) when the API schema version drifts from the researched pin. */
function checkApiVersion(res: Response, kind: ObservationKind): void {
  const version = res.headers.get("x-vi-api-version");
  if (version && version !== EXPECTED_API_VERSION) {
    console.warn(
      `[fetch:${kind}] x-vi-api-version drift: got "${version}", expected "${EXPECTED_API_VERSION}" — ` +
        `field set may have changed; SCHEMA_DRIFT guards remain in force.`,
    );
  }
}

async function fetchDay(
  path: string,
  kind: ObservationKind,
  stationIds: number[],
  from: string,
  to: string,
): Promise<DailyObservation[]> {
  const qs = buildQuery(stationIds, from, to);
  const res = await fetchWithRetry(`${BASE_URL}/${path}?${qs}`);
  checkApiVersion(res, kind);
  // 404 "no data" bodies are parsed (yield []); other non-ok statuses surface here.
  if (!res.ok && res.status !== 404) {
    const errBody = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
    return parseObservationBody(errBody, kind); // 422 {detail} -> throws inside
  }
  const body = (await res.json()) as unknown;
  return parseObservationBody(body, kind);
}

/** Fetch AWS daily observations (type sj): dv present, r structurally null. */
export function fetchAwsDay(
  stationIds: number[],
  from: string,
  to: string,
): Promise<DailyObservation[]> {
  return fetchDay("observations/aws/day", "aws", stationIds, from, to);
}

/** Fetch SYNOP daily observations (type sk): r present, dv structurally absent. */
export function fetchSynopDay(
  stationIds: number[],
  from: string,
  to: string,
): Promise<DailyObservation[]> {
  return fetchDay("observations/synop/day", "synop", stationIds, from, to);
}
