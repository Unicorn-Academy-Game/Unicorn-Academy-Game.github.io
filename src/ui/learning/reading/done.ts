import type { DoneView, ReadHandlers } from '../../../game/reading-ports';
import { h } from '../../dom';
import { ICON_AGAIN } from '../icons';
import { Bands } from './bands';
import { gemChip } from './gems';
import { ICON_HOME, ICON_LEVELS } from './icons';
import { onPress } from './press';
import { freshLine, LABELS, milestoneLine, roundLine, wonLine } from './text';

/**
 * The end of a round: the seven bands as the player filled them, how many they read, and what they
 * cleared.
 */
export class DonePane {
  readonly node: HTMLElement;
  private readonly bands = new Bands('big');
  private readonly caption: HTMLElement;
  private readonly count: HTMLElement;
  private readonly fresh: HTMLElement;
  private readonly banner: HTMLElement;

  constructor(view: DoneView, handlers: ReadHandlers) {
    this.caption = h('p', { class: 'read-done-title', 'data-content-id': 'reading.caption' });
    this.count = h('p', { class: 'read-done-count', 'data-content-id': 'reading.count' });
    this.fresh = h('p', { class: 'read-done-fresh' });
    this.banner = h('div', { class: 'read-banner', role: 'status' });
    const another = h(
      'button',
      { type: 'button', class: 'read-big read-another', 'data-content-id': 'reading.another' },
      h('span', { class: 'read-icon', 'aria-hidden': 'true' }),
      h('span', {}, LABELS.another),
    );
    another.firstElementChild!.innerHTML = ICON_AGAIN;
    onPress(another, () => handlers.another());
    const home = h(
      'button',
      { type: 'button', class: 'read-big read-quiet read-home-button', 'data-content-id': 'reading.home' },
      h('span', { class: 'read-icon', 'aria-hidden': 'true' }),
      h('span', {}, LABELS.home),
    );
    home.firstElementChild!.innerHTML = ICON_HOME;
    onPress(home, () => handlers.home());
    const levels = h(
      'button',
      { type: 'button', class: 'read-big read-quiet read-levels', 'data-content-id': 'reading.levels' },
      h('span', { class: 'read-icon', 'aria-hidden': 'true' }),
      h('span', {}, LABELS.levels),
    );
    levels.firstElementChild!.innerHTML = ICON_LEVELS;
    onPress(levels, () => handlers.levels());
    this.node = h(
      'section',
      { class: 'read-done' },
      this.caption,
      this.bands.node,
      h('div', { class: 'read-done-tally' }, this.count, this.fresh),
      this.banner,
      h('div', { class: 'read-actions' }, another, levels, home),
    );
    this.update(view);
  }

  update(view: DoneView): void {
    this.caption.textContent = view.caption;
    this.bands.update(view.bands);
    this.count.textContent = roundLine(view);
    const fresh = freshLine(view.fresh);
    this.fresh.textContent = fresh ?? '';
    this.fresh.hidden = fresh === null;
    const line = milestoneLine(view.cleared, view.chapter, view.everything);
    const won = view.prize
      ? h(
          'span',
          { class: 'read-banner-line read-banner-prize' },
          gemChip(view.prize, 'read-gem read-gem-big', false),
          wonLine(view.prize),
        )
      : null;
    this.banner.replaceChildren(
      ...(line ? [h('span', { class: 'read-banner-line' }, line)] : []),
      ...(won ? [won] : []),
    );
    this.banner.hidden = line === null && won === null;
  }
}
