// Convert the store's (anchorDoy + widthDays) into a domain WindowSpec {startDoy, endDoy}
// at the recompute boundary (RESEARCH Pattern 4). Pure arithmetic — no date library, no
// dependency on @betravedur/domain beyond the WindowSpec type.
//
// ANCHOR = WINDOW START (Open Question 1 decision, RESEARCH A1):
//   The scrubber picks the doy the window BEGINS on ("pick when your trip begins"), not its
//   centre. This is documented and centralized HERE so flipping to centre later is a one-
//   function change without touching the store or the recompute. The choice does not affect
//   the domain math — WindowSpec is start/end doy either way.
//
// WRAP-AWARE: a window that runs past doy 365 (e.g. a late-December anchor + 3-week width)
// produces endDoy < startDoy, which is a LEGAL WindowSpec that expandWindow / groupBySeasonYear
// already consume correctly (the season-year contract, WR-03). We never clamp or reject a wrap.
import type { WindowSpec } from "@betravedur/domain";

/**
 * Build a WindowSpec from an anchor day-of-year and an inclusive width in days.
 *
 * `startDoy = anchorDoy`; `endDoy = anchorDoy + widthDays - 1` (inclusive, so width 7 spans
 * exactly 7 days). If the end runs past 365 it wraps to the start of the year, yielding
 * `endDoy < startDoy` — the domain's wrap contract handles it.
 *
 * @param anchorDoy leap-folded day-of-year, 1–365 (the window's first day)
 * @param widthDays number of inclusive days the window spans (1..365)
 */
export function anchorToWindow(anchorDoy: number, widthDays: number): WindowSpec {
  const startDoy = anchorDoy;
  let endDoy = anchorDoy + widthDays - 1;
  // Wrap past the year end → endDoy < startDoy (a legal, domain-consumable wrap).
  if (endDoy > 365) endDoy -= 365;
  return { startDoy, endDoy };
}
