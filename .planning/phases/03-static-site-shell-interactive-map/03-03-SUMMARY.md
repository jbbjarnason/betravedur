---
phase: 03-static-site-shell-interactive-map
plan: 03
subsystem: ui
tags: [maplibre-gl, symbol-layer, collision, queryRenderedFeatures, hybrid-marker, playwright, markerdatum, vitest]

# Dependency graph
requires:
  - phase: 03-static-site-shell-interactive-map
    provides: "Plan 01 map shell (initMap, window.__map seam, muted PMTiles basemap, preview-build E2E harness) + Plan 02 pure data slice (computeMarkerDatum, MarkerDatum, DEFAULT_WINDOW, resolveDerivedFile/loadStations/loadManifest/loadDerived)"
provides:
  - "site/src/map/markers.ts — GeoJSON anchor source + invisible symbol collision layer (text-allow-overlap:false + symbol-sort-key + text-opacity:0) + hybrid queryRenderedFeatures composite renderer into a single reused #marker-overlay (no maplibregl.Marker)"
  - "site/src/styles/markers.css — white-pill callout (accent-red temp only, ink wind arrow+m/s, muted unit/label, muted ófullnægjandi-gögn state, 44px hit area, tabular-nums, reduced-motion, focus-ready skeleton)"
  - "site/src/main.ts — full load→resolve→decode→average→installMarkerLayer→attachCompositeRenderer flow, BASE_URL-prefixed, per-station-guarded (muted on failure, never white-screens)"
  - "site/tests/e2e/markers.spec.ts — preview-build E2E covering UI-SPEC criteria 5,6,7,9,10,11 (all 11 now covered across shell+markers specs)"
affects: [04-period-selector, 05-score-coloring, 06-station-chart-click, 07-mobile-info-panel, deploy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hybrid symbol-collision + DOM composite: MapLibre symbol layer owns placement/collision natively (zoom-adaptive density for free); rich pills drawn ONLY for post-collision queryRenderedFeatures survivors into a single reused overlay — never one DOM node per station (mobile-perf pitfall avoided; grep-gated: new maplibregl.Marker == 0)"
    - "The full datum is serialized into each anchor's feature properties so the composite renderer rebuilds the pill from a query hit — the renderer is decoupled from the data source (a Phase-4 period change just re-sets GeoJSON data + re-runs the idle render)"
    - "Wind convention documented in code: arrow points the direction the wind blows TOWARD; windDir is compass degrees (0=N, clockwise), SVG rotate about glyph centre"
    - "Color never the sole channel: ° glyph, m/s unit, arrow shape, drop shape each carry meaning; accent red reserved to the temp numeral only (markers.css single var(--accent) site)"
    - "Per-station defensive load: a missing manifest entry or malformed/failed derived fetch degrades THAT station to a muted callout (Promise.all island isolation) — the map never white-screens on one bad file (T-03-06)"

key-files:
  created:
    - site/src/map/markers.ts
    - site/src/map/markers.test.ts
    - site/src/styles/markers.css
    - site/tests/e2e/markers.spec.ts
  modified:
    - site/src/main.ts

key-decisions:
  - "Symbol layer is a pure invisible collision PROXY (text-opacity:0, text-field=label footprint); the visible figure is a DOM pill overlay drawn on idle/move — the RESEARCH Pattern 3 hybrid, chosen so the composite (temp+arrow+speed+precip) can be rich while placement stays GPU-native"
  - "Insufficient stations are EMITTED muted, never filtered — the map is honest (ófullnægjandi gögn) rather than silently dropping stations (criterion 11)"
  - "Composite pills are <button> focus-ready skeletons with data-station ids and tabIndex=-1, NO click handler this phase (Phase-6 click seam) — pointer-events re-enabled on the 44px hit area only"
  - "Overlay redraw is a single replaceChildren pass per idle/move — bounded survivor set, no stale-pill accumulation across moves (T-03-07)"

patterns-established:
  - "Pattern: hybrid marker rendering — symbol layer for collision/density, queryRenderedFeatures survivor loop for the composite; the canonical anti-DOM-overload recipe for the rest of the marker-driven phases"
  - "Pattern: markers.css keeps accent red to exactly one selector (.marker-temp) so Phase-5 score coloring can add a separate scale without colliding with temperature red"

requirements-completed: [MAP-02, MAP-04]

# Metrics
duration: 7min
completed: 2026-07-20
---

# Phase 3 Plan 03: Station Markers (symbol-collision + hybrid composite) Summary

**Hybrid MapLibre marker system — an invisible symbol layer owns native zoom-adaptive collision (text-allow-overlap:false + symbol-sort-key) while rich white-pill callouts (accent-red temp, rotated wind arrow + m/s or "breytileg átt", precip drop omitted for "án úrkomu", muted "ófullnægjandi gögn") are drawn only for the post-collision queryRenderedFeatures survivors into a single reused overlay — wired end-to-end in main.ts and locked by the full 11-criterion UI-SPEC E2E suite on the preview build.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-07-20T08:55:32Z
- **Completed:** 2026-07-20T09:02:13Z
- **Tasks:** 2 (Task 1 TDD: RED → GREEN; Task 2 auto)
- **Files modified:** 5 (4 created + 1 modified)

## Accomplishments

- **Symbol-collision + hybrid composite (Task 1):** `installMarkerLayer` adds a GeoJSON `stations` source and an invisible `station-anchors` symbol layer (`text-allow-overlap:false`, `symbol-sort-key:["get","priority"]`, `text-optional:true`, `text-opacity:0`) — MapLibre's native collision gives MAP-04 zoom-adaptive density for free. `renderComposite` queries the post-collision survivors via `queryRenderedFeatures`, dedupes by station id, and draws one focus-ready white pill per survivor into a single reused `#marker-overlay`. **`new maplibregl.Marker` count == 0** (grep-gated) — no DOM-marker overload.
- **Rich composite per UI-SPEC:** `formatCallout` renders accent-red temp (`11°`), a rotated inline-SVG wind arrow + integer `m/s` for concrete directions OR the muted `breytileg átt` label (keeping scalar speed), a precip drop glyph present iff `hasPrecip` (omitted for "án úrkomu"), and a muted `ófullnægjandi gögn` callout with no red/arrow when `!sufficient`. Pure helpers unit-tested (12 tests).
- **Wired flow (Task 2):** `main.ts` runs `loadStations` + `loadManifest` → `resolveDerivedFile` → `loadDerived` → `computeMarkerDatum(DEFAULT_WINDOW)` → `installMarkerLayer` → `attachCompositeRenderer`, all `BASE_URL`-prefixed. Each station is guarded independently (Promise.all island isolation): a missing/malformed/failed file degrades that one station to a muted datum — the shell never white-screens.
- **Full 11-criterion acceptance suite green on the preview build:** 12 E2E tests (7 markers + 5 shell) pass — markers cover criteria 5,6,7,9,10,11; shell covers 1–4,8,9. Density criterion 10 asserts ≤25 visible callouts AND no pill fully contained within another; criterion 11 asserts zero uncaught page errors + canvas present.
- **No regressions:** full repo unit suite 20 files / 174 passed / 3 pre-existing skips (up from 19/162 — the +12 marker-helper tests).

## Visual Evidence (auto-inspected, no-review directive)

Two production-preview screenshots captured and inspected (saved under `evidence/`):

- **`03-03-markers-zoom6.png` (zoom 6, whole island):** Both committed-sample pills render at the SW corner. Reykjavík #1 shows `11°` (red) + `breytileg átt` + `4 m/s` + precip drop; Keflavík #1350 shows `11°` (red) + rotated arrow + `5 m/s` and **no drop** (the AWS "án úrkomu" case). Temperature red reads as the figure over the muted `#E8EBED` basemap. The two nearby pills are slightly stacked-but-legible — both numerals and labels readable, neither fully overlapping.
- **`03-03-markers-zoomed.png` (fitBounds on the two SW stations):** Both pills fully separate and clearly legible — Reykjavík by the city (`11°` breytileg átt 4 m/s + drop), Keflavík at the airport (`11°` ◄ 5 m/s, no drop). **Judgement: markers are legible and non-overlapping at both zoom levels; density adapts to zoom** (the pills separate as you zoom in, and the collision layer keeps anchors decluttered). The án-úrkomu omission, breytileg-átt label, rotated arrow, and accent-red temp are all visually confirmed.

## Task Commits

1. **Task 1 (TDD RED): failing marker-helper tests** — `d86f6fb` (test)
2. **Task 1 (TDD GREEN): symbol-collision layer + hybrid composite renderer + markers.css** — `86a2a6a` (feat)
3. **Task 2: wire main.ts + full marker E2E suite** — `ac0a7eb` (feat)
4. **Evidence screenshots (self-inspected)** — `4b43207` (docs)

**Plan metadata:** _(final docs commit — this SUMMARY + STATE + ROADMAP + REQUIREMENTS)_

_Note: no REFACTOR commit needed — the one faulty test regex (nested-span m/s markup) was corrected before the GREEN commit landed; it was a test assertion error, not a code change._

## Files Created/Modified

- `site/src/map/markers.ts` — `toFeatureCollection` (GeoJSON anchors: label proxy + serialized datum + priority), `formatCallout` (composite HTML + muted flag), `installMarkerLayer` (invisible symbol collision layer), `renderComposite` (survivor-only pill draw into reused overlay), `attachCompositeRenderer` (idle/move wiring). Wind convention + hybrid rationale documented in code.
- `site/src/map/markers.test.ts` — 12 Vitest unit tests pinning the shape/label formatting and the án-úrkomu / breytileg-átt / ófullnægjandi-gögn / accent-red-temp contracts.
- `site/src/styles/markers.css` — white pill styling, accent red on `.marker-temp` only, ink arrow + muted unit/label, muted-empty state, 44px hit area, `font-variant-numeric: tabular-nums`, `prefers-reduced-motion` respected, `:focus-visible` skeleton.
- `site/src/main.ts` — the wired marker flow (was a documented seam); per-station-guarded `loadMarkerData`, `mutedDatum` fallback, `wireMarkers` on style-load.
- `site/tests/e2e/markers.spec.ts` — 7 preview-build E2E tests (criteria 5,6,7,9,10,11 + evidence capture) reading `#marker-overlay [data-station]` pills; `pageerror` handler fails on any uncaught page error.

## Decisions Made

- **Hybrid over pure symbol layer:** a symbol layer alone can't render the temp+arrow+speed+precip composite richly, so the symbol layer is a pure invisible collision proxy and the DOM overlay draws the figure — exactly the RESEARCH Pattern-3 fallback the plan sanctioned.
- **Datum serialized into feature properties:** `renderComposite` rebuilds each pill from `JSON.parse(feature.properties.datum)`, keeping the renderer decoupled from the loader (Phase-4 period change = re-set data + re-render).
- **Insufficient stations emitted muted, not filtered** (honesty; criterion 11) — plus a `mutedDatum` fallback so even a station whose file can't be resolved/decoded still appears muted rather than vanishing.
- **Pills are `<button>` focus-ready skeletons** (`data-station`, `tabIndex=-1`, no handler) — the Phase-6 click seam is in place with no behavior wired this phase.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Avoided the `GeoJSON` global namespace in the source cast (tsc clean under `types:["vite/client"]`)**
- **Found during:** Task 1 (GREEN, post-implementation typecheck)
- **Issue:** `site/tsconfig.json` restricts loaded types to `["vite/client"]`, so the ambient `@types/geojson` `GeoJSON.FeatureCollection` namespace (a transitive maplibre dep) was unresolved — `tsc` errored on the source/setData casts.
- **Fix:** Cast via maplibre's own exported types instead of the global — `maplibregl.GeoJSONSourceSpecification["data"]` for `addSource` and `Parameters<GeoJSONSource["setData"]>[0]` for `setData`. No `@types` change, no behavior change.
- **Files modified:** `site/src/map/markers.ts`
- **Verification:** `tsc -p site/tsconfig.json --noEmit` clean; `vite build` succeeds; E2E green.
- **Committed in:** `86a2a6a` (Task 1 GREEN commit)

**2. [Rule 1 - Bug] Corrected a too-strict unit-test regex (test-only)**
- **Found during:** Task 1 (GREEN test run)
- **Issue:** One assertion expected `4` and `m/s` to be adjacent, but the (correct) markup nests the unit in a span (`4<span class="marker-unit">&nbsp;m/s</span>`), so the numeral and unit are separated by markup. The implementation was right; the test regex was wrong.
- **Fix:** Split the assertion into `toContain(">4<")` (numeral) + `toMatch(/m\/s/)` (unit) to match the real nested-span structure.
- **Files modified:** `site/src/map/markers.test.ts`
- **Verification:** 12/12 marker-helper tests pass.
- **Committed in:** `86a2a6a` (folded into the Task 1 GREEN commit before it landed)

**3. [Rule 1 - Bug] Reframed the zoomed evidence screenshot onto the actual stations**
- **Found during:** Task 2 (evidence capture, self-inspection)
- **Issue:** The first zoomed shot (`setCenter([-22.3,64.05]) setZoom(9)`) framed inland (Þórisvatn) where the SW-corner sample stations fall outside the viewport — the screenshot showed no pills, undermining the density/legibility judgement.
- **Fix:** Switched the evidence capture to `fitBounds([[-22.7,63.9],[-21.8,64.2]])` + wait-for-pills, so the zoomed shot actually frames both survivor pills.
- **Files modified:** `site/tests/e2e/markers.spec.ts`
- **Verification:** Re-ran the evidence test; `03-03-markers-zoomed.png` now shows both fully-separated pills; full suite still 12/12.
- **Committed in:** `ac0a7eb` (Task 2 commit) + evidence in `4b43207`

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 bug — one test-only, one evidence-quality).
**Impact on plan:** All necessary for a clean typecheck / accurate tests / honest evidence. No scope creep, no change to shipped marker behavior.

## Issues Encountered

- The plan's verify command referenced `site/src/map/markers.test.ts`; the co-located `site/src/**/*.test.ts` vitest include from Plan 02 already covered it, so no config change was needed (unlike Plan 02's blocking include fix).
- The zoomed-in evidence framing needed two iterations (see Deviation 3) — a screenshot-composition nuance, not a functional defect; criterion 9 (zoom-adaptive) had already passed programmatically.

## User Setup Required

None — no external services, secrets, or API keys. The markers render entirely offline from the committed static sample.

## Threat Surface Scan

No new security-relevant surface introduced. The threat-model mitigations (T-03-06 missing-datum muted, T-03-07 DOM-overload via symbol-collision + single overlay + grep gate, T-03-08 color-not-sole-channel) are all implemented and asserted (E2E criterion 11 + grep gate + single `var(--accent)` site). No threat flags.

## Next Phase Readiness

- **Phase 4 (period selector):** the renderer is decoupled from the data source — a period change just re-runs `loadMarkerData` with a different `WindowSpec`, calls `installMarkerLayer` (which `setData`s the existing source), and the attached idle/move renderer redraws. `DEFAULT_WINDOW` is the single swap point.
- **Phase 5 (score coloring):** `markers.css` reserves accent red to exactly `.marker-temp`, leaving the pill surface free for a separate score scale that won't collide with temperature red.
- **Phase 6 (click-to-open chart):** each pill is a `<button data-station>` focus-ready skeleton with `tabIndex=-1` and pointer-events on its 44px hit area — a click handler + focus ring drop in without restructuring.
- **Phase 3 goal met:** MAP-02 (markers show period averages) and MAP-04 (zoom-adaptive density) delivered; all 11 UI-SPEC acceptance criteria green on the production preview build.
- No new blockers. Pre-existing Phase-1 gates (Veðurstofan redistribution terms; sunshine/cloud coverage) are unrelated to this rendering slice.

## Self-Check: PASSED

All four created files + the modified `main.ts` verified present; all four task commits (`d86f6fb`, `86a2a6a`, `ac0a7eb`, `4b43207`) found in git history. Grep gates confirmed: `text-allow-overlap` / `symbol-sort-key` / `text-opacity:0` present in markers.ts, `new maplibregl.Marker` count == 0, single `var(--accent)` site in markers.css. Full E2E suite 12/12 green on preview build; full repo unit suite 174 passed / 3 skipped. Both evidence screenshots present and self-inspected.

## TDD Gate Compliance

Task 1 (`tdd="true"`) followed RED → GREEN: `d86f6fb` (test — RED, module missing → "Cannot find module './markers.js'") precedes `86a2a6a` (feat — GREEN, 12/12). No REFACTOR commit needed (implementation clean; the faulty test regex and the two tsc casts were folded into GREEN before it landed).

---
*Phase: 03-static-site-shell-interactive-map*
*Completed: 2026-07-20*
