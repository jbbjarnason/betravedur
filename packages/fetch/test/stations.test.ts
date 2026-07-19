// Trust-boundary tests for the /stations mapping and body parsing (WR-08, WR-09):
// no fabricated station IDs, no unknown-type-to-AWS mislabeling, no 0/0 coordinates,
// and error envelopes / non-array bodies fail loudly like the observations layer.
import { describe, expect, it, vi } from "vitest";
import { parseStationsBody, toStationMeta } from "../src/stations.js";

const VALID = {
  station: 1350,
  name: "Keflavíkurflugvöllur",
  type: "sj",
  owner: "Veðurstofa Íslands",
  lat: 63.97,
  lon: -22.6,
  ele: 47,
  start: 2005,
  ending: null,
};

describe("toStationMeta — no fabricated values on drift (WR-09)", () => {
  it("maps a valid row verbatim", () => {
    const meta = toStationMeta(VALID);
    expect(meta).not.toBeNull();
    expect(meta!.station).toBe(1350);
    expect(meta!.type).toBe("sj");
    expect(meta!.lat).toBeCloseTo(63.97);
    expect(meta!.ending).toBeNull();
  });

  it("keeps the 'ur' precip-only type instead of mislabeling it as AWS", () => {
    const meta = toStationMeta({ ...VALID, type: "ur" });
    expect(meta!.type).toBe("ur");
  });

  it("rejects an UNKNOWN station type instead of defaulting to 'sj'", () => {
    expect(toStationMeta({ ...VALID, type: "zz" })).toBeNull();
    expect(toStationMeta({ ...VALID, type: 7 })).toBeNull();
    expect(toStationMeta({ ...VALID, type: undefined })).toBeNull();
  });

  it("rejects a missing / string / non-positive station ID instead of defaulting to 0", () => {
    expect(toStationMeta({ ...VALID, station: undefined })).toBeNull();
    expect(toStationMeta({ ...VALID, station: "1350" })).toBeNull();
    expect(toStationMeta({ ...VALID, station: 0 })).toBeNull();
    expect(toStationMeta({ ...VALID, station: -5 })).toBeNull();
  });

  it("rejects missing/non-finite lat/lon instead of placing the station at 0/0", () => {
    expect(toStationMeta({ ...VALID, lat: undefined })).toBeNull();
    expect(toStationMeta({ ...VALID, lon: "-22.6" })).toBeNull();
    expect(toStationMeta({ ...VALID, lat: Number.NaN })).toBeNull();
  });

  it("rejects a null/non-object row", () => {
    expect(toStationMeta(null)).toBeNull();
    expect(toStationMeta("nope")).toBeNull();
  });
});

describe("parseStationsBody — trust boundary mirrors observations (WR-08)", () => {
  it("throws API_BAD_REQUEST on a {detail} envelope", () => {
    expect(() => parseStationsBody({ detail: [{ msg: "bad params" }] })).toThrow(
      /API_BAD_REQUEST/,
    );
  });

  it("returns [] on a {message} no-data envelope", () => {
    expect(parseStationsBody({ message: "Station/s not found." })).toEqual([]);
  });

  it("throws SCHEMA_DRIFT on a non-array, non-envelope body", () => {
    expect(() => parseStationsBody({ stations: [] })).toThrow(/SCHEMA_DRIFT/);
    expect(() => parseStationsBody("html error page")).toThrow(/SCHEMA_DRIFT/);
    expect(() => parseStationsBody(null)).toThrow(/SCHEMA_DRIFT/);
  });

  it("drops invalid rows with a counted warning and keeps valid ones", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const out = parseStationsBody([VALID, { ...VALID, station: "990" }, null]);
      expect(out).toHaveLength(1);
      expect(out[0]!.station).toBe(1350);
      expect(warn).toHaveBeenCalledOnce();
      expect(String(warn.mock.calls[0]![0])).toContain("dropped 2 invalid station row(s)");
    } finally {
      warn.mockRestore();
    }
  });
});
