import { boxOf, type Glyph, type Point, RULES, type Stroke, type WriteKind } from '../../content/letters';
import { along } from '../../game/tracing';

/**
 * What the writing desk draws, worked out from a letter's strokes: the part of the ruled page to
 * show, the lines it is ruled with, and a stroke as the path of a drawing.
 */

/** Room round a letter, in the units of the letter. */
const PAD = 16;
/** A letter is given at least this much width for its height, so a thin one is not on a thin page. */
const LEAST_WIDTH = 0.8;

export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The part of the page a letter is shown in: the letter with room round it, in the middle. */
export function frameOf(glyph: Glyph): Frame {
  const box = boxOf(glyph);
  const y = box.y0 - PAD;
  const h = Math.max(box.y1, RULES.base) + PAD - y;
  const w = Math.max(box.x1 - box.x0 + PAD * 2, h * LEAST_WIDTH);
  return { x: (box.x0 + box.x1) / 2 - w / 2, y, w, h };
}

/** How wide the road and the ink are on a capital, in the units of the letter. */
const ROAD = 16;
const INK = 11;
/** The longer side of a capital's page, which is the page every other letter's is measured against. */
const CAPITAL = RULES.base - RULES.top + PAD * 2;

/**
 * How wide to draw the road and the ink, in the units of the letter. A small letter fills its page,
 * so a unit is bigger on the screen than it is for a capital, and its lines are cut down to stay as
 * wide on the screen as a capital's, which keeps the bowl of an a open.
 */
export function lineWidthsOf(frame: Frame): { road: number; ink: number } {
  const scale = Math.min(1, Math.max(frame.w, frame.h) / CAPITAL);
  return { road: Math.round(ROAD * scale * 10) / 10, ink: Math.round(INK * scale * 10) / 10 };
}

export interface Rule {
  y: number;
  /** The line the letter stands on is whole, and the others are dashes. */
  dashed: boolean;
}

/**
 * The lines a letter is written between. A capital or a numeral has a top and a bottom. A small
 * letter has the line its body fits under as well, and the lines its tall or tailed parts reach.
 */
export function rulesOf(glyph: Glyph, kind: WriteKind): Rule[] {
  const base: Rule = { y: RULES.base, dashed: false };
  if (kind !== 'lower') return [{ y: RULES.top, dashed: false }, base];
  const box = boxOf(glyph);
  return [
    ...(box.y0 < 1 ? [{ y: RULES.top, dashed: true }] : []),
    { y: RULES.body, dashed: true },
    base,
    ...(box.y1 > RULES.base + 5 ? [{ y: RULES.tail, dashed: true }] : []),
  ];
}

const tenth = (n: number): string => String(Math.round(n * 10) / 10);

/** A stroke as the path of a drawing. */
export const pathOf = (points: readonly Point[]): string =>
  points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${tenth(x)} ${tenth(y)}`).join(' ');

/** Where a stroke starts, for the number that says which stroke it is. */
export const startOf = (stroke: Stroke): Point => stroke[0] ?? [0, 0];

/** Nearer than this, two numbers hide each other. */
const CLEAR = 17;

export interface Badge {
  /** Where the line begins, which is where its number goes when it is the line to write. */
  start: Point;
  /** Where its number waits while an earlier line is the one to write, clear of the numbers it would hide. */
  aside: Point;
}

/**
 * Where the number of each line goes. A line that begins close to where an earlier one does keeps
 * its number a little way along its own line until its turn comes, so that both can be read.
 */
export function badgesFor(strokes: readonly Stroke[]): Badge[] {
  const taken: Point[] = [];
  return strokes.map((stroke) => {
    const start = startOf(stroke);
    const clear = ([px, py]: Point): boolean => taken.every(([x, y]) => Math.hypot(x - px, y - py) >= CLEAR);
    const way = along(stroke);
    const aside = clear(start) ? start : (way.find(clear) ?? way.at(-1) ?? start);
    taken.push(start, aside);
    return { start, aside };
  });
}

/**
 * How far a finger may be from the line and still be on it, in the units of the letter. It is the
 * width of a fingertip however big the letter is drawn, kept between a width that is too hard and
 * one so wide that it lets the finger stray.
 */
export function reachFor(unitPx: number): number {
  return Math.max(14, Math.min(26, 40 / Math.max(unitPx, 0.01)));
}

/** The seconds a hint takes to go along the part of a stroke that is left. */
export const hintSeconds = (length: number): number => Math.max(0.9, Math.min(2.6, length / 70));

/** How long a run of points is. */
export function lengthOf(points: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1]!;
    const [bx, by] = points[i]!;
    total += Math.hypot(bx - ax, by - ay);
  }
  return total;
}

/**
 * How the letters go on the grid: how many go across, and how big each is, so that the most room is
 * given to each letter. A letter is never made smaller than `least`, so it can always be pressed,
 * and when they do not all fit the grid scrolls.
 */
export function tilesFor(
  count: number,
  width: number,
  height: number,
  gap: number,
  least: number,
): { columns: number; tile: number } {
  let best = { columns: 1, tile: 0 };
  for (let columns = 1; columns <= count; columns++) {
    const rows = Math.ceil(count / columns);
    const tile = Math.min((width - gap * (columns - 1)) / columns, (height - gap * (rows - 1)) / rows);
    if (tile > best.tile) best = { columns, tile };
  }
  if (best.tile >= least) return { columns: best.columns, tile: Math.floor(best.tile) };
  // Nothing fits, so the letters keep their least size and as many go across as the width has room for.
  const columns = Math.max(1, Math.min(count, Math.floor((width + gap) / (least + gap))));
  return { columns, tile: least };
}
