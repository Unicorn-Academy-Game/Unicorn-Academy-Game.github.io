import type { Rgba } from '../../core/image';
import { both, capsule, ellipse, heart, minus, type Pt, polygon, ring, starPoints, union } from '../../fx/kit';
import { tone } from '../produce';
import {
  AMBER,
  BLUE,
  CREAM,
  canvas,
  DARKWOOD,
  done,
  GOLD,
  GREEN,
  INK,
  IRON,
  LILAC,
  NIGHT,
  ONYX,
  ORANGE,
  PINK,
  PURPLE,
  RED,
  ROSE,
  rect,
  SKY,
  SLATE,
  SNOW,
  STONE,
  WHITE,
  WOOD,
  YELLOW,
} from './shared';

const WART = tone('#7fae3a', 205, 110);
const BELLY = tone('#d9e79a', 205, 150);
const STORM = tone('#59607f', 270, 230);
const CAT = tone('#3a2f55', 275, 300);
const BRASS = tone('#d9a740', 20, 80);
const GLASS = tone('#d4e6ff', 255, 235);

/** A green toad squatting, with big gold eyes, a wide mouth and warts on its back. */
export function toad(): Rgba {
  const c = canvas();
  c.fill(ellipse(10, 42, 6, 3), WART, { bevel: 2 });
  c.fill(ellipse(38, 42, 6, 3), WART, { bevel: 2 });
  c.fill(ellipse(24, 33, 19, 13), WART, { bevel: 7, gain: 1.1 });
  c.fill(ellipse(11, 38, 7, 6.4), WART, { bevel: 3 });
  c.fill(ellipse(37, 38, 7, 6.4), WART, { bevel: 3 });
  c.fill(ellipse(24, 38, 11, 6), BELLY, { bevel: 3 });
  for (const sx of [-1, 1]) {
    c.fill(ellipse(24 + sx * 9, 17, 6, 6), WART, { bevel: 3 });
    c.fill(ellipse(24 + sx * 9, 17, 4.4, 4.4), YELLOW, { bevel: 2.4 });
    c.fill(ellipse(24 + sx * 9, 17.4, 1.2, 2.6), INK, { bevel: 1 });
  }
  c.line(11, 29, 37, 29, INK[2]!, 1.2);
  for (const [x, y] of [
    [16, 25],
    [23, 22],
    [31, 24],
    [36, 31],
    [12, 33],
    [27, 31],
  ] as const)
    c.fill(ellipse(x, y, 1.6, 1.4), GREEN, { bevel: 1 });
  return done(c);
}

/** A purple spider dangling from a thread, eight bent legs and two big white eyes. */
export function spider(): Rgba {
  const c = canvas();
  c.line(24, 0, 24, 14, STONE[4]!, 0.8);
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const y = 18 + i * 3.2;
      const kx = 24 + sx * (12 + (i === 1 || i === 2 ? 4 : 0));
      const ky = y - 8 + (i - 1.5) * 1;
      c.line(24 + sx * 5, y, kx, ky, INK[2]!, 1.4);
      c.line(kx, ky, 24 + sx * (18 + i * 0.6), y + 11 - i * 1.4, INK[2]!, 1.4);
    }
  }
  c.fill(ellipse(24, 32, 9, 10), PURPLE, { bevel: 5 });
  c.fill(ellipse(24, 20, 6.6, 5.6), PURPLE, { bevel: 3 });
  for (const sx of [-1, 1]) {
    c.fill(ellipse(24 + sx * 2.8, 19, 2.2, 2.4), SNOW, { bevel: 1.4 });
    c.flat(ellipse(24 + sx * 2.8, 19.4, 1, 1.2), INK[1]!);
  }
  c.flat(heart(24, 33, 3.4), RED[4]!);
  c.flat(ellipse(21, 27, 3, 1.4, -0.5), LILAC[5]!, 160);
  return done(c);
}

/** A crystal ball on a gold stand, swirled with purple mist and sparks of starlight. */
export function orb(): Rgba {
  const c = canvas();
  c.fill(
    polygon([
      [10, 44],
      [14, 36],
      [34, 36],
      [38, 44],
    ]),
    GOLD,
    { bevel: 2.4 },
  );
  c.fill(rect(9, 42, 39, 46), GOLD, { bevel: 1.6 });
  c.fill(ellipse(24, 36, 11, 2.8), GOLD, { bevel: 1.4 });
  const ball = ellipse(24, 21, 17, 17);
  c.fill(ball, GLASS, { bevel: 9, gain: 0.9 });
  c.flat(both(union(ellipse(24, 26, 12, 7), ellipse(18, 22, 7, 5), ellipse(30, 18, 6, 4)), ball), LILAC[3]!, 190);
  c.flat(both(union(ellipse(24, 28, 7, 4), ellipse(30, 20, 3.4, 2.2)), ball), PURPLE[3]!, 190);
  for (const [x, y, r] of [
    [17, 14, 2.6],
    [30, 25, 2],
    [24, 19, 2.8],
    [13, 25, 1.6],
  ] as const)
    c.flat(polygon(starPoints(x, y, 4, r, r * 0.3)), YELLOW[5]!);
  c.flat(ellipse(15, 11, 5, 2, -0.7), WHITE, 220);
  return done(c);
}

/** A black cat sitting with its tail curled round, bright green eyes and a red bow at its neck. */
export function cat(): Rgba {
  const c = canvas();
  const tail: Pt[] = Array.from({ length: 10 }, (_, i) => {
    const t = i / 9;
    return [34 + Math.sin(t * 2.6) * 9, 42 - t * 22] as Pt;
  });
  for (let i = 0; i + 1 < tail.length; i++)
    c.fill(capsule(tail[i]![0], tail[i]![1], tail[i + 1]![0], tail[i + 1]![1], 2.6), CAT, { bevel: 1.6 });
  c.fill(ellipse(22, 36, 13, 10), CAT, { bevel: 6 });
  c.fill(ellipse(15, 44, 4, 2.4), CAT, { bevel: 1.6 });
  c.fill(ellipse(26, 44, 4, 2.4), CAT, { bevel: 1.6 });
  for (const sx of [-1, 1])
    c.fill(
      polygon([
        [22 + sx * 5, 12],
        [22 + sx * 11, 2],
        [22 + sx * 11.4, 14],
      ]),
      CAT,
      { bevel: 1.4 },
    );
  for (const sx of [-1, 1])
    c.flat(
      polygon([
        [22 + sx * 7, 11],
        [22 + sx * 10, 6],
        [22 + sx * 10.4, 12],
      ]),
      PINK[3]!,
    );
  c.fill(ellipse(22, 20, 11, 9.4), CAT, { bevel: 5 });
  for (const sx of [-1, 1]) {
    c.fill(ellipse(22 + sx * 4.6, 19, 2.6, 3), GREEN, { bevel: 1.6 });
    c.flat(ellipse(22 + sx * 4.6, 19, 0.8, 2.4), INK[0]!);
    c.flat(rect(22 + sx * 4 - 0.2, 24, 22 + sx * 9, 24.5), STONE[4]!, 160);
    c.flat(rect(22 + sx * 4 - 0.2, 25.6, 22 + sx * 8.6, 26), STONE[4]!, 160);
  }
  c.flat(
    polygon([
      [21, 23],
      [23, 23],
      [22, 24.4],
    ]),
    PINK[4]!,
  );
  c.fill(ellipse(22, 29.4, 5, 2), RED, { bevel: 1 });
  c.fill(ellipse(22, 30, 1.8, 1.8), GOLD, { bevel: 1 });
  return done(c);
}

/** A red toadstool with white spots on the cap and a pale stem with a frill. */
export function mushroom(): Rgba {
  const c = canvas();
  c.fill(
    polygon([
      [17, 22],
      [31, 22],
      [33, 44],
      [15, 44],
    ]),
    CREAM,
    { bevel: 3.6 },
  );
  c.fill(ellipse(24, 29, 9, 2.6), CREAM, { bevel: 1.4 });
  c.fill(ellipse(24, 44, 11, 2.6), CREAM, { bevel: 1.6 });
  c.fill(
    both(ellipse(24, 22, 22, 18), (_x, y) => y <= 22),
    RED,
    { bevel: 7, gain: 1.1 },
  );
  c.fill(ellipse(24, 22, 22, 3.4), RED, { bevel: 2.4 });
  for (const [x, y, r] of [
    [14, 15, 3.6],
    [26, 9, 3],
    [33, 17, 3.4],
    [22, 19, 2.2],
    [8, 22, 1.8],
    [40, 22, 1.8],
  ] as const)
    c.fill(ellipse(x, y, r, r * 0.85), SNOW, { bevel: 1.6 });
  return done(c);
}

/** A golden key with a clover-shaped bow, three teeth and a ring on the shaft. */
export function key(): Rgba {
  const c = canvas();
  c.fill(rect(22, 20, 26, 44), GOLD, { bevel: 1.6 });
  for (const [y, w] of [
    [38, 7],
    [42, 5],
    [34, 4],
  ] as const)
    c.fill(rect(26, y, 26 + w, y + 3), GOLD, { bevel: 1 });
  c.fill(ellipse(24, 28, 4, 1.8), AMBER, { bevel: 1 });
  for (const [x, y] of [
    [24, 6],
    [16, 13],
    [32, 13],
  ] as const)
    c.fill(ellipse(x, y, 6.4, 6.4), GOLD, { bevel: 3 });
  c.fill(ellipse(24, 13, 8, 8), GOLD, { bevel: 3 });
  c.fill(ellipse(24, 12, 3.4, 3.4), SKY, { bevel: 2 });
  c.flat(ellipse(22.8, 10.8, 1, 0.8, -0.6), WHITE, 230);
  return done(c);
}

/** A spider web of eight threads and rings, with dew shining on it and a corner tied to a twig. */
export function web(): Rgba {
  const c = canvas();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    c.line(24, 24, 24 + Math.cos(a) * 21, 24 + Math.sin(a) * 21, SNOW[3]!, 1);
  }
  for (const r of [5, 10, 15, 20]) {
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * Math.PI * 2,
        a1 = ((i + 1) / 8) * Math.PI * 2;
      const mid = (a0 + a1) / 2;
      const m = r * 0.93;
      c.line(
        24 + Math.cos(a0) * r,
        24 + Math.sin(a0) * r,
        24 + Math.cos(mid) * m,
        24 + Math.sin(mid) * m,
        SNOW[4]!,
        0.9,
      );
      c.line(
        24 + Math.cos(mid) * m,
        24 + Math.sin(mid) * m,
        24 + Math.cos(a1) * r,
        24 + Math.sin(a1) * r,
        SNOW[4]!,
        0.9,
      );
    }
  }
  for (const [x, y] of [
    [34, 14],
    [14, 30],
    [28, 36],
    [10, 14],
  ] as const)
    c.fill(ellipse(x, y, 1.4, 1.4), SKY, { bevel: 1 });
  return done(c);
}

/** A bolt of lightning: a bright yellow zigzag with a white heart and a glow of sparks. */
export function bolt(): Rgba {
  const c = canvas();
  c.fill(
    polygon([
      [28, 2],
      [10, 26],
      [21, 26],
      [14, 46],
      [38, 20],
      [26, 20],
      [34, 2],
    ]),
    YELLOW,
    { bevel: 4, gain: 1.1 },
  );
  c.flat(
    polygon([
      [29, 6],
      [16, 25],
      [24, 25],
      [20, 36],
      [30, 21],
      [23, 21],
      [30, 6],
    ]),
    SNOW[5]!,
    200,
  );
  for (const [x, y, r] of [
    [6, 8, 3],
    [41, 34, 3.4],
    [41, 8, 2.2],
    [6, 38, 2.4],
  ] as const)
    c.flat(polygon(starPoints(x, y, 4, r, r * 0.3)), AMBER[5]!);
  return done(c);
}

/** A dark storm cloud with a bright bolt of lightning and a few slanting drops of rain. */
export function lightning(): Rgba {
  const c = canvas();
  c.fill(
    union(ellipse(13, 15, 9, 7.4), ellipse(25, 10, 10.4, 8.6), ellipse(36, 15, 9, 7), ellipse(24, 17, 15, 7)),
    STORM,
    { bevel: 5 },
  );
  c.flat(ellipse(19, 8, 5, 1.6, -0.3), SLATE[4]!, 160);
  c.fill(
    polygon([
      [27, 18],
      [17, 32],
      [24, 32],
      [19, 46],
      [35, 28],
      [27, 28],
      [32, 18],
    ]),
    YELLOW,
    { bevel: 2.6 },
  );
  for (const [x, y] of [
    [10, 28],
    [8, 38],
    [38, 34],
    [41, 26],
  ] as const)
    c.fill(capsule(x, y, x - 1.2, y + 3, 1), SKY, { bevel: 1 });
  return done(c);
}

/** A rocket, red and white with a round blue window, fins and a bright flame. */
export function rocket(): Rgba {
  const c = canvas();
  c.fill(
    polygon([
      [24, 38],
      [18, 46],
      [24, 42],
      [30, 46],
    ]),
    ORANGE,
    { bevel: 1.2 },
  );
  c.fill(
    polygon([
      [24, 36],
      [21, 44],
      [24, 41],
      [27, 44],
    ]),
    YELLOW,
    { bevel: 1 },
  );
  c.fill(
    polygon([
      [14, 24],
      [6, 38],
      [16, 34],
    ]),
    RED,
    { bevel: 1.8 },
  );
  c.fill(
    polygon([
      [34, 24],
      [42, 38],
      [32, 34],
    ]),
    RED,
    { bevel: 1.8 },
  );
  c.fill(
    polygon([
      [24, 1],
      [30, 8],
      [32, 20],
      [32, 36],
      [16, 36],
      [16, 20],
      [18, 8],
    ]),
    SNOW,
    { bevel: 4.4 },
  );
  c.fill(
    polygon([
      [24, 1],
      [30, 8],
      [31, 12],
      [17, 12],
      [18, 8],
    ]),
    RED,
    { bevel: 2.4 },
  );
  c.fill(ellipse(24, 22, 4.6, 4.6), GOLD, { bevel: 2 });
  c.fill(ellipse(24, 22, 3.2, 3.2), SKY, { bevel: 2 });
  c.flat(ellipse(23, 21, 1, 0.8, -0.6), WHITE, 230);
  c.flat(rect(16, 31, 32, 33), RED[4]!);
  return done(c);
}

/** A brass telescope on a wooden tripod, pointing up at a small star. */
export function telescope(): Rgba {
  const c = canvas();
  for (const [x1, y1] of [
    [10, 46],
    [38, 46],
  ] as const)
    c.line(24, 28, x1, y1, DARKWOOD[3]!, 2);
  c.line(24, 28, 24, 46, WOOD[3]!, 2);
  c.fill(ellipse(24, 28, 3.4, 3.4), BRASS, { bevel: 1.6 });
  c.fill(capsule(14, 31, 36, 12, 4.6, 4.6), BRASS, { bevel: 2.4 });
  c.fill(capsule(30, 17, 41, 8, 5.6, 5.6), BRASS, { bevel: 2.4 });
  c.fill(capsule(11, 33, 15, 30, 3, 3), IRON, { bevel: 1.4 });
  c.fill(ring(38, 10, 5.2, 1.4, 1), GOLD, { bevel: 1 });
  c.flat(ellipse(37, 10, 3, 3), SKY[4]!);
  c.flat(ellipse(23, 21, 6, 1, -0.7), WHITE, 190);
  c.flat(polygon(starPoints(44, 3, 4, 3.2, 0.9)), YELLOW[5]!);
  return done(c);
}

/** A rainbow arching from one white cloud to another, in seven colours. */
export function rainbow(): Rgba {
  const c = canvas();
  const ramps = [RED, ORANGE, YELLOW, GREEN, SKY, BLUE, PURPLE] as const;
  const arc = (r: number) => both(ring(24, 38, r, 3, 1), (_x, y) => y < 40);
  for (const [i, ramp] of ramps.entries()) c.fill(arc(21 - i * 2.6), ramp, { bevel: 1.2 });
  for (const x of [5, 43]) {
    c.fill(union(ellipse(x, 40, 8, 5), ellipse(x - 5, 42, 6, 4), ellipse(x + 5, 42, 6, 4)), SNOW, { bevel: 3 });
  }
  return done(c);
}

/** A friendly ghost: a white sheet with a wavy hem, round black eyes, rosy cheeks and two small arms. */
export function ghost(): Rgba {
  const c = canvas();
  const hem: Pt[] = [];
  for (let i = 0; i <= 12; i++) hem.push([38 - i * 2.2, 42 + (i % 2 === 0 ? 0 : 3.4)]);
  c.fill(polygon([[10, 42], [10, 20], [14, 8], [24, 3], [34, 8], [38, 20], [38, 42], ...hem.slice(1)]), SNOW, {
    bevel: 6,
    gain: 0.9,
  });
  c.fill(ellipse(9, 28, 3.6, 2.2, 0.5), SNOW, { bevel: 1.6 });
  c.fill(ellipse(39, 28, 3.6, 2.2, -0.5), SNOW, { bevel: 1.6 });
  for (const sx of [-1, 1]) {
    c.fill(ellipse(24 + sx * 6, 19, 2.4, 3.2), INK, { bevel: 1.6 });
    c.flat(ellipse(24 + sx * 6 - 0.6, 17.8, 0.7, 0.9), WHITE);
    c.flat(ellipse(24 + sx * 10, 24.6, 2.2, 1.4), ROSE[3]!, 160);
  }
  c.fill(ellipse(24, 26, 2.8, 2.2), INK, { bevel: 1.4 });
  c.flat(ellipse(24, 27, 1.4, 0.8), ROSE[3]!);
  c.flat(ellipse(17, 12, 3.4, 1.4, -0.5), WHITE, 200);
  return done(c);
}

/** A costume: a purple witch's hat with a gold buckle and a star, and a cape with a gold clasp below it. */
export function costume(): Rgba {
  const c = canvas();
  c.fill(
    polygon([
      [10, 26],
      [38, 26],
      [44, 46],
      [4, 46],
    ]),
    PURPLE,
    { bevel: 4 },
  );
  c.fill(ellipse(24, 26, 8, 3), NIGHT, { bevel: 1.6 });
  c.fill(ellipse(24, 28, 3, 3), GOLD, { bevel: 1.6 });
  c.fill(ellipse(24, 20, 20, 4.4), NIGHT, { bevel: 2.4 });
  c.fill(
    polygon([
      [14, 20],
      [34, 20],
      [27, 12],
      [30, 3],
      [24, 6],
      [20, 12],
    ]),
    PURPLE,
    { bevel: 3.6 },
  );
  c.fill(rect(15, 14.6, 33, 18.4), ORANGE, { bevel: 1 });
  c.fill(rect(22, 13.6, 26, 19.4), GOLD, { bevel: 1 });
  c.flat(rect(23, 15, 25, 18), INK[1]!);
  c.flat(polygon(starPoints(8, 38, 5, 3, 1.2)), YELLOW[5]!);
  c.flat(polygon(starPoints(40, 34, 5, 2.4, 1)), YELLOW[5]!);
  c.flat(polygon(starPoints(32, 41, 5, 2.4, 1)), YELLOW[5]!);
  return done(c);
}

/** The night: a dark blue sky with a golden crescent moon, stars and the black shapes of hills below. */
export function night(): Rgba {
  const c = canvas();
  c.fill(rect(3, 3, 45, 45), NIGHT, { bevel: 4 });
  c.fill(minus(ellipse(32, 16, 8, 8), ellipse(36, 13, 7, 7)), YELLOW, { bevel: 3 });
  for (const [x, y, r] of [
    [10, 10, 2.6],
    [20, 20, 1.8],
    [14, 28, 1.4],
    [40, 30, 1.6],
    [24, 8, 1.4],
  ] as const)
    c.flat(polygon(starPoints(x, y, 4, r + 0.6, r * 0.3)), SNOW[5]!);
  c.flat(
    polygon([
      [3, 45],
      [3, 36],
      [12, 32],
      [22, 38],
      [32, 33],
      [45, 38],
      [45, 45],
    ]),
    ONYX[1]!,
  );
  c.flat(rect(14, 35, 16, 38), YELLOW[5]!);
  return done(c);
}

export const SPOOKY = {
  toad,
  spider,
  orb,
  cat,
  mushroom,
  key,
  web,
  bolt,
  lightning,
  rocket,
  telescope,
  rainbow,
  ghost,
  costume,
  night,
};
