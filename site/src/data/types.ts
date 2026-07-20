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
 * Coverage honesty (mirrors the domain contract, WR-01): when the station has fewer
 * than 3 qualifying years in-window, `sufficient` is false and `tempC` is null — the
 * renderer shows a muted "ófullnægjandi gögn" state, never 0/10.
 *
 * Edge states the renderer keys off:
 *  - `windVariable === true` (⇒ `windDir === null`)  → "breytileg átt" (no arrow).
 *  - `hasPrecip === false`                           → "án úrkomu" (omit precip glyph).
 *  - `sufficient === false` (⇒ `tempC === null`)     → muted "ófullnægjandi gögn".
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
  /** In-window scalar mean wind speed (m/s), or null when no usable speeds. */
  windSpeed: number | null;
  /** Circular-mean wind direction (deg, 0-360); null when variable/undefined. */
  windDir: number | null;
  /** True when direction is undefined or near-cancelling → "breytileg átt". */
  windVariable: boolean;
  /** Whether any precip was recorded in-window; false ⇒ "án úrkomu" (station still shown). */
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
