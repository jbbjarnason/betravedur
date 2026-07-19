# Phase 1: Data Access & Domain Core - Context

**Gathered:** 2026-07-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Confirmed, license-clear access to real Veðurstofan station data plus a tested, shared TypeScript domain layer that computes correct climatology: window selection, circular wind mean, coverage-honest averages, and a component-level combined score. No UI, no map, no pipeline scheduling — those are later phases. Deliverables: verified API access for 2–3 stations, documented CC BY 4.0 attribution text, station metadata registry, and a fully unit-tested domain math module.

</domain>

<decisions>
## Implementation Decisions

### Combined Weather Score
- Each component (temp/rain/wind) scored via fixed, interpretable 0–10 curves: temperature better toward ~15–20°C, rain and wind less-is-better. Curves must be simple enough to explain in the "hvernig er einkunnin reiknuð?" panel (SCORE-03).
- Default weights: rain 40% / wind 30% / temp 30% — dry + calm is the classic Icelandic "gott veður"; warmth matters least.
- User-facing scale: 0–10 with a continuous red→green color ramp.
- Missing components are handled by weight renormalization (decision upgraded 2026-07-19 after research found precipitation exists only on ~8 SYNOP stations): every station is scored from its available components with weights renormalized to sum to 1 (e.g. AWS stations without rain: wind 50% / temp 50%). Stations scored without rain carry an "án úrkomu" badge everywhere the score appears, including the ranked list. The ~8 SYNOP stations get the full 3-component score. The score object must record which components contributed.
- Components are computed and stored separately; final score combined at display time (keeps future weight sliders possible — WGT-01).

### Climatology Windows & N-honesty
- Periods are calendar-date-anchored windows (e.g. "19.–25. júlí"), sliding by day — not ISO week numbers.
- A year counts toward "meðaltal N ára" only if ≥80% of the window's days have observations for that station.
- Minimum N to display an average: N ≥ 3 qualifying years; otherwise show "ófullnægjandi gögn" for that station/period.
- February 29 is excluded from windows (leap day folded out) so day-of-year stays comparable across years.

### Data Source & Station Registry
- Primary endpoint: `api.vedur.is/weather/observations/aws/day` (fields t/tx/tn, f/fx/fg, dv, r); `/observations/synop/day` as supplement for long-history manned stations.
- Include all stations with enough daily history to satisfy the N≥3 rule; record owner/type in the registry so quality filtering is possible later.
- Registry keyed on station ID with active-date windows. Different station IDs are never merged; relocations are never spliced into one series.
- Registry is a generated `stations.json` committed to the repo, refreshed by the pipeline from the API's `/stations` endpoint.

### Domain Layer Implementation
- TypeScript/Node end-to-end: the same domain math module runs verbatim in the nightly pipeline and in the browser. (Deviates deliberately from STACK.md's Python-pipeline suggestion, per ARCHITECTURE.md's shared-TS-math recommendation — prevents pipeline/client drift.)
- Wind direction: unit-vector circular mean (350° & 10° → ≈0°, never 180°). Wind speed averaged separately as a scalar.
- Precipitation: sum over the window within each year, then average those sums across qualifying years ("typical total rain for this window"). Missing precipitation values are treated as missing, never zero.
- Test framework: Vitest.

### Claude's Discretion
- Exact shape/breakpoints of the 0–10 component curves (within the "simple and explainable" constraint).
- Module/package layout for the shared domain layer.
- HTTP client and retry strategy for API calls.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield repo, no code yet. `.planning/research/` contains verified API findings (STACK.md: live-verified field schema and endpoints).

### Established Patterns
- None yet — this phase establishes them (TS project layout, Vitest, domain module boundaries).

### Integration Points
- Downstream consumers: Phase 2 aggregator (per-station per-year day-of-year summaries) and the Phase 3+ browser client both import this domain module. Design it as a pure, dependency-free TS package.

</code_context>

<specifics>
## Specific Ideas

- Research flag from ROADMAP: retrieve the Veðurstofan terms/conditions page directly (it timed out during research); verify aws/day vs synop/day field schema live; check sunshine sensor coverage (gates v1.x SUN-01).
- The 350°/10° wind test case is a named success criterion — make it an explicit unit test.
- Attribution text (CC BY 4.0) must be written down in a form the UI can consume later (UX-04).

</specifics>

<deferred>
## Deferred Ideas

- Sunshine/cloud-cover in the score (SUN-01, v1.x) — only investigate sensor coverage here, don't implement.
- User-adjustable weights (WGT-01, v2) — kept possible by component-level storage, not built now.

</deferred>
