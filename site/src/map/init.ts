/**
 * MapLibre map init: register the pmtiles:// protocol once, construct the Map framed
 * on Iceland (UI-SPEC Map Framing), and attach a configured AttributionControl whose
 * text is sourced from the domain ATTRIBUTION constant.
 *
 * NAMESPACE import (Pitfall 2): `import * as maplibregl` — a default import breaks
 * Vite dev on maplibre-gl 5.x. The preview-build E2E is the A1 production gate.
 */
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import { buildStyle } from "./style.js";
import { attributionHtml } from "../ui/attribution.js";
import { showMapError } from "../ui/states.js";

let protocolRegistered = false;

/** Register the pmtiles protocol exactly once (idempotent across HMR). */
function ensureProtocol(): void {
  if (protocolRegistered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  protocolRegistered = true;
}

/** Create the Iceland map in the given container element. */
export function initMap(container: HTMLElement): maplibregl.Map {
  ensureProtocol();

  const map = new maplibregl.Map({
    container,
    center: [-18.7, 64.9], // UI-SPEC: Iceland (centroid of the island incl. the NW peninsula)
    zoom: 5.4, // frame the whole island with a margin of sea on load
    minZoom: 4.2, // allow a real zoom-OUT (whole island + surrounding sea); was clamped to ~6
    maxZoom: 12,
    // A GENEROUS bound (island + a wide sea margin) instead of a tight box. The old
    // [-26,62.5]..[-12,67.5] box was so tight MapLibre clamped the minimum zoom to ~6, so the map
    // physically could not zoom out. This looser bound keeps the view over the North-Atlantic
    // neighbourhood (never lets you wander off to blank tiles) while leaving room to zoom out and
    // pan around the coast. minZoom (not the bound) now governs how far out you can go.
    maxBounds: [
      [-35, 59.0],
      [-3, 70.5],
    ],
    dragRotate: false, // flat north-up station map
    pitchWithRotate: false,
    attributionControl: false, // a configured control is added below
    style: buildStyle(),
  });

  map.addControl(
    new maplibregl.AttributionControl({
      compact: true,
      customAttribution: attributionHtml(),
    }),
    "bottom-right",
  );

  // v1.1 attribution-occlusion fix: with compact:true MapLibre still AUTO-EXPANDS the credit to a
  // full-width, wrapping bar whenever the map is wide (offsetWidth > 640) by adding
  // `maplibregl-compact-show` at boot. That expanded bar slides under the bottom-left legend AND the
  // bottom-right ranked list at desktop widths (a licensing-legibility bug). Strip the auto-added
  // `-show` once the control mounts so the credit boots COLLAPSED to the small `(i)` toggle — the
  // only state that never occludes a panel. The user can still click `(i)` to expand it (MapLibre
  // re-adds `-show`), and the info panel always carries the full CC BY 4.0 / OSM / Protomaps /
  // Veðurstofa credit as the licensing backstop. Runs after the control's DOM is in place.
  const collapseCredit = (): void => {
    map
      .getContainer()
      .querySelectorAll(".maplibregl-ctrl-attrib.maplibregl-compact-show")
      .forEach((el) => el.classList.remove("maplibregl-compact-show"));
  };
  // The control appends its DOM synchronously on addControl; collapse now and again after the first
  // idle so a late layout pass (which can re-trigger MapLibre's auto-show) is also caught.
  collapseCredit();
  map.once("idle", collapseCredit);

  // UX-05 map-load-error (Phase 3 debt): a MapLibre style / PMTiles / tile failure surfaces here
  // as a visible TEXT alert over the basemap instead of the silent console.error it used to be.
  // The raw error is logged (T-07-01: never rendered into the overlay); the overlay shows only the
  // fixed Icelandic copy. The header + info button stay up (showMapError only paints an overlay).
  map.on("error", (e) => {
    console.error("[betravedur] map error", (e as { error?: unknown })?.error ?? e);
    showMapError("Ekki tókst að hlaða kortið", "Reyndu að hlaða síðunni aftur.");
  });

  return map;
}
