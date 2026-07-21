/**
 * Site header: wordmark + slogan. Icelandic-only copy, verbatim from the UI-SPEC
 * Copywriting Contract (UX-01). No invented copy.
 */

const WORDMARK = "Betra Veður";
const SLOGAN = "Leitin að betra veðri";

/** Render the header into the given mount element. */
export function renderHeader(mount: HTMLElement): void {
  mount.classList.add("app-header");
  mount.setAttribute("role", "banner");

  // The wordmark is the page's single <h1> landmark (a11y: exactly one top-level heading).
  // Visual style comes entirely from the class-scoped `header.app-header .wordmark` rule; the
  // UA h1 margin is reset in tokens.css so promoting <span>→<h1> is visually identical.
  const wordmark = document.createElement("h1");
  wordmark.className = "wordmark";
  wordmark.textContent = WORDMARK;

  const slogan = document.createElement("span");
  slogan.className = "slogan";
  slogan.textContent = SLOGAN;

  mount.replaceChildren(wordmark, slogan);
}
