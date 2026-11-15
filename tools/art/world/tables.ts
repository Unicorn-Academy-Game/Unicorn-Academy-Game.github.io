import type { Rgba } from '../core/image';
import type { Mesh } from '../core/mesh';
import { v3 } from '../core/vec';
import { extrude, FRONT, lathe, type P2, TOP } from './arch';
import { starPoly } from './hall';
import { GEM } from './palette';
import { type Canvas, paint, render, TOY, type Toy } from './playground';
import { blob, box } from './prims';
import { SceneBuilder } from './scene';

/**
 * The two tables in front of the palace where she goes to learn, drawn as toys among the toys with
 * the same camera and light as the computer: a round table with cards on it, for the memory game,
 * and an abacus on two feet, for the maths. They are static. What they do when they are tapped is a
 * sparkle, and then the game opens.
 */

/**
 * How many pixels a unit of the model is, the same as the computer's, so the three stand at one
 * size.
 */
export const TABLE_UNIT = 1.3;

/**
 * Both tables are drawn on one canvas, wide enough for the round table and tall enough for the
 * abacus.
 */
export const TABLE_CANVAS: Canvas = { w: 250, h: 200, ox: 125, oy: 160 };

const gold = (b: SceneBuilder): Mesh =>
  b.mesh(b.solid('gold', b.variant('gold', GEM.gold, { bands: [0.2, 0.4, 0.6, 0.8, 0.92] })));

/**
 * A polygon turned by `yaw` about the origin and moved to `(x, y)`, for something that lies on a
 * card that is turned.
 */
const laid = (poly: readonly P2[], yaw: number, x: number, y: number): P2[] =>
  poly.map(([u, v]): P2 => [x + u * Math.cos(yaw) - v * Math.sin(yaw), y + u * Math.sin(yaw) + v * Math.cos(yaw)]);

/**
 * The cards on the table: where each lies, how it is turned, and whether it shows its face. Two
 * that show their faces are the same.
 */
const CARDS = [
  { x: -44, y: -28, yaw: -0.12, up: false },
  { x: 0, y: -30, yaw: 0.07, up: true },
  { x: 44, y: -27, yaw: -0.05, up: false },
  { x: -44, y: 28, yaw: 0.1, up: true },
  { x: 0, y: 29, yaw: -0.08, up: false },
  { x: 44, y: 27, yaw: 0.04, up: false },
] as const;

/** How high the cloth is, which is where the cards lie. */
const SURFACE = 62;

/**
 * The memory table: a round teal table on a wooden stem, with six cards laid out on it. Four lie
 * face down, purple with a gold star, and two lie face up and show the same red apple, which is
 * what the game is about.
 */
export function renderMemoryTable(): Rgba {
  const b = new SceneBuilder();
  const wood = b.mesh(paint(b, 'wood', TOY.wood, 3));
  const cloth = b.mesh(paint(b, 'cloth', TOY.teal, 4));
  lathe(wood, {
    c: v3(0, 0, 0),
    segs: 28,
    smooth: true,
    profile: [
      [46, 0],
      [46, 5],
      [30, 10],
      [14, 18],
      [12, 50],
      [34, 58],
    ],
  });
  lathe(cloth, {
    c: v3(0, 0, SURFACE - 10),
    segs: 40,
    smooth: true,
    profile: [
      [0, 0],
      [60, 0],
      [84, 3],
      [88, 6],
      [86, 10],
      [0, 10],
    ],
  });
  lathe(b.mesh(b.solid('rim', b.variant('rim', GEM.gold, { bands: [0.2, 0.4, 0.6, 0.8, 0.92] }))), {
    c: v3(0, 0, SURFACE - 10),
    segs: 40,
    smooth: true,
    profile: [
      [82, 2.4],
      [90, 4],
      [90, 8],
      [85, 10.2],
    ],
  });
  const back = b.mesh(paint(b, 'card-back', TOY.purple, 5));
  const face = b.mesh(paint(b, 'card-face', TOY.cream, 6));
  const star = gold(b);
  const apple = b.mesh(paint(b, 'apple', TOY.red, 7));
  const leaf = b.mesh(paint(b, 'leaf', TOY.green, 8));
  for (const { x, y, yaw, up } of CARDS) {
    box(up ? face : back, v3(x, y, SURFACE + 1), v3(36, 48, 2), yaw, 0.6);
    if (up) {
      blob(apple, v3(x, y - 1, SURFACE + 9), v3(10, 10, 8.6), yaw, { rings: 7, segs: 12 });
      blob(leaf, v3(x + 4, y + 2, SURFACE + 18), v3(4.6, 2.2, 1.6), yaw + 0.6, { rings: 4, segs: 8 });
    } else {
      extrude(
        star,
        laid(
          starPoly(0, 0, 11, 4.8).map(([u, v]): P2 => [u, -v]),
          yaw,
          x,
          y,
        ),
        TOP(0, 0, SURFACE + 2),
        0,
        1.2,
      );
    }
  }
  return render(b, TABLE_CANVAS, { aoRadius: 7, unit: TABLE_UNIT }).rgba;
}

/**
 * The colour of each rod's beads, from the top rod down, and how many of its five are slid over to
 * the left.
 */
const RODS: readonly { toy: Toy; left: number }[] = [
  { toy: 'red', left: 3 },
  { toy: 'yellow', left: 2 },
  { toy: 'green', left: 4 },
  { toy: 'blue', left: 1 },
  { toy: 'pink', left: 3 },
];
const BEADS = 5;
const BEAD = 15.4;

/**
 * The maths abacus: a wooden frame on two feet with five rods, each strung with five beads in its
 * own colour, slid to either side so that each rod shows a sum, and a gold star on top.
 */
export function renderAbacus(): Rgba {
  const b = new SceneBuilder();
  const wood = b.mesh(paint(b, 'frame', TOY.wood, 3));
  const iron = b.mesh(paint(b, 'rod', TOY.iron, 4));
  const star = gold(b);
  for (const side of [-1, 1]) {
    box(wood, v3(side * 74, 0, 6), v3(16, 48, 12), 0, 1);
    box(wood, v3(side * 74, 0, 58), v3(10, 12, 92), 0, 1.4);
  }
  box(wood, v3(0, 0, 108), v3(158, 12, 10), 0, 1.4);
  box(wood, v3(0, 0, 16), v3(158, 12, 8), 0, 1.4);
  RODS.forEach(({ toy, left }, row) => {
    const z = 92 - row * 16;
    box(iron, v3(0, 0, z), v3(142, 3.4, 3.4), 0, 0);
    const beads = b.mesh(paint(b, `bead-${toy}`, TOY[toy], 10 + row));
    for (let i = 0; i < BEADS; i++) {
      const x = i < left ? -61 + i * BEAD : 61 - (BEADS - 1 - i) * BEAD;
      blob(beads, v3(x, 0, z), v3(7.4, 6.4, 7.8), 0, { rings: 6, segs: 10 });
    }
  });
  extrude(
    star,
    starPoly(0, 0, 12, 5.4).map(([u, v]): P2 => [u, 123 - v]),
    FRONT(0, 3, 0),
    0,
    6,
  );
  return render(b, TABLE_CANVAS, { aoRadius: 7, unit: TABLE_UNIT }).rgba;
}
