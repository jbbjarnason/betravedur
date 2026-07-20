---
phase: 03-static-site-shell-interactive-map
plan: 01
subsystem: ui
tags: [vite, typescript, maplibre-gl, pmtiles, protomaps-basemaps, playwright, github-pages]

# Dependency graph
requires:
  - phase: 01-walking-skeleton
    provides: "@betravedur/domain ATTRIBUTION constant (CC BY 4.0), window/wind/coverage math, decodeDerived codec"
  - phase: 02-data-pipeline
    provides: "committed derived sample (stations.json, manifest.json, derived/{1,1350}.<hash>.json) on the data branch"
provides:
  - "site/ Vite+TS workspace that builds a deployable dist/ honoring the /betravedur/ GitHub Pages base path"
  - "self-hosted iceland.pmtiles basemap (maxzoom 9, 7.3 MiB) committed to public/ — no API keys"
  - "MapLibre map of Iceland (muted #E8EBED basemap) with Icelandic header/slogan + CC BY 4.0 attribution"
  - "real Phase-2 derived sample copied into public/data/ so the site builds standalone"
  - "Playwright E2E shell suite gating the production preview build (Vite×MapLibre A1 worker risk pinned)"
affects: [03-02, 03-03, markers, period-selector, score-coloring, station-chart, deploy]

# Tech tracking
tech-stack:
  added: [maplibre-gl@5.24.0, pmtiles@4.4.1, "@protomaps/basemaps@5.7.2", vite@8.1.5, "@playwright/test@1.61.1", go-pmtiles@v1.31.1]
  patterns:
    - "Namespace maplibre import (import * as maplibregl) — default import breaks Vite dev on 5.x"
    - "Vite base '/betravedur/' + import.meta.env.BASE_URL for runtime pmtiles:// and fetch strings"
    - "Attribution sourced from domain ATTRIBUTION constant, never hardcoded (CC BY 4.0 compliance)"
    - "Grayscale basemap muted via pure paint override toward --dominant #E8EBED (no style fork)"
    - "E2E drives the production preview build (vite build && vite preview), not the dev server"

key-files:
  created:
    - site/package.json
    - site/vite.config.ts
    - site/playwright.config.ts
    - site/tsconfig.json
    - site/index.html
    - site/src/main.ts
    - site/src/map/init.ts
    - site/src/map/style.ts
    - site/src/ui/header.ts
    - site/src/ui/attribution.ts
    - site/src/styles/tokens.css
    - site/scripts/copy-sample-data.ts
    - site/tests/e2e/shell.spec.ts
    - site/public/iceland.pmtiles
    - site/README.md
  modified:
    - package.json
    - .gitignore

key-decisions:
  - "PMTiles extracted at maxzoom=9 from the 20260719 daily planet build: 7,675,569 bytes (7.3 MiB) — no need to fall back to maxzoom=8 (budget was ~30MB)"
  - "go-pmtiles installed via `go install github.com/protomaps/go-pmtiles@v1.31.1` (go 1.26 present); binary is named `go-pmtiles`"
  - "Basemap muted via a pure paint override on background/water/earth/landcover fills toward #E8EBED — no style fork"
  - "window.__map exposed for E2E interactivity assertions and as the Plan 02/03 marker seam"

patterns-established:
  - "Preview-build E2E gate: Playwright webServer runs `vite build && vite preview --port 4173` so the A1 worker risk is caught in production, not dev"
  - "BASE_URL-prefixed pmtiles:// URL written verbatim so Vite statically replaces it"
  - "copy-sample-data.ts pulls committed sample from the data branch via `git show data:<path>` (never merges the branch)"

requirements-completed: [MAP-01, UX-01, SITE-01]

# Metrics
duration: 12min
completed: 2026-07-20
---

# Phase 3 Plan 01: Static Site Shell & Interactive Map Summary

**Deployable Vite+TS `site/` workspace rendering a muted Iceland MapLibre map from a self-hosted 7.3 MiB PMTiles basemap (no API keys), with the Icelandic wordmark/slogan header and domain-sourced CC BY 4.0 attribution, gated by a green preview-build Playwright E2E suite.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-20T08:34Z
- **Completed:** 2026-07-20T08:41Z
- **Tasks:** 2 (Task 2 is TDD: RED test → GREEN feat)
- **Files modified:** 17 (15 created + 2 modified)

## Accomplishments

- Stood up the `@betravedur/site` Vite+TS workspace (added to root `workspaces`); `npm install` resolves it cleanly and `vite build` emits a `dist/` with `/betravedur/` base-path asset URLs.
- Extracted and committed a self-hosted Iceland basemap: `site/public/iceland.pmtiles`, **maxzoom 9, 7,675,569 bytes (7.3 MiB)** — an order of magnitude under the ~30MB budget and the Pages 100MB/file limit. `pmtiles show` confirms bounds `(-26,62.5)–(-12,67.5)` matching the map `maxBounds`.
- Rendered a full-bleed MapLibre map of Iceland from the `pmtiles://` protocol with **zero API keys** anywhere in the bundle, muted toward `--dominant #E8EBED`, framed at center `[-19,65]` / zoom 6.
- Built the Icelandic header (wordmark `Betra Veður` + slogan `Leitin að betra veðri`, verbatim) and a CC BY 4.0 / OSM / Protomaps attribution control sourced from the domain `ATTRIBUTION` constant.
- Copied the real Phase-2 derived sample (Reykjavík #1 + Keflavík #1350 + `stations.json` + `manifest.json`) into `public/data/` so the site is standalone-deployable.
- Green preview-build Playwright E2E shell suite (5 tests, UI-SPEC criteria 1–4, 8–9) pins the Vite×MapLibre A1 worker risk.

## Visual Evidence (auto-inspected, no-review directive)

A production-preview screenshot was captured and inspected (`evidence/03-01-map-shell.png`, zoom 6, center -19/65):

- **Basemap muted:** yes — land and sea both resolve to a uniform muted slate `#E8EBED`; no bright template blue. The paint override took effect.
- **Iceland framed:** yes — the whole island is centered at zoom 6; all major towns (Reykjavík, Keflavík, Akureyri, Ísafjörður, Egilsstaðir, Höfn, Selfoss, Sauðárkrókur) and Icelandic bay names (Faxaflói, Breiðafjörður) render.
- **Header/slogan:** yes — semi-opaque floating header with `Betra Veður` (ink, semibold) + `Leitin að betra veðri` (muted) and a hairline bottom border.
- **Attribution:** yes — expanded control reads `© OpenStreetMap · Protomaps | Uppruni gagna: Veðurstofa Íslands … CC BY 4.0 … © OpenStreetMap contributors · Protomaps`.
- Minor note: grayscale-flavor place labels sit somewhat prominent over the muted land; acceptable for this shell phase — the Plan 02/03 white marker callouts will become the figure.

## Task Commits

1. **Task 1: Scaffold site/ workspace, Playwright config, PMTiles extract, sample data** — `ba57d30` (feat)
2. **Task 2 (TDD RED): failing E2E shell spec** — `6f8a64d` (test)
3. **Task 2 (TDD GREEN): map init + header + attribution shell** — `b1242d2` (feat, includes Rule 3 fixes)

**Plan metadata:** _(final docs commit — this SUMMARY + STATE + ROADMAP + REQUIREMENTS)_

## Files Created/Modified

- `package.json` — added `site` to `workspaces`
- `.gitignore` — ignore Playwright `test-results/`, `playwright-report/`
- `site/package.json` — `@betravedur/site`; maplibre/pmtiles/basemaps + domain/pipeline deps; dev/build/preview/e2e/copy-data scripts
- `site/vite.config.ts` — `base: "/betravedur/"`, `build.target es2023`
- `site/playwright.config.ts` — webServer runs `vite build && vite preview --port 4173`; `baseURL` includes `/betravedur/`; single Chromium project
- `site/tsconfig.json` — extends base; `lib` includes `dom`; `types: ["vite/client"]`
- `site/index.html` — `#map` base layer + `<header>` mount; `lang="is"`
- `site/src/main.ts` — boot; exposes `window.__map`; documented Plan 02/03 marker seam
- `site/src/map/init.ts` — namespace maplibre import, pmtiles protocol, Iceland framing, AttributionControl
- `site/src/map/style.ts` — grayscale layers muted toward `#E8EBED` (pure paint edit), BASE_URL-prefixed pmtiles source
- `site/src/ui/header.ts` — wordmark + slogan (verbatim Icelandic copy)
- `site/src/ui/attribution.ts` — attribution HTML built from domain `ATTRIBUTION`
- `site/src/styles/tokens.css` — UI-SPEC color/spacing/typography tokens + layout
- `site/scripts/copy-sample-data.ts` — idempotent copy from the `data` branch
- `site/tests/e2e/shell.spec.ts` — 5 preview-build E2E tests
- `site/public/iceland.pmtiles` — committed basemap (7.3 MiB)
- `site/public/data/*` — copied real sample
- `site/README.md` — base path, extract build step + measured size, interim-sample note

## Decisions Made

- **maxzoom=9 for the extract.** The maxzoom-9 file is 7.3 MiB — far below the ~30MB threshold that would have triggered a maxzoom-8 re-extract. MapLibre overzooms basemap tiles to the map's maxZoom 12, so the small extract still reads cleanly.
- **go install over brew.** `go` 1.26 was present, so `go install github.com/protomaps/go-pmtiles@v1.31.1` was used (binary named `go-pmtiles`), avoiding a brew tap.
- **Muted basemap via paint override, not overlay.** Overriding `background-color`/`fill-color` on background/water/earth/landcover layers toward `#E8EBED` keeps labels legible while receding the land/sea — a pure style edit (no fork).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `dom` lib + tightened style typing so `tsc` is clean**
- **Found during:** Task 2 (GREEN, post-build typecheck)
- **Issue:** The base `tsconfig` `lib` is `["es2023"]` only, so `document`/`window`/`HTMLElement` were unresolved in the browser code; separately, mapping over `LayerSpecification[]` with a spread `paint` narrowed the union so TS rejected the reassembled array.
- **Fix:** Added `"lib": ["es2023", "dom", "dom.iterable"]` to `site/tsconfig.json`; typed the `muteToDominant` map callback return as `LayerSpecification` and dropped a dead `id === "background"` branch (background is handled by the earlier `layer.type === "background"` case).
- **Files modified:** `site/tsconfig.json`, `site/src/map/style.ts`
- **Verification:** `tsc -p site/tsconfig.json --noEmit` clean; `vite build` succeeds; all 5 E2E still pass.
- **Committed in:** `b1242d2` (Task 2 GREEN commit)

**2. [Rule 3 - Blocking] Gitignore Playwright output**
- **Found during:** Task 2 (after first E2E run)
- **Issue:** Playwright wrote `site/test-results/` into the working tree (generated output, not source).
- **Fix:** Added `test-results/`, `playwright-report/`, `.playwright/` to `.gitignore`.
- **Files modified:** `.gitignore`
- **Verification:** `git status` no longer surfaces the generated directory.
- **Committed in:** `b1242d2`

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking).
**Impact on plan:** Both fixes were required for a clean typecheck / clean tree; no scope creep, no behavior change to the shipped bundle.

## Issues Encountered

- The `go install` output binary is named `go-pmtiles` (not `pmtiles`); the extract command was invoked with the full path `$(go env GOPATH)/bin/go-pmtiles`.
- The one-off screenshot script could not `import "@playwright/test"` from `/tmp` (module resolution); it was run from inside the repo tree so node's resolver found `node_modules`.
- Rolldown/Vite emits a "chunk larger than 500 kB" warning (MapLibre is ~1 MB). Left as-is — code-splitting the map engine is out of scope for a single-page shell and does not affect correctness or the no-key guarantee.

## User Setup Required

None — no external service configuration, no secrets, no API keys. The basemap and sample data are committed static blobs.

## Next Phase Readiness

- **Ready for Plans 02/03 (markers):** `window.__map` and the documented `main.ts` seam are in place; `public/data/` carries the real sample; `@betravedur/pipeline/derive` + `@betravedur/domain` are available for the fetch→decode→average→marker pipeline.
- **A1 risk pinned:** maplibre-gl 5.24.0 × Vite 8.1.5 is clean on the production preview build (no worker breakage) — the E2E gate will catch any regression.
- **Deploy (Phase 8):** the `dist/` base path is correct for GitHub project Pages; the full national dataset replaces the interim SW-corner sample then.
- No new blockers. The pre-existing Phase-1 gates (Veðurstofan redistribution terms; sunshine/cloud coverage) are unrelated to this static-shell plan.

## Self-Check: PASSED

All key created files verified present (site config, iceland.pmtiles, map init, attribution, E2E spec, sample data, SUMMARY). All three task commits (`ba57d30`, `6f8a64d`, `b1242d2`) found in git history.

## TDD Gate Compliance

Task 2 (`tdd="true"`) followed RED → GREEN: `6f8a64d` (test — RED, build failed with no source) precedes `b1242d2` (feat — GREEN, 5/5 E2E pass). No REFACTOR commit needed (implementation was clean; the two Rule 3 fixes folded into GREEN before commit).

---
*Phase: 03-static-site-shell-interactive-map*
*Completed: 2026-07-20*
