---
phase: quick-260721-okx
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - site/src/styles/controls.css
  - site/src/styles/trust.css
  - site/src/styles/score.css
  - site/src/styles/tokens.css
  - site/src/styles/panel.css
  - site/src/map/init.ts
  - site/src/ui/header.ts
  - site/src/ui/stationPanel.ts
  - site/src/state/url.ts
  - site/src/main.ts
  - site/src/ui/rankedList.ts
  - site/src/ui/scrubber.ts
  - site/src/ui/yearRange.ts
autonomous: true
requirements: [V1.1-A11Y, V1.1-ATTRIB]
must_haves:
  truths:
    - "The compact MapLibre CC BY 4.0 / OSM credit is never occluded by the legend or ranked list at 1280 / 768 / 390 px."
    - "The page has exactly one <h1> landmark (the wordmark), styled identically to the prior span."
    - "Closing the station panel returns keyboard focus to a live, stable element — never to <body>."
    - "A ?st= id with no matching station never opens an empty panel; the invalid id is dropped."
    - "Glass surfaces (panels, legend, ranked, control bar) no longer bleed map labels/attribution through."
    - "Screen readers read ranked rows, the scrubber, and the year selects with distinct, human-readable Icelandic names."
  artifacts:
    - path: "site/src/styles/controls.css"
      provides: "--panel-safe-bottom occlusion-clearing token + raised opacity"
      contains: "--panel-safe-bottom"
    - path: "site/src/ui/header.ts"
      provides: "wordmark promoted to <h1>"
      contains: "createElement(\"h1\")"
  key_links:
    - from: "site/src/styles/score.css"
      to: "--panel-safe-bottom"
      via: "legend + ranked bottom keyed off the shared safe-band token"
      pattern: "panel-safe-bottom"
    - from: "site/src/main.ts"
      to: "site/src/state/url.ts paramsToState"
      via: "known-station-id validation at boot + popstate"
      pattern: "knownStationIds|validStationIds"
---

<objective>
v1.1 polish fix pass on the live Betra Veður site: eliminate the attribution-occlusion licensing risk, close the medium a11y gaps (missing <h1>, station-panel focus-return-to-body, ambiguous close label, invalid ?st= empty panel, glass opacity bleed-through), and clear the cheap aria nits (ranked-row run-on, scrubber aria-valuetext, year-select aria, header subtitle contrast).

All fixes are pre-diagnosed with exact file locations. No re-research. No new runtime deps. Icelandic-only user-facing copy, matching the existing Copywriting Contract.

Purpose: the site is deployed and live; these are UX/layout/a11y correctness fixes, with attribution occlusion being a licensing-legibility issue that must never regress.
Output: a rebuilt, typechecked, unit- + E2E-verified site with a Playwright visual proof that the compact credit is unoccluded at 1280 / 768 / 390.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/.continue-here.md

<interfaces>
<!-- Key seams the executor needs. Extracted from the codebase — no exploration required. -->

Attribution safe-zone (trust.css:99-101) — the baseline band the MapLibre bottom controls clear:
```css
:root { --attrib-safe-bottom: var(--bar-height, 100px); }
```
controls.css:293-296 consumes it:
```css
.maplibregl-ctrl-bottom-right,
.maplibregl-ctrl-bottom-left {
  margin-bottom: calc(var(--attrib-safe-bottom, 0px) + var(--space-sm));
}
```
Legend (score.css:86-90) and ranked (score.css:240-245) both sit at:
```css
bottom: calc(var(--bar-height, 100px) + var(--space-lg));  /* only ~24px above the bar; credit is ~28-30px tall → its top pokes into the panel zone */
z-index: 10;
```

header.ts current wordmark (a <span>, must become <h1 class="wordmark">):
```ts
const wordmark = document.createElement("span");
wordmark.className = "wordmark";
wordmark.textContent = WORDMARK;
```
Wordmark CSS is `header.app-header .wordmark` (tokens.css:116-122) — class-scoped, so an <h1> inherits it; default h1 margin/font-size must be reset.

stationPanel.ts teardown focus-return (stationPanel.ts:393-396):
```ts
if (returnFocusTo && document.contains(returnFocusTo)) returnFocusTo.focus();
returnFocusTo = null;
```
Launcher capture at open() (stationPanel.ts:684-686) — only adopted when live + non-panel:
```ts
if (launcher && !section.contains(launcher) && document.contains(launcher)) {
  returnFocusTo = launcher;
}
```
The close button lives at stationPanel.ts:446-452 (`closeBtn`, class `station-panel__close`). COPY.close = "Loka" (stationPanel.ts:45). The map container is `#map`; the info button is the top-right `i` (`.bv-info-button`-class control mounted by infoPanel.ts) — either is a stable fallback focus target that always exists in the DOM.

url.ts paramsToState is PURE (no station list). The `st` parse (url.ts:130-131):
```ts
const stRaw = numParam(p, "st");
const stationId = stRaw !== null ? Math.round(stRaw) : fallback.stationId;
```
main.ts has the station set at boot: `const cache = buildStationCache(entries)` (main.ts:210) and `entries`/`muted` carry every known station id. Boot hydrate (main.ts:215-217) and popstate (main.ts:312-316) are the two seams where a parsed state reaches the store — validate `st` against the known-id set THERE (url.ts stays pure/defensive).

rankedList.ts builds rows with separate spans whose concatenated text is the accessible name (rankEl "1.", nameEl "Reykjavík", scoreEl "8,5" → "1.Reykjavík8,5"). buildRow is at rankedList.ts:203-243; the row <button> is `btn` (class `ranked-list__rowbtn`), updated in updateRow (rankedList.ts:252-277). The marker aria phrasing to MATCH is markers.ts:291: `` `${datum.name}: meðaltal ${datum.n} ára, einkunn ${formatScore(datum.score)}` ``.

scrubber.ts range is `range` (scrubber.ts:103-110); syncReadouts (scrubber.ts:157-166) already computes `windowLabel(doy, width)` into `readout.textContent` — reuse it for aria-valuetext. It already sets aria-valuenow (scrubber.ts:164).

yearRange.ts selects `fromSel`/`tilSel` (yearRange.ts:49-60) already have `<label for>` (Frá/Til) associations; add explicit aria-labels as belt-and-suspenders.

Glass surface opacity is `rgba(255, 255, 255, 0.92)` in: tokens.css:110, controls.css:24, score.css:96/252/461/519/556, panel.css:31, trust.css:46/140. Blur must be kept.

Slogan color (tokens.css:124-129) is `--muted-ink: #5b6670` on the ~0.92 white glass header — check WCAG-AA; darken to `--ink` (#1f2933) for the subtitle only if it fails.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Attribution occlusion + glass opacity + subtitle contrast (CSS)</name>
  <files>site/src/styles/controls.css, site/src/styles/trust.css, site/src/styles/score.css, site/src/styles/tokens.css, site/src/styles/panel.css, site/src/map/init.ts</files>
  <action>
Fix A (attribution occlusion — fix-first, licensing). Introduce a single shared token so the bottom-left legend and right-docked ranked list ALWAYS clear the full height of the compact bottom-right credit at every width. In trust.css, beside the existing `--attrib-safe-bottom` rule (:99-101), add a sibling custom property `--panel-safe-bottom` keyed off it plus a credit-height allowance — e.g. `--panel-safe-bottom: calc(var(--attrib-safe-bottom, 100px) + var(--space-lg) + 32px)` (32px covers the ~28-30px compact credit plus a gap). Keep the design's existing "reserve one band" philosophy documented at controls.css:273-296 and trust.css:88-101 — extend the comment to explain the new token, do not add per-surface hacks. Then in score.css point BOTH the legend `bottom` (:89) and the ranked-list `bottom` (:244) at `var(--panel-safe-bottom)` instead of `calc(var(--bar-height, 100px) + var(--space-lg))`. Review init.ts:46-52 AttributionControl config: `compact: true` is correct and stays (the compact `(i)` collapse is the CC BY 4.0-permitted behavior); no code change unless the compact toggle is not rendering — leave it compact. Do NOT touch the info-panel full credit (trust.css) — it remains the licensing backstop.

Fix B.5 (glass opacity bleed-through). Bump every glass surface from `rgba(255, 255, 255, 0.92)` to `rgba(255, 255, 255, 0.97)` consistently across tokens.css:110, controls.css:24, score.css:96/252/461/519/556, panel.css:31, and trust.css:46/140. Keep the `backdrop-filter: blur(8px)` on each — only the alpha changes so map labels/attribution stop leaking through.

Fix C.4 (header subtitle contrast). The slogan uses `--muted-ink` (#5b6670) on the glass header (tokens.css:124-129). #5b6670 on the ~0.97 white glass is roughly 5.8:1 — passes AA for normal text — but the slogan renders over a translucent surface with the map behind. If, on the built site, the slogan fails WCAG-AA (contrast < 4.5:1) against the effective background, change ONLY the slogan color to `var(--ink)` (#1f2933). Verify with the Playwright/axe contrast check in Task 3 before deciding; if it already passes, leave it.
  </action>
  <verify>
    <automated>cd site && npm run build 2>&1 | tail -5 && grep -q "panel-safe-bottom" src/styles/trust.css && grep -c "panel-safe-bottom" src/styles/score.css | grep -qv '^0$' && ! grep -rn "rgba(255, 255, 255, 0.92)" src/styles/</automated>
  </verify>
  <done>--panel-safe-bottom exists in trust.css and drives both legend + ranked bottom in score.css; zero remaining `rgba(255,255,255,0.92)` glass surfaces (all bumped to 0.97); AttributionControl stays compact; build succeeds.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: A11y semantics — h1, focus-return, close label, invalid ?st= drop</name>
  <files>site/src/ui/header.ts, site/src/ui/stationPanel.ts, site/src/state/url.ts, site/src/main.ts, site/src/styles/tokens.css</files>
  <action>
Fix B.1 (missing <h1>). In header.ts, promote the wordmark from `document.createElement("span")` to `document.createElement("h1")`, keeping `className = "wordmark"` and the same textContent. In tokens.css, add a reset so the <h1> inherits the existing `.wordmark` look: within/near the `header.app-header .wordmark` rule (:116-122) reset default h1 chrome — `margin: 0` and let `font-size`/`font-weight`/`line-height` continue to come from the existing rule (they already set font-size/weight/line-height, so just ensure `margin: 0` and that no UA h1 defaults override). The slogan stays a <span>.

Fix B.2 (focus-return robustness). In stationPanel.ts, make teardown's focus-return never fall to <body>. Root cause: markers.ts replaceChildren re-renders the composite overlay on every move/idle, so a marker-pill launcher captured at open (`returnFocusTo`, stationPanel.ts:684-686) is a detached node by teardown → `document.contains(returnFocusTo)` is false (stationPanel.ts:395) → focus falls to body. Fix: in teardown (stationPanel.ts:393-396), when `returnFocusTo` is null OR not in the document, fall back to focusing a STABLE always-present element — prefer the info `(i)` button (query the top-right info control, e.g. `document.querySelector<HTMLElement>(".bv-info-button")` — confirm the actual class from infoPanel.ts) and if that is somehow absent, focus the map container (`document.getElementById("map")`, ensuring it has `tabindex="-1"` so it is focusable — set it programmatically if needed). Match the info panel's correct focus-return intent (never <body>). Keep the existing launcher-adoption path at open() intact.

Fix B.3 (close aria-label). In stationPanel.ts COPY (:44-45), change `close: "Loka"` to `close: "Loka spjaldi"` (Icelandic "close panel") so the close control's accessible name is distinct. The visible glyph (buildCloseGlyph) is unchanged; only the aria-label string changes.

Fix B.4 (invalid ?st= drop). Validate `st` against the known station id set at the seams where the station set is available — NOT in the pure url.ts. Keep url.ts's defensive parse (url.ts:130-131) intact (it still yields an integer or null). In main.ts, build a `Set<number>` of known station ids from the loaded data at boot — the ids in `entries` plus `muted` (both are MarkerDatum/StationCacheEntry carrying `.station`), i.e. every id the map knows about. After paramsToState at boot (main.ts:215-217) and after paramsToState at popstate (main.ts:312-316), if the resulting `stationId` is non-null and NOT in the known-id set, coerce it to null before it reaches `store.set`/`createStore` (so an invalid `?st=` never opens an empty panel). Name the set clearly (e.g. `knownStationIds`) so the key_link grep resolves. Do not reflect the raw URL value anywhere in the DOM (existing T-04-06 discipline).
  </action>
  <verify>
    <automated>cd site && npm run typecheck && grep -q 'createElement("h1")' src/ui/header.ts && grep -q "Loka spjaldi" src/ui/stationPanel.ts && grep -Eq "knownStationIds|validStationIds" src/main.ts && npm test 2>&1 | tail -5</automated>
  </verify>
  <done>Wordmark is an <h1 class="wordmark"> with margin reset and unchanged visual style; teardown focus-return falls back to a stable element (info button / map), never <body>; close aria-label is "Loka spjaldi"; an unknown ?st= id is coerced to null at boot + popstate so no empty panel opens; tsc 0 on site; unit tests green.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Cheap aria nits + full verification (ranked row, scrubber, year selects) + Playwright proof</name>
  <files>site/src/ui/rankedList.ts, site/src/ui/scrubber.ts, site/src/ui/yearRange.ts</files>
  <action>
Fix C.1 (ranked-row aria run-on). In rankedList.ts, give each row button a distinct accessible name so a screen reader reads "1. Reykjavík, einkunn 8,5" instead of the concatenated "1.Reykjavík8,5". In buildRow/updateRow (rankedList.ts:203-277), set an explicit `aria-label` on the row `btn` composed as `` `${rank}. ${datum.name}, einkunn ${formatScore(datum.score as number)}` `` — matching the Icelandic phrasing already used in markers.ts:291 ("einkunn ${score}"). Update the aria-label in updateRow whenever rank/name/score change (it is rebuilt each recompute path there). Keep the visible spans (rank/name/badge/score) as-is; the aria-label overrides the computed name. When the "án úrkomu" badge is present you may append ", án úrkomu" to the aria-label for completeness (optional, keep Icelandic).

Fix C.2 (scrubber aria-valuetext). In scrubber.ts syncReadouts (:157-166), add `range.setAttribute("aria-valuetext", label)` right after it computes `const label = windowLabel(doy, width)` — reusing the exact human window label the readout already shows (e.g. "16. júlí–15. ágúst") so the range reads a date window, not the raw doy. Keep the existing aria-valuenow line.

Fix C.3 (year <select> aria-labels). In yearRange.ts, add explicit aria-labels to the two selects (they have `<label for>` already, this is belt-and-suspenders): `fromSel.setAttribute("aria-label", "Frá ári")` and `tilSel.setAttribute("aria-label", "Til árs")` after their creation (yearRange.ts:49-60).

VERIFICATION (this task owns the full gate). Run, and record evidence:
1. `cd site && npm run typecheck` → tsc 0 errors on site.
2. `cd pipeline && npm run typecheck` (or the repo-root pipeline typecheck script) → tsc 0 on pipeline.
3. `cd site && npm test` → unit tests green.
4. `cd site && npm run test:e2e` (or the repo's Playwright E2E command) → E2E green.
5. Playwright visual + a11y check on the BUILT/preview site (`npm run build && npm run preview`, drive the preview URL under the /betravedur/ base path). Write a short throwaway spec (or extend an existing one) that, at viewport widths 1280, 768, and 390:
   (a) asserts the compact MapLibre attribution credit (`.maplibregl-ctrl-attrib`) bounding box does NOT intersect the legend (`.score-legend`) or the ranked list (`.ranked-list`) bounding boxes — the credit is fully visible/unoccluded;
   (b) asserts exactly one `<h1>` exists and its text is "Betra Veður";
   (c) opens a station panel (marker click or ?st= a KNOWN station), closes it, and asserts `document.activeElement` is NOT `document.body` (focus returned to a stable element);
   (d) navigates with `?st=999999` (an unknown id) and asserts no station panel opens (no empty aria-label panel);
   (e) run an axe-core contrast pass (or programmatic contrast computation) over the header slogan; if it fails AA, apply the Task-1 Fix C.4 slogan → `--ink` change and re-run.
   Capture screenshots at each width as evidence in the scratchpad.
  </action>
  <verify>
    <automated>cd site && grep -q "aria-valuetext" src/ui/scrubber.ts && grep -q "Frá ári" src/ui/yearRange.ts && grep -Eq 'aria-label.*einkunn|einkunn.*aria' src/ui/rankedList.ts && npm run typecheck && npm test 2>&1 | tail -3 && npm run build 2>&1 | tail -3</automated>
    <human-check>Playwright visual proof at 1280/768/390: compact attribution credit unoccluded by legend + ranked list; exactly one h1; focus returns off body after station-panel close; unknown ?st= opens no panel. Screenshots captured.</human-check>
  </verify>
  <done>Ranked rows read "1. Reykjavík, einkunn 8,5"; scrubber range exposes aria-valuetext = the window date label; year selects have "Frá ári"/"Til árs" aria-labels. FULL GATE GREEN: tsc 0 on site AND pipeline, unit tests green, E2E green, and the Playwright visual/a11y check passes at 1280/768/390 (attribution unoccluded, single h1, focus off body after close, invalid ?st= opens nothing).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| URL query string → store → DOM | `?st=` and other params are attacker-controllable; must never reflect raw strings into the DOM or open UI on unknown ids |
| Committed data file → station name text | station names originate from a data file, treated as untrusted-by-default (textContent only, never innerHTML) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-okx-01 | Tampering | `?st=<id>` in url.ts / main.ts | mitigate | Validate parsed `st` against the known-station-id Set at boot + popstate (Task 2 Fix B.4); unknown id → null, no panel. url.ts stays pure/defensive. |
| T-okx-02 | Information disclosure | ranked-row / panel aria-label built from station name | accept | Names are set via textContent / string aria-label assignment (no innerHTML); existing T-05-05 discipline preserved. No new sink introduced. |
| T-okx-03 | Tampering | npm/pip/cargo installs | mitigate | No new runtime deps added by this plan (constraint); no install tasks → no package-legitimacy gate needed. Any dev-only test tooling (axe-core) must already be present or be a devDependency verified against npmjs.com before use. |
</threat_model>

<verification>
- `cd site && npm run typecheck` → 0 errors.
- pipeline typecheck → 0 errors.
- `cd site && npm test` → unit tests green.
- `cd site && npm run test:e2e` (repo Playwright command) → E2E green.
- Playwright visual/a11y proof at 1280 / 768 / 390: attribution credit unoccluded by legend + ranked list; exactly one `<h1>` ("Betra Veður"); focus off `<body>` after station-panel close; `?st=999999` opens no panel.
- `grep`: no remaining `rgba(255, 255, 255, 0.92)` in `site/src/styles/`; `--panel-safe-bottom` present and consumed by legend + ranked.
</verification>

<success_criteria>
- Compact CC BY 4.0 / OSM credit is never occluded at any of the three widths (licensing-legibility fix holds).
- Single `<h1>` landmark; station-panel close returns focus to a stable element (never `<body>`); close control reads "Loka spjaldi".
- Unknown `?st=` id is dropped — no empty panel.
- Glass surfaces at 0.97 opacity — no map-label/attribution bleed-through; blur retained.
- Ranked rows, scrubber, and year selects expose distinct human-readable Icelandic accessible names.
- No new runtime dependencies; build tree-shakeable; all user-facing copy Icelandic.
- Full gate green (tsc site+pipeline, unit, E2E, Playwright visual/a11y).
</success_criteria>

<output>
Create `.planning/quick/260721-okx-v1-1-polish-fixes/260721-okx-SUMMARY.md` when done.
</output>
