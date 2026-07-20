---
phase: 07-responsive-ux-trust-states
plan: 02
subsystem: ui
tags: [trust-panel, ux-04, native-dialog, attribution, cc-by-4.0, maplibre-compact, freshness, localStorage, playwright]

requires:
  - phase: 07-responsive-ux-trust-states
    provides: "Plan 01 — freshness.ts newestDataDate + formatIcelandicDate; trust.css .bv-state overlay family; info.spec/shell.spec harnesses"
  - phase: 03-static-site-shell-interactive-map
    provides: "init.ts compact AttributionControl (compact:true); the bottom control-bar --bar-height write seam"
  - phase: 06-station-chart-panel
    provides: "main.ts boot()/wireMarkers.install seams; stationPanel.ts SVG-via-DOM (buildCloseGlyph) + .panel-open body class"
provides:
  - "infoPanel.ts — mountInfoPanel (persistent top-right i button, native <dialog> trust panel, first-visit localStorage bv:info-dismissed with permalink guard, focus-return) + pure buildInfoDialog + infoPanelSections content model"
  - "The prominent trust framing 'Þetta er sögulegt meðaltal, ekki spá.' + ATTRIBUTION-sourced CC BY 4.0/OSM/Protomaps credit + Icelandic 'uppfært {date}' freshness (omitted when null)"
  - "Attribution-solve-once: the three controls.css hacks DELETED, replaced by one --attrib-safe-bottom safe-zone rule + compact map credit + always-legible info-panel credit backstop"
  - "info.spec criteria 6-9/18 active-green (6 at 1280+390); shell.spec harmonized licensing asserts (criteria 10-12) green before/after the hack deletion"
affects: [07-03-bottom-sheet, phase-8-nightly-manifest-generatedAt]

tech-stack:
  added: []
  patterns:
    - "Native <dialog>.showModal() for the info panel — free focus-trap + Escape + backdrop-dismiss; one `close` event seam records the dismissed flag AND returns focus to the launching button"
    - "Pure content model (infoPanelSections) split out of DOM assembly (buildInfoDialog) so the panel is unit-testable in the headless Node vitest runtime (no jsdom, no new dep)"
    - "createElement/createElementNS + textContent throughout; the ONLY markup is real <a> anchors with setAttribute href (T-07-04 no innerHTML)"
    - "Attribution debt solved ONCE: one --attrib-safe-bottom custom property replaces per-surface margin hacks; the compact (i) control + info-panel credit satisfy CC BY 4.0's collapse-behind-(i) allowance"
    - "First-visit auto-open permalink guard = location.search.length > 1 (any restored view suppresses the modal so a shared link is never blocked)"

key-files:
  created:
    - site/src/ui/infoPanel.ts
    - site/src/ui/infoPanel.test.ts
  modified:
    - site/src/styles/trust.css
    - site/src/styles/controls.css
    - site/src/main.ts
    - site/tests/e2e/info.spec.ts
    - site/tests/e2e/shell.spec.ts
    - site/tests/e2e/panel.spec.ts
    - site/tests/e2e/score.spec.ts
    - site/tests/e2e/selection.spec.ts
    - site/tests/e2e/markers.spec.ts
    - site/tests/e2e/responsive.spec.ts

key-decisions:
  - "The info panel is a native <dialog> opened via showModal() — the modal focus-trap/Escape/backdrop are correct per UI-SPEC, but the auto-open modal intercepts pointer events, so prior-phase E2E must seed bv:info-dismissed before boot (test-harness regression, Rule 1)"
  - "buildInfoDialog is fed by a pure infoPanelSections content model so the unit test runs in the Node vitest runtime (no jsdom installed, and installing one is a forbidden new dependency); DOM assembly + first-visit/permalink/focus are covered by Playwright info.spec 6-9/18"
  - "The attribution-solve-once keeps init.ts compact:true UNTOUCHED; the deleted 60vw cap + panel-open push are unnecessary because the compact (i) credit sits in the reserved bottom band BELOW the station panel's bottom edge, and the info panel is the always-legible licensing backstop"
  - "Info-panel criteria are checked against the shell chrome (map style-loaded + info button + uppfært set), NOT markers — the info panel is data-independent and markers do not survive symbol collision inside the narrow 390px viewport with the sample dataset"

patterns-established:
  - "Info/trust panel: native <dialog> + createElement/textContent + real <a> anchors only; domain ATTRIBUTION as the single credit source; freshness line omitted (never Invalid Date) when null"
  - "One coherent --attrib-safe-bottom safe-zone rule (set from --bar-height baseline; Plan 03 raises it to the mobile sheet peek) replaces reactive per-surface attribution margin hacks"

requirements-completed: [UX-04]

duration: 60min
completed: 2026-07-20
---

# Phase 7 Plan 02: Info/Trust Panel + Attribution-Solve-Once Summary

**Native `<dialog>` info/trust panel (top-right `i` button) framing the data as `Þetta er sögulegt meðaltal, ekki spá.` with the domain-sourced CC BY 4.0 credit + Icelandic `uppfært {date}` freshness and a permalink-guarded first-visit auto-open — plus the attribution debt paid down once: the three `controls.css` hacks deleted and replaced by a single `--attrib-safe-bottom` safe-zone rule backed by the always-legible info-panel credit.**

## Performance

- **Duration:** ~60 min (dominated by full-suite Playwright runs)
- **Started:** 2026-07-20T19:51:00Z
- **Completed:** 2026-07-20T20:51:22Z
- **Tasks:** 2 (Task 1 is TDD: RED + GREEN)
- **Files created:** 2
- **Files modified:** 10

## Accomplishments

- **infoPanel.ts** — `mountInfoPanel(parent, {freshnessDate})` renders a persistent top-right `<button class="info-button" aria-label="Um kortið">` (inline-SVG "i"-in-a-circle glyph, ≥44px hit target, ink stroke, 2px ink focus ring, never accent) and a native `<dialog class="info-panel">`. The dialog sections are exactly the UI-SPEC copy in order: title → the prominent trust lead `Þetta er sögulegt meðaltal, ekki spá.` → what-it-shows → how-to-read → the ATTRIBUTION-built credit (a real `<a href={ATTRIBUTION.sourceUrl}>CC BY 4.0</a>` + `© OpenStreetMap contributors · Protomaps`) → the `uppfært {date}` freshness line (omitted when null) → the `Loka` close button. Every node is `createElement`/`createElementNS` + `textContent` — no `innerHTML` (T-07-04). Returns a handle so boot() sets the freshness line after the manifest resolves.
- **First-visit auto-open, permalink-safe** — on mount, if `bv:info-dismissed !== "1"` AND `location.search.length <= 1` (a bare first visit), `showModal()` fires once. Any non-empty query (a shared selection/`st` permalink) suppresses the auto-open entirely, so the restored view is never blocked. Dismiss (close button / Escape / backdrop — one native `close` event seam) records `bv:info-dismissed="1"` and returns focus to the info button.
- **Attribution-solve-once** — the three `controls.css` hacks (`--bar-height + --space-lg` lift, `max-width:60vw` cap, `.panel-open { margin-right:344px }`) are DELETED and replaced by ONE `--attrib-safe-bottom` safe-zone rule (`margin-bottom: calc(var(--attrib-safe-bottom) + var(--space-sm))`), with `--attrib-safe-bottom` defined in `trust.css` off the `--bar-height` baseline. The compact `AttributionControl({compact:true})` (init.ts untouched) is the small findable `(i)` credit; the info panel carries the full credit as the always-legible licensing backstop (CC BY 4.0 v4.0 + OSM permit collapsing behind an `(i)`).
- **E2E** — info.spec criteria 6-9/18 activated (criterion 6 at BOTH 1280 and 390); shell.spec attribution tests rewritten to the harmonized licensing bar (criterion 10 desktop + panel-open, 11 mobile 390, 12 grep-gate `--attrib-safe-bottom` present / `60vw` + `.panel-open .maplibregl-ctrl` absent), with the existing bottom-bar non-occlusion assertion re-run and still green (Pitfall 6). **82 E2E passed, 8 skipped (Plan-03 fixmes), 0 failed; 308 unit passed.**
- **Evidence** — desktop (1280) + mobile (390) screenshots of the info panel open, self-inspected: the `ekki spá` lead is prominent (bold), the CC BY 4.0 + OSM + Protomaps credit is present with the linked license, and `uppfært 20. júlí 2026` shows.

## Task Commits

1. **Task 1 RED: failing infoPanelSections content-model test** — `b225e96` (test)
2. **Task 1 GREEN: infoPanel.ts (i button + native <dialog>) + trust.css** — `0e3f883` (feat)
3. **Task 2: wire into boot + solve attribution once + activate E2E** — `971b8c5` (feat)

_Task 1 followed RED→GREEN (no refactor needed — the pure/DOM split was clean on first implementation)._

## Files Created/Modified

- `site/src/ui/infoPanel.ts` — `mountInfoPanel` (i button + native <dialog> + first-visit localStorage + permalink guard + focus-return + setFreshness handle), pure `buildInfoDialog` + `infoPanelSections`; attribution built from the domain `ATTRIBUTION` constant (never hardcoded)
- `site/src/ui/infoPanel.test.ts` — 6 Vitest cases over the pure `infoPanelSections` content model (trust lead, ATTRIBUTION-sourced credit, conditional freshness), Node-runtime-safe
- `site/src/styles/trust.css` — `.info-button`, `.info-panel` dialog + `::backdrop`, section typography, and the `:root { --attrib-safe-bottom }` safe-zone property (no accent/score/chart tokens)
- `site/src/styles/controls.css` — DELETED the three attribution hacks; ONE harmonized `--attrib-safe-bottom` margin rule for the MapLibre bottom controls
- `site/src/main.ts` — mount `mountInfoPanel(document.body, {freshnessDate:null})` in boot() (static chrome, first-visit before data); `infoPanel.setFreshness(newestDataDate → formatIcelandicDate)` after the manifest resolves in `wireMarkers.install()`
- `site/tests/e2e/info.spec.ts` — activated criteria 6-9/18; `waitForInfoChrome` (info panel is data-independent); `suppressAutoOpen` helper for the button-open criteria
- `site/tests/e2e/shell.spec.ts` — harmonized attribution licensing asserts (criteria 10-12) + the `assertFullCreditReachableInInfoPanel` backstop helper; auto-open suppression
- `site/tests/e2e/{panel,score,selection,markers,responsive}.spec.ts` — seed `bv:info-dismissed` in `beforeEach` (and in panel.spec's own reduced-motion context) so the new auto-open modal does not intercept prior-phase interaction clicks

## Decisions Made

- **Native `<dialog>` + `showModal()`** for the free focus-trap/Escape/backdrop the UI-SPEC requires — accepting that the modal intercepts pointer events, which is why prior-phase E2E must seed the dismissed flag (see Deviations).
- **Pure content model split** (`infoPanelSections` → `buildInfoDialog`) so the unit test runs in the headless Node vitest runtime; no jsdom is installed and adding one is a forbidden new dependency. DOM assembly + first-visit/permalink/focus behavior are covered by Playwright.
- **`init.ts` compact control untouched;** the deleted 60vw/panel-open hacks are unnecessary because the compact `(i)` credit sits in the reserved bottom band below the station panel's bottom edge (`bottom: bar-height + --space-lg`), and the info-panel credit is the always-legible backstop.
- **Info-panel criteria gate on the shell chrome, not markers** — markers do not survive symbol collision inside the narrow 390px viewport with the sample dataset; the info panel is data-independent chrome mounted in boot().

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The new first-visit auto-open modal broke 22 prior-phase E2E interaction tests**
- **Found during:** Task 2 (full E2E regression)
- **Issue:** The info panel opens via `<dialog>.showModal()` on a bare first visit. Its backdrop intercepts pointer events, so prior-phase tests (panel/score/selection/markers `.spec`) that boot a fresh `/` and then click a marker/control timed out with `<dialog open class="info-panel"> intercepts pointer events`. These specs predate the info panel and never dismissed it.
- **Fix:** Added `page.addInitScript(() => localStorage.setItem("bv:info-dismissed","1"))` to each affected spec's `beforeEach` (before its `goto`), and to panel.spec's own reduced-motion `browser.newContext` page which bypasses the shared `beforeEach`. info.spec is deliberately NOT globally seeded (criterion 7 needs the auto-open); its other criteria seed individually.
- **Files modified:** site/tests/e2e/{panel,score,selection,markers,responsive}.spec.ts
- **Verification:** Full suite went 23 failed → 1 failed → 0 failed (82 passed, 8 skipped).
- **Committed in:** `971b8c5` (Task 2 commit)

**2. [Rule 3 - Blocking] shell.spec attribution geometry tests asserted the SUPERSEDED (always-expanded) model**
- **Found during:** Task 2 (Pitfall 6 re-run of the existing non-occlusion asserts)
- **Issue:** Two existing shell.spec tests force-EXPANDED the compact attribution and asserted its full-width box did not intersect the legend/station-panel — the very behavior the deleted 60vw/panel-open hacks propped up. With the hacks gone (and the auto-open modal blocking the toggle click), they failed.
- **Fix:** Rewrote them to the harmonized licensing bar the UI-SPEC criterion 10/11 actually specify: the compact map credit sits in the reserved bottom safe zone (clears the control bar) AND the full CC BY 4.0 + OSM + Veðurstofa credit is reachable in the info panel (`assertFullCreditReachableInInfoPanel`). Added the criterion-12 grep-gate. The pre-existing bottom-bar non-occlusion assertion was re-run unchanged and stays green.
- **Files modified:** site/tests/e2e/shell.spec.ts
- **Verification:** shell.spec 10/10 green at 1024/1280/1440 + panel-open + 390.
- **Committed in:** `971b8c5` (Task 2 commit)

**3. [Rule 3 - Blocking] Info-panel criterion 6 could not gate on markers at 390px**
- **Found during:** Task 2 (criterion 6 @390 timed out)
- **Issue:** The plan's harness `waitForMarkers` requires a rendered pill, but at 390px zoom 6 the sample dataset's stations do not survive symbol collision inside the narrow viewport (0 pills) — a pre-existing data/framing condition, not caused by this plan.
- **Fix:** Added `waitForInfoChrome` (map style-loaded + info button present + the `uppfært` line set) since the info panel is data-independent chrome. Criterion 6 now runs at both viewports without coupling the panel to marker rendering.
- **Files modified:** site/tests/e2e/info.spec.ts
- **Verification:** criterion 6 green at 1280 and 390.
- **Committed in:** `971b8c5` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking) — all in the test harness, none in shipped behavior.
**Impact on plan:** No scope creep. The shipped info panel + attribution refactor match the plan; the deviations reconcile prior-phase and superseded-model E2E to the new (intended) modal + compact-attribution design.

## Issues Encountered

- **Concurrent Playwright runs contended for the preview port** and reported spurious cross-run failures. Resolved by running the suite once, isolated, in the foreground (82 passed / 8 skipped / 0 failed, exit 0).
- **grep-gate tripped on the explanatory comment** in controls.css (the words `60vw` / `.panel-open .maplibregl-ctrl` appeared in prose describing the deleted hacks) — same class of issue Plan 01 noted. Rephrased the comment to describe the intent without the literal token strings; the automated gate reflects the real invariant.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Plan 03 (bottom sheet)** can raise `--attrib-safe-bottom` to the mobile sheet peek top (the seam is clean — the safe-zone rule already keys on it) and activate the responsive.spec criteria 1-5, 10-12 fixmes. The `bv:info-dismissed` seeding pattern is now established in every interaction spec's `beforeEach`, so new sheet/chip tests inherit a modal-free boot.
- **Phase 8** can add an optional top-level `manifest.generatedAt`; the info panel already reads freshness tolerantly (via `newestDataDate`) and omits the line if absent — no client change required.

## Self-Check: PASSED

All created files present on disk (infoPanel.ts, infoPanel.test.ts, 07-02-SUMMARY.md, both evidence screenshots); all three task commits (b225e96, 0e3f883, 971b8c5) found in git log.

---
*Phase: 07-responsive-ux-trust-states*
*Completed: 2026-07-20*
