// Content-hashed derived filenames + per-station high-water manifest (DATA-04, DATA-07).
//
// The cache-busting index Phase 3's client reads to resolve each station's immutable
// derived URL, and the bookkeeping Phase 8's cron reads to know where to resume.
// Contracts (mirrors registry.ts's deterministic-serialize style):
//   - contentHash(bytes) is a truncated hex sha256 content address of the derived bytes.
//     A station's hash changes IFF its derived bytes change (immutable-cache deltas).
//   - updateManifest never mutates its input and touches ONLY the target station's entry:
//     unchanged bytes leave that entry byte-identical; changed bytes rewrite its
//     hash + `derived/{station}.{hash}.json` filename and the high-water marks.
//   - serializeManifest sorts station ids so an unchanged manifest serializes byte-identically
//     (delta-friendly nightly commits).
//
// Node built-ins only (node:crypto / node:fs) — no npm deps; never bundled into the browser.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * Truncation length (hex chars) of the sha256 content address. 12 hex chars = 48 bits:
 * far beyond birthday-collision risk across the ~518 day-servable stations while keeping
 * filenames short. Documented and asserted by the manifest tests.
 */
export const HASH_LEN = 12;

/** Per-station manifest entry: hashed filename + content hash + high-water marks. */
export interface ManifestEntry {
  /** Content-hashed derived filename: `derived/{station}.{hash}.json`. */
  file: string;
  /** Truncated hex sha256 of the derived bytes (length HASH_LEN). */
  hash: string;
  /** First year covered by this station's derived data. */
  from: number;
  /** Last year covered (the resume anchor's upper bound). */
  to: number;
  /** ISO timestamp of the fetch that produced these bytes. */
  lastFetched: string;
}

/** The manifest: every station id -> its entry. */
export interface Manifest {
  stations: Record<number, ManifestEntry>;
}

/** High-water marks recorded alongside a station's derived bytes. */
export interface HighWaterMarks {
  from: number;
  to: number;
  lastFetched: string;
}

/**
 * Truncated hex sha256 content address of the derived bytes. Deterministic: the same bytes
 * always hash to the same string, so a station's hash changes iff its derived bytes change.
 */
export function contentHash(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, HASH_LEN);
}

/**
 * Return a new manifest with the target station's entry set from `derivedBytes` + `marks`.
 *
 * Delta property: if the computed hash equals the station's existing hash, the derived bytes
 * are unchanged — that station's entry is preserved byte-identically (file/hash AND marks),
 * so the serialized manifest is unchanged for that station (immutable-cache delta). Only when
 * the hash differs do we rewrite `file`, `hash`, and the high-water marks. Other stations are
 * copied over verbatim and never touched. The input manifest is never mutated.
 */
export function updateManifest(
  manifest: Manifest,
  station: number,
  derivedBytes: Buffer | string,
  marks: HighWaterMarks,
): Manifest {
  const hash = contentHash(derivedBytes);
  const existing = manifest.stations[station];

  // Unchanged bytes -> keep the existing entry byte-identical (stable delta).
  if (existing && existing.hash === hash) {
    return { stations: { ...manifest.stations, [station]: existing } };
  }

  const entry: ManifestEntry = {
    file: `derived/${station}.${hash}.json`,
    hash,
    from: marks.from,
    to: marks.to,
    lastFetched: marks.lastFetched,
  };
  return { stations: { ...manifest.stations, [station]: entry } };
}

/**
 * Serialize the manifest to deterministic, station-id-sorted JSON. Insertion order is
 * irrelevant: stations are re-keyed in ascending numeric id and each entry's fields are
 * written in a fixed order, so an unchanged manifest serializes byte-identically.
 */
export function serializeManifest(manifest: Manifest): string {
  const ids = Object.keys(manifest.stations)
    .map(Number)
    .sort((a, b) => a - b);
  const stations: Record<number, ManifestEntry> = {};
  for (const id of ids) {
    const e = manifest.stations[id]!;
    // Fixed field order for byte-stable serialization.
    stations[id] = {
      file: e.file,
      hash: e.hash,
      from: e.from,
      to: e.to,
      lastFetched: e.lastFetched,
    };
  }
  return JSON.stringify({ stations }, null, 2) + "\n";
}

/** Read a manifest from disk, or an empty manifest when the file is absent/unreadable. */
export function readManifest(path: string): Manifest {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "stations" in parsed &&
      typeof (parsed as { stations: unknown }).stations === "object"
    ) {
      return parsed as Manifest;
    }
  } catch {
    // Missing/corrupt manifest -> start fresh (first run, or delta from nothing).
  }
  return { stations: {} };
}
