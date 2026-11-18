import type { Rgba } from '../../core/image';
import { capsule, ellipse, type Pt, polygon, union } from '../../fx/kit';
import {
  AMBER,
  BLUE,
  BROWN,
  canvas,
  DARKWOOD,
  done,
  GREEN,
  INK,
  LEAF,
  MINT,
  ORANGE,
  RED,
  rect,
  SKY,
  SNOW,
  STONE,
  turn,
  WHITE,
  WOOD,
  YELLOW,
} from './shared';

/** A fern: one curved frond with a pair of long leaflets at every step, small toward the tip. */
export function fern(): Rgba {
  const c = canvas();
  const at = (t: number): [number, number] => [12 + t * 22 + Math.sin(t * 2.6) * 3, 46 - t * 42];
  for (let i = 0; i < 11; i++) {
    const t = 0.1 + i * 0.082;
    const [x, y] = at(t);
    const [x2, y2] = at(t + 0.02);
    const tangent = Math.atan2(y2 - y, x2 - x);
    const len = 14 * (1 - t * 0.78);
    for (const side of [-1, 1] as const) {
      const a = tangent + side * 1.1;
      c.fill(
        ellipse(x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5, len * 0.55, 2.3 - t, a),
        i % 2 ? LEAF : GREEN,
        { bevel: 1.5, gain: 1.15 },
      );
    }
  }
  for (let i = 0; i < 22; i++) {
    const [x0, y0] = at(i / 22);
    const [x1, y1] = at((i + 1) / 22);
    c.line(x0, y0, x1, y1, DARKWOOD[3]!, 1.5);
  }
  return done(c);
}

/** A cushion of moss on a flat stone, thick and furry, with a few thin stalks on top. */
export function moss(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 40, 21, 5.6), STONE, { bevel: 3, gain: 0.9 });
  c.fill(union(ellipse(24, 32, 19, 10.6), ellipse(15, 33, 10, 8), ellipse(34, 33, 10, 8)), LEAF, {
    bevel: 7,
    gain: 1.15,
  });
  for (const [x, y, r] of [
    [14, 27, 3.4],
    [22, 22.6, 4.2],
    [31, 24, 3.6],
    [37, 30, 3],
    [10, 33, 2.6],
    [26, 31, 3.2],
  ] as const)
    c.fill(ellipse(x, y, r, r * 0.8), GREEN, { bevel: 2.4, gain: 1.2 });
  for (const [x, y, h] of [
    [17, 24, 9],
    [28, 20, 12],
    [34, 25, 8],
  ] as const) {
    c.line(x, y, x + 1, y - h, DARKWOOD[4]!, 1);
    c.fill(ellipse(x + 1, y - h - 1, 1.7, 2.2), YELLOW, { bevel: 1.4 });
  }
  c.flat(ellipse(13, 30, 2, 1, -0.6), WHITE, 150);
  return done(c);
}

/** Three reeds with brown cattails, tall blades round them and a ripple of water at the foot. */
export function reed(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 43, 20, 4.2), BLUE, { bevel: 3 });
  c.flat(ellipse(24, 43, 11, 1.4), SKY[4]!, 190);
  for (const [x0, x1, y1] of [
    [10, 4, 12],
    [14, 12, 4],
    [34, 41, 10],
    [38, 44, 20],
  ] as const)
    c.fill(
      polygon([
        [x0 - 1.4, 44],
        [x0 + 1.4, 44],
        [x1, y1],
      ]),
      GREEN,
      { bevel: 1.2 },
    );
  for (const [x, top, lean] of [
    [18, 8, -1],
    [24, 4, 0],
    [30, 10, 1.4],
  ] as const) {
    c.line(x, 44, x + lean, top + 8, LEAF[2]!, 1.5);
    c.fill(capsule(x + lean, top + 9, x + lean, top + 1.6, 2.7), BROWN, { bevel: 2.2, gain: 1.1 });
    c.line(x + lean, top + 1.4, x + lean, top - 1.6, AMBER[3]!, 1);
  }
  return done(c);
}

/** One ivy leaf: three pointed lobes and a notch where the stalk joins, turned by `a`. */
const ivyLeaf = (cx: number, cy: number, size: number, a: number) =>
  turn(
    polygon(
      (
        [
          [0, -1],
          [3.2, -1.6],
          [3.4, 1.6],
          [1.8, 2.4],
          [0.4, 6.2],
          [-1.6, 2.6],
          [-3.6, 1.6],
          [-3.4, -1.6],
          [-1.4, -1.6],
        ] as Pt[]
      ).map(([x, y]) => [cx + x * size * 0.17, cy + y * size * 0.17] as Pt),
    ),
    cx,
    cy,
    a,
  );

/** A vine of ivy hanging in loops, each leaf with three points and pale veins. */
export function ivy(): Rgba {
  const c = canvas();
  const stem = (t: number): [number, number] => [24 + Math.sin(t * 5.2) * 10, 3 + t * 42];
  for (let i = 0; i < 40; i++) {
    const [x0, y0] = stem(i / 40);
    const [x1, y1] = stem((i + 1) / 40);
    c.line(x0, y0, x1, y1, DARKWOOD[3]!, 1.3);
  }
  for (let i = 0; i < 5; i++) {
    const t = 0.1 + i * 0.2;
    const [x, y] = stem(t);
    const side = i % 2 === 0 ? 1 : -1;
    const a = side * 1.9 + (i % 3) * 0.2;
    const lx = x + side * 7.4;
    const ly = y + 0.6;
    c.line(x, y, lx - side * 1.2, ly, DARKWOOD[3]!, 1);
    c.fill(ivyLeaf(lx, ly, 10 - t * 1.4, a), i % 3 === 0 ? MINT : LEAF, { bevel: 2.4, gain: 1.2 });
    c.flat(
      capsule(lx, ly, lx + Math.cos(a - 1.57) * 4.4 * -side, ly + Math.sin(a - 1.57) * 4.4 * -side, 0.35),
      GREEN[5]!,
    );
  }
  return done(c);
}

/** A weeping willow: a thick trunk, a round crown and long strands that fall like hair. */
export function willow(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 45, 16, 2.8), GREEN, { bevel: 2.4, gain: 0.8 });
  c.fill(
    polygon([
      [20.6, 46],
      [27.4, 46],
      [26.2, 22],
      [22, 22],
    ]),
    WOOD,
    { bevel: 2.4 },
  );
  c.fill(union(ellipse(24, 14, 17, 10.6), ellipse(13, 18, 8, 6.4), ellipse(35, 18, 8, 6.4)), LEAF, {
    bevel: 6,
    gain: 1.1,
  });
  for (let i = 0; i < 17; i++) {
    const x = 6.4 + i * 2.1;
    const drop = 16 + ((i * 7) % 5) * 2.6 - Math.abs(x - 24) * 0.14;
    const y0 = 18 - Math.sqrt(Math.max(0, 1 - ((x - 24) / 18) ** 2)) * -2;
    c.line(x, y0, x + Math.sin(i) * 1.2, y0 + drop, i % 3 === 0 ? MINT[3]! : GREEN[3]!, 1.5);
  }
  c.flat(ellipse(17, 9.6, 5, 2, -0.3), MINT[5]!, 180);
  return done(c);
}

/** A single maple leaf in red and orange, with five points, veins and a stalk. */
export function maple(): Rgba {
  const c = canvas();
  const half: Pt[] = [
    [0, -22],
    [3.4, -14],
    [8, -17.4],
    [7.4, -8],
    [18, -10.6],
    [13.6, -1.4],
    [20.6, 3.6],
    [10, 6.4],
    [11.4, 12.4],
    [2.4, 9.6],
  ];
  const leaf: Pt[] = [
    ...half,
    [0, 22],
    ...half
      .slice(1)
      .reverse()
      .map(([x, y]): Pt => [-x, y]),
    [0, -22],
  ].map(([x, y]) => [24 + x * 0.96, 24 + y * 0.96] as Pt);
  c.fill(polygon(leaf), RED, { bevel: 6, gain: 1.15 });
  c.fill(polygon(leaf.map(([x, y]) => [24 + (x - 24) * 0.7, 24 + (y - 24) * 0.7] as Pt)), ORANGE, {
    bevel: 4.4,
    gain: 1.2,
  });
  for (const [x, y] of [
    [24, 2.6],
    [41, 14],
    [8, 14],
    [43, 28],
    [5, 28],
  ] as const)
    c.line(24, 28, x, y + 3, RED[0]!, 1);
  c.line(24, 30, 24, 46, DARKWOOD[3]!, 1.9);
  c.flat(ellipse(17, 17.4, 3, 1.1, -0.8), WHITE, 170);
  return done(c);
}

/** A birch: a white trunk marked in black bars under a crown of small bright leaves. */
export function birch(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 45, 14, 2.8), GREEN, { bevel: 2.4, gain: 0.8 });
  c.fill(
    polygon([
      [20, 46],
      [28, 46],
      [26.6, 14],
      [22, 14],
    ]),
    SNOW,
    { bevel: 2.8 },
  );
  for (const [y, w] of [
    [42, 5],
    [36, 3],
    [31, 4.6],
    [25.4, 3],
    [20, 3.6],
  ] as const)
    c.flat(ellipse(24 + (y % 3) - 1, y, w / 2, 0.9), INK[1]!);
  c.line(26.6, 22, 32, 17, WOOD[4]!, 1.4);
  for (const [x, y, r] of [
    [24, 8, 8],
    [14, 13, 6.6],
    [34, 12, 6.8],
    [20, 16, 5.6],
    [30, 17, 5],
    [24, 14, 6],
  ] as const)
    c.fill(ellipse(x, y, r, r * 0.84), (x + y) % 2 ? GREEN : LEAF, { bevel: 3.4, gain: 1.15 });
  c.flat(ellipse(18, 6.4, 3, 1.2, -0.4), MINT[5]!, 190);
  return done(c);
}

/** An acorn: a smooth tan nut under a rough brown cap, with a short stalk and a green leaf. */
export function acorn(): Rgba {
  const c = canvas();
  c.fill(turn(ellipse(36, 15, 8.4, 4, 0), 36, 15, -0.6), LEAF, { bevel: 2.4, gain: 1.15 });
  c.line(28, 20, 36, 15, GREEN[5]!, 0.9);
  c.fill(
    union(
      ellipse(24, 30, 11, 13),
      polygon([
        [16, 30],
        [32, 30],
        [24, 46],
      ]),
    ),
    AMBER,
    { bevel: 8, gain: 1.15 },
  );
  c.fill(union(ellipse(24, 21, 14.6, 8.4), rect(9.4, 19, 38.6, 22)), BROWN, { bevel: 4.6, gain: 1.1 });
  for (let r = 0; r < 3; r++)
    for (let x = 0; x < 6; x++) c.flat(ellipse(14 + x * 4.1 + (r % 2) * 2, 18.4 + r * 2.6, 1, 0.8), DARKWOOD[1]!);
  c.fill(capsule(24, 14, 24.6, 6, 1.7), WOOD, { bevel: 1.4 });
  c.flat(ellipse(17.4, 31.4, 1.5, 5, 0.1), WHITE, 190);
  return done(c);
}

export const RIVER = { fern, moss, reed, ivy, willow, maple, birch, acorn } as const;
