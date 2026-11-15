import type { HomeView, ReadHandlers } from '../../../game/reading-ports';
import { h } from '../../dom';
import { ICON_DONE, ICON_SAY } from '../icons';
import { gemChip } from './gems';
import { ICON_COMPUTER, ICON_LEVELS, ICON_PLAY, ICON_TILES } from './icons';
import { onPress } from './press';
import { LABELS, levelLine, promiseLine, STEPS, statsLine, treasureLabel } from './text';

const STEP_ICONS = [ICON_TILES, ICON_SAY, ICON_DONE] as const;

/**
 * Where the player sits down: what they are on, and a big button to go on with it. The first time
 * ever it says how it works instead of what they have read.
 */
export class HomePane {
  readonly node: HTMLElement;
  private readonly welcome: HTMLElement;
  private readonly where: HTMLElement;
  private readonly name: HTMLElement;
  private readonly samples: HTMLElement;
  private readonly stats: HTMLElement;
  private readonly promise: HTMLElement;
  private readonly treasure: HTMLElement;
  private readonly levels: HTMLButtonElement;

  constructor(view: HomeView, handlers: ReadHandlers) {
    const hero = h('span', { class: 'read-hero', 'aria-hidden': 'true' });
    hero.innerHTML = ICON_COMPUTER;
    this.welcome = h('p', { class: 'read-welcome', 'data-content-id': 'reading.welcome' });
    this.where = h('p', { class: 'read-where-big', 'data-content-id': 'reading.where' });
    this.name = h('p', { class: 'read-stage-name' });
    this.samples = h('ul', { class: 'read-samples', 'aria-hidden': 'true' });
    const steps = h(
      'ol',
      { class: 'read-steps', 'aria-label': LABELS.steps },
      ...STEPS.map((text, i) => {
        const icon = h('span', { class: 'read-step-icon', 'aria-hidden': 'true' });
        icon.innerHTML = STEP_ICONS[i]!;
        return h('li', {}, icon, h('span', { class: 'read-step-text' }, text));
      }),
    );
    const start = h(
      'button',
      { type: 'button', class: 'read-big read-start', 'data-content-id': 'reading.start' },
      h('span', { class: 'read-icon', 'aria-hidden': 'true' }),
      h('span', {}, LABELS.start),
    );
    start.firstElementChild!.innerHTML = ICON_PLAY;
    onPress(start, () => handlers.start());
    this.levels = h(
      'button',
      { type: 'button', class: 'read-big read-quiet read-levels', 'data-content-id': 'reading.levels' },
      h('span', { class: 'read-icon', 'aria-hidden': 'true' }),
      h('span', {}, LABELS.levels),
    );
    this.levels.firstElementChild!.innerHTML = ICON_LEVELS;
    onPress(this.levels, () => handlers.levels());
    this.stats = h('p', { class: 'read-stats', 'data-content-id': 'reading.stats' });
    this.promise = h('p', { class: 'read-promise', 'data-content-id': 'reading.promise' });
    this.treasure = h('div', { class: 'read-treasure', role: 'group' });
    this.node = h(
      'section',
      { class: 'read-home' },
      h(
        'div',
        { class: 'read-intro' },
        hero,
        h(
          'div',
          { class: 'read-intro-text' },
          h('div', { class: 'read-title-row' }, h('h2', { class: 'read-title' }, LABELS.title), this.treasure),
          this.welcome,
          this.where,
          this.name,
          this.promise,
          this.samples,
          steps,
        ),
      ),
      h('div', { class: 'read-actions' }, start, this.levels),
      this.stats,
    );
    this.update(view);
  }

  update(view: HomeView): void {
    this.node.dataset.first = String(view.firstEver);
    this.welcome.textContent = view.caption;
    this.welcome.hidden = view.caption === '';
    this.where.textContent = levelLine(view.stage, view.chapter);
    this.name.textContent = view.stage.title;
    this.samples.replaceChildren(...view.stage.samples.map((word) => h('li', {}, word)));
    this.stats.textContent = statsLine(view.words, view.lines);
    this.stats.hidden = view.firstEver;
    this.promise.replaceChildren(gemChip(view.stage.prize, 'read-gem', false), h('span', {}, promiseLine(view.stage)));
    this.promise.dataset.won = String(view.stage.won);
    this.treasure.setAttribute('aria-label', treasureLabel(view.treasure));
    this.treasure.replaceChildren(...view.treasure.map((prize) => gemChip(prize)));
    this.treasure.hidden = view.treasure.length === 0;
  }
}
