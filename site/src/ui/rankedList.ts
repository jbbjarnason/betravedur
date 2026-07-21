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
import { setDiscrete } from "../state/history.js";
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
  /**
   * YIELD the panel to the station chart panel (Phase 6): `setYielded(true)` hides the whole
   * `section.ranked-list` (the two right-docked panels never render simultaneously at rest);
   * `setYielded(false)` restores it. This is HIDE-not-destroy — the collapsed/expanded state,
   * the row subscriptions, and the selected-row highlight all survive a yield, so on close the
   * list reappears exactly as it was (UI-SPEC "Ranked-list yield"). It never touches
   * `refresh()`'s reconcile state or the store subscription.
   */
  setYielded(yielded: boolean): void;
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

  // ── Mobile chip (< 640px): a compact toggle labeled "Bestu staðir" ───────────────
  // On mobile the right-docked list would crowd the map, so it collapses to a chip that toggles
  // the list body as an overlay (UI-SPEC Responsive region table). CSS hides this chip on desktop
  // (the full list shows) and hides the header on mobile (the chip owns the label). A native
  // <button> → free keyboard/focus; the accessible name IS the label so getByRole("button",
  // { name: "Bestu staðir" }) resolves it (criterion 5). ≥44px hit target (score.css).
  const bodyId = "ranked-list-body";
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "ranked-list__chip";
  chip.textContent = COPY.title; // accessible name = "Bestu staðir"
  chip.setAttribute("aria-controls", bodyId);
  chip.setAttribute("aria-expanded", "false");
  section.appendChild(chip);

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
  body.id = bodyId;
  body.append(list, empty);

  section.append(header, body);
  parent.appendChild(section);

  // ── Mobile chip toggle: open/close the list overlay (< 640px) ─────────────────
  // A `.ranked-list--chip-open` class on the section drives the CSS that shows the body as an
  // overlay when the chip is tapped. On desktop the chip is `display:none` (CSS) so this state is
  // inert. The chip stays collapsed while the sheet is open (setYielded hides the whole section).
  const setChipOpen = (open: boolean): void => {
    chip.setAttribute("aria-expanded", open ? "true" : "false");
    section.classList.toggle("ranked-list--chip-open", open);
  };
  chip.addEventListener("click", () => {
    setChipOpen(chip.getAttribute("aria-expanded") !== "true");
  });

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
  // A row's identity is its immutable station id (li.dataset.station). refresh() reconciles by
  // that key rather than rebuilding, so buildRow creates the stable skeleton once and
  // updateRow mutates only the rank/score/badge that actually change between recomputes.
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

    // Station name via textContent only (T-05-05: never string-HTML injection —
    // the name is untrusted-by-default even though it originates from a committed data file).
    const nameEl = document.createElement("span");
    nameEl.className = "ranked-list__name";

    btn.append(rankEl, nameEl);

    // Score: one-decimal Icelandic comma (reuses the marker-badge formatter). Appended last so
    // the optional "án úrkomu" badge (inserted by updateRow before it) always sits to its left.
    const scoreEl = document.createElement("span");
    scoreEl.className = "ranked-list__score";
    btn.appendChild(scoreEl);

    // Row click → Phase-4 select seam: discrete (pushState) set of stationId. setDiscrete arms
    // the discrete-history flag ONLY when the station actually changes, so re-clicking the
    // already-selected "best place" is a clean store no-op that never leaves the flag dangling
    // (WR-01). The easeTo fly-to is main.ts's stationId subscriber (RESEARCH Pattern 2) — NOT
    // here. No chart panel. The listener binds the immutable station id, so a reconciled row
    // that survives a refresh keeps a correct handler (it never needs re-binding).
    btn.addEventListener("click", () => {
      setDiscrete(store, { stationId: datum.station });
    });

    li.appendChild(btn);
    updateRow(li, datum, rank);
    return li;
  };

  /**
   * Mutate an existing row's variable parts (rank, name, "án úrkomu" badge, score) in place.
   * WR-02: reconcile-in-place keeps the row's <button> node identity stable, so a focused row
   * (keyboard user) and the list scroll offset survive a recompute — a rebuild would discard the
   * focused node (focus falls to <body>) and reset scroll. The station id never changes for a
   * given row (rows are keyed by it), so only these fields are updated.
   */
  const updateRow = (li: HTMLLIElement, datum: MarkerDatum, rank: number): void => {
    const btn = li.querySelector<HTMLButtonElement>("button")!;
    const rankEl = btn.querySelector<HTMLElement>(".ranked-list__rank")!;
    const nameEl = btn.querySelector<HTMLElement>(".ranked-list__name")!;
    const scoreEl = btn.querySelector<HTMLElement>(".ranked-list__score")!;

    const rankText = `${rank}.`;
    if (rankEl.textContent !== rankText) rankEl.textContent = rankText;
    if (nameEl.textContent !== datum.name) nameEl.textContent = datum.name;

    // "án úrkomu" badge iff rain did not contribute to the (still-scored) score. Toggle it in
    // place (add/remove) so the reconcile never rebuilds the row for a missingRain flip.
    let badge = btn.querySelector<HTMLElement>(".ranked-list__badge");
    if (datum.missingRain && !badge) {
      badge = document.createElement("span");
      badge.className = "ranked-list__badge";
      badge.textContent = COPY.aununrkomu;
      btn.insertBefore(badge, scoreEl); // keep the score last (rightmost)
    } else if (!datum.missingRain && badge) {
      badge.remove();
    }

    // Score: rankStations only yields score !== null rows, so the `as number` is sound.
    const scoreText = formatScore(datum.score as number);
    if (scoreEl.textContent !== scoreText) scoreEl.textContent = scoreText;

    // C.1: give the row button a distinct human-readable accessible name so a screen reader reads
    // "1. Reykjavík, einkunn 8,5" instead of the concatenated span text "1.Reykjavík8,5". Matches
    // the marker aria phrasing (markers.ts: "...einkunn ${formatScore(score)}"). Rebuilt here on
    // every recompute so rank/name/score/missingRain changes stay reflected. Set via aria-label
    // string assignment only (no innerHTML) — T-05-05 name-injection discipline preserved.
    const rainSuffix = datum.missingRain ? `, ${COPY.aununrkomu}` : "";
    btn.setAttribute("aria-label", `${rank}. ${datum.name}, einkunn ${scoreText}${rainSuffix}`);
  };

  // ── Refresh: re-rank + reconcile rows in place (or render the empty state) ─────
  // WR-02: instead of list.replaceChildren() (which discards keyboard focus + scroll on every
  // recompute), diff the ranked set against the existing li[data-station] nodes: update the
  // survivors in place, append the newcomers, remove the departed, and finally reorder so the
  // DOM order matches the new ranking. A focused/scrolled row therefore survives a recompute.
  const refresh = (): void => {
    const ranked = rankStations(getLatestData());
    if (ranked.length === 0) {
      list.replaceChildren();
      list.hidden = true;
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    list.hidden = false;

    // Index the existing rows by station id.
    const existing = new Map<string, HTMLLIElement>();
    for (const li of list.querySelectorAll<HTMLLIElement>("li[data-station]")) {
      existing.set(li.dataset.station as string, li);
    }

    // Update-or-create each ranked row and collect the desired node order.
    const desired: HTMLLIElement[] = [];
    const keep = new Set<string>();
    ranked.forEach((d, i) => {
      const key = String(d.station);
      keep.add(key);
      let li = existing.get(key);
      if (li) {
        updateRow(li, d, i + 1);
      } else {
        li = buildRow(d, i + 1);
      }
      desired.push(li);
    });

    // Remove departed rows (in the ranking last recompute, gone now).
    for (const [key, li] of existing) {
      if (!keep.has(key)) li.remove();
    }

    // Reorder in place to match the new ranking. insertBefore is a MOVE for an already-attached
    // node (the node is NOT recreated), so a focused/scrolled survivor keeps its identity — and
    // therefore its focus — even when its rank changes. Walk the desired order position by
    // position: if the node currently at position i isn't the desired one, move the desired node
    // into place before it. Nodes already in the right slot are left untouched (no-op moves).
    desired.forEach((li, i) => {
      const current = list.childNodes[i];
      if (current !== li) list.insertBefore(li, current ?? null);
    });

    applyHighlight();
  };

  // Subscribe for the selected-row highlight only (stationId primitive → cheap, WR-04). Data
  // updates come via refresh() from main.ts's recompute hook, not from this subscription.
  store.subscribe(applyHighlight);

  // ── Yield/restore for the Phase-6 station panel ───────────────────────────────
  // Hide the whole section (not the body, not the state) while the station chart panel is open,
  // and restore it on close. Toggling `hidden` on the section leaves `collapsed`, the row nodes,
  // the store subscription, and the reconcile map untouched — a pure show/hide so the list comes
  // back exactly as the user left it. A `.ranked-list--yielded` class is added redundantly for
  // any CSS hook, but `hidden` is the load-bearing signal (E2E asserts toBeHidden/toBeVisible).
  const setYielded = (yielded: boolean): void => {
    section.hidden = yielded;
    section.classList.toggle("ranked-list--yielded", yielded);
    // While the station sheet is open the ranked chip stays COLLAPSED (only one station-focused
    // surface is expanded at a time — the mobile analog of the desktop ranked-list yield).
    if (yielded) setChipOpen(false);
  };

  applyCollapse();
  refresh();

  return { refresh, setYielded };
}
