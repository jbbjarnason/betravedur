<!-- GSD:project-start source:PROJECT.md -->
## Project

**Betra Veður**

Betra Veður is a static website — a historical counterpart to gottvedur.is. Where gottvedur.is shows where the weather *will be* good in Iceland, Betra Veður shows where it *has been* good: an interactive map of Iceland with weather-station markers displaying multi-year historical averages for a user-selected time-of-year window. It answers the question "I'm free in week 30 — where in Iceland has the weather historically been best?" for Icelanders planning trips.

**Core Value:** A visitor picks a time-of-year period and instantly sees, on a map, where in Iceland the weather has historically been best — backed by real Veðurstofan station history.

### Constraints

- **Architecture**: Fully static site — must be servable from GitHub Pages with no server component
- **Data pipeline**: GitHub Actions nightly cron is the only data-update mechanism — pipeline must be idempotent and append-only
- **Data source**: Veðurstofa Íslands — chosen for real station measurements; availability/terms of their open data may shape what's possible
- **Hosting**: GitHub Pages — free tier; repo size limits matter since historical data is committed to the repo
- **Language**: Icelandic-only UI
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## TL;DR Recommendation
## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **MapLibre GL JS** | 5.24.0 | Interactive vector map of Iceland | Open-source (BSD), no API key, no attribution-to-vendor lock-in. Native PMTiles support via `addProtocol`. This is the same engine class gottvedur.is uses (MapTiler SDK is a MapLibre wrapper), so the target look-and-feel is directly achievable. GPU vector rendering handles smooth pan/zoom and zoom-dependent marker density cleanly. |
| **PMTiles** (`pmtiles` npm + `pmtiles` CLI) | 4.4.1 (JS) | Single-file self-hosted vector basemap served from GitHub Pages via HTTP range requests | Zero server logic, zero vendor account, no secret in the repo — the only basemap option that is *truly* static and free forever. An Iceland extract of the Protomaps daily basemap is small (est. 20–80 MB, see sizing note), well under the 1 GB Pages limit. |
| **Apache ECharts** | 6.1.0 | Station chart panel: candlestick (temp, wind) + bars (rain) in one panel | Candlestick + bar + line are all first-class series types in a single library, so the temp candlesticks, wind candlesticks, and rain bars can share one coherent chart/panel. Canvas rendering is fast for 366-point day-of-year series. À-la-carte imports (`echarts/core` + only the series/components used) keep the bundle at ~80–130 KB gzip instead of the ~340 KB full build. Excellent built-in tooltips/zoom/legend — saves building interaction plumbing by hand. |
| **Vite** | 8.1.5 | Build tool / dev server / bundler | The site is one interactive JS page — no routing, no SSR, no content collections needed. Vite gives fast HMR, tree-shaking, and a trivial `vite build` → `dist/` that drops straight onto GitHub Pages. A framework (Astro/SvelteKit) would add structural overhead for zero benefit on a single-page app. |
| **TypeScript** | 5.x (latest) | Language | Type safety over the observation JSON schema and the map/chart config objects prevents an entire class of runtime bugs; MapLibre, ECharts, and PMTiles all ship first-class types. |
| **Python** | 3.12+ | Nightly data pipeline (fetch + aggregate + write) | The weather/data-science ecosystem (requests/httpx, pandas/polars) makes fetch-aggregate-serialize concise and readable, and `iceweather`/prior art for Veðurstofan is Python. The pipeline runs in Actions, entirely separate from the browser bundle, so language choice here is independent of the frontend. |
### Data Source (the critical dependency)
| Source | Endpoint / Detail | Notes |
|--------|-------------------|-------|
| **Veðurstofa Íslands Weather API** (PRIMARY) | `https://api.vedur.is/weather/` (Swagger UI); spec at `/weather/openapi.json` | OpenAPI 3.1, version **2026-02-17**. **License: CC BY 4.0.** Terms: `https://athuganir.vedur.is/disclaimer`. **No authentication observed** in live testing. |
| Daily AWS observations | `GET /observations/aws/day?station_id=<id>&day_from=YYYY-MM-DD&day_to=YYYY-MM-DD&parameters=basic&format=json` | Fields include `t` (mean temp), `tx`/`tn` (max/min temp), `f`/`fx`/`fg` (mean/max/gust wind m/s), `dv`/`dv_txt` (wind dir deg/text), `r` (precip mm), `count_measurements`. Aggregations: `10min`, `hour`, `day`, `month`, `year`. Formats: `json`, `csv`, `xlsx`. |
| Daily SYNOP observations | `GET /observations/synop/day?station_id=<id>&day_from=...&day_to=...` | Manned stations. Richer fields: `txx`/`tnn` (max/min), `r` + `r_type`, `sun` (sun hours), `n` (cloud oktas). Aggregations: `clock`, `day`, `month`, `year`. |
| Station metadata | `GET /stations?station_id=<id>` (or `?active=true&station_type=sj`, or `?polygon=<WKT>`) | Returns `station`, `name`, `lat`, `lon`, `ele`, `owner`, `start` (year), `ending`. Used to place markers and know each station's history depth. |
| OGC EDR interface | `/rodeo/collections/{10min,hour,day,month,year}/...` | Standards-based (RODEO/EDR) alternative for locations/area/cube queries — useful if you later want spatial-window queries; not required for per-station fetch. |
### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pmtiles` (npm) | 4.4.1 | Registers the `pmtiles://` protocol with MapLibre so the basemap loads from a static `.pmtiles` file | Always (basemap loading) |
| Protomaps basemap styles (`protomaps-themes-base`) | latest | Ready-made MapLibre style JSON (light/dark) matching the Protomaps basemap schema | Gives you the dark-mode toggle from the gottvedur.is reference for free |
| `httpx` (Python) | latest | Async HTTP client for the nightly fetch (parallel per-station requests, retries, timeouts) | Pipeline fetch step |
| `polars` (Python) | latest | Fast aggregation of daily rows → per-station, per-day-of-year climatology | Pipeline aggregation step (pandas is a fine alternative if the team prefers it) |
| `maplibre-gl` CSS | (bundled) | Required map container styles | Always |
### Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| `pmtiles` CLI (Go binary) | Extract an Iceland-only `.pmtiles` from the Protomaps planet build | `pmtiles extract <planet-url> iceland.pmtiles --bbox=-25,63,-13,67 --maxzoom=12`. Run once (or occasionally); commit the output or fetch it in the deploy workflow. Each extra maxzoom level ~doubles size — cap at what the UI needs. |
| GitHub Actions (cron) | Nightly pipeline: fetch → aggregate → commit → deploy | Single workflow: `schedule: cron`, run Python pipeline, `git commit` the updated data, then build (`vite build`) and deploy to Pages. Keep it idempotent + append-only per PROJECT.md constraints. |
| `actions/deploy-pages` + `actions/upload-pages-artifact` | Official Pages deployment from the built `dist/` | Standard modern Pages deploy path (no `gh-pages` branch hackery needed). |
| Playwright (optional) | Smoke-test the map renders and a station chart opens | Cheap safety net for a data-driven UI where a schema drift could silently break rendering. |
## Installation
# Frontend core
# Dev dependencies
# PMTiles CLI (macOS example) — for the one-time Iceland basemap extract
# Python pipeline (in the Actions runner / a venv)
## Alternatives Considered
| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Self-hosted PMTiles basemap | **MapTiler Cloud** (what gottvedur.is uses) | Only if you accept a MapTiler account + API key. Their **Free plan is non-commercial only** and needs a key embedded in the client (a "secret" in a public static site, protected only by HTTP-origin allowlist). PMTiles avoids the account, the key, and the commercial-use question entirely — better fit for the "zero ops, fully static" constraint. |
| Self-hosted PMTiles | **Raster OSM tiles** (tile.openstreetmap.org) | Only for a throwaway prototype. OSM's tile server usage policy forbids heavy/production use without your own tiles, and raster looks worse and can't do smooth vector zoom or a clean dark mode. |
| MapLibre GL JS | **Leaflet 1.9.4** | If you decide vector rendering is overkill and want the simplest possible raster-marker map. But Leaflet + vector needs `protomaps-leaflet`, dark mode is clumsier, and you lose the gottvedur.is-like feel. Not recommended given the reference UI. |
| Apache ECharts | **Lightweight Charts 5.2.0** | If candlesticks were the *only* chart type. It's smaller and purpose-built for OHLC, but it's finance-oriented (assumes time-series price axes), and mixing rain bars + wind candlesticks + custom day-of-year axis fights its design. ECharts' unified model wins for this multi-series panel. |
| Apache ECharts | **uPlot 1.6.32** | If you needed to plot hundreds of thousands of raw points at max speed. Overkill/underkill here: it's bare-bones (no native candlestick series; you'd hand-roll it) and the datasets are small (≤366 points). |
| Vanilla + Vite | **Astro 7.1.1** | If the site grows into multiple content pages (about, methodology, blog) alongside the map. Astro's islands would let the map be an interactive island in otherwise-static pages. Revisit if scope expands beyond one page. |
| Vanilla + Vite | **SvelteKit (static adapter)** | If reactive UI state (period selector ↔ map ↔ chart) gets complex enough to want a component framework. Reasonable future upgrade; unnecessary for v1. |
| Python pipeline | **Node/TypeScript pipeline** | If the team strongly prefers one language across the board (share types between fetch and frontend). Fully viable — the API is plain JSON. Python is recommended only for its data-aggregation ergonomics, not necessity. |
| Precomputed climatology JSON | **Parquet committed to repo** | If raw daily volume grows large and you add a WASM Parquet reader (e.g. hyparquet/DuckDB-WASM) in the browser. Adds client complexity; only worth it if precomputed JSON gets unwieldy. |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **MapTiler free-tier key in the static site** | Non-commercial-only license + embeds a client-side key in a public repo; couples "zero ops" to a third-party account and quota | Self-hosted PMTiles + MapLibre |
| **Legacy `xmlweather.vedur.is` XML API** | Superseded by `api.vedur.is/weather` (JSON, OpenAPI, CC BY 4.0, richer history/aggregation); XML parsing is friction with no upside | `api.vedur.is/weather` REST API |
| **`apis.is` weather proxy** | Third-party middleman over Veðurstofan data — adds an availability dependency and staleness risk when the official first-party API exists | Official `api.vedur.is` directly |
| **Committing raw 10-min / hourly observations to the repo** | Millions of rows would balloon the repo toward the 1 GB Pages limit and slow every clone/deploy | Fetch at `day` aggregation; commit precomputed climatology + a compact append-only daily store |
| **Google Charts / Chart.js for candlesticks** | Chart.js needs a financial plugin and is awkward for OHLC + mixed series; Google Charts is a hosted-script dependency (not static-friendly) | ECharts |
| **Git LFS for the data / basemap** | GitHub Pages does not serve LFS-pointer files as their content, and LFS has separate quotas | Keep files as plain committed blobs under the 1 GB / ~100 MB-per-file thresholds; extract a small PMTiles |
| **Open-Meteo / reanalysis as the primary source** | PROJECT.md explicitly chose real station measurements over reanalysis grids | Veðurstofan API primary; Open-Meteo only as a labeled gap-filler |
## Data Storage & Precomputation Strategy
## Version Compatibility
| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| maplibre-gl 5.24.0 | pmtiles 4.4.x | pmtiles registers via `maplibregl.addProtocol("pmtiles", protocol.tile)` — stable API across pmtiles 3.x/4.x |
| maplibre-gl 5.x | protomaps-themes-base (current) | Themes target the Protomaps basemap v4 tile schema; match theme version to the basemap build you extract |
| echarts 6.1.0 | Vite 8 / ES modules | Use `echarts/core` + `.use([...])` for tree-shaking; full `import * as echarts from "echarts"` also works but is larger |
| Vite 8.1.5 | Node 20+ | Vite 8 requires a modern Node; ensure the Actions build step uses Node 20 or 22 |
| api.vedur.is | schema version header `x-vi-api-version` | Pin/check the API version (2026-02-17 at research time) and add a pipeline assertion on expected fields to catch schema drift |
## Sources
- `https://api.vedur.is/weather/openapi.json` — full OpenAPI 3.1 spec; verified endpoints, aggregation enums, fields, CC BY 4.0 license, version 2026-02-17 (HIGH — authoritative, live)
- Live API calls to `/stations?station_id=1`, `/observations/synop/day`, `/observations/aws/day` — verified no-auth access, field names, and history depth (Keflavík AWS from 2005, Reykjavík start 1920) (HIGH — direct observation)
- `https://community.windy.com/topic/43749/...` — IMO announcement of the observations API, coverage, past-station data (MEDIUM)
- `https://en.vedur.is/climatology/data/` and `https://athuganir.vedur.is/` — bulk/interactive download interface + terms/disclaimer (MEDIUM)
- npm registry (`npm view`) — current versions: maplibre-gl 5.24.0, pmtiles 4.4.1, echarts 6.1.0, lightweight-charts 5.2.0, uplot 1.6.32, vite 8.1.5, astro 7.1.1, leaflet 1.9.4 (HIGH)
- `https://docs.protomaps.com/basemaps/downloads` + `pmtiles extract` docs — self-hosted basemap on static hosting, region extraction, maxzoom→size relationship (HIGH)
- `https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits` — 1 GB site/repo soft limit, 100 GB/mo bandwidth, 10 builds/hr (HIGH)
- `https://www.maptiler.com/terms/cloud/` + pricing — free plan non-commercial, key/origin restrictions (MEDIUM)
- `https://open-meteo.com/en/docs/historical-weather-api` — ERA5 historical fallback back to 1940 (HIGH for existence; MEDIUM as a data-quality-vs-stations judgement)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
