/** Small helpers for building the page's own controls without a framework. */

export type Child = Node | string | null | false | undefined;
export type Attrs = Record<string, string | number | boolean | EventListener | null | undefined>;

/**
 * Makes an element. `class` sets the class list, `onclick` and its kind add a listener, `true` sets
 * a bare attribute, and `false`, `null` and `undefined` leave an attribute off. Children that are
 * `null`, `false` or `undefined` are skipped so a condition can sit inline.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (key === 'class') node.className = String(value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children) if (child !== null && child !== false && child !== undefined) node.append(child);
  return node;
}

/** Where the element with the keyboard focus sits among `nodes`, or -1 when it is none of them. */
export const focusedIndex = (nodes: readonly Element[]): number => nodes.indexOf(document.activeElement!);

/** Replaces what is inside `node`, skipping children that are `null`, `false` or `undefined`. */
export function fill(node: HTMLElement, ...children: Child[]): void {
  node.replaceChildren(
    ...children.filter((child): child is Node | string => child !== null && child !== false && child !== undefined),
  );
}

const flagTimers = new WeakMap<HTMLElement, Map<string, number>>();

/**
 * Plays a one-off animation: sets `data-<name>` on `node` so the stylesheet reacts, and takes it
 * away after `ms`. Calling it again before then starts the animation over.
 */
export function flag(node: HTMLElement, name: string, ms: number, value = 'true'): void {
  const timers = flagTimers.get(node) ?? new Map<string, number>();
  flagTimers.set(node, timers);
  window.clearTimeout(timers.get(name));
  delete node.dataset[name];
  void node.offsetWidth;
  node.dataset[name] = value;
  timers.set(
    name,
    window.setTimeout(() => delete node.dataset[name], ms),
  );
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]';

/**
 * What Tab can reach inside `root` right now, in document order. Disabled, hidden and inert things
 * are left out, and so is anything taken out of the tab order with `tabindex="-1"`, which is how a
 * row of tabs keeps one stop.
 */
function tabbable(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (node) =>
      node.tabIndex >= 0 &&
      !node.matches(':disabled') &&
      !node.closest('[hidden], [inert]') &&
      node.getClientRects().length > 0,
  );
}

/** The roots that are holding Tab, the one that took it last on top. */
const traps: HTMLElement[] = [];

/**
 * Keeps Tab inside `root` until the returned function is called. Browsers disagree about what Tab
 * reaches, and Safari skips buttons unless told not to, so the trap picks the next control itself
 * and goes from the last one round to the first. From anywhere outside `root` it goes in. When one
 * dialog opens over another, Tab belongs to the one on top, and goes back to the one underneath
 * when that one closes.
 */
export function trapFocus(root: HTMLElement): () => void {
  traps.push(root);
  const onKey = (event: KeyboardEvent): void => {
    if (
      traps.at(-1) !== root ||
      event.key !== 'Tab' ||
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return;
    event.preventDefault();
    const nodes = tabbable(root);
    const from = document.activeElement ?? document.body;
    const where = (node: Element): number => from.compareDocumentPosition(node);
    const next = event.shiftKey
      ? (nodes.findLast((node) => where(node) & Node.DOCUMENT_POSITION_PRECEDING) ?? nodes.at(-1))
      : (nodes.find((node) => where(node) & Node.DOCUMENT_POSITION_FOLLOWING) ?? nodes[0]);
    next?.focus();
  };
  document.addEventListener('keydown', onKey);
  return () => {
    document.removeEventListener('keydown', onKey);
    const at = traps.lastIndexOf(root);
    if (at >= 0) traps.splice(at, 1);
  };
}
