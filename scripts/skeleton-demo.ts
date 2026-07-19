// Walking Skeleton end-to-end demo.
// Fetches REAL daily observations from api.vedur.is for a few AWS stations + 1 SYNOP
// station, routes them through the @betravedur/domain boundary, and prints a
// human-readable per-station line to stdout.
//
// Domain math is stubbed (throws NOT_IMPLEMENTED) until Plan 02 — the demo catches
// that and prints "[domain math pending Plan 02]" for those fields. The point of the
// skeleton is proving REAL data reaches the domain boundary, not final numbers.
//
// Run live:  BETRA_LIVE=1 npx tsx scripts/skeleton-demo.ts
//
// Note: hitting the network requires opt-in via BETRA_LIVE=1 so CI/offline runs are a no-op.

import {
  circularMeanDirection,
  expandWindow,
  scalarMeanSpeed,
  type DailyObservation,
  type StationMeta,
} from "@betravedur/domain";
import { fetchAwsDay, fetchSynopDay, fetchStations } from "@betravedur/fetch";

// Fixed baseline window (verified live). Keflavík / Eyrarbakki / Reykjavík AWS + Reykjavík SYNOP.
const FROM = "2024-07-15";
const TO = "2024-07-25";
const AWS_STATIONS = [1350, 1395, 1470];
const SYNOP_STATIONS = [1];

/** Try a domain call; return a sentinel string if it is still a stub. */
function tryDomain<T>(fn: () => T, render: (v: T) => string): string {
  try {
    return render(fn());
  } catch (err) {
    if (err instanceof Error && err.message === "NOT_IMPLEMENTED") {
      return "[domain math pending Plan 02]";
    }
    throw err;
  }
}

function groupByStation(rows: DailyObservation[]): Map<number, DailyObservation[]> {
  const m = new Map<number, DailyObservation[]>();
  for (const r of rows) {
    const arr = m.get(r.station) ?? [];
    arr.push(r);
    m.set(r.station, arr);
  }
  return m;
}

function fmt(n: number | null | undefined, digits = 1): string {
  return typeof n === "number" && Number.isFinite(n) ? n.toFixed(digits) : "—";
}

function reportStation(
  meta: StationMeta | undefined,
  stationId: number,
  rows: DailyObservation[],
  network: "AWS" | "SYNOP",
): void {
  const name = meta?.name ?? `station ${stationId}`;

  // Route real rows through the domain boundary (stubs tolerated).
  const windowNote = tryDomain(
    () => expandWindow({ startDoy: 197, endDoy: 207 }),
    (s) => `${s.size} window days`,
  );

  const dirSamples = rows
    .filter((r) => r.dv != null && r.f != null)
    .map((r) => ({ speed: r.f as number, dirDeg: r.dv as number }));
  const meanDir = tryDomain(
    () => circularMeanDirection(dirSamples),
    (v) => (v ? `${v.dirDeg.toFixed(0)}° @ ${v.resultantSpeed.toFixed(1)} m/s` : "—"),
  );
  const meanSpeed = tryDomain(
    () => scalarMeanSpeed(rows.map((r) => r.f)),
    (v) => (v != null ? `${v.toFixed(1)} m/s` : "—"),
  );

  // Structural field-presence proof (this is the real skeleton signal).
  const dvPresent = rows.some((r) => r.dv != null);
  const rPresent = rows.some((r) => r.r != null);
  const sampleT = rows.find((r) => r.t != null)?.t ?? null;

  const rainNote = rPresent
    ? "úrkoma til staðar"
    : "án úrkomu (engin úrkomumæling)";
  const dirNote = dvPresent ? "vindátt til staðar" : "vindátt vantar";

  console.log(
    `[${network}] ${name} (#${stationId})\n` +
      `    rows=${rows.length}  window=${windowNote}\n` +
      `    hiti(sýnid)=${fmt(sampleT)}°C  meðalvindur=${meanSpeed}  meðalvindátt=${meanDir}\n` +
      `    ${dirNote}; ${rainNote}  [dv=${dvPresent ? "present" : "null"}, r=${rPresent ? "present" : "null"}]`,
  );
}

async function main(): Promise<void> {
  if (!process.env.BETRA_LIVE) {
    console.log(
      "skeleton-demo: set BETRA_LIVE=1 to hit the live api.vedur.is.\n" +
        "  BETRA_LIVE=1 npx tsx scripts/skeleton-demo.ts",
    );
    return;
  }

  console.log(`Betra Veður — Walking Skeleton demo`);
  console.log(`Window ${FROM} … ${TO} (real data from api.vedur.is)\n`);

  const [meta, aws, synop] = await Promise.all([
    fetchStations([...AWS_STATIONS, ...SYNOP_STATIONS]),
    fetchAwsDay(AWS_STATIONS, FROM, TO),
    fetchSynopDay(SYNOP_STATIONS, FROM, TO),
  ]);
  const metaById = new Map(meta.map((m) => [m.station, m]));

  console.log("— AWS stations (expect: vindátt present, úrkoma null) —");
  const awsByStation = groupByStation(aws);
  for (const id of AWS_STATIONS) {
    reportStation(metaById.get(id), id, awsByStation.get(id) ?? [], "AWS");
  }

  console.log("\n— SYNOP station (expect: úrkoma present, vindátt vantar) —");
  const synopByStation = groupByStation(synop);
  for (const id of SYNOP_STATIONS) {
    reportStation(metaById.get(id), id, synopByStation.get(id) ?? [], "SYNOP");
  }

  console.log("\nSkeleton chain OK: real data → @betravedur/domain boundary reached.");
}

main().catch((err) => {
  console.error("skeleton-demo failed:", err);
  process.exit(1);
});
