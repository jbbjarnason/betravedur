// stations.json generation contract tests (TDD RED before stations.ts exists).
//
// Locks the marker/registry manifest generated from the Phase-1 no-splice registry,
// gated on REAL qualifying-years (>=3 of actual daily data, NOT `start`) — 02-RESEARCH
// "stations.json", DATA-04, "filter-on-data-not-start" note:
//   A. filter on data, not start -> a station with an early `start` (1949) but <3 qualifying
//      years is EXCLUDED; a station with >=3 qualifying years is INCLUDED.
//   B. decommissioned retained   -> a station with `ending != null` and >=3 years IS included,
//      with `ending` carried through (locked decision).
//   C. no splicing / integer keys -> entries keyed by integer station id; distinct ids never
//      merged; each entry carries name/type/owner/lat/lon/ele/start/ending exactly (no invention).
//   D. deterministic serialization -> output sorted by station id; byte-identical on re-run.
import { describe, it, expect } from "vitest";
import type { StationMeta } from "@betravedur/domain";
import { buildStationsJson, serializeStationsJson } from "../src/stations.js";

// Station metadata shaped like the @betravedur/fetch fixture (parseStationsBody output).
const REYKJAVIK: StationMeta = {
  station: 1,
  name: "Reykjavík",
  type: "sk",
  owner: "Veðurstofa Íslands",
  lat: 64.1288833618,
  lon: -21.9081897736,
  ele: 60.2,
  start: 1949, // early START but data may begin much later
  ending: null,
};
const KEFLAVIK_AWS: StationMeta = {
  station: 1350,
  name: "Keflavíkurflugvöllur",
  type: "sj",
  owner: "Veðurstofa Íslands",
  lat: 63.9828987122,
  lon: -22.6005191803,
  ele: 50.9,
  start: 2008,
  ending: null,
};
const DECOMMISSIONED: StationMeta = {
  station: 4,
  name: "Reykjavík S",
  type: "sk",
  owner: "Veðurstofa Íslands",
  lat: 64.1274719238,
  lon: -21.9027690887,
  ele: 52,
  start: 2015,
  ending: 2024, // decommissioned
};

describe("stations", () => {
  it("A: filters on qualifying-years (not start) — early-start-but-thin station is EXCLUDED", () => {
    const stations = [REYKJAVIK, KEFLAVIK_AWS];
    // Reykjavík: early start 1949 but only 2 qualifying years of real data -> EXCLUDED.
    // Keflavík: 6 qualifying years -> INCLUDED.
    const counts = new Map<number, number>([
      [1, 2],
      [1350, 6],
    ]);
    const out = buildStationsJson(stations, counts);
    const ids = out.map((s) => s.station);
    expect(ids).toContain(1350); // included: >=3 qualifying years
    expect(ids).not.toContain(1); // EXCLUDED: early start, <3 qualifying years
  });

  it("B: retains a decommissioned station (ending != null) with >=3 years and carries ending through", () => {
    const out = buildStationsJson([DECOMMISSIONED], new Map([[4, 5]]));
    const entry = out.find((s) => s.station === 4);
    expect(entry).toBeDefined();
    expect(entry!.ending).toBe(2024); // carried through, not nulled/dropped
  });

  it("C: no splicing — integer keys, distinct ids never merged, fields carried exactly", () => {
    // Two distinct ids at the same place (990 synop vs 1350 aws) must stay separate.
    const kvkSynop: StationMeta = { ...KEFLAVIK_AWS, station: 990, type: "sk", ele: 51 };
    const out = buildStationsJson(
      [kvkSynop, KEFLAVIK_AWS],
      new Map([
        [990, 3],
        [1350, 3],
      ]),
    );
    expect(out.map((s) => s.station).sort((a, b) => a - b)).toEqual([990, 1350]);
    const aws = out.find((s) => s.station === 1350)!;
    // Fields carried exactly from StationMeta, no invention.
    expect(aws).toEqual({
      station: 1350,
      name: "Keflavíkurflugvöllur",
      type: "sj",
      owner: "Veðurstofa Íslands",
      lat: 63.9828987122,
      lon: -22.6005191803,
      ele: 50.9,
      start: 2008,
      ending: null,
    });
  });

  it("D: deterministic serialization — sorted by station id, byte-identical on re-run", () => {
    const counts = new Map([
      [1, 4],
      [1350, 4],
      [4, 4],
    ]);
    // Different input order must produce the same serialized bytes.
    const s1 = serializeStationsJson(buildStationsJson([REYKJAVIK, KEFLAVIK_AWS, DECOMMISSIONED], counts));
    const s2 = serializeStationsJson(buildStationsJson([DECOMMISSIONED, KEFLAVIK_AWS, REYKJAVIK], counts));
    expect(s1).toBe(s2);
    // Sorted by station id: 1, 4, 1350.
    const parsed = JSON.parse(s1) as StationMeta[];
    expect(parsed.map((s) => s.station)).toEqual([1, 4, 1350]);
  });
});
