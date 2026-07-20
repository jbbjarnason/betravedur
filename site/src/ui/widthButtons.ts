// Width segmented buttons (SEL-01 length): four native <button>s in one role="group",
// mutually exclusive (radio semantics). Framework-free — builds DOM + takes an onWidthChange
// callback; controlBar.ts wires it to store.set. Copy is verbatim from the UI-SPEC.

/** The four width options in order — label + day count (UI-SPEC Width Segmented Buttons). */
const WIDTHS: ReadonlyArray<{ label: string; days: number }> = [
  { label: "1 vika", days: 7 },
  { label: "2 vikur", days: 14 },
  { label: "3 vikur", days: 21 },
  { label: "1 mánuður", days: 30 },
];

export interface WidthButtonsOptions {
  initialWidth: number;
  /** Called with the new width in days (7 | 14 | 21 | 30) when a button is pressed. */
  onWidthChange: (days: number) => void;
}

export interface WidthButtonsHandle {
  el: HTMLElement;
}

/**
 * Build the segmented width control: a role="group" labelled "Lengd tímabils" of four
 * buttons. Exactly one carries aria-pressed="true" (weight 600 via CSS); pressing another
 * flips the pressed state and calls onWidthChange. Never uses accent — active is fill +
 * weight + aria-pressed (colour is not the sole channel).
 */
export function createWidthButtons(opts: WidthButtonsOptions): WidthButtonsHandle {
  const group = document.createElement("div");
  group.className = "width-group";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Lengd tímabils");

  const buttons: HTMLButtonElement[] = [];

  const setActive = (days: number): void => {
    for (const b of buttons) {
      const isActive = Number(b.dataset.days) === days;
      b.setAttribute("aria-pressed", isActive ? "true" : "false");
    }
  };

  for (const { label, days } of WIDTHS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "width-group__btn";
    btn.textContent = label;
    btn.dataset.days = String(days);
    btn.setAttribute("aria-pressed", days === opts.initialWidth ? "true" : "false");
    btn.addEventListener("click", () => {
      setActive(days);
      opts.onWidthChange(days);
    });
    buttons.push(btn);
    group.appendChild(btn);
  }

  return { el: group };
}
