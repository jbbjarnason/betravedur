// Backfill loop error-taxonomy + pacing tests (TDD RED before backfill.ts exists).
//
// These lock the live-measured API reaction contract (02-RESEARCH):
//   A. 413 -> halve the span, recurse, return the full merged rows (no duplicates).
//   B. 502 -> retry then succeed (the fetch layer consumes the retry; loop paces).
//   C. 503 -> propagates as an error; NEVER resolves to [] (503 != no-data).
//   D. 404 -> the fetch layer already yields []; the loop advances, no throw.
//   E. pacing -> successive fetch calls are gapped by sleep(>=250ms), sequential (no burst).
//
// All fetches are mocked/injected — no network. ApiHttpError carries `.status` so the
// loop can branch on 413 vs 502/503 exactly as the real client surfaces it.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DailyObservation } from "@betravedur/domain";
import { ApiHttpError } from "@betravedur/fetch/client";
import { fetchChunk, backfillStation, PACE_MS } from "../src/backfill.js";

// A minimal AWS-flavored observation for a given date.
function row(station: number, date: string): DailyObservation {
  return {
    station,
    date,
    doy: 1,
    t: 5,
    tx: 8,
    tn: 2,
    f: 3,
    fx: 6,
    fg: 9,
    dv: 180,
    r: null,
  };
}

// One row per year in [y0, y1], so callers can assert the merged span is complete
// and deduplicated after a halving recursion.
function rowsForSpan(station: number, y0: number, y1: number): DailyObservation[] {
  const out: DailyObservation[] = [];
  for (let y = y0; y <= y1; y++) out.push(row(station, `${y}-06-15`));
  return out;
}

describe("backfill chunk error taxonomy", () => {
  it("A: 413 on a >1-year span halves and returns the full merged rows with no duplicates", async () => {
    // Reject any span wider than 2 years with a 413; serve rows for <=2-year spans.
    const fetchAws = vi.fn(
      async (_ids: number[], from: string, to: string): Promise<DailyObservation[]> => {
        const y0 = Number(from.slice(0, 4));
        const y1 = Number(to.slice(0, 4));
        if (y1 - y0 > 2) throw new ApiHttpError(413, "Too many parameters.");
        return rowsForSpan(1, y0, y1);
      },
    );

    const rows = await fetchChunk("aws", 1, 2000, 2009, {
      fetchAws,
      fetchSynop: vi.fn(),
      sleep: async () => {},
    });

    // Full span present, exactly once each (no duplicates from the recursion).
    const dates = rows.map((r) => r.date).sort();
    const expected = rowsForSpan(1, 2000, 2009)
      .map((r) => r.date)
      .sort();
    expect(dates).toEqual(expected);
    // At least one 413 must have occurred to force the halving.
    expect(fetchAws.mock.calls.length).toBeGreaterThan(1);
  });

  it("B: a 502 consumed by the fetch layer still resolves the chunk with rows", async () => {
    // The client retries 502 internally; from the loop's view the retried call succeeds
    // and returns exactly the requested span (no duplication, no over-fetch).
    let calls = 0;
    const fetchAws = vi.fn(
      async (_ids: number[], from: string, to: string): Promise<DailyObservation[]> => {
        calls++;
        if (calls === 1) throw new ApiHttpError(502, "Bad Gateway");
        const y0 = Number(from.slice(0, 4));
        const y1 = Number(to.slice(0, 4));
        return rowsForSpan(1, y0, y1);
      },
    );

    const rows = await fetchChunk("aws", 1, 2000, 2004, {
      fetchAws,
      fetchSynop: vi.fn(),
      sleep: async () => {},
    });
    // 5 distinct years (2000..2004), one row each — the halving covers disjoint spans.
    const dates = rows.map((r) => r.date).sort();
    expect(new Set(dates).size).toBe(dates.length);
    expect(dates).toEqual(rowsForSpan(1, 2000, 2004).map((r) => r.date).sort());
  });

  it("C: a persistent 503 propagates as an error and NEVER resolves to []", async () => {
    const fetchSynop = vi.fn(async (): Promise<DailyObservation[]> => {
      throw new ApiHttpError(503, "Service Unavailable");
    });

    await expect(
      fetchChunk("synop", 1, 2000, 2000, {
        fetchAws: vi.fn(),
        fetchSynop,
        sleep: async () => {},
      }),
    ).rejects.toThrow();

    // Also prove it did not silently swallow to [] at the single-year floor.
    const result = await fetchChunk("synop", 1, 2000, 2000, {
      fetchAws: vi.fn(),
      fetchSynop,
      sleep: async () => {},
    }).then(
      () => "resolved",
      () => "rejected",
    );
    expect(result).toBe("rejected");
  });

  it("D: 404 no-data (fetch yields []) makes the chunk resolve to [] without throwing", async () => {
    const fetchAws = vi.fn(async (): Promise<DailyObservation[]> => []);
    const rows = await fetchChunk("aws", 1, 2000, 2004, {
      fetchAws,
      fetchSynop: vi.fn(),
      sleep: async () => {},
    });
    expect(rows).toEqual([]);
  });
});

describe("WR-02: backfillStation returns the store-derived high-water, not the last year attempted", () => {
  it("returns the actual on-disk high-water when trailing years 404 (no data)", async () => {
    // The newest chunk returns [] (404 no-data): upsert writes nothing for those years, so the
    // store's high-water is 2020 even though the loop *attempts* through nowYear=2026.
    const stored: DailyObservation[] = [];
    const upsertPartition = vi.fn((_station: number, rows: DailyObservation[]) => {
      stored.push(...rows);
    });
    // Simulate a store whose high-water is the max year actually written.
    const highWaterYear = vi.fn(() => {
      if (stored.length === 0) return null;
      return Math.max(...stored.map((r) => Number(r.date.slice(0, 4))));
    });

    const fetchAws = vi.fn(
      async (_ids: number[], from: string, _to: string): Promise<DailyObservation[]> => {
        const y0 = Number(from.slice(0, 4));
        // Years through 2020 have data; anything starting after 2020 is a 404 -> [].
        if (y0 > 2020) return [];
        const rows: DailyObservation[] = [];
        const y1 = Math.min(y0 + 4, 2020);
        for (let y = y0; y <= y1; y++) rows.push(row(1, `${y}-06-15`));
        return rows;
      },
    );

    const hw = await backfillStation("aws", 1, 2016, {
      fetchAws,
      fetchSynop: vi.fn(),
      upsertPartition,
      highWaterYear,
      sleep: async () => {},
      nowYear: 2026,
    });

    // The returned high-water is the last year WITH DATA (2020), NOT the last attempted (2026).
    expect(hw).toBe(2020);
  });

  it("falls back to the last attempted year only when the store is entirely empty", async () => {
    // All chunks 404 -> nothing ever written -> highWaterYear stays null.
    const highWaterYear = vi.fn(() => null);
    const hw = await backfillStation("aws", 1, 2016, {
      fetchAws: vi.fn(async (): Promise<DailyObservation[]> => []),
      fetchSynop: vi.fn(),
      upsertPartition: vi.fn(),
      highWaterYear,
      sleep: async () => {},
      nowYear: 2020,
    });
    expect(hw).toBe(2020);
  });
});

describe("backfill pacing", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("E: paces >=250ms between successive fetch calls and never bursts concurrently", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const callTimes: number[] = [];
    const fetchAws = vi.fn(async (_ids: number[], from: string): Promise<DailyObservation[]> => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      callTimes.push(Date.now());
      inFlight--;
      const y = Number(from.slice(0, 4));
      return [row(1, `${y}-06-15`)];
    });

    const sleepSpy = vi.fn(
      (ms: number) => new Promise<void>((res) => setTimeout(res, ms)),
    );

    const promise = backfillStation("aws", 1, 2000, {
      fetchAws,
      fetchSynop: vi.fn(),
      upsertPartition: vi.fn(),
      highWaterYear: vi.fn(() => null),
      sleep: sleepSpy,
      nowYear: 2010,
    });

    await vi.runAllTimersAsync();
    await promise;

    // Sequential: at most one fetch in flight at any moment (no Promise.all burst).
    expect(maxInFlight).toBe(1);
    // Multiple chunks fetched (2000..2010 in 5-year steps => 3 chunks).
    expect(fetchAws.mock.calls.length).toBeGreaterThanOrEqual(3);
    // Paced: every sleep requested is at least the pace floor.
    expect(sleepSpy).toHaveBeenCalled();
    for (const [ms] of sleepSpy.mock.calls) {
      expect(ms).toBeGreaterThanOrEqual(PACE_MS);
    }
    expect(PACE_MS).toBeGreaterThanOrEqual(250);
  });
});
