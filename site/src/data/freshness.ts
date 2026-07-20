// Client-side data-freshness helpers (Phase 7, UX-04).
//
// FRESHNESS IS DERIVED CLIENT-SIDE — there is NO pipeline/manifest change and NO top-level
// `generatedAt` (adding an always-current top-level field would break the Phase-2 byte-identical
// manifest determinism the pipeline tests pin). Instead `newestDataDate` reads the newest per-
// station `lastFetched` already in the committed manifest. Both helpers are TOLERANT: missing/
// empty/malformed input returns null so the info panel OMITS the "uppfært" line rather than ever
// rendering "Invalid Date" (UI-SPEC §Data Freshness — never show a false/broken freshness).
//
// The Icelandic month name array is HAND-ROLLED (not Intl.DateTimeFormat("is-IS")): the codebase
// already documents the is-IS ICU locale falling back to a non-Icelandic form in the headless test
// runtime (see stationPanel.ts `formatIce`, which owns the comma decimal by hand for the same
// reason — RESEARCH Pitfall 3). We own the month names, never the locale.
import type { Manifest } from "./load.js";

/** Icelandic month names, index 0 = janúar … 11 = desember (hand-rolled, deterministic). */
const IS_MONTHS = [
  "janúar",
  "febrúar",
  "mars",
  "apríl",
  "maí",
  "júní",
  "júlí",
  "ágúst",
  "september",
  "október",
  "nóvember",
  "desember",
] as const;

/**
 * The newest data date = MAX `lastFetched` across `manifest.stations`. ISO-8601 UTC strings sort
 * lexicographically in the same order they sort chronologically, so a plain string `>` comparison
 * finds the chronologically-latest without parsing. Returns null when there are no stations or no
 * PARSEABLE `lastFetched` (empty/malformed strings are ignored, never counted as a date). Never
 * throws — a missing/undefined stations object degrades to null.
 */
export function newestDataDate(manifest: Manifest): string | null {
  const stations = manifest?.stations;
  if (!stations || typeof stations !== "object") return null;

  let newest: string | null = null;
  for (const entry of Object.values(stations)) {
    const iso = entry?.lastFetched;
    // Only consider a non-empty string that parses to a real date (guards "" and "not-a-date").
    if (typeof iso !== "string" || iso.length === 0) continue;
    if (Number.isNaN(new Date(iso).getTime())) continue;
    if (newest === null || iso > newest) newest = iso;
  }
  return newest;
}

/**
 * Format an ISO date string as a human Icelandic date, e.g. "20. júlí 2026". Uses UTC getters so
 * the rendered day never shifts across a timezone boundary, and the hand-rolled `IS_MONTHS` array
 * (never a locale). Returns null for an invalid/empty string (the `Number.isNaN` guard) so callers
 * omit the line rather than render "Invalid Date".
 */
export function formatIcelandicDate(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCDate()}. ${IS_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
