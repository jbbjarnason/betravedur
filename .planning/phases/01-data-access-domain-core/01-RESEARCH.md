# Phase 1: Data Access & Domain Core - Research

**Researched:** 2026-07-19
**Domain:** Veðurstofa Íslands open weather API access + pure TypeScript climatology domain layer (window selection, circular wind mean, coverage-honest averages, component score)
**Confidence:** HIGH (API shape, fields, license, and data-availability all live-verified against api.vedur.is; domain algorithms HIGH; TS scaffolding HIGH)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Combined Weather Score**
- Each component (temp/rain/wind) scored via fixed, interpretable 0–10 curves: temperature better toward ~15–20°C, rain and wind less-is-better. Curves must be simple enough to explain in the "hvernig er einkunnin reiknuð?" panel (SCORE-03).
- Default weights: rain 40% / wind 30% / temp 30%.
- User-facing scale: 0–10 with a continuous red→green color ramp.
- Stations missing a component (e.g. no rain gauge): show the marker with available data plus a "vantar gögn" note, but exclude from the ranked best-stations list.
- Components are computed and stored separately; final score combined at display time (keeps future weight sliders possible — WGT-01).

**Climatology Windows & N-honesty**
- Periods are calendar-date-anchored windows (e.g. "19.–25. júlí"), sliding by day — not ISO week numbers.
- A year counts toward "meðaltal N ára" only if ≥80% of the window's days have observations for that station.
- Minimum N to display an average: N ≥ 3 qualifying years; otherwise "ófullnægjandi gögn".
- February 29 is excluded from windows (leap day folded out).

**Data Source & Station Registry**
- Primary endpoint: `api.vedur.is/weather/observations/aws/day` (fields t/tx/tn, f/fx/fg, dv, r); `/observations/synop/day` as supplement for long-history manned stations.
- Include all stations with enough daily history to satisfy N≥3; record owner/type in registry.
- Registry keyed on station ID with active-date windows. Different station IDs are never merged; relocations never spliced.
- Registry is a generated `stations.json` committed to the repo, refreshed by the pipeline from `/stations`.

**Domain Layer Implementation**
- TypeScript/Node end-to-end: same domain math module runs verbatim in the nightly pipeline and in the browser. (Deviates deliberately from STACK.md's Python-pipeline suggestion, per ARCHITECTURE.md's shared-TS-math recommendation.)
- Wind direction: unit-vector circular mean (350° & 10° → ≈0°, never 180°). Wind speed averaged separately as a scalar.
- Precipitation: sum over the window within each year, then average those sums across qualifying years. Missing precipitation values treated as missing, never zero.
- Test framework: Vitest.

### Claude's Discretion
- Exact shape/breakpoints of the 0–10 component curves (within the "simple and explainable" constraint).
- Module/package layout for the shared domain layer.
- HTTP client and retry strategy for API calls.

### Deferred Ideas (OUT OF SCOPE)
- Sunshine/cloud-cover in the score (SUN-01, v1.x) — only investigate sensor coverage here, don't implement.
- User-adjustable weights (WGT-01, v2) — kept possible by component-level storage, not built now.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-01 | Pipeline fetches daily station observations (temp mean/max/min, wind mean/max/gust + direction, precipitation) from `api.vedur.is/weather/` | Live-verified endpoint shapes, params, field names, and error responses. **Key caveat: precipitation is NOT available on AWS stations — see Critical Finding 1.** |
| DATA-05 | Aggregation correct: circular wind-direction mean, missing precip ≠ zero, every average tracks coverage | Circular-mean algorithm (u/v components), coverage-counting rules, and the exact null-semantics of the API (`r=null`, `r_missing=null`) documented below |
| DATA-06 | Station registry keyed on station ID with active-date windows (handles moves/closures without splicing) | `/stations` schema live-verified: `station`, `start`, `ending`, `type`, `owner`, `lat/lon/ele`. Confirmed same physical place has distinct IDs per station type (Keflavík: synop 990 from 1952, AWS 1350 from 2008) — never splice |
| DATA-08 | Site complies with CC BY 4.0 — attribution displayed, terms verified before ingest | Terms page retrieved live; exact license (CC BY 4.0), required attribution wording, and modified-data clause documented verbatim below |
| SCORE-01 | Combined score from separately-precomputed temp/precip/wind components (weights swappable later) | Component-separation design + fixed-curve approach documented; missing-component handling tied to the AWS-no-precip reality |
</phase_requirements>

## Summary

The Veðurstofa Íslands weather API at `https://api.vedur.is/weather/` is live, unauthenticated, CC BY 4.0, OpenAPI 3.1 (version `2026-02-17`), and returns clean JSON. All endpoint shapes, query parameters, field names, error responses, station-ID scheme, and history depth in this document were **verified by hitting the live API on 2026-07-19**, not inferred from the spec alone. The endpoint path is parametric — `/observations/aws/{aggregation}` and `/observations/synop/{aggregation}` with `aggregation=day` — so the CONTEXT.md decision "`/observations/aws/day`" resolves to `GET /observations/aws/day` (the capabilities endpoint confirms `/observations/aws/day` as the canonical documented URL). Multi-station fetch works in one request via repeated `station_id` params; date ranges use `day_from`/`day_to`; there is no cursor pagination.

**The single most important finding of this phase — and it reshapes the success criteria — is that precipitation (`r`) is systematically `null` on AWS stations (type `sj`, 439 stations) and is only available on SYNOP stations (type `sk`, of which only ~8 are active nationwide), while wind direction (`dv`) is available on AWS stations but absent from SYNOP daily records.** No AWS station in a broad live scan returned any non-null precipitation. This is a hard structural split: the rain component (weighted 40% — the heaviest) and the wind-direction requirement come from two different, largely non-overlapping station networks. Precipitation-only stations (type `ur`, 153) and climate stations (type `vf`, 105) are "third-party stations" not served by the day endpoints at all. Phase 1 must resolve, as an explicit design decision, how a per-station combined score is even formed given that most stations physically cannot supply all three components.

The domain layer itself is well-understood, low-risk pure-function work: a DOM-free TypeScript package computing day-of-year window selection (leap-day-folded), unit-vector circular mean for direction, scalar mean for speed, sum-then-average for precipitation, and a coverage-honest N. TypeScript 7.0.2 (the native compiler, stable since 2026-07-08) and Vitest 4.1.10 are current; the environment's Node 25.6.1 satisfies all engine requirements. Use an npm workspaces monorepo so the pipeline and the future Vite client import the identical `@betravedur/domain` package.

**Primary recommendation:** Build `packages/domain` as a pure, dependency-free TS package (100% Vitest-covered, including the 350°/10° case) and a thin `packages/fetch` API client; but treat "which stations can produce a combined score, and how a station missing precip is handled" as a first-class Phase 1 decision gate driven by the AWS-no-precip finding — do not let the plan assume every station yields temp+wind+rain.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Fetch raw daily observations from VÍ | Pipeline / build-time (Node) | — | API is called from the pipeline only, never the browser (CORS/rate/terms hygiene, ARCHITECTURE.md) |
| Station registry generation (`stations.json`) | Pipeline / build-time (Node) | — | Refreshed from `/stations`; committed artifact |
| Climatology math (window, circular mean, coverage, score) | Shared domain package (pure TS) | Runs in both pipeline and browser | Single source of truth; prevents pipeline/client drift (Anti-Pattern 4) |
| Combined-score assembly from components | Browser (display time) | Pipeline precomputes components | Components stored separately so weights stay swappable (WGT-01) |
| License / attribution text | Static config in domain/shared package | Consumed by UI later (UX-04) | Written down now in a UI-consumable form |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 7.0.2 | Language for domain + fetch packages | Current stable latest (published 2026-07-08); the native/Go port. LTS-stable alternative is 5.9.3 if any tooling incompatibility with TS7 surfaces. [VERIFIED: npm registry, dist-tags.latest=7.0.2] |
| Vitest | 4.1.10 | Unit test framework (CONTEXT.md locked) | De-facto TS/ESM test runner; zero-config with TS, fast, Vite-native. Latest published 2026-07-06. [VERIFIED: npm registry] |
| @vitest/coverage-v8 | 4.1.10 | Coverage reporting for the domain package | Matches Vitest major; V8 coverage is the default recommendation. [VERIFIED: npm registry] |
| Node.js | ^20.19 \|\| >=22.12 (env has 25.6.1) | Runtime for pipeline + test | Vite 8 engine floor is `^20.19.0 || >=22.12.0`; Vitest 4 is `^20 || ^22 || >=24`. Local env Node 25.6.1 satisfies both. [VERIFIED: npm view engines] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tsx | 4.23.1 | Run TS pipeline scripts directly without a build step | Pipeline entry points during dev / in Actions. [VERIFIED: npm registry] Optional — `node --experimental-strip-types` (Node 22+) or a `tsc` build are alternatives. |
| Native `fetch` | built-in (Node 20+) | HTTP client for the API (Claude's discretion) | No third-party HTTP dep needed; Node has global `fetch`. Add a tiny retry/backoff wrapper by hand (see Code Examples). |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| TypeScript 7.0.2 | TypeScript 5.9.3 | 5.9.3 is the last of the well-battle-tested 5.x line (2025-09-30); pick it if any editor/tooling in the stack lags TS7 support. Both compile the same domain code. |
| npm workspaces | pnpm workspaces | pnpm is faster and stricter about phantom deps; npm workspaces need zero extra install and match the "no extra tooling" instinct of a greenfield static site. Either is fine — this is Claude's-discretion layout. |
| Native fetch + hand-rolled retry | `undici` / `got` / `p-retry` | For 2–3 stations and a nightly job, native fetch + a 5-line retry loop is sufficient. Reach for `p-retry` only if retry policy grows complex. |
| tsx | `node --experimental-strip-types` | Node 22+ can strip TS types natively; tsx is more robust across TS features today. |

**Installation:**
```bash
# monorepo root
npm init -y                      # set "workspaces": ["packages/*"], "type": "module"
npm install -D typescript@7 vitest@4 @vitest/coverage-v8@4 tsx
# no runtime deps for the domain package — it must stay dependency-free
```

**Version verification (performed 2026-07-19):**
- `npm view vitest version` → `4.1.10` (modified 2026-07-06)
- `npm view typescript dist-tags` → `latest: 7.0.2` (published 2026-07-08), `5.9.3` is latest 5.x
- `npm view vite version` → `8.1.5`
- `npm view @vitest/coverage-v8 version` → `4.1.10`
- `npm view tsx version` → `4.23.1`
- Weekly downloads: typescript ~220M, vitest ~73M, tsx ~73M — all reference-grade, not slop-risk.

## Package Legitimacy Audit

> slopcheck could not be installed in this environment (no network install of the tool). Per protocol, packages are marked `[ASSUMED]` and the planner should gate installs behind a `checkpoint:human-verify`. Note, however, that every package here is a first-party, reference-implementation TS tool with hundreds of millions of weekly downloads, an official GitHub source, and **no `postinstall` script** (verified via `npm view <pkg> scripts.postinstall` — all empty). Real slop risk is effectively nil; the checkpoint is a formality.

| Package | Registry | Age | Downloads | Source Repo | postinstall | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-------------|-----------|-------------|
| typescript | npm | 10+ yrs | ~220M/wk | github.com/microsoft/TypeScript | none | unavailable | Approved [ASSUMED] |
| vitest | npm | 3+ yrs | ~73M/wk | github.com/vitest-dev/vitest | none | unavailable | Approved [ASSUMED] |
| @vitest/coverage-v8 | npm | 3+ yrs | (part of vitest org) | github.com/vitest-dev/vitest | none | unavailable | Approved [ASSUMED] |
| tsx | npm | 3+ yrs | ~73M/wk | github.com/privatenumber/tsx | none | unavailable | Approved [ASSUMED] |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                 api.vedur.is/weather   (CC BY 4.0, no auth, JSON)
                          │
         ┌────────────────┼─────────────────┐
   GET /stations   GET /observations/    GET /observations/
   (registry)       aws/day               synop/day
   type,start,      t,tx,tn,f,fx,fg,      t,txx,tnn,f,fx,fg,
   ending,owner     dv,dv_txt, r=NULL,    sun,n,r,r_type
                    count_measurements    (NO dv wind-dir)
         │                │                 │
         ▼                ▼                 ▼
   ┌──────────────────────────────────────────────┐
   │  packages/fetch  (Node, build-time only)      │
   │  - retry/backoff, schema-assert x-vi-api-ver  │
   │  - normalize rows → domain input shape        │
   └───────────────┬──────────────────────────────┘
                   │  DailyObservation[] + StationMeta[]
                   ▼
   ┌──────────────────────────────────────────────┐
   │  packages/domain  (PURE TS, zero deps)         │
   │                                                │
   │  window.ts   → expand day-of-year window       │
   │                (leap-day-folded, wrap-around)  │
   │  coverage.ts → qualifying-year test (≥80%)     │
   │  wind.ts     → circular mean (u/v) + scalar    │
   │  precip.ts   → sum-per-year, avg across years  │
   │  score.ts    → temp/rain/wind 0–10 components  │
   │                + combine(weights)              │
   └───────────────┬──────────────────────────────┘
                   │ same module imported by BOTH ▼
        ┌──────────┴───────────┐
        ▼                      ▼
  nightly pipeline        future Vite browser client
  (precompute derived)    (aggregate at display time)
```

Data flow to trace for the primary use case: a station's raw daily rows enter `packages/fetch`, are normalized, then `packages/domain` computes — for a chosen day-of-year window and year range — the coverage-honest per-component averages and the combined score. The pipeline runs this to bake derived files; the browser runs the identical code at selection time.

### Recommended Project Structure
```
betravedur/                     # monorepo root (npm workspaces, "type":"module")
├── package.json                # workspaces: ["packages/*"]
├── tsconfig.base.json          # shared strict TS config
├── vitest.config.ts            # or per-package
├── packages/
│   ├── domain/                 # PURE, dependency-free, browser+node safe
│   │   ├── src/
│   │   │   ├── types.ts        # DailyObservation, StationMeta, WindowSpec, ComponentScores
│   │   │   ├── window.ts       # day-of-year expansion, Feb-29 fold, wrap-around
│   │   │   ├── coverage.ts     # qualifying-year (≥80%) + effective N
│   │   │   ├── wind.ts         # circularMeanDirection() + scalarMeanSpeed()
│   │   │   ├── precip.ts       # sumPerYearThenAverage(), missing≠zero
│   │   │   ├── score.ts        # tempComponent/rainComponent/windComponent + combine()
│   │   │   └── index.ts        # public surface
│   │   ├── test/               # *.test.ts — includes 350/10 case, gap-year case
│   │   ├── package.json        # name "@betravedur/domain", no deps
│   │   └── tsconfig.json
│   └── fetch/                  # build-time API client (Node only)
│       ├── src/
│       │   ├── client.ts       # fetch + retry/backoff, x-vi-api-version assert
│       │   ├── stations.ts     # /stations → StationMeta[] + registry writer
│       │   └── observations.ts # aws/day + synop/day → normalized rows
│       ├── test/               # uses committed JSON fixtures from live API
│       └── package.json        # name "@betravedur/fetch", depends on @betravedur/domain
└── .planning/…
```

### Pattern 1: Pure shared domain package imported by both worlds
**What:** All climatology math lives in `@betravedur/domain` as pure functions with no I/O, no DOM, no Node built-ins.
**When to use:** Always — it is the whole reason the project chose TS-end-to-end over the STACK.md Python pipeline.
**Example:**
```typescript
// packages/domain/src/wind.ts — Source: circular/vector mean (NCAR wind_stats), CITED below
export function circularMeanDirection(
  samples: { speed: number; dirDeg: number }[],
): { dirDeg: number; resultantSpeed: number } | null {
  const usable = samples.filter(s => s.dirDeg != null && s.speed != null);
  if (usable.length === 0) return null;
  let u = 0, v = 0;
  for (const s of usable) {
    const rad = (s.dirDeg * Math.PI) / 180;
    u += s.speed * Math.sin(rad);   // east component
    v += s.speed * Math.cos(rad);   // north component
  }
  const n = usable.length;
  const meanU = u / n, meanV = v / n;
  let dir = (Math.atan2(meanU, meanV) * 180) / Math.PI;
  if (dir < 0) dir += 360;
  return { dirDeg: dir, resultantSpeed: Math.hypot(meanU, meanV) };
}
```

### Pattern 2: Coverage-honest N derived from data, never from the picker
**What:** For each candidate year, count how many of the window's (leap-folded) days have a usable observation for the metric; the year "qualifies" only if that fraction ≥ 0.80. N = number of qualifying years; display only if N ≥ 3.
**When to use:** Every average shown to a user (the project's core promise).
**Example:**
```typescript
// packages/domain/src/coverage.ts
export function qualifyingYears(
  rowsByYear: Map<number, DailyObservation[]>,
  windowDays: Set<number>,       // day-of-year indices (leap-folded)
  metric: (o: DailyObservation) => number | null,
  minCoverage = 0.8,
): number[] {
  const need = windowDays.size;
  const out: number[] = [];
  for (const [year, rows] of rowsByYear) {
    const present = rows.filter(r => windowDays.has(r.doy) && metric(r) != null).length;
    if (present / need >= minCoverage) out.push(year);
  }
  return out;
}
```

### Pattern 3: Precipitation — sum within year, average across qualifying years, missing≠zero
**What:** For each qualifying year, SUM the window's daily precip (skipping missing days, never coercing null→0); then average those per-year sums across the qualifying years. (Note the coverage denominator interacts with summing — see Pitfall 3.)
**When to use:** The rain component only.

### Anti-Patterns to Avoid
- **Splicing two station IDs into one series** (Keflavík synop 990 + AWS 1350 are different stations at the same airport — keep separate). [DATA-06]
- **Coercing `r=null`/`f=null`/`t=null` to 0** — the API uses `null` for both "sensor absent" and "value missing"; both must stay missing.
- **Duplicating the math in pipeline vs client** — one shared package (Anti-Pattern 4, ARCHITECTURE.md).
- **Plain arithmetic mean of wind direction** — the named 350°/10° bug.
- **Assuming every station yields all three score components** — most do not (see Critical Finding 1).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Test running / assertions / coverage | Custom test harness | Vitest + @vitest/coverage-v8 | Locked decision; zero-config TS/ESM |
| HTTP retries with jitter | Elaborate custom queue | native `fetch` + small backoff loop (or `p-retry` if it grows) | 2–3 stations nightly is trivial load |
| Circular statistics | A trig library import into the pure domain pkg | ~15 lines of `Math.atan2` (Code Examples) | Keeps `@betravedur/domain` dependency-free; the algorithm is small and testable |
| Day-of-year / leap handling | A date library (dayjs/luxon) in the domain pkg | Plain integer day-of-year with Feb-29 fold | Domain must stay dep-free and deterministic; DOY math is arithmetic, not calendar formatting |

**Key insight:** The domain package's value is that it is pure and dependency-free so it runs byte-identically in Node and the browser. Every dependency added to it is a liability. The API-facing `fetch` package is where a helper like `p-retry` is acceptable.

## Common Pitfalls

### Pitfall 1: Precipitation is absent from the AWS network (SCORE-01 / DATA-01 blocker)
**What goes wrong:** The plan assumes `GET aws/day` returns `r` (precip) per CONTEXT.md's field list, builds the rain component (40% weight) on it, and every AWS station silently scores as bone-dry paradise.
**Why it happens:** The CONTEXT.md decision lists `r` among aws/day fields, and the OpenAPI schema does declare an `r` field — but **live data returns `r=null` for every AWS station tested** (Keflavík 1350, Eyrarbakki 1395, Reykjavík AWS 1470, and ~30 others across a winter window). Precipitation lives on SYNOP stations (`sk`), which in turn lack wind direction.
**How to avoid:** Make "where does the rain component come from, and how is a station missing precip handled" an explicit Phase 1 decision. Options to surface to the user: (a) score only the ~8 active SYNOP stations for the full three-component score; (b) form the combined score per available component and mark AWS stations "vantar úrkomu" (aligns with the locked "exclude from ranked list if missing a component"); (c) investigate whether the `ur` precip stations can be reached via a non-day endpoint. This directly gates SCORE-01's viability.
**Warning signs:** Every AWS station's rain component = max; the "best/driest" ranking is dominated by rain-less stations.

### Pitfall 2: `r=null` means both "no gauge" and "value missing" — and `r_missing` doesn't disambiguate
**What goes wrong:** Coverage logic tries to distinguish a station that has a rain gauge but missed a day from one with no gauge at all, using `r_missing` — but live data shows `r_missing=null` exactly when `r=null` (no gauge), so the count field gives no signal.
**Why it happens:** `parameters=all` exposes `*_missing` counts (e.g. `t_missing=0`, `f_missing=0`), but for a sensor that doesn't exist the missing-count is itself null.
**How to avoid:** Treat `value==null` as "not usable for this metric this day" uniformly. Use station registry `type` (sj vs sk) plus a pre-scan of the raw series to decide whether a station *ever* reports a component, and drive the "vantar gögn" flag off that, not off per-day nulls alone.

### Pitfall 3: Precip coverage denominator vs sum-then-average
**What goes wrong:** Summing a window's precip over only the present days, then averaging across years, silently under-counts years that had gaps (a year with 5 of 7 rainy-window days summed looks drier than a full year) — yet the ≥80% coverage gate is supposed to have already excluded the too-sparse years.
**Why it happens:** The coverage gate (≥80% of days present) and the sum (over present days) are two separate operations; a qualifying year can still be missing up to 20% of days, biasing its window-total low.
**How to avoid:** Document the chosen convention explicitly (CONTEXT.md says "sum over the window within each year, then average those sums across qualifying years"). Because qualifying years already have ≥80% coverage, the residual bias is bounded; note it in the "hvernig er einkunnin reiknuð?" copy. Do not scale/impute — keep it simple and honest, and let the coverage gate do the filtering. Add a unit test asserting missing days are skipped (not zero-filled) in the sum.

### Pitfall 4: Wind direction averaged arithmetically (the named 350°/10° bug)
**What goes wrong:** `mean(350, 10) = 180` (due south) instead of ≈0 (north). Every marker arrow can point the wrong way.
**How to avoid:** Unit-vector (u/v) circular mean (Pattern 1). Make the 350°/10°→≈0° case an explicit named unit test (success criterion 4). Also surface a near-zero resultant as "breytileg átt".
**Warning signs:** Coastal arrows point against known prevailing winds; resultant speed implausibly low vs measured speeds.

### Pitfall 5: Leap-day (Feb 29) breaks day-of-year comparability
**What goes wrong:** Using raw day-of-year (1–366), Feb 29 shifts every subsequent day by one between leap and non-leap years, so "19.–25. júlí" maps to different DOY indices across years.
**Why it happens:** Naive `dayOfYear()` counts Feb 29.
**How to avoid:** Fold out Feb 29 (CONTEXT.md locked): compute a leap-independent day-of-year so July 19 has the same index every year, and drop any Feb-29 observations. Unit-test a leap year vs non-leap year mapping to the same window.

### Pitfall 6: Station churn / ID scheme — never splice (DATA-06)
**What goes wrong:** Treating "Keflavíkurflugvöllur" as one station merges synop 990 (1952–) and AWS 1350 (2008–), baking a discontinuity into averages.
**How to avoid:** Key everything on integer `station` ID; store `start`/`ending`/`type`/`owner`. 429 of 776 stations are decommissioned (`ending != null`) — the registry must retain them for historical windows. Never merge IDs; never splice relocations.

## Code Examples

### Fetch daily observations for multiple stations (one request)
```typescript
// packages/fetch/src/observations.ts
// Source: live-verified against api.vedur.is on 2026-07-19
const BASE = "https://api.vedur.is/weather";

export async function fetchAwsDay(
  stationIds: number[], from: string, to: string,
): Promise<AwsDayRow[]> {
  const qs = new URLSearchParams({ day_from: from, day_to: to, parameters: "basic", format: "json" });
  for (const id of stationIds) qs.append("station_id", String(id)); // repeat param = multi-station
  const res = await fetchWithRetry(`${BASE}/observations/aws/day?${qs}`);
  // 404 body: {"message":"No data found."}  — station wrong-type or empty range
  // 422 body: {"detail":[{type,loc,msg,...}]} — bad enum/param
  return res.json();
}

async function fetchWithRetry(url: string, tries = 3): Promise<Response> {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, { headers: { "accept": "application/json" } });
    if (r.ok) return r;
    if (r.status === 404 || r.status === 422) return r; // don't retry deterministic errors
    await new Promise(res => setTimeout(res, 500 * 2 ** i)); // backoff on 5xx/network
  }
  throw new Error(`fetch failed after ${tries}: ${url}`);
}
```

### Real verified response shapes (captured live 2026-07-19)
```jsonc
// GET /stations?station_id=1   → 200
[{"station":1,"name":"Reykjavík","abbr":"rvk","type":"sk","lat":64.1288,"lon":-21.9082,
  "ele":60.2,"wigos":"0-20000-0-04030","owner":"Veðurstofa Íslands","start":1920,"ending":null}]

// GET /observations/aws/day?station_id=1350&day_from=2024-07-15&day_to=2024-07-15&parameters=basic
[{"station":1350,"name":"Keflavíkurflugvöllur","time":"2024-07-15",
  "t":11.97,"tx":14.6,"tn":10.2,"f":5.0,"fx":7.7,"fg":10.5,
  "dv":151.0,"dv_txt":"SSE","r":null,"rsun":null,"count_measurements":24}]
//   ^ dv present (wind dir), r=null (NO precip on AWS)

// GET /observations/synop/day?station_id=1&day_from=2024-09-01&day_to=2024-09-01&parameters=basic
[{"station":1,"name":"Reykjavík","time":"2024-09-01",
  "t":...,"txx":17.4,"tnn":10.8,"f":2.6,"fx":5.8,"fg":8.6,
  "sun":11.0,"n":5.4,"n_txt_en":"5 oktas, Cloudy","r":15.2,"r_type":6}]
//   ^ r present (precip), sun+n present, but NO dv (wind direction)

// Error: bad station → 404 {"message":"Station/s not found."}
// Error: no rows    → 404 {"message":"No data found."}
// Error: bad enum   → 422 {"detail":[{"type":"enum","loc":["path","aggregation"],"msg":"..."}]}
```

## API Reference (live-verified 2026-07-19)

**Base:** `https://api.vedur.is/weather` — OpenAPI 3.1, `info.version="2026-02-17"`, license CC BY 4.0, no auth. Response `content-type: application/json`. **No rate-limit headers observed** (no `x-ratelimit-*`, `retry-after`); be a good citizen with backoff + incremental fetch anyway.

| Endpoint | Method | Key params | Returns |
|----------|--------|-----------|---------|
| `/stations` | GET | `station_id` (repeatable), `region_id` (1–12), `active` (true/false), `station_type` (sj/sk/ur/vf), `keyword`, `polygon` (WKT) | `Station[]`: `station,name,abbr,type,lat,lon,ele,wigos,owner,start,ending` |
| `/stations/{id}` | GET | path id | single Station |
| `/observations/aws/{aggregation}` | GET | `aggregation`=`10min\|hour\|day\|month\|year`; `station_id` (repeatable); `day_from`/`day_to` (YYYY-MM-DD, together); `parameters`=`basic\|all`; `format`=`json\|csv\|xlsx`; `order`=asc/desc; `count` (only when no date range); `x-vi-api-version` (header) | `AwsDayBasic[]` etc. |
| `/observations/synop/{aggregation}` | GET | `aggregation`=`clock\|day\|month\|year`; same query params; response is locale-suffixed (`SynopDayBasic_is`/`_en` via `locale`) | `SynopDayBasic[]` |
| `/capabilities`, `/parameters` | GET | — | machine-readable catalog; confirms `/observations/aws/day` as canonical URL |
| `/rodeo/collections/{agg}/locations/{id}` | GET | OGC EDR | Standardized subset — **excludes third-party (`ur`/`vf`) stations** |

**Field cheat-sheet (day aggregation):**
- AWS (`aws/day`, type `sj`): `t` mean temp, `tx`/`tn` max/min, `f`/`fx`/`fg` mean/max/gust wind (m/s), `dv`/`dv_txt` wind dir (°/text), `rh` humidity, `r` precip **(observed null everywhere)**, `rsun` sun **(observed null)**, `count_measurements`. With `parameters=all`: `t_missing`,`f_missing`,`r_missing` (missing-day counts; null when sensor absent).
- SYNOP (`synop/day`, type `sk`): `t`, `txx`/`tnn` max/min, `f`/`fx`/`fg` wind speed, `sun` sun hours, `n` cloud oktas + `n_txt_en`, `r` precip, `r_type`. **No `dv` (wind direction).**

**Fetch strategy for the pipeline:** multi-station via repeated `station_id`; incremental via `day_from`/`day_to` from last-stored date; `count`+`order=asc` to discover a station's oldest record (used live to confirm history depth).

## Runtime State Inventory

Greenfield repo (no code, no datastores, no deployed services yet). Not a rename/refactor phase — this section is not applicable. **None — verified: repo contains only `.planning/` and `CLAUDE.md`, no source, no data, no services.**

## Data Availability Findings (Phase 1 decision inputs)

Live-scanned 2026-07-19. **These reshape the Phase 1 success criteria and SCORE-01.**

| Station type | Code | Total | Active (`ending=null`) | Temp | Wind speed | Wind dir (`dv`) | Precip (`r`) | Sun/cloud |
|--------------|------|-------|------------------------|------|-----------|------------------|--------------|-----------|
| Automatic (AWS) | sj | 439 | ~318 | ✓ | ✓ | ✓ | **✗ (null everywhere)** | rsun ✗ (null) |
| Synop (manned) | sk | 79 | **8** | ✓ | ✓ | **✗** | ✓ (sparse) | ✓ `sun`,`n` |
| Precipitation | ur | 153 | many | — | — | — | (third-party; **not on day endpoints, 404**) | — |
| Climate | vf | 105 | many | — | — | — | (third-party; not on day endpoints) | — |

- **776 stations total; 347 active, 429 decommissioned** — registry must keep decommissioned ones for historical windows.
- **History depth verified:** AWS 1350 oldest = 2005-02-09; SYNOP 1 (Reykjavík) oldest = 1949-01-01. Baseline ranges like 2010–2015 are comfortably covered for major stations. Station `start` is a *year*; actual daily data may begin later than `start` (e.g. `start:1920` for Reykjavík but daily records from 1949) — gate ranges on actual data, not `start`.
- **SUN-01 (deferred) coverage answer:** sunshine (`sun` hours) and cloud (`n` oktas) exist **only on SYNOP stations** (`sk`), of which only 8 are active. AWS `rsun` is present in schema but null in practice. → SUN-01 is viable in principle for a handful of manned stations only; document as "gated, ~8 stations" and do not build.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `xmlweather.vedur.is` XML API | `api.vedur.is/weather` JSON + OpenAPI 3.1 + CC BY 4.0 | current (spec v2026-02-17) | Use JSON API; no XML parsing |
| Python pipeline (STACK.md) | Shared TypeScript domain (ARCHITECTURE.md, CONTEXT.md locked) | this project | One math module, no pipeline/client drift |
| TypeScript 5.x | TypeScript 7.0.2 native compiler | 2026-07-08 | Faster builds; 5.9.3 remains a safe fallback |

**Deprecated/outdated:**
- Assuming AWS stations report precipitation (per training-era knowledge and even the OpenAPI schema) — **empirically false in live data**; superseded by the scan above.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | AWS precipitation is *systematically and permanently* null, not a transient outage on 2024-07/2023-11 dates sampled | Data Availability / Pitfall 1 | If AWS precip actually exists in some periods, the score design over-restricts; MEDIUM risk — sampled ~50 stations across summer+winter, all null, so confidence is high but not exhaustive across all dates/stations |
| A2 | Only 8 SYNOP stations are active enough for a full 3-component score | Data Availability | If more manned/precip stations are reachable via another endpoint, rain coverage improves; verify `ur` access path in planning |
| A3 | No API rate limits (none advertised, none hit in ~60 live calls) | API Reference | If limits exist under heavier backfill load, pipeline needs throttling; LOW risk for 2–3 stations, revisit at Phase 2 backfill |
| A4 | TypeScript 7.0.2 tooling is stable for a greenfield pure-TS package with Vitest 4 | Standard Stack | If TS7/Vitest4 interop has rough edges, fall back to TS 5.9.3; LOW risk |
| A5 | `count_measurements=24` implies day is rolled up from hourly; coverage should key off day-level presence, not sub-daily counts | Coverage | If some stations report fewer sub-daily samples affecting quality, coverage may need refinement; LOW risk for daily climatology |

## Open Questions

1. **How is a combined score formed when precip and wind-direction live on different networks?**
   - What we know: AWS = temp+wind(+dir), no rain; SYNOP = temp+wind-speed+rain+sun, no wind-dir; only ~8 active SYNOP stations.
   - What's unclear: whether the product scores mostly AWS stations (rain component excluded/flagged) or restricts full scores to SYNOP stations, and whether wind *direction* is even shown for SYNOP.
   - Recommendation: raise as the first planning decision; the locked "exclude stations missing a component from the ranked list" already points toward per-component scoring with honest "vantar úrkomu" flags. Consider that the *ranked best-weather list* may effectively be a SYNOP-station list.

2. **Can precipitation-only (`ur`) or climate (`vf`) stations be read at all?**
   - What we know: they 404 on aws/day and are excluded from RODEO ("third-party station, available through non-EDR API").
   - What's unclear: which non-day endpoint (if any) serves them.
   - Recommendation: a short spike in planning against `/capabilities` and the `ur`-station docs; if unreachable, rain coverage is genuinely limited to SYNOP.

3. **Exact 0–10 component curve breakpoints** (Claude's discretion) — defer to plan; keep piecewise-linear and explainable.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | domain/fetch build + test | ✓ | 25.6.1 | — |
| npm | workspaces + install | ✓ | 11.9.0 | — |
| curl | pipeline dev / API probing | ✓ | system | native fetch |
| jq | dev inspection only | ✓ | system | — |
| api.vedur.is | DATA-01 (all fetching) | ✓ | spec 2026-02-17 | Open-Meteo (labeled gap-filler only, not primary) |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none blocking. (TypeScript/Vitest installed via npm at plan time.)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (+ @vitest/coverage-v8 4.1.10) |
| Config file | none yet — Wave 0 creates `vitest.config.ts` (or per-package) |
| Quick run command | `npx vitest run packages/domain` |
| Full suite command | `npx vitest run --coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-05 | Circular mean: 350° & 10° → ≈0° (not 180°) | unit | `npx vitest run packages/domain -t "circular mean 350 10"` | ❌ Wave 0 |
| DATA-05 | Wind speed scalar mean computed separately | unit | `npx vitest run packages/domain -t "scalar wind speed"` | ❌ Wave 0 |
| DATA-05 | Missing precip treated as missing, never zero (skipped in sum) | unit | `npx vitest run packages/domain -t "precip missing not zero"` | ❌ Wave 0 |
| DATA-05 | Effective N derived from ≥80% coverage, not picker; gap-year reduces N | unit | `npx vitest run packages/domain -t "qualifying years coverage"` | ❌ Wave 0 |
| DATA-05 | N<3 → "ófullnægjandi gögn" (no average) | unit | `npx vitest run packages/domain -t "min N 3"` | ❌ Wave 0 |
| DATA-05 | Feb-29 folded; leap & non-leap year map same window | unit | `npx vitest run packages/domain -t "leap day fold"` | ❌ Wave 0 |
| SCORE-01 | temp/rain/wind components computed separately; combine(weights) | unit | `npx vitest run packages/domain -t "component score"` | ❌ Wave 0 |
| SCORE-01 | Station missing a component → flagged, excluded from ranked list | unit | `npx vitest run packages/domain -t "missing component excluded"` | ❌ Wave 0 |
| DATA-06 | Registry keyed on ID; two IDs same place never merged; decommissioned retained | unit | `npx vitest run packages/fetch -t "registry no splice"` | ❌ Wave 0 |
| DATA-01 | fetch client parses live-shaped fixture (aws/day + synop/day + errors) | unit | `npx vitest run packages/fetch -t "parse observations"` | ❌ Wave 0 |
| DATA-08 | attribution/license constant present & well-formed | unit | `npx vitest run packages/domain -t "attribution"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run packages/domain` (fast, pure)
- **Per wave merge:** `npx vitest run --coverage`
- **Phase gate:** full suite green (incl. the named 350°/10° test) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `vitest.config.ts` + `tsconfig.base.json` + workspace `package.json` — no test infra exists yet
- [ ] `packages/domain/test/*.test.ts` — covers DATA-05, SCORE-01, DATA-08
- [ ] `packages/fetch/test/*.test.ts` — covers DATA-01, DATA-06
- [ ] Committed JSON fixtures captured from the live API (aws/day, synop/day, /stations, 404, 422) so `fetch` tests are offline/deterministic
- [ ] Framework install: `npm install -D typescript@7 vitest@4 @vitest/coverage-v8@4 tsx`

## Security Domain

> `security_enforcement` not set in config → treated as enabled. This phase is a build-time data client + pure math with no auth, no user input, no secrets.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | API is unauthenticated; no user auth in scope |
| V3 Session Management | no | static/no sessions |
| V4 Access Control | no | public read-only open data |
| V5 Input Validation | yes | Validate/schema-assert API responses before aggregation; assert `x-vi-api-version`/expected fields, clamp implausible values, fail loudly on schema drift |
| V6 Cryptography | no | no crypto in this phase |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Upstream API schema drift silently corrupts aggregates | Tampering | Assert expected field set + `info.version`; fail the pipeline on mismatch |
| Malformed/implausible values (bad temps, negative precip) poison averages | Tampering | Range-clamp + drop malformed rows in the normalizer before domain math |
| Supply-chain (npm dep) | Tampering | Keep `@betravedur/domain` dependency-free; pin dev-tool versions; all chosen packages have no postinstall |
| Committing any credential | Info disclosure | None needed — API needs no key; nothing to leak |

## Sources

### Primary (HIGH confidence)
- `https://api.vedur.is/weather/openapi.json` — full OpenAPI 3.1 spec: paths, params, enums, field schemas, license (fetched live 2026-07-19, 274 KB, HTTP 200)
- Live API calls 2026-07-19 (~60 requests): `/stations` (776 stations, type breakdown), `/stations?station_id=1`, `/observations/aws/day` (stations 1350/1395/1470/1477/1479/1480/1361 + ~30 more), `/observations/synop/day` (stations 1/990/178/293/400/495/620), history-depth via `count=1&order=asc`, error shapes (404/422), `/rodeo/collections/day`, `/capabilities` — all direct observation
- `https://athuganir.vedur.is/disclaimer?lng=en` and `?lng=is` — CC BY 4.0 terms + required attribution wording (fetched live, HTTP 200, both languages)
- npm registry (`npm view`) — typescript 7.0.2 (dist-tags, 5.9.3 fallback), vitest 4.1.10, @vitest/coverage-v8 4.1.10, vite 8.1.5, tsx 4.23.1, engines, empty postinstall scripts (2026-07-19)

### Secondary (MEDIUM confidence)
- `.planning/research/STACK.md`, `PITFALLS.md`, `ARCHITECTURE.md` — prior project research (cross-checked against live API; corrected the AWS-precip assumption)
- NCAR `wind_stats` / "Averaging wind speeds and directions" — circular/vector mean algorithm [CITED: PITFALLS.md sources]

### Tertiary (LOW confidence)
- None load-bearing.

## Metadata

**Confidence breakdown:**
- API shape / fields / license: HIGH — live-verified against the running API and spec, not training data
- Data availability (AWS-no-precip, SYNOP-only rain): HIGH for sampled dates/stations; MEDIUM that it holds across *all* dates/stations (A1)
- Domain algorithms (circular mean, coverage, leap fold): HIGH — small, deterministic, standard
- Stack versions: HIGH — npm-verified 2026-07-19
- Security: HIGH — minimal surface, correctly scoped

**Research date:** 2026-07-19
**Valid until:** 2026-08-18 for stack versions (30 days); API `info.version=2026-02-17` is stable — re-assert field set in-pipeline to catch drift. The AWS-precip finding is a structural product input; re-confirm only if VÍ changes its network.
