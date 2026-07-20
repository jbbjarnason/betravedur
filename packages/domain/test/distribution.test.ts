import { describe, expect, it } from "vitest";
import {
  percentile,
  perDoyDistribution,
  perDoyPrecip,
} from "../src/distribution.js";
import type { DailyObservation } from "../src/types.js";

// Minimal row factory — only the fields under test matter. `date` must carry a real
// year (the season-year grouping keys on date.slice(0,4)) and the doy the test sets.
function obs(
  year: number,
  doy: number,
  fields: Partial<Pick<DailyObservation, "t" | "f" | "r">> = {},
): DailyObservation {
  return {
    station: 1,
    date: `${year}-01-01`,
    doy,
    t: fields.t ?? null,
    tx: null,
    tn: null,
    f: fields.f ?? null,
    fx: null,
    fg: null,
    dv: null,
    r: fields.r ?? null,
  };
}

// ---------------------------------------------------------------------------
// percentile — type-7 linear interpolation (pinned so the box edges are stable).
// ---------------------------------------------------------------------------
describe("percentile — type-7 linear interpolation", () => {
  it("returns the single element for a 1-length array at any p", () => {
    expect(percentile([5], 0)).toBe(5);
    expect(percentile([5], 0.5)).toBe(5);
    expect(percentile([5], 1)).toBe(5);
  });

  it("p=0 returns the minimum, p=1 returns the maximum", () => {
    const x = [1, 2, 3, 4];
    expect(percentile(x, 0)).toBe(1);
    expect(percentile(x, 1)).toBe(4);
  });

  it("p=0.5 on [1,2,3,4] interpolates to 2.5 (type-7 median)", () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
  });

  it("median of an odd-length array is the middle order statistic", () => {
    expect(percentile([1, 2, 3], 0.5)).toBe(2);
  });

  it("interpolates between order statistics (p=0.1 on 0..10 -> 1)", () => {
    const x = Array.from({ length: 11 }, (_, i) => i); // 0..10
    expect(percentile(x, 0.1)).toBeCloseTo(1, 10);
    expect(percentile(x, 0.9)).toBeCloseTo(9, 10);
  });
});

// ---------------------------------------------------------------------------
// perDoyDistribution — per-doy 5-number summary across qualifying years.
// ---------------------------------------------------------------------------
describe("perDoyDistribution — per-doy 5-number summary", () => {
  const WINDOW = { startDoy: 1, endDoy: 3 };

  // 3 qualifying years, full coverage of the 3-day window, distinct temps per year.
  function threeGoodYears(): DailyObservation[] {
    const rows: DailyObservation[] = [];
    for (const [year, base] of [
      [2018, 10],
      [2019, 12],
      [2020, 14],
    ] as const) {
      for (const doy of [1, 2, 3]) rows.push(obs(year, doy, { t: base }));
    }
    return rows;
  }

  it("returns { sufficient:false } below the N>=3 gate", () => {
    // Only 2 qualifying years (each fully covers the window) -> effectiveN < 3.
    const rows: DailyObservation[] = [];
    for (const year of [2019, 2020]) {
      for (const doy of [1, 2, 3]) rows.push(obs(year, doy, { t: 10 }));
    }
    const res = perDoyDistribution(rows, WINDOW, undefined, (o) => o.t);
    expect(res.sufficient).toBe(false);
  });

  it("emits per-doy [min,p10,p50,p90,max] across qualifying years when sufficient", () => {
    const res = perDoyDistribution(threeGoodYears(), WINDOW, undefined, (o) => o.t);
    expect(res.sufficient).toBe(true);
    if (!res.sufficient) return;
    expect(res.n).toBe(3);
    const box = res.perDoy[0];
    expect(box.missing).toBeFalsy();
    if (box.missing) return;
    // Values per doy across years are [10,12,14].
    expect(box.min).toBe(10);
    expect(box.max).toBe(14);
    expect(box.p50).toBe(12);
    expect(box.doy).toBe(1);
  });

  it("emits { doy, missing:true } for a doy with zero qualifying values (never a zero box)", () => {
    // Qualify 3 years on the 3-day window, but doy 2 has NO temp in any qualifying
    // year (null everywhere) while doys 1 and 3 carry temp -> still >=80% coverage.
    const window5 = { startDoy: 1, endDoy: 5 };
    const rows: DailyObservation[] = [];
    for (const year of [2018, 2019, 2020]) {
      for (const doy of [1, 3, 4, 5]) rows.push(obs(year, doy, { t: 10 + year - 2018 }));
      // doy 2 present as a row but with null temp (a real gap, not a zero)
      rows.push(obs(year, 2, { t: null }));
    }
    const res = perDoyDistribution(rows, window5, undefined, (o) => o.t);
    expect(res.sufficient).toBe(true);
    if (!res.sufficient) return;
    const doy2 = res.perDoy.find((d) => d.doy === 2);
    expect(doy2).toBeDefined();
    expect(doy2!.missing).toBe(true);
    // A missing entry is an explicit gap, NOT a zero-valued box.
    expect((doy2 as { min?: number }).min).toBeUndefined();
  });

  it("wrap-around window: perDoy[0].doy is the window START doy, not numeric 1", () => {
    // Dec->Jan wrap: startDoy 364, endDoy 2 -> window order [364, 365, 1, 2].
    const wrap = { startDoy: 364, endDoy: 2 };
    const rows: DailyObservation[] = [];
    // Three season-years each covering the wrapping window. groupBySeasonYear assigns
    // the January tail (doy<=2) to the PREVIOUS calendar year, so build accordingly.
    for (const decYear of [2017, 2018, 2019]) {
      // December head (doy 364,365) in decYear
      rows.push({ ...obs(decYear, 364, { t: 5 }), date: `${decYear}-12-30` });
      rows.push({ ...obs(decYear, 365, { t: 5 }), date: `${decYear}-12-31` });
      // January tail (doy 1,2) in the FOLLOWING calendar year
      rows.push({ ...obs(decYear + 1, 1, { t: 5 }), date: `${decYear + 1}-01-01` });
      rows.push({ ...obs(decYear + 1, 2, { t: 5 }), date: `${decYear + 1}-01-02` });
    }
    const res = perDoyDistribution(rows, wrap, undefined, (o) => o.t);
    expect(res.sufficient).toBe(true);
    if (!res.sufficient) return;
    expect(res.perDoy[0].doy).toBe(364);
    expect(res.perDoy.map((d) => d.doy)).toEqual([364, 365, 1, 2]);
  });

  it("respects a yearRange filter (only in-range years contribute to N)", () => {
    // 4 good years, but restrict to a 2-year range -> below the gate.
    const rows: DailyObservation[] = [];
    for (const year of [2017, 2018, 2019, 2020]) {
      for (const doy of [1, 2, 3]) rows.push(obs(year, doy, { t: 10 }));
    }
    const res = perDoyDistribution(
      rows,
      WINDOW,
      { from: 2019, til: 2020 },
      (o) => o.t,
    );
    expect(res.sufficient).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// perDoyPrecip — per-doy MEDIAN total across qualifying years; honest missing.
// ---------------------------------------------------------------------------
describe("perDoyPrecip — per-doy median precip total (honest missing)", () => {
  const WINDOW = { startDoy: 1, endDoy: 3 };

  it("uses the MEDIAN total across qualifying years (robust to one wet year)", () => {
    // doy 1 rain across 3 qualifying years = [1, 2, 100] -> median 2 (NOT the mean ~34).
    const rows: DailyObservation[] = [];
    const rainByYear: Record<number, number> = { 2018: 1, 2019: 2, 2020: 100 };
    for (const year of [2018, 2019, 2020]) {
      rows.push(obs(year, 1, { r: rainByYear[year] }));
      rows.push(obs(year, 2, { r: rainByYear[year] }));
      rows.push(obs(year, 3, { r: rainByYear[year] }));
    }
    const res = perDoyPrecip(rows, WINDOW, undefined);
    expect(res.sufficient).toBe(true);
    if (!res.sufficient) return;
    const doy1 = res.perDoy.find((d) => d.doy === 1)!;
    expect(doy1.missing).toBeFalsy();
    if (doy1.missing) return;
    expect(doy1.value).toBe(2); // median, not mean
  });

  it("emits missing:true (never 0) for a doy with no qualifying rain", () => {
    // A 10-day window: rain present on 9 of 10 doys (90% coverage >= 0.8 so years qualify),
    // but doy 5 has null rain in every qualifying year -> that doy is an explicit gap, never
    // a zero bar. This isolates a per-doy missing bucket inside an otherwise-covered window.
    const window10 = { startDoy: 1, endDoy: 10 };
    const rows: DailyObservation[] = [];
    for (const year of [2018, 2019, 2020]) {
      for (let doy = 1; doy <= 10; doy++) {
        rows.push(obs(year, doy, { r: doy === 5 ? null : 5 }));
      }
    }
    const res = perDoyPrecip(rows, window10, undefined);
    expect(res.sufficient).toBe(true);
    if (!res.sufficient) return;
    const doy5 = res.perDoy.find((d) => d.doy === 5)!;
    expect(doy5.missing).toBe(true);
    expect((doy5 as { value?: number }).value).toBeUndefined();
  });

  it("returns { sufficient:false } when the r column is absent (AWS 'án úrkomu')", () => {
    // No rain anywhere -> zero qualifying years for precip -> below gate, never a zero bar.
    const rows: DailyObservation[] = [];
    for (const year of [2018, 2019, 2020]) {
      for (const doy of [1, 2, 3]) rows.push(obs(year, doy, { r: null }));
    }
    const res = perDoyPrecip(rows, WINDOW, undefined);
    expect(res.sufficient).toBe(false);
  });
});
