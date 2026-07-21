// Ship-set staging seam — copy ONLY the shippable outputs into a build input dir.
//
// The build step (RESEARCH Pattern 5b) copies from the ./data-wt worktree into the site's
// public/data so the deploy uses the just-written bytes — this works on the very first
// full_backfill, before the `data` branch is pushed (unlike copy-sample-data.ts which reads
// from the `data` branch via `git show`).
//
// SHIP RULE (PIPELINE.md): only derived/ + stations.json + manifest.json ship to Pages. The
// raw store (raw/) is the pipeline's private source of truth and NEVER ships — committing raw
// daily rows would balloon the Pages repo toward the 1 GB limit. `SHIP_OUTPUTS` mirrors
// aggregate.shipOutputs() and, by construction, does not contain `raw`; copyShipSet only walks
// those named outputs, so raw/ can never leak into the build input.
//
// Node built-ins only (fs/path) — never bundled into the browser.
import { cpSync, copyFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

/**
 * The shippable output set — exactly what deploys to GitHub Pages. Mirrors
 * `aggregate.shipOutputs()`. `raw` is deliberately absent: the raw store never ships.
 */
export const SHIP_OUTPUTS = ["derived", "stations.json", "manifest.json"] as const;

/**
 * Copy the ship-set from `srcRoot` (a pipeline store root, e.g. ./data-wt) into `destDir`
 * (the build's data input, e.g. site/public/data), creating `destDir`. Copies derived/
 * recursively plus the two JSON files. NEVER copies raw/ — only SHIP_OUTPUTS are walked, and
 * `raw` is not among them. A missing output is skipped (e.g. a run with no SYNOP stations may
 * lack nothing here, but a partial store must not crash the stage).
 *
 * Each ship-set target in `destDir` is CLEARED before copy (WR-03): `destDir` is the committed
 * `site/public/data`, and `derived/{station}.{hash}.json` filenames are content-hashed, so an
 * old hash file already present would NOT be overwritten and would survive stale into `site/dist`.
 * Removing the target first guarantees dest == src for the ship-set (no stale/duplicate derived
 * files accumulate), not merely dest ⊇ src.
 */
export function copyShipSet(srcRoot: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true });
  for (const name of SHIP_OUTPUTS) {
    const to = join(destDir, name);
    // Drop any stale prior content (esp. content-hashed derived/*.json) before copying.
    rmSync(to, { recursive: true, force: true });
    const from = join(srcRoot, name);
    if (!existsSync(from)) continue;
    if (name === "derived") {
      // Recursive dir copy for derived/{station}.{hash}.json.
      cpSync(from, to, { recursive: true });
    } else {
      copyFileSync(from, to);
    }
  }
}
