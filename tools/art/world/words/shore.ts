import type { Rgba } from '../../core/image';
import { both, capsule, ellipse, minus, type Pt, polygon, ring, union } from '../../fx/kit';
import {
  BLUE,
  BROWN,
  CREAM,
  canvas,
  DARKWOOD,
  done,
  GOLD,
  INK,
  IRON,
  ORANGE,
  PEACH,
  PINK,
  RED,
  ROSE,
  rect,
  SAND,
  SLATE,
  SNOW,
  STONE,
  turn,
  WHITE,
  WOOD,
  YELLOW,
} from './shared';

/** The little notches along the top of a wall. */
const merlons = (x0: number, x1: number, y: number, count: number, h = 4) =>
  union(
    ...Array.from({ length: count }, (_, i) => {
      const w = (x1 - x0) / (count * 2 - 1);
      return rect(x0 + i * 2 * w, y - h, x0 + i * 2 * w + w, y + 0.5);
    }),
  );

/** A castle of sand, three towers with notches along their tops, and a flag on the tallest. */
export function castle(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 43, 22, 4), SAND, { bevel: 3, gain: 0.8 });
  c.fill(rect(9, 24, 39, 43), SAND, { bevel: 3 });
  c.fill(merlons(9, 39, 24, 5), SAND, { bevel: 1.6 });
  for (const [x0, x1, top] of [
    [3, 14, 15],
    [34, 45, 15],
    [17, 31, 7],
  ] as const) {
    c.fill(rect(x0, top, x1, 43), SAND, { bevel: 3.2 });
    c.fill(merlons(x0, x1, top, 3), SAND, { bevel: 1.6 });
    c.flat(rect(x0 + 1, top + 12, x1 - 1, top + 12.8), SAND[1]!);
  }
  c.flat(union(rect(21.6, 33, 26.4, 43), ellipse(24, 33, 2.4, 3.4)), SAND[0]!);
  for (const [x, y] of [
    [8.5, 22],
    [39.5, 22],
  ] as const)
    c.flat(rect(x - 0.8, y, x + 0.8, y + 4), SAND[0]!);
  c.line(24, 7, 24, -0.4, WOOD[2]!, 1.2);
  c.fill(
    polygon([
      [24.4, 0.2],
      [32, 2.6],
      [24.4, 5],
    ]),
    RED,
    { bevel: 1.4 },
  );
  c.flat(ellipse(7, 25, 1, 5, 0.05), WHITE, 150);
  return done(c);
}

/** A red flag with a white stripe, flying from a pole stuck in a mound of sand. */
export function flag(): Rgba {
  const c = canvas();
  c.fill(ellipse(15, 43, 11, 4), SAND, { bevel: 3, gain: 0.9 });
  c.fill(capsule(15, 44, 15, 4, 1.7), WOOD, { bevel: 1.5 });
  c.fill(
    polygon([
      [16.4, 5],
      [41, 5],
      [35.4, 12.6],
      [41, 20.2],
      [16.4, 20.2],
    ]),
    RED,
    { bevel: 2.6, gain: 1.1 },
  );
  c.flat(rect(16.6, 11, 36, 14.2), WHITE);
  c.flat(ellipse(15, 3.4, 2.2, 2.2), GOLD[4]!);
  return done(c);
}

/** A tower of grey stone with a pink pointed roof, one window and an arched door. */
export function tower(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 44, 14, 3.2), STONE, { bevel: 3, gain: 0.8 });
  c.fill(rect(14, 20, 34, 44), STONE, { bevel: 3.6 });
  for (const y of [26, 32, 38])
    for (const off of [0, 5])
      for (let x = 14 + off; x < 34; x += 10) c.flat(rect(x, y - 0.4, Math.min(x + 4.8, 34), y + 0.4), STONE[1]!);
  c.fill(rect(11, 18, 37, 21.6), STONE, { bevel: 1.6 });
  c.fill(
    polygon([
      [10.4, 19],
      [37.6, 19],
      [24, 2.6],
    ]),
    ROSE,
    { bevel: 4, gain: 1.15 },
  );
  c.flat(
    polygon([
      [24, 4.6],
      [27.6, 11],
      [24, 14.6],
    ]),
    PINK[3]!,
    170,
  );
  c.flat(union(rect(21.4, 29, 26.6, 44), ellipse(24, 29, 2.6, 3.6)), DARKWOOD[1]!);
  c.flat(union(rect(21.9, 32.4, 26.1, 44), ellipse(24, 32.4, 2.1, 2.8)), DARKWOOD[2]!);
  c.fill(ellipse(24, 25, 2.4, 2.8), GOLD, { bevel: 2 });
  c.line(24, 2.6, 24, -0.2, WOOD[2]!, 1);
  return done(c);
}

/** A beach pail, red, with a yellow rim, full to the top with sand. */
export function bucket(): Rgba {
  const c = canvas();
  c.line(10, 20, 24, 3.6, STONE[3]!, 1.6);
  c.line(24, 3.6, 38, 20, STONE[3]!, 1.6);
  c.fill(ellipse(24, 19, 14, 5.6), SAND, { bevel: 3, gain: 1.1 });
  c.fill(
    polygon([
      [9.4, 19],
      [38.6, 19],
      [34, 43],
      [14, 43],
    ]),
    RED,
    { bevel: 4.6, gain: 1.1 },
  );
  c.fill(ellipse(24, 43, 10, 2.4), RED, { bevel: 2 });
  c.fill(both(ring(24, 19, 14.4, 2.8, 0.4), rect(0, 19, 48, 48)), YELLOW, { bevel: 1.4 });
  c.flat(rect(11.6, 26, 36.4, 28.4), YELLOW[4]!);
  c.flat(rect(12.8, 33, 35.2, 35.4), YELLOW[4]!);
  c.flat(ellipse(16, 30, 1.2, 7, 0.12), WHITE, 180);
  for (const [x, y] of [
    [19, 17.6],
    [26, 16.4],
    [30, 18.4],
  ] as const)
    c.flat(ellipse(x, y, 0.8, 0.6), SAND[1]!);
  return done(c);
}

/** A spade with a wooden shaft and a D grip, leaning at a slant. */
export function spade(): Rgba {
  const c = canvas();
  const slant = (shape: ReturnType<typeof rect>) => turn(shape, 24, 24, 0.5);
  c.fill(slant(capsule(24, 26, 24, 9, 1.9)), WOOD, { bevel: 1.8 });
  c.fill(slant(minus(ellipse(24, 6, 6.4, 3.6), ellipse(24, 6, 3.6, 1.4))), WOOD, { bevel: 1.4 });
  c.fill(
    slant(
      polygon([
        [16.4, 25],
        [31.6, 25],
        [30.4, 41],
        [24, 47],
        [17.6, 41],
      ]),
    ),
    IRON,
    { bevel: 3.2, gain: 1.1 },
  );
  c.flat(slant(rect(23.4, 27, 24.6, 42)), IRON[1]!);
  c.flat(slant(ellipse(19.6, 33, 1, 5, 0)), WHITE, 190);
  return done(c);
}

/** A spiral shell in cream with a pink lip: a pointed cone of whorls that opens toward you. */
export function seashell(): Rgba {
  const c = canvas();
  const tilt = (shape: ReturnType<typeof rect>) => turn(shape, 24, 26, -0.5);
  const whorls = [
    [24, 5, 3.6, 3.2],
    [24, 11, 6.4, 4.4],
    [24, 18.4, 9.6, 5.6],
    [24, 28, 13.6, 7.4],
  ] as const;
  for (const [x, y, rx, ry] of whorls) c.fill(tilt(ellipse(x, y, rx, ry)), CREAM, { bevel: 3.4, gain: 1.1 });
  for (const [x, y, rx, ry] of whorls.slice(1)) c.flat(tilt(ellipse(x, y + ry - 1.2, rx - 0.8, 0.9)), PEACH[1]!);
  c.fill(
    tilt(
      polygon([
        [10.4, 30],
        [37.6, 30],
        [34, 42],
        [24, 46],
        [14, 42],
      ]),
    ),
    CREAM,
    { bevel: 5, gain: 1.1 },
  );
  c.fill(tilt(ellipse(24, 40, 8.6, 5)), PINK, { bevel: 3.6, gain: 1.15 });
  c.flat(tilt(ellipse(24, 40.6, 5, 2.8)), ROSE[0]!);
  for (const x of [15, 19.6, 28.4, 33]) c.flat(tilt(capsule(x, 32, 24 + (x - 24) * 0.5, 41, 0.45)), PEACH[1]!);
  c.flat(tilt(ellipse(17, 23, 1.2, 4.4, 0.3)), WHITE, 190);
  return done(c);
}

/** A scallop, a fan of ridges that spreads from a hinge with two small ears. */
export function scallop(): Rgba {
  const c = canvas();
  const fan: Pt[] = [[24, 41]];
  for (let i = 0; i <= 14; i++) {
    const a = Math.PI * (1.08 + (i / 14) * 0.84);
    fan.push([24 + Math.cos(a) * 21.4, 41 + Math.sin(a) * 33]);
  }
  c.fill(polygon(fan), PINK, { bevel: 5, gain: 1.05 });
  for (let i = 0; i <= 7; i++) {
    const a = Math.PI * (1.12 + (i / 7) * 0.76);
    c.line(24, 40, 24 + Math.cos(a) * 20.4, 41 + Math.sin(a) * 31, ROSE[1]!, 1.3);
  }
  c.fill(
    polygon([
      [17, 39.4],
      [31, 39.4],
      [28.6, 45.4],
      [19.4, 45.4],
    ]),
    PEACH,
    { bevel: 2.4 },
  );
  c.flat(ellipse(15, 15.6, 3, 1.4, -0.7), WHITE, 190);
  return done(c);
}

/** A tall lighthouse in red and white stripes, a lit lamp in a glass room and rays of light. */
export function lighthouse(): Rgba {
  const c = canvas();
  c.flat(
    polygon([
      [22, 11],
      [2, 4.4],
      [2, 14.6],
    ]),
    YELLOW[5]!,
    120,
  );
  c.flat(
    polygon([
      [26, 11],
      [46, 4.4],
      [46, 14.6],
    ]),
    YELLOW[5]!,
    120,
  );
  c.fill(ellipse(24, 44, 17, 4), STONE, { bevel: 3, gain: 0.9 });
  const body = polygon([
    [16, 44],
    [32, 44],
    [28.4, 17],
    [19.6, 17],
  ]);
  c.fill(body, SNOW, { bevel: 4.6 });
  for (const [y0, y1] of [
    [20, 26],
    [32, 38],
  ] as const)
    c.fill(both(body, rect(0, y0, 48, y1)), RED, { bevel: 3 });
  c.fill(rect(15, 14.6, 33, 18.2), DARKWOOD, { bevel: 1.6 });
  c.fill(rect(19.4, 7, 28.6, 14.6), YELLOW, { bevel: 2.4, gain: 1.2 });
  c.flat(rect(23.4, 7.6, 24.6, 14), GOLD[2]!);
  c.fill(
    polygon([
      [17.4, 7.4],
      [30.6, 7.4],
      [24, 0.8],
    ]),
    RED,
    { bevel: 2.4 },
  );
  c.flat(union(rect(22.2, 36, 25.8, 44), ellipse(24, 36, 1.8, 2.2)), DARKWOOD[1]!);
  return done(c);
}

/** A rowing boat with a red hull, a cream stripe and two oars sticking out. */
export function boat(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 40, 22, 5), BLUE, { bevel: 3, gain: 1 });
  c.line(2, 4, 19, 28, WOOD[4]!, 1.8);
  c.line(46, 4, 29, 28, WOOD[4]!, 1.8);
  c.fill(ellipse(2.6, 4.4, 2, 3.6, 0.5), WOOD, { bevel: 1.4 });
  c.fill(ellipse(45.4, 4.4, 2, 3.6, -0.5), WOOD, { bevel: 1.4 });
  const hull = polygon([
    [3, 26],
    [45, 26],
    [38, 40],
    [10, 40],
  ]);
  c.fill(hull, RED, { bevel: 4.4, gain: 1.1 });
  c.fill(both(hull, rect(0, 29.4, 48, 32.6)), CREAM, { bevel: 1.2 });
  c.fill(ellipse(24, 26, 21, 3.2), WOOD, { bevel: 2.4 });
  c.flat(rect(20, 22.6, 28, 26), WOOD[2]!);
  c.flat(ellipse(10, 32, 1, 3.6, -0.3), WHITE, 170);
  c.flat(ellipse(11, 43.6, 6, 0.9), WHITE, 190);
  c.flat(ellipse(36, 44, 5, 0.9), WHITE, 190);
  return done(c);
}

/** A big ship with a brown hull, two masts, three white sails and a flag on top. */
export function ship(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 43.6, 23, 4), BLUE, { bevel: 3 });
  c.line(15, 33, 15, 6, DARKWOOD[3]!, 1.7);
  c.line(33, 33, 33, 9, DARKWOOD[3]!, 1.7);
  c.fill(
    polygon([
      [16.4, 8],
      [28, 10],
      [28, 24.4],
      [16.4, 26],
    ]),
    CREAM,
    { bevel: 3, gain: 1.1 },
  );
  c.fill(
    polygon([
      [34.4, 11],
      [44, 12.6],
      [44, 25.6],
      [34.4, 27],
    ]),
    CREAM,
    { bevel: 3, gain: 1.1 },
  );
  c.fill(
    polygon([
      [3, 12.6],
      [13.6, 13.4],
      [13.6, 25.6],
      [3, 28],
    ]),
    CREAM,
    { bevel: 3, gain: 1.1 },
  );
  c.fill(
    polygon([
      [15.4, 3.4],
      [22, 5.4],
      [15.4, 7.4],
    ]),
    RED,
    { bevel: 1 },
  );
  c.fill(
    polygon([
      [2, 31],
      [46, 31],
      [41, 42],
      [8, 42],
    ]),
    BROWN,
    { bevel: 4.4, gain: 1.1 },
  );
  c.flat(rect(4, 33.4, 44, 35), DARKWOOD[1]!);
  for (const x of [14, 22, 30, 38]) c.fill(ellipse(x, 37.6, 1.6, 1.6), GOLD, { bevel: 1.4 });
  c.flat(ellipse(10, 35, 1, 2.6, -0.3), WHITE, 150);
  return done(c);
}

/** One big sail, curved by the wind, on a mast, with a rope running down to a little deck. */
export function sail(): Rgba {
  const c = canvas();
  c.fill(rect(10, 40.6, 38, 44), WOOD, { bevel: 1.6 });
  c.fill(ellipse(24, 45, 19, 2.6), BLUE, { bevel: 2 });
  c.fill(capsule(20, 41, 20, 3, 1.6), DARKWOOD, { bevel: 1.4 });
  const big = polygon([
    [22.4, 5],
    [26, 10],
    [32, 18],
    [38, 28],
    [41, 36.6],
    [22.4, 36.6],
  ]);
  c.fill(big, CREAM, { bevel: 5, gain: 1.15 });
  c.fill(both(big, rect(0, 17, 48, 21)), RED, { bevel: 1.4 });
  c.fill(both(big, rect(0, 27, 48, 31)), RED, { bevel: 1.4 });
  c.fill(
    polygon([
      [17.6, 14],
      [17.6, 36.6],
      [4, 36.6],
      [8, 28],
      [12.6, 20],
    ]),
    SNOW,
    { bevel: 4 },
  );
  c.fill(
    polygon([
      [20.4, 2.4],
      [26.6, 3.8],
      [20.4, 6],
    ]),
    RED,
    { bevel: 1 },
  );
  return done(c);
}

/** An anchor of dark iron: a ring at the top, a crossbar, a long shank and two curved arms. */
export function anchor(): Rgba {
  const c = canvas();
  c.fill(minus(ellipse(24, 7, 5, 5), ellipse(24, 7, 2.4, 2.4)), IRON, { bevel: 1.8 });
  c.fill(capsule(24, 11, 24, 40, 2.3), IRON, { bevel: 2.2 });
  c.fill(capsule(15, 16, 33, 16, 1.9), IRON, { bevel: 1.8 });
  c.fill(both(ring(24, 26, 15.4, 4.2), rect(0, 26, 48, 48)), IRON, { bevel: 2.2 });
  c.fill(
    polygon([
      [7, 24],
      [12.4, 24],
      [9, 32],
    ]),
    IRON,
    { bevel: 1.4 },
  );
  c.fill(
    polygon([
      [41, 24],
      [35.6, 24],
      [39, 32],
    ]),
    IRON,
    { bevel: 1.4 },
  );
  c.fill(ellipse(24, 41, 3, 2.6), IRON, { bevel: 1.6 });
  c.flat(rect(23, 12, 24, 39), WHITE, 110);
  c.flat(ellipse(22.4, 6, 1.2, 1.2), WHITE, 190);
  return done(c);
}

/** A seagull standing: a white body, grey wing, orange beak and thin orange legs. */
export function gull(): Rgba {
  const c = canvas();
  c.line(21, 35, 20, 44, ORANGE[3]!, 1.4);
  c.line(27, 35, 28, 44, ORANGE[3]!, 1.4);
  c.fill(
    polygon([
      [17, 43],
      [23, 44.4],
      [21, 45.6],
      [15, 45],
    ]),
    ORANGE,
    { bevel: 1 },
  );
  c.fill(
    polygon([
      [26, 43.6],
      [32, 44.6],
      [30.4, 46],
      [25, 45.6],
    ]),
    ORANGE,
    { bevel: 1 },
  );
  c.fill(
    polygon([
      [4, 20],
      [16, 24],
      [14, 32],
      [6, 28],
    ]),
    SNOW,
    { bevel: 2.4 },
  );
  c.fill(ellipse(24, 28, 15, 9.4, -0.1), SNOW, { bevel: 5.4, gain: 1.1 });
  c.fill(ellipse(21, 26.6, 10.6, 6, -0.18), STONE, { bevel: 3.4 });
  c.fill(
    polygon([
      [5.4, 24.6],
      [16, 25.6],
      [16, 28],
      [4, 29.6],
    ]),
    SLATE,
    { bevel: 1.6 },
  );
  c.fill(ellipse(35.4, 17, 6.6, 6.4), SNOW, { bevel: 4 });
  c.fill(
    polygon([
      [40.4, 16],
      [47.4, 18.6],
      [40.4, 21.4],
    ]),
    ORANGE,
    { bevel: 1.6 },
  );
  c.flat(ellipse(37.2, 15.6, 1.1, 1.1), INK[0]!);
  c.flat(ellipse(36.8, 15.2, 0.4, 0.4), WHITE);
  c.flat(ellipse(21, 24, 5, 1, -0.2), WHITE, 150);
  return done(c);
}

export const SHORE = {
  castle,
  flag,
  tower,
  bucket,
  spade,
  seashell,
  scallop,
  lighthouse,
  boat,
  ship,
  sail,
  anchor,
  gull,
} as const;
