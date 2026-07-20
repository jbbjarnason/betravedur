---
phase: 03-static-site-shell-interactive-map
reviewed: 2026-07-20T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - site/src/data/averages.ts
  - site/src/data/load.ts
  - site/src/data/types.ts
  - site/src/main.ts
  - site/src/map/init.ts
  - site/src/map/markers.ts
  - site/src/map/style.ts
  - site/src/ui/attribution.ts
  - site/src/ui/header.ts
  - site/src/styles/markers.css
  - site/src/styles/tokens.css
  - site/index.html
findings:
  critical: 0
  warning: 5
  info: 3
  total: 8
status: fixed
fixed_at: 2026-07-20
fixed:
  warning: 5
  info: 3
  skipped: 0
---

# Phase 3: Code Review Report

**Reviewed:** 2026-07-20
**Depth:** standard
**Files Reviewed:** 12
**Status:** fixed (all 5 warnings + all 3 info addressed 2026-07-20 — see per-finding FIXED notes)

## Summary

Reviewed the new `site/` client slice (Vite + vanilla TS + MapLibre GL): data load/decode/average pipeline, the hybrid symbol-collision + DOM-composite marker renderer, map init, style muting, attribution, header, and tokens/marker CSS. Cross-referenced the consumed `@betravedur/domain` math (`coverage.ts`, `wind.ts`, `precip.ts`, `window.ts`) and the `@betravedur/pipeline/derive` codec.

**Security:** clean. No secrets (the lone `token` grep hit is `tokens.css`). The single `innerHTML` sink (`markers.ts:227`) receives only `Math.round`-ed numerics and static strings — station `name` is routed exclusively through `setAttribute("aria-label", …)` (not HTML-parsed), so there is no XSS surface. pmtiles protocol registration is correctly guarded idempotent. No `eval`, no console noise beyond one intentional `console.error`.

**Correctness:** the notable defects are a divergence between how the client computes the *displayed* temperature mean and the domain's coverage-honest averaging contract, and the fact that wind/precip are shown with **no** coverage gate at all. Neither crashes, but both undercut the "coverage honesty" promise the code repeatedly claims in its own comments. The wind-arrow render also has an unresolved FROM/TOWARD convention question that risks a 180°-wrong arrow — the exact pitfall PITFALLS.md flags.

Known-tracked items (map-load error UI / empty-state deferred to Phase 7, bilingual basemap label, the two raw-pixel CSS values) were confirmed present and are **not** re-reported below.

## Warnings

### WR-01: Temperature mean is computed over ALL years, not just the qualifying (≥80%-coverage) years — diverges from the domain averaging contract

**FIXED** (commit `1d82bca`): Added `meanPerYearThenAverage` to `@betravedur/domain` (per-year mean over qualifying years, then equal-weight average); `computeMarkerDatum` now uses it for temperature. Tests prove a barely-covered year is excluded and qualifying years are weighted equally.

**File:** `site/src/data/averages.ts:73-80, 96-97`
**Issue:** `sufficient` is derived from `qualifyingYears(...)` (per-year ≥80% window coverage), but `meanTemp` is a flat mean over every in-window row across **all** years, including years that individually fail the 80% coverage gate:
```ts
const inWin = rows.filter((r) => windowDays.has(r.doy));
const temps = inWin.map((r) => r.t).filter((v): v is number => v != null);
const meanTemp = temps.length ? temps.reduce((a,b)=>a+b,0)/temps.length : null;
```
The domain's canonical pattern (`precip.ts#sumPerYearThenAverage`) is: restrict to `qualifying` years, aggregate per-year, then average years equally. The client instead (a) includes sparse, non-qualifying years in the mean, and (b) weights each year by its day count (a 14-day year counts 14×, a 3-day year 3×) rather than weighting qualifying years equally. So the number the marker displays is not the same average the coverage gate is vouching for. The comment at line 10-11 asserts "effective N comes from the qualifying DATA-coverage years" but the *value* shown is not restricted to those years. This is the "confident average for a period the station barely covered" pitfall (PITFALLS.md:24).
**Fix:** Compute the temperature mean over the qualifying years only, mirroring the domain path. Either add a `meanPerYearThenAverage(rowsByYear, windowDays, qualifying)` to `@betravedur/domain` and call it, or restrict inline:
```ts
const qYears = qualifyingYears(byYear, windowDays, (o) => o.t);
const { n, sufficient } = effectiveN(qYears);
const perYearMeans = qYears.map((y) => {
  const days = (byYear.get(y) ?? []).filter((r) => windowDays.has(r.doy) && r.t != null);
  return days.reduce((a, r) => a + (r.t as number), 0) / days.length;
});
const meanTemp = perYearMeans.length
  ? perYearMeans.reduce((a, b) => a + b, 0) / perYearMeans.length
  : null;
const tempC = sufficient ? meanTemp : null;
```

### WR-02: Wind speed, wind direction and precip presence bypass the coverage gate entirely

**FIXED** (commit `1d82bca`): All metrics now gated on the same qualifying-years / N≥3 gate as temp — below the gate the whole datum collapses to the muted "ófullnægjandi gögn" state; when sufficient, wind speed/direction/precip are derived from qualifying-year in-window rows only. `MarkerDatum` contract doc updated to make this the documented decision. Test added.

**File:** `site/src/data/averages.ts:82-94`
**Issue:** `windSpeed`, `windDir`/`windVariable`, and `hasPrecip` are all computed from raw `inWin` rows with **no** qualifying-years / N-gate applied — unlike `tempC`, which is nulled when `!sufficient`. A station with only one or two sparse years in-window (below the N≥3 honesty gate for temperature) will still render a confident wind arrow, a wind speed, and a precip drop drawn from that same thin data. The `MarkerDatum` contract (`types.ts:16-21`) only documents `tempC` as gated, so the renderer happily shows wind/precip in the muted state too. That is coverage-*dishonest* for two of the three metrics and contradicts the module's own "coverage honesty" framing.
**Fix:** Decide the intended contract and enforce it. If N-gate applies to all metrics, gate them:
```ts
const windSpeed = sufficient ? scalarMeanSpeed(inWin.map((r) => r.f)) : null;
// ...and derive windDir/hasPrecip from qualifying-year rows, or null them when !sufficient
```
If wind/precip are intentionally ungated, document that explicitly on `MarkerDatum` and in the module header so it is a decision, not an oversight. At minimum, compute the wind mean and precip presence from the qualifying-year rows (like WR-01) rather than the full unfiltered span.

### WR-03: Wind-arrow FROM/TOWARD convention is unpinned — risks a 180°-wrong arrow

**FIXED** (commit `9846a36`): Pinned the convention. Evidence from 01-RESEARCH.md live sample `dv:151.0, dv_txt:"SSE"` (SSE ≈ 157.5°) confirms `dv` (vindátt) is the direction the wind blows FROM (met convention). DECISION: arrow points TOWARD (trip-planner intuition) → rotate by `dv + 180`. Documented in a code comment and locked by a unit test asserting dv=0 (north wind) → arrow points south (rotate 180) plus the other cardinals.

**File:** `site/src/map/markers.ts:75-94`
**Issue:** The docstring states the arrow "points the direction the wind blows TOWARD" and rotates a North-based arrow by the raw compass value (`rotate(deg)` where `deg = windDir`). But `dv` from `api.vedur.is` (Icelandic *vindátt*) is, by standard meteorological convention, the direction the wind blows **FROM**. Nothing in the repo pins this convention (`derive.ts` calls `dv` just "wind direction"; no FROM/TOWARD note in domain or specs). If `dv` is a FROM-direction, then rendering "toward" requires `windDir + 180` — otherwise the arrow points the exact wrong way. PITFALLS.md:33-36 explicitly warns this bug is "invisible in code review and only shows up as subtly-wrong arrows." The Playwright suite cannot catch a 180° flip. As written, the code's rotation and its own docstring are only self-consistent if `dv` is a TOWARD-direction, which is the non-standard reading.
**Fix:** Pin the convention with a test against a known station/day (e.g. a strong prevailing-SW-wind coastal station should show an arrow pointing NE if "toward", SW if "from"). If `dv` is FROM (the likely case), either add `+ 180` in `windArrowSvg`/at the datum level, or change the docstring + arrow semantics to "points FROM (into the wind)" and keep the raw value. Encode the decision in a comment referencing the API field definition.

### WR-04: `attachCompositeRenderer` has no idempotency guard — re-invocation leaks duplicate map listeners

**FIXED** (commit `32e7b2c`): Track the attached `idle`/`move` handler pair per map in a `WeakMap` and detach the prior pair before wiring a fresh one, so re-invocation (Phase-4 period selector) never stacks listeners. Test with a fake map asserts handler counts stay at 1 across re-invocations and separate maps stay independent.

**File:** `site/src/map/markers.ts:278-282`
**Issue:** `attachCompositeRenderer` unconditionally does `map.on("idle", draw)` and `map.on("move", draw)` with no dedup and no stored handle to `off` later. The module documents `installMarkerLayer` as the re-callable Phase-4 period-change seam ("just re-sets the GeoJSON `data`"), and `renderComposite`'s doc says the flow is "decoupled from the data source so a period change just calls installMarkerLayer + a fresh render." The natural next step — re-running the wire flow on a period change — will call `attachCompositeRenderer` again and stack a second (then third…) pair of `idle`/`move` handlers, each doing a full `queryRenderedFeatures` + DOM rebuild per event. It is a latent leak today (called once) but a live one the moment Phase 4 wires the selector.
**Fix:** Make it idempotent, e.g. guard with a per-map flag or detach any prior handlers:
```ts
const ATTACHED = new WeakSet<maplibregl.Map>();
export function attachCompositeRenderer(map: maplibregl.Map): void {
  if (ATTACHED.has(map)) return;
  ATTACHED.add(map);
  const draw = (): void => renderComposite(map);
  map.on("idle", draw);
  map.on("move", draw);
}
```

### WR-05: Fetch helpers ignore `res.ok`; a non-JSON or JSON-error 404 body is silently treated as "empty data"

**FIXED** (commit `ade4e0f`): `loadStations`/`loadManifest`/`loadDerived` now route through a shared `fetchJson` that throws a labeled `HTTP <status>` error on a non-ok response — a subpath 404 is a distinct transport failure, not "empty data". Per-station `loadDerived` errors still degrade one station to muted (main.ts catch); stations/manifest 404s surface via the outer catch. Tests mock fetch for the 404 and happy paths.

**File:** `site/src/data/load.ts:53-71`
**Issue:** `loadStations`, `loadManifest`, and `loadDerived` call `res.json()` without checking `res.ok`. `fetch` does not reject on 4xx/5xx. Under the `/betravedur/` Pages subpath, a mis-resolved asset returns a 404 — often an HTML body (parse throws → caught) but on some hosts a JSON error body (`{}`/`{"error":...}`) parses **successfully** and flows downstream as if it were real data: a `{}` manifest yields `resolveDerivedFile → null → muted` and a `{}` derived file decodes to `nYears: undefined → length: NaN → 0 rows → muted` — so a genuine 404 is indistinguishable from "station has no data," with no distinct log. For `loadStations`, a JSON non-array 404 body makes `data.map(...)` throw in `loadMarkerData`, collapsing *all* markers to nothing behind a single `console.error`.
**Fix:** Check `res.ok` and throw a labeled error so the per-station / outer catch can distinguish transport failures from empty data:
```ts
export async function loadDerived(base: string, file: string): Promise<DerivedFile> {
  const res = await fetch(assetUrl(base, `data/${file}`));
  if (!res.ok) throw new Error(`derived fetch ${file}: HTTP ${res.status}`);
  return (await res.json()) as DerivedFile;
}
```
Apply the same guard to `loadStations`/`loadManifest`.

## Info

### IN-01: `formatCallout` dead branch — `d.windDir === null` is already implied by `d.windVariable`

**FIXED** (commit `b13b387`): Kept the guard as deliberate defensive belt-and-braces for externally-constructed data and documented it in a comment (guarantees `windArrowSvg(null)` is never called even if a future producer sets one field without the other).

**File:** `site/src/map/markers.ts:133`
**Issue:** `computeMarkerDatum` sets `windVariable = dir === null || resultantSpeed < FLOOR` and `windDir = windVariable ? null : dir.dirDeg`, so `windDir === null` ⟺ `windVariable === true`. The guard `if (d.windVariable || d.windDir === null)` therefore has a permanently-redundant second operand for data produced by this pipeline. Harmless defensively, but it hides the invariant and can mask a future producer that sets one without the other.
**Fix:** Either drop the redundant `|| d.windDir === null` (rely on `windVariable`) or add a comment that it is a defensive belt-and-braces for externally-constructed data.

### IN-02: `stationPriority` startPenalty comment is numerically wrong

**FIXED** (commit `b13b387`): Comment now documents that a missing `start` falls back to ≈1.0, sorting last-within-rank (the intended "unknown record depth ranks lowest" behavior).

**File:** `site/src/data/averages.ts:46`
**Issue:** `const startPenalty = (meta.start ?? 9999) / 10000;` is annotated `// ~0.19–0.20 for 1900s–2000s`, but `1900/10000 = 0.19` and `2000/10000 = 0.20` — the band is 0.19–0.20 only for years ~1900–2000; the comment's "~0.19–0.20" is fine numerically but the missing-`start` fallback of `9999/10000 ≈ 1.0` silently *loses* to real 2000s stations by a full unit within the same `typeRank`, which the comment does not mention. Cosmetic, but the fallback's ranking effect is undocumented.
**Fix:** Note that a missing `start` sorts last-within-rank (penalty ≈ 1.0), which is the intended "unknown record depth ranks lowest" behavior.

### IN-03: `.marker-overlay { overflow: hidden }` clips pills near the viewport edge

**FIXED** (commit `b13b387`): Changed the overlay to `overflow: visible` so edge-anchored pills aren't clipped by the overlay bounds (the map canvas already clips, and the overlay is `pointer-events:none`, so nothing intercepts clicks).

**File:** `site/src/styles/markers.css:12-18`
**Issue:** The overlay uses `overflow: hidden`, while each pill is `translate(-50%, -50%)` centered on its projected point. A survivor whose anchor sits within ~half a pill-width of the map edge will have its callout visually clipped by the overlay bounds rather than the map canvas. Not a correctness bug, but a legibility edge case for coastal stations near the framing bounds.
**Fix:** Consider `overflow: visible` on `.marker-overlay` (the map container already clips), or accept the clip as intentional. Confirm against the near-edge stations in the Iceland framing.

---

_Reviewed: 2026-07-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
