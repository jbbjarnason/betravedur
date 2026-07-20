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

test("attribution: the credit control is NOT occluded by the bottom-left legend when it WRAPS at ≥1024px (licensing)", async ({
  page,
}) => {
  // BLOCKER regression guard (UI-REVIEW): at widths ≥1024px the MapLibre attribution expands to
  // its full text and wraps to multiple lines. Previously the attribution was lifted only
  // --space-xs (4px) above the bar while the bottom-left legend floor sat at --space-lg (24px),
  // so the wrapped attribution rose INTO the legend's band and the legend's rgba(0.92) surface
  // slid over the credit — degrading legibility of the CC BY 4.0 / OpenStreetMap credit. The fix
  // lifts the attribution to --space-lg so its box never intersects the legend at 1024/1280/1440.
  //
  // This test explicitly EXPANDS the attribution (forcing the wrap case the earlier assertion
  // missed) and asserts the attribution box does not intersect the legend box at each width.
  const widths = [1024, 1280, 1440];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");

    // The legend and control bar mount after the initial marker render.
    const bar = page.locator(".control-bar");
    await bar.waitFor({ state: "visible", timeout: 20_000 });
    const legend = page.locator('.score-legend, [aria-label="Skýring á einkunn"]').first();
    await legend.waitFor({ state: "visible", timeout: 20_000 });

    // The AttributionControl is added bottom-RIGHT (map/init.ts); the legend is a fixed panel
    // bottom-LEFT. The margin-bottom lift in controls.css covers BOTH bottom groups, so lifting
    // the attribution to --space-lg keeps it clear of the legend floor even when it wraps.
    // NOTE: the `.maplibregl-ctrl-bottom-right` CONTAINER spans the full viewport width, so we
    // must measure the actual credit element (`.maplibregl-ctrl-attrib`), whose box is the real
    // painted, right-aligned credit — that is what can slide under the legend.
    const container = page.locator(".maplibregl-ctrl-bottom-right").first();
    await expect(container).toBeVisible({ timeout: 20_000 });
    const attrib = page.locator(".maplibregl-ctrl-attrib").first();

    // Force the attribution to its FULL (wrapping, multi-line) text — the wrap case the earlier
    // one-line assertion missed. MapLibre's compact control expands via the toggle button; some
    // builds render expanded already, so this is best-effort and idempotency-safe.
    const isShown = await attrib.evaluate(
      (el) => el.classList.contains("maplibregl-compact-show") || !el.classList.contains("maplibregl-compact"),
    ).catch(() => false);
    if (!isShown) {
      const toggle = page.locator(".maplibregl-ctrl-attrib-button");
      if (await toggle.count()) {
        await toggle.first().click({ trial: false }).catch(() => undefined);
      }
    }

    // Let the ResizeObserver-driven --bar-height write + attribution expansion + layout settle.
    await page.waitForTimeout(400);

    // Measure the ACTUAL painted credit box (right-aligned, wrapped) vs the legend box.
    const attribBox = await attrib.boundingBox();
    const legendBox = await legend.boundingBox();
    expect(attribBox, `attribution box at ${width}px`).not.toBeNull();
    expect(legendBox, `legend box at ${width}px`).not.toBeNull();

    // Axis-aligned bounding-box intersection test: the two boxes must NOT overlap. A 1px
    // tolerance absorbs sub-pixel rounding on shared edges.
    const a = attribBox!;
    const l = legendBox!;
    const overlaps =
      a.x < l.x + l.width - 1 &&
      a.x + a.width > l.x + 1 &&
      a.y < l.y + l.height - 1 &&
      a.y + a.height > l.y + 1;
    expect(
      overlaps,
      `attribution [${a.x},${a.y},${a.width}x${a.height}] must not intersect legend ` +
        `[${l.x},${l.y},${l.width}x${l.height}] at ${width}px (licensing legibility)`,
    ).toBe(false);
  }
});

test("attribution: the credit control is NOT occluded by the OPEN station panel (licensing)", async ({
  page,
}) => {
  // UI BLOCKER regression guard (UI-REVIEW #3): the right-docked station panel (position:fixed;
  // right:0; width:340px; z-index:10) paints its glass surface OVER the bottom-right MapLibre
  // credit, degrading its legibility — an attribution-licensing violation. mountStationPanel
  // toggles `.panel-open` on <body>; a controls.css rule then pushes the bottom-right container
  // margin-right: 344px so the credit clears the panel. Assert: with the panel OPEN, the painted
  // credit box does not intersect the panel box (and the credit is still visible).
  await page.setViewportSize({ width: 1280, height: 800 });
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

  // The body carries the .panel-open offset class while the panel is open.
  expect(await page.evaluate(() => document.body.classList.contains("panel-open"))).toBe(true);

  // Expand the credit to its full painted box (best-effort — some builds render expanded).
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
  await page.waitForTimeout(400);

  await expect(attrib).toBeVisible();
  const attribBox = await attrib.boundingBox();
  const panelBox = await panel.boundingBox();
  expect(attribBox, "attribution box with panel open").not.toBeNull();
  expect(panelBox, "panel box").not.toBeNull();

  // Axis-aligned bounding-box intersection: the painted credit must NOT overlap the panel.
  const a = attribBox!;
  const p = panelBox!;
  const overlaps =
    a.x < p.x + p.width - 1 &&
    a.x + a.width > p.x + 1 &&
    a.y < p.y + p.height - 1 &&
    a.y + a.height > p.y + 1;
  expect(
    overlaps,
    `attribution [${a.x},${a.y},${a.width}x${a.height}] must not intersect the open panel ` +
      `[${p.x},${p.y},${p.width}x${p.height}] (licensing legibility)`,
  ).toBe(false);
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
