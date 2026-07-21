# Phase 8: Nightly Pipeline & Repo Hardening - Context

**Gathered:** 2026-07-21
**Status:** Ready for planning

<domain>
## Phase Boundary

The site stays fresh unattended for years: a nightly GitHub Actions cron fetches new observations, appends them idempotently with gap-fill, aggregates only touched stations, commits to the data branch, builds, and deploys to Pages — with an external heartbeat against silent failure and bounded `.git` growth. This is the FINAL phase and the only remaining requirement (DATA-03). It operationalizes the Phase 2 pipeline (backfill/rawstore/aggregate/manifest already exist + were proven with a real subset run) as a scheduled, self-healing, monitored workflow. NOT in this phase: new product features, UI changes (Phase 7 was the last UI phase — the freshness date the UI already reads from manifest just gets updated by this pipeline).

</domain>

<decisions>
## Implementation Decisions

### Deploy Scope (Claude's discretion — decided)
- WIRE THE PIPELINE against the existing committed sample — do NOT run the full ~450-station national backfill during this phase (keeps CI fast, avoids a huge data-branch commit here). Provide a documented one-command full-backfill trigger via `workflow_dispatch` (a manual "backfill all stations" input/mode) so the user runs the full national ingest live when ready.
- The nightly cron operates incrementally from the per-station high-water marks (Phase 2 rawstore) — after the full backfill is triggered once, nightly runs just append new days.

### Nightly Workflow (DATA-03)
- Schedule: nightly cron OFF-PEAK (NOT 00:00 UTC — research pitfall: 00:00 is congested/delayed). Plus `workflow_dispatch` for manual/backfill runs.
- Fetch everything since the last stored observation (per-station high-water + 1), upsert by (station, date), safe to re-run (idempotent, byte-identical — Phase 2 rawstore contract), and self-heal a missed night (gap-fill from high-water, not just "yesterday").
- On new data: aggregate ONLY touched stations (Phase 2 aggregate touched-only), regenerate derived + manifest, commit to the `data` branch, build the site, deploy to GitHub Pages. If NO new data: skip the commit/deploy (no empty commits).
- Reliability against Actions auto-disable (60 days no-commit) and cron drops: the workflow_dispatch path + heartbeat cover detection.

### Heartbeat / Monitoring
- Healthchecks.io-style success ping: on a successful run, curl a heartbeat URL stored in a repo secret (e.g. HEARTBEAT_URL). The external service alerts if a scheduled ping is missed (silent stall detection). DEGRADE GRACEFULLY: if the secret is absent, skip the ping and do NOT fail the run (so the pipeline works out-of-the-box; monitoring is opt-in via the secret). Document the setup in PIPELINE.md.
- Also surface run health via the standard Actions status (failed runs are visible), but the external heartbeat is the guard against total-runner-silence.

### Deploy Mechanism
- GitHub Pages deploy from the built site. The data lives on the `data` branch (Phase 2 orphan branch); the workflow checks out data, runs aggregate, builds site consuming the derived files, and deploys the built artifact (actions/deploy-pages or gh-pages-style). Confirm the exact wiring in research — the site build must consume the freshest derived data at build time.
- The freshness date the Phase 7 UI reads from manifest (max lastFetched) updates automatically as the nightly run commits fresh data.

### Repo Hardening (DATA-07 continuation)
- Nightly commits must NOT balloon `.git` history: the `data` branch partitioning + periodic squash/orphan-reset strategy documented in Phase 2's PIPELINE.md. This phase implements/automates the squash-reset cadence (or documents the manual cadence) and keeps main's history clean (data never merges to main). Confirm the repo stays within Pages 1GB.
- Push/force-push safety (deferred from Phase 2): the workflow pushes to the data branch; force-push only the squash-reset, never main. Guard the workflow so a bad run can't corrupt main or the deployed site.

### Terms Gate (open since Phase 1)
- Research re-fetches the Veðurstofan terms/conditions (the en.vedur.is conditions page that timed out in Phase 1). The API declares CC BY 4.0 and the site already displays attribution (Phase 1 ATTRIBUTION + Phase 7 info panel). PROCEED on CC BY 4.0 unless research finds terms that actually restrict redistribution/automated fetching — in which case FLAG the user before enabling public auto-deploy. Also respect polite fetch pacing (Phase 2 measured ~4 req/s + backoff) in the automated job.

### Claude's Discretion
- Exact workflow YAML structure, cron time, secret names, squash-reset cadence, deploy action choice, whether to split fetch/aggregate/deploy into jobs.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- pipeline/ (Phase 2): backfill.ts (chunked/paced/resumable fetch, high-water), rawstore.ts (idempotent upsert, field-pruned), aggregate.ts (touched-only), manifest.ts, stations.ts, derive.ts. PIPELINE.md documents the data-branch recipe + squash-reset + push-deferred-to-Phase-8 note. The Phase 2 06-... wait, Phase 2 04 plan already did a real subset backfill onto the orphan data branch and verified idempotency + squash-reset.
- The `data` orphan branch exists (created Phase 2) with real sample data.
- site build (Vite) consumes derived/{station}.json + stations.json + manifest.json from public/ (Phase 3 committed sample) — the workflow must supply the freshest derived data to the build.
- Phase 7 freshness helper reads manifest max(lastFetched) — auto-updates on new commits.

### Established Patterns
- npm workspaces, strict TS (tsc 0 errors — keep), Vitest, TDD, no-review directive, zero-secret keyless API. GitHub Actions is new to the repo (no workflows yet — this phase adds .github/workflows/).
- CI must run the existing test suites (unit + build) as a gate before deploy.

### Integration Points
- This closes the loop: data → nightly pipeline → deploy → the UI users see. After this, the milestone (v1.0) is complete.

</code_context>

<specifics>
## Specific Ideas

- Off-peak cron (avoid 00:00 UTC congestion — Phase 1/2 pitfalls research).
- Heartbeat degrades gracefully when unconfigured (works out-of-the-box).
- workflow_dispatch = both manual nightly re-run AND the full-national-backfill trigger.
- Idempotency + gap-fill + self-heal-a-missed-night are explicit success criteria — test the pipeline logic (not just "it runs").
- Data never touches main; force-push only the data-branch squash-reset.
- Terms re-verification is the last open gate before public auto-deploy — resolve in research.

</specifics>

<deferred>
## Deferred Ideas

- Full national backfill = triggered live by the user post-phase (documented one-command).
- v1.x/v2 features (comparison, sunshine, weights, English, worst-weather ranking).
</deferred>
