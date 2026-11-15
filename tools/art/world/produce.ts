import { FOOD_IDS, type FoodId } from '../../../src/content/produce';
import { hex, type RGB, ramp } from '../core/color';
import type { Rgba } from '../core/image';
import { Canvas2D, capsule, ellipse, minus, polygon, type Shape, starPoints, union } from '../fx/kit';

/**
 * Fruit and vegetables, drawn as chunky glossy pictures a small child knows at a glance: the apple
 * is red with a leaf, the carrot is orange with feathery tops. Each is a dome-shaded 2D drawing
 * with an outline in a dark tone of its own colour, on one canvas size, standing on its ground
 * point so it can lie in the grass or sit in a basket.
 */
export const PRODUCE_CANVAS = { w: 44, h: 48, ox: 22, oy: 43 } as const;

export const tone = (base: string, shadowHue: number, lightHue: number): readonly RGB[] =>
  ramp(hex(base), { steps: 6, shadowHue, lightHue, lean: 1, lightness: [-0.32, -0.21, -0.1, 0, 0.09, 0.17] });

const RED = tone('#e8403f', 330, 50);
const TOMATO = tone('#f0482f', 335, 45);
const ORANGE = tone('#f2862b', 335, 60);
const PUMPKIN = tone('#f08a24', 335, 65);
const LEAF = tone('#5cbf4f', 200, 105);
const CABBAGE = tone('#86d46f', 200, 105);
const CABBAGE_OUTER = tone('#4fa58a', 220, 130);
const BERRY = tone('#6fa8ff', 275, 190);
const STRAWBERRY = tone('#f0457a', 330, 40);
const STEM = tone('#7a5a3e', 310, 70);
const dark = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const WHITE: RGB = [255, 255, 255];

const done = (c: Canvas2D): Rgba => {
  c.outline((n) => dark(n, 0.46));
  c.outline((n) => dark(n, 0.3), true);
  return c.rgba();
};

const blade = (
  c: Canvas2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  ramp: readonly RGB[] = LEAF,
): void => {
  c.fill(capsule(x0, y0, x1, y1, r, r * 0.3), ramp, { bevel: 2, gain: 1.1 });
};

function apple(): Rgba {
  const c = new Canvas2D(PRODUCE_CANVAS.w, PRODUCE_CANVAS.h);
  const body = minus(
    union(ellipse(16, 28, 10.5, 12), ellipse(28, 28, 10.5, 12), ellipse(22, 32, 12, 9)),
    ellipse(22, 17.4, 3.4, 2.6),
  );
  c.fill(body, RED, { bevel: 7, gain: 1.2 });
  c.flat(ellipse(14.4, 22.6, 2, 3.4, -0.5), [255, 226, 218]);
  c.flat(ellipse(12.4, 27.6, 1, 1.4), [255, 214, 206]);
  c.line(22, 19, 23.4, 11, STEM[2]!, 2.4);
  c.fill(ellipse(28.6, 12.6, 6, 3, -0.55), LEAF, { bevel: 2 });
  c.line(24, 14.5, 31, 10.4, LEAF[4]!, 1);
  return done(c);
}

function carrot(): Rgba {
  const c = new Canvas2D(PRODUCE_CANVAS.w, PRODUCE_CANVAS.h);
  blade(c, 25, 19, 17, 5, 2.8);
  blade(c, 25, 19, 25.5, 3, 2.8);
  blade(c, 25, 19, 34, 6, 2.8);
  blade(c, 25, 19, 11, 10, 2.2);
  blade(c, 25, 19, 38, 13, 2.2);
  c.fill(capsule(16, 41, 26, 22, 1.6, 7.4), ORANGE, { bevel: 4, gain: 1.15 });
  c.flat(capsule(23, 25, 21, 29, 0.9), [255, 214, 150]);
  for (const [x, y, w] of [
    [26, 29, 5],
    [24, 34, 4],
    [21, 38, 3],
  ] as const)
    c.line(x - w / 2, y + 1, x + w / 2, y - 1, ORANGE[1]!, 1.2);
  return done(c);
}

/**
 * Three berries with a leaf and a twinkle, as blue as a clear morning: the berries that grow in the
 * sky.
 */
function skyBerry(): Rgba {
  const c = new Canvas2D(PRODUCE_CANVAS.w, PRODUCE_CANVAS.h);
  const berries = [
    [14.5, 33.5],
    [29.5, 33],
    [22, 23.5],
  ] as const;
  for (const [x, y] of berries) c.fill(ellipse(x, y, 9.6, 9.6), BERRY, { bevel: 6, gain: 1.2 });
  for (const [x, y] of berries) {
    c.flat(ellipse(x - 3.6, y - 3.6, 1.7, 2.6, -0.6), [232, 244, 255]);
    // The little crown every berry has at its top, which is the one dark mark on it.
    c.flat(polygon(starPoints(x + 1.2, y - 8.2, 5, 2.6, 1)), [44, 58, 150]);
  }
  c.line(22, 15, 22.4, 10.4, STEM[2]!, 2);
  c.fill(ellipse(27.6, 9.6, 6, 2.8, -0.5), LEAF, { bevel: 2 });
  // A four-point twinkle, the sign that they came from the sky.
  c.flat(polygon(starPoints(36, 12, 4, 6.4, 1.5)), [255, 244, 190]);
  c.flat(polygon(starPoints(36, 12, 4, 3, 0.9)), WHITE);
  return done(c);
}

function tomato(): Rgba {
  const c = new Canvas2D(PRODUCE_CANVAS.w, PRODUCE_CANVAS.h);
  c.fill(minus(ellipse(22, 29, 15, 12.6), ellipse(22, 17.8, 3.6, 1.8)), TOMATO, { bevel: 7, gain: 1.2 });
  c.flat(ellipse(14.6, 24.4, 2.2, 3.6, -0.6), [255, 224, 212]);
  c.flat(ellipse(12.6, 30, 1, 1.6), [255, 210, 196]);
  c.fill(polygon(starPoints(22, 17.6, 5, 9.4, 3.4, -Math.PI / 2 + 0.3)), LEAF, { bevel: 2 });
  c.line(22, 17, 23, 10, STEM[2]!, 2.2);
  return done(c);
}

function strawberry(): Rgba {
  const c = new Canvas2D(PRODUCE_CANVAS.w, PRODUCE_CANVAS.h);
  const body = union(
    ellipse(22, 25, 13, 10.5),
    polygon([
      [9.6, 28],
      [34.4, 28],
      [24.4, 42],
      [19.6, 42],
    ]),
  );
  c.fill(body, STRAWBERRY, { bevel: 7, gain: 1.2 });
  c.flat(ellipse(15, 21, 1.8, 3, -0.5), [255, 214, 224]);
  for (const [x, y] of [
    [16, 28],
    [22, 26],
    [28, 29],
    [19, 33],
    [25, 34],
    [22, 39],
    [14, 24],
    [30, 24],
    [22, 21],
  ] as const)
    c.flat(ellipse(x, y, 1, 1.5), [255, 236, 150]);
  c.fill(polygon(starPoints(22, 15.4, 6, 11, 3.6, -Math.PI / 2 + 0.2)), LEAF, { bevel: 2 });
  c.line(22, 15, 23, 9, STEM[2]!, 2);
  return done(c);
}

function pumpkin(): Rgba {
  const c = new Canvas2D(PRODUCE_CANVAS.w, PRODUCE_CANVAS.h);
  const ribs: Shape = union(
    ellipse(10, 29, 8, 11.6),
    ellipse(34, 29, 8, 11.6),
    ellipse(16, 29.6, 8.4, 12.4),
    ellipse(28, 29.6, 8.4, 12.4),
    ellipse(22, 30, 8, 13),
  );
  c.fill(ribs, PUMPKIN, { bevel: 8, gain: 1.15 });
  for (const x of [15.4, 28.6]) c.line(x, 22, x + (x - 22) * 0.1, 39, PUMPKIN[2]!, 1);
  c.flat(ellipse(13.4, 24, 2, 3.2, -0.5), [255, 224, 160]);
  c.fill(capsule(22, 18, 24, 10, 3, 2.4), STEM, { bevel: 2 });
  c.line(24.4, 12, 31, 10, LEAF[3]!, 1.6);
  c.fill(ellipse(32, 10, 3.2, 2.2, -0.2), LEAF, { bevel: 1 });
  return done(c);
}

function cabbage(): Rgba {
  const c = new Canvas2D(PRODUCE_CANVAS.w, PRODUCE_CANVAS.h);
  c.fill(ellipse(22, 30, 19.4, 12.6), CABBAGE_OUTER, { bevel: 6, gain: 1.1, base: 0.5 });
  c.fill(ellipse(12.4, 27, 8.6, 11.2, -0.45), CABBAGE_OUTER, { bevel: 4, gain: 1.2, base: 0.82 });
  c.fill(ellipse(31.6, 27, 8.6, 11.2, 0.45), CABBAGE_OUTER, { bevel: 4, gain: 1.2, base: 0.82 });
  c.fill(ellipse(22, 29.4, 11.6, 11.2), CABBAGE, { bevel: 5, gain: 1.15, base: 0.6 });
  c.fill(ellipse(22, 22.6, 7.2, 8.4), CABBAGE, { bevel: 4, gain: 1.15, base: 0.84 });
  c.flat(capsule(22, 31, 22, 20, 0.7), CABBAGE[5]!);
  c.flat(capsule(15.4, 34, 17, 27, 0.6), CABBAGE[4]!);
  c.flat(capsule(28.6, 34, 27, 27, 0.6), CABBAGE[4]!);
  c.flat(capsule(8.6, 31, 11.4, 24, 0.6), CABBAGE_OUTER[4]!);
  c.flat(capsule(35.4, 31, 32.6, 24, 0.6), CABBAGE_OUTER[4]!);
  c.flat(ellipse(18.6, 19.6, 1.8, 2.6, -0.5), [236, 255, 224]);
  return done(c);
}

const DRAW: Record<FoodId, () => Rgba> = { apple, carrot, 'sky-berry': skyBerry, tomato, strawberry, pumpkin, cabbage };

export function renderProduce(id: FoodId): Rgba {
  return DRAW[id]();
}

export { FOOD_IDS };
