// Manifest + content-hash contract tests (TDD RED before manifest.ts exists).
//
// Locks the cache-busting index layer (02-RESEARCH "Content-hashing + manifest", DATA-04/DATA-07):
//   A. stable hash     -> contentHash(bytes) is deterministic; same bytes -> same truncated
//                         hex sha256 of the documented length.
//   B. delta property  -> updateManifest with UNCHANGED bytes leaves the station's entry
//                         byte-identical; with CHANGED bytes it updates ONLY that station's
//                         hash+filename, never another station's entry ("hash iff bytes").
//   C. high-water marks -> updateManifest records/updates per-station {from,to,lastFetched};
//                         re-serializing an unchanged manifest is byte-identical (stable keys).
//   D. filename         -> the entry filename matches derived/{station}.{hash}.json.
import { describe, it, expect } from "vitest";
import { contentHash, updateManifest, serializeManifest, HASH_LEN } from "../src/manifest.js";
import type { Manifest } from "../src/manifest.js";

const marks = (over: Partial<{ from: number; to: number; lastFetched: string }> = {}) => ({
  from: 2005,
  to: 2010,
  lastFetched: "2026-07-20T00:00:00Z",
  ...over,
});

describe("content hash", () => {
  it("A: is deterministic and a truncated hex sha256 of the documented length", () => {
    const bytes = '{"station":1,"cols":{}}';
    const h1 = contentHash(bytes);
    const h2 = contentHash(bytes);
    expect(h1).toBe(h2); // same bytes -> same hash
    expect(h1).toMatch(new RegExp(`^[0-9a-f]{${HASH_LEN}}$`)); // truncated hex, documented length
    // Buffer and string of the same bytes hash identically.
    expect(contentHash(Buffer.from(bytes))).toBe(h1);
    // Different bytes -> different hash.
    expect(contentHash('{"station":1,"cols":{"t":[1]}}')).not.toBe(h1);
  });
});

describe("manifest", () => {
  it("B: delta property — unchanged bytes leave the entry untouched; changed bytes update ONLY that station", () => {
    const bytesA1 = '{"station":1,"v":"a1"}';
    const bytesB1 = '{"station":2,"v":"b1"}';
    let m: Manifest = { stations: {} };
    m = updateManifest(m, 1, bytesA1, marks());
    m = updateManifest(m, 2, bytesB1, marks());

    const entry1Before = { ...m.stations[1]! };
    const entry2Before = { ...m.stations[2]! };

    // Unchanged bytes for station 1 -> its entry is byte-identical (hash + filename unchanged).
    const mUnchanged = updateManifest(m, 1, bytesA1, marks({ lastFetched: "2026-07-21T00:00:00Z" }));
    expect(mUnchanged.stations[1]!.hash).toBe(entry1Before.hash);
    expect(mUnchanged.stations[1]!.file).toBe(entry1Before.file);

    // Changed bytes for station 1 -> ONLY station 1's hash+filename change; station 2 untouched.
    const bytesA2 = '{"station":1,"v":"a2-CHANGED"}';
    const mChanged = updateManifest(m, 1, bytesA2, marks());
    expect(mChanged.stations[1]!.hash).not.toBe(entry1Before.hash);
    expect(mChanged.stations[1]!.file).not.toBe(entry1Before.file);
    expect(mChanged.stations[2]).toEqual(entry2Before); // untouched station
  });

  it("C: records per-station high-water marks and re-serializes an unchanged manifest byte-identically", () => {
    let m: Manifest = { stations: {} };
    m = updateManifest(m, 1, '{"v":1}', marks({ from: 2001, to: 2009 }));
    expect(m.stations[1]!.from).toBe(2001);
    expect(m.stations[1]!.to).toBe(2009);
    expect(m.stations[1]!.lastFetched).toBe("2026-07-20T00:00:00Z");

    // Stable key order: serializing the same manifest twice is byte-identical.
    expect(serializeManifest(m)).toBe(serializeManifest(m));

    // Insertion order must not affect serialization (stations sorted by id).
    let a: Manifest = { stations: {} };
    a = updateManifest(a, 2, '{"v":2}', marks());
    a = updateManifest(a, 1, '{"v":1}', marks());
    let b: Manifest = { stations: {} };
    b = updateManifest(b, 1, '{"v":1}', marks());
    b = updateManifest(b, 2, '{"v":2}', marks());
    expect(serializeManifest(a)).toBe(serializeManifest(b));
  });

  it("D: entry filename matches derived/{station}.{hash}.json", () => {
    let m: Manifest = { stations: {} };
    m = updateManifest(m, 42, '{"v":1}', marks());
    const { file, hash } = m.stations[42]!;
    expect(file).toBe(`derived/42.${hash}.json`);
  });
});
