// Force-push-scoping gate (Plan 08-03, Task 3) — the DATA-03/DATA-07 branch-corruption guard
// for RESEARCH threat T-08-10. A mis-scoped force-push in squash-reset.yml could clobber `main`
// or the deployed history. This test reads the workflow as TEXT (no yaml dep — zero new deps),
// strips comment lines, and asserts the safety invariants structurally so a bad force-push can
// never merge:
//   - a branch assertion (git rev-parse --abbrev-ref HEAD == data) PRECEDES any force-push,
//   - the ONLY force-push is `git push --force origin data` (explicit ref),
//   - no reference to `main`, and no `--force` targeting anything but `origin data`,
//   - permissions carry NO pages/id-token (the squash job never deploys).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const WORKFLOW = join(here, "..", "..", ".github", "workflows", "squash-reset.yml");

const raw = readFileSync(WORKFLOW, "utf8");
// Non-comment lines only: comments legitimately mention `main`/pages for documentation.
const codeLines = raw.split("\n").filter((l) => !l.trimStart().startsWith("#"));
const code = codeLines.join("\n");

describe("squash-reset.yml: force-push scoped to data only (T-08-10)", () => {
  it("workflow file loads and is non-trivial", () => {
    expect(raw.length).toBeGreaterThan(200);
    expect(raw).toContain("name: squash-reset");
  });

  it("the ONLY force-push is `git push --force origin data` (explicit ref)", () => {
    const forcePushes = codeLines
      .map((l) => l.trim())
      .filter((l) => /push\s+.*--force|--force.*push/.test(l));
    expect(forcePushes.length).toBe(1);
    expect(forcePushes[0]).toMatch(/git push --force origin data\b/);
  });

  it("NEVER references main and NEVER force-pushes any branch but data", () => {
    // No `main` anywhere in the executable (non-comment) body.
    expect(/\bmain\b/.test(code)).toBe(false);
    // No unqualified/other-target force-push.
    expect(/--force\s+origin\s+main/.test(code)).toBe(false);
    expect(/push\s+--force\s+(?!origin\s+data\b)/.test(code)).toBe(false);
  });

  it("asserts the branch is `data` BEFORE any force-push", () => {
    const assertIdx = codeLines.findIndex((l) =>
      /rev-parse\s+--abbrev-ref\s+HEAD/.test(l) && /["']?data["']?/.test(l),
    );
    const forceIdx = codeLines.findIndex((l) => /--force/.test(l));
    expect(assertIdx).toBeGreaterThanOrEqual(0);
    expect(forceIdx).toBeGreaterThanOrEqual(0);
    // Ordering invariant: the branch assertion must precede the force-push.
    expect(assertIdx).toBeLessThan(forceIdx);
    // The assertion compares HEAD to the literal `data`.
    expect(codeLines[assertIdx]).toMatch(/=\s*["']?data["']?/);
  });

  it("carries contents:write only — NO pages/id-token (the squash job never deploys)", () => {
    expect(/contents:\s*write/.test(code)).toBe(true);
    expect(/pages:\s*write/.test(code)).toBe(false);
    expect(/id-token:\s*write/.test(code)).toBe(false);
  });

  it("pins the checkout action (supply-chain, T-08-SC)", () => {
    expect(code).toMatch(/actions\/checkout@v\d/);
  });
});
