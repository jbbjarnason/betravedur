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
import { rainComponent, tempComponent, windComponent, combine } from "@betravedur/domain";
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

describe("computeMarkerDatum — yearRange baseline (SEL-02/03)", () => {
  it("honest N within range: n is the QUALIFYING-years count, not the picker span", () => {
    // AWS #1350 over 2010–2026: the picker span is 17 years, but only 15 have qualifying
    // in-window coverage. `n` must report 15 (the honest "meðaltal N ára"), never 17 (SEL-03).
    const span = 2026 - 2010 + 1; // 17
    const d = computeMarkerDatum(meta(1350), AWS_1350, DEFAULT_WINDOW, { from: 2010, til: 2026 });
    expect(d.sufficient).toBe(true);
    expect(d.n).toBe(15);
    expect(d.n).toBeLessThanOrEqual(span);
    expect(d.n).not.toBe(span); // the SEL-03 dishonesty guard: N ≠ raw span
    expect(d.tempC).not.toBeNull();

    // A deep SYNOP range likewise: 1940–1960 spans 21 but only 12 qualify.
    const d2 = computeMarkerDatum(meta(1), SYNOP_1, DEFAULT_WINDOW, { from: 1940, til: 1960 });
    expect(d2.n).toBe(12);
    expect(d2.n).not.toBe(1960 - 1940 + 1); // ≠ 21
  });

  it("insufficient in range (< 3 qualifying years) → sufficient=false, tempC=null, no throw", () => {
    // AWS #1350 starts 2008; 2008–2010 has < 3 qualifying in-window years → muted state.
    let d;
    expect(() => {
      d = computeMarkerDatum(meta(1350), AWS_1350, DEFAULT_WINDOW, { from: 2008, til: 2010 });
    }).not.toThrow();
    expect(d!.n).toBeLessThan(3);
    expect(d!.sufficient).toBe(false);
    expect(d!.tempC).toBeNull(); // "ófullnægjandi gögn"
    expect(d!.windSpeed).toBeNull();
    expect(d!.windVariable).toBe(true);
    expect(d!.hasPrecip).toBe(false);
  });

  it("omitting yearRange (3-arg call) preserves EXISTING full-range behaviour", () => {
    // The 4th arg is optional; the 3-arg path must be byte-identical to today.
    const three = computeMarkerDatum(meta(1), SYNOP_1, DEFAULT_WINDOW);
    const four = computeMarkerDatum(meta(1), SYNOP_1, DEFAULT_WINDOW, undefined);
    expect(three).toEqual(four);
    // And matches the historically-pinned full-range values from the default-window suite.
    expect(three.tempC!).toBeCloseTo(11.3728, 3);
    expect(three.n).toBe(77);
    expect(three.hasPrecip).toBe(true);
  });

  it("range entirely outside the file's years → n=0, all metrics null/false, never throws/NaN", () => {
    let d;
    expect(() => {
      d = computeMarkerDatum(meta(1), SYNOP_1, DEFAULT_WINDOW, { from: 1800, til: 1810 });
    }).not.toThrow();
    expect(d!.n).toBe(0);
    expect(d!.sufficient).toBe(false);
    expect(d!.tempC).toBeNull();
    expect(d!.windSpeed).toBeNull();
    expect(d!.windVariable).toBe(true);
    expect(d!.windDir).toBeNull();
    expect(d!.hasPrecip).toBe(false);
    expect(Number.isNaN(d!.tempC as number)).toBe(false);
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

// MAP-03 / RESEARCH A3: the score field on MarkerDatum. combine() over the temp/rain/wind
// component curves (the math lives in @betravedur/domain — these tests pin the WIRING and,
// load-bearingly, the RAIN UNITS: the value fed to rainComponent MUST be the window-total mm
// across qualifying years, never a boolean and never a per-day mean).
describe("computeMarkerDatum — score (MAP-03)", () => {
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

  const WINDOW_DAYS = DEFAULT_WINDOW.endDoy - DEFAULT_WINDOW.startDoy + 1; // 14

  it("RAIN-UNIT PIN (A3): the rain fed to combine() is the mm WINDOW-TOTAL, not a per-day mean", () => {
    // Three qualifying years. Each year: every in-window day carries r = 2mm and a fixed
    // t/f so temp+wind are known too. Per-year rain WINDOW-TOTAL = 14 days * 2mm = 28mm;
    // averaged across the three identical years = 28mm. That mm total (NOT the 2mm daily
    // mean, NOT a boolean) is what rainComponent must see.
    const DAILY_R = 2;
    const T = 12; // tempComponent(12) — inside the ramp, a real non-flat value
    const F = 4; // windComponent(4)
    const rows: DailyObservation[] = [];
    for (let y = 2000; y <= 2002; y++) {
      for (let doy = DEFAULT_WINDOW.startDoy; doy <= DEFAULT_WINDOW.endDoy; doy++) {
        rows.push(row(10, `${y}-07-16`, doy, { t: T, f: F, r: DAILY_R }));
      }
    }
    const file = synth(10, "sk", rows);
    const d = computeMarkerDatum(synthMeta(10, "sk"), file, DEFAULT_WINDOW);

    expect(d.sufficient).toBe(true);
    expect(d.missingRain).toBe(false); // rain contributed
    expect(d.score).not.toBeNull();

    // The window-TOTAL mm the score is built from:
    const windowTotalMm = WINDOW_DAYS * DAILY_R; // 28
    const expected = combine({
      temp: tempComponent(T),
      rain: rainComponent(windowTotalMm),
      wind: windComponent(F),
    });
    expect(d.score).toBe(expected.score);

    // And CRUCIALLY: distinct from what a per-day-MEAN mistake would produce. Feeding the
    // 2mm daily mean into rainComponent gives a different (much higher) rain contribution.
    const wrongMeanBased = combine({
      temp: tempComponent(T),
      rain: rainComponent(DAILY_R), // 2mm — the daily-mean bug
      wind: windComponent(F),
    });
    expect(rainComponent(windowTotalMm)).not.toBeCloseTo(rainComponent(DAILY_R), 5);
    expect(d.score).not.toBe(wrongMeanBased.score);
  });

  it("AWS án úrkomu: all r === null → rain renormalized away → score !== null, missingRain=true", () => {
    // Rain-less station (AWS): temp + wind present, no precip column. combine() must
    // renormalize over temp+wind → a real score, NOT null and NOT a dry 10/10.
    const T = 11;
    const F = 5;
    const rows: DailyObservation[] = [];
    for (let y = 2000; y <= 2002; y++) {
      for (let doy = DEFAULT_WINDOW.startDoy; doy <= DEFAULT_WINDOW.endDoy; doy++) {
        rows.push(row(11, `${y}-07-16`, doy, { t: T, f: F })); // r stays null
      }
    }
    const file = synth(11, "sj", rows);
    const d = computeMarkerDatum(synthMeta(11, "sj"), file, DEFAULT_WINDOW);

    expect(d.sufficient).toBe(true);
    expect(d.score).not.toBeNull();
    expect(d.missingRain).toBe(true); // án úrkomu — scored, not dropped
    // Exactly the renormalized temp+wind combine (rain null):
    const expected = combine({
      temp: tempComponent(T),
      rain: null,
      wind: windComponent(F),
    });
    expect(d.score).toBe(expected.score);
    // A rain-less station must NOT be silently scored as if rain were a perfect 10.
    const dryBug = combine({
      temp: tempComponent(T),
      rain: rainComponent(0), // 0mm → rain 10/10, the Pitfall-2 bug
      wind: windComponent(F),
    });
    expect(d.score).not.toBe(dryBug.score);
  });

  it("SYNOP three-component: rain present → all three contribute, missingRain=false", () => {
    const T = 13;
    const F = 3;
    const DAILY_R = 3; // → 42mm window total
    const rows: DailyObservation[] = [];
    for (let y = 2000; y <= 2002; y++) {
      for (let doy = DEFAULT_WINDOW.startDoy; doy <= DEFAULT_WINDOW.endDoy; doy++) {
        rows.push(row(12, `${y}-07-16`, doy, { t: T, f: F, r: DAILY_R }));
      }
    }
    const file = synth(12, "sk", rows);
    const d = computeMarkerDatum(synthMeta(12, "sk"), file, DEFAULT_WINDOW);

    expect(d.sufficient).toBe(true);
    expect(d.missingRain).toBe(false);
    const expected = combine({
      temp: tempComponent(T),
      rain: rainComponent(WINDOW_DAYS * DAILY_R),
      wind: windComponent(F),
    });
    expect(d.score).toBe(expected.score);
    expect(d.score).not.toBeNull();
  });

  it("insufficient coverage (n<3) → all metrics null → score:null (off-scale)", () => {
    // Only 2 fully-covered years → sufficient === false → every component null →
    // combine() returns score:null (present.length === 0). NOT NaN, NOT 0.
    const rows: DailyObservation[] = [];
    for (let y = 2000; y <= 2001; y++) {
      for (let doy = DEFAULT_WINDOW.startDoy; doy <= DEFAULT_WINDOW.endDoy; doy++) {
        rows.push(row(13, `${y}-07-16`, doy, { t: 10, f: 4, r: 2 }));
      }
    }
    const file = synth(13, "sk", rows);
    const d = computeMarkerDatum(synthMeta(13, "sk"), file, DEFAULT_WINDOW);

    expect(d.sufficient).toBe(false);
    expect(d.score).toBeNull();
    // missingRain mirrors combine() over the empty component set (present.length===0).
    expect(d.missingRain).toBe(true);
  });

  it("score is always number|null, never NaN", () => {
    const rows: DailyObservation[] = [];
    for (let y = 2000; y <= 2002; y++) {
      for (let doy = DEFAULT_WINDOW.startDoy; doy <= DEFAULT_WINDOW.endDoy; doy++) {
        rows.push(row(14, `${y}-07-16`, doy, { t: 9, f: 6, r: 1 }));
      }
    }
    const file = synth(14, "sk", rows);
    const d = computeMarkerDatum(synthMeta(14, "sk"), file, DEFAULT_WINDOW);
    expect(d.score === null || typeof d.score === "number").toBe(true);
    if (d.score !== null) expect(Number.isNaN(d.score)).toBe(false);
    // One-decimal contract delegated to combine(): value has at most one decimal place.
    if (d.score !== null) expect(Math.round(d.score * 10) / 10).toBe(d.score);
  });

  it("real committed sample: SYNOP #1 and AWS #1350 both get a non-null score", () => {
    const dSynop = computeMarkerDatum(meta(1), SYNOP_1, DEFAULT_WINDOW);
    expect(dSynop.score).not.toBeNull();
    expect(dSynop.missingRain).toBe(false); // SYNOP #1 has rain

    const dAws = computeMarkerDatum(meta(1350), AWS_1350, DEFAULT_WINDOW);
    expect(dAws.score).not.toBeNull(); // án úrkomu is still scored + ranked
    expect(dAws.missingRain).toBe(true);
  });
});
