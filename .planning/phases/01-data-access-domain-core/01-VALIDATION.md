---
phase: 1
slug: data-access-domain-core
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-19
updated: 2026-07-19
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.10 (+ @vitest/coverage-v8 4.1.10) |
| **Config file** | `vitest.config.ts` (root) — created in Plan 01 Task 1 |
| **Quick run command** | `npx vitest run --changed` |
| **Full suite command** | `npx vitest run` |
| **Coverage command** | `npx vitest run --coverage` |
| **Estimated runtime** | ~10 seconds (pure math + offline fixtures) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --changed`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green (incl. the named 350/10 test)
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| P01-T1 | 01-01 | 1 | DATA-01 (infra) | T-01-02, T-01-SC | Pinned dev deps, empty postinstall verified | smoke | `npx vitest run packages/domain/test/smoke.test.ts` | ❌ Wave 0 (this task) | ⬜ pending |
| P01-T2 | 01-01 | 1 | DATA-01 (contracts) | — | Browser-safe zero-dep contracts | typecheck | `npx tsc -p packages/domain/tsconfig.json --noEmit` | ❌ Wave 0 (this task) | ⬜ pending |
| P01-T3 | 01-01 | 1 | DATA-01 | T-01-01, T-01-03 | Bounded retry, no retry on 404/422 | e2e (offline asserts) | `npx vitest run test/e2e/skeleton.test.ts` | ❌ Wave 0 (this task) | ⬜ pending |
| P01-T4 | 01-01 | 1 | DATA-01 | T-01-01 | Real-data chain human-verified | checkpoint:human-verify | `BETRA_LIVE=1 npx tsx scripts/skeleton-demo.ts` | ❌ Wave 0 (this task) | ⬜ pending |
| P02-T1 | 01-02 | 2 | DATA-05 | T-01-07 | Coverage-honest N (>=80%, N>=3), leap fold | unit | `npx vitest run packages/domain/test/window.test.ts packages/domain/test/coverage.test.ts` | ❌ created here | ⬜ pending |
| P02-T2 | 01-02 | 2 | DATA-05 | T-01-05, T-01-06 | Circular mean 350/10; precip missing != zero | unit | `npx vitest run packages/domain/test/wind.test.ts packages/domain/test/precip.test.ts` | ❌ created here | ⬜ pending |
| P03-T0 | 01-03 | 2 | DATA-01 | T-01-SC | npm package legitimacy gate | checkpoint:human-verify | (manual — npmjs.com verification) | n/a | ⬜ pending |
| P03-T1 | 01-03 | 2 | DATA-01 | T-01-09, T-01-10 | Schema-assert + clamp before math | unit (fixtures) | `npx vitest run packages/fetch/test/observations.test.ts` | ❌ created here | ⬜ pending |
| P03-T2 | 01-03 | 2 | DATA-06, DATA-08 | T-01-11, T-01-12 | Registry no-splice; CC BY 4.0 attribution | unit (fixtures) | `npx vitest run packages/fetch/test/registry.test.ts packages/domain/test/attribution.test.ts` | ❌ created here | ⬜ pending |
| P04-T1 | 01-04 | 3 | SCORE-01 | T-01-13, T-01-14 | Renormalized combine + missingRain flag | unit | `npx vitest run packages/domain/test/score.test.ts` | ❌ created here | ⬜ pending |
| P04-T2 | 01-04 | 3 | SCORE-01 | T-01-13 | Full-chain real combined score (offline e2e) | e2e | `npx vitest run test/e2e/skeleton.test.ts` | ❌ strengthened here | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Requirement → Named Test coverage (from RESEARCH test map)

| Req | Named test (`-t` selector) | Plan/Task |
|-----|----------------------------|-----------|
| DATA-05 | `circular mean 350 10` | 01-02 / T2 |
| DATA-05 | `scalar wind speed` | 01-02 / T2 |
| DATA-05 | `precip missing not zero` | 01-02 / T2 |
| DATA-05 | `qualifying years coverage` | 01-02 / T1 |
| DATA-05 | `min N 3` | 01-02 / T1 |
| DATA-05 | `leap day fold` | 01-02 / T1 |
| SCORE-01 | `component score` | 01-04 / T1 |
| SCORE-01 | `missing component excluded` / `renormal` | 01-04 / T1 |
| DATA-06 | `registry no splice` | 01-03 / T2 |
| DATA-01 | `parse observations` | 01-03 / T1 |
| DATA-08 | `attribution` | 01-03 / T2 |

---

## Wave 0 Requirements

Wave 0 is delivered by **Plan 01** (the Walking Skeleton), which creates all test infrastructure before any math is asserted:

- [x] Node/TS workspace scaffold with vitest installed and a passing smoke test — Plan 01 Task 1
- [x] Domain contract types + stub signatures for all math (circular mean, coverage-honest N, precip aggregation, renormalized score) — Plan 01 Task 2
- [x] `vitest.config.ts` + `tsconfig.base.json` + workspace `package.json` — Plan 01 Task 1
- [x] Committed JSON fixtures captured from the live API (aws/day, synop/day, /stations, 404, 422) — Plan 03 Task 1 & 2 (offline-deterministic fetch tests)
- [x] Framework install: `npm install -D typescript@7 vitest@4 @vitest/coverage-v8@4 tsx` — Plan 01 Task 1 (gated by Plan 03 legitimacy checkpoint)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Veðurstofan terms/attribution confirmed | DATA-08 | Legal text review, not executable | Read captured terms in RESEARCH.md Sources (athuganir.vedur.is/disclaimer); confirm the `ATTRIBUTION` constant (Plan 03 T2) carries the exact CC BY 4.0 wording for UX-04 |
| Real end-to-end chain on live data | DATA-01 | Live network + human judgement of real output | Plan 01 Task 4 checkpoint: `BETRA_LIVE=1 npx tsx scripts/skeleton-demo.ts` shows AWS(dv-present/rain-absent) vs SYNOP(rain-present) |
| npm package legitimacy | DATA-01 | slopcheck unavailable in env; [ASSUMED] packages | Plan 03 Task 0 checkpoint: verify the four dev deps on npmjs.com, confirm empty postinstall |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (delivered by Plan 01 + Plan 03 fixtures)
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planned (fill on `/gsd:verify-work`)
