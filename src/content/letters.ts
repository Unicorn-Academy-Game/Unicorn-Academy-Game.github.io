import type { LetterCase } from '../shared/learning';

/**
 * How each letter is written, as the strokes a child follows. A stroke is a line to follow from its
 * first point to its last, and the strokes come in the order a teacher would say them: down the
 * stem, then round the bowl. Capitals stand on a line 100 below the top, small letters have their
 * body from 45 to 100 with tall letters reaching 0 and tails reaching 145, so every letter shares
 * the same ruled lines.
 */
export type Point = readonly [x: number, y: number];
export type Stroke = readonly Point[];

export interface Glyph {
  readonly strokes: readonly Stroke[];
}

/** The letters of the alphabet, which are the names the strokes are kept under. */
export const LETTERS: readonly string[] = [...'abcdefghijklmnopqrstuvwxyz'];
/** The ten numerals, from nought to nine. */
export const DIGITS: readonly string[] = [...'0123456789'];

/** What can be written on the desk: capital letters, small letters, or the numerals. */
export type WriteKind = LetterCase | 'digits';
export const WRITE_KINDS: readonly WriteKind[] = ['upper', 'lower', 'digits'];

/** What there is to write of each kind, in the order the desk goes through it. */
export const symbolsOf = (kind: WriteKind): readonly string[] => (kind === 'digits' ? DIGITS : LETTERS);

/** The ruled lines a letter sits on, for the page to draw. */
export const RULES = { top: 0, body: 45, base: 100, tail: 145 } as const;

const STEP = 10;
const tenth = (n: number): number => Math.round(n * 10) / 10;

/**
 * Points round an ellipse, from one angle to another in degrees. Zero is the right and 90 is the
 * bottom, so a bigger angle goes clockwise and a smaller one goes the other way round.
 */
function arc(cx: number, cy: number, rx: number, ry: number, from: number, to: number): Point[] {
  const steps = Math.max(2, Math.ceil(Math.abs(to - from) / STEP));
  return Array.from({ length: steps + 1 }, (_, i): Point => {
    const angle = ((from + ((to - from) * i) / steps) * Math.PI) / 180;
    return [tenth(cx + rx * Math.cos(angle)), tenth(cy + ry * Math.sin(angle))];
  });
}

const line = (...points: Point[]): Stroke => points;
/** Strokes put end to end, where a point that repeats the one before is left out. */
const joined = (...parts: Stroke[]): Stroke =>
  parts.flat().filter((point, i, all) => i === 0 || point[0] !== all[i - 1]![0] || point[1] !== all[i - 1]![1]);

/** A body round as an `o`, which `a`, `d`, `g` and `q` start with and `b` and `p` end with. */
const bowl = (from: number, to: number): Point[] => arc(28, 72.5, 27, 27.5, from, to);
const shoulder = (cx: number, cy: number, r: number): Point[] => arc(cx, cy, r, r, 180, 360);

const UPPER: Readonly<Record<string, readonly Stroke[]>> = {
  a: [line([40, 0], [0, 100]), line([40, 0], [80, 100]), line([14, 66], [66, 66])],
  b: [
    line([0, 0], [0, 100]),
    joined(line([0, 0], [28, 0]), arc(28, 25, 24, 25, -90, 90), line([0, 50])),
    joined(line([0, 50]), arc(32, 75, 28, 25, -90, 90), line([0, 100])),
  ],
  c: [arc(40, 50, 38, 50, -35, -325)],
  d: [line([0, 0], [0, 100]), joined(line([0, 0], [28, 0]), arc(28, 50, 44, 50, -90, 90), line([0, 100]))],
  e: [line([0, 0], [0, 100]), line([0, 0], [58, 0]), line([0, 50], [48, 50]), line([0, 100], [58, 100])],
  f: [line([0, 0], [0, 100]), line([0, 0], [56, 0]), line([0, 50], [46, 50])],
  g: [joined(arc(40, 50, 40, 50, -35, -360), line([44, 50]))],
  h: [line([0, 0], [0, 100]), line([70, 0], [70, 100]), line([0, 50], [70, 50])],
  i: [line([10, 0], [10, 100])],
  j: [joined(line([46, 0], [46, 66]), arc(23, 66, 23, 34, 0, 160))],
  k: [line([0, 0], [0, 100]), line([62, 0], [0, 56]), line([22, 36], [64, 100])],
  l: [line([0, 0], [0, 100]), line([0, 100], [56, 100])],
  m: [line([0, 100], [0, 0]), line([0, 0], [39, 72]), line([39, 72], [78, 0]), line([78, 0], [78, 100])],
  n: [line([0, 100], [0, 0]), line([0, 0], [64, 100]), line([64, 100], [64, 0])],
  o: [arc(40, 50, 40, 50, -90, -450)],
  p: [line([0, 0], [0, 100]), joined(line([0, 0], [28, 0]), arc(28, 26, 28, 26, -90, 90), line([0, 52]))],
  q: [arc(40, 50, 40, 50, -90, -450), line([50, 70], [78, 100])],
  r: [
    line([0, 0], [0, 100]),
    joined(line([0, 0], [28, 0]), arc(28, 26, 28, 26, -90, 90), line([0, 52])),
    line([26, 52], [62, 100]),
  ],
  s: [joined(arc(31, 25, 29, 25, -25, -270), arc(31, 75, 31, 25, -90, 155))],
  t: [line([0, 0], [70, 0]), line([35, 0], [35, 100])],
  u: [joined(line([0, 0], [0, 64]), arc(33, 64, 33, 36, 180, 0), line([66, 0]))],
  v: [line([0, 0], [36, 100]), line([36, 100], [72, 0])],
  w: [line([0, 0], [24, 100]), line([24, 100], [48, 30]), line([48, 30], [72, 100]), line([72, 100], [96, 0])],
  x: [line([0, 0], [68, 100]), line([68, 0], [0, 100])],
  y: [line([0, 0], [34, 50]), line([68, 0], [34, 50]), line([34, 50], [34, 100])],
  z: [line([0, 0], [62, 0]), line([62, 0], [0, 100]), line([0, 100], [62, 100])],
};

const LOWER: Readonly<Record<string, readonly Stroke[]>> = {
  a: [bowl(-40, -400), line([55, 45], [55, 100])],
  b: [line([0, 0], [0, 100]), arc(28, 72.5, 28, 27.5, 180, 540)],
  c: [arc(27, 72.5, 27, 27.5, -40, -320)],
  d: [bowl(-40, -400), line([55, 0], [55, 100])],
  e: [joined(line([0, 72.5], [54, 72.5]), arc(27, 72.5, 27, 27.5, 0, -315))],
  f: [joined(arc(44, 22, 16, 22, -20, -180), line([28, 100])), line([6, 45], [52, 45])],
  g: [bowl(-40, -400), joined(line([55, 45], [55, 120]), arc(31, 120, 24, 24, 0, 150))],
  h: [line([0, 0], [0, 100]), joined(arc(22, 68, 22, 23, 180, 360), line([44, 100]))],
  i: [line([10, 45], [10, 100]), line([10, 20], [10, 24])],
  j: [joined(line([30, 45], [30, 125]), arc(10, 125, 20, 20, 0, 115)), line([30, 20], [30, 24])],
  k: [line([0, 0], [0, 100]), line([46, 45], [0, 78]), line([14, 68], [50, 100])],
  l: [line([10, 0], [10, 100])],
  m: [
    line([0, 45], [0, 100]),
    joined(shoulder(18, 63, 18), line([36, 100])),
    joined(shoulder(54, 63, 18), line([72, 100])),
  ],
  n: [line([0, 45], [0, 100]), joined(arc(22, 67, 22, 22, 180, 360), line([44, 100]))],
  o: [arc(28, 72.5, 28, 27.5, -90, -450)],
  p: [line([0, 45], [0, 145]), arc(28, 72.5, 28, 27.5, 180, 540)],
  q: [bowl(-40, -400), line([55, 45], [55, 145])],
  r: [line([0, 45], [0, 100]), arc(24, 70, 24, 25, 180, 295)],
  s: [joined(arc(22, 59, 19, 14, -25, -270), arc(22, 86, 22, 14, -90, 155))],
  t: [joined(line([22, 12], [22, 84]), arc(36, 84, 14, 16, 180, 60)), line([4, 45], [44, 45])],
  u: [joined(line([0, 45], [0, 78]), arc(22, 78, 22, 22, 180, 0)), line([44, 45], [44, 100])],
  v: [line([0, 45], [25, 100]), line([25, 100], [50, 45])],
  w: [line([0, 45], [16, 100]), line([16, 100], [32, 58]), line([32, 58], [48, 100]), line([48, 100], [64, 45])],
  x: [line([0, 45], [48, 100]), line([48, 45], [0, 100])],
  y: [line([0, 45], [26, 100]), line([50, 45], [8, 142])],
  z: [line([0, 45], [48, 45]), line([48, 45], [0, 100]), line([0, 100], [50, 100])],
};

/** The numerals stand as tall as the capitals, on the same lines. */
const NUMBERS: Readonly<Record<string, readonly Stroke[]>> = {
  '0': [arc(30, 50, 30, 50, -90, -450)],
  '1': [joined(line([6, 26], [32, 0]), line([32, 100]))],
  '2': [joined(arc(30, 27, 27, 27, 190, 400), line([4, 100]), line([58, 100]))],
  '3': [joined(arc(28, 25, 26, 25, 200, 450), arc(28, 75, 29, 25, 270, 520))],
  '4': [line([46, 0], [2, 68], [58, 68]), line([46, 0], [46, 100])],
  '5': [joined(line([52, 0], [12, 0], [8, 44]), arc(28, 69, 29, 31, 235, 520))],
  '6': [joined(arc(50, 68, 50, 68, 262, 180), arc(28, 68, 28, 32, 180, -180))],
  '7': [line([4, 0], [56, 0], [20, 100])],
  '8': [joined(arc(29, 25, 24, 25, -45, -270), arc(29, 75, 29, 25, -90, 270), arc(29, 25, 24, 25, 90, -45))],
  '9': [joined(arc(28, 30, 28, 30, -40, -360), line([56, 100]))],
};

const glyphs = (table: Readonly<Record<string, readonly Stroke[]>>): Readonly<Record<string, Glyph>> =>
  Object.fromEntries(Object.entries(table).map(([symbol, strokes]) => [symbol, { strokes }]));

const GLYPHS: Readonly<Record<WriteKind, Readonly<Record<string, Glyph>>>> = {
  upper: glyphs(UPPER),
  lower: glyphs(LOWER),
  digits: glyphs(NUMBERS),
};

/** The letter or numeral as it is written, or nothing for anything that cannot be written here. */
export const glyphOf = (symbol: string, kind: WriteKind): Glyph | undefined =>
  Object.hasOwn(GLYPHS[kind], symbol) ? GLYPHS[kind][symbol] : undefined;

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The smallest box the strokes fit in. */
export function boxOf(glyph: Glyph): Box {
  const box: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const [x, y] of glyph.strokes.flat()) {
    box.x0 = Math.min(box.x0, x);
    box.y0 = Math.min(box.y0, y);
    box.x1 = Math.max(box.x1, x);
    box.y1 = Math.max(box.y1, y);
  }
  return box;
}
