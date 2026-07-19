// @betravedur/domain — contract types.
// Concrete field names come from the live api.vedur.is cheat-sheet (RESEARCH 2026-07-19).
// This module is pure data: zero runtime dependencies, browser-safe.

/**
 * A single day's observation for one station, normalized from the API.
 * `r` (precip) is null on AWS stations; `dv` (wind dir) is null on SYNOP stations.
 * All measurement fields are `number | null` because the API uses null for both
 * "sensor absent" and "value missing" — both are treated as missing downstream.
 */
export interface DailyObservation {
  /** Integer station ID (never merged/spliced across IDs). */
  station: number;
  /** Observation date, "YYYY-MM-DD". */
  date: string;
  /** Leap-folded day-of-year (1-365, Feb 29 excluded). */
  doy: number;
  /** Mean temperature (°C). */
  t: number | null;
  /** Max temperature (°C). */
  tx: number | null;
  /** Min temperature (°C). */
  tn: number | null;
  /** Mean wind speed (m/s). */
  f: number | null;
  /** Max wind speed (m/s). */
  fx: number | null;
  /** Wind gust (m/s). */
  fg: number | null;
  /** Wind direction (degrees, 0-360). Null on SYNOP. */
  dv: number | null;
  /** Precipitation (mm). Null on AWS. Missing is never coerced to zero. */
  r: number | null;
}

/** Station type codes from the API: sj=AWS, sk=SYNOP, ur=precip-only, vf=climate. */
export type StationType = "sj" | "sk" | "ur" | "vf";

/**
 * Station registry entry. Keyed on integer `station` ID with active-date windows.
 * Decommissioned stations (`ending != null`) are retained for historical windows.
 */
export interface StationMeta {
  station: number;
  name: string;
  type: StationType;
  owner: string;
  lat: number;
  lon: number;
  /** Elevation (m). */
  ele: number;
  /** First year of record (a year; actual daily data may begin later). */
  start: number;
  /** Last year of record, or null if still active. */
  ending: number | null;
}

/**
 * A time-of-year window, inclusive, expressed as leap-folded day-of-year indices.
 * May wrap the year end (endDoy < startDoy).
 */
export interface WindowSpec {
  startDoy: number;
  endDoy: number;
}

/** The three scorable weather components. */
export type Component = "temp" | "rain" | "wind";

/** Per-component 0-10 scores; null when the component is unavailable for a station. */
export interface ComponentScores {
  temp: number | null;
  rain: number | null;
  wind: number | null;
}

/**
 * Combined weather score, renormalized over the components that contributed.
 * `missingRain` drives the "án úrkomu" badge shown wherever the score appears.
 */
export interface CombinedScore {
  /** 0-10, renormalized over `contributing`. */
  score: number;
  /** Which components actually contributed to `score`. */
  contributing: Component[];
  /** True when rain was not available (AWS stations) — drives the badge. */
  missingRain: boolean;
}

/**
 * A coverage-honest window average for a single metric.
 * `sufficient` is true when `n >= 3` qualifying years.
 */
export interface WindowAverage {
  metric: string;
  value: number | null;
  n: number;
  sufficient: boolean;
}
