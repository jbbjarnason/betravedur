---
quick_id: 260721-map
slug: map-critical-fixes
status: complete
date: 2026-07-21
---

# Quick Task 260721-map — Summary

User feedback on the live map (map flagged CRITICAL): "not zooming enough out", "map is not
correct", "info button + info can be more subtle". Diagnosed with Playwright + screenshots against
the live site, fixed with a fast localhost dev loop, verified.

## Changes (all under site/src, + test updates)

| File | Change |
|------|--------|
| `map/style.ts` | **The big one** — `muteToDominant` had pushed BOTH land and water to one `#e8ebed`, erasing Iceland's shape (flat gray field). Now two muted tones: land `#eef1f2` (light) vs sea `#cdd7de` (cooler/darker); background → sea. Coastline is legible again; white callouts still read as the figure. |
| `map/init.ts` | Framing → center `[-18.7,64.9]`, zoom `5.4`, `minZoom 4.2`; `maxBounds` widened `[[-35,59],[-3,70.5]]`. The old tight box clamped min-zoom to ~6 (zoom-out did nothing). Now zoom-out reaches ~4.81. |
| `state/defaults.ts` | Default viewport → `-18.7, 64.9, zoom 5.4` (matches init framing). |
| `state/url.ts` | Viewport clamp bounds widened to match the new `maxBounds` (no URL round-trip jump at the new edges). |
| `styles/trust.css` | `.info-button` glyph → `--muted-ink` @ `opacity 0.7`, crisp on hover/focus. A quiet affordance; keeps 44px tap target + focus ring. |
| `map/markers.ts` | `text-padding: 4` (modest collision breathing room; NOT enough to hide distinct nearby stations — an earlier `28` over-decluttered and broke score tests). |
| `styles/markers.css` | Raise a hovered/focused/selected pill above overlapping neighbours (keyboard/partial-overlap reachability). |

## Test updates

- `state/url.test.ts`, `state/defaults.test.ts` — clamp + default expectations updated to the new
  bounds/zoom.
- `tests/e2e/panel.spec.ts` — `openPanelViaMarker` now clicks a REACHABLE pill (the top one at its
  centre), mirroring how a real user clicks the 2 overlapping SW sample pills. The prior `.first()`
  clicked a covered pill Playwright could never actuate (a 2-sample preview artifact; the national
  dataset has no such overlap).
- `tests/e2e/score.spec.ts` (crit 2) + `tests/e2e/info.spec.ts` (crit 7) — replaced marginal fixed
  `waitForTimeout`s with `expect.poll` condition-waits. The extra land/sea repaint + zoom-5.4 idle
  nudged those fixed deadlines over the edge under full-suite load; polling is deterministic. Both
  behaviours verified real (recolor lands ~450ms; dismiss flag writes on close).

## Verification

- Playwright (localhost): default zoom 5.4 frames the whole island; land/sea contrast legible;
  zoom-out reaches 4.81; info button subtle; marker click opens the panel; recolor confirmed
  (8,5→8,4, 7,7→7,8). Screenshots: local-default.png, local-zoomout.png.
- Unit (vitest): 373 passed; site `tsc --noEmit`: 0.
- Full Playwright E2E: green (after the two flake fixes — see the final verify run).

## Follow-up: national marker density (found during live verification)

The national map (375 stations) rendered ~109 overlapping pills at the country overview — a
cluttered wall (invisible on the 2-sample preview the E2E uses). Live-tuned against the real data:
- `markers.ts`: zoom-adaptive collision `text-padding` (`["interpolate",["linear"],["zoom"],5,32,8,8,11,2]`)
  → ~22 readable markers at the overview, more revealed on zoom-in. Ranked list still lists all.
- `markers.ts`: scored stations win the collision over muted "ófullnægjandi gögn" pills
  (`collisionPriority`), so the overview surfaces useful scores; insufficient stations still show
  where they are the only option.
- `score.spec` crit 8/9: frame the SW samples before asserting on a specific decluttered marker.
- Commit `3cd8868`. Full E2E 91 passed / 0 failed after.

## Deferred (unchanged)
- Protomaps "ICELAND"/"Ísland" label duplication (known basemap-flavor limitation).
- Consider prioritizing scored markers even more / a legend note that muted = insufficient for the
  current window (many stations are muted for a narrow default week + 2017 baseline — honest, but
  a wider default baseline or window would surface more scores on first load).
