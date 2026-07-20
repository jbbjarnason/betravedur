---
phase: 4
slug: selection-instant-recompute
reviewed: 2026-07-20
baseline: 04-UI-SPEC.md
screenshots: captured (preview server at :4173; evidence/ screenshots + 1 fresh desktop capture)
---

# Phase 4 — UI Review

**Audited:** 2026-07-20
**Baseline:** 04-UI-SPEC.md (design contract)
**Screenshots:** captured — evidence/04-02-controls-default.png, evidence/04-02-controls-year-changed.png, evidence/04-03-url-restore.png + fresh desktop capture at 1440×900

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | All Icelandic copy correct and verbatim; one spec drift in date readout dash/spacing |
| 2. Visuals | 3/4 | Bar surface, markers, and controls visually coherent; attribution footer fully occluded by bar |
| 3. Color | 4/4 | Zero accent references in controls.css (grep-confirmed); all roles correctly applied |
| 4. Typography | 3/4 | Phase 3 scale reused correctly; one off-spec size (18px stepper ‹ › glyphs) |
| 5. Spacing | 4/4 | All spacing is token-derived; no arbitrary values; inner max-width cap implemented |
| 6. Experience Design | 3/4 | Instant recompute, 16 E2E tests green, reduced-motion handled; per-marker N not in pill aria-label; attribution licensing overlap unaddressed |

**Overall: 20/24**

---

## Top 3 Priority Fixes

1. **Attribution footer occluded by the control bar** — licensing risk (CC BY 4.0 attribution is a legal requirement for OSM + Veðurstofa data); the MapLibre `.maplibregl-ctrl-bottom-right` group sits at `bottom: 0` inside the map canvas, directly behind the `position: fixed; bottom: 0` control bar. In the live screenshot the full attribution text is hidden under the bar. Fix: add `.maplibregl-ctrl-bottom-right { margin-bottom: <bar-height>px }` (dynamically or via a CSS custom property written by controlBar.ts) or switch to `padding-bottom` on `#map`. This is a one-liner CSS fix — it is NOT Phase 7 scope.

2. **Per-marker N coverage not associated with individual markers** — the spec requires "meðaltal {n} ára as text associated with the marker (inline in the pill ... or via the pill's aria-label / title + the global readout)". The current `aria-label` on each pill is only `datum.name` (e.g. "Reykjavík") — no N value is present. The global readout handles the aggregate but the per-station honesty signal is absent at the individual marker level. Fix: expand `aria-label` to `"${datum.name}: meðaltal ${datum.n} ára"` when `datum.sufficient`, or add a `title` attribute.

3. **Date readout format diverges from spec punctuation** — the spec's Scrubber Anatomy section specifies `20.–26. júlí` (en-dash, no spaces, long month). The implementation renders `16. júl – 29. júl` (spaced en-dash, abbreviated month). Both forms are Icelandic-legible and readable, but the en-dash spacing is the spec's stated format and the long month form is explicitly shown in the spec example. Fix: update `windowLabel()` to use `doyLabel()` (already defined and unit-tested) instead of `doyLabelShort()`, and collapse to `${start}–${end}` (no spaces). Minor visual change only.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

**PASS — all required copy is present and Icelandic:**

- Width buttons: `1 vika / 2 vikur / 3 vikur / 1 mánuður` — exact spec match (`widthButtons.ts:7-10`)
- Year labels: `Frá` / `Til` — exact spec match (`yearRange.ts:47,56`)
- Scrubber a11y label: `"Velja tímabil"` — exact spec match (`scrubber.ts:114`)
- Width group a11y label: `"Lengd tímabils"` — exact spec match (`widthButtons.ts:35`)
- Month tick labels: `jan feb mar apr maí jún júl ágú sep okt nóv des` — exact match, correct Icelandic diacritics including `ágú` (`scrubber.ts:11-24`)
- Coverage readout: `meðaltal N ára` / `meðaltal N–M ára` / `ófullnægjandi gögn` — format correct, rendered via `textContent` not `innerHTML` (`controlBar.ts:33-37`)
- Stepper a11y labels: `"Fyrri dagur"` / `"Næsti dagur"` — appropriate Icelandic, not in spec but an acceptable localized addition (`scrubber.ts:131,139`)
- No generic English labels (`Submit`, `OK`, `Cancel`, `Save`) anywhere in the UI source

**WARNING — date readout format drift:**

- Spec: `20.–26. júlí` (en-dash with no surrounding spaces, long Icelandic month name)
- Implementation: `16. júl – 29. júl` (spaced en-dash, abbreviated month via `doyLabelShort()`)
- Visible in all evidence screenshots. Abbreviated form uses the same 3-letter MONTHS_ABBR as the tick labels below — this creates visual consistency with the ticks, which is a reasonable engineering decision, but it diverges from the spec's stated example format.
- The `doyLabel()` helper that produces the long form (e.g. `"16. júlí"`) is already implemented and unit-tested (`scrubber.ts:45-51`) — it is only used for the narrow-screen stepper text, not for `windowLabel()`.

---

### Pillar 2: Visuals (3/4)

**PASS — bar visual treatment, markers, and layout:**

- Frosted-glass bar surface (`rgba(255,255,255,0.92) + backdrop-filter:blur(8px)`) matches the spec's "header treatment inverted vertically" — verified in all screenshots. The header and bar are visually bookends.
- Control region order (left→right): global N readout · scrubber (grows) · width buttons · Frá/Til — matches spec exactly.
- Width buttons active state: `--dominant` fill + `--ink` text + weight 600 — reads as pressed; "1 vika" highlighted clearly in evidence screenshots and "1 mánuður" in the url-restore screenshot.
- Scrubber thumb: white 16px circle with hairline border and shadow — visible in the url-restore screenshot as a white dot on the track.
- Scrubber window fill: `--ink` span visible in the url-restore screenshot (dark band on the track from the anchor toward day 30).
- Month tick labels (`jan feb … des`) render consistently at the bottom of the scrubber, full 12-month spread visible in all screenshots.
- Map occlusion: Iceland stations are visible above the bar in all screenshots. The bar occupies roughly 95px on the 1440×900 desktop view — within the 96px hard cap.

**BLOCKER — attribution footer fully occluded by control bar:**

- The MapLibre `AttributionControl` is mounted at `"bottom-right"` which MapLibre positions at `position: absolute; bottom: 0; right: 0` inside the `#map` canvas element (z-index 2).
- The `.control-bar` is `position: fixed; bottom: 0; z-index: 10` — it stacks above the map canvas entirely.
- There is no CSS in `tokens.css`, `controls.css`, or `markers.css` that offsets the attribution ctrl group above the control bar.
- The fresh 1440×900 desktop screenshot confirms: the full attribution text runs across the bar's bottom zone, hidden under the frosted surface. In the evidence screenshots (1280×720 Playwright) the attribution text is visible but overlapping with the bar's lower content row (month ticks + year dropdowns).
- The E2E criterion 1 asserts bar height ≤ 135px and bar does not overlap the header — but it does NOT assert that the attribution remains legible beneath the bar.
- **Licensing concern:** OSM, Protomaps, and Veðurstofa CC BY 4.0 attribution must be legible. Occlusion violates the CC BY 4.0 "attribution must be retained" requirement and OSM tile usage policy.

**WARNING — bar height exceeds 72px target (within hard cap):**

- Spec target: 72px. Hard cap: 96px. Actual rendered: approximately 95px (scrubber column: readout 15px + gap 4px + range 44px + gap 4px + ticks 13px = 80px content + 8+8px padding).
- The SUMMARY.md for Plan 02 explicitly acknowledges removing the 96px clip to allow the stacked readout/range/ticks to fit. The E2E asserts ≤ 135px. This is within spec's hard cap but the 72px "target" is not met.
- No user-impact beyond aesthetics; the occlusion budget is satisfied.

---

### Pillar 3: Color (4/4)

**PASS — full compliance with the accent-reserved contract:**

- `grep -c "var(--accent)" site/src/styles/controls.css` = **0** — accent never used in controls.
- Hardcoded color values in `controls.css`: only `rgba(255,255,255,0.92)` (bar surface, which is the spec-defined secondary treatment) and `rgba(31, 41, 51, 0.18)` (thumb shadow, derived from `--ink`'s RGB without introducing a new hue). Both are correct and spec-consistent.
- No hardcoded color literals in any `.ts` UI file.
- `--ink` (#1F2933): scrubber thumb stroke, filled track span, active button text, focus outlines — all correct.
- `--muted-ink` (#5B6670): global N readout, Frá/Til labels, month ticks, inactive button text — all correct.
- `--dominant` (#E8EBED): active button fill (reads as pressed), unfilled track default — correct.
- `--secondary` (#FFFFFF): bar surface base, button default background, thumb fill, select background — correct.
- `--hairline`: track edges, button group border, select border — correct.
- The `--accent` usage in `markers.css:70` is confirmed to be the temperature numeral only (`color: var(--accent)` on `.marker-temp`), which is the spec's exclusive reservation. Controls correctly have no accent.
- Color is not the sole channel: active button = `--dominant` fill + weight 600 + `aria-pressed="true"`; anchor = shaped thumb + text date readout; insufficient = `ófullnægjandi gögn` text.

---

### Pillar 4: Typography (3/4)

**PASS — Phase 3 type scale reused:**

- All control text maps correctly onto the spec's declared roles:
  - 14px / 400 or 600: Frá/Til labels, width button text (400 inactive, 600 active), select text — correct
  - 13px / 600: scrubber date readout — correct
  - 11px / 400: month tick labels, global N readout — correct
- `font-variant-numeric: tabular-nums` applied on readout, ticks, and year selects — correct (`controls.css:49,67,136,223`)
- `font-family: var(--font-stack)` applied on `.control-bar`, width buttons, and selects — correct

**WARNING — 18px stepper button glyph size is off-spec:**

- `.scrubber__step { font-size: 18px }` (`controls.css:154`) — 18px is not in the Phase 3 type scale (20 / 14 / 13 / 11px). The stepper `‹` and `›` characters are rendered at 18px.
- This is a reasonable practical choice (the glyph needs to be large enough to tap on mobile), but it introduces a fifth font size not in the declared scale. The spec defines the 44px hit target requirement but leaves the glyph size unspecified.
- Severity: WARNING (minor; only visible on narrow viewports under 640px; the glyph is decorative-adjacent). Fix: use 14px with `line-height:1` for the glyph text, or declare the 18px as an explicit exception in the next UI-SPEC iteration.

---

### Pillar 5: Spacing (4/4)

**PASS — all spacing is token-derived:**

- `--space-xs` (4px): scrubber column gap, stepper gap — correct per spec
- `--space-sm` (8px): width button separator, year selector gap, bar vertical padding, select padding — correct per spec
- `--space-md` (16px): bar horizontal padding, control row gaps, width button padding — correct per spec
- No arbitrary `[Npx]` values anywhere in `controls.css`
- `max-width: 960px` on `.control-bar__inner` — matches spec's "max content width ~960px" exactly
- Bar inner padding: `var(--space-sm) var(--space-md)` (8px top/bottom, 16px left/right) — within spec
- Control-bar `bottom: 0` (flush) vs spec `--space-lg (24px)` inset: spec explicitly says "flush-bottom is acceptable" so this is not a deviation

**NOTE — `--space-lg` bottom float not implemented:**

- The spec says "may float with a --space-lg (24px) bottom inset ... on desktop". The implementation goes flush-bottom (`bottom: 0`). The spec permits this ("flush-bottom is acceptable if the inset crowds narrow heights"). Not scored against.

---

### Pillar 6: Experience Design (3/4)

**PASS — core interaction quality:**

- Instant recompute (zero network on selection change): E2E-proven by 16 passing Playwright tests; `grep -c "fetch("` in `recompute.ts` = 0.
- 120ms trailing debounce on scrubber input — prevents map thrashing on rapid drag.
- URL state roundtrip: `stateToParams`/`paramsToState` with defensive clamping; back-button reverts via `popstate`.
- `prefers-reduced-motion`: both `markers.css` and `controls.css` have `@media (prefers-reduced-motion: reduce)` blocks disabling all transitions/animations.
- `Frá ≤ Til` guard: correct clamping in both `yearRange.ts` change handlers (`yearRange.ts:76-83`).
- Narrow-screen stepper: `‹ [date] ›` renders at < 640px, drives the same store path; E2E-tested at 500px viewport.
- Focus rings: `2px solid var(--ink), offset 2px` on all interactive controls (`controls.css:87-89,158-161,195-198,226-229`).
- `aria-live="polite"` on the date readout — screen readers hear anchor date as scrubber moves.

**WARNING — per-marker N coverage absent from individual pill markup:**

- Spec (meðaltal N ára section): "the acceptance-critical requirement is that the value is readable per station. Minimum: render meðaltal {n} ára ... via the pill's aria-label / title + the global readout on tight layouts."
- Actual: `pill.setAttribute("aria-label", datum.name)` only (`markers.ts:236`) — station name but no N value. Neither `title` attribute nor inline text carries the individual station's coverage count.
- The global readout covers the aggregate but a screen reader user on an individual marker gets only the station name, with no per-station coverage signal.
- Fix: `pill.setAttribute("aria-label", datum.sufficient ? \`${datum.name}: meðaltal ${datum.n} ára\` : \`${datum.name}: ófullnægjandi gögn\`)`
- This is also a minor visual-information gap for sighted users comparing stations.

**WARNING — readout update uses a fragile 140ms polling timeout:**

- `controlBar.ts:117-119`: the global N readout is updated in a `setTimeout(140ms)` on each store change, polling past the 120ms recompute debounce to read `getLatestData()`. This is a timing assumption — if the recompute takes > 120ms (e.g. on slow hardware with many stations), the readout reads stale data.
- The intent is sound but the mechanism is brittle. A cleaner approach: have `main.ts`'s recompute subscriber explicitly call a `setReadout(data)` callback rather than relying on a timer. Not a user-visible defect in practice on current hardware/station count.

**BLOCKER — attribution licensing compliance (see also Pillar 2):**

- The CC BY 4.0 attribution for Veðurstofa and OSM data is required by the terms of use. The control bar renders at `z-index: 10` over the map canvas. The MapLibre attribution renders at `z-index: 2` inside the map canvas (`position: absolute; bottom: 0`). The result is that the attribution is completely hidden under the control bar in most viewport heights.
- This was flagged in the 04-02-SUMMARY screenshot inspection ("the island ... and all station names is fully visible above the bar") but the attribution overlap was not noted there.
- **Recommendation: fix before next deploy.** This is a 2-line CSS fix, NOT Phase 7 scope.

---

## Attribution Overlap Fix Recommendation

**Fix immediately. This is not Phase 7 scope.**

Phase 7 is chartered for "mobile bottom-sheet polish, full loading/empty states." The attribution occlusion is a licensing-compliance defect with a known 2-line CSS fix, not a design question.

**Recommended fix (controls.css):**

```css
/* Lift the MapLibre attribution above the control bar so CC BY 4.0 / OSM / Protomaps
 * credit remains legible. The control-bar height varies with content (~88–96px on desktop,
 * potentially ~120px on narrow two-row layout). Use a CSS custom property so the bar
 * can self-report its height and controls.css consumes it, OR use a safe static value. */

/* Option A — static safe value (simplest, acceptable until Phase 7 dynamic polish): */
.maplibregl-ctrl-bottom-right,
.maplibregl-ctrl-bottom-left {
  margin-bottom: 100px; /* above the ~88–96px desktop bar */
}

/* Option B — use the bar's actual bounding rect written as a custom property.
 * controlBar.ts can write: document.documentElement.style.setProperty('--bar-height', h+'px')
 * after mount and on resize, then: margin-bottom: var(--bar-height, 100px); */
```

The compact-mode attribution (`compact: true` in `init.ts:47`) collapses to a small `ℹ` icon which expands on click — even the collapsed state currently sits behind the bar. Either way, the icon itself needs to be visible.

**Timing:** include in the next commit alongside or before Phase 5 work. It does not touch any Phase 5 seams and takes < 5 minutes to implement and verify.

---

## Registry Safety

Registry audit: not applicable — no shadcn (`components.json` absent). All controls are hand-authored vanilla TS + CSS over native `<input type="range">`, `<button>`, `<select>`. No third-party registries.

---

## Files Audited

| File | Role |
|------|------|
| `site/src/styles/controls.css` | Primary control styling — all pillars |
| `site/src/styles/tokens.css` | Phase 3 token definitions |
| `site/src/styles/markers.css` | Accent usage verification |
| `site/src/ui/scrubber.ts` | Scrubber anatomy, date helpers, MONTHS_ABBR |
| `site/src/ui/widthButtons.ts` | Segmented buttons, aria-pressed |
| `site/src/ui/yearRange.ts` | Frá/Til selects, Frá≤Til guard |
| `site/src/ui/controlBar.ts` | Bar mount, region order, N readout, store wiring |
| `site/src/ui/attribution.ts` | Attribution HTML composition |
| `site/src/map/init.ts` | AttributionControl placement (bottom-right) |
| `site/src/map/markers.ts` | Pill aria-label, per-marker N surfacing |
| `site/tests/e2e/selection.spec.ts` | E2E coverage review |
| `.planning/phases/04-selection-instant-recompute/evidence/04-02-controls-default.png` | Visual baseline (1280×720) |
| `.planning/phases/04-selection-instant-recompute/evidence/04-02-controls-year-changed.png` | Year-change recompute evidence |
| `.planning/phases/04-selection-instant-recompute/evidence/04-03-url-restore.png` | URL restore evidence |
| `.planning/ui-reviews/04-20260720-103937/desktop-loaded.png` | Fresh 1440×900 desktop capture |
