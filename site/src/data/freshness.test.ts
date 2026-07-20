// Unit tests for the freshness helpers (Phase 7, UX-04).
//
// `newestDataDate` derives the newest data date CLIENT-SIDE from the manifest's per-station
// `lastFetched` ISO strings (max = lexicographically-latest = chronologically-latest for ISO-8601
// UTC), with NO pipeline/manifest change. `formatIcelandicDate` renders an ISO date as a human
// Icelandic date using a HAND-ROLLED month array (never Intl "is-IS", which the codebase already
// documents falling back to a non-Icelandic form in the headless runtime — see stationPanel.ts
// formatIce). Both are tolerant: bad/missing input returns null (never "Invalid Date").
import { describe, it, expect } from "vitest";
import { newestDataDate, formatIcelandicDate } from "./freshness.js";
import type { Manifest } from "./load.js";

describe("newestDataDate — max(lastFetched) across manifest.stations", () => {
  it("returns the chronologically-latest lastFetched of two stations", () => {
    const manifest: Manifest = {
      stations: {
        "1": { file: "derived/1.json", lastFetched: "2026-07-20T07:18:37.625Z" },
        "1350": { file: "derived/1350.json", lastFetched: "2026-07-19T07:18:37.594Z" },
      },
    };
    expect(newestDataDate(manifest)).toBe("2026-07-20T07:18:37.625Z");
  });

  it("returns the latest even when the latest is not the first entry", () => {
    const manifest: Manifest = {
      stations: {
        "a": { file: "a.json", lastFetched: "2026-01-01T00:00:00.000Z" },
        "b": { file: "b.json", lastFetched: "2026-12-31T23:59:59.000Z" },
        "c": { file: "c.json", lastFetched: "2026-06-15T12:00:00.000Z" },
      },
    };
    expect(newestDataDate(manifest)).toBe("2026-12-31T23:59:59.000Z");
  });

  it("returns null for an empty stations map", () => {
    expect(newestDataDate({ stations: {} })).toBeNull();
  });

  it("returns null when every entry is missing lastFetched", () => {
    const manifest: Manifest = {
      stations: {
        "1": { file: "derived/1.json" },
        "2": { file: "derived/2.json" },
      },
    };
    expect(newestDataDate(manifest)).toBeNull();
  });

  it("ignores entries with a missing lastFetched but keeps the parseable one", () => {
    const manifest: Manifest = {
      stations: {
        "1": { file: "derived/1.json" },
        "2": { file: "derived/2.json", lastFetched: "2026-05-05T00:00:00.000Z" },
      },
    };
    expect(newestDataDate(manifest)).toBe("2026-05-05T00:00:00.000Z");
  });

  it("returns null when the sole lastFetched is a malformed/empty string", () => {
    const manifest: Manifest = {
      stations: {
        "1": { file: "derived/1.json", lastFetched: "" },
        "2": { file: "derived/2.json", lastFetched: "not-a-date" },
      },
    };
    expect(newestDataDate(manifest)).toBeNull();
  });

  it("tolerates a missing/undefined stations object", () => {
    expect(newestDataDate({} as Manifest)).toBeNull();
  });
});

describe("formatIcelandicDate — hand-rolled Icelandic human date (UTC)", () => {
  it("formats a mid-year ISO into '20. júlí 2026'", () => {
    expect(formatIcelandicDate("2026-07-20T07:18:37.625Z")).toBe("20. júlí 2026");
  });

  it("formats a January ISO into '5. janúar 2026' (no leading zero)", () => {
    expect(formatIcelandicDate("2026-01-05T00:00:00.000Z")).toBe("5. janúar 2026");
  });

  it("uses the UTC day (does not shift across a timezone boundary)", () => {
    // 23:30Z on the 31st must stay the 31st (December), not roll into January in a +tz.
    expect(formatIcelandicDate("2026-12-31T23:30:00.000Z")).toBe("31. desember 2026");
  });

  it("returns null for an invalid date string (never 'Invalid Date')", () => {
    expect(formatIcelandicDate("not-a-date")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(formatIcelandicDate("")).toBeNull();
  });
});
