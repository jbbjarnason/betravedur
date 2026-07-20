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

  const wordmark = document.createElement("span");
  wordmark.className = "wordmark";
  wordmark.textContent = WORDMARK;

  const slogan = document.createElement("span");
  slogan.className = "slogan";
  slogan.textContent = SLOGAN;

  mount.replaceChildren(wordmark, slogan);
}
