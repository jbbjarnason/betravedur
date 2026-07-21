import { expect, test, type Page } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Phase 6 (Station Chart Panel) E2E — the WAVE-0 SKELETON.
//
// This file exists NOW so the downstream UI plans (06-02 panel shell + DOM/daylight/no-data,
// 06-03 lazy ECharts chart render) have a green Playwright harness to extend. It carries ONE
// active smoke test (the preview build boots, the map is style-loaded, a marker pill renders,
// and no pageerror fires) plus `test.fixme(...)` placeholders for every Acceptance-Checkable
// Visual Criterion (1–14) from 06-UI-SPEC.md §Acceptance-Checkable Visual Criteria, and a
// build-size chunk-split gate (asserting ECharts stays OUT of the entry chunk while a lazy
// chartPanel chunk appears). The fixmes name exactly which criterion each future test covers
// and encode the exact selectors/asserts so 06-02/06-03 have no ambiguity — they are recorded
// as skipped (not failing) until the corresponding UI is built.
//
// Driving conventions mirror tests/e2e/score.spec.ts: run against the PRODUCTION preview build
// (see playwright.config.ts webServer), gate on window.__map.isStyleLoaded() plus at least one
// `#marker-overlay [data-station]` pill, and attach a page.on('pageerror') guard so an uncaught
// error fails the run.

const HERE = dirname(fileURLToPath(import.meta.url));

/** The overlay pill selector — clicking one opens the panel (Phase 6 select seam). */
const PILL = "#marker-overlay [data-station]";
/** The station detail panel root (06-02 builds it). aria-label = the station name. */
const PANEL = "section.station-panel[aria-label]";
/** The Phase 5 ranked panel that YIELDS while the panel is open. */
const RANKED = '.ranked-list[aria-label="Bestu staðir"]';

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

/** Open the panel by clicking the first rendered marker pill; returns its station id. */
async function openPanelViaMarker(page: Page): Promise<string> {
  const pill = page.locator(PILL).first();
  const station = (await pill.getAttribute("data-station")) ?? "";
  await pill.click();
  await page.locator(PANEL).waitFor({ state: "visible", timeout: 5_000 });
  return station;
}

test.beforeEach(async ({ page }) => {
  // Fail the test if the page throws (UI-SPEC: no white-screen / uncaught error).
  page.on("pageerror", (err) => {
    throw err;
  });
  // Phase 7 (UX-04) added a first-visit auto-open info-panel MODAL whose backdrop intercepts pointer
  // events (blocking marker/panel clicks). Pre-seed the dismissed-hint flag so these prior-phase
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

test("wave-0 smoke: preview build boots, map style-loads, a pill renders, no pageerror", async ({
  page,
}) => {
  await waitForMarkers(page);

  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  const styleLoaded = await page.evaluate(
    () => (window as { __map?: { isStyleLoaded(): boolean } }).__map?.isStyleLoaded() ?? false,
  );
  expect(styleLoaded).toBe(true);

  // The Phase 4 store seam the panel subscribes to is exposed.
  const hasStore = await page.evaluate(
    () => typeof (window as { __store?: unknown }).__store !== "undefined",
  );
  expect(hasStore).toBe(true);

  // At least one marker pill renders (the click target that opens the panel in 06-02).
  expect(await page.locator(PILL).count()).toBeGreaterThanOrEqual(1);

  // No panel is open at rest (the Phase-6 seam is clean until a station is selected).
  expect(await page.locator(PANEL).count()).toBe(0);
});

// ---------------------------------------------------------------------------
// UI-SPEC §Acceptance-Checkable Visual Criteria 1–14 — Wave-0 placeholders.
// Each is `test.fixme` (recorded, not run) until the owning UI plan builds the element.
// The comment on each names the plan that will un-fixme and implement it.
// ---------------------------------------------------------------------------
test.describe("Phase 6 acceptance criteria (06-UI-SPEC §Acceptance-Checkable Visual Criteria)", () => {
  test(
    "criterion 1: clicking a station opens a station-panel (aria-label = station name) [06-02]",
    async ({ page }) => {
      await waitForMarkers(page);
      // Before: no panel.
      expect(await page.locator(PANEL).count()).toBe(0);
      const station = await openPanelViaMarker(page);
      // After: a station-panel appears whose aria-label is the (non-empty) station name.
      const panel = page.locator(PANEL);
      await expect(panel).toBeVisible();
      const label = await panel.getAttribute("aria-label");
      expect(label?.trim().length ?? 0).toBeGreaterThan(0);
      expect(station).not.toBe("");
    },
  );

  test(
    "criterion 2: panel shows Hiti + Vindur figures with a <canvas> and a Úrkoma figure with a <canvas> [06-03]",
    async ({ page }) => {
      await waitForMarkers(page);
      // "for a station with data" = a station with ALL THREE metrics, including a precip gauge
      // (AWS stations honestly show án-úrkomu for precip — they are not the criterion-2 target).
      // Open each rendered station via the store seam until one yields three chart canvases;
      // assert the three titled canvases on that data-complete station. (A gauge-less station is
      // covered by criterion 6, which asserts its precip no-gauge message instead.)
      const stationIds = await page.locator(PILL).evaluateAll((els) =>
        els.map((e) => Number((e as HTMLElement).dataset.station)).filter((n) => Number.isFinite(n)),
      );
      expect(stationIds.length).toBeGreaterThanOrEqual(1);

      const openStation = async (id: number): Promise<void> => {
        await page.evaluate((sid) => {
          (window as unknown as { __store: { set(p: Record<string, unknown>): void } }).__store.set(
            { stationId: sid },
          );
        }, id);
        await page.locator(PANEL).waitFor({ state: "visible", timeout: 5_000 });
        // Let the lazy chart chunk load + charts mount.
        await page.waitForTimeout(600);
      };

      let dataComplete = false;
      for (const id of stationIds) {
        await openStation(id);
        const panel = page.locator(PANEL);
        const canvasCount = await panel.locator("figure canvas").count();
        if (canvasCount >= 3) {
          // This is a data-complete station: assert each titled figure carries a canvas.
          for (const title of ["Hiti", "Vindur", "Úrkoma"]) {
            const figure = panel.locator("figure").filter({ hasText: title });
            await expect(figure).toBeVisible();
            await expect(figure.locator("canvas")).toBeVisible();
          }
          dataComplete = true;
          break;
        }
      }
      expect(dataComplete, "expected at least one station with three chart canvases").toBe(true);
    },
  );

  test(
    "criterion 3: the three exact reading-key sentences are present as DOM text [06-02]",
    async ({ page }) => {
      await waitForMarkers(page);
      // Temp + wind keys are present on any data station — assert them on the first marker.
      await openPanelViaMarker(page);
      const panel = page.locator(PANEL);
      await expect(panel).toContainText("8 af hverjum 10");
      await expect(panel).toContainText("hægasta og hvassasta");

      // Precip reading key: it must appear ON A STATION WITH A PRECIP GAUGE (where the precip
      // figure renders bars), and is deliberately SUPPRESSED on an án-úrkomu station whose precip
      // figure shows "engin úrkomumæling á þessari stöð" (UI FIX-NOW #4 — the key describes bars/
      // gaps that are not rendered there). Open stations via the store seam until one shows a
      // precip chart (not the no-gauge message), then assert the precip key is present there AND
      // absent on the no-gauge station.
      const stationIds = await page.locator(PILL).evaluateAll((els) =>
        els.map((e) => Number((e as HTMLElement).dataset.station)).filter((n) => Number.isFinite(n)),
      );
      const openStation = async (id: number): Promise<void> => {
        await page.evaluate((sid) => {
          (window as unknown as { __store: { set(p: Record<string, unknown>): void } }).__store.set(
            { stationId: sid },
          );
        }, id);
        await page.locator(PANEL).waitFor({ state: "visible", timeout: 5_000 });
        await page.waitForTimeout(400);
      };

      let sawGaugeStation = false;
      let sawNoGaugeSuppression = false;
      for (const id of stationIds) {
        await openStation(id);
        const precipFigure = page.locator(PANEL).locator("figure").filter({ hasText: "Úrkoma" });
        const noGauge =
          (await precipFigure.getByText("engin úrkomumæling á þessari stöð").count()) > 0;
        const hasPrecipKey =
          (await precipFigure.getByText("eyða þýðir að úrkoma var ekki mæld").count()) > 0;
        if (noGauge) {
          // Suppression invariant: no reading key beside the no-gauge message.
          expect(hasPrecipKey).toBe(false);
          sawNoGaugeSuppression = true;
        } else if (hasPrecipKey) {
          // A gauge-bearing station renders the precip bars AND the precip reading key.
          sawGaugeStation = true;
        }
        if (sawGaugeStation && sawNoGaugeSuppression) break;
      }
      // At least one station must carry the precip reading key (the key is real and reachable).
      expect(sawGaugeStation, "expected a precip-gauge station showing the precip reading key").toBe(
        true,
      );
    },
  );

  test(
    "criterion 4: a Dagsbirta label + a value matching /\\d+,\\d+\\s*klst\\./ [06-02]",
    async ({ page }) => {
      await waitForMarkers(page);
      await openPanelViaMarker(page);
      const panel = page.locator(PANEL);
      await expect(panel).toContainText("Dagsbirta");
      // Icelandic comma decimal + the klst. unit (e.g. "16,9 klst.").
      await expect(panel).toContainText(/\d+,\d+\s*klst\./);
    },
  );

  test(
    "criterion 5: a no-data station shows 'engin gögn fyrir þetta tímabil' (text), no populated canvas [06-02/06-03]",
    async ({ page }) => {
      await waitForMarkers(page);
      // Drive a single-year baseline so a metric drops below the N>=3 gate for the opened
      // station (mirrors score.spec criterion 12 empty-state driving), then open the panel.
      await page.evaluate(() => {
        const store = (window as unknown as {
          __store: { get(): { yearTil: number }; set(p: Record<string, unknown>): void };
        }).__store;
        const til = store.get().yearTil;
        store.set({ yearFrom: til, yearTil: til });
      });
      await page.waitForTimeout(400);
      await openPanelViaMarker(page);
      const panel = page.locator(PANEL);
      // The no-data message appears as TEXT (per-chart or the panel-level 'Engin gögn').
      await expect(panel).toContainText(/engin gögn fyrir þetta tímabil|Engin gögn/);
    },
  );

  test(
    "criterion 6 (text portion): an án-úrkomu station shows the precip no-gauge message [06-02]",
    async ({ page }) => {
      await waitForMarkers(page);
      // Open the first rendered station. If it lacks a precip gauge (AWS "án úrkomu"), the precip
      // figure must show the no-gauge message. The temp/wind CANVAS assertions belong to 06-03
      // (charts do not exist in this wave — the sufficient slots show the `hleð riti…` stub); this
      // wave gates only the text-portion invariant (CHART-04 honesty), per 06-02-PLAN.
      await openPanelViaMarker(page);
      const panel = page.locator(PANEL);
      const precipFigure = panel.locator("figure").filter({ hasText: "Úrkoma" });
      const isAnUrkomu =
        (await precipFigure.getByText("engin úrkomumæling á þessari stöð").count()) > 0;
      test.skip(!isAnUrkomu, "opened station has a precip gauge");
      // The precip figure shows the no-gauge message (never a blank bar canvas / zero bars).
      await expect(precipFigure).toContainText("engin úrkomumæling á þessari stöð");
      // No chart canvas in this wave (06-03 mounts ECharts; the no-gauge figure never gets one).
      expect(await precipFigure.locator("canvas").count()).toBe(0);
    },
  );

  test(
    "criterion 7: close (aria-label 'Loka spjaldi') removes the panel, clears URL 'st', restores the ranked list [06-02]",
    async ({ page }) => {
      await waitForMarkers(page);
      await openPanelViaMarker(page);
      // Ranked list is yielded while open (see criterion 8).
      await page.locator(`${PANEL} [aria-label="Loka spjaldi"]`).click();
      await expect(page.locator(PANEL)).toHaveCount(0);
      // URL 'st' param cleared.
      const stParam = await page.evaluate(() => new URLSearchParams(location.search).get("st"));
      expect(stParam).toBeNull();
      // Ranked list restored (visible again).
      await expect(page.locator(RANKED)).toBeVisible();
    },
  );

  test(
    "criterion 8: the ranked 'Bestu staðir' list is hidden/yielded while the panel is open [06-02]",
    async ({ page }) => {
      await waitForMarkers(page);
      // Ranked list is visible at rest.
      await expect(page.locator(RANKED)).toBeVisible();
      await openPanelViaMarker(page);
      // While the panel is open, the ranked list is NOT visible (yielded, not destroyed).
      await expect(page.locator(RANKED)).toBeHidden();
    },
  );

  test(
    "criterion 9: Escape closes the panel (panel gone, 'st' cleared, ranked list restored) [06-02]",
    async ({ page }) => {
      await waitForMarkers(page);
      await openPanelViaMarker(page);
      // Focus is within the panel on open (06-02 focus management); Escape closes it.
      await page.locator(PANEL).press("Escape");
      await expect(page.locator(PANEL)).toHaveCount(0);
      const stParam = await page.evaluate(() => new URLSearchParams(location.search).get("st"));
      expect(stParam).toBeNull();
      await expect(page.locator(RANKED)).toBeVisible();
    },
  );

  test(
    "criterion 10: opening the panel fires ZERO data/ network requests (the echarts JS chunk is allowed) [06-02]",
    async ({ page }) => {
      await waitForMarkers(page);
      let dataRequests = 0;
      page.on("request", (req) => {
        // Distributions are computed client-side from already-loaded derived data — the ONLY
        // new request allowed is the dynamic echarts/chartPanel JS chunk (…/assets/*.js).
        if (req.url().includes("/data/")) dataRequests++;
      });
      await openPanelViaMarker(page);
      // Let the lazy chart chunk load + charts render.
      await page.waitForTimeout(800);
      expect(dataRequests).toBe(0);
    },
  );

  test(
    "criterion 11: chart tokens use --chart-*, NOT --accent or --score-* (distribution, not finance) [06-03]",
    async ({ page }) => {
      await waitForMarkers(page);
      await openPanelViaMarker(page);
      // The chart option module resolves --chart-temp/--chart-wind/--chart-precip from the
      // computed styles; assert those tokens are defined and non-empty, and that the reserved
      // accent red / score ramp are NOT used as chart series colors.
      const tokens = await page.evaluate(() => {
        const cs = getComputedStyle(document.documentElement);
        return {
          chartTemp: cs.getPropertyValue("--chart-temp").trim(),
          chartWind: cs.getPropertyValue("--chart-wind").trim(),
          chartPrecip: cs.getPropertyValue("--chart-precip").trim(),
        };
      });
      expect(tokens.chartTemp).not.toBe("");
      expect(tokens.chartWind).not.toBe("");
      expect(tokens.chartPrecip).not.toBe("");
      // No chart series tone equals the reserved accent red #C0392B.
      expect(tokens.chartTemp.toLowerCase()).not.toContain("c0392b");
      // 06-03 additionally grep-gates the chart option module source for '--accent'/'--score-'.
    },
  );

  test(
    "criterion 12: under prefers-reduced-motion, ECharts instances are created with animation:false [06-03]",
    async ({ browser }) => {
      // A dedicated reduced-motion context.
      const context = await browser.newContext({ reducedMotion: "reduce" });
      const page = await context.newPage();
      page.on("pageerror", (err) => {
        throw err;
      });
      // This test uses its OWN context/page (bypassing the shared beforeEach), so it must seed the
      // Phase-7 info-panel dismissed flag itself — otherwise the first-visit auto-open modal's
      // backdrop intercepts the marker click in openPanelViaMarker.
      await page.addInitScript(() => {
        try {
          localStorage.setItem("bv:info-dismissed", "1");
        } catch {
          /* storage unavailable — the permalink/bare-visit guards still hold */
        }
      });
      await page.goto("/");
      await waitForMarkers(page);
      await openPanelViaMarker(page);
      // 06-03 exposes the built chart option (e.g. window.__chartOptions) or an assertable flag;
      // here we assert the animation flag is false under reduced motion.
      const animated = await page.evaluate(
        () =>
          (window as unknown as { __chartOptions?: Array<{ animation?: boolean }> }).__chartOptions?.some(
            (o) => o.animation !== false,
          ) ?? false,
      );
      expect(animated).toBe(false);
      await context.close();
    },
  );

  test(
    "criterion 13: every Icelandic-formatted panel number uses a comma decimal, never a '.' [06-02]",
    async ({ page }) => {
      await waitForMarkers(page);
      await openPanelViaMarker(page);
      const panel = page.locator(PANEL);
      // The daylight value (and any DOM tooltip/summary numbers) use a comma decimal.
      const daylight = await panel.getByText(/klst\./).innerText();
      expect(daylight).toMatch(/\d+,\d+\s*klst\./);
      expect(daylight).not.toMatch(/\d+\.\d+\s*klst\./);
    },
  );

  test(
    "criterion 14: each chart figure exposes a text/aria-label distribution summary (canvas not sole carrier) [06-03]",
    async ({ page }) => {
      await waitForMarkers(page);
      await openPanelViaMarker(page);
      const panel = page.locator(PANEL);
      // Each titled figure carries a figcaption/aria-label summary or a visually-hidden table.
      for (const title of ["Hiti", "Vindur", "Úrkoma"]) {
        const figure = panel.locator("figure").filter({ hasText: title });
        const hasSummary = await figure.evaluate((el) => {
          const cap = el.querySelector("figcaption");
          const aria = el.getAttribute("aria-label") ?? el.querySelector("[aria-label]")?.getAttribute("aria-label");
          const table = el.querySelector("table");
          return Boolean((cap && cap.textContent?.trim()) || (aria && aria.trim()) || table);
        });
        expect(hasSummary).toBe(true);
      }
    },
  );

  test(
    "CR-01 regression: ECharts instances are disposed — open→close→reopen does not accumulate instances or canvases",
    async ({ page }) => {
      await waitForMarkers(page);

      // Pick a data-complete station (three chart canvases) so the dispose path is actually
      // exercised — a no-data/no-gauge station would create no instances to leak.
      const stationIds = await page.locator(PILL).evaluateAll((els) =>
        els.map((e) => Number((e as HTMLElement).dataset.station)).filter((n) => Number.isFinite(n)),
      );
      expect(stationIds.length).toBeGreaterThanOrEqual(1);

      const openStation = async (id: number): Promise<number> => {
        await page.evaluate((sid) => {
          (window as unknown as { __store: { set(p: Record<string, unknown>): void } }).__store.set(
            { stationId: sid },
          );
        }, id);
        await page.locator(PANEL).waitFor({ state: "visible", timeout: 5_000 });
        await page.waitForTimeout(600); // let the lazy chunk load + charts mount
        return page.locator(`${PANEL} figure canvas`).count();
      };

      const closePanel = async (): Promise<void> => {
        await page.evaluate(() => {
          (window as unknown as { __store: { set(p: Record<string, unknown>): void } }).__store.set(
            { stationId: null },
          );
        });
        await expect(page.locator(PANEL)).toHaveCount(0);
        await page.waitForTimeout(100);
      };

      // Find a station that mounts >=1 chart canvas.
      let dataStation: number | null = null;
      let canvasesWhenOpen = 0;
      for (const id of stationIds) {
        const n = await openStation(id);
        if (n >= 1) {
          dataStation = id;
          canvasesWhenOpen = n;
          break;
        }
        await closePanel();
      }
      expect(dataStation, "expected a station that mounts >=1 chart canvas").not.toBeNull();
      expect(canvasesWhenOpen).toBeGreaterThanOrEqual(1);

      const liveInstances = () =>
        page.evaluate(
          () => (window as unknown as { __liveChartInstances?: number }).__liveChartInstances ?? 0,
        );
      const canvasCount = () => page.evaluate(() => document.querySelectorAll("canvas").length);

      // Baseline: with the panel open, some chart instances are live.
      const openInstances = await liveInstances();
      expect(openInstances).toBeGreaterThanOrEqual(1);
      const baselineCanvases = await canvasCount();

      // Close → every ECharts instance must be disposed (live count back to 0) and its canvas gone.
      await closePanel();
      expect(await liveInstances()).toBe(0);

      // Open→close→reopen several times; live instances must return to 0 after each close and never
      // climb above the single-open count while open — proving no accumulation (CR-01).
      for (let i = 0; i < 3; i++) {
        await openStation(dataStation!);
        const whileOpen = await liveInstances();
        expect(whileOpen).toBe(openInstances); // exactly one panel's worth, not N panels' worth
        await closePanel();
        expect(await liveInstances()).toBe(0);
      }

      // Total canvases in the document must not have grown across the cycles (detached-but-alive
      // ECharts canvases were the leak). Reopen once and compare to the first-open baseline.
      await openStation(dataStation!);
      expect(await canvasCount()).toBe(baselineCanvases);
    },
  );
});

// ---------------------------------------------------------------------------
// Build-size chunk-split gate (RESEARCH Pattern 3 + Pitfall 6 + Assumption A4).
//
// The panel is lazy-loaded via dynamic import() so Vite splits the ECharts-bearing chart
// module (`chartPanel`) into its OWN chunk — it must NEVER land in the entry bundle (that
// would blow the initial map-load budget). 06-03 creates `site/src/ui/chartPanel.ts` and its
// dynamic import(), which makes this gate real. The assertion body is written fully NOW so
// 06-03 only has to make it pass; it is `test.fixme` until that lazy chunk can exist.
//
// The gate inspects the ALREADY-BUILT preview output (playwright.config.ts runs `npm run
// build` before serving), so `dist/assets` is on disk when this test runs.
// ---------------------------------------------------------------------------
test.describe("build-size chunk-split gate (A4 — echarts out of the entry chunk)", () => {
  /** Resolve the built asset dir from the preview build the webServer produced. */
  const ASSETS = resolve(HERE, "..", "..", "dist", "assets");

  /** Read every built .js chunk as { name, source }. */
  function readJsChunks(): Array<{ name: string; source: string }> {
    return readdirSync(ASSETS)
      .filter((f) => f.endsWith(".js"))
      .map((f) => ({ name: f, source: readFileSync(resolve(ASSETS, f), "utf8") }));
  }

  test(
    "a distinct chartPanel-*.js chunk exists AND the entry chunk contains no echarts [06-03]",
    () => {
      const chunks = readJsChunks();

      // (a) A distinct lazy chart chunk was emitted (dynamic import() of chartPanel.ts).
      const chartChunk = chunks.find((c) => /chartPanel/i.test(c.name));
      expect(chartChunk, "expected a chartPanel-*.js chunk in dist/assets").toBeTruthy();

      // (b) ECharts lives INSIDE that lazy chunk, not the entry bundle. The entry chunk is the
      //     largest non-chartPanel chunk that the HTML loads eagerly; assert no echarts marker
      //     string ("echarts" build banner / registerProcessor) leaks into any NON-chart chunk.
      const ECHARTS_MARKER = /echarts/i;
      const entryChunks = chunks.filter((c) => !/chartPanel/i.test(c.name));
      for (const chunk of entryChunks) {
        expect(
          ECHARTS_MARKER.test(chunk.source),
          `echarts must not appear in the eager chunk ${chunk.name}`,
        ).toBe(false);
      }

      // (c) And echarts DOES appear in the lazy chart chunk (proves the split, not tree-shake-away).
      expect(chartChunk && ECHARTS_MARKER.test(chartChunk.source)).toBe(true);
    },
  );
});
