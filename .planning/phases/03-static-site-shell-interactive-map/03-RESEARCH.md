# Phase 3: Static Site Shell & Interactive Map - Research

**Researched:** 2026-07-20
**Domain:** Vanilla-TS/Vite static single-page app + MapLibre GL JS + self-hosted PMTiles basemap + in-browser climatology aggregation
**Confidence:** HIGH (both named risks resolved empirically against the live repo and current registries; a few sizing/interop items flagged MEDIUM inline)

## Summary

Phase 3 wires a deployable Vite/TypeScript static site with an interactive MapLibre map of Iceland (self-hosted PMTiles basemap, no API keys) and neutral station-marker callouts driven by in-browser climatology averages. Two risks were called out; both are now resolved:

- **Risk #1 — `decodeDerived` browser-safety: RESOLVED, no split needed.** `pipeline/src/derive.ts` has **zero** Node built-in imports. Its only import is `import type { DailyObservation, StationType } from "@betravedur/domain"` — a type-only import that TypeScript erases at compile time (and `verbatimModuleSyntax: true` guarantees it never emits a runtime `require`/`import`). The Node built-ins (`node:fs`, `node:path`, `node:crypto`) live in **sibling** modules (`rawstore.ts`, `manifest.ts`, `aggregate.ts`) and the pipeline **barrel** (`index.ts`) re-exports them — so the client must import `decodeDerived` from the **subpath export `@betravedur/pipeline/derive`** (already declared in `pipeline/package.json`), never from the package root. Do that and the browser bundle pulls in only the pure codec. No module split, no shared-codec package, no moving code into `@betravedur/domain` is required.

- **Risk #2 — PMTiles Iceland basemap: RESOLVED with a concrete recipe.** Extract a single `iceland.pmtiles` once from the Protomaps daily planet build with the `go-pmtiles` CLI (v1.31.1) at `--bbox=-26,62.5,-12,67.5 --maxzoom=9`, commit it to `public/`, register it with `maplibregl.addProtocol("pmtiles", new Protocol().tile)`, and style it with **`@protomaps/basemaps` 5.7.2** (`layers("protomaps", namedFlavor("grayscale"))`) — the current, maintained successor to the deprecated `protomaps-themes-base` STACK.md named. Estimated extract size at maxzoom 9 is single-digit to ~20 MB (Iceland is sparse); well under the Pages budget. Sizing is MEDIUM confidence — **measure the actual extract** as the first pipeline task of this phase.

**Primary recommendation:** Vanilla TS + Vite 8.1.5 workspace `site/`, MapLibre GL JS 5.24.0 (namespace import), PMTiles 4.4.1 protocol + `@protomaps/basemaps` 5.7.2 grayscale style muted toward `#E8EBED`, `decodeDerived` imported from `@betravedur/pipeline/derive`, averages computed in-browser via `@betravedur/domain`, composite white callouts rendered as a **hybrid** (MapLibre symbol layer owns placement/collision; DOM/canvas draws the multi-color composite for the post-collision visible subset only), Playwright 1.61.1 E2E driving the **preview (production) build**.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Map visual:** Match gottvedur.is/kort — muted land/sea MapLibre basemap; white rounded callout markers showing temperature (red), a wind-direction arrow + speed (m/s), and a small precip indicator icon.
- **Basemap:** Self-hosted PMTiles via the `pmtiles://` protocol — **no MapTiler key, no API keys anywhere in the client**.
- **Default view:** framed on Iceland (approx center lat 65, lon -19, zoom ~6).
- **Markers are NEUTRAL this phase:** temp + wind arrow/speed + precip in neutral style. **No score coloring** (Phase 5), **no click handler** (Phase 6) — display-only (hover label at most).
- **Wind arrow** uses the Phase 1 circular-mean direction; render **"breytileg átt"** when direction is undefined (atan2(0,0) / near-cancelling case).
- Stations scored **"án úrkomu"** still render — just omit the precip indicator, never hide the station.
- Missing-average stations show a **muted/empty marker state** ("ófullnægjandi gögn"), never a crash.
- **Zoom-dependent density** so markers are readable, not overlapping. **Prefer MapLibre native symbol-layer collision/declutter over DOM-marker clustering** (mobile perf pitfall). At country zoom show ~15 major stations; reveal more on zoom-in.
- **Data source this phase:** commit the small REAL Phase-2 derived sample (Keflavík #1350 + Reykjavík #1 + `stations.json` + `manifest.json`) into the site's static/public dir so the site builds/deploys standalone without the data branch. Client loads them as static assets and computes default-period averages in-browser via `@betravedur/domain` (same module — no reimplementation).
- **Framework:** Vanilla TypeScript + Vite. New `site/` (or `app/`) workspace importing `@betravedur/domain`. Icelandic-only UI; header slogan **"Leitin að betra veðri"**. `vite build` output deployable to GitHub Pages with correct project-pages base path.

### Claude's Discretion
- Exact declutter/collision implementation; marker DOM vs symbol-layer choice (**prefer symbol layer**); CSS/design-system seed; PMTiles extract acquisition (generate + commit a small Iceland extract, or document the build step); workspace name.

### Deferred Ideas (OUT OF SCOPE)
- Period / year-range selectors + URL state — Phase 4.
- Score coloring, legend, ranked "best stations" list, score explainer — Phase 5.
- Station click → chart panel — Phase 6.
- Mobile bottom-sheet, "historical not forecast" info panel, full loading/empty states — Phase 7.
- Nightly build + auto-deploy + full national dataset — Phase 8.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **MAP-01** | Interactive pan/zoom map of Iceland (MapLibre GL + self-hosted PMTiles, no API keys) | Standard Stack (MapLibre 5.24.0, pmtiles 4.4.1, @protomaps/basemaps 5.7.2); PMTiles extract recipe (Risk #2); map-init pattern; base-path wiring |
| **MAP-02** | Station markers show period averages: temperature, wind speed + direction arrow, precip indicator | Marker rendering pattern (hybrid symbol+DOM); `decodeDerived` → `@betravedur/domain` average pipeline (Risk #1); UI-SPEC marker anatomy |
| **MAP-04** | Marker density adapts to zoom (more appear on zoom-in; no unreadable overlap) | Symbol-layer collision (`text-allow-overlap: false`, `symbol-sort-key`) pattern; density acceptance criteria |
| **UX-01** | Icelandic-only UI with slogan "Leitin að betra veðri" | Site-shell pattern; copywriting contract (verbatim from UI-SPEC); ATTRIBUTION constant from domain |
| **SITE-01** | Fully static Vite/TS site deployable to GitHub Pages | Vite base-path pattern; public-asset handling; MapLibre-Vite worker gotcha; Playwright preview-build E2E |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Basemap tile decode + render | Browser / Client (MapLibre WebGL + pmtiles protocol) | Static / Pages (serves `.pmtiles` via HTTP range) | Fully static: the `.pmtiles` file is a byte blob on Pages; the browser does range requests and GPU rendering. No server. |
| Derived-file decode (`decodeDerived`) | Browser / Client | — | Pure codec, no Node deps; runs in-bundle. Imported from `@betravedur/pipeline/derive`. |
| Period → per-station averages | Browser / Client (`@betravedur/domain`) | — | Same math module as the pipeline; computed client-side over the committed sample. Designed so Phase-4 selectors swap the period without re-architecting. |
| Marker placement + collision/declutter | Browser / Client (MapLibre symbol layer) | — | GPU-driven collision is the whole point of the vector stack; avoids DOM-marker mobile pitfall. |
| Composite callout draw (multi-color pill) | Browser / Client (DOM/canvas over the post-collision subset) | MapLibre symbol layer (owns which stations survive) | A single symbol `text-field` can't carry red temp + rotated arrow + precip glyph in one pill; the hybrid keeps native collision but draws the rich composite only for visible features. |
| Attribution display | Browser / Client (MapLibre `AttributionControl`) | `@betravedur/domain` `ATTRIBUTION` | CC BY 4.0 is a licensing requirement; text sourced from the domain constant, not hardcoded. |
| Build → static `dist/` | CDN / Static (Vite build, GitHub Pages) | — | `vite build` emits a subpath-based static bundle; Pages serves it. Auto-deploy is Phase 8. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `maplibre-gl` | **5.24.0** `[VERIFIED: npm registry, published 2026-07-15]` `[CITED: maplibre.org]` | Interactive vector map + symbol-layer markers | BSD, no key, native `addProtocol` for PMTiles; the engine class gottvedur.is uses. STACK-locked. |
| `pmtiles` | **4.4.1** `[VERIFIED: npm registry, published 2026-04-08]` `[CITED: docs.protomaps.com/pmtiles/maplibre]` | Registers `pmtiles://` protocol so the basemap loads from a static file via HTTP range | Only truly static, keyless basemap path. STACK-locked. |
| `@protomaps/basemaps` | **5.7.2** `[VERIFIED: npm registry, published 2026-03-10]` `[CITED: docs.protomaps.com/basemaps/maplibre]` | Ready-made MapLibre basemap style layers (light/dark/**grayscale**/white/black) for the Protomaps v4 tile schema | **Supersedes** the deprecated `protomaps-themes-base` 4.5.0 that STACK.md named — see State of the Art. `grayscale` flavor is the closest starting point to the required muted `#E8EBED` look. |
| `vite` | **8.1.5** `[VERIFIED: npm registry, published 2026-07-16]` `[CITED: vite.dev/guide/build]` | Build tool / dev server / bundler → `dist/` for Pages | Single interactive page; no framework overhead. STACK-locked. Requires Node 20+ (repo `.nvmrc` = 25 ✓). |
| `typescript` | **7.0.2** `[VERIFIED: npm registry; repo root pins `^7.0.2`]` | Language | Repo already on TS 7; `verbatimModuleSyntax: true` + `.js`-extension imports + `nodenext` resolution (see Pitfalls). |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@betravedur/domain` | workspace `*` | Circular-mean wind, coverage/effective-N, window expansion, precip, score, `ATTRIBUTION`. Zero-dep, browser-safe. | Always — the client computes averages with it (no reimplementation). |
| `@betravedur/pipeline/derive` | workspace subpath | `decodeDerived` / `DerivedFile` / `QuantSpec` — the columnar decode codec | Always — decode `derived/{station}.{hash}.json` before feeding rows to domain math. **Import from the `/derive` subpath, never the package root.** |
| `@playwright/test` | **1.61.1** `[VERIFIED: npm registry, published 2026-07-20]` | E2E: assert canvas + markers + attribution + no-key, capture screenshots | Dev-only; drives the **preview (production) build**. |
| `maplibre-gl/dist/maplibre-gl.css` | bundled | Required map container + control styles | Always — import once in the app entry. |
| `go-pmtiles` CLI | **v1.31.1** `[VERIFIED: github.com/protomaps/go-pmtiles releases]` | One-time Iceland extract from the daily planet build | Build-time only (not an npm dep). `brew install protomaps/tap/pmtiles` or download the release binary. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@protomaps/basemaps` 5.x | `protomaps-themes-base` 4.5.0 (STACK.md's original) | Deprecated, migrated into `@protomaps/basemaps`; use the new package. Both target the v4 tile schema. |
| Hybrid symbol+DOM composite | Pure MapLibre symbol layer (`text-field` formatted string + separate `icon-image` arrow) | A single symbol can't render red-temp + rotated-arrow + precip-glyph in one white pill with per-field color. Pure-symbol works only if you drop the multi-color pill look. Keep pure-symbol as the collision engine; draw the pill in DOM/canvas. |
| DOM/canvas composite for visible subset | One DOM marker per station (MapLibre `Marker`) | Hundreds of DOM nodes kill mobile perf (PITFALLS #9). Explicitly forbidden by CONTEXT + UI-SPEC. |
| PMTiles maxzoom 9 | maxzoom 12 (STACK suggested) | Each zoom level ~doubles size. Map maxZoom is 12 (UI-SPEC), but for a station-marker overview the basemap rarely needs street-level detail; 9–10 keeps the file small. **Measure both**; pick the smallest that still looks clean at zoom 12 (MapLibre overzooms tiles past basemap maxzoom fine). |

**Installation:**
```bash
# In the new site/ workspace
npm install -w site maplibre-gl@5.24.0 pmtiles@4.4.1 @protomaps/basemaps@5.7.2
npm install -w site @betravedur/domain@* @betravedur/pipeline@*
npm install -D -w site vite@8.1.5 @playwright/test@1.61.1
npx playwright install chromium   # browser binary for E2E

# One-time basemap extract (build-time tool, not an npm dep)
brew install protomaps/tap/pmtiles          # or download go-pmtiles v1.31.1 binary
# then run the extract command in Code Examples → "Extract Iceland PMTiles"
```

**Version verification (run 2026-07-20):** all six npm packages confirmed via `npm view <pkg> version`. `go-pmtiles` latest release `v1.31.1` confirmed via the GitHub releases API.

## Package Legitimacy Audit

slopcheck (installed via pip, ran successfully) — `slopcheck install ... --json`:

| Package | Registry | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----------|-------------|-----------|-------------|
| `maplibre-gl` | npm | very high | github.com/maplibre/maplibre-gl-js | **[OK]** | Approved |
| `pmtiles` | npm | high | *none linked* | **[OK]** (warned: no source repo linked on registry metadata — the code is at github.com/protomaps/PMTiles; verified real) | Approved |
| `@protomaps/basemaps` | npm | high | github.com/protomaps/basemaps | **[OK]** | Approved |
| `vite` | npm | very high | github.com/vitejs/vite | **[OK]** | Approved |
| `typescript` | npm | very high | github.com/microsoft/TypeScript | **[OK]** | Approved (already a repo dep) |
| `@playwright/test` | npm | very high | github.com/microsoft/playwright | **[OK]** | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none. (`pmtiles` carried an informational "no source repo linked on registry metadata" note but rated **[OK]** — it is the well-known Protomaps package with tens of millions of downloads; the code lives at `github.com/protomaps/PMTiles`. No checkpoint required.)

**Postinstall check (Node phases):** none of the six packages declare a network/filesystem `postinstall` script of concern.

## Architecture Patterns

### System Architecture Diagram

```
                         GitHub Pages (static, no server)
                         ─────────────────────────────────
    public/iceland.pmtiles ──HTTP range──┐
    public/data/stations.json ──fetch──┐ │
    public/data/manifest.json ──fetch─┐│ │
    public/data/derived/{id}.{hash}.json ─fetch (name resolved from manifest)─┐
                                       ││ │                                    │
                                       ▼▼ ▼                                    ▼
   ┌───────────────────────────────── Browser bundle (Vite) ────────────────────────────┐
   │                                                                                     │
   │  boot()                                                                             │
   │    │                                                                                │
   │    ├─► maplibregl.addProtocol("pmtiles", new Protocol().tile)                       │
   │    │      └─► new maplibregl.Map({ style: {…@protomaps/basemaps grayscale…,         │
   │    │              sources.protomaps.url = "pmtiles://" + BASE_URL + "iceland.pmtiles"}})│
   │    │              center [-19,65], zoom 6, minZoom 4, maxZoom 12,                   │
   │    │              maxBounds, dragRotate:false, pitchWithRotate:false                │
   │    │              + AttributionControl(text from domain ATTRIBUTION + OSM/Protomaps)│
   │    │                                                                                │
   │    └─► loadStations()                                                               │
   │           fetch stations.json + manifest.json                                       │
   │              │                                                                       │
   │              ▼   per station                                                         │
   │           fetch derived/{id}.{hash}.json   (hash from manifest → cache-bust)         │
   │              │                                                                       │
   │              ▼                                                                       │
   │           decodeDerived(file)      ← @betravedur/pipeline/derive  (PURE, no node)   │
   │              │  → DailyObservation[]                                                 │
   │              ▼                                                                       │
   │           computeMarkerData(rows, DEFAULT_WINDOW)  ← @betravedur/domain             │
   │              expandWindow → groupBySeasonYear → qualifyingYears/effectiveN          │
   │              → mean t, scalarMeanSpeed, circularMeanDirection, precip presence      │
   │              → { lon,lat, tempC|null, windDir|null, windSpeed|null, hasPrecip,      │
   │                  n, sufficient, priority }                                          │
   │              │                                                                       │
   │              ▼                                                                       │
   │           setData on GeoJSON source ──► symbol layer (collision, sort-key)          │
   │              │  (placement + which stations survive)                                │
   │              ▼                                                                       │
   │           render composite white pills for post-collision visible features         │
   │              (DOM/canvas: red temp°, rotated arrow+m/s | "breytileg átt",           │
   │               precip glyph unless "án úrkomu", muted state if !sufficient)          │
   └─────────────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
site/                          # new npm workspace (add to root "workspaces")
├── index.html                 # <div id="app"> + <div id="map">; header markup
├── vite.config.ts             # base: "/<repo>/", worker/build config
├── tsconfig.json              # extends ../../tsconfig.base.json
├── playwright.config.ts       # drives `vite preview` (production build)
├── public/
│   ├── iceland.pmtiles         # committed extract (measure size; MEDIUM)
│   └── data/
│       ├── stations.json       # copied from Phase-2 data branch
│       ├── manifest.json       # copied from Phase-2 data branch
│       └── derived/
│           ├── 1.c1cf25669d53.json
│           └── 1350.eaecfc5ae78f.json
├── src/
│   ├── main.ts                 # boot: map init + data load orchestration
│   ├── map/
│   │   ├── init.ts             # addProtocol + Map + style + controls + bounds
│   │   ├── style.ts            # @protomaps/basemaps layers, muted toward #E8EBED
│   │   └── markers.ts          # symbol layer spec + hybrid composite renderer
│   ├── data/
│   │   ├── load.ts             # fetch stations/manifest/derived (BASE_URL-aware)
│   │   └── averages.ts         # decodeDerived → domain math → MarkerDatum
│   ├── ui/
│   │   ├── header.ts           # wordmark + slogan
│   │   └── attribution.ts      # build attribution HTML from ATTRIBUTION
│   └── styles/
│       ├── tokens.css          # CSS custom props from UI-SPEC (colors/space/type)
│       └── markers.css         # white-pill callout styling
└── scripts/
    └── copy-sample-data.ts     # copy derived sample + stations + manifest into public/
```

### Pattern 1: Register PMTiles protocol + build the style (MAP-01)
**What:** Register the `pmtiles://` protocol once, then hand MapLibre a style whose vector source points at the local `.pmtiles` file, with layers from `@protomaps/basemaps`.
**When to use:** Map init.
```ts
// Source: docs.protomaps.com/pmtiles/maplibre + docs.protomaps.com/basemaps/maplibre
import * as maplibregl from "maplibre-gl";              // NAMESPACE import — see Pitfall 2
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import { layers, namedFlavor } from "@protomaps/basemaps";

const protocol = new Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

const BASE = import.meta.env.BASE_URL;                   // e.g. "/betravedur/"  — see Pattern 4
const pmtilesUrl = `pmtiles://${location.origin}${BASE}iceland.pmtiles`;

const map = new maplibregl.Map({
  container: "map",
  center: [-19.0, 65.0],
  zoom: 6, minZoom: 4, maxZoom: 12,
  maxBounds: [[-26, 62.5], [-12, 67.5]],
  dragRotate: false,
  pitchWithRotate: false,
  attributionControl: false,                             // add a configured one below
  style: {
    version: 8,
    glyphs: "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
    sprite: "https://protomaps.github.io/basemaps-assets/sprites/v4/grayscale",
    sources: {
      protomaps: {
        type: "vector",
        url: pmtilesUrl,
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a> · <a href="https://protomaps.com">Protomaps</a>',
      },
    },
    layers: layers("protomaps", namedFlavor("grayscale"), { lang: "is" }),
  },
});
```
> **Muted look:** `namedFlavor("grayscale")` is the closest built-in to `#E8EBED`. To push land/sea further toward the exact token, either (a) post-process the returned `layers()` array (override the `background`/water/landcover `paint` `fill-color`/`background-color` toward `#E8EBED`), or (b) overlay a translucent `#E8EBED` background layer. Both are pure style edits — no fork. `[ASSUMED]` that grayscale + a paint override lands the exact aesthetic; verify visually against the reference.
> **Glyphs/sprite:** the example uses the Protomaps-hosted assets CDN. These are the only non-self-hosted URLs; they carry no key and no per-request auth. If a fully-self-hosted bundle is required later, copy the fonts/sprites into `public/` (out of scope for "no API keys" — CDN fonts are keyless).

### Pattern 2: Decode a derived file and compute a marker datum (MAP-02) — Risk #1 pipeline
**What:** Resolve the hashed filename from the manifest, fetch + decode, then run the domain math for the default window.
```ts
// decodeDerived is PURE — import from the /derive subpath, NOT "@betravedur/pipeline"
import { decodeDerived, type DerivedFile } from "@betravedur/pipeline/derive";
import {
  expandWindow, groupBySeasonYear, qualifyingYears, effectiveN,
  scalarMeanSpeed, circularMeanDirection, type WindowSpec, type StationMeta,
} from "@betravedur/domain";

// Fixed default period until Phase 4 adds the selector (Claude's discretion — pick a
// representative summer window, e.g. week 30 ≈ doy 197–210). Season-year grouping is
// harmless for a non-wrapping summer window (season === calendar year).
const DEFAULT_WINDOW: WindowSpec = { startDoy: 197, endDoy: 210 };

async function markerFor(meta: StationMeta, file: DerivedFile) {
  const rows = decodeDerived(file);
  const windowDays = expandWindow(DEFAULT_WINDOW);
  const byYear = groupBySeasonYear(rows, DEFAULT_WINDOW);

  // Effective N from data actually used (PITFALLS #1 — never from the picker).
  const tempYears = qualifyingYears(byYear, windowDays, (o) => o.t);
  const { n, sufficient } = effectiveN(tempYears);

  // In-window rows for the metric means.
  const inWin = rows.filter((r) => windowDays.has(r.doy));
  const temps = inWin.map((r) => r.t).filter((v): v is number => v != null);
  const meanTemp = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null;

  const windSpeed = scalarMeanSpeed(inWin.map((r) => r.f));
  const dirSamples = inWin
    .filter((r) => r.f != null && r.dv != null)
    .map((r) => ({ speed: r.f!, dirDeg: r.dv! }));
  const dir = circularMeanDirection(dirSamples);          // null OR near-zero → "breytileg átt"

  const hasPrecip = inWin.some((r) => r.r != null);        // false ⇒ "án úrkomu" (omit glyph)

  return {
    station: meta.station, lon: meta.lon, lat: meta.lat, name: meta.name,
    tempC: sufficient ? meanTemp : null,
    windSpeed, windDir: dir?.dirDeg ?? null,
    windVariable: dir === null || dir.resultantSpeed < 0.5,  // "breytileg átt"
    hasPrecip, n, sufficient,                                  // !sufficient ⇒ muted "ófullnægjandi gögn"
    priority: /* stable rank for symbol-sort-key */ meta.station === 1 ? 0 : 1,
  };
}
```
> **Decode-side confirmation:** `decodeDerived(d)` reads only `d.station/startYear/nYears/quant/cols`; it never touches `fs`/`crypto`. Verified by reading `pipeline/src/derive.ts` (lines 186–231) — no runtime imports.
> **Marker mapping (this phase):** temp uses the coverage-honest gate (`sufficient` requires n≥3). Wind speed can use a scalar mean even when direction is variable (UI-SPEC keeps the numeral, shows "breytileg átt" in place of the arrow). Precip is presence-only this phase (no rain metric shown yet).

### Pattern 3: Symbol layer for collision + hybrid composite (MAP-02, MAP-04)
**What:** A GeoJSON source + symbol layer owns placement and collision; a DOM/canvas overlay draws the rich white pill for the currently-visible (post-collision) features only.
```ts
// Source: maplibre.org/maplibre-style-spec/layers
map.addSource("stations", { type: "geojson", data: featureCollection /* MarkerDatum[] */ });

map.addLayer({
  id: "station-anchors",
  type: "symbol",
  source: "stations",
  layout: {
    // Placeholder text drives native collision sizing; the real pill is drawn in the overlay.
    "text-field": ["get", "label"],           // e.g. "7°" as the collision footprint proxy
    "text-size": 13,
    "text-font": ["Noto Sans Regular"],       // must exist in the glyphs endpoint
    "text-allow-overlap": false,              // ← native declutter: no two survive overlapping
    "text-ignore-placement": false,
    "symbol-sort-key": ["get", "priority"],   // stable: major stations (0) win collisions
    "text-optional": true,
  },
  paint: { "text-opacity": 0 },               // hide the proxy; overlay draws the visible pill
});

// After each idle/move: query the features MapLibre actually placed, draw pills for them.
map.on("idle", () => {
  const placed = map.queryRenderedFeatures({ layers: ["station-anchors"] });
  renderComposite(placed);                    // DOM/canvas pills for ≤~visible subset only
});
```
> **Why hybrid:** confirmed via the MapLibre style spec that a single symbol `text-field` cannot render red temperature + a rotated wind arrow + a precip glyph in one white pill. Native collision (`text-allow-overlap:false` + `symbol-sort-key`) gives MAP-04's zoom-density for free; `queryRenderedFeatures` returns only the post-collision survivors so the overlay never draws hundreds of nodes.
> **Pure-symbol fallback (if the composite proves unnecessary):** `icon-rotate: ["get","windDir"]` with `icon-rotation-alignment:"map"` rotates a wind-arrow sprite by the data value, and `text-field` can be a `format` expression combining temp + speed — but multi-color-per-field (red temp) is not achievable in one symbol. The hybrid is the recommended path given the UI-SPEC's white-pill requirement.
> **Wind-arrow convention:** arrow points the direction the wind blows **toward**; `circularMeanDirection().dirDeg` is the resultant direction — apply the rotation consistently and document it in code (UI-SPEC).

### Pattern 4: Vite base path + BASE_URL-aware static asset loading (SITE-01)
**What:** GitHub project pages serve from `/<repo>/`; set `base` and prefix every runtime-constructed asset URL with `import.meta.env.BASE_URL`.
```ts
// vite.config.ts — Source: vite.dev/guide/build
import { defineConfig } from "vite";
export default defineConfig({
  base: "/betravedur/",                        // ← the repo name; MUST match the Pages subpath
  build: { target: "es2023" },
});
```
```ts
// Runtime fetches of files in public/ MUST prefix BASE_URL (statically replaced at build).
const BASE = import.meta.env.BASE_URL;          // "/betravedur/" in prod, "/" in dev
const stations = await fetch(`${BASE}data/stations.json`).then((r) => r.json());
const manifest = await fetch(`${BASE}data/manifest.json`).then((r) => r.json());
// Resolve the content-hashed derived filename from the manifest (cache-busting):
const entry = manifest.stations[String(id)];    // { file: "derived/1.c1cf25669d53.json", ... }
const derived = await fetch(`${BASE}${entry.file}`).then((r) => r.json());
```
> **Gotcha:** `import.meta.env.BASE_URL` is statically replaced — write it verbatim (`import.meta.env['BASE_URL']` won't work). Assets **imported** in TS/CSS/HTML are rewritten automatically; only **runtime `fetch()` strings** and the **`pmtiles://` URL** need the manual prefix. The derived filename is hashed (`derived/1.c1cf25669d53.json`) — you MUST read it from `manifest.json`, not construct `derived/1.json`.

### Anti-Patterns to Avoid
- **Importing `decodeDerived` from `@betravedur/pipeline` (root barrel).** The root re-exports `rawstore`/`manifest`/`aggregate`, which import `node:fs`/`node:path`/`node:crypto` — that would drag Node built-ins into the browser bundle and break the build. Always import from `@betravedur/pipeline/derive`.
- **One DOM `Marker` per station.** Forbidden by CONTEXT + UI-SPEC (mobile perf, PITFALLS #9). Use the symbol layer + post-collision composite.
- **Constructing `derived/{id}.json` directly.** Files are content-hashed; resolve via `manifest.json`.
- **Default `import maplibregl from "maplibre-gl"`.** Breaks in Vite dev mode on 5.x; use `import * as maplibregl`.
- **Hardcoding attribution text.** Source it from `@betravedur/domain` `ATTRIBUTION` (licensing requirement, single source of truth).
- **Committing `raw/`.** Only `derived/`, `stations.json`, `manifest.json` ship (PIPELINE.md ship rule).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Basemap tiling / vector rendering | Custom canvas map | MapLibre GL JS | GPU vector rendering, collision, pan/zoom — years of edge cases |
| `.pmtiles` range-request decoding | Custom range fetcher | `pmtiles` `Protocol` + `addProtocol` | Handles the PMTiles directory/range protocol correctly |
| Basemap cartography (roads/water/labels) | Hand-authored style JSON | `@protomaps/basemaps` `layers()` | Hundreds of tuned layer rules for the v4 tile schema |
| Marker collision / declutter | Custom overlap culling | MapLibre `text-allow-overlap:false` + `symbol-sort-key` | Native GPU collision is MAP-04 for free; hand-rolled culling is the mobile pitfall |
| Wind circular mean / coverage / window math | Reimplement in the client | `@betravedur/domain` | Already tested (350°/10° regression, coverage gate); reimplementation risks divergence from the pipeline |
| Derived decode | Reparse the columnar format | `decodeDerived` (`@betravedur/pipeline/derive`) | The pipeline's exact inverse; guarantees client/pipeline agree |
| Base-path asset rewriting | Manual path munging everywhere | Vite `base` + `import.meta.env.BASE_URL` | Vite rewrites imported assets automatically; only runtime strings need the prefix |
| Iceland tile extraction | Custom planet slicing | `go-pmtiles` `extract --bbox` | Efficient sub-pyramid extraction with range requests |

**Key insight:** Nearly every capability in this phase is owned by a maintained library or an already-tested internal module. The only genuinely new code is glue: map init, the fetch→decode→domain-math→marker-datum pipeline, and the DOM/canvas composite renderer.

## Runtime State Inventory

Not a rename/refactor/migration phase — greenfield `site/` workspace. **N/A.** (No stored data keys, live-service config, OS-registered state, secrets, or build artifacts are being renamed. The one adjacent concern — copying the Phase-2 derived sample into `public/` — is a build input, covered in Environment Availability, not runtime state to migrate.)

## Common Pitfalls

### Pitfall 1: Importing the decode codec from the wrong entry point
**What goes wrong:** `import { decodeDerived } from "@betravedur/pipeline"` pulls the root barrel, which transitively imports `node:fs`/`node:crypto`/`node:path` (via `rawstore`/`manifest`/`aggregate`). Vite either fails to resolve the Node built-ins for the browser or bloats/breaks the bundle.
**Why it happens:** The subpath export (`./derive`) is easy to miss; the root is the "obvious" import.
**How to avoid:** Import from `@betravedur/pipeline/derive` only. Add a build-time assertion / lint rule and an E2E "no node polyfill needed" check. The subpath is already declared in `pipeline/package.json` `exports`.
**Warning signs:** Vite errors like "Module 'node:fs' externalized for browser compatibility" or "Cannot resolve node:crypto"; bundle-analyzer showing pipeline siblings pulled in.

### Pitfall 2: MapLibre + Vite bundling breakage (dev default-import + version interop)
**What goes wrong:** (a) `import maplibregl from "maplibre-gl"` (default) fails in Vite dev mode on maplibre-gl 5.x. (b) A documented window (maplibre-gl 5.21.0/5.21.1 × Vite 8.0.3–8.0.8) produced production-only worker errors ("Ia is not defined").
**Why it happens:** MapLibre's ESM distribution + web-worker bundling interacts subtly with Vite's dev/prod pipelines.
**How to avoid:** Use `import * as maplibregl from "maplibre-gl"`. Pin the STACK versions (maplibre-gl **5.24.0**, published after the broken 5.21.x window, with Vite **8.1.5**) — likely clear, but **not proven** for this exact pair. **Verify by running the Playwright E2E against the `vite preview` production build, not just dev** (the errors were production-only). `[ASSUMED]` that 5.24.0 × Vite 8.1.5 is clean — confirm with a preview-build smoke test as an early task.
**Warning signs:** Blank map in dev; "X is not defined" in the worker in production preview; markers/GeoJSON not rendering after `setData`.

### Pitfall 3: Constructing derived URLs instead of resolving from the manifest
**What goes wrong:** Fetching `derived/1.json` 404s — the real file is `derived/1.c1cf25669d53.json` (content-hashed for cache busting).
**How to avoid:** Read `manifest.json`; use `manifest.stations[id].file`. Confirmed against the live `data` branch (`derived/1.c1cf25669d53.json`, `derived/1350.eaecfc5ae78f.json`).
**Warning signs:** 404s on derived files; stations render empty despite data present.

### Pitfall 4: Base-path drift between Vite config and Pages URL
**What goes wrong:** `base` doesn't match the repo subpath → assets/pmtiles/data 404 on Pages (works locally at `/`).
**How to avoid:** Set `base: "/<repo>/"` and prefix runtime `fetch()` + the `pmtiles://` URL with `import.meta.env.BASE_URL`. Test the **preview build** (which honors `base`), not just dev.
**Warning signs:** Everything works `npm run dev` but the deployed site is blank / 404s in the console.

### Pitfall 5: DOM-marker overload on mobile (PITFALLS #9)
**What goes wrong:** One DOM node per station makes the coastal cluster an unclickable blob and janks mobile pan/zoom.
**How to avoid:** Symbol-layer collision owns placement; the composite overlay draws only `queryRenderedFeatures` survivors. Density acceptance: ≤~25 visible callouts at zoom 6, no two fully overlapping (UI-SPEC criterion 10).
**Warning signs:** >25 pills at country zoom; overlapping boxes; scroll jank on a throttled mobile profile.

### Pitfall 6: PMTiles extract too big or too small
**What goes wrong:** maxzoom too high → tens of MB toward the Pages budget; too low → basemap looks blocky at map maxZoom 12.
**How to avoid:** Extract at `--maxzoom=9` (or 10), **measure the file**, and confirm it looks clean at zoom 12 (MapLibre overzooms basemap tiles). Iceland is sparse, so 9–10 should be small. `[ASSUMED]` single-digit–~20 MB at maxzoom 9 — measure before committing.
**Warning signs:** `public/iceland.pmtiles` unexpectedly large; blocky coastline at max zoom.

## Code Examples

### Extract the Iceland PMTiles (one-time, build-time)
```bash
# Source: docs.protomaps.com/pmtiles/cli + docs.protomaps.com/basemaps/downloads
# 1. Find the latest daily planet build URL at https://maps.protomaps.com/builds
#    (e.g. https://build.protomaps.com/YYYYMMDD.pmtiles — copy the current dated URL)
# 2. Extract an Iceland bbox at a capped maxzoom directly from the remote build:
pmtiles extract \
  https://build.protomaps.com/20260719.pmtiles \
  site/public/iceland.pmtiles \
  --bbox=-26,62.5,-12,67.5 \
  --maxzoom=9 \
  --download-threads=4
# 3. Measure and record the size; if a large-bbox extract errors, add --overfetch=0
ls -lh site/public/iceland.pmtiles
```
> `--bbox` matches the UI-SPEC `maxBounds`. `--overfetch=0` is the documented workaround for large-bbox extract failures (go-pmtiles issue #225). Commit the file to `public/` (a plain blob well under Pages' 100 MB/file and 1 GB/site limits — NOT via Git LFS, which Pages won't serve).

### Attribution control from the domain constant (UX-01, licensing)
```ts
// Source: @betravedur/domain/src/attribution.ts + UI-SPEC Attribution Control
import * as maplibregl from "maplibre-gl";
import { ATTRIBUTION } from "@betravedur/domain";

const html =
  `${ATTRIBUTION.text_is} ${ATTRIBUTION.modifiedNotice_is} ` +
  `(<a href="${ATTRIBUTION.sourceUrl}">${ATTRIBUTION.license}</a>) · ` +
  `© <a href="https://openstreetmap.org">OpenStreetMap</a> · ` +
  `<a href="https://protomaps.com">Protomaps</a>`;

map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: html }), "bottom-right");
```
> Satisfies UI-SPEC criterion 8 (names Veðurstofa Íslands, OpenStreetMap, CC BY 4.0). The source vector layer's own `attribution` field also carries OSM/Protomaps as a fallback.

### Reduced-motion-aware map easing (UI-SPEC accessibility)
```ts
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
map.easeTo({ /* … */, duration: reduceMotion ? 0 : 500 });
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `protomaps-themes-base` 4.5.0 (STACK.md) — `themes.default(source, flavor)` | `@protomaps/basemaps` 5.7.2 — `layers(source, namedFlavor(flavor), opts)` | Package migrated ~2025; `protomaps-themes-base` deprecated | Use the new package + API. Both target the Protomaps v4 tile schema, so extracts and the daily build are compatible. |
| Default import of maplibre-gl | `import * as maplibregl` (namespace) | maplibre-gl 5.x ESM distribution | Required for Vite dev mode; prevents blank-map-in-dev. |
| `pmtiles extract` on large bbox failing | `--overfetch=0` flag | go-pmtiles (issue #225) | Reliable large-region extraction. |

**Deprecated/outdated:**
- `protomaps-themes-base` — superseded by `@protomaps/basemaps`.
- Default MapLibre import — use namespace import.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | maplibre-gl 5.24.0 × Vite 8.1.5 is free of the 5.21.x-era worker breakage | Pitfall 2 | Production build breaks; markers don't render. Mitigation: Playwright E2E on the **preview** build catches it early — make it an early task. |
| A2 | Iceland extract at `--maxzoom=9` is single-digit–~20 MB and looks clean at map zoom 12 | Risk #2 / Pitfall 6 | Larger-than-expected file or blocky basemap. Mitigation: measure the extract as the first phase task; try maxzoom 9 and 10. |
| A3 | `@protomaps/basemaps` `grayscale` flavor + a paint override lands the exact muted `#E8EBED` look | Pattern 1 | Aesthetic mismatch with the reference. Mitigation: visual check against gottvedur.is/kort; adjust paint overrides (pure style edit). |
| A4 | The daily planet build URL shape `https://build.protomaps.com/YYYYMMDD.pmtiles` is current | Code Examples (extract) | Extract command fails. Mitigation: copy the exact current URL from `maps.protomaps.com/builds` at run time. |
| A5 | A representative "week 30" summer window (doy 197–210) is an acceptable fixed default until Phase 4 | Pattern 2 | Only a placeholder period; Phase 4 replaces it. Low risk — any reasonable summer window satisfies the phase. |
| A6 | The Protomaps-hosted glyphs/sprite CDN URLs are acceptable under "no API keys" (they are keyless, unauthenticated) | Pattern 1 | If a stricter "fully self-hosted" reading applies, copy fonts/sprites into `public/`. Low risk — no key involved. |

## Open Questions

1. **Default period value.**
   - What we know: A fixed default is used until Phase 4 (CONTEXT). Domain window math is ready.
   - What's unclear: Exact doy window the planner wants for the neutral default.
   - Recommendation: Use a summer window (e.g. week 30 ≈ doy 197–210); non-wrapping so season-year grouping is trivial. Planner to confirm or pick another.

2. **Muted-basemap exact treatment.**
   - What we know: UI-SPEC wants land/sea resolving toward `#E8EBED`; `grayscale` flavor is the closest built-in.
   - What's unclear: Whether grayscale alone suffices or a paint override / overlay is needed.
   - Recommendation: Start with `grayscale`, add targeted `paint` overrides on background/water; verify against the reference screenshot.

3. **maxzoom for the extract.**
   - What we know: Map maxZoom is 12; each basemap zoom level ~doubles size; MapLibre overzooms fine.
   - Recommendation: Extract at 9 and 10, measure both, commit the smallest that looks acceptable at zoom 12.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | Vite build, workspace | ✓ | v25.6.1 (`.nvmrc`=25) | — |
| npm workspaces | `site/` workspace | ✓ | 11.9.0 | — |
| `go-pmtiles` CLI | One-time Iceland extract | ✗ (not yet installed) | needs v1.31.1 | `brew install protomaps/tap/pmtiles` or download release binary — required once |
| Chromium (Playwright) | E2E | ✗ (not yet installed) | via `npx playwright install chromium` | — |
| Phase-2 sample data (`data` branch) | `public/data/*` seed | ✓ | `derived/1.c1cf25669d53.json`, `derived/1350.eaecfc5ae78f.json`, `stations.json`, `manifest.json` present on branch `data` | Regenerable via `npm run aggregate` |
| Internet (extract time only) | Fetch planet build for extract | assumed ✓ | — | Extract is a one-time build step; the committed `.pmtiles` needs no network at site runtime |

**Missing dependencies with no fallback:** none blocking — `go-pmtiles` and Chromium are one-command installs; both are build/test-time only, not shipped.
**Missing dependencies with fallback:** sample data is on the `data` branch (copy into `public/`) or regenerable via `npm run aggregate`.

## Validation Architecture

`workflow.nyquist_validation` is `true` → section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework (unit) | Vitest 4.1.10 (repo standard; `vitest.config.ts` at root) |
| Framework (E2E) | Playwright 1.61.1 (**new** dev dependency in `site/`) |
| Config file | root `vitest.config.ts` (exists); `site/playwright.config.ts` (Wave 0 — create) |
| Quick run command | `npm test -- site` (Vitest, unit) |
| Full suite command | `npm test` (all workspaces) + `npm run e2e -w site` (Playwright on the preview build) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MAP-02 | `decodeDerived` (from `/derive`) round-trips the committed sample into rows | unit | `vitest run site/src/data/averages.test.ts` | ❌ Wave 0 |
| MAP-02 | period → marker datum: temp mean, `scalarMeanSpeed`, `circularMeanDirection`, `hasPrecip`, effective-N gate | unit | `vitest run site/src/data/averages.test.ts` | ❌ Wave 0 |
| MAP-02 | "breytileg átt" when `circularMeanDirection` null / resultant ~0 | unit | `vitest run site/src/data/averages.test.ts -t "breytileg"` | ❌ Wave 0 |
| MAP-02 | "án úrkomu" (AWS #1350, no `r`) → `hasPrecip=false`, station still emitted | unit | `vitest run site/src/data/averages.test.ts -t "an urkomu"` | ❌ Wave 0 |
| MAP-02 | insufficient coverage → muted/`ófullnægjandi gögn` datum, no throw | unit | `vitest run site/src/data/averages.test.ts -t "ofullnaegjandi"` | ❌ Wave 0 |
| SITE-01 | manifest resolves hashed derived filename (not `derived/1.json`) | unit | `vitest run site/src/data/load.test.ts` | ❌ Wave 0 |
| UX-01 | header renders exact `Leitin að betra veðri` + `Betra Veður` | E2E | `playwright test -g "slogan"` (UI-SPEC criteria 1–2) | ❌ Wave 0 |
| MAP-01 | `canvas.maplibregl-canvas` present, non-zero size | E2E | `playwright test -g "map canvas"` (criterion 3) | ❌ Wave 0 |
| MAP-01 | built JS/HTML contains no `maptiler`/`api_key`/`access_token` | E2E (static grep of `dist/`) | `playwright test -g "no api key"` (criterion 4) | ❌ Wave 0 |
| MAP-02 | ≥1 marker at zoom 6; a marker shows `/-?\d+°/`; wind `/\d+\s?m\/s/` or `breytileg átt` | E2E | `playwright test -g "marker"` (criteria 5–7) | ❌ Wave 0 |
| UX-01 | attribution names `Veðurstofa Íslands`, `OpenStreetMap`, `CC BY 4.0` | E2E | `playwright test -g "attribution"` (criterion 8) | ❌ Wave 0 |
| MAP-01/04 | zoom changes level / marker count; ≤~25 callouts at zoom 6, none fully overlapping | E2E | `playwright test -g "density"` (criteria 9–10) | ❌ Wave 0 |
| MAP-02 | missing-average station → muted callout, no white-screen | E2E | `playwright test -g "graceful"` (criterion 11) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test -- site` (fast unit tests on the average/decode/marker transforms).
- **Per wave merge:** full unit suite + `npm run e2e -w site` (Playwright on `vite preview`).
- **Phase gate:** unit + E2E green (including the preview-build smoke test that guards Pitfall 2) before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `site/playwright.config.ts` — `webServer` runs `vite preview` (production build), `baseURL` honors `base`.
- [ ] `site/src/data/averages.test.ts` — unit tests for decode → domain-math → marker datum (MAP-02).
- [ ] `site/src/data/load.test.ts` — manifest hashed-filename resolution + BASE_URL prefixing (SITE-01).
- [ ] `site/tests/e2e/*.spec.ts` — the 11 UI-SPEC acceptance criteria.
- [ ] Framework install: `npm i -D -w site @playwright/test@1.61.1 && npx playwright install chromium`.
- [ ] Test fixture: the committed `public/data/*` sample doubles as E2E and unit fixture (deterministic, offline).

## Security Domain

`security_enforcement` not explicitly `false` → included. This is a static, unauthenticated, read-only public site with no user input, no backend, no secrets.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth — public read-only static site |
| V3 Session Management | no | No sessions |
| V4 Access Control | no | All content public |
| V5 Input Validation | partial | The only "input" is fetched static JSON the pipeline produced; the derived schema is typed (`DerivedFile`). Guard against malformed `manifest`/`derived` (missing keys) so a bad file degrades to a muted marker, not a crash (UI-SPEC criterion 11). |
| V6 Cryptography | no | No secrets, no crypto in the client. **No API keys anywhere in the bundle** (UI-SPEC criterion 4 — E2E-enforced). |
| V14 Config / Supply chain | yes | Pin exact dependency versions; slopcheck-clean (all [OK]); prefer self-hosted libs over CDN `<script>` (bundled via Vite). |

### Known Threat Patterns for a static keyless map site
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Secret/API key leaked in the public bundle | Information disclosure | Self-hosted PMTiles, no keys; E2E asserts no `maptiler`/`api_key`/`access_token` in `dist/` (criterion 4) |
| Malformed static data crashes the page | Denial of service (self-inflicted) | Defensive decode; muted/empty marker + "ófullnægjandi gögn" fallback; never white-screen |
| Supply-chain tampering in map/build deps | Tampering | Pin exact versions; slopcheck (all [OK]); Vite-bundled (no runtime CDN `<script>` for map libs); `package-lock.json` committed |
| Attribution/license omission (CC BY 4.0) | Compliance/reputational | Attribution control sourced from domain `ATTRIBUTION`; E2E asserts presence (criterion 8) |

## Sources

### Primary (HIGH confidence)
- Live repo read: `pipeline/src/derive.ts` (decode path — zero node imports), `pipeline/package.json` (`./derive` subpath export), `packages/domain/src/*` (window/wind/coverage/attribution/types), `tsconfig.base.json` (`verbatimModuleSyntax`), `data` branch (`derived/1.c1cf25669d53.json`, `stations.json`, `manifest.json`), `PIPELINE.md` (ship rule, season-year, derived shape) — HIGH, direct observation.
- `npm view` (2026-07-20): maplibre-gl 5.24.0, pmtiles 4.4.1, @protomaps/basemaps 5.7.2, protomaps-themes-base 4.5.0 (deprecated), vite 8.1.5, typescript 7.0.2, @playwright/test 1.61.1, vitest 4.1.10 — HIGH.
- GitHub releases API — go-pmtiles v1.31.1 — HIGH.
- `docs.protomaps.com/pmtiles/maplibre` — `Protocol` + `addProtocol` + `pmtiles://` source — HIGH.
- `docs.protomaps.com/basemaps/maplibre` — `layers()` / `namedFlavor()` / glyphs+sprite — HIGH.
- `docs.protomaps.com/pmtiles/cli` — `extract --bbox/--maxzoom/--overfetch/--region` syntax — HIGH.
- `docs.protomaps.com/basemaps/downloads` — daily planet build channel (`maps.protomaps.com/builds`) — HIGH.
- `vite.dev/guide/build` — `base` + `import.meta.env.BASE_URL` semantics — HIGH.
- `maplibre.org/maplibre-style-spec/layers` — symbol layer `icon-rotate`, `text-allow-overlap`, `symbol-sort-key`, `icon-rotation-alignment` — HIGH.

### Secondary (MEDIUM confidence)
- WebSearch (verified against protomaps docs): `@protomaps/basemaps` supersedes `protomaps-themes-base`.
- GitHub issues maplibre-gl #7339 / rolldown-vite #585: maplibre-gl 5.21.x × Vite 8.0.x production worker breakage (A1 flagged; verify 5.24.0 × 8.1.5 via preview E2E).
- go-pmtiles #225: `--overfetch=0` for large-bbox extract failures.

### Tertiary (LOW confidence)
- Iceland extract size at maxzoom 9 (single-digit–~20 MB) — estimate only; measure the actual file (A2).

## Metadata

**Confidence breakdown:**
- Risk #1 (decodeDerived browser-safety): **HIGH** — verified by direct source read; subpath export already exists.
- Risk #2 (PMTiles Iceland basemap): **HIGH** on the API/recipe; **MEDIUM** on the extract size estimate (must measure).
- Standard stack: **HIGH** — all versions registry-verified + slopcheck [OK].
- Architecture / marker rendering: **HIGH** — hybrid confirmed against the MapLibre style spec + UI-SPEC.
- Vite × MapLibre interop: **MEDIUM** — 5.24.0 × 8.1.5 assumed clean; preview-build E2E is the gate.

**Research date:** 2026-07-20
**Valid until:** ~2026-08-20 (30 days; MapLibre/Vite/pmtiles move moderately — re-verify versions if planning slips).
