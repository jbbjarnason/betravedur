# Phase 5 — Deferred Items (out-of-scope discoveries)

Logged during execution per the SCOPE BOUNDARY rule. These are NOT caused by Phase 5
plan 05-01 changes — they pre-exist on the clean HEAD (`8bc7477`) and were confirmed by
running `npx tsc --noEmit -p site` after `git stash` (all still present with zero Phase 5
changes applied). Do NOT fix them under 05-01; they belong to a follow-up cleanup or the
plan/task that owns those files.

## Pre-existing `tsc --noEmit -p site` errors (unrelated to score field) — RESOLVED

**Status: RESOLVED** in the consolidated Phase-5 review-fix pass (commit `0bfa3f8`). All four
errors are cleared with no tsconfig weakening and no `@ts-ignore`; `npx tsc --noEmit -p site`
now exits with 0 errors, restoring a clean typecheck gate for Phase 6+.

| File | Location | Error | Resolution |
|------|----------|-------|------------|
| `site/src/state/recompute.test.ts` | 94,12 / 95,12 / 96,12 / 96,44 / 99,12 | TS2532 Object is possibly 'undefined' | Guarded array-index accesses (`expect(...).toBeDefined()` + `!`) |
| `site/src/state/recompute.test.ts` | 123,28 / 127,29 | TS7006 Parameter 'd' implicitly has an 'any' type | Annotated `.find(d: MarkerDatum => …)` + typed `out` |
| `site/src/state/store.test.ts` | 38,18 | TS2532 Object is possibly 'undefined' | Guarded `mock.calls[0]` before reading arg 0 |
| `site/src/state/url.ts` | 66,7 | TS2322 Type '7 \| 14 \| 21 \| 30' is not assignable to type '7' | Typed `best` as the `AllowedWidth` union, not the literal `7` |

Notes:
- These were all test-file strictness gaps EXCEPT `url.ts:66`, which was a source-file
  narrowing issue in the width-snapping helper (`ALLOWED_WIDTHS[0]` inferred as the literal
  `7` instead of the union). None affected runtime behaviour and none were on the score path.
- The pre-existing debt is now cleared so the Phase-5 verification's clean-`tsc -p site` goal
  holds and Phase 6+ inherits a green typecheck gate.
