import { RAIN_PIECE_IDS, type RainPieceId } from '../../../src/content/rain';
import type { RGB } from '../core/color';
import type { Rgba } from '../core/image';
import { Canvas2D, ellipse, type Pt, polygon, starPoints } from '../fx/kit';
import { tone } from './produce';

/**
 * The pieces of the treasure game, as chunky pictures a small child knows at a glance: a cut gem
 * with its facets, a gold coin with a star on it, a gold bar, a banknote. One canvas size, centred
 * on the middle, since they fall through the air.
 */
export const RAIN_CANVAS = { w: 56, h: 56, ox: 28, oy: 28 } as const;

const dark = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const WHITE: RGB = [255, 255, 255];

const GEMS = {
  ruby: tone('#e8315a', 335, 20),
  sapphire: tone('#3a6cf0', 270, 200),
  emerald: tone('#2fc27a', 190, 110),
  amethyst: tone('#a14fe0', 285, 330),
  topaz: tone('#f5b324', 25, 70),
  diamond: tone('#bcd8ff', 250, 200),
} as const;
const GOLD = tone('#f2c22e', 25, 80);
const NOTE = {
  'note-mint': tone('#9fe3b8', 190, 110),
  'note-lilac': tone('#c7aaf5', 270, 330),
  'note-peach': tone('#ffc79a', 340, 70),
} as const;

const done = (c: Canvas2D): Rgba => {
  c.outline((n) => dark(n, 0.42));
  c.outline((n) => dark(n, 0.28), true);
  return c.rgba();
};

/**
 * A brilliant seen from the side: a flat table, two crown facets, and the pavilion cut into three,
 * each a tone of its own. Each facet takes its tones from `ramps(i)`, so one stone can be one
 * colour or all of them.
 */
export function cutGem(ramps: (facet: number) => readonly RGB[]): Rgba {
  const c = new Canvas2D(RAIN_CANVAS.w, RAIN_CANVAS.h);
  const facet = (i: number, pts: readonly Pt[], step: number): void => void c.flat(polygon(pts), ramps(i)[step]!);
  facet(
    0,
    [
      [19, 9],
      [37, 9],
      [34, 20],
      [22, 20],
    ],
    5,
  );
  facet(
    1,
    [
      [9, 20],
      [19, 9],
      [22, 20],
    ],
    3,
  );
  facet(
    2,
    [
      [47, 20],
      [37, 9],
      [34, 20],
    ],
    2,
  );
  facet(
    3,
    [
      [9, 20],
      [22, 20],
      [28, 49],
    ],
    3,
  );
  facet(
    4,
    [
      [22, 20],
      [34, 20],
      [28, 49],
    ],
    4,
  );
  facet(
    5,
    [
      [34, 20],
      [47, 20],
      [28, 49],
    ],
    1,
  );
  // Light on the table, and the little four point glint that says the stone is cut.
  facet(
    0,
    [
      [22, 11],
      [31, 11],
      [29, 14],
      [21, 14],
    ],
    5,
  );
  c.flat(ellipse(17, 24, 1.4, 3.4, -0.35), WHITE, 170);
  c.flat(polygon(starPoints(40, 14, 4, 5, 1.2)), WHITE);
  return done(c);
}

const gem = (color: keyof typeof GEMS): Rgba => cutGem(() => GEMS[color]);

function coin(): Rgba {
  const c = new Canvas2D(RAIN_CANVAS.w, RAIN_CANVAS.h);
  c.fill(ellipse(28, 28, 21, 21), GOLD, { bevel: 7, gain: 1.2 });
  c.flat(ellipse(28, 28, 16, 16), GOLD[1]!);
  c.fill(ellipse(28, 28, 14.6, 14.6), GOLD, { bevel: 5, gain: 0.9, base: 0.74 });
  c.flat(polygon(starPoints(28, 29, 5, 9.4, 4)), GOLD[1]!);
  c.flat(polygon(starPoints(28, 28, 5, 8, 3.4)), GOLD[5]!);
  c.flat(ellipse(17, 17, 1.8, 3.6, -0.7), WHITE, 190);
  return done(c);
}

/**
 * A gold bar, stacked as it is in the treasure house: a lit top, a bright front and a darker end.
 */
function bar(): Rgba {
  const c = new Canvas2D(RAIN_CANVAS.w, RAIN_CANVAS.h);
  c.flat(
    polygon([
      [8, 28],
      [20, 16],
      [50, 16],
      [38, 28],
    ]),
    GOLD[4]!,
  );
  c.flat(
    polygon([
      [22, 19],
      [46, 19],
      [38, 26],
      [14, 26],
    ]),
    GOLD[3]!,
  );
  c.flat(
    polygon([
      [38, 28],
      [50, 16],
      [50, 36],
      [38, 46],
    ]),
    GOLD[1]!,
  );
  c.fill(
    polygon([
      [8, 28],
      [38, 28],
      [38, 46],
      [8, 46],
    ]),
    GOLD,
    { bevel: 4, gain: 1.1, base: 0.7 },
  );
  c.flat(
    polygon([
      [13, 33],
      [33, 33],
      [33, 41],
      [13, 41],
    ]),
    GOLD[2]!,
  );
  c.flat(
    polygon([
      [13, 40],
      [33, 40],
      [33, 41.4],
      [13, 41.4],
    ]),
    GOLD[5]!,
  );
  c.flat(
    polygon([
      [11, 30],
      [36, 30],
      [36, 31.6],
      [11, 31.6],
    ]),
    WHITE,
    200,
  );
  c.flat(polygon(starPoints(46, 20, 4, 3.6, 0.9)), WHITE);
  return done(c);
}

/** A banknote on the slant, with a round seal in the middle and a dot in each corner. */
function note(color: keyof typeof NOTE): Rgba {
  const c = new Canvas2D(RAIN_CANVAS.w, RAIN_CANVAS.h);
  const r = NOTE[color];
  const turn = (x: number, y: number): Pt => {
    const a = -0.28,
      dx = x - 28,
      dy = y - 28;
    return [28 + dx * Math.cos(a) - dy * Math.sin(a), 28 + dx * Math.sin(a) + dy * Math.cos(a)];
  };
  const box = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
    turn(x0, y0),
    turn(x1, y0),
    turn(x1, y1),
    turn(x0, y1),
  ];
  c.fill(polygon(box(5, 12, 51, 44)), r, { bevel: 4, gain: 0.8, base: 0.78 });
  c.flat(polygon(box(9, 16, 47, 40)), r[4]!);
  c.flat(polygon(box(10.6, 17.6, 45.4, 38.4)), r[3]!);
  const [sx, sy] = turn(28, 28);
  c.fill(ellipse(sx, sy, 8.6, 8.6), r, { bevel: 3, gain: 1.2, base: 0.4 });
  c.flat(ellipse(sx, sy, 6, 6), r[5]!);
  c.flat(polygon(starPoints(sx, sy, 5, 4.4, 1.9)), r[1]!);
  for (const [x, y] of [
    [14, 21],
    [42, 21],
    [14, 35],
    [42, 35],
  ] as const) {
    const [px, py] = turn(x, y);
    c.flat(ellipse(px, py, 1.6, 1.6), r[1]!);
  }
  return done(c);
}

export function renderRain(id: RainPieceId): Rgba {
  switch (id) {
    case 'coin':
      return coin();
    case 'bar':
      return bar();
    case 'note-mint':
    case 'note-lilac':
    case 'note-peach':
      return note(id);
    default:
      return gem(id);
  }
}

export { RAIN_PIECE_IDS };
