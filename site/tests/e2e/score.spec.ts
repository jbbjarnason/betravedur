import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const EVIDENCE = resolve(
  HERE,
  "..",
  "..",
  "..",
  ".planning",
  "phases",
  "05-score-coloring-ranking",
  "evidence",
);

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
  // 05-02 (marker coloring + legend + explainer): IMPLEMENTED.

  test("criterion 1: markers carry a score-ramp left-bar color AND a numeric score badge (/\\d,\\d/) [05-02]", async ({
    page,
  }) => {
    await waitForMarkers(page);

    // At least one scored pill carries the marker-pill--scored class + an inline --pill-score
    // that is a real ramp color (not the --hairline fallback), AND a visible badge matching
    // the Icelandic comma format — the required non-color channel.
    const scored = page.locator(`${PILL}.marker-pill--scored`);
    expect(await scored.count()).toBeGreaterThanOrEqual(1);

    const first = scored.first();
    const pillScore = await first.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--pill-score").trim(),
    );
    expect(pillScore).not.toBe("");
    // A real BuGn ramp color resolves to an rgb()/hex value, never the transparent hairline.
    expect(pillScore.toLowerCase()).not.toContain("rgba(31, 41, 51, 0.1");

    const badgeText = await first.locator(".marker-score-badge").innerText();
    expect(badgeText).toMatch(/\d,\d/);
    // The score badge is distinct from the temperature ° value.
    expect(badgeText).not.toContain("°");
  });

  test("criterion 2 (+11): changing the selection recolors/re-badges >=1 marker with ZERO /data/ requests [05-02]", async ({
    page,
  }) => {
    await waitForMarkers(page);

    // Snapshot the current badge values keyed by station.
    const readBadges = (): Promise<Record<string, string>> =>
      page.evaluate(() => {
        const out: Record<string, string> = {};
        for (const pill of document.querySelectorAll<HTMLElement>(
          "#marker-overlay [data-station]",
        )) {
          const badge = pill.querySelector<HTMLElement>(".marker-score-badge");
          if (badge) out[pill.dataset.station ?? ""] = badge.textContent ?? "";
        }
        return out;
      });
    const before = await readBadges();

    // Count any /data/ request fired during the interaction (criterion 11: no new fetch).
    let dataRequests = 0;
    page.on("request", (req) => {
      if (req.url().includes("/data/")) dataRequests++;
    });

    // Drive a year-range change through the store (widens the baseline → recomputes scores).
    await page.evaluate(() => {
      const store = (window as unknown as {
        __store: {
          get(): { yearFrom: number; yearTil: number };
          set(p: Record<string, unknown>): void;
        };
      }).__store;
      const s = store.get();
      // Widen the range so at least one station's mean (hence score) shifts.
      store.set({ yearFrom: Math.max(1949, s.yearFrom - 20) });
    });
    // Let the debounced recompute (120ms) + idle re-render settle.
    await page.waitForTimeout(600);

    const after = await readBadges();

    // At least one station present in both frames changed its badge value.
    const changed = Object.keys(before).some(
      (st) => st in after && after[st] !== before[st],
    );
    expect(changed).toBe(true);

    // No /data/ fetch fired during the recolor (pure client-side read of the store).
    expect(dataRequests).toBe(0);
  });

  test("criterion 3: legend region (aria-label 'Skýring á einkunn') with a color scale + 'verra'/'betra' [05-02]", async ({
    page,
  }) => {
    await waitForMarkers(page);

    const legend = page.locator('[aria-label="Skýring á einkunn"]');
    await expect(legend).toBeVisible();
    await expect(legend.locator(".score-legend__title")).toHaveText("Einkunn");
    // A rendered color-scale element with a real gradient background.
    const ramp = legend.locator(".score-legend__ramp");
    await expect(ramp).toBeVisible();
    const bg = await ramp.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(bg).toContain("gradient");
    // Endpoint captions in plain Icelandic.
    await expect(legend).toContainText("verra");
    await expect(legend).toContainText("betra");
  });

  test("criterion 4: 'hvernig er einkunnin reiknuð?' expands (aria-expanded/open) revealing the 40/30/30 weights [05-02]", async ({
    page,
  }) => {
    await waitForMarkers(page);

    const details = page.locator(".score-explainer");
    const summary = details.locator("summary");
    await expect(summary).toHaveText("hvernig er einkunnin reiknuð?");

    // Collapsed by default.
    expect(await details.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);

    // Activate the disclosure (native <details> — click toggles open + the equivalent of
    // aria-expanded=true).
    await summary.click();
    expect(await details.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(true);

    // The revealed body carries the exact weight text.
    const body = await details.locator(".score-explainer__body").innerText();
    expect(body).toContain("úrkoma 40%");
    expect(body).toContain("vindur 30%");
    expect(body).toContain("hiti 30%");
    // And the án-úrkomu renormalization note.
    expect(body).toContain("án úrkomu");
  });

  test("criterion 14: every rendered score badge matches /^\\d{1,2},\\d$/ (Icelandic comma) [05-02]", async ({
    page,
  }) => {
    await waitForMarkers(page);
    const badges = await page
      .locator("#marker-overlay [data-station] .marker-score-badge")
      .allInnerTexts();
    expect(badges.length).toBeGreaterThanOrEqual(1);
    for (const b of badges) {
      expect(b.trim()).toMatch(/^\d{1,2},\d$/);
    }
  });

  test("evidence: capture the colored markers + legend for self-inspection [05-02]", async ({
    page,
  }) => {
    mkdirSync(EVIDENCE, { recursive: true });
    await waitForMarkers(page);

    // Frame the SW sample stations (Reykjavík #1, Keflavík #1350) so the colored bars + badges
    // + the legend are all in view.
    await page.evaluate(() => {
      (window as unknown as { __map: { fitBounds: (b: number[][], o: unknown) => void } }).__map.fitBounds(
        [
          [-22.7, 63.9],
          [-21.8, 64.2],
        ],
        { padding: 120, duration: 0 },
      );
    });
    await page.waitForFunction(
      () => document.querySelectorAll("#marker-overlay [data-station]").length > 0,
      { timeout: 5_000 },
    );
    await page.waitForTimeout(800);

    // Expand the explainer so the screenshot proves it reveals the weights.
    await page.locator(".score-explainer summary").click();
    await page.waitForTimeout(200);

    await page.screenshot({
      path: resolve(EVIDENCE, "05-02-colored-markers-legend.png"),
      fullPage: false,
    });
  });

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
  // criterion 11 (coloring half — no /data/ fetch on a selection change) is asserted in
  // "criterion 2 (+11)" above (05-02); the ranking half is added with the list in 05-03.
  test.fixme(
    "criterion 11: none of the RANKING interactions fire a network request [05-03]",
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
  // criterion 14 (marker-badge half) is asserted above (05-02); the ranked-ROW score format
  // is added with the list in 05-03.
  test.fixme(
    "criterion 14: every ranked-ROW score matches the Icelandic one-decimal comma format /^\\d{1,2},\\d$/ [05-03]",
    async () => {},
  );
});
