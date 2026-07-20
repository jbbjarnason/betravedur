---
phase: 5
slug: score-coloring-ranking
audit-date: 2026-07-20
auditor: UI-Review agent (Claude Sonnet 4.6)
baseline: 05-UI-SPEC.md (BuGn ramp reconciliation from 05-02 incorporated)
screenshots: captured via Playwright CLI (preview build) + E2E evidence suite (17/17 green)
---

# Phase 5 — UI Review: Score Coloring & Ranking

**Audited:** 2026-07-20  
**Baseline:** `05-UI-SPEC.md` (spec with BuGn ramp reconciliation applied during 05-02)  
**Screenshots:** E2E evidence screenshots via `score.spec.ts` (17/17 passing) + live CLI preview screenshots at 1440px / 768px / 375px / 400px  
**Dev server:** not pre-running — built `site/` and ran `vite preview` for CLI captures, then ran full E2E suite for data-loaded captures.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | All Icelandic copy verbatim from spec; Icelandic comma format enforced |
| 2. Visuals | 3/4 | Score channels correct; attribution/legend overlap at bottom-left is a real layout defect at certain viewports |
| 3. Color | 4/4 | BuGn ramp colorblind-safe; accent red reserved; color-not-sole-channel via numerals throughout |
| 4. Typography | 4/4 | All Phase 5 elements use only the declared scale (11/13/14px, 400/600 weight) |
| 5. Spacing | 4/4 | Token-only spacing throughout; all Phase 5 elements meet the 44px hit-target exception |
| 6. Experience Design | 3/4 | Strong state coverage; collapse toggle missing explicit focus-visible; score numerals hidden from screen readers at marker level; narrow panel not a polished chip (spec-compliant deferral, but worth noting) |

**Overall: 22/24**

---

## Top 3 Priority Fixes

1. **BLOCKER (Licensing): Attribution text renders inside the legend panel bounding box at 1280px–1440px wide viewports when the explainer is open.** The attribution group is lifted `calc(--bar-height + 4px)` from the bottom, while the legend bottom edge is at `calc(--bar-height + 24px)` — a 20px gap that is insufficient at any viewport where the attribution text wraps. The expanded explainer makes the legend tall enough to reach the attribution band. The semi-transparent legend surface (rgba 0.92) partially obscures the attribution text, which is a licensing issue (CC BY 4.0 / OpenStreetMap must be legible). **Fix:** Add `bottom: calc(var(--bar-height, 100px) + var(--space-md))` (16px) to `.maplibregl-ctrl-bottom-left,.maplibregl-ctrl-bottom-right` instead of `--space-xs` (4px), giving a 16px gap that better clears the legend floor. Or, at a minimum, document that the legend and attribution need coordinated bottom offsets.

2. **WARNING: Collapse toggle button (`.ranked-list__collapse`) has no explicit `focus-visible` rule.** The row buttons and explainer summary both have `outline: 2px solid var(--ink); outline-offset: 2px`. The collapse toggle inherits the browser default focus ring, which varies by browser and OS and does not match the design system. On Chromium the default is a blue outline that contrasts with the ink-on-white panel surface but is not the specified design-system ink ring. **Fix:** Add `.ranked-list__collapse:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }` to score.css (5 lines).

3. **WARNING: Score badge is `aria-hidden="true"` on the pill, and the pill's `aria-label` does not include the score.** The score badge text (`8,6`) is marked aria-hidden, and the pill aria-label reads only `Reykjavík: meðaltal 9 ára`. The spec says "color is never the sole channel" and cites the numeral as the required non-color channel — but screen readers navigating the map overlay cannot read the score because (a) pills have `tabIndex=-1` (out of tab order, Phase 6 will fix) and (b) even if focused, the badge is hidden. The ranked panel IS accessible and does expose scores, so this is partially mitigated. **Fix (Phase 6 seam or now):** Include the score in the pill's aria-label when scored: `${datum.name}: einkunn ${formatScore(datum.score)}, meðaltal ${datum.n} ára`. This is a one-line change in `buildPill` and does not break the badge's `aria-hidden` (the label is on the pill wrapper, not the badge).

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)

**PASS — no deviations found.**

All copywriting contract strings verified present in code:

| Contract String | Location | Verified |
|-----------------|----------|---------|
| `Einkunn` (legend title) | `legend.ts:43` | textContent |
| `verra` / `betra` (endpoints) | `legend.ts:63,65` | textContent |
| `hvernig er einkunnin reiknuð?` (summary) | `legend.ts:76` | textContent |
| Explainer body (`úrkoma 40%, vindur 30% og hiti 30%...`) | `legend.ts:22-24` | EXPLAINER_BODY const, verbatim |
| Explainer missing-rain clause (`Þegar úrkomumæling...`) | `legend.ts:25-28` | EXPLAINER_MISSING_RAIN const, verbatim |
| `Bestu staðir` (panel title + aria-label) | `rankedList.ts:51,76` | COPY.title |
| `án úrkomu` (badge) | `rankedList.ts:52` | COPY.aununrkomu |
| `Engin einkunn` (empty heading) | `rankedList.ts:53` | COPY.emptyHeading |
| Empty body (`Engin veðurstöð...`) | `rankedList.ts:54-56` | COPY.emptyBody, verbatim |
| `Sýna/fela lista` (collapse aria-label) | `rankedList.ts:57` | COPY.collapseLabel |
| `ófullnægjandi gögn` (muted marker) | `markers.ts:144` | reused from Phase 3 |

**Icelandic decimal comma:** `formatScore` at `markers.ts:35` uses `.toFixed(1).replace(".", ",")` — one-decimal Icelandic comma, provably never a `.`-separated value. E2E criterion 14 asserts `/^\d{1,2},\d$/` for every badge and every ranked-row score — 17/17 green.

**Score format rendered in evidence:** `8,6` and `7,8` visible in pill badges and ranked rows — correct.

No English strings detected in Phase 5 files. No generic labels (`Submit`, `OK`, `Cancel`).

---

### Pillar 2: Visuals (3/4)

**MOSTLY PASS with one real layout defect and one cosmetic gap.**

**What works:**

- **Score channels are two-channel everywhere** (color + numeral). On the pill: 5px BuGn left-bar (`border-left: 5px solid var(--pill-score)`) over a `--hairline` box border (the Pitfall 3 floor) PLUS the ink-on-white numeric badge. On ranked rows: the score numeral (13px semibold). Color is never the sole channel.
- **Marker pill anatomy** matches the spec: `[score-badge] [temp-red] [wind-arrow+speed] [precip-drop]`. The badge is prepended (`pill.prepend(badge)`) before the temperature, consistent with the spec's "leading edge, before the temperature" requirement. Confirmed visually: `8,6` chip → `12°` → `breytileg átt 3 m/s` → drop glyph.
- **BuGn ramp is visually monotonic** in the legend gradient and markers: low score (pale blue-white) → high score (vivid dark green). Evidence shows Reykjavík (8,6) has a dark-green left bar and Keflavík (7,8) has a slightly lighter green bar — luminance ordering is perceptible.
- **Legend anatomy** matches the spec diagram: `Einkunn` title → gradient ramp bar (12px, radius 4px, hairline border) → `0 2 4 6 8 10` tick labels → `verra … betra` captions → `<hr>` rule → `<details>` disclosure. Layout matches the ascii art in 05-UI-SPEC §Legend Anatomy.
- **Ranked panel anatomy**: `Bestu staðir` header → collapse chevron button → `<ol>` rows with rank number · name · optional `án úrkomu` badge · right-aligned score. Keflavíkurflugvöllur row correctly shows `án úrkomu` badge before the score.
- **Selected highlight is reciprocal**: a row click fills the row with `--dominant` AND thickens the matching marker's ring with an ink `box-shadow` ring. Evidence screenshot `05-03-selected-highlight.png` confirms both surfaces update simultaneously.
- **Collapse works**: the panel collapses to a slim tab (header only, width: max-content) leaving the central Iceland band visible. Chevron rotates 90° on open.
- **No Z-order violations**: panel + legend both at z-index 10, above markers (z5) and canvas (z0). At desktop they do not overlap each other.

**Finding: BLOCKER (Licensing) — attribution text partially occluded by legend at some viewport+state combinations.**

At the default 1280px desktop viewport with the legend explainer OPEN (as in the 05-02 evidence screenshot), the attribution text renders at the same y-band as the lower portion of the legend surface. The attribution `margin-bottom: calc(var(--bar-height, 100px) + var(--space-xs))` = ~104px gives a very small 4px gap above the control bar. The legend's bottom edge = `calc(var(--bar-height, 100px) + var(--space-lg))` = ~124px — only 20px above the attribution text band. When the attribution text wraps (which it does at widths ≥1024px where compact attribution expands to full text), it can reach into the legend's vertical space. The legend's `rgba(0.92)` background partially obscures the attribution text behind it, degrading legibility of the CC BY 4.0 / OpenStreetMap credit. This is a licensing risk (attribution must be retained and legible per MapLibre's terms).

**At 768px (tablet) and 375–400px (mobile)**: the attribution text is MORE aggressively occluded by the legend (confirmed in live CLI screenshots). At these widths the legend panel and the full attribution text share the same bottom-left corner with less vertical clearance.

**Finding: WARNING — legend ramp low-end tick label "0" alignment is imprecise.**

The `0` tick label under the gradient ramp is rendered by `justify-content: space-between` on a flex row of `[0, 2, 4, 6, 8, 10]`. However the gradient starts at the left edge of the ramp div and the `0` label aligns to the leftmost position. The ramp bar has `border-radius: 4px` which curves the left corner — so the actual color onset is slightly inset from the left edge, but the `0` label sits at the div's left edge. This is a minor cosmetic misalignment (a few pixels at most) rather than a functional defect.

**Finding: WARNING — legend left edge aligns with the pill that's partly behind the legend.**

In the 05-02 evidence screenshot (zoomed into the SW corner of Iceland), the Keflavík pill clips partly behind the legend panel. This is expected behavior for a fixed-position panel over a scrolling map, and is not a defect — the collision system is zoom-adaptive. At the default zoom-6 Iceland framing, no pills are behind the legend.

---

### Pillar 3: Color (4/4)

**PASS.**

**BuGn ramp:**
- 6-stop piecewise-linear RGB lerp in `score-color.ts:17-51` produces the 11 BuGn stops in `tokens.css:42-53`. Verified: at score=5 the lerp produces `#80cdb7` matching `--score-5`. The legend gradient uses all 11 `--score-*` tokens in order.
- Ramp is monotonic in luminance (light → dark as score rises). Colorblind-safe: the blue→teal→green hue axis does not cross the red–green confusion axis. Passes both protan and deutan simulations.
- Low end (score 0: `#edf8fb`) has a Pitfall 3 floor: the `border-left: 5px` sits over the `1px --hairline` box border, so even the palest stop reads as an intentional colored edge. Legend ramp bar has a `1px --hairline` border for the same reason.

**Accent red reserved correctly:**
- `grep -rn "#c0392b\|--accent" site/src/styles/score.css` → no match (verified; the plan's gate ran and passed).
- Temperature numeral stays `color: var(--accent)` via `markers.css`; score badge uses `color: var(--ink)`.
- In evidence: `12°` is red, `8,6` badge is ink-on-white with a green ring — no confusion.

**Color-not-sole-channel:**
- Score: numeral (badge + row value) + monotonic luminance ramp + `betra`/`verra` captions.
- `ófullnægjandi gögn`: text label + muted tone + exclusion from ranked list.
- `án úrkomu`: text badge + omitted precip glyph (Phase 3 convention).
- Selected state: ink ring (not accent, not ramp) + `--dominant` fill.

**60/30/10 distribution (dominant/secondary/accent):** no hardcoded colors in score.css outside of rgba shadow values (`rgba(31,41,51,0.18/0.22)`), which are correct uses of the ink base. All backgrounds use `rgba(255,255,255,0.92)` (secondary). No decorative use of accent red detected.

---

### Pillar 4: Typography (4/4)

**PASS.**

**Phase 5 font sizes used (score.css only):**
| Size | Role | Usage |
|------|------|-------|
| 14px | Section-title / Body / Explainer | Legend title, explainer summary+body, panel title, row name, empty heading |
| 13px | Compact value | Score badge on pill, ranked-row score |
| 11px | Muted small | Tick labels, verra/betra, rank numeral, `án úrkomu` badge, empty body |

All three sizes are within the Phase 3/5 spec scale (11 / 13 / 14 / 20px). The 20px Display role is correctly unused this phase (no new display-tier elements). The pre-existing 18px for `.scrubber__step` in controls.css is a Phase 4 element not introduced in Phase 5 — out of scope.

**Font weights:** 400 (body) and 600 (semibold section titles, score values) — exactly the two specified weights. No other weights introduced.

**Tabular numerals:** `font-variant-numeric: tabular-nums` applied to all numeric contexts:
- Score badge: `score.css:66`
- Tick labels: `score.css:138`
- Rank numerals: `score.css:362`
- Row score: `score.css:398`

**Line heights:** 1.2 (Display, unused), 1.5 (Section-title/Body), 1.15 (Compact value/Muted small) — matches the spec table.

---

### Pillar 5: Spacing (4/4)

**PASS.**

**Token-only spacing throughout score.css and rankedList.ts/legend.ts.** No arbitrary `[Npx]` or `[Nrem]` values detected in any Phase 5 file.

**Token usage audit:**

| Token | Declared Use in Spec | Actual Use |
|-------|---------------------|------------|
| `--space-xs` (4px) | Badge/pill gaps, legend swatch gap, tick gap | `score-badge` padding, ramp→ticks margin, captions margin, row `gap` |
| `--space-sm` (8px) | Row vertical padding, legend row rhythm, explainer gap | `.ranked-list__rowbtn` padding, legend `margin-top` for ramp, row gap |
| `--space-md` (16px) | Legend + panel internal padding | `.score-legend` padding, `.ranked-list__header` and `__rowbtn` padding, panel `left` offset |
| `--space-lg` (24px) | Panel top offset, legend bottom offset | Both `bottom: calc(--bar-height + --space-lg)` and `top: calc(56px + --space-lg)` |

**44px hit targets verified:**
- Legend explainer `<summary>`: `min-height: 44px` at `score.css:170`
- Collapse toggle: `min-width: 44px; min-height: 44px` at `score.css:280-282`
- Row buttons: `min-height: 44px; padding: var(--space-sm) var(--space-md)` at `score.css:329-334`

**Occlusion budget:** Ranked panel is 280px wide, legend is `max-width: 320px; width: max-content` (typically ~230px for the collapsed ramp+ticks). Neither occludes the central Iceland station band at zoom 6 (confirmed in evidence screenshots — Reykjavík, Akureyri, Selfoss all visible with the panel right-docked).

---

### Pillar 6: Experience Design (3/4)

**MOSTLY PASS — strong state coverage; two accessibility gaps degrade the score.**

**State coverage:**

| State | Implemented | Evidence |
|-------|-------------|---------|
| Loading (initial) | Not Phase 5 scope (Phase 7 owns loading chrome) | N/A |
| Scored marker | Full: left-bar + badge + right color channel | Evidence screenshots, criterion 1 green |
| Muted / insufficient | Full: muted pill unchanged from Phase 3, excluded from ranked list | Criterion 8 green |
| `án úrkomu` scored | Full: colored + badged + badged in ranked row | Criterion 9 green |
| Empty state (no scorable stations) | Renders `Engin einkunn` heading + body copy | Criterion 12 green |
| Selected station | Reciprocal: row `--dominant` fill + marker ink ring | Criterion 10 green, evidence `05-03-selected-highlight.png` |
| Collapsed panel | Slim tab header (title + chevron), body hidden | Criterion 13 green |
| Selection change (recompute) | Re-ranks + re-renders with zero network requests | Criteria 2, 7, 11 green |
| Reduced motion | `easeTo` duration = 0, `summary::before` transition: none | score.css:220-224, main.ts subscriber |

**Finding: WARNING — collapse toggle button lacks an explicit `focus-visible` style.**

`.ranked-list__collapse` has no `:focus-visible` rule in score.css. The component will display the browser's default focus ring (typically a blue `outline: auto` in Chromium, a dotted outline in Firefox). This breaks the design system's uniform `2px solid var(--ink), offset 2px` focus convention that every other interactive element in Phase 3-5 follows. It is not a blocker (the button is focusable and shows a visible ring) but is an inconsistency that becomes noticeable during keyboard navigation through the control bar → ranked panel flow.

**Finding: WARNING — score is not accessible to screen readers at the marker level.**

The score badge on the pill has `aria-hidden="true"` (score.css). The pill's `aria-label` reads only `{name}: meðaltal {n} ára` — the score (`8,6`) is not included in the accessible name. Screen readers navigating by tab cannot access scores at the map level: pills have `tabIndex=-1` (Phase 6 activates them), and even if a pill were focused, the badge is hidden.

The ranked panel (`<ol>` of `<button>` rows with visible score text) IS accessible and exposes scores via the DOM's text content — so scores ARE reachable via the ranked list, which is the primary user path. This is a partial mitigation. However the spec's "color is never the sole channel" commitment is technically broken for screen-reader users on map markers specifically.

**Fix:** Change `buildPill` in `markers.ts` to include the score in the aria-label for scored stations:
```
datum.sufficient
  ? datum.score !== null
    ? `${datum.name}: einkunn ${formatScore(datum.score)}, meðaltal ${datum.n} ára`
    : `${datum.name}: meðaltal ${datum.n} ára`
  : `${datum.name}: ófullnægjandi gögn`
```

**Finding: INFO — `aria-current="false"` on non-selected row buttons is non-standard usage.**

`rankedList.ts:158` sets `aria-current="false"` on non-selected row buttons. The ARIA spec allows `aria-current` values of `page`, `step`, `location`, `date`, `time`, `true`, `false`. The value `"false"` is valid (it means "not current") but it is unusual to set it explicitly on every non-selected row; it would be cleaner to remove the attribute entirely on non-selected items (the absence of `aria-current` is the default "not current" state). This is informational — no functional impact.

**Finding: INFO — no `aria-live` announcement on row-click fly-to.**

The spec marks this as "optional (Claude's discretion)". No live region was implemented. Screen-reader users clicking a row will not hear "flying to Reykjavík" or similar. Not required, but worth noting for Phase 7 polish.

**Narrow-screen treatment (assessed, not scored):**

At 600px (Playwright narrow evidence) the panel behaves as specified: collapsible, right-docked, functional. The legend is also functional. This IS the Phase 7 deferral — the spec says "functional toggle only, NOT a draggable bottom sheet". Both panels remain operational via the collapse toggle at this width.

The known concern: at 400px and 375px (live CLI screenshots), the legend and ranked panel both claim significant screen space, and the attribution text interleaves visually with the legend. The right panel at 375px still shows the full "Bestu staðir" header + rows taking ~280px of the 375px width (the `max-width: calc(100vw - 2 * var(--space-md))` = 343px). This leaves only ~95px of visible map on the left side of the screen, which is too little to be useful. This is the Phase 7 scope (mobile bottom-sheet) — acceptable as a functional degrade, but worth calling out.

**Heading hierarchy: INFO — two `<h2>` elements with no `<h1>`.**

The wordmark is a `<span class="wordmark">` (not a heading) in `header.ts:14`. The legend title (`legend.ts:41`) and ranked panel title (`rankedList.ts:82`) are both `<h2>`. There is no `<h1>` in the document. For screen readers this creates a document with two `<h2>` headings and no root heading context. The wordmark could be changed to `<h1>` to establish hierarchy, with the panels at `<h2>`. This is a Phase 3/4 shell issue that Phase 5 inherited; not introduced by Phase 5 alone.

---

## Registry Safety

No component registries used. All UI is hand-authored vanilla TypeScript + CSS + inline SVG (via `createElementNS`). No shadcn, no third-party blocks. Registry audit: not applicable.

---

## Phase 7 vs. Now: Fix Classification

| Finding | Severity | Fix When | Cost |
|---------|----------|----------|------|
| Attribution partially occluded by legend (BLOCKER licensing) | BLOCKER | **Now (pre-ship)** | ~2 lines: increase `--space-xs` → `--space-md` in the `.maplibregl-ctrl-bottom-right,.maplibregl-ctrl-bottom-left` margin-bottom rule |
| Collapse toggle missing focus-visible | WARNING | **Now** (5-line CSS addition) | Trivial |
| Score missing from pill aria-label | WARNING | **Now** (one-line JS change in markers.ts) | Trivial |
| `aria-current="false"` on non-selected rows | INFO | Now or Phase 7 | Trivial |
| `aria-live` on fly-to | INFO | Phase 7 | Small |
| Heading hierarchy (no h1) | INFO | Phase 7 or Phase 6 (shell concern) | Small |
| Narrow-screen map area too small (375px with panel open) | Design debt | **Phase 7 (mobile bottom-sheet)** | Large — this is literally Phase 7's scope |
| Legend chip/toggle collapse at `<640px` (spec-optional) | Design debt | Phase 7 | Medium |

**Cheap-fix-now (pre-ship):** attribution offset (2 lines), collapse toggle focus ring (5 lines), pill aria-label score (1 line). Total ~8 lines of code, no architectural change.

**Genuine Phase 7 scope:** mobile bottom-sheet, narrow chip toggle for legend, live-region fly-to announcement, full loading/empty chrome polish. These were explicitly called out of scope in 05-UI-SPEC.md and should not block Phase 5 sign-off.

---

## Files Audited

**CSS:**
- `site/src/styles/tokens.css` — score ramp tokens, global roles
- `site/src/styles/score.css` — pill scoring, badge, legend, ranked panel
- `site/src/styles/controls.css` — attribution offset, narrow breakpoint, bar-height
- `site/src/styles/markers.css` — base pill, focus ring, muted state

**TypeScript:**
- `site/src/map/markers.ts` — `formatScore`, `buildPill`, `setSelectedStation`, `renderComposite`
- `site/src/map/score-color.ts` — `scoreColor` BuGn lerp
- `site/src/ui/legend.ts` — `buildLegend`, `mountLegend`
- `site/src/ui/rankedList.ts` — `rankStations`, `mountRankedList`, `buildRow`
- `site/src/main.ts` — boot wiring, `stationId` subscriber, `renderForState` hook

**HTML:**
- `site/index.html` — document structure, `<html lang="is">` confirmed

**Evidence / Tests:**
- `site/tests/e2e/score.spec.ts` — 17/17 passing (all 14 acceptance criteria + smoke + evidence)
- `evidence/05-02-colored-markers-legend.png` — explainer-open state
- `evidence/05-03-ranked-list-desktop.png` — default desktop framing
- `evidence/05-03-ranked-list-narrow.png` — 600px narrow
- `evidence/05-03-selected-highlight.png` — reciprocal highlight

**Planning:**
- `05-UI-SPEC.md`, `05-01-SUMMARY.md`, `05-02-SUMMARY.md`, `05-03-SUMMARY.md`, `deferred-items.md`
