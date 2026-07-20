// Raw-store contract tests (TDD RED before rawstore.ts exists).
//
// Locks the on-disk half of the resumable pipeline (02-RESEARCH Pitfalls 3 & 6, DATA-07):
//   A. field pruning   -> persisted line has EXACTLY the 10 DailyObservation keys.
//   B. idempotency     -> two identical upserts produce a byte-identical file.
//   C. dedup by date   -> upsert merges by (station,date); new value wins; sorted by date.
//   D. per-year split  -> rows across calendar years land in separate raw/{station}/{year}.ndjson.
//   E. high-water mark  -> highWaterYear reports the max year present; a resume run over
//                          already-present years writes no new/changed bytes.
//   E2. resume wiring   -> backfillStation reads the high-water mark and fetches ONLY newer
//                          years (the highWaterYear->startYear handoff, not deferred to 02-04).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DailyObservation } from "@betravedur/domain";
import {
  upsertPartition,
  readPartition,
  highWaterYear,
  partitionPath,
} from "../src/rawstore.js";
import { backfillStation } from "../src/backfill.js";

const THE_10_KEYS = ["station", "date", "doy", "t", "tx", "tn", "f", "fx", "fg", "dv", "r"] as const;

function obs(station: number, date: string, over: Partial<DailyObservation> = {}): DailyObservation {
  return {
    station,
    date,
    doy: 1,
    t: 5,
    tx: 8,
    tn: 2,
    f: 3,
    fx: 6,
    fg: 9,
    dv: 180,
    r: null,
    ...over,
  };
}

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "betra-rawstore-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("raw store", () => {
  it("A: persists ONLY the 10 DailyObservation keys (field-pruned)", () => {
    // A row carrying extra sensor keys the store must never persist.
    const dirty = {
      ...obs(1350, "2010-06-15"),
      rh: 88,
      pressure: 1013,
      radiation: 200,
      dv_txt: "S",
    } as unknown as DailyObservation;

    upsertPartition(root, 1350, [dirty]);
    const line = readFileSync(partitionPath(root, 1350, 2010), "utf8").trim().split("\n")[0];
    const parsed = JSON.parse(line!) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual([...THE_10_KEYS].sort());
    // Explicitly assert the leaked keys are gone.
    for (const k of ["rh", "pressure", "radiation", "dv_txt"]) {
      expect(parsed).not.toHaveProperty(k);
    }
  });

  it("B: two identical upserts produce a byte-identical partition file", () => {
    const rows = [obs(1, "2010-03-01"), obs(1, "2010-01-15"), obs(1, "2010-02-20")];
    upsertPartition(root, 1, rows);
    const first = readFileSync(partitionPath(root, 1, 2010));
    upsertPartition(root, 1, rows);
    const second = readFileSync(partitionPath(root, 1, 2010));
    expect(second.equals(first)).toBe(true);
  });

  it("C: upsert merges and dedups by (station,date); new value wins; sorted by date", () => {
    upsertPartition(root, 1, [obs(1, "2010-01-10", { t: 1 }), obs(1, "2010-01-20", { t: 2 })]);
    // Re-upsert B with a changed value, plus a new date C.
    upsertPartition(root, 1, [obs(1, "2010-01-20", { t: 99 }), obs(1, "2010-01-30", { t: 3 })]);

    const back = readPartition(root, 1, 2010);
    expect(back.map((r) => r.date)).toEqual(["2010-01-10", "2010-01-20", "2010-01-30"]);
    // One row per date (no duplicate 2010-01-20), and the newer value won.
    const jan20 = back.find((r) => r.date === "2010-01-20");
    expect(jan20?.t).toBe(99);
  });

  it("D: rows spanning two calendar years write to two separate partition files", () => {
    upsertPartition(root, 7, [obs(7, "2009-12-31"), obs(7, "2010-01-01")]);
    expect(existsSync(partitionPath(root, 7, 2009))).toBe(true);
    expect(existsSync(partitionPath(root, 7, 2010))).toBe(true);
    expect(readPartition(root, 7, 2009).map((r) => r.date)).toEqual(["2009-12-31"]);
    expect(readPartition(root, 7, 2010).map((r) => r.date)).toEqual(["2010-01-01"]);
  });

  it("E: highWaterYear reports the max year present; a resume run changes no bytes", () => {
    expect(highWaterYear(root, 42)).toBeNull();
    upsertPartition(root, 42, [obs(42, "2008-05-01"), obs(42, "2011-05-01")]);
    expect(highWaterYear(root, 42)).toBe(2011);

    // Re-upserting the already-present rows must not change any partition bytes.
    const before2008 = readFileSync(partitionPath(root, 42, 2008));
    const before2011 = readFileSync(partitionPath(root, 42, 2011));
    upsertPartition(root, 42, [obs(42, "2008-05-01"), obs(42, "2011-05-01")]);
    expect(readFileSync(partitionPath(root, 42, 2008)).equals(before2008)).toBe(true);
    expect(readFileSync(partitionPath(root, 42, 2011)).equals(before2011)).toBe(true);
  });
});

describe("CR-01: station/year validation at the store boundary (path traversal)", () => {
  // Craft ids that would escape or malform the raw/ subtree if interpolated unchecked.
  const badStations = [-1, 1.5, NaN, Infinity, "../evil" as unknown as number];

  it("partitionPath rejects non-integer / negative station ids", () => {
    for (const bad of badStations) {
      expect(() => partitionPath(root, bad as number, 2010)).toThrow(/invalid station id/);
    }
  });

  it("partitionPath rejects non-integer / negative years", () => {
    for (const bad of [-1, 1.5, NaN, Infinity]) {
      expect(() => partitionPath(root, 1, bad)).toThrow(/invalid year/);
    }
  });

  it("upsertPartition rejects a bad station id even with rows to write", () => {
    expect(() => upsertPartition(root, -1, [obs(-1, "2010-01-01")])).toThrow(/invalid station id/);
    // ...and even on the empty-rows fast path (must not slip through).
    expect(() => upsertPartition(root, -1, [])).toThrow(/invalid station id/);
  });

  it("readPartition rejects a bad station id", () => {
    expect(() => readPartition(root, 1.5, 2010)).toThrow(/invalid station id/);
    expect(() => readPartition(root, 1, -1)).toThrow(/invalid year/);
  });

  it("highWaterYear rejects a bad station id", () => {
    expect(() => highWaterYear(root, -1)).toThrow(/invalid station id/);
  });

  it("a valid non-negative integer station/year still works", () => {
    expect(() => partitionPath(root, 0, 0)).not.toThrow();
    upsertPartition(root, 0, [obs(0, "2010-01-01")]);
    expect(readPartition(root, 0, 2010).length).toBe(1);
  });
});

describe("WR-06: readPartition tolerates a corrupt line", () => {
  it("skips a malformed NDJSON line instead of crashing the whole read", () => {
    // Write a partition file directly with one good line, one garbage line, one good line.
    const path = partitionPath(root, 3, 2010);
    mkdirSync(join(root, "raw", "3"), { recursive: true });
    const good1 = JSON.stringify({ ...obs(3, "2010-01-01"), r: null });
    const good2 = JSON.stringify({ ...obs(3, "2010-01-03"), r: null });
    writeFileSync(path, `${good1}\n{ this is not valid json\n${good2}\n`);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rows = readPartition(root, 3, 2010);
    warn.mockRestore();

    // The two good rows survive; the corrupt line is skipped, not fatal.
    expect(rows.map((r) => r.date)).toEqual(["2010-01-01", "2010-01-03"]);
  });
});

describe("high-water resume", () => {
  it("E2: backfillStation reads the high-water mark and fetches ONLY newer years", async () => {
    // Seed the store as if years <=2012 were already backfilled.
    upsertPartition(root, 5, [obs(5, "2012-06-15")]);
    expect(highWaterYear(root, 5)).toBe(2012);

    const fetchedSpans: Array<[string, string]> = [];
    const fetchAws = vi.fn(async (_ids: number[], from: string, to: string) => {
      fetchedSpans.push([from, to]);
      // Return one row per year across the requested span (as the real API would),
      // so the persisted high-water mark reflects the full fetched range.
      const y0 = Number(from.slice(0, 4));
      const y1 = Number(to.slice(0, 4));
      const rows: DailyObservation[] = [];
      for (let y = y0; y <= y1; y++) rows.push(obs(5, `${y}-06-15`));
      return rows;
    });

    // startYear omitted -> resume path reads highWaterYear and starts at highWater+1 (2013).
    const newHw = await backfillStation("aws", 5, undefined, {
      fetchAws,
      fetchSynop: vi.fn(),
      upsertPartition: (station, rows) => upsertPartition(root, station, rows),
      highWaterYear: (station) => highWaterYear(root, station),
      sleep: async () => {},
      nowYear: 2016,
    });

    // Every fetched span must start in 2013 or later — no re-fetch of <=2012.
    for (const [from] of fetchedSpans) {
      expect(Number(from.slice(0, 4))).toBeGreaterThanOrEqual(2013);
    }
    // The oldest fetched year is exactly high-water + 1.
    const oldestFetched = Math.min(...fetchedSpans.map(([from]) => Number(from.slice(0, 4))));
    expect(oldestFetched).toBe(2013);
    expect(newHw).toBe(2016);

    // A second resume when already current fetches nothing new.
    fetchedSpans.length = 0;
    await backfillStation("aws", 5, undefined, {
      fetchAws,
      fetchSynop: vi.fn(),
      upsertPartition: (station, rows) => upsertPartition(root, station, rows),
      highWaterYear: (station) => highWaterYear(root, station),
      sleep: async () => {},
      nowYear: 2016,
    });
    expect(fetchedSpans.length).toBe(0);
  });
});
