---
phase: 05-score-coloring-ranking
reviewed: 2026-07-20T12:47:59Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - site/src/data/averages.ts
  - site/src/map/markers.ts
  - site/src/map/score-color.ts
  - site/src/ui/legend.ts
  - site/src/ui/rankedList.ts
  - site/src/main.ts
  - site/src/styles/score.css
  - site/src/styles/tokens.css
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: fixed
fixed_at: 2026-07-20
fixes:
  WR-01: fixed (7b1145e, 248e91a)
  WR-02: fixed (248e91a)
  IN-01: fixed (eb08ae9)
  IN-02: skipped (stale frame self-corrects — not worth churn)
  IN-03: fixed (a003ee5, comment-only accuracy note)
---

# Phase 5: Code Review Report

**Reviewed:** 2026-07-20T12:47:59Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** fixed

> **Fix pass (2026-07-20):** WR-01 fixed (`7b1145e`, `248e91a`), WR-02 fixed (`248e91a`),
> IN-01 fixed (`eb08ae9`), IN-03 fixed (comment-only, `a003ee5`). IN-02 intentionally skipped
> (stale frame self-corrects via the idle handler — not worth churn). Unit + `tsc --noEmit -p
> site` (0 errors) + build + full E2E (50 passing) all green after the pass.

## Summary

Reviewed the Phase-5 score-coloring + ranked-list surface: the `combine()`-driven
`MarkerDatum.score` derivation (`averages.ts`), the BuGn ramp (`score-color.ts`), the
marker score bar/badge render (`markers.ts`), the legend (`legend.ts`), the ranked panel
(`rankedList.ts`), the wiring (`main.ts`), and the two CSS files.

The core correctness surface is **sound**, and several of the trickiest claims verified clean:

- **Score derivation is correct.** The dry-station gate is right: `rainScore` requires
  `hasPrecipQual` (≥1 non-null in-window rain reading) AND `rainTotalMm != null`. A
  no-rain-gauge station (`hasPrecipQual === false`) passes `null` → `combine()` renormalizes
  ("án úrkomu"), never scored dry-as-10. A genuinely-dry-but-recording station
  (`hasPrecipQual === true`, `rainTotalMm === 0`) → `rainComponent(0) === 10`, correctly
  scored excellent. The N≥3 coverage gate collapses all metrics (including rain) to muted.
  The `combine()` null/renormalization contract is honored; the muted path
  (`mutedDatum` / `sufficient === false`) yields `score:null, missingRain:true` in lockstep.
- **`score-color.ts` is exact.** Verified by executing the ramp: `scoreColor(0..10)` matches
  every `--score-*` token in `tokens.css` byte-for-byte at each integer stop; below-0/above-10
  clamp to the endpoints; `NaN`/`Infinity` resolve to the low stop; no off-by-one in stop
  interpolation (`Math.min(floor(seg), BUGN.length-2)`); never returns `#c0392b` or a
  non-`#rrggbb` string.
- **No XSS.** The only `innerHTML` (markers.ts:281) receives `formatCallout` output built
  exclusively from `Math.round(...)` numbers and static Icelandic literals — `datum.name`
  never enters it (name → `aria-label` via `setAttribute`; ranked-list name/score →
  `textContent`). Legend copy is all static `textContent`. No reflected data reaches markup.
- **No secrets, no new npm deps.** Clean.
- **No new tsc errors.** The only `tsc --noEmit` failures are the tracked pre-existing ones
  (`recompute.test.ts`, `store.test.ts`, `url.ts:66`); none originate in a Phase-5 file.
- **Renderer hygiene:** `renderComposite` replaces overlay children in one pass (no stale-node
  churn); `attachCompositeRenderer` is idempotent (detaches the prior `idle`/`move` pair);
  ranked `rankStations` sort is stable with an explicit `station` id tie-break and excludes
  nulls; z-index/pointer-events stacking across legend/ranked/control-bar/overlay is coherent.

Two WARNING-level issues and three INFO items remain, detailed below.

## Warnings

### WR-01: Re-selecting the already-selected ranked row leaves the discrete history flag dangling

**STATUS: FIXED** (`7b1145e` shared seam + `248e91a` call site). Added a `setDiscrete(store, patch)`
seam in `history.ts` that arms the discrete flag ONLY when the patch will actually change state,
and routed the ranked-row click and controlBar width/year controls through it. Node-level
regression test in `history.test.ts` reproduces the re-click → continuous-change sequence and
asserts no spurious pushState.

**File:** `site/src/ui/rankedList.ts:203-206` (root cause: `site/src/state/history.ts:25-41`, `site/src/state/store.ts:83-93`)
**Issue:** The row-click handler calls `markDiscrete()` (sets the one-shot `pendingDiscrete = true`)
and then `store.set({ stationId: datum.station })`. When the clicked station is ALREADY the
selected `stationId`, the store's no-op skip (`store.ts:88`) returns early without notifying —
so the URL-writer subscriber never runs, and `writeUrl()` (the only place `pendingDiscrete` is
cleared) never fires. The flag stays `true`. The NEXT genuinely-continuous change (e.g. a
scrubber drag, which should `replaceState`) then incorrectly fires `pushState`, injecting a
spurious back-button history entry and corrupting the discrete/continuous history discipline
(UX-02). Clicking an already-highlighted "best place" is a natural, easy-to-hit gesture.

Note the same latent pattern exists in `controlBar.ts` (a width/year re-select), so the true
fix belongs at the shared seam, but the ranked-row re-click is a NEW trigger this phase.

**Fix:** Guard the discrete mark so it is only armed when the set will actually change state, or
have `markDiscrete()` cleared defensively. Simplest at the call site:
```ts
btn.addEventListener("click", () => {
  if (store.get().stationId === datum.station) return; // already selected → no-op, don't arm the flag
  markDiscrete();
  store.set({ stationId: datum.station });
});
```
Or, more robustly, clear `pendingDiscrete` inside the store's no-op-skip path / make
`markDiscrete` pair atomically with an actual notification.

### WR-02: Ranked-list `refresh()` rebuilds the whole `<ol>` on every recompute — drops keyboard focus and scroll position

**STATUS: FIXED** (`248e91a`). `refresh()` now reconciles rows by immutable `data-station`:
updates survivors in place, adds/removes the delta, and reorders via `insertBefore` moves so a
focused/scrolled row keeps its node identity across a recompute. E2E in `score.spec.ts` asserts
keyboard focus survives a recompute.

**File:** `site/src/ui/rankedList.ts:213-225`
**Issue:** `refresh()` calls `list.replaceChildren()` and rebuilds every `<li>` from scratch on
each recompute (fired from `renderForState` on any selection-relevant change, debounced 120ms).
If a keyboard user has focused a row `<button>` (or scrolled the list) while adjusting the
scrubber/year range, the rebuild discards the focused node → focus falls back to `<body>`,
breaking keyboard navigation continuity, and the scroll offset resets. For a screen-reader user
mid-list this is a silent context loss. The rows are keyed by immutable `station` id already
(`li.dataset.station`), so a reconcile (update-in-place by station id) would preserve both.

**Fix:** Reconcile instead of wholesale replace — diff the ranked set against existing
`li[data-station]` nodes, updating rank/score/order in place and only adding/removing the delta,
so a focused/scrolled row survives a recompute. At minimum, capture
`document.activeElement`'s `data-station` before `replaceChildren()` and restore focus to the
matching rebuilt row afterward.

## Info

### IN-01: Scored pill's 5px left border offsets the pill ~2px from its true station coordinate

**STATUS: FIXED** (`eb08ae9`). Compensated the scored pill's `translate` by 2px
(`translate(calc(-50% - 2px), -50%)`) so scored and muted pills anchor identically on
`map.project([lon,lat])`, without touching layout or hit-area.

**File:** `site/src/styles/score.css:26-32` (with `site/src/styles/markers.css` `.marker-pill` `transform: translate(-50%, -50%)`)
**Issue:** `.marker-pill--scored` sets `border-left: 5px` while the other three sides keep the
base `1px` (`markers.css`). The pill is centered on its coordinate via
`transform: translate(-50%, -50%)`, which centers the (now 4px-wider-on-the-left) bounding box —
shifting the visible content ~2px right of the actual station point. Scored vs. muted pills
therefore anchor slightly differently. Purely cosmetic sub-pixel drift, but it means a scored
marker's centroid no longer sits exactly on `map.project([lon,lat])`.
**Fix:** Draw the score bar as an inset `box-shadow`/pseudo-element or a `border-image`/inner bar
that does not change the box geometry, or compensate the translate for scored pills, so scored
and muted pills anchor identically.

### IN-02: `renderComposite` runs synchronously right after `setData`, drawing one stale frame

**STATUS: SKIPPED** (self-corrects). The `idle` handler re-draws with fresh placement shortly
after, so there is no persistent incorrectness — not worth the churn per the fix-scope decision.

**File:** `site/src/main.ts:130-131`
**Issue:** `renderForState` calls `installMarkerLayer(map, data)` (which `setData`s the GeoJSON
source) and then `renderComposite(map)` on the very next line. `queryRenderedFeatures` reflects
the PREVIOUS placement until MapLibre re-renders, so this immediate call can paint pills from
the prior selection for one frame. The `idle` handler wired by `attachCompositeRenderer`
re-draws with the fresh placement shortly after, so it self-corrects — no persistent
incorrectness — but the synchronous call is effectively redundant and can flash stale data
(e.g. an old score badge) between a scrubber settle and the next `idle`.
**Fix:** Drop the immediate `renderComposite(map)` from `renderForState` and rely on the `idle`
handler, or `requestAnimationFrame` the composite draw so it reads post-`setData` placement.

### IN-03: `formatScore` clamp/`replace` guards a contract that upstream already guarantees (dead defensive branch)

**STATUS: FIXED** (`a003ee5`, comment-only). Added a note clarifying the non-finite guard is
unreachable hardening (not a live invariant); left the guard in place as intentional defense.

**File:** `site/src/map/markers.ts:33-36`
**Issue:** `formatScore` accepts `score: number` and defends against non-finite input
(`Number.isFinite ? clamp : 0`). Every caller (`buildPill` at markers.ts:290-297 gated on
`datum.score !== null`, and `rankedList.ts:198` gated by `rankStations`' null filter) only ever
passes a finite `combine()`-produced number. The defensive branch is unreachable in practice.
Not a bug — belt-and-suspenders is reasonable for a formatter — but the comment at
markers.ts:29-31 overstates it as load-bearing. Noting for accuracy, not action.
**Fix:** None required; optionally trim the comment claim or keep as intentional hardening.

---

_Reviewed: 2026-07-20T12:47:59Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
