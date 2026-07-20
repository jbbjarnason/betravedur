---
phase: 04-selection-instant-recompute
plan: 03
subsystem: ui
tags: [url-state, history-api, urlsearchparams, defensive-clamp, viewport-sync, popstate, playwright, vanilla-ts]

# Dependency graph
requires:
  - phase: 04-selection-instant-recompute (Plan 01)
    provides: "createStore (get/set/subscribe, no-op-skip), SelectionState, boot-cache recompute (no fetch), window.__store"
  - phase: 04-selection-instant-recompute (Plan 02)
    provides: "mountControlBar + scrubber/widthButtons/yearRange builders, manifest-union bounds, readout, selection.spec.ts"
  - phase: 03-map-markers
    provides: "initMap (maxBounds/min-max zoom), installMarkerLayer/renderComposite idempotent renderer, boot fetch-once path"
  - phase: 01-foundation
    provides: "@betravedur/domain leapFoldedDoy (leap-fold contract)"
provides:
  - "stateToParams / paramsToState — loop-proof state↔URL round-trip with defensive clamp of every param (doy 1-365, w∈{7,14,21,30}, fra/til∈bounds fra≤til, viewport∈Iceland maxBounds, zoom 4-12); never throws, never NaN (T-04-05/06)"
  - "yearBounds(manifest) UNION + defaultSelection(bounds, now) — today's-week / last-10-years data-derived runtime default (replaces the Phase-3 fixed DEFAULT_WINDOW)"
  - "writeUrl + markDiscrete — the store→URL writer: pushState for discrete (width/year), replaceState for continuous (scrubber/pan-zoom); no isUpdating flag"
  - "main.ts URL-hydration-or-default + popstate reader + moveend viewport sync (map owns camera; store→map jumpTo only on boot/popstate)"
  - "control sync* methods (syncWidth/syncDoy/syncRange) + scrubber aria-valuenow — URL→DOM re-sync on popstate/boot without re-firing callbacks"
  - "selection.spec.ts URL-state E2E — crafted-URL restore, default-when-no-params, back-button popstate, URL-encodes-selection, no-reload (16 tests green)"
affects: [score-palette (Phase 5), chart-panel (Phase 6), loading-states (Phase 7)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Loop-proof URL round-trip: write-always (writeUrl on every store change) / read-on-popstate-only; pushState/replaceState never fire popstate so no isUpdating flag is needed (RESEARCH Pattern 2, CITED MDN)"
    - "Discrete-vs-continuous history at the call site via a one-shot markDiscrete() flag read-and-cleared by writeUrl — the store carries no interaction kind"
    - "Defensive URL parse (ASVS V5): Number-coerce + reject NaN/out-of-range → clamp or fallback; a garbage/hostile query can never throw or push NaN into the recompute"
    - "Camera↔store loop avoidance (Pitfall 4): map owns its viewport during interaction (moveend→store→replaceState); store→map jumpTo only on boot/popstate, guarded by viewportMatches value-comparison (not a flag)"
    - "Store created AFTER manifest fetch so URL hydration + the data-derived default both have real year bounds to clamp/derive from"

key-files:
  created:
    - site/src/state/url.ts
    - site/src/state/url.test.ts
    - site/src/state/defaults.ts
    - site/src/state/defaults.test.ts
    - site/src/state/history.ts
  modified:
    - site/src/main.ts
    - site/src/ui/controlBar.ts
    - site/src/ui/widthButtons.ts
    - site/src/ui/scrubber.ts
    - site/src/ui/yearRange.ts
    - site/tests/e2e/selection.spec.ts

key-decisions:
  - "Store creation moved from boot() into wireMarkers()'s install() (post-manifest) so URL hydration + defaultSelection both use data-derived union bounds; the Plan-01 bootstrap placeholder (yearFrom:1/yearTil:9999) is deleted"
  - "Discrete/continuous history modelled with a one-shot markDiscrete() flag in a dedicated history.ts module (read-and-cleared by writeUrl) — not a state field; width/year controls call it, scrubber + pan/zoom stay continuous (replaceState)"
  - "Controls gained URL→DOM sync* methods that set DOM WITHOUT firing their onChange callbacks; controlBar subscribes to the store and re-syncs on external (popstate) changes — the back-button reverts the visible controls, not just the store"
  - "scrubber aria-valuenow set explicitly on every value change (native <input type=range> exposes it to the a11y tree but not as a queryable DOM attribute) so the crafted-URL restore E2E can assert the restored anchor"
  - "Viewport param encoded as one compact v=lat,lng,zoom (toFixed 4/4/2); viewport clamp bounds mirror map/init.ts maxBounds (lng[-26,-12], lat[62.5,67.5], zoom[4,12])"

patterns-established:
  - "url.ts/history.ts are pure of DOM/history except writeUrl's single history call — main.ts owns wiring; the round-trip's loop-proofness is a structural property (asymmetry), not a runtime guard"
  - "Every URL param has a fallback path: absent → fallback value, garbage → fallback/clamped value; paramsToState is total (defined for all input) and NaN-free by construction"

requirements-completed: [UX-02, SEL-02]

# Metrics
duration: 7.5 min
completed: 2026-07-20
---

# Phase 4 Plan 03: URL-State Slice Summary

**A loop-proof state↔URL round-trip (write-always via `writeUrl`, read-only-on-`popstate`; no `isUpdating` flag) with a defensively-clamped `paramsToState` that turns any crafted/hostile query into a safe selection (no throw, no NaN), a data-derived `defaultSelection` (today's leap-folded doy, 1 vika, last-10-of-the-manifest-union years) that replaces the Phase-3 fixed `DEFAULT_WINDOW`, and `moveend` viewport sync where the map owns its camera — proven end-to-end by a crafted-URL → exact-view-restore E2E (store + active width button + scrubber `aria-valuenow` + Frá/Til + map zoom all match) plus default-when-no-params, back-button popstate, and no-reload. Closes Phase 4.**

## Performance

- **Duration:** ~7.5 min
- **Started:** 2026-07-20T10:26:06Z
- **Completed:** 2026-07-20T10:33:37Z
- **Tasks:** 3 (Task 1 TDD)
- **Files modified:** 11 (5 created, 6 modified)

## Accomplishments

- **url.ts round-trip + defensive clamp (UX-02, T-04-05/06):** `stateToParams` serializes the full selection to `doy/w/fra/til` + `st` (omitted when null) + a compact `v=lat,lng,zoom`. `paramsToState(qs, bounds, fallback)` parses EVERY field defensively — `Number`-coerce, reject NaN/out-of-range, clamp `doy∈[1,365]`, snap `w` to the nearest of `{7,14,21,30}`, clamp `fra/til` into `[bounds.min,bounds.max]` and enforce `fra≤til`, clamp viewport lat/lng within Iceland `maxBounds` and zoom `∈[4,12]`, parse `st` to an integer or keep null. It NEVER throws and NEVER lets NaN reach the store (15 vitest cases incl. a garbage-input matrix + a round-trip-identity test).
- **defaults.ts union bounds + default selection (SEL-02):** `yearBounds` is the UNION (`min`-of-`from`, `max`-of-`to`) across the manifest — generous+honest (per-station honest-N covers stations that can't answer a picked year) with a finite `{thisYear-10, thisYear}` fallback. `defaultSelection` derives today's doy from `now` (NOT hardcoded), `widthDays 7`, `yearTil=bounds.max`, `yearFrom=max(bounds.min, bounds.max-9)`, `stationId null`, the init.ts Iceland framing.
- **history.ts writer + discrete/continuous discipline (UX-02):** `writeUrl(state)` does `pushState` when `markDiscrete()` set the one-shot flag (width/year → back-button-revertable), else `replaceState` (scrubber + pan/zoom → collapse to one history entry, T-04-07). No `isUpdating` flag — the write-always/read-on-popstate asymmetry is the loop-proofing (grep-gated absent from main.ts non-comment lines).
- **main.ts rewired (the load-bearing wiring):** the store is now created AFTER the manifest fetch, hydrated from `location.search ? paramsToState(...) : defaultSelection(...)` — the Plan-01 bootstrap placeholder is deleted. A URL-writer subscribes (writes on every change), a `popstate` listener is the ONLY URL→store read after boot (re-hydrate + restore viewport), and `moveend` mirrors the camera → store (the map owns its viewport; store→map `jumpTo` only on boot/popstate, guarded by `viewportMatches` value-comparison so the boot jumpTo never re-loops — Pitfall 4).
- **Controls re-sync on URL→DOM (UX-02 restore):** `widthButtons.syncWidth`, `scrubber.syncDoy` (+ explicit `aria-valuenow`), and `yearRange.syncRange` set DOM WITHOUT firing their callbacks; `controlBar` subscribes to the store and re-syncs on external (popstate) changes, so the back-button reverts the visible controls, and a crafted URL renders the restored active width button / scrubber value / Frá-Til selects.
- **selection.spec.ts (UX-02 E2E):** 6 new tests — URL-encodes-selection, crafted-URL exact-view restore (store + width button + `aria-valuenow` + Frá/Til + zoom), default-when-no-params (today's doy + last-10-years, NOT the old `{197,14}`), no-reload sentinel, back-button popstate — plus a restore-screenshot. All 16 tests (10 Plan 02 + 6 Plan 03) green on the preview build.

## Task Commits

Each task committed atomically:

1. **Task 1: url.ts round-trip + clamp; defaults.ts union bounds + default (TDD)** — `cc32228` (feat)
2. **Task 2: wire URL hydration/default, URL-writer, popstate, viewport sync into main.ts** — `2ae2427` (feat)
3. **Task 3: E2E crafted-URL restore + default + back-button + no-reload + evidence** — `61673dc` (test)

_Task 1 (TDD): url.test.ts / defaults.test.ts (RED for the round-trip + clamp + union behaviours) and the implementations were authored + run (15 passing) before the single atomic `feat` commit._

## Files Created/Modified

- `site/src/state/url.ts` — stateToParams/paramsToState (round-trip + defensive clamp; param scheme documented in header)
- `site/src/state/url.test.ts` — round-trip identity + garbage-input (no-throw/no-NaN) + per-field clamp cases
- `site/src/state/defaults.ts` — yearBounds (union, finite fallback) + defaultSelection (today's doy, 1 vika, last 10 yr)
- `site/src/state/defaults.test.ts` — union-not-intersection, malformed-manifest fallback, fixed-now default assertions
- `site/src/state/history.ts` — writeUrl (push/replace via markDiscrete one-shot flag); no isUpdating
- `site/src/main.ts` — store created post-manifest, URL-hydrate-or-default, URL-writer + popstate + moveend viewport sync; placeholder removed
- `site/src/ui/controlBar.ts` — markDiscrete() on width/year; store subscription re-syncs controls on popstate
- `site/src/ui/widthButtons.ts` — syncWidth handle (aria-pressed re-sync, no callback)
- `site/src/ui/scrubber.ts` — syncDoy handle + explicit aria-valuenow on every value change
- `site/src/ui/yearRange.ts` — syncRange handle (clamped, no callback)
- `site/tests/e2e/selection.spec.ts` — 6 URL-state tests + restore screenshot

## Decisions Made

- **Store created post-manifest inside `wireMarkers`** so URL hydration and the data-derived default both have real union bounds; the Plan-01 `yearFrom:1/yearTil:9999` placeholder is deleted (not just overwritten).
- **Discrete/continuous via a one-shot `markDiscrete()` flag** in `history.ts` (read-and-cleared by `writeUrl`), set by the width/year control handlers — the interaction kind is known at the call site, not stored in state. Scrubber + pan/zoom stay continuous (replaceState).
- **Controls re-sync via `sync*` methods that never re-fire their callbacks** — the URL→DOM direction is a pure mirror, so a popstate restore updates the visible controls without a feedback loop.
- **`aria-valuenow` set explicitly on the scrubber** because a native range exposes it to the a11y tree but not as a DOM attribute — needed for the crafted-URL restore assertion.
- **Viewport clamp bounds hardcoded in url.ts mirror `map/init.ts` maxBounds/zoom** (documented) — the URL parser must not import the map module (keeps url.ts pure + unit-testable).
- **Camera guard is value-comparison (`viewportMatches`), not a flag** — honours the "no isUpdating flag" constraint while preventing the boot/popstate jumpTo from re-looping through moveend.

## Deviations from Plan

**None — plan executed exactly as written.** All three tasks implemented as specified; every acceptance criterion satisfied. Two design choices below are Issues (mechanism selections the plan explicitly left to discretion), not deviations from intent.

**Total deviations:** 0
**Impact on plan:** None.

## Issues Encountered

- **Discrete-signal mechanism (plan-sanctioned choice).** The plan offered "a `pushNextChange()` flag the URL-writer reads-and-clears … OR route discrete writes through a dedicated helper." Chose the dedicated `history.ts` module exposing `markDiscrete()` (the flag) + `writeUrl()` (the writer) — width/year handlers call `markDiscrete()` before `store.set`. Documented in-code. This is the plan's first listed option, made concrete.
- **Preview base-path redirect (E2E navigation).** The preview server 302-redirects `/` → `/betravedur/`; verified via curl that the redirect PRESERVES the query string (`/?doy=30&w=30` → `/betravedur/?doy=30&w=30`), so `page.goto("/?doy=...")` restores correctly against the `/betravedur/` baseURL. No spec change needed.
- **Store-created-post-manifest ordering.** Because the default selection needs data-derived bounds and `paramsToState` needs bounds to clamp fra/til, the store can only be created after the manifest fetch — so store creation + `window.__store` exposure moved from `boot()` into `install()`. E2E `waitForMarkers` already waits for the control bar (which mounts after the initial render), so `window.__store` is always present before any assertion.

## Known Stubs

None. The Plan-01 bootstrap placeholder (`yearFrom:1/yearTil:9999`) this plan was tasked to replace is **removed** — the runtime default is now the data-derived `defaultSelection`, and the Phase-3 `DEFAULT_WINDOW` constant remains in `types.ts` solely as the compute-fallback (not the app default), as the plan directed.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries. The one attacker-controllable surface (URL query params → store) is the plan's declared boundary and is mitigated per the threat register: T-04-05 (clamp/no-throw/no-NaN, garbage-input test), T-04-06 (`st` parsed to integer; no URL string reflected into the DOM), T-04-07 (replaceState collapses continuous input), T-04-SC (zero new packages — URLSearchParams/History/Intl are platform APIs).

## Verification Evidence

- `npx vitest run site/src/state/url.test.ts site/src/state/defaults.test.ts` → **15 passed** (round-trip + garbage no-throw/no-NaN + clamps + union bounds + default).
- `npm run build -w site` → **succeeds** (strict TS; the pre-existing MapLibre chunk-size warning is unrelated/out of scope).
- `npm test` (full repo) → **230 passed | 3 skipped** (27 files), no regressions (+15 from Plan 03 unit tests).
- `cd site && npm run e2e -- selection.spec.ts` → **16 passed** on the Chromium preview build (10 Plan 02 + 6 Plan 03: URL-encodes, crafted-URL restore, default-no-params, no-reload, back-button).
- Grep gates: `grep -c "paramsToState\|stateToParams" main.ts` = 3; `defaultSelection`/`yearBounds`/`addEventListener("popstate"`/`moveend`/`jumpTo` all present in main.ts; `grep -vE '^\s*(//|\*)' main.ts | grep -q "isUpdating"` → exit 1 (ABSENT — loop-proof by asymmetry); `replaceState` + `pushState` both present in history.ts; `toFixed(4)` + doy-clamp `365` present in url.ts.

### Screenshot self-inspection (satisfies the no-review directive)

**`evidence/04-03-url-restore.png`** — loaded the crafted URL `?doy=30&w=30&fra=2015&til=2026&v=64.5,-20.0,7` and inspected the render: the **"1 mánuður"** width button is active (filled/bold — matches `w=30`); the scrubber readout shows **"30. jan – 28. feb"** (a 30-day window anchored at doy 30 = 30 January — matches `doy=30`+`w=30`) with the thumb + painted span at the track's left edge; the **Frá 2015 / Til 2026** dropdowns match `fra`/`til`; the map is framed on southwest Iceland (Faxaflói/Reykjavík) consistent with `v=64.5,-20.0,7` (zoom 7); markers show the recomputed winter values (`1°`) with a **`meðaltal 12 ára`** readout (honest N for the restored 2015–2026 baseline). Every restored control and the map framing match the URL params — the exact-view restore is confirmed.

## Next Phase Readiness

- **Phase 4 is COMPLETE.** All UI-SPEC selection/URL criteria and the SEL-01..04 + UX-02 requirements are green end-to-end on the preview build. The selection-state single-source-of-truth (store + URL round-trip + data-derived default + instant no-fetch recompute) is the foundation Phase 5 (score palette/legend) and Phase 6 (station click → chart panel) read from — both already have their seams (`stationId` is encoded in the URL now; the neutral marker surface is chromatically free for the Phase 5 score scale).
- No blockers. Zero new dependencies (STACK zero-dep discipline preserved through all of Phase 4).

## Self-Check: PASSED

- All 5 created files exist on disk (url.ts/.test.ts, defaults.ts/.test.ts, history.ts) + the restore screenshot.
- All 3 task commits present: `cc32228`, `2ae2427`, `61673dc`.
- Full unit suite (230 pass / 3 skip) + `npm run build -w site` + `selection.spec.ts` (16/16 on the preview build) all green.
- No stray untracked files; no unexpected deletions.

---
*Phase: 04-selection-instant-recompute*
*Completed: 2026-07-20*
