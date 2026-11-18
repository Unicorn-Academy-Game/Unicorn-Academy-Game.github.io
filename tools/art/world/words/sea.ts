import type { Rgba } from '../../core/image';
import { both, type Canvas2D, capsule, ellipse, minus, type Pt, polygon, ring, starPoints, union } from '../../fx/kit';
import { tone } from '../produce';
import {
  AMBER,
  BRICK,
  BROWN,
  BURLAP,
  CREAM,
  canvas,
  DARKWOOD,
  done,
  GOLD,
  GREEN,
  INK,
  LEAF,
  ORANGE,
  PINK,
  RED,
  rect,
  SAND,
  SKY,
  SNOW,
  STONE,
  TEAL,
  WHITE,
  WOOD,
  YELLOW,
} from './shared';

const FOAM = tone('#ffffff', 255, 120);
const SEA = tone('#2fa6e6', 255, 215);
const COCO = tone('#7a4a2a', 320, 45);
const PEBBLE = tone('#a9a6bd', 270, 215);

function waves(
  c: Canvas2D,
  y: number,
  x0: number,
  x1: number,
  ramp: readonly (readonly [number, number, number])[],
): void {
  const pts: Pt[] = [
    [x0, y + 8],
    [x0, y],
  ];
  for (let x = x0; x <= x1; x += 2) pts.push([x, y + Math.sin(x * 0.55) * 1.8]);
  pts.push([x1, y + 8]);
  c.fill(polygon(pts), ramp, { bevel: 2.4 });
}

/** A mound of sand with a red spade stuck in it, ripples and a few grains. */
export function sand(): Rgba {
  const c = canvas();
  c.fill(union(ellipse(24, 36, 21, 9), ellipse(24, 30, 15, 11)), SAND, { bevel: 6 });
  c.flat(both(ring(24, 36, 14, 0.9, 0.3), ellipse(24, 36, 21, 9)), SAND[2]!);
  c.flat(both(ring(24, 36, 8, 0.9, 0.3), ellipse(24, 36, 21, 9)), SAND[2]!);
  c.line(34, 34, 40, 14, DARKWOOD[3]!, 1.8);
  c.fill(rect(36.4, 12, 43.6, 15), DARKWOOD, { bevel: 1 });
  c.fill(
    polygon([
      [32, 28],
      [38, 30],
      [39.4, 36],
      [33, 38],
    ]),
    RED,
    { bevel: 1.6 },
  );
  for (const [x, y] of [
    [8, 20],
    [14, 12],
    [20, 6],
  ] as const)
    c.flat(ellipse(x, y, 1, 1), SAND[4]!);
  return done(c);
}

/** Three smooth pebbles stacked, one grey, one pink and one white with a band across it. */
export function pebble(): Rgba {
  const c = canvas();
  c.fill(ellipse(22, 38, 19, 7.6), PEBBLE, { bevel: 5 });
  c.fill(ellipse(26, 25, 12.6, 6.4, 0.1), PINK, { bevel: 4.4 });
  c.fill(ellipse(22, 14, 8, 5.4, -0.2), SNOW, { bevel: 3.6 });
  c.flat(ellipse(22, 13.4, 8, 1.1, -0.2), STONE[3]!);
  c.flat(ellipse(13, 35.6, 4, 1.2, -0.2), WHITE, 170);
  c.flat(ellipse(20, 22.6, 3, 1, -0.2), WHITE, 170);
  return done(c);
}

/** A sand dune, long and curved, with a sunlit slope and a shaded slip face, wind ripples and two tufts of grass. */
export function dune(): Rgba {
  const c = canvas();
  const ridge = (x: number): number =>
    x <= 20 ? 42 - 26 * Math.sin(((x - 2) / 18) * (Math.PI / 2)) : 42 - 26 * Math.cos(((x - 20) / 26) * (Math.PI / 2));
  const top: Pt[] = [];
  for (let x = 2; x <= 46; x += 2) top.push([x, ridge(x)]);
  const hill = polygon([[2, 44], ...top, [46, 44]]);
  c.fill(hill, SAND, { bevel: 5 });
  c.flat(
    both(hill, (x, y) => x > 20 + (y - 16) * 0.25),
    SAND[2]!,
  );
  for (let y = 18; y < 44; y += 1)
    c.flat(
      both(hill, (x, yy) => yy === y && Math.abs(x - 20 - (y - 16) * 0.25) < 0.7),
      SAND[5]!,
    );
  for (const [x, y, w] of [
    [6, 40, 9],
    [14, 36.4, 8],
    [30, 40, 8],
  ] as const)
    c.flat(rect(x, y, x + w, y + 0.9), SAND[2]!);
  for (const x of [9, 40]) {
    c.line(x, 40, x - 3, 33, LEAF[3]!, 1.2);
    c.line(x, 40, x, 31, GREEN[3]!, 1.2);
    c.line(x, 40, x + 3, 33, LEAF[3]!, 1.2);
  }
  c.flat(ellipse(38, 7, 4, 4), YELLOW[5]!);
  return done(c);
}

/** A red crab with two raised claws, eyes on stalks, a wide shell and six legs. */
export function crab(): Rgba {
  const c = canvas();
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++)
      c.line(24 + sx * 10, 32 + i * 3, 24 + sx * (18 + i * 1.4), 36 + i * 3.4, BRICK[3]!, 1.8);
    c.fill(capsule(24 + sx * 12, 24, 24 + sx * 17, 15, 1.7), RED, { bevel: 1.2 });
    c.fill(ellipse(24 + sx * 17, 10, 5.4, 5.4), RED, { bevel: 3 });
    c.flat(
      polygon([
        [24 + sx * 17, 10],
        [24 + sx * 14, 3],
        [24 + sx * 20, 5],
      ]),
      INK[1]!,
    );
    c.line(24 + sx * 4, 21, 24 + sx * 5, 15, RED[3]!, 1.2);
    c.fill(ellipse(24 + sx * 5, 14, 2.4, 2.4), SNOW, { bevel: 1.4 });
    c.flat(ellipse(24 + sx * 5, 14, 1, 1), INK[1]!);
  }
  c.fill(ellipse(24, 29, 15, 10), RED, { bevel: 6, gain: 1.1 });
  c.flat(ellipse(19, 24, 4, 1.4, -0.5), WHITE, 150);
  c.flat(ellipse(24, 33, 3, 1, 0), INK[1]!);
  return done(c);
}

/** An orange starfish with a ridge of bumps down each arm. */
export function starfish(): Rgba {
  const c = canvas();
  c.fill(polygon(starPoints(24, 25, 5, 22, 8.4)), ORANGE, { bevel: 4.4, gain: 1.1 });
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
    for (const r of [8, 13, 18])
      c.fill(ellipse(24 + Math.cos(a) * r, 25 + Math.sin(a) * r, 1.4, 1.4), YELLOW, { bevel: 1 });
  }
  c.fill(ellipse(24, 25, 3, 3), AMBER, { bevel: 1.6 });
  return done(c);
}

/** The tide: a blue wave curling over with white foam, under a small crescent moon. */
export function tide(): Rgba {
  const c = canvas();
  c.fill(minus(ellipse(39, 9, 4.6, 4.6), ellipse(41.4, 7.6, 4.2, 4.2)), YELLOW, { bevel: 2 });
  c.fill(
    polygon([
      [2, 44],
      [2, 30],
      [10, 20],
      [22, 14],
      [32, 16],
      [38, 24],
      [34, 24],
      [28, 22],
      [20, 24],
      [16, 30],
      [20, 36],
      [46, 36],
      [46, 44],
    ]),
    SEA,
    { bevel: 4, gain: 1.1 },
  );
  c.fill(ellipse(34, 18, 6, 4.6, 0.5), FOAM, { bevel: 2.6 });
  c.fill(ellipse(24, 15, 7, 3.6, 0.3), FOAM, { bevel: 2 });
  for (const [x, y] of [
    [6, 40],
    [14, 41],
    [26, 40],
    [36, 42],
    [43, 38],
  ] as const)
    c.fill(ellipse(x, y, 3.2, 1.6), FOAM, { bevel: 1 });
  c.flat(
    polygon([
      [6, 32],
      [12, 24],
      [18, 22],
      [10, 30],
    ]),
    SKY[4]!,
    150,
  );
  return done(c);
}

/** A coconut and half of one beside it: brown and hairy outside, white meat and milk inside. */
export function coconut(): Rgba {
  const c = canvas();
  c.fill(ellipse(16, 27, 14, 14.4), COCO, { bevel: 7, gain: 1.1 });
  for (const [x, y] of [
    [11, 21],
    [17, 20],
    [13.6, 26],
  ] as const)
    c.fill(ellipse(x, y, 1.6, 1.6), INK, { bevel: 1 });
  c.flat(ellipse(10, 16, 3, 1.2, -0.5), CREAM[4]!, 130);
  c.fill(ellipse(34, 34, 12, 10), COCO, { bevel: 4 });
  c.fill(ellipse(34, 31, 10, 7), SNOW, { bevel: 3 });
  c.fill(ellipse(34, 32, 6.4, 4.4), SKY, { bevel: 2.4, gain: 0.6 });
  c.flat(ellipse(32, 30, 2, 1, -0.4), WHITE, 220);
  return done(c);
}

/** A fishing net on a long wooden handle: a round hoop with a mesh bag hanging from it and a small fish caught inside. */
export function net(): Rgba {
  const c = canvas();
  c.line(3, 46, 22, 24, DARKWOOD[3]!, 2.4);
  const bag = both(ellipse(30, 15, 15, 28), (_x, y) => y > 15);
  c.fill(bag, SKY, { bevel: 1, gain: 0.3 });
  c.flat(bag, SNOW[5]!, 60);
  for (const k of [-10, -5, 0, 5, 10])
    c.flat(
      both(bag, (x, y) => Math.abs(x - 30 - k * (1 - (y - 15) / 38) - (y - 15) * 0.0) < 0.5),
      STONE[4]!,
    );
  for (const y of [21, 27, 33, 39])
    c.flat(
      both(bag, (_x, yy) => Math.abs(yy - y) < 0.5),
      STONE[4]!,
    );
  c.fill(ellipse(32, 31, 5, 3, 0.2), ORANGE, { bevel: 1.6 });
  c.fill(
    polygon([
      [36, 31],
      [40, 28],
      [40, 34],
    ]),
    ORANGE,
    { bevel: 1 },
  );
  c.flat(ellipse(29.6, 30, 0.8, 0.8), INK[1]!);
  c.fill(ring(30, 15, 15, 2.6, 0.34), WOOD, { bevel: 1.4 });
  return done(c);
}

/** A beach umbrella in red and white stripes, tilted in the sand. */
export function umbrella(): Rgba {
  const c = canvas();
  c.line(26, 12, 20, 44, DARKWOOD[3]!, 1.8);
  c.fill(ellipse(22, 45, 15, 3.4), SAND, { bevel: 2 });
  const canopy = polygon([
    [2, 24],
    [6, 14],
    [16, 7],
    [28, 6],
    [38, 11],
    [45, 20],
    [45, 24],
    [39, 21],
    [32, 24],
    [24, 21],
    [16, 24],
    [9, 21],
  ]);
  c.fill(canopy, SNOW, { bevel: 4 });
  for (const [x0, x1] of [
    [6, 12],
    [18, 25],
    [30, 36],
  ] as const)
    c.flat(
      both(
        canopy,
        polygon([
          [x0, 4],
          [x1, 4],
          [x1 + 3, 26],
          [x0 - 3, 26],
        ]),
      ),
      RED[4]!,
    );
  c.flat(ellipse(10, 14, 4, 1.2, -0.6), WHITE, 190);
  c.fill(ellipse(27, 5.2, 1.6, 1.6), GOLD, { bevel: 1 });
  return done(c);
}

/** A beach towel laid flat, in teal and yellow stripes, with a fringe at both ends. */
export function towel(): Rgba {
  const c = canvas();
  c.fill(
    polygon([
      [6, 14],
      [36, 8],
      [44, 32],
      [14, 40],
    ]),
    TEAL,
    { bevel: 3, gain: 0.8 },
  );
  for (const t of [0.2, 0.5, 0.8]) {
    c.flat(
      polygon([
        [6 + 8 * t, 14 + 26 * t - 1.5],
        [36 + 8 * t, 8 + 24 * t - 1.5],
        [36 + 8 * t, 8 + 24 * t + 2.5],
        [6 + 8 * t, 14 + 26 * t + 2.5],
      ]),
      YELLOW[4]!,
    );
  }
  for (let i = 0; i < 7; i++) {
    c.line(7 + i * 1.2, 15 + i * 3.7, 3 + i * 1.2, 15.6 + i * 3.7, YELLOW[3]!, 1);
    c.line(37 + i * 1.2, 9 + i * 3.4, 41 + i * 1.2, 9 + i * 3.4, YELLOW[3]!, 1);
  }
  c.fill(ellipse(26, 24, 4, 3.4), PINK, { bevel: 1.6 });
  return done(c);
}

/** A raft of lashed logs with a mast and a triangle sail with a red flag, on little waves. */
export function raft(): Rgba {
  const c = canvas();
  c.line(24, 8, 24, 32, DARKWOOD[3]!, 1.8);
  c.fill(
    polygon([
      [26, 9],
      [42, 28],
      [26, 28],
    ]),
    SNOW,
    { bevel: 2 },
  );
  c.flat(
    polygon([
      [26, 12],
      [38, 26],
      [26, 26],
    ]),
    CREAM[4]!,
    160,
  );
  c.fill(
    polygon([
      [24, 3],
      [31, 5],
      [24, 7.4],
    ]),
    RED,
    { bevel: 1 },
  );
  for (let i = 0; i < 5; i++)
    c.fill(capsule(7 + i * 0, 30 + i * 2.8, 41, 30 + i * 2.8, 1.8), i % 2 ? WOOD : BROWN, { bevel: 1.2 });
  for (const x of [12, 36]) c.fill(rect(x - 1.2, 28, x + 1.2, 43), BURLAP, { bevel: 0.8 });
  waves(c, 41, 2, 46, SEA);
  return done(c);
}

/** A swim ring, striped red and white, afloat on a blue wave. */
export function swim(): Rgba {
  const c = canvas();
  c.fill(minus(ellipse(24, 24, 21, 16), ellipse(24, 24, 9, 6.4)), SNOW, { bevel: 5.4, gain: 1.1 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    c.flat(
      both(
        minus(ellipse(24, 24, 21, 16), ellipse(24, 24, 9, 6.4)),
        polygon([
          [24, 24],
          [24 + Math.cos(a) * 30, 24 + Math.sin(a) * 24],
          [24 + Math.cos(a + 0.5) * 30, 24 + Math.sin(a + 0.5) * 24],
        ]),
      ),
      RED[4]!,
    );
  }
  c.flat(ellipse(12, 17, 5, 1.4, -0.5), WHITE, 190);
  waves(c, 36, 2, 46, SEA);
  c.fill(ellipse(14, 37, 3, 1.4), FOAM, { bevel: 1 });
  c.fill(ellipse(34, 38, 3, 1.4), FOAM, { bevel: 1 });
  return done(c);
}

export const SEA_WORDS = {
  sand,
  pebble,
  dune,
  crab,
  starfish,
  tide,
  coconut,
  net,
  umbrella,
  towel,
  raft,
  swim,
};
