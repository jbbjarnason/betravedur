---
phase: 01-data-access-domain-core
plan: 03
subsystem: data-access
tags: [fetch, api-vedur, schema-validation, normalization, clamping, registry, attribution, cc-by-4.0, vitest, tdd]

requires:
  - phase: 01-01
    provides: "@betravedur/fetch skeleton (client/observations/stations) + @betravedur/domain contracts (DailyObservation, StationMeta) and attribution stub"
  - phase: 01-02
    provides: "leapFoldedDoy (real, no longer a throwing stub) used by the normalizer for doy population"
provides:
  - "Hardened observation fetchers: parseObservationBody/normalizeObservations/assertObservationSchema with SCHEMA_DRIFT guard, error-body detection, leap-folded doy (Feb 29 dropped), and value clamping"
  - "No-splice station registry: buildRegistry (keyed on integer ID, decommissioned retained, no collision-merge) + serializeRegistry + writeRegistry pipeline helper + shared toStationMeta mapper"
  - "ATTRIBUTION constant with verified CC BY 4.0 wording (is/en text, sourceUrl, modified-data clause) consumable by the browser UI"
  - "Committed live-captured fixtures (aws-day, synop-day, stations, error-404, error-422) making the fetch suite offline/deterministic"
affects:
  - "Plan 01-04 (score component curves consume normalized DailyObservation + ATTRIBUTION)"
  - "Phase 2 pipeline (fetch/normalize/registry are the data-access half; writeRegistry emits the committed stations.json)"
  - "Phase 3+ browser UI (ATTRIBUTION rendered for UX-04)"

tech-stack:
  added: []
  patterns:
    - "Trust-boundary parse pipeline: error-body detection -> schema-assert (SCHEMA_DRIFT) -> normalize -> range-clamp, all before domain math"
    - "Range clamping nulls implausible values (temp [-60,45], wind [0,120], dir [0,360), precip >=0) — missing != zero preserved"
    - "Registry keyed strictly on integer station ID; no name/location merge; decommissioned retained"
    - "Offline fixture-driven fetch tests captured verbatim from the live API for deterministic CI"
    - "TDD RED->GREEN per task with named -t selectors (parse observations / registry no splice / attribution)"

key-files:
  created:
    - "packages/fetch/src/registry.ts"
    - "packages/fetch/test/observations.test.ts"
    - "packages/fetch/test/registry.test.ts"
    - "packages/domain/test/attribution.test.ts"
    - "packages/fetch/test/fixtures/aws-day.json"
    - "packages/fetch/test/fixtures/synop-day.json"
    - "packages/fetch/test/fixtures/stations.json"
    - "packages/fetch/test/fixtures/error-404.json"
    - "packages/fetch/test/fixtures/error-422.json"
  modified:
    - "packages/fetch/src/observations.ts"
    - "packages/fetch/src/stations.ts"
    - "packages/fetch/src/index.ts"
    - "packages/domain/src/attribution.ts"

key-decisions:
  - "assertObservationSchema uses a minimum expected field set per endpoint (AWS: station,time,t,f,dv,r; SYNOP: station,time,t,f,r) and throws SCHEMA_DRIFT on the first missing key"
  - "404-style {message} bodies parse to [] (legitimate empty result); 422-style {detail} bodies throw (real client error)"
  - "x-vi-api-version drift only warns (never throws) — SCHEMA_DRIFT field guards are the real defense"
  - "buildRegistry uses last-write-wins on a duplicate ID rather than blending two records (no fabricated splice)"
  - "text_is leads with the nominative 'Uppruni gagna: Veðurstofa Íslands' so the credited entity name is exact per the CC BY licence"

patterns-established:
  - "Untrusted-JSON parse pipeline (detect error -> assert schema -> normalize -> clamp) at the api.vedur.is trust boundary"
  - "Live-captured, pretty-printed JSON fixtures committed under packages/*/test/fixtures for offline determinism"

requirements-completed: [DATA-01, DATA-06, DATA-08]

duration: 12min
completed: 2026-07-19
---

# Phase 1 Plan 03: Data-Access Hardening Summary

**Production-hardened the api.vedur.is trust boundary: schema-asserted (SCHEMA_DRIFT) and range-clamped AWS/SYNOP observation normalization against committed live fixtures, a no-splice integer-keyed station registry that retains decommissioned stations and keeps Keflavík 990 vs 1350 distinct, and a UI-consumable CC BY 4.0 attribution constant.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-19T19:13:00Z
- **Completed:** 2026-07-19T19:20:00Z
- **Tasks:** 2 (plus self-verified npm-legitimacy checkpoint)
- **Files modified/created:** 13

## Accomplishments

- **Trust-boundary parse pipeline** — `parseObservationBody` detects API error envelopes ({message} 404 -> `[]`, {detail} 422 -> throw), `assertObservationSchema` verifies the expected field set and throws `SCHEMA_DRIFT` on drift, then `normalizeObservations` maps `time->date`, sets a leap-folded `doy` (dropping Feb 29), enforces the structural AWS `r=null` / SYNOP `dv=null` split, and range-clamps implausible temp/wind/dir/precip to null before domain math ever sees them.
- **No-splice station registry** — `buildRegistry` keys strictly on integer station ID; Keflavík synop 990 and AWS 1350 stay two distinct records; decommissioned stations (`ending != null`, e.g. Reykjavík-S 4 ending 2024) are retained; `serializeRegistry`/`writeRegistry` emit the deterministic ID-sorted `stations.json` artifact.
- **CC BY 4.0 attribution** — filled `ATTRIBUTION` from the live-verified `athuganir.vedur.is/disclaimer` wording (is/en credit, sourceUrl, and the exact modified-data clause required because Betra Veður aggregates the raw observations).
- **Deterministic offline suite** — five fixtures captured verbatim from the running API; full suite 54 passing / 3 live-gated skipped, both domain and fetch packages typecheck clean, domain stays zero-dependency.

## Task Commits

Executed atomically (TDD RED -> GREEN per task):

1. **Task 1 RED — capture fixtures + failing observation tests** - `b3d3d06` (test)
2. **Task 1 GREEN — schema-assert + normalize + clamp** - `b72c894` (feat)
3. **Task 2 RED — failing registry + attribution tests** - `5f16ee7` (test)
4. **Task 2 GREEN — no-splice registry + CC BY 4.0 attribution** - `5fecdc1` (feat)

_Task 0 (npm-legitimacy checkpoint) was self-verified per the STATE.md no-human-review directive — see Checkpoint Evidence; no code commit._

## Files Created/Modified

- `packages/fetch/src/observations.ts` - Hardened: error-body detection, `assertObservationSchema` (SCHEMA_DRIFT), leap-folded doy normalization, range clamping, `x-vi-api-version` warn; dropped the Plan-01 `safeDoy` shim.
- `packages/fetch/src/registry.ts` (new) - `buildRegistry` (no-splice, ID-keyed) + `serializeRegistry`.
- `packages/fetch/src/stations.ts` - Shared `toStationMeta` mapper (coerces `ending` to number|null), robust field coercion, `writeRegistry` pipeline helper.
- `packages/fetch/src/index.ts` - Export the new registry/normalize/schema surface.
- `packages/domain/src/attribution.ts` - Filled `ATTRIBUTION` (CC BY 4.0, is/en, sourceUrl, modified-data clause) + `Attribution` interface.
- `packages/fetch/test/observations.test.ts` (new) - 12 tests: AWS/SYNOP null split, doy, Feb-29 drop, 404/422 bodies, clamping, schema drift.
- `packages/fetch/test/registry.test.ts` (new) - no-splice, decommissioned retention, keying, dup-ID, serialization.
- `packages/domain/test/attribution.test.ts` (new) - license/is/en/sourceUrl/modified-clause/no-stub.
- `packages/fetch/test/fixtures/*.json` (new x5) - live-captured aws-day, synop-day, stations, error-404, error-422.

## Decisions Made

- Minimum-field-set schema assertion per endpoint kind, failing loudly on the first missing key rather than attempting partial recovery.
- 404 `{message}` = empty result (`[]`); 422 `{detail}` = thrown error — distinguishes "no data" from "bad request".
- `x-vi-api-version` mismatch warns only; the field-set `SCHEMA_DRIFT` guard is the real correctness defense.
- `buildRegistry` last-write-wins on duplicate IDs (never blends two places into a spliced record).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Icelandic attribution text failed the nominative-name assertion**
- **Found during:** Task 2 (attribution GREEN)
- **Issue:** Initial `text_is` used the grammatically-correct dative "frá Veðurstofu Íslands", but the test (and the CC BY requirement to name the source exactly) expects the nominative institution name "Veðurstofa Íslands".
- **Fix:** Rephrased to lead with "Uppruni gagna: Veðurstofa Íslands." — exact source name plus the licence statement; still faithful to the disclaimer wording.
- **Files modified:** `packages/domain/src/attribution.ts`
- **Verification:** `npx vitest run packages/domain -t "attribution"` — 6/6 pass.
- **Committed in:** `5fecdc1` (Task 2 GREEN commit)

**2. [Rule 3 - Blocking] Dropped the Plan-01 `safeDoy` shim**
- **Found during:** Task 1 (observations GREEN)
- **Issue:** Plan-01 added `safeDoy` to tolerate `leapFoldedDoy` throwing `NOT_IMPLEMENTED`. That stub is now real (Plan 02), and the hardened normalizer must actually drop Feb-29 rows (doy=null), which the `?? 0` fallback would have masked.
- **Fix:** Removed `safeDoy`; the normalizer calls `leapFoldedDoy` directly and drops rows where it returns null.
- **Files modified:** `packages/fetch/src/observations.ts`
- **Verification:** Feb-29-drop test passes; full suite green.
- **Committed in:** `b72c894` (Task 1 GREEN commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking cleanup)
**Impact on plan:** Both necessary for correctness; no scope creep. All plan-specified behavior and acceptance criteria delivered.

## Additions Beyond Plan File List

- **stations.json fixture includes a decommissioned station (Reykjavík-S 4, ending 2024)** — the plan's captured set (990/1350/1) had no `ending != null` station, but the acceptance criteria require asserting decommissioned retention. Added station 4 (live-fetched) to make the invariant testable.

## Issues Encountered

- The `?lng=en` disclaimer URL serves the Icelandic terms body (site does not localize the disclaimer). Composed a faithful English CC BY 4.0 credit for `text_en` rather than scraping non-existent English source text; the licence identity (CC BY 4.0) and source URL are authoritative.

## Checkpoint Evidence

**Checkpoint (Task 0):** `checkpoint:human-verify` npm-package legitimacy gate — self-performed thoroughly per STATE.md no-human-review directive and the execution override. Auto-approved after the checks below (all four are first-party reference tooling; no anomalies).

**Commands run and results (2026-07-19):**

| Package | `npm view version` / dist-tag latest | Maintainers / publisher | `repository.url` | `scripts` (postinstall?) | Weekly downloads (npm API) | Lockfile resolved |
|---------|--------------------------------------|-------------------------|------------------|--------------------------|----------------------------|-------------------|
| typescript | 7.0.2 (= latest) | microsoft1es, typescript-bot, jakebailey, andrewbranch … (Microsoft) | github.com/microsoft/TypeScript | none | 219,954,956 | 7.0.2 from registry.npmjs.org |
| vitest | 4.1.10 (= latest) | antfu, yyx990803, ariperkkio, hiogawa (vitest-dev) | github.com/vitest-dev/vitest | only `dev`/`build` — **no postinstall** | 73,115,576 | 4.1.10 from registry.npmjs.org |
| @vitest/coverage-v8 | 4.1.10 (= latest) | (same vitest-dev org) | github.com/vitest-dev/vitest | only `dev`/`build` — **no postinstall** | 28,205,388 | 4.1.10 from registry.npmjs.org |
| tsx | 4.23.1 (= latest) | hirokiosame (privatenumber) | github.com/privatenumber/tsx | none | 73,163,615 | 4.23.1 from registry.npmjs.org |

- **postinstall audit:** `node -e` over each installed `node_modules/<pkg>/package.json` confirmed `has postinstall: false` for all four. The override's "note vitest legitimately has a postinstall?" prompt was investigated: vitest and @vitest/coverage-v8 declare only `dev` and `build` scripts (rollup) — there is NO postinstall script.
- **version match:** All installed + lockfile versions equal the RESEARCH pins (typescript 7.0.2, vitest 4.1.10, @vitest/coverage-v8 4.1.10, tsx 4.23.1) and each is the registry `latest` dist-tag.
- **typosquat check:** exact canonical names, canonical GitHub orgs (microsoft/TypeScript, vitest-dev/vitest, privatenumber/tsx), all resolving from registry.npmjs.org — no proximate variant.

**Verdict:** APPROVED. All four packages are legitimate first-party reference tooling with hundreds of millions (typescript/tsx/vitest) / tens of millions (@vitest/coverage-v8) of weekly downloads, canonical publishers/repos, correct pinned versions, and no install-time scripts. Nothing looked off; no STOP condition.

## Verification Results

- Full offline suite: **9 files, 54 passed / 3 skipped** (`npx vitest run`, exit 0). Skipped = the BETRA_LIVE-gated e2e live checks.
- Named selectors: `parse observations` (12), `registry no splice` (5), `attribution` (6) — all pass.
- Acceptance greps: `"r": null` present in aws-day.json; synop-day.json lacks `dv`; `SCHEMA_DRIFT`/`assertObservationSchema` + `leapFoldedDoy` present in observations.ts; `CC BY 4.0` present and no `NOT_IMPLEMENTED` in attribution.ts.
- Registry: 990 and 1350 distinct; decommissioned station 4 retained.
- `tsc --noEmit` clean for both `packages/domain` and `packages/fetch`; `@betravedur/domain` remains zero-dependency.

## Known Stubs

None introduced. Remaining `@betravedur/domain` stubs are out of scope and scheduled: `score.ts` (tempComponent/rainComponent/windComponent/combine → Plan 01-04). The attribution stub this plan owned is now filled.

## Threat Flags

None. Surface exactly matches the plan's `<threat_model>`:
- **T-01-09** (schema drift): `assertObservationSchema` throws `SCHEMA_DRIFT`; `x-vi-api-version` warn.
- **T-01-10** (malformed values): range clamps + Feb-29 drop before domain math.
- **T-01-11** (ID splicing): registry keyed on integer ID, 990/1350 distinct, decommissioned retained.
- **T-01-12** (info disclosure): fixtures contain only public open data; no credentials committed (keyless API).
- **T-01-SC** (npm supply chain): self-verified legitimacy checkpoint above.

No new network endpoints, auth paths, file access, or schema changes beyond the documented api.vedur.is client.

## Next Phase Readiness

- Data-access half of Phase 1 complete: fetch/normalize/registry are production-hardened and offline-testable; `writeRegistry` is ready for the Phase 2 pipeline to emit committed `stations.json`.
- Plan 01-04 (score component curves + combine) is the remaining Phase 1 plan; it consumes the normalized `DailyObservation` and `ATTRIBUTION` this plan provides.
- Carried-forward gate (unchanged): Veðurstofan redistribution terms confirmation before public deploy — the CC BY 4.0 licence identity + attribution wording is now recorded, but the STATE.md deploy gate remains.

## Self-Check: PASSED

All 12 claimed created/modified files exist on disk; all four task commits (`b3d3d06`, `b72c894`, `5f16ee7`, `5fecdc1`) exist in git history.

---
*Phase: 01-data-access-domain-core*
*Completed: 2026-07-19*
