import type { Rgba } from '../../core/image';
import { both, capsule, ellipse, heart, minus, type Pt, polygon, starPoints, union } from '../../fx/kit';
import {
  CREAM,
  canvas,
  DARKWOOD,
  done,
  GOLD,
  LILAC,
  NIGHT,
  PINK,
  PURPLE,
  RED,
  ROSE,
  rect,
  SKY,
  SNOW,
  STONE,
  turn,
  WHITE,
  WOOD,
  YELLOW,
} from './shared';

/** A gold throne with a red cushion and a tall round back. */
export function throne(): Rgba {
  const c = canvas();
  c.fill(union(rect(14, 9, 34, 32), ellipse(24, 11, 10, 8)), GOLD, { bevel: 4, gain: 1.15 });
  c.fill(union(rect(17.4, 13, 30.6, 31), ellipse(24, 14, 7, 6.4)), RED, { bevel: 3, gain: 1.1 });
  c.fill(ellipse(24, 4.4, 2.8, 2.8), GOLD, { bevel: 2 });
  c.fill(capsule(10.6, 27, 10.6, 38, 3.2), GOLD, { bevel: 2.4 });
  c.fill(capsule(37.4, 27, 37.4, 38, 3.2), GOLD, { bevel: 2.4 });
  c.fill(rect(12, 31, 36, 38), RED, { bevel: 3 });
  c.fill(rect(9, 38, 39, 43), GOLD, { bevel: 2.4 });
  c.fill(rect(11, 43, 16, 46), GOLD, { bevel: 1.4 });
  c.fill(rect(32, 43, 37, 46), GOLD, { bevel: 1.4 });
  c.flat(polygon(starPoints(24, 22, 5, 4.4, 1.8, -Math.PI / 2)), GOLD[5]!);
  c.flat(ellipse(19.6, 16, 1, 3, 0.2), PINK[5]!, 200);
  return done(c);
}

/** A cushioned chair with a wooden frame. */
export function chair(): Rgba {
  const c = canvas();
  c.fill(rect(11, 5, 17, 31), WOOD, { bevel: 2.4 });
  c.fill(rect(31, 5, 37, 31), WOOD, { bevel: 2.4 });
  c.fill(rect(11, 5, 37, 11), WOOD, { bevel: 2.4 });
  c.fill(rect(16, 12, 32, 29), PURPLE, { bevel: 4, gain: 1.1 });
  c.fill(rect(8, 30, 40, 37), PURPLE, { bevel: 3.4, gain: 1.1 });
  c.fill(rect(8, 37, 40, 40), WOOD, { bevel: 1.6 });
  for (const x of [10.4, 37.6]) c.fill(capsule(x, 40, x, 46, 2.2, 1.8), WOOD, { bevel: 1.6 });
  c.flat(polygon(starPoints(24, 21, 4, 3.4, 1, -Math.PI / 2)), LILAC[5]!);
  c.flat(ellipse(18, 33, 3, 0.9), LILAC[5]!, 210);
  return done(c);
}

/** A long table with a white cloth, and a bowl of fruit on it. */
export function table(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 20, 21, 7.6), CREAM, { bevel: 3.4 });
  c.fill(
    polygon([
      [3, 20],
      [45, 20],
      [43, 30],
      [5, 30],
    ]),
    CREAM,
    { bevel: 2.4, gain: 0.9 },
  );
  for (const x of [8, 15, 22, 29, 36, 43]) c.fill(ellipse(x - 2, 30, 3.8, 3.4), CREAM, { bevel: 2 });
  c.fill(ellipse(24, 20, 21, 7.6), CREAM, { bevel: 3.4 });
  c.flat(minus(ellipse(24, 20, 21, 7.6), ellipse(24, 20, 18.8, 6.2)), PINK[4]!);
  c.fill(both(ellipse(24, 18, 7.4, 6.2), rect(0, 17, 48, 48)), RED, { bevel: 3 });
  c.fill(ellipse(24, 17, 8.6, 2.2), WOOD, { bevel: 1.4 });
  for (const [x, y, r, tone] of [
    [20.4, 14.4, 3.4, RED],
    [25.6, 13.4, 3.4, GOLD],
    [29.4, 15, 3, PINK],
  ] as const)
    c.fill(ellipse(x, y, r, r), tone, { bevel: 2.4 });
  c.fill(capsule(8, 35, 8, 44, 2.4, 2), WOOD, { bevel: 1.6 });
  c.fill(capsule(40, 35, 40, 44, 2.4, 2), WOOD, { bevel: 1.6 });
  return done(c);
}

/** A cake of two tiers with pink frosting, a strawberry and two candles. */
export function cake(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 43, 21.6, 4.2), STONE, { bevel: 2.6 });
  c.fill(union(rect(7, 29, 41, 41), ellipse(24, 41, 17, 3.6)), PINK, { bevel: 4, gain: 1.1 });
  c.fill(union(rect(13, 17, 35, 30), ellipse(24, 30, 11, 3)), CREAM, { bevel: 3.4, gain: 1.1 });
  for (const [x, y, rx] of [
    [9.6, 29, 3.8],
    [16, 30.4, 3.4],
    [23, 29.4, 3.8],
    [30, 30.6, 3.4],
    [38, 29.2, 3.8],
  ] as const)
    c.fill(ellipse(x, y, rx, 3.2), SNOW, { bevel: 2 });
  for (const [x, y, rx] of [
    [14.6, 17.6, 3.2],
    [20.6, 18.8, 3],
    [27.6, 17.8, 3.4],
    [33, 18.6, 2.8],
  ] as const)
    c.fill(ellipse(x, y, rx, 2.8), ROSE, { bevel: 2 });
  c.fill(ellipse(24, 15.4, 3.8, 3.4), RED, { bevel: 2.6 });
  c.flat(ellipse(23, 14.6, 0.8, 1.1), WHITE);
  for (const [x, tone] of [
    [17.6, LILAC],
    [30.4, SKY],
  ] as const) {
    c.fill(rect(x - 1.3, 8.4, x + 1.3, 16.6), tone, { bevel: 1.2 });
    c.fill(ellipse(x, 6, 1.6, 2.6), YELLOW, { bevel: 1.2 });
  }
  for (const [x, y] of [
    [11, 36],
    [19, 37],
    [27, 36],
    [35, 37],
  ] as const)
    c.flat(ellipse(x, y, 1.1, 1.1), SNOW[5]!);
  return done(c);
}

/** A gold harp, with its strings. */
export function harp(): Rgba {
  const c = canvas();
  c.fill(capsule(12, 7, 12, 42, 2.8), GOLD, { bevel: 2.4, gain: 1.1 });
  const neck: Pt[] = [
    [12, 7],
    [21, 8.4],
    [30, 12.4],
    [37.6, 20],
  ];
  for (let i = 0; i + 1 < neck.length; i++)
    c.fill(capsule(neck[i]![0], neck[i]![1], neck[i + 1]![0], neck[i + 1]![1], 2.6), GOLD, { bevel: 2.2, gain: 1.1 });
  c.fill(capsule(37.6, 20, 34, 41, 3.8, 3.2), GOLD, { bevel: 2.6, gain: 1.1 });
  c.fill(capsule(8, 43, 38, 43, 2.8), GOLD, { bevel: 2.2 });
  const topAt = (x: number): number =>
    x <= 21 ? 7 + ((x - 12) / 9) * 1.4 : x <= 30 ? 8.4 + ((x - 21) / 9) * 4 : 12.4 + ((x - 30) / 7.6) * 7.6;
  for (const x of [16.4, 20.4, 24.4, 28.4, 32.4]) c.line(x, topAt(x) + 2, x, 40.6, x < 22 ? YELLOW[5]! : SKY[5]!, 1);
  c.flat(ellipse(36.4, 27, 0.9, 4, 0.2), WHITE, 190);
  return done(c);
}

/** Two music notes joined at the top. */
export function music(): Rgba {
  const c = canvas();
  c.fill(ellipse(14, 36, 6.6, 5, -0.4), PURPLE, { bevel: 3.6, gain: 1.15 });
  c.fill(ellipse(34, 32, 6.6, 5, -0.4), PURPLE, { bevel: 3.6, gain: 1.15 });
  c.fill(rect(18.6, 10, 21.6, 35), NIGHT, { bevel: 1.4 });
  c.fill(rect(38.6, 6, 41.6, 31), NIGHT, { bevel: 1.4 });
  c.fill(
    polygon([
      [18.6, 8],
      [41.6, 3.4],
      [41.6, 10.4],
      [18.6, 15],
    ]),
    PURPLE,
    { bevel: 2.4, gain: 1.1 },
  );
  c.flat(ellipse(11.6, 34.4, 1.4, 1.1, -0.4), LILAC[5]!);
  c.flat(ellipse(31.6, 30.4, 1.4, 1.1, -0.4), LILAC[5]!);
  c.flat(polygon(starPoints(8, 12, 4, 4.4, 1.1, -Math.PI / 2)), YELLOW[5]!);
  c.flat(polygon(starPoints(44, 22, 4, 3.4, 0.9, -Math.PI / 2)), PINK[5]!);
  return done(c);
}

/** A gold crown with a jewel in each point and three on the band. */
export function crown(): Rgba {
  const c = canvas();
  c.fill(
    polygon([
      [7, 32],
      [6, 12],
      [16, 23],
      [24, 8],
      [32, 23],
      [42, 12],
      [41, 32],
    ]),
    GOLD,
    { bevel: 4.6, gain: 1.2 },
  );
  c.fill(rect(6, 29, 42, 40), GOLD, { bevel: 3.4, gain: 1.15 });
  c.flat(rect(8, 34.4, 40, 35.6), GOLD[1]!);
  for (const [x, y] of [
    [6, 10],
    [24, 6],
    [42, 10],
  ] as const)
    c.fill(ellipse(x, y, 3, 3), SNOW, { bevel: 2.4 });
  for (const [x, tone, r] of [
    [24, RED, 3.6],
    [13, SKY, 2.8],
    [35, PINK, 2.8],
  ] as const) {
    c.fill(ellipse(x, 36.6, r, r), tone, { bevel: 2.4, gain: 1.2 });
    c.flat(ellipse(x - r * 0.35, 36.6 - r * 0.35, r * 0.28, r * 0.28), WHITE);
  }
  c.flat(ellipse(11, 24, 1, 3.4, 0.5), YELLOW[5]!);
  return done(c);
}

/** A pink gem in a gold setting, hanging on a chain. */
export function jewel(): Rgba {
  const c = canvas();
  const chain: Pt[] = [
    [6, 5],
    [10, 12],
    [15, 18],
    [20, 22.4],
    [24, 24],
  ];
  for (const [x, y] of chain) {
    c.fill(ellipse(x, y, 2, 1.6, 0.7), GOLD, { bevel: 1.2 });
    c.fill(ellipse(48 - x, y, 2, 1.6, -0.7), GOLD, { bevel: 1.2 });
  }
  c.fill(heart(24, 36, 14.6), GOLD, { bevel: 4, gain: 1.15 });
  c.fill(heart(24, 36, 11.6), ROSE, { bevel: 4.4, gain: 1.25 });
  c.flat(minus(heart(24, 36.6, 8.4), heart(24, 36.6, 7.4)), ROSE[5]!, 190);
  c.flat(
    polygon([
      [24, 30],
      [29.6, 34],
      [24, 45],
      [18.4, 34],
    ]),
    ROSE[2]!,
    120,
  );
  c.flat(ellipse(17.6, 32, 1.4, 2.6, 0.5), WHITE, 230);
  c.flat(polygon(starPoints(37.6, 22, 4, 3.6, 0.9, -Math.PI / 2)), YELLOW[5]!);
  return done(c);
}

/** A closed book with a purple cover, a star on it and a gold title. */
export function book(): Rgba {
  const c = canvas();
  c.fill(
    polygon([
      [36, 9],
      [41, 11],
      [41, 44],
      [36, 45],
    ]),
    CREAM,
    { bevel: 1.6 },
  );
  c.fill(rect(9, 5, 37, 45), PURPLE, { bevel: 4, gain: 1.1 });
  c.fill(rect(9, 5, 15.6, 45), NIGHT, { bevel: 2.6 });
  for (const y of [11, 38]) c.flat(rect(9, y, 15.6, y + 1.8), GOLD[4]!);
  c.fill(polygon(starPoints(26.4, 21.6, 5, 7.8, 3.4, -Math.PI / 2)), GOLD, { bevel: 2.6, gain: 1.2 });
  c.flat(polygon(starPoints(26.4, 21.6, 5, 4, 1.8, -Math.PI / 2)), YELLOW[5]!);
  for (const [y, w] of [
    [33, 14],
    [37.4, 10],
  ] as const)
    c.line(26.4 - w / 2, y, 26.4 + w / 2, y, GOLD[4]!, 1.5);
  c.flat(ellipse(20, 12, 0.9, 3.2), LILAC[5]!, 200);
  return done(c);
}

/** A shelf with four books standing on it, the last leaning. */
export function shelf(): Rgba {
  const c = canvas();
  for (const [x0, x1, top, tone] of [
    [6, 13.4, 14, RED],
    [14.6, 21.6, 9, PURPLE],
    [23, 29.6, 16, GOLD],
  ] as const) {
    c.fill(rect(x0, top, x1, 36), tone, { bevel: 2.4, gain: 1.1 });
    c.flat(rect(x0, top + 4, x1, top + 5.4), tone[5]!);
    c.flat(rect(x0, 31, x1, 32.4), tone[5]!);
  }
  c.fill(turn(rect(31, 14, 38, 36), 38, 36, 0.3), SKY, { bevel: 2.4, gain: 1.1 });
  c.fill(rect(3, 36, 45, 42), WOOD, { bevel: 2.4 });
  c.flat(rect(3, 36, 45, 37.4), WOOD[5]!);
  c.fill(rect(8, 42, 14, 46), DARKWOOD, { bevel: 1.4 });
  c.fill(rect(34, 42, 40, 46), DARKWOOD, { bevel: 1.4 });
  return done(c);
}

/** A bed with a pink blanket and a pillow. */
export function bed(): Rgba {
  const c = canvas();
  c.fill(union(rect(4, 13, 11, 42), ellipse(7.5, 13, 3.5, 3)), WOOD, { bevel: 2.6 });
  c.fill(rect(38, 24, 44, 42), WOOD, { bevel: 2.4 });
  c.fill(rect(10, 28, 39, 38), SNOW, { bevel: 3.2 });
  c.fill(union(rect(16, 24, 39, 35), ellipse(16, 29.5, 3, 5.5)), PINK, { bevel: 3.6, gain: 1.1 });
  c.flat(rect(16, 27, 39, 28.4), PINK[5]!);
  c.fill(ellipse(15.4, 24.6, 6.6, 3.8, -0.1), CREAM, { bevel: 3 });
  c.fill(rect(10, 38, 39, 41), WOOD, { bevel: 1.6 });
  for (const [x, y] of [
    [24, 31.6],
    [31, 31.6],
    [28, 34.2],
  ] as const)
    c.flat(ellipse(x, y, 1, 1), ROSE[2]!);
  return done(c);
}

/** A plump pillow, pinched in at the sides, with a gold tassel on each corner. */
export function pillow(): Rgba {
  const c = canvas();
  const corners = union(ellipse(7, 10, 3, 3), ellipse(41, 10, 3, 3), ellipse(7, 38, 3, 3), ellipse(41, 38, 3, 3));
  const pinch = union(
    ellipse(24, 8.4, 12, 2.6),
    ellipse(24, 39.6, 12, 2.6),
    ellipse(5.4, 24, 2.6, 9),
    ellipse(42.6, 24, 2.6, 9),
  );
  c.fill(minus(minus(rect(7, 10, 41, 38), corners), pinch), LILAC, { bevel: 9, gain: 1.25 });
  c.fill(ellipse(24, 24, 2.8, 2.8), PINK, { bevel: 2.2 });
  c.flat(ellipse(24, 24, 1, 1), ROSE[2]!);
  for (const [x, y, dx, dy] of [
    [5, 8, -1, -1],
    [43, 8, 1, -1],
    [5, 40, -1, 1],
    [43, 40, 1, 1],
  ] as const) {
    c.line(x + dx * 1.4, y + dy * 1.4, x + dx * 3, y + dy * 3.4, GOLD[3]!, 1.4);
    c.fill(ellipse(x + dx * 1.4, y + dy * 1.4, 2.6, 2.6), GOLD, { bevel: 1.8 });
  }
  c.flat(ellipse(14, 17, 3.4, 1.2, -0.3), WHITE, 190);
  return done(c);
}

export const PALACE = { throne, chair, table, cake, harp, music, crown, jewel, book, shelf, bed, pillow };
