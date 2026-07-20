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
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DailyObservation, StationType, WindowSpec } from "@betravedur/domain";
import {
  groupBySeasonYear,
  expandWindow,
  qualifyingYears,
} from "@betravedur/domain";
import { upsertPartition } from "../src/rawstore.js";
import { decodeDerived } from "../src/derive.js";
import type { DerivedFile } from "../src/derive.js";
import {
  aggregateStation,
  shipOutputs,
} from "../src/aggregate.js";
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

describe("aggregate: full-chain raw -> derived -> decode -> domain", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "betra-agg-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

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
