// Unit tests for the bottom-sheet PURE helpers (Phase 7, UX-03).
//
// This wave (Plan 01) ships only the matchMedia breakpoint constant + the pure snap math + a
// TYPED no-op `attachSheet` stub (Plan 03 fills the Pointer-Events drag body). The drag CONTROLLER
// itself is out of scope here — only the deterministic, unit-checkable pieces are tested.
import { describe, it, expect } from "vitest";
import { MOBILE_QUERY, snapNearest, toggleTarget, attachSheet } from "./bottomSheet.js";

describe("MOBILE_QUERY — the single 640px source of truth", () => {
  it("is byte-identical to the CSS @media (max-width: 640px) breakpoint", () => {
    expect(MOBILE_QUERY).toBe("(max-width: 640px)");
  });
});

describe("snapNearest — nearest of peek/expanded", () => {
  // Convention: larger translateY = more collapsed (peek), smaller = more open (expanded).
  const peekY = 400;
  const expandedY = 0;

  it("returns peekY when currentY is nearer peekY", () => {
    expect(snapNearest(360, peekY, expandedY)).toBe(peekY);
  });

  it("returns expandedY when currentY is nearer expandedY", () => {
    expect(snapNearest(40, peekY, expandedY)).toBe(expandedY);
  });

  it("resolves an exact midpoint tie to expandedY (prefer the more-open snap)", () => {
    expect(snapNearest(200, peekY, expandedY)).toBe(expandedY);
  });

  it("works irrespective of argument order (peek/expanded swapped)", () => {
    // Same geometry, expanded passed first: nearest-to-40 is still the expanded (0) target.
    expect(snapNearest(40, expandedY, peekY)).toBe(expandedY);
  });
});

describe("toggleTarget — the keyboard peek↔expanded snap flip", () => {
  // Convention: larger translateY = peek (collapsed), smaller = expanded (open).
  const peekY = 400;
  const expandedY = 0;

  it("returns expandedY when currently AT (or nearest) peek — Enter opens it", () => {
    expect(toggleTarget(peekY, peekY, expandedY)).toBe(expandedY);
  });

  it("returns peekY when currently AT (or nearest) expanded — Enter collapses it", () => {
    expect(toggleTarget(expandedY, peekY, expandedY)).toBe(peekY);
  });

  it("flips to the OTHER snap from a mid-drag position (nearest decides current)", () => {
    // Nearer peek (360 of 0..400) → toggle opens to expanded.
    expect(toggleTarget(360, peekY, expandedY)).toBe(expandedY);
    // Nearer expanded (40) → toggle collapses to peek.
    expect(toggleTarget(40, peekY, expandedY)).toBe(peekY);
  });

  it("resolves an exact midpoint to expandedY as 'current', so it toggles to peek", () => {
    // snapNearest(200) ties→expandedY, so toggleTarget flips to peekY.
    expect(toggleTarget(200, peekY, expandedY)).toBe(peekY);
  });
});

describe("attachSheet — typed drag-controller stub (Plan 03 fills the body)", () => {
  it("returns a callable no-op teardown", () => {
    const sheet = { style: {} } as unknown as HTMLElement;
    const handle = {} as unknown as HTMLElement;
    const teardown = attachSheet(sheet, handle, { peekY: 400, expandedY: 0 });
    expect(typeof teardown).toBe("function");
    expect(() => teardown()).not.toThrow();
  });
});
