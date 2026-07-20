---
phase: 04-selection-instant-recompute
plan: 01
subsystem: ui
tags: [state, observable-store, url-state-seam, recompute, climatology, vitest, vanilla-ts]

# Dependency graph
requires:
  - phase: 03-map-markers
    provides: computeMarkerDatum producer, installMarkerLayer/attachCompositeRenderer idempotent renderer, boot fetch-once path in main.ts
  - phase: 01-foundation
    provides: "@betravedur/domain expandWindow/groupBySeasonYear/effectiveN, leap-fold + season-year contracts"
provides:
  - Observable SelectionState store (createStore — frozen snapshot, no-op-skip, subscribe/unsubscribe, zero deps)
  - anchorToWindow(anchorDoy,widthDays) → wrap-aware WindowSpec (anchor = window start)
  - computeMarkerDatum yearRange param (honest N-in-range, SEL-02/03)
  - buildStationCache + recompute over boot-cached DerivedFiles (no fetch, SEL-04)
  - window.__store exposed for deterministic E2E driving
affects: [selector-ui (Plan 02), url-state (Plan 03), score-palette (Phase 5), chart-panel (Phase 6)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Vanilla observable store: Object.freeze snapshot + Set<Listener> + no-op-skip (zero new deps)"
    - "anchor+width → WindowSpec at the recompute boundary; year range is a SEPARATE producer param (never folded into WindowSpec)"
    - "Fetch-once-at-boot → station→{meta,file} cache → pure recompute over cache (no network on selection change)"
    - "window.__store mirrors window.__map for E2E state driving"

key-files:
  created:
    - site/src/state/store.ts
    - site/src/state/store.test.ts
    - site/src/data/window.ts
    - site/src/data/window.test.ts
    - site/src/state/recompute.ts
    - site/src/state/recompute.test.ts
  modified:
    - site/src/data/averages.ts
    - site/src/data/averages.test.ts
    - site/src/main.ts

key-decisions:
  - "Anchor = window START (Open Question 1 / RESEARCH A1), centralized in anchorToWindow so flipping to centre later is a one-function change"
  - "yearRange filters season-year Map keys BEFORE qualifyingYears/effectiveN — so effectiveN reports honest qualifying-years-in-range, never picker span (SEL-03)"
  - "mutedDatum is a single source of truth exported from recompute.ts; main.ts imports it rather than keeping its own copy"
  - "120ms trailing debounce on the recompute subscriber only (not the URL write — Plan 03's concern)"
  - "Temporary bootstrap default (DEFAULT_WINDOW summer week, yearFrom:1/yearTil:9999 placeholder) left with a '// Plan 03 owns default selection + URL' marker"

patterns-established:
  - "Store: frozen-snapshot observable with structural no-op-skip; subscribers are the only readers, set() is the only writer"
  - "Recompute purity: the module imports no loader and never calls fetch/loadDerived — the cache is its only data source"

requirements-completed: [SEL-01, SEL-02, SEL-03, SEL-04]

# Metrics
duration: 4 min
completed: 2026-07-20
---

# Phase 4 Plan 01: Selection-State Foundation & Instant Recompute Summary

**Vanilla observable SelectionState store + wrap-aware anchorToWindow + a yearRange param on computeMarkerDatum (honest N-in-range) + a boot-time station→DerivedFile cache so a store change re-renders every marker over already-loaded data with ZERO network fetch, driven via window.__store.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-07-20T10:02:00Z
- **Completed:** 2026-07-20T10:06:24Z
- **Tasks:** 3 (all TDD)
- **Files modified:** 9 (6 created, 3 modified)

## Accomplishments

- **Observable store (SEL-01 infra):** `createStore` — a ~90-line zero-dependency store returning `get/subscribe/set`. Frozen snapshots (`Object.freeze`), notify-once-per-real-change, no-op skip (a `set` that changes nothing does not notify — the scrubber same-tick guard), and an unsubscribe closure.
- **anchorToWindow (SEL-01):** pure `anchorDoy + widthDays → WindowSpec{startDoy,endDoy}`, anchor = window start, wrap-aware (late-Dec anchor produces `endDoy < startDoy`, the domain's legal wrap). Proven against `expandWindow` (a width-w window covers exactly w doys, wrap included).
- **yearRange param (SEL-02/03):** `computeMarkerDatum` gains an optional 4th `yearRange` arg that filters the season-year Map keys BEFORE `qualifyingYears`/`effectiveN`, so `n` (the "meðaltal N ára" label) reports the honest qualifying-years-in-range — proven N ≠ span (AWS #1350 2010–2026 → n=15, span=17). The 3-arg path is byte-identical to Phase 3.
- **Boot-cache recompute (SEL-04 — the core):** `buildStationCache` + `recompute` re-run the pure producer over the already-loaded files. `main.ts` now fetches every station's derived file ONCE at boot into the cache, then a debounced (120ms) store subscriber re-renders markers with NO derived-file fetch. A corrupt file degrades to a muted datum without sinking the map.
- **window.__store** exposed alongside `window.__map` for deterministic E2E selection driving.

## Task Commits

Each task committed atomically:

1. **Task 1: Observable store + anchorToWindow (SEL-01)** — `f15847b` (feat)
2. **Task 2: yearRange param on computeMarkerDatum (SEL-02/03)** — `892214d` (feat)
3. **Task 3: Boot-cache recompute + window.__store wiring (SEL-04)** — `7dec870` (feat)

_TDD tasks: tests and implementation were authored and committed together per task (RED→GREEN collapsed into one atomic `feat` commit for each `type="auto" tdd="true"` task; every task's tests were run and pass before its commit)._

## Files Created/Modified

- `site/src/state/store.ts` — SelectionState type + createStore observable (frozen snapshot, no-op-skip, subscribe/unsubscribe)
- `site/src/state/store.test.ts` — notify/no-op/unsubscribe/frozen behaviour
- `site/src/data/window.ts` — anchorToWindow (anchor=start, wrap-aware), pure
- `site/src/data/window.test.ts` — SEL-01: wrap cases + expandWindow-size property
- `site/src/state/recompute.ts` — buildStationCache + recompute (no fetch) + mutedDatum SSOT
- `site/src/state/recompute.test.ts` — SEL-04: cache build, recompute-over-cache, corrupt-file→muted
- `site/src/data/averages.ts` — added optional `yearRange` param + `YearRange` interface; filters byYear keys before the qualifying-years gate
- `site/src/data/averages.test.ts` — SEL-02/03: honest N≠span, insufficient-in-range, 3-arg identity, out-of-range
- `site/src/main.ts` — fetch-once boot cache, store creation with temporary bootstrap default, debounced store-driven recompute, window.__store

## Decisions Made

- **Anchor = window start** (RESEARCH A1 / Open Question 1), documented and centralized in `anchorToWindow`.
- **yearRange at the producer, filtering Map keys before the gate** (RESEARCH Pattern 4 Option A) — keeps `computeMarkerDatum` the single choke point and makes `effectiveN` honest-N-in-range for free.
- **mutedDatum exported from recompute.ts as the single source of truth** — `main.ts` imports it so the boot-time and recompute-time muted fallbacks never drift.
- **Debounce the recompute only (120ms trailing)** — the URL write is Plan 03's concern and must stay immediate.
- **Temporary bootstrap default left with a `// Plan 03 owns default selection + URL` marker** — `yearFrom:1/yearTil:9999` is a deliberate placeholder full range.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0
**Impact on plan:** None. All three tasks implemented as specified; every acceptance criterion satisfied (see note below on one grep's literal count).

## Issues Encountered

- **Acceptance-criterion grep literal count (Task 3):** The plan's criterion `grep -vE '^\s*(//|\*)' site/src/main.ts | grep -c "loadDerived" | grep -qx 1` expects a count of exactly 1, but the count is 2 because BOTH the `import { … loadDerived … }` statement AND the single boot-fetch call name `loadDerived`. The criterion's stated INTENT ("loadDerived appears exactly once — the boot fetch, NOT in the recompute subscriber") is fully met: `grep -c "await loadDerived"` = 1 (the boot fetch), and `recompute.ts` imports no loader and contains zero `fetch(`/`loadDerived(` calls (its only "loadDerived"/"fetch" string matches are in comments). The no-fetch-on-selection-change guarantee (SEL-04, RESEARCH Pitfall 2) is structurally satisfied; the discrepancy is a grep-vs-import artifact, not a code issue.

## Known Stubs

| Stub | File / Line | Reason |
|------|-------------|--------|
| `yearFrom: 1, yearTil: 9999` placeholder full range | site/src/main.ts (boot `initial`) | Temporary bootstrap default. **Plan 03** replaces it with data-derived manifest year bounds + today's-week / last-10-years default + URL hydration. Marked in-code with `// Plan 03 owns default selection + URL`. Intentional and plan-sanctioned — does not block this plan's goal (the store + recompute path + no-fetch proof all work with the placeholder). |

## Verification Evidence

- `npx vitest run site/src/state/ site/src/data/window.test.ts site/src/data/averages.test.ts` → **27 passed** (4 files).
- `npm run build -w site` → **succeeds** (strict TS; the pre-existing MapLibre chunk-size warning is unrelated and out of scope).
- `npm test` (full repo) → **210 passed | 3 skipped**, no regressions.
- No-fetch proof: `recompute.ts` imports no loader; `grep -c "fetch("` = 0; `grep -c "await loadDerived" site/src/main.ts` = 1 (boot only).
- `grep -q "Object.freeze" store.ts`, `grep -q "endDoy -= 365" window.ts`, `grep -q "yearRange" averages.ts`, `grep -q "__store"`/`"store.subscribe"`/`"setTimeout"`/`"120"` main.ts — all PASS.

## Next Phase Readiness

- **Ready for Plan 04-02 (selector UI):** the store + `anchorToWindow` + `recompute` are the write-target and recompute engine the scrubber/width-buttons/year-dropdowns wire into.
- **Ready for Plan 04-03 (URL state):** the store's write-via-`set` / read-via-`subscribe` asymmetry is in place; Plan 03 adds `stateToParams`/`paramsToState`, the `replaceState`/`pushState` writer, `popstate` reader, and replaces the temporary bootstrap default with the data-derived default + URL hydration.
- No blockers. Zero new dependencies added (STACK zero-dep discipline preserved).

## Self-Check: PASSED

- All 6 created files exist on disk (store.ts/.test.ts, window.ts/.test.ts, recompute.ts/.test.ts).
- All 3 task commits present: `f15847b`, `892214d`, `7dec870`.
- Full phase-4 unit suite (27 tests) + full repo suite (210 pass / 3 skip) green; `npm run build -w site` succeeds.
- No stray untracked files; no unexpected deletions.

---
*Phase: 04-selection-instant-recompute*
*Completed: 2026-07-20*
