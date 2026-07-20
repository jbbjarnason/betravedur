/**
 * Copy the committed Phase-2 REAL derived sample from the `data` branch into
 * site/public/data/ so the site builds and deploys standalone (no data branch at
 * runtime). Deterministic and idempotent: it reads each file out of the `data`
 * branch via `git show data:<path>` and writes it verbatim into public/.
 *
 * Ship rule (PIPELINE.md): only `stations.json`, `manifest.json`, and `derived/*`
 * are copied — NEVER `raw/`.
 *
 * The interim sample is the SW-corner subset (Reykjavík #1 + Keflavík #1350). The
 * full national dataset arrives via Phase 8's pipeline/deploy.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DATA = resolve(HERE, "..", "public", "data");
const DATA_REF = "data";

/** Read a file's bytes out of the `data` branch. */
function showFromBranch(path: string): Buffer {
  return execFileSync("git", ["show", `${DATA_REF}:${path}`], {
    cwd: resolve(HERE, "..", ".."),
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** Resolve the hashed derived filenames from the manifest on the data branch. */
function derivedFilesFromManifest(): string[] {
  const raw = showFromBranch("manifest.json").toString("utf8");
  const manifest = JSON.parse(raw) as {
    stations: Record<string, { file: string }>;
  };
  return Object.values(manifest.stations).map((s) => s.file);
}

function copyFile(relPath: string): void {
  const bytes = showFromBranch(relPath);
  const dest = join(PUBLIC_DATA, relPath);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, bytes);
  console.log(`  copied ${relPath} (${bytes.length} bytes)`);
}

function main(): void {
  mkdirSync(PUBLIC_DATA, { recursive: true });
  console.log(`Copying sample data from branch '${DATA_REF}' -> ${PUBLIC_DATA}`);
  copyFile("stations.json");
  copyFile("manifest.json");
  for (const derived of derivedFilesFromManifest()) {
    copyFile(derived);
  }
  console.log("Done.");
}

main();
