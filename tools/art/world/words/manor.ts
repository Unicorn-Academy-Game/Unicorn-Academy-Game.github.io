import type { Rgba } from '../../core/image';
import { both, capsule, ellipse, minus, type Pt, polygon, ring, type Shape, starPoints, union } from '../../fx/kit';
import {
  AMBER,
  CREAM,
  canvas,
  done,
  GOLD,
  GREEN,
  INK,
  LEAF,
  NIGHT,
  ORANGE,
  PINK,
  PURPLE,
  RED,
  ROSE,
  rect,
  SKY,
  SNOW,
  turn,
  WHITE,
  WOOD,
  YELLOW,
} from './shared';

/** An iron lantern with a flame glowing in the glass. */
export function lantern(): Rgba {
  const c = canvas();
  c.fill(ring(24, 7.6, 5, 2.2, 1.1), INK, { bevel: 1.6 });
  c.fill(
    polygon([
      [12, 18],
      [36, 18],
      [30, 10.6],
      [18, 10.6],
    ]),
    INK,
    { bevel: 2.4 },
  );
  c.fill(rect(14, 18, 34, 35), YELLOW, { bevel: 6, gain: 1.15 });
  c.flat(ellipse(24, 27.6, 4.6, 6.4), AMBER[5]!, 190);
  c.fill(
    union(
      ellipse(24, 29.6, 3, 4.6),
      polygon([
        [24, 20.4],
        [26.4, 27],
        [21.6, 27],
      ]),
    ),
    ORANGE,
    { bevel: 2.4 },
  );
  c.flat(ellipse(24, 31, 1.4, 2.6), YELLOW[5]!);
  c.fill(rect(13, 18, 16.4, 35), INK, { bevel: 1.4 });
  c.fill(rect(31.6, 18, 35, 35), INK, { bevel: 1.4 });
  c.fill(rect(11, 35, 37, 40), INK, { bevel: 2.4 });
  c.fill(rect(14, 40, 19, 43.6), INK, { bevel: 1.2 });
  c.fill(rect(29, 40, 34, 43.6), INK, { bevel: 1.2 });
  c.flat(ellipse(19.6, 24, 0.9, 3, 0.1), WHITE, 210);
  return done(c);
}

/** A candle with wax running down it, in a gold holder. */
export function candle(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 44.4, 12.4, 3), GOLD, { bevel: 2 });
  c.fill(capsule(24, 36, 24, 43.6, 2.2, 3.2), GOLD, { bevel: 1.8 });
  c.fill(ellipse(24, 35, 9.4, 3), GOLD, { bevel: 2 });
  c.fill(rect(19.4, 16, 28.6, 34), CREAM, { bevel: 3.4, gain: 1.1 });
  c.fill(ellipse(24, 16, 4.6, 2), CREAM, { bevel: 1.6 });
  c.fill(capsule(21.6, 17, 21.6, 22.6, 1.3), SNOW, { bevel: 1.2 });
  c.fill(capsule(27, 16.6, 27, 20.4, 1.2), SNOW, { bevel: 1.2 });
  c.line(24, 15, 24, 12.6, INK[1]!, 1.2);
  c.fill(
    union(
      ellipse(24, 8.4, 3.6, 4.4),
      polygon([
        [24, 0.6],
        [27.4, 6.6],
        [20.6, 6.6],
      ]),
    ),
    ORANGE,
    { bevel: 2.6, gain: 1.1 },
  );
  c.flat(ellipse(24, 9.4, 1.6, 2.6), YELLOW[5]!);
  return done(c);
}

/**
 * A flame as wide as it is tall: `top` to `bottom` is its height, `lean` how far its tip leans to
 * the right.
 */
const tongue =
  (cx: number, top: number, bottom: number, half: number, lean: number): Shape =>
  (x, y) => {
    if (y < top || y > bottom) return false;
    const t = (y - top) / (bottom - top);
    const width = half * Math.sin(Math.PI * t ** 1.9) ** 0.78;
    const mid = cx + lean * (1 - t) ** 2 - lean * 0.34 * Math.sin(Math.PI * t);
    return Math.abs(x - mid) <= width;
  };

/**
 * One big flame, orange outside, yellow in the middle and white at its heart, with a small tongue
 * beside it.
 */
export function flame(): Rgba {
  const c = canvas();
  c.fill(union(tongue(25, 2, 45, 15.4, 8), tongue(12.4, 15, 38, 5.6, -4)), ORANGE, { bevel: 6, gain: 1.2 });
  c.fill(tongue(25, 18, 45, 10, 4.6), YELLOW, { bevel: 4.4, gain: 1.15 });
  c.fill(tongue(25, 30, 45, 5.2, 1.8), SNOW, { bevel: 2.6 });
  c.flat(both(tongue(25, 2, 45, 15.4, 8), rect(0, 41, 48, 48)), RED[5]!, 130);
  return done(c);
}

/** A gold chandelier hanging from a chain, with candles on its ring and crystals below it. */
export function chandelier(): Rgba {
  const c = canvas();
  c.fill(capsule(24, 0, 24, 9, 1.2), GOLD, { bevel: 1 });
  c.fill(ellipse(24, 11, 4.2, 3.4), GOLD, { bevel: 2 });
  c.fill(capsule(24, 12, 24, 30, 2), GOLD, { bevel: 1.6 });
  c.fill(capsule(24, 17, 9, 28, 1.6), GOLD, { bevel: 1.4 });
  c.fill(capsule(24, 17, 39, 28, 1.6), GOLD, { bevel: 1.4 });
  c.fill(ring(24, 31, 16.4, 3.6, 0.3), GOLD, { bevel: 1.8, gain: 1.1 });
  for (const [x, y] of [
    [9.4, 29.4],
    [38.6, 29.4],
    [16, 35],
    [32, 35],
  ] as const) {
    c.fill(rect(x - 1.6, y - 8.6, x + 1.6, y), CREAM, { bevel: 1.2 });
    c.fill(
      union(
        ellipse(x, y - 11.4, 1.7, 2.4),
        polygon([
          [x, y - 15],
          [x + 1.6, y - 11.4],
          [x - 1.6, y - 11.4],
        ]),
      ),
      ORANGE,
      { bevel: 1.2 },
    );
  }
  for (const [x, y] of [
    [11.6, 36],
    [20, 38.4],
    [28, 38.4],
    [36.4, 36],
  ] as const) {
    c.fill(
      polygon([
        [x, y],
        [x + 2.4, y + 3.2],
        [x, y + 7.4],
        [x - 2.4, y + 3.2],
      ]),
      SKY,
      { bevel: 1.6, gain: 1.15 },
    );
    c.flat(ellipse(x - 0.5, y + 2.6, 0.5, 0.9), WHITE);
  }
  c.fill(
    polygon([
      [24, 38],
      [27.6, 42],
      [24, 47.8],
      [20.4, 42],
    ]),
    SKY,
    { bevel: 2.4, gain: 1.15 },
  );
  c.flat(ellipse(23, 41.4, 0.8, 1.6, 0.2), WHITE);
  return done(c);
}

/** A crescent moon with three craters and a star. */
export function moon(): Rgba {
  const c = canvas();
  c.fill(minus(ellipse(23, 25, 18.6, 18.6), ellipse(31.6, 21.4, 15.8, 15.8)), YELLOW, { bevel: 6.4, gain: 1.2 });
  for (const [x, y, r] of [
    [12.6, 29, 2.6],
    [17.6, 16.6, 1.8],
    [19.4, 36.4, 1.8],
  ] as const)
    c.flat(ellipse(x, y, r, r * 0.9), AMBER[4]!, 200);
  c.flat(polygon(starPoints(38, 13, 4, 5.4, 1.4, -Math.PI / 2)), WHITE);
  c.flat(ellipse(40.6, 32, 1.5, 1.5), YELLOW[5]!);
  c.flat(ellipse(34.6, 40, 1, 1), WHITE);
  return done(c);
}

/** A bat with its wings spread, big ears and two small fangs. */
export function bat(): Rgba {
  const c = canvas();
  const wing = (s: 1 | -1): Pt[] => [
    [24 + s * 4, 22],
    [24 + s * 21, 7],
    [24 + s * 23, 19],
    [24 + s * 18.6, 20.4],
    [24 + s * 17.6, 29],
    [24 + s * 13, 24.4],
    [24 + s * 10, 32],
    [24 + s * 6.6, 26.6],
  ];
  for (const s of [-1, 1] as const) {
    c.fill(polygon(wing(s)), PURPLE, { bevel: 3.2, gain: 1.1 });
    for (const [x, y] of [
      [21, 7],
      [23, 19],
      [17.6, 29],
    ] as const)
      c.line(24 + s * 5, 23, 24 + s * x, y, NIGHT[1]!, 0.9);
  }
  c.fill(ellipse(24, 27.4, 6.2, 9, 0), NIGHT, { bevel: 4, gain: 1.1 });
  c.fill(
    polygon([
      [18.6, 17],
      [17.4, 7.2],
      [23, 13],
    ]),
    NIGHT,
    { bevel: 1.6 },
  );
  c.fill(
    polygon([
      [29.4, 17],
      [30.6, 7.2],
      [25, 13],
    ]),
    NIGHT,
    { bevel: 1.6 },
  );
  c.fill(ellipse(24, 18, 6.4, 5.6), NIGHT, { bevel: 3.6, gain: 1.1 });
  for (const x of [21.2, 26.8]) {
    c.flat(ellipse(x, 17.4, 1.9, 2.1), WHITE);
    c.flat(ellipse(x + (x < 24 ? 0.4 : -0.4), 17.8, 0.9, 1.1), INK[1]!);
  }
  for (const x of [22, 26])
    c.flat(
      polygon([
        [x - 0.9, 21.2],
        [x + 0.9, 21.2],
        [x, 24],
      ]),
      WHITE,
    );
  return done(c);
}

export function cloud(): Rgba {
  const c = canvas();
  c.fill(
    union(
      ellipse(13.4, 30, 8.8, 8),
      ellipse(23.6, 22.8, 10.6, 10.4),
      ellipse(34.6, 28.6, 9.4, 8.6),
      ellipse(24, 32.4, 17.4, 7.4),
    ),
    SNOW,
    { bevel: 6.4, gain: 1.15 },
  );
  c.flat(ellipse(19, 18.4, 2.6, 1.4, -0.7), WHITE);
  c.flat(ellipse(10, 27, 1.8, 1, -0.7), WHITE);
  c.flat(ellipse(32, 24, 1.6, 0.9, -0.5), WHITE);
  c.flat(minus(ellipse(24, 36, 14, 1.6), ellipse(24, 44, 40, 6)), SKY[4]!, 150);
  return done(c);
}

/** An arched window on a night sky, with a crescent moon and stars in the glass. */
export function window(): Rgba {
  const c = canvas();
  const arch = (r: number, top: number, bottom: number, half: number): ReturnType<typeof rect> =>
    union(rect(24 - half, top + r, 24 + half, bottom), ellipse(24, top + r, half, r));
  c.fill(arch(15, 5, 42, 15), WOOD, { bevel: 3.2 });
  c.fill(arch(11, 9, 40, 11), NIGHT, { bevel: 3, gain: 0.9, base: 0.4 });
  c.line(24, 9, 24, 40, WOOD[4]!, 1.8);
  c.line(13, 25, 35, 25, WOOD[4]!, 1.8);
  c.flat(minus(ellipse(30, 17.6, 4.6, 4.6), ellipse(32, 16.4, 4, 4)), YELLOW[5]!);
  for (const [x, y, r] of [
    [17.6, 15, 2.8],
    [17, 33, 2.4],
    [30.6, 33.4, 2.6],
  ] as const)
    c.flat(polygon(starPoints(x, y, 4, r, r * 0.28, -Math.PI / 2)), WHITE);
  c.fill(rect(6, 41, 42, 46), WOOD, { bevel: 2 });
  c.flat(rect(6, 41, 42, 42.2), WOOD[5]!);
  return done(c);
}

const stem = (c: ReturnType<typeof canvas>, top: number): void => {
  c.fill(capsule(24, top, 24.6, 46, 1.8, 2), LEAF, { bevel: 1.6 });
  c.fill(ellipse(32.4, 36, 6.6, 2.9, -0.55), GREEN, { bevel: 2 });
  c.fill(ellipse(15.8, 32, 6, 2.7, 0.55), LEAF, { bevel: 2 });
};

/** A pink flower of six round petals on a green stem. */
export function flower(): Rgba {
  const c = canvas();
  stem(c, 20);
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3 - Math.PI / 2;
    c.fill(ellipse(24 + Math.cos(a) * 8.2, 17 + Math.sin(a) * 8.2, 6.4, 4.8, a), PINK, { bevel: 3.4, gain: 1.15 });
  }
  c.fill(ellipse(24, 17, 4.8, 4.8), YELLOW, { bevel: 3 });
  c.flat(ellipse(22.8, 15.8, 1.2, 1.2), WHITE, 220);
  return done(c);
}

/** A daisy: many thin white petals round a big yellow middle. */
export function daisy(): Rgba {
  const c = canvas();
  stem(c, 20);
  for (let k = 0; k < 12; k++) {
    const a = (k * Math.PI) / 6;
    c.fill(ellipse(24 + Math.cos(a) * 9.6, 17 + Math.sin(a) * 9.6, 5.6, 2.3, a), SNOW, { bevel: 2.2, gain: 1.1 });
  }
  c.fill(ellipse(24, 17, 5.6, 5.6), GOLD, { bevel: 3.4, gain: 1.15 });
  for (const [x, y] of [
    [22, 15.4],
    [26, 16.4],
    [23.4, 19.6],
    [26.4, 19.8],
  ] as const)
    c.flat(ellipse(x, y, 0.7, 0.7), AMBER[1]!);
  return done(c);
}

/** A red rose, petal folded over petal, on a thorny stem. */
export function rose(): Rgba {
  const c = canvas();
  stem(c, 26);
  c.fill(
    polygon([
      [14, 24],
      [24, 30],
      [34, 24],
      [28, 31],
      [20, 31],
    ]),
    LEAF,
    { bevel: 1.4 },
  );
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3 + 0.5;
    c.fill(ellipse(24 + Math.cos(a) * 7.6, 16.4 + Math.sin(a) * 6.6, 6.4, 5.6, a), RED, { bevel: 3.4, gain: 1.15 });
  }
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + 1.1;
    c.fill(ellipse(24 + Math.cos(a) * 3.8, 16.4 + Math.sin(a) * 3.4, 4.8, 4.2, a), ROSE, { bevel: 2.8, gain: 1.2 });
  }
  c.fill(ellipse(24, 16.4, 3.2, 3.2), RED, { bevel: 2.4 });
  c.flat(both(ring(24, 16.6, 2.4, 1), rect(0, 16.6, 48, 48)), RED[1]!);
  c.flat(ellipse(17, 11.4, 1.4, 2.4, 0.7), WHITE, 190);
  return done(c);
}

/**
 * A pink petal, round at the top with a notch in it and narrow at the foot, and a small one beside
 * it.
 */
export function petal(): Rgba {
  const c = canvas();
  const big = minus(
    union(
      ellipse(26, 18, 12.4, 14.8),
      polygon([
        [17.6, 26],
        [34.4, 26],
        [27, 44],
      ]),
    ),
    ellipse(26, 4, 3.4, 2.8),
  );
  const small = minus(
    union(
      ellipse(10, 35, 5.2, 6),
      polygon([
        [5.4, 38],
        [14.6, 38],
        [10, 46],
      ]),
    ),
    ellipse(10, 29.4, 1.8, 1.4),
  );
  c.fill(turn(small, 10, 38, -0.9), ROSE, { bevel: 3, gain: 1.2 });
  c.fill(turn(big, 26, 24, 0.24), PINK, { bevel: 6.4, gain: 1.25 });
  c.flat(ellipse(19, 13, 1.8, 4.6, 0.3), WHITE, 215);
  c.flat(polygon(starPoints(41, 38, 4, 4, 1, -Math.PI / 2)), YELLOW[5]!);
  return done(c);
}

export const MANOR = { lantern, candle, flame, chandelier, moon, bat, cloud, window, flower, daisy, rose, petal };
