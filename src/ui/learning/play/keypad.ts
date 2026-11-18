import { numberOn, press } from '../../../learning/play/maths/entry';
import { h } from '../../dom';
import { onPress } from '../reading/press';

/** What the keypad needs to know about the question, and nothing about how it is played. */
export interface KeypadState {
  /** The digits of the right answer. */
  readonly answer: string;
  /** How many numbers typed in were not the answer. */
  readonly misses: number;
  /** The question is answered. */
  readonly solved: boolean;
  /** The right answer's keys shine. */
  readonly hint: boolean;
}

export interface KeypadHandlers {
  /** The number on the display was sent. */
  enter: (value: number) => void;
  /** A key was pressed, for the sound of it. */
  tap: () => void;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] as const;

/**
 * A calculator's keys, made once for a question and then told what has become of it. It keeps what
 * is typed, as a calculator's display does, and sends the number only when the player presses go.
 * A number that was not the answer stays on the display, faint, until the next key starts a new one,
 * so nothing is wiped away and nothing says it was wrong.
 */
export class Keypad {
  readonly root: HTMLElement;
  private readonly screen: HTMLElement;
  private readonly keys = new Map<string, HTMLButtonElement>();
  private readonly back: HTMLButtonElement;
  private readonly go: HTMLButtonElement;
  private typed = '';
  /** What was sent and was not the answer, which the next key puts aside. */
  private resting = false;
  private misses = 0;
  private solved = false;

  constructor(private readonly handlers: KeypadHandlers) {
    this.screen = h('output', {
      class: 'maths-display',
      'data-content-id': 'maths.display',
      'data-state': 'empty',
      'aria-live': 'off',
    });
    const key = (name: string, label: string, area: string, text: string, run: () => void): HTMLButtonElement => {
      const button = h(
        'button',
        {
          type: 'button',
          class: 'maths-key',
          'data-content-id': 'maths.key',
          'data-key': name,
          'aria-label': label,
          style: `grid-area: ${area}`,
        },
        text,
      );
      onPress(button, run);
      return button;
    };
    for (const digit of KEYS)
      this.keys.set(
        digit,
        key(digit, digit, `k${digit}`, digit, () => this.digit(digit)),
      );
    this.back = key('back', 'Rub out', 'back', '\u232b', () => this.rub());
    this.go = key('go', 'That is my answer', 'go', '\u2713', () => this.send());
    // The outside is the room the keys are given, which the grid inside is shaped to.
    this.root = h(
      'div',
      { class: 'maths-keypad', role: 'group', 'aria-label': 'Keypad' },
      h('div', { class: 'maths-keys' }, this.screen, this.back, this.go, ...this.keys.values()),
    );
    // A press on a key must not take the keyboard away from the panel, or Enter would press the key
    // again and not send the number.
    this.root.addEventListener('mousedown', (event) => event.preventDefault());
    this.draw();
  }

  /** Tells the keypad what has become of the question. */
  show(state: KeypadState): void {
    if (state.misses > this.misses) this.resting = true;
    this.misses = state.misses;
    if (state.solved && !this.solved) this.typed = state.answer;
    this.solved = state.solved;
    this.root.dataset.solved = String(state.solved);
    for (const [digit, button] of this.keys) {
      button.dataset.hint = String(state.hint && !state.solved && state.answer.includes(digit));
      button.setAttribute('aria-disabled', String(state.solved));
    }
    this.draw();
  }

  /**
   * A key of the keyboard: a digit, rubbing out, or Enter to send. True when the keypad took it.
   * Enter on a button is left to the button, so a player who tabbed to a key can press it.
   */
  type(event: KeyboardEvent): boolean {
    if (this.solved) return false;
    if (/^[0-9]$/.test(event.key)) {
      this.digit(event.key);
      return true;
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      this.rub();
      return true;
    }
    if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) {
      this.send();
      return true;
    }
    return false;
  }

  private digit(digit: string): void {
    if (this.solved) return;
    this.handlers.tap();
    this.typed = press(this.resting ? '' : this.typed, digit);
    this.resting = false;
    this.draw();
  }

  private rub(): void {
    if (this.solved) return;
    this.handlers.tap();
    this.typed = this.resting ? '' : press(this.typed, 'back');
    this.resting = false;
    this.draw();
  }

  private send(): void {
    const value = numberOn(this.typed);
    if (this.solved || this.resting || value === null) return;
    this.handlers.enter(value);
  }

  private draw(): void {
    const state = this.solved ? 'right' : this.resting ? 'rest' : this.typed === '' ? 'empty' : 'typing';
    this.screen.dataset.state = state;
    this.screen.textContent = this.typed === '' ? '?' : this.typed;
    const ready = !this.solved && !this.resting && this.typed !== '';
    this.go.dataset.ready = String(ready);
    this.go.setAttribute('aria-disabled', String(!ready));
    this.back.setAttribute('aria-disabled', String(this.solved || this.typed === ''));
  }
}
