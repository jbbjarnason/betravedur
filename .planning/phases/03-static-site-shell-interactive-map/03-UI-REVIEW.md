---
phase: 3
slug: static-site-shell-interactive-map
audited: 2026-07-20
baseline: 03-UI-SPEC.md
screenshots: 3 committed evidence screenshots (no live server at audit time)
---

# Phase 3 — UI Review

**Audited:** 2026-07-20
**Baseline:** 03-UI-SPEC.md (design contract)
**Screenshots:** Evidence screenshots from the committed production-preview build (`evidence/03-01-map-shell.png`, `evidence/03-03-markers-zoom6.png`, `evidence/03-03-markers-zoomed.png`). No live dev server was running at audit time; all 12/12 E2E criteria passed on the preview build per the SUMMARY records.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Map-load and empty-state error copy from the UI-SPEC Copywriting Contract is absent from the codebase |
| 2. Visuals | 3/4 | Bilingual "ICELAND" + "Ísland" on basemap; pill proximity at zoom 6; header baseline alignment clips slogan |
| 3. Color | 4/4 | Accent strictly one selector (.marker-temp); all tokens declared; 60/30/10 distribution correct |
| 4. Typography | 4/4 | Exactly the four spec roles; two weights (400/600); tabular-nums; all values match the contract |
| 5. Spacing | 3/4 | Two raw pixel values bypass the token system (4px 8px pill padding; 2px wind-group inner gap) |
| 6. Experience Design | 2/4 | Catastrophic-load error path (map fails) and "Engar veðurstöðvar" empty state silently drop to console.error, leaving users with a blank map and no explanation |

**Overall: 19/24**

---

## Top 3 Priority Fixes

1. **No visible map-load error UI** — if PMTiles or the MapLibre style fails to load the user sees the muted `#E8EBED` background with no feedback. The UI-SPEC mandates `Ekki tókst að hlaða kortið` + `Reyndu að hlaða síðunni aftur.` over the dominant background. Currently `main.ts` only `console.error`s. Add an error overlay in `wireMarkers`'s outer catch and in the map's `error` event handler. Severity: **BLOCKER** for users on flaky connections.

2. **"Engar veðurstöðvar" empty state never renders** — if all stations fail to load (e.g. `stations.json` 404) the data flow returns an empty array and `installMarkerLayer` installs a source with zero features. The overlay is blank. The UI-SPEC requires heading `Engar veðurstöðvar` + body `Engin gögn til að birta á kortinu. Reyndu að hlaða síðunni aftur.`. Add a post-install check in `wireMarkers` and render a centred overlay card when `data.length === 0`. Severity: **WARNING** (the committed sample never triggers it, but the full national dataset deployment can).

3. **Marker pill callout padding uses raw `4px 8px` literals instead of tokens** — `markers.css` line 37 specifies `padding: 4px 8px` inline rather than `var(--space-xs) var(--space-sm)`. These happen to equal the token values, so there is no visual defect today, but the values are duplicated outside the token system. If the spacing scale changes in Phase 5/7, this pill dimension will drift silently. Fix: `padding: var(--space-xs) var(--space-sm)`. Severity: **WARNING**.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

**What passes:** All primary Icelandic copy is verbatim from the contract. The wordmark `Betra Veður`, slogan `Leitin að betra veðri`, `breytileg átt`, `ófullnægjandi gögn`, and the precip-absent omission pattern are all correct. Attribution text sourced from `ATTRIBUTION.text_is` and `ATTRIBUTION.modifiedNotice_is` — never hardcoded — meeting the CC BY 4.0 naming requirement. The `án úrkomu` hover label seam is deferred to Phase 6 as specified.

**What fails:**

- WARNING — `markers.css:121` and `main.ts` implement `ófullnægjandi gögn` correctly, but the two UI-SPEC defensive copy strings are absent from the entire `site/src/` tree:
  - **Map load error:** `Ekki tókst að hlaða kortið` + `Reyndu að hlaða síðunni aftur.` — not present in any `.ts` or `.html` file.
  - **All-stations-empty state:** `Engar veðurstöðvar` heading + `Engin gögn til að birta á kortinu. Reyndu að hlaða síðunni aftur.` — not present in any `.ts` or `.html` file.
  
  These are both in the Copywriting Contract as required strings. Their absence is entangled with the Experience Design failure (Pillar 6), but the copy itself is missing.

Score rationale: primary happy-path copy is fully compliant and verbatim; two defensive copy entries from the contract are missing.

---

### Pillar 2: Visuals (3/4)

**What passes:** The muted `#E8EBED` basemap reads unmistakably as ground, with white pill callouts as the clear figure (confirmed in all three screenshots). Wordmark is semibold and visually dominant over the muted slogan. The two committed-sample pills are readable at both zoom levels — temperature red pops as the primary signal. The precip drop glyph is present for Reykjavík and correctly absent for Keflavík (no overlap with the wind data). Wind arrow at Keflavík correctly rotates (left-pointing arrow visible in the zoomed screenshot, consistent with a WNW mean direction). The `#marker-overlay` is positioned above the canvas (`z-index: 5`) and below the header (`z-index: 10`), giving correct layering.

**What needs attention:**

- WARNING — **Bilingual country label:** the zoom-6 screenshot shows "ICELAND" (uppercase, large) centered on the island, with the italic "Ísland" appearing just below it at a smaller weight. The `lang: "is"` option is passed to `namedFlavor`, but Protomaps's grayscale flavor at maxzoom 9 renders both the English and Icelandic country name labels simultaneously from the vector tile data. This is a Protomaps-flavor limitation — the vector tiles carry `name` (English) and `name:is` (Icelandic) separately, and the flavor may render both at the country level. As noted in the audit request, this is likely a basemap constraint to defer rather than a fix in this phase, but it should be tracked. Cosmetically it is distracting.

- WARNING — **Pill proximity at zoom 6:** at zoom 6 (whole-island view with only two SW-corner stations in the sample), the two pills visually overlap partially — the Reykjavík pill overlaps the Keflavík pill in the vertical direction (screenshot `03-03-markers-zoom6.png`). The collision layer (`text-allow-overlap: false`) prevents the symbol anchors from fully overlapping, but the rendered DOM pill is wider than the collision proxy label, so visual edges can still touch at tight zoom. With the full national dataset this will be more pronounced. Criterion 10 passes for ≤25 pills and no full containment, but partial edge overlap is still a readability issue.

- WARNING (minor) — **Header baseline alignment:** `align-items: baseline` in the flexbox header means the slogan text sits on the typographic baseline of the wordmark rather than vertically centred with it. In the screenshots the slogan appears slightly lower than the visual midpoint of the header, creating an asymmetric top/bottom margin. Changing to `align-items: center` would centre both items within the 56px bar more cleanly — though the current approach is a reasonable and readable choice, it deviates from conventional header centering.

---

### Pillar 3: Color (4/4)

**What passes:** The token set in `tokens.css` declares all seven colour roles from the UI-SPEC: `--dominant #e8ebed`, `--secondary #ffffff`, `--accent #c0392b`, `--ink #1f2933`, `--muted-ink #5b6670`, `--marker-empty-fg #9aa5ae`, `--marker-empty-bg #f4f6f7`, `--hairline rgba(31,41,51,0.10)`. Values match the spec exactly.

`var(--accent)` appears at exactly one CSS selector: `.marker-pill .marker-temp` (`markers.css:67`). It does not appear on links, the header, the wind arrow, the focus ring, or any other element. The 60/30/10 split is correctly implemented: `--dominant` covers the basemap (the visual majority), `--secondary` covers the header and pill surfaces, and `--accent` is restricted to temperature numerals only.

All hardcoded hex values in the codebase are token declarations (in `tokens.css`) or the basemap muting constant `DOMINANT` in `style.ts` — which matches `--dominant` exactly and is used only as a paint override, not in any user-facing CSS selector. No extraneous hardcoded colors.

The muted `--dominant` basemap creates the intended visual contrast so white callouts read as the figure. Confirmed in screenshots.

No findings. Score: 4/4.

---

### Pillar 4: Typography (4/4)

**What passes:** Exactly four type roles are implemented, matching the spec:

| Role | Spec size | Spec weight | Implemented | Where |
|------|-----------|-------------|-------------|-------|
| Display (wordmark) | 20px / 600 | 600 / 1.2 | `var(--display-size)` / `var(--display-weight)` / `line-height: 1.2` | `tokens.css:78-80` |
| Body/Slogan | 14px / 400 | 400 / 1.5 | `var(--body-size)` / `var(--body-weight)` / `line-height: 1.5` | `tokens.css:86-88` |
| Marker value | 13px / 600 | 600 / 1.15 | `font-size: 13px` / `font-weight: 600` / `line-height: 1.15` | `markers.css:42-44` |
| Marker unit/label | 11px / 400 | 400 / 1.15 | `font-size: 11px` / `font-weight: 400` | `markers.css:95-96` |

`font-variant-numeric: tabular-nums` is set on `.marker-pill` (global) and repeated on `.marker-temp` and `.marker-wind-speed` (correct, belt-and-suspenders for older browsers). The system UI font stack matches the spec. No webfont download is present (correct for this phase). Weight set is exactly {400, 600} — two weights, within the cap. No sizes outside the four declared roles appear in any CSS file.

No findings. Score: 4/4.

---

### Pillar 5: Spacing (3/4)

**What passes:** All seven spacing tokens are declared in `tokens.css` (`--space-xs` through `--space-3xl`). Token usage is consistent throughout: header `gap: var(--space-sm)`, `padding: 0 var(--space-md)`; pill `gap: var(--space-xs)`. The 44px touch-target minimum (`min-height: 44px; min-width: 44px`) is implemented as the spec's explicit accessibility exception.

**What fails:**

- WARNING — **Pill padding uses raw literals (`markers.css:37`):** `padding: 4px 8px` is set directly as pixel values rather than `var(--space-xs) var(--space-sm)`. The numeric values happen to match the token values today, so there is no visual deviation from the spec. But the duplication breaks the single-source guarantee: if the spacing scale changes, `--space-xs` and `--space-sm` update automatically everywhere except this one rule.

- WARNING (minor) — **Wind-group inner gap uses raw `2px` (`markers.css:76`):** `.marker-wind` has `gap: 2px` between the arrow SVG and the speed numeral. This value is below `--space-xs` (4px) and has no corresponding token. It is a reasonable micro-spacing choice for the tight arrow+numeral pairing, but it is not on the declared scale. A `1px` or `2px` inter-element gap is common UX practice for inline glyph+text pairs; the deviation is cosmetically justified but undocumented as an intentional exception.

Score rationale: two raw-pixel spacing values not using the token system, both with no visual defect but representing a maintainability gap.

---

### Pillar 6: Experience Design (2/4)

**What passes:** The hybrid collision renderer handles multiple states correctly. The `ófullnægjandi gögn` muted callout is wired and unit-tested. Per-station Promise isolation prevents one bad file from crashing the whole map. `prefers-reduced-motion` is respected in `markers.css`. Focus-visible skeleton (`:focus-visible` outline `2px solid var(--ink)`) is authored ready for Phase 6. SVG icons carry `aria-hidden="true"` and `focusable="false"`. Pills carry `aria-label` with the station name. The wind convention is documented in code. `new maplibregl.Marker` is absent (grep-confirmed), preserving mobile DOM performance.

**What fails:**

- BLOCKER — **No map-load error surface:** the map's outer `wireMarkers` catch block in `main.ts:74-77` only calls `console.error`. If the PMTiles file fails to serve (e.g. 404, CORS, or network timeout) or the MapLibre style fails to parse, the user sees the `#E8EBED` background and a blank map with no canvas and no message. The UI-SPEC explicitly requires: heading `Ekki tókst að hlaða kortið` + body `Reyndu að hlaða síðunni aftur.` rendered over the dominant background. Additionally, MapLibre itself emits an `error` event for style-load failures — this event is not handled anywhere in `init.ts` or `main.ts`. Fix: add `map.on("error", (e) => showMapError(e))` in `init.ts`, and replace the bare `console.error` in `wireMarkers` with a visible in-DOM error state.

- WARNING — **No "all stations empty" state:** if `loadStations` returns an empty array (or `stations.json` is missing), `installMarkerLayer` is called with zero features, `renderComposite` renders nothing, and the overlay remains empty. No user-visible message is shown. The UI-SPEC requires `Engar veðurstöðvar` / `Engin gögn til að birta á kortinu. Reyndu að hlaða síðunni aftur.`. This is a defensive state only reachable in deployment (the committed two-station sample always has data), but it will be live when the full national dataset is deployed and a data-branch update is mid-process. Fix: add a `data.length === 0` check after `installMarkerLayer` and render an overlay message card.

- WARNING — **`tabIndex=-1` means markers are not keyboard-reachable this phase:** this is intentional per the spec ("activated in Phase 6") and correctly documented, but the `aria-label` on each `<button>` is currently `datum.name` only. When Phase 6 activates tabbing, the announced label will be just the station name with no hint of the data it contains (e.g. "Reykjavík" not "Reykjavík 11° variable wind 4 m/s"). A richer `aria-label` is straightforward to add now while the HTML structure is known. Not a blocker this phase.

Score rationale: the BLOCKER (no map-load error UI) scores this pillar 2. The ófullnægjandi muted state and per-station isolation are excellent; the missing global-error surface is a significant gap for any user who hits network trouble.

---

## Localization Note (Non-Blocking)

The basemap renders both "ICELAND" (English, large uppercase) and "Ísland" (Icelandic, italic smaller) as separate country labels at zoom 6. The `lang: "is"` option is passed to `namedFlavor("grayscale")` in `style.ts:51`, but Protomaps's grayscale flavor at maxzoom 9 appears to include both `name` (English) and `name:is` labels for the country level. This is a Protomaps-flavor/tileset limitation: the PMTiles extract at maxzoom 9 includes both label fields, and the grayscale flavor's label layers may render `name` as a fallback alongside `name:is`. The correct long-term fix is either a flavor layer override to suppress the `name` label when `name:is` is present, or waiting for the Protomaps flavor to improve its `lang` handling. This is deferred per the audit brief — flagged here for Phase 7 or a future basemap refresh.

---

## Registry Audit

No shadcn or third-party component registries are used. `components.json` does not exist. Registry audit: not applicable.

---

## Files Audited

- `site/src/styles/tokens.css` — design tokens, layout, header, attribution styles
- `site/src/styles/markers.css` — marker pill anatomy, states, focus skeleton
- `site/src/map/markers.ts` — hybrid renderer, formatCallout, installMarkerLayer
- `site/src/map/init.ts` — MapLibre map construction, AttributionControl
- `site/src/map/style.ts` — PMTiles basemap style, mute-to-dominant pass
- `site/src/ui/header.ts` — wordmark + slogan render
- `site/src/ui/attribution.ts` — CC BY 4.0 attribution HTML builder
- `site/src/main.ts` — boot, wireMarkers, per-station load guard
- `site/src/data/types.ts` — MarkerDatum contract, DEFAULT_WINDOW
- `site/src/data/averages.ts` — computeMarkerDatum transform
- `site/src/data/load.ts` — content-hashed manifest resolution, fetch helpers
- `site/index.html` — document shell, lang="is"
- `site/tests/e2e/shell.spec.ts` — E2E criteria 1–4, 8–9
- `site/tests/e2e/markers.spec.ts` — E2E criteria 5–7, 9–11
- `packages/domain/src/attribution.ts` — ATTRIBUTION constant
- `evidence/03-01-map-shell.png` — zoom 6 shell screenshot (Plan 01)
- `evidence/03-03-markers-zoom6.png` — zoom 6 with markers
- `evidence/03-03-markers-zoomed.png` — zoomed in on SW stations
