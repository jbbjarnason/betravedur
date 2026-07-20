---
phase: 05-score-coloring-ranking
plan: 03
subsystem: ui
tags: [ranked-list, maplibre, easeTo, playwright, vitest, dom, typescript, a11y]

# Dependency graph
requires:
  - phase: 05-score-coloring-ranking (05-01)
    provides: "MarkerDatum.score:number|null + missingRain — the single field the ranked list sorts/excludes on"
  - phase: 05-score-coloring-ranking (05-02)
    provides: "formatScore (Icelandic-comma one-decimal) + marker-pill--scored/--pill-score seam the highlight extends"
  - phase: 04-selection-state-url
    provides: "observable store + markDiscrete()/writeUrl st-param seam + viewportMatches-guarded moveend + renderForState recompute choke point + latestData snapshot + preview-build Playwright harness"
  - phase: 03-static-site-shell-interactive-map
    provides: "hybrid #marker-overlay buildPill renderer + queryRenderedFeatures survivor loop + window.__map/__store E2E hooks"
provides:
  - "mountRankedList — a collapsible right-docked 'Bestu staðir' panel (<section>/<ol>/<button> rows) ranking scored stations desc, excluding score:null, badging án-úrkomu, with an Engin-einkunn empty state"
  - "rankStations — pure sort helper: filter score!==null, sort desc, stable tie-break by station id (unit-tested)"
  - "stationId→easeTo fly-to subscriber in main.ts (reduced-motion aware) reusing the Phase-4 viewportMatches-guarded moveend — no new camera↔store loop"
  - "setSelectedStation() marker seam: a reciprocal ink-ring highlight (marker-pill--selected) synced with the --dominant-filled ranked row — the 'selected' state Phase 6 reuses"
  - "score.spec criteria 5-10, 12-13 + the ranking halves of 11/14 now REAL — all 14 UI-SPEC criteria green"
affects: [06-station-chart-panel, 07-responsive-ux-trust-states]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ranked list is a store-subscriber DOM component but reads DATA from the post-debounce latestData via a refresh() hook main.ts calls from renderForState (same frame as markers, NOT a raw store subscription — Pitfall 5: no pan/zoom churn)"
    - "Row click reuses the single Phase-4 station-select seam (markDiscrete()+store.set({stationId})); the easeTo fly-to is a separate stationId-only subscriber (Pattern 2), so camera stays decoupled from render (no re-animate on recompute, no isUpdating flag — Pitfall 4)"
    - "Reciprocal highlight via a module-level selectedStationId in markers.ts + setSelectedStation() setter (markers.ts never imports the store) — buildPill reads it to thicken the selected pill's ring; main.ts drives it from the stationId subscriber"
    - "Station name rendered via textContent ONLY (T-05-05); the collapse chevron SVG built via createElementNS/setAttribute so NO innerHTML exists in rankedList.ts — the T-05-05 grep gate stays meaningful"

key-files:
  created:
    - "site/src/ui/rankedList.ts"
    - "site/src/ui/rankedList.test.ts"
  modified:
    - "site/src/styles/score.css"
    - "site/src/main.ts"
    - "site/src/map/markers.ts"
    - "site/tests/e2e/score.spec.ts"

key-decisions:
  - "Criterion 8 asserts the exclusion INVARIANT positively (every listed row is a marker-pill--scored marker; no muted station is ever a row) rather than depending on a naturally-muted station — the 2-station SW fixture (Reykjavík #1, Keflavík #1350) never renders a muted station under the default selection, so a presence-based assertion would only ever skip. Criterion 12 separately drives the all-muted empty state via a single-year (yearFrom===yearTil) selection."
  - "Empty-state E2E is reached deterministically by setting yearFrom===yearTil: every station then has ≤1 qualifying year (< the N≥3 sufficiency gate), so score:null everywhere → the Engin-einkunn panel path, no forced/mocked latestData hook needed."
  - "Added a reciprocal MARKER highlight (marker-pill--selected ink ring) beyond the row --dominant fill — the plan's behavior + UI-SPEC §Reciprocal highlight call for both the row AND the marker to mark the selection. Ink (never accent/ramp) so it is chromatically distinct from the score bar and the reserved temp red; it composes with the scored pill's --pill-score bar via a layered box-shadow."
  - "easeTo duration is 600ms (0 under prefers-reduced-motion) — a gentle animated move, not a jarring jump; the resulting moveend writes the viewport through the EXISTING viewportMatches-guarded handler, so no new guard/flag was added (Phase-4 Pitfall-4 discipline reused verbatim)."

patterns-established:
  - "A Phase-5/6 'selected station' is expressed on TWO synced surfaces (ranked-row --dominant fill + marker-pill--selected ink ring), both driven off the single store stationId — Phase 6 attaches its chart panel to the SAME signal without restructuring"
  - "The ranked list is the third consumer of the renderForState recompute choke point (after installMarkerLayer+renderComposite and controlBar.refreshReadout) — the canonical 'update on the same frame as the markers, never on viewport-only changes' hook"

requirements-completed: [SCORE-02]

# Metrics
duration: 12min
completed: 2026-07-20
---

# Phase 5 Plan 03: Ranked "Bestu staðir" List + Row-Click Fly-To/Select Summary

**A collapsible right-docked "Bestu staðir" panel ranks the scored stations descending (excluding ófullnægjandi-gögn, badging án-úrkomu) for the current selection and re-sorts on the same recompute frame as the markers with zero fetch; clicking a row flies the map to that station via `easeTo`, sets `stationId`, writes the URL `st` param, and reciprocally highlights BOTH the row (--dominant fill) and the marker (thickened ink ring) — reusing the Phase-4 seams with no new camera↔store loop and opening no chart panel (Phase-6 seam kept clean).**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-20T12:24:00Z
- **Completed:** 2026-07-20T12:36:00Z
- **Tasks:** 3 (+ 1 Rule-2 reciprocal-highlight completion)
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments
- Built `mountRankedList`: a `<section aria-label="Bestu staðir">` with a header (title + collapse toggle) and an `<ol>` of full-width `<button>` rows (rank · name · optional `án úrkomu` badge · score). Names via `textContent` only (T-05-05); scores via the reused `formatScore` (`7,8`, Icelandic comma). Rows are ≥44px targets; the selected row gets a `--dominant` fill.
- Added the pure `rankStations` helper (exclude `score===null`, sort desc, stable tie-break by station id — Pitfall 6) with 6 unit tests (desc / null-excluded / stable-ties / án-úrkomu-kept / empty / no-mutation).
- Wired the list into boot: `rankedList.refresh()` fires from `renderForState` (same frame as markers, driven by the recompute choke point — NOT a raw store subscription, so it never churns on pan/zoom — Pitfall 5). Zero fetch.
- Added the `stationId`-only `easeTo` fly-to subscriber (reduced-motion → duration 0), reusing the existing `viewportMatches`-guarded `moveend` — no new loop, no `isUpdating` flag (Pattern 2 / Pitfall 4).
- Added the reciprocal MARKER highlight (`setSelectedStation()` + `marker-pill--selected` ink ring) so the map and the ranked row visibly agree on the selection — the 'selected' seam Phase 6 reuses.
- Converted score.spec criteria 5-10, 12-13 (+ the ranking halves of 11, 14) from `test.fixme` to real assertions on the preview build; ALL 14 UI-SPEC criteria are now green. Captured + self-inspected desktop, narrow, and selected-highlight evidence screenshots.

## Task Commits

Each task was committed atomically:

1. **Task 1: rankStations helper + Bestu staðir ranked-list DOM component** — `fe9f4e8` (feat) — `tdd="true"` (RED rankStations tests + GREEN impl staged together)
2. **Task 2: wire ranked list + stationId→easeTo fly-to into boot** — `fb1a9b6` (feat)
3. **Task 3: score.spec criteria 5-10, 12-13 + ranking halves of 11/14** — `246f903` (test) + `f536fb9` (docs: desktop/narrow evidence)
4. **Rule-2 completion: reciprocal marker highlight** — `2cb9781` (feat) + `579983e` (docs: selected-highlight evidence)

**Plan metadata:** committed with this SUMMARY (docs).

## Files Created/Modified
- `site/src/ui/rankedList.ts` — NEW: `rankStations` (pure sort) + `mountRankedList` (collapsible panel, row-click select seam, empty state, highlight subscriber).
- `site/src/ui/rankedList.test.ts` — NEW: 6 rankStations unit tests.
- `site/src/styles/score.css` — added the ranked-panel styles (right-dock, `--bar-height` clearance, 44px rows, ink focus, empty state, collapsed slim-tab) + the `.marker-pill--selected` ink ring.
- `site/src/main.ts` — mount `rankedList`; call `rankedList.refresh()` from `renderForState`; add the `stationId`→`easeTo`+`setSelectedStation` subscriber.
- `site/src/map/markers.ts` — module-level `selectedStationId` + `setSelectedStation()`; `buildPill` adds `marker-pill--selected` for the selected station.
- `site/tests/e2e/score.spec.ts` — criteria 5-10, 12-13 (+ 11/14 ranking halves) real; desktop/narrow evidence capture.

## Decisions Made
See `key-decisions` in frontmatter. The material one for downstream: **the 'selected station' is now a two-surface synced state (ranked-row fill + marker ink ring) off the single store `stationId`** — Phase 6 attaches its chart panel to that same signal.

## Deviations from Plan

### Auto-added functionality

**1. [Rule 2 - Missing Critical] Reciprocal MARKER highlight for the selected station**
- **Found during:** Post-Task-2 review against the plan's `<behavior>` ("selected row gets a --dominant fill (reciprocal highlight)") + UI-SPEC §Reciprocal highlight ("Selecting a station should visibly mark BOTH the marker AND the matching ranked row") + the plan-context critical reminder ("Selected station gets a highlight (row --dominant fill + marker ring-thicken)").
- **Issue:** Tasks 1-2 implemented the ranked-row `--dominant` fill but NOT the marker-side ring-thicken. The row-only highlight left the map and the list out of sync on selection — the "reciprocal" half of the stated behavior was missing.
- **Fix:** Added a module-level `selectedStationId` + `setSelectedStation()` in markers.ts (so markers.ts stays store-free), `buildPill` applies `marker-pill--selected` (a thickened ink `box-shadow` ring, never accent/ramp), and the main.ts `stationId` subscriber calls `setSelectedStation()` + `renderComposite()` on every select/deselect. Pure presentation — no recompute, no fetch.
- **Files modified:** `site/src/map/markers.ts`, `site/src/styles/score.css`, `site/src/main.ts`
- **Verification:** A dedicated evidence run asserted exactly 1 `.ranked-list__row--selected` AND exactly 1 `.marker-pill--selected` after a row click; screenshot (`05-03-selected-highlight.png`) self-inspected — Reykjavík row filled grey, its 8,6 pill ringed in ink, Keflavík untouched. Full e2e (47) + unit suites stayed green.
- **Committed in:** `2cb9781`

---

**Total deviations:** 1 auto-added (Rule 2 missing-critical). No scope creep — completes the plan's own stated reciprocal-highlight behavior. No architectural change (reused the existing overlay renderer + store seam).

## Issues Encountered
- **Criterion 8 initially skipped:** the 2-station SW fixture renders no naturally-muted station under the default selection, so a presence-based "muted station is absent" assertion only ever skipped. Resolved by re-framing criterion 8 to assert the exclusion INVARIANT positively (row set ⊆ scored markers; muted stations never listed) so it runs on every invocation, with criterion 12 separately covering the all-muted empty state. Not a code bug — a test-reachability refinement.
- **Pre-existing tsc errors (out of scope):** the same 9 `tsc --noEmit -p site` errors documented in 05-01 (recompute.test.ts, store.test.ts, url.ts:66) persist on this branch. This plan introduced ZERO new tsc errors (verified: error count stayed at exactly 9 across every touched file). Left untouched per the SCOPE BOUNDARY rule.

## Known Stubs
None introduced. The Phase-6 chart panel is a deliberate seam, not a stub — criterion 10 asserts NO chart panel opens on a row click, and the row click funnels through the single `store.set({stationId})` signal Phase 6 will attach its panel to.

## Threat Flags
None. No new network endpoints, auth paths, or schema changes. The only new user-facing DOM surface is the ranked-row station name (rendered via `textContent`, T-05-05) and hard-coded Icelandic literals — inside the plan's existing `<threat_model>` (T-05-05 mitigated: no innerHTML in rankedList.ts; T-05-06 mitigated: rankStations filters `score===null` before the comparator; T-05-07 mitigated: easeTo drives off a stationId-only subscriber guarded by the existing viewportMatches, no re-loop).

## Verification
- **Unit suite:** `npx vitest run` — 29 files, 258 passed / 3 pre-existing skips (rankStations +6 green; no Phase 1-4 regression).
- **innerHTML gate (T-05-05):** `grep -nc 'innerHTML' site/src/ui/rankedList.ts` → `0`. Station names use `textContent`; the chevron SVG uses `createElementNS`.
- **Type check:** `npx tsc --noEmit -p site` — exactly 9 errors, ALL pre-existing (same set as 05-01); zero new.
- **Build:** `cd site && npm run build` — clean.
- **Score E2E (all 14 criteria):** `npx playwright test tests/e2e/score.spec.ts --project=chromium` — 17 passed / 0 skipped (criteria 1-14 real + smoke + 2 evidence).
- **Full E2E suite (regression):** `cd site && npx playwright test --project=chromium` — 47 passed / 0 skipped (Phase 3 shell/markers + Phase 4 selection specs all green — no regression).

### Screenshot evidence (no-review directive — self-inspected)
- `.planning/phases/05-score-coloring-ranking/evidence/05-03-ranked-list-desktop.png` — ranked panel right-docked (Reykjavík 8,6 → Keflavíkurflugvöllur **án úrkomu** 7,8, desc order), collapse chevron, bottom-left legend, colored markers, central Iceland unoccluded.
- `.planning/phases/05-score-coloring-ranking/evidence/05-03-ranked-list-narrow.png` — at 600px the panel degrades to a functional right-docked collapsible list (Phase 7 does the polished sheet); the collapse toggle provides the show/hide.
- `.planning/phases/05-score-coloring-ranking/evidence/05-03-selected-highlight.png` — a row click selects Reykjavík: its row is `--dominant`-filled AND its 8,6 pill carries the thickened ink ring, while Keflavík stays unhighlighted — reciprocal highlight confirmed.

Self-inspection confirmed: desc order correct; án-úrkomu badge present before the score; empty-state and collapse behave; row click flies to + selects + highlights the station with no chart panel; legend + panel coexist without occluding the central station band.

## Next Phase Readiness
- **Phase 6 (station chart panel):** the row/marker select funnels through the single `store.set({stationId})` + URL `st` seam; the `marker-pill--selected` + `.ranked-list__row--selected` states are the 'selected' surfaces the chart panel attaches to. Criterion 10 already guards that NO panel opens today — Phase 6 flips that by attaching to the same signal, no restructuring.
- **Phase 7 (responsive UX):** the narrow-screen panel is functional-only (collapsible list, no compact chip/bottom-sheet) — the polished narrow chrome is Phase 7's job, and the collapse toggle + `--bar-height` clearance are already in place to build on.
- SCORE-02 (ranked "best stations" list) is delivered; **Phase 5 (Score Coloring & Ranking) is complete** — all three plans (05-01 data+ramp, 05-02 colored markers+legend, 05-03 ranked list+fly-to) shipped, all 14 UI-SPEC criteria green.

## Self-Check: PASSED

- Created files verified present: `site/src/ui/rankedList.ts`, `site/src/ui/rankedList.test.ts`, `05-03-SUMMARY.md`, and all three evidence PNGs (desktop / narrow / selected-highlight).
- Commits verified in git log: `fe9f4e8` (Task 1), `fb1a9b6` (Task 2), `246f903` + `f536fb9` (Task 3), `2cb9781` + `579983e` (Rule-2 reciprocal highlight).

---
*Phase: 05-score-coloring-ranking*
*Completed: 2026-07-20*
