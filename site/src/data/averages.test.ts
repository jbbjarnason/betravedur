// Unit tests for the period → MarkerDatum transform (MAP-02).
//
// Exercised against the REAL committed derived sample (decoded via decodeDerived from
// the /derive subpath) plus a couple of synthetic fixtures that pin the "breytileg átt"
// (near-cancelling direction) and "ófullnægjandi gögn" (N < 3) edge paths deterministically.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  encodeDerived,
  type DerivedFile,
} from "@betravedur/pipeline/derive";
import type { DailyObservation, StationMeta } from "@betravedur/domain";
import { computeMarkerDatum } from "./averages.js";
import { DEFAULT_WINDOW } from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, "..", "..", "public", "data");

function loadDerived(file: string): DerivedFile {
  return JSON.parse(readFileSync(join(DATA, file), "utf8")) as DerivedFile;
}

const STATIONS: StationMeta[] = JSON.parse(
  readFileSync(join(DATA, "stations.json"), "utf8"),
);
const meta = (id: number): StationMeta => {
  const m = STATIONS.find((s) => s.station === id);
  if (!m) throw new Error(`no station meta ${id}`);
  return m;
};

// Reykjavík #1 is SYNOP (sk): has precip, NO wind direction (dv column absent).
// Keflavík #1350 is AWS (sj): has wind direction, NO precip ("án úrkomu").
const SYNOP_1 = loadDerived("derived/1.c1cf25669d53.json");
const AWS_1350 = loadDerived("derived/1350.eaecfc5ae78f.json");

describe("computeMarkerDatum — real sample, default window", () => {
  it("temp mean + effective-N gate (SYNOP #1, deep history)", () => {
    const d = computeMarkerDatum(meta(1), SYNOP_1, DEFAULT_WINDOW);
    expect(d.sufficient).toBe(true);
    expect(d.n).toBeGreaterThanOrEqual(3);
    // n reflects qualifying DATA-coverage years, not the 14-day picker span.
    expect(d.n).toBeGreaterThan(14);
    expect(d.tempC).not.toBeNull();
    // WR-01: per-year mean over qualifying years, then equal-weight average of those
    // year-means (NOT the old flat pool over all in-window rows, which was ~11.3683).
    expect(d.tempC!).toBeCloseTo(11.3728, 3);
    // Identity carried through for the renderer.
    expect(d.station).toBe(1);
    expect(d.name).toBe("Reykjavík");
    expect(d.lon).toBeCloseTo(-21.9082, 3);
    expect(d.lat).toBeCloseTo(64.1289, 3);
  });

  it("'án úrkomu': AWS #1350 has no rain → hasPrecip=false but is STILL a datum", () => {
    const d = computeMarkerDatum(meta(1350), AWS_1350, DEFAULT_WINDOW);
    expect(d.hasPrecip).toBe(false); // án úrkomu
    // Still emitted with real metrics — never hidden, never a zero.
    expect(d.station).toBe(1350);
    expect(d.tempC).not.toBeNull();
    expect(d.windSpeed).not.toBeNull();
  });

  it("precip present: SYNOP #1 records rain in-window → hasPrecip=true", () => {
    const d = computeMarkerDatum(meta(1), SYNOP_1, DEFAULT_WINDOW);
    expect(d.hasPrecip).toBe(true);
  });

  it("wind: AWS #1350 has a real direction (resultantSpeed ≥ 0.5)", () => {
    const d = computeMarkerDatum(meta(1350), AWS_1350, DEFAULT_WINDOW);
    expect(d.windVariable).toBe(false);
    expect(d.windDir).not.toBeNull();
    // WR-02: direction & speed are now computed from the qualifying-year in-window
    // rows only (not the full unfiltered span), so the values shift slightly.
    expect(d.windDir!).toBeCloseTo(41.0594, 2);
    expect(d.windSpeed!).toBeCloseTo(5.2376, 3);
  });

  it("'breytileg átt': SYNOP #1 has no wind-direction column → windVariable, windDir null", () => {
    // SYNOP omits dv entirely → circularMeanDirection returns null → variable.
    const d = computeMarkerDatum(meta(1), SYNOP_1, DEFAULT_WINDOW);
    expect(d.windVariable).toBe(true);
    expect(d.windDir).toBeNull();
    // Scalar mean speed is still available even when direction is variable.
    expect(d.windSpeed).not.toBeNull();
  });
});

describe("computeMarkerDatum — synthetic edge fixtures", () => {
  // Build a synthetic derived file from raw rows via encodeDerived (pure, /derive subpath).
  function synth(
    station: number,
    type: StationMeta["type"],
    rows: DailyObservation[],
  ): DerivedFile {
    return encodeDerived(rows, type, station);
  }

  function row(
    station: number,
    date: string,
    doy: number,
    over: Partial<DailyObservation>,
  ): DailyObservation {
    return {
      station,
      date,
      doy,
      t: null,
      tx: null,
      tn: null,
      f: null,
      fx: null,
      fg: null,
      dv: null,
      r: null,
      ...over,
    };
  }

  const synthMeta = (id: number, type: StationMeta["type"]): StationMeta => ({
    station: id,
    name: `Synthetic ${id}`,
    type,
    owner: "test",
    lat: 65,
    lon: -19,
    ele: 0,
    start: 2000,
    ending: null,
  });

  it("'breytileg átt': near-cancelling directions → windVariable, windDir null, speed present", () => {
    // Two opposing 10 m/s samples (0° and 180°) at equal speed cancel to resultant ~0,
    // well under the 0.5 threshold → variable direction, but a scalar mean speed remains.
    const rows: DailyObservation[] = [];
    // Fill 3 full years of the window so coverage/N is not the thing under test.
    for (let y = 2000; y <= 2002; y++) {
      for (let doy = DEFAULT_WINDOW.startDoy; doy <= DEFAULT_WINDOW.endDoy; doy++) {
        // date reconstruction only needs a valid YYYY for grouping; use a fixed month/day.
        const dir = doy % 2 === 0 ? 0 : 180;
        rows.push(
          row(2, `${y}-07-16`, doy, { t: 10, f: 10, dv: dir }),
        );
      }
    }
    const file = synth(2, "sj", rows);
    const d = computeMarkerDatum(synthMeta(2, "sj"), file, DEFAULT_WINDOW);
    expect(d.windVariable).toBe(true);
    expect(d.windDir).toBeNull();
    expect(d.windSpeed).not.toBeNull();
    expect(d.windSpeed!).toBeCloseTo(10, 5);
  });

  it("'ófullnægjandi gögn': fewer than 3 qualifying years → sufficient=false, tempC=null, no throw", () => {
    // Only 2 years of full-window temp coverage → effectiveN.sufficient === false.
    const rows: DailyObservation[] = [];
    for (let y = 2000; y <= 2001; y++) {
      for (let doy = DEFAULT_WINDOW.startDoy; doy <= DEFAULT_WINDOW.endDoy; doy++) {
        rows.push(row(3, `${y}-07-16`, doy, { t: 8, f: 3, dv: 90 }));
      }
    }
    const file = synth(3, "sj", rows);
    const d = computeMarkerDatum(synthMeta(3, "sj"), file, DEFAULT_WINDOW);
    expect(d.sufficient).toBe(false);
    expect(d.n).toBeLessThan(3);
    expect(d.tempC).toBeNull(); // muted "ófullnægjandi gögn"
    // WR-02: below the N-gate EVERY metric collapses to the muted state — not just
    // temp. No confident wind arrow/speed or precip drop on data too thin to qualify,
    // even though the rows carry real f/dv/r values.
    expect(d.windSpeed).toBeNull();
    expect(d.windVariable).toBe(true);
    expect(d.windDir).toBeNull();
    expect(d.hasPrecip).toBe(false);
  });

  it("WR-01: a barely-covered (non-qualifying) year is EXCLUDED and qualifying years are equally weighted", () => {
    // Window is 14 days (197–210); ≥80% coverage needs ≥12 covered days.
    // Three FULLY-covered years at t=10 (qualify), plus one thin year (only 3 in-window
    // days) at t=100. A flat pool over all rows would drag the mean upward (and the thin
    // year would be counted at all); the coverage-honest path must ignore the thin year
    // entirely AND weight the three qualifying years equally → mean exactly 10.
    const rows: DailyObservation[] = [];
    for (let y = 2000; y <= 2002; y++) {
      for (let doy = DEFAULT_WINDOW.startDoy; doy <= DEFAULT_WINDOW.endDoy; doy++) {
        rows.push(row(5, `${y}-07-16`, doy, { t: 10, f: 4, dv: 90 }));
      }
    }
    // Thin 2003: only 3 days present with a wild value — below the 80% gate.
    for (let doy = DEFAULT_WINDOW.startDoy; doy < DEFAULT_WINDOW.startDoy + 3; doy++) {
      rows.push(row(5, `2003-07-16`, doy, { t: 100, f: 40, dv: 90 }));
    }
    const file = synth(5, "sj", rows);
    const d = computeMarkerDatum(synthMeta(5, "sj"), file, DEFAULT_WINDOW);
    expect(d.n).toBe(3); // only the three fully-covered years qualify
    expect(d.sufficient).toBe(true);
    // Equal-weight average of three identical year-means (all 10) → exactly 10,
    // NOT dragged toward 100 by the thin year and NOT day-count weighted.
    expect(d.tempC!).toBeCloseTo(10, 6);
    expect(d.windSpeed!).toBeCloseTo(4, 6); // wind speed likewise excludes the thin year
  });

  it("WR-01: qualifying years are averaged equally, not weighted by their day count", () => {
    // Year A: full 14-day window at t=0. Year B: full 14-day window at t=20.
    // Year C: full window at t=10. All three qualify and have equal day counts, so
    // a day-weighted mean and an equal-weight mean agree here — but we ALSO add a
    // partially-covered qualifying variant to prove equal weighting. Simpler: two
    // qualifying years with DIFFERENT covered-day counts (both ≥80%) must still weight
    // equally. Year A = 14 days @ t=0; Year B = 12 days @ t=30 (exactly 80%).
    const rows: DailyObservation[] = [];
    for (let doy = DEFAULT_WINDOW.startDoy; doy <= DEFAULT_WINDOW.endDoy; doy++) {
      rows.push(row(6, `2000-07-16`, doy, { t: 0 }));
    }
    // Year B: exactly 12 of 14 days (≥80%) at t=30.
    let added = 0;
    for (let doy = DEFAULT_WINDOW.startDoy; doy <= DEFAULT_WINDOW.endDoy && added < 12; doy++, added++) {
      rows.push(row(6, `2001-07-16`, doy, { t: 30 }));
    }
    // Year C: full window at t=0 so we clear the N≥3 gate.
    for (let doy = DEFAULT_WINDOW.startDoy; doy <= DEFAULT_WINDOW.endDoy; doy++) {
      rows.push(row(6, `2002-07-16`, doy, { t: 0 }));
    }
    const file = synth(6, "sj", rows);
    const d = computeMarkerDatum(synthMeta(6, "sj"), file, DEFAULT_WINDOW);
    expect(d.n).toBe(3);
    // Year-means are 0, 30, 0 → equal-weight average = 10. A day-weighted pool would be
    // (14*0 + 12*30 + 14*0)/40 = 9 — the divergence WR-01 flags. Assert the equal-weight 10.
    expect(d.tempC!).toBeCloseTo(10, 6);
  });

  it("empty / all-null metrics → insufficient muted datum, never NaN or a throw", () => {
    const file = synth(4, "sj", []); // no rows at all
    let d;
    expect(() => {
      d = computeMarkerDatum(synthMeta(4, "sj"), file, DEFAULT_WINDOW);
    }).not.toThrow();
    expect(d!.sufficient).toBe(false);
    expect(d!.n).toBe(0);
    expect(d!.tempC).toBeNull();
    // Wind with no usable samples → null speed, variable direction.
    expect(d!.windSpeed).toBeNull();
    expect(d!.windVariable).toBe(true);
    expect(d!.windDir).toBeNull();
    expect(d!.hasPrecip).toBe(false);
    // No NaN leaks anywhere numeric.
    expect(Number.isNaN(d!.tempC as number)).toBe(false);
  });
});
