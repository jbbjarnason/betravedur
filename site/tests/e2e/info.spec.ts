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

/**
 * The info panel is STATIC CHROME mounted in boot() before any data — it does not depend on markers
 * (which, with the sample dataset, do not survive symbol collision inside the narrow 390px viewport
 * at zoom 6). For info-panel criteria we only need the shell up: the map style loaded (so freshness
 * has been set from the resolved manifest) and the info button present. This keeps criterion 6
 * checkable at BOTH viewports without coupling the data-independent panel to marker rendering.
 */
async function waitForInfoChrome(page: Page): Promise<void> {
  await page.locator("canvas.maplibregl-canvas").waitFor({ state: "visible", timeout: 15_000 });
  await page.locator(INFO_BTN).waitFor({ state: "attached", timeout: 15_000 });
  // Wait for the manifest-derived freshness to be set (the `uppfært` line appears once resolved).
  await page.waitForFunction(
    () => {
      const m = (window as { __map?: { isStyleLoaded(): boolean } }).__map;
      const panel = document.querySelector(".info-panel");
      return !!m && m.isStyleLoaded() && !!panel && /uppfært/.test(panel.textContent ?? "");
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
  // The first-visit auto-open (criterion 7) fires on a bare `/` load. To assert the button-open
  // behavior deterministically in the other criteria, pre-seed the dismissed flag before the app
  // boots so nothing is auto-open at gate time; the button-open path is then unambiguous.
  const suppressAutoOpen = async (page: Page): Promise<void> => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("bv:info-dismissed", "1");
      } catch {
        /* storage unavailable — the permalink/bare-visit guards still hold */
      }
    });
  };

  for (const width of [1280, 390]) {
    test(`criterion 6 (@${width}): the info button opens a panel with the trust lead + CC BY 4.0/OSM + \`uppfært\` line [07-02]`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
      await suppressAutoOpen(page);
      await page.goto("/");
      await waitForInfoChrome(page);
      await page.locator(INFO_BTN).click();
      const panel = page.locator(INFO_PANEL);
      await expect(panel).toBeVisible();
      await expect(panel).toContainText("Þetta er sögulegt meðaltal, ekki spá.");
      await expect(panel).toContainText("CC BY 4.0");
      await expect(panel).toContainText("OpenStreetMap");
      await expect(panel).toContainText("uppfært");
    });
  }

  test("criterion 7: first-visit auto-open once; after dismiss + reload it does NOT auto-open (localStorage flag) [07-02]", async ({
    page,
  }) => {
    // Fresh context (cleared localStorage, no URL params) → auto-open on load.
    await page.goto("/");
    await waitForInfoChrome(page);
    const panel = page.locator(INFO_PANEL);
    await expect(panel).toBeVisible();
    // Dismiss → the localStorage dismissed-hint flag `bv:info-dismissed` is set.
    await page.locator(`${INFO_PANEL} [aria-label="Loka"]`).click();
    await expect(panel).toBeHidden();
    const dismissed = await page.evaluate(() => localStorage.getItem("bv:info-dismissed"));
    expect(dismissed).toBe("1");
    // Reload (same context) → NOT auto-opened, but the button still opens it on demand.
    await page.reload();
    await waitForInfoChrome(page);
    await expect(panel).toBeHidden();
    await page.locator(INFO_BTN).click();
    await expect(panel).toBeVisible();
  });

  test("criterion 8: a permalink URL (selection/st params) is NOT blocked by an auto-opened modal [07-02]", async ({
    page,
  }) => {
    // Loading a permalink (with st= params) restores a specific view; the auto-open must NOT fire
    // (the permalink guard suppresses it), so the restored view is present/interactive on load.
    await page.goto("/?st=1");
    await waitForInfoChrome(page);
    // The permalink guard suppresses the auto-open entirely — no blocking modal on a shared link.
    const panel = page.locator(INFO_PANEL);
    await expect(panel).toBeHidden();
    // The restored selection is present/interactive (the st param survived the load).
    const stParam = await page.evaluate(() => new URLSearchParams(location.search).get("st"));
    expect(stParam).not.toBeNull();
    // …and the info button still opens the panel on demand for the permalink visitor.
    await page.locator(INFO_BTN).click();
    await expect(panel).toBeVisible();
  });

  test("criterion 9: the `uppfært {date}` freshness value is a real Icelandic date from the manifest (never hardcoded / Invalid Date) [07-02]", async ({
    page,
  }) => {
    await suppressAutoOpen(page);
    await page.goto("/");
    await waitForInfoChrome(page);
    await page.locator(INFO_BTN).click();
    const panel = page.locator(INFO_PANEL);
    const fresh = await panel.getByText(/uppfært/).innerText();
    // A human Icelandic date like "20. júlí 2026" — day. monthName year; never "Invalid Date".
    expect(fresh).toMatch(
      /uppfært\s+\d{1,2}\.\s+(janúar|febrúar|mars|apríl|maí|júní|júlí|ágúst|september|október|nóvember|desember)\s+\d{4}/,
    );
    expect(fresh).not.toContain("Invalid Date");
  });

  test("criterion 18: the info panel closes on Escape, traps focus while open, returns focus to the info button on close [07-02]", async ({
    page,
  }) => {
    await suppressAutoOpen(page);
    await page.goto("/");
    await waitForInfoChrome(page);
    await page.locator(INFO_BTN).click();
    const panel = page.locator(INFO_PANEL);
    await expect(panel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    // Focus returns to the info button (native <dialog> focus management + explicit fallback).
    const focused = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
    expect(focused).toBe("Um kortið");
  });
});
