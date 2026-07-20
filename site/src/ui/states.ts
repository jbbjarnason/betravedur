// UX-05 trust-state renderers: initial loading, map-load error, and empty-stations overlays
// (Phase 7). ONE reused overlay host over the map area (z30, below the future info panel z40 and
// above the standing chrome / bottom sheet), plus an ARIA-live region so screen readers hear the
// state transitions. Only ONE state shows at a time (loading → then markers, or empty, or error):
// showMapError / showEmptyState first call hideLoading.
//
// DISCIPLINES:
//   * NO string-HTML injection — every node via createElement + textContent (the project T-05/T-06
//     grep gate). The overlays are plain <div>/<p>.
//   * Copy is passed IN by the callers (main.ts / init.ts) from the UI-SPEC strings — this module
//     holds NO hardcoded Icelandic beyond the `hleð…` loading token (kept in COPY).
//   * SECURITY (T-07-01): the error overlay renders only the FIXED Icelandic copy the caller
//     passes; the raw error is logged to the console by the caller, never rendered here.

/** The only Icelandic literal this module owns (the minimal loading affordance). */
const COPY = {
  loading: "hleð…",
} as const;

const HOST_ID = "bv-state-host";
const LIVE_ID = "bv-state-live";
const LOADING_CLASS = "bv-state--loading";

/**
 * Lazily create (once) the overlay host + the visually-hidden aria-live region, appended to
 * <body> so they float over the map area. Idempotent — returns the existing host on repeat calls.
 */
function ensureHost(): HTMLElement {
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement("div");
    host.id = HOST_ID;
    host.className = "bv-state-host";
    document.body.appendChild(host);
  }
  if (!document.getElementById(LIVE_ID)) {
    const live = document.createElement("div");
    live.id = LIVE_ID;
    live.className = "bv-state-live";
    live.setAttribute("aria-live", "polite");
    document.body.appendChild(live);
  }
  return host;
}

/** Announce a message on the shared aria-live region (politeness set by the caller's state). */
function announce(message: string, assertive: boolean): void {
  const live = document.getElementById(LIVE_ID);
  if (!live) return;
  live.setAttribute("aria-live", assertive ? "assertive" : "polite");
  live.textContent = message;
}

/**
 * Build one overlay: a centered card with an optional heading (14px 600 ink) + a body line
 * (14px 400 muted). All text via textContent. `modifier` distinguishes loading/error/empty for
 * CSS + the role/aria the caller needs.
 */
function buildOverlay(opts: {
  modifier: string;
  heading?: string;
  body: string;
  role?: string;
  headingText?: boolean;
}): HTMLElement {
  const el = document.createElement("div");
  el.className = `bv-state ${opts.modifier}`;
  if (opts.role) el.setAttribute("role", opts.role);

  if (opts.heading) {
    const h = document.createElement("p");
    h.className = "bv-state__heading";
    h.textContent = opts.heading;
    el.appendChild(h);
  }
  const p = document.createElement("p");
  p.className = "bv-state__body";
  p.textContent = opts.body;
  el.appendChild(p);
  return el;
}

/**
 * Show the initial loading affordance (`hleð…`) over the map area. Idempotent — a second call does
 * not stack a second loading node. Announced politely to AT.
 */
export function showLoading(): void {
  const host = ensureHost();
  if (host.querySelector(`.${LOADING_CLASS}`)) return; // already showing
  const overlay = buildOverlay({ modifier: LOADING_CLASS, body: COPY.loading });
  host.appendChild(overlay);
  announce(COPY.loading, false);
}

/**
 * Remove ONLY the loading affordance, leaving any error/empty overlay in place (so a failure that
 * surfaced concurrently is not wiped by the post-first-paint hideLoading). Clears the polite live
 * message if it still reads the loading token.
 */
export function hideLoading(): void {
  const host = document.getElementById(HOST_ID);
  if (!host) return;
  host.querySelectorAll(`.${LOADING_CLASS}`).forEach((n) => n.remove());
  const live = document.getElementById(LIVE_ID);
  if (live && live.textContent === COPY.loading) live.textContent = "";
}

/**
 * Show the MAP-LOAD-ERROR state as TEXT with role="alert" / aria-live="assertive" (a failure the
 * user must notice). The header + info button + map canvas stay up — this only paints an overlay.
 * Copy is passed in (UI-SPEC: "Ekki tókst að hlaða kortið" / "Reyndu að hlaða síðunni aftur.").
 * Clears the loading affordance first. Idempotent per heading (does not stack duplicate alerts).
 */
export function showMapError(heading: string, body: string): void {
  hideLoading();
  const host = ensureHost();
  // IN-02: the error state SUPERSEDES any empty-stations overlay so at most one state card renders
  // (the host is flex-centered, so a concurrent map-error + empty-data deploy would otherwise stack
  // two cards over each other). A map that failed to load is the more actionable failure to surface.
  host.querySelectorAll(".bv-state--empty").forEach((n) => n.remove());
  if (host.querySelector(".bv-state--error")) return; // one alert is enough
  const overlay = buildOverlay({
    modifier: "bv-state--error",
    heading,
    body,
    role: "alert",
  });
  host.appendChild(overlay);
  announce(`${heading}. ${body}`, true);
}

/**
 * Show the EMPTY-STATIONS state as TEXT (aria-live="polite") over the still-rendered basemap.
 * Copy passed in (UI-SPEC: "Engar veðurstöðvar" / "Engar veðurstöðvar fundust til að sýna á
 * kortinu."). Clears the loading affordance first. Idempotent.
 */
export function showEmptyState(heading: string, body: string): void {
  hideLoading();
  const host = ensureHost();
  // IN-02: never paint an empty-stations card over an already-shown map-error alert — the error is
  // the higher-priority failure and supersedes empty (mirrors showMapError removing empty above).
  if (host.querySelector(".bv-state--error")) return;
  if (host.querySelector(".bv-state--empty")) return;
  const overlay = buildOverlay({
    modifier: "bv-state--empty",
    heading,
    body,
  });
  host.appendChild(overlay);
  announce(`${heading}. ${body}`, false);
}
