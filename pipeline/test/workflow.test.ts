// Workflow-validity gate over .github/workflows/nightly.yml (DATA-03).
//
// nightly.yml is pure orchestration; every load-bearing YAML property is an invariant a silent
// edit could break (a wrong cron, a dropped concurrency guard, an accidental push to main, an
// unguarded heartbeat). This test parses the workflow AS TEXT (js-yaml is NOT a dependency —
// zero new deps) and asserts each property via string/regex checks, plus a line-index ordering
// proof that the test/typecheck GATE precedes any push to the data branch.
//
// The "never touches main" and "no --force" invariants are asserted over COMMENT-FILTERED lines
// so that documentation prose in the header can never self-invalidate the gate.
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const WORKFLOW_PATH = resolve(here, "../../.github/workflows/nightly.yml");

let raw: string;
let lines: string[];
// Non-comment lines only — header prose AND inline trailing comments must not be able to
// satisfy or break an assertion (a `# ...never main...` note is documentation, not a command).
let code: string;

// Strip an inline trailing comment (` # ...`) without touching `#` inside a quoted string.
function stripInlineComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === "#" && !inSingle && !inDouble) {
      // a `#` starting a comment is preceded by whitespace or line-start.
      if (i === 0 || /\s/.test(line[i - 1])) return line.slice(0, i);
    }
  }
  return line;
}

beforeAll(() => {
  raw = readFileSync(WORKFLOW_PATH, "utf8");
  lines = raw.split("\n");
  code = lines
    .filter((l) => !/^\s*#/.test(l))
    .map(stripInlineComment)
    .join("\n");
});

describe("nightly.yml — schedule + dispatch", () => {
  it("uses the off-peak cron 37 4 * * * (not 00:00)", () => {
    expect(/cron:\s*["']37 4 \* \* \*["']/.test(raw)).toBe(true);
    expect(raw.includes('"0 0 * * *"')).toBe(false);
  });

  it("exposes a workflow_dispatch boolean input named full_backfill", () => {
    expect(/workflow_dispatch:/.test(raw)).toBe(true);
    expect(/full_backfill:/.test(raw)).toBe(true);
    expect(/full_backfill:[\s\S]*?type:\s*boolean/.test(raw)).toBe(true);
  });
});

describe("nightly.yml — concurrency + permissions", () => {
  it("serializes the data branch with cancel-in-progress: false", () => {
    expect(/cancel-in-progress:\s*false/.test(code)).toBe(true);
    // never cancel a mid-push ingest.
    expect(/cancel-in-progress:\s*true/.test(code)).toBe(false);
  });

  it("grants least-privilege permissions (contents/pages/id-token: write)", () => {
    expect(/contents:\s*write/.test(code)).toBe(true);
    expect(/pages:\s*write/.test(code)).toBe(true);
    expect(/id-token:\s*write/.test(code)).toBe(true);
  });
});

describe("nightly.yml — test gate before deploy", () => {
  it("runs `npm test && npm run typecheck` before any push to data", () => {
    const gateIdx = lines.findIndex((l) => /npm test\s*&&\s*npm run typecheck/.test(l));
    const pushIdx = lines.findIndex((l) => /git push origin data/.test(l));
    expect(gateIdx).toBeGreaterThanOrEqual(0);
    expect(pushIdx).toBeGreaterThanOrEqual(0);
    // GATE must lexically precede the first data-branch push (fail-fast before ship).
    expect(gateIdx).toBeLessThan(pushIdx);
  });
});

describe("nightly.yml — pipeline --root wiring", () => {
  it("passes --root ./data-wt to backfill and aggregate", () => {
    const rootCalls = raw.match(/--root \.\/data-wt/g) ?? [];
    // backfill (>=1) + aggregate (>=1); the seed stations produce more.
    expect(rootCalls.length).toBeGreaterThanOrEqual(2);
    expect(/aggregate --.*--root \.\/data-wt|--root \.\/data-wt synop:1 aws:1350/.test(raw)).toBe(
      true,
    );
  });
});

describe("nightly.yml — full_backfill genuinely enumerates + backfills the national set (WR-01)", () => {
  it("enumerates the national set via the stations-list CLI using npx tsx (not bare node)", () => {
    // The full_backfill branch must RUN the enumeration helper, not import-for-side-effects.
    expect(/npx tsx pipeline\/src\/stations-list\.ts/.test(code)).toBe(true);
    // The old dead line (import-and-discard, error-swallowing) must be gone.
    expect(/node -e .*stations-list\.ts/.test(raw)).toBe(false);
    expect(raw.includes("2>/dev/null")).toBe(false);
  });

  it("loops the enumerated specs into backfill (WITH start year) and aggregate", () => {
    // A loop over the emitted `<kind>:<id>:<start>` specs drives backfill per station, PASSING
    // the start year so a fresh station is swept from its real history (not just the current
    // year — the national-sweep gap this fixes).
    expect(/for spec in \$specs/.test(code)).toBe(true);
    expect(
      /npm run backfill -- --root \.\/data-wt "\$kind" "\$id" "\$start"/.test(code),
    ).toBe(true);
    // The start year must actually be parsed out of each spec (the `:start` suffix).
    expect(/start=\$\{rest##\*:\}/.test(code)).toBe(true);
    // Aggregate runs over the enumerated set with the `:start` suffix stripped to `kind:id`.
    expect(/aggspecs=\$\(printf '%s\\n' \$specs \| sed/.test(code)).toBe(true);
    expect(/npm run aggregate -- --root \.\/data-wt \$aggspecs/.test(code)).toBe(true);
  });

  it("keeps the national sweep resilient — one station failure does not abort it", () => {
    // A single station's hard error (e.g. a propagated 503) must not kill the whole sweep;
    // the loop guards backfill with `if !` and continues (high-water resume self-heals).
    expect(/if ! npm run backfill/.test(code)).toBe(true);
  });
});

describe("nightly.yml — data worktree cleanup (WR-02)", () => {
  it("always-removes ./data-wt after the job (never left behind)", () => {
    // Plain (non-forced) remove — preserves the file-wide zero-force-push invariant.
    expect(/git worktree remove \.\/data-wt(?! --force)/.test(code)).toBe(true);
    expect(raw.includes("git worktree remove ./data-wt --force")).toBe(false);
    const removeIdx = lines.findIndex((l) => /git worktree remove \.\/data-wt/.test(l));
    // guarded by if: always() so a failed backfill still cleans up.
    const guard = lines[removeIdx - 1] ?? "";
    const guard2 = lines[removeIdx - 2] ?? "";
    expect(/if:\s*always\(\)/.test(guard) || /if:\s*always\(\)/.test(guard2)).toBe(true);
  });
});

describe("nightly.yml — skip-empty commit", () => {
  it("gates the commit on git status --porcelain and emits changed true/false", () => {
    expect(/git status --porcelain/.test(raw)).toBe(true);
    expect(/changed=true/.test(raw)).toBe(true);
    expect(/changed=false/.test(raw)).toBe(true);
  });
});

describe("nightly.yml — never touches main, never force-pushes", () => {
  it("has no push (or force-push) to main in any non-comment line", () => {
    expect(/push\s+[^\n]*\bmain\b/.test(code)).toBe(false);
  });

  it("contains no --force anywhere in the workflow (nightly is fast-forward only)", () => {
    // The whole file — including comments — must be free of --force. The squash-reset
    // (Plan 03) owns every force-push, scoped to `origin data`.
    expect(raw.includes("--force")).toBe(false);
    // and the only push is the fast-forward data push.
    expect(/git push origin data/.test(code)).toBe(true);
  });
});

describe("nightly.yml — guarded heartbeat", () => {
  it("guards on a non-empty HEARTBEAT_URL and ends with || true", () => {
    const hb = lines.find((l) => l.includes("curl") && l.includes("HEARTBEAT_URL"));
    expect(hb).toBeTruthy();
    expect(hb!).toMatch(/\[\s*-n\s*"\$HEARTBEAT_URL"\s*\]/);
    expect(hb!.trimEnd()).toMatch(/\|\|\s*true'?$/);
    // only pings on success.
    expect(/if:\s*\$\{\{\s*success\(\)\s*\}\}/.test(raw)).toBe(true);
  });
});

describe("nightly.yml — deploy path", () => {
  it("deploys via actions/deploy-pages@v4 with pages/id-token permissions", () => {
    expect(/actions\/deploy-pages@v4/.test(raw)).toBe(true);
    expect(/environment:[\s\S]*?github-pages/.test(raw)).toBe(true);
  });

  it("pins all marketplace actions to a major tag (supply-chain)", () => {
    const uses = lines.filter((l) => /uses:\s*actions\//.test(l));
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) {
      expect(u).toMatch(/uses:\s*actions\/[\w-]+@v\d+/);
    }
  });
});
