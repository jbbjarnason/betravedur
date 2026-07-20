---
phase: 03-static-site-shell-interactive-map
verified: 2026-07-20T09:15:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
---

# Phase 3: Static Site Shell & Interactive Map — Verification Report

**Phase Goal:** A deployable Vite/TypeScript static site, Icelandic-branded with "Leitin að betra veðri", showing an interactive pan/zoom MapLibre map of Iceland with station markers displaying the selected period's historical averages at appropriate zoom density.
**Verified:** 2026-07-20T09:15:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | A visitor can pan and zoom an interactive map of Iceland rendered from a self-hosted PMTiles basemap with no API keys | VERIFIED | `site/public/iceland.pmtiles` exists (7.3 MiB, maxzoom 9). `site/src/map/init.ts` registers `pmtiles://` protocol; `site/src/map/style.ts` builds a style from the self-hosted URL prefixed with `import.meta.env.BASE_URL`. Zero matches for `maptiler|api_key|access_token` in `dist/`. E2E criterion 4 ("no api key") passes. E2E criterion 3 ("map canvas") confirms `canvas.maplibregl-canvas` renders. |
| SC-2 | Station markers show historical averages for the current period: temperature, wind speed + direction arrow, and a precipitation indicator | VERIFIED | `site/src/data/averages.ts` computes coverage-honest `MarkerDatum` via `decodeDerived` (from `@betravedur/pipeline/derive`) + domain math (`scalarMeanSpeed`, `circularMeanDirection`, `effectiveN`). `site/src/map/markers.ts` `formatCallout` renders: accent-red `°C` temp, rotated SVG wind arrow + `m/s`, precip drop glyph (absent for "án úrkomu"), muted "ófullnægjandi gögn" for insufficient coverage. Unit tests 17/17 + 12/12 green. E2E criteria 6 ("temperature with °"), 7 ("wind speed m/s or breytileg átt") pass on preview build. |
| SC-3 | Marker density adapts to zoom so stations become readable rather than overlapping as the user zooms in | VERIFIED | `installMarkerLayer` in `markers.ts` adds a MapLibre `symbol` layer with `text-allow-overlap:false`, `symbol-sort-key:["get","priority"]`, and `text-opacity:0` (invisible collision proxy). `renderComposite` uses `queryRenderedFeatures` to draw pills only for post-collision survivors. `new maplibregl.Marker` count == 0 (grep-gated). E2E criterion 10 ("density ≤ 25, no full overlap") and criterion 9 ("zooming changes zoom level or count") both pass. |
| SC-4 | The site is fully static (Vite/TS build), Icelandic-only, carries the slogan in the branding, and builds and deploys to GitHub Pages | VERIFIED | `vite.config.ts` sets `base: "/betravedur/"`. `npm run build -w site` produces `dist/` with `/betravedur/assets/...` paths. `index.html` has `lang="is"`. Header renders "Betra Veður" + "Leitin að betra veðri" (verbatim Icelandic, sourced from UI-SPEC constants). E2E criteria 1 ("slogan") and 2 ("wordmark") pass. |

**Score: 4/4 truths verified**

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `site/vite.config.ts` | Vite config with `base: "/betravedur/"` | VERIFIED | Line 6: `base: "/betravedur/"`, `build.target: "es2023"` |
| `site/playwright.config.ts` | Playwright E2E driving `vite preview` (production build) | VERIFIED | `webServer.command: "npm run build && npm run preview -- --port 4173 --strictPort"`, `baseURL: "http://localhost:4173/betravedur/"` |
| `site/public/iceland.pmtiles` | Self-hosted Iceland PMTiles basemap (committed) | VERIFIED | 7,675,569 bytes (7.3 MiB), maxzoom 9. File present and committed to repo. |
| `site/src/map/init.ts` | MapLibre map init: pmtiles protocol + style + bounds + attribution | VERIFIED | Registers `addProtocol("pmtiles", protocol.tile)`; constructs map at center `[-19.0, 65.0]` / zoom 6 / minZoom 4 / maxZoom 12 / maxBounds `[[-26,62.5],[-12,67.5]]` / `dragRotate:false` / `pitchWithRotate:false`. |
| `site/src/ui/attribution.ts` | Attribution HTML built from domain `ATTRIBUTION` constant | VERIFIED | Imports `ATTRIBUTION` from `@betravedur/domain`; builds HTML using `text_is`, `modifiedNotice_is`, `sourceUrl`, `license`. Never hardcodes Veðurstofan text. |
| `site/src/data/types.ts` | `MarkerDatum` contract + `DEFAULT_WINDOW` | VERIFIED | Exports full `MarkerDatum` interface (temp/wind/precip/coverage fields) and `DEFAULT_WINDOW: WindowSpec = { startDoy: 197, endDoy: 210 }`. |
| `site/src/data/load.ts` | Manifest hashed-filename resolution + BASE_URL-aware fetch | VERIFIED | `resolveDerivedFile` reads `manifest.stations[String(id)]?.file` (never constructs `derived/{id}.json`). `assetUrl` prefixes with base. Zero `node:` imports. |
| `site/src/data/averages.ts` | `decodeDerived` → domain math → MarkerDatum transform | VERIFIED | Imports `decodeDerived` from `@betravedur/pipeline/derive` (subpath, not root barrel). Uses `expandWindow`, `groupBySeasonYear`, `qualifyingYears`, `effectiveN`, `scalarMeanSpeed`, `circularMeanDirection` from `@betravedur/domain`. Zero `node:` imports. |
| `site/src/map/markers.ts` | GeoJSON source + symbol collision layer + hybrid composite renderer | VERIFIED | Contains `queryRenderedFeatures`, `text-allow-overlap`, `symbol-sort-key`, `text-opacity:0`. `new maplibregl.Marker` count == 0. |
| `site/src/styles/markers.css` | White-pill callout styling (temp red, wind, precip, muted-empty state) | VERIFIED | Single `var(--accent)` site on `.marker-pill .marker-temp`. Focus skeleton (`:focus-visible`), 44px min hit area, `prefers-reduced-motion` respected. |
| `site/tests/e2e/markers.spec.ts` | E2E covering UI-SPEC criteria 5,6,7,9,10,11 | VERIFIED | 7 tests cover all 6 criteria plus an evidence-capture test. All pass on preview build. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `site/src/map/init.ts` | `site/public/iceland.pmtiles` | `pmtiles://` URL prefixed with `import.meta.env.BASE_URL` | VERIFIED | Line 49 of `style.ts`: `pmtilesUrl = \`pmtiles://${location.origin}${BASE}iceland.pmtiles\`` |
| `site/src/ui/attribution.ts` | `@betravedur/domain ATTRIBUTION` | `import { ATTRIBUTION } from "@betravedur/domain"` | VERIFIED | Line 7 of `attribution.ts`; all attribution text references `ATTRIBUTION.text_is`, `.modifiedNotice_is`, `.sourceUrl`, `.license`. |
| `site/src/data/averages.ts` | `@betravedur/pipeline/derive decodeDerived` | `import { decodeDerived } from "@betravedur/pipeline/derive"` | VERIFIED | Line 15: `import { decodeDerived, type DerivedFile } from "@betravedur/pipeline/derive"`. Root-barrel import count == 0. |
| `site/src/data/averages.ts` | `@betravedur/domain` wind/coverage/window math | `import { circularMeanDirection, scalarMeanSpeed, effectiveN, ... }` | VERIFIED | Lines 17-26: imports `expandWindow`, `groupBySeasonYear`, `qualifyingYears`, `effectiveN`, `scalarMeanSpeed`, `circularMeanDirection` from `@betravedur/domain`. |
| `site/src/data/load.ts` | `manifest.json` | `manifest.stations[id].file` resolves the hashed derived URL | VERIFIED | `resolveDerivedFile(manifest, id)` reads `manifest.stations[String(id)]?.file`; unit test confirms hashed filenames (`1.c1cf25669d53.json`, `1350.eaecfc5ae78f.json`) for both committed stations. |
| `site/src/map/markers.ts` | `site/src/data/averages.ts computeMarkerDatum` | `import { MarkerDatum }` + `computeMarkerDatum` | VERIFIED | `main.ts` imports and calls `computeMarkerDatum(meta, derived, DEFAULT_WINDOW)` in the full load flow wired in `wireMarkers`. |
| `site/src/map/markers.ts` | MapLibre symbol layer | `text-allow-overlap:false` + `symbol-sort-key` for native collision | VERIFIED | Lines 192-195 of `markers.ts`: `"text-allow-overlap": false`, `"symbol-sort-key": ["get","priority"]`, `"text-optional": true`, `"text-opacity": 0`. |
| `site/src/main.ts` | `site/src/map/markers.ts` | `loadStations()` → `wireMarkers()` → `installMarkerLayer` + `attachCompositeRenderer` | VERIFIED | `main.ts` imports `installMarkerLayer`, `attachCompositeRenderer` from `./map/markers.js`; `wireMarkers` calls them after `loadMarkerData()`. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `site/src/main.ts` → `#marker-overlay` | `MarkerDatum[]` | `loadStations` + `loadManifest` + `loadDerived` → `computeMarkerDatum` | Yes — real derived JSON files decoded via `decodeDerived`, averaged with domain math; confirmed by unit test showing `tempC ≈ 11.37°C` from SYNOP #1 real data | FLOWING |
| `site/src/map/markers.ts` `renderComposite` | `placed` (post-collision features) | `map.queryRenderedFeatures({layers:["station-anchors"]})` pulls datum from `f.properties.datum` (JSON.stringified MarkerDatum) | Yes — datum is serialized from real `computeMarkerDatum` output | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `npm run build -w site` succeeds | `npm run build -w site` | Exit 0; `dist/` produced with `/betravedur/` base-path asset URLs | PASS |
| No API keys in built dist | `grep -rEi "maptiler|api_key|access_token" site/dist` | 0 matches | PASS |
| `text-allow-overlap`, `symbol-sort-key`, `text-opacity:0` present in markers.ts | grep | All three present at lines 192-198 | PASS |
| `new maplibregl.Marker` absent in markers.ts | `grep -c "new maplibregl.Marker" markers.ts` | 0 | PASS |
| `decodeDerived` from `/derive` subpath only | `grep -c "@betravedur/pipeline/derive" averages.ts` | 2; root-barrel count 0 | PASS |
| No `node:` imports in production browser modules | grep across `averages.ts`, `load.ts`, `markers.ts` | 0 | PASS |
| Namespace maplibre import used | `grep -c "import \* as maplibregl"` | 2 (init.ts + markers.ts); default import count 0 | PASS |
| Single `var(--accent)` site in markers.css | `grep -c "var(--accent)"` | 1 (`.marker-pill .marker-temp` only) | PASS |
| Full unit suite | `npx vitest run` | 174 passed / 3 skipped (20 files) | PASS |
| Full E2E suite on preview build | `npm run e2e -w site` | 12/12 tests passed (14.9s) — all 11 UI-SPEC criteria covered | PASS |

---

### Probe Execution

No phase-declared probes. The E2E suite (`npm run e2e -w site`) serves as the equivalent gate; it ran against the production preview build and passed 12/12.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| MAP-01 | 03-01 | Interactive pan/zoom map of Iceland (MapLibre GL + self-hosted PMTiles, no API keys) | SATISFIED | PMTiles committed; no API key in dist; E2E criteria 3,4,9 pass |
| MAP-02 | 03-02, 03-03 | Station markers show historical averages: temperature, wind speed + direction arrow, precipitation indicator | SATISFIED | `computeMarkerDatum` + `formatCallout` + full pipeline wired in `main.ts`; E2E criteria 5,6,7 pass; 17+12 unit tests green |
| MAP-04 | 03-03 | Marker density adapts to zoom level (no unreadable overlap) | SATISFIED | Symbol-layer collision with `text-allow-overlap:false`; E2E criteria 9,10 pass; `new maplibregl.Marker` == 0 |
| UX-01 | 03-01 | Icelandic-only UI with slogan "Leitin að betra veðri" in branding | SATISFIED | `header.ts` hardcodes "Betra Veður" + "Leitin að betra veðri" verbatim; `index.html` has `lang="is"`; E2E criteria 1,2 pass |
| SITE-01 | 03-01 | Fully static site built with Vite/TypeScript, deployable to GitHub Pages by CI | SATISFIED | `vite.config.ts` base `/betravedur/`; build produces `/betravedur/assets/` paths; Playwright drives the production preview build |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `site/src/data/load.ts` | 36 | `return null` — but this is the correct defensive return for an unknown manifest entry | INFO | Not a stub — this is intentional defensive decode per ASVS V5 (missing entry returns null, never throws). Not flagged as a gap. |

No TBD/FIXME/XXX markers. No TODO/HACK/PLACEHOLDER. No unimplemented handlers. No stub return patterns affecting real data flow. The `return null` in `load.ts` is a documented defensive pattern, not a placeholder.

---

### Human Verification Required

None. Per the user directive: the 2-station sample (full national data deferred to Phase 8) is correct-by-design. Neutral markers / no click handler / no score coloring are correct phase boundaries (Phases 5-6). All E2E tests were run by the verifier against the production preview build. Evidence screenshots were self-inspected by the executor and committed to `evidence/`.

---

## Gaps Summary

No gaps found. All four ROADMAP success criteria are VERIFIED by direct code inspection, grep gates, and live test execution:

- `npm run build -w site` passes (build artifact produced with correct `/betravedur/` base paths)
- `npx vitest run` passes (174/177 passing; 3 pre-existing skips from prior phases)
- `npm run e2e -w site` passes (12/12 Playwright tests on the production preview build, covering all 11 UI-SPEC acceptance criteria)
- No API keys in the built bundle (0 matches for `maptiler|api_key|access_token`)
- `decodeDerived` imported from `/derive` subpath exclusively (root barrel import count == 0)
- `new maplibregl.Marker` count == 0 (hybrid symbol-layer collision, not DOM-per-station)
- Accent red (`var(--accent)`) appears exactly once in `markers.css` (temperature numeral only)
- All 3 evidence screenshots exist and were self-inspected by the executor

---

_Verified: 2026-07-20T09:15:00Z_
_Verifier: Claude (gsd-verifier)_
