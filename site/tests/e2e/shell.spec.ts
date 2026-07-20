import { expect, test, type Page } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, "..", "..", "dist");
const CONTROLS_CSS = resolve(HERE, "..", "..", "src", "styles", "controls.css");

// UI-SPEC acceptance criteria 1-4, 8-9. Runs against the PRODUCTION preview build
// (see playwright.config.ts webServer) — the A1 Vite×MapLibre worker gate.

/**
 * Phase 7 (UX-04) added a first-visit auto-open info-panel MODAL. Its backdrop intercepts pointer
 * events, so any attribution test that clicks the MapLibre toggle would be blocked by it. Pre-seed
 * the dismissed-hint flag before the app boots so the attribution geometry/text is measured with no
 * modal in the way. (The auto-open itself is covered in info.spec criterion 7.)
 */
async function suppressInfoAutoOpen(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("bv:info-dismissed", "1");
    } catch {
      /* storage unavailable — the permalink/bare-visit guards still hold */
    }
  });
}

/** Expand the compact MapLibre attribution control to its full multi-line credit (best-effort). */
async function expandAttribution(page: Page): Promise<void> {
  const attrib = page.locator(".maplibregl-ctrl-attrib").first();
  const isShown = await attrib
    .evaluate(
      (el) =>
        el.classList.contains("maplibregl-compact-show") ||
        !el.classList.contains("maplibregl-compact"),
    )
    .catch(() => false);
  if (!isShown) {
    const toggle = page.locator(".maplibregl-ctrl-attrib-button");
    if (await toggle.count()) {
      await toggle.first().click({ trial: false }).catch(() => undefined);
    }
  }
}

/**
 * The Phase-7 harmonized licensing bar: the full CC BY 4.0 + OpenStreetMap + Veðurstofa credit is
 * ALWAYS reachable in the info panel (the canonical, never-occludable backstop) via the top-right
 * `i` button — regardless of what the compact map control does in any layout state. Opening it here
 * proves the licensing guarantee holds even when the map credit is collapsed or overlapped.
 */
async function assertFullCreditReachableInInfoPanel(page: Page): Promise<void> {
  await page.locator('button.info-button[aria-label="Um kortið"]').click();
  const panel = page.locator(".info-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Veðurstofa Íslands");
  await expect(panel).toContainText("OpenStreetMap");
  await expect(panel).toContainText("CC BY 4.0");
  await page.keyboard.press("Escape");
}

test("slogan: header carries the Icelandic wordmark and slogan", async ({ page }) => {
  await page.goto("/");
  const header = page.locator("header");
  await expect(header).toContainText("Betra Veður"); // criterion 2
  await expect(header).toContainText("Leitin að betra veðri"); // criterion 1
});

test("map canvas: a maplibre canvas renders with non-zero size", async ({ page }) => {
  await page.goto("/");
  const canvas = page.locator("canvas.maplibregl-canvas");
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(0); // criterion 3
  expect(box!.height).toBeGreaterThan(0);
});

test("no api key: the built dist contains no key-like strings", async () => {
  // criterion 4 — grep the BUILT assets, not source.
  const pattern = /maptiler|api_key|access_token/i;
  const hits: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(js|mjs|css|html|json)$/i.test(entry.name)) continue;
      const text = readFileSync(full, "utf8");
      if (pattern.test(text)) hits.push(full);
    }
  };
  walk(DIST);
  expect(hits, `key-like strings found in: ${hits.join(", ")}`).toHaveLength(0);
});

test("attribution: names Veðurstofa Íslands, OpenStreetMap, CC BY 4.0", async ({ page }) => {
  await suppressInfoAutoOpen(page);
  await page.goto("/");
  await expandAttribution(page);
  const attrib = page.locator(".maplibregl-ctrl-attrib");
  await expect(attrib).toContainText("Veðurstofa Íslands"); // from ATTRIBUTION (criterion 8)
  await expect(attrib).toContainText("OpenStreetMap");
  await expect(attrib).toContainText("CC BY 4.0");
});

test("attribution: the credit control is NOT occluded by the bottom control bar (licensing)", async ({
  page,
}) => {
  // LICENSING regression guard: the control bar (position:fixed; bottom:0; z-index:10) must not
  // cover the MapLibre attribution (CC BY 4.0 / OSM / Protomaps / Veðurstofa). controls.css lifts
  // the attribution above the bar via margin-bottom: calc(var(--bar-height) + …). Assert the
  // attribution control renders ABOVE the bar's top edge (no vertical overlap). Earlier this gap
  // slipped because no E2E asserted attribution legibility. The Phase-7 harmonized rule keys the
  // lift on --attrib-safe-bottom (= --bar-height baseline) instead of the deleted --bar-height hack.
  await suppressInfoAutoOpen(page);
  await page.goto("/");
  // The bar mounts only after the initial marker render (post data load) — wait for it so its
  // measured height has been written into --bar-height and the attribution has been lifted.
  const bar = page.locator(".control-bar");
  await bar.waitFor({ state: "visible", timeout: 20_000 });

  const attrib = page.locator(".maplibregl-ctrl-bottom-right");
  await expect(attrib).toBeVisible();

  // Let the ResizeObserver-driven --bar-height write + layout settle.
  await page.waitForTimeout(300);

  const attribBox = await attrib.boundingBox();
  const barBox = await bar.boundingBox();
  expect(attribBox).not.toBeNull();
  expect(barBox).not.toBeNull();
  // The attribution's BOTTOM edge must sit at or above the bar's TOP edge — i.e. it is lifted
  // clear of the bar, not hidden behind it. A small tolerance absorbs sub-pixel rounding.
  expect(attribBox!.y + attribBox!.height).toBeLessThanOrEqual(barBox!.y + 1);
});

test("attribution (criterion 12): no legacy hacks — --attrib-safe-bottom present, panel-open/60vw absent", async () => {
  // The attribution debt is solved ONCE (07-02): the three incremental controls.css hacks are
  // DELETED and replaced by the harmonized --attrib-safe-bottom safe-zone rule. Grep-gate the built
  // source: the `60vw` cap and the `.panel-open .maplibregl-ctrl` push must be ABSENT, and the
  // `--attrib-safe-bottom` rule must be PRESENT (UI-SPEC Acceptance criterion 12).
  const css = readFileSync(CONTROLS_CSS, "utf8");
  expect(css, "controls.css must define --attrib-safe-bottom margin").toContain("--attrib-safe-bottom");
  expect(css, "the 60vw cap hack must be removed").not.toMatch(/60vw/);
  expect(css, "the .panel-open attribution push must be removed").not.toMatch(
    /\.panel-open\s+\.maplibregl-ctrl/,
  );
});

test("attribution (criterion 10, desktop): compact credit sits in the bottom safe zone AND the full credit is reachable in the info panel", async ({
  page,
}) => {
  // HARMONIZED licensing bar (07-02, supersedes the deleted 60vw/panel-open/bar-height hacks): with
  // compact:true the map credit is a small (i) toggle in a reserved bottom band (cleared above the
  // control bar by --attrib-safe-bottom) — CC BY 4.0 v4.0 + OSM permit collapsing behind an (i) as
  // long as the full credit is findable, and the info panel is the always-legible backstop. Assert
  // BOTH legs at the wide widths that previously wrapped the credit into the legend.
  const widths = [1024, 1280, 1440];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 800 });
    await suppressInfoAutoOpen(page);
    await page.goto("/");

    const bar = page.locator(".control-bar");
    await bar.waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForTimeout(300); // let --bar-height / --attrib-safe-bottom settle

    // Leg 1: the compact map credit control is present and sits in the reserved bottom safe zone —
    // its bottom edge is at or above the control bar's top edge (never hidden behind the bar).
    const attribCtrl = page.locator(".maplibregl-ctrl-bottom-right").first();
    await expect(attribCtrl).toBeVisible();
    const attribBox = await attribCtrl.boundingBox();
    const barBox = await bar.boundingBox();
    expect(attribBox, `attribution control box at ${width}px`).not.toBeNull();
    expect(barBox, `bar box at ${width}px`).not.toBeNull();
    expect(
      attribBox!.y + attribBox!.height,
      `attribution must clear the control bar at ${width}px (safe zone)`,
    ).toBeLessThanOrEqual(barBox!.y + 1);

    // Leg 2 (the licensing guarantee): the FULL CC BY 4.0 + OSM + Veðurstofa credit is one tap away
    // in the info panel, always legible regardless of the compact control's layout state.
    await assertFullCreditReachableInInfoPanel(page);
  }
});

test("attribution (criterion 10, panel open): the full credit stays reachable in the info panel with the station panel open (licensing)", async ({
  page,
}) => {
  // HARMONIZED licensing bar (07-02): the deleted `.panel-open { margin-right:344px }` hack pushed
  // the always-expanded credit clear of the right-docked station panel. That per-surface push is
  // gone. Instead the compact map credit sits in the reserved bottom safe zone (above the control
  // bar, in the gap BELOW the panel's bottom edge which is `bottom: bar-height + --space-lg`), and —
  // the guarantee — the FULL CC BY 4.0 + OSM + Veðurstofa credit is always one tap away in the info
  // panel even while the station panel is open. Assert both: the compact credit clears the bar, and
  // the info-panel credit is reachable with the panel open.
  await page.setViewportSize({ width: 1280, height: 800 });
  await suppressInfoAutoOpen(page);
  await page.goto("/");

  const bar = page.locator(".control-bar");
  await bar.waitFor({ state: "visible", timeout: 20_000 });
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

  // Open the panel via the store seam (first rendered station).
  const stationId = await page
    .locator("#marker-overlay [data-station]")
    .first()
    .getAttribute("data-station");
  expect(stationId).not.toBeNull();
  await page.evaluate((sid) => {
    (window as unknown as { __store: { set(p: Record<string, unknown>): void } }).__store.set({
      stationId: Number(sid),
    });
  }, stationId);
  const panel = page.locator("section.station-panel[aria-label]");
  await panel.waitFor({ state: "visible", timeout: 5_000 });
  await page.waitForTimeout(300);

  // Leg 1: the compact map credit is still present and clears the control bar (bottom safe zone).
  // The station panel's bottom edge is `bar-height + --space-lg` from the bottom, ABOVE the credit's
  // `bar-height + --space-sm` band, so the compact credit is not covered by the panel.
  const attribCtrl = page.locator(".maplibregl-ctrl-bottom-right").first();
  await expect(attribCtrl).toBeVisible();
  const attribBox = await attribCtrl.boundingBox();
  const barBox = await bar.boundingBox();
  expect(attribBox, "attribution control box with panel open").not.toBeNull();
  expect(barBox, "bar box").not.toBeNull();
  expect(
    attribBox!.y + attribBox!.height,
    "attribution must clear the control bar with the panel open (safe zone)",
  ).toBeLessThanOrEqual(barBox!.y + 1);

  // Leg 2 (the licensing guarantee): the full credit is reachable in the info panel while the
  // station panel is open (the info panel is z40, above the station panel — a separate surface).
  await assertFullCreditReachableInInfoPanel(page);
});

test("attribution (criterion 11, mobile 390): compact credit clears the control bar AND the full credit is reachable in the info panel", async ({
  page,
}) => {
  // MOBILE licensing bar (criterion 11): at 390px the compact credit collapses to its small (i)
  // toggle in the bottom safe zone (cleared above the control bar by --attrib-safe-bottom), and the
  // full CC BY 4.0 + OSM credit is always reachable via the top-right info button. (The Plan-03
  // bottom-sheet coupling — raising --attrib-safe-bottom to the sheet peek — is a later seam; this
  // asserts the standing-chrome mobile case.) The info panel is data-independent chrome, so this
  // does not depend on markers (which do not survive the narrow 390px viewport with the sample set).
  await page.setViewportSize({ width: 390, height: 844 });
  await suppressInfoAutoOpen(page);
  await page.goto("/");

  const bar = page.locator(".control-bar");
  await bar.waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForTimeout(300);

  const attribCtrl = page.locator(".maplibregl-ctrl-bottom-right").first();
  await expect(attribCtrl).toBeVisible();
  const attribBox = await attribCtrl.boundingBox();
  const barBox = await bar.boundingBox();
  expect(attribBox, "attribution control box at 390px").not.toBeNull();
  expect(barBox, "bar box at 390px").not.toBeNull();
  // The compact credit's bottom edge clears the control bar's top edge (safe zone at mobile).
  expect(
    attribBox!.y + attribBox!.height,
    "attribution must clear the control bar at 390px (safe zone)",
  ).toBeLessThanOrEqual(barBox!.y + 1);

  // The full credit is one tap away in the info panel at mobile too.
  await assertFullCreditReachableInInfoPanel(page);
});

test("interactivity: zooming in raises the map zoom level", async ({ page }) => {
  await page.goto("/");
  await page.locator("canvas.maplibregl-canvas").waitFor({ state: "visible", timeout: 15_000 });
  const initial = await page.evaluate(() => (window as any).__map.getZoom() as number);
  await page.evaluate(() => {
    const m = (window as any).__map;
    m.setZoom(m.getZoom() + 2);
  });
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => (window as any).__map.getZoom() as number);
  expect(after).toBeGreaterThan(initial); // criterion 9
});
