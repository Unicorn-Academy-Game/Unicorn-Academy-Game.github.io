import type { WordId } from '../../../content/lexicon';
import { OPERATION } from '../../../learning/play/maths/clips';
import type { BeadId, Op, ShapeId, Visual } from '../../../learning/play/maths/question';
import { handsText } from '../../../learning/play/maths/shapes';
import { h } from '../../dom';

/**
 * How the maths table draws what a question shows and what its choices are. Each kind of visual is
 * a small piece of the page that sizes itself to the box it is put in, with container units, so the
 * same drawing serves a big picture to look at and a small one on a button.
 */

export interface VisualDeps {
  /** The picture of a word, as an image the page can show. */
  picture: (word: WordId) => string;
}

/** How many to a row and how many rows. */
interface Rows {
  readonly across: number;
  readonly rows: number;
}

/**
 * The room a heap is given, in the two ways it can be laid out: the page picks by how wide the box
 * is.
 */
export interface Room {
  readonly wide: Rows;
  readonly tight: Rows;
}

export interface DrawOptions {
  /** Which colour of the palette a shape without a colour of its own is drawn in. */
  tint: number;
  /** What goes in the place of the gap in a row or a sum, once the question is solved. */
  fill?: Visual | null;
  /**
   * The room that heaps looked at side by side are all given, so that a thing is as big in the
   * small heap as it is in the big one.
   */
  room?: Room | undefined;
}

const INK = '#26183d';
const PALETTE = ['#ff9fc4', '#ffd75e', '#8fd3ff', '#a6e86c', '#c9a2ff', '#ffab70'] as const;

const BEAD_COLOUR: Record<string, string> = {
  red: '#ff6b6b',
  blue: '#5aa9ff',
  yellow: '#ffd75e',
  green: '#7ed957',
  pink: '#ff8fb8',
  orange: '#ffa04d',
};

const num = (n: number): string => n.toFixed(2);

/** How each operation is drawn: the signs a child sees in a book. */
const SIGNS: Readonly<Record<Op, string>> = { '+': '+', '-': '\u2212', '*': '\u00d7', '/': '\u00f7' };

const svg = (inner: string, label?: string): string =>
  `<svg viewBox="0 0 100 100" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'} focusable="false" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round" stroke-linecap="round">${inner}</svg>`;

/**
 * The corners of a regular polygon, with a point at the top when it has an odd number of sides and
 * a flat base when it has an even number, and the shape sat in the middle of the box whatever it
 * is.
 */
function corners(sides: number, radius: number): string {
  const odd = sides % 2 === 1;
  const start = odd ? -Math.PI / 2 : -Math.PI / 2 + Math.PI / sides;
  const down = odd ? (radius * (1 - Math.cos(Math.PI / sides))) / 2 : 0;
  return Array.from({ length: sides }, (_, i) => {
    const a = start + (i / sides) * Math.PI * 2;
    return `${num(50 + Math.cos(a) * radius)},${num(50 + down + Math.sin(a) * radius)}`;
  }).join(' ');
}

const STAR_POINTS = ((): string => {
  const down = (46 * (1 - Math.cos(Math.PI / 5))) / 2;
  return Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? 46 : 19;
    return `${num(50 + Math.cos(a) * r)},${num(50 + down + Math.sin(a) * r)}`;
  }).join(' ');
})();

const HEART = 'M50 88C14 60 8 38 22 24c12-12 24-6 28 6 4-12 16-18 28-6 14 14 8 36-28 64z';

/** The outline of each flat shape, for a colour to fill. */
const OUTLINES: Record<ShapeId, string> = {
  circle: '<circle cx="50" cy="50" r="40"/>',
  square: '<rect x="14" y="14" width="72" height="72" rx="5"/>',
  triangle: `<polygon points="${corners(3, 48)}"/>`,
  rectangle: '<rect x="6" y="27" width="88" height="46" rx="5"/>',
  star: `<polygon points="${STAR_POINTS}"/>`,
  pentagon: `<polygon points="${corners(5, 46)}"/>`,
  hexagon: `<polygon points="${corners(6, 46)}"/>`,
};

const shapeSvg = (shape: ShapeId, colour: string): string => svg(`<g fill="${colour}">${OUTLINES[shape]}</g>`, shape);

const polygonSvg = (sides: number, colour: string): string =>
  svg(`<polygon points="${corners(sides, 44)}" fill="${colour}"/>`, 'A shape');

const BEAD_SHAPES: Record<string, string> = {
  circle: '<circle cx="50" cy="50" r="38"/>',
  square: '<rect x="14" y="14" width="72" height="72" rx="8"/>',
  star: `<polygon points="${STAR_POINTS}"/>`,
  triangle: `<polygon points="${corners(3, 48)}"/>`,
  heart: `<path d="${HEART}"/>`,
  diamond: '<polygon points="50,6 90,50 50,94 10,50"/>',
};

const beadName = (bead: BeadId): string => bead.replace('-', ' ');

function beadSvg(bead: BeadId): string {
  const [colour, shape] = bead.split('-') as [string, string];
  return svg(`<g fill="${BEAD_COLOUR[colour]}">${BEAD_SHAPES[shape]}</g>`, beadName(bead));
}

const hand = (angle: number, length: number): { x: string; y: string } => ({
  x: num(50 + Math.sin((angle * Math.PI) / 180) * length),
  y: num(50 - Math.cos((angle * Math.PI) / 180) * length),
});

/**
 * A clock face with its twelve numbers and two hands, a short thick one for the hours and a long
 * thin one for the minutes. Neither reaches the numbers, so every one can be read.
 */
function clockSvg(hour: number, half: boolean): string {
  const numbers = Array.from({ length: 12 }, (_, i) => {
    const at = hand((i + 1) * 30, 36);
    return `<text x="${at.x}" y="${at.y}" dy="0.36em" text-anchor="middle" font-size="12" font-weight="800" fill="${INK}" stroke="none">${i + 1}</text>`;
  }).join('');
  const hours = hand((hour % 12) * 30 + (half ? 15 : 0), 19);
  const minutes = hand(half ? 180 : 0, 27);
  return svg(
    `<circle cx="50" cy="50" r="46" fill="#fffbe8"/>${numbers}` +
      `<line x1="50" y1="50" x2="${minutes.x}" y2="${minutes.y}" stroke="#e0457b" stroke-width="3.6" fill="none"/>` +
      `<line x1="50" y1="50" x2="${hours.x}" y2="${hours.y}" stroke-width="6.4" fill="none"/>` +
      `<circle cx="50" cy="50" r="4.4" fill="${INK}"/>`,
    handsText({ hour, half }),
  );
}

/**
 * What a screen reader is told of a visual: what is there to see, and never the answer to the
 * question it belongs to.
 */
export function describeVisual(visual: Visual): string {
  switch (visual.kind) {
    case 'things':
      return `${visual.count} ${plural(visual.word, visual.count)}`;
    case 'twice':
      return `Two groups of ${visual.count} ${plural(visual.word, visual.count)}`;
    case 'sequence':
      return `Numbers ${visual.numbers.map((n) => (n === null ? 'and a gap' : String(n))).join(', ')}`;
    case 'sum':
      return `${visual.a} ${OPERATION[visual.op].text} ${visual.b}`;
    case 'expression':
      return visual.terms
        .map((term, at) => (at === 0 ? String(term) : `${OPERATION[visual.ops[at - 1]!].text} ${term}`))
        .join(' ');
    case 'blocks':
      return `${visual.tens} ${visual.tens === 1 ? 'ten' : 'tens'} and ${visual.ones} ${visual.ones === 1 ? 'one' : 'ones'}`;
    case 'number':
      return String(visual.value);
    case 'words':
      return visual.text;
    case 'shape':
      return visual.shape;
    case 'polygon':
      return 'A shape';
    case 'time':
      return `${visual.hour}:${visual.half ? '30' : '00'}`;
    case 'clock':
      return handsText(visual);
    case 'beads':
      return `Beads ${visual.beads.map((b) => (b === null ? 'and a gap' : beadName(b))).join(', ')}`;
    case 'bead':
      return beadName(visual.bead);
  }
}

/** The plural of the name of a thing that can be counted. */
function plural(word: string, count: number): string {
  if (count === 1 || word === 'fish') return word;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(o|s|sh|ch|x)$/.test(word)) return `${word}es`;
  return `${word}s`;
}

/**
 * In a box that is wide enough, all of a heap in one row up to five, and then five to a row, so
 * that a heap is counted in fives.
 */
const wide = (count: number): Rows => ({ across: Math.min(5, count), rows: Math.ceil(count / 5) });

/**
 * In a narrow box a row of five would shrink every picture to a fifth of the width, so the rows are
 * shorter and there are more of them.
 */
function tight(count: number): Rows {
  const across =
    count <= 3 ? count : count <= 8 ? Math.ceil(count / 2) : count <= 12 ? Math.ceil(count / 3) : Math.ceil(count / 4);
  return { across, rows: Math.ceil(count / across) };
}

const biggest = (all: readonly Rows[]): Rows => ({
  across: Math.max(...all.map((r) => r.across)),
  rows: Math.max(...all.map((r) => r.rows)),
});

/**
 * The room that is enough for the biggest of some heaps. A heap that is drawn in it keeps its own
 * rows and sits in the middle of the box.
 */
const roomFor = (...counts: number[]): Room => ({ wide: biggest(counts.map(wide)), tight: biggest(counts.map(tight)) });

/**
 * The room for the choices of a question when they are all heaps of the same thing, and nothing
 * when they are not.
 */
export function sharedRoom(visuals: readonly Visual[]): Room | undefined {
  const counts = visuals.flatMap((visual) => (visual.kind === 'things' ? [visual.count] : []));
  return counts.length > 1 && counts.length === visuals.length ? roomFor(...counts) : undefined;
}

function heap(deps: VisualDeps, word: WordId, count: number, taken = 0, room: Room = roomFor(count)): HTMLElement {
  const items = Array.from({ length: count }, (_, i) =>
    h('img', {
      class: 'mv-thing',
      src: deps.picture(word),
      alt: '',
      draggable: 'false',
      'data-taken': i >= count - taken ? 'true' : null,
    }),
  );
  const own = { wide: wide(count), tight: tight(count) };
  const style = `--across:${own.wide.across};--across-tight:${own.tight.across};--room-across:${room.wide.across};--room-rows:${room.wide.rows};--room-across-tight:${room.tight.across};--room-rows-tight:${room.tight.rows}`;
  return h('div', { class: 'mv-heap', style }, ...items);
}

/**
 * Two heaps with a line between them, in the same room so that a thing is the same size in both.
 */
function twoHeaps(deps: VisualDeps, word: WordId, left: number, right: number): HTMLElement {
  const room = roomFor(left, right);
  return h(
    'div',
    { class: 'mv-twice' },
    heap(deps, word, left, 0, room),
    h('span', { class: 'mv-divider', 'aria-hidden': 'true' }),
    heap(deps, word, right, 0, room),
  );
}

/**
 * What a row of numbers or beads tells the page: how many there are, and whether a narrow box
 * should break it into two rows of half each.
 */
const row = (count: number): { style: string; 'data-long': string | null } => ({
  style: `--count:${count};--half:${Math.ceil(count / 2)}`,
  'data-long': count >= 8 ? 'true' : null,
});

/** The gap in a row, a question mark until the row is filled in. */
const gap = (fill: Visual | null | undefined, kind: 'number' | 'bead'): HTMLElement => {
  if (fill?.kind === 'number' && kind === 'number')
    return h('span', { class: 'mv-num', 'data-filled': 'true' }, String(fill.value));
  if (fill?.kind === 'bead' && kind === 'bead') {
    const node = h('span', { class: 'mv-bead', 'data-filled': 'true' });
    node.innerHTML = beadSvg(fill.bead);
    return node;
  }
  return h('span', { class: kind === 'number' ? 'mv-num mv-gap' : 'mv-bead mv-gap' }, '?');
};

/**
 * A sum of any length written out with its answer left as a gap, as wide as its box allows. How
 * wide the writing is is worked out in ems from the digits it has, so that a long sum is written
 * smaller and a short one bigger, and no sum runs out of its box. The widths are what the game's
 * font measures when it is bold: a number is at least 0.8 em wide and a digit takes about half an
 * em, a sign takes about half an em, and the answer is given room for two digits. Each is a little
 * over, so that writing never comes out wider than the box.
 */
function expression(terms: readonly number[], ops: readonly Op[], fill: Visual | null | undefined): HTMLElement {
  const answer =
    fill?.kind === 'number'
      ? h('span', { class: 'mv-n', 'data-filled': 'true' }, String(fill.value))
      : h('span', { class: 'mv-n mv-gap' }, '?');
  const parts = terms.flatMap((term, at) => [
    at === 0 ? null : h('span', { class: 'mv-sign' }, SIGNS[ops[at - 1]!]),
    h('span', { class: 'mv-n' }, String(term)),
  ]);
  const digits = (n: number): number => Math.max(0.8, 0.54 * String(n).length);
  const tokens = terms.length + ops.length + 2;
  const em = terms.reduce((sum, term) => sum + digits(term), 0) + (ops.length + 1) * 0.54 + 1.1 + (tokens - 1) * 0.28;
  return h(
    'div',
    { class: 'mv-equation mv-expression', style: `--em:${num(em)}` },
    ...parts,
    h('span', { class: 'mv-sign' }, '='),
    answer,
  );
}

const withSvg = (className: string, markup: string): HTMLElement => {
  const node = h('span', { class: className });
  node.innerHTML = markup;
  return node;
};

/**
 * Draws a visual to fill the box it is put in. `options.tint` picks the colour of a shape that has
 * none of its own.
 */
export function drawVisual(visual: Visual, deps: VisualDeps, options: DrawOptions): HTMLElement {
  const colour = PALETTE[options.tint % PALETTE.length]!;
  const node = ((): HTMLElement => {
    switch (visual.kind) {
      case 'things':
        return heap(deps, visual.word, visual.count, 0, options.room);
      case 'twice':
        return twoHeaps(deps, visual.word, visual.count, visual.count);
      case 'sequence':
        return h(
          'div',
          { class: 'mv-sequence', ...row(visual.numbers.length) },
          ...visual.numbers.map((n) =>
            n === null ? gap(options.fill, 'number') : h('span', { class: 'mv-num' }, String(n)),
          ),
        );
      case 'sum': {
        const sign = SIGNS[visual.op];
        const answer =
          options.fill?.kind === 'number'
            ? h('span', { class: 'mv-n', 'data-filled': 'true' }, String(options.fill.value))
            : h('span', { class: 'mv-n mv-gap' }, '?');
        const equation = h(
          'div',
          { class: 'mv-equation' },
          h('span', { class: 'mv-n' }, String(visual.a)),
          h('span', { class: 'mv-sign' }, sign),
          h('span', { class: 'mv-n' }, String(visual.b)),
          h('span', { class: 'mv-sign' }, '='),
          answer,
        );
        if (visual.word === null) return h('div', { class: 'mv-sum' }, equation);
        const things =
          visual.op === '+'
            ? twoHeaps(deps, visual.word, visual.a, visual.b)
            : heap(deps, visual.word, visual.a, visual.b);
        return h('div', { class: 'mv-sum', 'data-with-things': 'true' }, things, equation);
      }
      case 'expression':
        return expression(visual.terms, visual.ops, options.fill);
      case 'blocks': {
        const rods = Array.from({ length: visual.tens }, () =>
          h('span', { class: 'mv-rod' }, ...Array.from({ length: 10 }, () => h('i'))),
        );
        const cubes = Array.from({ length: visual.ones }, () => h('i', { class: 'mv-cube' }));
        return h(
          'div',
          { class: 'mv-blocks', style: `--lines:${visual.tens + (visual.ones > 0 ? 1 : 0)}` },
          ...rods,
          visual.ones > 0 ? h('span', { class: 'mv-ones' }, ...cubes) : null,
        );
      }
      case 'number':
        return h(
          'span',
          { class: 'mv-numeral', style: `--digits:${String(visual.value).length}` },
          String(visual.value),
        );
      case 'words':
        return h('span', { class: 'mv-words' }, visual.text);
      case 'shape':
        return withSvg('mv-shape', shapeSvg(visual.shape, colour));
      case 'polygon':
        return withSvg('mv-shape', polygonSvg(visual.sides, colour));
      case 'time':
        return h('span', { class: 'mv-time' }, `${visual.hour}:${visual.half ? '30' : '00'}`);
      case 'clock':
        return withSvg('mv-clock', clockSvg(visual.hour, visual.half));
      case 'beads':
        return h(
          'div',
          { class: 'mv-beads', ...row(visual.beads.length) },
          ...visual.beads.map((bead) =>
            bead === null ? gap(options.fill, 'bead') : withSvg('mv-bead', beadSvg(bead)),
          ),
        );
      case 'bead':
        return withSvg('mv-bead', beadSvg(visual.bead));
    }
  })();
  node.classList.add('mv', `mv-${visual.kind}`);
  node.dataset.visual = visual.kind;
  return node;
}
