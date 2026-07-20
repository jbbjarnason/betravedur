---
phase: 04-selection-instant-recompute
verified: 2026-07-20T10:50:00Z
status: gaps_found
score: 5/5 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Full E2E suite passes without regressions"
    status: failed
    reason: "Phase 4 moved window.__map assignment inside the async install() function (post-manifest fetch). shell.spec.ts:62 ('interactivity: zooming in raises the map zoom level') reads window.__map immediately after the canvas is visible, before the manifest fetch completes. This test passed with Phase 3's main.ts (where __map was set synchronously in boot()). The regression is introduced by Phase 4's wireMarkers refactor."
    artifacts:
      - path: "site/tests/e2e/shell.spec.ts"
        issue: "Test at line 62 reads window.__map without waiting for it to be set (no waitForMarkers / poll). With Phase 3 main.ts it was set synchronously; with Phase 4 it is deferred past the manifest fetch."
      - path: "site/src/main.ts"
        issue: "window.__map is now set inside wireMarkers() → install() (async, post-manifest), not synchronously in boot() as in Phase 3. shell.spec.ts's interactivity test does not wait for __map to be available."
    missing:
      - "Either move window.__map assignment to boot() immediately after initMap() (synchronous, pre-manifest, mirrors Phase 3 behavior) so shell.spec.ts can access it without waiting; OR add a waitFor(__map) guard to the shell.spec.ts interactivity test."
---

# Phase 4: Selection & Instant Recompute — Verification Report

**Phase Goal:** The core interaction loop — the visitor picks a time-of-year window and a baseline year range and the map recomputes and recolors instantly in-browser with no network fetch, every average honestly labeled with the years it is based on, and the full selection encoded in a shareable URL.
**Verified:** 2026-07-20T10:50:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Verification Method

Full goal-backward verification: ROADMAP success criteria decomposed to observable truths, each truth verified against codebase (code read + grep) and a live build + test run. `npm run build -w site`, `npx vitest run`, and `npm run e2e -w site` were all executed by the verifier.

---

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | User can select a time-of-year window of 1 week, 2 weeks, 3 weeks, or 1 month | VERIFIED | `site/src/ui/widthButtons.ts`: `WIDTHS` array = `[{label:"1 vika",days:7},{label:"2 vikur",days:14},{label:"3 vikur",days:21},{label:"1 mánuður",days:30}]`. E2E criterion 2+3 asserts exactly 4 buttons in order with single aria-pressed; criterion 4 asserts clicking "1 mánuður" sets `__store.get().widthDays === 30` with 0 /data/ requests. All pass. |
| SC-2 | User can select the baseline year range averages are computed over (e.g. 2010–2015) | VERIFIED | `site/src/ui/yearRange.ts`: Frá/Til `<select>`s populated from `{min, max}` manifest-union bounds; Frá ≤ Til enforced on change. `site/src/state/defaults.ts` `yearBounds()` uses `Math.min` of all `entry.from`, `Math.max` of all `entry.to` (UNION, not intersection). E2E criterion 7 reads manifest.json directly and asserts dropdown options match the manifest union bounds. |
| SC-3 | Every displayed average shows "meðaltal N ára" where N reflects actual data coverage, not the picker range | VERIFIED | `site/src/data/averages.ts` `computeMarkerDatum()`: `yearRange` param filters `groupBySeasonYear`'s Map keys BEFORE `qualifyingYears()`/`effectiveN()`. Unit test: AWS #1350 range 2010–2026 → n=15, picker span=17 (n ≠ span, proven). `controlBar.ts` `readoutText()` renders single N or `N–M ára` or `ófullnægjandi gögn` all via `textContent`. E2E criterion 10 asserts `/meðaltal \d+(–\d+)? ára|ófullnægjandi gögn/`. |
| SC-4 | Changing period or year range recomputes and recolors the map instantly client-side, with no page reload and no network fetch | VERIFIED | `site/src/state/recompute.ts` imports no loader and contains zero `fetch()` / `loadDerived()` calls. `site/src/main.ts` contains exactly 1 `await loadDerived` (boot fetch only). E2E criteria 4 (width change), 6 (anchor change via `__store.set`), and 8 (year dropdown change) each use `page.on('request')` to assert `dataRequests === 0` while markers visibly rerender. Criterion 15 proves no full-page reload (sentinel survives). All pass. |
| SC-5 | Period, year range, selected station, and map viewport are encoded in the URL so a copied link restores the exact view | VERIFIED | `site/src/state/url.ts` `stateToParams()` serializes `doy/w/fra/til/st/v`. `paramsToState()` clamps every field defensively (doy 1–365, w∈{7,14,21,30}, fra/til within data bounds fra≤til, viewport within Iceland maxBounds, zoom 4–12; never throws, never NaN — garbage-input unit test). `site/src/state/history.ts` `writeUrl()` uses pushState for discrete changes (width/year), replaceState for continuous (scrubber/pan). E2E criterion 12 confirms URL contains doy/w/fra/til/v after interaction; criterion 13 loads `/?doy=30&w=30&fra=2015&til=2026&v=64.5,-20.0,7` and asserts store, aria-pressed button, scrubber aria-valuenow, Frá/Til selects, and map zoom all match; criterion 14 asserts no-params default is today's doy + 1 vika + last-10-years (NOT the old {197,14} fixed window). All pass. |

**Score: 5/5 ROADMAP success criteria VERIFIED**

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `site/src/state/store.ts` | SelectionState type + createStore observable (get/set/subscribe) | VERIFIED | Exports `SelectionState` interface and `createStore()`. `Object.freeze` on every snapshot; no-op-skip (patched-keys equality check); `Set<Listener>` subscriber set; unsubscribe closure. Zero new npm imports. |
| `site/src/data/window.ts` | anchorDoy+widthDays → WindowSpec (wrap-aware), pure | VERIFIED | `anchorToWindow(anchorDoy, widthDays)`: `startDoy = anchorDoy; endDoy = anchorDoy + widthDays - 1; if (endDoy > 365) endDoy -= 365`. `endDoy -= 365` wrap present. Unit tests include late-December wrapping case. |
| `site/src/state/recompute.ts` | recompute(cache, state) over cached files, no fetch | VERIFIED | `buildStationCache()` + `recompute()` + `mutedDatum()` (SSOT). Zero `fetch` / `loadDerived` in this file. Corrupt-file degrades to muted datum (try/catch). |
| `site/src/data/averages.ts` | computeMarkerDatum gains yearRange param filtering season-year keys | VERIFIED | `yearRange?` param present (line 90). Filter: `new Map([...allYears].filter(([y]) => y >= yearRange.from && y <= yearRange.til))` applied before `qualifyingYears`/`effectiveN`. |
| `site/src/ui/controlBar.ts` | mounts the bottom bar, wires each control to store.set, renders global N readout | VERIFIED | `mountControlBar(store, bounds, getLatestData)`: mounts `.control-bar` into `document.body`, wires anchor/width/range to `store.set`, subscribes for N readout via `readoutText(getLatestData())`. |
| `site/src/ui/scrubber.ts` | native range doy scrubber + Icelandic Intl date label + narrow-screen stepper | VERIFIED | `doyLabel` (Intl is-IS, 2001 non-leap reference), `windowLabel`, `createScrubber` with `<input type="range">`, aria-live readout, month ticks, `‹ › stepper`, `syncDoy` for URL restore. |
| `site/src/ui/widthButtons.ts` | segmented 1v/2v/3v/1mán radio-group buttons | VERIFIED | `role="group"` aria-label "Lengd tímabils", 4 buttons with exact Icelandic labels, single `aria-pressed="true"`, `syncWidth` for URL restore. |
| `site/src/ui/yearRange.ts` | Frá/Til selects bounded by data, start≤end guard | VERIFIED | Native `<select id="year-from">` / `<select id="year-til">` populated min..max; Frá change bumps Til up, Til change bumps Frá down; `syncRange` for URL restore. |
| `site/src/styles/controls.css` | control-bar surface + scrubber/button/select styling on Phase 3 tokens | VERIFIED | `position:fixed; bottom:0`. `var(--accent)` count === 0 (grep-confirmed). Phase 3 tokens used throughout. |
| `site/src/state/url.ts` | stateToParams / paramsToState (URLSearchParams round-trip, defensive clamp) | VERIFIED | `stateToParams`: serializes doy/w/fra/til/st/v (lat.toFixed(4),lng.toFixed(4),zoom.toFixed(2)). `paramsToState`: clamp doy[1,365], snap w to {7,14,21,30}, clamp fra/til[bounds.min,bounds.max] fra≤til, clamp viewport, parse st to int or null; never throws, never NaN. |
| `site/src/state/defaults.ts` | yearBounds(manifest) union + defaultSelection(bounds, now) | VERIFIED | `yearBounds`: union via `Math.min(min, entry.from)` / `Math.max(max, entry.to)` with `{thisYear-10, thisYear}` fallback. `defaultSelection`: `leapFoldedDoy(now.toISOString())`, widthDays 7, yearTil=bounds.max, yearFrom=max(bounds.min,bounds.max-9), stationId null, lng -19/lat 65/zoom 6. |
| `site/src/state/history.ts` | writeUrl + markDiscrete — loop-proof push/replace | VERIFIED | `markDiscrete()` one-shot flag; `writeUrl()` pushState when flag set (discrete: width/year), else replaceState (continuous: scrubber/pan). No isUpdating flag. |
| `site/tests/e2e/selection.spec.ts` | 16-test E2E covering all Phase 4 criteria | VERIFIED | 16/16 Chromium tests pass on preview build (Plans 02+03). |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `site/src/main.ts` | `site/src/state/store.ts` | `store.subscribe` drives debounced recompute | VERIFIED | Line 172: `store.subscribe((state) => writeUrl(state))`. Line 174: `store.subscribe((state) => { clearTimeout(timer); timer = setTimeout(() => renderForState(...), 120) })`. Both subscriptions confirmed. |
| `site/src/state/recompute.ts` | `site/src/data/averages.ts` | `computeMarkerDatum` over cached DerivedFile | VERIFIED | Line 7: `import { computeMarkerDatum } from "../data/averages.js"`. Used in `recompute()` at line 70. |
| `site/src/ui/controlBar.ts` | `site/src/state/store.ts` | each control's change handler calls `store.set(...)` | VERIFIED | `grep -c "store.set" controlBar.ts` = 7 (anchor, width, year, plus subscription re-syncs). |
| `site/src/main.ts` | `site/src/ui/controlBar.ts` | `mountControlBar(store, bounds)` called in boot | VERIFIED | Line 164: `mountControlBar(store, bounds, () => latestData)`. |
| `site/src/main.ts` | `site/src/state/url.ts` | store.subscribe writes URL; popstate reads URL | VERIFIED | `stateToParams` / `paramsToState` both appear in main.ts (grep count = 3). `addEventListener("popstate"` present at line 178. |
| `site/src/main.ts` | `site/src/state/defaults.ts` | `defaultSelection` seeds the store when no params | VERIFIED | Line 147: `location.search ? paramsToState(...) : fallback` where `fallback = defaultSelection(bounds)`. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `site/src/main.ts` → `renderForState` | `MarkerDatum[]` (recomputed) | `recompute(cache, state)` over boot-cached `DerivedFile` entries; `computeMarkerDatum(meta, file, window, range)` → domain math | Yes — cache built from real `loadDerived` boot fetch; `recompute` applies `anchorToWindow + yearRange` to the in-memory cache | FLOWING |
| `site/src/ui/controlBar.ts` → `readout.textContent` | `readoutText(getLatestData())` | `getLatestData()` returns `latestData` (module-level snapshot updated on every `renderForState` call in main.ts) | Yes — derived from same real `MarkerDatum[]` as the map markers | FLOWING |
| `site/src/ui/yearRange.ts` → Frá/Til option bounds | `{min, max}` | `yearBounds(manifest)` over real `manifest.json` fetched at boot | Yes — E2E criterion 7 reads manifest.json via `page.request.get` and asserts dropdown min/max match the real file | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `npm run build -w site` succeeds | `npm run build -w site` | Exit 0, `dist/` produced (chunk-size warning is pre-existing, unrelated) | PASS |
| Full unit suite (230 tests) | `npx vitest run` | 230 passed / 3 skipped (27 files) | PASS |
| Phase 4 selection.spec.ts (16/16) | `cd site && npx playwright test tests/e2e/selection.spec.ts` | 16 passed | PASS |
| Full E2E suite (28 tests) | `npm run e2e -w site` | **27 passed / 1 failed** — `shell.spec.ts:62` fails ("interactivity: zooming in raises the map zoom level") | FAIL |
| No `isUpdating` flag in main.ts non-comment lines | `grep -vE '^\s*(//|\*)' site/src/main.ts \| grep "isUpdating"` | Exit 1 (absent) — loop-proof by write-always/read-on-popstate asymmetry | PASS |
| `loadDerived` called exactly once (boot fetch only) | `grep -c "await loadDerived" site/src/main.ts` | 1 | PASS |
| Year bounds are UNION | `grep -n "Math.min\|Math.max" site/src/state/defaults.ts` | `Math.min(min, entry.from)` for lower bound, `Math.max(max, entry.to)` for upper bound | PASS |
| Untrusted URL params clamped, no throw | `npx vitest run site/src/state/url.test.ts` | 9 passed including garbage-input and per-field clamp tests | PASS |
| `attachCompositeRenderer` reused once (no stacking) | `grep -c "attachCompositeRenderer" site/src/main.ts` | 2 (import + one call at line 158) | PASS |
| Zero new npm deps | `cat site/package.json` → dependencies section | No additions vs Phase 3: `@betravedur/domain`, `@betravedur/pipeline`, `@protomaps/basemaps`, `maplibre-gl`, `pmtiles` only | PASS |
| `window.__store` exposed | `grep -q "__store" site/src/main.ts` | Present at line 154 | PASS |
| `var(--accent)` absent from controls.css | `grep -c "var(--accent)" site/src/styles/controls.css` | 0 | PASS |
| `replaceState` + `pushState` both present in history.ts | grep | Both present; mechanism documented in file header | PASS |
| `store.set` wired ≥ 3 times in controlBar.ts | `grep -c "store.set" site/src/ui/controlBar.ts` | 7 | PASS |

---

### Probe Execution

No phase-declared probes. The E2E suite (`npm run e2e -w site`) is the equivalent gate — 27/28 pass. The one failure is documented in Gaps Summary.

---

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SEL-01 | 04-01, 04-02 | User can select a 1w/2w/3w/1mo window | SATISFIED | `widthButtons.ts` 4-option group; `anchorToWindow()` wrap-aware WindowSpec; E2E criteria 2+3, 4 pass |
| SEL-02 | 04-01, 04-02, 04-03 | User can select the baseline year range | SATISFIED | `yearRange.ts` manifest-bounded Frá/Til; `yearBounds()` UNION; `paramsToState` clamped; E2E criterion 7 (bounds match manifest), criterion 14 (default = last 10 years) |
| SEL-03 | 04-01, 04-02 | "meðaltal N ára" from real coverage, not picker span | SATISFIED | `computeMarkerDatum yearRange` param filters before `effectiveN`; unit test proves N≠span; `readoutText()` renders honest N via textContent; E2E criterion 10 |
| SEL-04 | 04-01, 04-02 | Instant client-side recompute, no network fetch, no reload | SATISFIED | `recompute.ts` zero fetch; boot cache only; E2E criteria 4,6,8 assert dataRequests===0; criterion 15 proves no reload |
| UX-02 | 04-03 | Full UI state in URL, copied link restores exact view | SATISFIED | `url.ts` round-trip; `history.ts` push/replace discipline; `popstate` only URL→store path; E2E criteria 12,13,14,15, back-button test all pass |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `site/src/main.ts` | 153–154 | `window.__map` assigned inside async `install()` (post-manifest) — was synchronous in Phase 3's `boot()` | BLOCKER | shell.spec.ts:62 reads `__map` without waiting for it; test fails ("Cannot read properties of undefined (reading 'getZoom')"). Regression introduced by Phase 4's wireMarkers refactor. |

No TBD / FIXME / XXX / TODO / HACK / PLACEHOLDER markers found in Phase 4 files. No stub return patterns in the production data path.

---

### Observation: Known Layout Issue (Not a Phase 4 Gap)

Per the user directive, the following is recorded as an observation only and does NOT affect the phase verdict:

The bottom `.control-bar` (position: fixed; bottom: 0) overlaps the MapLibre `AttributionControl` (position: bottom-right). The CC BY 4.0 / OpenStreetMap / Veðurstofan attribution text is partially occluded by the control bar's translucent surface. This is visible in the evidence screenshot `04-02-controls-default.png`. The attribution text is present in the DOM and passes the E2E attribution assertion (the test expands the compact control before asserting text), but it is visually obscured in normal use. This is being routed to UI review / Phase 7 for a layout fix (e.g., `margin-bottom` on the MapLibre attribution or repositioning it).

---

### Human Verification Required

None required. Per the user directive, all verification was performed programmatically. The two Manual-Only visual verifications from 04-VALIDATION.md (controls legible over map; markers visibly recompute) were satisfied by E2E screenshot evidence captured by the executor and self-inspected (04-02-SUMMARY.md §Screenshot self-inspection).

---

## Gaps Summary

**One gap blocks passage:** The Phase 4 refactoring of `main.ts` moved `window.__map` assignment from the synchronous `boot()` function into the async `install()` function (which completes only after the manifest/station files are fetched). The Phase 3 `shell.spec.ts:62` "interactivity: zooming in raises the map zoom level" test reads `window.__map` immediately after waiting for the canvas to be visible, without waiting for the async data load that now gates `__map` assignment. The test passed in Phase 3 and now fails.

**Root cause:** `wireMarkers()` → `install()` (async) sets `window.__map` at line 153. The canvas is visible almost immediately once MapLibre renders. The manifest fetch is network I/O and arrives later. `shell.spec.ts:62` bridges this gap with only a 15s canvas visibility wait, not a `window.__map` readiness wait.

**Fix options (either is sufficient):**
1. Move `(window as unknown as {...}).__map = map` to `boot()`, immediately after `initMap()` (one line, mirrors Phase 3 behavior, zero functional impact — `__map` is the live map instance and is set before any data loads).
2. Add a `waitForFunction(() => !!(window as any).__map)` guard to `shell.spec.ts:62` before reading `window.__map`.

Option 1 is preferred: it restores the synchronous `__map` exposure that Phase 3 established as a contract, keeps the test unchanged, and is a one-line change.

All 5 ROADMAP success criteria for Phase 4 are VERIFIED against the codebase and the 16/16 selection.spec.ts E2E tests. The phase goal is functionally achieved. The single gap is a test-regression in a Phase 3 spec caused by the main.ts refactor.

---

_Verified: 2026-07-20T10:50:00Z_
_Verifier: Claude (gsd-verifier)_
