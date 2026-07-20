---
phase: 04-selection-instant-recompute
plan: 02
subsystem: ui
tags: [vanilla-ts, dom-controls, native-range, native-select, intl-is-IS, playwright, no-network-recompute, accessibility]

# Dependency graph
requires:
  - phase: 04-selection-instant-recompute (Plan 01)
    provides: "createStore (get/set/subscribe), anchorToWindow, computeMarkerDatum yearRange, boot-cache recompute (no fetch), window.__store"
  - phase: 03-map-markers
    provides: "installMarkerLayer/renderComposite idempotent renderer, MarkerDatum contract, boot fetch-once path, tokens.css / header surface treatment"
provides:
  - "Bottom control bar (mountControlBar) — scrubber + 4 width buttons + Frá/Til dropdowns + global meðaltal N ára readout, all wired to store.set"
  - "createScrubber — native range doy scrubber + Icelandic Intl date readout + month ticks + narrow-screen ‹ › stepper (doyLabel/windowLabel exported, unit-proven)"
  - "createWidthButtons — segmented 1v/2v/3v/1mán role=group, single aria-pressed"
  - "createYearRange — Frá/Til selects bounded by data, Frá ≤ Til guard"
  - "controls.css — control-bar surface on Phase 3 tokens (zero accent references)"
  - "readoutText — honest meðaltal N ára / N–M ára / ófullnægjandi gögn from latest recompute"
  - "selection.spec.ts E2E — controls render + no-network recompute + narrow stepper (10 tests)"
affects: [url-state (Plan 03), score-palette (Phase 5), chart-panel (Phase 6), mobile-polish (Phase 7)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Framework-free DOM builder modules: each control factory takes an initial value + a change callback and returns { el }; controlBar.ts owns store wiring (controls never import the store)"
    - "Global N readout mechanism (pinned): main.ts keeps a module-level latestData updated on every recompute and passes getLatestData:()=>MarkerDatum[] into mountControlBar; the store subscription is the update trigger"
    - "Native controls for free a11y: <input type=range> (role=slider + aria-valuemin/max/now), <select> (keyboard + SR), <button> group (aria-pressed) — no hand-rolled ARIA"
    - "Icelandic dates via Intl 'is-IS' over the fixed non-leap 2001 reference; abbreviated window form built from a static IS month-abbr list (Intl short form appends a period)"
    - "E2E no-network proof: page.on('request') counts /data/ requests around a selection change, asserting === 0 while markers re-render from the boot cache"

key-files:
  created:
    - site/src/ui/scrubber.ts
    - site/src/ui/scrubber.test.ts
    - site/src/ui/widthButtons.ts
    - site/src/ui/yearRange.ts
    - site/src/ui/controlBar.ts
    - site/src/styles/controls.css
    - site/tests/e2e/selection.spec.ts
  modified:
    - site/src/main.ts

key-decisions:
  - "Global N-readout wiring pinned to a getLatestData getter over a module-level latestData snapshot in main.ts (chosen concretely per plan-checker note — not left optional); the readout re-reads it on each store notification just past the 120ms recompute debounce"
  - "Year-bound derivation lives in main.ts (yearBoundsFromManifest — union of entry.from/entry.to across manifest.stations), passed into mountControlBar as {min,max}; no hardcoded year literal"
  - "Width 14→30 on the 2-station sample produces IDENTICAL rounded temp/wind — so criterion 4 proves the width WIRING (aria-pressed flip + store write + 0 network) and the recompute-VISIBLE assertion lives in criteria 6 (anchor swing) & 8 (year change), which do change values"
  - "controls.css lets the bar size to content (removed max-height clip) so the scrubber's stacked readout/range/ticks stay inside the surface; height held within the ≤135px occlusion budget (E2E-asserted)"

patterns-established:
  - "Control factory contract: pure DOM builder + change callback, store-agnostic; the bar is the single wiring point (keeps controls reusable + testable)"
  - "windowLabel/doyLabel are the shared Icelandic date helpers (unit-proven) the scrubber readout + stepper both render"

requirements-completed: [SEL-01, SEL-02, SEL-03, SEL-04]

# Metrics
duration: 15min
completed: 2026-07-20
---

# Phase 4 Plan 02: Control Bar & Instant Recompute Summary

**A bottom control bar — native-range day-of-year scrubber (Icelandic date readout + month ticks + narrow-screen ‹ › stepper), four segmented width buttons, Frá/Til year dropdowns bounded by the manifest union, and an always-visible honest `meðaltal N ára` readout — all wired to the Plan 01 store so any change recomputes and re-renders markers entirely from the boot cache with ZERO data-network requests (E2E-proven, 10 Chromium tests green).**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-20T10:10:00Z
- **Completed:** 2026-07-20T10:25:00Z
- **Tasks:** 3 (Task 1 TDD)
- **Files modified:** 8 (7 created, 1 modified)

## Accomplishments

- **Three framework-free control builders (SEL-01/02):** `createScrubber` (native `<input type=range>` restyled to tokens, `aria-label="Velja tímabil"`, `aria-live` date readout, 12 month ticks, ±7-day PageUp/Down step, and a narrow-screen ‹ [date] › stepper), `createWidthButtons` (`role=group` "Lengd tímabils", exactly four `1 vika / 2 vikur / 3 vikur / 1 mánuður` buttons mapping 7/14/21/30, single `aria-pressed`), `createYearRange` (Frá/Til `<select>`s populated min..max with a Frá ≤ Til clamp). Each is store-agnostic — DOM + a change callback only.
- **Icelandic date helpers (unit-proven):** `doyLabel` (Intl `is-IS` over the fixed non-leap 2001 reference — doy 197 = "16. júlí", 1 = "1. janúar", 365 = "31. desember") and `windowLabel` (abbreviated both-endpoint form, incl. the wrapping "26. des – 8. jan").
- **controlBar.ts (SEL-03 + wiring):** `mountControlBar(store, bounds, getLatestData)` mounts the bar (region order: N readout · scrubber · width · Frá/Til), wires all three controls to `store.set`, and renders the global `meðaltal N ára` readout — `readoutText` shows a single N, a `N–M` range when sufficient stations vary, or `ófullnægjandi gögn` when the whole selection is thin, all via `textContent` (T-04-03).
- **main.ts wiring:** derives union year bounds from the manifest (`yearBoundsFromManifest`), keeps a module-level `latestData` snapshot updated on every recompute, and mounts the bar with `getLatestData: () => latestData` — no re-fetch, no marker-code changes.
- **selection.spec.ts (SEL-04 proof):** 10 Chromium tests on the preview build cover UI-SPEC criteria 1–8, 10, 16 — including a `page.on('request')` counter asserting **0 `/data/` requests** around width, scrubber (`__store.set`), and year changes while markers re-render, plus the 500px stepper driving `__store.get().anchorDoy`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Scrubber + width buttons + year dropdowns builders + controls.css + doyLabel test** — `3179f24` (feat)
2. **Task 2: controlBar.ts mount + wire controls to store + global N readout; wire in main.ts** — `6811c61` (feat)
3. **Task 3: Playwright selection.spec.ts — render + no-network recompute + narrow stepper + evidence** — `ef0eb7d` (test)

_Task 1 (TDD): scrubber.test.ts (RED for doyLabel/windowLabel) and the builders were authored + committed together — the pure date helpers were run and pass before the commit._

## Files Created/Modified

- `site/src/ui/scrubber.ts` — doyLabel/windowLabel + createScrubber (native range + readout + ticks + stepper)
- `site/src/ui/scrubber.test.ts` — Icelandic date-label + wrapping-window unit tests
- `site/src/ui/widthButtons.ts` — createWidthButtons (4-option role=group, single aria-pressed)
- `site/src/ui/yearRange.ts` — createYearRange (Frá/Til selects, Frá ≤ Til guard)
- `site/src/ui/controlBar.ts` — mountControlBar + readoutText (store wiring + global N readout)
- `site/src/styles/controls.css` — control-bar surface + scrubber/button/select styling on Phase 3 tokens (0 accent refs)
- `site/tests/e2e/selection.spec.ts` — 10-test E2E: render + no-network recompute + narrow stepper + evidence
- `site/src/main.ts` — union year bounds from manifest, latestData snapshot, mountControlBar call

## Decisions Made

- **Global N-readout wiring pinned** (plan-checker note): a `getLatestData: () => MarkerDatum[]` getter over a module-level `latestData` in main.ts (updated on every recompute), passed into `mountControlBar`. The readout re-reads it on each store notification, settled just past the 120ms recompute debounce, so it reflects the same frame the markers show. Concrete, not optional.
- **Year bounds derived in main.ts** from the manifest union (min of `from`, max of `to`), passed as `{min,max}` — grows with the data (Phase 8 backfill), never a hardcoded literal.
- **Bar sizes to content** (removed the `max-height:96px` clip) so the scrubber's stacked readout/range/ticks stay inside the translucent surface; height held ≤135px (occlusion budget, E2E-asserted).
- **Native `<input type=range>` a11y attributes:** the criterion asserts `role=slider` (via `getByRole`) + the backing `min`/`max`/value DOM attrs; the browser derives `aria-valuemin/max/now` from them (they are not literal DOM attributes).

## Deviations from Plan

**None — plan executed exactly as written.** All three tasks implemented as specified; every acceptance criterion satisfied. Two verification-shaping notes below are Issues (test-design choices forced by the real 2-station sample + native-element semantics), not deviations from the plan's intent.

**Total deviations:** 0
**Impact on plan:** None.

## Issues Encountered

- **Width change produces identical rounded marker values on the 2-station sample.** For a summer anchor, a 14-day vs 30-day window yields the same rounded temp/wind (11°/4–5 m/s) for both committed SW stations — a real property of the data, not a bug. So criterion 4 asserts the width WIRING (aria-pressed flip + `store.set` widthDays + 0 network) and the recompute-VISIBLE requirement is proven by criterion 6 (summer→winter anchor swing: 11°→0°/1°) and criterion 8 (Frá year change: 11°/4→12°/3 m/s, and the global readout `meðaltal 15–77 ára`→`15–38 ára`). Documented in the spec.
- **Native range ARIA attributes.** `toHaveAttribute("aria-valuemin", …)` failed because a native `<input type=range>` exposes `aria-valuemin/max/now` to the accessibility tree but NOT as DOM attributes. Fixed by asserting `getByRole("slider")` + the backing `min`/`max`/`inputValue()`.
- **Narrow-viewport marker wait.** The stepper test timed out waiting for markers to re-render after a mid-test viewport resize. Fixed by waiting on `.control-bar` (which mounts only after the initial marker render at the default viewport) instead of re-waiting for markers — the stepper drives the store independently of the map.

## Verification Evidence

- `npx vitest run site/src/ui/scrubber.test.ts` → **5 passed** (doyLabel + windowLabel Icelandic dates).
- `npm test` (full repo) → **215 passed | 3 skipped** (25 files), no regressions.
- `npm run build -w site` → **succeeds** (strict TS; the pre-existing MapLibre chunk-size warning is unrelated/out of scope).
- `cd site && npm run e2e -- selection.spec.ts` → **10 passed** on the Chromium preview build.
- `grep -c "var(--accent)" site/src/styles/controls.css` → **0** (accent never used on controls).
- `grep -c "store.set" site/src/ui/controlBar.ts` → **7** (anchor, width, year wired; ≥3 required).

### Screenshot self-inspection (satisfies the two Manual-Only visual verifications in 04-VALIDATION.md)

Two screenshots captured to `evidence/` and inspected by Claude:

- **`04-02-controls-default.png`** — the bottom control bar is legible and does NOT occlude Iceland: the `meðaltal 15–77 ára` readout, the scrubber (`16. júl – 29. júl` + range with the painted window span + `jan feb … des` ticks), the four width buttons (`2 vikur` active, bold + filled), and `Frá 1949 / Til 2026` all render clearly; the island (ICELAND/Ísland + all station names) is fully visible above the bar. Markers show `11°` for both SW stations.
- **`04-02-controls-year-changed.png`** — after changing `Frá 1949 → 1988`: the dropdown reads `Frá 1988`, the global readout recomputed `meðaltal 15–77 ára → meðaltal 15–38 ára` (honest N shrank with the narrower baseline), and a marker value visibly changed `11° breytileg átt 4 m/s → 12° breytileg átt 3 m/s` — confirming instant client-side recompute re-rendered marker values on a year-range change.

## Known Stubs

None introduced by this plan. (The Plan 01 `yearFrom:1 / yearTil:9999` bootstrap placeholder still exists in main.ts's `initial` state and is clamped into the Frá/Til options by `createYearRange`; **Plan 03** replaces it with the data-derived default + URL hydration, as noted in 04-01-SUMMARY. This plan reads/clamps that placeholder correctly and does not add a new stub.)

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries introduced. The N readout renders only integers via `textContent` (T-04-03 mitigated); the year dropdown clamps Frá ≤ Til (T-04-04 mitigated); zero new packages (T-04-SC — native `<input>`/`<button>`/`<select>` only).

## Next Phase Readiness

- **Ready for Plan 04-03 (URL state):** the controls now WRITE via `store.set` and the store's read-via-subscribe path is exercised; Plan 03 adds `stateToParams`/`paramsToState`, the `replaceState`/`pushState` writer + `popstate` reader, and replaces the temporary bootstrap default with the data-derived today's-week / last-10-years default + URL hydration. The Frá/Til bounds are already manifest-derived, so Plan 03's clamp-on-restore has correct bounds to snap to.
- **Ready for Phase 5 (score palette):** controls are chromatically neutral (0 accent references) — Phase 5 can introduce the score scale on the marker surface without touching the control chrome.
- No blockers. Zero new dependencies (STACK zero-dep discipline preserved).

## Self-Check: PASSED

- All 7 created files + 2 evidence screenshots exist on disk.
- All 3 task commits present: `3179f24`, `6811c61`, `ef0eb7d`.
- `grep -c "var(--accent)" controls.css` = 0; scrubber unit (5) + full repo suite (215 pass / 3 skip) + `npm run build -w site` all green; `selection.spec.ts` 10/10 on the preview build.
- No stray untracked files; no unexpected deletions.

---
*Phase: 04-selection-instant-recompute*
*Completed: 2026-07-20*
