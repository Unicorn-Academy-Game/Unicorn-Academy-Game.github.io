import { MANOR_CODE } from '../content/manor';
import type { SoundFamilyId } from '../shared/audio';
import './code-pad.css';
import { h } from './dom';
import type { OverlayDeps } from './overlay';

export interface CodePadDeps extends OverlayDeps {
  /** Asks the game whether this word opens the door. True means it is opening. */
  attempt: (doorInstanceId: string, typed: string) => boolean;
  /** Plays a sound by family. */
  sound: (id: SoundFamilyId, gain?: number) => void;
  /** Says the sound of a letter the player typed. */
  letter: (letter: string) => void;
  /**
   * The pad has the whole game: whatever was leading Wildstar must let go, and the world must stop
   * listening to keys and fingers.
   */
  onOpen: () => void;
  onClose: () => void;
  /**
   * The right word was typed and the pad has gone: the door is opening, and the game may show it.
   */
  onSolved?: () => void;
}

/**
 * Letters in the order the player learned them, which is easier to find than a keyboard's order.
 * They are nine to a row, and seven to a row on a phone held upright.
 */
const ROWS = ['ABCDEFGHI', 'JKLMNOPQR', 'STUVWXYZ'] as const;
const MOST_LETTERS = 12;
/** After this many wrong tries the word is shown faintly in the empty boxes, to be copied. */
const SHOW_AFTER = 3;
const GOOD_BYE_MS = 650;

/**
 * What is said under the title, in the order of how stuck the player is. Never a failure: every one
 * says what to do next.
 */
export function hintFor(misses: number): string {
  if (misses === 0) return 'Whisper the name of the unicorn who leads.';
  if (misses < SHOW_AFTER) return `Not quite. It starts with ${MANOR_CODE[0]!.toUpperCase()}.`;
  return 'Almost there! Copy the pale letters.';
}

/**
 * The secret word pad for the manor door. What is typed is always on the screen, in big boxes, and
 * nothing is hidden. It can be typed on the letters on the screen or on a keyboard. The game
 * decides whether the word is right (`attempt`), and a wrong word is only ever a gentle nudge and a
 * hint. It can be closed at any time and opened again at the door.
 */
export class CodePad {
  private node: HTMLElement | null = null;
  private door = '';
  private typed = '';
  private misses = 0;
  private done = false;
  private boxes!: HTMLElement;
  private hint!: HTMLElement;
  private unlisten: (() => void) | null = null;
  private closing = 0;

  constructor(private readonly deps: CodePadDeps) {}

  get isOpen(): boolean {
    return this.node !== null;
  }

  /** What is on the pad, for tests. */
  get state(): { typed: string; misses: number; done: boolean; hint: string } {
    return { typed: this.typed, misses: this.misses, done: this.done, hint: this.hint?.textContent ?? '' };
  }

  open(doorInstanceId: string): void {
    if (this.node) return;
    this.door = doorInstanceId;
    this.typed = '';
    this.misses = 0;
    this.done = false;
    this.build();
    this.deps.host.dataset.codepad = 'true';
    this.deps.mount(this.node!);
    this.deps.onOpen();
    const onKey = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'Escape') this.accept(event, () => this.close());
      else if (event.key === 'Enter') this.accept(event, () => this.submit());
      else if (event.key === 'Backspace') this.accept(event, () => this.back());
      else if (/^[a-zA-Z]$/.test(event.key)) this.accept(event, () => this.add(event.key));
      // Everything else, space and Tab included, is left alone, and still never reaches Wildstar.
      else event.stopPropagation();
    };
    document.addEventListener('keydown', onKey, true);
    this.unlisten = () => document.removeEventListener('keydown', onKey, true);
    this.show();
  }

  close(): void {
    if (!this.node) return;
    window.clearTimeout(this.closing);
    this.unlisten?.();
    this.unlisten = null;
    this.node.remove();
    this.node = null;
    delete this.deps.host.dataset.codepad;
    this.deps.onClose();
  }

  /** Types a letter, as a key on the screen or on a keyboard does. */
  add(letter: string): void {
    if (this.done || this.typed.length >= MOST_LETTERS) return;
    this.typed += letter.toLowerCase();
    this.deps.sound('tap', 0.55);
    this.deps.letter(letter);
    this.show();
  }

  back(): void {
    if (this.done || this.typed.length === 0) return;
    this.typed = this.typed.slice(0, -1);
    this.deps.sound('tap', 0.45);
    this.show();
  }

  submit(): void {
    if (this.done || this.typed.length === 0) return;
    if (this.deps.attempt(this.door, this.typed)) {
      this.done = true;
      this.deps.sound('code-success');
      this.show();
      this.closing = window.setTimeout(() => {
        this.close();
        this.deps.onSolved?.();
      }, GOOD_BYE_MS);
      return;
    }
    this.misses++;
    this.deps.sound('refusal', 0.7);
    this.show();
    this.shake();
  }

  private accept(event: KeyboardEvent, then: () => void): void {
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) then();
  }

  private shake(): void {
    if (this.deps.calm()) return;
    this.boxes.dataset.shake = 'false';
    void this.boxes.offsetWidth;
    this.boxes.dataset.shake = 'true';
  }

  private build(): void {
    this.boxes = h('div', { class: 'codepad-boxes', 'data-content-id': 'manor.code-pad.word', 'aria-live': 'polite' });
    this.hint = h('p', { class: 'codepad-hint', 'data-content-id': 'manor.code-pad.hint' });
    const key = (letter: string): HTMLButtonElement =>
      h(
        'button',
        {
          type: 'button',
          class: 'codepad-key',
          'aria-label': letter,
          'data-letter': letter,
          onclick: () => this.add(letter),
        },
        letter,
      );
    const keys = h(
      'div',
      { class: 'codepad-keys' },
      ...ROWS.map((row) => h('div', { class: 'codepad-row' }, ...[...row].map(key))),
    );
    const back = h(
      'button',
      {
        type: 'button',
        class: 'codepad-key codepad-back',
        'aria-label': 'Delete the last letter',
        onclick: () => this.back(),
      },
      '\u232B',
    );
    const go = h(
      'button',
      { type: 'button', class: 'codepad-key codepad-go', 'aria-label': 'Try this word', onclick: () => this.submit() },
      'Go',
    );
    keys.lastElementChild!.append(back, go);
    const shut = h(
      'button',
      { type: 'button', class: 'codepad-shut', 'aria-label': 'Close', onclick: () => this.close() },
      '\u2715',
    );
    const lock = h('div', { class: 'codepad-lock', 'aria-hidden': 'true' });
    lock.innerHTML =
      '<svg viewBox="0 0 48 48"><path d="M15 21v-6a9 9 0 0 1 18 0v6" fill="none" stroke="#ffd75e" stroke-width="4.5" stroke-linecap="round"/><rect x="9" y="21" width="30" height="21" rx="6" fill="#ff9a3c" stroke="#26183d" stroke-width="3"/><circle cx="24" cy="30.5" r="3.6" fill="#26183d"/><path d="M24 33v4.5" stroke="#26183d" stroke-width="3.4" stroke-linecap="round"/></svg>';
    const talk = h(
      'div',
      { class: 'codepad-talk' },
      h(
        'div',
        { class: 'codepad-title' },
        lock,
        h('h2', { 'data-content-id': 'manor.code-pad.title' }, 'The secret word'),
      ),
      this.hint,
      this.boxes,
    );
    const card = h(
      'div',
      {
        class: 'codepad-card',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': 'Type the secret word to open the door',
      },
      shut,
      talk,
      keys,
    );
    this.node = h('div', { class: 'codepad' }, card);
    this.node.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  /**
   * Draws what is typed: a box for each letter, and the empty ones faintly show the word once the
   * player has missed a few times.
   */
  private show(): void {
    const total = Math.max(MANOR_CODE.length, this.typed.length);
    const ghost = this.misses >= SHOW_AFTER;
    this.boxes.style.setProperty('--n', String(total));
    this.boxes.replaceChildren(
      ...Array.from({ length: total }, (_, i) => {
        const letter = this.typed[i];
        const box = h(
          'span',
          { class: 'codepad-box' },
          letter ? letter.toUpperCase() : ghost ? MANOR_CODE[i]!.toUpperCase() : '',
        );
        box.dataset.state = letter ? (this.done ? 'right' : 'typed') : ghost ? 'ghost' : 'empty';
        return box;
      }),
    );
    this.boxes.setAttribute('aria-label', this.typed ? `Typed ${[...this.typed].join(' ')}` : 'Nothing typed yet');
    this.hint.textContent = this.done ? 'You opened the door!' : hintFor(this.misses);
  }
}
