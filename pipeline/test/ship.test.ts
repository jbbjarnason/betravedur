// Ship-set copy helper (Plan 08-01, Task 3) — RED before ship.ts exists.
//
// Enforces the PIPELINE ship rule: only derived/ + stations.json + manifest.json go into the
// site build input. The raw store (raw/) is the pipeline's private source of truth and NEVER
// ships (would balloon the Pages repo). copyShipSet is the build-step data-staging seam
// (RESEARCH Pattern 5b): copy from the ./data-wt worktree into the build's public/data so the
// build uses the just-written bytes — works on the first full_backfill before `data` is pushed.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyShipSet, SHIP_OUTPUTS } from "../src/ship.js";

let src: string;
let dest: string;
beforeEach(() => {
  src = mkdtempSync(join(tmpdir(), "betra-ship-src-"));
  dest = mkdtempSync(join(tmpdir(), "betra-ship-dest-"));
  // Build a realistic store root: raw/ (must NOT ship) + the ship-set.
  mkdirSync(join(src, "raw", "1350"), { recursive: true });
  writeFileSync(join(src, "raw", "1350", "2010.ndjson"), '{"station":1350}\n');
  mkdirSync(join(src, "derived"), { recursive: true });
  writeFileSync(join(src, "derived", "1350.abc123.json"), '{"schema":1}');
  writeFileSync(join(src, "derived", "1.def456.json"), '{"schema":1}');
  writeFileSync(join(src, "stations.json"), "[]");
  writeFileSync(join(src, "manifest.json"), '{"stations":{}}');
});
afterEach(() => {
  rmSync(src, { recursive: true, force: true });
  rmSync(dest, { recursive: true, force: true });
});

describe("copyShipSet: stages the ship-set, NEVER raw/", () => {
  it("SHIP_OUTPUTS is exactly derived + stations.json + manifest.json (mirrors aggregate.shipOutputs)", () => {
    expect(SHIP_OUTPUTS).toEqual(["derived", "stations.json", "manifest.json"]);
    expect(SHIP_OUTPUTS).not.toContain("raw");
  });

  it("copies derived/, stations.json, manifest.json into dest", () => {
    copyShipSet(src, dest);
    expect(existsSync(join(dest, "stations.json"))).toBe(true);
    expect(existsSync(join(dest, "manifest.json"))).toBe(true);
    expect(existsSync(join(dest, "derived", "1350.abc123.json"))).toBe(true);
    expect(existsSync(join(dest, "derived", "1.def456.json"))).toBe(true);
    // Bytes are copied verbatim.
    expect(readFileSync(join(dest, "manifest.json"), "utf8")).toBe('{"stations":{}}');
  });

  it("NEVER copies raw/ into dest (the ship rule)", () => {
    copyShipSet(src, dest);
    expect(existsSync(join(dest, "raw"))).toBe(false);
  });

  it("creates dest when it does not yet exist", () => {
    const fresh = join(dest, "nested", "public", "data");
    expect(existsSync(fresh)).toBe(false);
    copyShipSet(src, fresh);
    expect(existsSync(join(fresh, "manifest.json"))).toBe(true);
    expect(existsSync(join(fresh, "raw"))).toBe(false);
  });
});
