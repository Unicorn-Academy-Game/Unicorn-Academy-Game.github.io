import type { AskView, DoneView, MathsHandlers, MathsScreen, MathsView, PickView } from '../../../game/maths-ports';
import { focusedIndex, h } from '../../dom';
import { ICON_AGAIN, ICON_SAY, ICON_STAR, ICON_STAR_EMPTY } from '../icons';
import { onPress } from '../reading/press';
import { type Parts, PlayFrame } from './frame';
import { Keypad } from './keypad';
import { ICON_GRID, ICON_KEYPAD, ICON_VOICE_OFF, ICON_VOICE_ON, STRAND_ICONS } from './maths-icons';
import { describeVisual, drawVisual, sharedRoom, type VisualDeps } from './maths-visuals';
import './maths.css';
import type { OverlayDeps } from '../../overlay';

export interface MathsTableDeps extends OverlayDeps, VisualDeps {}

const stars = (earned: number, of = 3): string =>
  Array.from({ length: of }, (_, i) => (i < earned ? ICON_STAR : ICON_STAR_EMPTY)).join('');

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/**
 * The parts of the question that is on the screen, which are made once for a question and then say
 * what is chosen.
 */
interface Asking {
  readonly root: HTMLElement;
  readonly show: HTMLElement;
  readonly dots: readonly HTMLElement[];
  readonly choices: readonly HTMLButtonElement[];
  /** The keypad that answers the question, in place of the choices. */
  readonly keypad: Keypad | null;
  /** Whether the gap in what is shown has been filled in. */
  filled: boolean;
}

/**
 * The maths table's screen: tiles to choose a kind of sum from, then a question at a time on a
 * monitor, and a screen for a round that is finished. A choice is a button. The one that is touched
 * and is not right rests and nothing says it was wrong, and the right one lights up gold and fills
 * the gap in what is shown. The question is drawn again in place when it is the same question as
 * before, so a button keeps its motion.
 */
export class MathsTable implements MathsScreen {
  private readonly frame: PlayFrame;
  private title: HTMLElement | null = null;
  private hearing: HTMLButtonElement | null = null;
  /** The child's two switches: the voice at this table, and the keypad that takes the choices' place. */
  private voice: HTMLButtonElement | null = null;
  private keys: HTMLButtonElement | null = null;
  private back: HTMLButtonElement | null = null;
  /** The switch between the families of levels, which is in the top bar while the tiles are up. */
  private families: HTMLElement | null = null;
  private pills: HTMLButtonElement[] = [];
  private asking: Asking | null = null;
  private serial = -1;
  private tiles: HTMLButtonElement[] = [];
  /**
   * What the screen showed last, so the tiles drawn again for a switch of family do not take the
   * focus off the switch.
   */
  private last: MathsView['kind'] | null = null;

  constructor(
    private readonly deps: MathsTableDeps,
    private readonly handlers: MathsHandlers,
  ) {
    this.frame = new PlayFrame(deps, {
      game: 'maths',
      label: 'Maths game',
      tint: 'sky',
      close: () => handlers.close(),
      arrow: (across, down) => this.move(across, down),
      key: (event) => this.asking?.keypad?.type(event) ?? false,
    });
  }

  show(view: MathsView): void {
    const parts = this.frame.isOpen ? this.frame.open('Maths') : this.up();
    if (this.title) this.title.textContent = view.kind === 'pick' ? 'Maths' : view.name;
    if (this.hearing) this.hearing.hidden = !view.speech;
    this.drawSwitches(view);
    if (this.back) this.back.hidden = view.kind === 'pick';
    if (this.families) this.families.hidden = view.kind !== 'pick';
    if (view.kind === 'pick') this.drawPick(parts, view);
    else if (view.kind === 'ask') this.drawAsk(parts, view);
    else this.drawDone(parts, view);
    this.last = view.kind;
    this.frame.tell(view.caption);
  }

  close(): void {
    this.frame.close();
    this.title = null;
    this.hearing = null;
    this.voice = null;
    this.keys = null;
    this.back = null;
    this.families = null;
    this.pills = [];
    this.asking = null;
    this.serial = -1;
    this.tiles = [];
    this.last = null;
  }

  private up(): Parts {
    const parts = this.frame.open('Maths');
    this.title = parts.root.querySelector<HTMLElement>('[data-content-id="maths.title"]');
    this.back = h('button', {
      type: 'button',
      class: 'play-menu round',
      'aria-label': 'Choose what to play',
      'data-content-id': 'maths.menu',
      hidden: true,
    });
    this.back.innerHTML = ICON_GRID;
    onPress(this.back, () => this.handlers.menu());
    this.hearing = h('button', {
      type: 'button',
      class: 'play-hear round',
      'aria-label': 'Hear it again',
      'data-content-id': 'maths.hear',
    });
    this.hearing.innerHTML = ICON_SAY;
    onPress(this.hearing, () => this.handlers.hear());
    this.families = h('div', { class: 'play-sizes', role: 'group', 'aria-label': 'Level', hidden: true });
    this.keys = h('button', {
      type: 'button',
      class: 'play-switch round',
      'aria-label': 'Number keys',
      'data-content-id': 'maths.keys',
    });
    this.keys.innerHTML = ICON_KEYPAD;
    this.keys.addEventListener('mousedown', (event) => event.preventDefault());
    onPress(this.keys, () => this.handlers.keys(this.keys?.getAttribute('aria-pressed') !== 'true'));
    this.voice = h('button', {
      type: 'button',
      class: 'play-switch round',
      'aria-label': 'Voice',
      'data-content-id': 'maths.voice',
      hidden: true,
    });
    // A press with a pointer does not take the keyboard from the screen, or Enter would press the
    // switch again, and not send the number that was typed.
    this.voice.addEventListener('mousedown', (event) => event.preventDefault());
    onPress(this.voice, () => this.handlers.say(this.voice?.getAttribute('aria-pressed') !== 'true'));
    parts.tools.append(this.families, this.keys, this.voice, this.back, this.hearing);
    return parts;
  }

  /**
   * The two switches say how they are now. The voice has one only where there is a voice to turn off,
   * and neither is in the way on the screen that says a round is done.
   */
  private drawSwitches(view: MathsView): void {
    if (this.keys) {
      this.keys.setAttribute('aria-pressed', String(view.keys));
      this.keys.hidden = view.kind === 'done';
    }
    if (this.voice) {
      if (this.voice.dataset.on !== String(view.say)) {
        this.voice.dataset.on = String(view.say);
        this.voice.innerHTML = view.say ? ICON_VOICE_ON : ICON_VOICE_OFF;
      }
      this.voice.setAttribute('aria-pressed', String(view.say));
      this.voice.hidden = !view.voice;
    }
  }

  /**
   * The switch between families of levels, which is made once and then says which one is chosen.
   */
  private drawFamilies(view: PickView): void {
    if (this.pills.length !== view.families.length) {
      this.pills = view.families.map((family) => {
        const pill = h(
          'button',
          { type: 'button', class: 'play-size', 'data-content-id': 'maths.family', 'data-family': family.level },
          h('span', { class: 'play-size-n' }, family.name),
        );
        onPress(pill, () => this.handlers.family(family.level));
        return pill;
      });
      this.families?.replaceChildren(...this.pills);
    }
    view.families.forEach((family, at) => {
      const pill = this.pills[at]!;
      pill.setAttribute('aria-pressed', String(family.chosen));
      pill.setAttribute('aria-label', `${family.name}, ${family.about}`);
    });
  }

  private drawPick(parts: Parts, view: PickView): void {
    this.asking = null;
    this.serial = -1;
    this.drawFamilies(view);
    this.tiles = view.strands.map((strand) => {
      const icon = h('span', { class: 'maths-tile-icon', 'aria-hidden': 'true' });
      icon.innerHTML = STRAND_ICONS[strand.id];
      const lit = strand.rounds > 0 ? strand.level : 0;
      const pips = h(
        'span',
        { class: 'maths-pips', 'aria-hidden': 'true' },
        ...[1, 2, 3].map((n) => h('i', { 'data-on': n <= lit ? 'true' : null })),
      );
      const tile = h(
        'button',
        {
          type: 'button',
          class: 'maths-tile',
          'data-content-id': 'maths.tile',
          'data-strand': strand.id,
          'aria-label': strand.rounds > 0 ? `${strand.name}, level ${strand.level}` : strand.name,
        },
        icon,
        h('span', { class: 'maths-tile-name' }, strand.name),
        pips,
      );
      onPress(tile, () => this.handlers.pick(strand.id));
      return tile;
    });
    const menu = h(
      'div',
      {
        class: 'maths-menu',
        role: 'group',
        'aria-label': 'What shall we play?',
        'data-count': this.tiles.length,
        'data-entering': this.last === 'pick' ? null : 'true',
      },
      ...this.tiles,
    );
    parts.body.replaceChildren(menu);
    if (this.last !== 'pick') this.tiles[0]?.focus({ preventScroll: true });
  }

  private drawAsk(parts: Parts, view: AskView): void {
    if (!this.asking || view.serial !== this.serial || (view.keypad !== null) !== (this.asking.keypad !== null))
      this.question(parts, view);
    const asking = this.asking!;
    const { question } = view;
    if (asking.filled !== view.solved) {
      asking.filled = view.solved;
      this.drawShow(asking, view);
    }
    asking.root.dataset.solved = String(view.solved);
    asking.keypad?.show({
      answer: view.keypad?.answer ?? '',
      misses: view.keypad?.misses ?? 0,
      solved: view.solved,
      hint: view.hint,
    });
    asking.dots.forEach((dot, at) => {
      dot.dataset.state =
        at < view.index || (at === view.index && view.solved) ? 'done' : at === view.index ? 'now' : 'later';
    });
    asking.choices.forEach((node, at) => {
      const state = view.solved && at === question.answer ? 'right' : view.rested.includes(at) ? 'rest' : 'idle';
      if (node.dataset.state !== state) node.dataset.state = state;
      node.dataset.hint = String(view.hint && at === question.answer);
      node.setAttribute('aria-disabled', String(view.solved || state === 'rest'));
    });
  }

  /**
   * A new question: what is asked, what is shown, and the choices, each of them as they were handed
   * over.
   */
  private question(parts: Parts, view: AskView): void {
    const { question } = view;
    const hadFocus = parts.body.contains(document.activeElement) && document.activeElement !== document.body;
    this.serial = view.serial;
    const room = sharedRoom(question.choices.map((choice) => choice.visual));
    // A question that is answered by typing has the keypad where its choices were, and the choices
    // are not drawn at all.
    const keypad = view.keypad
      ? new Keypad({ enter: (value) => this.handlers.enter(value), tap: () => this.handlers.tap() })
      : null;
    const choices = (keypad ? [] : question.choices).map((choice, at) => {
      const inside = h(
        'span',
        { class: 'maths-choice-in' },
        drawVisual(choice.visual, this.deps, { tint: view.serial + at, room }),
      );
      const node = h(
        'button',
        {
          type: 'button',
          class: 'maths-choice',
          'data-content-id': 'maths.choice',
          'data-place': at,
          'data-state': 'idle',
          'aria-label': choice.label,
        },
        inside,
      );
      onPress(node, () => this.handlers.choose(at));
      return node;
    });
    const dots = Array.from({ length: view.length }, () => h('i'));
    const show = h('div', {
      class: 'maths-show',
      hidden: question.show === null,
      role: 'img',
      'aria-label': question.show ? describeVisual(question.show) : null,
    });
    // What is shown goes beside the choices, or over them when it is a long row or when the choices
    // are clocks, which want the width.
    const layout =
      question.show === null
        ? 'row'
        : question.show.kind === 'beads' || question.choices.some((c) => c.visual.kind === 'clock')
          ? 'stack'
          : 'side';
    // Choices that are all a time are long and low, so on a phone held upright they go one under
    // another, and the stage gives them the height.
    const kinds = new Set(question.choices.map((choice) => choice.visual.kind));
    const stage = h(
      'div',
      { class: 'maths-stage', 'data-layout': layout, 'data-kind': kinds.size === 1 ? [...kinds][0] : null },
      show,
      keypad?.root ??
        h(
          'div',
          { class: 'maths-choices', 'data-count': choices.length, role: 'group', 'aria-label': 'Choices' },
          ...choices,
        ),
    );
    const top = h(
      'div',
      { class: 'maths-top' },
      h('p', { class: 'maths-prompt', 'data-content-id': 'maths.prompt' }, question.prompt),
      h(
        'div',
        { class: 'maths-dots', role: 'img', 'aria-label': `Question ${view.index + 1} of ${view.length}` },
        ...dots,
      ),
    );
    const root = h(
      'div',
      { class: 'maths-ask', 'data-entering': 'true', 'data-strand': view.strand, 'data-solved': 'false' },
      top,
      stage,
    );
    window.setTimeout(() => delete root.dataset.entering, 600);
    this.asking = { root, show, dots, choices, keypad, filled: false };
    this.drawShow(this.asking, view);
    parts.body.replaceChildren(root);
    if (hadFocus) (choices[0] ?? parts.panel).focus({ preventScroll: true });
  }

  private drawShow(asking: Asking, view: AskView): void {
    const { question } = view;
    if (!question.show) return;
    const right = question.choices[question.answer]!;
    asking.show.replaceChildren(
      drawVisual(question.show, this.deps, { tint: view.serial, fill: view.solved ? right.visual : null }),
    );
  }

  private drawDone(parts: Parts, view: DoneView): void {
    this.asking = null;
    this.serial = -1;
    const again = h(
      'button',
      { type: 'button', class: 'read-big read-another', 'data-content-id': 'maths.again' },
      h('span', { class: 'read-icon', 'aria-hidden': 'true' }),
      h('span', {}, 'Play again'),
    );
    again.querySelector('.read-icon')!.innerHTML = ICON_AGAIN;
    onPress(again, () => this.handlers.again());
    const other = h(
      'button',
      { type: 'button', class: 'read-big read-quiet', 'data-content-id': 'maths.other' },
      h('span', {}, 'Choose another'),
    );
    onPress(other, () => this.handlers.menu());
    const title = h('p', { class: 'play-won-title', 'data-content-id': 'maths.done' }, 'Well done!');
    const row = h('div', {
      class: 'play-won-stars',
      role: 'img',
      'aria-label': plural(view.stars, 'star', 'stars'),
      'data-stars': view.stars,
    });
    row.innerHTML = stars(view.stars);
    const count = h(
      'p',
      { class: 'play-won-count', 'data-content-id': 'maths.count' },
      `${view.clean} of ${view.length} at the first touch`,
    );
    const up =
      view.next > view.level
        ? h('p', { class: 'maths-levelup', 'data-content-id': 'maths.levelup' }, `On to level ${view.next}!`)
        : null;
    parts.body.replaceChildren(
      h(
        'div',
        { class: 'read-done maths-done', 'data-entering': 'true' },
        title,
        row,
        count,
        up,
        h('div', { class: 'read-actions' }, again, other),
      ),
    );
    again.focus({ preventScroll: true });
  }

  /**
   * Moves the focus a step across or down the tiles or the choices. A step down is as many places
   * on as are along the first line, however they are laid out now.
   */
  private move(across: number, down: number): void {
    const things = this.asking ? [...this.asking.choices] : this.tiles;
    if (things.length === 0) return;
    const now = focusedIndex(things);
    const columns = things.filter((node) => node.offsetTop === things[0]!.offsetTop).length;
    const next = now < 0 ? 0 : now + across + down * columns;
    things[Math.max(0, Math.min(things.length - 1, next))]?.focus({ preventScroll: true });
  }
}
