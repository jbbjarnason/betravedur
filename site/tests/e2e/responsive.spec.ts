import { expect, test, type Page } from "@playwright/test";

// Phase 7 (UX-03 responsive layout) E2E — the WAVE-0 SKELETON.
//
// This file exists NOW so Plan 02 (info) and Plan 03 (bottom sheet + chips + attribution harmony)
// have a green Playwright harness to extend. It carries ONE active smoke test (the preview build
// boots at desktop 1280, the map style-loads, a marker pill renders, no pageerror) plus
// `test.fixme(...)` placeholders for every responsive/attribution Acceptance-Checkable Visual
// Criterion (1–5, 10–12) from 07-UI-SPEC §Acceptance-Checkable Visual Criteria, with the EXACT
// selectors + asserts encoded so the owning plan has no ambiguity. Multi-viewport via
// page.setViewportSize (shell.spec.ts / selection.spec.ts convention): desktop 1280×800, mobile
// 390×844.

/** The overlay pill selector — a station select target (marker tap). */
const PILL = "#marker-overlay [data-station]";
/** The station detail panel root (side panel on desktop; promoted to a bottom sheet <640px). */
const PANEL = "section.station-panel[aria-label]";
/** The top-right info button (Plan 02). */
const INFO_BTN = 'button.info-button[aria-label="Um kortið"]';

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

/** Wait until the map is style-loaded and at least one composite pill has rendered. */
async function waitForMarkers(page: Page): Promise<void> {
  await page.locator("canvas.maplibregl-canvas").waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForFunction(
    () => {
      const m = (window as { __map?: { isStyleLoaded(): boolean } }).__map;
      return (
        !!m &&
        m.isStyleLoaded() &&
        document.querySelectorAll("#marker-overlay [data-station]").length > 0
      );
    },
    { timeout: 20_000 },
  );
}

/**
 * Wait for the SHELL (map style-loaded + the store exposed) without requiring a rendered pill —
 * at 390px the two sample stations (Reykjavík / Keflavík, both SW Iceland) collide under symbol
 * placement at zoom 6, so 0 pills survive (the same data/framing condition info.spec documents).
 * Mobile selection is driven via __store.set({ stationId }) below, which is robust to collision.
 */
async function waitForShell(page: Page): Promise<void> {
  await page.locator("canvas.maplibregl-canvas").waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForFunction(
    () => {
      const w = window as { __map?: { isStyleLoaded(): boolean }; __store?: unknown };
      return !!w.__map && w.__map.isStyleLoaded() && !!w.__store;
    },
    { timeout: 20_000 },
  );
}

/** Open the station sheet/panel by driving the store directly (robust vs marker collision). */
async function selectStation(page: Page, stationId = 1): Promise<void> {
  await page.evaluate((id) => {
    (window as unknown as { __store: { set(p: { stationId: number }): void } }).__store.set({
      stationId: id,
    });
  }, stationId);
  await page.locator(PANEL).waitFor({ state: "visible", timeout: 5_000 });
}

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (err) => {
    throw err;
  });
  // Phase 7 (UX-04) added a first-visit auto-open info-panel MODAL whose backdrop intercepts pointer
  // events. Pre-seed the dismissed-hint flag so these responsive/attribution tests boot with no
  // modal in the way (the auto-open itself is covered by info.spec criterion 7). addInitScript is
  // set here so it applies to each test's own goto below.
  await page.addInitScript(() => {
    try {
      localStorage.setItem("bv:info-dismissed", "1");
    } catch {
      /* storage unavailable — the permalink/bare-visit guards still hold */
    }
  });
});

test("wave-0 smoke: preview build boots at desktop 1280, map style-loads, a pill renders, no pageerror", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await page.goto("/");
  await waitForMarkers(page);

  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  const styleLoaded = await page.evaluate(
    () => (window as { __map?: { isStyleLoaded(): boolean } }).__map?.isStyleLoaded() ?? false,
  );
  expect(styleLoaded).toBe(true);
  expect(await page.locator(PILL).count()).toBeGreaterThanOrEqual(1);
});

// ---------------------------------------------------------------------------
// UI-SPEC §Acceptance-Checkable Visual Criteria — responsive + attribution.
// Each is `test.fixme` (recorded, not run) until the owning plan builds the element.
// ---------------------------------------------------------------------------
test.describe("Phase 7 responsive/attribution criteria (07-UI-SPEC §Acceptance-Checkable Visual Criteria)", () => {
  test("criterion 1: at 390px a selected station is a BOTTOM SHEET; at 1280px a right-docked SIDE panel [07-03]", async ({
    page,
  }) => {
    // Mobile: at 390px, selecting a station shows `.station-panel` docked at the bottom (its top
    // edge below the viewport middle at peek) with a drag handle present.
    await page.setViewportSize(MOBILE);
    await page.goto("/");
    await waitForShell(page);
    await selectStation(page);
    const panel = page.locator(PANEL);
    const box = await panel.boundingBox();
    expect(box!.y).toBeGreaterThan(MOBILE.height / 2); // docked at the bottom (peek)
    await expect(panel.locator('button[aria-label="Stækka eða minnka spjald"]')).toBeVisible();

    // Desktop: the same selection shows the right-docked side panel (top below the header,
    // right-aligned) — NOT a bottom sheet (its top edge is near the header, not the viewport
    // bottom; its right edge hugs the viewport right).
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await waitForMarkers(page);
    await selectStation(page);
    const dpanel = page.locator(PANEL);
    const dbox = await dpanel.boundingBox();
    expect(dbox!.y).toBeLessThan(DESKTOP.height / 2); // docked near the top, not a bottom sheet
    expect(dbox!.x + dbox!.width).toBeGreaterThan(DESKTOP.width - 8); // right-aligned
    // The drag handle is hidden on desktop (CSS display:none → no bounding box).
    await expect(
      dpanel.locator('button[aria-label="Stækka eða minnka spjald"]'),
    ).toBeHidden();
  });

  test("criterion 2: at 390px the map stays pannable with the sheet open (non-modal proof) [07-03]", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/");
    await waitForShell(page);
    await selectStation(page);
    await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
    const before = await page.evaluate(
      () =>
        (window as unknown as { __map: { getCenter(): { lng: number; lat: number } } }).__map.getCenter(),
    );
    await page.evaluate(() =>
      (window as unknown as { __map: { panBy(o: [number, number]): void } }).__map.panBy([120, 0]),
    );
    const after = await page.evaluate(
      () =>
        (window as unknown as { __map: { getCenter(): { lng: number; lat: number } } }).__map.getCenter(),
    );
    expect(after.lng).not.toBeCloseTo(before.lng, 4);
    await expect(page.locator(PANEL)).toBeVisible(); // still open (non-modal)
  });

  test("criterion 3: no horizontal overflow at 390px (documentElement.scrollWidth <= innerWidth) [07-03]", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/");
    await waitForShell(page);
    // No overflow with the standing chrome (chips + control bar).
    let overflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(overflow).toBe(true);
    // …and with the sheet open too.
    await selectStation(page);
    overflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(overflow).toBe(true);
  });

  test("criterion 4: touch targets ≥44px at 390px (info button, sheet close, drag handle, chips) [07-02/07-03]", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/");
    await waitForShell(page);
    // Info button (Plan 02) + ranked/legend chips (Plan 03) — each ≥44px pressable.
    for (const sel of [
      INFO_BTN,
      'button.ranked-list__chip[aria-label], button.ranked-list__chip',
      'button.score-legend__chip',
    ]) {
      const b = await page.locator(sel).first().boundingBox();
      expect(Math.min(b!.width, b!.height)).toBeGreaterThanOrEqual(44);
    }
    // Sheet close + drag handle (Plan 03) — each ≥44px pressable.
    await selectStation(page);
    for (const sel of [
      `${PANEL} [aria-label="Loka spjaldi"]`,
      `${PANEL} button[aria-label="Stækka eða minnka spjald"]`,
    ]) {
      const b = await page.locator(sel).boundingBox();
      expect(Math.min(b!.width, b!.height)).toBeGreaterThanOrEqual(44);
    }
  });

  test("criterion 5: at 390px the ranked list + legend render as CHIPS (Bestu staðir / Einkunn) [07-03]", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/");
    await waitForShell(page);
    // Chips are compact toggles, not permanently-docked panels.
    const rankedChip = page.getByRole("button", { name: "Bestu staðir" });
    const legendChip = page.getByRole("button", { name: "Einkunn" });
    await expect(rankedChip).toBeVisible();
    await expect(legendChip).toBeVisible();
    // Tapping "Bestu staðir" reveals the list body; tapping "Einkunn" reveals the legend body.
    await rankedChip.click();
    await expect(page.locator("#ranked-list-body")).toBeVisible();
    await legendChip.click();
    await expect(page.locator("#score-legend-body")).toBeVisible();
    // While the sheet is open both chips stay collapsed (the ranked chip is hidden by setYielded;
    // the ranked overlay is dismissed).
    await selectStation(page);
    await expect(page.locator("#ranked-list-body")).toBeHidden();
  });

  test("criterion 10: at 1280px with the side panel open, the CC BY 4.0 / OSM credit is present [07-03]", async ({
    page,
  }) => {
    // The attribution control stays present with the side panel open (full credit also reachable
    // in the info panel — shell.spec covers the non-occlusion box math). See shell.spec.
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await waitForMarkers(page);
    await selectStation(page);
    await expect(page.locator(PANEL)).toBeVisible();
    await expect(page.locator(".maplibregl-ctrl-attrib")).toBeVisible();
  });

  test("criterion 11: at 390px with the sheet at peek, the CC BY 4.0 / OSM credit sits above the peek edge [07-03]", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/");
    await waitForShell(page);
    await selectStation(page);
    const panel = page.locator(PANEL);
    await expect(panel).toBeVisible();
    const attribBox = await page.locator(".maplibregl-ctrl-attrib").boundingBox();
    const panelBox = await panel.boundingBox();
    // Attribution bottom edge sits at/above the sheet peek top edge (not hidden behind the sheet).
    // A small tolerance for sub-pixel rounding of the --attrib-safe-bottom reflow.
    expect(attribBox!.y + attribBox!.height).toBeLessThanOrEqual(panelBox!.y + 2);
  });

  test("criterion 12: no legacy attribution hacks — `.panel-open` + `60vw` absent, `--attrib-safe-bottom` present [07-03]", async () => {
    // Grep-gate in controls.css: the `.panel-open { margin-right: 344px }` rule and the `60vw`
    // cap are removed; the harmonized `--attrib-safe-bottom` custom property is present.
    const { readFileSync } = await import("node:fs");
    const { dirname, resolve } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(resolve(here, "..", "..", "src", "styles", "controls.css"), "utf8");
    expect(css).not.toContain("panel-open");
    expect(css).not.toContain("60vw");
    expect(css).toContain("--attrib-safe-bottom");
  });

  test("criterion 17: at 390px Escape closes the sheet (stationId + st cleared); the drag handle is keyboard-operable [07-03]", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/");
    await waitForShell(page);
    await selectStation(page);
    const panel = page.locator(PANEL);
    const handle = panel.locator('button[aria-label="Stækka eða minnka spjald"]');

    // The drag handle is a focusable native control that toggles peek↔expanded via keyboard.
    await handle.focus();
    const peekTop = (await panel.boundingBox())!.y;
    await handle.press("Enter"); // toggle to expanded → the sheet top rises
    await page.waitForTimeout(300); // allow the (possibly eased) snap to settle
    const expandedTop = (await panel.boundingBox())!.y;
    expect(expandedTop).toBeLessThan(peekTop);

    // Escape closes the sheet: stationId cleared + the URL `st` param cleared.
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    const stationId = await page.evaluate(
      () => (window as unknown as { __store: { get(): { stationId: number | null } } }).__store.get().stationId,
    );
    expect(stationId).toBeNull();
    expect(new URL(page.url()).searchParams.get("st")).toBeNull();
  });

  test("criterion 19: under prefers-reduced-motion the sheet snaps instantly at 390px [07-03]", async ({
    browser,
  }) => {
    // A dedicated reduced-motion context (mirrors panel.spec's reduced-motion pattern).
    const context = await browser.newContext({ reducedMotion: "reduce", viewport: MOBILE });
    const page = await context.newPage();
    page.on("pageerror", (err) => {
      throw err;
    });
    await page.addInitScript(() => {
      try {
        localStorage.setItem("bv:info-dismissed", "1");
      } catch {
        /* storage unavailable */
      }
    });
    await page.goto("/");
    await waitForShell(page);
    await selectStation(page);
    const panel = page.locator(PANEL);
    const handle = panel.locator('button[aria-label="Stækka eða minnka spjald"]');
    // The panel-snap transition is zeroed under reduced motion (panel.css @media).
    const dur = await panel.evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(["0s", "0ms"]).toContain(dur);
    // The keyboard toggle still moves the sheet (instantly) — no error, top changes.
    const peekTop = (await panel.boundingBox())!.y;
    await handle.focus();
    await handle.press("Enter");
    const expandedTop = (await panel.boundingBox())!.y;
    expect(expandedTop).toBeLessThan(peekTop);
    await context.close();
  });
});
