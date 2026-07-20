// The client-side data contracts for the map layer.
//
// `MarkerDatum` is the single contract Plan 03's renderer consumes: everything the
// white-pill callout needs (temp, wind speed + direction/variable flag, precip
// presence, coverage gate) for one station in the selected period. Keeping it here —
// separate from the fetch/decode/average implementation — lets Plan 03 depend on the
// shape without pulling the transform, and lets a Phase-4 period selector re-drive the
// same producer against a different window.
import type { WindowSpec } from "@betravedur/domain";

/**
 * Everything the map needs to draw one station's marker for the selected period.
 *
 * Coverage honesty (mirrors the domain contract, WR-01/WR-02): the SAME qualifying-
 * years / N≥3 gate governs EVERY displayed metric, not just temperature. When the
 * station has fewer than 3 qualifying years in-window, `sufficient` is false and
 * ALL metric fields collapse to the muted state — `tempC` and `windSpeed` are null,
 * `windVariable` is true (so `windDir` is null), `hasPrecip` is false — so the
 * renderer shows a single muted "ófullnægjandi gögn" callout, never a confident wind
 * arrow / speed / precip drop drawn from data too thin to vouch for. When sufficient,
 * every metric is computed from the qualifying-year in-window rows only (equal weight
 * per year — see `meanPerYearThenAverage`), never pooled across non-qualifying years.
 *
 * Edge states the renderer keys off (only reachable when `sufficient === true`):
 *  - `windVariable === true` (⇒ `windDir === null`)  → "breytileg átt" (no arrow).
 *  - `hasPrecip === false`                           → "án úrkomu" (omit precip glyph).
 *  - `sufficient === false` (⇒ ALL metrics null/false) → muted "ófullnægjandi gögn".
 */
export interface MarkerDatum {
  /** Integer station id. */
  station: number;
  /** Display name (from stations.json). */
  name: string;
  /** Longitude (deg). */
  lon: number;
  /** Latitude (deg). */
  lat: number;
  /** In-window mean temperature (°C), or null when coverage is insufficient. */
  tempC: number | null;
  /** Qualifying-years mean wind speed (m/s), or null when insufficient/no usable speeds. */
  windSpeed: number | null;
  /** Circular-mean wind direction (deg, 0-360); null when variable/undefined/insufficient. */
  windDir: number | null;
  /** True when direction is undefined, near-cancelling, or coverage insufficient → "breytileg átt". */
  windVariable: boolean;
  /** Whether any precip was recorded in qualifying-year in-window rows; false ⇒ "án úrkomu". */
  hasPrecip: boolean;
  /** Effective N: qualifying years actually used (never the picker span). */
  n: number;
  /** True when n >= 3 (the domain display gate). */
  sufficient: boolean;
  /**
   * Stable collision sort key for the map symbol layer (lower = higher priority,
   * wins collisions). Consumed by Plan 03's `symbol-sort-key`.
   */
  priority: number;
}

/**
 * The fixed default period used until Phase 4 adds the selector (RESEARCH A5).
 * A representative summer window (≈ week 30, doy 197–210, non-wrapping so
 * season-year grouping is trivial). Phase 4 replaces THIS single source without
 * re-architecting the producer.
 */
export const DEFAULT_WINDOW: WindowSpec = { startDoy: 197, endDoy: 210 };
