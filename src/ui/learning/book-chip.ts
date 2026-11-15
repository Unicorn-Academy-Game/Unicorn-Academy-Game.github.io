import { WORD_IDS } from '../../content/lexicon';
import type { Kept } from '../../game/ports';
import { flag, h } from '../dom';
import { chipLabel } from './book-text';
import { flyPicture } from './flight';
import { ICON_BOOK } from './icons';

export interface BookChipDeps {
  /** The page's own layer, which a flying picture goes in. */
  layer: HTMLElement;
  /** Whether the parent asked for fewer effects. */
  calm: () => boolean;
  /** A card is up, so the count is not changed until the picture has arrived. */
  busy: () => boolean;
  /** The player tapped it. */
  open: () => void;
}

/**
 * The button in the corner that opens the Spell Book: a book, and how many words are in it. A word
 * the player has just spelled flies to it and the count goes up when the picture arrives, so the
 * number is something they watch earn. With fewer effects the picture does not fly, and the count
 * changes at once.
 */
export class BookChip {
  readonly node: HTMLButtonElement;
  private readonly icon: HTMLElement;
  private readonly count: HTMLElement;
  private collected = 0;
  private flying = 0;

  constructor(private readonly deps: BookChipDeps) {
    this.icon = h('span', { class: 'bookchip-icon', 'aria-hidden': 'true' });
    this.icon.innerHTML = ICON_BOOK;
    this.count = h('b', { class: 'bookchip-count', 'aria-hidden': 'true' });
    this.node = h(
      'button',
      { type: 'button', class: 'bookchip', 'data-content-id': 'learning.book.open', onclick: () => this.deps.open() },
      this.icon,
      this.count,
    );
    this.set(0);
  }

  /** The count as it stands now, with no ceremony. */
  set(collected: number): void {
    this.collected = collected;
    this.count.textContent = String(collected);
    this.node.setAttribute('aria-label', chipLabel(collected, WORD_IDS.length));
  }

  /**
   * The book changed in a way the player did not just do, such as being cleared. It waits while a
   * word is being put in, because the picture says when.
   */
  sync(collected: number): void {
    if (this.flying > 0 || this.deps.busy() || collected === this.collected) return;
    this.set(collected);
  }

  /** A word has gone into the book. Its picture flies here, and the count goes up when it lands. */
  kept(kept: Kept): void {
    this.flying += 1;
    const land = (): void => {
      this.flying -= 1;
      this.set(kept.collected);
      if (!this.deps.calm()) flag(this.node, kept.fresh ? 'gain' : 'pop', 800);
    };
    if (this.deps.calm() || !kept.from) {
      land();
      return;
    }
    flyPicture(this.deps.layer, kept, kept.from, this.icon.getBoundingClientRect(), land);
  }
}
