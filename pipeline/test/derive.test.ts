// Derived-format contract tests (TDD RED before derive.ts exists).
//
// These lock the two contracts the whole phase rests on:
//   - the season-year round-trip (encode -> decode -> groupBySeasonYear == direct
//     domain path), INCLUDING a wrapping Dec->Jan window (WR-03), and
//   - the per-station-year gzip size budget (<= 4 KB/station-year) on a REAL fixture.
// Plus null-preservation (never null->0), all-null column drop, and column presence
// by station type (AWS omits r, SYNOP omits dv).
import { describe, it, expect } from "vitest";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { DailyObservation, WindowSpec } from "@betravedur/domain";
import { groupBySeasonYear, leapFoldedDoy } from "@betravedur/domain";
import { encodeDerived, decodeDerived } from "../src/derive.js";

const HERE = dirname(fileURLToPath(import.meta.url));
function loadFixture(name: string): DailyObservation[] {
  return JSON.parse(readFileSync(join(HERE, "fixtures", name), "utf8")) as DailyObservation[];
}

// Build one AWS-flavored DailyObservation (dv present, r structurally null).
function awsRow(date: string, over: Partial<DailyObservation> = {}): DailyObservation {
  const doy = leapFoldedDoy(date);
  if (doy === null) throw new Error(`bad test date ${date}`);
  return {
    station: 99,
    date,
    doy,
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

// Season-keyed mean of a metric via the domain grouping path — the reference the
// round-trip must reproduce exactly.
function seasonMeans(
  rows: DailyObservation[],
  spec: WindowSpec,
  metric: keyof DailyObservation,
): Map<number, { n: number; mean: number | null }> {
  const grouped = groupBySeasonYear(rows, spec);
  const out = new Map<number, { n: number; mean: number | null }>();
  for (const [season, srows] of grouped) {
    const vals = srows
      .map((r) => r[metric])
      .filter((v): v is number => typeof v === "number");
    const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    out.set(season, { n: srows.length, mean });
  }
  return out;
}

describe("derive: round-trip", () => {
  it("round-trip a NON-wrapping window is lossless within quantization and season-identical", () => {
    // >=4 calendar years of AWS rows across a mid-July window.
    const rows: DailyObservation[] = [];
    for (const year of [2010, 2011, 2012, 2013]) {
      for (let day = 15; day <= 25; day++) {
        rows.push(
          awsRow(`${year}-07-${String(day).padStart(2, "0")}`, {
            t: 10 + (day % 5) + year - 2010,
            f: 2 + (day % 3),
            dv: (day * 30) % 360,
          }),
        );
      }
    }
    const decoded = decodeDerived(encodeDerived(rows, "sj"));

    // Every original row survives (matched by date) with values within one quant unit.
    for (const orig of rows) {
      const back = decoded.find((d) => d.date === orig.date);
      expect(back, `missing decoded row for ${orig.date}`).toBeDefined();
      if (!back) continue;
      expect(back.t).toBeCloseTo(orig.t as number, 0);
      expect(back.f).toBeCloseTo(orig.f as number, 0);
      expect(back.dv).toBe(orig.dv); // dv quantized ×1 (whole degrees)
      expect(back.r).toBeNull(); // AWS: r stays null
    }

    // Season grouping is byte-identical to the direct domain path.
    const spec: WindowSpec = { startDoy: 196, endDoy: 206 };
    const ref = seasonMeans(rows, spec, "t");
    const got = seasonMeans(decoded, spec, "t");
    expect([...got.keys()].sort()).toEqual([...ref.keys()].sort());
    for (const [season, r] of ref) {
      expect(got.get(season)!.n).toBe(r.n);
      expect(got.get(season)!.mean!).toBeCloseTo(r.mean!, 5);
    }
  });

  it("round-trip a WRAPPING Dec->Jan window {startDoy:364,endDoy:3} keeps Dec-head-owns-year (WR-03)", () => {
    // Rows straddling year boundaries: late Dec + early Jan across three seasons.
    const rows: DailyObservation[] = [];
    for (const year of [2010, 2011, 2012, 2013]) {
      // late December (doy 364 = Dec 30, 365 = Dec 31)
      rows.push(awsRow(`${year}-12-30`, { t: -3 + year - 2010 }));
      rows.push(awsRow(`${year}-12-31`, { t: -4 + year - 2010 }));
      // early January (doy 1 = Jan 1, 2 = Jan 2, 3 = Jan 3)
      rows.push(awsRow(`${year}-01-01`, { t: -1 + year - 2010 }));
      rows.push(awsRow(`${year}-01-02`, { t: -2 + year - 2010 }));
    }
    const spec: WindowSpec = { startDoy: 364, endDoy: 3 };
    const decoded = decodeDerived(encodeDerived(rows, "sj"));

    const ref = seasonMeans(rows, spec, "t");
    const got = seasonMeans(decoded, spec, "t");

    // Season keys must cross a year boundary: e.g. Jan 2011 tail belongs to season 2010.
    expect([...ref.keys()].sort()).toEqual([...got.keys()].sort());
    // Sanity: at least one season pairs a December head with the following January tail.
    expect([...ref.keys()]).toContain(2010);
    for (const [season, r] of ref) {
      const g = got.get(season)!;
      expect(g.n).toBe(r.n); // identical per-season N (off-by-one would fail here)
      expect(g.mean!).toBeCloseTo(r.mean!, 5); // identical per-season mean
    }
  });
});

describe("derive: null preservation", () => {
  it("preserves null cells (never coerces to 0) through a round-trip", () => {
    const rows = [
      awsRow("2010-06-01", { t: null, f: 4 }),
      awsRow("2010-06-02", { t: 7, f: null }),
    ];
    const decoded = decodeDerived(encodeDerived(rows, "sj"));
    const d1 = decoded.find((d) => d.date === "2010-06-01")!;
    const d2 = decoded.find((d) => d.date === "2010-06-02")!;
    expect(d1.t).toBeNull();
    expect(d1.t).not.toBe(0);
    expect(d2.f).toBeNull();
    expect(d2.f).not.toBe(0);
  });

  it("drops all-null columns from cols and reconstructs them as null", () => {
    const rows = [awsRow("2010-06-01"), awsRow("2010-06-02")];
    const enc = encodeDerived(rows, "sj");
    // AWS: r is structurally null everywhere -> the r column is DROPPED.
    expect("r" in enc.cols).toBe(false);
    const decoded = decodeDerived(enc);
    for (const d of decoded) expect(d.r).toBeNull();
  });
});

describe("derive: column presence by type", () => {
  it("AWS (sj) output has no r column; SYNOP (sk) output has no dv column", () => {
    const awsRows = [awsRow("2010-06-01", { dv: 90 })];
    const synopRows: DailyObservation[] = [
      { station: 1, date: "2010-06-01", doy: leapFoldedDoy("2010-06-01")!, t: 5, tx: null, tn: null, f: 3, fx: null, fg: null, dv: null, r: 2.4 },
    ];
    const awsEnc = encodeDerived(awsRows, "sj");
    const synopEnc = encodeDerived(synopRows, "sk");
    expect("r" in awsEnc.cols).toBe(false);
    expect("dv" in awsEnc.cols).toBe(true);
    expect("dv" in synopEnc.cols).toBe(false);
    expect("r" in synopEnc.cols).toBe(true);
  });
});

describe("derive: size budget", () => {
  it("real AWS fixture stays under 4096 bytes gzip per station-year", () => {
    const kef = loadFixture("kef-aws-multiyear.json");
    const nYears = new Set(kef.map((r) => r.date.slice(0, 4))).size;
    const enc = encodeDerived(kef, "sj");
    const bytes = gzipSync(Buffer.from(JSON.stringify(enc)), { level: 9 }).length;
    const perYear = bytes / nYears;
    // Recorded measurement lands well under headroom; assert the budget.
    expect(perYear).toBeLessThan(4096);
  });
});
