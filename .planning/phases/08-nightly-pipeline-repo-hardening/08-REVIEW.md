---
phase: 08-nightly-pipeline-repo-hardening
reviewed: 2026-07-21T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - pipeline/src/rawstore.ts
  - pipeline/src/stations-list.ts
  - pipeline/src/ship.ts
  - .github/workflows/nightly.yml
  - .github/workflows/squash-reset.yml
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 8: Code Review Report

**Reviewed:** 2026-07-21
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Reviewed the NEW Phase-8 surface: `resolveRoot` (rawstore `--root` flag), `stations-list.ts`
(enumerateStations + type->spec), `ship.ts` (copyShipSet), and the two CI workflows
(`nightly.yml`, `squash-reset.yml`). Cross-referenced the CLI consumers (`backfill.ts`,
`aggregate.ts`), the fetch package (`fetchStations`), and the workflow-validity tests.

The security posture is genuinely strong. I could NOT find any of the classic CI compromises:

- **No secret leakage.** `HEARTBEAT_URL` is only read into an env var and passed to `curl`; it
  is never echoed, never interpolated into a log line, and the step is `|| true` + `if: success()`.
- **Test gate is not bypassable.** `npm test && npm run typecheck` runs as an earlier step in the
  same job and before the worktree/backfill/commit/push steps; step failure aborts the job
  (fail-fast), so no data push or deploy occurs on a red build. Ordering is asserted by
  `workflow.test.ts`.
- **No force-push in nightly** (the whole file is `--force`-free, asserted by test); the only
  force-push lives in `squash-reset.yml`, is `git push --force origin data` with an explicit ref,
  and is gated by a `test "$(git rev-parse --abbrev-ref HEAD)" = "data"` assertion under
  `set -euo pipefail` that PRECEDES it. `main` is never referenced in either executable body.
- **No push to main.** Nightly pushes only `origin data`; `squash-reset` force-pushes only
  `origin data`.
- **Path safety.** Station id / year are integer-guarded before path construction
  (`assertStationId` / `assertYear`), and aggregate adds an `assertUnderRoot` resolved-prefix
  check. `copyShipSet` provably walks only `SHIP_OUTPUTS` (`derived`, `stations.json`,
  `manifest.json`) — `raw` is not in the list, so raw/ cannot leak into the build.
- **Least privilege.** `squash-reset` carries `contents: write` only (no pages/id-token);
  nightly's deploy job scopes `pages`/`id-token` to itself.
- **No new deps.** Both new TS modules use Node built-ins (`fs`/`path`) + existing workspace deps;
  the workflow tests parse YAML as text rather than adding `js-yaml`.
- **Concurrency.** Both workflows share `group: betravedur-data-branch` with
  `cancel-in-progress: false`, so a squash can never race a nightly push.

The findings below are functional/robustness issues, not security holes. The most important is
WR-01: the `full_backfill=true` dispatch branch does NOT actually enumerate or back-fill the
national set — it runs the same two hardcoded seed stations as a normal nightly, behind a dead
`node -e` line. Given 08-CONTEXT explicitly says "wire-only, do not sweep this phase," this may be
intended, but the branch is misleading as written.

## Warnings

### WR-01: `full_backfill=true` branch does not enumerate/backfill the national set; the `node -e` line is dead

**File:** `.github/workflows/nightly.yml:75-84`
**Issue:** The `full_backfill=true` branch differs from the nightly branch only by one extra line:
```bash
node -e "import('./pipeline/src/stations-list.ts')" 2>/dev/null || true
```
This imports the module for its side effects, discards the returned promise/exports, swallows all
errors with `2>/dev/null`, and `|| true` guarantees the step continues regardless. It never calls
`enumerateStations`, never derives specs via `toAggregateSpec`, and never feeds any station into
`npm run backfill`. Both branches then run the identical two hardcoded seed stations
(`synop 1`, `aws 1350`). So a human dispatching `full_backfill=true` gets a normal nightly, not a
national sweep. `stations-list.ts` is effectively unreachable from CI.

This is defensible IF the phase intent is strictly "wire the helper, do not sweep" (08-CONTEXT
says so). But as written the branch is misleading and the `node -e` line is pure dead code that
also masks any import/parse error in `stations-list.ts` (a broken module would still "succeed"
here). Additionally the CI pins Node 22 (`setup-node` `node-version: 22`); bare `node` importing a
`.ts` path relies on native type-stripping, which is version-fragile on 22 (unflagged only in very
recent 22.x) — the pipeline's own scripts use `tsx` for exactly this reason.
**Fix:** Either remove the dead line entirely and add a `# wire-only: national sweep deferred`
comment so the two branches are honestly identical, OR actually wire it, e.g.:
```bash
if [ "${{ inputs.full_backfill }}" = "true" ]; then
  specs=$(npx tsx -e "import('./pipeline/src/stations-list.ts').then(async m => {
    const s = await m.enumerateStations(ALL_IDS);
    process.stdout.write(s.map(m.toAggregateSpec).join('\n'));
  })")
  # ... loop specs into `npm run backfill -- --root ./data-wt ...`
fi
```
At minimum, drop `2>/dev/null` so a broken module surfaces, and use `npx tsx` not bare `node`.

### WR-02: `./data-wt` worktree is never cleaned up and is not gitignored

**File:** `.github/workflows/nightly.yml:65-68`, `.github/workflows/squash-reset.yml:39-42`;
`/Users/jonb/Projects/betravedur/.gitignore`
**Issue:** Both workflows do `git worktree add ./data-wt data` inside the main checkout but never
`git worktree remove ./data-wt` (or clean it) afterward. On a single ephemeral runner this is
harmless per-run. The real risk is on `main`: `./data-wt` is NOT in `.gitignore`
(the file lists only `node_modules/`, `dist/`, `coverage/`, `*.log`, `test-results/`,
`playwright-report/`, `.playwright/`). The nightly job later runs `npm --prefix site run build`
and `copyShipSet('./data-wt', 'site/public/data')` from the main checkout root while `./data-wt`
sits there. If any future step (or a local developer reproducing the workflow) runs a
`git add -A` at the repo root while the worktree exists, git would try to stage the worktree
contents. It is currently safe only because no step does a root-level `git add`, and the
`git add -A` that exists runs with `working-directory: ./data-wt`. This is a latent footgun, not
an active bug.
**Fix:** Gitignore the worktree dir and clean it up explicitly:
```yaml
# .gitignore
data-wt/
```
```yaml
- name: Remove data worktree
  if: always()
  run: git worktree remove ./data-wt --force || true
```

### WR-03: `copyShipSet` stages into a committed source dir (`site/public/data`) without clearing stale files

**File:** `pipeline/src/ship.ts:31-44`; `.github/workflows/nightly.yml:110`
**Issue:** `copyShipSet` copies `derived/` with `cpSync(..., { recursive: true })` and copies the
two JSON files, but it never clears `destDir` first. In CI `destDir` is `site/public/data`, which
already exists on `main` (confirmed: `site/public/data` is committed). `derived/` filenames are
content-hashed (`{station}.{hash}.json`), so an old hash file already present in the committed
`site/public/data/derived/` would NOT be overwritten and would survive into `site/dist` — shipping
stale/duplicate derived files alongside the fresh ones and bloating the deploy. On a clean runner
checkout this only matters if `site/public/data` carries committed derived artifacts; if it holds
only a `.gitkeep`/basemap it is benign, but the function's contract ("copy the ship-set") does not
guarantee dest == src, only dest superset src.
**Fix:** Clear the ship-set targets in `destDir` before copying (or copy into a fresh temp dir the
build reads from):
```ts
export function copyShipSet(srcRoot: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true });
  for (const name of SHIP_OUTPUTS) {
    const to = join(destDir, name);
    rmSync(to, { recursive: true, force: true }); // drop stale hashed derived files
    const from = join(srcRoot, name);
    if (!existsSync(from)) continue;
    if (name === "derived") cpSync(from, to, { recursive: true });
    else copyFileSync(from, to);
  }
}
```

## Info

### IN-01: `resolveRoot` accepts a repeated `--root`; last one silently wins

**File:** `pipeline/src/rawstore.ts:38-49`
**Issue:** `resolveRoot(["--root", "a", "--root", "b"])` returns `root: "b"` with no warning. Not a
correctness bug (last-wins is a reasonable CLI convention and downstream parsing is unaffected),
but a duplicated flag in a workflow edit would be silently swallowed rather than flagged.
**Fix:** Optional — throw or `console.warn` on a second `--root`. Low priority.

### IN-02: `resolveRoot` does not validate the `--root` value (accepts `--root --foo` or empty string)

**File:** `pipeline/src/rawstore.ts:40-45`
**Issue:** The only guard is `value === undefined`. `resolveRoot(["--root", "--kind"])` treats
`"--kind"` as the root dir, and `resolveRoot(["--root", ""])` accepts an empty root, which would
make `partitionPath` write to `raw/...` relative to CWD. There is no path-safety concern for the
CI path (root is a fixed literal `./data-wt`), and the integer guards on station/year plus
`assertUnderRoot` in aggregate contain traversal downstream, so this is robustness only.
**Fix:** Optional — reject a value that starts with `-` or is empty:
```ts
if (value === undefined || value === "" || value.startsWith("-")) {
  throw new Error("usage: --root <dir> requires a directory value");
}
```

### IN-03: `enumerateStations` has no explicit handling for a failed `/stations` fetch

**File:** `pipeline/src/stations-list.ts:38-46`
**Issue:** If the injected/real `fetchStations` rejects (the real one throws
`stations <status>: <body>` on a non-ok response — see `packages/fetch/src/stations.ts:118-121`),
`enumerateStations` propagates the rejection unwrapped. That is acceptable for a wire-only helper
(fail loud), and the `parseStationsBody` layer already drops malformed rows gracefully. Noted only
because the module doc calls itself a "trust-boundary pass-through" yet adds no context to a
network failure. Since the helper is currently unreachable from CI (see WR-01), this is latent.
**Fix:** Optional — wrap with a contextual message if/when the helper is actually wired:
```ts
let stations: StationMeta[];
try { stations = await fetchStations(ids); }
catch (e) { throw new Error(`enumerateStations: /stations fetch failed: ${String(e)}`); }
```

---

_Reviewed: 2026-07-21_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
