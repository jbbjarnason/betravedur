# Phase 7: Responsive UX & Trust States - Research

**Researched:** 2026-07-20
**Domain:** Vanilla-TS responsive UI (mobile bottom sheet), map licensing/attribution layout, trust/info panel, loading/empty/error states, multi-viewport Playwright
**Confidence:** HIGH (codebase verified directly; external claims verified against official docs)

## Summary

This phase is a **consolidation** phase on an already-mature vanilla-TS + MapLibre + ECharts codebase. There is essentially **zero new library surface** required — the two runtime deps (echarts, suncalc) stay, and every recommendation below is hand-rolled CSS/DOM/`matchMedia`, consistent with the project's zero-extra-dep discipline. The three requirements (UX-03 responsive/bottom-sheet, UX-04 info/trust panel, UX-05 loading/empty/error states) all extend existing, well-structured seams: `stationPanel.ts` (already mounts a `position:fixed` right-dock panel with a `<640px` full-width overlay media query explicitly annotated "Phase 7 promotes this to a bottom sheet without restructuring"), `main.ts` boot sequence (a single async `install()` with a top-level catch that currently only `console.error`s a data-load failure), and `map/init.ts` (where a MapLibre `error` handler belongs).

The two highest-leverage decisions are: **(1) the mobile bottom sheet** — hand-roll it with CSS `transform: translateY()` snap positions driven by pointer events + a `matchMedia("(max-width: 640px)")` signal, NOT a library. The panel already unmounts/remounts on every open and already has a `.panel-open` body-class seam; a bottom sheet is a CSS-state promotion of the existing `@media (max-width:640px)` block plus a small drag controller. **(2) attribution** — replace the accumulated incremental fixes (`--bar-height` margin lift, `.panel-open { margin-right: 344px }`, `max-width:60vw` cap) with ONE coherent approach: **keep MapLibre's native compact `AttributionControl` (already configured `compact:true`) and rely on its `(i)`-button collapse** — CC BY 4.0 v4.0 explicitly permits collapsing attribution behind an (i) button as long as the full credit is findable, which the compact control satisfies. Additionally surface the full `ATTRIBUTION` prose inside the new info panel (UX-04 already requires this), giving a second always-findable home for the credit. This lets the fragile margin/positioning hacks be deleted rather than extended.

The freshness timestamp requires a **minimal pipeline addition**: the committed `manifest.json` currently has NO top-level `generatedAt` — only per-station `lastFetched` ISO strings. The cheapest correct fix is for the pipeline's manifest serializer to write a top-level `generatedAt` (or the client derives "newest `lastFetched`"); the client formats it as an Icelandic date. Both approaches are documented below; a top-level `generatedAt` is the recommended contract for Phase 8's nightly run.

**Primary recommendation:** Hand-roll the bottom sheet (CSS transform + pointer drag + `matchMedia`); delete the incremental attribution hacks in favor of MapLibre native compact mode + full credit in the info panel; add a top-level `generatedAt` to the manifest in the pipeline and read it in the client; gate loading/error/empty states at the three exact seams identified in `main.ts`/`init.ts`/`load.ts`; test with Playwright at two viewports (1280×800 desktop, 390×844 mobile) using `page.setViewportSize` (the pattern already in `shell.spec.ts`/`selection.spec.ts`).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Responsive layout switch (side panel ↔ bottom sheet) | Browser / Client (CSS + matchMedia) | — | Pure presentation; no data or server involvement. CSS media query owns the visual switch; a JS `matchMedia` signal only enables/disables the drag controller. |
| Bottom-sheet drag / snap physics | Browser / Client (pointer events) | — | DOM/touch interaction; hand-rolled, no server. |
| Info / trust panel content | Browser / Client (static DOM) | Domain (ATTRIBUTION constant) | Static Icelandic copy + the `@betravedur/domain` ATTRIBUTION single-source-of-truth. |
| First-visit auto-open flag | Browser / Client (localStorage) | — | A dismissed-hint boolean; explicitly NOT user data/accounts (CONTEXT). |
| Data freshness timestamp | Database / Storage (manifest.json) → Client | Pipeline (writes generatedAt) | The pipeline OWNS writing the timestamp (Phase 8 contract); the client only reads + formats it. |
| Map-load-error state | Browser / Client (MapLibre `error` event) | — | Client-side error surfacing over the canvas. |
| Empty-stations / data-load-failure state | Browser / Client (boot catch + load.ts) | — | `load.ts` already throws on non-ok HTTP; `main.ts` catch surfaces it. |
| Initial loading affordance | Browser / Client (boot sequence) | — | A lightweight in-DOM affordance gated on style-load + first render. |

## Standard Stack

### Core

No new runtime dependencies. All existing:

| Library | Version (installed) | Purpose | Why Standard |
|---------|--------------------|---------|--------------|
| maplibre-gl | 5.24.0 | Map + native `AttributionControl` (compact) + `error` event | Already the map engine; its compact attribution + `error` event are the standard, framework-free solutions for UX-04 attribution and UX-05 map-load-error. [VERIFIED: site/package.json + map/init.ts] |
| echarts | (installed) | Station charts (lazy chunk) | Unchanged; phase does not touch chart internals. [VERIFIED: package.json] |
| suncalc | (installed) | Daylight readout | Unchanged. [VERIFIED: package.json] |

### Supporting (browser built-ins — no install)

| API | Purpose | When to Use |
|-----|---------|-------------|
| `window.matchMedia("(max-width: 640px)")` | The desktop↔mobile signal that enables the bottom-sheet drag controller and lets JS know which layout is active | Bottom-sheet mount/teardown of drag listeners; keep in sync with the CSS `@media (max-width:640px)` breakpoint. [CITED: MDN matchMedia] |
| Pointer Events (`pointerdown`/`pointermove`/`pointerup` + `setPointerCapture`) | Bottom-sheet drag; unifies touch + mouse + pen in one code path | The single standard way to hand-roll a draggable sheet without a library. [CITED: MDN Pointer Events] |
| CSS `transform: translateY()` + `transition` | Sheet snap animation (peek ↔ expanded), GPU-composited, respects `prefers-reduced-motion` | Snap-point animation; the existing panel.css already gates transitions on reduced-motion. [ASSUMED — standard practice] |
| `<details>`/`<summary>` | Native expand/collapse for the info panel's licence full-text and MapLibre's own compact attribution toggle | Already the project's pattern (legend explainer, ranked-list collapse); zero JS, free keyboard + `aria-expanded`. [VERIFIED: legend.ts uses it; MapLibre compact control uses it internally] |
| `aria-live="polite"` region | Announce loading→ready, empty, and error state transitions to screen readers | UX-05 a11y; a single visually-styled or visually-hidden live region toggled by the boot sequence. [CITED: MDN ARIA live regions] |
| `localStorage` | First-visit dismissed-hint flag (a single boolean key) | UX-04 first-visit auto-open; NOT accounts/user data (CONTEXT explicitly permits this one flag). [ASSUMED — standard] |
| `Intl.DateTimeFormat("is-IS", …)` | Icelandic freshness date | UX-04 "uppfært {date}". **CAVEAT below** — the codebase found `is-IS` NUMBER formatting unreliable in the headless runtime and hand-rolls comma decimals. See Pitfall 3. [VERIFIED: stationPanel.ts formatIce comment] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled bottom sheet | A tiny lib (see Package Legitimacy Audit) | Adds a runtime dep for ~120 lines of CSS+pointer code the project can own; violates the zero-extra-dep discipline. The existing panel structure (header + independently-scrolling body) is already sheet-ready. **Recommend hand-roll.** |
| MapLibre native compact attribution | Custom always-visible mini-credit + full text in info panel only | The native control already ships, is keyboard-accessible, and satisfies CC BY 4.0's (i)-button collapse allowance. Building a custom credit widget is more code AND must independently satisfy licensing. **Recommend keep native compact + ALSO mirror full credit in the info panel** (belt-and-suspenders, and UX-04 requires the info-panel credit anyway). |
| Top-level `generatedAt` in manifest | Client derives "newest per-station `lastFetched`" | Deriving works with zero pipeline change but couples the client to per-station bookkeeping semantics and is O(n) each boot. A single top-level `generatedAt` is a cleaner Phase-8 contract. **Recommend add `generatedAt`.** |

**Installation:** None. `npm install` unchanged.

## Package Legitimacy Audit

> This phase installs **no new packages**. The audit exists only to document the "considered but rejected" bottom-sheet libraries so the planner has provenance if the discretion call is revisited.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| (none) | — | — | — | — | — | No install — hand-roll |

**Considered-then-rejected libraries (NOT recommended, documented for provenance only):**
- Bottom-sheet helper libraries exist in the JS ecosystem, but **all are `[ASSUMED]`** (names would come from WebSearch/training, not authoritative docs), and every one adds a runtime dependency the project explicitly avoids. Because none is being installed, no slopcheck was run. **If the planner ever reverses the hand-roll decision, it MUST gate the chosen package behind a `checkpoint:human-verify` task and run the Package Legitimacy Gate first.**

**Packages removed due to slopcheck [SLOP] verdict:** none (no packages evaluated for install)
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────────────────────┐
   page load  ─────────▶ │ boot() in main.ts                            │
                         │  renderHeader → initMap → mountLegend        │
                         │  + [NEW] mount info "i" button (UX-04)       │
                         │  + [NEW] show INITIAL LOADING affordance     │
                         └───────────────┬─────────────────────────────┘
                                         │ map.once("load")
                       ┌─────────────────┴──────────────────┐
                       │ [NEW] map.on("error", …)           │  ◀── MapLibre style/PMTiles
                       │  → "Ekki tókst að hlaða kortið"    │       failure  (UX-05)
                       └─────────────────┬──────────────────┘
                                         │ style loaded
                         ┌───────────────▼─────────────────────────────┐
                         │ wireMarkers → install() (async)              │
                         │  loadStationFiles():                         │
                         │   Promise.all(loadStations, loadManifest)    │
                         │      │            │                          │
                         │  stations[]   manifest{stations, [NEW]       │
                         │      │         generatedAt}                  │
                         │      │            └──▶ [NEW] freshness date   │
                         │      │                 → info panel (UX-04)   │
                         │  empty/404 ──▶ [NEW] "Engar veðurstöðvar"    │
                         │      │              (UX-05, via load.ts throw)│
                         │      ▼                                        │
                         │  buildStationCache → renderForState          │
                         │  → [NEW] HIDE loading affordance             │
                         │  mountControlBar / mountRankedList /         │
                         │  mountStationPanel                           │
                         └───────────────┬─────────────────────────────┘
                                         │ user clicks a marker/row (stationId set)
                         ┌───────────────▼─────────────────────────────┐
                         │ mountStationPanel.open(stationId)            │
                         │  matchMedia(max-width:640px)?                │
                         │    ├─ NO  → right-dock SIDE panel (current)  │
                         │    └─ YES → [NEW] BOTTOM SHEET               │
                         │             (peek ↔ expanded, pointer drag,  │
                         │              non-modal: map stays pannable)  │
                         └──────────────────────────────────────────────┘
```

### Component Responsibilities

| File | Current Responsibility | Phase 7 Change |
|------|-----------------------|----------------|
| `site/src/main.ts` | Boot orchestration; single async `install()` with top-level catch that only `console.error`s | Add initial loading affordance (show before `install`, hide after first `renderForState`); route the `install()` catch to a visible error state; wire the info "i" button + freshness read; register the map `error` handler (or do it in `init.ts`) |
| `site/src/map/init.ts` | Constructs map, adds compact `AttributionControl` | Add `map.on("error", handler)` for map-load-error (UX-05). Keep `compact:true` attribution (already correct for UX-04). |
| `site/src/data/load.ts` | Fetches stations/manifest/derived; throws on non-ok HTTP (res.ok check from Phase 3) | Distinguish empty stations (`[]`) → "Engar veðurstöðvar"; the throw path already feeds the boot catch. Optionally read/pass `manifest.generatedAt`. |
| `site/src/ui/stationPanel.ts` | Right-dock side panel; unmount/remount per open; `.panel-open` body class; `@media(max-width:640px)` full-width overlay | Promote the `<640px` overlay to a draggable bottom sheet with peek/expanded snap points; add a `matchMedia`-gated pointer drag controller; keep the same DOM (header + scroll body) so desktop is unaffected |
| `site/src/ui/rankedList.ts` | Ranked list with a collapse toggle; `setYielded` hide-not-destroy | On mobile with a panel open, collapse to a chip/toggle (CSS via the same `<640px` query); already has collapse machinery to reuse |
| `site/src/ui/legend.ts` | Static legend + `<details>` explainer | On mobile, collapse to a small chip/toggle (CSS-only) so it doesn't fight the sheet |
| `site/src/ui/controlBar.ts` | Bottom bar; writes `--bar-height`; compact stepper `<640px` | Ensure it stays reachable with the sheet open; no horizontal overflow (Phase 4 stepper already handles narrow) |
| `site/src/styles/controls.css` | Attribution margin-lift hacks (`--bar-height`, `.panel-open{margin-right:344px}`, `max-width:60vw`) | **DELETE the incremental hacks** in favor of the coherent attribution approach (see Pattern 2) |
| **NEW** `site/src/ui/infoPanel.ts` | — | The UX-04 info/trust panel + "i" button + first-visit localStorage auto-open, reusing ATTRIBUTION + freshness |
| **NEW** `site/src/ui/loadingState.ts` (or inline in main.ts) | — | Initial loading affordance + error/empty state renderers + `aria-live` region |
| `pipeline/src/manifest.ts` | Serializes `{stations}` deterministically; no top-level fields | Add top-level `generatedAt` (ISO) to `serializeManifest` output (see Pattern 3) |

### Recommended file additions

```
site/src/ui/
├── infoPanel.ts       # UX-04: "i" button, trust panel, first-visit localStorage, ATTRIBUTION + freshness
├── bottomSheet.ts     # UX-03: matchMedia-gated pointer-drag controller (imported by stationPanel.ts)
└── states.ts          # UX-05: loading/empty/error renderers + aria-live announcer
site/src/styles/
├── info.css           # info panel + "i" button styling
└── sheet.css          # bottom-sheet transforms/snap (or extend panel.css @media block)
```

### Pattern 1: Hand-rolled bottom sheet (matchMedia-gated pointer drag)

**What:** On `≤640px`, the station panel renders as a bottom sheet with two snap points (peek and expanded). Drag via Pointer Events; snap on release by nearest position; CSS `transform: translateY()` animates. Non-modal — the map behind stays pannable (do NOT trap focus or add a full-screen backdrop on mobile; contrast with the desktop side panel which is a focus-trapped modal-like overlay).

**When to use:** Only when `matchMedia("(max-width: 640px)").matches`. On desktop the existing side-panel path (with its Tab focus-trap + `.panel-open` credit offset) is unchanged.

**Key implementation notes (from codebase constraints):**
- The panel is rebuilt from scratch on every open (`stationPanel.ts` `open()`), so the sheet controller must be (re)attached per open and torn down in `teardown()` alongside `disposeCharts()`.
- Snap points: `peek` (e.g. `translateY(calc(100% - {peekHeight}))`) and `expanded` (`translateY(0)`). Peek height a Claude's-discretion token (e.g. header + first figure visible).
- Use `element.setPointerCapture(e.pointerId)` on `pointerdown` in the drag handle (the header) so `pointermove` keeps firing outside the element; release on `pointerup`.
- Respect `prefers-reduced-motion`: the panel.css already zeroes transitions under reduced motion — extend that to the sheet transform.
- Touch targets ≥44px (the close button already is; the drag handle should be ≥44px tall).
- The ECharts charts inside the sheet must `resize()` when the sheet expands — the chart chunk mounts into a fixed-height host (`.station-panel__chart-host { height:150px }`), which is height-stable across snap changes, so a full re-layout is likely unnecessary; verify charts render at the mobile width (the host is `width:100%`).

**Example (structure — hand-rolled, no library):**
```typescript
// Source: MDN Pointer Events + matchMedia (pattern, not verbatim from a single doc)
const mobile = matchMedia("(max-width: 640px)");
function attachSheet(sheetEl: HTMLElement, handleEl: HTMLElement): () => void {
  let startY = 0, startTranslate = 0, dragging = false;
  const onDown = (e: PointerEvent) => {
    dragging = true; startY = e.clientY;
    startTranslate = currentTranslate(sheetEl);
    handleEl.setPointerCapture(e.pointerId);
    sheetEl.style.transition = "none"; // no easing while dragging
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const dy = Math.max(0, startTranslate + (e.clientY - startY));
    sheetEl.style.transform = `translateY(${dy}px)`;
  };
  const onUp = (e: PointerEvent) => {
    dragging = false;
    handleEl.releasePointerCapture(e.pointerId);
    sheetEl.style.transition = ""; // restore CSS easing (reduced-motion aware)
    snapToNearest(sheetEl); // sets transform to peek OR expanded translateY
  };
  handleEl.addEventListener("pointerdown", onDown);
  handleEl.addEventListener("pointermove", onMove);
  handleEl.addEventListener("pointerup", onUp);
  return () => { /* remove listeners in teardown() */ };
}
// Only wire the drag when the mobile media query matches; the CSS @media owns the layout.
```

### Pattern 2: Coherent attribution — native compact control + info-panel mirror (DELETE the hacks)

**What:** Stop treating attribution positioning as a per-state layout problem. Instead:
1. **Keep MapLibre's native `AttributionControl({ compact: true })`** (already configured in `init.ts`). In compact mode MapLibre renders a small `(i)` toggle that expands the full credit via native `<details>/<summary>`. Below 640px it auto-collapses on map interaction.
2. **Mirror the full `ATTRIBUTION` prose inside the new info panel** (UX-04 already requires the Veðurstofan CC BY 4.0 credit there). This gives a second, always-findable home for the full credit.
3. **Delete the incremental hacks** in `controls.css`: the `.panel-open { margin-right:344px }` rule (the bottom sheet no longer overlaps a right-dock panel on mobile, and on desktop the compact `(i)` collapses so a wrapped multi-line credit no longer collides with the legend), the `max-width:60vw` right-align cap, and — evaluate — the `--bar-height` margin lift (the compact single-line `(i)` button is small enough to sit clear of the bar with a simple fixed offset). Keep whatever minimal offset is needed so the `(i)` button itself is never under the control bar.

**Why this is licensing-safe:** CC BY 4.0 (v4.0) explicitly permits satisfying attribution "in any reasonable manner based on the medium," and the Creative Commons / OSM guidance for web maps explicitly blesses **collapsing attribution behind an `(i)` button** as long as users can still find the license if they look for it (and permits auto-collapse on pan/zoom). The compact control + info-panel full text satisfies this for CC BY 4.0 (Veðurstofan), ODbL (OpenStreetMap), and the Protomaps basemap credit simultaneously. [CITED: creativecommons.org/licenses/by/4.0 + osmfoundation.org/wiki/Licence/Attribution_Guidelines]

**When to use:** This is the ONE robust approach the CONTEXT asks for. It removes the recurring UI-review finding by making attribution self-contained (the control owns its own collapse) rather than a layout-negotiation with the legend/panel/bar.

**Anti-pattern avoided:** Continuing to add per-state margin offsets (`.panel-open`, `--bar-height`, `60vw`) — each new UI state (the bottom sheet is a new state) would need another offset rule. The compact control sidesteps this entirely.

### Pattern 3: Freshness timestamp — add top-level `generatedAt` to the manifest

**What:** The committed `manifest.json` (verified: `site/public/data/manifest.json` and `dist/data/manifest.json`) currently has ONLY `{ "stations": { "<id>": { file, hash, from, to, lastFetched } } }`. There is **NO top-level `generatedAt`**. `lastFetched` is per-station ISO (e.g. `"2026-07-20T07:18:37.625Z"`).

Two options (recommend A):

**Option A (recommended) — pipeline writes `generatedAt`:**
- In `pipeline/src/manifest.ts` `serializeManifest`, emit `{ generatedAt: <ISO>, stations: {…} }`. This is a one-field addition; keep the deterministic station-id sort for delta-friendly commits (the new top-level field is written once per run and is stable within a run).
- Update the client `Manifest` interface in `site/src/data/load.ts` to add `generatedAt?: string`.
- Phase 8's nightly run naturally refreshes it (the manifest is rewritten each run).
- **Determinism caveat:** `serializeManifest`'s current contract is "unchanged manifest serializes byte-identically." Adding an always-current `generatedAt` breaks byte-identity even when no station changed. Decision for the planner: either (a) accept a manifest that changes every run (fine — Phase 8 commits nightly anyway), or (b) only bump `generatedAt` when at least one station's bytes changed. **Recommend (a)** for simplicity, but flag this as a decision — it touches the existing manifest determinism tests.

**Option B — client derives newest `lastFetched`:**
- Zero pipeline change. Client computes `max(entry.lastFetched)` across `manifest.stations`. O(n) each boot; ~518 stations is trivial.
- Downside: couples "freshness" to per-station bookkeeping and won't reflect a run that fetched nothing new.

**Icelandic date formatting:** UX-04 wants "uppfært {date}". Use `Intl.DateTimeFormat("is-IS", { day:"numeric", month:"long", year:"numeric" })` for a human date (e.g. "20. júlí 2026"). **VERIFY at build/test time** that the headless runtime has is-IS date data — the codebase found `Intl.NumberFormat("is-IS")` fell back to a dot decimal in the headless runtime and now hand-rolls comma decimals (`formatIce` in stationPanel.ts). Date formatting may or may not have the same gap; if `is-IS` month names are unavailable in the test runtime, fall back to a small hand-rolled Icelandic month array. See Pitfall 3.

### Anti-Patterns to Avoid
- **Full-screen modal bottom sheet on mobile:** CONTEXT requires non-modal (map stays pannable, Google-Maps style). Do NOT add a backdrop or focus-trap on the mobile sheet (the desktop side panel's Tab-trap is correct there but wrong for the non-modal sheet).
- **A JS resize/positioning layer for attribution:** Let the native compact control own its collapse. Do not re-introduce per-state margin math.
- **Blocking the restored view on first-visit auto-open:** CONTEXT — a shared permalink lands with a station already open; the info panel auto-open must be dismissible and must not block interacting with the restored view. Auto-open should not steal a focus-trap over the restored panel.
- **Hardcoding the freshness date:** CONTEXT explicit — read from the manifest.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Attribution collapse/expand toggle | A custom credit widget with show/hide JS | MapLibre native `AttributionControl({compact:true})` (already present) | It already ships, is keyboard-accessible, uses native `<details>`, and satisfies CC BY 4.0's (i)-button allowance |
| Expand/collapse in the info panel + chips | Custom toggle JS with aria wiring | Native `<details>/<summary>` (already the project pattern in legend.ts) | Free keyboard + `aria-expanded`; zero JS |
| Touch + mouse + pen drag unification | Separate touch/mouse handlers | Pointer Events + `setPointerCapture` | One code path, capture-outside-element for free |
| Media-query reactions in JS | `resize` listener + manual width math | `window.matchMedia(query)` + its `change` event | The standard, cheap breakpoint signal that mirrors the CSS `@media` |

**Key insight:** For a bottom sheet the ONLY thing worth hand-rolling is the ~120-line pointer-drag/snap controller; everything adjacent (media queries, expand/collapse, attribution) already has a built-in or an existing project pattern. The net new code is small and dependency-free.

## Common Pitfalls

### Pitfall 1: The panel rebuilds on every open — sheet state must be per-open
**What goes wrong:** Attaching the drag controller once at mount leaks or points at a stale node, because `stationPanel.ts` `open()` does `if (panel) panel.remove()` and builds a fresh `<section>` every time.
**Why it happens:** The panel is intentionally cheap-DOM, rebuilt per selection.
**How to avoid:** Attach the sheet controller inside `open()` (after the section is built) and add its listener-teardown to `teardown()` next to `disposeCharts()`. Mirror the existing `liveCharts`/`disposeCharts` lifecycle.
**Warning signs:** Drag works on the first station open, breaks after a station→station switch.

### Pitfall 2: matchMedia breakpoint must match the CSS breakpoint exactly
**What goes wrong:** JS enables the drag controller at a different width than the CSS switches layout, so you get a side-panel layout with sheet-drag behavior (or vice versa) in a dead zone.
**Why it happens:** Two sources of truth for "640px."
**How to avoid:** Single 640px value; the CONTEXT permits a single ~640px breakpoint. Ideally derive the JS query from the same constant; at minimum keep them literally identical and comment the coupling (the codebase already has `@media (max-width:640px)` in controls.css AND panel.css — reuse 640).
**Warning signs:** Layout/behavior mismatch when resizing across ~640px.

### Pitfall 3: `Intl` "is-IS" may fall back in the headless test runtime
**What goes wrong:** `Intl.DateTimeFormat("is-IS")` might not have full Icelandic month names in the Playwright/Vitest headless runtime (the codebase already documents `Intl.NumberFormat("is-IS")` falling back to a dot decimal — see `stationPanel.ts` `formatIce`).
**Why it happens:** ICU data completeness varies by runtime build.
**How to avoid:** Verify is-IS date output in the actual test runtime early (Wave 0). If month names are missing, hand-roll a 12-element Icelandic month array (`janúar`…`desember`) and format the date deterministically, exactly as the number formatter does for the comma decimal.
**Warning signs:** A freshness date that reads in English month names or a locale-default format in E2E.

### Pitfall 4: The boot catch currently swallows failures into console.error
**What goes wrong:** `main.ts` `install()` ends with `catch (err) { console.error(...) }` — a data-load failure leaves the shell up but silent (no user-visible error), which UX-05 explicitly wants to fix.
**Why it happens:** Phase 3 deliberately kept the shell up on failure; it just never surfaced the state.
**How to avoid:** In that catch, render the empty/error affordance (e.g. "Engar veðurstöðvar" for an empty stations set, a generic load-failure message otherwise) into a known DOM slot with an `aria-live` announcement — don't only log.
**Warning signs:** A blank map with no markers and no message on a 404/empty data set.

### Pitfall 5: Map-load-error vs data-load-error are two different seams
**What goes wrong:** Conflating "PMTiles/style failed" (a MapLibre `error` event on the map) with "stations.json empty/404" (a `load.ts` throw caught in `main.ts`). They surface at different points and need different copy ("Ekki tókst að hlaða kortið" vs "Engar veðurstöðvar").
**Why it happens:** Both are "loading failures" conceptually.
**How to avoid:** Wire `map.on("error", …)` in `init.ts`/`main.ts` for the map/style/PMTiles path; keep the stations empty/404 path in the `install()` catch + an explicit `stations.length === 0` check. CONTEXT lists both as separate Phase-3 debt items.
**Warning signs:** A map-style failure showing "Engar veðurstöðvar", or an empty-stations case showing "Ekki tókst að hlaða kortið".

### Pitfall 6: Deleting attribution hacks without re-verifying every state
**What goes wrong:** Removing `.panel-open{margin-right:344px}`, `max-width:60vw`, or the `--bar-height` lift could re-expose the credit under the bar/legend/panel in some state.
**Why it happens:** The hacks each fixed a real (licensing) collision found in UI review.
**How to avoid:** After switching to native compact + info-panel mirror, re-run the attribution non-occlusion assertions (they already exist in `shell.spec.ts`) at BOTH viewports AND with the panel/sheet open. The compact `(i)` button is small and single-line, so it should sit clear with a minimal fixed offset — but prove it, don't assume it.
**Warning signs:** The `(i)` button or expanded credit intersecting the legend, control bar, or open sheet in any state.

## Code Examples

### MapLibre map-load-error handler (UX-05)
```typescript
// Source: MapLibre GL JS — map fires an "error" event; ErrorEvent carries `error`.
// (CITED: maplibre.org/maplibre-gl-js/docs/API — Map "error" event)
map.on("error", (e) => {
  // Style / PMTiles / tile load failures surface here instead of a silent console.error.
  showMapError("Ekki tókst að hlaða kortið", "Reyndu að hlaða síðunni aftur.");
});
```

### Empty-stations gate (UX-05) — in the existing boot flow
```typescript
// In loadStationFiles()/install(): stations.json parsed but empty → explicit empty state.
const stations = await loadStations(BASE); // load.ts throws on non-ok HTTP (Phase 3)
if (stations.length === 0) {
  showEmptyState("Engar veðurstöðvar"); // aria-live announce
  return;
}
```

### First-visit auto-open with localStorage (UX-04)
```typescript
// A single dismissed-hint boolean — NOT user data/accounts (CONTEXT permits this one flag).
const KEY = "bv:info-dismissed";
if (localStorage.getItem(KEY) !== "1") {
  openInfoPanel({ autoOpened: true }); // dismissible; must NOT block the restored view
}
function dismissInfo() { localStorage.setItem(KEY, "1"); closeInfoPanel(); }
```

### Icelandic freshness date (UX-04) with runtime-safe fallback
```typescript
const IS_MONTHS = ["janúar","febrúar","mars","apríl","maí","júní",
  "júlí","ágúst","september","október","nóvember","desember"];
function formatIcelandicDate(iso: string): string {
  const d = new Date(iso);
  // Deterministic hand-roll (mirrors the formatIce comma-decimal discipline) to avoid the
  // is-IS ICU fallback the codebase already documents for NumberFormat.
  return `${d.getUTCDate()}. ${IS_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
// "uppfært 20. júlí 2026"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-state attribution margin math (`.panel-open`, `--bar-height`, `60vw`) | Native compact `(i)` control + full credit in info panel | This phase | Removes the recurring UI-review finding; deletes fragile CSS |
| `<640px` full-width static overlay panel | Draggable non-modal bottom sheet | This phase | Mobile becomes first-class (CONTEXT: table stakes) |
| Silent `console.error` on data-load failure | Visible error/empty state + `aria-live` | This phase | UX-05 |
| No freshness surface | Manifest `generatedAt` → Icelandic date in info panel | This phase | UX-04 trust |
| Touch/mouse drag split | Pointer Events + `setPointerCapture` | Standard | One drag code path |

**Deprecated/outdated:** none relevant. MapLibre 5.24 compact attribution is current.

## Runtime State Inventory

> This is a UI/consolidation phase, not a rename/migration. Included for completeness of the "hidden state" question.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | localStorage: ONE new key `bv:info-dismissed` (first-visit flag). No existing keys to migrate. | Code adds the key; no migration. |
| Live service config | None — static site, no external service config. | None. |
| OS-registered state | None. | None. |
| Secrets/env vars | None. | None. |
| Build artifacts | `manifest.json` gains a top-level `generatedAt` — the committed `site/public/data/manifest.json` and `dist/data/manifest.json` are regenerated by the pipeline; the sample/committed copies used by E2E (`scripts/copy-sample-data.ts`) may need regenerating so the new field is present in tests. | Regenerate sample manifest OR make the client tolerate a missing `generatedAt` (recommended: `generatedAt?` optional + fallback to newest `lastFetched`). |

**Nothing found in categories:** Live service config, OS-registered state, and secrets/env vars — None (verified: fully static site per CLAUDE.md, no server component).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A single ~640px breakpoint suffices for the desktop↔mobile switch | Patterns/Pitfalls | CONTEXT explicitly permits this; low risk. If tablets need distinct handling, add a second breakpoint. |
| A2 | The ECharts host (fixed `height:150px`, `width:100%`) renders fine at 390px mobile width without a bespoke resize call | Pattern 1 | If charts clip at mobile width, add a `chart.resize()` on sheet snap. Verify in E2E at 390px. |
| A3 | Deleting `.panel-open{margin-right:344px}` + `60vw` cap is safe once compact attribution owns collapse | Pattern 2 / Pitfall 6 | Re-run the existing attribution non-occlusion E2E at both viewports + panel-open before deleting. |
| A4 | `Intl.DateTimeFormat("is-IS")` date output may be unreliable in the headless runtime (by analogy to the documented NumberFormat gap) | Pattern 3 / Pitfall 3 | If dates ARE reliable, the hand-rolled month array is harmless redundancy. Verify early. |
| A5 | Accepting a manifest whose `generatedAt` changes every run is fine (breaks byte-identical determinism) | Pattern 3 | May require updating the manifest determinism tests; flagged for the planner as a decision. |
| A6 | localStorage first-visit flag is acceptable (CONTEXT says a dismissed-hint flag is OK) | Code Examples | CONTEXT explicit; low risk. |

**These `[ASSUMED]` items should be confirmed by the planner or surfaced to the user where they represent a real decision (A5 especially).**

## Open Questions

1. **Should `generatedAt` be always-current or change-gated?**
   - What we know: The manifest currently serializes byte-identically when unchanged (a deliberate delta-friendly property with tests).
   - What's unclear: Whether the planner wants to preserve byte-identity (change-gate `generatedAt`) or accept per-run churn.
   - Recommendation: Accept per-run churn (Option A/a); Phase 8 commits nightly regardless. Flag the manifest-determinism test impact in the plan.

2. **Peek height of the bottom sheet.**
   - What we know: CONTEXT leaves it to Claude's discretion.
   - What's unclear: Exact value.
   - Recommendation: Peek = header + ~first figure visible (enough to show station name + one chart teaser); tune in the UI task with screenshot evidence at 390px.

3. **Does the mobile sheet need to collapse the ranked list AND legend to chips, or hide them?**
   - What we know: CONTEXT says collapse to small toggles/chips (not both expanded) when the sheet is open; `rankedList.ts` already has `setYielded` (hide) and a collapse toggle.
   - What's unclear: Chip vs full-hide on mobile.
   - Recommendation: Reuse `setYielded` to hide the ranked list while the sheet is open (as desktop does) and collapse the legend to a chip via CSS; simplest path that satisfies "not both expanded."

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node (Vite 8 build) | preview build for E2E | ✓ (project builds) | — | — |
| Playwright chromium | E2E | ✓ | @playwright/test (devDep) | — |
| maplibre-gl / echarts / suncalc | runtime | ✓ | 5.24.0 / installed / installed | — |

No new external dependencies. All UX-03/04/05 work uses browser built-ins + existing deps.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright (@playwright/test) for E2E; Vitest for unit (site/vite.config.ts) |
| Config file | `site/playwright.config.ts` (drives the PRODUCTION preview build, baseURL `/betravedur/`) |
| Quick run command | `cd site && npx playwright test <spec> -x` |
| Full suite command | `cd site && npm run e2e` (build + preview + all specs) |
| Unit | `cd site && npx vitest run` (pure functions: freshness formatter, snap-nearest math) |

**Multi-viewport pattern already in the repo:** `page.setViewportSize({ width, height })` — used in `shell.spec.ts` (1024/1280/1440 attribution non-occlusion) and `selection.spec.ts` (500px stepper) and `score.spec.ts` (1280 vs 600). Use the SAME pattern; no Playwright `devices` needed. Desktop = 1280×800, mobile = 390×844.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UX-03 | At 1280px, opening a station shows the right-dock SIDE panel (`section.station-panel`, docked right) | E2E | `npx playwright test responsive.spec -x` | ❌ Wave 0 |
| UX-03 | At 390px, opening a station shows a BOTTOM SHEET (full-width, docked bottom, drag handle present) | E2E | `npx playwright test responsive.spec -x` | ❌ Wave 0 |
| UX-03 | At 390px the map is still pannable with the sheet open (non-modal: a drag on the map canvas moves the center) | E2E | `npx playwright test responsive.spec -x` | ❌ Wave 0 |
| UX-03 | At 390px no horizontal overflow (`document.documentElement.scrollWidth <= innerWidth`); control bar reachable | E2E | `npx playwright test responsive.spec -x` | ❌ Wave 0 |
| UX-03 | Snap-nearest math (peek↔expanded) picks the correct target | unit | `npx vitest run bottomSheet` | ❌ Wave 0 |
| UX-04 | The "i" button is present top-right; clicking opens the info panel containing "sögulegt meðaltal, ekki spá" | E2E | `npx playwright test info.spec -x` | ❌ Wave 0 |
| UX-04 | Info panel contains the CC BY 4.0 / Veðurstofan credit (ATTRIBUTION.text_is) | E2E | `npx playwright test info.spec -x` | ❌ Wave 0 |
| UX-04 | First visit auto-opens the info panel; after dismiss, `localStorage["bv:info-dismissed"]==="1"` and a reload does NOT auto-open | E2E | `npx playwright test info.spec -x` | ❌ Wave 0 |
| UX-04 | Freshness shows "uppfært {Icelandic date}" derived from manifest `generatedAt`/newest lastFetched | E2E + unit | `npx playwright test info.spec -x` / `npx vitest run freshness` | ❌ Wave 0 |
| UX-05 | A simulated map-style/PMTiles failure shows "Ekki tókst að hlaða kortið" | E2E | `npx playwright test states.spec -x` | ❌ Wave 0 |
| UX-05 | An empty/404 stations.json shows "Engar veðurstöðvar" (not a blank map) | E2E | `npx playwright test states.spec -x` | ❌ Wave 0 |
| UX-05 | An initial loading affordance is present before first render and gone after | E2E | `npx playwright test states.spec -x` | ❌ Wave 0 |
| UX-05 | Existing no-data states (marker muted, panel "engin gögn", ranked "Engin einkunn") do NOT regress | E2E | existing `panel.spec`/`score.spec` | ✅ (extend) |
| UX-04 | Attribution `(i)` credit not occluded by legend/bar/panel/sheet at 1280 AND 390 | E2E | `npx playwright test responsive.spec -x` | ✅ (shell.spec has the desktop version — extend to 390 + sheet-open) |

**Simulating failures in E2E:**
- **Map-style failure:** use `page.route()` to abort/404 the PMTiles or style request (e.g. `page.route("**/*.pmtiles", r => r.abort())`), then assert the map-error message. Playwright request interception is the standard mechanism.
- **Empty stations:** `page.route("**/data/stations.json", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }))` → assert "Engar veðurstöðvar". A `status:404` variant exercises the `res.ok` throw path.
- **first-visit vs repeat:** control `localStorage` via `page.addInitScript` (set/clear `bv:info-dismissed`) before `goto`, or use a fresh context (default) for first-visit and set the flag for the repeat case.

### Sampling Rate
- **Per task commit:** the targeted spec for the task's requirement, e.g. `cd site && npx playwright test responsive.spec -x`
- **Per wave merge:** `cd site && npm run e2e` (full E2E on preview build) + `npx vitest run`
- **Phase gate:** full E2E + unit green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `site/tests/e2e/responsive.spec.ts` — UX-03 side-panel vs bottom-sheet at 1280/390, map-pannable, no-overflow, attribution-not-occluded-at-390
- [ ] `site/tests/e2e/info.spec.ts` — UX-04 "i" button, trust copy, ATTRIBUTION credit, first-visit localStorage, freshness date
- [ ] `site/tests/e2e/states.spec.ts` — UX-05 map-error (route-abort PMTiles), empty stations (route-fulfill `[]`), initial loading affordance
- [ ] `site/tests/unit/bottomSheet.spec.ts` (Vitest) — snap-nearest math (pure)
- [ ] `site/tests/unit/freshness.spec.ts` (Vitest) — `formatIcelandicDate` pure formatter
- [ ] Regenerate `site/public/data` sample manifest (or make `generatedAt` optional client-side) so E2E has the new field

## Security Domain

> `security_enforcement` not set to false in config → included. This phase is UI-only with no auth/session/data-write surface, so most ASVS categories are N/A.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No accounts (static site; CLAUDE.md) |
| V3 Session Management | no | No sessions |
| V4 Access Control | no | No protected resources |
| V5 Input Validation / Output Encoding | yes | ALL DOM text via `textContent`/`createElement` — never string-HTML (the codebase's T-05/T-06 grep gate). The info panel copy is static Icelandic literals + the ATTRIBUTION constant; the freshness date is a formatted number, not user input. Keep the existing no-innerHTML discipline. |
| V6 Cryptography | no | No crypto in this phase |
| V7 Error Handling | yes | The new error/empty states must NOT leak internal error strings to the user; show fixed Icelandic copy, log details to console only (as the boot catch already does). |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via reflected data in the panel/info DOM | Tampering | `textContent`/`createElementNS` only (project grep gate); the freshness value is a machine-formatted date string, never a raw manifest field injected as HTML |
| Attribution stripped/hidden (licensing, not classic security) | Information disclosure / compliance | Native compact control keeps the credit findable; full credit also in the info panel — CC BY 4.0 / ODbL satisfied |
| localStorage abuse | Tampering | Only a boolean flag stored; no PII, no trust decision depends on it (auto-open is cosmetic) |

## Project Constraints (from CLAUDE.md)

| Directive | Impact on this phase |
|-----------|---------------------|
| Fully static site, GitHub Pages, no server | All UX-03/04/05 work is client-side; no new fetch endpoints. |
| Keep runtime deps minimal (ECharts + suncalc only; justify additions) | **No new runtime dep** — bottom sheet hand-rolled, attribution native, states hand-rolled. |
| Icelandic-only UI | All new copy in Icelandic (info panel, error/empty states, freshness). |
| Nightly cron is the only data-update mechanism; pipeline idempotent + append-only | The `generatedAt` manifest field is written by the pipeline (Phase 8 refreshes it); keep the manifest serializer deterministic-friendly (flag the byte-identity decision, A5). |
| GSD workflow enforcement (no edits outside a GSD command) | Planner-only concern; noted. |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Mobile Responsiveness (UX-03):**
- Station detail panel: SIDE panel on desktop (current), draggable BOTTOM SHEET on phones (peek height → expanded). Bottom sheet takes over the lower area; the map stays visible above it. Non-modal (Google-Maps style) so the map is still pannable.
- When the bottom sheet / panel is open on a phone, the ranked "Bestu staðir" list and the legend collapse to small toggles/chips (not both expanded); the control bar stays reachable.
- The bottom control bar (scrubber + width + Frá/Til) must be usable on narrow screens — the Phase 4 compact stepper + a responsive layout for the width buttons + year dropdowns. No horizontal overflow.
- Breakpoint(s) at Claude's discretion (a single ~640px phone breakpoint is fine). Touch targets ≥44px. The map remains usable (pan/zoom) at all sizes.

**Info / Trust Panel (UX-04):**
- A persistent "i" (info) button, top-right toolbar area. Opens a panel explaining: what the map shows, "þetta er sögulegt meðaltal, ekki spá", how to read it, Veðurstofan CC BY 4.0 attribution (reuse the ATTRIBUTION constant), and data freshness.
- First-visit: auto-open the info panel once (dismissible), remembered via a localStorage flag (a dismissed-hint flag, NOT user data/accounts). Repeat visitors just see the "i" button. The auto-open must not block interacting with a restored (permalink) view.
- Data freshness ("uppfært {date}"): read a data/build timestamp from manifest.json (add/confirm a top-level generatedAt or newest high-water date). Show a human Icelandic date. Do NOT hardcode.

**Loading / Empty / No-Data States (UX-05):**
- Map-load error: PMTiles/MapLibre style fails → "Ekki tókst að hlaða kortið" / "Reyndu að hlaða síðunni aftur." over the basemap (not a silent console.error).
- Empty stations: stations.json empty/404 → "Engar veðurstöðvar" (not a blank map).
- Initial loading: a lightweight loading affordance while derived data / the map style load. Minimal; no heavy spinner.
- No-data (already partly done): marker muted state, panel "engin gögn fyrir þetta tímabil", ranked-list "Engin einkunn" — ensure consistent, don't regress; add ranked-list-empty when NO station qualifies for the whole selection.
- Ranked-list / chart-chunk "hleð riti…" affordance exists (Phase 6) — keep.

**Accumulated Layout Debt:**
- Attribution legibility: make it robustly legible in ALL states (control bar + legend + ranked panel + station panel/bottom-sheet, desktop + mobile) — ideally a single coherent layout solution. CC BY 4.0 + OSM must always be legible.
- Basemap bilingual label — low priority; leave unless a trivial fix.

### Claude's Discretion
- Bottom-sheet library vs hand-rolled (prefer hand-rolled / minimal; a tiny well-vetted sheet helper acceptable only if it saves real complexity), exact breakpoint, sheet peek height, info-panel styling, loading affordance style, attribution final layout.

### Deferred Ideas (OUT OF SCOPE)
- Nightly cron / auto-deploy / full national dataset — Phase 8.
- Station comparison, meðaltal/dreifing toggle, sunshine, adjustable weights, English UI — v1.x/v2.
- Basemap bilingual label — leave unless a trivial fix.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UX-03 | Mobile-responsive: bottom-sheet station panel on phones, side panel on desktop | Pattern 1 (hand-rolled pointer-drag sheet + matchMedia); Component Responsibilities table (stationPanel.ts promotes its existing `<640px` overlay; rankedList/legend collapse); Pitfalls 1–2 |
| UX-04 | Info panel: "sögulegt meðaltal, ekki spá", Veðurstofan CC BY 4.0 attribution, data currency | Pattern 2 (attribution) + Pattern 3 (freshness `generatedAt` + Icelandic date); Code Examples (first-visit localStorage, date formatter); new `infoPanel.ts` |
| UX-05 | Loading, empty, no-data states for map and panels | Pattern in Architecture Diagram; Pitfalls 4–5 (boot catch + two distinct error seams); Code Examples (map error handler, empty-stations gate); Validation (route-based failure simulation) |
</phase_requirements>

## Sources

### Primary (HIGH confidence)
- Codebase (direct read): `main.ts`, `map/init.ts`, `data/load.ts`, `ui/stationPanel.ts`, `ui/controlBar.ts`, `ui/legend.ts`, `ui/attribution.ts`, `packages/domain/src/attribution.ts`, `pipeline/src/manifest.ts`, `styles/panel.css`, `styles/controls.css`, `styles/tokens.css`, `tests/e2e/*.spec.ts`, `playwright.config.ts`, `package.json`, committed `manifest.json` — verified the boot seams, the missing top-level `generatedAt`, the existing `<640px` media queries, the attribution hacks, and the multi-viewport E2E pattern.
- creativecommons.org/licenses/by/4.0 (deed + legalcode) — CC BY 4.0 permits attribution "in any reasonable manner"; v4.0 permits linking to a separate attribution page.
- osmfoundation.org/wiki/Licence/Attribution_Guidelines — collapsing attribution behind an "(i)" button is acceptable if findable; auto-collapse on pan/zoom permitted.
- maplibre.org/maplibre-gl-js/docs/API — `AttributionControl` compact mode (native `<details>/<summary>`, auto-collapse <640px), Map `error` event.

### Secondary (MEDIUM confidence)
- MDN — `window.matchMedia`, Pointer Events + `setPointerCapture`, ARIA live regions (standard browser APIs; widely documented).

### Tertiary (LOW confidence)
- None relied upon. Bottom-sheet libraries were surveyed conceptually and rejected without naming a specific `[ASSUMED]` package (none is being installed).

## Metadata

**Confidence breakdown:**
- Standard stack (no new deps): HIGH — verified against package.json + CLAUDE.md discipline.
- Architecture / seams: HIGH — every integration point read directly in source.
- Attribution approach: HIGH — CC BY 4.0 + OSM guidance verified against official sources; MapLibre compact mode confirmed.
- Freshness: HIGH — verified the manifest lacks `generatedAt` by reading the committed file; the fix is a one-field addition.
- Intl is-IS reliability: MEDIUM — flagged by analogy to the codebase's documented NumberFormat fallback; verify in the test runtime (Pitfall 3).
- Bottom-sheet physics: MEDIUM — hand-roll pattern is standard but peek height / chart-resize behavior at 390px needs UI-task screenshot verification (A2).

**Research date:** 2026-07-20
**Valid until:** 2026-08-19 (stable stack; 30 days)
