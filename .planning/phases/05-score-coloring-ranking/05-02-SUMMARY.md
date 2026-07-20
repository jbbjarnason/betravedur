---
phase: 05-score-coloring-ranking
plan: 02
subsystem: ui
tags: [maplibre, colorbrewer, bugn, legend, details, playwright, vitest, css-tokens, typescript]

# Dependency graph
requires:
  - phase: 05-score-coloring-ranking (05-01)
    provides: "MarkerDatum.score:number|null + missingRain + pure scoreColor(0-10)->BuGn #rrggbb helper + Wave-0 score.spec skeleton"
  - phase: 03-static-site-shell-interactive-map
    provides: "hybrid #marker-overlay buildPill renderer + formatCallout muted branch + window.__map E2E hook"
  - phase: 04-selection-state-url
    provides: "observable store (window.__store) + debounced no-fetch recompute path + --bar-height control-bar var + preview-build Playwright harness"
provides:
  - "Score-colored marker pill: a BuGn 4-6px left color-bar (inline --pill-score) + an always-visible ink-on-white numeric score badge (Icelandic comma, formatScore)"
  - "mountLegend() — a bottom-left legend (BuGn color scale + 0-10 ticks + verra/betra) with a native <details> transparency explainer (SCORE-03: úrkoma 40% / vindur 30% / hiti 30% + án-úrkomu renormalization)"
  - "--score-0..10 BuGn tokens (tokens.css) sampled from scoreColor() — the single ramp source the legend swatches + marker color both read"
  - "score.spec criteria 1-4/11(coloring)/14(badge) now REAL (not fixme) on the preview build"
affects: [05-03-ranked-list, 06-station-chart-panel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Score color is a per-pill inline custom property (--pill-score = scoreColor(datum.score)); CSS draws the left-bar + badge ring from it — no color logic in CSS, no recompute in JS (reads datum.score)"
    - "Muted/null pills NEVER enter the ramp path: buildPill branches on `!muted && datum.score !== null` before touching --pill-score/class/badge (T-05-04), so ófullnægjandi pills render byte-identical to Phase 3"
    - "Legend is STATIC chrome: mountLegend runs once in boot(), subscribes to no store, needs no data — the ramp doesn't move on selection"
    - "Ramp reconciliation: --score-* tokens are scoreColor() sampled at integer stops, so the legend gradient and the interpolated marker color agree exactly at the labeled ticks (single source of truth = BuGn)"

key-files:
  created:
    - "site/src/styles/score.css"
    - "site/src/ui/legend.ts"
  modified:
    - "site/src/map/markers.ts"
    - "site/src/map/markers.test.ts"
    - "site/src/styles/tokens.css"
    - "site/src/main.ts"
    - "site/tests/e2e/score.spec.ts"
    - ".planning/phases/05-score-coloring-ranking/05-UI-SPEC.md"

key-decisions:
  - "Applied the score color as a 4-6px LEFT COLOR BAR (not a thin 2px full ring): the pale BuGn low-end (#edf8fb) lacks contrast as a hairline ring (RESEARCH Pitfall 3). The bar sits over a 1px --hairline floor + inset outline so even --score-0/1 read as an intentional colored edge."
  - "RECONCILED the ramp to BuGn (05-01's authoritative scoreColor + boundary tests). The 05-UI-SPEC's 11-stop slate->yellow-green token table (#5B6B7A..#84A81F) is SUPERSEDED — updated the UI-SPEC table, the ring->left-bar spec, and the Design System note to score.css + BuGn. --score-* tokens are scoreColor() sampled at each integer stop."
  - "The score badge numeral is ink-on-white (13:1, ramp-independent legibility) with a --pill-score ring as the redundant color channel — never colored text (would force a per-stop text-color crossover)."
  - "formatScore is a pure exported helper (one-decimal Icelandic comma, total-clamped like scoreColor) so the badge format is unit-testable without DOM/map; buildPill (map-dependent) is covered by the E2E."

patterns-established:
  - "Two redundant channels per scored pill (color left-bar + numeric badge) so score is never conveyed by hue alone — continues the Phase 3 color-not-sole-channel rule"
  - "Grep gate hygiene: score.css comments avoid the literal --accent/#c0392b token strings so the accent-red FAIL-on-match gate stays meaningful (a comment mentioning the token would trip it)"

requirements-completed: [MAP-03, SCORE-03]

# Metrics
duration: 7min
completed: 2026-07-20
---

# Phase 5 Plan 02: Score-Colored Markers + Legend & Explainer Summary

**The neutral Phase-3 white pill is now score-colored — a BuGn left color-bar + an always-visible ink-on-white numeric badge (Icelandic comma) driven by `datum.score` — and a bottom-left legend renders the BuGn color scale with a native `<details>` transparency explainer (úrkoma 40% / vindur 30% / hiti 30% + the án-úrkomu renormalization note), reconciling the ramp to BuGn across code and the UI-SPEC.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-07-20T12:12:34Z
- **Completed:** 2026-07-20T12:19:43Z
- **Tasks:** 3
- **Files modified:** 9 (2 created, 7 modified)

## Accomplishments
- Extended `buildPill` so a SCORED datum (score !== null, sufficient) gets an inline `--pill-score` (`scoreColor(datum.score)`), the `marker-pill--scored` class, and a prepended ink-on-white numeric badge (`formatScore` → `8,6`). The muted/`ófullnægjandi gögn` branch is untouched (T-05-04) — no ring, no badge, off the ramp.
- Added the pure, unit-tested `formatScore` helper (one-decimal Icelandic comma, total-clamped) so the badge format is provable without DOM.
- Added the `--score-0..10` BuGn tokens (tokens.css), sampled from `scoreColor()` at each integer stop so the legend swatches and the interpolated marker color agree at the labeled ticks.
- Created `score.css`: a 4–6px left color-bar over a `--hairline` floor (Pitfall 3 mitigation), the ink-on-white badge with a `--pill-score` ring, and the full bottom-left legend panel styling (surface treatment matching the header/control-bar, `--bar-height` clearance, ≤320px occlusion budget).
- Created `legend.ts` (`mountLegend`): a labelled `Skýring á einkunn` region with the `Einkunn` title, BuGn gradient scale, `0 2 4 6 8 10` ticks, `verra`/`betra` captions, and a native `<details>` explainer carrying the exact Copywriting-Contract weight prose + the án-úrkomu clause (all via `textContent`, T-05-03).
- Wired `mountLegend(document.body)` into `boot()` and imported `score.css` in main.ts.
- Converted score.spec criteria 1, 2 (+11 coloring), 3, 4, 14 from `test.fixme` to real assertions on the preview build; captured + self-inspected an evidence screenshot.
- Reconciled the 05-UI-SPEC ramp: superseded the 11-stop slate table with the shipped BuGn `--score-*` values, changed the ring→left-bar spec, and updated the Design System note to `score.css` + BuGn.

## Task Commits

Each task was committed atomically:

1. **Task 1: Score left-bar + numeric badge on the pill; BuGn `--score-*` tokens; score.css** — `87bfac0` (feat) — `tdd="true"` (RED `formatScore` tests + GREEN impl staged together)
2. **Task 2: Legend panel with color scale + `<details>` explainer (SCORE-03)** — `a435b6a` (feat)
3. **Task 3: Wire legend into boot + score.spec criteria 1-4/11/14 + UI-SPEC BuGn reconciliation** — `c673fd0` (feat)

**Plan metadata:** committed with this SUMMARY (docs).

## Files Created/Modified
- `site/src/map/markers.ts` — imported `scoreColor`; added the pure `formatScore` export; extended `buildPill` with the `--pill-score`/`marker-pill--scored`/badge branch (muted branch untouched).
- `site/src/map/markers.test.ts` — added a `formatScore (MAP-03)` describe (format, badge-regex boundaries, non-finite clamp).
- `site/src/styles/tokens.css` — added the `--score-0..10` BuGn ramp tokens (reconciliation note inline).
- `site/src/styles/score.css` — NEW: scored-pill left-bar + hairline floor, ink-on-white badge with `--pill-score` ring, and the full legend/explainer panel styles.
- `site/src/ui/legend.ts` — NEW: `mountLegend`/`buildLegend` (static chrome, no store dep).
- `site/src/main.ts` — imported `score.css`, mounted the legend in `boot()`.
- `site/tests/e2e/score.spec.ts` — real criteria 1-4/11(coloring)/14 + evidence screenshot; 5-10/12-13 + the ranking halves of 11/14 remain fixme for 05-03.
- `.planning/phases/05-score-coloring-ranking/05-UI-SPEC.md` — ramp table/spec/Design-System note reconciled to BuGn + score.css.

## Decisions Made
See `key-decisions` in frontmatter. The material one for downstream: **the ramp is BuGn end-to-end now** — 05-03's ranked-list swatches must read the same `--score-*` tokens, and the marker "selected" highlight seam (Phase 6) should build on `marker-pill--scored` without restructuring.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `formatScore` non-finite test assertion corrected to match the documented low-stop contract**
- **Found during:** Task 1 (RED→GREEN)
- **Issue:** My initial RED test asserted `formatScore(Infinity) === "10,0"`. But the helper mirrors `scoreColor`'s total-clamp contract where a NON-finite input resolves to the LOW stop (`Number.isFinite(Infinity) === false` → 0), so the correct expectation is `"0,0"`. The test, not the impl, was wrong.
- **Fix:** Corrected the assertion to `"0,0"` for both `NaN` and `Infinity`, with a comment pinning the "non-finite → low stop" belt-and-suspenders contract.
- **Files modified:** `site/src/map/markers.test.ts`
- **Committed in:** `87bfac0` (Task 1)

**2. [Rule 3 - Blocking] Reworded a score.css comment so the accent-red FAIL-on-match grep gate stays meaningful**
- **Found during:** Task 1 (grep gate)
- **Issue:** A score.css comment read "Accent red (`--accent`) is NEVER referenced…" — which literally contains the `--accent` token string, tripping the plan's FAIL-on-match accent-red gate (`grep -qiE '#c0392b|--accent' … && exit 1`) on a comment, not a real style reference.
- **Fix:** Reworded to "The reserved temperature-red token is NEVER referenced…" so no `--accent`/`#c0392b` literal appears anywhere in score.css. Gate now passes as intended.
- **Files modified:** `site/src/styles/score.css`
- **Committed in:** `87bfac0` (Task 1)

---

**Total deviations:** 2 auto-fixed (1 test-bug, 1 blocking gate-hygiene). No scope creep; no architectural changes.

## Verification
- **Unit suite:** `npx vitest run` — 28 files, 252 passed / 3 pre-existing skips (no marker-test regression from the buildPill change; `formatScore` tests green).
- **Accent-red gate (must PASS = no match):** `grep -qiE '#c0392b|--accent' site/src/styles/score.css` → no match. tokens.css has no score-family line referencing accent. Verified individually — PASS.
- **Legend copy gate:** each of `úrkoma 40%`, `vindur 30%`, `hiti 30%`, `Skýring á einkunn`, `verra`, `betra`, `hvernig er einkunnin reiknuð?`, `endurdreift`, `án úrkomu` individually present in legend.ts (verified via node, not the fish-shell grep which mangles UTF-8) — PASS.
- **Type check:** `npx tsc --noEmit -p site` — no new errors in the touched files (markers, legend, main, score.spec).
- **Build:** `cd site && npm run build` — clean.
- **Score E2E:** `npx playwright test tests/e2e/score.spec.ts --project=chromium` — 7 passed / 10 skipped (criteria 1,2(+11),3,4,14 + smoke + evidence green; 05-03 criteria remain fixme).
- **Full E2E suite (regression):** `cd site && npx playwright test --project=chromium` — 37 passed / 10 skipped (Phase 3 shell/markers + Phase 4 selection specs all green — no regression).

### Screenshot evidence (no-review directive — self-inspected)
`.planning/phases/05-score-coloring-ranking/evidence/05-02-colored-markers-legend.png`

Self-inspection confirmed:
- **Color reads good=green:** Reykjavík (score `8,6`) shows a vivid dark-green left bar + green badge ring; the paler Keflavík bar sits lower on the BuGn ramp — the monotonic light→dark ordering is legible.
- **Numeric badge present + legible:** `8,6` / `8` on white chips with green rings, ink numerals — the required non-color channel, Icelandic comma format.
- **Reservation intact:** the temperature numeral stays accent-red (`12°`, `11°`); the pill body stays white.
- **Legend bottom-left:** title `Einkunn`, BuGn gradient scale, `0 2 4 6 8 10` ticks, `verra`/`betra` captions.
- **Explainer expands:** reveals the exact `úrkoma 40%, vindur 30% og hiti 30%` line + the án-úrkomu renormalization paragraph.
- **Coexistence:** the legend sits above the control bar and does not occlude central Iceland at the default framing (the tight SW-station framing in the evidence shot brings the legend near Keflavík only because the test zoomed in on the two-station sample).

## Known Stubs
None introduced. The remaining `test.fixme` placeholders in score.spec.ts (criteria 5-10, 12-13, the ranking halves of 11 and 14) are intentional Wave-0 scaffolds owned by 05-03 (the ranked "Bestu staðir" panel) — no UI element is faked; they simply do not run until that list exists.

## Threat Flags
None. No new network endpoints, auth paths, file access, or schema changes. The only new DOM surface is the score badge numeral (a formatted number via `textContent`, T-05-03) and hard-coded Icelandic legend literals — both inside the plan's existing `<threat_model>` (T-05-03/T-05-04, both mitigated).

## Next Phase Readiness
- 05-03 (ranked "Bestu staðir" list) reads the same `datum.score` (rank desc, exclude `score===null`) and the same `--score-*` BuGn tokens for its row swatches — the ramp is now the single reconciled source.
- The `marker-pill--scored` class + `--pill-score` custom property are the seam a Phase 6 "selected" marker highlight can extend without restructuring.
- score.spec is the green harness; the remaining fixmes name 05-03 as owner.

## Self-Check: PASSED

- Created files verified present: `site/src/styles/score.css`, `site/src/ui/legend.ts`, `.planning/phases/05-score-coloring-ranking/05-02-SUMMARY.md`, evidence PNG.
- Commits verified in git log: `87bfac0` (Task 1), `a435b6a` (Task 2), `c673fd0` (Task 3).

---
*Phase: 05-score-coloring-ranking*
*Completed: 2026-07-20*
