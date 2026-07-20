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
import "./styles/score.css";
import "./styles/panel.css";
import { renderHeader } from "./ui/header.js";
import { mountLegend } from "./ui/legend.js";
import { initMap } from "./map/init.js";
import { type MarkerDatum } from "./data/types.js";
import {
  loadStations,
  loadManifest,
  loadDerived,
  resolveDerivedFile,
  type Manifest,
} from "./data/load.js";
import {
  installMarkerLayer,
  attachCompositeRenderer,
  renderComposite,
  setSelectedStation,
} from "./map/markers.js";
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
import { mountControlBar, type ControlBarHandle } from "./ui/controlBar.js";
import { mountRankedList, type RankedListHandle } from "./ui/rankedList.js";
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
 * The mounted control bar's handle (set once mountControlBar runs). renderForState calls
 * controlBar?.refreshReadout() right after it updates latestData so the "meðaltal N ára" readout
 * reflects the SAME frame the markers show — replacing the old fragile setTimeout(140) poll
 * (WR-01). Null until the bar mounts (the initial renderForState runs just before mount and sets
 * latestData; the bar reads it directly at mount via getLatestData).
 */
let controlBar: ControlBarHandle | null = null;

/**
 * The mounted ranked "Bestu staðir" list handle (set once mountRankedList runs). renderForState
 * calls rankedList?.refresh() right after controlBar?.refreshReadout() so the list re-sorts on
 * the SAME frame the markers do — driven by the recompute choke point, NOT a raw store
 * subscription (which would churn the list on every pan/zoom — RESEARCH Pitfall 5). Null until
 * the panel mounts; the initial renderForState runs just before mount, and mountRankedList reads
 * latestData directly at mount via its getLatestData getter.
 */
let rankedList: RankedListHandle | null = null;

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
  // Refresh the global "meðaltal N ára" readout from THIS frame's data (WR-01: no timer race).
  controlBar?.refreshReadout();
  // Re-sort + re-render the ranked "Bestu staðir" list on the SAME frame as the markers — driven
  // by this recompute choke point, so it updates on selection changes but NOT on viewport-only
  // pan/zoom (RESEARCH Pitfall 5). No fetch: it reads the latestData snapshot above.
  rankedList?.refresh();
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

      // Expose the store for E2E driving (no-network proof, URL-restore assertions). The map
      // itself is exposed synchronously in boot() (see below) so the Phase-3 shell.spec zoom
      // test can read window.__map before this async data load completes (no regression).
      (window as unknown as { __store: unknown }).__store = store;

      // (3) Apply the hydrated viewport, attach the renderer, render the initial selection.
      applyViewport(map, initial);
      attachCompositeRenderer(map); // idempotent (WR-04) — attach once
      renderForState(map, cache, muted, initial); // fills latestData
      // Reflect the hydrated/default state back into the URL so a no-params load is shareable.
      writeUrl(initial);

      // Mount the control bar (bounds + the initial data snapshot now exist). Keep the handle so
      // renderForState can refresh the N readout after each recompute (WR-01, no timer).
      controlBar = mountControlBar(store, bounds, () => latestData);

      // Mount the ranked "Bestu staðir" panel (SCORE-02). It reads the same latestData snapshot
      // via the getter, and renderForState calls rankedList.refresh() after each recompute so the
      // list stays in lockstep with the markers (Pitfall 5). A row click writes stationId (below);
      // this mount does NOT fetch and does NOT touch the camera.
      rankedList = mountRankedList(document.body, store, () => latestData);

      // stationId → easeTo fly-to (RESEARCH Pattern 2 / Pitfall 4): a dedicated subscriber that
      // fires ONLY on a real change to a non-null stationId. It looks the station's lon/lat up in
      // latestData and animates the camera; the resulting moveend writes the viewport through the
      // EXISTING viewportMatches-guarded handler below — no new guard/flag, no camera↔store loop.
      // (Reduced-motion → duration 0 so the jump is instant, continuing the Phase 3/4 rule.)
      let lastStationId = store.get().stationId;
      const reduceMotion =
        typeof matchMedia === "function" &&
        matchMedia("(prefers-reduced-motion: reduce)").matches;
      store.subscribe((state) => {
        if (state.stationId === lastStationId) return; // not a station change → ignore
        lastStationId = state.stationId;
        // Reciprocal marker highlight: update the selected pill's ring (applies on select AND
        // deselect). renderComposite rebuilds the survivors from the current view — cheap, no
        // recompute, no fetch. The easeTo below then re-renders again on moveend anyway.
        setSelectedStation(state.stationId);
        renderComposite(map);
        if (state.stationId === null) return; // deselection: nothing to fly to
        const target = latestData.find((d) => d.station === state.stationId);
        if (!target) return; // unknown/not-yet-rendered station → no-op (defensive)
        map.easeTo({ center: [target.lon, target.lat], duration: reduceMotion ? 0 : 600 });
      });

      // (4) URL-writer: write on EVERY store change (push if discrete-marked, else replace).
      // No isUpdating flag — pushState/replaceState never fire popstate, so this cannot loop.
      store.subscribe((state) => writeUrl(state));

      // (5) Debounced recompute (120ms trailing) — coalesces scrubber ticks, no fetch.
      // WR-02: marker data is a pure function of (anchorDoy, widthDays, yearFrom, yearTil) ONLY —
      // never the viewport. A pan/zoom writes {lng,lat,zoom} into the store, which must NOT trigger
      // a (byte-identical) recompute. Track the last-rendered selection tuple and early-return when
      // no selection-relevant key changed, so viewport-only changes skip recompute (the URL is
      // still written by the separate URL-writer subscriber above).
      const selectionKey = (s: Readonly<SelectionState>): string =>
        `${s.anchorDoy}|${s.widthDays}|${s.yearFrom}|${s.yearTil}`;
      let lastRenderedKey = selectionKey(initial); // the initial render already happened above
      let timer: ReturnType<typeof setTimeout> | undefined;
      store.subscribe((state) => {
        const key = selectionKey(state);
        if (key === lastRenderedKey) return; // viewport-only change → no recompute (WR-02)
        lastRenderedKey = key;
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
      // WR-03: a boot/popstate jumpTo also fires moveend, but the map snaps the camera to values
      // that differ from the stored full-precision lng/lat/zoom by sub-1e-4 bits — enough for the
      // store's strict-=== no-op-skip to NOT skip, emitting a spurious replaceState that overwrites
      // the freshly restored history entry. Guard the OUTBOUND write with viewportMatches so a
      // jump-induced moveend (already matching to display precision) is a genuine no-op.
      map.on("moveend", () => {
        if (viewportMatches(map, store.get())) return; // jumpTo settle → no spurious write (WR-03)
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

  // Mount the score legend (SCORE-03) — static chrome, no store/data dependency, so it mounts
  // once here alongside the header. It docks bottom-left (score.css), above the control bar.
  mountLegend(document.body);

  // Expose the live map instance SYNCHRONOUSLY, immediately after initMap() — the map exists
  // here, before any data loads. Phase 3's shell.spec zoom test reads window.__map right after
  // the canvas is visible (pre-manifest), so this assignment MUST stay in boot() and NOT be
  // deferred into the async install() (which only completes post-manifest-fetch). Moving it
  // into install() regressed shell.spec.ts:62 ("interactivity: zooming in raises the map zoom").
  (window as unknown as { __map: unknown }).__map = map;

  // Store creation + URL hydration + default selection happen inside wireMarkers, AFTER the
  // manifest fetch supplies the year bounds (the default needs data-derived bounds; the URL
  // parse needs those bounds to clamp fra/til). The Plan-01 bootstrap placeholder is gone.
  wireMarkers(map);
}

boot();
