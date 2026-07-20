# Phase 5: Score Coloring & Ranking - Context

**Gathered:** 2026-07-20
**Status:** Ready for planning

<domain>
## Phase Boundary

The map directly answers "where has it been best": markers are colored by the combined weather score with a visible legend, a ranked "best stations for this period" list surfaces the answer explicitly and updates with the selection, and an explainer makes the score transparent. Builds on Phase 4's selection state + instant recompute (the score recomputes with the selection, same no-fetch path). NOT in this phase: the station chart panel (Phase 6), mobile bottom-sheet/info/loading/empty polish (Phase 7), deploy (Phase 8). The combined score math already exists in @betravedur/domain (combine() → score:number|null, contributing[], missingRain) — this phase is presentation + ranking, not new math.

</domain>

<decisions>
## Implementation Decisions

### Score Color Scale (Claude's discretion — decided)
- Colorblind-safe SEQUENTIAL scale keyed to the 0–10 score: low = muted cool tone, high = vivid green/teal ("gott veður = grænt"). NOT a red–green diverging scale — accent red is already reserved for the temperature numeral and red-green is colorblind-hostile.
- Apply the score color as a ring/border (and/or a small score badge) on the existing white pill — keep the pill body white and the temp numeral red. The neutral Phase 3/4 marker becomes score-colored here.
- Color is never the sole channel: pair it with the numeric score (e.g. "7,8") on/near the pill and the ranked list. Reduced-motion + contrast safe.
- Stations with score:null (ófullnægjandi gögn) render in the existing muted state — NOT on the color scale, NOT ranked. Stations scored "án úrkomu" ARE colored + ranked (renormalized score), with the existing badge.

### Ranked "Best Stations" List
- Collapsible side panel titled "Bestu staðir" (right side on desktop). Lists stations ranked by score (desc) for the current selection; each row: rank, station name, score, án úrkomu badge if applicable. Excludes ófullnægjandi-gögn stations.
- Clicking a row flies to / highlights that station's marker (reuse map easeTo + the existing marker; selecting a station updates the URL `st` param via the Phase 4 store — the station-select seam already exists).
- Updates live on every selection change (same recompute path). Collapsible so it doesn't crowd the map; full mobile treatment (bottom-sheet) is Phase 7 — here it degrades to a simple toggle on narrow screens.

### Score Explainer
- Folded INTO the legend panel (one place for all score meaning): the color scale + a compact "hvernig er einkunnin reiknuð?" affordance that expands a plain-Icelandic explanation of the weights (úrkoma 40% / vindur 30% / hiti 30%) and the "án úrkomu" renormalization (when rain is missing, weights renormalize over the available components). Transparency is the differentiator — no black-box score.

### Recompute Integration
- The score + ranking recompute on selection change through the existing Phase 4 store/recompute path — NO new network fetch. MarkerDatum already carries the score fields; extend the marker render + add the list/legend as store subscribers.

### Claude's Discretion
- Exact color ramp stops/hex (colorblind-safe, restrained), whether the score shows as a badge vs ring vs both, legend placement (corner), list row density, fly-to easing.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- @betravedur/domain combine(): score (0–10 | null), contributing components, missingRain flag — already computed into MarkerDatum. Do NOT recompute; read it.
- site/src/data/averages.ts computeMarkerDatum → MarkerDatum (has score fields).
- site/src/map/markers.ts: installMarkerLayer + renderComposite (hybrid symbol/DOM pills) — extend the pill render to add score color; symbol-sort-key already uses a priority (can key on score).
- site/src/state/store.ts + recompute.ts: the selection→recompute→render path; the list + legend subscribe to the same latestData.
- Phase 4 station-select seam (URL `st` param, store) — the ranked-list click reuses it.
- tokens.css / controls.css: extend with score-scale tokens; keep accent red reserved for temp.

### Established Patterns
- Vite+TS, strict TS, Vitest unit + Playwright E2E on preview build, TDD, no-review directive (visual checks = auto tasks w/ screenshot evidence), no new npm deps preferred.

### Integration Points
- Phase 6 chart panel opens on marker/row click — keep the click handler seam clean (Phase 5 fly-to/highlight; Phase 6 adds the panel).
- Phase 7 turns the collapsible list + legend into proper mobile bottom-sheet/responsive chrome.

</code_context>

<specifics>
## Specific Ideas

- Legend + explainer together (transparency differentiator from FEATURES.md — WeatherSpark's opaque Tourism Score is the anti-pattern to beat).
- Ranked list is "the actual answer to the user's question" (FEATURES.md) — make it prominent, not buried.
- Color scale must be colorblind-safe and not reuse the temp accent red.
- E2E: assert markers carry a score color that changes with selection, the legend + explainer render, and the ranked list order matches score desc for the sample.

</specifics>

<deferred>
## Deferred Ideas

- Station chart panel (candlesticks/rain/daylight) on click — Phase 6.
- Reverse "worst weather" ranking (RANK-04, v1.x) — trivial once ranking exists, but deferred.
- Adjustable score weights sliders (WGT-01, v2) — component-level data already supports it; not built.
- Mobile bottom-sheet for list/legend, info panel, loading/empty states — Phase 7.

</deferred>
