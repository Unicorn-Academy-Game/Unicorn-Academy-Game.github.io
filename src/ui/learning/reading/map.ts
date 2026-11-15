import type { MapView, ReadHandlers, StageView } from '../../../game/reading-ports';
import { h } from '../../dom';
import { ICON_DONE, ICON_STAR } from '../icons';
import { gemChip } from './gems';
import { ICON_HOME, ICON_PLAY } from './icons';
import { onPress } from './press';
import { LABELS, markLine, metLine, promiseLine, stageLabel } from './text';

const MARKS = { cleared: ICON_DONE, mastered: ICON_STAR, current: ICON_PLAY, open: '' } as const;

/**
 * The levels, a chapter at a time. Every level can be picked, at any time, and the one the player
 * is working on is picked to begin with. Picking one does not start it: the card at the bottom says
 * what is in it, and Play starts it.
 */
export class MapPane {
  readonly node: HTMLElement;
  private picked: number;
  private stages = new Map<number, StageView>();
  private readonly nodes = new Map<number, HTMLButtonElement>();
  private readonly level: HTMLElement;
  private readonly name: HTMLElement;
  private readonly samples: HTMLElement;
  private readonly state: HTMLElement;
  private readonly promise: HTMLElement;
  private readonly play: HTMLButtonElement;
  private readonly scroller: HTMLElement;
  private readonly watching: ResizeObserver | null;
  /**
   * The level the player is on stays in the middle of the list while the list changes size, until
   * they scroll it themselves.
   */
  private following = true;

  constructor(
    view: MapView,
    private readonly handlers: ReadHandlers,
  ) {
    this.picked = view.picked;
    this.scroller = h(
      'div',
      { class: 'read-chapters' },
      ...view.chapters.map((chapter) =>
        h(
          'section',
          { class: 'read-chapter', 'data-chapter': chapter.id },
          h('h3', { class: 'read-chapter-title' }, chapter.title),
          h(
            'div',
            { class: 'read-stages', role: 'group', 'aria-label': chapter.title },
            ...chapter.stages.map((stage) => {
              const node = h(
                'button',
                { type: 'button', class: 'read-node', 'data-n': stage.n, 'data-content-id': 'reading.stage' },
                h('span', { class: 'read-n', 'aria-hidden': 'true' }, String(stage.n)),
                h('span', { class: 'read-mark', 'aria-hidden': 'true' }),
              );
              onPress(node, () => this.pick(stage.n));
              this.nodes.set(stage.n, node);
              return node;
            }),
          ),
        ),
      ),
    );
    this.level = h('p', { class: 'read-pick-level' });
    this.name = h('p', { class: 'read-pick-name', 'data-content-id': 'reading.pick' });
    this.samples = h('ul', { class: 'read-samples', 'aria-hidden': 'true' });
    this.state = h('p', { class: 'read-pick-state' });
    this.promise = h('p', { class: 'read-promise' });
    this.play = h(
      'button',
      { type: 'button', class: 'read-big read-play', 'data-content-id': 'reading.play' },
      h('span', { class: 'read-icon', 'aria-hidden': 'true' }),
      h('span', {}, 'Play'),
    );
    this.play.firstElementChild!.innerHTML = ICON_PLAY;
    onPress(this.play, () => this.handlers.play(this.picked));
    const home = h(
      'button',
      { type: 'button', class: 'read-big read-home-button', 'data-content-id': 'reading.home' },
      h('span', { class: 'read-icon', 'aria-hidden': 'true' }),
      h('span', {}, LABELS.home),
    );
    home.firstElementChild!.innerHTML = ICON_HOME;
    onPress(home, () => this.handlers.home());
    const card = h(
      'div',
      { class: 'read-pick' },
      h('div', { class: 'read-pick-info' }, this.level, this.name, this.samples, this.state, this.promise),
      h('div', { class: 'read-actions' }, home, this.play),
    );
    this.node = h('section', { class: 'read-map' }, this.scroller, card);
    const leave = (): void => {
      this.following = false;
    };
    for (const type of ['pointerdown', 'wheel', 'keydown'])
      this.scroller.addEventListener(type, leave, { passive: true });
    // The list is smaller once the words under it have their font, and the card under it is taller
    // when they wrap.
    this.watching =
      typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.following && this.reveal()) : null;
    this.watching?.observe(this.scroller);
    this.update(view);
  }

  destroy(): void {
    this.watching?.disconnect();
  }

  /**
   * Draws the levels as the session says they stand. The one that is picked stays picked, if it is
   * still there.
   */
  update(view: MapView): void {
    const stages = view.chapters.flatMap((chapter) => chapter.stages);
    this.stages = new Map(stages.map((stage) => [stage.n, stage]));
    const where = this.stages.get(this.picked) ?? this.stages.get(view.picked) ?? stages[0]!;
    this.picked = where.n;
    for (const stage of stages) this.draw(stage);
    this.describe(where);
  }

  private draw(stage: StageView): void {
    const node = this.nodes.get(stage.n)!;
    node.dataset.mark = stage.mark;
    node.dataset.picked = String(stage.n === this.picked);
    node.setAttribute('aria-label', stageLabel(stage));
    node.setAttribute('aria-pressed', String(stage.n === this.picked));
    node.lastElementChild!.innerHTML = MARKS[stage.mark];
  }

  private describe(stage: StageView): void {
    this.level.textContent = `Level ${stage.n}`;
    this.name.textContent = stage.title;
    this.samples.replaceChildren(...stage.samples.map((word) => h('li', {}, word)));
    this.state.textContent = `${markLine(stage.mark)}. ${metLine(stage)}`;
    this.promise.replaceChildren(gemChip(stage.prize, 'read-gem', false), h('span', {}, promiseLine(stage)));
    this.promise.dataset.won = String(stage.won);
    this.node.dataset.chapter = stage.chapter;
  }

  /** A level is picked. */
  private pick(n: number): void {
    const stage = this.stages.get(n);
    if (!stage) return;
    const before = this.stages.get(this.picked);
    this.picked = n;
    if (before) this.draw(before);
    this.draw(stage);
    this.describe(stage);
  }

  /**
   * Brings the level the player is on to the middle of the list. It goes by where the level is laid
   * out and not by where it is drawn, since the screen comes on by growing and a level is drawn
   * small and high up while it does.
   */
  reveal(): void {
    const node = this.nodes.get(this.picked);
    if (!node) return;
    this.scroller.scrollTo({
      top: Math.max(0, node.offsetTop - (this.scroller.clientHeight - node.offsetHeight) / 2),
      behavior: 'instant',
    });
  }
}
