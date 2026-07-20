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
  test.fixme(
    "criterion 1: at 390px a selected station is a BOTTOM SHEET; at 1280px a right-docked SIDE panel [07-03]",
    async ({ page }) => {
      // Mobile: at 390px, selecting a station shows `.station-panel` docked at the bottom (its top
      // edge below the viewport middle at peek) with a drag handle present. Desktop: at 1280px the
      // same selection shows the right-docked side panel (top below the header, right-aligned).
      await page.setViewportSize(MOBILE);
      await page.goto("/");
      await waitForMarkers(page);
      await page.locator(PILL).first().click();
      const panel = page.locator(PANEL);
      await expect(panel).toBeVisible();
      const box = await panel.boundingBox();
      expect(box!.y).toBeGreaterThan(MOBILE.height / 2); // docked at the bottom (peek)
      await expect(panel.locator('button[aria-label="Stækka eða minnka spjald"]')).toBeVisible();
    },
  );

  test.fixme(
    "criterion 2: at 390px the map stays pannable with the sheet open (non-modal proof) [07-03]",
    async ({ page }) => {
      // With the sheet open, map.panBy changes map.getCenter() while the sheet stays open.
      await page.setViewportSize(MOBILE);
      await page.goto("/");
      await waitForMarkers(page);
      await page.locator(PILL).first().click();
      await expect(page.locator(PANEL)).toBeVisible();
      const before = await page.evaluate(() =>
        (window as unknown as { __map: { getCenter(): { lng: number; lat: number } } }).__map.getCenter(),
      );
      await page.evaluate(() =>
        (window as unknown as { __map: { panBy(o: [number, number]): void } }).__map.panBy([120, 0]),
      );
      const after = await page.evaluate(() =>
        (window as unknown as { __map: { getCenter(): { lng: number; lat: number } } }).__map.getCenter(),
      );
      expect(after.lng).not.toBeCloseTo(before.lng, 4);
      await expect(page.locator(PANEL)).toBeVisible(); // still open (non-modal)
    },
  );

  test.fixme(
    "criterion 3: no horizontal overflow at 390px (documentElement.scrollWidth <= innerWidth) [07-03]",
    async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await page.goto("/");
      await waitForMarkers(page);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      );
      expect(overflow).toBe(true);
    },
  );

  test.fixme(
    "criterion 4: touch targets ≥44px at 390px (info button, sheet close, drag handle, chips) [07-02/07-03]",
    async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await page.goto("/");
      await waitForMarkers(page);
      // Info button (Plan 02).
      const infoBox = await page.locator(INFO_BTN).boundingBox();
      expect(Math.min(infoBox!.width, infoBox!.height)).toBeGreaterThanOrEqual(44);
      // Sheet close + drag handle (Plan 03), ranked/legend chips (Plan 03) — each ≥44px pressable.
      await page.locator(PILL).first().click();
      for (const sel of [
        `${PANEL} [aria-label="Loka"]`,
        `${PANEL} button[aria-label="Stækka eða minnka spjald"]`,
      ]) {
        const b = await page.locator(sel).boundingBox();
        expect(Math.min(b!.width, b!.height)).toBeGreaterThanOrEqual(44);
      }
    },
  );

  test.fixme(
    "criterion 5: at 390px the ranked list + legend render as CHIPS (Bestu staðir / Einkunn) [07-03]",
    async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await page.goto("/");
      await waitForMarkers(page);
      // Chips are compact toggles, not permanently-docked panels; tapping reveals the list/legend.
      const rankedChip = page.getByRole("button", { name: "Bestu staðir" });
      const legendChip = page.getByRole("button", { name: "Einkunn" });
      await expect(rankedChip).toBeVisible();
      await expect(legendChip).toBeVisible();
    },
  );

  test.fixme(
    "criterion 10: at 1280px with the side panel open, the CC BY 4.0 / OSM credit is not occluded [07-03]",
    async ({ page }) => {
      // The attribution box must not intersect the open side panel/legend, OR the full credit is
      // reachable in the open info panel. See shell.spec for the non-occlusion box-intersection math.
      await page.setViewportSize(DESKTOP);
      await page.goto("/");
      await waitForMarkers(page);
      await page.locator(PILL).first().click();
      await expect(page.locator(PANEL)).toBeVisible();
      const attrib = page.locator(".maplibregl-ctrl-attrib");
      await expect(attrib).toBeVisible();
    },
  );

  test.fixme(
    "criterion 11: at 390px with the sheet at peek, the CC BY 4.0 / OSM credit sits above the peek edge [07-03]",
    async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await page.goto("/");
      await waitForMarkers(page);
      await page.locator(PILL).first().click();
      const panel = page.locator(PANEL);
      await expect(panel).toBeVisible();
      const attribBox = await page.locator(".maplibregl-ctrl-attrib").boundingBox();
      const panelBox = await panel.boundingBox();
      // Attribution bottom edge sits at/above the sheet peek top edge (not hidden behind the sheet).
      expect(attribBox!.y + attribBox!.height).toBeLessThanOrEqual(panelBox!.y + 1);
    },
  );

  test.fixme(
    "criterion 12: no legacy attribution hacks — `.panel-open` + `60vw` absent, `--attrib-safe-bottom` present [07-03]",
    async () => {
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
    },
  );
});
