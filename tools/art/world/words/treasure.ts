import type { Rgba } from '../../core/image';
import { both, capsule, ellipse, minus, type Pt, polygon, ring, starPoints, union } from '../../fx/kit';
import {
  BURLAP,
  CREAM,
  canvas,
  DARKWOOD,
  done,
  GOLD,
  GREEN,
  JADE,
  LEAF,
  LILAC,
  MINT,
  ONYX,
  PEACH,
  PINK,
  RED,
  ROSE,
  rect,
  SKY,
  SNOW,
  STONE,
  turn,
  WHITE,
  YELLOW,
} from './shared';

/** An opal: milky white with a fire of every colour inside it. */
export function opal(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 25.4, 19.6, 16), SNOW, { bevel: 10, gain: 1.2 });
  for (const [x, y, rx, ry, rot, tone] of [
    [15.6, 24, 6.4, 3.6, -0.6, PINK],
    [27.6, 19.4, 7, 3.4, 0.5, SKY],
    [21.4, 31, 7.2, 3.6, 0.15, MINT],
    [32.4, 29, 4.6, 3, -0.5, YELLOW],
    [13.6, 32, 3.6, 2.4, 0.5, LILAC],
    [22.6, 24.6, 3, 2, 0.3, LILAC],
  ] as const) {
    c.flat(ellipse(x, y, rx, ry, rot), tone[3]!, 235);
    c.flat(ellipse(x - rx * 0.2, y - ry * 0.25, rx * 0.55, ry * 0.5, rot), tone[5]!, 235);
  }
  c.flat(ellipse(15.6, 17.4, 4.2, 1.6, -0.55), WHITE);
  c.flat(polygon(starPoints(38.6, 8.6, 4, 4.8, 1.2, -Math.PI / 2)), YELLOW[5]!);
  c.flat(polygon(starPoints(8.4, 38.4, 4, 3.4, 0.9, -Math.PI / 2)), WHITE);
  return done(c);
}

/** A pearl in an open shell. */
export function pearl(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 17.4, 20.8, 14.6), PEACH, { bevel: 4.4, gain: 1.1 });
  c.fill(ellipse(24, 19.4, 16.4, 10.6), PINK, { bevel: 3.6, gain: 1.1, base: 0.74 });
  for (let k = -3; k <= 3; k++) c.line(24 + k * 1.4, 30, 24 + k * 6.2, 6.4 + Math.abs(k) * 1.6, PEACH[2]!, 0.9);
  c.fill(both(ellipse(24, 33.6, 22, 13.6), rect(0, 29, 48, 48)), PEACH, { bevel: 4, gain: 1.1 });
  for (let k = -4; k <= 4; k++) c.line(24 + k * 1.2, 31, 24 + k * 4.6, 45.6 - Math.abs(k) * 0.5, PEACH[1]!, 0.9);
  c.fill(ellipse(24, 28.6, 8.6, 8.6), SNOW, { bevel: 8.6, gain: 1.35 });
  c.flat(ellipse(21, 25, 2.4, 1.6, -0.6), WHITE);
  c.flat(ellipse(27.4, 32, 3, 1.2, -0.5), PINK[5]!, 170);
  return done(c);
}

/** A round jade charm with a hole in its middle, on a red cord with a tassel. */
export function jade(): Rgba {
  const c = canvas();
  c.fill(both(ring(24, 5.4, 3.6, 1.8), rect(0, 0, 48, 8.4)), RED, { bevel: 1 });
  c.line(24, 8, 24, 10, RED[3]!, 1.6);
  c.fill(minus(ellipse(24, 24, 17.4, 16.4), ellipse(24, 24, 5.4, 5.4)), JADE, { bevel: 6.4, gain: 1.2 });
  c.flat(minus(ring(24, 24, 11.2, 1.1), ellipse(24, 24, 7, 7)), JADE[5]!, 170);
  c.flat(ellipse(14.4, 18, 1.4, 4.4, 0.7), WHITE, 215);
  c.fill(capsule(24, 40, 24, 45, 1.8, 1.4), RED, { bevel: 1 });
  for (const dx of [-3, -1, 1, 3]) c.line(24, 44, 24 + dx, 47.6, ROSE[3]!, 0.9);
  return done(c);
}

/** A black gem, cut with steps, and white light on it. */
export function onyx(): Rgba {
  const c = canvas();
  const around = (k: number): Pt[] =>
    (
      [
        [14, 5],
        [34, 5],
        [43, 14],
        [43, 34],
        [34, 43],
        [14, 43],
        [5, 34],
        [5, 14],
      ] as const
    ).map(([x, y]) => [24 + (x - 24) * k, 24 + (y - 24) * k] as const);
  c.fill(polygon(around(1)), ONYX, { bevel: 4, gain: 0.8 });
  c.flat(polygon(around(0.74)), ONYX[3]!);
  c.flat(polygon(around(0.46)), ONYX[1]!);
  const [outer, inner] = [around(1), around(0.74)];
  for (let i = 0; i < 8; i++) c.line(outer[i]![0], outer[i]![1], inner[i]![0], inner[i]![1], ONYX[5]!, 0.9);
  c.flat(
    polygon([
      [12, 8.6],
      [20, 8.6],
      [8.6, 18],
    ]),
    ONYX[5]!,
  );
  c.flat(
    polygon([
      [11.6, 10.2],
      [17, 10.2],
      [10, 15.4],
    ]),
    WHITE,
    240,
  );
  c.flat(ellipse(33.4, 36.4, 4.6, 0.9, -0.7), WHITE, 150);
  c.flat(polygon(starPoints(40, 7, 4, 4.4, 1.1, -Math.PI / 2)), WHITE);
  return done(c);
}

/** Three crystals standing together on a rock. */
export function crystal(): Rgba {
  const c = canvas();
  const prism = (cx: number, base: number, half: number, shoulder: number, tip: number) =>
    polygon([
      [cx - half, base],
      [cx - half, shoulder],
      [cx, tip],
      [cx + half, shoulder],
      [cx + half, base],
    ]);
  for (const [cx, base, half, shoulder, tip, tone] of [
    [13.4, 42, 6.2, 27, 16, SKY],
    [34.6, 42, 6.6, 24, 11, PINK],
    [24, 44, 8.2, 22, 2.6, LILAC],
  ] as const) {
    c.fill(prism(cx, base, half, shoulder, tip), tone, { bevel: 4, gain: 1.35, base: 0.7 });
    c.flat(
      polygon([
        [cx, tip],
        [cx + half, shoulder],
        [cx + half, base],
        [cx, base],
      ]),
      tone[3]!,
      150,
    );
    c.line(cx, tip + 1, cx, base - 1, tone[2]!, 0.8);
    c.flat(ellipse(cx - half * 0.55, (shoulder + base) / 2 - 2, 0.9, (base - shoulder) * 0.3, 0.05), WHITE, 215);
  }
  c.fill(ellipse(24, 45, 20.6, 3.2), STONE, { bevel: 2 });
  return done(c);
}

/** A gold ring with a big diamond. */
export function ring_(): Rgba {
  const c = canvas();
  c.fill(ring(24, 35, 10.6, 5.2, 1.04), GOLD, { bevel: 2.4, gain: 1.25 });
  c.flat(ring(24, 35, 10.6, 1, 1.04), YELLOW[5]!, 150);
  c.fill(
    polygon([
      [17, 24],
      [31, 24],
      [28.4, 29],
      [19.6, 29],
    ]),
    GOLD,
    { bevel: 1.6 },
  );
  c.fill(
    polygon([
      [15.4, 5],
      [32.6, 5],
      [38, 13],
      [10, 13],
    ]),
    SKY,
    { bevel: 3, gain: 1.2, base: 0.8 },
  );
  c.fill(
    polygon([
      [10, 13],
      [38, 13],
      [24, 28],
    ]),
    SKY,
    { bevel: 4, gain: 1.15 },
  );
  for (const [x0, y0, x1, y1] of [
    [15.4, 5, 19.6, 13],
    [32.6, 5, 28.4, 13],
    [19.6, 13, 24, 28],
    [28.4, 13, 24, 28],
  ] as const)
    c.line(x0, y0, x1, y1, SKY[2]!, 0.9);
  c.flat(
    polygon([
      [16.6, 6.4],
      [21.6, 6.4],
      [19.6, 11.4],
    ]),
    WHITE,
    235,
  );
  c.flat(polygon(starPoints(40, 5, 4, 4, 1, -Math.PI / 2)), YELLOW[5]!);
  return done(c);
}

/** A sack tied at the neck, a gold coin on it and more coins peeking out of the top. */
export function sack(): Rgba {
  const c = canvas();
  for (const [x, y, rot] of [
    [18.4, 9.6, -0.25],
    [29, 8.4, 0.2],
    [23.6, 6.4, 0],
  ] as const)
    c.fill(ellipse(x, y, 5, 2.8, rot), GOLD, { bevel: 1.8, gain: 1.2 });
  c.fill(ellipse(24, 14.6, 11.4, 3.6), BURLAP, { bevel: 2.4 });
  c.fill(ellipse(24, 33, 18.6, 13.6), BURLAP, { bevel: 8, gain: 1.15 });
  c.fill(
    polygon([
      [17, 15],
      [31, 15],
      [30, 22],
      [18, 22],
    ]),
    BURLAP,
    { bevel: 2.4 },
  );
  c.fill(rect(16.4, 19.6, 31.6, 23), DARKWOOD, { bevel: 1.4 });
  c.fill(ellipse(20.6, 24.4, 3.4, 2, -0.6), DARKWOOD, { bevel: 1.2 });
  c.fill(ellipse(27.4, 24.4, 3.4, 2, 0.6), DARKWOOD, { bevel: 1.2 });
  c.fill(ellipse(24, 35, 7.6, 7.6), GOLD, { bevel: 3.4, gain: 1.25 });
  c.flat(ring(24, 35, 5.4, 1, 1), YELLOW[5]!);
  c.flat(polygon(starPoints(24, 35, 5, 3.4, 1.4, -Math.PI / 2)), YELLOW[5]!);
  for (const [x, y] of [
    [10, 31],
    [13, 40],
    [37, 30],
    [34, 41],
    [16, 28],
    [33, 36],
  ] as const)
    c.line(x, y, x + 2.4, y - 0.8, BURLAP[1]!, 0.9);
  c.flat(ellipse(13.6, 29, 1.4, 4, 0.5), WHITE, 150);
  return done(c);
}

const dollar = (c: ReturnType<typeof canvas>): void => {
  const top = minus(ring(24, 25, 3.6, 1.7), (x, y) => x > 24 && y > 25);
  const bottom = minus(ring(24, 32.2, 3.6, 1.7), (x, y) => x < 24 && y < 32.2);
  c.flat(union(top, bottom, rect(23.3, 20, 24.7, 37.6)), LEAF[1]!);
};

/** Two green notes and a gold coin. */
export function cash(): Rgba {
  const c = canvas();
  c.fill(turn(rect(5, 9, 43, 31), 24, 20, -0.22), GREEN, { bevel: 2.6 });
  c.fill(turn(rect(4, 15, 44, 40), 24, 27.5, 0.07), GREEN, { bevel: 3, gain: 1.1 });
  c.flat(turn(minus(rect(6.4, 17.4, 41.6, 37.6), rect(8, 19, 40, 36)), 24, 27.5, 0.07), LEAF[2]!);
  c.fill(ellipse(24, 28, 9, 9.6), CREAM, { bevel: 3.6 });
  dollar(c);
  for (const [x, y] of [
    [10.6, 21.8],
    [37.4, 33.6],
  ] as const)
    c.fill(ellipse(x, y, 2.2, 2.2), CREAM, { bevel: 1.4 });
  c.fill(ellipse(38.4, 39, 6.6, 6.6), GOLD, { bevel: 3.2, gain: 1.25 });
  c.flat(ring(38.4, 39, 4.4, 0.9), YELLOW[5]!);
  c.flat(ellipse(36.4, 36.6, 1.2, 1.2), WHITE);
  return done(c);
}

export const TREASURE = { opal, pearl, jade, onyx, crystal, ring: ring_, sack, cash };
