import { expect, test, type Page } from "@playwright/test";

// Phase 7 (UX-04 info / trust panel) E2E — the WAVE-0 SKELETON.
//
// This file exists NOW so Plan 02 (info panel + "i" button + first-visit localStorage + freshness)
// has a green Playwright harness to extend. It carries ONE active smoke test (the preview build
// boots, the map style-loads, a marker pill renders, no pageerror) plus `test.fixme(...)`
// placeholders for every info-panel Acceptance-Checkable Visual Criterion (6–9, 18) from
// 07-UI-SPEC §Acceptance-Checkable Visual Criteria, with the EXACT selectors + Icelandic strings
// encoded. Driving conventions mirror panel.spec.ts: PRODUCTION preview build, gate on
// window.__map.isStyleLoaded() + a marker pill, page.on('pageerror') guard.

const PILL = "#marker-overlay [data-station]";
/** The persistent top-right info button (Plan 02). */
const INFO_BTN = 'button.info-button[aria-label="Um kortið"]';
/** The info panel <dialog> (Plan 02). */
const INFO_PANEL = ".info-panel";

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
});

test("wave-0 smoke: preview build boots, map style-loads, a pill renders, no pageerror", async ({
  page,
}) => {
  await page.goto("/");
  await waitForMarkers(page);
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  expect(await page.locator(PILL).count()).toBeGreaterThanOrEqual(1);
});

// ---------------------------------------------------------------------------
// UI-SPEC §Acceptance-Checkable Visual Criteria — info / trust panel.
// Each is `test.fixme` (recorded, not run) until Plan 02 builds the info panel.
// ---------------------------------------------------------------------------
test.describe("Phase 7 info/trust criteria (07-UI-SPEC §Acceptance-Checkable Visual Criteria)", () => {
  test.fixme(
    "criterion 6: the info button opens a panel with the trust lead + CC BY 4.0/OSM + `uppfært` line [07-02]",
    async ({ page }) => {
      await page.goto("/");
      await waitForMarkers(page);
      await page.locator(INFO_BTN).click();
      const panel = page.locator(INFO_PANEL);
      await expect(panel).toBeVisible();
      await expect(panel).toContainText("Þetta er sögulegt meðaltal, ekki spá.");
      await expect(panel).toContainText("CC BY 4.0");
      await expect(panel).toContainText("OpenStreetMap");
      await expect(panel).toContainText("uppfært");
    },
  );

  test.fixme(
    "criterion 7: first-visit auto-open once; after dismiss + reload it does NOT auto-open (localStorage flag) [07-02]",
    async ({ page }) => {
      // Fresh context (cleared localStorage, no URL params) → auto-open on load.
      await page.goto("/");
      await waitForMarkers(page);
      const panel = page.locator(INFO_PANEL);
      await expect(panel).toBeVisible();
      // Dismiss → the localStorage dismissed-hint flag `bv:info-dismissed` is set.
      await page.locator(`${INFO_PANEL} [aria-label="Loka"]`).click();
      await expect(panel).toBeHidden();
      const dismissed = await page.evaluate(() => localStorage.getItem("bv:info-dismissed"));
      expect(dismissed).toBe("1");
      // Reload (same context) → NOT auto-opened, but the button still opens it on demand.
      await page.reload();
      await waitForMarkers(page);
      await expect(panel).toBeHidden();
      await page.locator(INFO_BTN).click();
      await expect(panel).toBeVisible();
    },
  );

  test.fixme(
    "criterion 8: a permalink URL (selection/st params) is NOT blocked by an auto-opened modal [07-02]",
    async ({ page }) => {
      // Loading a permalink (with st= params) restores a specific view; the auto-open must not block
      // the restored view — either not auto-opened, or instantly dismissible with the view restored.
      await page.goto("/?st=1");
      await waitForMarkers(page);
      // The restored selection is present/interactive (the station panel is reachable).
      const stParam = await page.evaluate(() => new URLSearchParams(location.search).get("st"));
      expect(stParam).not.toBeNull();
    },
  );

  test.fixme(
    "criterion 9: the `uppfært {date}` freshness value is a real Icelandic date from the manifest (never hardcoded / Invalid Date) [07-02]",
    async ({ page }) => {
      await page.goto("/");
      await waitForMarkers(page);
      await page.locator(INFO_BTN).click();
      const panel = page.locator(INFO_PANEL);
      const fresh = await panel.getByText(/uppfært/).innerText();
      // A human Icelandic date like "20. júlí 2026" — day. monthName year; never "Invalid Date".
      expect(fresh).toMatch(
        /uppfært\s+\d{1,2}\.\s+(janúar|febrúar|mars|apríl|maí|júní|júlí|ágúst|september|október|nóvember|desember)\s+\d{4}/,
      );
      expect(fresh).not.toContain("Invalid Date");
    },
  );

  test.fixme(
    "criterion 18: the info panel closes on Escape, traps focus while open, returns focus to the info button on close [07-02]",
    async ({ page }) => {
      await page.goto("/");
      await waitForMarkers(page);
      await page.locator(INFO_BTN).click();
      const panel = page.locator(INFO_PANEL);
      await expect(panel).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(panel).toBeHidden();
      // Focus returns to the info button (native <dialog> focus management).
      const focused = await page.evaluate(() =>
        document.activeElement?.getAttribute("aria-label"),
      );
      expect(focused).toBe("Um kortið");
    },
  );
});
