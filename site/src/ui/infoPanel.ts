/**
 * Info / trust panel (Phase 7, UX-04) — the single most important trust surface.
 *
 * A persistent top-right `i` button opens a native `<dialog>` that frames the data as
 * historical-not-forecast (the #1 documented misconception: `Þetta er sögulegt meðaltal,
 * ekki spá.`), carries the full CC BY 4.0 credit built from the domain `ATTRIBUTION` constant
 * (NEVER hardcoded — T-07-04), and shows an Icelandic `uppfært {date}` freshness line derived
 * from the manifest (omitted when unavailable, never `Invalid Date`).
 *
 * XSS discipline (T-07-04): every text node is set via `textContent`; the ONLY markup is real
 * `<a>` anchors whose `href` is set via `setAttribute`. No `innerHTML` anywhere. The ATTRIBUTION
 * prose comes from the constant and the freshness is a formatted date — no raw manifest field is
 * ever rendered as HTML.
 *
 * First-visit auto-open runs ONCE (localStorage `bv:info-dismissed`), and is SUPPRESSED entirely
 * on a permalink-restored view (any non-empty `location.search`) so it can never block the shared
 * view the visitor came to see (UI-SPEC §First-visit auto-open — permalink guard).
 *
 * The native `<dialog>` provides focus-trap + Escape + backdrop-dismiss for free; on close we also
 * explicitly return focus to the info button (native behavior + a `.focus()` fallback).
 */
import { ATTRIBUTION } from "@betravedur/domain";

/** localStorage key for the first-visit dismissed-hint boolean (a cosmetic flag, not user data). */
const DISMISSED_KEY = "bv:info-dismissed";

/** SVG namespace for the inline info glyph (built via the DOM API — never string-HTML). */
const SVGNS = "http://www.w3.org/2000/svg";

// ── Verbatim UI-SPEC §Info panel copy (final Icelandic strings — do not alter) ────────────────
const COPY = {
  title: "Um kortið",
  trustLead: "Þetta er sögulegt meðaltal, ekki spá.",
  whatItShows:
    "Kortið sýnir hvar á landinu veðrið hefur að jafnaði verið best fyrir valið tímabil ársins, " +
    "reiknað úr raunverulegum mælingum Veðurstofunnar yfir valin ár — ekki veðurspá.",
  howToRead:
    "Grænni stöðvar hafa fengið hærri einkunn fyrir tímabilið. Smelltu á stöð til að sjá dreifingu " +
    "hita, vinds og úrkomu. Veldu tímabil og árabil neðst; „meðaltal N ára“ sýnir á hve mörgum árum " +
    "meðaltalið byggir.",
  closeLabel: "Loka",
  infoButtonLabel: "Um kortið",
  /** The basemap credit mirrored from attribution.ts (OSM + Protomaps portion). */
  basemapCredit: "© OpenStreetMap contributors · Protomaps",
} as const;

/** The structured attribution content the dialog renders node-for-node. */
export interface InfoAttribution {
  /** The Veðurstofan license prose + modified-data notice (from the ATTRIBUTION constant). */
  text: string;
  /** The license anchor label — the ATTRIBUTION constant's `license` ("CC BY 4.0"). */
  licenseLabel: string;
  /** The license anchor href — the ATTRIBUTION constant's `sourceUrl`. */
  licenseHref: string;
  /** The basemap (OSM + Protomaps) credit line. */
  basemap: string;
}

/** The pure content model the dialog is built from (unit-testable in a Node runtime). */
export interface InfoPanelSections {
  title: string;
  trustLead: string;
  whatItShows: string;
  howToRead: string;
  attribution: InfoAttribution;
  /** A flattened attribution string for the acceptance-text checks (contains CC BY 4.0 + OSM). */
  attributionFlatText: string;
  /** `uppfært {date}` when a date is supplied; `null` (line omitted) otherwise. */
  freshnessLine: string | null;
}

/**
 * Build the PURE content model for the info panel. Kept free of any DOM API so it is unit-testable
 * in the headless Node vitest runtime (no jsdom); `buildInfoDialog` renders this model node-for-
 * node. The attribution is assembled from the domain `ATTRIBUTION` constant (single source of
 * truth — the Icelandic license text is NEVER retyped here). The freshness line is omitted (null)
 * when no date is available, so the panel never shows a bare `uppfært` or an `Invalid Date`.
 */
export function infoPanelSections(freshnessDate: string | null): InfoPanelSections {
  const text = `${ATTRIBUTION.text_is} ${ATTRIBUTION.modifiedNotice_is}`;
  const attribution: InfoAttribution = {
    text,
    licenseLabel: ATTRIBUTION.license,
    licenseHref: ATTRIBUTION.sourceUrl,
    basemap: COPY.basemapCredit,
  };
  return {
    title: COPY.title,
    trustLead: COPY.trustLead,
    whatItShows: COPY.whatItShows,
    howToRead: COPY.howToRead,
    attribution,
    attributionFlatText: `${text} (${attribution.licenseLabel}) · ${attribution.basemap}`,
    freshnessLine: freshnessDate ? `uppfært ${freshnessDate}` : null,
  };
}

/** Build the inline lowercase "i"-in-a-circle glyph (24×24; createElementNS only, no string-HTML). */
function buildInfoGlyph(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS(SVGNS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "24");
  svg.setAttribute("height", "24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  const circle = doc.createElementNS(SVGNS, "circle");
  circle.setAttribute("cx", "12");
  circle.setAttribute("cy", "12");
  circle.setAttribute("r", "9");
  circle.setAttribute("fill", "none");
  circle.setAttribute("stroke", "currentColor");
  circle.setAttribute("stroke-width", "1.5");
  svg.appendChild(circle);

  // The lowercase "i": a dot + a stem, both painted with the ink stroke as fills.
  const dot = doc.createElementNS(SVGNS, "circle");
  dot.setAttribute("cx", "12");
  dot.setAttribute("cy", "7.5");
  dot.setAttribute("r", "1.15");
  dot.setAttribute("fill", "currentColor");
  svg.appendChild(dot);

  const stem = doc.createElementNS(SVGNS, "rect");
  stem.setAttribute("x", "11.1");
  stem.setAttribute("y", "10.5");
  stem.setAttribute("width", "1.8");
  stem.setAttribute("height", "7");
  stem.setAttribute("rx", "0.9");
  stem.setAttribute("fill", "currentColor");
  svg.appendChild(stem);

  return svg;
}

/**
 * Build the native `<dialog class="info-panel">` element from `infoPanelSections`. Every text node
 * is created via `createElement`/`textContent`; the only markup is the real `<a>` license anchor
 * (href via `setAttribute`) — NO `innerHTML` (T-07-04). The freshness line element is only appended
 * when a date is available. `doc` defaults to the ambient `document`; passing one keeps this pure
 * for any DOM-capable runtime.
 */
export function buildInfoDialog(
  freshnessDate: string | null,
  doc: Document = document,
): HTMLDialogElement {
  const s = infoPanelSections(freshnessDate);

  const dialog = doc.createElement("dialog");
  dialog.className = "info-panel";
  dialog.setAttribute("aria-labelledby", "info-title");

  // Title.
  const title = doc.createElement("h2");
  title.id = "info-title";
  title.className = "info-panel__title";
  title.textContent = s.title;
  dialog.appendChild(title);

  // Trust lead — the prominent #1 message.
  const lead = doc.createElement("p");
  lead.className = "info-panel__lead";
  lead.textContent = s.trustLead;
  dialog.appendChild(lead);

  // What it shows.
  const what = doc.createElement("p");
  what.className = "info-panel__prose";
  what.textContent = s.whatItShows;
  dialog.appendChild(what);

  // How to read it.
  const how = doc.createElement("p");
  how.className = "info-panel__prose";
  how.textContent = s.howToRead;
  dialog.appendChild(how);

  // Attribution block: license prose + a real anchor + the basemap credit (createElement only).
  const attrib = doc.createElement("p");
  attrib.className = "info-panel__attribution";
  attrib.appendChild(doc.createTextNode(`${s.attribution.text} (`));
  const licenseLink = doc.createElement("a");
  licenseLink.setAttribute("href", s.attribution.licenseHref);
  licenseLink.setAttribute("target", "_blank");
  licenseLink.setAttribute("rel", "noopener");
  licenseLink.textContent = s.attribution.licenseLabel; // "CC BY 4.0"
  attrib.appendChild(licenseLink);
  attrib.appendChild(doc.createTextNode(`) · ${s.attribution.basemap}`));
  dialog.appendChild(attrib);

  // Freshness line — appended ONLY when a date is available (never a bare `uppfært`).
  if (s.freshnessLine) {
    const fresh = doc.createElement("p");
    fresh.className = "info-panel__freshness";
    fresh.textContent = s.freshnessLine;
    dialog.appendChild(fresh);
  }

  // Close button (≥44px hit target via CSS; native aria-label).
  const close = doc.createElement("button");
  close.type = "button";
  close.className = "info-panel__close";
  close.setAttribute("aria-label", COPY.closeLabel);
  close.appendChild(doc.createTextNode(COPY.closeLabel));
  dialog.appendChild(close);

  return dialog;
}

/** A handle the boot flow uses to update the freshness line once the manifest resolves. */
export interface InfoPanelHandle {
  /** Re-render the `uppfært {date}` line (or omit it when null) after the manifest loads. */
  setFreshness(date: string | null): void;
}

/**
 * Mount the persistent top-right info `i` button + its native `<dialog>` trust panel into `parent`.
 *
 * - The button (`aria-label="Um kortið"`, `.info-button`) opens the dialog via `showModal()`.
 * - First-visit auto-open runs ONCE: on mount, if `bv:info-dismissed` is not `"1"` AND there are
 *   NO URL params (`location.search.length <= 1` — a bare first visit), `showModal()` is called.
 *   The permalink guard is `location.search.length > 1`: any non-empty query (a shared selection/
 *   `st` link) suppresses the auto-open entirely so the restored view is never blocked. (A lone
 *   `?` yields `search === "?"`, length 1 — still treated as bare; a real param makes it >1.)
 * - Dismiss (close button / Escape / backdrop) records `bv:info-dismissed="1"` and returns focus
 *   to the info button.
 *
 * Returns an `InfoPanelHandle` so boot() can set the freshness date after the manifest resolves
 * (the auto-open must not wait on the network — the line simply appears once set).
 */
export function mountInfoPanel(
  parent: HTMLElement,
  opts: { freshnessDate: string | null },
): InfoPanelHandle {
  const doc = parent.ownerDocument;

  // The persistent info button.
  const button = doc.createElement("button");
  button.type = "button";
  button.className = "info-button";
  button.setAttribute("aria-label", COPY.infoButtonLabel);
  button.appendChild(buildInfoGlyph(doc));

  let currentFreshness = opts.freshnessDate;
  let dialog = buildInfoDialog(currentFreshness, doc);

  parent.appendChild(button);
  parent.appendChild(dialog);

  /** Persist the dismissed-hint flag (defensive — a disabled/full localStorage never throws up). */
  const markDismissed = (): void => {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Private-mode / disabled storage: the auto-open just re-shows next visit; not an error.
    }
  };

  /** Wire the current dialog's close affordances (called on mount + after any rebuild). */
  const wireDialog = (): void => {
    const close = dialog.querySelector<HTMLButtonElement>(".info-panel__close");
    close?.addEventListener("click", () => dialog.close());
    // Native <dialog> `close` fires for the button, Escape, AND a backdrop-dismiss — one seam
    // records the dismissed flag and returns focus to the launching button (a11y + criterion 18).
    dialog.addEventListener("close", () => {
      markDismissed();
      button.focus();
    });
    // Backdrop click (a light-dismiss): the click lands on the <dialog> element itself (not a
    // child), so close when the target IS the dialog.
    dialog.addEventListener("click", (ev) => {
      if (ev.target === dialog) dialog.close();
    });
  };
  wireDialog();

  // WR-02: ONE guarded opener used at all three call sites (button click, first-visit auto-open,
  // setFreshness re-open). `dialog` is reassigned on rebuild, so this reads the current binding via
  // closure. The `typeof … === "function"` guard means a runtime without HTMLDialogElement.showModal
  // (an unsupported <dialog>) silently no-ops everywhere instead of TypeError-ing on click/refresh.
  const openDialog = (): void => {
    if (typeof dialog.showModal === "function" && !dialog.open) dialog.showModal();
  };

  button.addEventListener("click", openDialog);

  // First-visit auto-open — ONCE, and NEVER on a permalink-restored view (permalink guard).
  const hasUrlParams = location.search.length > 1;
  let dismissed = false;
  try {
    dismissed = localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    dismissed = false; // storage unavailable → treat as first visit (still permalink-guarded)
  }
  if (!dismissed && !hasUrlParams) {
    openDialog();
  }

  return {
    setFreshness(date: string | null): void {
      if (date === currentFreshness) return; // idempotent — no needless rebuild
      currentFreshness = date;
      const wasOpen = dialog.open;
      const rebuilt = buildInfoDialog(currentFreshness, doc);
      dialog.replaceWith(rebuilt);
      dialog = rebuilt;
      wireDialog();
      if (wasOpen) openDialog(); // preserve an open panel across a freshness update (WR-02 guarded)
    },
  };
}
