# Phase 7: Responsive UX & Trust States - Context

**Gathered:** 2026-07-20
**Status:** Ready for planning

<domain>
## Phase Boundary

The site becomes trustworthy and usable on any device: mobile-responsive with a bottom-sheet station panel on phones (side panel on desktop), an info panel framing the data as historical-not-forecast with attribution + freshness, and consistent loading/empty/no-data states across the map and panels. This is the CONSOLIDATION phase — it also pays down the accumulated layout/responsive debt from Phases 3–6. NOT in this phase: the nightly pipeline / auto-deploy / full national dataset (Phase 8), v1.x features (comparison, meðaltal/dreifing toggle, sunshine).

</domain>

<decisions>
## Implementation Decisions

### Mobile Responsiveness (UX-03)
- Station detail panel: SIDE panel on desktop (current), draggable BOTTOM SHEET on phones (peek height → expanded). Bottom sheet takes over the lower area; the map stays visible above it. Non-modal (Google-Maps style) so the map is still pannable.
- When the bottom sheet / panel is open on a phone, the ranked "Bestu staðir" list and the legend collapse to small toggles/chips (not both expanded); the control bar stays reachable (tucks or remains at the bottom edge appropriately).
- The bottom control bar (scrubber + width + Frá/Til) must be usable on narrow screens — the Phase 4 compact stepper + a responsive layout for the width buttons + year dropdowns. No horizontal overflow.
- Breakpoint(s) at Claude's discretion (a single ~640px phone breakpoint is fine). Touch targets ≥44px. The map remains usable (pan/zoom) at all sizes.

### Info / Trust Panel (UX-04)
- A persistent "i" (info) button, top-right toolbar area (echoes gottvedur.is/kort). Opens a panel explaining: what the map shows, "þetta er sögulegt meðaltal, ekki spá" (historical, not forecast — the #1 misconception to prevent), how to read it (brief), Veðurstofan CC BY 4.0 attribution (reuse the ATTRIBUTION constant), and data freshness.
- First-visit: auto-open the info panel once (dismissible), remembered via a localStorage flag (a dismissed-hint flag, NOT user data/accounts — acceptable). Repeat visitors just see the "i" button. Respect that some users land via a shared permalink — the auto-open must not block interacting with the restored view.
- Data freshness ("uppfært {date}"): read a data/build timestamp from manifest.json (Phase 2 writes high-water marks; add/confirm a top-level generatedAt or newest high-water date). Show a human Icelandic date. Phase 8's nightly run updates it automatically. Do NOT hardcode.

### Loading / Empty / No-Data States (UX-05) — includes accumulated debt
- **Map-load error** (Phase 3 debt): if PMTiles or the MapLibre style fails, show "Ekki tókst að hlaða kortið" / "Reyndu að hlaða síðunni aftur." over the basemap area instead of a silent console.error.
- **Empty stations** (Phase 3 debt): if stations.json is empty/404, show "Engar veðurstöðvar" rather than a blank map with no markers.
- **Initial loading**: a lightweight loading affordance while derived data / the map style load (the current blank-until-ready gap). Keep it minimal; no heavy spinner chrome.
- **No-data (already partly done)**: the marker muted state, the panel "engin gögn fyrir þetta tímabil", and the ranked-list "Engin einkunn" empty state already exist (Phases 5–6) — ensure they're consistent and this phase doesn't regress them; add any missing (e.g. ranked list empty when NO station qualifies for the whole selection).
- **Ranked-list / chart-chunk load**: the "hleð riti…" ECharts chunk-load affordance exists (Phase 6) — keep.

### Accumulated Layout Debt to Resolve
- Attribution legibility: the fixes across Phases 4–6 were incremental (margin bumps, panel-open body class). Phase 7 should make attribution robustly legible in ALL states (control bar + legend + ranked panel + station panel/bottom-sheet, desktop + mobile) — ideally a single coherent layout solution (e.g. attribution reflow into a consistent safe zone, or into the info panel with a minimal always-visible credit). CC BY 4.0 + OSM must always be legible (licensing).
- Basemap bilingual label ("ICELAND"/"Ísland") — low priority; revisit only if a cheap Protomaps flavor/label fix exists, else leave (documented Protomaps limitation).

### Claude's Discretion
- Bottom-sheet library vs hand-rolled (prefer hand-rolled / minimal; avoid a heavy dep — but a tiny well-vetted sheet helper is acceptable if it saves real complexity), exact breakpoint, sheet peek height, info-panel styling, loading affordance style, attribution final layout.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- site/src/ui/stationPanel.ts (side panel → make responsive to bottom sheet), rankedList.ts (+ collapse/chip on mobile), legend.ts, controlBar.ts (Phase 4 compact stepper), attribution.ts + the @betravedur/domain ATTRIBUTION constant.
- site/src/map/init.ts (add map error handler), load.ts (stations empty/404 → empty state; fetch now checks res.ok from Phase 3 fix), main.ts (wiring, the boot sequence to add loading state around).
- manifest.json (Phase 2) — the freshness timestamp source.
- tokens.css / panel.css / controls.css / score.css design system.

### Established Patterns
- Vite+TS, strict TS (tsc 0 errors — KEEP), Vitest unit + Playwright E2E on preview build, TDD, no-review directive (visual/responsive checks = auto tasks w/ screenshot evidence at multiple viewports). ECharts + suncalc are the only runtime deps — avoid adding more without strong justification.
- Playwright can drive multiple viewport sizes for the responsive assertions.

### Integration Points
- Phase 8 (nightly pipeline) will populate the full national dataset + auto-update the freshness timestamp this phase reads. Keep the freshness source (manifest) as the contract.

</code_context>

<specifics>
## Specific Ideas

- "sögulegt meðaltal, ekki spá" is the single most important trust message (FEATURES.md: the historical-not-forecast mental model is the #1 confusion) — make it prominent, not buried.
- Mobile is a first-class audience (trip planners browse on phones — FEATURES.md) — the bottom sheet is table stakes, not polish.
- Attribution is a licensing requirement AND has been a recurring UI-review finding — solve it coherently here, once.
- Accumulated debt items are tracked in STATE.md Pending Todos — clear them in this phase.

</specifics>

<deferred>
## Deferred Ideas

- Nightly cron / auto-deploy / full national dataset — Phase 8.
- Station comparison, meðaltal/dreifing toggle, sunshine, adjustable weights, English UI — v1.x/v2.
- Basemap bilingual label — leave unless a trivial fix exists.

</deferred>
