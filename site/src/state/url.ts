// Loop-proof state ↔ URL round-trip with defensive clamp (UX-02, ASVS V5 / threat T-04-05).
//
// PARAM SCHEME (Claude's discretion, RESEARCH Pattern 2 — documented here as the contract):
//   doy   day-of-year window anchor,      integer 1..365
//   w     window width in days,           one of {7,14,21,30}
//   fra   baseline range lower bound,     integer within [bounds.min, bounds.max]
//   til   baseline range upper bound,     integer within [bounds.min, bounds.max], fra ≤ til
//   st    selected station id,            integer — OMITTED entirely when stationId === null
//   v     viewport, one compact param     "lat,lng,zoom" = toFixed(4),toFixed(4),toFixed(2)
//
// LOOP-PROOF DISCIPLINE (RESEARCH Pattern 2, CITED MDN): stateToParams is called on EVERY
// store change (the writer); paramsToState is read ONLY at boot and on popstate. There is no
// isUpdating flag — pushState/replaceState do not fire popstate, so a URL write can never
// re-trigger a URL read. This module is pure (no history/DOM access); main.ts owns the wiring.
//
// DEFENSIVE PARSE (T-04-05): paramsToState NEVER throws and NEVER lets NaN/out-of-range reach
// the store. Every field is coerced with Number and validated; a garbage param falls back to
// the corresponding `fallback` value or a clamped safe value. No URL-derived string is ever
// reflected into the DOM (T-04-06) — `st` is parsed to an integer, labels come from
// stations.json, not the URL.
import type { SelectionState } from "./store.js";
import type { YearBounds } from "./defaults.js";

/** Allowed window widths (SEL-01). A garbage `w` snaps to the nearest of these. */
const ALLOWED_WIDTHS = [7, 14, 21, 30] as const;

/** Iceland viewport clamp bounds (mirrors map/init.ts maxBounds + min/max zoom). */
const LNG_MIN = -26;
const LNG_MAX = -12;
const LAT_MIN = 62.5;
const LAT_MAX = 67.5;
const ZOOM_MIN = 4;
const ZOOM_MAX = 12;

/** Clamp a number into [lo, hi]. */
function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

/** Snap an arbitrary width to the nearest allowed value; garbage → the default (7). */
function snapWidth(w: number, fallback: number): number {
  if (!Number.isFinite(w)) return fallback;
  let best = ALLOWED_WIDTHS[0];
  let bestDist = Infinity;
  for (const cand of ALLOWED_WIDTHS) {
    const d = Math.abs(cand - w);
    if (d < bestDist) {
      bestDist = d;
      best = cand;
    }
  }
  return best;
}

/**
 * Serialize the full selection to a URL query string. Station id is OMITTED when null; the
 * viewport is a single compact `v=lat,lng,zoom` param at fixed precision so a round-trip is
 * stable to 4 decimal places (lat/lng) / 2 (zoom).
 */
export function stateToParams(s: SelectionState): string {
  const p = new URLSearchParams();
  p.set("doy", String(s.anchorDoy));
  p.set("w", String(s.widthDays));
  p.set("fra", String(s.yearFrom));
  p.set("til", String(s.yearTil));
  if (s.stationId !== null) p.set("st", String(s.stationId));
  p.set("v", `${s.lat.toFixed(4)},${s.lng.toFixed(4)},${s.zoom.toFixed(2)}`);
  return p.toString();
}

/**
 * Parse a query string into a full SelectionState, defensively clamping every field against
 * `bounds` and the Iceland viewport limits, using `fallback` for any absent/garbage param.
 * NEVER throws; NEVER yields NaN. This is the ONLY place URL data becomes store data.
 */
export function paramsToState(
  qs: string,
  bounds: YearBounds,
  fallback: SelectionState,
): SelectionState {
  const p = new URLSearchParams(qs);

  // doy: integer 1..365; garbage → fallback anchor.
  const doyRaw = Number(p.get("doy"));
  const anchorDoy = Number.isFinite(doyRaw)
    ? clamp(Math.round(doyRaw), 1, 365)
    : fallback.anchorDoy;

  // w: snap to {7,14,21,30}; garbage → fallback width.
  const wRaw = Number(p.get("w"));
  const widthDays = p.has("w") ? snapWidth(wRaw, fallback.widthDays) : fallback.widthDays;

  // fra / til: integers clamped into [bounds.min, bounds.max]; enforce fra ≤ til (bump til up).
  const fraRaw = Number(p.get("fra"));
  const tilRaw = Number(p.get("til"));
  let yearFrom = Number.isFinite(fraRaw)
    ? clamp(Math.round(fraRaw), bounds.min, bounds.max)
    : clamp(fallback.yearFrom, bounds.min, bounds.max);
  let yearTil = Number.isFinite(tilRaw)
    ? clamp(Math.round(tilRaw), bounds.min, bounds.max)
    : clamp(fallback.yearTil, bounds.min, bounds.max);
  if (yearFrom > yearTil) yearTil = yearFrom; // never an inverted/empty range

  // st: integer or null (omitted → keep fallback, typically null). Never reflected into DOM.
  let stationId = fallback.stationId;
  if (p.has("st")) {
    const stRaw = Number(p.get("st"));
    stationId = Number.isFinite(stRaw) ? Math.round(stRaw) : fallback.stationId;
  }

  // v = "lat,lng,zoom" — clamp each within Iceland maxBounds + zoom range; garbage → fallback.
  let { lat, lng, zoom } = fallback;
  const vRaw = p.get("v");
  if (vRaw) {
    const parts = vRaw.split(",");
    const latN = Number(parts[0]);
    const lngN = Number(parts[1]);
    const zoomN = Number(parts[2]);
    if (Number.isFinite(latN)) lat = clamp(latN, LAT_MIN, LAT_MAX);
    if (Number.isFinite(lngN)) lng = clamp(lngN, LNG_MIN, LNG_MAX);
    if (Number.isFinite(zoomN)) zoom = clamp(zoomN, ZOOM_MIN, ZOOM_MAX);
  }

  return { anchorDoy, widthDays, yearFrom, yearTil, stationId, lng, lat, zoom };
}
