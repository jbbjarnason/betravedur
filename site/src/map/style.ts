/**
 * Build the MapLibre style object: @protomaps/basemaps grayscale layers over the
 * self-hosted PMTiles vector source, muted toward the UI-SPEC --dominant #E8EBED
 * so the (later) white callouts read as the figure and the land/sea recede.
 *
 * The muting is a pure PAINT edit on the returned layer array — no style fork.
 */
import { layers, namedFlavor } from "@protomaps/basemaps";
import type { LayerSpecification, StyleSpecification } from "maplibre-gl";

/**
 * Two muted base tones so the COASTLINE stays legible (the whole point of a station map).
 * Earlier both land and water were muted to a single --dominant, which erased Iceland's shape:
 * the map read as a flat gray field with floating labels. Keeping the land clearly LIGHTER than
 * the sea restores figure-ground — Iceland reads as a light landmass on a cooler, darker sea —
 * while both stay muted enough that the white station callouts remain the visual figure.
 */
const LAND = "#eef1f2"; /* light neutral land — near white, but not white (callouts still pop) */
const SEA = "#cdd7de"; /* cooler, darker sea so the coast is clearly visible against the land */

/** BASE_URL is statically replaced by Vite ("/betravedur/" in prod, "/" in dev). */
const BASE = import.meta.env.BASE_URL;

/**
 * Recolor the grayscale flavor to the two muted base tones. Water-family fills (+ the low-zoom
 * background, which IS the open sea before water polygons load) become SEA; land-family fills
 * become LAND. Targets layers by id substring (protomaps v4 schema); a pure paint override that
 * leaves geometry/labels untouched.
 */
function muteToDominant(
  baseLayers: LayerSpecification[],
): LayerSpecification[] {
  return baseLayers.map((layer): LayerSpecification => {
    const id = layer.id;
    if (layer.type === "background") {
      // The background shows through as the open ocean at every zoom — make it the SEA tone so
      // the sea reads consistently even where water polygons are sparse / not yet loaded.
      return {
        ...layer,
        paint: { ...layer.paint, "background-color": SEA },
      };
    }
    if (layer.type === "fill" && id.includes("water")) {
      return { ...layer, paint: { ...layer.paint, "fill-color": SEA } };
    }
    if (
      layer.type === "fill" &&
      (id.includes("earth") ||
        id.includes("landcover") ||
        id.includes("landuse") ||
        id.includes("natural"))
    ) {
      return { ...layer, paint: { ...layer.paint, "fill-color": LAND } };
    }
    return layer;
  });
}

/** Compose the full MapLibre style for the Iceland basemap. */
export function buildStyle(): StyleSpecification {
  const pmtilesUrl = `pmtiles://${location.origin}${BASE}iceland.pmtiles`;
  const grayscale = muteToDominant(
    layers("protomaps", namedFlavor("grayscale"), { lang: "is" }),
  );

  return {
    version: 8,
    glyphs:
      "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
    sprite: "https://protomaps.github.io/basemaps-assets/sprites/v4/grayscale",
    sources: {
      protomaps: {
        type: "vector",
        url: pmtilesUrl,
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://protomaps.com">Protomaps</a>',
      },
    },
    layers: grayscale,
  } as StyleSpecification;
}
