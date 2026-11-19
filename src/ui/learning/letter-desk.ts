import { type Glyph, glyphOf, type Point, symbolsOf, WRITE_KINDS, type WriteKind } from '../../content/letters';
import { Tracer } from '../../game/tracing';
import type { LetterCase } from '../../shared/learning';
import { type Turn, tell } from '../book-chrome';
import { deviceCalm, flag, h, trapFocus } from '../dom';
import { ICON_AGAIN, ICON_CLOSE, ICON_HELP, ICON_NEXT, ICON_PENCIL, ICON_SAY, ICON_STAR } from './icons';
import './letter-desk.css';
import {
  caseLabel,
  letterDone,
  shown,
  strokeDone,
  tileLabel,
  traceTitle,
  WRITE_LABELS,
  wordOf,
  writtenCount,
} from './write-text';
import { type Frame, frameOf, hintSeconds, lengthOf, pathOf, reachFor, rulesOf, startOf, tilesFor } from './write-view';

/** What the desk needs of the game. */
export interface LetterDeskDeps {
  /** The sheet of the Spell Book, which the desk covers. */
  sheet: HTMLElement;
  /** The kind of letter the player asked for in the settings, which the desk starts with. */
  letters: () => LetterCase;
  /** Whether a parent asked for fewer effects. */
  calm: () => boolean;
  /** Whether the player has written this letter or numeral before. */
  written: (symbol: string, kind: WriteKind) => boolean;
  /** The player has written a letter or a numeral. */
  wrote: (symbol: string, kind: WriteKind) => void;
  /** Says the name of the letter or numeral, and with `both` what a letter sounds like too. */
  say: (symbol: string, both: boolean) => void;
  sounds: { turn(): void; stroke(done: number): void; written(): void };
  /** The desk has gone, and the book is as it was. */
  closed: () => void;
}

const SVG = 'http://www.w3.org/2000/svg';
const RAINBOW = ['#ff5d7a', '#ffa23a', '#ffd75e', '#62d26f', '#4aa8ff', '#9b6bff'];
/** How long the page waits before it shows the way, when it opens and after a finger lifts. */
const HINT_AFTER_MS = 1800;
const OPENING_HINT_MS = 700;
/** The least a letter on the grid is given, so it can always be pressed. */
const LEAST_TILE = 44;
const TILE_GAP = 8;
const TURN_MS = 260;
const BITS = 14;
/**
 * The stars the pen leaves: one for each stretch of the line, a few at a time, each gone in under a
 * second.
 */
const SPARK_EVERY = 9;
const SPARKS_AT_ONCE = 16;
const SPARK_MS = 700;
const STAR = 'M0-8 2.2-2.2 8 0 2.2 2.2 0 8-2.2 2.2-8 0-2.2-2.2z';

const tenth = (n: number): string => String(Math.round(n * 10) / 10);

const iconOf = (svg: string, kind: string): HTMLElement => {
  const node = h('span', { class: kind, 'aria-hidden': 'true' });
  node.innerHTML = svg;
  return node;
};

type View = 'letters' | 'write';

/**
 * Writing the letters and the numbers: a grid of the twenty six letters, capital or small, or of the
 * ten numerals, and a page for the one the player picked. The
 * letter is on the page as a road to follow, with the number of each line on the spot it starts
 * from, and a bright dot that goes along the line to show the way. The finger follows the road
 * from the start, and what it has covered fills with colour. A finger that wanders does nothing
 * and nothing is ever wrong, and the line waits where it got to. When every line is covered the
 * letter shines, says its name and what it sounds like, and goes in the sticker book's count.
 *
 * It covers the Spell Book's sheet, the way the drawing covers the album.
 */
export class LetterDesk {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly count: HTMLElement;
  private readonly pair: HTMLElement;
  private readonly shut: HTMLButtonElement;
  private readonly toggle: HTMLButtonElement;
  private readonly grid: HTMLElement;
  private readonly tiles = new Map<string, HTMLButtonElement>();
  private readonly paper: HTMLElement;
  private readonly live: HTMLElement;
  private readonly help: HTMLButtonElement;
  private readonly next: HTMLButtonElement;
  private svg: SVGSVGElement | null = null;
  private inks: SVGPathElement[] = [];
  private starts: SVGElement[] = [];
  private hinting: SVGGElement | null = null;
  private finger: SVGCircleElement | null = null;
  private sparks: SVGGElement | null = null;
  private lastSpark: Point | null = null;
  private sparked = 0;
  private view: View = 'letters';
  private kind: WriteKind = 'upper';
  /** The kind the tiles on the grid are for. */
  private gridKind: WriteKind | null = null;
  private symbol = 'a';
  private tracer: Tracer | null = null;
  private frame: Frame | null = null;
  private pointer: number | null = null;
  private hintTimer = 0;
  private cleanTimer = 0;
  private helping = 0;
  /** The line whose number was last put on top. */
  private raised = -1;
  private untrap: (() => void) | null = null;
  private watching: ResizeObserver | null = null;
  private covered: Element[] = [];

  constructor(private readonly deps: LetterDeskDeps) {
    this.shut = this.control('write-shut', 'shut', WRITE_LABELS.close, () => this.back());
    this.shut.append(iconOf(ICON_CLOSE, 'write-shut-icon'));
    this.title = h('h3', { class: 'write-title' }, WRITE_LABELS.title);
    this.count = h('b', { class: 'write-count' });
    this.pair = h('span', { class: 'write-pair', 'aria-hidden': 'true' }, h('b', {}), h('b', {}));
    this.toggle = this.control('write-case', 'case', '', () => this.flip());
    this.toggle.append(
      h('span', { class: 'write-case-text', 'aria-hidden': 'true' }, h('i', {}, 'A'), h('i', {}, 'a'), h('i', {}, '1')),
    );
    const head = h(
      'div',
      { class: 'write-head' },
      this.shut,
      h('div', { class: 'write-name' }, iconOf(ICON_PENCIL, 'write-badge'), this.title, this.count, this.pair),
      this.toggle,
    );

    this.grid = h('ul', { class: 'write-grid', 'aria-label': WRITE_LABELS.letters });

    this.paper = h('div', { class: 'write-paper' });
    const prev = this.control('write-prev', 'previous', WRITE_LABELS.previous, () => this.go(-1));
    prev.append(iconOf(ICON_NEXT, 'write-icon'));
    this.next = this.control('write-next', 'next', WRITE_LABELS.next, () => this.go(1));
    this.next.append(iconOf(ICON_NEXT, 'write-icon'));
    const say = this.control('write-say', 'say', WRITE_LABELS.say, () => this.deps.say(this.symbol, true));
    say.append(iconOf(ICON_SAY, 'write-icon'));
    this.help = this.control('write-help', 'help', WRITE_LABELS.help, () => this.assist());
    this.help.append(iconOf(ICON_HELP, 'write-icon'));
    const again = this.control('write-again', 'again', WRITE_LABELS.again, () => this.again());
    again.append(iconOf(ICON_AGAIN, 'write-icon'));
    const trace = h('section', { class: 'write-trace' }, this.paper, prev, say, this.help, again, this.next);

    this.live = h('p', { class: 'write-live', role: 'status', 'aria-live': 'polite' });
    this.root = h(
      'div',
      { class: 'write', role: 'group', 'aria-label': WRITE_LABELS.title, tabindex: -1, 'data-view': 'letters' },
      head,
      this.grid,
      trace,
      this.live,
    );
  }

  get isOpen(): boolean {
    return this.root.isConnected;
  }

  /** Fewer effects, as the parent set them or as the device asks. */
  private calm(): boolean {
    return this.deps.calm() || deviceCalm();
  }

  /** A button of the desk, with the hook the tests and the monkey find it by. */
  private control(classes: string, kind: string, label: string, onclick: () => void): HTMLButtonElement {
    return h('button', {
      type: 'button',
      class: classes,
      'data-content-id': `write.${kind}`,
      'aria-label': label || undefined,
      onclick,
    });
  }

  private makeTile(symbol: string): HTMLElement {
    const mini = document.createElementNS(SVG, 'svg');
    mini.setAttribute('class', 'write-mini');
    mini.setAttribute('aria-hidden', 'true');
    mini.setAttribute('focusable', 'false');
    const star = iconOf(ICON_STAR, 'write-tick');
    const button = h(
      'button',
      {
        type: 'button',
        class: 'write-tile',
        'data-letter': symbol,
        'data-content-id': 'write.tile',
        onclick: () => this.show(symbol),
      },
      mini,
      star,
    );
    this.tiles.set(symbol, button);
    return h('li', { class: 'write-cell' }, button);
  }

  /** Puts the desk over the book, on the letters. */
  open(): void {
    this.kind = this.deps.letters();
    this.symbol = symbolsOf(this.kind)[0]!;
    this.deps.sheet.append(this.root);
    this.deps.sheet.closest<HTMLElement>('.book')?.setAttribute('data-writing', 'true');
    this.covered = [
      ...this.deps.sheet.querySelectorAll(
        ':scope > .book-shut, :scope > .book-head, :scope > .book-tabs, :scope > .book-page',
      ),
    ];
    for (const part of this.covered) part.setAttribute('inert', '');
    this.untrap = trapFocus(this.root);
    this.watching = new ResizeObserver(() => this.fit());
    this.watching.observe(this.grid);
    this.showLetters();
    this.root.focus({ preventScroll: true });
  }

  /** Takes the desk away with nothing said, as the book goes. */
  dismiss(): void {
    this.stopWriting();
    window.clearTimeout(this.cleanTimer);
    this.watching?.disconnect();
    this.watching = null;
    this.untrap?.();
    this.untrap = null;
    for (const part of this.covered) part.removeAttribute('inert');
    this.covered = [];
    this.deps.sheet.closest<HTMLElement>('.book')?.removeAttribute('data-writing');
    this.root.remove();
  }

  /** Goes back to the book. */
  close(): void {
    if (!this.isOpen) return;
    this.dismiss();
    this.deps.closed();
  }

  /** Escape and the corner: off the page and onto the letters, and then back to the book. */
  back(): void {
    if (this.view === 'write') this.showLetters();
    else this.close();
  }

  /** The arrow keys go to the letter before and after, and Home and End to the ends. */
  turn(to: Turn): void {
    if (this.view !== 'write') return;
    if (to === 1 || to === -1) this.go(to);
    else {
      const all = symbolsOf(this.kind);
      this.show(to === 'first' ? all[0]! : all[all.length - 1]!, true);
    }
  }

  private showLetters(): void {
    this.stopWriting();
    this.view = 'letters';
    this.root.dataset.view = 'letters';
    this.root.dataset.case = this.kind;
    this.root.dataset.done = 'false';
    this.title.textContent = WRITE_LABELS.title;
    this.shut.setAttribute('aria-label', WRITE_LABELS.close);
    this.render();
    this.fit();
    this.tiles.get(this.symbol)?.focus({ preventScroll: true });
  }

  /** Draws the grid as the player's letters stand. */
  private render(): void {
    const all = symbolsOf(this.kind);
    const total = all.length;
    if (this.gridKind !== this.kind) {
      this.gridKind = this.kind;
      this.tiles.clear();
      this.grid.replaceChildren(...all.map((symbol) => this.makeTile(symbol)));
      this.grid.setAttribute('aria-label', this.kind === 'digits' ? WRITE_LABELS.numbers : WRITE_LABELS.letters);
    }
    let written = 0;
    for (const symbol of all) {
      const tile = this.tiles.get(symbol);
      const glyph = glyphOf(symbol, this.kind);
      if (!tile || !glyph) continue;
      const done = this.deps.written(symbol, this.kind);
      if (done) written++;
      tile.dataset.written = String(done);
      tile.setAttribute('aria-label', tileLabel(symbol, this.kind, done));
      const mini = tile.querySelector<SVGElement>('.write-mini');
      if (!mini) continue;
      const f = frameOf(glyph);
      mini.setAttribute('viewBox', `${tenth(f.x)} ${tenth(f.y)} ${tenth(f.w)} ${tenth(f.h)}`);
      mini.innerHTML = glyph.strokes.map((stroke) => `<path d="${pathOf(stroke)}"/>`).join('');
    }
    this.count.textContent = `${written}/${total}`;
    this.count.setAttribute('aria-label', writtenCount(written, total, this.kind));
    this.toggle.setAttribute('aria-label', caseLabel(this.kind));
    this.toggle.dataset.case = this.kind;
  }

  /** Sizes the letters on the grid from the room it has, and again when the room changes. */
  private fit(): void {
    const { grid } = this;
    if (!grid.clientWidth || !grid.clientHeight) return;
    const style = getComputedStyle(grid);
    const width = grid.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const height = grid.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const { columns, tile } = tilesFor(symbolsOf(this.kind).length, width, height, TILE_GAP, LEAST_TILE);
    grid.style.setProperty('--cols', String(columns));
    grid.style.setProperty('--tile', `${tile}px`);
  }

  /** Opens the page of a letter. */
  private show(symbol: string, quiet = false, turned?: 1 | -1): void {
    const glyph = glyphOf(symbol, this.kind);
    if (!glyph) return;
    this.stopWriting();
    this.symbol = symbol;
    this.view = 'write';
    this.root.dataset.view = 'write';
    this.root.dataset.done = 'false';
    this.frame = frameOf(glyph);
    this.tracer = new Tracer(glyph, reachFor(1));
    this.draw(glyph);
    this.paint();
    const [big, small] = this.pair.children;
    if (big && small) {
      // A letter is shown in both its forms, and a numeral beside its word.
      big.textContent = this.kind === 'digits' ? symbol : shown(symbol, 'upper');
      small.textContent = this.kind === 'digits' ? wordOf(symbol) : shown(symbol, 'lower');
      (big as HTMLElement).dataset.on = String(this.kind !== 'lower');
      (small as HTMLElement).dataset.on = String(this.kind === 'lower');
    }
    this.title.textContent = traceTitle(symbol, this.kind);
    this.shut.setAttribute('aria-label', WRITE_LABELS.back);
    this.help.removeAttribute('aria-disabled');
    if (!quiet) this.deps.say(symbol, false);
    if (turned) flag(this.paper, 'turn', TURN_MS, turned === 1 ? 'next' : 'back');
    this.scheduleHint(OPENING_HINT_MS);
    this.root.focus({ preventScroll: true });
  }

  /** The letter's road, its colour, the numbers of its lines and the dot that shows the way. */
  private draw(glyph: Glyph): void {
    const f = this.frame!;
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('class', 'write-svg');
    svg.style.setProperty('--r', (f.w / f.h).toFixed(4));
    svg.setAttribute('viewBox', `${tenth(f.x)} ${tenth(f.y)} ${tenth(f.w)} ${tenth(f.h)}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', WRITE_LABELS.paper);
    const stops = RAINBOW.map(
      (colour, i) => `<stop offset="${(i / (RAINBOW.length - 1)).toFixed(2)}" stop-color="${colour}"/>`,
    ).join('');
    const rules = rulesOf(glyph, this.kind)
      .map(
        (rule) =>
          `<line class="write-rule" data-dashed="${rule.dashed}" x1="${tenth(f.x)}" x2="${tenth(f.x + f.w)}" y1="${rule.y}" y2="${rule.y}"/>`,
      )
      .join('');
    const paths = glyph.strokes.map((stroke) => pathOf(stroke));
    const road = paths.map((d) => `<path d="${d}"/>`).join('');
    const ink = paths.map((d) => `<path class="write-ink" d="${d}" pathLength="1"/>`).join('');
    const several = glyph.strokes.length > 1;
    const starts = glyph.strokes
      .map((stroke, i) => {
        const [x, y] = startOf(stroke);
        return `<g class="write-start" data-state="later" transform="translate(${tenth(x)} ${tenth(y)})"><circle r="9.5"/>${
          several ? `<text y="3.8">${i + 1}</text>` : ''
        }</g>`;
      })
      .join('');
    svg.innerHTML =
      `<defs><linearGradient id="write-rainbow" gradientUnits="userSpaceOnUse" x1="${tenth(f.x)}" y1="0" x2="${tenth(f.x + f.w)}" y2="0">${stops}</linearGradient></defs>` +
      `<g class="write-rules">${rules}</g>` +
      `<g class="write-road">${road}</g>` +
      `<g class="write-way">${road}</g>` +
      `<g class="write-inks">${ink}</g>` +
      `<g class="write-starts">${starts}</g>` +
      '<g class="write-sparks" aria-hidden="true"></g>' +
      '<g class="write-hint" data-show="false"><circle class="write-hint-glow" r="15"/><circle class="write-hint-dot" r="6.5"/>' +
      '<animateMotion dur="1.6s" repeatCount="indefinite" begin="indefinite" path="M0 0"/></g>' +
      '<circle class="write-finger" r="11" data-show="false"/>';
    svg.addEventListener('pointerdown', (event) => this.down(event));
    svg.addEventListener('pointermove', (event) => this.move(event));
    svg.addEventListener('pointerup', (event) => this.up(event));
    svg.addEventListener('pointercancel', (event) => this.up(event));
    svg.addEventListener('contextmenu', (event) => event.preventDefault());
    this.paper.replaceChildren(svg);
    this.svg = svg;
    this.inks = [...svg.querySelectorAll<SVGPathElement>('.write-ink')];
    this.starts = [...svg.querySelectorAll<SVGElement>('.write-start')];
    this.raised = -1;
    this.hinting = svg.querySelector<SVGGElement>('.write-hint');
    this.finger = svg.querySelector<SVGCircleElement>('.write-finger');
    this.sparks = svg.querySelector<SVGGElement>('.write-sparks');
    this.lastSpark = null;
  }

  /** Fills each line as far as the player has written it. */
  private paint(): void {
    const { tracer } = this;
    if (!tracer) return;
    const active = tracer.stroke;
    this.inks.forEach((path, i) => {
      const done = tracer.progress(i);
      path.style.strokeDashoffset = String(1 - done);
      path.dataset.on = String(done > 0);
    });
    this.starts.forEach((node, i) => {
      node.dataset.state = active === null || i < active ? 'done' : i === active ? 'now' : 'later';
      // The number of the line being written is above the numbers of lines that start at the same spot.
      if (i === active && active !== this.raised) {
        this.raised = active;
        node.parentNode?.append(node);
      }
    });
    this.svg?.setAttribute('data-stroke', String(active ?? ''));
    this.svg?.setAttribute('data-progress', this.inks.map((_, i) => tracer.progress(i).toFixed(2)).join(' '));
  }

  /** How big a unit of the letter is on the screen, in pixels. */
  private unit(): number {
    const rect = this.svg?.getBoundingClientRect();
    const f = this.frame;
    return rect && f ? Math.min(rect.width / f.w, rect.height / f.h) : 1;
  }

  /** Where a finger is on the letter, in its units. */
  private at(event: PointerEvent): Point | null {
    const matrix = this.svg?.getScreenCTM();
    if (!matrix) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return [point.x, point.y];
  }

  private down(event: PointerEvent): void {
    const { tracer, svg } = this;
    if (!tracer || !svg || this.pointer !== null || this.helping || tracer.done) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    this.pointer = event.pointerId;
    svg.setPointerCapture(event.pointerId);
    this.hideHint();
    tracer.reach = reachFor(this.unit());
    this.follow(event);
  }

  private move(event: PointerEvent): void {
    if (event.pointerId !== this.pointer) return;
    const along = event.getCoalescedEvents?.() ?? [];
    for (const each of along.length > 0 ? along : [event]) this.follow(each);
  }

  private up(event: PointerEvent): void {
    if (event.pointerId !== this.pointer) return;
    if (this.svg?.hasPointerCapture(event.pointerId)) this.svg.releasePointerCapture(event.pointerId);
    this.pointer = null;
    if (this.finger) this.finger.dataset.show = 'false';
    this.scheduleHint(HINT_AFTER_MS);
  }

  /** The finger is here. */
  private follow(event: PointerEvent): void {
    const at = this.at(event);
    if (at) this.touch(at);
  }

  private touch(at: Point): void {
    const { tracer, finger } = this;
    if (!tracer) return;
    if (finger) {
      finger.setAttribute('cx', tenth(at[0]));
      finger.setAttribute('cy', tenth(at[1]));
      finger.dataset.show = 'true';
    }
    const step = tracer.touch(at);
    if (step === 'none') return;
    this.sparkle(at);
    this.paint();
    if (step === 'more') return;
    const done = tracer.stroke ?? this.inks.length;
    this.deps.sounds.stroke(done);
    if (step === 'stroke') tell(this.live, strokeDone(done, this.inks.length));
    else this.finish();
  }

  /** A little star where the line is being written, which fewer effects leaves out. */
  private sparkle(at: Point): void {
    const { sparks, lastSpark } = this;
    if (!sparks || sparks.childElementCount >= SPARKS_AT_ONCE || this.calm()) return;
    if (lastSpark && Math.hypot(at[0] - lastSpark[0], at[1] - lastSpark[1]) < SPARK_EVERY) return;
    this.lastSpark = at;
    const star = document.createElementNS(SVG, 'g');
    star.setAttribute('transform', `translate(${tenth(at[0])} ${tenth(at[1])})`);
    const shape = document.createElementNS(SVG, 'path');
    shape.setAttribute('class', 'write-spark');
    shape.setAttribute('d', STAR);
    shape.style.setProperty('--c', RAINBOW[this.sparked++ % RAINBOW.length]!);
    star.append(shape);
    sparks.append(star);
    shape.addEventListener('animationend', () => star.remove(), { once: true });
    // Where nothing is animated, the star goes all the same.
    window.setTimeout(() => star.remove(), SPARK_MS + 400);
  }

  /** Every line is covered: the letter is written. */
  private finish(): void {
    const { symbol, kind } = this;
    this.root.dataset.done = 'true';
    this.hideHint();
    this.help.setAttribute('aria-disabled', 'true');
    if (this.finger) this.finger.dataset.show = 'false';
    this.deps.wrote(symbol, kind);
    this.deps.sounds.written();
    this.deps.say(symbol, true);
    tell(this.live, letterDone(symbol, kind));
    this.celebrate();
    this.render();
  }

  /** A shower of stars from the letter, which fewer effects leaves out. */
  private celebrate(): void {
    if (this.calm()) return;
    window.clearTimeout(this.cleanTimer);
    const bits = Array.from({ length: BITS }, (_, i) => {
      const bit = h('i', { class: 'write-bit', 'aria-hidden': 'true' });
      bit.style.setProperty('--a', `${(i * 360) / BITS}deg`);
      bit.style.setProperty('--d', `${46 + (i % 3) * 22}%`);
      bit.style.setProperty('--c', RAINBOW[i % RAINBOW.length]!);
      return bit;
    });
    const burst = h('span', { class: 'write-burst', 'aria-hidden': 'true' }, ...bits);
    this.paper.append(burst);
    this.cleanTimer = window.setTimeout(() => burst.remove(), 1500);
  }

  private scheduleHint(after: number): void {
    window.clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => this.showHint(), after);
  }

  private hideHint(): void {
    window.clearTimeout(this.hintTimer);
    if (this.hinting) this.hinting.dataset.show = 'false';
  }

  /** The bright dot goes along what is left of the line, from the start or from where the player got to. */
  private showHint(): void {
    const { tracer, hinting } = this;
    if (!tracer || !hinting || tracer.done || this.pointer !== null || this.helping) return;
    const rest = tracer.rest();
    if (rest.length < 2) return;
    if (this.calm()) {
      const [x, y] = rest[0]!;
      hinting.setAttribute('transform', `translate(${tenth(x)} ${tenth(y)})`);
      hinting.dataset.show = 'still';
      return;
    }
    hinting.removeAttribute('transform');
    const motion = hinting.querySelector<SVGAnimationElement>('animateMotion');
    motion?.setAttribute('path', pathOf(rest));
    motion?.setAttribute('dur', `${hintSeconds(lengthOf(rest)).toFixed(2)}s`);
    hinting.dataset.show = 'true';
    motion?.beginElement();
  }

  /** The letter after this one, or the one before, and round to the other end. */
  private go(by: 1 | -1): void {
    const all = symbolsOf(this.kind);
    const at = all.indexOf(this.symbol);
    const to = all[(at + by + all.length) % all.length]!;
    this.deps.sounds.turn();
    this.show(to, false, by);
  }

  /** The same letter again, from the start. */
  private again(): void {
    this.show(this.symbol, true);
    this.deps.sounds.turn();
  }

  /** The next page of the three: capitals, small letters and numbers, and round to the first. */
  private flip(): void {
    this.kind = WRITE_KINDS[(WRITE_KINDS.indexOf(this.kind) + 1) % WRITE_KINDS.length]!;
    // A letter stays the same letter across the two cases, and a numeral has no other page to go on.
    if (!symbolsOf(this.kind).includes(this.symbol)) this.symbol = symbolsOf(this.kind)[0]!;
    this.root.dataset.case = this.kind;
    this.deps.sounds.turn();
    if (this.view === 'write') this.show(this.symbol, true);
    else {
      this.render();
      this.fit();
    }
  }

  /**
   * Writes the next line for the player, for a hand that cannot make it or a child who would like
   * to see it written. The finger on the page is the writing's own, and the line is covered the way
   * a player's finger would cover it.
   */
  private assist(): void {
    const { tracer } = this;
    if (!tracer || tracer.done || this.helping || this.pointer !== null) return;
    this.hideHint();
    const active = tracer.stroke;
    const route = [...tracer.rest()];
    if (this.calm()) {
      for (const point of route) {
        this.touch(point);
        if (tracer.stroke !== active) break;
      }
      this.scheduleHint(HINT_AFTER_MS);
      return;
    }
    // The writing keeps the pace of the hint, whatever the screen can draw, so a slow one is not slow to write.
    const total = hintSeconds(lengthOf(route)) * 1000;
    const began = performance.now();
    let at = 0;
    const step = (now: number): void => {
      const due = Math.min(route.length, Math.max(1, Math.ceil(((now - began) / total) * route.length)));
      while (at < due && tracer.stroke === active && this.tracer === tracer) this.touch(route[at++]!);
      if (at < route.length && tracer.stroke === active && this.tracer === tracer) {
        this.helping = requestAnimationFrame(step);
        return;
      }
      this.helping = 0;
      if (this.finger) this.finger.dataset.show = 'false';
      this.scheduleHint(HINT_AFTER_MS);
    };
    this.helping = requestAnimationFrame(step);
  }

  /** Stops anything the page is doing for itself, as the player leaves it. */
  private stopWriting(): void {
    window.clearTimeout(this.hintTimer);
    cancelAnimationFrame(this.helping);
    this.helping = 0;
    this.pointer = null;
    this.tracer = null;
    this.svg = null;
    this.inks = [];
    this.starts = [];
    this.hinting = null;
    this.finger = null;
  }
}
