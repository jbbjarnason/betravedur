/**
 * Boot the Betra Veður site shell: mount the header, init the Iceland map, wire the
 * attribution. Markers are added in Plans 02/03 — a documented seam is left below.
 */
import "./styles/tokens.css";
import { renderHeader } from "./ui/header.js";
import { initMap } from "./map/init.js";

function boot(): void {
  const headerMount = document.querySelector<HTMLElement>("header");
  const mapMount = document.getElementById("map");
  if (!headerMount || !mapMount) {
    throw new Error("Missing #map or <header> mount in index.html");
  }

  renderHeader(headerMount);
  const map = initMap(mapMount);

  // Expose the map for E2E interactivity assertions (UI-SPEC criterion 9).
  (window as unknown as { __map: unknown }).__map = map;

  // --- SEAM (Plans 02/03): station markers ---
  // map.on("load", () => loadStations(map));
  // loadStations() will: fetch stations.json + manifest.json (BASE_URL-prefixed),
  // resolve hashed derived filenames, decodeDerived (@betravedur/pipeline/derive),
  // compute period averages via @betravedur/domain, and attach a symbol layer +
  // hybrid composite renderer. No marker code this phase.
}

boot();
