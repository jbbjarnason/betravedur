# Phase 4: Selection & Instant Recompute - Context

**Gathered:** 2026-07-20
**Status:** Ready for planning

<domain>
## Phase Boundary

The core interaction loop: the visitor picks a time-of-year window and a baseline year range; the map recomputes and recolors instantly in-browser (no network fetch); every average is honestly labeled "meðaltal N ára" (N = actual qualifying-year coverage); and the full selection (period + year range + selected station + map viewport) is encoded in a shareable URL. Builds directly on Phase 3's map + MarkerDatum pipeline (computeMarkerDatum already takes a `window` param and gates on qualifying years). NOT in this phase: score coloring/ranked list (Phase 5 — "recolors" here means re-rendering markers with the new averages, full score palette is Phase 5), chart panel (Phase 6), mobile bottom-sheet polish + info/empty/loading states (Phase 7), deploy automation (Phase 8).

</domain>

<decisions>
## Implementation Decisions

### Period Selector UI (Claude's discretion — decided)
- Bottom control bar: a day-of-year scrubber to pick the window's anchor point (echoes the gottvedur.is/kort bottom timeline the user referenced) + segmented width buttons "1 vika / 2 vikur / 3 vikur / 1 mánuður" for the window length. On narrow screens the scrubber collapses to a compact date stepper (full bottom-sheet polish is Phase 7).
- The scrubber operates in day-of-year / calendar-date terms (the window is time-of-year, not a specific year) — labels in Icelandic month/day. Feb 29 folded per the Phase 1 leap contract.
- Wrapping windows (e.g. late Dec → early Jan) are allowed and use the Phase 1 `groupBySeasonYear` season-year contract.

### Year Range Selector UI
- Two dropdowns: "Frá [ár]" and "Til [ár]", bounded by the earliest/latest year available in the committed data (derive from stations.json / manifest high-water marks, not hardcoded). Guard start ≤ end.

### Default Selection
- On first load (no URL params): window = current week (anchored on today's day-of-year, 1-week width) over the last 10 available years. Documented; today is not hardcoded — anchor derives from the current date at load, year range from the data's latest 10 years.

### Instant Recompute
- Changing period or year range recomputes MarkerDatum for every station entirely client-side via @betravedur/domain (already loaded derived files) — NO network fetch, no reload. Recolor/re-render markers using Phase 3's attachCompositeRenderer (made idempotent in the Phase 3 fix — reuse it, don't stack listeners).
- "meðaltal N ára" label reflects actual qualifying-year coverage (Phase 1 effectiveN, ≥80%/N≥3), not the picker span — reuse the honest-N contract; below N≥3 → "ófullnægjandi gögn".

### URL State (UX-02)
- Encode period (anchor doy + width), year range (from/til), selected station id, and map viewport (lat/lng/zoom) as URL query params. Use replaceState for continuous refinements (scrubber drag, pan/zoom), pushState for discrete navigations (station select) — per FEATURES.md guidance. A copied link restores the exact view. This is the "save/share" substitute for the out-of-scope accounts feature.

### Claude's Discretion
- Exact param names/encoding, debounce for scrubber-driven recompute, scrubber tick styling, whether width buttons are icons or text.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- site/src/data/averages.ts: `computeMarkerDatum(meta, file, window)` — already parameterized by window; the selectors drive this. Coverage-gated (Phase 3 fix WR-01/02).
- @betravedur/domain: expandWindow, groupBySeasonYear, qualifyingYears/effectiveN, meanPerYearThenAverage — all the recompute math exists.
- site/src/map/markers.ts: `attachCompositeRenderer` (now idempotent — Phase 3 WR-04 fix) — re-render markers on selection change without listener leaks.
- Phase 3 evidence that the full derived→domain→marker chain works on the real sample.

### Established Patterns
- Vite+TS site, strict TS, Vitest unit + Playwright E2E on the preview build, TDD, no-review directive (visual checks = auto tasks w/ screenshot evidence).

### Integration Points
- Phase 5 swaps the neutral marker fill for the score palette + adds the legend/ranked list — the selection state Phase 4 builds is what Phase 5 colors.
- The window/year-range state object should be a clean single source of truth (URL ↔ state ↔ recompute) that Phase 5/6 read from.

</code_context>

<specifics>
## Specific Ideas

- Reference: gottvedur.is/kort bottom timeline (repurposed from forecast-hours to time-of-year).
- Year bounds must come from the data, so the site stays correct as Phase 8 backfills more history.
- Recompute must be measurably instant (no fetch) — an assertion/perf note in the E2E (e.g. no network request fired on selection change).

</specifics>

<deferred>
## Deferred Ideas

- Score coloring, legend, ranked "best stations", score explainer — Phase 5.
- Station click → chart panel — Phase 6.
- Mobile bottom-sheet polish, info "historical not forecast" panel, loading/empty/no-data states — Phase 7.
- Adjustable score weights (WGT-01, v2).

</deferred>
