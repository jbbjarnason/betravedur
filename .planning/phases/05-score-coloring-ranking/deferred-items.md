# Phase 5 — Deferred Items (out-of-scope discoveries)

Logged during execution per the SCOPE BOUNDARY rule. These are NOT caused by Phase 5
plan 05-01 changes — they pre-exist on the clean HEAD (`8bc7477`) and were confirmed by
running `npx tsc --noEmit -p site` after `git stash` (all still present with zero Phase 5
changes applied). Do NOT fix them under 05-01; they belong to a follow-up cleanup or the
plan/task that owns those files.

## Pre-existing `tsc --noEmit -p site` errors (unrelated to score field)

| File | Location | Error |
|------|----------|-------|
| `site/src/state/recompute.test.ts` | 94,12 / 95,12 / 96,12 / 96,44 / 99,12 | TS2532 Object is possibly 'undefined' |
| `site/src/state/recompute.test.ts` | 123,28 / 127,29 | TS7006 Parameter 'd' implicitly has an 'any' type |
| `site/src/state/store.test.ts` | 38,18 | TS2532 Object is possibly 'undefined' |
| `site/src/state/url.ts` | 66,7 | TS2322 Type '7 \| 14 \| 21 \| 30' is not assignable to type '7' |

Notes:
- These are all test-file strictness gaps EXCEPT `url.ts:66`, which is a source-file
  narrowing issue in the width-snapping helper (`ALLOWED_WIDTHS[0]` inferred as the literal
  `7` instead of the union). None affect runtime behaviour and none are on the score path.
- The Phase-5 verification asked for a clean `tsc -p site`; because the baseline was already
  non-clean, 05-01 leaves the count exactly as it found it (introduced zero new tsc errors —
  the one new error from adding required `MarkerDatum.score`/`missingRain` fields was fixed in
  `markers.test.ts`).
