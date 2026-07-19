# Walking Skeleton — Betra Veður

**Phase:** 1
**Generated:** 2026-07-19

## Capability Proven End-to-End

Real daily observations for 2-3 stations are fetched from `api.vedur.is`, routed through the pure `@betravedur/domain` package (leap-folded window selection, circular wind mean, coverage-honest N, precipitation-as-missing, renormalized component score), and a per-station combined weather score is printed to stdout — proving the entire data-access + domain-math chain works on real Veðurstofan data.

> Note: Phase 1's boundary is data access + domain math only. There is deliberately **no UI, no map, and no deployment** in this skeleton — those are Phases 3+. The "thinnest end-to-end stack" for this project at this stage terminates at a CLI/JSON result, not a web page. Expanding the skeleton to UI/deploy would collide with Phase 3's scope.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Language / runtime | TypeScript 7.0.2 on Node (env 25.6.1), ESM (`"type":"module"`) | CONTEXT-locked TS-end-to-end so the same math module runs verbatim in the nightly pipeline and the future browser client (prevents pipeline/client drift). TS 5.9.3 is the documented fallback if TS7 tooling lags. |
| Monorepo tooling | npm workspaces (`packages/*`) | Zero extra install for a greenfield static site; lets the pipeline and the future Vite client import the identical `@betravedur/domain` package. pnpm is a fine alternative (Claude's discretion). |
| Domain package | `@betravedur/domain` — pure, **zero runtime dependencies**, browser-safe (no Node libs in its tsconfig) | It is the single source of truth for climatology math and must run byte-identically in Node and the browser. Every dependency added to it is a liability. |
| Data-access package | `@betravedur/fetch` — Node-only, native `fetch` + hand-rolled retry/backoff | 2-3 stations nightly is trivial load; no third-party HTTP dep needed. `p-retry` only if retry policy grows (Phase 2 backfill). |
| Test framework | Vitest 4.1.10 + @vitest/coverage-v8 4.1.10 | CONTEXT-locked; zero-config TS/ESM, fast, Vite-native. Tests run offline against committed live-captured fixtures for determinism. |
| Data source | `https://api.vedur.is/weather` — CC BY 4.0, no auth, JSON, OpenAPI 3.1 (spec `2026-02-17`) | Live-verified; keyless so nothing to leak. AWS (`aws/day`) for temp+wind(+dir); SYNOP (`synop/day`) for temp+wind-speed+rain. |
| Score model | Components (temp/rain/wind) computed & stored separately; combined at display time with weights renormalized over available components | Keeps future weight sliders possible (WGT-01); honestly handles the structural reality that AWS stations have no precip and SYNOP stations have no wind direction. |
| Directory layout | `packages/domain`, `packages/fetch`, `scripts/`, `test/e2e/` at repo root | Matches RESEARCH Recommended Project Structure; keeps pure math, I/O client, demo entry, and cross-package e2e cleanly separated. |

## Stack Touched in Phase 1

- [x] Project scaffold — npm workspaces, TypeScript 7, Vitest, tsx, strict tsconfig, smoke test (Plan 01 Task 1)
- [x] "Routing" analog — n/a (no web app this phase); the entry point is `scripts/skeleton-demo.ts`
- [x] Data read — real `GET /observations/{aws,synop}/day` + `/stations` from api.vedur.is (Plan 01 Task 3, hardened Plan 03)
- [x] Data write analog — the generated `stations.json` registry artifact + printed/JSON result (no DB; the "write" is the derived output the pipeline will later commit)
- [x] Interactive element analog — the demo CLI wired end-to-end fetch -> domain -> score (Plan 01 Task 3, closed Plan 04 Task 2)
- [x] "Deployment" analog — documented local full-stack run command: `BETRA_LIVE=1 npx tsx scripts/skeleton-demo.ts` exercises the whole chain

## Out of Scope (Deferred to Later Slices)

- Interactive MapLibre map + PMTiles basemap (Phase 3)
- Vite static site, Icelandic UI, slogan branding (Phase 3)
- Period / year-range selectors + instant client recompute + URL state (Phase 4)
- Score coloring, legend, ranked best-stations list, score explainer panel (Phase 5)
- ECharts station chart panel + daylight hours + no-data states (Phase 6)
- Responsive layout, trust/attribution info panel, loading/empty states (Phase 7)
- Nightly GitHub Actions pipeline, backfill, idempotent upsert, data-branch strategy (Phases 2 & 8)
- Sunshine/cloud-cover component (SUN-01, v1.x — coverage investigated only: exists on ~8 SYNOP stations, not built)
- User-adjustable weight sliders (WGT-01, v2 — kept possible by component-level storage)

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- Phase 2: nightly-independent local pipeline backfills per-station history and precomputes compact derived files (imports `@betravedur/domain` verbatim).
- Phase 3: Vite/TS static site with an Icelandic-branded MapLibre map of Iceland showing station markers from the derived files.
- Phase 4: period + year-range selectors that recompute the map instantly client-side (again via `@betravedur/domain`), with shareable URL state.
- Phase 5: markers colored by the combined score + legend + ranked list + explainer.
- Phase 6: station-click ECharts chart panel (distribution candlesticks, precip bars, daylight).
- Phase 7: responsive layout + trust/attribution states + loading/empty/no-data states.
- Phase 8: nightly GitHub Actions cron hardening the pipeline for unattended multi-year operation.
