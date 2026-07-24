---
quick_id: 260723-einkunn
slug: einkunn-filter
status: complete
date: 2026-07-23
commit: 31cec05
---
# Minimum-einkunn filter — Summary

User: "find places with einkunn > 8.5". Added a control-bar **Lágmarkseinkunn** slider (0–10,
step 0.5; Icelandic "allar" / "≥ 8,5" readout). When set, the map HIDES markers with score <
minimum and the "Bestu staðir" list shows only qualifying stations. `latestData` stays FULL so the
station panel + fly-to still resolve any station. minScore round-trips in the URL as `emin`
(omitted at 0 for clean links).

Files: store.ts, defaults.ts, url.ts (+ url/defaults/history/store/recompute tests), einkunnFilter.ts
(new control), controlBar.ts (mount+wire+sync), main.ts (renderForState filter + selectionKey),
rankedList.ts (rankStations minScore), controls.css.

Verify: tsc 0 (site+pipeline), unit 375, build clean. Local preview: min 8,0 → ranked 2→1, map 1
marker, all ≥8; readout "≥ 8,0". Deployed (nightly, success). Note: full E2E not re-run (context);
deploy gate is unit+tsc.

Started by a delegated agent that completed the state layer then died on an API error; finished
inline (control + wiring + filtering + css + fixture fixes).
