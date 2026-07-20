/**
 * Boot the Betra Veður site shell: mount the header, init the Iceland map, wire the
 * attribution, then load the station data and render the markers (MAP-02, MAP-04).
 *
 * MARKER FLOW (Plan 03): after the map style loads, fetch stations.json + manifest.json
 * (BASE_URL-prefixed), resolve each station's content-hashed derived file, decode +
 * average it into a MarkerDatum (via the pure Plan-02 producer), install the symbol
 * collision layer, and attach the hybrid composite renderer. Insufficient stations are
 * EMITTED (muted "ófullnægjandi gögn"), never filtered — so the map is honest and never
 * white-screens on a missing/malformed file (each station degrades independently).
 */
import "./styles/tokens.css";
import "./styles/markers.css";
import { renderHeader } from "./ui/header.js";
import { initMap } from "./map/init.js";
import { DEFAULT_WINDOW, type MarkerDatum } from "./data/types.js";
import { loadStations, loadManifest, loadDerived, resolveDerivedFile } from "./data/load.js";
import { computeMarkerDatum } from "./data/averages.js";
import { installMarkerLayer, attachCompositeRenderer } from "./map/markers.js";
import type * as maplibregl from "maplibre-gl";

const BASE = import.meta.env.BASE_URL;

/**
 * Fetch + decode + average every station into a MarkerDatum[]. Each station is guarded
 * independently: a missing manifest entry or a malformed/failed derived fetch degrades
 * THAT station to a muted callout (never dropping it, never white-screening the page).
 */
async function loadMarkerData(): Promise<MarkerDatum[]> {
  const [stations, manifest] = await Promise.all([loadStations(BASE), loadManifest(BASE)]);

  const data = await Promise.all(
    stations.map(async (meta): Promise<MarkerDatum | null> => {
      try {
        const file = resolveDerivedFile(manifest, meta.station);
        if (!file) return mutedDatum(meta);
        const derived = await loadDerived(BASE, file);
        return computeMarkerDatum(meta, derived, DEFAULT_WINDOW);
      } catch {
        // A single bad file must not sink the whole map (T-03-06) — emit it muted.
        return mutedDatum(meta);
      }
    }),
  );

  return data.filter((d): d is MarkerDatum => d !== null);
}

/** A muted, insufficient datum for a station whose derived data could not be resolved. */
function mutedDatum(meta: { station: number; name: string; lon: number; lat: number }): MarkerDatum {
  return {
    station: meta.station,
    name: meta.name,
    lon: meta.lon,
    lat: meta.lat,
    tempC: null,
    windSpeed: null,
    windDir: null,
    windVariable: true,
    hasPrecip: false,
    n: 0,
    sufficient: false,
    priority: 9999,
  };
}

/** Wire the load → source → composite flow once the map style is ready. */
function wireMarkers(map: maplibregl.Map): void {
  const install = async (): Promise<void> => {
    try {
      const data = await loadMarkerData();
      installMarkerLayer(map, data);
      attachCompositeRenderer(map);
    } catch (err) {
      // Defensive: the shell (map + header + attribution) stays up even if data load fails.
      console.error("[betravedur] marker load failed", err);
    }
  };
  if (map.isStyleLoaded()) void install();
  else map.once("load", () => void install());
}

function boot(): void {
  const headerMount = document.querySelector<HTMLElement>("header");
  const mapMount = document.getElementById("map");
  if (!headerMount || !mapMount) {
    throw new Error("Missing #map or <header> mount in index.html");
  }

  renderHeader(headerMount);
  const map = initMap(mapMount);

  // Expose the map for E2E interactivity assertions (UI-SPEC criteria 9, 10).
  (window as unknown as { __map: unknown }).__map = map;

  wireMarkers(map);
}

boot();
