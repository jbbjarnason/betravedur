# Pitfalls Research

**Domain:** Static historical-weather/climatology map site (Icelandic met station data, GitHub Pages + nightly GitHub Actions data pipeline)
**Researched:** 2026-07-19
**Confidence:** HIGH for GitHub Pages/Actions and statistics pitfalls (official docs + multiple sources); MEDIUM for Veðurstofan-specific data terms and API shape (needs direct confirmation against api.vedur.is Swagger and en.vedur.is/about-imo/the-web/conditions — both timed out during research and MUST be verified in Phase 1).

## Critical Pitfalls

### Pitfall 1: "Meðaltal N ára" that silently lies about missing years

**What goes wrong:**
The site advertises "average over 14 years" for a station/period, but several of those years actually had no observations (station closed, sensor down, gaps). The displayed average is really based on 6 usable years while the label says 14. Users trust a number that is far less robust than it appears — the exact failure the PROJECT explicitly wants to avoid ("Every average visibly states how many years it is based on").

**Why it happens:**
Developers compute `mean(all_values_in_window)` and separately compute `N = end_year - start_year + 1` from the picker. The two are decoupled: N comes from the UI selection, the mean comes from whatever data exists. Missing days/years quietly drop out of the mean but are still counted in N.

**How to avoid:**
- Compute N from the *data actually used*, not from the picker range. Count distinct years that have a qualifying observation for that day-of-year window.
- Set a minimum-coverage threshold per station-period (e.g. require ≥N% of days present in a year for that year to "count"). Expose the effective N and, ideally, a coverage indicator (e.g. "14 af 15 árum").
- Store per-cell provenance: number of contributing years, number of contributing days, number of gaps. Carry it through to the UI, not just the mean.
- Distinguish "no data" from "zero" everywhere (precipitation especially — see Pitfall 5).

**Warning signs:**
A station shows a confident average for a period where you know the station was offline; the effective-N never changes when you widen/narrow the baseline range; QA spot-checks against vedur.is climatology tables diverge.

**Phase to address:** Data-modeling / aggregation phase (the phase that defines the climatology computation), before any UI shows averages.

---

### Pitfall 2: Wind direction averaged with a plain arithmetic mean (circular-data bug)

**What goes wrong:**
Wind direction is a circular quantity (0–360° with 0 == 360). Averaging arithmetically gives nonsense: mean of 350° and 10° is computed as 180° (due south) when the true average is 0° (due north). The direction arrow on every marker can point the exact wrong way.

**Why it happens:**
Direction *looks* like an ordinary number, so it gets averaged like temperature. The bug is invisible in code review and only shows up as subtly-wrong arrows that few people cross-check.

**How to avoid:**
- Use the vector/circular mean: decompose each observation into u = speed·sin(dir), v = speed·cos(dir) components, sum, then take atan2 of the resultant. This gives a speed-weighted mean direction (the meteorologically standard "resultant wind"). Report resultant speed separately from scalar-mean speed if you show both.
- Decide explicitly whether the marker arrow shows the *prevailing* direction (mode / most-frequent sector, often more meaningful for "where has wind been calm/favorable") vs the *vector-mean* direction. A near-zero resultant (winds from all directions) is itself information — show it (e.g. "breytileg átt").
- Wind *speed* can use a normal scalar mean; only direction needs circular treatment. Keep the two computations clearly separate.

**Warning signs:**
Arrows on coastal stations point inland/offshore against known prevailing patterns; the resultant wind speed is implausibly low while measured speeds are high (indicates highly variable direction — correct, but worth surfacing).

**Phase to address:** Data-modeling / aggregation phase — same phase as Pitfall 1. Add a unit test with the 350°/10° case as a regression guard.

---

### Pitfall 3: Station moves, renames, closures, and a changing station set treated as stable

**What goes wrong:**
A station is relocated (e.g. hilltop to valley, or coastal to sheltered), renamed, replaced by an automatic station with a new ID, or closed mid-baseline. If the pipeline keys purely on a name or assumes the station set is constant across years, you get: (a) discontinuities baked into "averages" that mix two physically different locations, (b) markers that vanish/appear as the baseline range changes, (c) duplicate or split station histories. Iceland's network has real churn (manned SYNOP → automatic AWS transitions, Vegagerðin/Landsvirkjun stations with different lineage).

**Why it happens:**
Homogenization is a whole subfield of climatology precisely because raw station series contain non-climatic jumps from relocations and instrument changes. A greenfield project naturally models "a station = a row on the map" and never encounters the messy metadata until averages look wrong.

**How to avoid:**
- Key everything on the *official station ID*, never the display name. Keep name history as metadata.
- Pull and store station metadata: coordinates, elevation, active date range, operator, station type (manned/AWS), and any documented relocation. Veðurstofan/apis.is expose stations including ones no longer in operation — capture their active windows.
- For MVP, do NOT attempt full statistical homogenization (out of scope and error-prone). Instead be honest: if a station moved during a baseline range, flag it ("stöð flutt YYYY") or treat pre/post-move as separate series. Never silently splice.
- Handle stations that don't exist for the whole baseline: only plot markers with data in the selected range; show effective coverage (ties into Pitfall 1).
- Don't compare/rank stations at wildly different elevations or exposures as if equivalent — most Icelandic stations sit in lowlands <200m near habitation; a highland station is not comparable to a coastal one for a "best weather" score.

**Warning signs:**
A station's average temperature shows a sharp step in a specific year; two markers sit almost on top of each other (a rename/replacement not merged, or a real move not split); marker counts jump when you change the year range.

**Phase to address:** Data-source integration phase (ingesting station metadata) — this must precede aggregation. Cross-check station metadata during the same phase as the API integration.

---

### Pitfall 4: Repo bloat and GitHub Pages 1GB limit from nightly append commits

**What goes wrong:**
Nightly commits that rewrite/append data files grow Git history unbounded. Even if the working tree stays small, Git retains every historical version of every changed file forever. Over months/years the `.git` history balloons, clones slow to a crawl, and you approach the GitHub Pages 1GB soft limit (and repo soft limits) with mostly dead history. Committing one big monolithic data file that changes nightly is the worst case — each night stores a fresh full copy.

**Why it happens:**
"Append to the repo's data" (a stated requirement) is easy to implement as "rewrite data.json nightly and commit." Git history cost is invisible day-to-day and only bites after the project has run for a long time.

**How to avoid:**
- Partition data files so nightly appends touch small, additive files (e.g. per-station and/or per-year/per-month JSON), not one giant blob. Small deltas → small history growth.
- Consider a dedicated data branch (as the PROJECT already contemplates) and/or an orphan branch you periodically squash, so `main`/Pages history stays lean. Alternatively store raw data in Releases/artifacts and commit only the compiled site-ready aggregates.
- Precompute climatology aggregates at build time; the *browser* should download compact derived files, not raw daily observations for every station (also a mobile-load concern — see Pitfall 8).
- Set a size budget and monitor `.git` size in CI; plan a history-squash strategy from day one rather than discovering the problem at 900MB.
- Respect Pages build limits: soft limit ~10 builds/hour and 1GB published-site size. Nightly is fine for build frequency; size is the real risk.

**Warning signs:**
`git clone` getting noticeably slower; `.git` directory far larger than the checked-out tree; a single data file appearing in nightly diffs as a full rewrite.

**Phase to address:** Data pipeline / storage-layout phase — decide file partitioning and branch strategy *before* the first nightly run accumulates history. Retrofitting requires history rewrite.

---

### Pitfall 5: Precipitation averaged like temperature (aggregation vs mean, trace, and no-data-vs-zero)

**What goes wrong:**
Rain is treated with the same arithmetic-mean logic as temperature, producing misleading numbers: (a) averaging daily amounts including/excluding dry days inconsistently, (b) counting a missing observation as 0 mm (dry) rather than "unknown," inflating the apparent dryness, (c) losing trace-precipitation days, (d) presenting a "mean daily rainfall" that users misread. For a "where has it been driest/best" score this directly corrupts the ranking.

**Why it happens:**
Precipitation is skewed and zero-inflated, unlike temperature. The intuitive `mean(values)` is wrong or ambiguous, and missing-as-zero is an easy default in aggregation code.

**How to avoid:**
- Decide and document the precipitation metric explicitly: e.g. mean total precipitation for the window, and/or number of wet days (days ≥ threshold), and/or probability of a dry day. "Number of dry days in a typical week 30" is often more decision-useful than a mean mm figure for trip planning.
- Never treat missing as zero. Exclude missing days from denominators; carry coverage (Pitfall 1).
- Handle trace amounts consistently (a documented convention, e.g. treat trace as a small nonzero or as a wet-day flag) rather than silently dropping.
- For the combined weather score, normalize precipitation on a sensible scale and be explicit about how "no rain data" stations are handled (exclude vs penalize) — don't let a data gap make a station look like paradise.

**Warning signs:**
Stations with sparse rain records rank as "best/driest"; total-vs-mean numbers don't reconcile with vedur.is monthly climatology; wet-day counts exceed days-with-data.

**Phase to address:** Data-modeling / aggregation phase (with Pitfalls 1 & 2). Score-design phase for the combined-score handling.

---

### Pitfall 6: Nightly Actions cron silently stops (missed runs, 60-day auto-disable)

**What goes wrong:**
The pipeline appears to work, then quietly stops updating. Two distinct GitHub behaviors: (1) scheduled workflows are *not* guaranteed to run on time — they are delayed or dropped under high load, especially at busy times like top-of-hour UTC (00:00); (2) in a repo with no *commit* activity for 60 days, scheduled workflows are **automatically disabled** with no error and only an easily-missed email. Because it's an official Icelandic data site, silent staleness undermines trust.

**Why it happens:**
Cron "just works" in dev testing. The failure modes are invisible: no logs for a run that never fired, no banner when auto-disabled. And a data-only project may have no human commits for weeks (the nightly bot commits *are* activity, so this project is somewhat protected — but only if the bot commits successfully; a broken bot both stops updating AND stops resetting the 60-day timer, a double failure).

**How to avoid:**
- Avoid scheduling at :00 of the hour and at 00:00 UTC; pick an off-peak minute (e.g. `17 4 * * *`) to reduce drop/delay probability.
- Treat the nightly commit as the keepalive — but add explicit monitoring so a *failed* nightly is caught: an external heartbeat/dead-man's-switch (e.g. healthchecks.io ping on success) or a build that fails loudly and notifies. Do not rely on GitHub's own notifications.
- Surface data freshness in the UI ("gögn uppfærð: YYYY-MM-DD") sourced from the data itself, so stale data is visible to you and users immediately.
- Make the workflow idempotent and append-only (already a stated constraint): a missed night must self-heal by fetching the whole gap next run, not just "yesterday." Fetch "everything since last stored observation," not "last 24h."
- Add `workflow_dispatch` so you can manually trigger/backfill.

**Warning signs:**
"Data updated" date stops advancing; Actions tab shows no recent scheduled runs; you got a single "workflow disabled" email you almost ignored.

**Phase to address:** Data pipeline phase — build monitoring + idempotent gap-filling + freshness display as part of the pipeline, not as an afterthought.

---

### Pitfall 7: Candlesticks used as decorative financial chrome instead of honest distribution encoding

**What goes wrong:**
Candlesticks are a *financial* idiom encoding open/high/low/close with directional up/down coloring (green = close>open). Weather has no "open" or "close" and no directional gain/loss. If the encoding is copied literally, the green/red coloring and body direction carry meaning that doesn't exist, and users trained on stock charts misread it. Worse, the min/max "wick" for a day-of-year across baseline years can span extreme outliers, making every day look wildly volatile.

**Why it happens:**
The PROJECT chose candlesticks as "the user's preferred visual language." It's easy to grab a candlestick chart library and feed weather into OHLC slots that don't map cleanly, inheriting finance semantics by accident.

**How to avoid:**
- Define the four values explicitly and pick statistics that are honest for weather: e.g. body = interquartile range (25th–75th percentile) of that day-of-year across years, whiskers/wick = min–max or 10th–90th percentile, a marked line = median. This is essentially a box/whisker rendered candlestick-style — legitimate and clear.
- Kill financial semantics: no green-up/red-down coloring implying direction; use a single color or a temperature colormap. Add a legend that states exactly what body and wick mean.
- Prefer percentiles over raw min/max to avoid a single freak day dominating the whole range; if showing absolute extremes, label them as such.
- Same care for wind: candlestick over wind *speed* is fine; do NOT candlestick wind *direction* (circular — Pitfall 2). Rain as bars is appropriate (PROJECT already plans this).
- Provide a plain-language read ("dæmigert bil" for the box) since the Icelandic general-public audience won't read it as a trader would.

**Warning signs:**
Reviewers ask "why is this day green?"; the wick spans an implausible range every day; users interpret the chart as a trend/forecast rather than a climatology distribution.

**Phase to address:** Chart/detail-panel design phase. Settle the encoding + legend before implementation; the PROJECT flags "rain encoding still open" and "exact encoding to be settled."

---

### Pitfall 8: Shipping raw daily observations to the browser (mobile payload blowout)

**What goes wrong:**
To power on-demand candlesticks and user-selectable baseline ranges, it's tempting to load all daily observations for stations into the browser. Decades × ~100+ stations × daily temp/wind/precip is many MB of JSON — brutal on Icelandic mobile connections and slow to parse. The map feels sluggish or fails to load on phones (the primary trip-planning device).

**Why it happens:**
"Static site, no backend" pushes computation to the client; the simplest design fetches everything and computes in JS. The dataset is small enough to *seem* fine on desktop dev.

**How to avoid:**
- Precompute at build time. For the map view, ship only per-station climatology aggregates keyed by (day-of-year window). Because the baseline year-range is user-selectable, precompute per-year day-of-year aggregates so the client can combine a small number of yearly summaries instead of raw days.
- Lazy-load the detailed candlestick data only when a station is clicked (per-station file), not up front.
- Split data by station and/or period so the initial map load is tiny; fetch detail on demand. Gzip/Brotli is automatic on Pages — but keep files granular so caching works.
- Set an initial-payload budget (e.g. <500KB for first meaningful map) and test on a throttled mobile profile.

**Warning signs:**
First map paint pulls multi-MB JSON; parsing jank on mid-range phones; time-to-interactive fine on laptop but poor on phone.

**Phase to address:** Data pipeline / build-output phase (defines the client-facing file shapes) and map-implementation phase (lazy loading).

---

### Pitfall 9: Map marker overload and Iceland-specific projection/interaction issues

**What goes wrong:**
Dozens of stations cluster around Reykjavík and the coast, overlapping into an unclickable blob when zoomed out; some stations sit almost on top of each other (rename/replacement pairs, or co-located AWS/manned). On mobile, tap targets are too small and pan/zoom fights with marker taps. The PROJECT explicitly wants "zoom-dependent station density" like gottvedur.is/kort — hard to get right.

**Why it happens:**
Iceland's population and stations concentrate in the lowlands; a naive "plot every marker" is fine on a wide desktop view but collapses on a phone. Overlapping-at-max-zoom markers can't be resolved by clustering alone.

**How to avoid:**
- Use zoom-dependent density/clustering (Leaflet.markercluster or MapLibre clustering) so the coast doesn't become a blob; the PROJECT's reference (gottvedur.is) uses MapTiler/MapLibre + OSM, which supports this natively.
- For markers that overlap even at max zoom (co-located stations), add spiderfy (OverlappingMarkerSpiderfier) or merge genuine duplicates — clustering alone won't resolve exact overlaps.
- Size tap targets for touch (≥44px), and ensure the callout (temp/wind arrow/condition) stays legible on small screens; don't cram all three metrics if it becomes unreadable.
- Test the actual Iceland extent and default zoom on a phone; ensure the map doesn't let users pan into empty ocean and lose the country. Constrain bounds to Iceland.
- Web Mercator distorts high latitudes (Iceland ~64–66°N) — fine for a national interactive map, but don't use pixel distances for "nearest station" or area math; use geographic distance.

**Warning signs:**
Coastal markers unclickable at country zoom; two markers you can never separate; misfires between pan and marker-tap on mobile; users can pan Iceland off-screen.

**Phase to address:** Map-implementation phase; clustering/overlap and mobile interaction should be explicit success criteria there.

---

### Pitfall 10: Republishing Veðurstofan data without confirming terms/attribution

**What goes wrong:**
The whole site rehosts and redistributes official Icelandic Met Office observations. If the terms require attribution, restrict commercial use, restrict bulk redistribution, or require a specific data-source credit, shipping without compliance is both a legal and a reputational problem (this site visibly stands next to gottvedur.is, which IMO operates).

**Why it happens:**
Open-data ≠ unrestricted. It's easy to assume "public data = do anything." The exact terms (en.vedur.is/about-imo/the-web/conditions and any per-dataset license) and API rate limits were not fully verifiable during research (pages timed out) and MUST be confirmed.

**How to avoid:**
- Read en.vedur.is/about-imo/the-web/conditions and the climatology-data / api.vedur.is terms *before* building the pipeline. Confirm: attribution wording required, commercial/redistribution allowed, bulk-download/rate-limit rules, and whether the athuganir.vedur.is download portal has different terms than the API.
- Add clear source attribution in the UI regardless ("Gögn frá Veðurstofu Íslands") — it's honest, expected, and cheap.
- Respect API rate limits in the nightly fetch: throttle, back off on errors, and fetch incrementally (only new observations) rather than re-pulling full history nightly (also helps Pitfall 4 and 6).
- Consider contacting IMO if intent (a public site rehosting their data) is ambiguous under the terms.

**Warning signs:**
No license page was actually read before ingestion started; nightly job pulls full history each run; no attribution in the UI.

**Phase to address:** Data-source integration phase — terms review is a gate before the first data pull. Attribution goes in the UI phase.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| One monolithic `data.json` rewritten nightly | Trivial pipeline | Unbounded `.git` growth; hits 1GB; slow clones (Pitfall 4) | Never for nightly-committed data; OK only for a static, rarely-changed lookup |
| Compute averages in the browser from raw daily data | No build-time aggregation code | Mobile payload blowout, slow TTI (Pitfall 8) | Prototype only; must precompute before ship |
| Arithmetic mean for wind direction | Simple, "it's just a number" | Wrong arrows, silent (Pitfall 2) | Never |
| Missing observation stored/counted as 0 | No null handling | Corrupts precip dryness + N honesty (Pitfalls 1, 5) | Never |
| N from picker range, not from data | Easy label | Dishonest "meðaltal N ára" (Pitfall 1) | Never — this is the project's core promise |
| Schedule cron at 00:00 UTC | Obvious "midnight" | Higher delay/drop odds | Move to off-peak minute; costs nothing |
| Skip external monitoring of nightly job | Less setup | Silent staleness for weeks (Pitfall 6) | MVP only if data-freshness is shown in UI as a stopgap |
| Literal financial candlesticks (green/red OHLC) | Free from chart lib | Misleading semantics (Pitfall 7) | Never; redefine as percentile box/whisker |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Veðurstofan / apis.is API | Assuming stable station set; keying on name | Key on station ID; store active-date windows, elevation, operator, type; include decommissioned stations (Pitfall 3) |
| Veðurstofan terms/license | Assuming "open = unrestricted" | Read conditions page + dataset license; add attribution; respect rate limits (Pitfall 10) |
| Nightly fetch | "Fetch last 24h" | "Fetch everything since last stored observation" → idempotent gap-fill on missed runs (Pitfall 6) |
| GitHub Actions cron | Trust it runs on time / stays enabled | Off-peak schedule + heartbeat monitor + nightly commit as keepalive + `workflow_dispatch` (Pitfall 6) |
| GitHub Pages | Ship raw data, ignore history growth | Partitioned files, precomputed aggregates, lazy detail load, history-squash plan (Pitfalls 4, 8) |
| Map base map (MapTiler/OSM) | Missing attribution / no bounds constraint | Include base-map attribution; constrain to Iceland bounds; cluster markers (Pitfall 9) |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Raw daily data to client | Multi-MB first load, mobile parse jank | Precompute per-year day-of-year aggregates; lazy per-station detail | As history deepens (each added year adds data) |
| All markers, no clustering | Unclickable coastal blob at country zoom | Zoom-dependent clustering + spiderfy for co-located | Immediately at national zoom on mobile |
| `.git` history growth from nightly commits | Slow clones, `.git` >> tree, nearing 1GB | Partitioned additive files; data/orphan branch; periodic squash | Months–years of nightly runs |
| Re-pulling full station history nightly | Long jobs, rate-limit hits, big diffs | Incremental fetch since last observation | Every night once history is large |
| Recomputing all aggregates every build | Slow builds, near Pages 10-builds/hr risk | Incremental aggregation of only new data | As station count / year span grows |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Committing an API token/key for the data source into the repo | Public leak, abuse, revocation | Use GitHub Actions secrets; never commit credentials; the *published* site should need no keys |
| Trusting fetched data blindly into the build/site | Malformed/injected values break aggregation or render | Validate/schema-check fetched observations; clamp implausible values; fail the build on schema drift |
| No SRI / pinned versions for CDN map+chart libs | Supply-chain tampering on a public site | Pin versions, prefer SRI or self-host libs |
| Exposing internal fetch errors / stack traces in the static output | Info leak, ugly UX | Log in CI only; ship clean data + graceful "no data" states |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| "Meðaltal N ára" that overstates coverage | Users trust weak averages | Show *effective* N + coverage; distinguish no-data from zero (Pitfall 1) |
| Wrong wind arrows | Trip planning on false info | Circular/vector mean; show "breytileg átt" when resultant is weak (Pitfall 2) |
| Candlesticks read as stock charts | Misinterpret volatility/direction | Percentile box/whisker + explicit Icelandic legend, no green/red (Pitfall 7) |
| Ranking stations of different elevation/exposure as equal | "Best weather" points to an unrepresentative station | Compare like-with-like; note station context; lowlands vs highland caveat (Pitfall 3) |
| Marker blob / tiny tap targets on mobile | Can't select stations | Clustering, spiderfy, ≥44px targets, Iceland bounds (Pitfall 9) |
| No visible data-freshness date | Users can't tell if data is stale | Show "gögn uppfærð: date" from the data itself (Pitfall 6) |
| Combined score hides its weighting | Users can't tell why a place ranks high | Expose/explain temp+rain+wind weighting; handle missing components honestly |

## "Looks Done But Isn't" Checklist

- [ ] **"Meðaltal N ára":** Often missing → verify N is derived from data actually used, not the picker range; test a station with a gap year.
- [ ] **Wind direction:** Often missing → verify vector/circular mean via the 350°/10° == ~0° regression test; check a "variable direction" case.
- [ ] **Precipitation:** Often missing → verify missing ≠ zero; verify wet-day count ≤ days-with-data; reconcile a station against vedur.is monthly climatology.
- [ ] **Station metadata:** Often missing → verify IDs used as keys; verify a moved/renamed/closed station is handled (flag or split, not spliced).
- [ ] **Nightly pipeline:** Often missing → verify idempotent gap-fill (simulate a skipped night); verify heartbeat/monitor fires on failure; verify `workflow_dispatch` works.
- [ ] **Repo growth:** Often missing → verify nightly diff is a small additive change, not a full-file rewrite; verify a history-squash/branch plan exists.
- [ ] **Mobile map:** Often missing → verify first-load payload budget on a throttled phone; verify clustering + tap targets; verify Iceland bounds.
- [ ] **Attribution/terms:** Often missing → verify the IMO conditions page was actually read; verify UI attribution and API rate-limit compliance.
- [ ] **Candlestick legend:** Often missing → verify a plain-language legend states what body/wick/line mean; verify no misleading directional coloring.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Dishonest N / missing-as-zero baked into aggregates | MEDIUM | Fix aggregation logic; recompute all derived files from raw (keep raw!); redeploy |
| Wrong wind-direction averaging | LOW | Fix formula, recompute aggregates, redeploy (raw data unaffected) |
| Repo history bloat near 1GB | HIGH | History rewrite/squash or migrate to fresh repo/orphan branch; re-point Pages; disruptive |
| Cron silently stopped / auto-disabled | LOW | Re-enable workflow; idempotent gap-fill backfills the missed range on next run |
| Station move spliced into one series | MEDIUM | Re-ingest with ID+date-window metadata; split series; recompute affected stations |
| Terms violation discovered post-launch | MEDIUM–HIGH | Add attribution / adjust redistribution; worst case take data offline until compliant |
| Mobile payload too heavy | MEDIUM | Introduce build-time precompute + lazy per-station loading; restructure client data files |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Dishonest "meðaltal N ára" (1) | Aggregation/data-modeling | Gap-year test shows reduced effective N |
| Wind direction circular bug (2) | Aggregation/data-modeling | 350°/10° regression test passes |
| Station moves/renames/closures (3) | Data-source integration | Moved-station case flagged/split; markers keyed by ID |
| Repo bloat / 1GB (4) | Data pipeline / storage layout | Nightly diff is small+additive; `.git` size monitored |
| Precipitation aggregation (5) | Aggregation/data-modeling | Missing≠zero; wet-days ≤ days-with-data; reconciles w/ vedur.is |
| Cron silent failure / 60-day disable (6) | Data pipeline | Heartbeat fires on failure; simulated missed night self-heals |
| Misleading candlesticks (7) | Chart/detail-panel design | Percentile encoding + legend; no directional coloring |
| Raw data to browser (8) | Build-output + map impl | First-load under budget on throttled mobile |
| Marker overload / Iceland map (9) | Map implementation | Clustering + spiderfy + bounds + tap targets verified on phone |
| Data terms/attribution (10) | Data-source integration (gate) | Conditions read pre-ingest; attribution in UI; rate-limit respected |

## Sources

- Icelandic Met Office API portal — https://api.vedur.is/ and weather API https://api.vedur.is/weather/ (MEDIUM: landing pages confirmed; Swagger/terms detail NOT fully retrieved — verify in Phase 1)
- IMO climatological data — https://en.vedur.is/climatology/data/ (MEDIUM)
- IMO terms & conditions — https://en.vedur.is/about-imo/the-web/conditions (MEDIUM: page timed out; MUST be read before ingestion)
- IMO data download portal — https://athuganir.vedur.is/ (MEDIUM)
- apis.is docs (Iceland open data aggregator, includes vedur) — https://docs.apis.is/ (MEDIUM)
- GitHub Pages limits (1GB size, ~10 builds/hr) — https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits (HIGH)
- GitHub repository limits — https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits (HIGH)
- GitHub scheduled-workflow disabling/enabling — https://docs.github.com/actions/managing-workflow-runs/disabling-and-enabling-a-workflow (HIGH)
- GitHub Actions cron unreliability (delays/drops/silent) — community discussion https://github.com/orgs/community/discussions/156282 and https://dev.to/krissv/monitoring-github-actions-scheduled-workflows-a-practical-guide-31h7 (MEDIUM–HIGH)
- 60-day auto-disable + keepalive — https://dev.to/gautamkrishnar/how-to-prevent-github-from-suspending-your-cronjob-based-triggers-knf (MEDIUM)
- Wind direction circular/vector mean — https://www.ncl.ucar.edu/Document/Functions/Contributed/wind_stats.shtml and "Averaging wind speeds and directions" technical note https://www.researchgate.net/publication/262766424 (HIGH)
- Climate homogenization / station relocation discontinuities — https://en.wikipedia.org/wiki/Homogenization_(climate) and WMO guidance https://www.researchgate.net/publication/328752153 (HIGH)
- Precipitation trace / missing-day / mean-vs-total — https://stateclimate.org/pdfs/journal-articles/2013_Adnan_et_al_2013.pdf and Canada climate-indices notes https://climate-scenarios.canada.ca/?page=climate-indices-notes (MEDIUM)
- Candlestick vs box-plot semantics — https://en.wikipedia.org/wiki/Candlestick_chart and https://visionlabs.com/blog/box-water/ (HIGH)
- Leaflet marker clustering / overlap / spiderfy — http://leaflet.github.io/Leaflet.markercluster/ and https://github.com/jawj/OverlappingMarkerSpiderfier-Leaflet (HIGH)
- Iceland station representativeness / elevation bias — https://en.vedur.is/climatology/iceland/climate-report and Westfjords study https://www.mdpi.com/2225-1154/10/11/169 (MEDIUM)

---
*Pitfalls research for: static historical-weather/climatology map site (Betra Veður)*
*Researched: 2026-07-19*
