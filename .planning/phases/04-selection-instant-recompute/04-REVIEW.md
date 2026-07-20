---
phase: 04-selection-instant-recompute
reviewed: 2026-07-20T10:48:52Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - site/src/state/store.ts
  - site/src/state/url.ts
  - site/src/state/history.ts
  - site/src/state/defaults.ts
  - site/src/state/recompute.ts
  - site/src/data/averages.ts
  - site/src/data/window.ts
  - site/src/ui/controlBar.ts
  - site/src/ui/scrubber.ts
  - site/src/ui/widthButtons.ts
  - site/src/ui/yearRange.ts
  - site/src/main.ts
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: fixed
fixed_at: 2026-07-20
fix_commits:
  CR-01: 66c7cc0
  WR-01: 960ddd1
  WR-02: 960ddd1
  WR-03: 960ddd1
  WR-04: e516ec3
  IN-01: e516ec3
  IN-02: e516ec3
  IN-03: e516ec3
---

# Phase 4: Code Review Report

**Reviewed:** 2026-07-20T10:48:52Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Phase 4 adds a vanilla-TS observable store, a loop-proof state↔URL round-trip, discrete/continuous history discipline, data-derived defaults, instant client-side recompute, and the bottom control bar (scrubber / width buttons / year range). The loop-prevention architecture (write-always / read-on-popstate, no `isUpdating` flag) is sound: `pushState`/`replaceState` do not fire `popstate`, so a URL write cannot re-trigger a URL read, and no store `set` is issued during a URL write. `jumpTo`→`moveend`→store is guarded by `viewportMatches` plus the store's no-op-skip, so the camera↔store path does not loop. Confirmed clean on the requested items: **no secrets**, **no XSS** (URL `st` is parsed to an integer and never reflected to the DOM; station names reach the DOM only via `setAttribute("aria-label", ...)`, and `formatCallout`'s `innerHTML` interpolates only numeric/enumerated fields, never `name`), and **no new npm dependencies**.

One BLOCKER was found: the URL parser's `doy`/`fra`/`til` fields fall into the `Number(null) === 0` / `Number("") === 0` trap because — unlike the correctly-guarded `w` and `st` fields — they use a bare `Number.isFinite(...)` check with no `p.has(...)` guard. A partial URL (a truncated share link, or a Phase-6 `?st=42` deep link) silently overrides the anchor to Jan 1 and collapses the year range to `[bounds.min, bounds.min]` instead of falling back to the intended defaults. This is a real correctness/robustness defect that the happy-path E2E (which always writes a complete URL) will not catch.

The 4 pre-tracked items (async `window.__map` regression, attribution footer occlusion, per-marker N in aria-label, scrubber date format divergence) were confirmed present but are NOT re-reported below.

## Critical Issues

### CR-01: Missing `p.has()` guard makes absent/empty `doy`/`fra`/`til` params silently override the fallback (Number(null)===0 trap)

**FIXED (66c7cc0):** Added a `numParam()` presence+non-empty guard (treats `null` or empty-trimmed as absent, garbage NaN → fallback) applied to `doy`, `fra`, `til`, AND `st`. Regression tests cover `?w=14`-only, viewport-only, empty-string, and `?st=42`-only partial URLs restoring the fallback anchor + fallback year range (not Jan 1 / `[min,min]`).

**File:** `site/src/state/url.ts:83-102`
**Issue:**
`w` and `st` are correctly gated with `p.has("w")` / `p.has("st")` before trusting a parsed value, so an absent param falls back. But `doy`, `fra`, and `til` are NOT gated — they rely solely on `Number.isFinite(Number(p.get(...)))`. Because `Number(null) === 0` and `Number("") === 0` (both finite), an **absent or empty-string** param does not fall through to `fallback`; it is treated as the literal value `0` and clamped:

- Missing/empty `doy` → `clamp(Math.round(0), 1, 365)` = **1 (Jan 1)**, ignoring `fallback.anchorDoy`.
- Missing/empty `fra` → `clamp(0, bounds.min, bounds.max)` = **`bounds.min`**, ignoring `fallback.yearFrom`.
- Missing/empty `til` → `clamp(0, bounds.min, bounds.max)` = **`bounds.min`**; then `yearFrom > yearTil` is false (both equal), so the baseline range collapses to the single year **`[bounds.min, bounds.min]`**.

`paramsToState` runs whenever `location.search` is truthy (`main.ts:147-149`) and on every `popstate` (`main.ts:179`). So any **partial** URL — a hand-truncated share link, a link that carries only the viewport `?v=...`, or the planned Phase-6 station deep link `?st=42` — silently corrupts the anchor and the baseline year range instead of preserving the sensible fallback (current-week / last-10-years). This contradicts the module's own documented contract ("using `fallback` for any absent/garbage param") and the `garbage → fallback anchor` comment on line 83. Note `?doy=abc` (→ NaN → fallback) works correctly; the bug is specifically absent and empty-string values.

**Fix:** Gate each field on presence, exactly as `w`/`st` already do:
```ts
// doy
const anchorDoy = p.has("doy") && Number.isFinite(Number(p.get("doy")))
  ? clamp(Math.round(Number(p.get("doy"))), 1, 365)
  : fallback.anchorDoy;

// fra / til
const fraRaw = Number(p.get("fra"));
let yearFrom = p.has("fra") && Number.isFinite(fraRaw)
  ? clamp(Math.round(fraRaw), bounds.min, bounds.max)
  : clamp(fallback.yearFrom, bounds.min, bounds.max);
const tilRaw = Number(p.get("til"));
let yearTil = p.has("til") && Number.isFinite(tilRaw)
  ? clamp(Math.round(tilRaw), bounds.min, bounds.max)
  : clamp(fallback.yearTil, bounds.min, bounds.max);
if (yearFrom > yearTil) yearTil = yearFrom;
```
(Empty-string `?doy=` still coerces to fallback with this fix, since `Number("")===0` is finite but the `p.has` guard alone is insufficient — prefer the stricter form `p.get("doy") !== "" && ...` if empty strings must also fall back. Simplest robust check: treat `raw === null || raw.trim() === ""` as absent.)

## Warnings

### WR-01: N-readout uses an unbounded, never-cleared `setTimeout(140)` per store change — timer pile-up and a fragile race against the 120ms recompute debounce

**FIXED (960ddd1):** Replaced the timer with a `refreshReadout()` callback on the `ControlBarHandle`; main.ts's `renderForState` invokes it right after it updates `latestData`, so the readout reflects the same settled frame the markers show — no timer pile-up, no 140>120ms race.

**File:** `site/src/ui/controlBar.ts:114-120`
**Issue:**
The readout subscriber schedules a fresh `setTimeout(..., 140)` on **every** store change and never clears the previous one. During a continuous scrubber drag (many `input` ticks) this spawns one timer per tick — all fire, all call `readoutText(getLatestData())`. The 140ms delay is a hand-tuned guess intended to land "just past" the 120ms recompute debounce so it reads settled `latestData`. This coupling is fragile: it hard-codes a `140 > RECOMPUTE_DEBOUNCE_MS(120)` assumption in a different module with no shared constant, so if the debounce is ever tuned upward the readout will silently read stale data. It also produces N transient readouts flickering stale intermediate values during a drag.

**Fix:** Drive the readout from the same event that updates `latestData`, not from an independent timer. Simplest: have `renderForState` (main.ts) invoke a readout-refresh callback after it sets `latestData`, or expose a subscribe hook the control bar registers. If keeping a timer, at minimum store and `clearTimeout` it per subscription and derive the delay from the shared `RECOMPUTE_DEBOUNCE_MS` constant rather than the magic `140`.

### WR-02: `moveend` recompute subscriber re-renders markers on every pan/zoom though markers do not depend on the viewport

**FIXED (960ddd1):** The debounced recompute subscriber now tracks a `(anchorDoy, widthDays, yearFrom, yearTil)` selection tuple and early-returns when it is unchanged, so a viewport-only pan/zoom skips recompute (the URL is still written by the separate URL-writer subscriber).

**File:** `site/src/main.ts:187-190` + `172-175`
**Issue:**
The `moveend` handler writes `{lng, lat, zoom}` into the store. That store change fans out to the debounced recompute subscriber, which calls `renderForState` → `recompute(cache, state)` → `computeMarkerDatum` over every station. Marker data is a pure function of `(anchorDoy, widthDays, yearFrom, yearTil)` only — never the viewport. So every pan/zoom triggers a full (debounced) climatology recompute that produces byte-identical marker data, wasting work and needlessly re-running `installMarkerLayer.setData` + `renderComposite`. Correctness is preserved (idempotent), but this is an unnecessary recompute path that couples camera motion to data recomputation.

**Fix:** Split the concerns: gate the recompute subscriber to only re-run when a selection-relevant key changed. Track the last-rendered `(anchorDoy, widthDays, yearFrom, yearTil)` tuple and early-return in the debounced callback when it is unchanged; viewport-only changes then skip recompute (but still write the URL via the separate URL-writer subscriber).

### WR-03: Boot `jumpTo` can emit a spurious `replaceState` when restored full-precision viewport differs from the map's post-jump camera in the last bits

**FIXED (960ddd1):** The outbound `moveend` handler now early-returns when `viewportMatches(map, store.get())` is already true, so a boot/popstate `jumpTo` settle is a genuine no-op and emits no spurious `replaceState`.

**File:** `site/src/main.ts:119-122, 187-190` + `state/url.ts:67`
**Issue:**
On a URL restore, `applyViewport` calls `map.jumpTo` with the full-precision clamped `lng/lat/zoom` from the parse. `jumpTo` fires `moveend`, whose handler reads `map.getCenter()` / `map.getZoom()` and writes them back. The written-back values are the map's own snapped camera values, which may differ from the stored full-precision values by sub-`1e-4` amounts. The store's no-op-skip compares with strict `===`, so those tiny differences are NOT treated as equal and the viewport `set` proceeds, firing a `replaceState` that overwrites the freshly restored history entry with re-serialized (`toFixed(4)`) coordinates. `viewportMatches` guards the *inbound* `jumpTo` (it early-returns if already matching) but does not guard the *outbound* `moveend`→`set`. Practically this is a single benign extra `replaceState` (no loop, no history flooding, values round-trip to 4dp), but it is an unintended write on every boot/popstate restore and undermines the "store→map only on boot/popstate" invariant the comment claims.

**Fix:** In the `moveend` handler, skip the write when `viewportMatches(map, store.get())` is already true (the camera equals what the store holds to display precision), OR round the emitted viewport values with the same `toFixed(4)`/`toFixed(2)` precision the URL uses before `set`, so a jump-induced `moveend` is a genuine no-op the store skips.

### WR-04: Store no-op skip is shallow strict-equality only — a fresh viewport object with equal fields is fine, but any future nested/array field in SelectionState would defeat the skip and churn subscribers

**FIXED (e516ec3):** Added a documented primitive-only invariant on the `SelectionState` interface warning that adding a non-primitive field requires making the `store.ts` no-op equality value-aware first (option b of the suggested fix). No over-engineering — the state is all-primitive today.

**File:** `site/src/state/store.ts:79-84`
**Issue:**
`set` computes no-op via `patchedKeys.every((k) => next[k] === state[k])`. This is correct for the current flat, all-primitive `SelectionState` (every field is `number | null`), and the module documents the flat-by-design contract. The latent risk: the guard is strict reference equality per key. If a later phase adds a non-primitive field (e.g. a `bbox: [number,number,number,number]` viewport, or a `selectedStations: number[]`), a caller passing a freshly-constructed-but-equal array/object would always be `!==` and every such `set` would notify — silently defeating the scrubber same-tick / no-churn guarantee that the whole recompute/history-flood-prevention design leans on. There is no compile-time guard preventing a future non-primitive field from being added to the interface.

**Fix:** Either (a) add a type-level constraint documenting/enforcing that every `SelectionState` field must be a primitive (a mapped-type assertion), or (b) make the no-op check value-aware for known container fields. At minimum, add a comment at the `SelectionState` interface warning that adding a non-primitive field requires updating the no-op equality in `store.ts`, since the correctness of the entire loop-prevention scheme depends on it.

## Info

### IN-01: Redundant `d.n >= 3` filter in `readoutText` (already implied by `d.sufficient`)

**FIXED (e516ec3):** Dropped the redundant clause — `readoutText` now filters on `d.sufficient` alone.

**File:** `site/src/ui/controlBar.ts:32`
**Issue:**
`data.filter((d) => d.sufficient && d.n >= 3)` — `sufficient` is defined in `effectiveN` as exactly `qualifying.length >= 3`, i.e. `d.sufficient` already implies `d.n >= 3`. The extra clause is dead weight and, worse, subtly implies the two could disagree (they cannot, for producer-built data). Harmless but misleading.
**Fix:** Drop the redundant clause: `data.filter((d) => d.sufficient)`.

### IN-02: `expandWindow` / `anchorToWindow` treat "1 month" as exactly 30 days, not calendar-accurate 28–31

**RESOLVED (e516ec3):** Kept the fixed-30-day window (a documented product decision per the UI-SPEC) and added a clarifying comment on `WIDTHS` in `widthButtons.ts` noting it is intentional, not calendar-exact. No code behavior change.

**File:** `site/src/ui/widthButtons.ts:10` + `site/src/data/window.ts:26-32`
**Issue:**
The "1 mánuður" button maps to `days: 30` and the window is a fixed 30-day doy span regardless of which month the anchor lands in (February would be 28/29, July 31). This is a deliberate product simplification (doy windows carry no month context), consistent with the domain's day-of-year model, and is internally coherent — but the label "1 mánuður" (one month) overstates precision for a fixed 30-day window. Flag for product awareness, not a code defect.
**Fix:** None required if the 30-day approximation is intended; consider a tooltip or the label "~1 mánuður" if precision matters to users.

### IN-03: Scrubber `input` handler emits the raw range value without `foldDoy`, unlike every other emit path

**RESOLVED (e516ec3):** Added a clarifying comment documenting that the native range's `min="1" max="365" step="1"` bounds already keep the value in 1..365 (DOM-bounded, safe), and folding here would disturb the live drag — with a note to route through `emit()` if the bounds/step ever change. No behavior change.

**File:** `site/src/ui/scrubber.ts:179-185`
**Issue:**
The range `input` handler calls `opts.onAnchorChange(doy)` and `syncReadouts(doy)` with the raw `Number(range.value)`, whereas the stepper/page-step `emit()` path folds via `foldDoy`. Because the native range is bounded `min="1" max="365"`, the raw value is always already in `1..365`, so no incorrect value escapes today. It is an inconsistency (two code paths, one folds and one relies on the DOM bound) that would become a real bug if the range bounds or step were ever changed.
**Fix:** Route the `input` handler through the same fold for consistency: `const doy = foldDoy(Number(range.value));` before `syncReadouts` / `onAnchorChange`, or call the shared `emit`-style helper (without re-setting `range.value`, to avoid disturbing the drag).

---

_Reviewed: 2026-07-20T10:48:52Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
