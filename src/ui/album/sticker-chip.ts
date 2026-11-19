import type { Box } from '../../game/ports';
import { flag, h } from '../dom';
import { chipLabel } from './album-text';
import { ICON_STICKER } from './icons';

export interface StickerChipDeps {
  /** How many stickers there are, for the words of the button. */
  total: number;
  /** Whether the parent asked for fewer effects. */
  calm: () => boolean;
  /** The player tapped it. */
  open: () => void;
}

/**
 * The button in the corner that opens the Sticker Book: a sticker, and how many are in the book. A
 * new sticker flies to it and the count goes up when the sticker arrives, so the number is
 * something the player watches grow.
 */
export class StickerChip {
  readonly node: HTMLButtonElement;
  private readonly icon: HTMLElement;
  private readonly count: HTMLElement;

  constructor(private readonly deps: StickerChipDeps) {
    this.icon = h('span', { class: 'bookchip-icon', 'aria-hidden': 'true' });
    this.icon.innerHTML = ICON_STICKER;
    this.count = h('b', { class: 'bookchip-count', 'aria-hidden': 'true' });
    this.node = h(
      'button',
      {
        type: 'button',
        class: 'bookchip stickerchip',
        'data-content-id': 'album.open',
        onclick: () => this.deps.open(),
      },
      this.icon,
      this.count,
    );
    this.set(0);
  }

  /** The count as it stands now, with no ceremony. */
  set(have: number): void {
    this.count.textContent = String(have);
    this.node.setAttribute('aria-label', chipLabel(have, this.deps.total));
  }

  /** A sticker has landed on it. */
  pop(): void {
    if (!this.deps.calm()) flag(this.node, 'gain', 800);
  }

  /** Where a sticker flying here should end up. */
  get box(): Box {
    return this.icon.getBoundingClientRect();
  }
}
