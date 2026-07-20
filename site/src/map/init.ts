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
    center: [-19.0, 65.0], // UI-SPEC: Iceland
    zoom: 6,
    minZoom: 4,
    maxZoom: 12,
    maxBounds: [
      [-26, 62.5],
      [-12, 67.5],
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

  return map;
}
