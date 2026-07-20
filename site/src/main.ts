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
import { installMarkerLayer, attachCompositeRenderer, renderComposite } from "./map/markers.js";
import { createStore, type SelectionStore, type SelectionState } from "./state/store.js";
import {
  buildStationCache,
  recompute,
  mutedDatum,
  type StationCache,
  type StationCacheEntry,
} from "./state/recompute.js";
import type * as maplibregl from "maplibre-gl";

const BASE = import.meta.env.BASE_URL;

/** Trailing-debounce for the scrubber-driven recompute (RESEARCH A4) — coalesces rapid ticks. */
const RECOMPUTE_DEBOUNCE_MS = 120;

/**
 * Fetch every station's derived file ONCE at boot and return the {meta, file} pairs the
 * recompute cache is built from. Each station is guarded independently: a missing manifest
 * entry or a malformed/failed fetch degrades THAT station — its {meta} is returned with a
 * `file: null` sentinel so the caller emits a muted datum for it (never dropping it, never
 * white-screening the page). THIS is the sole network read — recompute never re-fetches.
 */
async function loadStationFiles(): Promise<{ entries: StationCacheEntry[]; muted: MarkerDatum[] }> {
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
  return { entries, muted };
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
  installMarkerLayer(map, data);
  renderComposite(map);
}

/**
 * Wire the boot fetch → cache → store-driven recompute flow once the map style is ready.
 * (1) fetch + cache every station's file once, (2) attach the composite renderer once,
 * (3) render the initial selection, (4) subscribe a DEBOUNCED recompute so a store change
 * re-renders over the cache with zero network I/O (SEL-04, RESEARCH Pitfall 2).
 */
function wireMarkers(map: maplibregl.Map, store: SelectionStore): void {
  const install = async (): Promise<void> => {
    try {
      const { entries, muted } = await loadStationFiles();
      const cache = buildStationCache(entries);

      attachCompositeRenderer(map); // idempotent (WR-04) — attach once
      renderForState(map, cache, muted, store.get()); // initial render at boot

      let timer: ReturnType<typeof setTimeout> | undefined;
      store.subscribe((state) => {
        // Debounce ONLY the recompute (120ms trailing) — coalesces scrubber ticks.
        clearTimeout(timer);
        timer = setTimeout(() => renderForState(map, cache, muted, state), RECOMPUTE_DEBOUNCE_MS);
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

  // Temporary bootstrap selection: the DEFAULT_WINDOW summer week (doy 197, 14 days) over a
  // wide placeholder year range, so the boot render matches Phase-3 behaviour exactly.
  // Plan 03 owns default selection + URL — it replaces this with today's-week / last-10-years
  // derived from the current date and the manifest year bounds, plus URL hydration.
  const initial: SelectionState = {
    anchorDoy: DEFAULT_WINDOW.startDoy,
    widthDays: DEFAULT_WINDOW.endDoy - DEFAULT_WINDOW.startDoy + 1,
    yearFrom: 1, // placeholder full range (Plan 03 replaces with data-derived bounds)
    yearTil: 9999,
    stationId: null,
    lng: -19.0,
    lat: 65.0,
    zoom: 6,
  };
  const store = createStore(initial);

  // Expose the map + store for E2E interactivity assertions (UI-SPEC 9/10) and deterministic
  // selection driving (SEL-04 no-network proof: page.evaluate(() => __store.set({...}))).
  (window as unknown as { __map: unknown }).__map = map;
  (window as unknown as { __store: unknown }).__store = store;

  wireMarkers(map, store);
}

boot();
