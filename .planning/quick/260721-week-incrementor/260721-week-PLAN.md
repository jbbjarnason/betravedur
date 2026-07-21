---
quick_id: 260721-week
slug: week-incrementor
title: Add a week incrementor to the scrubber (+ fix English date fallback)
mode: quick
created: 2026-07-21
---

# Quick Task 260721-week — week incrementor

User: "week incrementor is still missing." The scrubber had only a drag slider on desktop; the
only ± control was a narrow-screen-only `‹ [date] ›` stepper that stepped **±1 day** (hidden
keyboard PageUp/Down did ±7 but nothing visible). No visible way to step week-by-week.

## Changes

- `site/src/ui/scrubber.ts`:
  - Replaced the narrow-only ±1-day stepper with **‹ / › week buttons (±7 days)** that flank the
    slider on desktop (`.scrubber__control` row: `[‹] [range] [›]`) and stand in for the track when
    it collapses on narrow screens. aria-labels "Fyrri vika" / "Næsta vika". Kept the
    `scrubber__step` class the E2E targets. Fine ±1-day control stays on the slider (ArrowLeft/Right
    / drag); PageUp/Down still ±7.
  - **Icelandic date fix** (surfaced while verifying): `doyLabel` used
    `Intl.DateTimeFormat("is-IS")`, which fell back to English + en-US order ("July 21") on a
    runtime without full is-IS ICU. Hand-rolled `MONTHS_FULL` (mirrors the codebase's `formatIce`
    number pattern) so the readout is always Icelandic ("21. júlí"). Icelandic-only UI constraint.
- `site/src/styles/controls.css`: `.scrubber__control` flex row; range `flex:1 1 auto`; narrow
  media query centres the two week buttons with the track hidden (removed the old `.scrubber__stepper`).

## Verification

- Browser: 2 buttons "Fyrri vika"/"Næsta vika" flank the slider (desktop) + remain on narrow;
  `›` steps 202→209 (Δ7 = one week); readout "21. júlí–27. júlí" → "28. júlí–3. ágúst" (Icelandic).
- Unit: scrubber 6 green (doyLabel/windowLabel unchanged outputs); tsc 0.
- Full Playwright E2E: 91 passed / 0 failed (incl. selection crit 16 — the `.scrubber__step`
  stepper still drives `anchorDoy`).
