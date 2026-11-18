import type { Rgba } from '../../core/image';
import { both, type Canvas2D, capsule, ellipse, heart, minus, polygon, starPoints, union } from '../../fx/kit';
import { tone } from '../produce';
import {
  AMBER,
  BLUE,
  BRICK,
  BROWN,
  canvas,
  DARKWOOD,
  done,
  GOLD,
  INK,
  IRON,
  LILAC,
  NIGHT,
  PEACH,
  PINK,
  PURPLE,
  RED,
  ROSE,
  rect,
  SKY,
  SNOW,
  STONE,
  WHITE,
  YELLOW,
} from './shared';

const STEEL = tone('#c9d1e6', 265, 215);
const BLOND = tone('#ffd96a', 25, 80);
const DARKHAIR = tone('#4a3124', 320, 40);

/** The face every royal head shares: a round peach face, two eyes, a small mouth and rosy cheeks. */
function face(c: Canvas2D, cx: number, cy: number, rx: number, ry: number, smile = true): void {
  c.fill(ellipse(cx, cy, rx, ry), PEACH, { bevel: 4 });
  for (const sx of [-1, 1]) {
    c.flat(ellipse(cx + sx * rx * 0.42, cy - ry * 0.05, 1, 1.3), INK[1]!);
    c.flat(ellipse(cx + sx * rx * 0.42 + 0.3, cy - ry * 0.05 - 0.4, 0.4, 0.4), WHITE);
    c.flat(ellipse(cx + sx * rx * 0.62, cy + ry * 0.38, 1.8, 1.2), ROSE[3]!, 170);
  }
  if (smile) c.flat(ellipse(cx, cy + ry * 0.55, 1.8, 0.8), ROSE[2]!);
}

/** A crown of gold with a row of points, pearl tips and a red jewel in the middle. */
function crown(c: Canvas2D, cx: number, y: number, w: number, h: number): void {
  const x0 = cx - w / 2,
    x1 = cx + w / 2;
  c.fill(
    polygon([
      [x0, y + h],
      [x0, y + h * 0.2],
      [x0 + w * 0.2, y + h * 0.6],
      [x0 + w * 0.35, y],
      [cx, y + h * 0.5],
      [x1 - w * 0.35, y],
      [x1 - w * 0.2, y + h * 0.6],
      [x1, y + h * 0.2],
      [x1, y + h],
    ]),
    GOLD,
    { bevel: 1.8 },
  );
  c.fill(ellipse(cx, y + h * 0.72, 1.4, 1.4), RED, { bevel: 1 });
  for (const x of [x0 + w * 0.2, x1 - w * 0.2]) c.fill(ellipse(x, y + h * 0.78, 1, 1), SKY, { bevel: 0.8 });
  for (const x of [x0, x0 + w * 0.35, x1 - w * 0.35, x1])
    c.flat(ellipse(x, y + (x === x0 || x === x1 ? h * 0.2 : 0), 1, 1), SNOW[5]!);
}

/** A king: a tall gold crown, grey whiskers and moustache, a red cloak edged with white fur. */
export function king(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 43, 21, 8), RED, { bevel: 4 });
  c.fill(ellipse(24, 40, 16, 5.4), SNOW, { bevel: 3 });
  for (const x of [12, 17, 24, 31, 36]) c.flat(ellipse(x, 41.4, 0.8, 1.2), INK[2]!);
  c.fill(union(ellipse(24, 30, 12, 12), ellipse(13, 24, 3.6, 8), ellipse(35, 24, 3.6, 8)), STEEL, {
    bevel: 4,
    gain: 0.9,
  });
  face(c, 24, 22, 8.8, 8.4, false);
  c.fill(minus(ellipse(24, 29.4, 10, 8), ellipse(24, 24, 8, 6.4)), STEEL, { bevel: 2.6 });
  c.fill(union(ellipse(19, 26.2, 5, 2), ellipse(29, 26.2, 5, 2)), STEEL, { bevel: 1.4 });
  c.fill(ellipse(24, 33, 3, 1.8), ROSE, { bevel: 1 });
  c.fill(ellipse(24, 33, 2.4, 1), RED, { bevel: 1 });
  c.fill(ellipse(24, 28, 3.6, 1.6), STEEL, { bevel: 1 });
  crown(c, 24, 2, 20, 10);
  return done(c);
}

/** A queen: dark hair in a high sweep, a purple gown with a pearl collar and a crown set with pearls. */
export function queen(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 45, 19, 8), PURPLE, { bevel: 4 });
  c.fill(ellipse(24, 38, 13, 5), SNOW, { bevel: 2 });
  for (let i = 0; i < 7; i++)
    c.fill(ellipse(13 + i * 3.7, 38 + Math.sin((i / 6) * Math.PI) * 3, 1.5, 1.5), SNOW, { bevel: 1 });
  c.fill(union(ellipse(24, 21, 14, 13), ellipse(11, 31, 4.2, 9), ellipse(37, 31, 4.2, 9)), DARKHAIR, { bevel: 4.4 });
  c.fill(ellipse(24, 10, 7, 5), DARKHAIR, { bevel: 3 });
  face(c, 24, 25, 8.6, 9);
  c.fill(minus(ellipse(24, 18, 9.4, 5.2), ellipse(24, 22, 7.6, 5)), DARKHAIR, { bevel: 2 });
  crown(c, 24, 1, 18, 9);
  c.fill(ellipse(24, 36, 2, 2.4), ROSE, { bevel: 1 });
  return done(c);
}

/** A prince: short brown hair, a thin gold circlet, a blue tunic with a gold collar. */
export function prince(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 44, 17, 8), BLUE, { bevel: 4 });
  c.fill(rect(16, 36, 32, 40), GOLD, { bevel: 1.4 });
  c.fill(
    polygon([
      [18, 38],
      [30, 38],
      [24, 46],
    ]),
    BLUE,
    { bevel: 1.6 },
  );
  c.fill(ellipse(24, 22, 15, 15), BROWN, { bevel: 4 });
  face(c, 24, 26, 10, 10);
  c.fill(minus(ellipse(24, 16, 12.6, 7), ellipse(24, 23, 11, 9)), BROWN, { bevel: 2 });
  c.fill(
    polygon([
      [14, 15],
      [34, 15],
      [34, 17.4],
      [14, 17.4],
    ]),
    GOLD,
    { bevel: 1 },
  );
  c.fill(
    polygon([
      [22, 15],
      [24, 8],
      [26, 15],
    ]),
    GOLD,
    { bevel: 1 },
  );
  c.fill(ellipse(24, 13.6, 1.4, 1.4), RED, { bevel: 1 });
  return done(c);
}

/** A princess: long golden hair, a small tiara with a pink jewel, a pink gown with a lace collar. */
export function princess(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 45, 17, 7), PINK, { bevel: 4 });
  c.fill(ellipse(24, 39, 10, 3.4), SNOW, { bevel: 2 });
  c.fill(union(ellipse(24, 22, 15, 15), ellipse(10.6, 34, 4.4, 11), ellipse(37.4, 34, 4.4, 11)), BLOND, { bevel: 4.4 });
  face(c, 24, 26, 9.4, 10);
  c.fill(minus(ellipse(24, 16, 12.4, 7), ellipse(24, 23, 11, 9)), BLOND, { bevel: 2 });
  c.fill(
    polygon([
      [17, 11],
      [19, 5],
      [22, 9],
      [24, 3],
      [26, 9],
      [29, 5],
      [31, 11],
    ]),
    GOLD,
    { bevel: 1.2 },
  );
  c.fill(ellipse(24, 7.4, 1.4, 1.4), ROSE, { bevel: 1 });
  c.fill(ellipse(10.6, 24, 2, 2), ROSE, { bevel: 1 });
  c.fill(heart(35, 11, 2.4), PINK, { bevel: 1 });
  return done(c);
}

/** A knight: iron helmet and a red plume, a cross on the breastplate, a sword in one hand and a blue shield on the other arm. */
export function knight(): Rgba {
  const c = canvas();
  c.fill(rect(15, 34, 21, 46), STEEL, { bevel: 1.6 });
  c.fill(rect(27, 34, 33, 46), STEEL, { bevel: 1.6 });
  c.fill(rect(13, 44, 22, 47), IRON, { bevel: 1 });
  c.fill(rect(26, 44, 35, 47), IRON, { bevel: 1 });
  c.fill(rect(14, 20, 34, 36), STEEL, { bevel: 3 });
  c.fill(rect(22.4, 22, 25.6, 34), RED, { bevel: 1 });
  c.fill(rect(18, 26, 30, 29), RED, { bevel: 1 });
  c.fill(capsule(36, 25, 41, 22, 2.4), STEEL, { bevel: 1.4 });
  c.fill(rect(40.4, 2, 42.8, 20), STEEL, { bevel: 0.8 });
  c.fill(rect(38, 19, 45, 21), GOLD, { bevel: 0.8 });
  c.fill(
    polygon([
      [3, 22],
      [14, 22],
      [14, 33],
      [8.6, 40],
      [3, 33],
    ]),
    BLUE,
    { bevel: 2 },
  );
  c.flat(polygon(starPoints(8.6, 29, 5, 3, 1.3)), YELLOW[5]!);
  c.fill(ellipse(24, 12, 9, 9.4), STEEL, { bevel: 4 });
  c.flat(rect(17, 11, 31, 14), INK[1]!);
  c.flat(rect(23.4, 7, 24.6, 20), IRON[2]!);
  c.fill(ellipse(24, 3, 3, 4.4, 0.5), RED, { bevel: 2 });
  return done(c);
}

/** A sword: a long steel blade with a groove, a gold crossguard, a wrapped hilt and a blue gem on the pommel. */
export function sword(): Rgba {
  const c = canvas();
  c.fill(
    polygon([
      [24, 1],
      [28, 6],
      [28, 30],
      [20, 30],
      [20, 6],
    ]),
    STEEL,
    { bevel: 2.4 },
  );
  c.flat(rect(23.4, 5, 24.6, 29), STONE[2]!);
  c.flat(rect(20.6, 6, 21.6, 29), WHITE, 220);
  c.fill(rect(10, 29, 38, 33), GOLD, { bevel: 1.8 });
  c.fill(ellipse(10, 31, 2.4, 3), GOLD, { bevel: 1.4 });
  c.fill(ellipse(38, 31, 2.4, 3), GOLD, { bevel: 1.4 });
  c.fill(rect(21.6, 33, 26.4, 42), BRICK, { bevel: 1.4 });
  for (const y of [35, 38, 41]) c.flat(rect(21.6, y, 26.4, y + 0.8), DARKWOOD[1]!);
  c.fill(ellipse(24, 44, 3.6, 3), GOLD, { bevel: 1.8 });
  c.fill(ellipse(24, 44, 1.6, 1.4), SKY, { bevel: 1 });
  return done(c);
}

/** A shield in quarters of red and blue with a gold star in the middle and a gold rim. */
export function shield(): Rgba {
  const c = canvas();
  const outline = polygon([
    [4, 5],
    [44, 5],
    [44, 22],
    [38, 36],
    [24, 46],
    [10, 36],
    [4, 22],
  ]);
  c.fill(outline, GOLD, { bevel: 3 });
  const inner = polygon([
    [8, 9],
    [40, 9],
    [40, 21],
    [35, 33],
    [24, 41],
    [13, 33],
    [8, 21],
  ]);
  c.fill(
    both(inner, (x, y) => x < 24 === y < 24),
    RED,
    { bevel: 1.4 },
  );
  c.fill(
    minus(inner, (x, y) => x < 24 === y < 24),
    BLUE,
    { bevel: 1.4 },
  );
  c.fill(polygon(starPoints(24, 24, 5, 8, 3.4)), GOLD, { bevel: 1.8 });
  c.flat(ellipse(13, 12, 2.4, 1, 0), WHITE, 160);
  for (const [x, y] of [
    [6.4, 7.6],
    [41.6, 7.6],
  ] as const)
    c.fill(ellipse(x, y, 1.1, 1.1), AMBER, { bevel: 0.8 });
  return done(c);
}

/** A hanging banner: a royal purple cloth with a swallow tail, gold fringe and a crown on it, on a gold pole. */
export function banner(): Rgba {
  const c = canvas();
  c.fill(rect(3, 3, 45, 6), GOLD, { bevel: 1.4 });
  c.fill(ellipse(3, 4.5, 2.2, 2.2), AMBER, { bevel: 1.2 });
  c.fill(ellipse(45, 4.5, 2.2, 2.2), AMBER, { bevel: 1.2 });
  c.fill(
    polygon([
      [7, 6],
      [41, 6],
      [41, 45],
      [24, 37],
      [7, 45],
    ]),
    PURPLE,
    { bevel: 3 },
  );
  c.fill(rect(7, 6, 41, 9), NIGHT, { bevel: 1 });
  crown(c, 24, 14, 16, 8);
  c.fill(polygon(starPoints(24, 29, 5, 5, 2.2)), YELLOW, { bevel: 1.4 });
  for (let i = 0; i < 6; i++) c.fill(ellipse(10 + i * 5.6, 8, 1, 1), GOLD, { bevel: 0.8 });
  c.flat(rect(9.6, 10, 11, 40), LILAC[4]!, 150);
  return done(c);
}

/** A knight's helmet from the side: a steel dome with a visor, breathing holes, a red plume and rivets. */
export function helmet(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 8, 4, 6, 0.6), RED, { bevel: 2.4 });
  c.fill(ellipse(30, 7, 8, 3, 0.5), RED, { bevel: 2 });
  c.fill(
    polygon([
      [6, 24],
      [8, 12],
      [16, 6],
      [26, 6],
      [34, 12],
      [38, 22],
      [38, 40],
      [32, 45],
      [22, 45],
      [14, 40],
      [6, 40],
    ]),
    STEEL,
    { bevel: 4.4 },
  );
  c.fill(
    polygon([
      [6, 22],
      [28, 22],
      [38, 24],
      [38, 28],
      [6, 28],
    ]),
    IRON,
    { bevel: 1.6 },
  );
  c.flat(rect(10, 24, 36, 25.6), INK[1]!);
  for (const [x, y] of [
    [10, 35],
    [14, 38],
    [14, 33],
    [10, 40],
  ] as const)
    c.flat(ellipse(x, y, 0.9, 0.9), INK[1]!);
  for (const [x, y] of [
    [22, 12],
    [30, 16],
  ] as const)
    c.fill(ellipse(x, y, 1.2, 1.2), GOLD, { bevel: 0.8 });
  c.flat(
    polygon([
      [12, 12],
      [18, 9],
      [14, 18],
    ]),
    WHITE,
    200,
  );
  return done(c);
}

export const ROYAL = {
  king,
  queen,
  prince,
  princess,
  knight,
  sword,
  shield,
  banner,
  helmet,
};
