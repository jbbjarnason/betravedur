# Phase 5: Score Coloring & Ranking - Research

**Researched:** 2026-07-20
**Domain:** Data-viz color encoding (colorblind-safe sequential ramp) + vanilla-TS DOM UI (ranked list, legend/explainer) wired into an existing observable store, on MapLibre hybrid markers.
**Confidence:** HIGH (codebase + ColorBrewer authoritative hex + WCAG math verified in-session; color-scheme *choice* is Claude's discretion, decided below)

## Summary

Phase 5 is **presentation + ranking, not new math**. The combined-score math already exists in `@betravedur/domain` (`combine()` → `{ score: number|null, contributing[], missingRain }`, plus the `tempComponent`/`rainComponent`/`windComponent` 0–10 curves). Phase 4 delivered the loop-proof store/URL/recompute path, and Phase 3 delivered the hybrid symbol-collision + DOM-pill renderer. This phase adds: (1) a score-colored element on the pill, (2) a store-subscriber ranked-list DOM component, (3) a legend + expandable explainer, and (4) unit + Playwright coverage.

**The one non-obvious architectural gap this phase MUST close first:** `MarkerDatum` does **NOT** currently carry a `score`. `computeMarkerDatum` (site/src/data/averages.ts) computes `tempC`, `windSpeed`, `windDir`, `hasPrecip` (a boolean), and `n`/`sufficient` — but it never calls the domain score curves or `combine()`, and it never computes the **rain total in mm** that `rainComponent` needs (it only computes `hasPrecip` presence). So the phase's first task is a data-layer extension: compute the rain-total mm (via the existing `sumPerYearThenAverage`), feed the three raw window-metrics into the component curves, `combine()` them, and add `score: number|null` + `missingRain: boolean` to `MarkerDatum`. Everything downstream (marker color, ranking, legend) reads that one added field. The CONTEXT decision "MarkerDatum already carries the score fields" is **not yet true in code** — treat it as the wiring the plan must do, not an existing asset.

**Primary recommendation:** Extend `MarkerDatum` with `score`/`missingRain` in `averages.ts` (pure, unit-tested). Color the pill with a **score → color** helper using the **ColorBrewer BuGn** sequential ramp (cool light-blue at 0 → vivid green `#006d2c` at 10 — colorblind-safe, monotonic in luminance, "gott veður = grænt", never reuses accent red `#C0392B`). Apply as a **left border/ring on the pill body** plus keep the numeric score visible (color is never the sole channel). Build the ranked list and legend as **plain-DOM store subscribers** (zero new deps), reusing Phase 4's `store.set({ stationId })` + `map.easeTo` seam with the existing `viewportMatches` discipline to avoid a camera↔store loop.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Score computation (`combine()`) | `@betravedur/domain` (pure) | — | Already exists; never recompute in the UI [VERIFIED: packages/domain/src/score.ts] |
| Rain-total mm + component→combine wiring | Data layer (`site/src/data/averages.ts`, pure) | — | Producer of `MarkerDatum`; the only place that decodes derived files. Currently missing this step. |
| `score`→color mapping | Client util (`site/src/map/score-color.ts` new, pure) | — | Pure fn, unit-testable at boundaries; no DOM/map dependency |
| Marker color render | Map overlay (`site/src/map/markers.ts` `buildPill`) | CSS (`markers.css`) | Extends existing DOM-pill survivor render |
| Ranked list | UI DOM component (`site/src/ui/rankedList.ts` new) + store subscriber | `main.ts` wiring | Store-subscriber pattern (Phase 4 controlBar precedent) |
| Legend + explainer | UI DOM component (`site/src/ui/legend.ts` new) | CSS + tokens | Static DOM; native `<details>` for the explainer a11y |
| Row-click → fly-to + select | store `set({stationId})` + `map.easeTo` | `main.ts` seam | Reuse Phase 4 viewport discipline (map owns camera) |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Score Color Scale (Claude's discretion — decided):**
- Colorblind-safe **SEQUENTIAL** scale keyed to the 0–10 score: low = muted cool tone, high = vivid green/teal ("gott veður = grænt"). **NOT** a red–green diverging scale — accent red is already reserved for the temperature numeral and red-green is colorblind-hostile.
- Apply the score color as a **ring/border** (and/or a small score **badge**) on the existing white pill — keep the pill body white and the temp numeral red. The neutral Phase 3/4 marker becomes score-colored here.
- Color is **never the sole channel**: pair it with the numeric score (e.g. "7,8") on/near the pill and the ranked list. Reduced-motion + contrast safe.
- Stations with `score:null` (ófullnægjandi gögn) render in the existing muted state — NOT on the color scale, NOT ranked. Stations scored "án úrkomu" ARE colored + ranked (renormalized score), with the existing badge.

**Ranked "Best Stations" List:**
- Collapsible side panel titled **"Bestu staðir"** (right side on desktop). Rows ranked by score (desc); each row: rank, station name, score, án úrkomu badge if applicable. Excludes ófullnægjandi-gögn stations.
- Clicking a row **flies to / highlights** that station's marker (reuse map `easeTo` + existing marker; selecting updates URL `st` via the Phase 4 store — the station-select seam already exists).
- Updates live on every selection change (same recompute path). Collapsible; full mobile (bottom-sheet) is Phase 7 — here it degrades to a simple toggle on narrow screens.

**Score Explainer:**
- Folded INTO the legend panel (one place for all score meaning): the color scale + a compact **"hvernig er einkunnin reiknuð?"** affordance that expands a plain-Icelandic explanation of the weights (**úrkoma 40% / vindur 30% / hiti 30%**) and the "án úrkomu" renormalization. Transparency is the differentiator.

**Recompute Integration:**
- Score + ranking recompute on selection change through the existing Phase 4 store/recompute path — **NO new network fetch**. Extend the marker render + add the list/legend as store subscribers.

### Claude's Discretion
- Exact color ramp stops/hex (colorblind-safe, restrained) — **decided below: ColorBrewer BuGn**.
- Whether the score shows as badge vs ring vs both — **decided: left border/ring on pill + numeric badge**.
- Legend placement (corner), list row density, fly-to easing.

### Deferred Ideas (OUT OF SCOPE)
- Station chart panel (candlesticks/rain/daylight) on click — **Phase 6**.
- Reverse "worst weather" ranking (RANK-04, v1.x).
- Adjustable score weights sliders (WGT-01, v2).
- Mobile bottom-sheet for list/legend, info panel, loading/empty states — **Phase 7**.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MAP-03 | Markers colored by combined weather score, with a legend explaining the color scale | Add `score` to `MarkerDatum` (§Standard Stack / §Data-layer gap), `score-color.ts` BuGn helper (§Score Color Ramp), ring/badge on `buildPill` (§Marker Color Application), legend DOM (§Legend + Explainer) |
| SCORE-02 | Ranked "best stations for this period" list answers the core question directly | `rankedList.ts` store subscriber, stable desc sort excluding `score:null`, row-click → `store.set({stationId})` + `easeTo` (§Ranked List Architecture) |
| SCORE-03 | Score formula transparent — explainer "hvernig er einkunnin reiknuð?" | Native `<details>` explainer folded into legend, Icelandic weight text 40/30/30 + renormalization prose (§Legend + Explainer) |
</phase_requirements>

## Standard Stack

**Zero new dependencies.** The project's hard discipline (STACK, CONTEXT "no new npm deps preferred") holds — every capability this phase needs is either already present in `@betravedur/domain` or a platform primitive.

### Core (all existing / platform)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@betravedur/domain` | 0.1.0 (workspace) | `combine()`, `tempComponent/rainComponent/windComponent`, `sumPerYearThenAverage` | Already the score authority — read it, never recompute [VERIFIED: packages/domain/src/index.ts barrel] |
| MapLibre GL JS | 5.24.0 | `map.easeTo` for row-click fly-to | Already installed; `easeTo` is the standard animated camera move [ASSUMED: standard MapLibre API] |
| TypeScript / Vite | 5.x / 8.1.5 | strict TS, build | Existing toolchain |
| Native DOM `<details>`/`<summary>` | platform | Explainer expand/collapse with free a11y | No JS toggle logic, keyboard + screen-reader semantics for free [CITED: MDN details element] |
| CSS custom properties | platform | Score-scale tokens in `tokens.css` | Existing token pattern (Phase 3) |

**No new packages installed → the Package Legitimacy Audit below is a no-op (no external install).**

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled `<details>` explainer | A JS accordion / `aria-expanded` button + hidden panel | `<details>` gives keyboard + AT semantics free; a JS toggle re-implements what the platform already does. Use `<details>` unless the animation needs demand otherwise (they don't — reduced-motion safe). |
| Piecewise-linear TS color interpolation | `d3-scale-chromatic` / `chroma-js` | New dep for ~15 lines of lerp. Rejected — violates zero-dep discipline; a 6-stop piecewise-linear RGB lerp is trivial and unit-testable. |
| BuGn ramp | viridis / YlGnBu / Greens | See §Score Color Ramp — BuGn best matches "cool low → vivid green high" while staying colorblind-safe and avoiding accent red. |

**Installation:** none — `npm install` unchanged.

**Version verification:**
```
@betravedur/domain — workspace package, exports confirmed via packages/domain/src/index.ts [VERIFIED: local barrel]
maplibre-gl 5.24.0 — already in site/package.json (STACK, Phase 3) [VERIFIED: CLAUDE.md STACK table]
```

## Package Legitimacy Audit

> No external packages are installed by this phase (zero-new-dep). All capabilities use the existing workspace `@betravedur/domain`, already-installed `maplibre-gl`, and platform APIs (`<details>`, CSS custom properties, DOM). slopcheck / registry verification not applicable — nothing new enters `node_modules`.

| Package | Registry | Disposition |
|---------|----------|-------------|
| (none) | — | No install |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Score Color Ramp (the primary deliverable)

### Recommendation: ColorBrewer **BuGn**, low(0)→high(10)

6-stop ramp, cool light-blue at the low end → vivid green at the high end. Verbatim ColorBrewer 6-class hex [CITED: colorbrewer2.org/export/colorbrewer.json, fetched 2026-07-20]:

```
score 0 → #edf8fb   (muted cool — "slæmt")
        → #ccece6
        → #99d8c9
        → #66c2a4
        → #2ca25f
score 10→ #006d2c   (vivid green — "gott veður = grænt")
```

**Why BuGn over the alternatives** (all three below are ColorBrewer sequential schemes; ColorBrewer's sequential schemes are designed colorblind-safe):

| Ramp | Low-end hue | High-end hue | Fit to "cool low → vivid green high" | Accent-red (#C0392B) clash |
|------|-------------|--------------|--------------------------------------|----------------------------|
| **BuGn** ✅ | light blue (cool) | **dark green** | **Exact** — cool → green, "grænt = gott" | None (no red/orange stops) |
| YlGnBu | pale **yellow** (warm) | dark blue | Ends blue, not green; low end reads warm | None, but low-end yellow is near accent visually |
| GnBu | pale green | dark blue | Ends blue, inverts the "green = good" cue | None |
| Greens | very pale green | dark green | Green throughout — low end nearly invisible on basemap | None |
| viridis | dark blue | **yellow** | Ends yellow (warm), not the "grænt" cue | Yellow end drifts toward warm |

**Colorblind-safety verification (in-session, HIGH confidence):** monotonic grayscale luminance is the standard proxy for "distinguishable under any color-vision deficiency by lightness alone." All BuGn stops decrease monotonically in relative luminance (0.921 → 0.785 → 0.601 → 0.441 → 0.272 → 0.111), so protan/deutan/tritan viewers read the ramp as a clean light→dark gradient even if hue collapses. [VERIFIED: WCAG relative-luminance computed in-session]. This monotonicity is *why* the numeric score must still accompany the color — but it means the color channel degrades gracefully rather than becoming ambiguous.

**Contrast facts (relative-luminance ratios, in-session):**

| Stop | vs white pill #FFF | vs basemap #E8EBED |
|------|-------------------|--------------------|
| #edf8fb (0) | 1.08 | 1.11 |
| #99d8c9 (~4) | 1.61 | 1.35 |
| #2ca25f (~8) | 3.26 | 2.72 |
| #006d2c (10) | 6.51 | 5.44 |

**Design consequence:** the pale low-end stops have weak contrast against both white and the basemap (~1.1). A **thin ring** in `#edf8fb` on a white pill over the basemap is nearly invisible. Two mitigations (both align with CONTEXT):
1. The **numeric score badge is always present** (color-never-sole-channel decision) — so a low-score marker is still legible via its number even when its ring is pale.
2. Give the ring a **minimum darkness floor** or a **thin hairline outline** so the *shape* of the ring is visible even at the pale end (e.g. a 1px `--hairline` outline under the color ring). Alternatively use a **wider colored left-bar** (4–6px) rather than a full thin ring — a solid bar reads its hue at any lightness better than a 1–2px ring.

**Interpolation helper (pure TS, no dep, unit-testable):**

```typescript
// Source: piecewise-linear RGB lerp over the ColorBrewer BuGn 6-stop ramp.
// score is 0-10 (already clamped by domain combine()); null → caller uses muted state.
const BUGN: readonly [number, number, number][] = [
  [0xed, 0xf8, 0xfb], [0xcc, 0xec, 0xe6], [0x99, 0xd8, 0xc9],
  [0x66, 0xc2, 0xa4], [0x2c, 0xa2, 0x5f], [0x00, 0x6d, 0x2c],
];

/** Map a 0-10 score to a #rrggbb ramp color. Callers pass null → muted, never here. */
export function scoreColor(score: number): string {
  const s = Math.max(0, Math.min(10, score)) / 10;      // 0..1
  const seg = s * (BUGN.length - 1);                    // 0..5
  const i = Math.min(Math.floor(seg), BUGN.length - 2); // stop index
  const t = seg - i;                                    // fraction within segment
  const [r0, g0, b0] = BUGN[i]!, [r1, g1, b1] = BUGN[i + 1]!;
  const ch = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `#${[ch(r0, r1), ch(g0, g1), ch(b0, b1)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
```

Boundary tests fall out naturally: `scoreColor(0) === "#edf8fb"`, `scoreColor(10) === "#006d2c"`, `scoreColor(5)` interpolates the middle. `score:null` never reaches this fn — the caller branches to the muted state first.

**Tokenization:** expose the 6 stops as CSS custom properties in `tokens.css` (e.g. `--score-0 … --score-10`) for the legend swatches, but the per-marker ring color is set inline from `scoreColor()` (continuous, not one of 6 buckets). Keep `--accent` (#C0392B) untouched — grep-gate that the score scale never references it (mirrors the controls.css hard constraint).

## Data-Layer Gap (do this FIRST — it is not yet in code)

`MarkerDatum` (site/src/data/types.ts) has **no `score` field**. `computeMarkerDatum` (averages.ts) never calls the score curves. To close MAP-03/SCORE-02 the producer must be extended:

1. Compute the **rain total mm** for the qualifying-year in-window rows — `averages.ts` already imports domain helpers; add `sumPerYearThenAverage(byYear, windowDays, qYears, (o) => o.r)` (the existing precip helper; it already handles the per-year-then-average honesty). Currently averages.ts only derives `hasPrecipQual` (a boolean), never the total.
2. Feed the three raw window-metrics into the curves: `tempComponent(meanTemp)`, `rainComponent(rainTotalMm)`, `windComponent(meanWindSpeed)` — but only for present metrics (null when the metric is null), producing a `ComponentScores`.
3. `combine(componentScores)` → `{ score, contributing, missingRain }`. Note `missingRain` from `combine()` and the existing `hasPrecip` both describe "án úrkomu"; reconcile to one source (prefer `combine().missingRain`, which is exactly `!contributing.includes("rain")`).
4. Add to `MarkerDatum`: `score: number | null` (and optionally surface `missingRain` explicitly, though it already ≈ `!hasPrecip` when sufficient).
5. `mutedDatum()` (recompute.ts) must set `score: null` — it is the single source of the muted shape; keep it in sync (the file's own comment warns against drift).

**Coverage-gate interaction:** when `sufficient === false`, all metrics are null → `combine()` returns `score:null` naturally (present.length === 0). So `score:null` ⟺ (insufficient OR structurally unscorable) — exactly the "not on the color scale, not ranked" set. "án úrkomu" stations are `sufficient && missingRain && score !== null` → colored + ranked with the badge. This matches the CONTEXT decision precisely. [VERIFIED: score.ts combine() null contract, averages.ts sufficient gate]

## Architecture Patterns

### System Architecture Diagram

```
selection change (scrubber/width/year)
        │  store.set({...})          [Phase 4 store — no-op-skip, frozen snapshots]
        ▼
  debounced recompute (120ms) ──► recompute(cache,state) ──► MarkerDatum[] (now WITH score)
        │                                                          │
        │ (module-level latestData snapshot in main.ts)            │
        ├──────────────┬───────────────────────┬──────────────────┘
        ▼              ▼                        ▼
  installMarkerLayer  rankedList.render(data)   legend (static; swatches don't change per selection)
  + renderComposite   (sort desc, drop null)     └─ <details> explainer (SCORE-03)
        │                    │
        ▼                    ▼ row click
  buildPill: ring/badge   store.set({ stationId }) ──► main.ts subscriber ──► map.easeTo(station lon/lat)
  colored by scoreColor()                              (viewportMatches guard; map owns camera)
        │                                                        │
        └── selected-station highlight (stationId) ◄─────────────┘  URL `st` param written by Phase-4 URL-writer
```

Row-click and marker both funnel through the **single `store.set({stationId})` seam** (Phase 6 will add the chart panel on the same signal). The `easeTo` is driven by a `main.ts` store subscriber that reads `stationId`, looks up its lon/lat from `latestData`, and animates — **only on a real stationId change**, guarded by `viewportMatches` so the settle `moveend` doesn't re-loop (the exact Pitfall-4 discipline from Phase 4).

### Recommended Structure (new files)
```
site/src/map/score-color.ts          # pure scoreColor(0-10) → #rrggbb (BuGn lerp)
site/src/map/score-color.test.ts     # boundary tests 0/5/10 (+ null handled by caller)
site/src/ui/rankedList.ts            # mountRankedList(store, () => latestData) → subscriber DOM
site/src/ui/rankedList.test.ts       # pure sort helper: desc, ties stable, null-excluded
site/src/ui/legend.ts                # mountLegend() static swatches + <details> explainer
site/src/styles/score.css            # ring/badge, list panel, legend styles (tokens only)
```
Modified: `data/types.ts` (+score), `data/averages.ts` (+curves/combine/rain-total), `state/recompute.ts` (mutedDatum score:null), `map/markers.ts` (buildPill ring/badge), `main.ts` (mount list+legend, stationId→easeTo subscriber), `styles/tokens.css` (+score-* tokens).

### Pattern 1: Store-subscriber DOM component (Phase 4 precedent)
**What:** A `mount…(store, getLatestData)` fn that renders once and subscribes; on notify it re-renders from the frozen snapshot. The ranked list subscribes to `latestData` changes — but `latestData` is a module var in main.ts, not the store. Follow the existing `controlBar` precedent: main.ts calls `rankedList.refresh()` right after it updates `latestData` in `renderForState` (same hook as `controlBar?.refreshReadout()`), AND the list subscribes to the store for the `stationId` highlight. [VERIFIED: main.ts renderForState + controlBar wiring]

**Why not subscribe directly to the store for data:** marker data is a pure function of `(anchorDoy,widthDays,yearFrom,yearTil)` and is recomputed with a 120ms debounce; `latestData` is the post-debounce truth. Reuse the `refreshReadout` hook so the list updates on the SAME frame the markers do (no timer race — the file explicitly warns against the old `setTimeout(140)` poll).

### Pattern 2: Row-click → select + fly-to without a camera↔store loop
**What:** Row click → `store.set({ stationId })`. A dedicated main.ts subscriber watches `stationId`; on change it `map.easeTo({ center: [lon,lat] })` for that station (from `latestData`). The map owns its camera (Phase 4): the resulting `moveend` writes `{lng,lat,zoom}` to the store, guarded by `viewportMatches` so a settled ease is a no-op. Because `stationId` is a primitive, the store's no-op-skip works (WR-04 invariant). [VERIFIED: store.ts no-op-skip, main.ts viewportMatches/applyViewport]

**Anti-pattern:** driving `easeTo` from inside `renderForState` or from the ranked-list component directly — that couples camera to render and risks re-animating on every recompute. Keep it a separate `stationId`-only subscriber that fires exactly on selection change.

### Anti-Patterns to Avoid
- **Recomputing the score in the UI.** `combine()` already ran; read `datum.score`. (CONTEXT: "Do NOT recompute; read it.")
- **Adding a non-primitive field to `SelectionState`.** The store's no-op-skip uses strict `===` — a `selectedStations: number[]` would defeat it (WR-04 invariant, store.ts header). `stationId: number|null` is already the right primitive seam.
- **One DOM marker per station for color.** The hybrid renderer exists precisely to avoid this; extend `buildPill`, don't switch to `maplibregl.Marker` (grep-gated absent, markers.ts).
- **Color as sole channel.** Always render the numeric score too (badge on pill, number in list row).
- **Ranking `score:null` stations.** Exclude before sort; they render muted, unranked.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Score math / renormalization | A new UI-side weighting | `combine()` from `@betravedur/domain` | Already handles null-component renormalization, unscorable→null, missingRain flag [VERIFIED: score.ts] |
| Component 0–10 curves | New temp/rain/wind ramps | `tempComponent/rainComponent/windComponent` | Fixed, explainable, unit-tested [VERIFIED: score.test.ts] |
| Rain total mm | Manual precip summation | `sumPerYearThenAverage(…, o=>o.r)` | Per-year-then-average coverage honesty already implemented [VERIFIED: precip.ts export] |
| Explainer expand/collapse | JS accordion + aria-expanded | Native `<details>`/`<summary>` | Keyboard + AT semantics free; reduced-motion safe [CITED: MDN details] |
| Colorblind-safe ramp | Custom palette guesswork | ColorBrewer BuGn (verified hex) | Peer-reviewed sequential scheme; monotonic luminance verified in-session |
| State→URL for selected station | New URL logic | Phase 4 `st` param + store `stationId` | The station-select seam already exists [VERIFIED: 04-03-SUMMARY, url.ts st param] |
| Camera-loop avoidance | `isUpdating` flags | `viewportMatches` value-comparison | Phase 4's proven Pitfall-4 discipline [VERIFIED: main.ts] |

**Key insight:** every "hard" piece (score math, coverage honesty, URL round-trip, loop-proof camera) is already solved upstream. This phase is almost entirely *rendering* the score that already exists — the only genuinely new logic is the `scoreColor` lerp (~15 lines) and the ranked-sort helper (~10 lines), both trivially unit-testable.

## Runtime State Inventory

> Not a rename/refactor/migration phase — pure additive presentation. Section omitted per template. (Verified: no stored keys, service configs, or OS registrations are renamed; the only data-shape change is an *added* `MarkerDatum.score` field consumed in-process, never persisted or keyed externally.)

## Common Pitfalls

### Pitfall 1: Assuming `MarkerDatum.score` already exists
**What goes wrong:** A task colors the pill from `datum.score` and it's `undefined` — no color, or `NaN` in the lerp.
**Why it happens:** CONTEXT says "MarkerDatum already carries the score fields" — it describes the intent, but the field is not in `types.ts` and `averages.ts` never calls `combine()`.
**How to avoid:** Make the data-layer extension (§Data-Layer Gap) the first task, TDD in `averages.test.ts`, before any render task.
**Warning sign:** `datum.score` typed as `number | undefined` or a red squiggle on `MarkerDatum.score`.

### Pitfall 2: `rainComponent` needs mm, not a boolean
**What goes wrong:** Feeding `hasPrecip` (boolean) or `0/null` where a mm total is expected → wrong or null rain score for every station.
**Why it happens:** averages.ts computes only presence (`hasPrecipQual`), never the total.
**How to avoid:** Add `sumPerYearThenAverage(…, o=>o.r)`; pass `null` (not 0) when no rain data so `combine()` renormalizes ("án úrkomu"), never scores a dry-station rain as 10/10.
**Warning sign:** Every AWS station shows a suspiciously high or identical rain contribution.

### Pitfall 3: Pale low-end ring invisible on white/basemap
**What goes wrong:** A 1px `#edf8fb` ring is indistinguishable from the white pill on the muted basemap.
**Why it happens:** Contrast ~1.1 at the low end (verified §Score Color Ramp).
**How to avoid:** Use a wider (4–6px) colored bar or add a hairline outline under the ring; always show the numeric score.
**Warning sign:** Low-score markers look identical to muted markers in a screenshot.

### Pitfall 4: Row-click fly-to re-loops through moveend
**What goes wrong:** `easeTo` → `moveend` → store viewport write → (if unguarded) re-trigger.
**Why it happens:** Same class as Phase 4 Pitfall 4.
**How to avoid:** Guard the outbound viewport write with `viewportMatches`; drive `easeTo` from a `stationId`-only subscriber, not from render.
**Warning sign:** Continuous micro-jitter of the camera after a row click, or history flooding.

### Pitfall 5: Ranked list churns on viewport-only changes
**What goes wrong:** The list re-renders on every pan/zoom.
**Why it happens:** Subscribing naively to every store change (which includes `{lng,lat,zoom}` writes).
**How to avoid:** Drive the list from the `refreshReadout`-style hook (fires only on the debounced *recompute*, i.e. selection changes), not from a raw store subscription. main.ts's `renderForState` is the single recompute choke point. [VERIFIED: main.ts selectionKey guard skips viewport-only changes]

### Pitfall 6: Sort instability on ties
**What goes wrong:** Two stations with equal score reshuffle between renders → jumpy list.
**Why it happens:** Comparator returns 0 for ties; while `Array.prototype.sort` is spec-stable (ES2019+), relying on input order that itself varies is fragile.
**How to avoid:** Tie-break deterministically — e.g. by `station` id (ascending) — so equal-score rows have a fixed order. Unit-test the tie case.
**Warning sign:** Visible row swaps when only an unrelated station's score changed.

## Code Examples

### Ranked-sort helper (pure, unit-tested)
```typescript
// Exclude score:null, sort desc, stable tie-break by station id.
export function rankStations(data: MarkerDatum[]): MarkerDatum[] {
  return data
    .filter((d) => d.score !== null)
    .sort((a, b) => (b.score! - a.score!) || (a.station - b.station));
}
```

### Native details explainer (SCORE-03)
```html
<!-- Source: MDN <details> — free keyboard/AT semantics, reduced-motion safe -->
<details class="score-explainer">
  <summary>Hvernig er einkunnin reiknuð?</summary>
  <p>Einkunnin (0–10) vegur saman þrjá þætti: úrkomu 40%, vind 30% og hita 30%.
     Þegar úrkomugögn vantar (án úrkomu) er vægið endurreiknað yfir þá þætti sem
     til eru, svo stöðin er metin sanngjarnt á vind og hita.</p>
</details>
```

### Marker ring/badge (buildPill extension)
```typescript
// In buildPill (markers.ts), after computing muted:
if (!muted && datum.score !== null) {
  pill.style.setProperty("--pill-score", scoreColor(datum.score));
  pill.classList.add("marker-pill--scored");   // CSS draws the left bar/ring from var
  // numeric badge (color-never-sole-channel): score with Icelandic decimal comma
  // e.g. datum.score.toFixed(1).replace(".", ",")  → "7,8"
}
```
CSS (`score.css`) reads `var(--pill-score)` for a 4–6px left bar; add a hairline so the pale end stays visible.

## State of the Art

| Old Approach | Current Approach | When | Impact |
|--------------|------------------|------|--------|
| Rainbow/jet colormaps | Perceptually-uniform sequential (viridis/ColorBrewer) | ~2015 (Matplotlib 1.5 viridis) | Colorblind-safe, grayscale-safe by design [CITED: viridis docs] |
| Red–green "good/bad" | Sequential single-/two-hue avoiding red–green | established | ~8% of men have red–green CVD; project explicitly bars it [CONTEXT] |

**Deprecated/outdated:** none relevant — ColorBrewer schemes are stable and long-standing.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `map.easeTo({center})` is the right MapLibre 5.24 API for animated fly-to | Patterns / Stack | Low — well-established MapLibre API; if signature differs, `flyTo` is the alternative. Verify against installed types at plan time. |
| A2 | ColorBrewer sequential schemes are colorblind-safe (the JSON lacked an explicit `blind` flag this fetch) | Score Color Ramp | Low — monotonic-luminance was independently verified in-session, which is the operative safety property regardless of the flag. |
| A3 | `sumPerYearThenAverage` over `o.r` yields the mm total `rainComponent` expects (window total, not daily mean) | Data-Layer Gap | Medium — confirm the helper sums (not means) and that `rainComponent`'s `RAIN_ZERO_MM=60` is calibrated for a *window total*. score.ts comment says "typical window total (mm)"; verify the domain call convention at plan time (check how any existing caller — if any — feeds rain). |

**Note:** A3 is the one genuinely load-bearing assumption. The plan should include a task that unit-tests the end-to-end `computeMarkerDatum → score` against a known fixture so the rain-total units are pinned.

## Open Questions

1. **Legend placement vs the bottom control bar.**
   - What we know: control bar is fixed bottom, 72px min-height, z-index 10 (controls.css). Header is fixed top 56px z-10.
   - What's unclear: exact corner for the legend + the right-side ranked panel so neither occludes Iceland nor the control bar.
   - Recommendation: legend bottom-left (above the control bar or left of it on wide screens); ranked list top-right below the header. Both collapsible. Finalize in the plan's visual task with a screenshot check (no-review directive).

2. **Selected-station highlight visual.**
   - What we know: `stationId` is the seam; the pill has `data-station`.
   - What's unclear: how a selected marker is visually emphasized (Phase 6 opens the chart on the same signal).
   - Recommendation: a subtle ring-thickening / elevation on the selected pill this phase; keep it a class toggle so Phase 6 can build on it.

## Environment Availability

> No new external dependencies (pure code/config + existing workspace packages). Skipped per template — the only tools involved (Vitest, Playwright, Vite) are already installed and exercised by Phase 3/4 suites.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (unit, root config) + Playwright 1.x (E2E, chromium, preview build) |
| Config file | `/vitest.config.ts` (root) — includes `site/src/**/*.test.ts`; `/site/playwright.config.ts` |
| Quick run command | `npx vitest run site/src/map/score-color.test.ts site/src/ui/rankedList.test.ts site/src/data/averages.test.ts` |
| Full suite command | `npm test` (root Vitest) then `cd site && npm run e2e` |

### Phase Requirements → Test Map
| Req | Behavior | Type | Command | File Exists? |
|-----|----------|------|---------|-------------|
| MAP-03 | score→color at boundaries 0/5/10 | unit | `npx vitest run site/src/map/score-color.test.ts` | ❌ Wave 0 |
| MAP-03 | `MarkerDatum.score` computed (incl. án úrkomu renormalized, null when insufficient) | unit | `npx vitest run site/src/data/averages.test.ts` | ✅ extend |
| MAP-03 | markers carry a score color that changes with selection | e2e | `cd site && npm run e2e -- score.spec.ts` | ❌ Wave 0 |
| MAP-03 | legend renders + swatches present | e2e | (score.spec.ts) | ❌ Wave 0 |
| SCORE-02 | rank desc, ties stable, null-excluded | unit | `npx vitest run site/src/ui/rankedList.test.ts` | ❌ Wave 0 |
| SCORE-02 | list order matches score desc; row-click flies + selects; ófullnægjandi absent | e2e | (score.spec.ts) | ❌ Wave 0 |
| SCORE-03 | explainer `<details>` expands, shows 40/30/30 weights | e2e | (score.spec.ts) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** the quick unit command for the file(s) touched.
- **Per wave merge:** `npm test` (full root Vitest — 230+ existing must stay green).
- **Phase gate:** full Vitest + `score.spec.ts` (+ existing e2e regression) green before `/gsd:verify-work`.

### E2E hooks available (from Phase 3/4)
- `window.__map` (MapLibre instance) and `window.__store` (selection store) are exposed for driving. [VERIFIED: main.ts, markers.spec.ts]
- Pill selector: `#marker-overlay [data-station]`. Assert score color via computed style of the ring element, and assert it *changes* by driving `window.__store.set({...})` to a different window then re-reading.
- Row-click fly-to: click a `.ranked-list [data-station]` row, then assert `window.__store.get().stationId` matches and `window.__map.getCenter()` moved toward that station.

### Wave 0 Gaps
- [ ] `site/src/map/score-color.test.ts` — boundaries 0/5/10 (MAP-03)
- [ ] `site/src/ui/rankedList.test.ts` — desc / ties / null-excluded (SCORE-02)
- [ ] extend `site/src/data/averages.test.ts` — score present, án úrkomu renormalized, null when insufficient (MAP-03/A3 units pin)
- [ ] `site/tests/e2e/score.spec.ts` — the ~6 UI-SPEC criteria (color present + changes, legend, explainer expands, list desc, row-click flies+selects, ófullnægjandi absent from list)
- Framework install: none — Vitest + Playwright already present.

## Security Domain

> `security_enforcement` not set in config → treat as enabled. This phase adds **no** network endpoints, auth, or new trust boundary.

### Applicable ASVS Categories
| Category | Applies | Standard Control |
|----------|---------|-----------------|
| V2 Authentication | no | static site, no auth |
| V4 Access Control | no | no protected resources |
| V5 Input Validation | yes (existing) | The `st` URL param → `stationId` is already defensively parsed to integer-or-null in Phase 4 `paramsToState`; this phase only *reads* `stationId`. Station **name** is rendered into the ranked list — set it via `textContent`, never `innerHTML`, to avoid reflecting a data-file value as markup (the pill uses controlled innerHTML for glyphs; list rows should use textContent for the name). [VERIFIED: url.ts st parse; markers.ts innerHTML usage] |
| V6 Cryptography | no | none |

### Known Threat Patterns
| Pattern | STRIDE | Mitigation |
|---------|--------|-----------|
| Station name from data file reflected as HTML in list row | Tampering/XSS | Render name via `textContent` (not `innerHTML`); the name originates from the committed stations.json, but treat it as untrusted-by-default per the project's defensive-decode posture (averages.ts header). |
| Malformed score → NaN in lerp | Availability | `combine()` guarantees `score` is `number|null` (never NaN); `scoreColor` clamps 0–10; `null` handled by caller → muted. [VERIFIED: score.ts clamp/null contract] |

## Sources

### Primary (HIGH confidence)
- Local codebase (VERIFIED): `packages/domain/src/{score.ts,types.ts,precip.ts,index.ts}`, `site/src/{data/averages.ts,data/types.ts,map/markers.ts,state/store.ts,state/recompute.ts,main.ts}`, `site/src/styles/{tokens.css,controls.css}`, `vitest.config.ts`, `site/playwright.config.ts`, `site/tests/e2e/markers.spec.ts`, `04-03-SUMMARY.md`, `05-CONTEXT.md`, `REQUIREMENTS.md`.
- `colorbrewer2.org/export/colorbrewer.json` — verbatim 5/6-class hex for BuGn/GnBu/YlGn/YlGnBu/Greens (fetched 2026-07-20).
- WCAG relative-luminance + contrast ratios — computed in-session for every candidate ramp stop.

### Secondary (MEDIUM confidence)
- viridis documentation (sjmgarnier.github.io/viridis, cran viridis vignette) — perceptual-uniformity / colorblind-safety principle (used to justify the monotonic-luminance criterion).
- MDN `<details>` element — native disclosure a11y (CITED, standard behavior).

### Tertiary (LOW confidence)
- WebSearch ColorBrewer/viridis overview pages — corroborating context only; superseded by the authoritative colorbrewer JSON fetch above.

## Metadata

**Confidence breakdown:**
- Standard stack / zero-dep: HIGH — every capability confirmed present in the codebase or platform.
- Data-layer gap (MarkerDatum lacks score): HIGH — directly verified in types.ts + averages.ts; this is the load-bearing finding.
- Color ramp choice: HIGH for safety (luminance verified) / discretionary for hue (BuGn recommended, CONTEXT grants discretion).
- Rain-total units (A3): MEDIUM — flagged for a pinning unit test in the plan.
- Architecture patterns / loop-avoidance: HIGH — reuses Phase 4's verified disciplines.

**Research date:** 2026-07-20
**Valid until:** 2026-08-19 (stable domain; codebase is the moving part — re-verify MarkerDatum shape if Phase 5 planning slips past a refactor).
