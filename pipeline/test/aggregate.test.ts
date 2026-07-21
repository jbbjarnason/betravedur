// Full-chain aggregate orchestrator tests (TDD RED before aggregate.ts exists).
//
// Extends Plan 01's in-memory derive round-trip through the REAL on-disk path:
//   raw NDJSON store -> aggregateStation -> derived/{station}.{hash}.json -> decode ->
//   domain math (groupBySeasonYear -> qualifyingYears/means). Locks:
//   A. full-chain round-trip: the on-disk derived path equals the direct domain path on
//      the original rows, for BOTH a non-wrapping mid-July window AND a wrapping
//      {startDoy:364,endDoy:3} Dec->Jan window (WR-03 boundary season).
//   B. touched-only re-derivation: no raw change -> byte-identical derived + manifest;
//      change one station's raw -> ONLY that station re-hashes.
//   C. outputs present: manifest indexes each station -> derived/{station}.{hash}.json;
//      stations.json holds the qualifying stations; AWS omits `r`, SYNOP omits `dv`.
//   D. raw never shipped: the ship output set is exactly derived/ + stations.json +
//      manifest.json — `raw/` is not among the ship-listed outputs.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DailyObservation, StationType, WindowSpec } from "@betravedur/domain";
import {
  groupBySeasonYear,
  expandWindow,
  qualifyingYears,
} from "@betravedur/domain";
import { upsertPartition } from "../src/rawstore.js";
import { decodeDerived, encodeDerived } from "../src/derive.js";
import type { DerivedFile } from "../src/derive.js";
import {
  aggregateStation,
  aggregateStationWithDerived,
  aggregateAll,
  countQualifyingYears,
  fullStoreQualifyingCounts,
  pruneOrphanedDerived,
  shipOutputs,
  SUMMER_WINDOW_START_DOY,
  SUMMER_WINDOW_END_DOY,
} from "../src/aggregate.js";
import { serializeManifest } from "../src/manifest.js";
import type { Manifest } from "../src/manifest.js";
import { leapFoldedDoy } from "@betravedur/domain";

const AWS_STATION = 1350;
const SYNOP_STATION = 1;

/** Build a normalized DailyObservation for a given date with a per-metric overridable value. */
function obs(
  station: number,
  date: string,
  over: Partial<DailyObservation> = {},
): DailyObservation {
  const doy = leapFoldedDoy(date);
  return {
    station,
    date,
    doy: doy ?? 1,
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

/**
 * Generate multi-year daily rows covering a set of day-of-year positions across years,
 * including December and January boundary days so a wrapping window has real coverage.
 * We emit a full set of window-relevant days at >=80% coverage so the year qualifies.
 */
function seedRows(
  station: number,
  years: number[],
  overForYear: (year: number) => Partial<DailyObservation> = () => ({}),
): DailyObservation[] {
  const rows: DailyObservation[] = [];
  for (const y of years) {
    const extra = overForYear(y);
    // Cover mid-July (doy ~200) and the Dec->Jan boundary (Dec 27..31, Jan 1..3).
    const dates: string[] = [];
    // Mid-July block: Jul 10..20 (11 days), well over any small non-wrapping window.
    for (let d = 10; d <= 20; d++) dates.push(`${y}-07-${String(d).padStart(2, "0")}`);
    // December head: Dec 27..31.
    for (let d = 27; d <= 31; d++) dates.push(`${y}-12-${String(d).padStart(2, "0")}`);
    // January tail: Jan 1..3 (belongs to prior season-year in a wrapping window).
    for (let d = 1; d <= 3; d++) dates.push(`${y}-01-${String(d).padStart(2, "0")}`);
    for (const date of dates) {
      rows.push(obs(station, date, extra));
    }
  }
  return rows;
}

/** Direct domain path: per-season-year mean temp over a window, from the ORIGINAL rows. */
function directSeasonMeans(rows: DailyObservation[], spec: WindowSpec): Map<number, number> {
  const windowDays = expandWindow(spec);
  const bySeason = groupBySeasonYear(rows, spec);
  const out = new Map<number, number>();
  for (const [season, seasonRows] of bySeason) {
    let sum = 0;
    let n = 0;
    for (const r of seasonRows) {
      if (windowDays.has(r.doy) && r.t != null) {
        sum += r.t;
        n += 1;
      }
    }
    if (n > 0) out.set(season, sum / n);
  }
  return out;
}

// Module-scoped temp store, recreated per test, so both the original full-chain suite and the
// added regression suites (WR-01/WR-05/CR-01) share the same fresh `root` fixture.
let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "betra-agg-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("aggregate: full-chain raw -> derived -> decode -> domain", () => {
  // -- Test A: full-chain round-trip, non-wrapping AND wrapping windows --
  it("A: on-disk derived path equals direct domain path for non-wrapping and wrapping windows", () => {
    const years = [2018, 2019, 2020, 2021];
    // Give each year a distinct temp so a boundary miscount would change means.
    const awsRows = seedRows(AWS_STATION, years, (y) => ({ t: (y - 2018) + 1 }));
    upsertPartition(root, AWS_STATION, awsRows);

    let manifest: Manifest = { stations: {} };
    manifest = aggregateStation(root, AWS_STATION, "sj" as StationType, manifest);

    // Read back the emitted derived file via the manifest entry, decode it.
    const entry = manifest.stations[AWS_STATION]!;
    const derivedPath = join(root, entry.file);
    const derived = JSON.parse(readFileSync(derivedPath, "utf8")) as DerivedFile;
    const decoded = decodeDerived(derived);

    // Non-wrapping mid-July window (Jul 12..18 -> doy ~193..199).
    const julStart = leapFoldedDoy("2020-07-12")!;
    const julEnd = leapFoldedDoy("2020-07-18")!;
    const nonWrap: WindowSpec = { startDoy: julStart, endDoy: julEnd };
    const directNonWrap = directSeasonMeans(awsRows, nonWrap);
    const derivedNonWrap = directSeasonMeans(decoded, nonWrap);
    expect(derivedNonWrap).toEqual(directNonWrap);
    expect(directNonWrap.size).toBeGreaterThan(0);

    // Wrapping Dec->Jan window {startDoy:364,endDoy:3}.
    const wrap: WindowSpec = { startDoy: 364, endDoy: 3 };
    const directWrap = directSeasonMeans(awsRows, wrap);
    const derivedWrap = directSeasonMeans(decoded, wrap);
    expect(derivedWrap).toEqual(directWrap);
    expect(directWrap.size).toBeGreaterThan(0);
  });

  it("A2: SYNOP station also round-trips through the on-disk path (wrapping window)", () => {
    const years = [2015, 2016, 2017];
    const synRows = seedRows(SYNOP_STATION, years, (y) => ({ t: (y - 2015) + 10, r: 2 }));
    upsertPartition(root, SYNOP_STATION, synRows);

    let manifest: Manifest = { stations: {} };
    manifest = aggregateStation(root, SYNOP_STATION, "sk" as StationType, manifest);

    const entry = manifest.stations[SYNOP_STATION]!;
    const derived = JSON.parse(
      readFileSync(join(root, entry.file), "utf8"),
    ) as DerivedFile;
    const decoded = decodeDerived(derived);

    const wrap: WindowSpec = { startDoy: 364, endDoy: 3 };
    expect(directSeasonMeans(decoded, wrap)).toEqual(directSeasonMeans(synRows, wrap));
  });

  // -- Test B: touched-only re-derivation --
  it("B: unchanged raw -> byte-identical derived + manifest; changed raw -> only that station re-hashes", () => {
    const years = [2019, 2020, 2021];
    upsertPartition(root, AWS_STATION, seedRows(AWS_STATION, years, (y) => ({ t: y - 2019 })));
    upsertPartition(root, SYNOP_STATION, seedRows(SYNOP_STATION, years, (y) => ({ t: y - 2019, r: 1 })));

    let m: Manifest = { stations: {} };
    m = aggregateStation(root, AWS_STATION, "sj" as StationType, m);
    m = aggregateStation(root, SYNOP_STATION, "sk" as StationType, m);

    const awsHash1 = m.stations[AWS_STATION]!.hash;
    const synHash1 = m.stations[SYNOP_STATION]!.hash;
    const awsFile1 = readFileSync(join(root, m.stations[AWS_STATION]!.file), "utf8");

    // Re-aggregate with NO raw change: hashes + derived bytes byte-identical.
    let m2: Manifest = { stations: {} };
    m2 = aggregateStation(root, AWS_STATION, "sj" as StationType, m2);
    m2 = aggregateStation(root, SYNOP_STATION, "sk" as StationType, m2);
    expect(m2.stations[AWS_STATION]!.hash).toBe(awsHash1);
    expect(m2.stations[SYNOP_STATION]!.hash).toBe(synHash1);
    expect(readFileSync(join(root, m2.stations[AWS_STATION]!.file), "utf8")).toBe(awsFile1);

    // Change ONLY the AWS station's raw rows -> only AWS re-hashes.
    upsertPartition(root, AWS_STATION, seedRows(AWS_STATION, [2022], () => ({ t: 42 })));
    let m3: Manifest = { stations: { ...m2.stations } };
    m3 = aggregateStation(root, AWS_STATION, "sj" as StationType, m3);
    m3 = aggregateStation(root, SYNOP_STATION, "sk" as StationType, m3);
    expect(m3.stations[AWS_STATION]!.hash).not.toBe(awsHash1);
    expect(m3.stations[SYNOP_STATION]!.hash).toBe(synHash1);
  });

  // -- Test C: outputs present + column omission by type --
  it("C: manifest indexes derived/{station}.{hash}.json; AWS omits r, SYNOP omits dv", () => {
    const years = [2018, 2019, 2020];
    upsertPartition(root, AWS_STATION, seedRows(AWS_STATION, years, () => ({ r: 5 })));
    upsertPartition(root, SYNOP_STATION, seedRows(SYNOP_STATION, years, () => ({ r: 5, dv: 90 })));

    let m: Manifest = { stations: {} };
    m = aggregateStation(root, AWS_STATION, "sj" as StationType, m);
    m = aggregateStation(root, SYNOP_STATION, "sk" as StationType, m);

    const awsEntry = m.stations[AWS_STATION]!;
    const synEntry = m.stations[SYNOP_STATION]!;
    expect(awsEntry.file).toBe(`derived/${AWS_STATION}.${awsEntry.hash}.json`);
    expect(synEntry.file).toBe(`derived/${SYNOP_STATION}.${synEntry.hash}.json`);

    const awsDerived = JSON.parse(readFileSync(join(root, awsEntry.file), "utf8")) as DerivedFile;
    const synDerived = JSON.parse(readFileSync(join(root, synEntry.file), "utf8")) as DerivedFile;
    // AWS structurally omits precip column; SYNOP omits wind-direction column.
    expect(awsDerived.cols.r).toBeUndefined();
    expect(synDerived.cols.dv).toBeUndefined();
  });

  // -- Test D: raw never shipped --
  it("D: ship output set is derived/ + stations.json + manifest.json only; raw/ excluded", () => {
    const ship = shipOutputs();
    expect(ship).toContain("derived");
    expect(ship).toContain("stations.json");
    expect(ship).toContain("manifest.json");
    expect(ship).not.toContain("raw");
  });
});

describe("fullStoreQualifyingCounts: stations.json reflects the WHOLE store, not just touched specs", () => {
  it("decodes every manifest station's derived file so an incremental run cannot shrink stations.json", () => {
    // Build a 2-station store: AWS with 4 fully-covered summer years (qualifies), SYNOP with 2.
    // summerRows at fraction 1.0 clears the 80% summer-coverage gate for each year.
    for (const y of [2018, 2019, 2020, 2021]) {
      upsertPartition(root, AWS_STATION, summerRows(AWS_STATION, y, 1.0));
    }
    for (const y of [2020, 2021]) {
      upsertPartition(root, SYNOP_STATION, summerRows(SYNOP_STATION, y, 1.0));
    }
    let manifest: Manifest = { stations: {} };
    manifest = aggregateStation(root, AWS_STATION, "sj" as StationType, manifest);
    manifest = aggregateStation(root, SYNOP_STATION, "sk" as StationType, manifest);

    // An incremental run "touched" only SYNOP — its count is passed in; AWS is untouched.
    const touched = new Map<number, number>([[SYNOP_STATION, 2]]);
    const full = fullStoreQualifyingCounts(root, manifest, touched);

    // AWS (untouched) is recomputed from its on-disk derived file — NOT dropped.
    expect(full.get(AWS_STATION)).toBe(4);
    // SYNOP keeps the freshly-computed touched count (reused, not re-decoded).
    expect(full.get(SYNOP_STATION)).toBe(2);
    // Every manifest station is represented.
    expect(new Set(full.keys())).toEqual(new Set([AWS_STATION, SYNOP_STATION]));
  });

  it("reuses a touched count verbatim instead of re-decoding (touched wins)", () => {
    for (const y of [2018, 2019, 2020, 2021]) {
      upsertPartition(root, AWS_STATION, summerRows(AWS_STATION, y, 1.0));
    }
    let manifest: Manifest = { stations: {} };
    manifest = aggregateStation(root, AWS_STATION, "sj" as StationType, manifest);
    // A sentinel touched count that does NOT match the on-disk data proves reuse (no re-decode).
    const full = fullStoreQualifyingCounts(root, manifest, new Map([[AWS_STATION, 99]]));
    expect(full.get(AWS_STATION)).toBe(99);
  });

  it("contributes 0 (never throws) for a manifest entry whose derived file is missing", () => {
    // Hand-craft a manifest that references a derived file that was never written.
    const manifest: Manifest = {
      stations: {
        [AWS_STATION]: {
          file: "derived/1350.deadbeef.json",
          hash: "deadbeef",
          from: 2000,
          to: 2000,
          lastFetched: "2026-01-01T00:00:00.000Z",
        },
      },
    };
    const full = fullStoreQualifyingCounts(root, manifest, new Map());
    expect(full.get(AWS_STATION)).toBe(0);
  });
});

describe("derived storage stays lean — no stale content-hash accumulation", () => {
  it("pruneOrphanedDerived removes files the manifest does not reference, keeps referenced ones", () => {
    upsertPartition(root, AWS_STATION, seedRows(AWS_STATION, [2020]));
    let manifest: Manifest = { stations: {} };
    manifest = aggregateStation(root, AWS_STATION, "sj" as StationType, manifest);
    const kept = manifest.stations[AWS_STATION]!.file; // "derived/1350.<hash>.json"

    // Simulate stale orphans left by earlier runs (older content-hash versions + a foreign id).
    writeFileSync(join(root, "derived", `${AWS_STATION}.deadbeef00.json`), "{}\n");
    writeFileSync(join(root, "derived", "9999.cafebabe11.json"), "{}\n");
    expect(readdirSync(join(root, "derived")).length).toBe(3);

    const removed = pruneOrphanedDerived(root, manifest);
    expect(removed.sort()).toEqual(
      [`derived/${AWS_STATION}.deadbeef00.json`, "derived/9999.cafebabe11.json"].sort(),
    );
    // Only the manifest-referenced file survives.
    const left = readdirSync(join(root, "derived"));
    expect(left).toEqual([kept.replace("derived/", "")]);
    expect(existsSync(join(root, kept))).toBe(true);
  });

  it("re-aggregating a station whose content changed deletes the SUPERSEDED derived file", () => {
    upsertPartition(root, AWS_STATION, seedRows(AWS_STATION, [2020]));
    let manifest: Manifest = { stations: {} };
    manifest = aggregateStation(root, AWS_STATION, "sj" as StationType, manifest);
    const oldFile = manifest.stations[AWS_STATION]!.file;
    expect(existsSync(join(root, oldFile))).toBe(true);

    // Add another year → different content → new hash → the old file must be pruned on write.
    upsertPartition(root, AWS_STATION, seedRows(AWS_STATION, [2021]));
    manifest = aggregateStation(root, AWS_STATION, "sj" as StationType, manifest);
    const newFile = manifest.stations[AWS_STATION]!.file;

    expect(newFile).not.toBe(oldFile); // content changed → new hash
    expect(existsSync(join(root, newFile))).toBe(true);
    expect(existsSync(join(root, oldFile))).toBe(false); // superseded file gone
    // Exactly one derived file remains for the station.
    expect(readdirSync(join(root, "derived")).length).toBe(1);
  });
});

/**
 * Generate one row per calendar day in Jun 1..Aug 31 of `year`, keeping only the first
 * `fraction` of the summer window's leap-folded days (so we can build a station that just
 * qualifies vs. just misses the 80% coverage gate). `t` defaults present; pass `t: null` via
 * `over` to make those days non-qualifying.
 */
function summerRows(
  station: number,
  year: number,
  fraction: number,
  over: Partial<DailyObservation> = {},
): DailyObservation[] {
  // All leap-folded doys in the summer window, in ascending order.
  const windowDoys: number[] = [];
  for (const [mm, days] of [["06", 30], ["07", 31], ["08", 31]] as const) {
    for (let d = 1; d <= days; d++) {
      const date = `${year}-${mm}-${String(d).padStart(2, "0")}`;
      const doy = leapFoldedDoy(date);
      if (doy === null) continue;
      if (doy >= SUMMER_WINDOW_START_DOY && doy <= SUMMER_WINDOW_END_DOY) windowDoys.push(doy);
    }
  }
  // Emit rows only for the first `fraction` of the window days (rounded), covering that many.
  const keep = Math.floor(windowDoys.length * fraction);
  const rows: DailyObservation[] = [];
  let emitted = 0;
  for (const [mm, days] of [["06", 30], ["07", 31], ["08", 31]] as const) {
    for (let d = 1; d <= days; d++) {
      if (emitted >= keep) break;
      const date = `${year}-${mm}-${String(d).padStart(2, "0")}`;
      const doy = leapFoldedDoy(date);
      if (doy === null) continue;
      if (doy < SUMMER_WINDOW_START_DOY || doy > SUMMER_WINDOW_END_DOY) continue;
      rows.push(obs(station, date, over));
      emitted++;
    }
    if (emitted >= keep) break;
  }
  return rows;
}

describe("WR-03: countQualifyingYears drives the summer-window >=80% gate on real daily rows", () => {
  it("a station with 3 full-summer years just qualifies (>=3 qualifying years)", () => {
    const rows: DailyObservation[] = [];
    for (const y of [2018, 2019, 2020]) rows.push(...summerRows(AWS_STATION, y, 1.0));
    // Each year covers 100% of the summer window -> all 3 qualify -> count 3 (the >=3 bar).
    expect(countQualifyingYears(rows)).toBe(3);
  });

  it("a station just missing coverage in one year drops below the gate", () => {
    const rows: DailyObservation[] = [];
    // Two full years + one year at only ~50% summer coverage (below the 80% gate).
    rows.push(...summerRows(AWS_STATION, 2018, 1.0));
    rows.push(...summerRows(AWS_STATION, 2019, 1.0));
    rows.push(...summerRows(AWS_STATION, 2020, 0.5));
    // Only the two full years qualify -> below the >=3 bar.
    expect(countQualifyingYears(rows)).toBe(2);
  });

  it("null-temperature summer days do NOT count toward coverage even when rows exist", () => {
    // Three years present as ROWS but with t=null everywhere: coverage is 0, none qualify.
    const rows: DailyObservation[] = [];
    for (const y of [2018, 2019, 2020]) rows.push(...summerRows(AWS_STATION, y, 1.0, { t: null }));
    expect(countQualifyingYears(rows)).toBe(0);
  });

  it("a station with rich WINTER data but sparse summer is excluded (documents the policy)", () => {
    // Dense December/January coverage, but no summer rows at all -> summer gate fails.
    const rows: DailyObservation[] = [];
    for (const y of [2018, 2019, 2020, 2021]) {
      for (let d = 1; d <= 28; d++) {
        rows.push(obs(AWS_STATION, `${y}-12-${String(d).padStart(2, "0")}`));
        rows.push(obs(AWS_STATION, `${y}-01-${String(d).padStart(2, "0")}`));
      }
    }
    expect(countQualifyingYears(rows)).toBe(0);
  });
});

describe("WR-05: empty-station derived payload carries the true station id, not 0", () => {
  it("encodeDerived([], type, id) emits station=id (empty backfill)", () => {
    const derived = encodeDerived([], "sj", AWS_STATION);
    expect(derived.station).toBe(AWS_STATION);
    expect(derived.nYears).toBe(0);
  });

  it("aggregateStation on a station with no raw data writes a file whose payload station matches the filename", () => {
    let manifest: Manifest = { stations: {} };
    // No upsert -> no raw partitions for this station: the empty path.
    manifest = aggregateStation(root, SYNOP_STATION, "sk" as StationType, manifest);
    const entry = manifest.stations[SYNOP_STATION]!;
    expect(entry.file).toBe(`derived/${SYNOP_STATION}.${entry.hash}.json`);
    const derived = JSON.parse(readFileSync(join(root, entry.file), "utf8")) as DerivedFile;
    // The in-file station id matches the filename id — not 0.
    expect(derived.station).toBe(SYNOP_STATION);
  });
});

describe("CR-01: aggregate refuses to write outside the store root and rejects bad ids", () => {
  it("aggregateStation rejects a negative / non-integer station id", () => {
    const manifest: Manifest = { stations: {} };
    expect(() => aggregateStation(root, -1, "sj" as StationType, manifest)).toThrow(
      /invalid station id/,
    );
    expect(() => aggregateStation(root, 1.5, "sj" as StationType, manifest)).toThrow(
      /invalid station id/,
    );
  });
});

describe("WR-04: aggregateStationWithDerived returns the encoded file it already wrote", () => {
  it("the returned DerivedFile equals the bytes on disk (no re-read/re-encode needed)", () => {
    const years = [2018, 2019, 2020];
    upsertPartition(root, AWS_STATION, seedRows(AWS_STATION, years, (y) => ({ t: y - 2018 })));

    const { manifest, derived } = aggregateStationWithDerived(
      root,
      AWS_STATION,
      "sj" as StationType,
      { stations: {} },
    );
    const entry = manifest.stations[AWS_STATION]!;
    const onDisk = JSON.parse(readFileSync(join(root, entry.file), "utf8")) as DerivedFile;
    // The returned derived object is byte-equivalent to what was written — the caller can decode
    // it directly instead of re-reading + re-encoding the raw partitions.
    expect(JSON.stringify(derived, null, 2) + "\n").toBe(readFileSync(join(root, entry.file), "utf8"));
    expect(derived.station).toBe(onDisk.station);
    expect(decodeDerived(derived)).toEqual(decodeDerived(onDisk));
  });

  it("aggregateStation still returns just the manifest (backward-compatible)", () => {
    upsertPartition(root, AWS_STATION, seedRows(AWS_STATION, [2018, 2019, 2020]));
    const m = aggregateStation(root, AWS_STATION, "sj" as StationType, { stations: {} });
    expect(m.stations[AWS_STATION]).toBeDefined();
  });
});

describe("WR-01: aggregate keeps the manifest consistent on a mid-loop failure", () => {
  it("persists the manifest for stations that succeeded before a later station throws", () => {
    // Seed two good stations.
    const years = [2018, 2019, 2020];
    upsertPartition(root, AWS_STATION, seedRows(AWS_STATION, years));
    upsertPartition(root, SYNOP_STATION, seedRows(SYNOP_STATION, years));

    const manifestPath = join(root, "manifest.json");
    // Third spec is an invalid id -> aggregateStation throws mid-loop (after two succeed).
    const specs = [
      { type: "sj" as StationType, id: AWS_STATION },
      { type: "sk" as StationType, id: SYNOP_STATION },
      { type: "sj" as StationType, id: -1 },
    ];

    expect(() => aggregateAll(root, manifestPath, specs, { stations: {} })).toThrow();

    // Despite the throw, manifest.json on disk references BOTH stations that succeeded, and
    // every derived file it references actually exists (no orphans).
    const persisted = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
    expect(persisted.stations[AWS_STATION]).toBeDefined();
    expect(persisted.stations[SYNOP_STATION]).toBeDefined();
    for (const id of [AWS_STATION, SYNOP_STATION]) {
      const entry = persisted.stations[id]!;
      expect(existsSync(join(root, entry.file))).toBe(true);
    }
    // Sanity: the persisted manifest serializes byte-identically to what serializeManifest emits.
    expect(readFileSync(manifestPath, "utf8")).toBe(serializeManifest(persisted));
  });
});
