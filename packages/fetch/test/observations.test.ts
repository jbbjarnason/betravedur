// Offline, deterministic tests for the observation fetch/normalize/clamp layer.
// All fixtures were captured verbatim from the live api.vedur.is on 2026-07-19
// (see 01-03-SUMMARY.md Checkpoint/Capture Evidence) so this suite needs no network.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertObservationSchema,
  normalizeObservations,
  parseObservationBody,
} from "../src/observations.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, "fixtures");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIX, `${name}.json`), "utf8"));
}

describe("parse observations — AWS day (dv present, r null)", () => {
  it("parse observations: AWS rows keep r null and dv numeric after normalization", () => {
    const body = loadFixture("aws-day");
    const rows = parseObservationBody(body, "aws");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.r).toBeNull(); // AWS has no precipitation gauge
      expect(row.dv).not.toBeNull(); // wind direction present on AWS
      expect(typeof row.dv).toBe("number");
    }
  });

  it("normalizes time -> date and sets a leap-folded doy on every AWS row", () => {
    const body = loadFixture("aws-day");
    const rows = parseObservationBody(body, "aws");
    for (const row of rows) {
      expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row.doy).toBeGreaterThanOrEqual(1);
      expect(row.doy).toBeLessThanOrEqual(365);
    }
  });
});

describe("parse observations — SYNOP day (r present, dv null)", () => {
  it("parse observations: SYNOP rows keep r numeric and dv null after normalization", () => {
    const body = loadFixture("synop-day");
    const rows = parseObservationBody(body, "synop");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((row) => typeof row.r === "number")).toBe(true);
    for (const row of rows) {
      expect(row.dv).toBeNull(); // SYNOP daily records have no wind direction
    }
  });
});

describe("parse observations — leap day (Feb 29 dropped)", () => {
  it("drops a Feb-29 row because leapFoldedDoy returns null", () => {
    const raw = [
      { station: 1350, time: "2024-02-28", t: 1, f: 2, dv: 90, r: null },
      { station: 1350, time: "2024-02-29", t: 2, f: 3, dv: 91, r: null }, // leap day
      { station: 1350, time: "2024-03-01", t: 3, f: 4, dv: 92, r: null },
    ];
    const rows = normalizeObservations(raw, "aws");
    expect(rows.map((r) => r.date)).toEqual(["2024-02-28", "2024-03-01"]);
    expect(rows.every((r) => r.doy >= 1 && r.doy <= 365)).toBe(true);
  });

  it("WR-04 regression: a malformed date can never yield a row with doy NaN / out of 1-365", () => {
    const raw = [
      { station: 1350, time: "2024-07-", t: 1, f: 2, dv: 90, r: null }, // NaN day slice
      { station: 1350, time: "2024-07-00", t: 1, f: 2, dv: 90, r: null }, // doy 0
      { station: 1350, time: "2024-07-15", t: 1, f: 2, dv: 90, r: null }, // valid
    ];
    const rows = normalizeObservations(raw, "aws");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.date).toBe("2024-07-15");
    expect(Number.isInteger(rows[0]!.doy)).toBe(true);
  });
});

describe("parse observations — error bodies never become rows", () => {
  it("a 404-style {message} body parses to an empty result, not garbage rows", () => {
    const body = loadFixture("error-404");
    const rows = parseObservationBody(body, "aws");
    expect(rows).toEqual([]);
  });

  it("a 422-style {detail} body throws (bad request, not no-data)", () => {
    const body = loadFixture("error-422");
    expect(() => parseObservationBody(body, "aws")).toThrow();
  });
});

describe("parse observations — value clamping (implausible values nulled)", () => {
  it("clamps an implausible temperature (t=999) to null, not passed to averages", () => {
    const raw = [{ station: 1350, time: "2024-07-15", t: 999, f: 5, dv: 100, r: null }];
    const [row] = normalizeObservations(raw, "aws");
    expect(row!.t).toBeNull();
  });

  it("clamps an implausible wind speed and a negative precip to null", () => {
    const rawWind = [{ station: 1, time: "2024-09-01", t: 10, f: 500, dv: null, r: 2 }];
    const [w] = normalizeObservations(rawWind, "synop");
    expect(w!.f).toBeNull();

    const rawRain = [{ station: 1, time: "2024-09-01", t: 10, f: 5, dv: null, r: -3 }];
    const [p] = normalizeObservations(rawRain, "synop");
    expect(p!.r).toBeNull();
  });

  it("WR-06 regression: dv=360 (north) is accepted and normalized to 0, not nulled", () => {
    const raw = [
      { station: 1350, time: "2024-07-15", t: 10, f: 5, dv: 360, r: null },
      { station: 1350, time: "2024-07-16", t: 10, f: 5, dv: 0, r: null },
      { station: 1350, time: "2024-07-17", t: 10, f: 5, dv: 361, r: null }, // out of range
      { station: 1350, time: "2024-07-18", t: 10, f: 5, dv: -1, r: null }, // out of range
    ];
    const rows = normalizeObservations(raw, "aws");
    expect(rows[0]!.dv).toBe(0); // 360 -> 0
    expect(rows[1]!.dv).toBe(0);
    expect(rows[2]!.dv).toBeNull();
    expect(rows[3]!.dv).toBeNull();
  });

  it("keeps plausible values intact", () => {
    const raw = [{ station: 1350, time: "2024-07-15", t: 11.97, f: 5, dv: 151, r: null }];
    const [row] = normalizeObservations(raw, "aws");
    expect(row!.t).toBeCloseTo(11.97);
    expect(row!.f).toBe(5);
    expect(row!.dv).toBe(151);
  });
});

describe("parse observations — schema drift fails loudly", () => {
  it("assertObservationSchema throws SCHEMA_DRIFT when the expected field set is absent", () => {
    // Rows missing the AWS expected fields (t/f/dv/r/time/station).
    const drifted = [{ station: 1350, foo: "bar" }];
    expect(() => assertObservationSchema(drifted as never, "aws")).toThrow(/SCHEMA_DRIFT/);
  });

  it("assertObservationSchema passes on well-formed AWS rows", () => {
    const ok = [
      { station: 1350, time: "2024-07-15", t: 11.97, f: 5, dv: 151, r: null },
    ];
    expect(() => assertObservationSchema(ok, "aws")).not.toThrow();
  });

  it("parseObservationBody throws SCHEMA_DRIFT on a non-error, malformed body", () => {
    const body = [{ station: 1350, nope: true }];
    expect(() => parseObservationBody(body, "aws")).toThrow(/SCHEMA_DRIFT/);
  });

  it("WR-05 regression: a string station ID throws SCHEMA_DRIFT instead of becoming station 0", () => {
    const drifted = [
      { station: "1350", time: "2024-07-15", t: 11.97, f: 5, dv: 151, r: null },
    ];
    expect(() => assertObservationSchema(drifted, "aws")).toThrow(/SCHEMA_DRIFT/);
    expect(() => parseObservationBody(drifted, "aws")).toThrow(/SCHEMA_DRIFT/);
  });

  it("WR-05 regression: normalizeObservations skips (never fabricates ID 0 for) a null station", () => {
    const raw = [
      { station: null, time: "2024-07-15", t: 1, f: 2, dv: 90, r: null },
      { station: 1350, time: "2024-07-16", t: 1, f: 2, dv: 90, r: null },
    ];
    const rows = normalizeObservations(raw, "aws");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.station).toBe(1350);
    expect(rows.some((r) => r.station === 0)).toBe(false);
  });
});
