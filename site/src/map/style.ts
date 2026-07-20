/**
 * Build the MapLibre style object: @protomaps/basemaps grayscale layers over the
 * self-hosted PMTiles vector source, muted toward the UI-SPEC --dominant #E8EBED
 * so the (later) white callouts read as the figure and the land/sea recede.
 *
 * The muting is a pure PAINT edit on the returned layer array — no style fork.
 */
import { layers, namedFlavor } from "@protomaps/basemaps";
import type { LayerSpecification, StyleSpecification } from "maplibre-gl";

/** UI-SPEC Color: Dominant (60%) map base tone. */
const DOMINANT = "#e8ebed";

/** BASE_URL is statically replaced by Vite ("/betravedur/" in prod, "/" in dev). */
const BASE = import.meta.env.BASE_URL;

/**
 * Push the grayscale flavor's background/water/land fills toward --dominant so the
 * basemap reads muted. Targets layers by id substring (protomaps v4 schema); a pure
 * paint override, leaving geometry/labels untouched.
 */
function muteToDominant(
  baseLayers: LayerSpecification[],
): LayerSpecification[] {
  return baseLayers.map((layer): LayerSpecification => {
    const id = layer.id;
    if (layer.type === "background") {
      return {
        ...layer,
        paint: { ...layer.paint, "background-color": DOMINANT },
      };
    }
    if (
      layer.type === "fill" &&
      (id.includes("water") ||
        id.includes("earth") ||
        id.includes("landcover") ||
        id.includes("landuse") ||
        id.includes("natural"))
    ) {
      return { ...layer, paint: { ...layer.paint, "fill-color": DOMINANT } };
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
