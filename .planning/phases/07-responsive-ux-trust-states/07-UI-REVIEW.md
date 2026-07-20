---
phase: 7
slug: responsive-ux-trust-states
audited: 2026-07-20
baseline: 07-UI-SPEC.md (approved design contract)
screenshots: evidence/ (7 images — Plans 02 and 03 captures, desktop 1280 + mobile 390)
dev-server: not started for this audit — code review + existing evidence screenshots used
---

# Phase 7 — UI Review

**Audited:** 2026-07-20
**Baseline:** 07-UI-SPEC.md (approved design contract)
**Screenshots:** 7 captured during Plan 02/03 execution (evidence/), reviewed in audit

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | All Icelandic strings exact-match the spec; no generic labels; all no-data strings preserved |
| 2. Visuals | 3/4 | Trust lead is prominent; mobile attribution at expanded sheet bleeds into the header band |
| 3. Color | 4/4 | Glass surface consistent; accent reserved to temp numeral only; no spec token violations |
| 4. Typography | 4/4 | Trust lead 14px/600 as spec; all roles reuse the established 20/14/13/11 scale exactly |
| 5. Spacing | 3/4 | Trust lead margin uses --space-lg (24px) not --space-sm per spec; close button left-aligned in dialog |
| 6. Experience Design | 4/4 | Loading/error/empty states wired; aria-live correct; keyboard equivalents complete; reduced-motion CSS-owned |

**Overall: 22/24**

---

## Top 3 Priority Fixes

> **All 3 fixed (2026-07-20).** Trust-lead margin + Loka centering: commit `a051e99`
> (`trust.css`). Attribution-at-expanded licensing justification: commit `55ea1fa`
> (`stationPanel.ts` comment on `raiseAttribSafeBottom`). All gates green (unit 319, tsc 0,
> build clean, E2E 92 both viewports).

1. **Attribution text fully visible at sheet expanded (mobile)** — **FIXED (`55ea1fa`)**: added a
   code comment in `stationPanel.ts` (`raiseAttribSafeBottom`) documenting the licensing
   justification — the full CC BY 4.0 + OSM + Protomaps + Veðurstofa credit is always reachable and
   legible in the modal info panel (the UI-SPEC's own accepted fallback clause), so the compact `(i)`
   riding the expanded-sheet top edge is an accepted state and the raise is deliberately not clamped.
 At `clamp(70svh, 80svh, 85svh)` expanded height the compact MapLibre attribution scrolls up behind the sheet header band. The spec requires the credit to be either directly legible above the peek top OR reachable in the info panel; the info-panel backstop satisfies licensing, but the compact `(i)` control at expanded is not visible in the evidence screenshot (`07-03-mobile-390-sheet-expanded.png`). The `--attrib-safe-bottom` value is raised to the sheet's VISIBLE height, which at expanded approaches the full sheet height, but the MapLibre control then hides above the sheet boundary. Concrete fix: ensure `onSnap(expandedY)` sets `--attrib-safe-bottom` to a value that keeps the compact `(i)` visually above the sheet top rounded-corner region — or, since the info-panel backstop is modal and always-reachable, document this as a known acceptable state per the spec ("or reachable via the info panel"). This is the spec's own accepted fallback; the fix is to add a comment in stationPanel.ts confirming the licensing justification at expanded. **Severity: WARNING** (licensing backstop in info panel satisfies the spec's own fallback clause).

2. **Trust lead bottom margin is --space-lg (24px) instead of the specified --space-sm** — **FIXED
   (`a051e99`)**: `.info-panel__lead` margin-bottom changed to `var(--space-sm)` (8px) so the bold
   lead reads as a lead into the body, not a section heading. — The spec states the `Þetta er sögulegt meðaltal, ekki spá.` line gets `--space-sm` breathing room above the plain-prose explanation. The implemented CSS (`info-panel__lead { margin: 0 0 var(--space-lg) }`) uses `--space-lg` (24px), creating a noticeably large gap between the bold trust lead and the "Kortið sýnir..." paragraph. In the desktop screenshot the gap is visually appropriate and does keep the lead prominent, but it diverges from the spec's declared token. Concrete fix: change `info-panel__lead` margin-bottom to `var(--space-sm)` (8px) and let the following `.info-panel__prose` margin-bottom `var(--space-lg)` provide section rhythm — this matches the spec's intent of "its own line with --space-sm breathing room." **Severity: WARNING** (visual quality, not a functional failure).

3. **Loka close button is left-aligned in the info panel dialog** — **FIXED (`a051e99`)**: added
   `display: flex; flex-direction: column` scoped to `.info-panel[open]` (scoped to `[open]` so a
   closed `<dialog>` keeps the UA `display:none`) + `align-self: center; margin-top: var(--space-md)`
   on `.info-panel__close`, so Loka now centres under the card. — The spec specifies a centered or right-aligned close affordance (implied by dialog conventions and the centered `text-align: center` on the dialog card). The `info-panel__close` button is `display: inline-flex` but no centering block wrapper exists in the dialog; the `<dialog>` itself has no `display: flex; align-items: center` so the button flows to the left edge of the card. In both the desktop and mobile info panel screenshots, `Loka` sits at the left margin inside the dialog. Concrete fix: add `.info-panel { display: flex; flex-direction: column; }` and optionally `align-self: flex-start` or `margin-top: var(--space-md)` to `.info-panel__close`, or wrap it in a `<div style="text-align:center">` block. **Severity: WARNING** (layout polish, spec convention divergence).

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)

All Phase 7 copy strings match the UI-SPEC copywriting contract exactly.

**Passing assertions (grep-verified + screenshot-confirmed):**
- `infoPanel.ts` COPY object: `Um kortið`, `Þetta er sögulegt meðaltal, ekki spá.`, the three paragraph strings, `Loka`, `Um kortið` button label — all verbatim matches to `07-UI-SPEC.md §Copywriting Contract`.
- `states.ts`: `hleð…` (init loading); callers pass `Ekki tókst að hlaða kortið` / `Reyndu að hlaða síðunni aftur.` / `Engar veðurstöðvar` / `Engar veðurstöðvar fundust til að sýna á kortinu.` — all spec-exact.
- `stationPanel.ts`: `Stækka eða minnka spjald` (drag handle), `Loka` (close) — verbatim.
- `rankedList.ts`: `Bestu staðir` chip label (accessible name = text content); `legend.ts`: `Einkunn` — both spec-exact.
- No-data strings preserved verbatim: `ófullnægjandi gögn`, `hleð riti…`, `engin gögn fyrir þetta tímabil`, `engin úrkomumæling á þessari stöð`, `Engin gögn`, `Engin einkunn` — all confirmed present in prior-phase files (Phase 7 contract confirms no regression).
- `uppfært 20. júlí 2026` confirmed in both info-panel screenshots — Icelandic human date, not ISO, not omitted.
- Attribution text sourced from `ATTRIBUTION` domain constant (never hardcoded) — confirmed in `infoPanel.ts` line 80: `text = ATTRIBUTION.text_is + ATTRIBUTION.modifiedNotice_is`.

**Note:** The control bar scrubber readout shows "July 20–July 26" in the evidence screenshots. This is a pre-existing Phase 3/4 condition caused by the macOS Playwright test runner lacking is-IS ICU data; the code correctly calls `Intl.DateTimeFormat("is-IS")` (scrubber.ts:46). This is not a Phase 7 regression and not a new issue. The freshness date in the info panel (rendered by freshness.ts hand-rolled month array) is immune to the ICU fallback and shows correctly as `20. júlí 2026` in all screenshots.

---

### Pillar 2: Visuals (3/4)

**Passing:**
- Info panel: `Þetta er sögulegt meðaltal, ekki spá.` visually distinct — bold weight at 14px on its own line, clearly more prominent than the body paragraphs below. Confirmed in both desktop and mobile info-panel screenshots.
- Info `(i)` glyph: lowercase i-in-a-circle, 24×24 inline SVG, ink stroke. Positioned top-right in the 56px header band, clear of the wordmark. Visible in all screenshots.
- Bottom sheet at peek: drag handle (centered grabber bar), station name header, first chart peek all visible. Map fills the majority of the viewport above the sheet. Non-modal confirmed — map content visible above.
- Bottom sheet at expanded: Hiti and Vindur charts render with axes, reading keys, date labels. Sheet takes the upper ~80svh of the screen.
- Mobile chips: `Bestu staðir` chip top-left clear of the info button; `Einkunn` chip bottom-left. Consistent glass-pill surface with the rest of the chrome.
- Desktop side panel: right-docked, station name header, Hiti + Vindur charts with reading keys visible. Legend bottom-left. Cohesive as one chrome language.

**WARNING — Attribution at expanded sheet (mobile, evidence `07-03-mobile-390-sheet-expanded.png`):**
The sheet at expanded height (~80svh) causes the MapLibre compact attribution `(i)` control to be positioned above the sheet's top edge, which in the screenshot bleeds into the top 10–15px of the viewport below the header. The attribution text is visible but partially obscured by the sheet's rounded top corner area. The info-panel licensing backstop satisfies the spec's fallback clause, but visually the compact credit is not cleanly above the sheet at expanded — it is adjacent to/behind the sheet header region. The `onSnap` callback does raise `--attrib-safe-bottom` to the full sheet height at expanded, but at that point the MapLibre control is placed at a height that collides with the sheet's own header.

**WARNING — Info panel `Loka` button alignment:**
In both the desktop and mobile info-panel screenshots, `Loka` sits at the left edge of the dialog body. This is not the centered or full-width button treatment that matches the other buttons in the design system. While not a blocker, it creates an inconsistency in the modal that is immediately visible.

---

### Pillar 3: Color (4/4)

**Passing — no violations found:**
- `trust.css`: `rgba(255,255,255,0.92)` + `backdrop-filter: blur(8px)` + `1px var(--hairline)` — identical surface to header/bar/legend/panel. Confirmed in all screenshots.
- Grep-verified absent from `trust.css`: no `--accent`, no `--score-*`, no `--chart-*` token references (the plan's own gate, verified).
- Info button: transparent → `var(--dominant)` hover; `2px solid var(--ink)` focus ring. Never accent. Confirmed in `trust.css` lines 123–129.
- Drag handle grabber: `var(--dominant)` bar with `inset 0 0 0 1px var(--hairline)` — correct token, not accent.
- Chips: `ink/dominant/hairline` only (score.css, verified in code).
- State overlays (`bv-state`): `--ink` heading, `--muted-ink` body, `rgba(255,255,255,0.92)` surface. No accent.
- `::backdrop` on info panel: `rgba(31,41,51,0.18)` (light wash — not a heavy destructive dim).
- Accent red remains reserved to the temperature numeral inside scored marker pills (score.css + tokens.css, unchanged).
- 60/30/10 distribution: dominant (hover/chip fill) used sparingly; secondary (glass surface) on all panels; ink for all text. Coherent across all 7 surfaces introduced this phase.

---

### Pillar 4: Typography (4/4)

**Passing — scale reuse confirmed:**

All Phase 7 text maps onto the established 4-role scale with no new sizes:

| Role | Size/Weight | Phase 7 usage | CSS location |
|------|-------------|----------------|--------------|
| Section title | 14px/600 | Info panel title, trust lead, map-error heading, empty-stations heading, chip labels | trust.css, score.css |
| Body/Label | 14px/400 | Info panel prose (what-it-shows, how-to-read), map-error body, empty-stations body | trust.css |
| Compact value | 13px/600 | (existing — not newly used this phase) | — |
| Muted small | 11px/400 | Attribution block, freshness line, loading `hleð…` | trust.css |

Font stack: `var(--font-stack)` throughout — no new webfont.

**Trust lead prominence confirmed:** `.info-panel__lead` is `font-size:14px; font-weight:600` — Section-title weight for the bold #1 message. Distinguished from body by weight alone (color is not the sole channel; the `Þetta er` sentence starts its own paragraph). Confirmed visually in both info-panel screenshots — the bold sentence is immediately prominent before the two body paragraphs.

**No violations:** no `text-sm`, no `text-lg`, no `font-medium` (no Tailwind — vanilla CSS). No arbitrary `font-size` values outside the token set. `tabular-nums` applied correctly to the score readout and daylight value.

---

### Pillar 5: Spacing (3/4)

**WARNING — Trust lead margin diverges from spec:**
The spec states the trust lead gets `--space-sm` (8px) breathing room above the plain-prose explanation. Implemented: `info-panel__lead { margin: 0 0 var(--space-lg) }` = 24px bottom margin. This is `--space-lg` not `--space-sm`. The visual effect is a substantially larger gap between the bold lead sentence and the "Kortið sýnir..." paragraph than the spec intended. The spec's rhythm is: title `--space-sm` → trust lead `--space-sm` → prose `--space-lg` section breaks. The implementation gives the lead `--space-lg` spacing, which accidentally matches the section-break rhythm of the prose paragraphs, de-emphasizing the trust lead's relationship to the body.

**Location:** `site/src/styles/trust.css` line 163
**Fix:** `margin: 0 0 var(--space-sm)` on `.info-panel__lead`.

**Passing:**
- Info panel internal padding: `var(--space-md)` (16px) — matches spec "matches header/control-bar/legend/panel padding."
- Info button positioning: `top: 6px` places the 44px target centered in the 56px band (6px + 44px + 6px = 56px ✓).
- Sheet peek height: `clamp(96px, 18svh, 140px)` — exactly matches spec `~120px (clamp(96px,18svh,140px))`.
- Sheet expanded height: `clamp(70svh, 80svh, 85svh)` — matches spec `clamp(70svh,80svh,85svh)`.
- Drag handle: `min-height: 44px` confirmed in `panel.css` line 278.
- Chip min-height: `44px` in score.css.
- Info panel close `min-height: 44px; min-width: 44px` — confirmed.
- No arbitrary spacing values (`[Xpx]`) found in Phase 7 CSS files — only token references.
- `--space-xs` / `--space-sm` / `--space-md` / `--space-lg` used in the intended roles across `trust.css`, `panel.css`, `score.css`, `controls.css` mobile overrides.

**Close button alignment (cosmetic spacing issue):**
The `info-panel__close` button uses `display: inline-flex` with no centering wrapper on the dialog. Result: left-alignment. The spec implies a centered or right-aligned placement. This is a spacing/layout issue rather than a true token violation — no wrong spacing token, but the button is not in the visually expected position.

---

### Pillar 6: Experience Design (4/4)

**Loading states — complete:**
- `showLoading()` called in `main.ts` before first `renderForState`; `hideLoading()` after first paint. Confirmed in 07-01-SUMMARY.md + main.ts wiring.
- `hideLoading()` clears ONLY the loading node, leaving any concurrent map-error alert intact. Deliberate design decision logged.
- `aria-live="polite"` on the shared live region for loading + empty; switched to `assertive` for map-error. Confirmed in `states.ts` lines 40/50.

**Error states — complete:**
- `map.on("error")` → `showMapError("Ekki tókst að hlaða kortið", "Reyndu að hlaða síðunni aftur.")` with `role="alert"` on the overlay. Replaces the Phase-3 silent `console.error`. Confirmed in `states.ts` line 67 + `init.ts` wiring.
- Header + info button stay up (the overlay host is `inset: 56px 0 0 0`, clearing the header).
- E2E criterion 14 active and green (route-abort of pmtiles triggers the error state).

**Empty state — complete:**
- `stations.length === 0` (raw JSON length, distinct from `entries.length`) → `showEmptyState(...)`. Confirmed in 07-01-SUMMARY.md.
- Map basemap still renders beneath (basemap and info panel stay functional).
- E2E criteria 13/15 active and green.

**No-data non-regression — confirmed:**
All existing no-data strings (`ófullnægjandi gögn`, `hleð riti…`, `engin gögn…`, `Engin gögn`, `Engin einkunn`) are in the unchanged Phase 5/6 source files. Phase 7 touched only the container geometry (panel → sheet), not the content pipeline. 92 E2E tests passed with zero regressions after Plan 03 merged.

**Keyboard and focus — complete:**
- Info panel: native `<dialog>.showModal()` provides free focus-trap + Escape + backdrop-dismiss. On `close` event: `markDismissed()` + `button.focus()` (focus return to info button). Confirmed `infoPanel.ts` lines 264–273.
- Sheet drag handle: native `<button>` with `onKey` listener in `attachSheet` responding to Enter/Space via `toggleTarget`. Confirmed `bottomSheet.ts` lines 144–149.
- Sheet Escape: `section.addEventListener("keydown")` in `stationPanel.ts` line 603 handles `ev.key === "Escape"` → `close()`.
- Tab focus-trap gated to desktop only (mobile: non-modal sheet must not trap). `stationPanel.ts` line 613: `if (matchMedia(MOBILE_QUERY).matches) return`.
- Chips: native `<button>` elements with `aria-controls` + `aria-expanded` — keyboard-native. Confirmed `rankedList.ts` lines 98–99, `legend.ts` lines 50–51.

**Reduced motion — complete:**
- Sheet snap: `panel.css` `@media (prefers-reduced-motion: reduce) { .station-panel { transition: none } }`. The drag controller restores the CSS transition on release — zeroed by this rule, so snaps are instant.
- Info panel/button: `trust.css` lines 224–230 `transition: none; animation: none`.
- Loading state: static text, no animation in `trust.css`.

**First-visit auto-open permalink guard — correct:**
`location.search.length > 1` check before auto-open suppresses the modal on any shared/restored URL. Confirmed `infoPanel.ts` line 282.

**`setFreshness` idempotent rebuild:**
`date === currentFreshness` early return prevents needless dialog rebuilds. Confirmed `infoPanel.ts` line 295. The `wasOpen` check at line 298 preserves an open panel across a freshness update — rare but correct.

---

## Overall Cohesion Assessment

Phase 7 delivers the intended final UI harmonization. The seven surfaces introduced (info button, info dialog, loading overlay, map-error overlay, empty overlay, bottom sheet, mobile chips) all read as one consistent design language — the same glass surface (`rgba(255,255,255,0.92)` + blur(8px) + hairline border), ink/muted-ink type roles, and 2px-ink focus rings that Phase 3–6 established. No new token was introduced.

**What coheres well:**
- The info button top-right is visually distinct without competing with the wordmark or the chips.
- The non-modal bottom sheet (map pannable above it) is the correct design decision: it matches Google Maps UX conventions and the spec's explicit contract. The peek height (~18svh) leaves enough of the map visible to feel spatially grounded.
- The mobile chip placement (Bestu staðir top-left, Einkunn bottom-left) avoids the top-right info button and the bottom control bar. The overlay/popover positioning for each chip is clean.
- The attribution `--attrib-safe-bottom` single-rule solution genuinely removes the fragile per-surface hacks and is maintainable for future bottom-chrome additions.
- The trust panel copy — especially `Þetta er sögulegt meðaltal, ekki spá.` as a visually bold, own-paragraph line — does what the spec intended: it is the first substantial text in the modal and it is unmissable.

**What still needs polish (nice-to-have, no Phase 8 UI catch-all):**
- Trust lead margin: 24px gap after the bold lead reads as a section break rather than proximity-to-explanation. Tightening to 8px (`--space-sm`) would reinforce that the lead IS a lead for the paragraph below it, not a standalone section heading.
- `Loka` button left-alignment in the info dialog is a minor layout artifact — centering it would match the visual center-of-card expectation.
- Attribution at expanded sheet: technically acceptable under the spec's info-panel backstop clause, but the compact `(i)` disappearing behind the sheet at expanded is a minor affordance gap — a user who wants to verify attribution via the map's own control cannot at that moment without closing/collapsing the sheet. Non-blocking.

**Ship-blocking vs nice-to-have split:**

| Issue | Classification | Rationale |
|-------|----------------|-----------|
| Attribution hidden behind sheet at expanded | NICE-TO-HAVE | Spec's licensing backstop clause (info-panel credit always reachable) explicitly covers this; the E2E criterion 11 passes |
| Trust lead margin --space-lg instead of --space-sm | NICE-TO-HAVE | Visually reads as large but does not prevent reading the lead; not a functional or accessibility gap |
| Loka button left-alignment in info dialog | NICE-TO-HAVE | Layout polish only; button is present, labeled, ≥44px, keyboard operable |
| Pre-existing scrubber en-US date on macOS test runner | NOT PHASE 7 | Code uses is-IS correctly; ICU data absent in headless macOS runtime is pre-existing Phase 3 condition |

No BLOCKER-level findings. Phase 7 E2E gate has already passed (92 tests, 0 failures). All three nice-to-haves are one-line CSS fixes that can be bundled with Phase 8 cleanup without a dedicated UI phase.

---

## Registry Safety

Registry audit: No third-party registries used. shadcn not initialized. No new runtime npm dependencies introduced. No registry vetting required.

---

## Files Audited

**Phase 7 source files:**
- `site/src/ui/infoPanel.ts` — info button + native dialog + first-visit logic
- `site/src/ui/bottomSheet.ts` — snapNearest, toggleTarget, attachSheet drag controller
- `site/src/ui/stationPanel.ts` — sheet wiring, handle, attribution safe-zone raise/reset
- `site/src/ui/states.ts` — loading/error/empty overlay renderers + aria-live
- `site/src/ui/rankedList.ts` — mobile chip + setYielded
- `site/src/ui/legend.ts` — Einkunn chip + popover
- `site/src/styles/trust.css` — overlay family, info button, info dialog, --attrib-safe-bottom
- `site/src/styles/panel.css` — bottom-sheet CSS geometry, drag handle, reduced-motion
- `site/src/styles/controls.css` — mobile reflow guards, --attrib-safe-bottom margin rule
- `site/src/styles/score.css` — chip chrome, mobile chip/overlay geometry

**Evidence screenshots reviewed:**
- `evidence/07-02-info-panel-desktop-1280.png` — info panel open, desktop
- `evidence/07-02-info-panel-mobile-390.png` — info panel open, mobile
- `evidence/07-03-desktop-1280-side-panel.png` — station panel open, desktop
- `evidence/07-03-mobile-390-sheet-peek.png` — bottom sheet at peek, mobile
- `evidence/07-03-mobile-390-sheet-expanded.png` — bottom sheet at expanded, mobile
- `evidence/07-03-mobile-390-chips.png` — chips closed state, mobile
- `evidence/07-03-mobile-390-chips-open.png` — both chip overlays open, mobile

**SUMMARIES reviewed:** 07-01, 07-02, 07-03
**Spec reviewed:** 07-UI-SPEC.md (full)
