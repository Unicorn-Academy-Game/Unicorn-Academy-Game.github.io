import type { ItemView, Piece, ReadHandlers } from '../../../game/reading-ports';
import { flag, focusedIndex, h } from '../../dom';
import { ICON_AGAIN, ICON_DONE, ICON_HELP, ICON_NEXT, ICON_ROSETTE, ICON_SAY, ICON_STAR } from '../icons';
import type { Effect } from './effects';
import { fit } from './fit';
import { gemChip } from './gems';
import { type Group, groupsOf } from './groups';
import { ICON_EYE } from './icons';
import { onPress } from './press';
import { LABELS, milestoneLine, pieceLabel, wonLine } from './text';

/**
 * How a thing to read is laid out, in ems, so a size can be worked out from the width of each piece
 * at one em.
 */
const METRICS = {
  word: {
    gap: 0.2,
    rowGap: 0.2,
    height: 1.5,
    space: 0.45,
    floor: 30,
    ceiling: 240,
    share: 0.27,
    comfort: 46,
    give: 0.1,
  },
  line: {
    gap: 0.3,
    rowGap: 0.3,
    height: 1.7,
    space: 0,
    floor: 19,
    ceiling: 100,
    share: 0.11,
    comfort: Infinity,
    give: 0.1,
  },
} as const;

/**
 * The room round what is written is kept free, for the glow of a tile that is lit, and the bracket
 * over a vowel and its magic e.
 */
const MARGIN_PX = 10;
/**
 * A tap this soon after a thing is read is the one that read it, still settling, and does not take
 * the player on.
 */
const SETTLE_MS = 700;

export interface ItemDeps {
  handlers: ReadHandlers;
  /** Whether the parent asked for fewer effects. */
  calm: () => boolean;
}

/**
 * A button with a picture and a word. It is pressed the moment a finger is down, unless it is given
 * nothing to do then.
 */
function tool(kind: string, aria: string, icon: string, text: string, press: (() => void) | null): HTMLButtonElement {
  const node = h(
    'button',
    { type: 'button', class: `read-tool read-${kind}`, 'aria-label': aria, 'data-content-id': `reading.${kind}` },
    h('span', { class: 'read-icon', 'aria-hidden': 'true' }),
    h('span', { class: 'read-label', 'aria-hidden': 'true' }, text),
  );
  node.firstElementChild!.innerHTML = icon;
  if (press) onPress(node, press);
  return node;
}

/**
 * One thing to read: a word as tiles, or a sentence as words, with the buttons for it. It is built
 * once for each thing the session deals and then drawn again as the session says, so what the
 * player touches keeps its place and its motion. The pieces are written as big as the room lets
 * them be, and the rows they break into are made here, so the size that was worked out is the size
 * that is drawn.
 */
export class ItemPane {
  readonly node: HTMLElement;
  private view: ItemView;
  private readonly groups: readonly Group[];
  private readonly pieces: HTMLButtonElement[] = [];
  private readonly items: HTMLElement[] = [];
  private readonly row: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly caption: HTMLElement;
  private readonly earned: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly tools: HTMLElement;
  private readonly help: HTMLButtonElement;
  private readonly hear: HTMLButtonElement;
  private readonly show: HTMLButtonElement;
  private readonly skip: HTMLButtonElement;
  private readonly once: HTMLButtonElement;
  private readonly check: HTMLButtonElement;
  private readonly hint: HTMLElement;
  private readonly hintText: HTMLElement;
  private readonly answers: HTMLElement;
  private readonly next: HTMLButtonElement;
  private readonly watching: ResizeObserver | null;
  private beat: Animation[] = [];
  private foundAt = -Infinity;
  /**
   * How wide each piece is at one em, once it has been measured. They are measured again when the
   * font arrives.
   */
  private widths: number[] | null = null;
  private broken = '';
  /**
   * What the last fit was for and what it chose. The buttons under a word change with what the
   * player is doing, so the room the word has gets taller and shorter as they go from touching to
   * saying to found, and a word that is written as big as each room lets it would jump in size
   * under their eyes. So while the window and the width of the stage are what they were, a word is
   * never written bigger than it was.
   */
  private lastFit: { readonly window: string; readonly width: number; readonly size: number } | null = null;
  private gone = false;

  constructor(
    view: ItemView,
    private readonly deps: ItemDeps,
  ) {
    this.view = view;
    const { handlers } = deps;
    const metrics = METRICS[view.kind];
    this.caption = h('p', { class: 'read-caption', 'data-content-id': 'reading.caption' });
    this.earned = h('span', { class: 'read-earned', 'aria-hidden': 'true' });
    const says = h('div', { class: 'read-says' }, this.caption, this.earned);

    view.pieces.forEach((piece, at) => {
      this.pieces.push(this.piece(piece, at));
    });
    this.groups = groupsOf(view.pieces);
    for (const group of this.groups) {
      const first = group.bridge ? group.from : group.at;
      const item = group.bridge
        ? h('span', { class: 'read-bridge' }, ...this.pieces.slice(group.from, group.to + 1))
        : this.pieces[group.at]!;
      item.dataset.gap = String(view.pieces[first]!.gap);
      this.items.push(item);
    }
    this.row = h('div', {
      class: 'read-pieces',
      role: 'group',
      'aria-label': view.kind === 'word' ? LABELS.pieces : LABELS.words,
      'data-kind': view.kind,
      style: `--gap:${metrics.gap}em;--row-gap:${metrics.rowGap}em;--height:${metrics.height}em;--space:${metrics.space}em;--size:${metrics.floor * 1.5}px`,
    });
    this.row.append(h('div', { class: 'read-row' }, ...this.items));
    const sparks = Array.from({ length: 9 }, (_, i) =>
      h('span', { class: 'read-spark', 'aria-hidden': 'true', style: `--a:${i * 40 + (i % 2) * 14}deg;--d:${i % 3}` }),
    );
    this.stage = h('div', { class: 'read-stage' }, this.row, ...sparks);

    this.help = tool('help', LABELS.helpSays, ICON_HELP, LABELS.help, () => handlers.help());
    this.hear = tool('hear', LABELS.hear, ICON_SAY, LABELS.hear, () => handlers.hear());
    this.show = tool('show', LABELS.show, ICON_EYE, LABELS.show, () => handlers.show());
    this.skip = tool('skip', LABELS.skip, ICON_NEXT, LABELS.skip, () => handlers.skip());
    this.tools = h('div', { class: 'read-tools' }, this.skip, this.help, this.hear, this.show);

    this.once = tool('once', LABELS.once, ICON_AGAIN, LABELS.once, () => handlers.again());
    this.check = h(
      'button',
      { type: 'button', class: 'read-check', 'aria-label': LABELS.yes, 'data-content-id': 'reading.check' },
      h('span', { class: 'read-icon', 'aria-hidden': 'true' }),
    );
    this.check.firstElementChild!.innerHTML = ICON_DONE;
    // The tick is a plain button and counts when the player lifts their finger, so a finger that
    // slides away, or is taken away by the system, says nothing.
    this.check.addEventListener('click', () => handlers.approve());
    this.hintText = h('span');
    const mark = h('span', { class: 'read-hint-icon', 'aria-hidden': 'true' });
    mark.innerHTML = ICON_DONE;
    this.hint = h('p', { class: 'read-hint', 'data-content-id': 'reading.hint' }, mark, this.hintText);
    this.answers = h(
      'div',
      { class: 'read-answers', role: 'group', 'aria-label': LABELS.answers, 'data-content-id': 'reading.answers' },
      this.once,
      this.check,
    );

    this.banner = h('div', { class: 'read-banner', role: 'status' });
    this.next = tool('next', LABELS.next, ICON_NEXT, LABELS.next, null);

    const foot = h('div', { class: 'read-foot' }, this.tools, this.answers, this.banner, this.next);
    this.node = h(
      'section',
      { class: 'read-item', 'data-kind': view.kind, 'data-phase': view.phase, 'data-deal': view.deal },
      says,
      this.hint,
      this.stage,
      foot,
    );
    // A tap anywhere on a thing that is read goes on, except on a button that does something else.
    // The button that goes on is the only one that does not count.
    this.node.addEventListener('click', (event) => {
      if (!(event.target as Element).closest('button:not(.read-next)')) this.goOn(event.timeStamp);
    });

    this.watching = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.fit()) : null;
    this.watching?.observe(this.stage);
    // The letters are wider or narrower when the font is the one that was asked for, and it arrives
    // when it arrives.
    document.fonts?.addEventListener('loadingdone', this.remeasure);
    void document.fonts?.ready.then(this.remeasure);
    this.update(view);
  }

  private readonly remeasure = (): void => {
    this.widths = null;
    this.lastFit = null;
    this.fit();
  };

  private piece(piece: Piece, at: number): HTMLButtonElement {
    const node = h(
      'button',
      {
        type: 'button',
        class: 'read-piece',
        'data-at': at,
        'data-silent': String(piece.silent),
        'data-split': piece.split ?? 'none',
        'data-content-id': 'reading.piece',
        style: `--i:${at}`,
      },
      h('span', { class: 'read-cap', 'aria-hidden': 'true' }, piece.text),
    );
    onPress(node, () => this.deps.handlers.touch(at));
    return node;
  }

  /** Draws the thing as the session says it stands, in place. */
  update(view: ItemView): void {
    const was = this.view.phase;
    this.view = view;
    const joined = view.phase !== 'touching';
    this.node.dataset.phase = view.phase;
    this.row.dataset.joined = String(joined);
    view.pieces.forEach((piece, at) => {
      const node = this.pieces[at]!;
      const state = at < view.touched ? 'touched' : 'waiting';
      const shining = view.glowing === at;
      node.dataset.state = state;
      node.dataset.glow = String(shining);
      node.tabIndex = joined ? -1 : 0;
      node.setAttribute('aria-label', pieceLabel(view.kind, piece.text, shining ? 'shining' : state));
      if (joined) node.setAttribute('aria-disabled', 'true');
      else node.removeAttribute('aria-disabled');
    });
    this.caption.textContent = view.caption;
    this.tools.hidden = view.phase === 'found';
    this.help.hidden = !view.canHelp;
    this.hear.hidden = !view.canHear;
    this.show.hidden = !view.canShow;
    this.answers.hidden = view.phase === 'found';
    this.once.disabled = !view.canAskAgain;
    this.answers.dataset.live = String(view.canApprove);
    this.check.setAttribute('aria-disabled', String(!view.canApprove));
    this.hintText.textContent = view.hint ?? '';
    this.hint.hidden = view.hint === null || !view.canApprove;
    this.next.hidden = view.phase !== 'found';
    this.drawEarned(view);
    if (view.phase === 'found' && was !== 'found') this.found();
  }

  /**
   * What the player earned, beside the words that say so, and the banner for a level, a chapter or
   * the whole course.
   */
  private drawEarned(view: ItemView): void {
    const earned = view.earned;
    const line = earned ? milestoneLine(earned.cleared, earned.chapter, earned.everything) : null;
    const badge = (kind: string, icon: string): HTMLElement => {
      const node = h('span', { class: `read-${kind}` });
      node.innerHTML = icon;
      return node;
    };
    this.earned.replaceChildren(
      ...(earned?.clean ? [badge('star', ICON_STAR)] : []),
      ...(earned?.reads ? [badge('badge', ICON_ROSETTE)] : []),
    );
    const won = earned?.prize
      ? h(
          'span',
          { class: 'read-banner-line read-banner-prize' },
          gemChip(earned.prize, 'read-gem read-gem-big', false),
          wonLine(earned.prize),
        )
      : null;
    this.banner.replaceChildren(
      ...(line ? [h('span', { class: 'read-banner-line' }, line)] : []),
      ...(won ? [won] : []),
    );
    this.banner.hidden = line === null && won === null;
  }

  private found(): void {
    this.foundAt = performance.now();
    this.stopBeat();
    flag(this.stage, 'burst', 1300);
    this.next.focus({ preventScroll: true });
  }

  /** Plays what a cue means for what is on the screen. */
  play(effects: readonly Effect[]): void {
    if (this.gone) return;
    if (effects.some((effect) => effect.kind === 'light')) this.stopBeat();
    for (const effect of effects) {
      switch (effect.kind) {
        case 'pop':
          flag(this.pieces[effect.piece]!, 'pop', 480);
          break;
        case 'pulse':
          flag(this.pieces[effect.piece]!, 'pulse', 340);
          break;
        case 'nudge':
          flag(this.pieces[effect.piece]!, 'nudge', 400, 'soft');
          break;
        case 'join':
          flag(this.row, 'join', 1000);
          break;
        case 'light':
          this.light(effect);
          break;
        case 'ask':
          flag(this.node, 'asked', 700);
          break;
      }
    }
  }

  /**
   * A piece, or each tile of a word that is said whole, shines for a while as the voice says it.
   */
  private light(effect: Extract<Effect, { kind: 'light' }>): void {
    const calm = this.deps.calm();
    const targets = effect.piece === null ? this.pieces : [this.pieces[effect.piece]];
    const each = effect.piece === null ? effect.seconds / Math.max(1, targets.length) : effect.seconds;
    targets.forEach((target, i) => {
      if (!target || typeof target.animate !== 'function') return;
      const frames: Keyframe[] = calm
        ? [{ filter: 'brightness(1)' }, { filter: 'brightness(1.5)', offset: 0.3 }, { filter: 'brightness(1)' }]
        : [
            { filter: 'brightness(1)', translate: '0 0', scale: '1' },
            { filter: 'brightness(1.4) saturate(1.15)', translate: '0 -5%', scale: '1.08', offset: 0.3 },
            { filter: 'brightness(1)', translate: '0 0', scale: '1' },
          ];
      this.beat.push(
        target.animate(frames, {
          delay: Math.max(0, (effect.after + i * each * 0.75) * 1000),
          duration: Math.max(280, each * 1500),
          easing: 'ease-out',
        }),
      );
    });
  }

  private stopBeat(): void {
    for (const animation of this.beat) animation.cancel();
    this.beat = [];
  }

  /**
   * The thing is read and the player tapped to go on. A tap while it is still settling does not
   * count, and that includes the tap that read it.
   */
  private goOn(tappedAt: number): void {
    if (
      this.view.phase !== 'found' ||
      performance.now() - this.foundAt < SETTLE_MS ||
      tappedAt - this.foundAt < SETTLE_MS
    )
      return;
    this.deps.handlers.next();
  }

  /**
   * What each piece measures, in ems. A tile in the middle of a pop is measured as it is at rest.
   * The screen comes on by growing, and what is drawn while it grows is smaller than what is laid
   * out, so each width is taken back by how much the stage is drawn smaller than it is.
   */
  private measure(): number[] | null {
    const drawn = this.stage.getBoundingClientRect().width;
    if (this.stage.clientWidth === 0 || drawn === 0) return null;
    const scale = drawn / this.stage.clientWidth;
    const now = Number.parseFloat(this.row.style.getPropertyValue('--size'));
    this.row.dataset.measuring = 'true';
    const widths = this.items.map((item) => item.getBoundingClientRect().width / scale / now);
    delete this.row.dataset.measuring;
    return widths.every((width) => width > 0) ? widths : null;
  }

  /**
   * Writes the pieces as big as the room lets them be, in the rows that suit them, and says how big
   * in `--size`.
   */
  fit(): void {
    if (this.gone) return;
    const metrics = METRICS[this.view.kind];
    const room = { width: this.stage.clientWidth - 2 * MARGIN_PX, height: this.stage.clientHeight - 2 * MARGIN_PX };
    if (room.width <= 0 || room.height <= 0) return;
    this.widths ??= this.measure();
    if (!this.widths) return;
    const spaces = this.items.map((item) => (item.dataset.gap === 'true' ? metrics.space : 0));
    const viewport = `${window.innerWidth}x${window.innerHeight}`;
    const still =
      this.lastFit !== null && this.lastFit.window === viewport && this.lastFit.width === this.stage.clientWidth;
    const ceiling = Math.max(
      metrics.floor,
      Math.min(metrics.ceiling, window.innerHeight * metrics.share, still ? this.lastFit!.size : Infinity),
    );
    const fitted = fit({
      widths: this.widths,
      spaces,
      gap: metrics.gap,
      rowGap: metrics.rowGap,
      height: metrics.height,
      room,
      floor: metrics.floor,
      ceiling,
      comfort: metrics.comfort,
      give: metrics.give,
    });
    this.lastFit = { window: viewport, width: this.stage.clientWidth, size: fitted.size };
    this.row.style.setProperty('--size', `${fitted.size}px`);
    this.row.dataset.rows = String(fitted.rows.length);
    this.row.dataset.tight = String(!fitted.fits);
    const breaks = fitted.rows.map((indexes) => indexes.join(',')).join('|');
    if (breaks === this.broken) return;
    this.broken = breaks;
    const focused = this.pieces.find((piece) => piece === document.activeElement);
    this.row.replaceChildren(
      ...fitted.rows.map((indexes) => h('div', { class: 'read-row' }, ...indexes.map((i) => this.items[i]!))),
    );
    focused?.focus({ preventScroll: true });
  }

  /** Moves focus to the next tile or the one before, so a keyboard reaches every one of them. */
  move(by: 1 | -1): void {
    if (this.view.phase !== 'touching') return;
    const at = focusedIndex(this.pieces);
    const to =
      at < 0 ? (by === 1 ? 0 : this.pieces.length - 1) : Math.min(this.pieces.length - 1, Math.max(0, at + by));
    this.pieces[to]!.focus({ preventScroll: true });
  }

  /** Takes it away: everything that was moving stops, and so does everything that was waiting. */
  destroy(): void {
    this.gone = true;
    this.watching?.disconnect();
    document.fonts?.removeEventListener('loadingdone', this.remeasure);
    this.stopBeat();
  }
}
