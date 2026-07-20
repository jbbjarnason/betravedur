// The ranked "Bestu staðir" panel (SCORE-02) — a collapsible right-docked list of the
// scored stations for the current selection, ranked by score descending. It is the actual
// answer to the user's question ("where has the weather been best?"), so it is prominent, not
// buried.
//
// Two disciplines, both inherited from Phase 4:
//   1. DATA comes from the post-debounce recompute truth (`latestData`), NOT a raw store
//      subscription. main.ts calls `refresh()` from the `renderForState` choke point right
//      after `controlBar?.refreshReadout()`, so the list re-sorts on the SAME frame the markers
//      do — and never churns on a viewport-only (pan/zoom) change (RESEARCH Pitfall 5).
//   2. A row click reuses the Phase-4 station-select seam: `markDiscrete()` (so the URL write
//      is a back-button-revertable pushState) then `store.set({ stationId })`. It does NOT drive
//      the camera itself — a dedicated stationId-only subscriber in main.ts owns the easeTo
//      fly-to (RESEARCH Pattern 2 / Pitfall 4). No chart panel opens here (Phase-6 seam).
//
// The list SUBSCRIBES to the store only for the selected-row reciprocal highlight (stationId is
// a primitive → the store's no-op-skip keeps this cheap, WR-04).
import { markDiscrete } from "../state/history.js";
import { formatScore } from "../map/markers.js";
import type { SelectionStore } from "../state/store.js";
import type { MarkerDatum } from "../data/types.js";

/**
 * Rank the scored stations for display: EXCLUDE every unscorable datum (`score === null`,
 * i.e. ófullnægjandi gögn or an empty contributing set), then sort by score DESCENDING with a
 * deterministic secondary tie-break on station id ASCENDING.
 *
 * The tie-break is load-bearing: `Array.prototype.sort` is spec-stable (ES2019+), but the input
 * order itself varies between recomputes, so equal-score rows would reshuffle on an unrelated
 * station's change without an explicit tie-break (RESEARCH Pitfall 6). Keying ties on the
 * immutable station id fixes the order across every recompute — no flicker.
 *
 * Pure: no DOM, no store, no mutation of the input (sort runs on a filtered copy). The `!`
 * on `score` is sound because the filter has removed every null (T-05-06: the comparator never
 * dereferences null).
 */
export function rankStations(data: ReadonlyArray<MarkerDatum>): MarkerDatum[] {
  return data
    .filter((d): d is MarkerDatum & { score: number } => d.score !== null)
    .sort((a, b) => b.score - a.score || a.station - b.station);
}

/** The ranked-list handle: main.ts calls `refresh()` from the recompute choke point. */
export interface RankedListHandle {
  /** Re-read the latest recomputed data, re-rank, and rebuild the rows (no fetch). */
  refresh(): void;
}

/** Copy (UI-SPEC Copywriting Contract — final, Icelandic only). */
const COPY = {
  title: "Bestu staðir",
  aununrkomu: "án úrkomu",
  emptyHeading: "Engin einkunn",
  emptyBody:
    "Engin veðurstöð hefur nægileg gögn til að fá einkunn fyrir þetta tímabil. Prófaðu annað tímabil eða víðara árabil.",
  collapseLabel: "Sýna/fela lista",
} as const;

/**
 * Mount the ranked "Bestu staðir" panel into `parent` and wire it to the store.
 *
 * @param parent   where to append the panel (main.ts passes document.body)
 * @param store    the Phase-4 selection store — row clicks write `stationId` via `set`; the
 *                 panel subscribes for the selected-row highlight only.
 * @param getLatestData reads the latest recomputed MarkerDatum[] (main.ts keeps a module-level
 *                 `latestData` snapshot updated on every recompute and passes this getter).
 * @returns a handle whose `refresh()` main.ts calls after each recompute settles.
 */
export function mountRankedList(
  parent: HTMLElement,
  store: SelectionStore,
  getLatestData: () => ReadonlyArray<MarkerDatum>,
): RankedListHandle {
  const section = document.createElement("section");
  section.className = "ranked-list";
  section.setAttribute("aria-label", COPY.title);

  // ── Header: title + collapse toggle ──────────────────────────────────────────
  const header = document.createElement("header");
  header.className = "ranked-list__header";

  const title = document.createElement("h2");
  title.className = "ranked-list__title";
  title.textContent = COPY.title;

  const listId = "ranked-list-ol";

  const collapseBtn = document.createElement("button");
  collapseBtn.type = "button";
  collapseBtn.className = "ranked-list__collapse";
  collapseBtn.setAttribute("aria-label", COPY.collapseLabel);
  collapseBtn.setAttribute("aria-controls", listId);
  collapseBtn.setAttribute("aria-expanded", "true");
  // A chevron affordance (redundant to aria-expanded) — inline SVG built via the DOM API only
  // (createElementNS/setAttribute, never string-HTML injection), so the T-05-05 grep gate on
  // the station-name path stays meaningful; the SVG is static chrome regardless.
  const SVGNS = "http://www.w3.org/2000/svg";
  const chevron = document.createElementNS(SVGNS, "svg");
  chevron.setAttribute("viewBox", "0 0 12 12");
  chevron.setAttribute("width", "12");
  chevron.setAttribute("height", "12");
  chevron.setAttribute("aria-hidden", "true");
  chevron.setAttribute("focusable", "false");
  const chevronPath = document.createElementNS(SVGNS, "path");
  chevronPath.setAttribute("d", "M2 4l4 4 4-4");
  chevronPath.setAttribute("fill", "none");
  chevronPath.setAttribute("stroke", "currentColor");
  chevronPath.setAttribute("stroke-width", "1.5");
  chevronPath.setAttribute("stroke-linecap", "round");
  chevronPath.setAttribute("stroke-linejoin", "round");
  chevron.appendChild(chevronPath);
  collapseBtn.appendChild(chevron);

  header.append(title, collapseBtn);

  // ── Body: the ordered list of ranked rows (or the empty state) ────────────────
  const list = document.createElement("ol");
  list.className = "ranked-list__ol";
  list.id = listId;

  const empty = document.createElement("div");
  empty.className = "ranked-list__empty";
  empty.hidden = true;
  const emptyHeading = document.createElement("p");
  emptyHeading.className = "ranked-list__empty-heading";
  emptyHeading.textContent = COPY.emptyHeading;
  const emptyBody = document.createElement("p");
  emptyBody.className = "ranked-list__empty-body";
  emptyBody.textContent = COPY.emptyBody;
  empty.append(emptyHeading, emptyBody);

  const body = document.createElement("div");
  body.className = "ranked-list__body";
  body.append(list, empty);

  section.append(header, body);
  parent.appendChild(section);

  // ── Collapse toggle ───────────────────────────────────────────────────────────
  let collapsed = false;
  const applyCollapse = (): void => {
    collapseBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    section.classList.toggle("ranked-list--collapsed", collapsed);
    body.hidden = collapsed;
  };
  collapseBtn.addEventListener("click", () => {
    collapsed = !collapsed;
    applyCollapse();
  });

  // ── Selected-station highlight (reciprocal) ──────────────────────────────────
  const applyHighlight = (): void => {
    const sel = store.get().stationId;
    for (const li of list.querySelectorAll<HTMLElement>("li[data-station]")) {
      const isSel = li.dataset.station === String(sel);
      li.classList.toggle("ranked-list__row--selected", isSel);
      const btn = li.querySelector("button");
      if (btn) btn.setAttribute("aria-current", isSel ? "true" : "false");
    }
  };

  // ── Row builder ───────────────────────────────────────────────────────────────
  const buildRow = (datum: MarkerDatum, rank: number): HTMLLIElement => {
    const li = document.createElement("li");
    li.className = "ranked-list__row";
    li.dataset.station = String(datum.station);

    // The WHOLE row is the ≥44px click target (a native <button> → free keyboard/focus).
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ranked-list__rowbtn";
    btn.dataset.station = String(datum.station);

    const rankEl = document.createElement("span");
    rankEl.className = "ranked-list__rank";
    rankEl.textContent = `${rank}.`;

    // Station name via textContent only (T-05-05: never string-HTML injection —
    // the name is untrusted-by-default even though it originates from a committed data file).
    const nameEl = document.createElement("span");
    nameEl.className = "ranked-list__name";
    nameEl.textContent = datum.name;

    btn.append(rankEl, nameEl);

    // "án úrkomu" badge iff rain did not contribute to the (still-scored) score.
    if (datum.missingRain) {
      const badge = document.createElement("span");
      badge.className = "ranked-list__badge";
      badge.textContent = COPY.aununrkomu;
      btn.appendChild(badge);
    }

    // Score: one-decimal Icelandic comma (reuses the marker-badge formatter). The `!` is safe —
    // rankStations only yields score !== null rows.
    const scoreEl = document.createElement("span");
    scoreEl.className = "ranked-list__score";
    scoreEl.textContent = formatScore(datum.score as number);
    btn.appendChild(scoreEl);

    // Row click → Phase-4 select seam: mark discrete (pushState) THEN set stationId. The easeTo
    // fly-to is main.ts's stationId subscriber (RESEARCH Pattern 2) — NOT here. No chart panel.
    btn.addEventListener("click", () => {
      markDiscrete();
      store.set({ stationId: datum.station });
    });

    li.appendChild(btn);
    return li;
  };

  // ── Refresh: re-rank + rebuild rows (or render the empty state) ───────────────
  const refresh = (): void => {
    const ranked = rankStations(getLatestData());
    list.replaceChildren();
    if (ranked.length === 0) {
      list.hidden = true;
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    list.hidden = false;
    ranked.forEach((d, i) => list.appendChild(buildRow(d, i + 1)));
    applyHighlight();
  };

  // Subscribe for the selected-row highlight only (stationId primitive → cheap, WR-04). Data
  // updates come via refresh() from main.ts's recompute hook, not from this subscription.
  store.subscribe(applyHighlight);

  applyCollapse();
  refresh();

  return { refresh };
}
