// Derived-format encoder/decoder — the single compact artifact the browser downloads.
//
// SHAPE: columnar, integer-quantized, IMPLICIT-date. Each column is a flat array of
// length nYears*365; position i decodes to:
//   calendarYear   = startYear + Math.floor(i / 365)
//   leapFoldedDoy  = (i % 365) + 1        (1..365, Feb 29 folded out)
// The date string is reconstructed from (calendarYear, leapFoldedDoy) via the fixed
// 28-day-February inverse of `leapFoldedDoy` (packages/domain/src/window.ts).
//
// SEASON-YEAR CONVENTION (WR-03 — CRITICAL, see Pitfall 5):
//   Columns are stored by CALENDAR year. December is NOT pre-shifted here. Both the
//   pipeline and the client re-group via `groupBySeasonYear` AFTER `decodeDerived`,
//   which is where the "Dec head owns the year" wrap logic lives. Storing calendar
//   years and re-grouping on decode keeps a wrapping Dec->Jan window's per-season N
//   and mean identical to running the domain path on the raw rows (locked by the
//   wrapping round-trip test). Pre-shifting December in storage would double-apply the
//   shift after re-grouping and miscount the boundary season.
//
// NULL PRESERVATION: a missing metric cell is JSON `null`, never 0. An all-null column
// is DROPPED from `cols` (key absent) and reconstructed as null on decode. By station
// type: AWS (sj) omits `r` (precip), SYNOP (sk) omits `dv` (wind direction).
import type { DailyObservation, StationType } from "@betravedur/domain";

const DAYS_PER_YEAR = 365;

// Cumulative days before each month in a fixed NON-leap year (index 1 = January),
// mirroring packages/domain/src/window.ts so this is the exact inverse of leapFoldedDoy.
const CUMULATIVE_DAYS_BEFORE_MONTH = [
  0, 0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334,
];

// Metric columns, in stable emission order.
const METRIC_KEYS = ["t", "tx", "tn", "f", "fx", "fg", "dv", "r"] as const;
type MetricKey = (typeof METRIC_KEYS)[number];

// Quantization factors: divide the stored integer by this to decode.
// temp/wind kept to 0.1 precision (×10); dv/precip whole units (×1).
export interface QuantSpec {
  temp: number;
  wind: number;
  precip: number;
  dv: number;
}
const DEFAULT_QUANT: QuantSpec = { temp: 10, wind: 10, precip: 1, dv: 1 };

// Which quant factor applies to each metric column.
const METRIC_QUANT: Record<MetricKey, keyof QuantSpec> = {
  t: "temp",
  tx: "temp",
  tn: "temp",
  f: "wind",
  fx: "wind",
  fg: "wind",
  dv: "dv",
  r: "precip",
};

export interface DerivedFile {
  station: number;
  type: StationType;
  startYear: number;
  nYears: number;
  quant: QuantSpec;
  /** Each present column: length nYears*365, integer-quantized, null for missing. */
  cols: Partial<Record<MetricKey, (number | null)[]>>;
}

/** Inverse of leapFoldedDoy: 1..365 -> {month, day} in the fixed 28-day-Feb calendar. */
function doyToMonthDay(doy: number): { month: number; day: number } {
  // Walk months until the cumulative days-before exceeds doy-1.
  let month = 12;
  for (let m = 1; m <= 12; m++) {
    const before = CUMULATIVE_DAYS_BEFORE_MONTH[m + 1];
    if (before !== undefined && doy <= before) {
      month = m;
      break;
    }
  }
  const beforeMonth = CUMULATIVE_DAYS_BEFORE_MONTH[month] ?? 0;
  const day = doy - beforeMonth;
  return { month, day };
}

function dateFromYearDoy(year: number, doy: number): string {
  const { month, day } = doyToMonthDay(doy);
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/** Flat column index for a (calendarYear, leapFoldedDoy) pair. */
function indexFor(startYear: number, year: number, doy: number): number {
  return (year - startYear) * DAYS_PER_YEAR + (doy - 1);
}

/**
 * Encode normalized rows into the compact columnar derived shape.
 * Groups by calendar year × leap-folded doy; integer-quantizes each metric;
 * drops all-null columns; omits `r` for AWS and `dv` for SYNOP.
 */
export function encodeDerived(
  rows: DailyObservation[],
  type: StationType,
  quant: QuantSpec = DEFAULT_QUANT,
): DerivedFile {
  if (rows.length === 0) {
    return { station: 0, type, startYear: 0, nYears: 0, quant, cols: {} };
  }

  // Determine the calendar-year span. Feb-29 rows (doy null in domain) never
  // appear in normalized DailyObservation[] since doy is already leap-folded 1..365.
  let minYear = Infinity;
  let maxYear = -Infinity;
  let station = rows[0]!.station;
  for (const r of rows) {
    const y = Number(r.date.slice(0, 4));
    if (!Number.isInteger(y)) continue;
    if (y < minYear) minYear = y;
    if (y > maxYear) maxYear = y;
  }
  const startYear = minYear;
  const nYears = maxYear - minYear + 1;
  const length = nYears * DAYS_PER_YEAR;

  // Which columns are structurally omitted for this station type.
  const omit: Partial<Record<MetricKey, true>> =
    type === "sj" ? { r: true } : type === "sk" ? { dv: true } : {};

  // Build every candidate column, initialised to null (missing) everywhere.
  const cols: Partial<Record<MetricKey, (number | null)[]>> = {};
  for (const key of METRIC_KEYS) {
    if (omit[key]) continue;
    cols[key] = new Array<number | null>(length).fill(null);
  }

  for (const r of rows) {
    const year = Number(r.date.slice(0, 4));
    if (!Number.isInteger(year)) continue;
    const doy = r.doy;
    if (!Number.isInteger(doy) || doy < 1 || doy > DAYS_PER_YEAR) continue;
    const idx = indexFor(startYear, year, doy);
    if (idx < 0 || idx >= length) continue;
    for (const key of METRIC_KEYS) {
      const col = cols[key];
      if (!col) continue;
      const raw = r[key];
      if (raw === null || raw === undefined) continue; // preserve null (never 0)
      const factor = quant[METRIC_QUANT[key]];
      col[idx] = Math.round(raw * factor);
    }
  }

  // Drop all-null columns (key absent) so decode reconstructs them as null.
  for (const key of METRIC_KEYS) {
    const col = cols[key];
    if (!col) continue;
    if (col.every((v) => v === null)) {
      delete cols[key];
    }
  }

  return { station, type, startYear, nYears, quant, cols };
}

/**
 * Inverse of encodeDerived: rebuild DailyObservation[] from the columnar shape.
 * Absent columns and absent cells decode to null; date and doy are reconstructed
 * from each cell's implicit (calendarYear, leapFoldedDoy) position. Rows are emitted
 * only for positions where at least one present column carries a non-null value —
 * the encoder never wrote fully-missing days, so decode does not fabricate them.
 */
export function decodeDerived(d: DerivedFile): DailyObservation[] {
  const { station, startYear, nYears, quant, cols } = d;
  const length = nYears * DAYS_PER_YEAR;
  const out: DailyObservation[] = [];

  for (let i = 0; i < length; i++) {
    // Does any present column have a value at this position?
    let anyPresent = false;
    for (const key of METRIC_KEYS) {
      const col = cols[key];
      if (col && col[i] !== null && col[i] !== undefined) {
        anyPresent = true;
        break;
      }
    }
    if (!anyPresent) continue;

    const year = startYear + Math.floor(i / DAYS_PER_YEAR);
    const doy = (i % DAYS_PER_YEAR) + 1;
    const date = dateFromYearDoy(year, doy);

    const val = (key: MetricKey): number | null => {
      const col = cols[key];
      if (!col) return null;
      const raw = col[i];
      if (raw === null || raw === undefined) return null;
      return raw / quant[METRIC_QUANT[key]];
    };

    out.push({
      station,
      date,
      doy,
      t: val("t"),
      tx: val("tx"),
      tn: val("tn"),
      f: val("f"),
      fx: val("fx"),
      fg: val("fg"),
      dv: val("dv"),
      r: val("r"),
    });
  }

  return out;
}
