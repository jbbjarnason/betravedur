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

  // 05-03 (ranked "Bestu staðir" panel): IMPLEMENTED.

  /** The ranked-panel row selector: each row is a <li data-station> with a <button>. */
  const ROW = ".ranked-list__ol li[data-station]";

  /** Parse a ranked-row score string ("7,8") to a number (Icelandic comma → point). */
  const parseScore = (s: string): number => Number(s.trim().replace(",", "."));

  /** Read every ranked-row's { station, score } top-to-bottom. */
  const readRows = (page: Page): Promise<Array<{ station: string; score: string }>> =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>(".ranked-list__ol li[data-station]")).map(
        (li) => ({
          station: li.dataset.station ?? "",
          score: li.querySelector<HTMLElement>(".ranked-list__score")?.textContent ?? "",
        }),
      ),
    );

  test("criterion 5: a 'Bestu staðir' panel renders with an <ol> of rows [05-03]", async ({
    page,
  }) => {
    await waitForMarkers(page);
    const panel = page.locator('.ranked-list[aria-label="Bestu staðir"]');
    await expect(panel).toBeVisible();
    await expect(panel.locator(".ranked-list__title")).toHaveText("Bestu staðir");
    // An <ol> with at least one row (the default selection has scored stations).
    await expect(panel.locator("ol.ranked-list__ol")).toBeVisible();
    expect(await page.locator(ROW).count()).toBeGreaterThanOrEqual(1);
  });

  test("criterion 6: ranked rows are in descending score order (each row <= previous) [05-03]", async ({
    page,
  }) => {
    await waitForMarkers(page);
    const rows = await readRows(page);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const scores = rows.map((r) => parseScore(r.score));
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]!).toBeLessThanOrEqual(scores[i - 1]!);
    }
  });

  test("criterion 7 (+11): the ranked list updates on a selection change with ZERO /data/ requests [05-03]", async ({
    page,
  }) => {
    await waitForMarkers(page);
    const before = await readRows(page);
    expect(before.length).toBeGreaterThanOrEqual(1);

    let dataRequests = 0;
    page.on("request", (req) => {
      if (req.url().includes("/data/")) dataRequests++;
    });

    // Widen the baseline year range so scores shift → the list re-sorts/re-renders.
    await page.evaluate(() => {
      const store = (window as unknown as {
        __store: { get(): { yearFrom: number }; set(p: Record<string, unknown>): void };
      }).__store;
      const s = store.get();
      store.set({ yearFrom: Math.max(1949, s.yearFrom - 20) });
    });
    await page.waitForTimeout(600);

    const after = await readRows(page);
    // At least one row's score value differs after the recompute.
    const beforeMap = new Map(before.map((r) => [r.station, r.score]));
    const changed = after.some((r) => beforeMap.has(r.station) && beforeMap.get(r.station) !== r.score);
    expect(changed).toBe(true);
    // No /data/ fetch fired during the re-rank (pure client-side read of the store).
    expect(dataRequests).toBe(0);
  });

  test("criterion 8: an 'ófullnægjandi gögn' station is ABSENT from the ranked list [05-03]", async ({
    page,
  }) => {
    await waitForMarkers(page);
    // The exclusion INVARIANT asserted positively on every run: every muted (score:null /
    // ófullnægjandi gögn) marker must be absent from the ranked list, i.e. the row set is a
    // subset of the SCORED markers only. (The 2-station SW fixture rarely renders a naturally
    // muted station under the default selection, so we assert the invariant rather than depend
    // on one being present — see also criterion 12 which drives the all-muted empty state.)
    const mutedStations = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>("#marker-overlay [data-station]"))
        .filter((p) => !p.classList.contains("marker-pill--scored"))
        .map((p) => p.dataset.station ?? ""),
    );
    const rowStations = (await readRows(page)).map((r) => r.station);
    // No muted station appears as a row (holds vacuously if none are muted — still a real check).
    for (const st of mutedStations) {
      expect(rowStations).not.toContain(st);
    }
    // And, symmetrically, every listed row IS a scored marker (never a muted one).
    const scoredStations = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll<HTMLElement>("#marker-overlay [data-station].marker-pill--scored"),
      ).map((p) => p.dataset.station ?? ""),
    );
    for (const st of rowStations) {
      expect(scoredStations).toContain(st);
    }
  });

  test("criterion 9: an 'án úrkomu' station IS ranked + badged and its marker is colored (not muted) [05-02/05-03]", async ({
    page,
  }) => {
    await waitForMarkers(page);
    // A ranked row carrying the án-úrkomu badge.
    const badgedRow = page
      .locator(".ranked-list__ol li[data-station]")
      .filter({ has: page.locator(".ranked-list__badge", { hasText: "án úrkomu" }) })
      .first();
    test.skip(
      (await badgedRow.count()) === 0,
      "no án-úrkomu station scored in the current view",
    );
    await expect(badgedRow).toBeVisible();
    const station = await badgedRow.getAttribute("data-station");

    // Its marker pill is COLORED (has the scored class + a real --pill-score), not muted.
    const pill = page.locator(`#marker-overlay [data-station="${station}"]`);
    await expect(pill).toHaveClass(/marker-pill--scored/);
    const pillScore = await pill.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--pill-score").trim(),
    );
    expect(pillScore).not.toBe("");
    expect(pillScore.toLowerCase()).not.toContain("rgba(31, 41, 51, 0.1");
  });

  test("criterion 10 (+11): clicking a row flies the map (easeTo) + selects + writes 'st', with NO chart panel [05-03]", async ({
    page,
  }) => {
    await waitForMarkers(page);

    let dataRequests = 0;
    page.on("request", (req) => {
      if (req.url().includes("/data/")) dataRequests++;
    });

    const targetStation = (await readRows(page))[0]?.station;
    expect(targetStation).toBeTruthy();

    const centerBefore = await page.evaluate(
      () => (window as unknown as { __map: { getCenter(): { lng: number; lat: number } } }).__map.getCenter(),
    );

    // Click the first ranked row (the whole row button is the target).
    await page.locator(`.ranked-list__ol li[data-station="${targetStation}"] button`).click();
    await page.waitForTimeout(800); // let easeTo settle

    // (a) The store's stationId is the clicked station.
    const storeStation = await page.evaluate(
      () => (window as unknown as { __store: { get(): { stationId: number | null } } }).__store.get().stationId,
    );
    expect(String(storeStation)).toBe(targetStation);

    // (b) The URL 'st' param equals it.
    const stParam = await page.evaluate(() => new URLSearchParams(location.search).get("st"));
    expect(stParam).toBe(targetStation);

    // (c) The map center moved (easeTo toward the station).
    const centerAfter = await page.evaluate(
      () => (window as unknown as { __map: { getCenter(): { lng: number; lat: number } } }).__map.getCenter(),
    );
    const moved =
      Math.abs(centerAfter.lng - centerBefore.lng) > 1e-4 ||
      Math.abs(centerAfter.lat - centerBefore.lat) > 1e-4;
    expect(moved).toBe(true);

    // (d) NO chart panel opened (Phase-6 seam kept clean). No panel selector exists yet.
    expect(await page.locator(".station-chart, .chart-panel, [data-chart-panel]").count()).toBe(0);

    // (e) No /data/ fetch fired for the select/fly-to.
    expect(dataRequests).toBe(0);
  });

  test("criterion 12: empty state — a fully-unscorable selection shows 'Engin einkunn', no throw [05-03]", async ({
    page,
  }) => {
    await waitForMarkers(page);
    // A single-year baseline (yearFrom === yearTil) gives every station at most 1 qualifying year
    // (< the N≥3 sufficiency gate), so no station is scorable → score:null everywhere → empty list.
    await page.evaluate(() => {
      const store = (window as unknown as {
        __store: { get(): { yearTil: number }; set(p: Record<string, unknown>): void };
      }).__store;
      const til = store.get().yearTil;
      store.set({ yearFrom: til, yearTil: til });
    });
    await page.waitForTimeout(600);

    // The panel still renders, showing the empty heading + body (not an empty <ol>, no throw).
    const panel = page.locator('.ranked-list[aria-label="Bestu staðir"]');
    await expect(panel).toBeVisible();
    await expect(panel.locator(".ranked-list__empty-heading")).toHaveText("Engin einkunn");
    await expect(panel.locator(".ranked-list__empty")).toBeVisible();
    expect(await page.locator(ROW).count()).toBe(0);
  });

  test("criterion 13: collapse toggle flips aria-expanded, hides/shows the list, keeps the map band visible [05-03]", async ({
    page,
  }) => {
    await waitForMarkers(page);
    const panel = page.locator('.ranked-list[aria-label="Bestu staðir"]');
    const toggle = panel.locator(".ranked-list__collapse");
    const body = panel.locator(".ranked-list__body");

    // Expanded by default.
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(body).toBeVisible();
    const expandedWidth = (await panel.boundingBox())!.width;

    // Collapse → aria-expanded=false, body hidden, panel narrows to a slim tab.
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(body).toBeHidden();
    const collapsedWidth = (await panel.boundingBox())!.width;
    expect(collapsedWidth).toBeLessThan(expandedWidth);

    // Re-expand → back to visible.
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(body).toBeVisible();
  });

  test("criterion 14: every ranked-ROW score matches the Icelandic one-decimal comma format /^\\d{1,2},\\d$/ [05-03]", async ({
    page,
  }) => {
    await waitForMarkers(page);
    const rows = await readRows(page);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const r of rows) {
      expect(r.score.trim()).toMatch(/^\d{1,2},\d$/);
    }
  });

  test("WR-02: keyboard focus on a ranked row SURVIVES a recompute (reconcile-in-place, no rebuild) [05-03]", async ({
    page,
  }) => {
    // The ranked list reconciles rows by data-station on refresh() instead of replaceChildren(),
    // so a focused row's <button> keeps its node identity across a recompute — focus (and scroll)
    // are not dropped to <body>. Regression guard for WR-02.
    await waitForMarkers(page);
    const rows = await readRows(page);
    expect(rows.length).toBeGreaterThanOrEqual(2);

    // Focus a specific row's button by its immutable station id (survives reordering).
    const targetStation = rows[rows.length - 1]!.station;
    const targetBtn = page.locator(`${ROW}[data-station="${targetStation}"] button`);
    await targetBtn.focus();
    await expect(targetBtn).toBeFocused();

    // Trigger a recompute that keeps this station scorable (a small anchor nudge). The row is
    // updated in place, not rebuilt.
    await page.evaluate(() => {
      const store = (window as unknown as {
        __store: { get(): { anchorDoy: number }; set(p: Record<string, unknown>): void };
      }).__store;
      const doy = store.get().anchorDoy;
      store.set({ anchorDoy: doy === 200 ? 201 : 200 });
    });
    await page.waitForTimeout(400); // past the 120ms recompute debounce + render

    // The SAME station's button is still the active element — focus was preserved across refresh.
    const stillScorable = await page.locator(`${ROW}[data-station="${targetStation}"]`).count();
    if (stillScorable > 0) {
      const focusedStation = await page.evaluate(
        () => (document.activeElement as HTMLElement | null)?.closest("li[data-station]")
          ?.getAttribute("data-station") ?? null,
      );
      expect(focusedStation).toBe(targetStation);
    }
  });

  test("WR-3 (a11y): a scored pill's aria-label includes the einkunn (score not color-only for screen readers) [05-02]", async ({
    page,
  }) => {
    // color-not-sole-channel for AT users: a scored marker pill announces its score in the
    // accessible name (`… einkunn 8,6`), even though the badge itself is aria-hidden.
    await waitForMarkers(page);
    const labels = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>("#marker-overlay [data-station]"))
        .filter((pill) => pill.classList.contains("marker-pill--scored"))
        .map((pill) => pill.getAttribute("aria-label") ?? ""),
    );
    expect(labels.length).toBeGreaterThanOrEqual(1);
    for (const label of labels) {
      // Scored pills carry both the coverage (meðaltal N ára) and the einkunn numeral.
      expect(label).toMatch(/meðaltal \d+ ára/);
      expect(label).toMatch(/einkunn \d{1,2},\d/);
    }
  });

  test("evidence: capture the ranked list + colored map (desktop + narrow) for self-inspection [05-03]", async ({
    page,
  }) => {
    mkdirSync(EVIDENCE, { recursive: true });
    await waitForMarkers(page);

    // Desktop: frame Iceland so the ranked panel (right) + legend (bottom-left) + colored markers
    // all coexist without occluding the central station band.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.evaluate(() => {
      (window as unknown as { __map: { jumpTo(o: unknown): void } }).__map.jumpTo({
        center: [-18.9, 64.9],
        zoom: 5.6,
      });
    });
    await page.waitForTimeout(600);
    await page.screenshot({
      path: resolve(EVIDENCE, "05-03-ranked-list-desktop.png"),
      fullPage: false,
    });

    // Narrow (<640px): the panel degrades to a functional right-docked list (Phase-7 does the
    // polished sheet); verify total chrome still leaves the map band visible.
    await page.setViewportSize({ width: 600, height: 900 });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: resolve(EVIDENCE, "05-03-ranked-list-narrow.png"),
      fullPage: false,
    });
  });
});
