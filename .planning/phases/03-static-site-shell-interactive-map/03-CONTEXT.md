# Phase 3: Static Site Shell & Interactive Map - Context

**Gathered:** 2026-07-20
**Status:** Ready for planning

<domain>
## Phase Boundary

A deployable Vite/TypeScript static site — Icelandic-branded with the slogan "Leitin að betra veðri" — showing an interactive pan/zoom MapLibre map of Iceland with station markers that display the selected period's historical averages at zoom-appropriate density, built and deployable to GitHub Pages. This phase establishes the site shell + map + markers. NOT in this phase: period/year-range selectors (Phase 4), score coloring + ranked list (Phase 5), station chart panel (Phase 6), responsive/trust states (Phase 7), nightly deploy automation (Phase 8). A fixed default period is used until Phase 4 adds the selector.

</domain>

<decisions>
## Implementation Decisions

### Map Visual Direction
- Match the gottvedur.is/kort reference (user's screenshot): muted land/sea MapLibre basemap; white rounded callout markers each showing temperature (red), a wind direction arrow + speed (m/s), and a small condition/precipitation indicator icon.
- Self-hosted PMTiles basemap via the pmtiles protocol — no MapTiler key, no API keys anywhere in the client (STACK decision; avoids MapTiler's non-commercial + exposed-key problem).
- Default map view framed on Iceland (approx center lat 65, lon -19, zoom ~6), matching the reference framing.

### Marker Content & Style (this phase)
- Markers are NEUTRAL this phase: temp + wind arrow/speed + precip indicator in a neutral style. Score-based coloring is Phase 5; click-to-open chart panel is Phase 6. Keep clean phase boundaries — markers are display-only now (no click handler beyond maybe a hover label).
- Wind arrow uses the Phase 1 circular-mean direction; render "breytileg átt" (variable) when direction is undefined (atan2(0,0) case from Phase 1).
- Stations scored "án úrkomu" (no rain) still render — just omit the precip indicator, don't hide the station.
- Missing-average stations for the default period show a muted/empty marker state, not a crash (reuse the Phase 1 "ófullnægjandi gögn" honesty).

### Marker Density / Zoom
- Zoom-dependent density so markers are readable, not overlapping (success criterion). Approach at Claude's discretion — MapLibre symbol-layer collision/declutter (preferred, GPU-driven, matches the vector-tile stack) or a priority-based cull. Prefer MapLibre's native symbol collision over DOM-marker clustering (research pitfall: many DOM markers kill mobile perf).
- At country zoom, show the major stations (like the reference's ~15); reveal more as the user zooms in.

### Data Source (this phase)
- Commit the small REAL derived sample produced by Phase 2's backfill (Keflavík #1350 + Reykjavík #1, plus stations.json + manifest.json) into the site's static/public dir so the site builds and deploys standalone without the data branch.
- The client loads derived/{station}.json + stations.json + manifest.json as static assets and computes the default-period averages in-browser using @betravedur/domain (same module — no reimplementation).
- Full national dataset arrives via Phase 8's pipeline/deploy; document this as a known interim in the site README.

### Site Framework
- Vanilla TypeScript + Vite (STACK decision — single interactive page, no Astro/SvelteKit overhead). New `site/` (or `app/`) workspace in the monorepo, importing @betravedur/domain.
- Icelandic-only UI; header carries the slogan "Leitin að betra veðri".
- `vite build` output deployable to GitHub Pages (correct base path handling for a project-pages subpath).

### Claude's Discretion
- Exact declutter/collision implementation, marker DOM vs symbol-layer choice (prefer symbol layer), CSS/design-system seed, PMTiles extract acquisition (may generate/commit a small Iceland extract or document the build step), workspace name.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- @betravedur/domain: window/coverage/wind/precip/score math — the client uses this to compute the default-period per-station averages from derived files. Zero-dep, browser-safe by design (tsconfig has no node types).
- @betravedur/pipeline derive.ts: `decodeDerived` — the client decodes derived/{station}.json with the same codec the pipeline encodes with. NOTE: derive.ts currently lives in the pipeline package (imports are fine, but confirm it's browser-safe / no node built-ins in the decode path; if encode uses zlib/crypto, only import the decode half or split the module).
- Real derived sample + stations.json + manifest.json from Phase 2 (on the data branch / regenerable via aggregate).
- CC BY 4.0 ATTRIBUTION constant (packages/domain) — surface it in the map (MapLibre attribution control) even before the full info panel (Phase 7).

### Established Patterns
- npm workspaces, strict TS, Vitest, TDD, offline-deterministic tests. Frontend testing will add a browser/E2E layer (Playwright — see integration note).

### Integration Points
- Phase 4 adds selectors that drive the same in-browser average computation this phase wires up — design the period→averages→markers data flow so a selector can swap the period without re-architecting.
- Phase 5 colors these markers by score; Phase 6 makes them clickable. Leave seams for both.

</code_context>

<specifics>
## Specific Ideas

- Reference screenshot: gottvedur.is/kort — white callouts, temp in red, wind arrow + integer m/s, condition icon, MapTiler+OSM attribution (we use PMTiles+OSM instead).
- decodeDerived browser-safety must be confirmed/handled — this is the one real technical risk in the phase.
- Follow the frontend-design skill guidance for a distinctive-but-restrained Icelandic aesthetic; don't ship templated defaults.

</specifics>

<deferred>
## Deferred Ideas

- Period / year-range selectors + URL state — Phase 4.
- Score coloring, legend, ranked "best stations" list, score explainer — Phase 5.
- Station click → chart panel (candlesticks + rain bars + daylight) — Phase 6.
- Mobile bottom-sheet, "historical not forecast" info panel, full loading/empty states — Phase 7.
- Nightly build + auto-deploy + full national dataset — Phase 8.

</deferred>
