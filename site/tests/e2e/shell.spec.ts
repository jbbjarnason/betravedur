import { expect, test } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, "..", "..", "dist");

// UI-SPEC acceptance criteria 1-4, 8-9. Runs against the PRODUCTION preview build
// (see playwright.config.ts webServer) — the A1 Vite×MapLibre worker gate.

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
  await page.goto("/");
  // Expand the compact attribution control so its full text is present.
  const toggle = page.locator(".maplibregl-ctrl-attrib-button");
  if (await toggle.count()) {
    await toggle.first().click({ trial: false }).catch(() => undefined);
  }
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
  // slipped because no E2E asserted attribution legibility.
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
