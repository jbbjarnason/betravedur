import { expect, test, type Page } from "@playwright/test";

// Phase 5 (Score Coloring & Ranking) E2E — the WAVE-0 SKELETON.
//
// This file exists NOW so the downstream UI plans (05-02 marker coloring + legend,
// 05-03 ranked "Bestu staðir" panel) have a green Playwright harness to extend. It
// carries ONE passing smoke test (the preview build boots, the map is style-loaded,
// at least one marker pill renders, and no pageerror fires) plus `test.fixme(...)`
// placeholders for every Acceptance-Checkable Visual Criterion (1-14) from
// 05-UI-SPEC.md §Acceptance-Checkable Visual Criteria. The fixmes name exactly which
// criterion each future test covers; they are recorded as skipped (not failing) until
// the corresponding UI is built in 05-02 / 05-03.
//
// Driving conventions mirror tests/e2e/markers.spec.ts: run against the PRODUCTION
// preview build (see playwright.config.ts webServer), gate on window.__map.isStyleLoaded()
// plus at least one `#marker-overlay [data-station]` pill, and attach a page.on('pageerror')
// guard so an uncaught error fails the run.

/** The overlay pill selector (one focusable skeleton per post-collision survivor). */
const PILL = "#marker-overlay [data-station]";

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
  // Fail the test if the page throws (UI-SPEC criterion: no white-screen / uncaught error).
  page.on("pageerror", (err) => {
    throw err;
  });
  await page.goto("/");
});

test("wave-0 smoke: preview build boots, map style-loads, a pill renders, no pageerror", async ({
  page,
}) => {
  await waitForMarkers(page);

  // The map is present and its style is loaded.
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  const styleLoaded = await page.evaluate(
    () => (window as { __map?: { isStyleLoaded(): boolean } }).__map?.isStyleLoaded() ?? false,
  );
  expect(styleLoaded).toBe(true);

  // The store hook the downstream tests will drive is exposed (Phase 4 seam).
  const hasStore = await page.evaluate(
    () => typeof (window as { __store?: unknown }).__store !== "undefined",
  );
  expect(hasStore).toBe(true);

  // At least one marker pill renders (the substrate 05-02 colors + 05-03 ranks).
  const pillCount = await page.locator(PILL).count();
  expect(pillCount).toBeGreaterThanOrEqual(1);
});

// ---------------------------------------------------------------------------
// UI-SPEC §Acceptance-Checkable Visual Criteria 1-14 — Wave-0 placeholders.
// Each is `test.fixme` (recorded, not run) until the owning UI plan builds the element.
// The comment on each names the plan that will un-fixme and implement it.
// ---------------------------------------------------------------------------
test.describe("Phase 5 acceptance criteria (05-UI-SPEC §Acceptance-Checkable Visual Criteria)", () => {
  // 05-02 (marker coloring + legend + explainer):
  test.fixme(
    "criterion 1: markers carry a score-ramp ring color AND a numeric score badge (/\\d,\\d/) [05-02]",
    async () => {},
  );
  test.fixme(
    "criterion 2: changing scrubber/width/year recolors >=1 marker with ZERO network requests [05-02]",
    async () => {},
  );
  test.fixme(
    "criterion 3: legend region (Einkunn / aria-label 'Skýring á einkunn') with a color scale + 'verra'/'betra' [05-02]",
    async () => {},
  );
  test.fixme(
    "criterion 4: 'hvernig er einkunnin reiknuð?' expands (aria-expanded=true) revealing 'úrkoma 40%'/'vindur 30%'/'hiti 30%' [05-02]",
    async () => {},
  );

  // 05-03 (ranked "Bestu staðir" panel):
  test.fixme(
    "criterion 5: a 'Bestu staðir' panel renders with an <ol> of rows [05-03]",
    async () => {},
  );
  test.fixme(
    "criterion 6: ranked rows are in descending score order (each row score <= previous) [05-03]",
    async () => {},
  );
  test.fixme(
    "criterion 7: ranked list updates on selection change with ZERO network requests [05-03]",
    async () => {},
  );
  test.fixme(
    "criterion 8: an 'ófullnægjandi gögn' station is ABSENT from the ranked list [05-03]",
    async () => {},
  );
  test.fixme(
    "criterion 9: an 'án úrkomu' station IS ranked + badged and its marker is colored (not muted) [05-02/05-03]",
    async () => {},
  );
  test.fixme(
    "criterion 10: clicking a row moves the map (easeTo) + sets URL 'st' param, opening NO chart panel [05-03]",
    async () => {},
  );
  test.fixme(
    "criterion 11: none of the coloring/ranking interactions fire a network request [05-02/05-03]",
    async () => {},
  );
  test.fixme(
    "criterion 12: empty state — a fully-unscorable selection shows 'Engin einkunn', no throw [05-03]",
    async () => {},
  );
  test.fixme(
    "criterion 13: collapse toggle flips aria-expanded, hides/shows the list, keeps the map band visible [05-03]",
    async () => {},
  );
  test.fixme(
    "criterion 14: every rendered score matches the Icelandic one-decimal comma format /^\\d{1,2},\\d$/ [05-02/05-03]",
    async () => {},
  );
});
