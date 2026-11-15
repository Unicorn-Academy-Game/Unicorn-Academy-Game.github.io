import { LAYOUTS } from '../../learning';
import type { KeyboardLayout } from '../../shared/learning';
import { flag, h } from '../dom';
import type { KeyView } from './card-view';
import { keyLabel, LABELS } from './text';

/** How a key looks for a moment after it is pressed. */
export type Flash =
  /** It was the letter the player needed. */
  | 'right'
  /** It was not, and it nudges. */
  | 'soft'
  /** It is faded, and only shakes a little to say it heard the player. */
  | 'faded';

const FLASH_MS = 420;
/**
 * A click this soon after a touch on the same key is the same press, which has already been heard.
 */
const SAME_PRESS_MS = 700;

/**
 * The keys on the screen, in the rows of the layout the player chose. Every key is always there in
 * the same place, whatever the rung, and the ones that are not in play only fade, so they learn
 * where each letter lives. A key answers the moment a finger lands on it, and a key that is pressed
 * from a physical keyboard is shown pressed here too.
 */
export class Keyboard {
  readonly node: HTMLElement;
  private readonly keys = new Map<string, HTMLButtonElement>();

  constructor(
    layout: KeyboardLayout,
    private readonly onKey: (letter: string) => void,
  ) {
    const rows = LAYOUTS[layout].map((row) =>
      h('div', { class: 'spell-row' }, ...[...row].map((letter) => this.key(letter))),
    );
    this.node = h(
      'div',
      { class: 'spell-keys', role: 'group', 'aria-label': LABELS.letters, 'data-layout': layout },
      ...rows,
    );
  }

  private key(letter: string): HTMLButtonElement {
    let touchedAt = -Infinity;
    const button = h(
      'button',
      {
        type: 'button',
        class: 'spell-key',
        'data-letter': letter,
        'data-content-id': `learning.key.${letter}`,
        'aria-label': keyLabel(letter, 'on'),
        onpointerdown: ((event: PointerEvent) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          touchedAt = performance.now();
          this.onKey(letter);
        }) as EventListener,
        onclick: () => {
          if (performance.now() - touchedAt < SAME_PRESS_MS) return;
          this.onKey(letter);
        },
      },
      h('span', { class: 'spell-cap', 'aria-hidden': 'true' }, letter),
    );
    this.keys.set(letter, button);
    return button;
  }

  show(rows: readonly (readonly KeyView[])[]): void {
    for (const key of rows.flat()) {
      const button = this.keys.get(key.letter);
      if (!button) continue;
      button.dataset.state = key.state;
      button.setAttribute('aria-label', keyLabel(key.letter, key.state));
      if (key.state === 'off') button.setAttribute('aria-disabled', 'true');
      else button.removeAttribute('aria-disabled');
    }
  }

  /**
   * Where a key is on the screen, for a letter to fly from, or nothing for a letter that is not on
   * this keyboard.
   */
  rectOf(letter: string): DOMRect | null {
    return this.keys.get(letter)?.getBoundingClientRect() ?? null;
  }

  /** Shows a key pressed for a moment. */
  flash(letter: string, kind: Flash): void {
    const button = this.keys.get(letter);
    if (button) flag(button, 'flash', FLASH_MS, kind);
  }
}
