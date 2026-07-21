// --root flag resolution tests (Plan 08-01, Task 1) — RED before resolveRoot exists.
//
// Closes RESEARCH Pitfall 1: DEFAULT_ROOT="data" (a RELATIVE dir) collides with the `data`
// BRANCH. The workflow runs `npm run backfill -- --root ./data-wt ...` so relative writes
// land in an explicit worktree, not the ambiguous `data` dir. resolveRoot is the seam that
// pulls the explicit root off argv (or PIPELINE_ROOT env) and hands the remaining argv back
// untouched so downstream spec/id parsing is unaffected.
import { describe, it, expect, vi } from "vitest";
import { resolveRoot, DEFAULT_ROOT } from "../src/rawstore.js";

describe("resolveRoot: --root routes pipeline writes/reads to the intended dir", () => {
  it("extracts `--root ./data-wt` and returns rest WITHOUT the pair (aggregate-style specs)", () => {
    const { root, rest } = resolveRoot(["--root", "./data-wt", "aws:1350"], {});
    expect(root).toBe("./data-wt");
    expect(rest).toEqual(["aws:1350"]);
  });

  it("extracts `--root` from the middle, leaving surrounding args in order", () => {
    const { root, rest } = resolveRoot(["aws", "--root", "/tmp/wt", "1350", "2010"], {});
    expect(root).toBe("/tmp/wt");
    expect(rest).toEqual(["aws", "1350", "2010"]);
  });

  it("falls back to env.PIPELINE_ROOT when no --root is present", () => {
    const { root, rest } = resolveRoot(["synop", "1"], { PIPELINE_ROOT: "./data-env" });
    expect(root).toBe("./data-env");
    expect(rest).toEqual(["synop", "1"]);
  });

  it("prefers an explicit --root over env.PIPELINE_ROOT", () => {
    const { root } = resolveRoot(["--root", "./explicit", "aws:1"], { PIPELINE_ROOT: "./data-env" });
    expect(root).toBe("./explicit");
  });

  it("defaults to DEFAULT_ROOT ('data') with no --root and no env", () => {
    const { root, rest } = resolveRoot(["synop", "1"], {});
    expect(root).toBe(DEFAULT_ROOT);
    expect(root).toBe("data");
    expect(rest).toEqual(["synop", "1"]);
  });

  it("throws a usage error when --root is the final token (missing value)", () => {
    expect(() => resolveRoot(["aws:1", "--root"], {})).toThrow(/--root/);
  });

  it("rejects an empty --root value (IN-02)", () => {
    expect(() => resolveRoot(["--root", "", "aws:1"], {})).toThrow(/--root/);
  });

  it("rejects a --root value that is actually the next flag (IN-02)", () => {
    expect(() => resolveRoot(["--root", "--kind", "aws:1"], {})).toThrow(/--root/);
  });

  it("last-wins on a repeated --root and warns (IN-01)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { root, rest } = resolveRoot(["--root", "a", "--root", "b", "aws:1"], {});
    expect(root).toBe("b");
    expect(rest).toEqual(["aws:1"]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
