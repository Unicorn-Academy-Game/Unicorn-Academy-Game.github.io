import { type Attrs, type Child, h } from '../dom';
import type { Line, Tone } from './text';

/**
 * The controls the parent pages are built from. Each is plain DOM with a class, so the stylesheet
 * owns how it looks.
 */

const ICONS: Record<Tone, string> = {
  good: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  info: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v5.5l3.2 2"/><circle cx="12" cy="12" r="8.5"/></svg>',
  warn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.5v5.5M12 16.6v.1"/><path d="M12 3.6l9 15.6H3z"/></svg>',
  bad: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.5v5.5M12 16.6v.1"/><circle cx="12" cy="12" r="8.5"/></svg>',
};

export type ButtonKind = 'primary' | 'quiet' | 'danger';

export function button(
  label: string,
  onClick: () => void,
  kind: ButtonKind = 'primary',
  attrs: Attrs = {},
): HTMLButtonElement {
  return h('button', { type: 'button', class: `btn ${kind}`, onclick: onClick, ...attrs }, label);
}

/** The top of a page: its name and one line on what it is for. */
export function pageTitle(title: string, blurb?: string): HTMLElement {
  return h('div', { class: 'page-head' }, h('h3', {}, title), blurb ? h('p', {}, blurb) : null);
}

/** A titled group. The title is a real heading so the page can be navigated by it. */
export function card(title: string | null, ...children: Child[]): HTMLElement {
  return h('section', { class: 'card' }, title ? h('h4', {}, title) : null, ...children);
}

export const para = (...children: Child[]): HTMLElement => h('p', {}, ...children);

export const note = (text: string): HTMLElement => h('p', { class: 'note' }, text);

/** An icon in the colour of its tone, a title and an optional line under it. */
export function statusLine(line: Line): HTMLElement {
  const icon = h('span', { class: 'tone-icon', 'aria-hidden': 'true' });
  icon.innerHTML = ICONS[line.tone];
  return h(
    'div',
    { class: `status ${line.tone}` },
    icon,
    h('div', { class: 'status-text' }, h('strong', {}, line.title), line.detail ? h('span', {}, line.detail) : null),
  );
}

let serial = 0;
const uid = (prefix: string): string => `${prefix}-${++serial}`;

export interface Control<T> {
  node: HTMLElement;
  set(value: T): void;
}

/** A switch with a name and a line of explanation. It reads as a switch to a screen reader. */
export function toggle(
  label: string,
  description: string,
  checked: boolean,
  onChange: (value: boolean) => void,
): Control<boolean> {
  const labelId = uid('switch');
  const descId = `${labelId}-d`;
  const track = h(
    'button',
    {
      type: 'button',
      role: 'switch',
      class: 'switch',
      'aria-checked': String(checked),
      'aria-labelledby': labelId,
      'aria-describedby': descId,
    },
    h('i', {}),
  );
  const set = (value: boolean): void => track.setAttribute('aria-checked', String(value));
  track.addEventListener('click', () => {
    const next = track.getAttribute('aria-checked') !== 'true';
    set(next);
    onChange(next);
  });
  const row = h(
    'div',
    { class: 'row' },
    h('div', { class: 'row-text' }, h('strong', { id: labelId }, label), h('span', { id: descId }, description)),
    track,
  );
  // The whole row is the target, not just the small switch.
  row.addEventListener('click', (event) => {
    if (event.target !== track && !track.contains(event.target as Node)) track.click();
  });
  return { node: row, set };
}

export interface Option<T> {
  value: T;
  label: string;
}

/**
 * One of a short row of choices. It reads as a group of radio buttons: the arrow keys move between
 * them and pick as they go, and the row is one stop for Tab.
 */
export function choice<T>(
  label: string,
  description: string,
  options: readonly Option<T>[],
  current: T,
  onChange: (value: T) => void,
): Control<T> {
  const labelId = uid('choice');
  const descId = `${labelId}-d`;
  const buttons = options.map((option) =>
    h(
      'button',
      { type: 'button', role: 'radio', class: 'option', 'aria-checked': 'false', tabindex: '-1' },
      option.label,
    ),
  );
  const group = h(
    'div',
    { class: 'options', role: 'radiogroup', 'aria-labelledby': labelId, 'aria-describedby': descId },
    ...buttons,
  );
  const set = (value: T): void => {
    const at = options.findIndex((option) => option.value === value);
    buttons.forEach((button, i) => {
      button.setAttribute('aria-checked', String(i === at));
      button.tabIndex = i === Math.max(at, 0) ? 0 : -1;
    });
  };
  buttons.forEach((button, i) => {
    button.addEventListener('click', () => {
      set(options[i]!.value);
      onChange(options[i]!.value);
    });
    button.addEventListener('keydown', (event) => {
      const by = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (by === undefined) return;
      event.preventDefault();
      const next = buttons[(i + by + buttons.length) % buttons.length]!;
      next.focus();
      next.click();
    });
  });
  set(current);
  return {
    node: h(
      'div',
      { class: 'row choice-row' },
      h('div', { class: 'row-text' }, h('strong', { id: labelId }, label), h('span', { id: descId }, description)),
      group,
    ),
    set,
  };
}

/** A level from 0 to 1 in steps of one in twenty, shown as a percentage. */
export function slider(
  label: string,
  value: number,
  onInput: (value: number) => void,
  onCommit: () => void,
): Control<number> {
  const id = uid('level');
  const read = h('output', { for: id, class: 'level-value' });
  const input = h('input', { id, type: 'range', min: 0, max: 100, step: 5, class: 'level' });
  const show = (v: number): void => {
    const percent = Math.round(v * 100);
    input.value = String(percent);
    input.setAttribute('aria-valuetext', `${percent} percent`);
    input.style.setProperty('--fill', `${percent}%`);
    read.textContent = `${percent}%`;
  };
  input.addEventListener('input', () => {
    show(Number(input.value) / 100);
    onInput(Number(input.value) / 100);
  });
  input.addEventListener('change', onCommit);
  show(value);
  return { node: h('div', { class: 'row level-row' }, h('label', { for: id }, label), input, read), set: show };
}

/** A sentence-sized message that appears for a moment. Screen readers hear it when it changes. */
export function toast(): { node: HTMLElement; say(text: string, tone?: Tone): void; clear(): void } {
  const node = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite', hidden: true });
  let timer = 0;
  return {
    node,
    say(text, tone = 'info') {
      window.clearTimeout(timer);
      node.className = `toast ${tone}`;
      node.textContent = text;
      node.hidden = false;
      timer = window.setTimeout(() => (node.hidden = true), 5200);
    },
    clear() {
      window.clearTimeout(timer);
      node.hidden = true;
    },
  };
}

/** A small label above a value, as in the About page. */
export const fact = (label: string, value: string): HTMLElement =>
  h('div', { class: 'fact' }, h('dt', {}, label), h('dd', {}, value));
