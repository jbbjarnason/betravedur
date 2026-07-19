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
  groupBySeasonYear,
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

const WINDOW_SPEC = {
  startDoy: leapFoldedDoy(`2011-${WINDOW_FROM}`)!,
  endDoy: leapFoldedDoy(`2011-${WINDOW_TO}`)!,
};
const WINDOW = expandWindow(WINDOW_SPEC);

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

function fmt(n: number | null | undefined, digits = 1): string {
  return typeof n === "number" && Number.isFinite(n) ? n.toFixed(digits) : "—";
}

/**
 * Run the FULL real chain for one station's multi-year rows and return a display
 * record: coverage-honest N PER METRIC, the aggregated means, and the combined
 * score. rain is only scored for SYNOP (structurally null on AWS).
 *
 * Coverage honesty (WR-10, WR-11):
 *   - every component is gated on ITS OWN metric's qualifying years (N>=3),
 *     never on temperature's N;
 *   - every mean pools only in-window rows from that metric's QUALIFYING years —
 *     years that failed the 80% gate never leak into a mean;
 *   - grouping is season-anchored (groupBySeasonYear), correct even if the
 *     window ever wraps the year end (WR-03).
 */
interface StationReport {
  nTemp: number;
  nWind: number;
  /** null = rain not applicable (AWS). */
  nRain: number | null;
  /** True when at least one component passes its own N>=3 gate. */
  sufficient: boolean;
  meanTemp: number | null;
  meanSpeed: number | null;
  meanDir: { dirDeg: number; resultantSpeed: number } | null;
  typicalRain: number | null;
  combined: CombinedScore | null;
  hasRain: boolean;
}

function computeStation(rows: DailyObservation[], network: "AWS" | "SYNOP"): StationReport {
  const rowsByYear = groupBySeasonYear(rows, WINDOW_SPEC);

  // Per-metric coverage-honest gates (WR-10): each component earns its own N.
  const tempYears = qualifyingYears(rowsByYear, WINDOW, (o) => o.t);
  const windYears = qualifyingYears(rowsByYear, WINDOW, (o) => o.f);
  const hasRain = network === "SYNOP";
  const rainYears = hasRain ? qualifyingYears(rowsByYear, WINDOW, (o) => o.r) : [];
  const tempOk = effectiveN(tempYears).sufficient;
  const windOk = effectiveN(windYears).sufficient;
  const rainOk = effectiveN(rainYears).sufficient;

  // In-window rows restricted to a metric's qualifying years (WR-11).
  const inWindowFrom = (years: number[]): DailyObservation[] =>
    years.flatMap((y) => (rowsByYear.get(y) ?? []).filter((r) => WINDOW.has(r.doy)));
  const tempRows = inWindowFrom(tempYears);
  const windRows = inWindowFrom(windYears);

  // Aggregate means over qualifying-year in-window rows (missing != zero everywhere).
  const meanTemp = tempOk ? scalarMeanSpeed(tempRows.map((r) => r.t)) : null;
  const meanSpeed = windOk ? scalarMeanSpeed(windRows.map((r) => r.f)) : null;
  const meanDir = windOk
    ? circularMeanDirection(
        windRows
          .filter((r) => r.dv != null && r.f != null)
          .map((r) => ({ speed: r.f as number, dirDeg: r.dv as number })),
      )
    : null;

  // Rain only for SYNOP, and only when rain itself clears the N>=3 gate:
  // sum-per-year-then-average over the qualifying rain years.
  const typicalRain =
    hasRain && rainOk ? sumPerYearThenAverage(rowsByYear, WINDOW, rainYears) : null;

  // Map means -> 0-10 component scores; a component that failed its own gate is
  // null here and drops out of combine()'s renormalization.
  const sufficient = tempOk || windOk || rainOk;
  const combined = sufficient
    ? combine({
        temp: meanTemp != null ? tempComponent(meanTemp) : null,
        wind: meanSpeed != null ? windComponent(meanSpeed) : null,
        rain: typicalRain != null ? rainComponent(typicalRain) : null,
      })
    : null;

  return {
    nTemp: tempYears.length,
    nWind: windYears.length,
    nRain: hasRain ? rainYears.length : null,
    sufficient,
    meanTemp,
    meanSpeed,
    meanDir,
    typicalRain,
    combined,
    hasRain,
  };
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

  // Per-metric N badge (WR-10): the displayed N never misrepresents a component's
  // own evidence base by borrowing temperature's coverage.
  const nStr =
    `N: hiti=${rep.nTemp} vindur=${rep.nWind}` +
    (rep.nRain !== null ? ` úrkoma=${rep.nRain}` : "");

  let scoreLine: string;
  if (!rep.sufficient) {
    scoreLine = `ófullnægjandi gögn (N < 3 í öllum þáttum)`;
  } else if (rep.combined && rep.combined.score != null) {
    const contrib = rep.combined.contributing.join("+");
    const badge = rep.combined.missingRain ? "  [án úrkomu]" : "";
    scoreLine = `EINKUNN ${rep.combined.score.toFixed(1)}/10  (${contrib})${badge}`;
  } else {
    scoreLine = "—";
  }

  console.log(
    `[${network}] ${name} (#${stationId})  ${nStr}\n` +
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
