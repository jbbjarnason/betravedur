import { describe, expect, it } from "vitest";
import { rankStations } from "./rankedList.js";
import type { MarkerDatum } from "../data/types.js";

/**
 * Build a MarkerDatum carrying only the fields rankStations reads (score, station, missingRain);
 * the rest are filled with inert defaults so the shape type-checks. `sufficient` mirrors
 * `score !== null` for realism but rankStations keys ONLY off `score`.
 */
function datum(station: number, score: number | null, missingRain = false): MarkerDatum {
  return {
    station,
    name: `st-${station}`,
    lon: -20,
    lat: 64,
    tempC: score === null ? null : 10,
    windSpeed: score === null ? null : 4,
    windDir: 180,
    windVariable: false,
    hasPrecip: !missingRain,
    n: score === null ? 0 : 5,
    sufficient: score !== null,
    score,
    missingRain,
    priority: 0,
  };
}

describe("rankStations (SCORE-02)", () => {
  it("sorts scored stations by score DESCENDING", () => {
    const ranked = rankStations([datum(1, 5.0), datum(2, 8.4), datum(3, 7.1)]);
    expect(ranked.map((d) => d.station)).toEqual([2, 3, 1]);
    expect(ranked.map((d) => d.score)).toEqual([8.4, 7.1, 5.0]);
  });

  it("EXCLUDES every score:null (ófullnægjandi gögn) datum before sorting", () => {
    const ranked = rankStations([
      datum(1, null),
      datum(2, 6.2),
      datum(3, null),
      datum(4, 9.0),
    ]);
    expect(ranked.map((d) => d.station)).toEqual([4, 2]);
    // No null-scored row survives — the comparator never dereferences null (T-05-06).
    expect(ranked.every((d) => d.score !== null)).toBe(true);
  });

  it("tie-breaks equal scores by station id ASCENDING, stable across repeated calls", () => {
    const input = [datum(30, 7.5), datum(10, 7.5), datum(20, 7.5), datum(5, 9.1)];
    const first = rankStations(input).map((d) => d.station);
    const second = rankStations(input).map((d) => d.station);
    // 5 (9.1) first, then the three 7.5 ties in ascending id order — deterministic, no flicker.
    expect(first).toEqual([5, 10, 20, 30]);
    expect(second).toEqual(first);
  });

  it("keeps án-úrkomu (missingRain, non-null score) stations in the ranking", () => {
    const ranked = rankStations([datum(1, 8.1, true), datum(2, 8.6, false)]);
    expect(ranked.map((d) => d.station)).toEqual([2, 1]);
    // The án-úrkomu station is present and scored (not excluded like a null).
    expect(ranked.find((d) => d.station === 1)?.missingRain).toBe(true);
  });

  it("returns an empty array (not a throw) when no station is scorable", () => {
    expect(rankStations([datum(1, null), datum(2, null)])).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const input = [datum(1, 3.0), datum(2, 9.0)];
    const snapshot = input.map((d) => d.station);
    rankStations(input);
    expect(input.map((d) => d.station)).toEqual(snapshot);
  });
});
