/**
 * Score legend + transparency explainer (SCORE-03) — the ONE place all score meaning lives
 * (the transparency differentiator: WeatherSpark's opaque Tourism Score is the anti-pattern
 * to beat). Static chrome: it renders once, subscribes to NO store, and never re-renders on
 * selection change (the ramp doesn't move; only the "án úrkomu" prevalence varies, which the
 * legend doesn't display).
 *
 * Anatomy (05-UI-SPEC §Legend Anatomy): a title `Einkunn`, a continuous BuGn color-scale bar
 * (the --score-0..10 tokens as a CSS gradient), `0 2 4 6 8 10` tick labels, `verra` ↔ `betra`
 * endpoint captions, and a native <details>/<summary> explainer carrying the EXACT
 * Copywriting-Contract weight prose (úrkoma 40% / vindur 30% / hiti 30% + the án-úrkomu
 * renormalization note).
 *
 * T-05-03: ALL copy is set via textContent — hard-coded Icelandic literals, never a reflected
 * data value, never innerHTML.
 */

/** The color-scale tick labels beneath the ramp (aligned to their stops). */
const TICKS = ["0", "2", "4", "6", "8", "10"] as const;

/** Exact Copywriting-Contract prose (05-UI-SPEC §Copywriting Contract) — verbatim. */
const EXPLAINER_BODY =
  "Einkunnin sameinar þrjá þætti: úrkoma 40%, vindur 30% og hiti 30%. " +
  "Hærri einkunn þýðir betra veður fyrir tímabilið.";
const EXPLAINER_MISSING_RAIN =
  "Þegar úrkomumæling vantar er einkunnin reiknuð úr vindi og hita og vægið endurdreift " +
  "á þá þætti — stöðin er merkt „án úrkomu“ en ekki refsað fyrir að vanta gögn.";

/**
 * Build the legend DOM (pure — no side effects, testable without the map). Returns the
 * `<section>` element; `mountLegend` appends it. Kept separate so a future unit test can
 * assert structure without touching document.body.
 */
export function buildLegend(): HTMLElement {
  const section = document.createElement("section");
  section.className = "score-legend";
  // Labelled region so assistive tech announces it as the score key.
  section.setAttribute("aria-label", "Skýring á einkunn");

  // ── Mobile chip (< 640px): a compact "Einkunn" toggle over the permanently-open legend ──────
  // On desktop the legend is a standing bottom-left panel; on mobile it collapses to a chip that
  // toggles the legend body as a popover so it doesn't fight the sheet (UI-SPEC Responsive table).
  // A native <button> whose accessible name IS "Einkunn" (getByRole button name resolves it,
  // criterion 5). CSS hides the chip on desktop and the body on mobile-until-open. ≥44px (score.css).
  const bodyId = "score-legend-body";
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "score-legend__chip";
  chip.textContent = "Einkunn"; // accessible name = "Einkunn"
  chip.setAttribute("aria-controls", bodyId);
  chip.setAttribute("aria-expanded", "false");
  section.appendChild(chip);

  // Title.
  const title = document.createElement("h2");
  title.className = "score-legend__title";
  title.textContent = "Einkunn";

  // Continuous BuGn color-scale bar (gradient defined in score.css from --score-0..10).
  const ramp = document.createElement("div");
  ramp.className = "score-legend__ramp";
  ramp.setAttribute("aria-hidden", "true"); // the captions/ticks carry the meaning textually

  // Tick labels 0 2 4 6 8 10.
  const ticks = document.createElement("div");
  ticks.className = "score-legend__ticks";
  for (const t of TICKS) {
    const span = document.createElement("span");
    span.textContent = t;
    ticks.appendChild(span);
  }

  // Endpoint captions verra ↔ betra (plain-Icelandic direction cue, monochrome-legible).
  const captions = document.createElement("div");
  captions.className = "score-legend__captions";
  const low = document.createElement("span");
  low.textContent = "verra";
  const high = document.createElement("span");
  high.textContent = "betra";
  captions.append(low, high);

  const rule = document.createElement("hr");
  rule.className = "score-legend__rule";

  // Native <details> explainer — built-in expand/collapse + keyboard + aria-expanded.
  const details = document.createElement("details");
  details.className = "score-explainer";

  const summary = document.createElement("summary");
  summary.textContent = "hvernig er einkunnin reiknuð?";

  const body = document.createElement("div");
  body.className = "score-explainer__body";
  const p1 = document.createElement("p");
  p1.textContent = EXPLAINER_BODY;
  const p2 = document.createElement("p");
  p2.textContent = EXPLAINER_MISSING_RAIN;
  body.append(p1, p2);

  details.append(summary, body);

  // The legend content lives in a body container so the mobile chip can toggle it as a popover
  // (the chip's aria-controls target). On desktop CSS shows it as the standing panel; on mobile it
  // is hidden until the chip is tapped. The `title` stays inside so the desktop panel keeps its
  // "Einkunn" heading; on mobile the chip carries the label and the heading is CSS-hidden.
  const legendBody = document.createElement("div");
  legendBody.className = "score-legend__body";
  legendBody.id = bodyId;
  legendBody.append(title, ramp, ticks, captions, rule, details);

  section.append(legendBody);
  return section;
}

/**
 * Mount the legend into the given parent (typically document.body, alongside the header +
 * control bar). Idempotent-ish: it appends a fresh legend; callers mount it exactly once at
 * boot (it has no data dependency to re-drive).
 */
export function mountLegend(parent: HTMLElement): void {
  const section = buildLegend();
  // Wire the mobile chip toggle: tapping "Einkunn" opens/closes the legend popover (< 640px). A
  // `.score-legend--chip-open` class on the section drives the CSS that reveals the body over the
  // map. On desktop the chip is `display:none`, so this state is inert.
  const chip = section.querySelector<HTMLButtonElement>(".score-legend__chip");
  chip?.addEventListener("click", () => {
    const open = chip.getAttribute("aria-expanded") !== "true";
    chip.setAttribute("aria-expanded", open ? "true" : "false");
    section.classList.toggle("score-legend--chip-open", open);
  });
  parent.appendChild(section);
}
