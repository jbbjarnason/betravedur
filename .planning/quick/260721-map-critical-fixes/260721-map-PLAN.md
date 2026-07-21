---
quick_id: 260721-map
slug: map-critical-fixes
title: Map is critical — fix invisible coastline, zoom-out lock, and info-button prominence
mode: quick
created: 2026-07-21
---

# Quick Task 260721-map — Map critical fixes

User feedback on the live map: "The map is not zooming enough out. And the map is not correct.
The info button and info can be more subtle. The map is critical." Verified against the live
site with Playwright + screenshots.

## Diagnosis (evidence: scratchpad/map-default.png, local-*.png)

1. **"Not correct" — invisible coastline (the big one).** `site/src/map/style.ts::muteToDominant`
   pushed BOTH land AND water fills to the same `#e8ebed`, so Iceland's shape vanished — the map
   read as a flat gray field with floating labels.
2. **"Not zooming enough out" — zoom lock.** `site/src/map/init.ts` `maxBounds: [[-26,62.5],[-12,67.5]]`
   was so tight MapLibre clamped the minimum zoom to ~6; pressing zoom-out did nothing (probe:
   zoom stayed 6.006 across 8 presses).
3. **Info button too prominent.** `.info-button` glyph was full `--ink` at opacity 1.

## Changes

| File | Change |
|------|--------|
| `site/src/map/style.ts` | Two muted base tones instead of one: LAND `#eef1f2` (light) vs SEA `#cdd7de` (cooler/darker); background → SEA (open ocean). Coastline now clearly legible; white callouts still read as the figure. |
| `site/src/map/init.ts` | Framing → center `[-18.7,64.9]`, zoom `5.4` (whole island + sea margin), `minZoom 4.2`. `maxBounds` widened to `[[-35,59],[-3,70.5]]` so zoom-OUT works (floor ~4.81, was locked at 6) while still keeping the view over the North-Atlantic neighbourhood. |
| `site/src/state/defaults.ts` | Default viewport → `-18.7, 64.9, zoom 5.4` (matches init framing). |
| `site/src/state/url.ts` | Viewport clamp bounds widened to match the new `maxBounds` (`LNG -35..-3`, `LAT 59..70.5`) so a pan to the new edges round-trips through the URL without a jump. |
| `site/src/styles/trust.css` | `.info-button` glyph → `--muted-ink` at `opacity 0.7`, strengthening to 1 on hover/focus — a quiet affordance. Keeps 44px tap target + focus ring; reduced-motion already covered. |
| `site/src/state/url.test.ts`, `site/src/state/defaults.test.ts` | Updated clamp + default expectations to the new bounds/zoom. |

## Verification

- Playwright (localhost dev): default zoom 5.4 frames whole island; land/sea contrast legible;
  zoom-out reaches 4.81 (was locked 6); info button muted. Screenshots: local-default.png,
  local-zoomout.png.
- Unit: url.test + defaults.test green; site `tsc --noEmit` 0.
- E2E: full suite must stay green (markers render at default zoom, zoom-in still works, info panel).

## Deferred (unchanged)
- Protomaps "ICELAND"/"Ísland" label duplication (known basemap-flavor limitation).
