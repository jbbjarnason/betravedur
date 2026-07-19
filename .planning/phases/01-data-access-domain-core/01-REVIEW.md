---
phase: 01-data-access-domain-core
reviewed: 2026-07-19T00:00:00Z
depth: standard
files_reviewed: 29
files_reviewed_list:
  - packages/domain/src/attribution.ts
  - packages/domain/src/coverage.ts
  - packages/domain/src/precip.ts
  - packages/domain/src/score.ts
  - packages/domain/src/wind.ts
  - packages/domain/src/window.ts
  - packages/domain/src/types.ts
  - packages/domain/src/index.ts
  - packages/domain/test/attribution.test.ts
  - packages/domain/test/coverage.test.ts
  - packages/domain/test/precip.test.ts
  - packages/domain/test/score.test.ts
  - packages/domain/test/smoke.test.ts
  - packages/domain/test/wind.test.ts
  - packages/domain/test/window.test.ts
  - packages/fetch/src/index.ts
  - packages/fetch/src/observations.ts
  - packages/fetch/src/registry.ts
  - packages/fetch/src/stations.ts
  - packages/fetch/test/fixtures/aws-day.json
  - packages/fetch/test/fixtures/error-404.json
  - packages/fetch/test/fixtures/error-422.json
  - packages/fetch/test/fixtures/stations.json
  - packages/fetch/test/fixtures/synop-day.json
  - packages/fetch/test/observations.test.ts
  - packages/fetch/test/registry.test.ts
  - scripts/skeleton-demo.ts
  - test/e2e/skeleton.test.ts
findings:
  critical: 0
  warning: 11
  info: 6
  total: 17
status: findings
---

# Phase 01: Code Review Report

**Reviewed:** 2026-07-19
**Depth:** standard
**Files Reviewed:** 29 (plus `packages/fetch/src/client.ts` cross-referenced as a dependency of `observations.ts`)
**Status:** findings

## Summary

The core domain invariants named in the phase scope are implemented correctly on their tested happy paths: the circular wind mean uses speed-weighted atan2 and returns null on empty input (the 350/10 -> ~0 case is right); coverage uses a real >=80% data-derived fraction with the N>=3 gate; precipitation never coerces null to 0 and sums per-year before averaging; score renormalization over present components and the `missingRain` flag are correct; the fetch layer distinguishes 404 `{message}` -> `[]` from 422 `{detail}` -> throw, asserts schema before normalizing, and the registry never splices station IDs (990 vs 1350 verified distinct).

However, the review found 11 warnings, concentrated in three areas: (1) latent contract violations in the domain package (NaN score from zero weight sums, NaN day-of-year from malformed dates, duplicate-row double counting that can defeat the 80% coverage gate and inflate precip sums, and a season-splicing gap for the advertised wrap-around windows); (2) silent fabrication at the fetch trust boundary (station ID 0, station type defaulted to "sj", lat/lon defaulted to 0, a 422 with an unparseable body becoming an empty result); and (3) coverage-honesty inconsistencies in the skeleton chain (N gate applied only to temperature; pooled means across non-qualifying years). None rises to Critical: no security exposure, no crash, and no incorrect result on any input the current callers actually produce — but several warnings become live bugs the moment planned features (weight sliders WGT-01, wrap-around windows, the nightly pipeline) exercise the already-shipped API surface.

## Warnings

### WR-01: `combine()` returns NaN when the present components' weights sum to zero

**File:** `packages/domain/src/score.ts:97-102`
**Issue:** `weightSum` is computed over the present components only. With custom weights (a documented, tested parameter — and weight sliders are the named WGT-01 feature), a weight set like `{ temp: 0, rain: 1, wind: 0 }` applied to an AWS station (rain null) yields `weightSum = 0`, so `weights[c] / weightSum` is `0/0 = NaN` and `score` is `NaN` — violating the documented 0-10 contract. Negative weights are also accepted unvalidated and can push the score outside [0,10].
**Fix:**
```ts
const weightSum = present.reduce((acc, c) => acc + weights[c], 0);
if (weightSum <= 0) {
  // No usable weight mass over the present components — treat as unscorable.
  return { score: 0, contributing: [], missingRain: !present.includes("rain") };
}
```
Optionally also clamp the final score with `clamp10` and reject negative weights explicitly.

### WR-02: Duplicate rows for the same day-of-year double-count in coverage and inflate precip sums

**File:** `packages/domain/src/coverage.ts:21-24` (also `packages/domain/src/precip.ts:26-31`)
**Issue:** `qualifyingYears` counts *rows*, not *distinct window days*: `present` is `rows.filter(...).length`. If a year's rows contain two entries for the same `doy` (overlapping fetch ranges merged by a caller, an API duplicate, or a re-run of an append-only pipeline), a year with only 4 of 7 distinct days covered can produce 8 matching rows and pass the 80% gate (`8/7 > 0.8`) — defeating the coverage-honest invariant. The same duplicates are then summed twice in `sumPerYearThenAverage`, inflating the per-year precip total. Nothing in the pipeline dedupes by (station, date).
**Fix:** Count distinct days in coverage and dedupe in the precip sum:
```ts
// coverage.ts
const seen = new Set<number>();
for (const r of rows) {
  if (windowDays.has(r.doy) && metric(r) != null) seen.add(r.doy);
}
if (seen.size / need >= minCoverage) out.push(year);
```
and in `precip.ts`, keep a `Set<number>` of consumed doys per year (or dedupe rows by `date` upstream in `normalizeObservations`' callers).

### WR-03: Wrap-around windows are supported by `expandWindow` but every year-grouping in the codebase splices two seasons per calendar year

**File:** `packages/domain/src/coverage.ts:11-27` (contract), `scripts/skeleton-demo.ts:58-67`, `test/e2e/skeleton.test.ts:52-59`
**Issue:** `WindowSpec` documents wrap-around (`endDoy < startDoy`) and `expandWindow` implements and tests it. But `qualifyingYears`/`sumPerYearThenAverage` consume a `rowsByYear` map, and both existing `byYear` helpers group by *calendar* year. For a wrapping window (e.g. Dec 28 -> Jan 5), calendar year 2011 then contains Jan 1-5 2011 (the 2010/11 season) *and* Dec 28-31 2011 (the 2011/12 season): coverage treats these two half-windows as one "year", per-year precip sums mix two different seasons, and the edge years are systematically miscounted. No season-anchored grouping helper exists anywhere, so the advertised wrap feature silently produces wrong aggregates end-to-end.
**Fix:** Add a domain helper that assigns a row to a *season year* (e.g. rows with `doy >= startDoy` belong to season `year`, rows with `doy <= endDoy` belong to season `year - 1` when the window wraps) and document that `rowsByYear` for wrapping windows must be season-keyed. At minimum, document the constraint on `qualifyingYears`/`sumPerYearThenAverage` and assert `startDoy <= endDoy` in the current callers.

### WR-04: `leapFoldedDoy` can return `NaN`, and the Feb-29 guard downstream does not catch it

**File:** `packages/domain/src/window.ts:29-37` (also `packages/fetch/src/observations.ts:138-139`)
**Issue:** The doc contract is "Returns null for Feb 29... Range: 1-365". But for a date with a valid month and a non-numeric day slice (e.g. `"2024-07-"` or `"2024-07-ab"`), `Number(date.slice(8, 10))` is `NaN`, `before` is defined, and the function returns `before + NaN = NaN` — a `number`, so it type-checks. In `normalizeObservations`, the guard is `if (doy === null) continue`; `NaN !== null`, so the row is *kept* with `doy: NaN`, violating the `DailyObservation.doy` contract (1-365). `Set.has(NaN)` is false so the row silently never matches any window, but it pollutes counts and any future consumer that trusts the contract. A day of `"00"` similarly returns 0, outside the documented range.
**Fix:**
```ts
const day = Number(date.slice(8, 10));
if (!Number.isInteger(day) || day < 1 || day > 31) return null;
...
const doy = before + day;
return doy >= 1 && doy <= 365 ? doy : null;
```

### WR-05: `normalizeObservations` fabricates station ID 0 for rows with a missing/non-numeric station

**File:** `packages/fetch/src/observations.ts:141`
**Issue:** `station: toNum(raw.station) ?? 0`. Schema assertion only checks that the `station` *key* exists, not its type — if the API drifts to string IDs (`"1350"`) or a row carries a null station, every such row is silently attributed to station `0`. Any caller grouping by station (e.g. `groupByStation` in the demo, or the future pipeline) then merges unrelated rows under a fabricated ID — the exact splicing failure mode the registry layer (DATA-06) is built to prevent.
**Fix:** Drop the row (or throw SCHEMA_DRIFT, consistent with the fail-loud posture) when the station is not a finite number:
```ts
const station = toNum(raw.station);
if (station === null) continue; // or: throw new Error(`SCHEMA_DRIFT: non-numeric station`)
```

### WR-06: `clampDir` rejects 360 degrees, which is the standard meteorological encoding for a north wind

**File:** `packages/fetch/src/observations.ts:74-78`
**Issue:** `n >= 0 && n < 360` nulls `dv = 360`. In SYNOP/METAR convention, wind direction is commonly reported as 1-360 with **360 = north** and 0 reserved for calm/variable. The AWS fixture happens to max out at 343 so the tests never exercise this, but if api.vedur.is emits 360 for northerly wind (very likely given `dv_txt` values like "N"), every due-north observation is silently discarded, biasing the circular mean away from north — precisely the direction band the 350/10 regression test exists to protect.
**Fix:** Accept the inclusive range and normalize:
```ts
if (n < 0 || n > 360) return null;
return n % 360; // 360 -> 0
```
Verify the API's calm-vs-north encoding (0 vs 360) against the OpenAPI spec before finalizing.

### WR-07: A 422 response with an unparseable body silently becomes an empty result

**File:** `packages/fetch/src/observations.ts:201-204`
**Issue:** In `fetchDay`, when a 422 body fails `res.json()`, the catch fallback substitutes `{ message: "HTTP 422" }`. `parseObservationBody` treats `{message}` as the legitimate 404 "no data" envelope and returns `[]`. A genuine bad request (wrong parameters, malformed dates) is thereby converted into "no observations for this range" — in an append-only nightly pipeline that reads as a permanent data gap rather than a bug to fix.
**Fix:** Make the fallback preserve error semantics for non-404 statuses:
```ts
if (!res.ok && res.status !== 404) {
  const errBody = await res.json().catch(() => ({ detail: `HTTP ${res.status} (unparseable body)` }));
  return parseObservationBody(errBody, kind); // {detail} throws
}
```

### WR-08: `fetchStations` performs no response-shape validation, unlike the observations trust boundary

**File:** `packages/fetch/src/stations.ts:65-66`
**Issue:** `const rows = (await res.json()) as unknown[]; return rows.map(toStationMeta);`. If the API returns an error envelope (`{message}` / `{detail}`) with a 200, or any non-array body, `rows.map` throws a bare `TypeError: rows.map is not a function` — no SCHEMA_DRIFT guard, no error-body detection, inconsistent with the fail-loud design documented for `observations.ts` (Security Domain V5). Station metadata is the same trust boundary.
**Fix:** Mirror the observations pattern: check `Array.isArray`, detect `{message}`/`{detail}` envelopes, and throw a labeled `SCHEMA_DRIFT`/`API_BAD_REQUEST` error otherwise.

### WR-09: `toStationMeta` silently fabricates data on drift: unknown type -> "sj", missing station -> 0, missing lat/lon -> 0

**File:** `packages/fetch/src/stations.ts:22-30, 41-54`
**Issue:** Three silent defaults compound: (a) `toStationType` maps any unknown type string to `"sj"` (AWS), and station type drives structural assumptions (AWS = no precip) — a `"ur"` precip-only or new type gets mislabeled as an AWS station; (b) `num(s.station)` defaults to `0`, so multiple malformed rows all collide on registry key `0` (last-wins silently discards the others); (c) `num(s.lat)/num(s.lon)` default to `0`, placing a station in the Gulf of Guinea rather than failing. All three should fail loudly at the trust boundary instead of inventing plausible-looking values.
**Fix:** Have `toStationMeta` throw (or return null and have `fetchStations` filter with a warning) when `station` is not a positive finite number or `type` is not a known `StationType`; keep `lat`/`lon` only if finite, else reject the row.

### WR-10: Skeleton chain gates the combined score only on temperature's N; rain is scored from as little as one qualifying year

**File:** `scripts/skeleton-demo.ts:93-120`
**Issue:** `computeStation` computes `effN`/`sufficient` from `tempYears` only. `rainYears` is computed but never checked against the N>=3 gate: if rain qualifies in a single year, `sumPerYearThenAverage` returns that one year's sum, `rainComponent` scores it, and it enters `combine()` with full 0.4 weight — while the displayed `N=` badge reflects temperature coverage, misrepresenting the rain component's evidence base. Wind similarly has no per-metric coverage gate (see also WR-11). This weakens the "coverage-honest N" invariant precisely where the score is assembled.
**Fix:** Gate each component on its own metric's qualifying years:
```ts
const rainOk = effectiveN(rainYears).sufficient;
const typicalRain = hasRain && rainOk ? sumPerYearThenAverage(rowsByYear, WINDOW, rainYears) : null;
```
and report per-metric N (or the minimum across contributing metrics) instead of temp-only N.

### WR-11: Skeleton means pool all in-window rows across every year, including non-qualifying years

**File:** `scripts/skeleton-demo.ts:91, 97-104`
**Issue:** `inWindow` is filtered from *all* rows regardless of year qualification, so `meanTemp`, `meanSpeed`, and `meanDir` include days from years that failed the 80% coverage gate, and years with more surviving days weigh more than sparse years. This is internally inconsistent: precipitation correctly does per-year-sum-then-average over qualifying years only, while temp/wind use a pooled grand mean over everything. A station with 4 sparse, unqualifying hot years and 3 qualifying cool ones reports N=3 but a mean biased by the 4 excluded years.
**Fix:** Restrict pooled means to rows from qualifying years (per metric), or compute per-year means and average them across qualifying years, matching the precip methodology.

## Info

### IN-01: Domain barrel duplicates every export (star + explicit named re-export)

**File:** `packages/domain/src/index.ts:5-30`
**Issue:** Each module is both `export *`-ed and explicitly re-exported. Legal ES modules, but two lists to keep in sync; a new export added to a module silently ships via the star while the "documented public surface" list drifts stale.
**Fix:** Pick one style — either the explicit named list (drop the stars) or the stars (drop the list).

### IN-02: `scalarMeanSpeed` is used to average temperatures

**File:** `scripts/skeleton-demo.ts:98`, `test/e2e/skeleton.test.ts:112`
**Issue:** `meanTemp = scalarMeanSpeed(inWindow.map((r) => r.t))` — the function is a generic null-skipping mean, but its name asserts wind-speed semantics. Misleading at call sites and invites future speed-specific changes (e.g. clamping at 0) that would silently corrupt temperature means.
**Fix:** Rename to `scalarMean`/`meanOfPresent` in `wind.ts` (or add a generic alias) and use that for temperature.

### IN-03: Perfectly cancelling wind samples return `dirDeg: 0` (north) and the demo prints it as a direction

**File:** `packages/domain/src/wind.ts:28-30`, `scripts/skeleton-demo.ts:134-136`
**Issue:** `atan2(0, 0)` is 0, so an exactly antipodal set returns `{ dirDeg: 0, resultantSpeed: 0 }`. The doc says the caller should surface small resultants as "breytileg átt", but the only caller prints `0° @ 0.0 m/s` with no threshold — a spurious "north". Also, the null-filter on line 16 is dead code: the parameter type is non-nullable, and it would not filter `NaN` (the actual hazard) anyway.
**Fix:** In the demo, render "breytileg átt" when `resultantSpeed` is below a small threshold (e.g. < 0.5 m/s). In `wind.ts`, either widen the parameter type to accept nulls or drop the dead filter and add a `Number.isFinite` guard.

### IN-04: `skeleton-demo.ts` runs `main()` at import time and exports helpers no test imports

**File:** `scripts/skeleton-demo.ts:206-213`
**Issue:** The comment claims "Exported so tests can drive the exact same chain offline", but no test imports `computeStation`/`WINDOW` — `test/e2e/skeleton.test.ts` re-implements `byYear` and the chain instead (logic duplication). Meanwhile the unconditional top-level `main().catch(...)` makes any future import side-effectful (console output; `process.exit(1)` on error).
**Fix:** Guard execution (`if (process.argv[1]?.endsWith("skeleton-demo.ts")) main()...` or an entry check), and either use the exports from the e2e test or delete them and the stale comment.

### IN-05: `window.ts` accepts out-of-range inputs without validation

**File:** `packages/domain/src/window.ts:29-53`
**Issue:** `leapFoldedDoy("2024-02-30")` returns 89 (aliases to Mar 30); day `"00"` returns 0 (below documented range) — see WR-04 for the NaN case. `expandWindow` accepts `startDoy`/`endDoy` outside 1-365 and emits invalid doy values (e.g. `startDoy: 0` adds 0 to the set) or a smaller-than-expected wrap set for `startDoy > 365`.
**Fix:** Clamp/validate day-of-month against the month length in `leapFoldedDoy`; assert `1 <= startDoy, endDoy <= 365` in `expandWindow`.

### IN-06: Schema assertion checks key presence only, never value types

**File:** `packages/fetch/src/observations.ts:102-120`
**Issue:** `assertObservationSchema` verifies `field in row`. If the API drifts to string-encoded numbers (`"t": "11.97"`), the assertion passes and `toNum` silently nulls every measurement — the pipeline records a fully "present but null" dataset instead of failing loudly, and the coverage gate later reports it as insufficient data rather than schema drift.
**Fix:** For at least `station` and `time`, assert types (`number`, `string`); optionally spot-check that at least one row has a numeric `t`/`f` and throw SCHEMA_DRIFT otherwise.

---

_Reviewed: 2026-07-19_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
