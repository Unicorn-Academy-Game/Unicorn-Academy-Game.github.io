import type { WordId } from '../../../content/lexicon';
import type { CardView, MemoryHandlers, MemoryScreen, MemoryView, SizeView } from '../../../game/play-ports';
import { focusedIndex, h } from '../../dom';
import type { OverlayDeps } from '../../overlay';
import { ICON_NEXT, ICON_SAY, ICON_STAR, ICON_STAR_EMPTY } from '../icons';
import { onPress } from '../reading/press';
import { type Parts, PlayFrame } from './frame';
import { fitGrid } from './grid';

export interface MemoryScreenDeps extends OverlayDeps {
  /** The picture of a word, as an image the page can show. */
  picture: (word: WordId) => string;
}

const stars = (earned: number, of = 3): string =>
  Array.from({ length: of }, (_, i) => (i < earned ? ICON_STAR : ICON_STAR_EMPTY)).join('');

const faceLabel = (place: number, card: CardView): string =>
  card.state === 'down'
    ? `Card ${place + 1}, face down.`
    : card.state === 'paired'
      ? `${card.word}, found.`
      : `Card ${place + 1}, ${card.word}.`;

/**
 * The memory table's screen: two rows of cards on a monitor. A card is a button that turns over
 * when it is touched, as the view says it is up, and it is drawn in place when the board is the
 * same board as before, so a card that turns keeps its motion. No colour says wrong: two cards that
 * are not the same turn back down, and the ones that are the same stay up in gold.
 */
export class MemoryTable implements MemoryScreen {
  private readonly frame: PlayFrame;
  private deal = -1;
  private cards: HTMLButtonElement[] = [];
  private pills: HTMLButtonElement[] = [];
  /**
   * The same choice of size as a step back, what is chosen and a step on, for a screen that is too
   * short to hold eight pills in a row without taking the height from the cards.
   */
  private stepper: { less: HTMLButtonElement; more: HTMLButtonElement; now: HTMLElement } | null = null;
  private board: HTMLElement | null = null;
  private won: HTMLElement | null = null;
  private hearing: HTMLButtonElement | null = null;
  /** Watches the board for a change of its room, which turns the cards another way. */
  private watching: ResizeObserver | null = null;

  constructor(
    private readonly deps: MemoryScreenDeps,
    private readonly handlers: MemoryHandlers,
  ) {
    this.frame = new PlayFrame(deps, {
      game: 'memory',
      label: 'Memory game',
      tint: 'palace',
      close: () => handlers.close(),
      arrow: (across, down) => this.move(across, down),
    });
  }

  show(view: MemoryView): void {
    const parts = this.frame.isOpen ? this.frame.open('Memory') : this.up();
    this.drawSizes(parts, view);
    if (this.hearing) this.hearing.hidden = !view.speech;
    if (view.won) this.drawWon(parts, view);
    else this.drawBoard(parts, view);
    this.frame.tell(view.caption);
  }

  close(): void {
    this.watching?.disconnect();
    this.watching = null;
    this.frame.close();
    this.deal = -1;
    this.cards = [];
    this.pills = [];
    this.stepper = null;
    this.board = null;
    this.won = null;
    this.hearing = null;
  }

  private up(): Parts {
    const parts = this.frame.open('Memory');
    this.hearing = h('button', {
      type: 'button',
      class: 'play-hear round',
      'aria-label': 'Hear it again',
      'data-content-id': 'memory.hear',
    });
    this.hearing.innerHTML = ICON_SAY;
    onPress(this.hearing, () => this.handlers.hear());
    const sizes = h('div', { class: 'play-sizes', role: 'group', 'aria-label': 'How many cards' });
    parts.tools.append(sizes, this.step(), this.hearing);
    return parts;
  }

  /** The stepper, which a short screen shows in place of the pills. */
  private step(): HTMLElement {
    const button = (name: string, label: string, flip: boolean): HTMLButtonElement => {
      const b = h('button', {
        type: 'button',
        class: 'play-step round',
        'aria-label': label,
        'data-content-id': `memory.${name}`,
        'data-flip': String(flip),
      });
      b.innerHTML = ICON_NEXT;
      return b;
    };
    const less = button('step-less', 'Fewer cards', true);
    const more = button('step-more', 'More cards', false);
    const now = h('span', { class: 'play-step-now', 'data-content-id': 'memory.now', role: 'status' });
    this.stepper = { less, more, now };
    onPress(less, () => this.stepBy(-1));
    onPress(more, () => this.stepBy(1));
    return h('div', { class: 'play-stepper', role: 'group', 'aria-label': 'How many cards' }, less, now, more);
  }

  /** A step to the next size that is smaller or bigger than the one chosen. */
  private stepBy(way: -1 | 1): void {
    const at = this.pills.findIndex((pill) => pill.getAttribute('aria-pressed') === 'true');
    const next = this.pills[at + way];
    if (next) this.handlers.size(Number(next.dataset.pairs));
  }

  /**
   * The sizes the player can choose between, which are made once and then say what is chosen and
   * what has been won.
   */
  private drawSizes(parts: Parts, view: MemoryView): void {
    const group = parts.tools.querySelector<HTMLElement>('.play-sizes')!;
    if (this.pills.length !== view.sizes.length) {
      this.pills = view.sizes.map((size) => {
        const pill = h('button', {
          type: 'button',
          class: 'play-size',
          'data-content-id': 'memory.size',
          'data-pairs': size.pairs,
        });
        onPress(pill, () => this.handlers.size(size.pairs));
        return pill;
      });
      group.replaceChildren(...this.pills);
    }
    view.sizes.forEach((size: SizeView, at) => {
      const pill = this.pills[at]!;
      pill.setAttribute('aria-pressed', String(size.chosen));
      pill.setAttribute(
        'aria-label',
        `${size.pairs * 2} cards${size.stars > 0 ? `, ${size.stars} ${size.stars === 1 ? 'star' : 'stars'}` : ''}`,
      );
      pill.innerHTML = `<span class="play-size-n">${size.pairs * 2}</span><span class="play-size-stars" aria-hidden="true">${stars(size.stars)}</span>`;
    });
    const chosen = view.sizes.findIndex((size) => size.chosen);
    if (this.stepper && chosen >= 0) {
      const size = view.sizes[chosen]!;
      this.stepper.now.dataset.pairs = String(size.pairs);
      this.stepper.now.innerHTML = `<span class="play-size-n">${size.pairs * 2}</span><span class="play-size-stars" aria-hidden="true">${stars(size.stars)}</span>`;
      this.stepper.now.setAttribute('aria-label', `${size.pairs * 2} cards`);
      this.stepper.less.setAttribute('aria-disabled', String(chosen === 0));
      this.stepper.more.setAttribute('aria-disabled', String(chosen === view.sizes.length - 1));
    }
  }

  private drawBoard(parts: Parts, view: MemoryView): void {
    if (this.won) {
      this.won.remove();
      this.won = null;
    }
    if (!this.board || view.deal !== this.deal) this.deck(parts, view);
    view.cards.forEach((card, place) => {
      const node = this.cards[place]!;
      if (node.dataset.state !== card.state) node.dataset.state = card.state;
      node.setAttribute('aria-label', faceLabel(place, card));
      node.setAttribute('aria-disabled', String(card.state === 'paired'));
    });
  }

  /** A new board: its cards, face down. */
  private deck(parts: Parts, view: MemoryView): void {
    this.deal = view.deal;
    this.cards = view.cards.map((card, place) => {
      const back = h('span', { class: 'mem-back', 'aria-hidden': 'true' });
      back.innerHTML = ICON_STAR;
      const face = h(
        'span',
        { class: 'mem-face', 'aria-hidden': 'true' },
        h('img', { class: 'mem-picture', src: this.deps.picture(card.word), alt: '', draggable: 'false' }),
        h('span', { class: 'mem-word' }, card.word),
      );
      const node = h(
        'button',
        {
          type: 'button',
          class: 'mem-card',
          'data-content-id': 'memory.card',
          'data-place': place,
          'data-state': 'down',
        },
        h('span', { class: 'mem-flip' }, back, face),
      );
      onPress(node, () => this.handlers.turn(place), { everyFinger: true });
      return node;
    });
    const board = h('div', { class: 'mem-board', 'data-pairs': view.pairs, 'data-entering': 'true' }, ...this.cards);
    window.setTimeout(() => delete board.dataset.entering, 700);
    this.board = board;
    parts.body.replaceChildren(board);
    this.lay(board, view.cards.length);
  }

  /**
   * Chooses how many cards go across and down from the room the board has, now and whenever the
   * room changes, as it does when a phone is turned over.
   */
  private lay(board: HTMLElement, count: number): void {
    this.watching?.disconnect();
    const set = (): void => {
      const style = getComputedStyle(board);
      const across = board.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const down = board.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const { cols, rows } = fitGrid(count, across, down, parseFloat(style.columnGap) || 0);
      board.style.setProperty('--cols', String(cols));
      board.style.setProperty('--rows', String(rows));
    };
    set();
    if (typeof ResizeObserver !== 'function') return;
    this.watching = new ResizeObserver(set);
    this.watching.observe(board);
  }

  private drawWon(parts: Parts, view: MemoryView): void {
    const won = view.won!;
    if (this.board) {
      this.watching?.disconnect();
      this.watching = null;
      this.board.remove();
      this.board = null;
      this.cards = [];
      this.deal = -1;
    }
    this.won?.remove();
    const again = h(
      'button',
      { type: 'button', class: 'read-big read-another', 'data-content-id': 'memory.again' },
      h('span', {}, 'Play again'),
    );
    onPress(again, () => this.handlers.again());
    const actions = h('div', { class: 'read-actions' }, again);
    if (won.next !== null) {
      const more = h(
        'button',
        { type: 'button', class: 'read-big read-quiet', 'data-content-id': 'memory.more' },
        h('span', {}, `${won.next * 2} cards`),
      );
      onPress(more, () => this.handlers.more());
      actions.append(more);
    }
    const title = h('p', { class: 'play-won-title', 'data-content-id': 'memory.won' }, 'You found every pair!');
    const row = h('div', {
      class: 'play-won-stars',
      role: 'img',
      'aria-label': `${won.stars} ${won.stars === 1 ? 'star' : 'stars'}`,
      'data-stars': won.stars,
    });
    row.innerHTML = stars(won.stars);
    const count = h(
      'p',
      { class: 'play-won-count', 'data-content-id': 'memory.turns' },
      `${won.turns} ${won.turns === 1 ? 'turn' : 'turns'}${won.best ? '. Your best yet!' : ''}`,
    );
    this.won = h('div', { class: 'read-done play-won', 'data-entering': 'true' }, title, row, count, actions);
    parts.body.replaceChildren(this.won);
    again.focus({ preventScroll: true });
  }

  /**
   * Moves the focus from the card that has it a step across or down the board, by the columns the
   * board is laid out in now, which are fewer on a tall screen.
   */
  private move(across: number, down: number): void {
    if (!this.board || this.cards.length === 0) return;
    const now = focusedIndex(this.cards);
    const columns = Math.max(1, getComputedStyle(this.board).gridTemplateColumns.split(' ').length);
    const next = now < 0 ? 0 : now + across + down * columns;
    this.cards[Math.max(0, Math.min(this.cards.length - 1, next))]?.focus({ preventScroll: true });
  }
}
