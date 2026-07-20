---
phase: 6
slug: station-chart-panel
audited: 2026-07-20
auditor: ui-review (claude-sonnet-4-6)
baseline: 06-UI-SPEC.md (approved contract)
screenshots: code-only + existing evidence (5 PNGs in evidence/)
---

# Phase 6 — UI Review: Station Chart Panel

**Audited:** 2026-07-20
**Baseline:** 06-UI-SPEC.md
**Screenshots:** Existing evidence (06-02-panel-open.png, 06-02-panel-nodata.png, 06-02-closed-ranked-restored.png, 06-03-panel-charts.png, 06-03-full-with-charts.png). Fresh Playwright captures were attempted against the live preview (port 4173) but the PMTiles basemap does not load in headless Playwright, making the URL-param `?st=` panel hydration non-functional without map markers to click. Evidence screenshots remain the primary visual record.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | All exact Icelandic strings match spec; precip reading key shown on no-gauge station describes absent bars |
| 2. Visuals | 2/4 | Boxplot opacity=0.85 (spec: 0.28–0.35) makes boxes near-opaque; median line is not visually distinct inside the fill |
| 3. Color | 4/4 | All three chart tones correct, no --accent or --score-* leakage into charts, panel surface consistent with Phase 3/4/5 |
| 4. Typography | 4/4 | All roles match spec verbatim (14px/600 titles, 14px/400 body, 13px/600 compact-value, 11px/400 axis ticks), tabular-nums on daylight |
| 5. Spacing | 4/4 | All spacing uses token references from Phase 3/4/5 scale; no arbitrary values; chart-to-chart gaps, reading-key margins, and panel padding all spec-correct |
| 6. Experience Design | 3/4 | Loading/empty/no-data/escape/focus/a11y all solid; no aria-live polite announcement on panel open (spec said "acceptable"); precip reading key logically inconsistent on no-gauge state |

**Overall: 20/24**

---

## Top 3 Priority Fixes

1. **Boxplot box fill opacity 0.85 (spec: 0.28–0.35)** — The median line — the primary "typical day" read — is invisible inside the near-opaque box. This defeats the statistical distribution encoding the reading key describes and makes the chart look like financial OHLC bars with no distinguishable median. Fix: in `chartPanel.ts` line 337, change `itemStyle: { color: spec.tone, borderColor: spec.tone, opacity: 0.85 }` to `itemStyle: { color: withAlpha(spec.tone, 0.30), borderColor: spec.tone, opacity: 1 }` where `withAlpha` converts the hex tone to `rgba(r,g,b,0.30)`. The `borderColor` (whiskers + box border + median line) stays at full opacity while the box fill drops to ~30%.

2. **Precip reading key shown unconditionally, even on no-gauge stations** — On an án-úrkomu station, the Úrkoma figure shows `engin úrkomumæling á þessari stöð` in the slot, but the mandatory reading key directly below it reads "Súlurnar sýna dæmigerða úrkomu hvers dags yfir árin; eyða þýðir að úrkoma var ekki mæld..." — text that describes bars and gaps that are not rendered. A user reading this reads a description of a chart that does not exist. Fix: in `buildFigure`, accept an optional `readingKey` and suppress it (or substitute a short `engin úrkomugler` explanatory line) when `precipSlot.kind === "nodata"` and the message is the no-gauge string. One conditional in `stationPanel.ts` around line 455–462.

3. **Attribution legibility when panel is open (licensing)** — The MapLibre expanded attribution control at the bottom-right renders at z-index 2 behind the station panel (z-index 10). The panel's `rgba(255,255,255,0.92)` glass surface paints over the right portion of the attribution block (approximately the rightmost 340px of the text, which includes partial lines of the CC BY 4.0 / OpenStreetMap / Protomaps / Veðurstofa Íslands credit). The text is partially readable through the 8% transparent glass but contrast is significantly degraded. **Cheap fix (now):** when the panel is open, push the `maplibregl-ctrl-bottom-right` container leftward by the panel width: add a `.panel-open .maplibregl-ctrl-bottom-right { margin-right: 344px }` rule in `controls.css` and toggle a `.panel-open` class on `document.body` in `mountStationPanel` alongside `rankedList.setYielded`. **Phase 7 scope:** the bottom-sheet promotion eliminates the right-panel overlap entirely on mobile; this fix is the cheap desktop-now solution.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

**What passes:**
- All Icelandic strings match the spec's Copywriting Contract verbatim. Checked against `stationPanel.ts` COPY object (lines 43–63): temp reading key `"Kassinn sýnir hitann sem 8 af hverjum 10 dögum lentu í..."`, wind reading key, precip reading key, no-data messages, whole-station empty heading/body, loading affordance `"hleð riti…"`, close label `"Loka"`, daylight label `"Dagsbirta"`, daylight unit `"klst."` — all exact.
- Comma decimal format correctly enforced via `formatIce` (`.toFixed(1).replace('.', ',')`) — confirmed in evidence: `18,8 klst.` (06-02-panel-nodata.png).
- Icelandic month abbreviations in chart axis labels correctly defined: jan/feb/mar/apr/maí/jún/júl/ágú/sep/okt/nóv/des (chartPanel.ts lines 68–81).
- No generic English strings anywhere in the panel path.

**Findings:**
- WARNING — `stationPanel.ts` line 458 always passes `COPY.readingKeys.precip` ("Súlurnar sýna dæmigerða úrkomu hvers dags yfir árin; eyða þýðir að úrkoma var ekki mæld, ekki að það hafi verið þurrt.") to `buildFigure` regardless of whether the `precipSlot` is a chart or the no-gauge/no-data message. For an án-úrkomu station, the user sees a no-gauge message AND a reading key that talks about "súlurnar" (bars) and "eyða" (gaps) — chart elements that are absent. This is a content logic error, not a missing string. Severity: WARNING (content is confusing but does not break a task; the no-gauge message above it is clear).

**Score rationale:** One real content logic defect (reading key describes absent elements) drops the score from 4 to 3.

---

### Pillar 2: Visuals (2/4)

**What passes:**
- Panel structure exactly matches the spec wireframe: station name header (14px/600 ink) + close button (44px hit target, top-right), three titled chart figures (Hiti → Vindur → Úrkoma) stacked in a scrollable body, daylight readout at bottom. Confirmed visually in evidence.
- Map remains visible to the left in all evidence screenshots. Panel width (340px) stays within occlusion budget; Reykjavík and west-Iceland station band visible to the left in `06-03-full-with-charts.png`.
- Ranked list ("Bestu staðir") hides while panel is open and restores on close (confirmed in `06-02-closed-ranked-restored.png`).
- Reading keys are legible real DOM text (not canvas-baked) — confirmed readable in all evidence screenshots.
- Close × glyph visible in panel header; glass surface treatment consistent with Phase 3/4/5 header/legend/ranked panel.
- No-data state ("Engin gögn" + daylight) renders correctly for a data-empty station (06-02-panel-nodata.png).

**Findings:**
- BLOCKER — `chartPanel.ts` line 337: `itemStyle: { color: spec.tone, borderColor: spec.tone, opacity: 0.85 }`. The ECharts `opacity` property applies to the whole boxplot element, not just the box fill. At 0.85 opacity the boxes are near-opaque; the spec requires box fill at `~0.28–0.35 alpha` so the median line (the "typical day" read — the most important statistical element per FEATURES.md) stands out against the fill. In `06-03-panel-charts.png`, the terracotta temperature boxes appear as solid rectangles; the median line is not distinguishable inside the fill. This degrades the statistical honesty of the encoding — the reading key says "línan í miðjunni" (the median line) is the "dæmigerður dagur", but that line is invisible. Fix: use `color: 'rgba(178,106,61,0.30)'` for `--chart-temp` and `'rgba(61,110,140,0.30)'` for `--chart-wind` in `itemStyle.color` (alpha on fill only), with `borderColor` at full hex, `opacity: 1`.
- WARNING — Close glyph is 16×16 px (SVG `viewBox="0 0 16 16" width="16" height="16"` at stationPanel.ts lines 127–129). Spec says 24×24 glyph inside a ≥44px hit target. Hit target IS correct (44×44 per CSS) but the glyph is two-thirds the specified size. At 16px the × is small but visible; not a critical failure but a spec deviation. Fix: change `width="24" height="24"` in `buildCloseGlyph`.
- WARNING — Attribution legibility when panel open: the MapLibre expanded credit (bottom-right, z-index 2) renders partially behind the station panel (z-index 10, right: 0, width: 340px). In `06-03-full-with-charts.png`, attribution text lines including "CC BY 4.0" and "Veðurstofa Íslands" wrap into the panel's horizontal extent and are shown through the glass surface at reduced contrast. The `max-width: 60vw` fix in `controls.css` constrains wrapping but does not prevent the rightmost attribution lines from falling behind the panel. Phase 7 vs now assessment below.
- MINOR — At a typical 900px-tall desktop viewport, the panel body height is approximately 696px. Three chart figures (each ~250px: title + 150px canvas + ~63px reading key + spacing) total ~750px → precip chart and daylight readout are below the first-screen fold and require scrolling. No scroll affordance (scrollbar is hidden by default on macOS until interaction). This is structurally correct per spec (scrollable body) but the user may not discover the daylight readout. Phase 7 scope: consider a subtle scroll-shadow or "↓" hint.

**Score rationale:** The box fill opacity deviation is a functional visual defect — it defeats the median-line encoding the spec specifically calls out as the primary read. Score 2 rather than 1 because the rest of the panel structure is well-executed.

---

### Pillar 3: Color (4/4)

**What passes:**
- `--chart-temp: #b26a3d` (muted warm terracotta) matches spec exactly (tokens.css line 63).
- `--chart-wind: #3d6e8c` (cool steel blue) matches spec exactly (tokens.css line 64).
- `--chart-precip: #4a5a6a` (desaturated slate) matches spec exactly (tokens.css line 65).
- Neither `--accent` (`#C0392B`) nor any `--score-*` value appears anywhere in `panel.css`, `stationPanel.ts`, or `chartPanel.ts`. Grep-confirmed zero matches.
- Chart tones are resolved from CSS custom properties at runtime (`resolveToken`), passed as hex to ECharts options — the lazy chunk never touches `--accent` or `--score-*` names (criterion 11 satisfied at the architectural level).
- Panel surface `rgba(255,255,255,0.92)` + `backdrop-filter: blur(8px)` + `1px --hairline` border exactly matches the Phase 3/4/5 header/legend/ranked-panel treatment (criterion: "the panel reads as the same design language").
- Three tones are visually distinct from each other and from the BuGn score ramp: warm terracotta / cool steel / neutral slate — confirmed in evidence.
- Colorblind safety: each series has a titled figure (`Hiti`/`Vindur`/`Úrkoma`) + axis unit + reading key, so series identity is never carried by hue alone.

**Findings:** None. Score is not penalized for the box fill opacity issue (Pillar 2 defect) since the tones themselves are correct — only the opacity application is wrong.

---

### Pillar 4: Typography (4/4)

**What passes:**
- Section-title role (14px/600/1.5): station name (`station-panel__title`), chart figure titles (`station-panel__figure-title`) — both match spec exactly (panel.css lines 55–66, 113–120).
- Body/Label role (14px/400/1.5): reading key (`station-panel__reading-key`), daylight label (`station-panel__daylight-label`) — both correct (panel.css lines 152–158, 193–199).
- Compact-value role (13px/600/1.15): daylight value (`station-panel__daylight-value`) — correct with `font-variant-numeric: tabular-nums` and `font-feature-settings: "tnum"` (panel.css lines 200–209).
- Muted small role (11px/400): `station-panel__nodata` and `station-panel__empty-body` — 11px/400 correct. ECharts axis tick labels set to `fontSize: 11` via `tickTextStyle` in `chartPanel.ts` lines 178–180.
- All chart text uses `fontFamily: var(--font-stack)` resolved at runtime (`resolveFontFamily()`) — chart type matches the app's type system, not ECharts defaults.
- Only Regular 400 and Semibold 600 weights used throughout, matching the spec's "Weights Regular 400 + Semibold 600 only" constraint.
- No new font sizes introduced beyond the established Phase 3 set (20/14/13/11).

**Findings:**
- MINOR — ECharts axis tick labels use `fontSize: 11` in the JavaScript option, which is correct but does not apply `font-variant-numeric: tabular-nums` (that CSS property does not translate to ECharts' text rendering). For axis tick numbers like temperature values and date labels, tabular-nums matters for alignment. However, since dates (`"20. júl"`) and temperature/wind numbers are typically rendered at consistent widths by the system font's default numerals, this is a marginal visual concern. Not a spec deviation in letter (the spec says "tabular" in the context of CSS properties — ECharts renders into canvas and doesn't support CSS font features). No score penalty.

---

### Pillar 5: Spacing (4/4)

**What passes:**
- Panel top: `calc(56px + var(--space-lg))` = `calc(56px + 24px)` — matches spec exactly.
- Panel bottom: `calc(var(--bar-height, 100px) + var(--space-lg))` — matches spec exactly, reusing the `--bar-height` var the control bar writes.
- Panel width: 340px — within the spec's 320–360px band.
- Internal padding: `var(--space-md)` (16px) — matches spec ("Panel internal padding (matches header/control-bar/legend padding)").
- Chart title → chart slot gap: `margin-top: var(--space-xs)` (4px) on `.station-panel__chart-slot` — matches spec ("Gap between a chart title and its reading-key line; axis-label inset = --space-xs").
- Figure bottom: `margin: 0 0 var(--space-md); padding-bottom: var(--space-md)` — matches spec ("gap between stacked chart figures = --space-md").
- Reading key: `margin: var(--space-sm) 0 0` — matches spec ("Vertical rhythm between a chart figure and its reading key = --space-sm").
- Daylight top: `margin-top: var(--space-lg)` — matches spec ("gap before the reading-key/daylight block = --space-lg").
- No arbitrary spacing values found anywhere. Zero matches for `[...px]` or `[...rem]` patterns in panel.css.
- Close button: `min-width: 44px; min-height: 44px` — meets spec's ≥44px hit-target exception.

**Findings:** None.

---

### Pillar 6: Experience Design (3/4)

**What passes:**
- **Loading state:** `"hleð riti…"` shown immediately in each chart slot while the ECharts chunk loads via `import('./chartPanel.js')`. Loading line is real DOM text (not an animation), satisfying the reduced-motion rule (panel.css `prefers-reduced-motion` rule confirmed).
- **Per-chart empty state:** `"engin gögn fyrir þetta tímabil"` rendered as text in the chart slot (never a blank canvas). Confirmed in E2E criteria 5 per SUMMARY.
- **No-gauge state:** `"engin úrkomumæling á þessari stöð"` shown for án-úrkomu stations. Confirmed in criterion 6 and evidence.
- **Whole-station empty state:** `"Engin gögn"` + explanatory body text replaces all three figures, with daylight still rendering (data-independent). Confirmed in `06-02-panel-nodata.png`.
- **Chunk-load failure:** catches `import()` rejection and falls back to the per-chart no-data text — never hangs or throws (T-06-08).
- **Escape key:** `keydown` on the panel container checks `ev.key === "Escape"` → `store.set({ stationId: null })` (stationPanel.ts lines 483–488). Criterion 9 confirmed green.
- **Focus on open:** focus moves to the close button (`closeBtn.focus()` at stationPanel.ts line 497) — keyboard/SR users land directly on the close affordance.
- **Focus on close:** `returnFocusTo` records the launching element and restores it on teardown (stationPanel.ts lines 306–309). Correct per Phase 5 focus intent.
- **No focus trap:** panel is a non-modal side panel; map, header, and controls remain reachable (correct per spec).
- **Accessible canvas fallback:** `role="img"` + `aria-label` (distribution summary in Icelandic, comma-decimal) + visually-hidden per-day table appended to each chart host. ECharts `aria: { enabled: true }` also set. Criterion 14 confirmed green.
- **Reduced-motion:** `animation: !prefersReducedMotion()` — chart options are built with `animation: false` when the media query matches. Confirmed by E2E criterion 12.
- **Zero data fetch on open:** reading from the boot `StationCache` only — criterion 10 confirmed green.
- **Ranked list yield:** `setYielded(true)` hides the list on open, `setYielded(false)` restores on close. Confirmed in evidence (`06-02-closed-ranked-restored.png`).

**Findings:**
- WARNING — No `aria-live="polite"` announcement on panel open. The spec says "announce the opened station via `aria-live="polite"` is acceptable" — this is optional per spec wording. However, the panel does NOT have `aria-live` set anywhere, and screen-reader users may not realize a new panel has appeared without focus being announced by the close button's focus event. The close button receives focus on open, so VoiceOver/NVDA would typically announce "Loka, knapp" on the close button's label. The station name is the panel's `aria-label` but it's on the `section` container (not the focus target). A user would hear "Loka" without hearing the station name on first focus. Marginal: spec permits this; focus on close button is the primary SR signal. Severity: MINOR, recommended for Phase 7.
- WARNING — Precip reading key semantic mismatch on no-gauge stations (shared with Pillar 1). From an experience design perspective, a screen-reader user navigating the Úrkoma figure of an án-úrkomu station hears: (1) figcaption "Úrkoma", (2) no-gauge message "engin úrkomumæling á þessari stöð", (3) reading key "Súlurnar sýna dæmigerða úrkomu..." — the reading key contradicts what was just announced. Severity: WARNING, inexpensive fix (see Priority Fix #2).
- MINOR — No visible scroll indicator in the panel body. At typical 900px viewport, the precip chart and daylight readout are below the fold. macOS hides the scrollbar by default. A first-time user may not know to scroll. A subtle `padding-bottom` or a CSS scroll-shadow is a simple Phase 7 improvement.

**Score rationale:** All critical experience paths work correctly. Two WARNING findings (aria-live missing, reading-key semantic mismatch) drop the score from 4 to 3.

---

## Known Item Assessment: Attribution Occlusion

**Severity:** WARNING (not BLOCKER)
**Observed:** In `06-03-full-with-charts.png`, the MapLibre attribution block (OpenStreetMap / Protomaps / Veðurstofa Íslands / CC BY 4.0) wraps into the horizontal zone occupied by the right-docked station panel. The panel's `rgba(255,255,255,0.92)` + `backdrop-filter: blur(8px)` surface renders over the attribution text, reducing its contrast. The `max-width: 60vw; margin-left: auto; text-align: right` fix in `controls.css` (already applied in Phase 5/6) prevents the attribution from wrapping into the bottom-left legend zone, but the RIGHTMOST portion of attribution text (appearing within the panel's 340px right region) is shown through glass, not at full legibility.

**Technical cause:** The MapLibre attribution control renders at z-index 2 inside the map canvas. The station panel renders at z-index 10 with a fixed right-side position. No CSS or JavaScript repositions the attribution to clear the panel's horizontal extent when the panel is open.

**Phase 7 vs now:**
- **Now (cheap fix):** Toggle a `.panel-open` class on `document.body` from `mountStationPanel` on open/close. Add to `controls.css`: `.panel-open .maplibregl-ctrl-bottom-right { margin-right: 344px }`. This pushes the entire bottom-right attribution container leftward when the panel is open, preventing the attribution text from entering the panel zone. Estimated effort: ~20 lines of code across 2 files (stationPanel.ts + controls.css). Does not require touching MapLibre internals.
- **Phase 7 scope:** The bottom-sheet promotion on mobile eliminates the right-panel overlap on narrow screens. The desktop layout may also be revisited as part of Phase 7's full UI polish pass.

**Recommendation:** Apply the cheap fix now (pre-Phase 7). Attribution legibility is a licensing requirement, not a cosmetic concern.

---

## Registry Safety

Registry audit: not applicable — no shadcn initialized (`components.json` absent). No third-party component registries used. ECharts 6.1.0 is a mainstream, independently-audited npm dependency added deliberately (the project's first runtime dep). No registry vetting applies.

---

## Files Audited

- `.planning/phases/06-station-chart-panel/06-UI-SPEC.md` (design contract)
- `.planning/phases/06-station-chart-panel/06-01-SUMMARY.md`
- `.planning/phases/06-station-chart-panel/06-02-SUMMARY.md`
- `.planning/phases/06-station-chart-panel/06-03-SUMMARY.md`
- `.planning/phases/06-station-chart-panel/evidence/06-02-panel-open.png`
- `.planning/phases/06-station-chart-panel/evidence/06-02-panel-nodata.png`
- `.planning/phases/06-station-chart-panel/evidence/06-02-closed-ranked-restored.png`
- `.planning/phases/06-station-chart-panel/evidence/06-03-panel-charts.png`
- `.planning/phases/06-station-chart-panel/evidence/06-03-full-with-charts.png`
- `site/src/ui/stationPanel.ts`
- `site/src/ui/chartPanel.ts`
- `site/src/styles/panel.css`
- `site/src/styles/tokens.css`
- `site/src/styles/controls.css` (attribution section)
- `site/src/styles/score.css` (ranked-list yield rules)
- `site/src/ui/rankedList.ts` (setYielded implementation)

---

## Phase-7-vs-Now Recommendation Summary

| Finding | Severity | Fix now? | Phase 7? |
|---------|----------|----------|----------|
| Boxplot box fill opacity 0.85 (spec: 0.28–0.35) | WARNING | YES — 3 lines in chartPanel.ts | No — purely aesthetic, no architectural change needed |
| Precip reading key shown on no-gauge station | WARNING | YES — 1 conditional in stationPanel.ts | No |
| Attribution behind glass panel (licensing) | WARNING | YES — body class toggle + 1 CSS rule | Eliminated by bottom-sheet |
| Close glyph 16px (spec: 24px) | MINOR | YES — 2 attr changes in buildCloseGlyph | No |
| No aria-live announcement on panel open | MINOR | Optional | Recommend Phase 7 |
| Scroll affordance for below-fold content | MINOR | Optional | Phase 7 polish |
| Narrow-screen bottom-sheet chrome | Out of scope | No | Phase 7 core |
