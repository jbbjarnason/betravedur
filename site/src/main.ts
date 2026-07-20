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
import { type MarkerDatum } from "./data/types.js";
import {
  loadStations,
  loadManifest,
  loadDerived,
  resolveDerivedFile,
  type Manifest,
} from "./data/load.js";
import { installMarkerLayer, attachCompositeRenderer, renderComposite } from "./map/markers.js";
import { createStore, type SelectionState } from "./state/store.js";
import {
  buildStationCache,
  recompute,
  mutedDatum,
  type StationCache,
  type StationCacheEntry,
} from "./state/recompute.js";
import { yearBounds, defaultSelection } from "./state/defaults.js";
import { paramsToState } from "./state/url.js";
import { writeUrl } from "./state/history.js";
import { mountControlBar } from "./ui/controlBar.js";
import type * as maplibregl from "maplibre-gl";

const BASE = import.meta.env.BASE_URL;

/** Trailing-debounce for the scrubber-driven recompute (RESEARCH A4) — coalesces rapid ticks. */
const RECOMPUTE_DEBOUNCE_MS = 120;

/**
 * The latest recomputed MarkerDatum[] — a module-level snapshot the control-bar N readout
 * reads via the getLatestData getter. Updated on EVERY recompute (renderForState below), so
 * the "meðaltal N ára" readout always reflects the frame the markers currently show (the
 * concrete wiring mechanism chosen for the readout — a getter over module state, not an
 * optional signal).
 */
let latestData: MarkerDatum[] = [];

/**
 * Fetch every station's derived file ONCE at boot and return the {meta, file} pairs the
 * recompute cache is built from. Each station is guarded independently: a missing manifest
 * entry or a malformed/failed fetch degrades THAT station — its {meta} is returned with a
 * `file: null` sentinel so the caller emits a muted datum for it (never dropping it, never
 * white-screening the page). THIS is the sole network read — recompute never re-fetches.
 */
async function loadStationFiles(): Promise<{
  entries: StationCacheEntry[];
  muted: MarkerDatum[];
  manifest: Manifest;
}> {
  const [stations, manifest] = await Promise.all([loadStations(BASE), loadManifest(BASE)]);

  const results = await Promise.all(
    stations.map(async (meta) => {
      try {
        const file = resolveDerivedFile(manifest, meta.station);
        if (!file) return { meta, file: null };
        const derived = await loadDerived(BASE, file);
        return { meta, file: derived };
      } catch {
        // A single bad file must not sink the whole map (T-03-06) — mute it, keep the rest.
        return { meta, file: null };
      }
    }),
  );

  const entries: StationCacheEntry[] = [];
  const muted: MarkerDatum[] = [];
  for (const r of results) {
    if (r.file) entries.push({ meta: r.meta, file: r.file });
    else muted.push(mutedDatum(r.meta));
  }
  return { entries, muted, manifest };
}

/**
 * Render markers for the current store state: recompute over the cached files (NO fetch) plus
 * the boot-time muted stations, then re-`setData` the (idempotent) layer and redraw the pills.
 * Reuses installMarkerLayer / renderComposite verbatim — never stacks listeners, never fetches.
 */
function renderForState(
  map: maplibregl.Map,
  cache: StationCache,
  muted: MarkerDatum[],
  state: Readonly<SelectionState>,
): void {
  const data = [...recompute(cache, state), ...muted];
  latestData = data; // snapshot for the control-bar N readout (updates on every recompute)
  installMarkerLayer(map, data);
  renderComposite(map);
}

/** True when the map's current center/zoom already match the state's viewport (to ~4dp). */
function viewportMatches(map: maplibregl.Map, s: Readonly<SelectionState>): boolean {
  const c = map.getCenter();
  const z = map.getZoom();
  return (
    Math.abs(c.lng - s.lng) < 1e-4 &&
    Math.abs(c.lat - s.lat) < 1e-4 &&
    Math.abs(z - s.zoom) < 1e-2
  );
}

/** Push the store's viewport onto the map (boot hydration / popstate restore only). */
function applyViewport(map: maplibregl.Map, s: Readonly<SelectionState>): void {
  if (viewportMatches(map, s)) return; // avoid a redundant moveend → store round-trip
  map.jumpTo({ center: [s.lng, s.lat], zoom: s.zoom }, { animate: false });
}

/**
 * Wire the boot fetch → hydrate → cache → recompute → URL/viewport flow once the map style is
 * ready. This owns the loop-proof URL round-trip (RESEARCH Pattern 2):
 *   (1) fetch + cache every station's file once (the SOLE network read);
 *   (2) derive union year bounds + the default selection, then HYDRATE the store from the URL
 *       (crafted link) or the default (no params) — replacing the Plan-01 bootstrap placeholder;
 *   (3) apply the hydrated viewport to the map (jumpTo), attach the renderer, render initially;
 *   (4) URL-WRITER: on every store change write the URL (pushState if a discrete control marked
 *       it, else replaceState) — write ALWAYS, no isUpdating flag;
 *   (5) DEBOUNCED recompute (120ms) re-renders over the cache with zero network I/O (SEL-04);
 *   (6) POPSTATE: the ONLY URL→store read after boot — re-hydrate + re-apply the viewport;
 *   (7) VIEWPORT SYNC (Pitfall 4): map `moveend` mirrors the camera → store (replaceState); the
 *       map OWNS its viewport during interaction, store→map only on boot/popstate.
 */
function wireMarkers(map: maplibregl.Map): void {
  const install = async (): Promise<void> => {
    try {
      const { entries, muted, manifest } = await loadStationFiles();
      const cache = buildStationCache(entries);

      // (2) Union year bounds + default, then hydrate from the URL (or default when no params).
      const bounds = yearBounds(manifest);
      const fallback = defaultSelection(bounds);
      const initial: SelectionState = location.search
        ? paramsToState(location.search, bounds, fallback)
        : fallback;
      const store = createStore(initial);

      // Expose map + store for E2E driving (no-network proof, URL-restore assertions).
      (window as unknown as { __map: unknown }).__map = map;
      (window as unknown as { __store: unknown }).__store = store;

      // (3) Apply the hydrated viewport, attach the renderer, render the initial selection.
      applyViewport(map, initial);
      attachCompositeRenderer(map); // idempotent (WR-04) — attach once
      renderForState(map, cache, muted, initial); // fills latestData
      // Reflect the hydrated/default state back into the URL so a no-params load is shareable.
      writeUrl(initial);

      // Mount the control bar (bounds + the initial data snapshot now exist).
      mountControlBar(store, bounds, () => latestData);

      // (4) URL-writer: write on EVERY store change (push if discrete-marked, else replace).
      // No isUpdating flag — pushState/replaceState never fire popstate, so this cannot loop.
      store.subscribe((state) => writeUrl(state));

      // (5) Debounced recompute (120ms trailing) — coalesces scrubber ticks, no fetch.
      let timer: ReturnType<typeof setTimeout> | undefined;
      store.subscribe((state) => {
        clearTimeout(timer);
        timer = setTimeout(() => renderForState(map, cache, muted, state), RECOMPUTE_DEBOUNCE_MS);
      });

      // (6) popstate: the ONLY URL→store read after boot. Re-hydrate + restore the viewport.
      window.addEventListener("popstate", () => {
        const restored = paramsToState(location.search, bounds, store.get());
        store.set(restored);
        applyViewport(map, restored);
      });

      // (7) Viewport sync (Pitfall 4): the map owns its camera during interaction; on moveend
      // mirror center/zoom into the store (a replaceState write). The store's no-op-skip +
      // viewportMatches guard keep the boot/popstate jumpTo from re-looping through here.
      map.on("moveend", () => {
        const c = map.getCenter();
        store.set({ lng: c.lng, lat: c.lat, zoom: map.getZoom() });
      });
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

  // Store creation + URL hydration + default selection happen inside wireMarkers, AFTER the
  // manifest fetch supplies the year bounds (the default needs data-derived bounds; the URL
  // parse needs those bounds to clamp fra/til). The Plan-01 bootstrap placeholder is gone.
  wireMarkers(map);
}

boot();
