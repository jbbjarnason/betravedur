// Walking Skeleton end-to-end demo — CLOSED LOOP.
// Fetches REAL daily observations from api.vedur.is for a few AWS stations + 1 SYNOP
// station across several years, routes them through the full @betravedur/domain
// chain (expandWindow -> qualifyingYears/effectiveN -> means -> component curves ->
// combine), and prints a REAL per-station combined score to stdout.
//
// This is the payoff of Phase 1: real data -> domain math -> real combined score,
// end-to-end, with honest N>=3 gating ("ófullnægjandi gögn") and the "án úrkomu"
// badge for AWS stations that structurally lack precipitation.
//
// Run live:  BETRA_LIVE=1 npx tsx scripts/skeleton-demo.ts
//
// Note: hitting the network requires opt-in via BETRA_LIVE=1 so CI/offline runs are a no-op.

import {
  circularMeanDirection,
  combine,
  effectiveN,
  expandWindow,
  leapFoldedDoy,
  qualifyingYears,
  rainComponent,
  scalarMeanSpeed,
  sumPerYearThenAverage,
  tempComponent,
  windComponent,
  type Component,
  type CombinedScore,
  type DailyObservation,
  type StationMeta,
} from "@betravedur/domain";
import { fetchAwsDay, fetchSynopDay, fetchStations } from "@betravedur/fetch";

// A time-of-year window (mid-July) fetched across several years so N>=3 is reachable.
const WINDOW_FROM = "07-15";
const WINDOW_TO = "07-25";
const YEARS = [2011, 2012, 2013, 2014, 2015];
const AWS_STATIONS = [1350, 1395, 1470];
const SYNOP_STATIONS = [1];

const WINDOW = expandWindow({
  startDoy: leapFoldedDoy(`2011-${WINDOW_FROM}`)!,
  endDoy: leapFoldedDoy(`2011-${WINDOW_TO}`)!,
});

/** Group observations by station ID, preserving row order. */
function groupByStation(rows: DailyObservation[]): Map<number, DailyObservation[]> {
  const m = new Map<number, DailyObservation[]>();
  for (const r of rows) {
    const arr = m.get(r.station) ?? [];
    arr.push(r);
    m.set(r.station, arr);
  }
  return m;
}

/** Split a flat list of rows into a per-year map (year parsed from the date). */
function byYear(rows: DailyObservation[]): Map<number, DailyObservation[]> {
  const m = new Map<number, DailyObservation[]>();
  for (const r of rows) {
    const year = Number(r.date.slice(0, 4));
    const arr = m.get(year) ?? [];
    arr.push(r);
    m.set(year, arr);
  }
  return m;
}

function fmt(n: number | null | undefined, digits = 1): string {
  return typeof n === "number" && Number.isFinite(n) ? n.toFixed(digits) : "—";
}

/**
 * Run the FULL real chain for one station's multi-year rows and return a display
 * record: coverage-honest N per metric, the aggregated means, and the combined
 * score. rain is only scored for SYNOP (structurally null on AWS).
 */
interface StationReport {
  effN: number;
  sufficient: boolean;
  meanTemp: number | null;
  meanSpeed: number | null;
  meanDir: { dirDeg: number; resultantSpeed: number } | null;
  typicalRain: number | null;
  combined: CombinedScore | null;
  hasRain: boolean;
}

function computeStation(rows: DailyObservation[], network: "AWS" | "SYNOP"): StationReport {
  const rowsByYear = byYear(rows);
  const inWindow = rows.filter((r) => WINDOW.has(r.doy));

  // Coverage-honest N on the temperature metric (present in both networks).
  const tempYears = qualifyingYears(rowsByYear, WINDOW, (o) => o.t);
  const { n: effN, sufficient } = effectiveN(tempYears);

  // Aggregate means over the in-window rows (missing != zero everywhere).
  const meanTemp = scalarMeanSpeed(inWindow.map((r) => r.t));
  const meanSpeed = scalarMeanSpeed(inWindow.map((r) => r.f));
  const meanDir = circularMeanDirection(
    inWindow
      .filter((r) => r.dv != null && r.f != null)
      .map((r) => ({ speed: r.f as number, dirDeg: r.dv as number })),
  );

  // Rain only for SYNOP: sum-per-year-then-average over qualifying rain years.
  const hasRain = network === "SYNOP";
  const rainYears = hasRain ? qualifyingYears(rowsByYear, WINDOW, (o) => o.r) : [];
  const typicalRain = hasRain
    ? sumPerYearThenAverage(rowsByYear, WINDOW, rainYears)
    : null;

  // Map means -> 0-10 component scores; null components drop out of combine().
  const combined = sufficient
    ? combine({
        temp: meanTemp != null ? tempComponent(meanTemp) : null,
        wind: meanSpeed != null ? windComponent(meanSpeed) : null,
        rain: typicalRain != null ? rainComponent(typicalRain) : null,
      })
    : null;

  return { effN, sufficient, meanTemp, meanSpeed, meanDir, typicalRain, combined, hasRain };
}

function reportStation(
  meta: StationMeta | undefined,
  stationId: number,
  rows: DailyObservation[],
  network: "AWS" | "SYNOP",
): void {
  const name = meta?.name ?? `station ${stationId}`;
  const rep = computeStation(rows, network);

  const dirStr = rep.meanDir
    ? `${rep.meanDir.dirDeg.toFixed(0)}° @ ${rep.meanDir.resultantSpeed.toFixed(1)} m/s`
    : "—";
  const rainStr = rep.hasRain ? `${fmt(rep.typicalRain)} mm` : "án úrkomu";

  let scoreLine: string;
  if (!rep.sufficient) {
    scoreLine = `ófullnægjandi gögn (N=${rep.effN} < 3)`;
  } else if (rep.combined && rep.combined.score != null) {
    const contrib = rep.combined.contributing.join("+");
    const badge = rep.combined.missingRain ? "  [án úrkomu]" : "";
    scoreLine = `EINKUNN ${rep.combined.score.toFixed(1)}/10  (${contrib})${badge}`;
  } else {
    scoreLine = "—";
  }

  console.log(
    `[${network}] ${name} (#${stationId})  N=${rep.effN}\n` +
      `    meðalhiti=${fmt(rep.meanTemp)}°C  meðalvindur=${fmt(rep.meanSpeed)} m/s  vindátt=${dirStr}  úrkoma=${rainStr}\n` +
      `    ${scoreLine}`,
  );
}

/** Fetch a station's rows across all baseline years (one call per year window). */
async function fetchYears(
  fetcher: (ids: number[], from: string, to: string) => Promise<DailyObservation[]>,
  ids: number[],
): Promise<DailyObservation[]> {
  const perYear = await Promise.all(
    YEARS.map((y) => fetcher(ids, `${y}-${WINDOW_FROM}`, `${y}-${WINDOW_TO}`)),
  );
  return perYear.flat();
}

async function main(): Promise<void> {
  if (!process.env.BETRA_LIVE) {
    console.log(
      "skeleton-demo: set BETRA_LIVE=1 to hit the live api.vedur.is.\n" +
        "  BETRA_LIVE=1 npx tsx scripts/skeleton-demo.ts",
    );
    return;
  }

  console.log(`Betra Veður — Walking Skeleton demo (closed loop)`);
  console.log(
    `Window ${WINDOW_FROM}…${WINDOW_TO} over ${YEARS[0]}–${YEARS[YEARS.length - 1]} — real combined scores from api.vedur.is\n`,
  );

  const [meta, aws, synop] = await Promise.all([
    fetchStations([...AWS_STATIONS, ...SYNOP_STATIONS]),
    fetchYears(fetchAwsDay, AWS_STATIONS),
    fetchYears(fetchSynopDay, SYNOP_STATIONS),
  ]);
  const metaById = new Map(meta.map((m) => [m.station, m]));

  console.log("— AWS stations (vindátt til staðar; án úrkomu) —");
  const awsByStation = groupByStation(aws);
  for (const id of AWS_STATIONS) {
    reportStation(metaById.get(id), id, awsByStation.get(id) ?? [], "AWS");
  }

  console.log("\n— SYNOP station (úrkoma til staðar) —");
  const synopByStation = groupByStation(synop);
  for (const id of SYNOP_STATIONS) {
    reportStation(metaById.get(id), id, synopByStation.get(id) ?? [], "SYNOP");
  }

  console.log(
    "\nSkeleton chain OK: real data → @betravedur/domain → real combined score, end-to-end.",
  );
}

// Exported so tests can drive the exact same chain offline (no network).
export { computeStation, WINDOW };
export type { Component };

main().catch((err) => {
  console.error("skeleton-demo failed:", err);
  process.exit(1);
});
