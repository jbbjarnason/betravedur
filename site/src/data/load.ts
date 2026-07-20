// BASE_URL-aware loading of the committed static data assets, with content-hashed
// derived-filename resolution from manifest.json.
//
// PURE + BROWSER-SAFE: no Node built-ins. The pure functions (`resolveDerivedFile`,
// `assetUrl`) are unit-tested directly; the async fetch helpers are exercised in the
// browser (and E2E). Derived filenames are content-hashed for cache-busting, so the
// URL is ALWAYS resolved from the manifest — never constructed as `derived/{id}.json`
// (RESEARCH Pitfall 3). Malformed/missing manifest entries degrade to null, never throw
// (defensive decode — ASVS V5 / threat T-03-04).
import type { StationMeta } from "@betravedur/domain";
import type { DerivedFile } from "@betravedur/pipeline/derive";

/** One manifest entry: the content-hashed derived filename + provenance. */
export interface ManifestEntry {
  /** Relative path under public/data, e.g. "derived/1.c1cf25669d53.json". */
  file: string;
  hash?: string;
  from?: number;
  to?: number;
  lastFetched?: string;
}

/** The committed manifest.json shape: station id (string key) → entry. */
export interface Manifest {
  stations: Record<string, ManifestEntry>;
}

/**
 * Resolve a station's content-hashed derived filename from the manifest.
 * Returns the relative path (e.g. "derived/1.c1cf25669d53.json") or null when the
 * station is absent, the manifest is malformed, or the entry carries no `file`.
 * NEVER throws and NEVER constructs `derived/{id}.json`.
 */
export function resolveDerivedFile(manifest: Manifest, id: number): string | null {
  const stations = manifest?.stations;
  if (!stations || typeof stations !== "object") return null;
  const entry = stations[String(id)];
  const file = entry?.file;
  return typeof file === "string" && file.length > 0 ? file : null;
}

/**
 * Prefix a public-dir-relative path with the Vite base (import.meta.env.BASE_URL).
 * The base always ends with "/"; a leading "/" on `path` is collapsed so the two
 * never produce a double slash.
 */
export function assetUrl(base: string, path: string): string {
  const p = path.startsWith("/") ? path.slice(1) : path;
  return `${base}${p}`;
}

/**
 * Fetch a JSON asset, distinguishing a real HTTP error (404/5xx) from a legitimately
 * empty payload (WR-05). `fetch` does NOT reject on 4xx/5xx, and a mis-resolved asset
 * under the `/betravedur/` Pages subpath can return a 404 whose JSON error body
 * (`{}` / `{"error":...}`) parses successfully and would otherwise flow downstream as if
 * it were real (empty) data. Checking `res.ok` and throwing a labeled error lets the
 * caller's per-station / outer catch tell a transport failure apart from "no data".
 */
async function fetchJson<T>(url: string, label: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${label} fetch failed: HTTP ${res.status} ${res.statusText} (${url})`);
  }
  return (await res.json()) as T;
}

/** Fetch + parse stations.json. Browser-only (uses fetch). Throws on a non-ok HTTP status. */
export async function loadStations(base: string): Promise<StationMeta[]> {
  return fetchJson<StationMeta[]>(assetUrl(base, "data/stations.json"), "stations.json");
}

/** Fetch + parse manifest.json. Browser-only (uses fetch). Throws on a non-ok HTTP status. */
export async function loadManifest(base: string): Promise<Manifest> {
  return fetchJson<Manifest>(assetUrl(base, "data/manifest.json"), "manifest.json");
}

/**
 * Fetch + parse a derived file by its manifest-resolved relative path.
 * `file` MUST come from `resolveDerivedFile` (the hashed name), not a constructed one.
 * Throws a labeled error on a non-ok HTTP status so a subpath 404 is never silently
 * treated as an empty station (WR-05).
 */
export async function loadDerived(base: string, file: string): Promise<DerivedFile> {
  return fetchJson<DerivedFile>(assetUrl(base, `data/${file}`), `derived ${file}`);
}
