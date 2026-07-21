// full_backfill station enumeration + type->spec mapping (Plan 08-01, Task 2) — RED.
//
// The wire-only helper for `workflow_dispatch full_backfill=true`: enumerate the national
// station set and map each type to the aggregate CLI spec convention (aws:/synop:). This is
// WIRED (the dispatch path uses it) but the full national backfill is NOT run this phase.
import { describe, it, expect, vi } from "vitest";
import type { StationMeta } from "@betravedur/domain";
import { enumerateStations, toAggregateSpec, specsFor } from "../src/stations-list.js";

function meta(station: number, type: StationMeta["type"]): StationMeta {
  return {
    station,
    name: `S${station}`,
    type,
    owner: "IMO",
    lat: 64,
    lon: -21,
    ele: 10,
    start: 2005,
    ending: null,
  };
}

describe("toAggregateSpec: StationType -> aggregate CLI spec", () => {
  it("maps sj (AWS) -> aws:<id>", () => {
    expect(toAggregateSpec(meta(1350, "sj"))).toBe("aws:1350");
  });

  it("maps sk (SYNOP) -> synop:<id>", () => {
    expect(toAggregateSpec(meta(1, "sk"))).toBe("synop:1");
  });

  it("skips unknown/unsupported types (ur, vf) -> null", () => {
    expect(toAggregateSpec(meta(9, "ur"))).toBeNull();
    expect(toAggregateSpec(meta(10, "vf"))).toBeNull();
  });
});

describe("enumerateStations: national set pass-through/filter (mocked fetch)", () => {
  it("returns the injected-fetch stations with a usable type unchanged", async () => {
    const fetchStations = vi.fn(async (ids: number[]): Promise<StationMeta[]> => {
      expect(ids).toEqual([1, 1350]);
      return [meta(1, "sk"), meta(1350, "sj")];
    });

    const out = await enumerateStations([1, 1350], { fetchStations });
    expect(out.map((s) => s.station)).toEqual([1, 1350]);
    expect(fetchStations).toHaveBeenCalledOnce();
  });

  it("keeps only stations whose type maps to an aggregate spec (drops ur/vf)", async () => {
    const fetchStations = vi.fn(async (): Promise<StationMeta[]> => [
      meta(1, "sk"),
      meta(9, "ur"),
      meta(1350, "sj"),
      meta(10, "vf"),
    ]);

    const out = await enumerateStations([1, 9, 1350, 10], { fetchStations });
    // Only the AWS/SYNOP stations survive — those are the ones full_backfill can aggregate.
    expect(out.map((s) => s.station)).toEqual([1, 1350]);
    // And each survivor maps to a spec.
    expect(out.map(toAggregateSpec)).toEqual(["synop:1", "aws:1350"]);
  });
});

describe("specsFor: enumerated national set -> dispatch spec list (WR-01)", () => {
  it("emits one <aws|synop>:<id> spec per line for the survivors", () => {
    expect(specsFor([meta(1, "sk"), meta(1350, "sj")])).toBe("synop:1\naws:1350");
  });

  it("drops any residual non-mappable station (never emits an empty synop:/aws: line)", () => {
    expect(specsFor([meta(1, "sk"), meta(9, "ur"), meta(1350, "sj")])).toBe(
      "synop:1\naws:1350",
    );
  });

  it("returns an empty string for an empty set", () => {
    expect(specsFor([])).toBe("");
  });
});
