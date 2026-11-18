import type { Rgba } from '../../core/image';
import {
  both,
  type Canvas2D,
  capsule,
  ellipse,
  heart,
  minus,
  type Pt,
  polygon,
  ring,
  starPoints,
  union,
} from '../../fx/kit';
import { tone } from '../produce';
import {
  BLUE,
  BRICK,
  BROWN,
  CREAM,
  canvas,
  DARKWOOD,
  done,
  GOLD,
  GREEN,
  INK,
  IRON,
  LEAF,
  ONYX,
  PURPLE,
  RED,
  ROSE,
  rect,
  SAND,
  SKY,
  SLATE,
  SNOW,
  STONE,
  WHITE,
  WOOD,
  YELLOW,
} from './shared';

const SILVER = tone('#d5d9ea', 265, 215);
const INKBLUE = tone('#2f3f8f', 270, 230);
const PAPER = tone('#fffaf0', 20, 70);

/** Mail: a cream envelope with a red heart-shaped seal on the flap and a stamp in the corner. */
export function mail(): Rgba {
  const c = canvas();
  c.fill(rect(4, 11, 44, 38), CREAM, { bevel: 2.6 });
  c.flat(
    polygon([
      [4, 11],
      [44, 11],
      [24, 27],
    ]),
    CREAM[5]!,
  );
  c.line(4.6, 11.6, 24, 26.6, CREAM[2]!, 1.2);
  c.line(43.4, 11.6, 24, 26.6, CREAM[2]!, 1.2);
  c.line(4.6, 37.4, 17, 25, CREAM[3]!, 1);
  c.line(43.4, 37.4, 31, 25, CREAM[3]!, 1);
  c.fill(heart(24, 26, 4.4), RED, { bevel: 2 });
  c.fill(rect(34, 14, 41, 22), SKY, { bevel: 1 });
  c.flat(polygon(starPoints(37.5, 18, 5, 2.4, 1)), YELLOW[5]!);
  c.flat(rect(8, 31, 18, 32), CREAM[2]!);
  c.flat(rect(8, 34, 15, 35), CREAM[2]!);
  return done(c);
}

/** A sheet of paper with a folded corner, a title and lines of writing. */
export function page(): Rgba {
  const c = canvas();
  c.fill(
    minus(
      rect(8, 3, 40, 45),
      polygon([
        [30, 3],
        [40, 3],
        [40, 13],
      ]),
    ),
    PAPER,
    { bevel: 2.4 },
  );
  c.fill(
    polygon([
      [30, 3],
      [40, 13],
      [30, 13],
    ]),
    CREAM,
    { bevel: 1.4 },
  );
  c.line(30, 3.6, 30, 13, CREAM[2]!, 0.9);
  c.line(30, 13, 40, 13, CREAM[2]!, 0.9);
  c.flat(rect(12, 8, 24, 10), INKBLUE[3]!);
  for (const [y, w] of [
    [16, 24],
    [20, 22],
    [24, 24],
    [28, 18],
    [34, 24],
    [38, 20],
  ] as const)
    c.flat(rect(12, y, 12 + w, y + 1.2), SLATE[2]!);
  c.fill(heart(34, 38, 2.6), ROSE, { bevel: 1 });
  return done(c);
}

/** A storybook lying open: cream pages with writing on the left and a picture of a castle and star on the right. */
export function story(): Rgba {
  const c = canvas();
  c.fill(rect(2, 9, 46, 42), ROSE, { bevel: 2.4 });
  c.fill(
    polygon([
      [4, 11],
      [23, 14],
      [23, 40],
      [4, 37],
    ]),
    PAPER,
    { bevel: 1.6 },
  );
  c.fill(
    polygon([
      [25, 14],
      [44, 11],
      [44, 37],
      [25, 40],
    ]),
    PAPER,
    { bevel: 1.6 },
  );
  c.flat(rect(23.4, 13, 24.6, 41), CREAM[2]!);
  for (const [y, w] of [
    [16.6, 11],
    [20, 10],
    [23.4, 11],
    [26.8, 9],
    [30.2, 11],
    [33.6, 8],
  ] as const) {
    c.flat(
      polygon([
        [7, y],
        [7 + w, y + 0.6],
        [7 + w, y + 1.8],
        [7, y + 1.2],
      ]),
      SLATE[2]!,
    );
  }
  c.fill(
    polygon([
      [28, 17],
      [41, 15.4],
      [41, 31],
      [28, 32.6],
    ]),
    SKY,
    { bevel: 1.4 },
  );
  c.flat(
    polygon([
      [28, 32.6],
      [28, 28],
      [34, 27],
      [41, 27.6],
      [41, 31],
    ]),
    GREEN[4]!,
  );
  c.fill(rect(31, 22, 38, 29), STONE, { bevel: 1 });
  c.flat(
    polygon([
      [31, 22],
      [34.5, 17.6],
      [38, 22],
    ]),
    RED[4]!,
  );
  c.flat(rect(34, 25, 35.4, 29), INK[2]!);
  c.flat(polygon(starPoints(30.4, 20, 4, 1.6, 0.6)), YELLOW[5]!);
  c.flat(rect(28, 35, 40, 36), SLATE[2]!);
  c.flat(rect(30, 37.6, 38, 38.6), SLATE[2]!);
  return done(c);
}

/** A rolled paper scroll tied with a ribbon. */
export function paper(): Rgba {
  const c = canvas();
  c.fill(rect(9, 13, 39, 35), PAPER, { bevel: 4, gain: 0.8 });
  c.fill(ellipse(9, 24, 4.6, 11.2), SAND, { bevel: 3 });
  c.flat(ellipse(9, 24, 2.2, 6), SAND[2]!);
  c.flat(ellipse(9, 24, 1, 2.6), SAND[1]!);
  c.fill(ellipse(39, 24, 4.6, 11.2), PAPER, { bevel: 3 });
  c.flat(ring(39, 24, 3.2, 1, 2.4), SAND[3]!);
  for (const [y, x1] of [
    [18, 35],
    [22, 33],
    [26, 35],
    [30, 31],
  ] as const)
    c.flat(rect(15, y, x1, y + 1.2), SLATE[2]!);
  c.fill(rect(23, 12, 28, 36), ROSE, { bevel: 1.6 });
  c.fill(
    polygon([
      [24, 35],
      [21, 44],
      [25, 41],
      [26, 44],
      [27, 36],
    ]),
    ROSE,
    { bevel: 1 },
  );
  c.fill(
    polygon([
      [26, 35],
      [31, 43],
      [28, 41],
      [26, 36],
    ]),
    ROSE,
    { bevel: 1 },
  );
  c.fill(ellipse(25.6, 24, 3.2, 3.2), ROSE, { bevel: 2 });
  return done(c);
}

/** A feather quill with an ink pot: a purple feather, a pale shaft and a dark nib. */
export function pen(): Rgba {
  const c = canvas();
  c.fill(ellipse(26, 19, 18, 6, 2.36), PURPLE, { bevel: 4, gain: 0.9 });
  c.fill(ellipse(24.5, 21, 14, 2.6, 2.36), LILACISH, { bevel: 1.4 });
  c.line(41, 3.6, 10, 34, SNOW[4]!, 1.4);
  c.flat(
    polygon([
      [10, 34],
      [7, 38],
      [9.8, 36.4],
      [11.6, 34.4],
    ]),
    INK[2]!,
  );
  for (const [x, y] of [
    [21, 12],
    [27, 8],
    [16, 20],
  ] as const)
    c.line(x, y, x + 4, y - 4, PURPLE[1]!, 0.8);
  c.fill(ellipse(35, 40, 9, 5), INKBLUE, { bevel: 3 });
  c.fill(rect(30, 32, 40, 40), INKBLUE, { bevel: 2.6 });
  c.fill(ellipse(35, 32, 5.4, 2.2), SNOW, { bevel: 1.4 });
  c.flat(ellipse(35, 32.2, 3.6, 1.2), INK[1]!);
  c.flat(rect(31.8, 34, 32.8, 40), WHITE, 140);
  return done(c);
}

const LILACISH = tone('#d9bdf6', 280, 330);

/** A wooden writing desk: a slab top, a cabinet of drawers, a stack of books and an ink pot. */
export function desk(): Rgba {
  const c = canvas();
  c.fill(rect(7, 22, 41, 28), DARKWOOD, { bevel: 1.6 });
  c.fill(rect(8, 28, 22, 45), DARKWOOD, { bevel: 2.4 });
  c.fill(rect(36, 28, 41, 45), DARKWOOD, { bevel: 2 });
  c.fill(rect(2, 18, 46, 23), WOOD, { bevel: 2.4 });
  c.flat(rect(10, 31, 20, 32), DARKWOOD[1]!);
  c.flat(rect(10, 38, 20, 39), DARKWOOD[1]!);
  for (const y of [34, 41.4]) c.fill(ellipse(15, y, 1.5, 1.5), GOLD, { bevel: 1 });
  c.fill(rect(6, 12, 22, 18), BLUE, { bevel: 1.6 });
  c.flat(rect(7, 14, 21, 15), CREAM[4]!);
  c.fill(rect(8, 6, 21, 12), ROSE, { bevel: 1.6 });
  c.flat(rect(9, 8, 20, 9), CREAM[4]!);
  c.fill(ellipse(36, 15.6, 3.6, 2.8), INKBLUE, { bevel: 1.6 });
  c.line(37, 14, 42, 6, PURPLE[4]!, 1.4);
  c.fill(ellipse(41.6, 8, 1.8, 4, 0.4), PURPLE, { bevel: 1 });
  return done(c);
}

/** A treasure map: old paper with folds, mountains, palms, a dotted trail and a big red X. */
export function map(): Rgba {
  const c = canvas();
  c.fill(
    polygon([
      [4, 7],
      [10, 5],
      [18, 7],
      [26, 5],
      [34, 7],
      [44, 5],
      [43, 15],
      [45, 24],
      [43, 33],
      [44, 42],
      [34, 41],
      [26, 43],
      [18, 41],
      [10, 43],
      [4, 41],
      [5, 32],
      [3, 24],
      [5, 15],
    ]),
    SAND,
    { bevel: 3, gain: 0.8 },
  );
  c.flat(rect(17, 6, 18, 42), SAND[2]!, 150);
  c.flat(rect(31, 6, 32, 42), SAND[2]!, 150);
  c.flat(
    polygon([
      [8, 21],
      [13, 11],
      [18, 21],
    ]),
    STONE[3]!,
  );
  c.flat(
    polygon([
      [13, 11],
      [15.4, 15.6],
      [13, 14.4],
      [11.4, 16],
    ]),
    SNOW[5]!,
  );
  c.flat(
    polygon([
      [14, 21],
      [19.6, 14],
      [25, 21],
    ]),
    STONE[2]!,
  );
  c.flat(ellipse(36, 34, 4.6, 3), GREEN[4]!);
  c.line(36, 34, 36, 28, DARKWOOD[3]!, 1);
  c.flat(ellipse(34, 27.6, 2.4, 1.2, -0.5), LEAF[4]!);
  c.flat(ellipse(38.4, 27.6, 2.4, 1.2, 0.5), LEAF[4]!);
  for (const y of [38, 40]) c.flat(rect(8, y, 16, y + 0.8), BLUE[4]!);
  const trail: Pt[] = [
    [10, 33],
    [14, 30],
    [20, 31],
    [24, 27],
    [28, 22],
  ];
  for (let i = 0; i + 1 < trail.length; i++) {
    const [x0, y0] = trail[i]!,
      [x1, y1] = trail[i + 1]!;
    const n = Math.round(Math.hypot(x1 - x0, y1 - y0) / 2.4);
    for (let k = 0; k < n; k++) {
      const t = k / n;
      c.flat(ellipse(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0.9, 0.9), RED[3]!);
    }
  }
  c.line(28, 16.6, 35.6, 24, RED[3]!, 2.4);
  c.line(35.6, 16.6, 28, 24, RED[3]!, 2.4);
  return done(c);
}

/** A globe on a golden stand: blue seas, green lands and curved lines of latitude. */
export function globe(): Rgba {
  const c = canvas();
  const ball = ellipse(24, 20, 16, 16);
  c.fill(ball, BLUE, { bevel: 9, gain: 1.1 });
  c.flat(
    both(
      union(
        ellipse(16, 14, 6, 5, 0.4),
        ellipse(19, 22, 3.6, 5, 0.2),
        ellipse(31, 18, 5, 4.4, -0.3),
        ellipse(30, 28, 4, 3.4),
      ),
      ball,
    ),
    GREEN[4]!,
  );
  c.flat(both(union(ellipse(13, 24, 2, 1.4), ellipse(34, 11, 2.4, 1.6)), ball), LEAF[4]!);
  c.flat(both(ring(24, 20, 10, 0.8, 1), ball), SKY[3]!, 130);
  c.flat(both(rect(23.6, 4, 24.4, 36), ball), SKY[3]!, 130);
  c.flat(ellipse(17, 12, 4, 2, -0.6), WHITE, 160);
  c.flat(
    both(ring(24, 20, 19.4, 1.8, 1), (x, y) => x < 24 && y > 8 && y < 40),
    GOLD[5]!,
  );
  c.fill(rect(22.6, 36, 25.4, 41), GOLD, { bevel: 1.2 });
  c.fill(ellipse(24, 42, 11, 3.6), GOLD, { bevel: 2 });
  return done(c);
}

/** A note of a quarter, drawn the same way in each picture of music. */
function noteAt(
  c: Canvas2D,
  x: number,
  y: number,
  ramp: readonly (readonly [number, number, number])[],
  tall = 17,
): void {
  c.fill(ellipse(x, y, 4.6, 3.4, -0.5), ramp, { bevel: 2.4 });
  c.fill(rect(x + 3.2, y - tall, x + 5, y), ramp, { bevel: 0.8 });
}

/** A song: a little blue bird singing on a branch, notes floating up from its beak. */
export function song(): Rgba {
  const c = canvas();
  c.line(3, 40, 33, 38, DARKWOOD[3]!, 2.4);
  c.fill(
    polygon([
      [6, 30],
      [-1, 38],
      [3, 38],
      [10, 36],
    ]),
    SLATE,
    { bevel: 1.4 },
  );
  c.fill(ellipse(15, 29, 11, 8.6, 0.3), BLUE, { bevel: 5 });
  c.fill(ellipse(16, 33, 7, 4.4, 0.3), CREAM, { bevel: 2.4 });
  c.fill(ellipse(24, 21, 6.6, 6.2), BLUE, { bevel: 4 });
  c.fill(
    polygon([
      [29, 19],
      [35, 20.6],
      [29, 23.4],
    ]),
    GOLD,
    { bevel: 1 },
  );
  c.flat(ellipse(25, 19.6, 1.3, 1.5), INK[1]!);
  c.flat(ellipse(25.4, 19, 0.5, 0.5), WHITE);
  c.fill(ellipse(12, 27, 6.4, 3.6, 0.5), SLATE, { bevel: 2.4 });
  c.line(14, 36.6, 14, 39, GOLD[3]!, 1);
  c.line(19, 37, 19, 39, GOLD[3]!, 1);
  noteAt(c, 36, 14, PURPLE, 9);
  noteAt(c, 42, 28, ROSE, 8);
  c.flat(polygon(starPoints(26, 8, 4, 3, 1)), YELLOW[5]!);
  return done(c);
}

/** A music note: one big purple quarter note with sparkles. */
export function note(): Rgba {
  const c = canvas();
  c.fill(ellipse(18, 36, 9.4, 7, -0.5), PURPLE, { bevel: 5 });
  c.fill(rect(24.4, 6, 28.4, 36), PURPLE, { bevel: 1.8 });
  c.fill(
    polygon([
      [28, 6],
      [38, 14],
      [38, 24],
      [28, 15],
    ]),
    PURPLE,
    { bevel: 2 },
  );
  c.flat(ellipse(14.6, 33.6, 3.2, 1.4, -0.7), LILACISH[5]!, 190);
  for (const [x, y, r] of [
    [39, 33, 3.4],
    [8, 14, 2.6],
    [42, 5, 2.2],
  ] as const)
    c.flat(polygon(starPoints(x, y, 4, r, r * 0.3)), YELLOW[5]!);
  return done(c);
}

/** A silver flute lying on the slant, with gold rings, round keys and a hole to blow in. */
export function flute(): Rgba {
  const c = canvas();
  c.fill(capsule(4, 42, 43, 6, 3.2), SILVER, { bevel: 3.2 });
  for (const t of [0.12, 0.34, 0.72, 0.9]) {
    const x = 4 + 39 * t,
      y = 42 - 36 * t;
    c.fill(ellipse(x, y, 1.2, 4.1, -0.745), GOLD, { bevel: 1 });
  }
  for (const t of [0.46, 0.54, 0.62]) {
    const x = 4 + 39 * t,
      y = 42 - 36 * t;
    c.fill(ellipse(x, y, 2, 2), IRON, { bevel: 1 });
    c.flat(ellipse(x - 0.4, y - 0.4, 0.7, 0.7), WHITE);
  }
  c.flat(ellipse(33, 15, 1.6, 1.2, -0.7), INK[1]!);
  c.line(4.6, 37.6, 36.6, 8, WHITE, 0.8);
  return done(c);
}

interface Strung {
  readonly neckTop: number;
  readonly upper: readonly [cy: number, rx: number, ry: number];
  readonly lower: readonly [cy: number, rx: number, ry: number];
  readonly waist: number;
  readonly wood: readonly (readonly [number, number, number])[];
  readonly spike: boolean;
}

/** The body and neck of a bowed string instrument: a figure of eight with a waist, f-holes and a bridge. */
function stringed(c: Canvas2D, k: Strung): void {
  const [uy, urx, ury] = k.upper;
  const [ly, lrx, lry] = k.lower;
  const bottom = ly + lry;
  c.fill(rect(22.4, k.neckTop, 25.6, uy), DARKWOOD, { bevel: 1.2 });
  c.fill(ellipse(24, k.neckTop - 1, 2.4, 2.6), DARKWOOD, { bevel: 1.4 });
  const waistY = (uy + ury + ly - lry) / 2 + 1;
  const body = minus(
    union(ellipse(24, uy, urx, ury), ellipse(24, ly, lrx, lry)),
    union(ellipse(24 - lrx + 0.6, waistY, k.waist, k.waist), ellipse(24 + lrx - 0.6, waistY, k.waist, k.waist)),
  );
  c.fill(body, k.wood, { bevel: 5, gain: 1.1 });
  const hy = ly - 1;
  for (const sx of [-1, 1]) c.flat(ellipse(24 + sx * 4.8, hy, 0.9, 3.2, sx * 0.3), INK[1]!);
  const by = hy + 0.6;
  c.fill(rect(20.6, by, 27.4, by + 1.4), SNOW, { bevel: 0.8 });
  c.fill(
    polygon([
      [22.2, bottom - 6.4],
      [25.8, bottom - 6.4],
      [24.8, bottom - 1.4],
      [23.2, bottom - 1.4],
    ]),
    INK,
    { bevel: 0.8 },
  );
  for (const sx of [-0.9, -0.3, 0.3, 0.9]) c.line(24 + sx, k.neckTop, 24 + sx * 1.2, by, WHITE, 0.4);
  if (k.spike) c.line(24, bottom, 24, bottom + 2.6, IRON[3]!, 1.4);
}

/** A violin with a brown bow lying across it. */
export function violin(): Rgba {
  const c = canvas();
  stringed(c, { neckTop: 4, upper: [21, 7.6, 6.4], lower: [33, 10, 9.4], waist: 3.6, wood: BRICK, spike: false });
  c.line(40, 6, 36, 44, DARKWOOD[3]!, 1.4);
  c.line(40.8, 8, 37, 42, WHITE, 0.8);
  c.fill(rect(34.6, 40, 37.6, 44), DARKWOOD, { bevel: 1 });
  return done(c);
}

/** A cello: taller, darker, with a long neck, a spike to stand on and a bow. */
export function cello(): Rgba {
  const c = canvas();
  stringed(c, { neckTop: 3, upper: [19, 7.2, 6.4], lower: [32, 9.8, 10], waist: 3.8, wood: BROWN, spike: true });
  c.line(41, 7, 37, 41, DARKWOOD[3]!, 1.4);
  c.line(41.8, 9, 38, 39, WHITE, 0.8);
  return done(c);
}

/** An upright piano: a dark case with sheet music on the stand, white keys and black keys, two golden pedals. */
export function piano(): Rgba {
  const c = canvas();
  c.fill(rect(3, 5, 45, 31), ONYX, { bevel: 3 });
  c.fill(rect(3, 5, 45, 9), ONYX, { bevel: 2, gain: 1.3 });
  c.fill(
    polygon([
      [13, 12],
      [35, 12],
      [37, 25],
      [11, 25],
    ]),
    PAPER,
    { bevel: 1 },
  );
  for (const y of [15, 18, 21]) c.flat(rect(15, y, 33, y + 1), SLATE[2]!);
  for (const [x, y] of [
    [19, 22],
    [26, 21],
  ] as const) {
    c.flat(ellipse(x, y, 1.8, 1.3, -0.4), INK[2]!);
    c.flat(rect(x + 1.4, y - 5, x + 2.2, y), INK[2]!);
  }
  c.fill(rect(3, 30, 45, 40), SNOW, { bevel: 1.6 });
  for (let k = 1; k < 8; k++) c.flat(rect(3 + k * 5.25, 31, 3.6 + k * 5.25, 40), STONE[3]!);
  for (const k of [1, 2, 4, 5, 7]) c.fill(rect(3 + k * 5.25 - 1.8, 30.4, 3 + k * 5.25 + 2.4, 36), INK, { bevel: 1 });
  c.fill(rect(5, 40, 9, 46), ONYX, { bevel: 1.4 });
  c.fill(rect(39, 40, 43, 46), ONYX, { bevel: 1.4 });
  c.fill(rect(20, 42, 23, 45), GOLD, { bevel: 1 });
  c.fill(rect(26, 42, 29, 45), GOLD, { bevel: 1 });
  return done(c);
}

/** A brass trumpet on its side: a wide bell, three valves and looped tubing. */
export function trumpet(): Rgba {
  const c = canvas();
  c.fill(
    polygon([
      [30, 22],
      [30, 30],
      [45, 38],
      [45, 14],
    ]),
    GOLD,
    { bevel: 3 },
  );
  c.flat(ellipse(44.4, 26, 1.6, 12), YELLOW[5]!, 200);
  c.fill(ring(19, 28, 8, 3, 0.8), GOLD, { bevel: 1.8 });
  c.fill(capsule(4, 24, 31, 24, 1.8), GOLD, { bevel: 1.6 });
  c.fill(capsule(7, 31, 31, 31, 1.7), GOLD, { bevel: 1.6 });
  c.fill(ellipse(3.4, 24, 2.6, 3), GOLD, { bevel: 1.6 });
  c.fill(ellipse(7, 31, 1.6, 1.8), GOLD, { bevel: 1 });
  for (const x of [14, 19, 24]) {
    c.fill(rect(x - 1.4, 15, x + 1.4, 25), IRON, { bevel: 1.2 });
    c.fill(ellipse(x, 14, 2.2, 1.6), SNOW, { bevel: 1.2 });
  }
  c.flat(rect(5, 23.4, 29, 24.2), WHITE, 190);
  return done(c);
}

/** A tune: two beamed notes in pink and gold riding a wavy staff of blue lines. */
export function tune(): Rgba {
  const c = canvas();
  const wave: Pt[] = Array.from({ length: 13 }, (_, i) => [3 + i * 3.4, 41 + Math.sin(i * 0.8) * 3] as Pt);
  for (let i = 0; i + 1 < wave.length; i++)
    c.fill(capsule(wave[i]![0], wave[i]![1], wave[i + 1]![0], wave[i + 1]![1], 1.6), GOLD, { bevel: 1.4 });
  c.fill(ellipse(14, 34, 5, 3.8, -0.5), ROSE, { bevel: 2.6 });
  c.fill(ellipse(32, 29, 5, 3.8, -0.5), ROSE, { bevel: 2.6 });
  c.fill(rect(17.4, 8, 19.6, 34), ROSE, { bevel: 0.9 });
  c.fill(rect(35.4, 3, 37.6, 29), ROSE, { bevel: 0.9 });
  c.fill(
    polygon([
      [17.4, 8],
      [37.6, 3],
      [37.6, 9.4],
      [17.4, 14.4],
    ]),
    ROSE,
    { bevel: 1.6 },
  );
  for (const [x, y, r] of [
    [8, 10, 3],
    [43, 20, 2.6],
    [26, 4, 2],
  ] as const)
    c.flat(polygon(starPoints(x, y, 4, r, r * 0.3)), YELLOW[5]!);
  return done(c);
}

export const STUDY = {
  mail,
  page,
  story,
  paper,
  pen,
  desk,
  map,
  globe,
  song,
  note,
  flute,
  violin,
  cello,
  piano,
  trumpet,
  tune,
};
