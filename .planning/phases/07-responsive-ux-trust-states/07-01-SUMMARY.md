---
phase: 07-responsive-ux-trust-states
plan: 01
subsystem: ui
tags: [trust-states, ux-05, freshness, bottom-sheet, playwright, vitest, maplibre, aria-live]

requires:
  - phase: 03-map-shell
    provides: initMap + compact AttributionControl + the silent map-error console.error seam
  - phase: 06-station-chart-panel
    provides: main.ts boot/install first-paint + catch seams; stationPanel.ts formatIce is-IS discipline
provides:
  - "freshness.ts client-side newestDataDate (max lastFetched) + formatIcelandicDate (hand-rolled IS_MONTHS, UTC, null-tolerant)"
  - "bottomSheet.ts MOBILE_QUERY 640px constant + pure snapNearest + typed attachSheet stub for Plan 03"
  - "states.ts loading/map-error/empty-stations renderers + shared aria-live announcer"
  - "trust.css .bv-state glass-surface overlay family (no accent/score/chart tokens)"
  - "Three wired UX-05 seams: map.on('error') in init.ts, showLoading/hideLoading/showEmptyState in main.ts"
  - "Wave-0 E2E harness: states.spec (active), responsive.spec + info.spec (smoke + fixmes)"
affects: [07-02-info-panel, 07-03-bottom-sheet, phase-8-nightly-manifest-generatedAt]

tech-stack:
  added: []
  patterns:
    - "Client-side freshness derivation from manifest max(lastFetched) — NO pipeline/manifest change, NO top-level generatedAt (preserves Phase-2 byte-identical determinism)"
    - "Hand-rolled Icelandic month array over Intl is-IS (mirrors stationPanel.ts formatIce comma-decimal discipline — headless ICU fallback)"
    - "One reused z30 overlay host + visually-hidden aria-live region; only one trust state shows at a time (loading → markers/empty/error)"
    - "Caller-owned Icelandic copy: states.ts holds only the `hleð…` token; error/empty copy passed in from UI-SPEC strings (T-07-01: raw error logged, never rendered)"
    - "Wave-0 skeleton convention: active tests for THIS plan's criteria + test.fixme placeholders (exact selectors) for downstream-plan criteria"

key-files:
  created:
    - site/src/data/freshness.ts
    - site/src/data/freshness.test.ts
    - site/src/ui/bottomSheet.ts
    - site/src/ui/bottomSheet.test.ts
    - site/src/ui/states.ts
    - site/src/styles/trust.css
    - site/tests/e2e/states.spec.ts
    - site/tests/e2e/responsive.spec.ts
    - site/tests/e2e/info.spec.ts
  modified:
    - site/src/map/init.ts
    - site/src/main.ts

key-decisions:
  - "Freshness derived client-side (max lastFetched), NOT a top-level manifest generatedAt — avoids breaking Phase-2 manifest byte-identity determinism; Phase 8 may still add generatedAt as an optional field"
  - "stationCount (raw stations.json length) drives the empty-stations gate, distinct from entries.length (which is 0 even when every station is merely muted — a different, already-handled honest state)"
  - "install() catch surfaces showEmptyState as the default data-load-failure affordance (never re-throws, never white-screens); map-error copy is reserved for the MapLibre error event seam only"
  - "hideLoading removes ONLY the loading node, so a concurrent map-error alert from init.ts survives the post-first-paint hideLoading"

patterns-established:
  - "Trust-state overlays: .bv-state class family, createElement+textContent only, reduced-motion aware, glass surface identical to header/bar/legend/panel"
  - "Two distinct UX-05 seams kept separate (RESEARCH Pitfall 5): map-load-error (init.ts map.on error) vs data-load/empty (main.ts install)"

requirements-completed: [UX-05, UX-04]

duration: 8min
completed: 2026-07-20
---

# Phase 7 Plan 01: Responsive UX & Trust-States Foundation Summary

**Client-side freshness + bottom-sheet snap-math pure helpers (TDD), the three distinct UX-05 state seams (initial `hleð…` loading / MapLibre map-load-error alert / empty-stations overlay) wired at the exact init.ts/main.ts seams, and the Wave-0 Playwright harness (states active, responsive/info skeletons).**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-20T19:38:59Z
- **Completed:** 2026-07-20T19:47:14Z
- **Tasks:** 3 (Task 1 is TDD: RED + GREEN)
- **Files created:** 9
- **Files modified:** 2

## Accomplishments

- **freshness.ts** — `newestDataDate(manifest)` returns the chronologically-latest `lastFetched` across `manifest.stations` (ISO strings sort lexicographically = chronologically; no parse), tolerant of empty/missing/malformed (`null`, never a bogus date). `formatIcelandicDate(iso)` renders `"20. júlí 2026"` via UTC getters + a hand-rolled 12-element Icelandic month array (never Intl is-IS), returning `null` on invalid input (never "Invalid Date"). **No pipeline/manifest change** — freshness is derived client-side, preserving Phase-2 manifest determinism.
- **bottomSheet.ts** — `MOBILE_QUERY = "(max-width: 640px)"` (the single 640px source of truth, byte-identical to the CSS `@media`), pure `snapNearest` (ties resolve to `expandedY` — prefer the more-open snap), and a typed `attachSheet` no-op stub so Plan 03 fills the Pointer-Events drag body without an import churn. Both helpers unit-tested (18/18 green).
- **Three UX-05 seams wired with distinct Icelandic copy:** (1) `init.ts` `map.on("error")` → `showMapError("Ekki tókst að hlaða kortið", "Reyndu að hlaða síðunni aftur.")` (role=alert, header stays up) — replaces the silent Phase-3 `console.error`; (2) `main.ts` `showLoading()` before paint + `hideLoading()` after the first `renderForState`; (3) `stations.length === 0` and the `install()` catch → `showEmptyState("Engar veðurstöðvar", …)` over the still-rendered basemap.
- **states.ts + trust.css** — one reused z30 overlay host + a shared aria-live region; `.bv-state` glass-surface family with NO accent/score/chart tokens, reduced-motion aware.
- **Wave-0 E2E harness** — `states.spec` (4 ACTIVE tests: loading present-then-gone, map-error via route-abort pmtiles, empty via route-fulfill `[]` + a 404 catch-path variant); `responsive.spec` + `info.spec` boot-smoke + `test.fixme` placeholders encoding every remaining UI-SPEC criterion with exact selectors/strings.

## Task Commits

1. **Task 1 RED: failing freshness + bottomSheet tests** — `002a6a6` (test)
2. **Task 1 GREEN: freshness + bottomSheet implementation** — `c602f1f` (feat)
3. **Task 2: UX-05 state renderers + trust.css + wire the three seams** — `cf32df5` (feat)
4. **Task 3: Wave-0 E2E skeletons (states active + responsive/info fixmes)** — `f924205` (test)

_Task 1 followed RED→GREEN (no refactor needed — implementations were minimal and clean)._

## Files Created/Modified

- `site/src/data/freshness.ts` — client-side `newestDataDate` + `formatIcelandicDate` (hand-rolled IS_MONTHS, UTC, null-tolerant)
- `site/src/data/freshness.test.ts` — 12 cases (max-of-N, empty/missing/malformed → null; Icelandic date, UTC boundary, invalid → null)
- `site/src/ui/bottomSheet.ts` — `MOBILE_QUERY`, `snapNearest`, typed `attachSheet` stub
- `site/src/ui/bottomSheet.test.ts` — 6 cases (breakpoint constant, nearest/tie math, stub teardown)
- `site/src/ui/states.ts` — `showLoading`/`hideLoading`/`showMapError`/`showEmptyState` + aria-live announcer (createElement+textContent, no innerHTML)
- `site/src/styles/trust.css` — `.bv-state` overlay family (glass surface, no accent/score/chart tokens, reduced-motion aware)
- `site/tests/e2e/states.spec.ts` — ACTIVE UX-05 criteria 13/14/15 (+404 variant)
- `site/tests/e2e/responsive.spec.ts` — 1280 boot smoke + fixmes (criteria 1-5, 10-12)
- `site/tests/e2e/info.spec.ts` — boot smoke + fixmes (criteria 6-9, 18)
- `site/src/map/init.ts` — added `map.on("error")` → `showMapError` (replaces silent console.error)
- `site/src/main.ts` — import trust.css + states; `showLoading()` in boot; `hideLoading()` after first paint; `showEmptyState` on `[]`/catch; `stationCount` added to `loadStationFiles` return

## Decisions Made

- **Freshness is client-side, not a manifest field.** Adding an always-current top-level `generatedAt` would break the Phase-2 byte-identical manifest determinism the pipeline tests pin. `newestDataDate` reads the existing per-station `lastFetched` instead. Phase 8 may still introduce an optional `generatedAt`; the info panel (Plan 02) can prefer it and fall back to this helper.
- **`stationCount` (raw stations.json length) drives the empty gate**, distinct from `entries.length` (0 when every station is merely muted — an already-honest state the map handles). Only a genuinely empty set shows "Engar veðurstöðvar".
- **`hideLoading` clears only the loading node** so a map-error alert raised concurrently by `init.ts` (the map `error` event can fire before/around first paint) is not wiped by the post-first-paint `hideLoading`.

## Deviations from Plan

None - plan executed exactly as written.

The only judgment call worth noting (not a plan deviation): the plan's Task-2 grep gate `! grep -Eq "--accent|--score-|--chart-" src/styles/trust.css` initially tripped on a *comment* in trust.css that named those tokens in prose. The comment was rephrased to describe the same intent without the literal token strings, so the automated gate reflects the real invariant (no token *references*). No behavioral change.

## Issues Encountered

None. RED failed as expected (modules not found), GREEN passed on first implementation, all E2E and unit suites green on the first full run.

## User Setup Required

None - no external service configuration required.

## Verification Evidence

- `cd site && npx vitest run freshness bottomSheet` → 18/18 pass
- `cd site && npx tsc --noEmit -p .` → 0 errors
- Task-2 grep gates: `map.on("error"` present in init.ts; `showLoading`/`hideLoading`/`showEmptyState` present in main.ts; `bv-state` present in trust.css; NO `--accent`/`--score-`/`--chart-` references in trust.css — all PASS
- `cd site && npx playwright test states responsive info -x` → 6 passed (states 4 + 2 smokes), 13 fixme skipped
- Full regression: `npx playwright test` → **74 passed, 13 skipped, 0 failed** (no prior-phase regression); `npx vitest run` → **302 passed, 3 skipped** across 34 test files

## Next Phase Readiness

- **Plan 02 (info panel)** can consume `newestDataDate` + `formatIcelandicDate` for the `uppfært {date}` line and activate info.spec criteria 6-9, 18 (selectors/strings already encoded as fixmes).
- **Plan 03 (bottom sheet)** can consume `MOBILE_QUERY` + `snapNearest` + fill the `attachSheet` body, and activate responsive.spec criteria 1-5, 10-12.
- Seam kept clean for **Phase 8**: manifest freshness is read tolerantly (omit line if absent) — an optional top-level `generatedAt` can be added later without a client change.

## TDD Gate Compliance

- RED gate: `002a6a6` `test(07-01): add failing tests…` — present, failed for the right reason (modules not found).
- GREEN gate: `c602f1f` `feat(07-01): implement…` — present, 18/18 pass.
- REFACTOR: not needed (minimal, clean implementation).

## Self-Check: PASSED

All 9 created source/test files + SUMMARY.md present on disk; all 4 task commits (002a6a6, c602f1f, cf32df5, f924205) found in git log.

---
*Phase: 07-responsive-ux-trust-states*
*Completed: 2026-07-20*
