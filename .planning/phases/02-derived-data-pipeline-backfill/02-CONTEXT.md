# Phase 2: Derived Data Pipeline & Backfill - Context

**Gathered:** 2026-07-19
**Status:** Ready for planning

<domain>
## Phase Boundary

A local/manually-triggered pipeline that backfills per-station daily history deep enough for 2010–2015-style ranges and precomputes compact derived files the browser can aggregate over any period × year-range selection, stored within GitHub Pages size limits. No UI (Phase 3+), no nightly cron scheduling (Phase 8 — but the pipeline built here must be the thing Phase 8 schedules).

</domain>

<decisions>
## Implementation Decisions

### Backfill Scope
- Backfill full available history per station: SYNOP back to station start (Reykjavík 1949), AWS from their start dates (~2005+). Depth is cheap because only compact derived files ship with the site.
- Include all stations (active + decommissioned) that can yield ≥3 qualifying years of daily data; decommissioned stations are retained for historical windows.
- Raw daily data is kept as partitioned NDJSON per station/year on the dedicated `data` branch — enables recomputing derived files without re-fetching the API.
- Backfill runner is resumable: per-station high-water marks, idempotent re-runs (upsert by station+date), polite throttling (~4 req/s), runnable locally and via `workflow_dispatch`.

### Derived Data Layout
- `derived/{station}.json`: per-(season-year, day-of-year) records with daily t/tx/tn, f/fx/fg, dv, r and presence masks. Browser aggregates any period × year-range client-side. Target: tens of KB gzipped per station.
- Season-year grouping uses the Phase 1 `groupBySeasonYear` contract (Dec head owns the year) — NOT calendar year.
- Content-hashed filenames + `manifest.json` index for cache busting; nightly deploys become deltas for returning visitors.
- Orphan branch `data` holds raw + derived data; additive partitioned files; periodic squash-reset strategy to cap `.git` growth documented in the pipeline README.
- `stations.json` generated from the Phase 1 registry (ID-keyed, active-date windows, owner/type recorded, no splicing).

### Claude's Discretion
- Exact NDJSON partitioning scheme, manifest schema, gzip/brotli measurement tooling, script CLI shape, concurrency limits.
- Whether derived files also carry per-day pre-aggregations if size budget allows.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `@betravedur/domain` (packages/domain): fully implemented, zero-dep — window selection (leapFoldedDoy, expandWindow, groupBySeasonYear), coverage (qualifyingYears ≥80%, effectiveN N≥3), circular wind mean, precip sum-then-average, score curves + renormalizing combine() (score: null when unscorable).
- `@betravedur/fetch` (packages/fetch): schema-asserting fetchers (aws/day, synop/day), SCHEMA_DRIFT guard, range clamping (dv 360→0), 404→[] / 422→throw, no-splice registry + parseStationsBody, CC BY 4.0 ATTRIBUTION constant.
- scripts/skeleton-demo.ts: reference for chaining fetch → domain (computeStation exported).
- Committed live fixtures in packages/fetch/test/fixtures/.

### Established Patterns
- npm workspaces monorepo, Vitest (96 tests green), strict TS (noUncheckedIndexedAccess), TDD with RED/GREEN commits, offline-deterministic tests via fixtures with BETRA_LIVE-gated live tests.

### Integration Points
- Phase 3 client will fetch derived/{station}.json + stations.json + manifest.json statically.
- Phase 8 will schedule this pipeline nightly — build it as idempotent CLI entry points from day one.

</code_context>

<specifics>
## Specific Ideas

- Success criterion: derived files small enough for no-backend aggregation (tens of KB gzipped per station) — measure and record actual sizes.
- Research flag (STATE blockers): verify actual raw-data footprint vs GitHub 1GB soft limit during backfill; record numbers.

</specifics>

<deferred>
## Deferred Ideas

- Nightly cron scheduling, heartbeat monitoring, auto-deploy — Phase 8.
- Sunshine/cloud extraction (SUN-01, v1.x) — only ~8 SYNOP stations have it.

</deferred>
