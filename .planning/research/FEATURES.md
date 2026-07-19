# Feature Research

**Domain:** Historical-weather / climatology explorer (interactive map, Iceland — "Betra Veður")
**Researched:** 2026-07-19
**Confidence:** MEDIUM-HIGH (competitor features verified across WeatherSpark, meteoblue, NOAA/NCEI, timeanddate; UX/accessibility findings are WebSearch-verified, MEDIUM)

## Context From PROJECT.md

The product's *entire* differentiator is inverting the forecast question: not "what will the weather be" but "where in Iceland has the weather **historically** been best for a given time-of-year window." Core features are already decided (map + markers, period selector, baseline-year picker, "N years" indicator, combined score, station chart panel). This research evaluates the *feature landscape around that core* — what climatology explorers offer, what's expected, what differentiates, and what to deliberately skip. Constraints that shape every decision: **static site, GitHub Pages, no backend, Icelandic-only, nightly-Actions data pipeline.**

The static/no-backend constraint is the single biggest feature filter: any feature requiring server-side compute (arbitrary user queries over raw data, on-demand CSV generation of custom slices, per-user saved state) must either be precomputed at build time or dropped.

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Interactive pan/zoom map with station markers | This IS the product; every reference (gottvedur.is/kort) works this way | MEDIUM | Already core. Use vector tiles (MapLibre/MapTiler like gottvedur) or Leaflet. Marker count matters — see Pitfalls. |
| At-a-glance marker encoding (temp, wind arrow+speed, condition) | Mirrors gottvedur.is; users read the map without clicking | MEDIUM | Already core. Keep callout compact; legibility at zoom is the hard part. |
| Time-of-year period selector (1w/2w/3w/1mo window) | The premise — pick "week 30" and see results | MEDIUM | Already core. This replaces gottvedur's day/hour scrubber. |
| Baseline year-range picker + visible "based on N years" | Trust: users must know the sample size behind an average | MEDIUM | Already core. The "meðaltal 14 ára" label is a credibility feature, not decoration. Precompute per year-range combos or compute client-side from raw daily data. |
| Station detail on click (chart panel) | Every climatology tool drills from overview → detail (WeatherSpark, NOAA, meteoblue) | HIGH | Already core. Candlesticks for temp/wind, bars for rain. See accessibility note below. |
| Combined weather score for ranking/coloring | The "where's best" answer needs a single visual signal | MEDIUM | Already core. WeatherSpark's "Tourism Score" validates this pattern strongly. Make the formula transparent (see differentiators). |
| Legend explaining colors/score | Score coloring is meaningless without a legend | LOW | Non-negotiable once you color by score. Small but users penalize its absence. |
| Data provenance / attribution (Veðurstofan) | Official-source credibility; likely a licensing requirement | LOW | Footer + info panel. Also states data currency ("uppfært í nótt"). |
| Mobile-responsive map + detail panel | Trip planners browse on phones; map sites are heavily mobile | MEDIUM-HIGH | Use a bottom-sheet pattern for the station panel on mobile (Google-Maps-style, non-modal). Panel-over-map on desktop. |
| Loading / empty / "no data for this station in this range" states | Stations have gaps; silent blanks read as bugs | LOW-MEDIUM | Especially important given per-station history varies. |
| Info/help explaining what the map shows | Historical-not-forecast is a non-obvious mental model | LOW | One panel: "þetta er sögulegt meðaltal, ekki spá." Prevents the #1 user confusion. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Aligned with Core Value ("where has it been best").

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **"Best week finder" / rank stations for a period** | Directly answers "I'm free in week 30, where should I go?" — the raison d'être | MEDIUM | Sort/highlight top stations by score for the chosen window. This is the feature that makes it *Betra Veður* and not just a climate atlas. Consider a ranked list beside the map. |
| **Shareable URL state (permalink)** | "Look where's sunniest in week 30" is inherently a link you send a friend | MEDIUM | Encode period + year-range + selected station + map view in query params. Perfect fit for a static site (no server state needed). High value/cost ratio. Use `replaceState` for refinements, `pushState` for navigations. |
| **Transparent, explained score** | Trust differentiator vs opaque "Tourism Score" — show the temp/rain/wind inputs | LOW-MEDIUM | A small "hvernig er einkunnin reiknuð?" explainer. Icelanders are weather-savvy and will distrust a black box. |
| Reverse "worst weather" / full ranking | Curiosity + utility (avoid the rainy corner); cheap once ranking exists | LOW | Falls out of the ranking feature for near-zero cost. |
| Sunshine / cloud-cover proxy metric | WeatherSpark & meteoblue both lean on "clear days" for tourism appeal; strong signal for "good weather" | MEDIUM | **Depends on Veðurstofan data availability** — many automatic stations don't measure sunshine/cloud. Verify in data research before promising. If unavailable, precipitation + wind carries the score. |
| Daylight hours for the selected period | Trivial to compute (astronomical, lat/lon), genuinely useful for trip planning in Iceland's extreme daylight swing | LOW | Pure computation, no data dependency. Cheap, delightful, on-theme. |
| Station comparison (2+ stations side by side) | NOAA/WeatherSpark both offer multi-location compare; helps decide between two candidate trips | MEDIUM-HIGH | Valuable but adds UI complexity. Defer to v1.x. Ranked list may satisfy most of this need more cheaply. |
| Adjustable score weights (temp vs rain vs wind sliders) | Personalizes "best" — a windsurfer weights wind opposite a hiker | MEDIUM | Recompute score client-side on slider change. Nice differentiator but risks over-complicating v1. PROJECT.md flags it as "possibly later." Defer. |
| "Meðaltal / dreifing" toggle on charts | Lets users see typical vs variability — the honest story of Icelandic weather | LOW-MEDIUM | Enhances the chart panel; ties into the candlestick accessibility problem below. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems given this product's scope/constraints.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Weather **forecasts** / current conditions | Users conflate weather sites with forecasts | Explicitly out of scope; gottvedur.is/vedur.is own this; would dilute the whole premise | Link out to vedur.is for forecasts; stay ruthlessly historical |
| Raw daily-observation download / full CSV export | "Give me the data" from power users; NOAA offers it | Static-site can't generate arbitrary slices on demand; committing/exposing full raw archive bloats repo (GitHub Pages size limits) and invites scraping-of-scraper concerns | Link to Veðurstofan's own open-data portal (the authoritative source) instead of re-hosting it |
| Arbitrary date-range queries (any start–end, not year windows) | Flexibility | Combinatorial explosion — can't precompute all ranges; forces client-side compute over large raw data | Constrain to the designed windows (1w/2w/3w/1mo) + baseline-year selection, precomputed |
| User accounts / saved preferences | "Save my favorite spots" | Requires backend/auth; PROJECT.md explicitly excludes; static-hostile | URL permalink IS the save mechanism — bookmark the link |
| English / multi-language UI | Broaden audience | Out of scope (Icelandic audience); doubles UI/copy maintenance; encourages scope creep toward tourists | Icelandic-only for v1; revisit only if a tourist audience is validated |
| Climate-change trend analysis / warming lines | "Show me how it's changed" | Different product (that's the Climate Atlas of Iceland's job); statistically fraught with short/uneven station records; distracts from trip-planning value | Stay descriptive ("historically best"), not analytical. Link to gottvedur.is climate atlas. |
| Real-time / hourly granularity | "Current conditions" instinct | Nightly pipeline can't support it and climatology doesn't need it | Daily granularity is correct for the use case; state it clearly |
| Heavy per-marker animation / weather-condition sprites | "Make it pretty like gottvedur" | Performance killer with many DOM markers on mobile; distracts from the score signal | Clean static markers; let color=score do the visual work |
| Social login / comments / reviews | Engagement | No backend; moderation burden; off-mission | None — this is a reference tool, not a community |

## Feature Dependencies

```
Interactive map + station markers
    └──requires──> Precomputed per-station climatology data (build/pipeline)
                       └──requires──> Nightly Actions data pipeline + baseline aggregation

Combined weather score (coloring/ranking)
    └──requires──> Per-station aggregates for {period × year-range}
    └──enables───> "Best week finder" / ranking
                       └──enables───> Reverse "worst weather" ranking
    └──enables───> Adjustable score weights (needs client-side recompute of score)

Station detail chart panel
    └──requires──> Per-day-of-year distribution data per station
    └──enhanced-by─> "meðaltal / dreifing" toggle
    └──enhanced-by─> Accessible chart encoding (see below)

Shareable URL state (permalink)
    └──requires──> Period selector + year-range picker + station selection all reading/writing URL params
    └──replaces───> User accounts / saved preferences (anti-feature)

Mobile bottom-sheet panel
    └──requires──> Station detail chart panel (renders inside it)

Sunshine/cloud metric ──depends on──> Veðurstofan data availability (VERIFY FIRST)
Daylight hours ──independent──> (pure astronomical computation, no data dependency)
Station comparison ──requires──> Station detail rendering componentized for N stations
```

### Dependency Notes

- **Everything requires the aggregation strategy first.** The pivotal architectural choice: precompute all {period × year-range} aggregates at build time (larger data, instant/simple client) vs. ship raw daily data and aggregate client-side (smaller build artifacts, flexible score weights, more client compute). This choice gates score weights, best-week finder responsiveness, and repo size. Flag for STACK/ARCHITECTURE research.
- **Score → ranking → best-week finder is a single feature chain.** Once the score exists, ranking and the best-week finder are cheap; build them together.
- **Adjustable weights force client-side score computation.** If you want weight sliders (even later), don't bake the final score into precomputed data — precompute the *components* (temp/rain/wind aggregates) and combine them in the browser. Decide this early even if sliders ship later, or you'll pay a rework cost.
- **Permalink is load-bearing** — it substitutes for the entire accounts/saved-state feature set that's out of scope. Prioritize it.

## MVP Definition

### Launch With (v1)

Minimum to validate "map of where weather has been best for a chosen window."

- [ ] Interactive Iceland map with station markers (temp, wind arrow+speed, condition) — the product
- [ ] Period selector (1w/2w/3w/1mo window) — the premise
- [ ] Baseline year-range picker + visible "meðaltal N ára" — trust
- [ ] Combined weather score coloring markers + a legend — the "where's best" signal
- [ ] Ranked "best stations for this period" list / highlight — the actual answer to the user's question
- [ ] Station click → chart panel (candlesticks temp/wind, bars rain) with an accessible reading — the detail
- [ ] Mobile-responsive with bottom-sheet detail panel — audience browses on phones
- [ ] Shareable URL state (period + year-range + station + view) — sharing is the growth loop and the "save" substitute
- [ ] Info panel clarifying "historical, not forecast" + Veðurstofan attribution + data currency — prevents the core misunderstanding
- [ ] Daylight hours for selected period — cheap, on-theme, no data dependency

### Add After Validation (v1.x)

- [ ] Sunshine / cloud-cover metric in the score — **once data availability is confirmed**; if present it meaningfully sharpens "good weather"
- [ ] Station comparison (2 stations side by side) — when users ask "A or B?"
- [ ] "Meðaltal / dreifing" chart toggle — when candlestick comprehension feedback comes in
- [ ] Reverse "worst weather" ranking — trivial add once ranking exists; add on request

### Future Consideration (v2+)

- [ ] Adjustable score weights (temp/rain/wind sliders) — defer until there's evidence users want to re-weight; needs component-level precompute in place
- [ ] Additional metrics if data supports (humidity, gusts) — only if they earn their UI space
- [ ] English UI — only if a non-Icelandic audience is validated (currently anti-feature)

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Interactive map + markers | HIGH | HIGH | P1 |
| Period selector | HIGH | MEDIUM | P1 |
| Baseline year-range + "N ára" | HIGH | MEDIUM | P1 |
| Score coloring + legend | HIGH | MEDIUM | P1 |
| Best-week ranking / highlight | HIGH | MEDIUM | P1 |
| Station chart panel (accessible) | HIGH | HIGH | P1 |
| Mobile bottom-sheet panel | HIGH | MEDIUM | P1 |
| Shareable URL permalink | HIGH | MEDIUM | P1 |
| "Historical not forecast" info | MEDIUM | LOW | P1 |
| Daylight hours | MEDIUM | LOW | P1/P2 |
| Sunshine/cloud metric | HIGH | MEDIUM (data-gated) | P2 |
| Station comparison | MEDIUM | MEDIUM-HIGH | P2 |
| Meðaltal/dreifing toggle | MEDIUM | LOW-MEDIUM | P2 |
| Reverse "worst" ranking | LOW-MEDIUM | LOW | P2 |
| Adjustable score weights | MEDIUM | MEDIUM | P3 |
| Data download / CSV | LOW | MEDIUM | P3 (lean anti-feature → link out) |

## The Candlestick Accessibility Problem (flagged in the question)

**Finding (MEDIUM confidence, WebSearch-verified):** Box-plot / candlestick encodings are routinely confused by lay audiences — even data-literate users conflate financial candlesticks (open/high/low/close) with statistical box-plots (median/quartiles/whiskers), and the two encode *different things*. For a general Icelandic trip-planning audience, a raw candlestick risks being decorative rather than informative.

**Implications for the (already-decided) candlestick charts:**
- Decide and label the semantics explicitly. For weather this is a *distribution* per day-of-year across baseline years (min / typical range / max), i.e. box-plot semantics rendered candlestick-style — NOT financial OHLC. Say so in the legend.
- Provide a plain-language reading key: "kertið sýnir dæmigert bil; strikin sýna kaldasta/hlýjasta." One sentence prevents most confusion.
- Consider a simpler default with candlesticks as an opt-in "detail" view, or the meðaltal/dreifing toggle (P2). A shaded min–max band + mean line is often more legible to lay users than discrete candles.
- Ensure color is not the only channel (color-blind safety) and that the panel works in the bottom sheet on narrow screens.

This is a **design-research flag for the station-panel phase**, not a v1 blocker — but resolve the encoding+labeling before building it, or expect comprehension complaints.

## Competitor Feature Analysis

| Feature | WeatherSpark | meteoblue climate | NOAA/NCEI Normals | Our Approach |
|---------|--------------|-------------------|-------------------|--------------|
| Overview visualization | Colorful year-round "climate summary" graphic | 30yr modelled climate diagrams | Station-select → graphs/tables | **Map-first**, station markers colored by score (unique framing) |
| "Best time" signal | Tourism Score (temp+cloud+rain), "best time to visit" | Sunny/cloudy day counts | None (raw normals) | Combined score + **best-week finder** (our core, map-based) |
| Location comparison | Up to 6 locations | Per-location | Per-station | Ranked list v1; side-by-side v1.x |
| Detail charts | Line/heatmap/bar/stacked-area | Bar-based day-count diagrams | Line graphs + tables | Candlestick (distribution) + rain bars, with plain-language key |
| Sunshine/daylight | Yes (both) | Yes (sunny days) | Limited | Daylight v1 (computed); sunshine v1.x if data allows |
| Data download | Chart export, licensing | Paid API/history | CSV/XML download | **Link out to Veðurstofan** (don't re-host) |
| Sharing | Per-URL pages | Per-URL pages | Per-station URL | **Full URL state permalink** (our sharing/save mechanism) |
| Units/locale | 18+ languages, unit toggle | Multi-language | US units | **Icelandic + metric only** (scoped) |
| Data basis | Reanalysis (MERRA-2) | 30km model simulation | Real station obs | **Real Veðurstofan station obs** (credibility edge — actual measurements, not model grids) |

**Positioning takeaway:** Every competitor is location-first (pick a place, see its climate). Betra Veður is **question-first / map-first** (pick a time, see the best places). That inversion — plus real station observations and Icelandic focus — is the defensible differentiator. Don't dilute it by drifting toward being a generic climate atlas.

## Sources

- WeatherSpark climate page (Reykjavík) — features, Tourism Score, compare, sunshine/daylight: https://weatherspark.com/ (verified via WebFetch, HIGH)
- meteoblue climate diagrams (modelled, day-count charts, wind rose, cloud cover): https://content.meteoblue.com/en/private-customers/website-help/history-and-climate/climate-modelled (MEDIUM)
- NOAA/NCEI U.S. Climate Normals (station select, graphs, CSV/XML download): https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals ; https://www.ncei.noaa.gov/access/us-climate-normals/ (MEDIUM)
- timeanddate climate averages (monthly hottest/coldest/wettest/windiest): https://www.timeanddate.com/weather/usa/new-york/climate (MEDIUM)
- gottvedur.is / Icelandic Met Office (reference UI, observation sources, climate atlas): https://gottvedur.is/en/ ; https://en.vedur.is/ (MEDIUM)
- Box-plot vs candlestick comprehension for lay users: https://visionlabs.com/blog/box-water/ ; https://datavizcatalogue.com/methods/candlestick_chart.html (MEDIUM)
- URL-as-state / shareable map permalinks: https://alfy.blog/2025/10/31/your-url-is-your-state.html ; https://blog.logrocket.com/url-state-usesearchparams/ (MEDIUM)
- Mobile map UX: bottom sheets + many-marker performance: https://blog.logrocket.com/ux-design/bottom-sheets-optimized-ux/ ; https://mapsplatform.google.com/resources/blog/google-maps-platform-best-practices-optimization-and-performance-tips/ (MEDIUM)

---
*Feature research for: historical-weather / climatology map explorer (Iceland)*
*Researched: 2026-07-19*
