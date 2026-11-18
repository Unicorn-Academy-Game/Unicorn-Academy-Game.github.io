import type { Rgba } from '../../core/image';
import { both, capsule, ellipse, heart, minus, type Pt, polygon, ring, starPoints, union } from '../../fx/kit';
import { tone } from '../produce';
import {
  AMBER,
  BLUE,
  BROWN,
  CREAM,
  canvas,
  DARKWOOD,
  done,
  GOLD,
  GREEN,
  INK,
  LEAF,
  LILAC,
  NIGHT,
  ORANGE,
  PEACH,
  PINK,
  PURPLE,
  RED,
  ROSE,
  rect,
  SKY,
  SNOW,
  STONE,
  TEAL,
  WHITE,
  WOOD,
  YELLOW,
} from './shared';

const GLASS = tone('#cfeeff', 250, 230);
const MARBLE = tone('#ece9f4', 270, 90);

/** A ballerina in a pink tutu, up on her toes with one arm raised and one leg lifted behind her. */
export function dance(): Rgba {
  const c = canvas();
  c.fill(capsule(27, 33, 36, 41, 1.7), PEACH, { bevel: 1.4 });
  c.fill(capsule(22, 33, 22, 43, 1.7), PEACH, { bevel: 1.4 });
  c.fill(ellipse(22, 44, 1.6, 1.2), PINK, { bevel: 1 });
  c.fill(ellipse(37.4, 41.4, 1.6, 1.2), PINK, { bevel: 1 });
  c.fill(capsule(20, 17, 10, 21, 1.5), PEACH, { bevel: 1.2 });
  c.fill(capsule(28, 17, 33, 9, 1.5), PEACH, { bevel: 1.2 });
  c.fill(
    polygon([
      [19, 16],
      [29, 16],
      [28, 29],
      [20, 29],
    ]),
    ROSE,
    { bevel: 2 },
  );
  c.fill(ellipse(24, 29, 15, 5.4), PINK, { bevel: 3 });
  c.fill(ellipse(24, 27.4, 11, 3.4), LILAC, { bevel: 1.6 });
  for (const x of [11, 15.5, 20, 24, 28, 32.5, 37]) c.line(x, 29, x - (24 - x) * 0.1, 33.4, ROSE[3]!, 0.8);
  c.fill(ellipse(24, 10, 4.6, 4.8), PEACH, { bevel: 2.6 });
  c.fill(ellipse(24, 4.8, 2.6, 2.4), BROWN, { bevel: 1.6 });
  c.fill(minus(ellipse(24, 8, 4.8, 3.6), ellipse(24, 10.2, 3.6, 2.6)), BROWN, { bevel: 1.4 });
  c.flat(ellipse(22.2, 10.6, 0.6, 0.7), INK[1]!);
  c.flat(ellipse(25.8, 10.6, 0.6, 0.7), INK[1]!);
  c.flat(ellipse(24, 12.6, 0.8, 0.4), ROSE[3]!);
  for (const [x, y] of [
    [9, 9],
    [40, 22],
  ] as const)
    c.flat(polygon(starPoints(x, y, 4, 3, 0.9)), YELLOW[5]!);
  return done(c);
}

/** A day dress on a pink hanger: a fitted top, a flared skirt, a bow at the waist. */
export function dress(): Rgba {
  const c = canvas();
  c.line(24, 3, 24, 6, GOLD[3]!, 1.2);
  c.line(24, 3.4, 15, 8, GOLD[3]!, 1.2);
  c.line(24, 3.4, 33, 8, GOLD[3]!, 1.2);
  c.fill(
    polygon([
      [17, 6],
      [20, 6],
      [22, 11],
      [26, 11],
      [28, 6],
      [31, 6],
      [30, 20],
      [18, 20],
    ]),
    PINK,
    { bevel: 2.4 },
  );
  c.fill(
    polygon([
      [18, 19],
      [30, 19],
      [44, 44],
      [4, 44],
    ]),
    PINK,
    { bevel: 3, gain: 1.1 },
  );
  for (let i = 0; i < 6; i++) c.fill(ellipse(7 + i * 6.8, 43.4, 3.6, 1.6), ROSE, { bevel: 1 });
  c.fill(rect(17.6, 18, 30.4, 22), ROSE, { bevel: 1.4 });
  c.fill(ellipse(20, 21, 3.4, 2.4, -0.4), ROSE, { bevel: 1.4 });
  c.fill(ellipse(28, 21, 3.4, 2.4, 0.4), ROSE, { bevel: 1.4 });
  c.fill(ellipse(24, 21, 1.8, 1.8), RED, { bevel: 1 });
  for (const [x, y] of [
    [12, 36],
    [22, 32],
    [34, 38],
    [28, 28],
    [18, 41],
  ] as const)
    c.fill(heart(x, y, 1.9), CREAM, { bevel: 1 });
  return done(c);
}

/** A ball gown: puffed sleeves, a gold sweetheart neck and a huge purple skirt sewn with jewels. */
export function gown(): Rgba {
  const c = canvas();
  c.fill(
    polygon([
      [16, 14],
      [32, 14],
      [30, 26],
      [18, 26],
    ]),
    PURPLE,
    { bevel: 2.6 },
  );
  c.fill(ellipse(12.6, 15, 5, 4.2), LILAC, { bevel: 2.4 });
  c.fill(ellipse(35.4, 15, 5, 4.2), LILAC, { bevel: 2.4 });
  c.flat(
    both(ellipse(24, 14.6, 7.4, 5), (_x, y) => y < 17),
    PEACH[4]!,
  );
  c.flat(
    both(heart(24, 15, 4.6), (_x, y) => y > 14),
    PURPLE[4]!,
  );
  c.fill(ellipse(24, 6, 6.2, 5.8), BROWN, { bevel: 3 });
  c.fill(ellipse(24, 7.6, 4.2, 4.4), PEACH, { bevel: 2.4 });
  c.fill(ellipse(24, 3.8, 5, 2.2), BROWN, { bevel: 1.4 });
  c.flat(ellipse(22.4, 8, 0.6, 0.7), INK[1]!);
  c.flat(ellipse(25.6, 8, 0.6, 0.7), INK[1]!);
  c.flat(rect(22.6, 11, 25.4, 13.6), PEACH[4]!);
  c.fill(rect(17.6, 25, 30.4, 28.4), GOLD, { bevel: 1.4 });
  c.fill(
    polygon([
      [18, 27],
      [30, 27],
      [45, 44],
      [3, 44],
    ]),
    PURPLE,
    { bevel: 3.4, gain: 1.15 },
  );
  for (const x of [11, 17, 24, 31, 37]) c.line(24 + (x - 24) * 0.3, 29, x, 43, PURPLE[1]!, 0.8);
  c.fill(rect(3, 42, 45, 45), GOLD, { bevel: 1.2 });
  for (const [x, y, k] of [
    [16, 34, 0],
    [29, 32, 1],
    [22, 39, 2],
    [36, 38, 0],
    [10, 40, 1],
  ] as const)
    c.fill(ellipse(x, y, 1.5, 1.5), k === 0 ? SKY : k === 1 ? PINK : YELLOW, { bevel: 1 });
  return done(c);
}

/** A glass slipper: a pointed pump on a tall heel, with a bow on the toe, sparkling. */
export function slipper(): Rgba {
  const c = canvas();
  c.fill(
    polygon([
      [6, 18],
      [9, 26],
      [15, 29],
      [23, 31],
      [31, 32],
      [39, 35],
      [45, 40],
      [45, 43],
      [37, 43],
      [29, 42],
      [21, 38],
      [14, 34],
      [8, 34],
      [6, 28],
    ]),
    GLASS,
    { bevel: 3.2, gain: 0.8 },
  );
  c.fill(
    polygon([
      [5, 33],
      [12, 33],
      [11.4, 40],
      [9.6, 47],
      [7, 47],
    ]),
    GLASS,
    { bevel: 1.6, gain: 0.8 },
  );
  c.flat(
    polygon([
      [7.4, 19.6],
      [9.6, 20],
      [10.6, 26],
      [8.6, 26],
    ]),
    WHITE,
    220,
  );
  c.flat(
    polygon([
      [16, 30.4],
      [30, 33.4],
      [30, 34.6],
      [16, 31.6],
    ]),
    WHITE,
    190,
  );
  c.flat(rect(14, 36, 36, 37), SKY[4]!);
  c.fill(ellipse(34, 33, 3.2, 2.2, -0.4), PINK, { bevel: 1.2 });
  c.fill(ellipse(40, 36.6, 3.2, 2.2, 0.6), PINK, { bevel: 1.2 });
  c.fill(ellipse(37, 34.8, 1.4, 1.4), ROSE, { bevel: 1 });
  for (const [x, y, r] of [
    [24, 18, 3.6],
    [39, 21, 2.8],
    [6, 8, 2.4],
  ] as const)
    c.flat(polygon(starPoints(x, y, 4, r, r * 0.28)), YELLOW[5]!);
  return done(c);
}

/** A masquerade mask: gold and purple, with two eye holes, jewels and a feather. */
export function mask(): Rgba {
  const c = canvas();
  const shape = union(ellipse(14.4, 26, 11.6, 8.6, -0.3), ellipse(33.6, 26, 11.6, 8.6, 0.3), ellipse(24, 23.4, 6, 5));
  c.fill(minus(shape, union(ellipse(15, 26.6, 5.2, 3.4, -0.3), ellipse(33, 26.6, 5.2, 3.4, 0.3))), PURPLE, {
    bevel: 3,
  });
  c.flat(ring(14.4, 26, 9.6, 1.1, 0.72), GOLD[5]!, 230);
  c.flat(ring(33.6, 26, 9.6, 1.1, 0.72), GOLD[5]!, 230);
  c.fill(ellipse(24, 20, 2.6, 2.6), GOLD, { bevel: 1.6 });
  c.fill(ellipse(24, 20, 1.2, 1.2), RED, { bevel: 1 });
  for (const [x, y] of [
    [7, 22],
    [41, 22],
    [24, 29],
  ] as const)
    c.fill(ellipse(x, y, 1.4, 1.4), YELLOW, { bevel: 1 });
  c.fill(ellipse(40, 12, 8.6, 2.6, -0.9), TEAL, { bevel: 1.8 });
  c.line(36, 18, 42, 7, TEAL[5]!, 0.8);
  c.fill(ellipse(36.4, 10, 5, 1.8, -1.2), PINK, { bevel: 1.2 });
  return done(c);
}

/** A sash: a wide pink ribbon from shoulder to hip with a gold edge, a big rosette and a star. */
export function sash(): Rgba {
  const c = canvas();
  c.fill(
    polygon([
      [7, 2],
      [19, 2],
      [43, 40],
      [32, 44],
    ]),
    ROSE,
    { bevel: 3 },
  );
  c.flat(
    polygon([
      [7, 2],
      [8.6, 2],
      [33.6, 43],
      [32, 44],
    ]),
    GOLD[4]!,
  );
  c.flat(
    polygon([
      [18, 2],
      [19, 2],
      [43, 40],
      [42, 40.6],
    ]),
    GOLD[4]!,
  );
  c.fill(ellipse(34.4, 36, 5, 4, -0.4), PINK, { bevel: 2 });
  c.fill(
    polygon([
      [34, 40],
      [30, 47],
      [34, 44.6],
    ]),
    ROSE,
    { bevel: 1 },
  );
  c.fill(
    polygon([
      [36, 40],
      [41, 46],
      [38, 43.6],
    ]),
    ROSE,
    { bevel: 1 },
  );
  c.fill(ellipse(34.6, 36, 3.2, 3.2), GOLD, { bevel: 1.6 });
  c.flat(polygon(starPoints(18, 17, 5, 4.6, 1.8)), YELLOW[5]!);
  c.flat(polygon(starPoints(27, 30, 5, 3, 1.2)), YELLOW[5]!);
  return done(c);
}

/** A folding hand fan, open: a half circle of pink folds on golden ribs. */
export function fan(): Rgba {
  const c = canvas();
  const arc = (x: number, y: number, r: number, a0: number, a1: number): Pt[] =>
    Array.from({ length: 12 }, (_, i) => {
      const a = a0 + ((a1 - a0) * i) / 11;
      return [x + Math.cos(a) * r, y + Math.sin(a) * r] as Pt;
    });
  const fold = (a0: number, a1: number, ramp: readonly (readonly [number, number, number])[]) =>
    c.fill(polygon([[24, 40], ...arc(24, 40, 36, a0, a1)]), ramp, { bevel: 1.2 });
  const start = -Math.PI * 0.86;
  const step = (Math.PI * 0.72) / 7;
  for (let i = 0; i < 7; i++) fold(start + i * step, start + (i + 1) * step, i % 2 === 0 ? PINK : ROSE);
  for (let i = 0; i <= 7; i++) {
    const a = start + i * step;
    c.line(24, 40, 24 + Math.cos(a) * 36, 40 + Math.sin(a) * 36, GOLD[4]!, 0.9);
  }
  c.flat(ring(24, 40, 25, 1.2, 1), GOLD[4]!);
  c.fill(ellipse(24, 40, 3, 3), GOLD, { bevel: 1.4 });
  c.fill(capsule(24, 40, 24, 46, 1.6), GOLD, { bevel: 1.2 });
  for (let i = 0; i < 7; i++) {
    const a = start + (i + 0.5) * step;
    c.fill(heart(24 + Math.cos(a) * 18, 40 + Math.sin(a) * 18, 1.5), CREAM, { bevel: 1 });
  }
  return done(c);
}

/** A long white glove with a lace cuff and a bow at the wrist. */
export function glove(): Rgba {
  const c = canvas();
  c.fill(
    polygon([
      [15, 22],
      [33, 22],
      [32, 40],
      [16, 40],
    ]),
    SNOW,
    { bevel: 2.4 },
  );
  for (const [x, top, r] of [
    [16.4, 6, 2.5],
    [21.6, 3, 2.6],
    [26.8, 3.4, 2.6],
    [31.6, 7, 2.4],
  ] as const)
    c.fill(capsule(x, top + 2, x, 24, r), SNOW, { bevel: 1.6 });
  c.fill(capsule(13, 24, 8, 18, 2.6), SNOW, { bevel: 1.6 });
  c.fill(rect(15, 22, 33, 28), SNOW, { bevel: 2 });
  c.fill(rect(15, 38, 33, 43), CREAM, { bevel: 1.4 });
  for (let i = 0; i < 6; i++) c.fill(ellipse(16.4 + i * 3.1, 43.4, 1.8, 1.8), CREAM, { bevel: 1 });
  c.fill(ellipse(20, 35, 3.4, 2.4, -0.4), PINK, { bevel: 1.4 });
  c.fill(ellipse(28, 35, 3.4, 2.4, 0.4), PINK, { bevel: 1.4 });
  c.fill(ellipse(24, 35, 1.8, 1.8), ROSE, { bevel: 1 });
  for (const x of [21, 26.4]) c.flat(rect(x, 15, x + 0.5, 22), STONE[3]!);
  return done(c);
}

/** Two balloons, a big red one and a smaller yellow one behind it, with strings. */
export function balloon(): Rgba {
  const c = canvas();
  const string = (x: number, y: number, dx: number) => {
    const pts: Pt[] = Array.from({ length: 10 }, (_, i) => [x + Math.sin(i * 0.9) * dx, y + i * 1.5] as Pt);
    for (let i = 0; i + 1 < pts.length; i++)
      c.line(pts[i]![0], pts[i]![1], pts[i + 1]![0], pts[i + 1]![1], STONE[3]!, 0.9);
  };
  string(32, 26, 1.6);
  c.fill(ellipse(32, 15, 10, 12), YELLOW, { bevel: 6, gain: 1.1 });
  c.fill(
    polygon([
      [32, 27],
      [29.6, 30.4],
      [34.4, 30.4],
    ]),
    AMBER,
    { bevel: 1 },
  );
  string(18, 35, -1.8);
  c.fill(ellipse(17, 22, 12.4, 14.4), RED, { bevel: 8, gain: 1.15 });
  c.fill(
    polygon([
      [17, 36],
      [14, 40],
      [20, 40],
    ]),
    RED,
    { bevel: 1 },
  );
  c.flat(ellipse(11.6, 15, 3, 4.6, 0.5), WHITE, 190);
  c.flat(ellipse(28, 9, 1.8, 3, 0.5), WHITE, 190);
  return done(c);
}

/** A landscape painting in a gold frame: sky, sun, green hills and a red-roofed house. */
export function painting(): Rgba {
  const c = canvas();
  c.fill(rect(3, 6, 45, 42), GOLD, { bevel: 3 });
  c.fill(rect(7, 10, 41, 38), SKY, { bevel: 1.4 });
  c.flat(ellipse(33, 17, 4, 4), YELLOW[5]!);
  c.flat(
    polygon([
      [7, 30],
      [14, 24],
      [24, 30],
      [34, 25],
      [41, 29],
      [41, 38],
      [7, 38],
    ]),
    GREEN[4]!,
  );
  c.flat(
    polygon([
      [7, 34],
      [18, 30],
      [30, 34],
      [41, 32],
      [41, 38],
      [7, 38],
    ]),
    LEAF[4]!,
  );
  c.flat(rect(14, 29, 21, 35), CREAM[5]!);
  c.flat(
    polygon([
      [13, 29],
      [17.5, 24.6],
      [22, 29],
    ]),
    RED[4]!,
  );
  c.flat(rect(16.6, 31.4, 18.6, 35), DARKWOOD[3]!);
  for (const [x, y] of [
    [22, 14],
    [11, 14],
  ] as const)
    c.flat(ellipse(x, y, 3.4, 1.4), SNOW[5]!);
  for (const [x, y] of [
    [3, 6],
    [45, 6],
    [3, 42],
    [45, 42],
  ] as const)
    c.fill(ellipse(x, y, 2.4, 2.4), AMBER, { bevel: 1.4 });
  return done(c);
}

/** An empty ornate picture frame, gold, with curled corners, shining glass and a little hanging cord. */
export function frame(): Rgba {
  const c = canvas();
  c.line(24, 2, 12, 9, DARKWOOD[3]!, 0.9);
  c.line(24, 2, 36, 9, DARKWOOD[3]!, 0.9);
  c.fill(minus(rect(4, 7, 44, 45), rect(10, 13, 38, 39)), GOLD, { bevel: 2.8, gain: 1.1 });
  c.flat(rect(10, 13, 38, 39), GLASS[3]!);
  c.flat(
    polygon([
      [12, 15],
      [20, 15],
      [12, 28],
    ]),
    WHITE,
    190,
  );
  c.flat(
    polygon([
      [30, 37],
      [36, 37],
      [36, 31],
    ]),
    WHITE,
    140,
  );
  for (const [x, y] of [
    [6.4, 9.4],
    [41.6, 9.4],
    [6.4, 42.6],
    [41.6, 42.6],
  ] as const)
    c.fill(ellipse(x, y, 3.4, 3.4), AMBER, { bevel: 2 });
  c.fill(ellipse(24, 9.6, 3.4, 2.2), AMBER, { bevel: 1.6 });
  c.fill(ellipse(24, 42.4, 3.4, 2.2), AMBER, { bevel: 1.6 });
  return done(c);
}

/** A marble bust on a pedestal, crowned with leaves. */
export function statue(): Rgba {
  const c = canvas();
  c.fill(rect(9, 38, 39, 45), MARBLE, { bevel: 2 });
  c.fill(rect(12, 33, 36, 39), MARBLE, { bevel: 1.6 });
  c.fill(
    polygon([
      [10, 34],
      [14, 26],
      [34, 26],
      [38, 34],
    ]),
    MARBLE,
    { bevel: 2.6 },
  );
  c.fill(rect(20.6, 21, 27.4, 27), MARBLE, { bevel: 1.6 });
  c.fill(ellipse(24, 14, 8, 9), MARBLE, { bevel: 4 });
  c.fill(ellipse(24, 8, 8.4, 4.4), MARBLE, { bevel: 2.4 });
  for (const x of [16.6, 20.6, 24, 27.4, 31.6]) c.flat(ellipse(x, 6.4, 1.4, 2.4), MARBLE[2]!);
  c.flat(ellipse(21, 13, 1, 0.8), MARBLE[1]!);
  c.flat(ellipse(27, 13, 1, 0.8), MARBLE[1]!);
  c.flat(rect(23.4, 14.6, 24.6, 17.6), MARBLE[2]!);
  c.flat(rect(21.6, 19, 26.4, 19.8), MARBLE[2]!);
  for (const [x, y, r] of [
    [14.4, 8, -1.1],
    [17.6, 4.8, -0.6],
    [30.4, 4.8, 0.6],
    [33.6, 8, 1.1],
  ] as const)
    c.fill(ellipse(x, y, 3.4, 1.4, r), LEAF, { bevel: 1.2 });
  c.flat(ellipse(20, 31, 4, 1.4, -0.3), WHITE, 170);
  c.flat(rect(14, 40, 34, 41), MARBLE[2]!);
  return done(c);
}

/** An oval portrait of a queen in a gold frame, with a crown and golden curls. */
export function portrait(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 24, 20, 23), GOLD, { bevel: 3.6 });
  c.fill(ellipse(24, 24, 16.4, 19.6), NIGHT, { bevel: 2.4 });
  c.fill(both(ellipse(24, 40, 13, 10), ellipse(24, 24, 16, 19.2)), ROSE, { bevel: 3 });
  c.fill(ellipse(24, 33, 5.4, 3), SNOW, { bevel: 1.4 });
  c.fill(ellipse(24, 20, 8, 9), YELLOW, { bevel: 3.6 });
  c.fill(ellipse(24, 22, 5.6, 6.6), PEACH, { bevel: 3 });
  c.flat(ellipse(21.8, 21.4, 0.8, 0.9), INK[1]!);
  c.flat(ellipse(26.2, 21.4, 0.8, 0.9), INK[1]!);
  c.flat(ellipse(24, 25.4, 1.2, 0.5), ROSE[3]!);
  c.fill(
    polygon([
      [17.6, 12],
      [18.6, 7],
      [21, 10],
      [24, 5.6],
      [27, 10],
      [29.4, 7],
      [30.4, 12],
    ]),
    GOLD,
    { bevel: 1.2 },
  );
  c.fill(ellipse(24, 8.4, 1, 1), RED, { bevel: 0.8 });
  return done(c);
}

/** A painter's easel holding a canvas with a rainbow and a sun, a shelf below with a pot of paint. */
export function easel(): Rgba {
  const c = canvas();
  c.line(24, 2, 8, 46, DARKWOOD[3]!, 2.4);
  c.line(24, 2, 40, 46, DARKWOOD[3]!, 2.4);
  c.line(24, 6, 24, 46, WOOD[3]!, 2);
  c.fill(rect(13, 7, 35, 31), SNOW, { bevel: 1.4 });
  c.flat(rect(14.6, 8.6, 33.4, 29.4), SKY[4]!);
  for (const [r, ramp] of [
    [8.4, RED],
    [6.6, ORANGE],
    [4.8, YELLOW],
    [3, GREEN],
  ] as const)
    c.flat(
      both(ring(24, 28, r, 1.8, 1), (_x, y) => y < 29.4),
      ramp[4]!,
    );
  c.flat(polygon(starPoints(30, 14, 8, 2.8, 1.4)), YELLOW[5]!);
  c.fill(rect(10, 33, 38, 36), WOOD, { bevel: 1.2 });
  c.fill(rect(30, 28.6, 34, 33), BLUE, { bevel: 1 });
  c.fill(rect(15, 30, 17.6, 33), PINK, { bevel: 0.8 });
  return done(c);
}

/** A painter's palette: a wooden kidney with a thumb hole, blobs of every colour and a brush. */
export function palette(): Rgba {
  const c = canvas();
  const board = minus(
    union(ellipse(22, 25, 20, 16, -0.2), ellipse(34, 16, 8, 5)),
    union(ellipse(38, 33, 5.6, 3.8, 0.4), ellipse(14, 31, 3, 2.4)),
  );
  c.fill(board, WOOD, { bevel: 4, gain: 0.9 });
  for (const [x, y, ramp] of [
    [10, 20, RED],
    [16, 13, ORANGE],
    [25, 10, YELLOW],
    [34, 10, GREEN],
    [39, 18, BLUE],
    [30, 36, PURPLE],
  ] as const)
    c.fill(ellipse(x, y, 3.4, 2.8, 0.3), ramp, { bevel: 2 });
  c.fill(ellipse(22, 26, 3.2, 2.4), SNOW, { bevel: 1.6 });
  c.line(24, 42, 44, 22, DARKWOOD[3]!, 1.6);
  c.fill(capsule(24, 42, 20, 46, 1.6), PINK, { bevel: 1 });
  c.fill(capsule(33, 33, 37, 29, 1.7), GOLD, { bevel: 1 });
  return done(c);
}

export const BALL = {
  dance,
  dress,
  gown,
  slipper,
  mask,
  sash,
  fan,
  glove,
  balloon,
  painting,
  frame,
  statue,
  portrait,
  easel,
  palette,
};
