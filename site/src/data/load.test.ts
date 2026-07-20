// Unit tests for the loader: content-hashed derived-filename resolution from the
// real committed manifest, and BASE_URL-aware asset URL construction.
//
// The production `load.ts` module is fetch-based/browser-safe; here we exercise the
// PURE resolution + URL functions, feeding the committed JSON directly (read from
// disk with Node fs ONLY in the test — never imported by the production module).
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  resolveDerivedFile,
  assetUrl,
  loadStations,
  loadManifest,
  loadDerived,
  type Manifest,
} from "./load.js";

const HERE = dirname(fileURLToPath(import.meta.url));
// site/src/data → site/public/data
const MANIFEST_PATH = join(HERE, "..", "..", "public", "data", "manifest.json");
const manifest: Manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));

describe("resolveDerivedFile — content-hashed filename resolution", () => {
  it("resolves station 1 to its hashed filename (NOT derived/1.json)", () => {
    const file = resolveDerivedFile(manifest, 1);
    expect(file).toBe("derived/1.c1cf25669d53.json");
    expect(file).not.toBe("derived/1.json");
  });

  it("resolves station 1350 to its hashed filename", () => {
    expect(resolveDerivedFile(manifest, 1350)).toBe("derived/1350.eaecfc5ae78f.json");
  });

  it("accepts a numeric id and looks it up by its string key", () => {
    // manifest keys are strings ("1"); the resolver must coerce.
    expect(resolveDerivedFile(manifest, 1)).toBe(manifest.stations["1"]!.file);
  });

  it("returns null for an unknown station id (no throw — defensive decode, ASVS V5)", () => {
    expect(resolveDerivedFile(manifest, 999999)).toBeNull();
  });

  it("returns null for a malformed manifest (missing stations) without throwing", () => {
    expect(resolveDerivedFile({} as unknown as Manifest, 1)).toBeNull();
    expect(resolveDerivedFile({ stations: {} }, 1)).toBeNull();
    // entry present but with no `file` key → null, never a throw.
    expect(resolveDerivedFile({ stations: { "1": {} as never } }, 1)).toBeNull();
  });
});

describe("assetUrl — BASE_URL prefixing", () => {
  it("prefixes stations.json with the supplied base", () => {
    expect(assetUrl("/betravedur/", "data/stations.json")).toBe(
      "/betravedur/data/stations.json",
    );
  });

  it("prefixes a hashed derived entry with the base", () => {
    const file = resolveDerivedFile(manifest, 1)!;
    expect(assetUrl("/betravedur/", `data/${file}`)).toBe(
      "/betravedur/data/derived/1.c1cf25669d53.json",
    );
  });

  it("collapses a double slash when the path already leads with one", () => {
    // Defensive: base ends with '/', path may or may not lead with '/'.
    expect(assetUrl("/betravedur/", "/data/stations.json")).toBe(
      "/betravedur/data/stations.json",
    );
  });

  it("works with the dev base '/'", () => {
    expect(assetUrl("/", "data/manifest.json")).toBe("/data/manifest.json");
  });
});

describe("fetch helpers — res.ok handling (WR-05)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockFetch(res: Partial<Response> & { json?: () => Promise<unknown> }): void {
    vi.stubGlobal("fetch", vi.fn(async () => res as Response));
  }

  const ok = (body: unknown): Partial<Response> & { json: () => Promise<unknown> } => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => body,
  });

  const notFound = (
    body: unknown,
  ): Partial<Response> & { json: () => Promise<unknown> } => ({
    ok: false,
    status: 404,
    statusText: "Not Found",
    json: async () => body,
  });

  it("loadDerived throws a labeled error on a 404 (even when the body is valid JSON)", async () => {
    // A subpath 404 whose body parses as JSON must NOT be treated as empty data.
    mockFetch(notFound({}));
    await expect(loadDerived("/betravedur/", "derived/1.abc.json")).rejects.toThrow(
      /derived derived\/1\.abc\.json fetch failed: HTTP 404/,
    );
  });

  it("loadStations throws on a 404 rather than passing a non-array error body downstream", async () => {
    mockFetch(notFound({ error: "nope" }));
    await expect(loadStations("/betravedur/")).rejects.toThrow(
      /stations\.json fetch failed: HTTP 404/,
    );
  });

  it("loadManifest throws on a 404", async () => {
    mockFetch(notFound({}));
    await expect(loadManifest("/betravedur/")).rejects.toThrow(
      /manifest\.json fetch failed: HTTP 404/,
    );
  });

  it("returns the parsed body on a 200 (the happy path is unaffected)", async () => {
    mockFetch(ok({ stations: { "1": { file: "derived/1.abc.json" } } }));
    const m = await loadManifest("/betravedur/");
    expect(m.stations["1"]!.file).toBe("derived/1.abc.json");
  });
});
