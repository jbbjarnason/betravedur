// End-to-end skeleton test: the happy-path fetch -> domain chain.
//
// Always-on (offline) assertions verify the chain is wired: the fetch layer's
// functions are exported and importable, and the demo's domain imports resolve.
//
// Live assertions (gated by BETRA_LIVE) hit the real api.vedur.is and verify the
// structural AWS(dv-present/rain-absent) vs SYNOP(rain-present) split on real data.

import { describe, expect, it } from "vitest";
import * as fetchPkg from "@betravedur/fetch";
import { fetchAwsDay, fetchSynopDay, fetchStations } from "@betravedur/fetch";
import {
  circularMeanDirection,
  combine,
  effectiveN,
  expandWindow,
  leapFoldedDoy,
  qualifyingYears,
  rainComponent,
  scalarMeanSpeed,
  sumPerYearThenAverage,
  tempComponent,
  windComponent,
  type DailyObservation,
} from "@betravedur/domain";

const LIVE = !!process.env.BETRA_LIVE;

/** Build one in-window day for a given year/doy with the metrics we care about. */
function day(
  station: number,
  date: string,
  doy: number,
  fields: Partial<Pick<DailyObservation, "t" | "f" | "dv" | "r">>,
): DailyObservation {
  return {
    station,
    date,
    doy,
    t: fields.t ?? null,
    tx: null,
    tn: null,
    f: fields.f ?? null,
    fx: null,
    fg: null,
    dv: fields.dv ?? null,
    r: fields.r ?? null,
  };
}

/** Group a flat list of rows into a per-year map (year parsed from the date). */
function byYear(rows: DailyObservation[]): Map<number, DailyObservation[]> {
  const m = new Map<number, DailyObservation[]>();
  for (const r of rows) {
    const y = Number(r.date.slice(0, 4));
    (m.get(y) ?? m.set(y, []).get(y)!).push(r);
  }
  return m;
}

describe("skeleton chain — offline (always on)", () => {
  it("exports fetchAwsDay and fetchSynopDay from @betravedur/fetch", () => {
    expect(typeof fetchAwsDay).toBe("function");
    expect(typeof fetchSynopDay).toBe("function");
    expect(typeof fetchStations).toBe("function");
    expect(typeof fetchPkg.fetchWithRetry).toBe("function");
  });

  it("the demo's domain functions are importable (boundary is real)", () => {
    expect(typeof expandWindow).toBe("function");
    expect(typeof circularMeanDirection).toBe("function");
    expect(typeof scalarMeanSpeed).toBe("function");
  });
});

describe("skeleton chain — offline FULL CHAIN (deterministic, no network)", () => {
  // A mid-July window; leap-folded doy is identical every year (window.ts).
  const WINDOW = expandWindow({
    startDoy: leapFoldedDoy("2011-07-15")!,
    endDoy: leapFoldedDoy("2011-07-17")!,
  });
  const DOYS = [...WINDOW].sort((a, b) => a - b); // 3 window days per year

  /** 3 years x 3 window days = full coverage; drives N>=3 sufficiency. */
  function buildRows(
    station: number,
    perDay: (year: number, dayIdx: number) => Partial<
      Pick<DailyObservation, "t" | "f" | "dv" | "r">
    >,
  ): DailyObservation[] {
    const rows: DailyObservation[] = [];
    for (const year of [2011, 2012, 2013]) {
      DOYS.forEach((doy, i) => {
        const dd = String(15 + i).padStart(2, "0");
        rows.push(day(station, `${year}-07-${dd}`, doy, perDay(year, i)));
      });
    }
    return rows;
  }

  it("SYNOP: full chain (expandWindow -> qualifyingYears -> means -> components -> combine) yields a 3-component CombinedScore", () => {
    // SYNOP has temp + wind speed + rain (no wind direction).
    const rows = buildRows(1, () => ({ t: 12, f: 4, r: 1.5 }));
    const rowsByYear = byYear(rows);

    const tempYears = qualifyingYears(rowsByYear, WINDOW, (o) => o.t);
    const { n, sufficient } = effectiveN(tempYears);
    expect(n).toBe(3);
    expect(sufficient).toBe(true);

    const inWindow = rows.filter((r) => WINDOW.has(r.doy));
    const meanTemp = scalarMeanSpeed(inWindow.map((r) => r.t));
    const meanSpeed = scalarMeanSpeed(inWindow.map((r) => r.f));
    const rainYears = qualifyingYears(rowsByYear, WINDOW, (o) => o.r);
    const typicalRain = sumPerYearThenAverage(rowsByYear, WINDOW, rainYears);

    expect(meanTemp).toBe(12);
    expect(meanSpeed).toBe(4);
    expect(typicalRain).toBe(4.5); // 3 days * 1.5mm summed per year, averaged

    const score = combine({
      temp: tempComponent(meanTemp!),
      wind: windComponent(meanSpeed!),
      rain: rainComponent(typicalRain!),
    });

    expect(typeof score.score).toBe("number");
    expect(score.score).toBeGreaterThan(0);
    expect(score.score).toBeLessThanOrEqual(10);
    expect(score.contributing.slice().sort()).toEqual(["rain", "temp", "wind"]);
    expect(score.missingRain).toBe(false);
  });

  it("AWS: full chain with structurally-null rain yields a renormalized 2-component score + missingRain", () => {
    // AWS has temp + wind (speed + direction); rain is structurally null.
    const rows = buildRows(1350, () => ({ t: 15, f: 3, dv: 200 }));
    const rowsByYear = byYear(rows);

    const tempYears = qualifyingYears(rowsByYear, WINDOW, (o) => o.t);
    const { n, sufficient } = effectiveN(tempYears);
    expect(n).toBe(3);
    expect(sufficient).toBe(true);

    const inWindow = rows.filter((r) => WINDOW.has(r.doy));
    const meanTemp = scalarMeanSpeed(inWindow.map((r) => r.t));
    const meanSpeed = scalarMeanSpeed(inWindow.map((r) => r.f));
    const meanDir = circularMeanDirection(
      inWindow
        .filter((r) => r.dv != null && r.f != null)
        .map((r) => ({ speed: r.f as number, dirDeg: r.dv as number })),
    );
    // AWS: rain not scored (structurally null).
    const rainYears = qualifyingYears(rowsByYear, WINDOW, (o) => o.r);
    const typicalRain = sumPerYearThenAverage(rowsByYear, WINDOW, rainYears);

    expect(meanTemp).toBe(15);
    expect(meanSpeed).toBe(3);
    expect(meanDir?.dirDeg).toBeCloseTo(200, 0);
    expect(typicalRain).toBeNull(); // no qualifying rain years -> null

    const score = combine({
      temp: tempComponent(meanTemp!),
      wind: windComponent(meanSpeed!),
      rain: typicalRain != null ? rainComponent(typicalRain) : null,
    });

    expect(typeof score.score).toBe("number");
    expect(score.score).toBeGreaterThan(0);
    expect(score.contributing.slice().sort()).toEqual(["temp", "wind"]);
    expect(score.missingRain).toBe(true);
  });

  it("N<3: too few qualifying years is not scored (ófullnægjandi gögn gate)", () => {
    // Only 2 years of data -> effectiveN.sufficient === false.
    const rows: DailyObservation[] = [];
    for (const year of [2011, 2012]) {
      DOYS.forEach((doy, i) => {
        const dd = String(15 + i).padStart(2, "0");
        rows.push(day(1350, `${year}-07-${dd}`, doy, { t: 15, f: 3 }));
      });
    }
    const tempYears = qualifyingYears(byYear(rows), WINDOW, (o) => o.t);
    const { n, sufficient } = effectiveN(tempYears);
    expect(n).toBe(2);
    expect(sufficient).toBe(false);
  });
});

describe("skeleton chain — demo chain driven offline (computeStation export)", () => {
  // Importing the demo module must be side-effect free (IN-04 guard) so the
  // e2e test can drive the EXACT chain the demo runs, instead of re-implementing it.
  it("WR-10 regression: rain with only 1 qualifying year is NOT scored, even when temp/wind qualify", async () => {
    const { computeStation, WINDOW } = await import("../../scripts/skeleton-demo");
    const doys = [...WINDOW].sort((a, b) => a - b);
    const rows: DailyObservation[] = [];
    for (const year of [2011, 2012, 2013]) {
      doys.forEach((doy, i) => {
        const dd = String(15 + i).padStart(2, "0");
        rows.push(
          day(1, `${year}-07-${dd}`, doy, {
            t: 12,
            f: 4,
            // rain present ONLY in 2011 -> rainYears = [2011], fails its own N>=3 gate
            r: year === 2011 ? 1.5 : null,
          }),
        );
      });
    }
    const rep = computeStation(rows, "SYNOP");
    expect(rep.nTemp).toBe(3);
    expect(rep.nWind).toBe(3);
    expect(rep.nRain).toBe(1);
    expect(rep.sufficient).toBe(true);
    expect(rep.typicalRain).toBeNull(); // gated: 1 qualifying rain year < 3
    expect(rep.combined!.contributing.slice().sort()).toEqual(["temp", "wind"]);
    expect(rep.combined!.missingRain).toBe(true);
  });

  it("WR-11 regression: means pool only qualifying years — a sparse hot year cannot bias the mean", async () => {
    const { computeStation, WINDOW } = await import("../../scripts/skeleton-demo");
    const doys = [...WINDOW].sort((a, b) => a - b);
    const rows: DailyObservation[] = [];
    for (const year of [2011, 2012, 2013]) {
      doys.forEach((doy, i) => {
        const dd = String(15 + i).padStart(2, "0");
        rows.push(day(1350, `${year}-07-${dd}`, doy, { t: 10, f: 3, dv: 200 }));
      });
    }
    // 2014: only 2 of 11 window days (fails the 80% gate) with an extreme temp.
    rows.push(day(1350, "2014-07-15", doys[0]!, { t: 40, f: 30, dv: 10 }));
    rows.push(day(1350, "2014-07-16", doys[1]!, { t: 40, f: 30, dv: 10 }));

    const rep = computeStation(rows, "AWS");
    expect(rep.nTemp).toBe(3); // 2014 does not qualify
    expect(rep.meanTemp).toBe(10); // pooled ONLY over qualifying years, not 2014's 40s
    expect(rep.meanSpeed).toBe(3);
    expect(rep.meanDir?.dirDeg).toBeCloseTo(200, 0);
  });
});

describe("skeleton chain — live (BETRA_LIVE)", () => {
  it.skipIf(!LIVE)(
    "AWS rows have wind direction present and precipitation null",
    async () => {
      const rows = await fetchAwsDay([1350], "2024-07-15", "2024-07-16");
      expect(rows.length).toBeGreaterThan(0);
      const first = rows[0]!;
      expect(first.station).toBe(1350);
      expect(first.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(first.dv).not.toBeNull(); // wind direction present on AWS
      expect(first.r).toBeNull(); // precipitation structurally null on AWS
    },
    30_000,
  );

  it.skipIf(!LIVE)(
    "SYNOP rows have precipitation present and wind direction null",
    async () => {
      const rows = await fetchSynopDay([1], "2024-09-01", "2024-09-02");
      expect(rows.length).toBeGreaterThan(0);
      const withRain = rows.find((r) => r.r != null);
      expect(withRain).toBeDefined(); // precipitation present on SYNOP
      expect(rows[0]!.dv).toBeNull(); // wind direction structurally null on SYNOP
    },
    30_000,
  );

  it.skipIf(!LIVE)(
    "station metadata returns real names",
    async () => {
      const meta = await fetchStations([1350, 1]);
      const kef = meta.find((m) => m.station === 1350);
      expect(kef?.name).toBeTruthy();
    },
    30_000,
  );
});
