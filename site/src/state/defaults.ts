// Data-derived selection bounds + default (SEL-02, UX-02).
//
// Two responsibilities, both pure and defensive:
//   1. yearBounds(manifest) — the UNION of every station's [from, to] high-water marks
//      (RESEARCH Code Examples / A2). Union, NOT intersection: the picker should let a user
//      pick 1949 even though only Reykjavík #1 (from 1949) covers it — per-station honest-N
//      already renders "ófullnægjandi gögn" for stations that can't answer. An intersection
//      would collapse to the shortest station's range (2008–2026 on the current sample),
//      hiding 60 years of real Reykjavík history. A malformed/empty manifest falls back to
//      {min: thisYear-10, max: thisYear} — NEVER NaN dropdowns.
//   2. defaultSelection(bounds, now) — the app's runtime default when no URL params are
//      present: current-week anchor (today's leap-folded doy at load), 1 vika (7 days), and
//      the last 10 available years (yearTil = bounds.max, yearFrom = max(bounds.min,
//      bounds.max-9)). `today` is NOT hardcoded — the anchor derives from `now`; the years
//      derive from the manifest bounds. This REPLACES the Phase-3 fixed DEFAULT_WINDOW as
//      the runtime default (that constant stays in types.ts only as the compute-fallback).
import { leapFoldedDoy } from "@betravedur/domain";
import type { Manifest } from "../data/load.js";
import type { SelectionState } from "./store.js";

/** The available-year bounds for the Frá/Til dropdowns and the URL fra/til clamp. */
export interface YearBounds {
  /** Earliest available year (min of every manifest entry.from). */
  min: number;
  /** Latest available year (max of every manifest entry.to). */
  max: number;
}

/**
 * Union of per-station [from, to] across the manifest — the widest range any committed
 * station can answer. Falls back to a sane [thisYear-10, thisYear] window when the manifest
 * carries no finite bounds (defensive — never NaN, never Infinity).
 */
export function yearBounds(manifest: Manifest): YearBounds {
  let min = Infinity;
  let max = -Infinity;
  for (const entry of Object.values(manifest?.stations ?? {})) {
    if (typeof entry?.from === "number" && Number.isFinite(entry.from)) {
      min = Math.min(min, entry.from);
    }
    if (typeof entry?.to === "number" && Number.isFinite(entry.to)) {
      max = Math.max(max, entry.to);
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    const y = new Date().getUTCFullYear();
    return { min: y - 10, max: y };
  }
  return { min, max };
}

/**
 * The default selection applied on first load when the URL carries no params (RESEARCH
 * Code Examples). Current-week anchor over the last 10 available years:
 *  - anchorDoy = today's leap-folded doy (Feb 29 → a stable summer-week fallback, rare),
 *  - widthDays = 7 (1 vika),
 *  - yearTil = bounds.max, yearFrom = max(bounds.min, bounds.max - 9) (last 10 yr, clamped),
 *  - stationId = null (no station preselected),
 *  - viewport = the init.ts Iceland framing (lng -18.7, lat 64.9, zoom 5.4 — whole island + sea margin).
 * `now` defaults to `new Date()`; passing a fixed date makes the anchor deterministic in tests.
 */
export function defaultSelection(bounds: YearBounds, now: Date = new Date()): SelectionState {
  const iso = now.toISOString().slice(0, 10); // "YYYY-MM-DD"
  const anchorDoy = leapFoldedDoy(iso) ?? 197; // Feb 29 (leapFoldedDoy → null) → summer fallback
  const yearTil = bounds.max;
  const yearFrom = Math.max(bounds.min, bounds.max - 9); // last 10 available years, clamped
  return {
    anchorDoy,
    widthDays: 7,
    yearFrom,
    yearTil,
    stationId: null,
    lng: -18.7,
    lat: 64.9,
    zoom: 5.4, // frame the WHOLE island with a sea margin on load (matches init.ts framing)
  };
}
