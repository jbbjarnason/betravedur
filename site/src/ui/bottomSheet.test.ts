// Unit tests for the bottom-sheet PURE helpers (Phase 7, UX-03).
//
// This wave (Plan 01) ships only the matchMedia breakpoint constant + the pure snap math + a
// TYPED no-op `attachSheet` stub (Plan 03 fills the Pointer-Events drag body). The drag CONTROLLER
// itself is out of scope here — only the deterministic, unit-checkable pieces are tested.
import { describe, it, expect, afterEach } from "vitest";
import { MOBILE_QUERY, snapNearest, toggleTarget, attachSheet } from "./bottomSheet.js";

// ── Minimal DOM/matchMedia doubles so the drag controller's breakpoint-crossing path (WR-01/
// WR-04/IN-03) is exercisable in the Node unit runtime (no jsdom — see infoPanel.test.ts note).
type Listener = (...args: unknown[]) => void;

interface FakeEl {
  style: Record<string, string>;
  listeners: Map<string, Set<Listener>>;
  setPointerCapture(id: number): void;
  releasePointerCapture(id: number): void;
  addEventListener(type: string, fn: Listener): void;
  removeEventListener(type: string, fn: Listener): void;
}

/** A fake element: an inline `style` bag + an addEventListener/removeEventListener registry. */
function makeEl(): FakeEl {
  const listeners = new Map<string, Set<Listener>>();
  return {
    style: {},
    listeners,
    setPointerCapture() {},
    releasePointerCapture() {},
    addEventListener(type: string, fn: Listener) {
      (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(fn);
    },
    removeEventListener(type: string, fn: Listener) {
      listeners.get(type)?.delete(fn);
    },
  };
}

interface FakeMql {
  matches: boolean;
  changeListeners: Set<Listener>;
  addEventListener(type: string, fn: Listener): void;
  removeEventListener(type: string, fn: Listener): void;
  fireChange(): void;
}

/** A controllable matchMedia MQL whose `.matches` can flip and whose `change` can be dispatched. */
function makeMql(initialMatches: boolean): FakeMql {
  const changeListeners = new Set<Listener>();
  return {
    matches: initialMatches,
    changeListeners,
    addEventListener(type: string, fn: Listener) {
      if (type === "change") changeListeners.add(fn);
    },
    removeEventListener(type: string, fn: Listener) {
      if (type === "change") changeListeners.delete(fn);
    },
    fireChange() {
      for (const fn of this.changeListeners) fn();
    },
  };
}

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

describe("attachSheet — breakpoint crossing 640px while open (WR-01/WR-04/IN-03)", () => {
  const realMatchMedia = (globalThis as { matchMedia?: unknown }).matchMedia;
  afterEach(() => {
    (globalThis as { matchMedia?: unknown }).matchMedia = realMatchMedia;
  });

  /** Install a stub matchMedia returning `mql` for every query; return the mql for control. */
  function installMatchMedia(matches: boolean): ReturnType<typeof makeMql> {
    const mql = makeMql(matches);
    (globalThis as { matchMedia?: unknown }).matchMedia = () => mql;
    return mql;
  }

  it("clears the stale inline transform (WR-01) when the viewport leaves mobile mid-open", () => {
    const mql = installMatchMedia(true); // start mobile
    const sheet = makeEl();
    const handle = makeEl();
    let leftMobile = 0;
    attachSheet(sheet as never, handle as never, {
      peekY: 400,
      expandedY: 0,
      onLeaveMobile: () => {
        leftMobile += 1;
      },
    });
    // On attach the controller starts the sheet at peek → an inline translateY(peekY) is set.
    expect(sheet.style.transform).toContain("translateY(400px)");

    // Cross to desktop: flip .matches then dispatch the matchMedia `change`.
    mql.matches = false;
    mql.fireChange();

    // WR-01: the stale inline transform is cleared so the desktop dock is CSS-owned; IN-03: the
    // caller's onLeaveMobile fired so it can reset --attrib-safe-bottom.
    expect(sheet.style.transform).toBe("");
    expect(sheet.style.transition).toBe("");
    expect(leftMobile).toBe(1);
  });

  it("resets a mid-drag state machine (WR-04) on the mobile→desktop crossing", () => {
    const mql = installMatchMedia(true);
    const sheet = makeEl();
    const handle = makeEl();
    attachSheet(sheet as never, handle as never, { peekY: 400, expandedY: 0 });

    // Begin a drag: pointerdown sets transition:"none" (raw finger-follow) and dragging=true.
    const down = handle.listeners.get("pointerdown")!;
    for (const fn of down) fn({ clientY: 300, pointerId: 1, preventDefault() {} });
    expect(sheet.style.transition).toBe("none");

    // Cross to desktop mid-drag.
    mql.matches = false;
    mql.fireChange();
    // WR-04: transition restored (no longer frozen at "none") and transform cleared.
    expect(sheet.style.transition).toBe("");
    expect(sheet.style.transform).toBe("");

    // A subsequent pointermove must be a no-op (dragging was reset to false) — it must NOT write
    // a new translateY back onto the now-desktop sheet.
    const move = handle.listeners.get("pointermove")!;
    for (const fn of move) fn({ clientY: 999, pointerId: 1 });
    expect(sheet.style.transform).toBe("");
  });

  it("does nothing on a change that stays within (or re-enters) mobile", () => {
    const mql = installMatchMedia(true);
    const sheet = makeEl();
    const handle = makeEl();
    let leftMobile = 0;
    attachSheet(sheet as never, handle as never, {
      peekY: 400,
      expandedY: 0,
      onLeaveMobile: () => {
        leftMobile += 1;
      },
    });
    // A `change` that still matches mobile (e.g. a width change under 640px) is a no-op.
    mql.matches = true;
    mql.fireChange();
    expect(leftMobile).toBe(0);
    expect(sheet.style.transform).toContain("translateY(400px)");
  });

  it("removes the matchMedia change listener on teardown", () => {
    const mql = installMatchMedia(true);
    const sheet = makeEl();
    const handle = makeEl();
    const teardown = attachSheet(sheet as never, handle as never, { peekY: 400, expandedY: 0 });
    expect(mql.changeListeners.size).toBe(1);
    teardown();
    expect(mql.changeListeners.size).toBe(0);
  });

  it("defensively clears a stale inline transform on the desktop early-return (WR-01)", () => {
    installMatchMedia(false); // desktop
    const sheet = makeEl();
    sheet.style.transform = "translateY(400px)"; // a stale mobile value lingering from a prior open
    sheet.style.transition = "none";
    const handle = makeEl();
    const teardown = attachSheet(sheet as never, handle as never, { peekY: 400, expandedY: 0 });
    expect(sheet.style.transform).toBe("");
    expect(sheet.style.transition).toBe("");
    expect(() => teardown()).not.toThrow();
  });
});
