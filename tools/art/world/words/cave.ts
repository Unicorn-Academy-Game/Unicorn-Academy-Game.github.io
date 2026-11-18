import type { Rgba } from '../../core/image';
import { both, capsule, ellipse, minus, polygon, ring, union } from '../../fx/kit';
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
  IRON,
  LILAC,
  NIGHT,
  ONYX,
  ORANGE,
  PINK,
  PURPLE,
  RED,
  rect,
  SKY,
  SLATE,
  STONE,
  WHITE,
  WOOD,
  YELLOW,
} from './shared';

/** A stone pillar of the cave with a violet crystal growing from its top. */
export function pillar(): Rgba {
  const c = canvas();
  c.fill(rect(13, 38, 35, 46), STONE, { bevel: 2.4 });
  c.fill(rect(17, 14, 31, 40), STONE, { bevel: 3.4 });
  c.fill(rect(13, 10, 35, 17), STONE, { bevel: 2.4 });
  c.flat(
    polygon([
      [19, 22],
      [22, 30],
      [20, 36],
    ]),
    ONYX[2]!,
    120,
  );
  c.fill(
    polygon([
      [24, 0],
      [30, 7],
      [28, 11],
      [20, 11],
      [18, 7],
    ]),
    PURPLE,
    { bevel: 2, gain: 1.15 },
  );
  c.flat(
    polygon([
      [23, 2],
      [25, 3],
      [23.4, 9],
    ]),
    WHITE,
    220,
  );
  return done(c);
}

/** A storm cloud with a bolt of lightning cracking out of it. */
export function thunder(): Rgba {
  const c = canvas();
  const cloud = union(
    ellipse(14, 17, 9, 8.4),
    ellipse(25, 12.6, 11, 10),
    ellipse(36, 17, 9, 8.4),
    ellipse(24, 20, 17, 7.6),
  );
  c.fill(cloud, SLATE, { bevel: 5, gain: 1 });
  c.flat(both(cloud, rect(0, 22, 48, 28)), NIGHT[3]!, 140);
  c.fill(
    polygon([
      [28, 19],
      [16.4, 34],
      [23.4, 33.4],
      [18.6, 47],
      [34, 28],
      [26.6, 28.4],
      [31.6, 19],
    ]),
    YELLOW,
    {
      bevel: 1.8,
      gain: 1.2,
    },
  );
  c.flat(
    polygon([
      [27, 21],
      [22, 28],
      [25, 28],
    ]),
    WHITE,
    190,
  );
  return done(c);
}

/** A round pool in a rim of rock, with the water glowing and light dancing on it. */
export function pool(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 28, 22, 14.4), STONE, { bevel: 5, gain: 1 });
  c.fill(ellipse(24, 28.6, 18, 10.4), BLUE, { bevel: 6, gain: 1.15 });
  c.flat(ellipse(24, 28.6, 12, 6.4), SKY[4]!, 120);
  for (const [x, y, w] of [
    [16, 26, 3.6],
    [29, 30, 4.6],
    [23, 24.6, 2.6],
    [34, 27, 2.4],
  ] as const)
    c.flat(ellipse(x, y, w, 0.9), WHITE, 230);
  for (const [x, y, r] of [
    [10, 12, 2.4],
    [38, 10, 2],
    [24, 7, 2.8],
  ] as const) {
    c.flat(ellipse(x, y, r * 1.8, r * 0.5), LILAC[4]!, 200);
    c.flat(ellipse(x, y, r * 0.5, r * 1.8), LILAC[4]!, 200);
    c.flat(ellipse(x, y, r * 0.55, r * 0.55), WHITE);
  }
  return done(c);
}

/** Rings spreading over water from where a drop has fallen. */
export function ripple(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 29, 22, 15), BLUE, { bevel: 6, gain: 1.1 });
  for (const [r, w, a] of [
    [18, 2.2, 150],
    [12.6, 2.4, 200],
    [7.2, 2.6, 255],
  ] as const)
    c.flat(ring(24, 29, r, w, 0.64), WHITE, a);
  c.fill(
    polygon([
      [24, 4],
      [29.4, 14],
      [24, 17.6],
      [18.6, 14],
    ]),
    SKY,
    { bevel: 2.4, gain: 1.15 },
  );
  c.flat(ellipse(22, 11, 1.1, 2.6, 0.4), WHITE, 230);
  return done(c);
}

/** A wind chime: five tubes of different lengths hanging from a wooden ring by strings. */
export function chime(): Rgba {
  const c = canvas();
  c.fill(capsule(6, 6, 42, 6, 3, 3), WOOD, { bevel: 1.6 });
  c.line(24, 1, 24, 4, SLATE[3]!, 1);
  const tubes: readonly (readonly [number, number, number])[] = [
    [10, 14, 38],
    [17, 15, 44],
    [24, 15, 36],
    [31, 15, 42],
    [38, 14, 32],
  ];
  for (const [x, top, bottom] of tubes) {
    c.line(x, 8, x, top, SLATE[3]!, 0.9);
    c.fill(capsule(x, top, x, bottom, 2.8, 2.8), x % 2 ? GOLD : SKY, { bevel: 1.6, gain: 1.2 });
  }
  c.fill(ellipse(24, 38, 5.4, 2.6), DARKWOOD, { bevel: 1.2 });
  c.line(24, 20, 24, 36, SLATE[3]!, 0.9);
  return done(c);
}

/** A round golden bell with a clapper, hanging from a ring. */
export function bell(): Rgba {
  const c = canvas();
  c.fill(ring(24, 5.4, 3.6, 1.8, 1), IRON, { bevel: 1 });
  c.fill(
    polygon([
      [24, 7],
      [31, 10],
      [34, 19],
      [36, 29],
      [42, 36],
      [42, 40],
      [6, 40],
      [6, 36],
      [12, 29],
      [14, 19],
      [17, 10],
    ]),
    GOLD,
    { bevel: 5, gain: 1.2 },
  );
  c.fill(ellipse(24, 40, 18.4, 3.6), AMBER, { bevel: 2.4 });
  c.fill(ellipse(24, 42, 3.8, 3.8), BROWN, { bevel: 2 });
  c.flat(ellipse(17.6, 22, 1.8, 7, 0.16), WHITE, 190);
  return done(c);
}

/** A glass jar with a cork lid, full of a purple glow and a few fireflies. */
export function jar(): Rgba {
  const c = canvas();
  const body = union(ellipse(24, 29, 15, 14.4), rect(11, 14, 37, 30));
  c.fill(body, SKY, { bevel: 4, gain: 1.05 });
  c.fill(both(body, rect(0, 26, 48, 48)), PURPLE, { bevel: 4, gain: 1.1 });
  c.flat(ellipse(24, 26.6, 13, 1.6), LILAC[4]!, 200);
  for (const [x, y] of [
    [17, 31],
    [27, 35],
    [31, 29],
    [22, 22],
  ] as const) {
    c.flat(ellipse(x, y, 2.2, 2.2), YELLOW[4]!, 190);
    c.flat(ellipse(x, y, 0.9, 0.9), WHITE);
  }
  c.fill(rect(13, 9, 35, 16), WOOD, { bevel: 2.2 });
  c.fill(rect(11, 15, 37, 18), DARKWOOD, { bevel: 1.2 });
  c.fill(rect(17, 28, 31, 40), CREAM, { bevel: 1 });
  c.flat(rect(19, 31, 29, 32.4), BROWN[1]!);
  c.flat(rect(19, 35, 26, 36.4), BROWN[1]!);
  c.flat(ellipse(15, 24, 1.2, 5, 0.1), WHITE, 210);
  return done(c);
}

/** A round potion bottle with a cork, a pink brew with bubbles and a little star on its label. */
export function bottle(): Rgba {
  const c = canvas();
  const flask = union(ellipse(24, 32, 15, 14), rect(19.4, 9, 28.6, 24));
  c.fill(flask, SKY, { bevel: 3.6, gain: 1.05 });
  c.fill(both(union(ellipse(24, 32, 13.6, 12.6), rect(20.8, 22, 27.2, 24)), rect(0, 25, 48, 48)), PINK, {
    bevel: 4.6,
    gain: 1.1,
  });
  c.fill(rect(18.6, 3, 29.4, 11), WOOD, { bevel: 2 });
  c.fill(ellipse(24, 33, 8, 5.8), CREAM, { bevel: 1.4 });
  c.flat(ellipse(24, 33, 1.6, 3.2), AMBER[3]!);
  c.flat(ellipse(24, 33, 3.2, 1.6), AMBER[3]!);
  for (const [x, y, r] of [
    [17, 28, 1.6],
    [31, 38, 1.3],
    [29, 27.4, 1],
  ] as const) {
    c.flat(ellipse(x, y, r, r), WHITE, 220);
  }
  c.flat(ellipse(15.6, 29, 1.2, 4.6, 0.2), WHITE, 200);
  return done(c);
}

/** An iron cauldron on a fire, with a green brew bubbling over its rim. */
export function cauldron(): Rgba {
  const c = canvas();
  c.fill(
    polygon([
      [24, 36],
      [14, 47],
      [22, 46],
    ]),
    ORANGE,
    { bevel: 1.6, gain: 1.2 },
  );
  c.fill(
    polygon([
      [24, 33],
      [30, 47],
      [37, 46],
    ]),
    RED,
    { bevel: 1.6, gain: 1.2 },
  );
  c.fill(
    polygon([
      [24, 38],
      [20, 47],
      [29, 47],
    ]),
    YELLOW,
    { bevel: 1.4, gain: 1.2 },
  );
  c.fill(ellipse(24, 26, 19, 15.6), ONYX, { bevel: 7, gain: 1.1 });
  c.fill(minus(ellipse(24, 14.6, 20, 5.4), ellipse(24, 14.6, 16, 3.4)), IRON, { bevel: 2.2 });
  c.fill(ellipse(24, 14.6, 16, 3.4), GREEN, { bevel: 2.4, gain: 1.2 });
  for (const [x, y, r] of [
    [18, 10, 3.6],
    [27, 7, 4.6],
    [32.6, 11.4, 2.8],
  ] as const) {
    c.fill(ellipse(x, y, r, r), GREEN, { bevel: r * 0.6, gain: 1.25 });
    c.flat(ellipse(x - r * 0.3, y - r * 0.3, r * 0.3, r * 0.3), WHITE, 230);
  }
  c.flat(ellipse(14, 24, 2, 7, 0.2), WHITE, 120);
  return done(c);
}

export const CAVE = { pillar, thunder, pool, ripple, chime, bell, jar, bottle, cauldron };
