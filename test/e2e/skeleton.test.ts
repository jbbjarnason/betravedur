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
import { circularMeanDirection, expandWindow, scalarMeanSpeed } from "@betravedur/domain";

const LIVE = !!process.env.BETRA_LIVE;

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
