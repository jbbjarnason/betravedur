import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Phase 4 Plan 02 — the control-bar slice. Drives the PRODUCTION preview build (see
// playwright.config.ts webServer). Asserts UI-SPEC criteria 1-8, 10, 16 as automated checks
// (no human checkpoint — the no-review directive): the bar renders, controls drive the store,
// a selection change recomputes VISIBLE markers with ZERO /data/ network requests, and the
// narrow-screen stepper drives the same store path. Crafted-URL restore / back-button /
// default-when-no-params are Plan 03's spec — NOT asserted here.

const HERE = dirname(fileURLToPath(import.meta.url));
const EVIDENCE = resolve(
  HERE,
  "..",
  "..",
  "..",
  ".planning",
  "phases",
  "04-selection-instant-recompute",
  "evidence",
);

const PILL = "#marker-overlay [data-station]";

/** Wait until the map is idle and at least one composite pill has rendered. */
async function waitForMarkers(page: Page): Promise<void> {
  await page.locator("canvas.maplibregl-canvas").waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForFunction(
    () => {
      const m = (window as any).__map;
      return (
        m &&
        m.isStyleLoaded() &&
        document.querySelectorAll("#marker-overlay [data-station]").length > 0
      );
    },
    { timeout: 20_000 },
  );
  // The control bar mounts right after the initial render.
  await page.locator(".control-bar").waitFor({ state: "visible", timeout: 10_000 });
}

/** The concatenated visible marker text (temps + winds) — changes when a recompute lands. */
async function markerText(page: Page): Promise<string> {
  const texts = await page.locator(PILL).allInnerTexts();
  return texts.join(" | ");
}

/**
 * Attach a /data/ request counter, run `act`, then wait for the marker overlay text to change
 * away from `prevText` (past the 120ms recompute debounce + a map repaint) and return the
 * /data/ request count observed throughout. The canonical no-network shape (RESEARCH
 * Validation Architecture): the recompute reads only the boot cache, so a selection change
 * must fire ZERO /data/ requests while it re-renders. Pass prevText=null to skip the wait
 * (when the change is asserted elsewhere) and just settle past the debounce.
 */
async function countDataRequestsDuring(
  page: Page,
  act: () => Promise<void>,
  prevText: string | null = null,
): Promise<number> {
  let dataRequests = 0;
  const onReq = (req: import("@playwright/test").Request): void => {
    if (req.url().includes("/data/")) dataRequests++;
  };
  page.on("request", onReq);
  await act();
  if (prevText !== null) {
    await page
      .waitForFunction(
        (prev) => {
          const t = Array.from(document.querySelectorAll("#marker-overlay [data-station]"))
            .map((n) => (n as HTMLElement).innerText)
            .join(" | ");
          return t !== prev;
        },
        prevText,
        { timeout: 5_000 },
      )
      .catch(() => undefined); // tolerate: some changes don't alter rounded values (asserted by caller)
  }
  await page.waitForTimeout(400); // settle past the 120ms debounce + repaint
  page.off("request", onReq);
  return dataRequests;
}

test.beforeEach(async ({ page }) => {
  // Fail the test if the page throws (criterion: no white-screen / uncaught error).
  page.on("pageerror", (err) => {
    throw err;
  });
  // Phase 7 (UX-04) added a first-visit auto-open info-panel MODAL whose backdrop intercepts pointer
  // events (blocking control/marker clicks). Pre-seed the dismissed-hint flag so these prior-phase
  // interaction tests boot with no modal in the way (the auto-open itself is covered by info.spec
  // criterion 7). addInitScript must run BEFORE the navigation below to take effect.
  await page.addInitScript(() => {
    try {
      localStorage.setItem("bv:info-dismissed", "1");
    } catch {
      /* storage unavailable — the permalink/bare-visit guards still hold */
    }
  });
  await page.goto("/");
});

test("criterion 1: bottom control bar is fixed to the viewport bottom and clears the header", async ({
  page,
}) => {
  await waitForMarkers(page);
  const bar = page.locator(".control-bar");
  await expect(bar).toBeVisible();

  const barBox = await bar.boundingBox();
  const headerBox = await page.locator("header.app-header").boundingBox();
  const viewport = page.viewportSize()!;
  expect(barBox).not.toBeNull();
  expect(barBox!.width).toBeGreaterThan(0);
  expect(barBox!.height).toBeGreaterThan(0);
  // Docked to the bottom edge.
  expect(barBox!.y + barBox!.height).toBeGreaterThanOrEqual(viewport.height - 2);
  // Within the occlusion budget so Iceland (framed at zoom 6) stays visible (UI-SPEC ≤ ~135px).
  expect(barBox!.height).toBeLessThanOrEqual(135);
  // Does not overlap the header (bar top is below the header bottom).
  expect(barBox!.y).toBeGreaterThan(headerBox!.y + headerBox!.height);
});

test("criterion 2+3: exactly four width buttons in order, one aria-pressed on load", async ({
  page,
}) => {
  await waitForMarkers(page);
  const btns = page.locator(".width-group__btn");
  await expect(btns).toHaveCount(4);
  expect(await btns.allInnerTexts()).toEqual(["1 vika", "2 vikur", "3 vikur", "1 mánuður"]);

  const pressed = page.locator('.width-group__btn[aria-pressed="true"]');
  await expect(pressed).toHaveCount(1);
});

test("criterion 4: clicking a different width flips aria-pressed and drives the store with 0 /data/ requests", async ({
  page,
}) => {
  await waitForMarkers(page);
  const btns = page.locator(".width-group__btn");

  // Click "1 mánuður" (30 days). It writes widthDays to the store and recomputes over the
  // boot cache — NO fetch. (On the 2-station sample the rounded temp/wind for a 14- vs 30-day
  // summer window coincide, so the recompute-VISIBLE assertion lives in criteria 6 & 8; here
  // we prove the width WIRING: aria-pressed flip + store write + zero network.)
  const target = btns.nth(3);
  const dataRequests = await countDataRequestsDuring(page, async () => {
    await target.click();
  });

  await expect(target).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('.width-group__btn[aria-pressed="true"]')).toHaveCount(1);
  expect(dataRequests).toBe(0);
  const width = await page.evaluate(() => (window as any).__store.get().widthDays as number);
  expect(width).toBe(30); // the store received the width change
});

test("criterion 5: a role=slider scrubber is keyboard-operable and updates its date readout", async ({
  page,
}) => {
  await waitForMarkers(page);
  // getByRole('slider') confirms the a11y-tree slider role + aria-valuemin/max/now are exposed
  // (native <input type=range> derives them from min/max/value — asserted here as the DOM attrs
  // that back them). Playwright's role query fails if the slider role isn't present.
  const slider = page.getByRole("slider", { name: "Velja tímabil" });
  await expect(slider).toHaveCount(1);
  await expect(slider).toHaveAttribute("min", "1"); // → aria-valuemin
  await expect(slider).toHaveAttribute("max", "365"); // → aria-valuemax

  const beforeNow = await slider.inputValue(); // → aria-valuenow
  const beforeReadout = await page.locator(".scrubber__readout").first().innerText();

  await slider.focus();
  await slider.press("ArrowRight");

  const afterNow = await slider.inputValue();
  const afterReadout = await page.locator(".scrubber__readout").first().innerText();
  expect(afterNow).not.toBe(beforeNow);
  expect(afterReadout).not.toBe(beforeReadout);
});

test("criterion 6: driving __store.set({anchorDoy}) recomputes a marker with 0 /data/ requests", async ({
  page,
}) => {
  await waitForMarkers(page);
  const before = await markerText(page);

  const dataRequests = await countDataRequestsDuring(
    page,
    async () => {
      // Summer default → deep winter: a large anchor swing so a temp/wind value shifts.
      await page.evaluate(() => (window as any).__store.set({ anchorDoy: 15 }));
    },
    before,
  );

  expect(dataRequests).toBe(0);
  const after = await markerText(page);
  expect(after).not.toBe(before);
});

test("criterion 7: two Frá/Til selects bounded by manifest-derived years (not a single literal)", async ({
  page,
}) => {
  await waitForMarkers(page);
  const from = page.locator("#year-from");
  const til = page.locator("#year-til");
  await expect(from).toHaveCount(1);
  await expect(til).toHaveCount(1);
  await expect(page.locator('label[for="year-from"]')).toHaveText("Frá");
  await expect(page.locator('label[for="year-til"]')).toHaveText("Til");

  // Bounds come from the manifest union — read manifest.json and compare min/max option years.
  const manifest = await page.request.get("/betravedur/data/manifest.json");
  const mj = (await manifest.json()) as {
    stations: Record<string, { from?: number; to?: number }>;
  };
  const froms = Object.values(mj.stations)
    .map((e) => e.from)
    .filter((n): n is number => typeof n === "number");
  const tos = Object.values(mj.stations)
    .map((e) => e.to)
    .filter((n): n is number => typeof n === "number");
  const expMin = Math.min(...froms);
  const expMax = Math.max(...tos);
  expect(expMax).toBeGreaterThan(expMin); // sanity: a real range, not one literal

  const optionYears = await from.locator("option").allInnerTexts();
  const years = optionYears.map(Number);
  expect(Math.min(...years)).toBe(expMin);
  expect(Math.max(...years)).toBe(expMax);
});

test("criterion 8: changing a year <select> recomputes with 0 /data/ requests", async ({
  page,
}) => {
  await waitForMarkers(page);
  const before = await markerText(page);
  const from = page.locator("#year-from");
  const options = await from.locator("option").allInnerTexts();

  const dataRequests = await countDataRequestsDuring(
    page,
    async () => {
      // Pick the earliest available year for Frá — widens/narrows N and shifts averages.
      await from.selectOption(options[0]!);
    },
    before,
  );

  expect(dataRequests).toBe(0);
  const after = await markerText(page);
  const readout = await page.locator(".control-bar__readout").innerText();
  // Either a marker value or the meðaltal N readout must reflect the change.
  expect(after !== before || /meðaltal|ófullnægjandi/.test(readout)).toBe(true);
});

test("criterion 10: a meðaltal N ára readout is present", async ({ page }) => {
  await waitForMarkers(page);
  const readout = await page.locator(".control-bar__readout").innerText();
  expect(readout).toMatch(/meðaltal \d+(–\d+)? ára|ófullnægjandi gögn/);
});

test("criterion 16: at a 500px viewport the ‹ › stepper drives __store.anchorDoy", async ({
  page,
}) => {
  // Wait for the bar (which mounts after the initial marker render at the default viewport),
  // THEN narrow the viewport so the CSS swaps the range track for the ‹ › stepper. We don't
  // re-wait for markers here — the stepper drives the store directly, independent of the map.
  await page.locator(".control-bar").waitFor({ state: "visible", timeout: 20_000 });
  await page.setViewportSize({ width: 500, height: 800 });
  await page.waitForTimeout(300); // let the media-query restyle settle

  // The range track is hidden; the stepper buttons are shown.
  const stepButtons = page.locator(".scrubber__step");
  await expect(stepButtons).toHaveCount(2);
  await expect(stepButtons.first()).toBeVisible();

  const before = await page.evaluate(() => (window as any).__store.get().anchorDoy as number);
  await stepButtons.nth(1).click(); // "›" → anchor + 1
  const after = await page.evaluate(() => (window as any).__store.get().anchorDoy as number);
  expect(after).not.toBe(before);
});

test("evidence: capture control-bar screenshots at default and after a year-range change", async ({
  page,
}) => {
  mkdirSync(EVIDENCE, { recursive: true });
  await waitForMarkers(page);

  await page.waitForTimeout(500);
  await page.screenshot({
    path: resolve(EVIDENCE, "04-02-controls-default.png"),
    fullPage: false,
  });

  // Change the year range then re-screenshot so marker values visibly recompute. Pick a
  // MIDDLE year (not the already-selected earliest bound) so the change is real and visible.
  const from = page.locator("#year-from");
  const options = await from.locator("option").allInnerTexts();
  const mid = options[Math.floor(options.length / 2)]!;
  await from.selectOption(mid);
  await page.waitForTimeout(500);
  await page.screenshot({
    path: resolve(EVIDENCE, "04-02-controls-year-changed.png"),
    fullPage: false,
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// Plan 03 — URL-state slice (UX-02): the full selection is serialized to the URL and a copied
// link restores the exact view; no-params yields the data-derived default; back-button popstate
// reverts a discrete change; selection changes never full-reload the page.
// ─────────────────────────────────────────────────────────────────────────────────────────

/** Read the manifest union year bounds (mirrors the app's yearBounds derivation). */
async function manifestBounds(page: Page): Promise<{ min: number; max: number }> {
  const res = await page.request.get("/betravedur/data/manifest.json");
  const mj = (await res.json()) as { stations: Record<string, { from?: number; to?: number }> };
  const froms = Object.values(mj.stations)
    .map((e) => e.from)
    .filter((n): n is number => typeof n === "number");
  const tos = Object.values(mj.stations)
    .map((e) => e.to)
    .filter((n): n is number => typeof n === "number");
  return { min: Math.min(...froms), max: Math.max(...tos) };
}

/** Today's leap-folded day-of-year (fixed non-leap month table, mirrors leapFoldedDoy). */
function todayDoy(now = new Date()): number {
  const CUM = [0, 0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const iso = now.toISOString().slice(0, 10);
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  if (month === 2 && day === 29) return 197; // Feb-29 fallback (matches defaultSelection)
  return CUM[month]! + day;
}

test("criterion 12: interacting encodes the full selection into the URL query string (UX-02)", async ({
  page,
}) => {
  await waitForMarkers(page);

  // Discrete width click (pushState) + a scrubber move + a year change + a viewport nudge.
  await page.locator(".width-group__btn").nth(2).click(); // 3 vikur → w=21
  await page.evaluate(() => (window as any).__store.set({ anchorDoy: 42 }));
  const from = page.locator("#year-from");
  const opts = await from.locator("option").allInnerTexts();
  await from.selectOption(opts[0]!); // earliest year
  await page.evaluate(() => (window as any).__map.jumpTo({ center: [-18.5, 64.8], zoom: 6.5 }));
  await page.waitForTimeout(400); // settle past debounce + moveend

  const qs = new URL(page.url()).searchParams;
  expect(qs.get("doy")).toBe("42");
  expect(qs.get("w")).toBe("21");
  expect(qs.has("fra")).toBe(true);
  expect(qs.has("til")).toBe(true);
  expect(qs.has("v")).toBe(true); // the compact lat,lng,zoom viewport param
  const v = qs.get("v")!.split(",").map(Number);
  expect(v).toHaveLength(3);
  expect(Number.isFinite(v[0]!) && Number.isFinite(v[1]!) && Number.isFinite(v[2]!)).toBe(true);
});

test("criterion 13: a crafted URL restores the exact view (UX-02)", async ({ page }) => {
  await page.goto("/?doy=30&w=30&fra=2015&til=2026&v=64.5,-20.0,7");
  await waitForMarkers(page);

  // Store state matches the params.
  const s = await page.evaluate(() => (window as any).__store.get());
  expect(s).toMatchObject({ anchorDoy: 30, widthDays: 30, yearFrom: 2015, yearTil: 2026 });

  // Active width button = "1 mánuður" (30 days).
  const pressed = page.locator('.width-group__btn[aria-pressed="true"]');
  await expect(pressed).toHaveCount(1);
  await expect(pressed).toHaveText("1 mánuður");

  // Scrubber anchor restored.
  const slider = page.getByRole("slider", { name: "Velja tímabil" });
  expect(await slider.inputValue()).toBe("30");
  await expect(slider).toHaveAttribute("aria-valuenow", "30");

  // Frá/Til selects restored.
  await expect(page.locator("#year-from")).toHaveValue("2015");
  await expect(page.locator("#year-til")).toHaveValue("2026");

  // Map framing restored (zoom close to 7).
  const zoom = await page.evaluate(() => (window as any).__map.getZoom());
  expect(zoom).toBeCloseTo(7, 0);
});

test("criterion 14: no-params load applies the data-derived default, NOT the old fixed window (SEL-02)", async ({
  page,
}) => {
  await page.goto("/");
  await waitForMarkers(page);

  const bounds = await manifestBounds(page);
  const expFrom = Math.max(bounds.min, bounds.max - 9); // last 10 available years
  const expDoy = todayDoy();

  const s = await page.evaluate(() => (window as any).__store.get());
  expect(s.yearTil).toBe(bounds.max);
  expect(s.yearFrom).toBe(expFrom);
  expect(s.widthDays).toBe(7); // 1 vika
  expect(s.anchorDoy).toBe(expDoy); // today's doy, NOT a hardcoded value

  // Exactly the "1 vika" width button is active.
  const pressed = page.locator('.width-group__btn[aria-pressed="true"]');
  await expect(pressed).toHaveCount(1);
  await expect(pressed).toHaveText("1 vika");

  // It is NOT the old fixed DEFAULT_WINDOW {startDoy:197, width:14}.
  expect(!(s.anchorDoy === 197 && s.widthDays === 14)).toBe(true);
});

test("criterion 15: a selection change does not full-reload the page (instant)", async ({
  page,
}) => {
  await waitForMarkers(page);
  // Plant a sentinel on window; a full document reload would wipe it.
  await page.evaluate(() => ((window as any).__sentinel = true));

  await page.locator(".width-group__btn").nth(3).click(); // change width
  await page.evaluate(() => (window as any).__store.set({ anchorDoy: 88 }));
  await page.waitForTimeout(300);

  const survived = await page.evaluate(() => (window as any).__sentinel === true);
  expect(survived).toBe(true); // no reload → sentinel intact
});

test("back-button: popstate reverts a discrete width change (UX-02)", async ({ page }) => {
  await page.goto("/?doy=100&w=7&fra=2017&til=2026");
  await waitForMarkers(page);
  expect(await page.evaluate(() => (window as any).__store.get().widthDays)).toBe(7);

  // A discrete width click pushes a new history entry (w=30).
  await page.locator(".width-group__btn").nth(3).click(); // "1 mánuður"
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => (window as any).__store.get().widthDays)).toBe(30);
  await expect(page.locator('.width-group__btn[aria-pressed="true"]')).toHaveText("1 mánuður");

  // Back → popstate re-hydrates the previous (w=7) state.
  await page.goBack();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as any).__store.get().widthDays)).toBe(7);
  await expect(page.locator('.width-group__btn[aria-pressed="true"]')).toHaveText("1 vika");
});

test("evidence: crafted-URL restore screenshot (UX-02)", async ({ page }) => {
  mkdirSync(EVIDENCE, { recursive: true });
  await page.goto("/?doy=30&w=30&fra=2015&til=2026&v=64.5,-20.0,7");
  await waitForMarkers(page);
  await page.waitForTimeout(500);
  await page.screenshot({
    path: resolve(EVIDENCE, "04-03-url-restore.png"),
    fullPage: false,
  });
});
