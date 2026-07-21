# Phase 8: Nightly Pipeline & Repo Hardening - Research

**Researched:** 2026-07-21
**Domain:** GitHub Actions scheduled CI/CD — nightly data ingest + Pages deploy for a static site with data on an orphan branch
**Confidence:** HIGH (Actions/Pages mechanics, terms gate, pipeline reuse all verified against official docs + the live codebase)

## Summary

Phase 8 is pure orchestration: the entire pipeline (resumable paced backfill, idempotent field-pruned raw store, touched-only aggregate, content-hashed manifest) already exists in `pipeline/src/` and was proven end-to-end on the live API against a real subset (Reykjavík SYNOP #1 1949–2026, Keflavík AWS #1350 2008–2026) in Phase 2. Nothing about the *data logic* needs to change. What is missing is a `.github/workflows/nightly.yml` that runs that logic on an off-peak cron, commits deltas to the existing orphan `data` branch, builds the site consuming the fresh derived files, deploys to Pages, and pings an optional heartbeat.

The TERMS GATE is **RESOLVED → PROCEED**. The Veðurstofan observation API declares **CC BY 4.0** (verified live at `athuganir.vedur.is/disclaimer`), and the IMO web-conditions page states there are "no restrictions on the use of IMO data, neither for private nor commercial use," requiring only attribution (IMO + license + a note that data was modified). The site already shows this attribution (Phase 1 ATTRIBUTION, Phase 7 info panel). Automated access is neither prohibited nor rate-limit-documented; the Phase 2-measured polite pacing (≤4 req/s, ≥250 ms gap, sequential — never `Promise.all`) is already baked into `backfill.ts` and satisfies the "respectful automated fetching" bar.

**Primary recommendation:** One workflow, `nightly.yml`, with a single `build-and-deploy` job plus a separate `deploy` job using the official `actions/deploy-pages@v4` path. Cron `37 4 * * *` (off-peak). `workflow_dispatch` with a boolean `full_backfill` input drives the one-time national ingest; default nightly runs incremental. Concurrency `group: data-branch, cancel-in-progress: false` guards the data branch; a separate `group: pages` guards the deploy. Commit deltas to `data`, force-push only on the periodic squash-reset, never touch `main`. Heartbeat degrades to a no-op when the secret is absent.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Nightly fetch of new observations | CI runner (Actions) | Veðurstofan API | Fetch never runs in the browser (keyless, paced); it is offline/build-time only |
| Idempotent upsert + gap-fill | CI runner (pipeline `backfill.ts`/`rawstore.ts`) | `data` branch (persistence) | High-water resume + `(station,date)` upsert already implemented and tested |
| Touched-only aggregate → derived/manifest | CI runner (pipeline `aggregate.ts`) | `data` branch | Content-hash gate keeps commits minimal |
| Raw + derived persistence | `data` orphan branch (Git) | — | Isolated from `main` so `.git` on the Pages-build branch stays lean |
| Site build consuming fresh data | CI runner (Vite) | — | `vite build` reads `site/public/data/` populated from the `data` branch at build time |
| Static hosting | GitHub Pages CDN | — | Serves the built `dist/` + hashed data files; unlimited readers |
| Failure/staleness detection | External heartbeat (healthchecks.io) | Actions status UI | External dead-man's-switch catches total-runner-silence that Actions cannot self-report |
| History bounding | CI runner (squash-reset) → `data` branch | — | Force-push owned solely by the pipeline, `data` only |

## Standard Stack

### Core (all already present — this phase adds ZERO npm dependencies)
| Library / Action | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `actions/checkout` | v4 | Check out `main` (code) and, in a step, the `data` branch worktree | Canonical; `fetch-depth: 0` only when the squash-reset needs full history (it does not — orphan reset needs none) [VERIFIED: github.com/actions/checkout] |
| `actions/setup-node` | v4 | Node 22 LTS (Vite 8 needs Node 20+; repo dev uses 22/25) | Standard; enable `cache: npm` for the workspace lockfile [ASSUMED — pin Node 22, the repo's `@types/node` is ^22] |
| `actions/upload-pages-artifact` | v3 | Package `site/dist/` as the Pages artifact | Official Pages deploy path [CITED: github.com/actions/deploy-pages] |
| `actions/deploy-pages` | v4 | Deploy the artifact to Pages (v5.0.0 is latest, Mar 2026; v4 is the widely-pinned major) | Official, replaces `gh-pages`-branch hackery [VERIFIED: github.com/actions/deploy-pages] |
| `tsx` (via `npm run backfill`/`aggregate`) | ^4.23.1 | Runs the TS pipeline CLIs directly, no build step | Already the repo's runner for the pipeline |

### Supporting
| Tool | Purpose | When to Use |
|---------|---------|-------------|
| `curl` (preinstalled on `ubuntu-latest`) | Heartbeat success ping | Only when `HEARTBEAT_URL` secret is set |
| `git worktree` (git 2.39 two-step) | Materialize the `data` branch alongside `main` | Runner git is ≥2.43; the ≥2.42 `--orphan` one-liner works in CI (PIPELINE.md §6). Squash-reset uses the two-step recipe |

### Deploy action choice: `actions/deploy-pages` vs `peaceiris/gh-pages`
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `actions/deploy-pages@v4` (RECOMMENDED) | `peaceiris/gh-pages@v4` | `deploy-pages` is first-party, uses OIDC (`id-token: write`), needs **no** `contents: write` for the deploy, and doesn't create a `gh-pages` branch (avoids a third branch competing with `main`/`data`). `peaceiris` force-pushes to a `gh-pages` branch — more `.git` growth and another force-push surface to reason about. Given data already lives on a branch, adding a *third* build branch is strictly worse. **Use `deploy-pages`.** |

**Installation:** None. `npm ci` at the workspace root installs everything (`vite`, `tsx`, `vitest`, `@playwright/test` already in the lockfile).

**Version verification:**
```
actions/deploy-pages   → v4 pinned (v5.0.0 latest, published 2026-03-25) [VERIFIED: github.com/actions/deploy-pages releases]
Node                   → 22 LTS (repo @types/node ^22; Vite 8 requires ≥20) [ASSUMED]
git on ubuntu-latest   → ≥2.43 (supports worktree --orphan one-liner) [ASSUMED — verify in a Wave-0 dry-run step]
```

## Package Legitimacy Audit

This phase installs **no new packages**. All Actions are first-party GitHub-published (`actions/*`) except the deploy-action alternative considered-and-rejected (`peaceiris/gh-pages`). No npm dependency is added — the pipeline runs on `tsx` + Node built-ins (fs/path/crypto/zlib/fetch) already in the tree.

| Package/Action | Registry | Age | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-------------|-----------|-------------|
| actions/checkout | GitHub Marketplace | 6+ yrs | github.com/actions/checkout | n/a (first-party) | Approved |
| actions/setup-node | GitHub Marketplace | 6+ yrs | github.com/actions/setup-node | n/a | Approved |
| actions/upload-pages-artifact | GitHub Marketplace | 3+ yrs | github.com/actions/upload-pages-artifact | n/a | Approved |
| actions/deploy-pages | GitHub Marketplace | 3+ yrs | github.com/actions/deploy-pages | n/a | Approved |

**Packages removed due to slopcheck [SLOP]:** none.
**Packages flagged [SUS]:** none.
*slopcheck is an npm/PyPI tool; GitHub Actions are pinned to first-party `actions/*` repos and verified by URL, not registry lookup.*

## Architecture Patterns

### System Architecture Diagram

```
                       ┌─────────────────────────────────────────────┐
   cron 37 4 * * *  ──▶│  workflow: nightly.yml                       │
   workflow_dispatch ─▶│  input: full_backfill (bool, default false) │
   (full_backfill=T) ──┤                                             │
                       └──────────────────┬──────────────────────────┘
                                          │
              ┌───────────────────────────▼───────────────────────────┐
              │ JOB: build-and-deploy   (concurrency: data-branch,     │
              │                          cancel-in-progress: false)    │
              ├────────────────────────────────────────────────────────┤
              │ 1. checkout main (code)                                │
              │ 2. materialize `data` branch → ./data-wt worktree      │
              │    (fetch origin data; git worktree add ./data-wt data)│
              │ 3. npm ci                                              │
              │ 4. npm test  (vitest) + typecheck  ── GATE (fail=stop) │
              │ 5. IF full_backfill: enumerate all stations, backfill  │
              │    ELSE: resume backfill (high-water+1) per station    │
              │      └─▶ backfill.ts: paced ≤4 req/s ──▶ api.vedur.is  │
              │ 6. aggregate.ts (touched-only) ─▶ derived/ manifest/   │
              │    stations.json  (into ./data-wt)                     │
              │ 7. IF `git status` shows changes in ./data-wt:         │
              │      git commit + git push origin data                 │
              │    ELSE: skip commit (no empty commits) ── set flag    │
              │ 8. copy data-wt/{stations,manifest,derived} →          │
              │      site/public/data/  (copy-sample-data.ts pattern)  │
              │ 9. vite build ─▶ site/dist/                            │
              │ 10. upload-pages-artifact(site/dist)                   │
              │ 11. heartbeat: IF secrets.HEARTBEAT_URL: curl it       │
              └───────────────────────────┬────────────────────────────┘
                                          │ needs:
              ┌───────────────────────────▼───────────────────────────┐
              │ JOB: deploy  (concurrency: pages, cancel-in-progress:  │
              │               false; permissions pages+id-token write) │
              │   actions/deploy-pages@v4 ─▶ GitHub Pages CDN          │
              └────────────────────────────────────────────────────────┘

  NEVER: any write, commit, or force-push to `main`. `data` is single-writer,
  force-push only on the periodic squash-reset.
```

### Recommended Project Structure (additions only)
```
.github/
└── workflows/
    └── nightly.yml     # the single scheduled ingest→build→deploy workflow
pipeline/
└── src/
    └── stations-list.ts (NEW, optional) # enumerate the national station set for full_backfill
```

### Pattern 1: Off-peak cron + workflow_dispatch with a backfill mode
```yaml
# Source: PITFALLS.md Pitfall 6 + ARCHITECTURE.md Pattern; deploy-pages docs
on:
  schedule:
    - cron: "37 4 * * *"        # off-peak; NOT :00 and NOT 00:00 UTC
  workflow_dispatch:
    inputs:
      full_backfill:
        description: "Run the full national backfill (all stations from scratch)"
        type: boolean
        default: false
```
**What:** cron fires the nightly incremental; a human runs the workflow with `full_backfill: true` once to seed the national dataset. **When to use:** always for scheduled ingest — `workflow_dispatch` is also the manual re-run / self-heal trigger and the 60-day-disable recovery path.

### Pattern 2: Concurrency guard against the data-branch race
```yaml
concurrency:
  group: betravedur-data-branch
  cancel-in-progress: false      # let a running ingest finish; queue the next
```
**What:** a scheduled run does NOT cancel a still-running previous run, and a run can fire twice (ARCHITECTURE.md, cronpreview). `cancel-in-progress: false` serializes so two runs never push to `data` concurrently. The Pages `deploy` job uses a *separate* `group: pages` (the standard Pages concurrency group). **When to use:** non-negotiable for any cron that pushes to a shared branch.

### Pattern 3: Skip-empty commit (idempotent nightly)
```bash
# Source: aggregate.ts touched-only + ARCHITECTURE.md Anti-Pattern 3
cd ./data-wt
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -m "data: nightly $(date +%F)"
  git push origin data
  echo "changed=true" >> "$GITHUB_OUTPUT"
else
  echo "no data change — skipping commit/deploy of unchanged data"
  echo "changed=false" >> "$GITHUB_OUTPUT"
fi
```
**What:** because `aggregate.ts` only rewrites `derived/{station}.{hash}.json` when the content hash changes and serialization is byte-stable, an unchanged station produces **no diff**. A night with no new observations produces no commit. (The build/deploy can still run to keep Pages current, or be gated on `changed==true` — recommend: always build/deploy on `workflow_dispatch`, gate on `changed` for pure cron to avoid redeploying identical bytes.)

### Pattern 4: Materialize the data branch as a worktree in CI
```bash
# git ≥2.43 on ubuntu-latest supports the one-liner (PIPELINE.md §6 CI path)
git fetch origin data --depth=1
git worktree add ./data-wt data
# pipeline DEFAULT_ROOT="data" — run the CLIs with cwd=./data-wt OR pass root
```
**Note:** `rawstore.DEFAULT_ROOT = "data"` (a *relative* dir named `data`, NOT the branch). The nightly job must run the pipeline with its working directory set so raw/derived land inside the `data`-branch worktree. The Phase-2 recipe used a sibling worktree `../betravedur-data`; in CI, `./data-wt` is cleaner. **Confirm the cwd wiring in a Wave-0 dry-run** — this is the single most error-prone integration point.

### Pattern 5: Build consumes the freshest data (reuse copy-sample-data.ts)
`site/scripts/copy-sample-data.ts` already reads `git show data:<path>` into `site/public/data/`. In CI the freshest data is in the `./data-wt` worktree post-aggregate, so either (a) run the existing `git show data:...` copy after the commit, or (b) copy directly from `./data-wt/{stations.json,manifest.json,derived/}` into `site/public/data/` (raw/ NEVER copied — ship rule). Then `vite build`. **Recommend (b)** — copy from the worktree so the build uses the just-written bytes even before/without a push, and it works for `full_backfill` on first run when `data` may not yet be pushed.

### Anti-Patterns to Avoid
- **Blind append / `Promise.all` over fetches:** re-introduces 503 throttling and duplicate rows. The pipeline already prevents this (sequential pacing, `(station,date)` upsert) — the workflow must not add its own parallel fetch layer.
- **Committing to `main` from the workflow:** data must never touch `main`. Give the job no reason to write to `main` (checkout code read-only; all writes go to `./data-wt` on `data`).
- **`cancel-in-progress: true` on the data group:** would kill a mid-push ingest and risk a partial commit.
- **Redeploying identical bytes nightly:** wastes Pages build quota (~10 builds/hr soft limit); gate the cron deploy on `changed==true`.
- **Scheduling at `0 0 * * *`:** highest drop/delay probability (Pitfall 6). Use an off-peak minute like `37 4`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Idempotent upsert / gap-fill | A custom "fetch yesterday" step | `backfillStation` high-water resume (already gap-fills from high-water+1) | A missed night self-heals for free — resume fetches every year > high-water, not just yesterday |
| Touched-only re-derive | Re-aggregating every station each night | `aggregate.ts` content-hash gate | Unchanged stations produce byte-identical output → no diff → minimal commit |
| Pages deploy | A `gh-pages`-branch force-push | `actions/deploy-pages@v4` + `upload-pages-artifact` | First-party, OIDC, no extra branch, no `contents: write` for deploy |
| Skip-empty detection | Diffing derived files by hand | `git status --porcelain` on the worktree | The touched-only aggregate already guarantees no-op = no diff |
| Missed-run detection | Parsing the Actions API | External heartbeat (healthchecks.io) | Catches total-runner-silence Actions cannot self-report; degrades to no-op without the secret |
| History bounding | Manual repo surgery | orphan `data` branch + periodic squash-reset (PIPELINE.md §6) | Proven byte-identical-tree squash; force-push scoped to `data` only |

**Key insight:** Phase 8 writes YAML and a thin station-enumeration helper — it does NOT write data logic. Every data-correctness property (idempotency, gap-fill, self-heal, size budget, byte-stable serialization) is already implemented and tested in `pipeline/src/`. The risk surface is entirely in the *orchestration*: cwd wiring, concurrency, secrets, and force-push scoping.

## Runtime State Inventory

This phase automates an existing pipeline; it does not rename anything. Runtime-state audit for the *new* orchestration:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | The orphan `data` branch (currently **local only** per Phase 2 — commit `52bf461`, no remote configured/pushed) | Phase 8 must push `data` to `origin` for the first time. **Verify a remote exists** (`git remote -v` returned empty locally) — the repo must be pushed to GitHub before the workflow can run. This is a hard prerequisite. |
| Live service config | GitHub Pages must be enabled with **source: GitHub Actions** (not "deploy from a branch"); the `github-pages` environment must exist | One-time repo Settings → Pages → Source = "GitHub Actions". Document in PIPELINE.md. |
| OS-registered state | None (CI-only; no host state) | None — verified: no launchd/systemd/scheduler involved, cron is GitHub-hosted |
| Secrets/env vars | `HEARTBEAT_URL` (optional repo secret); `GITHUB_TOKEN` (auto-provided) for pushing to `data` and Pages OIDC | Add `HEARTBEAT_URL` opt-in; grant the workflow `contents: write` (push to `data`) + `pages: write` + `id-token: write` |
| Build artifacts | `site/public/data/` currently holds the Phase-3 committed *sample* (2 stations). Nightly build overwrites it from `data` | None — copy step regenerates it each build; it is a build input, not a tracked source of truth |

**Verified explicitly:** no OS-registered state exists (GitHub-hosted runners, GitHub-hosted cron). The only genuinely new runtime dependency is that the repo must have a GitHub remote and Pages configured for Actions deployment — currently `git remote -v` is empty locally, so **"push the repo + configure Pages" is a documented user-setup prerequisite**, not a code task.

## Common Pitfalls

### Pitfall 1: Data-branch cwd mismatch (the pipeline writes to the wrong `data`)
**What goes wrong:** `rawstore.DEFAULT_ROOT = "data"` is a relative directory, coincidentally sharing the name of the branch. If the pipeline runs from the repo root, it writes to `./data/` on `main` (not the `data`-branch worktree), silently populating the wrong place and never committing to `data`.
**Why it happens:** The name collision between the store root ("data") and the branch name ("data").
**How to avoid:** Run the pipeline CLIs with cwd = the `./data-wt` worktree (so relative `data` resolves inside it), OR extend the CLIs to accept an explicit `--root`. Assert post-run that `./data-wt/raw/` grew. Cover with a Wave-0 dry-run step.
**Warning signs:** `git status` shows changes under `main`'s working tree; the `data` worktree is empty after aggregate.

### Pitfall 2: Cron drops / 60-day auto-disable
**What goes wrong:** Scheduled runs are delayed/dropped under load; a repo with no *commits* for 60 days has its scheduled workflow silently auto-disabled.
**Why it happens:** GitHub's documented scheduler behavior (Pitfall 6). The nightly bot commit *is* keepalive activity — but only if the bot commits successfully.
**How to avoid:** Off-peak minute (`37 4 * * *`); the nightly `data` commit resets the 60-day timer; the external heartbeat catches a *failed* nightly that both stops updating AND stops resetting the timer.
**Warning signs:** "Data updated" date stops advancing; Actions tab shows no recent scheduled runs; a single "workflow disabled" email.

### Pitfall 3: Force-push scoped too broadly
**What goes wrong:** A squash-reset that force-pushes the wrong ref could clobber `main` or the deployed history.
**Why it happens:** Copy-pasting a `git push --force` without an explicit ref.
**How to avoid:** Always `git push --force origin data` (explicit ref); NEVER `--force` without a ref; NEVER target `main`. The squash-reset runs on its own schedule/step, not every night. Guard: a job step that asserts the current branch is `data` before any force-push.
**Warning signs:** `main` history diverges; Pages serves stale/wrong content.

### Pitfall 4: Vite `base` path breaks data fetches
**What goes wrong:** Data URLs 404 on the deployed site if the build `base` doesn't match the Pages subpath.
**Why it happens:** Project pages serve from `/<repo>/`.
**How to avoid:** `vite.config.ts` already sets `base: "/betravedur/"` — do not change it. The site fetches data under that base. Verified present.
**Warning signs:** map/markers load locally but not on the live URL.

### Pitfall 5: Heartbeat failing the run
**What goes wrong:** A `curl` to an unset/broken heartbeat URL fails the step and reddens an otherwise-successful ingest.
**Why it happens:** Treating the ping as required.
**How to avoid:** Guard on `if: ${{ secrets.HEARTBEAT_URL != '' }}` (or a shell `[ -n "$HEARTBEAT_URL" ]`) and add `|| true` / `continue-on-error: true` so a heartbeat failure NEVER fails the run. Ping only on success (place after deploy).
**Warning signs:** runs fail on the last step with a curl error despite green ingest.

## Code Examples

### Full nightly.yml shape (reference — planner refines)
```yaml
# Source: synthesized from deploy-pages docs, PITFALLS.md, ARCHITECTURE.md, PIPELINE.md
name: nightly
on:
  schedule:
    - cron: "37 4 * * *"
  workflow_dispatch:
    inputs:
      full_backfill:
        description: "Full national backfill (all stations)"
        type: boolean
        default: false

concurrency:
  group: betravedur-data-branch
  cancel-in-progress: false

permissions:
  contents: write      # push to the data branch
  pages: write         # deploy
  id-token: write      # Pages OIDC

jobs:
  ingest-build:
    runs-on: ubuntu-latest
    outputs:
      changed: ${{ steps.commit.outputs.changed }}
    steps:
      - uses: actions/checkout@v4          # main (code) — read-only
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm test && npm run typecheck   # GATE before any deploy
      - name: Materialize data branch
        run: |
          git fetch origin data --depth=1
          git worktree add ./data-wt data
      - name: Backfill
        working-directory: ./data-wt
        run: |
          if [ "${{ inputs.full_backfill }}" = "true" ]; then
            # enumerate the national station set, backfill each (paced)
            node ../pipeline/scripts/backfill-all.mjs   # or npm run backfill per id
          else
            # resume each known station from high-water+1
            npm --prefix .. run backfill -- synop 1
            npm --prefix .. run backfill -- aws 1350
            # ...national list once seeded
          fi
      - name: Aggregate
        working-directory: ./data-wt
        run: npm --prefix .. run aggregate -- synop:1 aws:1350   # touched-only
      - name: Commit data delta (skip if empty)
        id: commit
        working-directory: ./data-wt
        run: |
          git config user.name  "betravedur-bot"
          git config user.email "bot@users.noreply.github.com"
          if [ -n "$(git status --porcelain)" ]; then
            git add -A && git commit -m "data: nightly $(date +%F)"
            git push origin data
            echo "changed=true" >> "$GITHUB_OUTPUT"
          else
            echo "changed=false" >> "$GITHUB_OUTPUT"
          fi
      - name: Stage data into site build
        run: |
          mkdir -p site/public/data
          cp -r ./data-wt/derived site/public/data/
          cp ./data-wt/stations.json ./data-wt/manifest.json site/public/data/
          # raw/ is NEVER copied (ship rule)
      - run: npm --prefix site run build
      - uses: actions/upload-pages-artifact@v3
        with: { path: site/dist }
      - name: Heartbeat (opt-in, never fails the run)
        if: ${{ success() }}
        env: { HEARTBEAT_URL: ${{ secrets.HEARTBEAT_URL }} }
        run: '[ -n "$HEARTBEAT_URL" ] && curl -fsS -m 10 "$HEARTBEAT_URL" || true'

  deploy:
    needs: ingest-build
    runs-on: ubuntu-latest
    # gate the pure-cron deploy on a real change; always deploy on manual dispatch
    if: ${{ needs.ingest-build.outputs.changed == 'true' || github.event_name == 'workflow_dispatch' }}
    concurrency: { group: pages, cancel-in-progress: false }
    permissions: { pages: write, id-token: write }
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```
*Note: the `npm --prefix .. run backfill` cwd interplay with `DEFAULT_ROOT="data"` is the load-bearing detail — validate in Wave 0. A cleaner alternative is a small `--root ./data-wt` flag on the CLIs.*

### Periodic squash-reset (separate cadence — manual or monthly cron)
```bash
# Source: PIPELINE.md §6 (verified byte-identical tree, 02-04 E7)
cd ./data-wt
test "$(git rev-parse --abbrev-ref HEAD)" = "data"   # assert branch before force-push
git checkout --orphan data-fresh
git add -A
git commit -m "data: squashed backfill $(date +%F)"
git branch -D data
git branch -m data-fresh data
git push --force origin data     # ONLY data, explicit ref, asserted branch
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Deploy Pages via `gh-pages` branch force-push (`peaceiris`) | `actions/deploy-pages@v4` + artifact + OIDC | GitHub Pages "build with Actions" GA (2022) | No third branch, no `contents:write` for deploy, cleaner history |
| Trust cron to run | Off-peak minute + heartbeat + `workflow_dispatch` keepalive | Long-standing GitHub scheduler reality | Silent-stall detection; recoverable missed nights |

**Deprecated/outdated:** `peaceiris/gh-pages` for a new site with data already on a branch — adds a redundant build branch. Not recommended here.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Node 22 is the right runner version | Standard Stack | Low — Vite 8 needs ≥20; 20/22/24 all fine, adjust in YAML |
| A2 | `ubuntu-latest` git is ≥2.43 (worktree `--orphan` one-liner) | Pattern 4 | Low — the two-step recipe (PIPELINE.md §6) works on any git ≥2.39 as fallback |
| A3 | The national station list for `full_backfill` can be enumerated from `/stations?active=true` (or a committed list) | Deploy scope | Medium — Phase 2 only proved 2 stations; the full-list source/filter is unspecified. Planner must define how `full_backfill` enumerates stations (a `backfill-all` helper). Not run in this phase per CONTEXT (wire only). |
| A4 | The repo has (or will have) a GitHub remote + Pages configured for Actions | Runtime State | HIGH — `git remote -v` is empty locally. If the repo isn't on GitHub with Pages(Actions) enabled, the whole workflow cannot run. Documented as a user-setup prerequisite. |
| A5 | Pages 1GB is not at risk for the subset; full national set needs a scale measurement | Repo hardening | Medium — Phase 2 measured KB-per-station; the full ~450-station derived set (est. tens of MB) plus raw on the `data` branch stays well under 1GB, but raw history growth is the real driver → squash-reset bounds it |

## Open Questions

1. **How does `full_backfill` enumerate the national station set?**
   - What we know: `fetchStations(ids)` exists; `/stations?active=true&station_type=sj` lists stations (STACK.md). Phase 2 proved 2 stations.
   - What's unclear: the exact filter (AWS `sj` + SYNOP `sk`? active-only? a curated committed list?) and how types map to `aws:`/`synop:` specs for aggregate.
   - Recommendation: planner adds a `backfill-all` helper that fetches the station registry, classifies type, backfills each paced, then aggregates all — gated behind `workflow_dispatch full_backfill=true`. Do NOT run it in this phase (CONTEXT: wire only).

2. **cwd/root wiring for the pipeline vs the `data`-branch worktree.**
   - What we know: `DEFAULT_ROOT="data"` is a relative dir; the branch is also named `data`.
   - What's unclear: cleanest way to make the CLIs write into `./data-wt`.
   - Recommendation: add an optional `--root` arg (small, testable) OR run with `working-directory: ./data-wt` and reference the workspace scripts via `--prefix ..`. Validate in a Wave-0 dry-run that asserts raw/ grew inside the worktree.

3. **Squash-reset cadence: automated vs documented-manual.**
   - What we know: PIPELINE.md documents the recipe; it's byte-identical-tree safe.
   - Recommendation: document manual + optional monthly `workflow_dispatch`-triggered squash job. Automating it on every night is unnecessary; monthly bounds `.git` fine for KB-scale nightly deltas.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| GitHub Actions runner (ubuntu-latest) | The whole workflow | ✓ (GitHub-hosted) | — | none needed |
| Node | pipeline + Vite build | ✓ (setup-node) | 22 | 20/24 |
| git ≥2.42 (worktree --orphan) | data-branch materialize/squash | ✓ | ≥2.43 on runner | two-step recipe (git ≥2.39, PIPELINE.md §6) |
| GitHub remote (`origin`) | push to `data`, Pages deploy | ✗ (empty locally) | — | **none — hard prerequisite; repo must be on GitHub** |
| GitHub Pages (source=Actions) | deploy | ✗ (must be enabled) | — | none — one-time Settings toggle |
| `HEARTBEAT_URL` secret | monitoring | optional | — | pipeline runs without it (graceful no-op) |
| api.vedur.is | nightly fetch | ✓ (verified live) | schema 2026-02-17 | none (primary source) |

**Missing dependencies with no fallback:**
- GitHub remote + Pages(Actions) configuration — these are one-time user-setup prerequisites (document in PIPELINE.md; the phase can wire the YAML without them, but the first live run needs them).

**Missing dependencies with fallback:**
- git ≥2.42 → the Phase-2 two-step orphan recipe works on the local 2.39.5.
- `HEARTBEAT_URL` → absent = ping skipped, run still green.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.10 (workspace root `npm test` = `vitest run`) + Playwright 1.61.1 (site e2e) |
| Config file | root `package.json` scripts; `site/playwright.config.ts` |
| Quick run command | `npm test` (vitest run, ~126 tests) |
| Full suite command | `npm test && npm run typecheck` (tsc across domain/fetch/pipeline) |
| Workflow YAML validation | `actionlint` (or a YAML-parse assertion) — no runtime required |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-03 | Idempotent upsert by (station,date) | unit | `npm test` (rawstore.test.ts — proven Phase 2) | ✅ |
| DATA-03 | Resume fetches only newer years (high-water) | unit | `npm test` (backfill.test.ts) | ✅ |
| DATA-03 | Gap-fill / self-heal a missed night (from high-water, not "yesterday") | unit | assert `backfillStation` with startYear omitted spans high-water+1..now over a multi-year gap | ❌ Wave 0 (extend backfill.test.ts) |
| DATA-03 | Skip-empty: unchanged raw → no diff | unit | `npm test` (aggregate.test.ts touched-only Test B) | ✅ |
| DATA-03 | Workflow YAML is valid + has cron off-peak, workflow_dispatch, concurrency, correct permissions | lint/assert | `actionlint .github/workflows/nightly.yml` + a grep/parse test asserting `cron: "37 4`, `full_backfill`, `cancel-in-progress: false`, `push origin data` (never `main`), heartbeat `|| true` | ❌ Wave 0 |
| DATA-03 | Force-push targets `data` only, never `main` | assert | grep test: no `push.*main`, force-push only `origin data` with a branch assertion | ❌ Wave 0 |
| DATA-03 | data→build wiring copies ship set (no raw/) into site/public/data | unit/dry-run | a script test asserting `raw/` is excluded and derived+manifest+stations present | ❌ Wave 0 |
| DATA-03 | Heartbeat degrades to no-op when unset | assert | grep/parse: heartbeat step guarded on non-empty URL + `|| true`/continue-on-error | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test` (quick vitest run)
- **Per wave merge:** `npm test && npm run typecheck` + `actionlint`
- **Phase gate:** full suite green + a `workflow_dispatch` dry-run (or `act`-based local run, or a real manual trigger with evidence per the no-review directive) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `pipeline/test/backfill.test.ts` — add a multi-year-gap self-heal case (missed several nights → resume backfills the whole gap)
- [ ] `.github/workflows/nightly.yml` — the workflow itself + an `actionlint` gate
- [ ] A workflow-assertion test (grep/parse) for: off-peak cron, `full_backfill` input, `cancel-in-progress: false`, `contents/pages/id-token` permissions, `push origin data` (never `main`), force-push-only-`data`, heartbeat graceful no-op, ship-set copy excludes `raw/`
- [ ] Optional `pipeline/scripts/backfill-all.mjs` (or `--root` flag) — validated by a cwd/dry-run test that the pipeline writes into `./data-wt`
- [ ] `actionlint` install step: `ubuntu-latest` can `curl`-install or use `rhysd/actionlint` action

*Live-check directive: any real trigger (manual `workflow_dispatch`, real deploy) is an auto task that captures the run URL + Actions log excerpt + the deployed Pages URL as evidence — no human checkpoint (per STATE no-review).*

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Keyless public API; no auth in the pipeline |
| V3 Session Management | no | Static site, no sessions |
| V4 Access Control | yes | Least-privilege workflow `permissions:`; `contents:write` scoped to the job; force-push scoped to `data` |
| V5 Input Validation | yes | `assertStationId`/`assertYear` (path-traversal guards, CR-01) already enforce; malformed NDJSON lines skipped not fatal (WR-06) |
| V6 Cryptography | no (n/a) | `contentHash` is cache-busting, not a security boundary |
| V14 Config (CI/CD) | yes | Pin action majors; `GITHUB_TOKEN` least-privilege; secrets never echoed; heartbeat URL as a secret |

### Known Threat Patterns for GitHub-Actions data pipeline
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Force-push clobbers `main`/live site (T-02-10) | Tampering | Explicit `origin data` ref + branch assertion before force-push; never `main` (verified undisturbed in Phase 2) |
| Unbounded `.git` DoS from nightly commits (T-02-11) | DoS | Orphan `data` branch + periodic byte-identical squash-reset (verified 02-04 E7) |
| Poisoned averages from a partial/late API 503 treated as no-data (T-02-12) | Tampering/Integrity | `backfill.ts` propagates 503 as an error, never `[]`; 404-only advances cursor |
| Secret leakage (heartbeat URL, token) | Info Disclosure | Secrets via `secrets.*`, never printed; `curl -fsS` no `-v`; keyless data API means no data-source credential to leak |
| Malicious station id → path traversal in raw store | Tampering | `assertStationId`/`assertUnderRoot` reject `..`/negatives before any fs write (existing) |
| Supply-chain via unpinned actions | Tampering | Pin `actions/*` to major tags (or SHAs for hardening) |

## Sources

### Primary (HIGH confidence)
- `https://athuganir.vedur.is/disclaimer` — **CC BY 4.0 confirmed** for the observation API; redistribution + derived works permitted with attribution + modification note (TERMS GATE)
- `https://en.vedur.is/about-imo/the-web/conditions` — "no restrictions on use of IMO data, private or commercial"; attribution = IMO + download date (TERMS GATE)
- `https://github.com/actions/deploy-pages` — v4 pinned / v5.0.0 latest (2026-03-25); `pages:write` + `id-token:write`, no `contents` for deploy
- Local codebase — `pipeline/src/{backfill,rawstore,aggregate}.ts`, `PIPELINE.md`, Phase 2 02-04-SUMMARY.md (idempotency/gap-fill/squash-reset all proven live), `site/{package.json,vite.config.ts,scripts/copy-sample-data.ts}`
- `.planning/research/{PITFALLS.md,ARCHITECTURE.md}` — cron off-peak/heartbeat/60-day-disable, data-branch repo-size, concurrency (HIGH per their own docs-verified confidence)
- `https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits` — 1GB site, ~10 builds/hr (via STACK.md/PITFALLS.md citations)

### Secondary (MEDIUM confidence)
- GitHub scheduled-workflow disable/keepalive + cron-drop behavior (PITFALLS.md-cited community/dev.to sources)

### Tertiary (LOW confidence)
- National station enumeration for `full_backfill` — the exact `/stations` filter is inferred from STACK.md, not exercised (Open Question 1)

## Metadata

**Confidence breakdown:**
- Standard stack / deploy path: HIGH — official deploy-pages docs + zero new deps
- Terms gate: HIGH — CC BY 4.0 confirmed live at two IMO sources; PROCEED
- Pipeline reuse (idempotency/gap-fill/skip-empty/squash): HIGH — implemented and proven live in Phase 2
- Workflow YAML specifics (cwd wiring, station enumeration): MEDIUM — load-bearing details flagged for Wave-0 validation
- Repo remote/Pages prerequisite: HIGH-risk gap — `git remote -v` empty locally; documented as user setup

**Research date:** 2026-07-21
**Valid until:** 2026-08-20 (Actions/Pages stable; re-check deploy-pages major before pinning)
