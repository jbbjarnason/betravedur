/**
 * Station markers — the hybrid symbol-collision + composite-pill renderer (MAP-02, MAP-04).
 *
 * WHY HYBRID (RESEARCH Pattern 3 / Anti-Patterns / Pitfall 5): mounting one DOM marker per
 * station is the mobile-perf pitfall — hundreds of nodes, no declutter. Instead a MapLibre
 * `symbol` layer owns PLACEMENT and native COLLISION (`text-allow-overlap:false` +
 * `symbol-sort-key`), giving zoom-adaptive density for free (MAP-04). The text glyph is an
 * invisible footprint proxy (`text-opacity:0`); the rich white-pill composite is drawn as a
 * DOM overlay ONLY for the post-collision SURVIVORS returned by `queryRenderedFeatures`.
 * The survivor count is bounded by the viewport + collision, so the overlay never grows to
 * hundreds of nodes.  `maplibregl.Marker` is deliberately NOT used (grep-gated).
 *
 * The pure helpers (`toFeatureCollection`, `formatCallout`) are unit-tested in markers.test.ts
 * with no map/DOM dependency; the map-facing functions (`installMarkerLayer`, `renderComposite`)
 * are exercised by the Playwright E2E on the preview build.
 */
import type * as maplibregl from "maplibre-gl";
import type { MarkerDatum } from "../data/types.js";
import { scoreColor } from "./score-color.js";

// ── Pure helpers (unit-tested) ──────────────────────────────────────────────

/**
 * Format a 0-10 score as the Icelandic one-decimal comma string used on the pill badge
 * and the ranked list (`7,8`, `10,0`, `0,0`). One decimal matches the domain's rounding;
 * the comma is the Icelandic decimal separator (UI-SPEC Copywriting: never `7.8`).
 *
 * Pure + total: a null/NaN score is never passed here (the caller branches on the muted /
 * score===null path first), but a stray non-finite input clamps to `0,0` so the badge can
 * never render `NaN,` — belt-and-suspenders over the number|null contract (T-05-03: the
 * numeral is always a formatted number, never a reflected string).
 *
 * IN-03 (accuracy note, not load-bearing): every current caller already passes a finite
 * combine()-produced number, so the `Number.isFinite` branch is unreachable in practice today.
 * It is retained as intentional hardening against a future caller — NOT relied upon by any
 * present code path. Do not read the guard as a live invariant.
 */
export function formatScore(score: number): string {
  const n = Number.isFinite(score) ? Math.max(0, Math.min(10, score)) : 0;
  return n.toFixed(1).replace(".", ",");
}

/** Feature properties carried on each station anchor. */
export interface MarkerFeatureProps {
  /** Collision-footprint proxy text, e.g. "7°" (or "—" when insufficient). */
  label: string;
  /** Integer station id (queryable — the Phase-6 click seam). */
  station: number;
  /** Stable collision sort key (lower wins). */
  priority: number;
  /** Serialized datum so `renderComposite` can rebuild the pill from a query hit. */
  datum: string;
}

/** A GeoJSON Point feature for one station anchor. */
export interface MarkerFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: MarkerFeatureProps;
}

/** A GeoJSON FeatureCollection of station anchors. */
export interface MarkerFeatureCollection {
  type: "FeatureCollection";
  features: MarkerFeature[];
}

/** Round a temperature to an integer degree label ("7°", "-4°"). */
function tempLabel(d: MarkerDatum): string {
  if (!d.sufficient || d.tempC === null) return "—";
  return `${Math.round(d.tempC)}°`;
}

/**
 * Build the GeoJSON FeatureCollection that drives the symbol collision layer.
 * One feature per datum; the `label` is the collision-footprint proxy (rendered
 * invisibly), and the full datum is serialized into properties so the composite
 * renderer can rebuild the pill for each post-collision survivor.
 */
export function toFeatureCollection(data: MarkerDatum[]): MarkerFeatureCollection {
  return {
    type: "FeatureCollection",
    features: data.map((d) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [d.lon, d.lat] as [number, number] },
      properties: {
        label: tempLabel(d),
        station: d.station,
        priority: d.priority,
        datum: JSON.stringify(d),
      },
    })),
  };
}

/**
 * Inline wind-arrow SVG rotated to point the direction the wind blows TOWARD.
 *
 * WIND CONVENTION (PINNED — locked by the windArrowSvg test in markers.test.ts):
 *   `windDir` (from Veðurstofan `dv`, Icelandic *vindátt*) is the direction the wind blows
 *   FROM — standard meteorological convention. Live-verified in 01-RESEARCH.md: the sample
 *   AWS row `dv:151.0, dv_txt:"SSE"` (SSE ≈ 157.5°) shows the numeric and its compass label
 *   agree on the SOURCE direction, confirming dv = direction FROM.
 *   DECISION (trip-planner intuition "which way is it blowing"): the arrow points the direction
 *   the wind blows TOWARD, so we rotate by `dv + 180`. E.g. a north wind (dv=0, blowing FROM the
 *   north) renders an arrow pointing SOUTH (180°).
 * `windDir` is in compass degrees (0 = North, clockwise); an SVG `rotate(deg)` about the glyph
 * centre maps 0° to the upward (North-pointing) base arrow. Keep this consistent with any later
 * wind rose.
 */
function windArrowSvg(windDir: number): string {
  // +180: dv is the FROM direction (met convention); the arrow points TOWARD.
  const deg = (((windDir + 180) % 360) + 360) % 360;
  // Base arrow points UP (toward North / 0°); rotate about the 12×12 centre.
  return (
    `<svg class="marker-wind-arrow" width="12" height="12" viewBox="0 0 12 12" ` +
    `aria-hidden="true" focusable="false">` +
    `<g transform="rotate(${deg} 6 6)">` +
    `<path d="M6 1 L9.5 8 L6 6.3 L2.5 8 Z" fill="currentColor"/>` +
    `</g></svg>`
  );
}

/** Inline precipitation-drop SVG (muted ink; shape is the signal, not colour). */
function precipSvg(): string {
  return (
    `<svg class="marker-precip" width="12" height="12" viewBox="0 0 12 12" ` +
    `aria-hidden="true" focusable="false">` +
    `<path d="M6 1.5 C6 1.5 2.5 6 2.5 8 a3.5 3.5 0 0 0 7 0 C9.5 6 6 1.5 6 1.5 Z" ` +
    `fill="currentColor"/></svg>`
  );
}

/**
 * Build the composite callout markup for one station.
 *
 * Returns `{ html, muted }`. Layout (left→right, gap --space-xs): temperature °C in accent
 * red → wind (rotated arrow + integer m/s, OR the "breytileg átt" label when windVariable) →
 * precip drop glyph (omitted entirely when `!hasPrecip` — the "án úrkomu" signal). When
 * `!sufficient`, the whole pill is a muted "ófullnægjandi gögn" state: no accent-red temp,
 * no arrow. Color is never the sole channel — the ° glyph, m/s unit, arrow, and drop shape
 * each carry meaning without hue.
 */
export function formatCallout(d: MarkerDatum): { html: string; muted: boolean } {
  if (!d.sufficient) {
    // Muted state: honesty vocabulary, no accent-red temp, no arrow.
    return {
      muted: true,
      html: `<span class="marker-empty">ófullnægjandi gögn</span>`,
    };
  }

  const parts: string[] = [];

  // Temperature — accent red numeral with the ° glyph.
  if (d.tempC !== null) {
    parts.push(`<span class="marker-temp">${Math.round(d.tempC)}°</span>`);
  }

  // Wind — rotated arrow + speed, or the variable-direction label.
  // IN-01: for data from computeMarkerDatum, `windDir === null` is already implied by
  // `windVariable` (the producer sets them together). The `|| d.windDir === null` is a
  // deliberate defensive belt-and-braces for externally-constructed data — it guarantees
  // we never call windArrowSvg(null) even if a future producer sets one without the other.
  if (d.windVariable || d.windDir === null) {
    const speed =
      d.windSpeed !== null
        ? `<span class="marker-wind-speed">${Math.round(d.windSpeed)}<span class="marker-unit">&nbsp;m/s</span></span>`
        : "";
    parts.push(`<span class="marker-wind"><span class="marker-variable">breytileg átt</span>${speed}</span>`);
  } else {
    const speed =
      d.windSpeed !== null
        ? `<span class="marker-wind-speed">${Math.round(d.windSpeed)}<span class="marker-unit">&nbsp;m/s</span></span>`
        : "";
    parts.push(`<span class="marker-wind">${windArrowSvg(d.windDir)}${speed}</span>`);
  }

  // Precipitation — present only when hasPrecip (absence = "án úrkomu").
  if (d.hasPrecip) {
    parts.push(precipSvg());
  }

  return { muted: false, html: parts.join("") };
}

// ── Map integration (E2E-tested) ────────────────────────────────────────────

const SOURCE_ID = "stations";
const LAYER_ID = "station-anchors";
const OVERLAY_ID = "marker-overlay";

/**
 * Add (or refresh) the GeoJSON source + the invisible symbol collision layer.
 *
 * The symbol layer's ONLY job is native placement/collision: `text-allow-overlap:false`
 * declutters so no two survivors overlap, `symbol-sort-key` makes major stations (low
 * priority) win deterministically, and `text-opacity:0` hides the proxy glyph (the visible
 * pill is drawn by `renderComposite`). Re-callable: a Phase-4 period change just re-sets the
 * GeoJSON `data` and re-runs the idle render — no re-architecting.
 */
export function installMarkerLayer(map: maplibregl.Map, data: MarkerDatum[]): void {
  const fc = toFeatureCollection(data);
  const existing = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (existing) {
    // maplibre's setData accepts a GeoJSON FeatureCollection; our shape is a strict subset.
    existing.setData(fc as unknown as Parameters<maplibregl.GeoJSONSource["setData"]>[0]);
    return;
  }

  map.addSource(SOURCE_ID, {
    type: "geojson",
    data: fc as unknown as maplibregl.GeoJSONSourceSpecification["data"],
  });

  map.addLayer({
    id: LAYER_ID,
    type: "symbol",
    source: SOURCE_ID,
    layout: {
      "text-field": ["get", "label"],
      "text-size": 13,
      "text-font": ["Noto Sans Regular"],
      "text-allow-overlap": false, // native declutter — no two survivors overlap
      "text-ignore-placement": false,
      // A small collision padding so genuinely-coincident stations thin slightly at low zoom without
      // over-decluttering the national field (kept modest: the ranked list still surfaces every
      // station, and each visible marker stays individually reachable). NOT large enough to hide a
      // distinct nearby station's marker — the overlapping-sample case is a 2-station preview
      // artifact that the national dataset does not exhibit.
      "text-padding": 4,
      "symbol-sort-key": ["get", "priority"], // major stations (low priority) win
      "text-optional": true,
    },
    paint: {
      "text-opacity": 0, // proxy hidden; the overlay draws the visible pill
    },
  });
}

/** Ensure the single absolutely-positioned overlay container exists over the map. */
function ensureOverlay(map: maplibregl.Map): HTMLElement {
  const parent = map.getContainer();
  let overlay = parent.querySelector<HTMLElement>(`#${OVERLAY_ID}`);
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.className = "marker-overlay";
    parent.appendChild(overlay);
  }
  return overlay;
}

/**
 * The currently-selected station id (Phase-5 reciprocal highlight), or null. When a ranked-row
 * (or, in Phase 6, a marker) selects a station, main.ts calls setSelectedStation() and re-renders;
 * buildPill thickens THAT station's ring (`marker-pill--selected`) so the marker and the
 * `--dominant`-filled ranked row stay visibly in sync. Module-level (not per-datum) because the
 * survivor set is rebuilt from queryRenderedFeatures on every move/idle — a single source the
 * next render reads. Selection is a pure highlight: it never enters the score/recompute path.
 */
let selectedStationId: number | null = null;

/**
 * Set the highlighted station and let the caller trigger a re-render (main.ts calls
 * renderComposite right after). A no-op-return keeps a redundant set cheap. Exposed so the
 * Phase-4 stationId subscriber can drive the reciprocal marker highlight without markers.ts
 * importing the store.
 */
export function setSelectedStation(station: number | null): void {
  selectedStationId = station;
}

/** Build one focus-ready pill element for a survivor datum. */
function buildPill(map: maplibregl.Map, datum: MarkerDatum): HTMLElement {
  const { html, muted } = formatCallout(datum);
  // Focus-ready skeleton (Phase-6 seam): a <button> with a queryable data-station id,
  // but NO click handler this phase.
  const pill = document.createElement("button");
  pill.type = "button";
  pill.className = muted ? "marker-pill marker-pill--muted" : "marker-pill";
  pill.dataset.station = String(datum.station);
  // Per-marker honest coverage (UI-SPEC meðaltal N ára): surface THIS station's qualifying-year
  // count in the pill's aria-label so a screen-reader user on an individual marker hears its
  // coverage, not just the name. N reflects the station's own qualifying years (MarkerDatum.n),
  // never the picker span; insufficient stations carry the ófullnægjandi gögn honesty signal.
  //
  // UI-REVIEW (color-not-sole-channel for screen readers): a SCORED pill also announces its
  // score in the accessible name, so the numeral channel exists for AT users too — the badge
  // itself stays aria-hidden (its numeral would otherwise double-read), and the score rides on
  // the pill wrapper's label. The án-úrkomu / ófullnægjandi variants are unaffected (they carry
  // their honesty vocabulary), keeping "color is never the sole channel" true on the map layer.
  let ariaLabel: string;
  if (!datum.sufficient) {
    ariaLabel = `${datum.name}: ófullnægjandi gögn`;
  } else if (datum.score !== null) {
    ariaLabel = `${datum.name}: meðaltal ${datum.n} ára, einkunn ${formatScore(datum.score)}`;
  } else {
    ariaLabel = `${datum.name}: meðaltal ${datum.n} ára`;
  }
  pill.setAttribute("aria-label", ariaLabel);
  // Phase 6 activation: the pill enters the tab order so a keyboard user can select a station
  // (Enter/Space) to open the station chart panel. The click/keyboard handler is NOT bound here
  // (markers.ts stays store-free, RESEARCH Pattern 2) — main.ts delegates from #marker-overlay,
  // reading the queryable data-station id, exactly like the ranked-row select seam.
  pill.tabIndex = 0;
  pill.innerHTML = html;

  // Score channels (MAP-03): a SCORED pill (score !== null, sufficient ⇒ !muted) gains
  // (1) a BuGn score-ramp left-bar/ring via the inline --pill-score custom property and the
  //     `marker-pill--scored` class (score.css draws the bar over a --hairline floor), and
  // (2) an always-visible numeric score badge (ink-on-white chip, ring color redundant).
  // The muted (score:null / ófullnægjandi gögn) branch is untouched — no --pill-score, no
  // class, no badge — so it renders byte-identical to the Phase-3 muted pill (regression-safe;
  // T-05-04: null/muted pills never enter the ramp path).
  if (!muted && datum.score !== null) {
    pill.style.setProperty("--pill-score", scoreColor(datum.score));
    pill.classList.add("marker-pill--scored");
    const badge = document.createElement("span");
    badge.className = "marker-score-badge";
    // T-05-03: the numeral is a formatted number written via textContent — never raw markup,
    // never a reflected data string.
    badge.textContent = formatScore(datum.score);
    badge.setAttribute("aria-hidden", "true"); // coverage/name already in the pill aria-label
    pill.prepend(badge);
  }

  // Reciprocal highlight (Phase 5): the selected station's pill gets a thickened ring so it
  // matches the --dominant-filled ranked row. Pure presentation — applies to muted pills too
  // (a selected-but-unscorable station still visibly highlights), never touches the ramp.
  if (selectedStationId !== null && datum.station === selectedStationId) {
    pill.classList.add("marker-pill--selected");
  }

  const { x, y } = map.project([datum.lon, datum.lat]);
  pill.style.left = `${x}px`;
  pill.style.top = `${y}px`;
  return pill;
}

/**
 * Draw the composite pills for the CURRENT post-collision survivors.
 *
 * Queries the symbol layer for the features MapLibre actually placed (after collision),
 * dedupes by station id, and replaces the overlay's children in one pass — never
 * accumulating stale nodes across moves. The survivor set is bounded by the viewport and
 * the collision layer, so this is not "hundreds of DOM nodes".
 */
export function renderComposite(map: maplibregl.Map): void {
  const overlay = ensureOverlay(map);
  let placed: maplibregl.MapGeoJSONFeature[];
  try {
    placed = map.queryRenderedFeatures({ layers: [LAYER_ID] });
  } catch {
    // Layer not ready yet (early idle before style settles) — nothing to draw.
    return;
  }

  const seen = new Set<number>();
  const frag = document.createDocumentFragment();
  for (const f of placed) {
    const raw = f.properties?.datum;
    if (typeof raw !== "string") continue;
    let datum: MarkerDatum;
    try {
      datum = JSON.parse(raw) as MarkerDatum;
    } catch {
      continue; // defensive — a malformed property never breaks the render loop (T-03-06)
    }
    if (seen.has(datum.station)) continue;
    seen.add(datum.station);
    frag.appendChild(buildPill(map, datum));
  }

  // Single-pass replace: no stale pills leak across moves (T-03-07 overlay-bound).
  overlay.replaceChildren(frag);
}

/**
 * The `idle`/`move` handler pair currently attached per map, so a re-invocation can
 * detach the prior pair before wiring a fresh one (WR-04) rather than stacking. Keyed
 * by map so multiple maps never cross-contaminate; entries are GC'd with the map.
 */
const ATTACHED_HANDLERS = new WeakMap<maplibregl.Map, () => void>();

/**
 * Wire the composite renderer to the map lifecycle: draw on `idle` (after collision
 * settles) and keep pills glued to the basemap on every `move`. Decoupled from the data
 * source so a period change (Phase 4) just calls installMarkerLayer + a fresh render.
 *
 * IDEMPOTENT (WR-04): re-invoking this (e.g. the Phase-4 period selector re-running the
 * wire flow) detaches any handler pair a prior call attached and installs exactly one
 * fresh pair — the `idle`/`move` listeners never accumulate, so each map event triggers
 * a single queryRenderedFeatures + DOM rebuild, not one per historical attach.
 */
export function attachCompositeRenderer(map: maplibregl.Map): void {
  const prior = ATTACHED_HANDLERS.get(map);
  if (prior) {
    // Remove the previously-attached pair before re-wiring so handlers don't stack.
    map.off("idle", prior);
    map.off("move", prior);
  }
  const draw = (): void => renderComposite(map);
  map.on("idle", draw);
  map.on("move", draw);
  ATTACHED_HANDLERS.set(map, draw);
}
