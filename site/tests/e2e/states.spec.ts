import { expect, test, type Page } from "@playwright/test";

// Phase 7 (UX-05 trust states) E2E — the WAVE-0 SKELETON, active NOW.
//
// Unlike responsive.spec / info.spec (whose Plan 02/03 criteria are `test.fixme` placeholders),
// the UX-05 states are delivered by THIS plan (07-01), so these tests are ACTIVE. They exercise the
// three distinct seams with the exact Icelandic copy from 07-UI-SPEC §Copywriting Contract:
//   13. initial loading   — `hleð…` present on boot, gone after markers paint
//   14. map-load error    — route-abort the pmtiles basemap → role=alert overlay + header stays up
//   15. empty stations    — route-fulfill stations.json as [] (and a 404 variant) → "Engar veðurstöðvar"
//
// Driving conventions mirror panel.spec.ts / score.spec.ts: PRODUCTION preview build (see
// playwright.config.ts webServer), gate on window.__map.isStyleLoaded() + a marker pill, and attach
// a page.on('pageerror') guard so an uncaught error fails the run. Failure simulation uses
// page.route() (RESEARCH §Validation) — registered BEFORE goto so the very first request is caught.

const PILL = "#marker-overlay [data-station]";
const STATE = ".bv-state";

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

// ---------------------------------------------------------------------------
// Criterion 13 — initial loading affordance (present on boot, gone after paint).
// ---------------------------------------------------------------------------
test("criterion 13: a `hleð…` loading affordance is present on boot and removed after markers paint [07-01]", async ({
  page,
}) => {
  page.on("pageerror", (err) => {
    throw err;
  });
  await page.goto("/");

  // The affordance mounts in boot() synchronously (before initMap), so it is observable early —
  // wait for the loading node to appear rather than racing the fast preview build.
  const loading = page.locator(".bv-state--loading");
  await loading.waitFor({ state: "attached", timeout: 10_000 });
  await expect(loading).toContainText("hleð…");

  // Once markers paint, install() calls hideLoading() → the loading node is removed. Assert its
  // absence deterministically (waitForFunction on removal), not a fixed timeout.
  await waitForMarkers(page);
  await page.waitForFunction(
    () => document.querySelectorAll(".bv-state--loading").length === 0,
    { timeout: 20_000 },
  );
  expect(await page.locator(".bv-state--loading").count()).toBe(0);
});

// ---------------------------------------------------------------------------
// Criterion 14 — map-load error (abort the pmtiles basemap request BEFORE goto).
// ---------------------------------------------------------------------------
test("criterion 14: a map-style/basemap failure shows the role=alert error overlay, header stays up [07-01]", async ({
  page,
}) => {
  // Aborting the pmtiles basemap makes MapLibre fire an `error` event → init.ts showMapError.
  await page.route("**/*.pmtiles", (route) => route.abort());
  await page.goto("/");

  // The map-error overlay is a role=alert TEXT card carrying the exact Icelandic copy.
  const alert = page.locator('.bv-state--error[role="alert"]');
  await alert.waitFor({ state: "visible", timeout: 20_000 });
  await expect(alert).toContainText("Ekki tókst að hlaða kortið");
  await expect(alert).toContainText("Reyndu að hlaða síðunni aftur.");

  // The shell survives: the header wordmark is still present (the overlay insets below the header).
  await expect(page.locator("header.app-header .wordmark")).toContainText("Betra Veður");
});

// ---------------------------------------------------------------------------
// Criterion 15 — empty stations (fulfill stations.json as [], plus a 404 variant).
// ---------------------------------------------------------------------------
test("criterion 15: an empty stations.json ([]) shows `Engar veðurstöðvar` over a rendered basemap [07-01]", async ({
  page,
}) => {
  page.on("pageerror", (err) => {
    throw err;
  });
  await page.route("**/data/stations.json", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.goto("/");

  const empty = page.locator(".bv-state--empty");
  await empty.waitFor({ state: "visible", timeout: 20_000 });
  await expect(empty).toContainText("Engar veðurstöðvar");

  // Not a blank white screen — the basemap canvas still renders beneath the overlay.
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  // No marker pills painted for an empty set.
  expect(await page.locator(PILL).count()).toBe(0);
});

test("criterion 15 (404 variant): a 404 stations.json surfaces the empty affordance via the catch path [07-01]", async ({
  page,
}) => {
  // A 404 makes load.ts throw (res.ok gate) → the install() catch surfaces the empty state (never
  // a white screen, never a re-throw). page.on('pageerror') stays attached to prove no uncaught error.
  page.on("pageerror", (err) => {
    throw err;
  });
  await page.route("**/data/stations.json", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"not found"}' }),
  );
  await page.goto("/");

  const empty = page.locator(STATE).filter({ hasText: "Engar veðurstöðvar" });
  await empty.waitFor({ state: "visible", timeout: 20_000 });
  await expect(empty).toContainText("Engar veðurstöðvar");
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
});
