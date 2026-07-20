# Phase 4: Selection & Instant Recompute - Research

**Researched:** 2026-07-20
**Domain:** Client-side selection state (URL ↔ store ↔ recompute), vanilla-TS reactive store, day-of-year scrubber, instant in-browser recompute over derived climatology
**Confidence:** HIGH (state architecture, recompute wiring, data-derived year bounds, Icelandic date formatting all verified against the live codebase / runtime; scrubber ARIA + Playwright no-network patterns MEDIUM-HIGH)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Period Selector UI (Claude's discretion — decided):**
- Bottom control bar: a day-of-year scrubber to pick the window's anchor point (echoes the gottvedur.is/kort bottom timeline) + segmented width buttons "1 vika / 2 vikur / 3 vikur / 1 mánuður" for window length. On narrow screens the scrubber collapses to a compact date stepper (full bottom-sheet polish is Phase 7).
- The scrubber operates in day-of-year / calendar-date terms (window is time-of-year, not a specific year) — labels in Icelandic month/day. Feb 29 folded per the Phase 1 leap contract.
- Wrapping windows (late Dec → early Jan) are allowed and use the Phase 1 `groupBySeasonYear` season-year contract.

**Year Range Selector UI:**
- Two dropdowns: "Frá [ár]" and "Til [ár]", bounded by the earliest/latest year available in the committed data (derive from stations.json / manifest high-water marks, NOT hardcoded). Guard start ≤ end.

**Default Selection:**
- On first load (no URL params): window = current week (anchored on today's day-of-year, 1-week width) over the last 10 available years. Documented; today is NOT hardcoded — anchor derives from current date at load, year range from the data's latest 10 years.

**Instant Recompute:**
- Changing period or year range recomputes MarkerDatum for every station entirely client-side via @betravedur/domain (already-loaded derived files) — NO network fetch, no reload. Recolor/re-render markers using Phase 3's `attachCompositeRenderer` (made idempotent in Phase 3 fix WR-04 — reuse it, don't stack listeners).
- "meðaltal N ára" label reflects actual qualifying-year coverage (Phase 1 effectiveN, ≥80%/N≥3), not the picker span — reuse the honest-N contract; below N≥3 → "ófullnægjandi gögn".

**URL State (UX-02):**
- Encode period (anchor doy + width), year range (from/til), selected station id, map viewport (lat/lng/zoom) as URL query params. `replaceState` for continuous refinements (scrubber drag, pan/zoom), `pushState` for discrete navigations (station select) — per FEATURES.md guidance. A copied link restores the exact view. This is the "save/share" substitute for the out-of-scope accounts feature.

### Claude's Discretion
- Exact param names/encoding, debounce for scrubber-driven recompute, scrubber tick styling, whether width buttons are icons or text.

### Deferred Ideas (OUT OF SCOPE)
- Score coloring, legend, ranked "best stations", score explainer — Phase 5.
- Station click → chart panel — Phase 6.
- Mobile bottom-sheet polish, info "historical not forecast" panel, loading/empty/no-data states — Phase 7.
- Adjustable score weights (WGT-01, v2).

**"Recolors" clarification (from Phase Boundary):** In THIS phase "recolors" means re-rendering markers with the new averages via the existing neutral pill. The full score palette + legend + ranked list is Phase 5. Phase 4 builds the selection-state single-source-of-truth that Phase 5/6 read from.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEL-01 | User selects a time-of-year window of 1 week / 2 weeks / 3 weeks / 1 month | Scrubber picks anchor doy; segmented buttons set width; `anchor + width → WindowSpec {startDoy,endDoy}` (§Pattern 4). Reuses `expandWindow`/`groupBySeasonYear` (verified in `window.ts`). |
| SEL-02 | User selects the baseline year range (e.g. 2010–2015) | Two dropdowns bounded by data-derived min/max (§Year Bounds — union of manifest `from`/`to`). `WindowSpec` has no year field; year range is a SEPARATE filter applied to season-year groups (§Pattern 4, the year-range gap). |
| SEL-03 | Every average shows "meðaltal N ára" from real coverage, not picker span | Reuse `effectiveN`/`qualifyingYears` already inside `computeMarkerDatum` — `MarkerDatum.n` / `.sufficient` are the honest N (verified `averages.ts:83`). Below N≥3 → "ófullnægjandi gögn" via existing `formatCallout`. |
| SEL-04 | Changing period/year range recomputes + recolors instantly client-side (no reload, no fetch) | Re-run `computeMarkerDatum` over already-loaded `DerivedFile`s → `installMarkerLayer(map,data)` (re-`setData`, verified idempotent `markers.ts:181`) → existing `idle`/`move` renderer redraws. No `loadDerived` re-fetch (§Recompute Performance). |
| UX-02 | Full UI state (period, year range, selected station, map view) in the URL — shareable/bookmarkable | Store ↔ `URLSearchParams` round-trip; `replaceState` (continuous) / `pushState` (discrete); `popstate` for back-button (§State Architecture). |
</phase_requirements>

## Summary

Phase 4 is a **state-management + UI-wiring phase, not a data or algorithm phase**. Every piece of climatology math already exists and is verified working end-to-end: `computeMarkerDatum(meta, file, window)` (`site/src/data/averages.ts`) is pure, already parameterized by `WindowSpec`, and already returns the honest N via `effectiveN`. `installMarkerLayer` re-calls `source.setData` idempotently (`markers.ts:181`), and `attachCompositeRenderer` was made idempotent in the Phase 3 WR-04 fix (`markers.ts:301`). The derived files are fetched **once** at boot in `main.ts:loadMarkerData()`. So the phase's real work is: (1) a single source-of-truth selection store, (2) a `store ↔ URLSearchParams` round-trip that doesn't loop, (3) a day-of-year scrubber + width buttons + year dropdowns that write to the store, and (4) a recompute path that re-runs the pure producer over the **already-loaded** derived files and re-`setData`s — provably without a network fetch.

The single non-obvious architectural gap: **`WindowSpec` encodes only day-of-year (`startDoy`/`endDoy`), it has NO year field.** The baseline year range (SEL-02) is therefore a *separate* dimension of selection that must be applied as a filter over the season-year groups, NOT folded into `WindowSpec`. `computeMarkerDatum` today uses *all* years in the derived file. To honor SEL-02 the producer must gain a `yearRange` parameter (or the caller must pre-filter the `DailyObservation[]` before the domain math). This is the one signature change the phase requires; everything else is additive wiring.

**Primary recommendation:** Build a ~40-line vanilla-TS observable store (`SelectionState` + `subscribe` + `set`) as the single source of truth. Derive URL params from state on every mutation (`replaceState` for scrubber-drag/pan-zoom, `pushState` for station-select), and read state from the URL only on initial load and on `popstate`. This asymmetry (write-always, read-only-on-popstate) is what structurally prevents the update loop — `pushState`/`replaceState` do NOT fire `popstate`, so a URL write can never re-trigger a state read. Debounce the *recompute* (not the URL write) at ~120 ms trailing during scrubber drag; recompute is CPU-only over already-loaded data, so no network assertion can ever fail. Add a `yearRange` param to `computeMarkerDatum`. Prove "no network on selection change" with a Playwright `page.on('request')` counter scoped to `**/data/**` around a scrubber interaction.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Selection state (window anchor+width, year range, station, viewport) | Browser (in-memory store) | URL (query params) | No backend exists; URL is the only persistence. Store is the runtime SoT; URL is the serialized mirror. |
| URL ↔ state serialization | Browser (History API) | — | `history.pushState`/`replaceState` + `URLSearchParams`; pure client. |
| Instant recompute | Browser (CPU, `@betravedur/domain`) | — | Locked decision: no fetch. Derived files already in memory from boot. |
| Marker re-render | Browser (MapLibre `setData` + DOM overlay) | — | Reuses idempotent `installMarkerLayer` + `attachCompositeRenderer`. |
| Available-year bounds | Build-time data (manifest `from`/`to`) → Browser (read at boot) | — | Bounds derived from committed `manifest.json`, read client-side. No compute. |
| Icelandic date labels | Browser (`Intl.DateTimeFormat('is-IS')`) | — | Native ICU; verified renders "16. júlí", "1. janúar" (§Scrubber). |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (none new) | — | The phase needs **zero new dependencies** | All state, URL, DOM, date, and recompute needs are met by platform APIs (`URLSearchParams`, `history`, `Intl.DateTimeFormat`, `<input type=range>`) + the existing `@betravedur/domain` / site modules. Adding a framework or state lib would contradict the vanilla-Vite-TS stack (CLAUDE.md STACK) and the zero-new-dep pattern established in Phase 2. |

### Supporting (platform APIs, no install)

| API | Purpose | When to Use |
|-----|---------|-------------|
| `URLSearchParams` | Serialize/parse selection state to/from the query string | Every state ↔ URL round-trip. `[VERIFIED: MDN]` |
| `history.pushState` / `replaceState` | Write URL without reload; control back-button granularity | replaceState = continuous refinements; pushState = discrete navigations. `[CITED: developer.mozilla.org/History_API]` |
| `window.onpopstate` | Detect back/forward → re-hydrate store from URL | The ONLY place the store reads FROM the URL after boot (loop-prevention). `[CITED: MDN]` |
| `Intl.DateTimeFormat('is-IS', {day:'numeric',month:'long'})` | Icelandic scrubber date labels | Verified in Node ICU: doy197→"16. júlí", doy1→"1. janúar", doy365→"31. desember", months "janúar…desember". `[VERIFIED: node -e runtime check, 2026-07-20]` |
| `<input type="range">` | Native day-of-year scrubber (1–365) | Free keyboard (←/→/Home/End/PageUp/Down), focus, and ARIA slider role. `[CITED: MDN input/range]` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled ~40-line observable store | nanostores / zustand-vanilla / valtio | Adds a dep for what is a `Set<listener>` + `Object.freeze` snapshot. Overkill for one flat state object; contradicts zero-dep pattern. Revisit only if state grows into a graph. |
| Native `<input type=range>` scrubber | Custom pointer-drag `<div>` scrubber (gottvedur look) | Custom gets exact tick styling but must re-implement keyboard, ARIA slider role, focus ring, touch. Native gives all of that free and is stylable enough via CSS. **Recommend native for v1** (Phase 7 owns bottom-sheet polish). |
| `URLSearchParams` | Hash-fragment routing (`#`) | Query params are cleaner, server-visible (irrelevant for static), and the FEATURES.md permalink guidance assumes query params. No reason for hash. |
| `Intl.DateTimeFormat` | Hardcoded Icelandic month array | `Intl` verified correct and already locale-aware; a hardcoded array is a maintenance liability with no upside. |

**Installation:** None. `npm install` unchanged.

## Package Legitimacy Audit

> This phase installs **no external packages**. The Package Legitimacy Gate is N/A.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| (none) | — | — | — | — | — | No new packages |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

All functionality uses platform APIs and existing workspace packages (`@betravedur/domain`, `@betravedur/pipeline`). No `npm install` line is added by this phase.

## Architecture Patterns

### System Architecture Diagram

```
                       ┌─────────────────────────────────────────────┐
   Initial load /      │            SelectionState (store)            │
   back-forward        │  { anchorDoy, widthDays, yearFrom, yearTil,  │
        │              │    stationId|null, lng, lat, zoom }          │
        ▼              │  ── single source of truth (in-memory) ──    │
  ┌──────────┐  read   └───────┬───────────────────────────┬─────────┘
  │   URL    │──only on───────►│                           │
  │ ?doy=..  │  boot &         │ set(partial)              │ subscribe(fn)
  │ &w=.. .. │  popstate       │  (validates, freezes,     │
  └──────────┘                 │   notifies)               ▼
        ▲                      │                    ┌──────────────┐
        │ write ALWAYS         ▼                    │  Recompute   │
        │ (replaceState /   ┌──────────────┐        │  (debounced  │
        └───────────────────│ URL writer   │◄───────│   120ms)     │
          continuous=repl.  │ (derives     │ subscribe             │
          discrete=push     │  params from │        │ for each station:
                            │  snapshot)   │        │  computeMarkerDatum(
   ┌────────────────────────┴──────┐       │        │    meta, file,        ← file already
   │  UI controls (write to store) │       │        │    windowFrom(anchor, │    in memory
   │  • doy scrubber (range) ─repl │       │        │      width),          │    (no fetch)
   │  • width buttons     ─push?   │       │        │    {yearFrom,yearTil})│
   │  • year dropdowns    ─push    │       │        └──────┬───────────────┘
   │  • station select    ─push    │       │               │ MarkerDatum[]
   │  • map pan/zoom      ─repl    │       │               ▼
   └───────────────────────────────┘       │        installMarkerLayer(map,data)  ← source.setData
                                            │               │  (idempotent, verified)
   Derived files: fetched ONCE at boot ─────┘               ▼
   (main.ts loadMarkerData), cached in a    ┌──── idle/move → renderComposite ────┐
   station→DerivedFile Map for recompute.   │ (existing handlers, WR-04 idempotent)│
                                            └──────────────────────────────────────┘
```

Trace the primary use case (scrubber drag): user drags range input → `set({anchorDoy})` → store freezes + notifies → (a) URL writer does `replaceState` with new `?doy=`; (b) recompute subscriber, debounced 120 ms, re-runs `computeMarkerDatum` over the in-memory derived Map → `installMarkerLayer` re-`setData`s → the already-attached `idle` handler redraws pills. No network I/O anywhere on that path.

### Recommended Project Structure

```
site/src/
├── state/
│   ├── store.ts          # SelectionState type + createStore() (observable, ~40 lines)
│   ├── url.ts            # stateToParams / paramsToState (URLSearchParams round-trip, pure)
│   └── defaults.ts       # default selection (today's doy, last-10-years) + year bounds derivation
├── ui/
│   ├── scrubber.ts       # <input type=range> doy scrubber + Icelandic date label (Intl)
│   ├── widthButtons.ts   # segmented 1v/2v/3v/1mán
│   └── yearRange.ts      # Frá/Til <select> pair, bounded, start≤end guard
├── data/
│   ├── averages.ts       # ← ADD yearRange param to computeMarkerDatum (only signature change)
│   └── window.ts (NEW)   # anchorDoy+widthDays → WindowSpec {startDoy,endDoy} (wrap-aware), pure
└── main.ts               # wire store→URL, store→recompute; cache station→DerivedFile at boot
```

### Pattern 1: Vanilla observable store (single source of truth)

**What:** A frozen-snapshot store with `get()`, `set(partial)`, `subscribe(fn)`. Flat state, structural equality skip to avoid redundant notifications.
**When to use:** The SoT for all selection. UI writes via `set`; URL-writer and recompute are subscribers.
**Example:**
```typescript
// site/src/state/store.ts  [ASSUMED: idiomatic vanilla pattern, not from a cited source]
export interface SelectionState {
  anchorDoy: number;   // 1–365 (leap-folded; Feb 29 unreachable by construction)
  widthDays: number;   // 7 | 14 | 21 | 30  (SEL-01)
  yearFrom: number;    // SEL-02, bounded by data
  yearTil: number;     // SEL-02, yearFrom ≤ yearTil
  stationId: number | null; // selected station (Phase-6 seam; encoded now for UX-02)
  lng: number; lat: number; zoom: number; // viewport
}
type Listener = (s: Readonly<SelectionState>) => void;

export function createStore(initial: SelectionState) {
  let state = Object.freeze({ ...initial });
  const listeners = new Set<Listener>();
  return {
    get: (): Readonly<SelectionState> => state,
    subscribe(fn: Listener) { listeners.add(fn); return () => listeners.delete(fn); },
    set(patch: Partial<SelectionState>) {
      const next = Object.freeze({ ...state, ...patch });
      // skip no-op sets so scrubber ticks that don't change the value don't churn
      if ((Object.keys(patch) as (keyof SelectionState)[]).every(k => next[k] === state[k])) return;
      state = next;
      for (const fn of listeners) fn(state);
    },
  };
}
```

### Pattern 2: URL round-trip that cannot loop (the core discipline)

**What:** Write URL from state on EVERY change; read state from URL ONLY at boot and on `popstate`.
**When to use:** Always. This asymmetry is the loop-prevention mechanism.
**Why it works:** `history.pushState()` and `history.replaceState()` do **NOT** fire a `popstate` event — only genuine user navigation (back/forward, or `history.back()`) does. `[CITED: developer.mozilla.org/en-US/docs/Web/API/History_API/Working_with_the_History_API]` So a URL write started by a store change never triggers the URL→store reader, and the loop is structurally impossible without any "isUpdating" flag.
```typescript
// site/src/state/url.ts  [VERIFIED: URLSearchParams/History API behavior — MDN]
export function stateToParams(s: SelectionState): string {
  const p = new URLSearchParams();
  p.set("doy", String(s.anchorDoy));
  p.set("w", String(s.widthDays));
  p.set("fra", String(s.yearFrom));
  p.set("til", String(s.yearTil));
  if (s.stationId !== null) p.set("st", String(s.stationId));
  p.set("v", `${s.lat.toFixed(4)},${s.lng.toFixed(4)},${s.zoom.toFixed(2)}`); // one compact viewport param
  return p.toString();
}
export function paramsToState(qs: string, bounds: YearBounds): Partial<SelectionState> {
  const p = new URLSearchParams(qs);
  // Parse defensively: every field clamped/validated; a garbage param falls back to default,
  // never throws, never yields NaN into the recompute (mirror the codebase's defensive-decode ethos).
  // ... clamp doy∈[1,365], w∈{7,14,21,30}, fra/til∈[bounds.min,bounds.max] with fra≤til, etc.
}

// main.ts wiring:
store.subscribe((s) => {
  const url = `${location.pathname}?${stateToParams(s)}`;
  (s.__discrete ? history.pushState : history.replaceState).call(history, null, "", url);
});
window.addEventListener("popstate", () => {
  store.set(paramsToState(location.search, bounds)); // the ONLY URL→store read after boot
});
```
*(Model the discrete-vs-continuous choice per the triggering control, not as a state field — see Pattern 3.)*

### Pattern 3: replaceState (continuous) vs pushState (discrete)

**What:** Choose history granularity by interaction *kind*, at the call site.
**Concrete mapping (locked by CONTEXT.md):**

| Interaction | Method | Back-button behavior |
|-------------|--------|----------------------|
| Scrubber drag (doy) | `replaceState` | Mid-drag positions do NOT flood history; back exits the app / prior discrete state |
| Map pan / zoom | `replaceState` | Continuous camera moves collapse to one entry |
| Width button (1v/2v/3v/1mán) | `pushState` (recommend) | Discrete choice; back reverts to previous width. *(Discretion: could be replace — a width change is a small discrete jump; recommend push so it's undoable.)* |
| Year Frá/Til change | `pushState` | Discrete; back reverts the baseline range |
| Station select | `pushState` | Discrete navigation (CONTEXT.md explicit); back deselects |

**Debounce interacts with replaceState:** during a scrubber drag, still call `replaceState` on each tick (cheap, no history entry added) but **debounce the recompute** (Pattern 5). Do NOT debounce the URL write — a mid-drag copied link should reflect the live position.
**Implementation note:** `<input type=range>` fires `input` (continuous, every tick → replaceState + debounced recompute) and `change` (on release → optional final replaceState). Use `input` for live feel.

### Pattern 4: anchor + width → WindowSpec, and the year-range gap

**What:** The store holds `anchorDoy` + `widthDays`; the domain wants `WindowSpec {startDoy,endDoy}`. Convert at the recompute boundary. **Separately**, apply the year range — which `WindowSpec` does not carry.
**Example:**
```typescript
// site/src/data/window.ts (NEW, pure, unit-tested)  [VERIFIED against window.ts semantics]
export function anchorToWindow(anchorDoy: number, widthDays: number): WindowSpec {
  // Center the window on the anchor (or anchor = start — decide & document; recommend start=anchor
  // to match a scrubber "pick the start of your trip" mental model). With start=anchor:
  const startDoy = anchorDoy;
  let endDoy = anchorDoy + widthDays - 1;
  if (endDoy > 365) endDoy -= 365;   // wrap → endDoy < startDoy, which expandWindow/groupBySeasonYear handle
  return { startDoy, endDoy };
}
```
**The year-range gap (SEL-02) — the one real signature change:** `computeMarkerDatum` today groups by season-year and uses **every** year in the file. SEL-02 requires restricting to `[yearFrom, yearTil]`. Two options:
- **(A) Add a `yearRange` param to `computeMarkerDatum`** and filter `byYear` keys to the range before `qualifyingYears`/`effectiveN`. Keeps the producer the single choke point; recommended.
- **(B) Pre-filter `DailyObservation[]` by year before calling.** Leaks year semantics into the caller and duplicates season-year logic. Not recommended.

With **(A)**, `effectiveN` naturally becomes the count of qualifying years *within the selected range* — exactly the honest "meðaltal N ára" SEL-03 wants (N reflects real coverage inside the picked baseline, not the picker span). Verified feasible: `groupBySeasonYear` returns `Map<year, rows>`; filtering its keys to `[yearFrom, yearTil]` before `qualifyingYears` is a two-line change in `averages.ts`.

### Anti-Patterns to Avoid

- **Folding year range into `WindowSpec`:** `WindowSpec` is day-of-year only, by contract (`domain/src/types.ts:62`). Adding a year field would corrupt `expandWindow`/`groupBySeasonYear`. Keep year range a separate `computeMarkerDatum` param.
- **Re-fetching derived files on selection change:** `main.ts` fetches once. Recompute MUST read a cached `station→DerivedFile` Map. Any `loadDerived` call on a selection change fails SEL-04 and the Playwright no-network assertion.
- **An `isUpdating` boolean guard around URL writes:** unnecessary and fragile. The write-always/read-on-popstate asymmetry (Pattern 2) makes it structurally impossible to loop. Don't add the flag.
- **Debouncing the URL write:** breaks "copied mid-drag link reflects current view." Debounce recompute only.
- **`maplibregl.Marker` for the station overlay:** grep-gated in Phase 3 (`markers.ts:11`). Not relevant to add here, but don't reach for it when wiring viewport.
- **Reading viewport from the store to `setCenter` on every store change:** creates a camera↔store loop. The map is the SoT for its own viewport during user interaction; the store *mirrors* map `moveend` → URL. Only push store→map viewport on initial URL hydration (and popstate), never on the store change that the map itself originated.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Query-param encode/decode | Manual string splitting | `URLSearchParams` | Handles encoding, repeated keys, escaping. `[VERIFIED: MDN]` |
| URL without reload + back-button | `location.hash` juggling | `history.pushState`/`replaceState` | Purpose-built; no reload; no popstate on programmatic write. `[CITED: MDN]` |
| Icelandic month/day text | Hardcoded month array + case logic | `Intl.DateTimeFormat('is-IS')` | Verified correct ("16. júlí"); locale-aware, zero maintenance. `[VERIFIED: runtime]` |
| Scrubber keyboard/ARIA/focus | Custom `<div>` + keydown handlers | `<input type=range>` | Free arrow/Home/End/PageUp keys, `role=slider`, focus ring, touch. `[CITED: MDN]` |
| Day-of-year ↔ date | `new Date()` month arithmetic ad hoc | Reuse the Phase-1 `CUMULATIVE_DAYS_BEFORE_MONTH` fold (`window.ts`) for doy math; use a fixed non-leap reference year only for *display* formatting | The leap fold is already the project contract; re-deriving it invites Feb-29 bugs. `[VERIFIED: window.ts]` |
| Climatology recompute | Any new averaging code | `computeMarkerDatum` (+ new `yearRange` param) | The whole domain chain is verified working (Phase 2/3 evidence). |

**Key insight:** This phase's temptation is to reach for a state library or a custom scrubber. Both are traps — the platform gives a loop-proof state pattern and a fully-accessible scrubber for free, and the project's zero-dep discipline (Phase 2 shipped with zero new deps) is a hard convention.

## Runtime State Inventory

> Not a rename/refactor/migration phase. This section is included only to record the one signature change and the state-boundary the phase introduces.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no datastore keys change. Derived files are read-only and already committed. | None |
| Live service config | None — fully static, no external service. | None |
| OS-registered state | None. | None |
| Secrets/env vars | None — keyless static site. | None |
| Build artifacts | `site/public/data/*` (2-station sample) is copied by `copy-sample-data.ts` from the `data` branch. Phase 4 does not change the data; it reads the same files. Year bounds come from `manifest.json` `from`/`to`. | None (no data change) |

**Code signature change (not runtime state, but load-bearing):** `computeMarkerDatum(meta, file, window)` → `computeMarkerDatum(meta, file, window, yearRange?)`. `main.ts:38` and any test that calls it must pass the new arg (default = full available range preserves current behavior). **Verified by X:** grep the two call sites — `main.ts:38` (`loadMarkerData`) and `site/src/data/averages.test.ts` (unit tests).

## Common Pitfalls

### Pitfall 1: The URL↔state update loop
**What goes wrong:** URL write triggers a URL-change listener that writes state that writes the URL → infinite loop or thrash.
**Why it happens:** Listening to URL changes symmetrically (reading on every write).
**How to avoid:** Write URL from state always; read state from URL only at boot and on `popstate`. `pushState`/`replaceState` don't fire `popstate`, so the read side never fires from a programmatic write. `[CITED: MDN History API]`
**Warning signs:** Scrubber feels laggy/jittery; recompute fires twice per tick; history fills with entries during a drag.

### Pitfall 2: Recompute silently re-fetches
**What goes wrong:** A refactor routes recompute through `loadMarkerData()` (which fetches), so every scrubber tick hits the network → SEL-04 violated, Playwright no-network test fails.
**Why it happens:** Reusing the boot path for recompute instead of separating fetch (once) from compute (many).
**How to avoid:** At boot, build a `Map<stationId, {meta, file}>`. Recompute iterates that Map with the new window/yearRange — never calls `loadDerived`.
**Warning signs:** Network panel shows `derived/*.json` requests on drag; `page.on('request')` counter > 0.

### Pitfall 3: Year range applied to picker span, not real coverage (SEL-03 dishonesty)
**What goes wrong:** "meðaltal N ára" shows the picked span (e.g. 6 for 2010–2015) even when only 3 years have qualifying in-window data.
**Why it happens:** Deriving N from `yearTil - yearFrom + 1` instead of `effectiveN`.
**How to avoid:** After filtering `byYear` keys to `[yearFrom,yearTil]`, still run `qualifyingYears` + `effectiveN` (already inside `computeMarkerDatum`). N is the count of *qualifying* years *within* the range. Below N≥3 → "ófullnægjandi gögn" via existing `formatCallout`.
**Warning signs:** N label equals the dropdown span for a sparse station.

### Pitfall 4: Viewport param feedback (camera ↔ store loop)
**What goes wrong:** `moveend` → store.set(viewport) → subscriber → `map.setCenter` → `moveend` → … jitter or drift.
**Why it happens:** Treating the store as SoT for the camera during user pan/zoom.
**How to avoid:** Map owns its viewport during interaction. Store mirrors `moveend` → URL (replaceState). Push store→map viewport ONLY on boot hydration and `popstate`. Guard the popstate-driven `setCenter`/`jumpTo` with `{animate:false}` and don't re-mirror the move it causes (or compare values and skip no-ops — the store's no-op-skip already helps).
**Warning signs:** Map drifts after load; infinite `moveend` fires.

### Pitfall 5: Leap fold vs display date drift
**What goes wrong:** Scrubber label shows the wrong calendar date because doy→date uses a leap year while the fold assumes 365.
**Why it happens:** Formatting with `new Date(year, 0, doy)` for a leap `year`.
**How to avoid:** For DISPLAY, format against a fixed **non-leap** reference year (e.g. 2001): `new Date(Date.UTC(2001,0,1)); d.setUTCDate(doy)`. This matches the Phase-1 365-day fold exactly (verified: doy197→"16. júlí"). Never let Feb 29 be selectable — the scrubber's 1–365 domain already excludes it by construction.
**Warning signs:** Off-by-one dates after doy 59 (post-Feb) in leap years.

### Pitfall 6: Wrapping window UX (Dec→Jan)
**What goes wrong:** A late-December anchor + 3-week width wraps past doy 365; the label/range display is confusing or the recompute mis-groups.
**Why it happens:** Not surfacing the wrap in the UI; forgetting `groupBySeasonYear` handles the math.
**How to avoid:** The domain already handles wrap (`expandWindow`/`groupBySeasonYear`, verified). In the UI, show both endpoints ("28. des – 17. jan") so the wrap is legible. `anchorToWindow` produces `endDoy < startDoy` which the domain consumes correctly.
**Warning signs:** Empty markers for a Dec anchor; label shows a start date later than the end date without context.

## Code Examples

### Deriving available-year bounds from the manifest (union)
```typescript
// site/src/state/defaults.ts  [VERIFIED against manifest.json + load.ts ManifestEntry shape]
import type { Manifest } from "../data/load.js"; // { stations: Record<string,{from?,to?}> }
export interface YearBounds { min: number; max: number; }

export function yearBounds(manifest: Manifest): YearBounds {
  // UNION of per-station [from,to] — the widest range any committed station can answer.
  // Rationale (recommend union, not intersection): the site should let a user pick 1950
  // even if only Reykjavík #1 (from 1949) covers it — per-station honest-N already handles
  // stations that can't answer (Keflavík from 2008 → "ófullnægjandi gögn" for 1950). An
  // INTERSECTION would collapse to the shortest station's range (2008–2026 here), hiding
  // 60 years of real Reykjavík history. Union keeps the picker honest AND generous.
  let min = Infinity, max = -Infinity;
  for (const e of Object.values(manifest.stations)) {
    if (typeof e.from === "number") min = Math.min(min, e.from);
    if (typeof e.to === "number")   max = Math.max(max, e.to);
  }
  // Fallback if a malformed manifest yields no bounds (defensive — never NaN dropdowns).
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    const y = new Date().getUTCFullYear(); return { min: y - 10, max: y };
  }
  return { min, max };
}
// Current committed data → union = { min: 1949, max: 2026 }.
```

### Default selection (today's week over last 10 available years)
```typescript
// site/src/state/defaults.ts  [VERIFIED: leapFoldedDoy contract + yearBounds]
import { leapFoldedDoy } from "@betravedur/domain";
export function defaultSelection(bounds: YearBounds, now = new Date()): SelectionState {
  const iso = now.toISOString().slice(0, 10);          // "YYYY-MM-DD"
  const anchorDoy = leapFoldedDoy(iso) ?? 197;          // today's doy; Feb 29 → fallback (rare)
  const yearTil = bounds.max;
  const yearFrom = Math.max(bounds.min, bounds.max - 9); // last 10 available years, clamped
  return { anchorDoy, widthDays: 7, yearFrom, yearTil, stationId: null,
           lng: -19.0, lat: 65.0, zoom: 6 }; // Iceland framing (matches init.ts)
}
```

### Icelandic scrubber label (verified)
```typescript
// site/src/ui/scrubber.ts  [VERIFIED: Intl 'is-IS' runtime check 2026-07-20]
const IS_DATE = new Intl.DateTimeFormat("is-IS", { day: "numeric", month: "long" });
function doyLabel(doy: number): string {
  const d = new Date(Date.UTC(2001, 0, 1)); // fixed NON-leap reference (matches 365 fold)
  d.setUTCDate(doy);                         // doy 197 → "16. júlí"
  return IS_DATE.format(d);
}
// Window label with wrap awareness: `${doyLabel(startDoy)} – ${doyLabel(endDoy)}`
```

### Recompute over cached files (no fetch)
```typescript
// main.ts  [VERIFIED: computeMarkerDatum + installMarkerLayer signatures]
// At boot, cache the fetched files:
const cache = new Map<number, { meta: StationMeta; file: DerivedFile }>();
// ... populate inside loadMarkerData instead of discarding `file` ...

function recompute(s: Readonly<SelectionState>): MarkerDatum[] {
  const window = anchorToWindow(s.anchorDoy, s.widthDays);
  const range = { from: s.yearFrom, til: s.yearTil };
  const out: MarkerDatum[] = [];
  for (const { meta, file } of cache.values()) {
    try { out.push(computeMarkerDatum(meta, file, window, range)); } // NEW yearRange arg
    catch { out.push(mutedDatum(meta)); }
  }
  return out;
}
// Debounced subscriber (recompute only; URL write is immediate):
let t: ReturnType<typeof setTimeout> | undefined;
store.subscribe((s) => {
  clearTimeout(t);
  t = setTimeout(() => { installMarkerLayer(map, recompute(s)); renderComposite(map); }, 120);
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `location.hash` state | `history.pushState` + `URLSearchParams` | Standard since ~2015 | Cleaner URLs, back-button control, no reload. |
| Manual "isUpdating" flag to break URL loops | Write-always / read-on-popstate asymmetry | Best practice | No flag needed; loop is structurally impossible. |
| Framework store (redux/zustand) for tiny state | Vanilla observable (`Set<listener>`) | For single flat state | Zero deps; matches project convention. |
| Hardcoded locale month arrays | `Intl.DateTimeFormat` | Universal in modern browsers/Node ICU | Locale-correct, verified Icelandic. |

**Deprecated/outdated:**
- Nothing in the phase's toolset is deprecated. `<input type=range>`, `URLSearchParams`, History API, and `Intl` are all stable, widely-supported platform APIs.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Window anchor = window START (not center) is the right mental model for the scrubber | Pattern 4 | LOW — pure display/semantics; easily flipped. Recommend documenting; a planner/discuss can flip to "center" if the gottvedur reference implies it. Does not affect the domain math (WindowSpec is start/end regardless). |
| A2 | Union (not intersection) of per-station year ranges is the correct bound for the Frá/Til dropdowns | Code Examples / Year Bounds | LOW-MEDIUM — honest-N already covers stations that can't answer a picked year. Union is the generous, honest choice; documented rationale. A reviewer might prefer intersection for "every marker is comparable" — but that hides 60yr of Reykjavík. Flag for discuss if desired. |
| A3 | Width buttons should use `pushState` (undoable), not `replaceState` | Pattern 3 | LOW — CONTEXT.md leaves debounce/encoding to discretion; only says scrubber-drag/pan-zoom = replace, station = push. Width/year classified as discrete→push by analogy. Cheap to change. |
| A4 | 120 ms trailing debounce on recompute is adequate for the 2-station sample and scales to ~450 (Phase 8) | Recompute Performance | LOW at 2 stations; MEDIUM at 450 — see §Recompute Performance for the measurement plan. Debounce value is a tuning knob, not a contract. |
| A5 | The observable store pattern (Object.freeze + Set<listener>) is the idiomatic vanilla choice | Pattern 1 | LOW — standard pattern; no external dependency; trivially replaceable. |
| A6 | Single compact viewport param `v=lat,lng,zoom` is preferable to three params | Pattern 2 | LOW — cosmetic URL choice; CONTEXT.md leaves encoding to discretion. |

**If this table is empty:** it is not — six low-risk assumptions, all in Claude's-discretion territory or trivially reversible. None block planning.

## Open Questions

1. **Window anchor semantics (start vs center vs end).**
   - What we know: `WindowSpec` is start/end doy; the scrubber picks one doy + a width.
   - What's unclear: whether the picked doy is the window's start, center, or end. gottvedur.is/kort uses a "now" marker on a timeline.
   - Recommendation: **anchor = start** ("pick when your trip begins"), documented; `anchorToWindow` centralizes it so flipping to center is a one-function change. Non-blocking.

2. **Should width buttons and year dropdowns push or replace history?**
   - What we know: CONTEXT.md pins scrubber/pan-zoom = replace, station = push; leaves the rest to discretion.
   - Recommendation: push (discrete, undoable). Non-blocking; see A3.

3. **Does the year-range param belong on `computeMarkerDatum` (recommended) or a caller-side pre-filter?**
   - What we know: `WindowSpec` has no year field; year range is a real second dimension.
   - Recommendation: add `yearRange` param to `computeMarkerDatum` (Option A, Pattern 4) — single choke point, and `effectiveN` then reports honest N within range. Planner should treat this as the phase's one signature change.

## Environment Availability

> The phase is browser/client code + a pure signature change. No new external tools/services. The existing test + build stack is confirmed present.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node ICU (`Intl` full locale data) | Icelandic date labels in unit tests | ✓ | node 22 full-ICU (verified `is-IS` renders months) | Browser ICU is always full; only test-env matters |
| Vitest | Unit tests (store, url round-trip, window, bounds) | ✓ | ^4.1.10 (root `package.json`) | — |
| Playwright | E2E (no-network, URL-restore, scrubber recompute) | ✓ | 1.61.1 (`site` + root) | — |
| Vite build + preview | E2E runs against preview build | ✓ | 8.1.5 | — |
| Committed sample data (`site/public/data`) | Recompute + bounds derivation in E2E | ✓ | 2-station sample (Reykjavík #1 1949–2026, Keflavík #1350 2008–2026) | `npm run copy-data` re-copies from `data` branch |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none — full stack present.

## Recompute Performance (SEL-04 detail)

- **Cost model:** `computeMarkerDatum` per station = decode file + `groupBySeasonYear` (O(rows)) + `qualifyingYears`/`effectiveN` + a few `meanPerYearThenAverage` passes over in-window rows. For deep SYNOP #1 (~28k rows) this is a few ms; for AWS (~6k rows) sub-ms. At **2 stations**: trivially < 5 ms per recompute. At **~450 stations (Phase 8)**: linear → estimate tens of ms if files are similarly sized; most stations are shallow (AWS), so realistically < 50 ms.
- **Debounce:** 120 ms trailing on the recompute subscriber (Code Examples). During a scrubber drag this coalesces rapid `input` ticks into ~8 recomputes/sec max. URL `replaceState` stays immediate per-tick (cheap). `[ASSUMED — A4]`
- **Memoization (design for Phase 8, don't build now):** recompute output is a pure function of `(window, yearRange)` × the immutable derived files. If 450-station recompute ever exceeds a frame budget, memoize by keying a `Map<'${startDoy},${endDoy},${from},${til}'>, MarkerDatum[]>` — but **do not build this in Phase 4** (2 stations don't need it; premature). Note it as a Phase-8 seam. The pure producer makes this a drop-in later.
- **Decode cost:** `computeMarkerDatum` calls `decodeDerived(file)` every call. At 450 stations, decoding on every tick could dominate. **Optimization seam (flag, don't necessarily build):** decode once at boot into a `station→DailyObservation[]` cache and add a `computeMarkerDatumFromRows` variant, OR memoize decode. For the 2-station sample, re-decoding is negligible — measure at Phase 8 scale before optimizing.
- **Proving no-network:** see Validation Architecture (`page.on('request')` scoped to `**/data/**`, asserted 0 across a scrubber interaction).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (unit, root) + Playwright 1.61.1 (E2E, `site`, preview build) |
| Config file | `vitest.config.ts` (root); `site/playwright.config.ts` (E2E, baseURL `http://localhost:4173/betravedur/`) |
| Quick run command | `npm test` (vitest run) |
| Full suite command | `npm test && (cd site && npm run e2e)` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEL-01 | anchor+width → correct WindowSpec incl. wrap (Dec→Jan) | unit | `npx vitest run site/src/data/window.test.ts` | ❌ Wave 0 |
| SEL-02 | year bounds = union of manifest from/to; Frá/Til clamped, start≤end | unit | `npx vitest run site/src/state/defaults.test.ts` | ❌ Wave 0 |
| SEL-02/03 | `computeMarkerDatum` yearRange filter → N reflects qualifying years in range | unit | `npx vitest run site/src/data/averages.test.ts` | ⚠️ exists; extend for yearRange |
| SEL-03 | insufficient (N<3) in a picked range → muted "ófullnægjandi gögn" | unit | `npx vitest run site/src/data/averages.test.ts` | ⚠️ extend |
| SEL-04 | recompute produces new MarkerDatum[] over cached files (no fetch fn called) | unit | `npx vitest run site/src/state/recompute.test.ts` | ❌ Wave 0 |
| UX-02 | stateToParams ∘ paramsToState = identity (round-trip); defensive parse of garbage | unit | `npx vitest run site/src/state/url.test.ts` | ❌ Wave 0 |
| SEL-04 | **no `**/data/**` request fires on a scrubber change** | E2E | `cd site && npx playwright test tests/e2e/selection.spec.ts -g "no network"` | ❌ Wave 0 |
| SEL-04 | scrubber drag re-renders pills (temp label changes for a new window) | E2E | `cd site && npx playwright test tests/e2e/selection.spec.ts -g "recompute"` | ❌ Wave 0 |
| UX-02 | load a crafted URL → exact view restored (doy, width, years, viewport) | E2E | `cd site && npx playwright test tests/e2e/selection.spec.ts -g "URL restore"` | ❌ Wave 0 |
| UX-02 | back button reverts a discrete change (station/width) via popstate | E2E | `cd site && npx playwright test tests/e2e/selection.spec.ts -g "back button"` | ❌ Wave 0 |

### The no-network assertion (canonical shape)
```typescript
// site/tests/e2e/selection.spec.ts  [VERIFIED: Playwright request event — playwright.dev/docs/network]
test("no network request fires on a selection change (SEL-04)", async ({ page }) => {
  await page.goto("/");
  await waitForMarkers(page);              // reuse the Phase-3 helper
  let dataRequests = 0;
  page.on("request", (req) => { if (req.url().includes("/data/")) dataRequests++; });
  // drive a scrubber change via the store (deterministic, no drag flakiness):
  await page.evaluate(() => (window as any).__store?.set({ anchorDoy: 30, widthDays: 30 }));
  await page.waitForTimeout(300);          // > debounce, let recompute + render settle
  expect(dataRequests).toBe(0);            // ← the SEL-04 proof
});
```
*(Expose `window.__store` in `main.ts` alongside the existing `window.__map` (`main.ts:94`) for deterministic E2E driving — same pattern already in the codebase.)*

### URL-restore assertion (canonical shape)
```typescript
test("a crafted URL restores the exact view (UX-02)", async ({ page }) => {
  await page.goto("/?doy=30&w=30&fra=2015&til=2026&v=64.5,-20.0,7");
  await waitForMarkers(page);
  const s = await page.evaluate(() => (window as any).__store.get());
  expect(s).toMatchObject({ anchorDoy: 30, widthDays: 30, yearFrom: 2015, yearTil: 2026 });
  expect(await page.evaluate(() => (window as any).__map.getZoom())).toBeCloseTo(7, 0);
});
```

### Sampling Rate
- **Per task commit:** `npm test` (vitest — fast, < a few sec).
- **Per wave merge:** `npm test && (cd site && npm run e2e)` (E2E builds + previews).
- **Phase gate:** full suite green before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `site/src/data/window.test.ts` — covers SEL-01 (anchor→WindowSpec, wrap)
- [ ] `site/src/state/url.test.ts` — covers UX-02 (round-trip identity + defensive parse)
- [ ] `site/src/state/defaults.test.ts` — covers SEL-02 (union bounds, default selection, clamps)
- [ ] `site/src/state/recompute.test.ts` — covers SEL-04 (pure recompute over cached files)
- [ ] extend `site/src/data/averages.test.ts` — yearRange param + honest-N-in-range (SEL-02/03)
- [ ] `site/tests/e2e/selection.spec.ts` — no-network, recompute-visible, URL-restore, back-button (SEL-04, UX-02)
- [ ] expose `window.__store` in `main.ts` (mirrors existing `window.__map`) for E2E
- Framework install: none — Vitest + Playwright already present.

## Security Domain

> `security_enforcement` is not disabled in config. Included; scope is narrow (static client, no auth, no server, no secrets).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth; keyless static site. |
| V3 Session Management | no | No sessions. |
| V4 Access Control | no | Public read-only static content. |
| V5 Input Validation | **yes** | URL query params are attacker-controllable input. Parse defensively: clamp `doy∈[1,365]`, `w∈{7,14,21,30}`, `fra`/`til∈[bounds]` with `fra≤til`, viewport within Iceland `maxBounds`; coerce non-numeric → default; never let a param flow as `NaN`/out-of-range into `expandWindow`/`computeMarkerDatum` (which are defensive but should not be relied on as the only guard). Matches the codebase's defensive-decode ethos (`load.ts`, `window.ts`). |
| V6 Cryptography | no | None. |

### Known Threat Patterns for static-client URL-state

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed/hostile query params (`doy=NaN`, `w=999999`, huge zoom) | Tampering / DoS | Clamp + validate in `paramsToState`; fall back to defaults. Never throw. |
| Reflected param into DOM (e.g. station name from URL) | XSS (Injection) | Do NOT innerHTML any URL-derived string. Station id is parsed to `number`; labels come from trusted `stations.json`, not the URL. Keep it that way. |
| Oversized viewport → attempted huge recompute | DoS | Recompute cost is bounded by station count (fixed), not by param values; viewport clamp to `maxBounds` (already set in `init.ts`). |
| `history` flooding via automated param spam | DoS (local only) | replaceState for continuous inputs avoids unbounded history growth. |

## Sources

### Primary (HIGH confidence)
- Live codebase — `site/src/data/averages.ts`, `site/src/map/markers.ts`, `site/src/main.ts`, `site/src/data/types.ts`, `site/src/data/load.ts`, `packages/domain/src/window.ts`, `packages/domain/src/types.ts`, `packages/domain/src/index.ts` — verified `computeMarkerDatum` signature, idempotent `installMarkerLayer`/`attachCompositeRenderer`, WindowSpec = doy-only, manifest `from`/`to`, boot fetch-once path.
- `../betravedur-data/stations.json` + `manifest.json` + Phase-2 SUMMARY — verified per-station high-water marks (Reykjavík 1949–2026, Keflavík 2008–2026); union bounds {1949, 2026}.
- Runtime check (`node -e`) — `Intl.DateTimeFormat('is-IS')` renders Icelandic months ("16. júlí", "1. janúar", "31. desember"). `[VERIFIED 2026-07-20]`
- `developer.mozilla.org/en-US/docs/Web/API/History_API/Working_with_the_History_API` — pushState/replaceState do not fire popstate; back-button semantics.
- `playwright.dev/docs/network` — `page.on('request')` / `page.route` for request counting / no-network assertion.

### Secondary (MEDIUM confidence)
- `.planning/research/FEATURES.md` — permalink guidance (replaceState refinements / pushState navigations), URL-as-state.
- MDN `URLSearchParams`, `<input type=range>`, `Intl.DateTimeFormat` — platform API contracts.

### Tertiary (LOW confidence)
- WebSearch on pushState/replaceState debounce patterns — general community guidance; the loop-prevention specifics are grounded in the MDN popstate contract (promoted to HIGH).

## Metadata

**Confidence breakdown:**
- Standard stack (zero new deps, platform APIs): HIGH — verified against codebase conventions + runtime.
- State architecture (loop-proof URL round-trip): HIGH — grounded in the MDN popstate contract; asymmetry is a known-correct pattern.
- Recompute wiring (no-fetch, idempotent re-render): HIGH — `computeMarkerDatum` purity, `installMarkerLayer` re-`setData`, `attachCompositeRenderer` WR-04 idempotency all verified in source.
- Year bounds (union) + honest-N-in-range: HIGH on mechanism (manifest shape verified); MEDIUM on union-vs-intersection *policy* (A2, low risk).
- Scrubber (native range + Intl 'is-IS'): HIGH — Icelandic rendering runtime-verified.
- Perf at 450 stations: MEDIUM — 2-station cost trivial; scaling is an estimate with a documented measurement/memoization seam for Phase 8.

**Research date:** 2026-07-20
**Valid until:** 2026-08-19 (stable platform APIs + internal codebase; 30 days)
