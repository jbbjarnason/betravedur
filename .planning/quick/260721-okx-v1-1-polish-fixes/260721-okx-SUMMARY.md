---
phase: quick-260721-okx
plan: 01
subsystem: site (frontend UI/UX/a11y)
tags: [a11y, licensing, css, attribution, focus-management, url-hardening]
requires:
  - v1.0 deployed site (all 8 phases complete)
provides:
  - Attribution credit never occludable at 1280/768/390 (collapse-by-default)
  - Single <h1> landmark; robust station-panel focus-return (never <body>)
  - Distinct Icelandic accessible names (ranked rows, scrubber, year selects)
  - Unknown ?st= id dropped at boot + popstate (no empty panel)
affects:
  - site/src/styles (glass opacity, safe-band)
  - site/src/map/init.ts (attribution collapse)
  - site/src/ui (header, stationPanel, rankedList, scrubber, yearRange)
  - site/src/main.ts (known-station validation)
tech-stack:
  added: []
  patterns:
    - "Shared --panel-safe-bottom token keys both bottom-docked panels off one band"
    - "Strip MapLibre auto-added maplibregl-compact-show at boot so credit boots collapsed"
    - "Known-station-id Set validation at store seams; url.ts stays pure/defensive"
key-files:
  created: []
  modified:
    - site/src/styles/trust.css
    - site/src/styles/score.css
    - site/src/styles/tokens.css
    - site/src/styles/controls.css
    - site/src/styles/panel.css
    - site/src/map/init.ts
    - site/src/ui/header.ts
    - site/src/ui/stationPanel.ts
    - site/src/main.ts
    - site/src/ui/rankedList.ts
    - site/src/ui/scrubber.ts
    - site/src/ui/yearRange.ts
    - site/tests/e2e/panel.spec.ts
    - site/tests/e2e/responsive.spec.ts
decisions:
  - "Attribution: the live root cause was NOT panel z-order but MapLibre auto-expanding the compact credit to a full-width wrapping bar on desktop. Fixed by collapsing to the (i) toggle at boot (never occludes), not by growing the safe-band (a wrapped credit's height is unbounded)."
  - "Header slogan contrast is a NON-ISSUE: measured 5.84:1 (AA-pass) on the 0.97 glass over the muted basemap. No color change made (Fix C.4 not applied)."
metrics:
  duration: ~35 min
  completed: 2026-07-21
  tasks: 3
  files: 14
---

# Phase quick-260721-okx: v1.1 Polish Fixes Summary

**One-liner:** Closed the attribution-occlusion licensing risk (collapse the auto-expanding MapLibre credit to the `(i)` toggle at boot), the medium a11y gaps (single `<h1>`, station-panel focus-return never `<body>`, distinct "Loka spjaldi" close label, invalid `?st=` dropped), the glass bleed-through (0.92 → 0.97), and the cheap aria nits (ranked-row, scrubber `aria-valuetext`, year-select labels) — verified with 92 E2E + a 7-case Playwright visual/a11y proof at 1280/768/390.

## What Was Built

### Task 1 — Attribution safe-band + glass opacity (commit `d5b359f`)
- Added a shared `--panel-safe-bottom` token in `trust.css` (`--attrib-safe-bottom + --space-lg + 32px`) and pointed both the bottom-left legend and the right-docked ranked list `bottom` at it in `score.css`.
- Bumped every glass surface from `rgba(255,255,255,0.92)` to `0.97` across `tokens.css`, `controls.css`, `panel.css`, `trust.css`, `score.css` (blur retained) so map labels/attribution stop bleeding through.

### Task 2 — A11y semantics (commit `4f0aa9b`)
- Wordmark `<span>` → `<h1 class="wordmark">`; UA h1 margin reset in `tokens.css` (visually identical).
- Station-panel teardown focus-return no longer falls to `<body>`: falls back to the stable info `(i)` button, else the `#map` container (`tabindex="-1"`).
- Close aria-label `"Loka"` → `"Loka spjaldi"` (distinct accessible name).
- `?st=` validated against a `knownStationIds` `Set` at boot + popstate (`main.ts`); unknown id → `null`, no empty panel. `url.ts` stays pure/defensive.
- Updated station-panel E2E selectors to the new `"Loka spjaldi"` label.

### Task 3 — Aria nits + attribution real-fix + verification (commit `4ac3cde`)
- Ranked rows: distinct `aria-label` `"N. Name, einkunn 8,5"` (+ `", án úrkomu"` when relevant).
- Scrubber range: `aria-valuetext` = the human window label (date window, not raw day-of-year).
- Year selects: explicit `"Frá ári"` / `"Til árs"` aria-labels.
- **Attribution occlusion real fix** (see Deviations): collapse the credit at boot; cap/right-align the user-opened fly-out.
- **Focus-return hardening** (see Deviations): reject `<body>` as a return target.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Attribution occlusion root cause was auto-expand, not z-order/safe-band alone**
- **Found during:** Task 3 Playwright visual verification (measured the painted credit box vs the panels at 1280/768/390).
- **Issue:** The plan (and the existing controls.css comment) assumed `compact:true` keeps the credit a "small single-line `(i)` toggle." Measurement disproved this: MapLibre auto-adds `maplibregl-compact-show` at boot on any map wider than 640px, rendering the full `customAttribution` as a **full-width, wrapping bar** (44px tall at 1280, 84px at 768, **164px at 390**). That bar slid under **both** the bottom-left legend and the bottom-right ranked list. A fixed `--panel-safe-bottom` allowance cannot clear a wrapped credit whose height grows with narrower width.
- **Fix:** In `init.ts`, strip the auto-added `maplibregl-compact-show` at mount and again on first `idle`, so the credit boots **collapsed** to the `(i)` toggle (the only state that never occludes a panel). In `controls.css`, cap + right-align the user-opened fly-out (`.maplibregl-compact-show` → `max-width: min(62vw, 340px)`) so an intentional expand stays in the bottom-right quadrant. The full CC BY 4.0 / OSM / Protomaps / Veðurstofa credit remains in the info panel as the licensing backstop. The `--panel-safe-bottom` token and 0.97 glass from Task 1 are retained (they still help the collapsed toggle + the legend/ranked stacking).
- **Files modified:** site/src/map/init.ts, site/src/styles/controls.css
- **Commit:** `4ac3cde`
- **Note:** `62vw` is intentionally distinct from the deleted legacy `60vw` hack that shell.spec criterion-12 grep-gates against (and is scoped to the opt-in fly-out only) — that gate still passes.

**2. [Rule 1 - Bug] Focus-return could still land on `<body>` (permalink / store-driven open)**
- **Found during:** Task 3 Playwright proof case (c).
- **Issue:** When the panel opens via the store (e.g. a `?st=` permalink) rather than a marker/row click, `document.activeElement` at open time is `<body>`, so `returnFocusTo` was captured as `<body>` itself. `document.contains(body)` is `true`, so `body.focus()` ran and left focus on `<body>` — the exact bug Task 2 aimed to prevent.
- **Fix:** Reject `<body>` both at launcher capture (`open()`) and at the teardown return check, so the stable-element fallback (info button / map) fires. Extends the Task 2 B.2 fix.
- **Files modified:** site/src/ui/stationPanel.ts
- **Commit:** `4ac3cde`

**3. [Rule 3 - Blocking] E2E selector collisions caused by the new aria labels**
- `panel.spec.ts` / `responsive.spec.ts` selected the station-panel close via `[aria-label="Loka"]` → updated to `"Loka spjaldi"` (committed with Task 2, `4f0aa9b`).
- `responsive.spec.ts` legend-chip locator `getByRole("button", { name: "Einkunn" })` became ambiguous because ranked rows now carry `"…, einkunn 8,5"` accessible names → made `exact: true` (committed with Task 3, `4ac3cde`).

### Non-Issue (recorded per constraint, no cosmetic change made)

**Fix C.4 — header subtitle contrast: NON-ISSUE.** The programmatic WCAG contrast check (Task 3 proof case (e)) measured the slogan (`--muted-ink` `#5b6670`) at **5.84:1** against the `0.97` white glass composited over the muted basemap `#E8EBED` — comfortably above the 4.5:1 AA threshold. The Task-1-conditional slogan → `--ink` change was **not** applied (the plan explicitly said "if it already passes, leave it").

## Verification Results

| Gate | Result |
|------|--------|
| `site` tsc (`tsc -p tsconfig.json --noEmit`) | 0 errors |
| pipeline + domain + fetch typecheck (`npm run typecheck`) | 0 errors |
| Unit tests (`vitest run`) | 363 passed, 3 skipped |
| Playwright E2E (`npm run e2e`) | 92 passed, 0 failed |
| Playwright v1.1 visual/a11y proof (1280/768/390) | 7 passed, 0 failed |
| grep: no `rgba(255,255,255,0.92)` in `site/src/styles/` | absent (all 0.97) |
| grep: `--panel-safe-bottom` present + consumed | present in trust.css, drives legend + ranked in score.css |

**Playwright proof (throwaway spec + screenshots in the session scratchpad, not the repo):**
- (a) Compact credit affordance unoccluded by legend + ranked at 1280/768/390 (credit boots collapsed; box does not intersect either panel). Screenshots: `attrib-1280.png`, `attrib-768.png`, `attrib-390.png`.
- (b) Exactly one `<h1>` with text "Betra Veður".
- (c) Closing the station panel leaves `document.activeElement !== document.body`.
- (d) `?st=999999` opens no station panel; store `stationId` coerced to `null`.
- (e) Header slogan contrast 5.84:1 ≥ 4.5:1 (AA).

Artifacts (spec, config, screenshots) live under `/private/tmp/claude-501/.../scratchpad/` — none committed to the repo.

## Known Stubs

None introduced. All fixes wire real behavior.

## Notes for the Reviewer

- The marker-overlap / marker-click-through and "markers vanish on zoom-in" items from the v1.1 backlog were **out of scope** (self-resolve with the national dataset) and were not touched.
- STATE.md was left modified for the orchestrator's docs commit; ROADMAP.md untouched (quick task).

## Self-Check: PASSED
- FOUND: all 12 modified source files present (verified by tsc + build success).
- FOUND commits: `d5b359f`, `4f0aa9b`, `4ac3cde` in `git log`.
- FOUND: `--panel-safe-bottom` in trust.css; `createElement("h1")` in header.ts; `Loka spjaldi` in stationPanel.ts; `knownStationIds` in main.ts; `aria-valuetext` in scrubber.ts; `Frá ári` in yearRange.ts.
