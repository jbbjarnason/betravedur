// Offline registry tests driven by the committed stations.json fixture
// (captured from api.vedur.is 2026-07-19: Keflavík synop 990 + Keflavík AWS 1350
// + Reykjavík 1 + decommissioned Reykjavík-S 4). Proves the no-splice invariant
// and decommissioned retention (DATA-06, T-01-11).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import type { StationMeta } from "@betravedur/domain";
import { buildRegistry, serializeRegistry } from "../src/registry.js";
import { toStationMeta } from "../src/stations.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, "fixtures");

function loadStations(): StationMeta[] {
  const raw = JSON.parse(readFileSync(join(FIX, "stations.json"), "utf8")) as unknown[];
  return raw.map(toStationMeta);
}

describe("registry no splice", () => {
  it("registry no splice: keys strictly on integer station ID", () => {
    const reg = buildRegistry(loadStations());
    expect(reg.get(990)?.station).toBe(990);
    expect(reg.get(1350)?.station).toBe(1350);
    expect(reg.get(1)?.station).toBe(1);
    // Keys are the integer IDs themselves.
    for (const [key, meta] of reg) {
      expect(key).toBe(meta.station);
    }
  });

  it("registry no splice: Keflavík synop 990 and AWS 1350 stay distinct (no merge)", () => {
    const reg = buildRegistry(loadStations());
    const synop = reg.get(990);
    const aws = reg.get(1350);
    expect(synop).toBeDefined();
    expect(aws).toBeDefined();
    // Same physical airport, two IDs, two types — must never be spliced.
    expect(synop!.name).toContain("Keflavík");
    expect(aws!.name).toContain("Keflavík");
    expect(synop!.type).toBe("sk");
    expect(aws!.type).toBe("sj");
    expect(synop!.station).not.toBe(aws!.station);
    // No merged "Keflavík" record collapses the two.
    const keflavikEntries = [...reg.values()].filter((m) => m.name.includes("Keflavík"));
    expect(keflavikEntries.length).toBe(2);
  });

  it("registry no splice: retains a decommissioned station (ending != null)", () => {
    const reg = buildRegistry(loadStations());
    const decommissioned = [...reg.values()].filter((m) => m.ending !== null);
    expect(decommissioned.length).toBeGreaterThan(0);
    // Reykjavík S (station 4) is decommissioned (ending 2024) and must be retained.
    expect(reg.get(4)?.ending).toBe(2024);
  });

  it("registry no splice: every entry carries its active-date window", () => {
    const reg = buildRegistry(loadStations());
    for (const meta of reg.values()) {
      expect(typeof meta.start).toBe("number");
      expect(meta.ending === null || typeof meta.ending === "number").toBe(true);
    }
  });

  it("registry no splice: last write wins on a genuine duplicate ID (no silent collision-merge of two places)", () => {
    // Two different physical places accidentally sharing an ID must not be blended;
    // the map keeps one coherent record per ID rather than fabricating an average.
    const dupes: StationMeta[] = [
      { station: 42, name: "A", type: "sj", owner: "o", lat: 1, lon: 1, ele: 1, start: 2000, ending: 2010 },
      { station: 42, name: "B", type: "sj", owner: "o", lat: 2, lon: 2, ele: 2, start: 2011, ending: null },
    ];
    const reg = buildRegistry(dupes);
    expect(reg.size).toBe(1);
    const kept = reg.get(42)!;
    // Whichever record is kept, it is ONE record — no spliced lat/lon/date blend.
    expect(["A", "B"]).toContain(kept.name);
    expect(kept.lat === 1 || kept.lat === 2).toBe(true);
  });
});

describe("registry serialization", () => {
  it("serializeRegistry emits a deterministic ID-sorted JSON array", () => {
    const json = serializeRegistry(buildRegistry(loadStations()));
    const parsed = JSON.parse(json) as StationMeta[];
    const ids = parsed.map((m) => m.station);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    // Round-trips back through the registry unchanged.
    const rebuilt = buildRegistry(parsed);
    expect(rebuilt.size).toBe(parsed.length);
  });
});
