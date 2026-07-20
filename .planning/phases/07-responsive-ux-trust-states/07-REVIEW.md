---
phase: 07-responsive-ux-trust-states
reviewed: 2026-07-20T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - site/src/ui/infoPanel.ts
  - site/src/ui/bottomSheet.ts
  - site/src/ui/stationPanel.ts
  - site/src/ui/states.ts
  - site/src/data/freshness.ts
  - site/src/map/init.ts
  - site/src/main.ts
  - site/src/styles/controls.css
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: fixed
fixed_at: 2026-07-20
fixed_commits:
  WR-01: 55ea1fa
  WR-02: d8b9fb4
  WR-03: 33d3425
  WR-04: 55ea1fa
  IN-01: not-fixed (accepted frozen-geometry tradeoff — documented below)
  IN-02: 9b827b6
  IN-03: 55ea1fa
---

# Phase 7: Code Review Report

**Reviewed:** 2026-07-20
**Depth:** standard
**Files Reviewed:** 8
**Status:** fixed (all 4 warnings + IN-02/IN-03 fixed; IN-01 accepted as documented tradeoff)

## Summary

Phase 7 adds responsive/trust UX in vanilla TS with zero new dependencies. The
implementation is disciplined: no secrets, no `innerHTML`/`eval`/string-HTML anywhere
(every text node via `textContent`, only real `<a>` anchors with `setAttribute` hrefs —
XSS-clean across infoPanel/states/freshness), no new deps, and the localStorage access is
try/catch-wrapped on both read and write (private-mode safe, no crash). The three legacy
attribution hacks (`--bar-height + --space-lg` lift, `max-width:60vw` cap, `.panel-open
{ margin-right:344px }`) are confirmed removed from controls.css; the single
`--attrib-safe-bottom` band with its trust.css `:root` default (`var(--bar-height, 100px)`)
means the controls.css `0px` fallback is never reached on desktop, so desktop is unbroken.

Two teardown paths that the context flagged as leak-risks are actually correct:
**pointer capture** is released in both `pointerup` and `pointercancel` (try/catch-guarded);
and the **listener asymmetry** where `open()` disposes charts but does NOT detach the old
sheet controller is SAFE — the sheet controller holds no external reference (unlike ECharts'
global registry + ResizeObserver), so the removed, unreferenced old handle plus its five
listeners become GC-eligible when `detachSheet` is overwritten. No listener leak there.

The real defects are: a **stale inline `transform` when the viewport crosses the 640px
breakpoint mid-open** (WR-01, the highest-value finding — a drag/sheet started on mobile
leaves the desktop panel translated off-screen because nothing re-evaluates matchMedia after
attach), an **unguarded `showModal()` inconsistency** in infoPanel (WR-02), a **freshness
max-selection that depends on an unenforced ISO-format-uniformity invariant** (WR-03), and a
**mid-drag pointercancel from a matchMedia change leaving `dragging` inconsistent** (WR-04).

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Sheet inline `transform` persists when the viewport crosses 640px while the panel is open

**FIXED** (commit `55ea1fa`): `attachSheet` now registers a `matchMedia(MOBILE_QUERY)` `change`
listener that, on the mobile→desktop crossing, clears the inline `transform`/`transition` so the
desktop dock is CSS-owned; the desktop early-return also defensively clears any stale inline
geometry. Listener removed in teardown. Regression tests added in `bottomSheet.test.ts`.

**File:** `site/src/ui/bottomSheet.ts:83-94`, `site/src/ui/stationPanel.ts:649-660`

**Issue:** `attachSheet` is matchMedia-gated ONLY at attach time (per-open), and on the
mobile branch it writes an inline `transform: translateY(peekY)` on the panel element
(`setTranslateY(sheetEl, peekY)`, line 93). There is no `matchMedia(...).addEventListener("change", ...)`
listener, so nothing re-evaluates the breakpoint after attach. If the user opens the panel on
mobile (sheet mode, inline transform set) and then resizes/rotates the viewport past 640px to
desktop WITHOUT closing the panel, the inline `transform: translateY(NNNpx)` survives. The
desktop `.station-panel` rule (panel.css:17-43) is `position:fixed; right:0; top:calc(56px + …)`
with NO transform — but the JS-set INLINE transform wins on specificity, pushing the desktop
right-docked panel DOWN by `peekY` px, partly or fully off-screen. The only code that clears the
transform is `teardown()` (via the removed node) / a fresh `open()`, neither of which fires on a
plain resize. The symmetric case (desktop→mobile mid-open) leaves the sheet with no controller
until the next open, so drag/keyboard are dead while it visually looks like a sheet.

**Fix:** Either register a matchMedia change listener that tears down/re-attaches (and clears the
inline transform) on breakpoint crossings, or clear the inline transform defensively on desktop.
Minimal defensive clear inside the controller's non-mobile early return:
```ts
if (typeof matchMedia === "undefined" || !matchMedia(MOBILE_QUERY).matches) {
  sheetEl.style.transform = "";      // drop any stale mobile translateY so the desktop dock is correct
  sheetEl.style.transition = "";
  return () => {};
}
```
Better: add a `matchMedia(MOBILE_QUERY)` `change` listener in stationPanel's open() that
`detachSheet()`s + clears the transform when leaving mobile and re-attaches when entering it, and
remove that listener in `teardown()`.

### WR-02: `showModal()` called unguarded in the button-click and `setFreshness` paths, but guarded in auto-open

**FIXED** (commit `d8b9fb4`): a single guarded `openDialog()` helper
(`typeof dialog.showModal === "function" && !dialog.open`) is now used at all three call sites
(button click, first-visit auto-open, `setFreshness` re-open). A runtime lacking
`HTMLDialogElement.showModal` now no-ops everywhere instead of TypeError-ing on click/refresh.

**File:** `site/src/ui/infoPanel.ts:277-279, 289, 302`

**Issue:** The first-visit auto-open guards `typeof dialog.showModal === "function"` (line 289),
acknowledging environments where `<dialog>` is unsupported. But the button-click handler
(`if (!dialog.open) dialog.showModal();`, line 278) and the `setFreshness` re-open
(`if (wasOpen) dialog.showModal();`, line 302) call `showModal()` WITHOUT that guard. In any
runtime lacking `HTMLDialogElement.showModal` the auto-open silently no-ops (correct) but a
subsequent button click THROWS an unhandled `TypeError`, and a `setFreshness` while "open" would
throw too. The guard is inconsistent — either `<dialog>` support is assumed everywhere (drop the
line-289 guard) or it is not (add the guard to all three call sites).

**Fix:** Extract one guarded opener and use it at all three sites:
```ts
const openDialog = (): void => {
  if (typeof dialog.showModal === "function" && !dialog.open) dialog.showModal();
};
// button click:  openDialog();
// setFreshness:  if (wasOpen) openDialog();
// auto-open:     if (!dismissed && !hasUrlParams) openDialog();
```

### WR-03: `newestDataDate` selects the max by lexicographic string compare, valid only under an unenforced ISO-format invariant

**FIXED** (commit `33d3425`): selection is now by PARSED timestamp (`new Date(iso).getTime()`),
tracking `newestT`/`newest` and keeping the original string only for the winner; unparseable entries
are still skipped. A regression test with a mixed-precision/offset manifest (a `+02:00` entry that is
string-greatest but chronologically earlier, plus a no-millis entry) asserts the true newest wins.

**File:** `site/src/data/freshness.ts:44-51`

**Issue:** The comment asserts "ISO-8601 UTC strings sort lexicographically in the same order they
sort chronologically," and the loop does `if (newest === null || iso > newest) newest = iso;` — a
raw STRING comparison. This is only true when every `lastFetched` shares an identical format:
same UTC designator (`Z`, not a `+HH:MM` offset), same fractional-second precision, same field
widths. The committed manifest currently uses uniform `2026-07-20T07:18:37.625Z` so it works
today, but the pipeline type (`lastFetched?: string`, load.ts:20) enforces none of this. A future
entry with a numeric offset (`…+00:00`) or without milliseconds would sort WRONG lexically even
though each individual string passes the per-entry `Number.isNaN(new Date(iso).getTime())` validity
gate — silently reporting a stale (or too-fresh) "uppfært" date, i.e. exactly the false-freshness
the module's own contract forbids.

**Fix:** Select the max by PARSED timestamp (which you already compute for validity), keeping the
original string only for the winner:
```ts
let newest: string | null = null;
let newestT = -Infinity;
for (const entry of Object.values(stations)) {
  const iso = entry?.lastFetched;
  if (typeof iso !== "string" || iso.length === 0) continue;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) continue;
  if (t > newestT) { newestT = t; newest = iso; }
}
return newest;
```

### WR-04: A matchMedia-driven `pointercancel` mid-drag leaves `sheetEl.style.transition = "none"` and does not resolve to a snap

**FIXED** (commit `55ea1fa`, with WR-01): the breakpoint-change listener resets the drag machine on
the mobile→desktop crossing (`dragging = false; transition = ""; transform = ""`), so a resize during
an active drag returns the sheet to a clean CSS-owned state instead of freezing it mid-drag with
easing disabled. A regression test drives a pointerdown then a crossing and asserts the reset (and
that a following pointermove is a no-op).

**File:** `site/src/ui/bottomSheet.ts:105-141`

**Issue:** `onDown` sets `sheetEl.style.transition = "none"` (line 116) for raw finger-follow and
only `onUp` (pointerup/pointercancel) restores it (`sheetEl.style.transition = ""`, line 139) +
snaps. This is correct for normal pointer lifecycles. However, `onUp` early-returns `if (!dragging)`
— so if a drag is in progress and the browser fires `pointercancel` for a reason that ALSO happens
to coincide with the pointer id having already been auto-released (e.g. the OS cancels the gesture
during a scroll/zoom), the `snapNearest` settle still runs, which is fine — BUT combined with WR-01,
if the viewport crosses to desktop during an active drag, `dragging` stays `true` with
`transition:"none"` and a stale `translateY`, and there is no path (no matchMedia listener) that
clears the drag state or the inline transform. The sheet is frozen mid-drag with easing disabled.
This is the interaction of WR-01 with the drag state machine; fixing WR-01 with a breakpoint-change
teardown that also resets `dragging`/`transition`/`transform` closes it.

**Fix:** In the WR-01 breakpoint-change teardown, also reset the drag machine:
```ts
dragging = false;
sheetEl.style.transition = "";
sheetEl.style.transform = "";
```
so a resize during a drag returns the element to a clean CSS-owned state.

## Info

### IN-01: `onMove` clamps against `peekY`/`expandedY` captured at attach — a resize that changes `section.offsetHeight` desyncs the snap targets

**NOT FIXED — accepted tradeoff.** The review itself rates this low impact (panel content is built
once per open; mobile height is `clamp(70svh…)`). The dominant desync source — a mobile→desktop
breakpoint crossing — is now handled by WR-01's teardown, which re-attaches on the next open with
fresh geometry. A resize that stays within mobile and changes height mid-open remains geometry-
frozen by design; recomputing `peekY` at pointer-release was declined to keep the snap math simple
and avoid churn on the Phase-6 seam. Documented as an explicit frozen-geometry acceptance.

**File:** `site/src/ui/stationPanel.ts:652-654`, `site/src/ui/bottomSheet.ts:90, 122-125`

**Issue:** `peekY = section.offsetHeight - peekVisible` and `expandedY = 0` are computed ONCE at
open (stationPanel.ts:652-654) and captured by the controller closure. If the sheet height changes
after attach (dynamic content, viewport resize that keeps mobile mode, font reflow), the clamp
bounds in `onMove` (bottomSheet.ts:125) and the snap targets no longer match the real geometry, so
peek can reveal too much/little. Low impact (the panel content is built once per open and mobile
height is `clamp(70svh…)`), but the snap math is geometry-frozen. Consider recomputing `peekY` from
`sheetEl.offsetHeight` at pointer-release, or accept the frozen-geometry tradeoff explicitly.

### IN-02: `showEmptyState` and `showMapError` can both be present simultaneously (independent idempotence, no mutual exclusion)

**FIXED** (commit `9b827b6`): `showMapError` now removes any existing `.bv-state--empty` overlay
(error supersedes empty — the more actionable failure), and `showEmptyState` no-ops when a
`.bv-state--error` is already present. At most one state card renders on the flex-centered host.

**File:** `site/src/ui/states.ts:114-144`, `site/src/main.ts:205-208, 331-340`, `site/src/map/init.ts:58-61`

**Issue:** Each `show*` is idempotent for ITS OWN modifier (`.bv-state--error` / `.bv-state--empty`),
and `hideLoading` only removes the loading node. But nothing prevents BOTH an error overlay (from
init.ts `map.on("error")`) and an empty overlay (from main.ts data-load failure/empty) from being
appended to the same host at once — a tile/style failure plus an empty stations deploy would stack
two cards centered over each other. The host is `display:flex; align-items:center; justify-content:
center` (trust.css:16-24), so two `.bv-state` cards overlap. This is a plausible degenerate state
(map error + empty data). Consider making the error state supersede/replace any empty state (remove
`.bv-state--empty` when showing an error) so at most one state card renders. Not a correctness bug
in the common single-failure path, hence Info.

### IN-03: `raiseAttribSafeBottom` sets `--attrib-safe-bottom` in px but never re-runs on resize; combined with WR-01 it can strand the safe band

**FIXED** (commit `55ea1fa`, with WR-01): `attachSheet` now takes an `onLeaveMobile` callback fired
on the mobile→desktop crossing; `stationPanel` passes `resetAttribSafeBottom`, so the lingering
mobile px value is dropped and the trust.css `var(--bar-height…)` desktop baseline is restored
without waiting for the next open/close.

**File:** `site/src/ui/stationPanel.ts:337-345, 658`

**Issue:** `onSnap` writes `--attrib-safe-bottom: {visible}px` (an absolute px derived from
`offsetHeight - translateY`) only on drag/keyboard settle. On a mobile→desktop resize mid-open,
`resetAttribSafeBottom()` is not called (teardown doesn't run), so the last mobile px value lingers
on `:root`, overriding the trust.css `var(--bar-height…)` desktop baseline until the next
open/close. This is the CSS-variable analogue of WR-01 and is resolved by the same
breakpoint-change teardown (call `resetAttribSafeBottom()` when leaving mobile).

---

_Reviewed: 2026-07-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
