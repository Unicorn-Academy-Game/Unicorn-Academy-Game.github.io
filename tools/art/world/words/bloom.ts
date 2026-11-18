import type { Rgba } from '../../core/image';
import { type Canvas2D, capsule, ellipse, heart, type Pt, polygon, ring } from '../../fx/kit';
import {
  AMBER,
  BROWN,
  CREAM,
  canvas,
  DARKWOOD,
  done,
  GREEN,
  INK,
  LEAF,
  LILAC,
  PINK,
  PURPLE,
  RED,
  ROSE,
  rect,
  SNOW,
  WHITE,
  WOOD,
  YELLOW,
} from './shared';

type Ramp = readonly (readonly [number, number, number])[];

/** A curved green stalk from the foot of the picture up to a point. */
function stalk(c: Canvas2D, x0: number, y0: number, x1: number, y1: number, bend: number, w = 1.5): void {
  const pts: Pt[] = Array.from({ length: 12 }, (_, i) => {
    const t = i / 11;
    return [x0 + (x1 - x0) * t + Math.sin(t * Math.PI) * bend, y0 + (y1 - y0) * t] as Pt;
  });
  for (let i = 0; i + 1 < pts.length; i++)
    c.fill(capsule(pts[i]![0], pts[i]![1], pts[i + 1]![0], pts[i + 1]![1], w), LEAF, { bevel: 1.2 });
}

function leaf(c: Canvas2D, x: number, y: number, rx: number, ry: number, rot: number): void {
  c.fill(ellipse(x, y, rx, ry, rot), GREEN, { bevel: 1.6 });
  c.line(
    x - Math.cos(rot) * rx * 0.8,
    y - Math.sin(rot) * rx * 0.8,
    x + Math.cos(rot) * rx * 0.8,
    y + Math.sin(rot) * rx * 0.8,
    LEAF[2]!,
    0.6,
  );
}

function petals(
  c: Canvas2D,
  x: number,
  y: number,
  n: number,
  ring0: number,
  rx: number,
  ry: number,
  ramp: Ramp,
  phase = 0,
): void {
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    c.fill(ellipse(x + Math.cos(a) * ring0, y + Math.sin(a) * ring0, rx, ry, a), ramp, { bevel: 2 });
  }
}

/** A sunflower: a ring of yellow petals round a brown seed head, on a green stem with two big leaves. */
export function sunflower(): Rgba {
  const c = canvas();
  stalk(c, 24, 47, 24, 28, 0, 1.6);
  leaf(c, 15, 40, 6, 2.8, -0.5);
  leaf(c, 33, 36, 6, 2.8, 0.5);
  petals(c, 24, 18, 14, 10, 5.4, 2.6, YELLOW);
  petals(c, 24, 18, 14, 8.6, 4.6, 2.2, AMBER, Math.PI / 14);
  c.fill(ellipse(24, 18, 8, 8), BROWN, { bevel: 4.6 });
  for (const [x, y] of [
    [21, 15],
    [26, 16],
    [22, 21],
    [27, 21],
    [24, 18],
  ] as const)
    c.flat(ellipse(x, y, 0.8, 0.8), DARKWOOD[1]!);
  return done(c);
}

/** Three violets: purple five-petalled faces with a yellow eye, among heart-shaped leaves. */
export function violet(): Rgba {
  const c = canvas();
  for (const [x, y, bend] of [
    [12, 20, -2],
    [34, 15, 2],
    [24, 28, 0],
  ] as const)
    stalk(c, 24 + (x - 24) * 0.3, 47, x, y + 6, bend, 1.1);
  for (const [x, y, r] of [
    [10, 40, 5],
    [36, 40, 5],
    [24, 41, 4],
  ] as const)
    c.fill(heart(x, y, r), GREEN, { bevel: 2 });
  for (const [x, y, s] of [
    [12, 17, 1],
    [34, 12, 1],
    [24, 26, 1.1],
  ] as const) {
    petals(c, x, y, 5, 4.4 * s, 3.8 * s, 3 * s, PURPLE, -1.2);
    c.fill(ellipse(x, y, 2.2 * s, 2.2 * s), LILAC, { bevel: 1.2 });
    c.fill(ellipse(x, y, 1.2 * s, 1.2 * s), YELLOW, { bevel: 1 });
  }
  return done(c);
}

/** A poppy: a red cup of crinkled petals with a dark centre on a thin hairy stem and a ragged leaf. */
export function poppy(): Rgba {
  const c = canvas();
  stalk(c, 24, 47, 24, 24, 3, 1.1);
  leaf(c, 31, 38, 5.6, 2.2, -0.7);
  c.fill(ellipse(15, 18, 9, 10, -0.5), RED, { bevel: 4 });
  c.fill(ellipse(33, 18, 9, 10, 0.5), RED, { bevel: 4 });
  c.fill(ellipse(24, 24, 11, 8), RED, { bevel: 4.4 });
  c.fill(ellipse(24, 15, 9, 9), ROSE, { bevel: 4 });
  c.fill(ellipse(24, 18, 4.6, 4.6), INK, { bevel: 2.6 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    c.flat(ellipse(24 + Math.cos(a) * 6.6, 18 + Math.sin(a) * 6.6, 0.7, 0.7), INK[2]!);
  }
  c.flat(ellipse(18, 10, 3, 1.4, -0.6), WHITE, 140);
  return done(c);
}

/** Lavender: three tall spikes of tiny purple flowers on green stems, tied with a ribbon. */
export function lavender(): Rgba {
  const c = canvas();
  for (const [x, top, bend] of [
    [15, 5, -2],
    [24, 2, 0],
    [33, 5, 2],
  ] as const) {
    stalk(c, 24 + (x - 24) * 0.25, 46, x, top + 10, bend, 0.9);
    for (let i = 0; i < 6; i++) {
      const y = top + i * 3.2;
      c.fill(ellipse(x - 1.4, y, 1.7, 1.7), i % 2 ? PURPLE : LILAC, { bevel: 1.2 });
      c.fill(ellipse(x + 1.4, y + 1.4, 1.7, 1.7), i % 2 ? LILAC : PURPLE, { bevel: 1.2 });
    }
  }
  c.fill(rect(19, 36, 29, 39), ROSE, { bevel: 1.2 });
  c.fill(ellipse(20, 40, 3.4, 2.2, 0.4), ROSE, { bevel: 1.2 });
  c.fill(ellipse(28, 40, 3.4, 2.2, -0.4), ROSE, { bevel: 1.2 });
  return done(c);
}

/** A bouquet: a rose, a daisy and a tulip in a cone of paper, tied with a red bow. */
export function bouquet(): Rgba {
  const c = canvas();
  for (const [x, y] of [
    [14, 16],
    [34, 16],
    [24, 12],
  ] as const)
    stalk(c, 24, 36, x, y + 4, 0, 1);
  leaf(c, 11, 24, 5.4, 2.4, -0.6);
  leaf(c, 37, 24, 5.4, 2.4, 0.6);
  c.fill(
    polygon([
      [6, 25],
      [42, 25],
      [27, 46],
      [21, 46],
    ]),
    CREAM,
    { bevel: 3 },
  );
  c.flat(
    polygon([
      [6, 25],
      [24, 25],
      [22, 46],
      [21, 46],
    ]),
    PINK[4]!,
    200,
  );
  c.fill(ellipse(24, 25, 18, 3.4), CREAM, { bevel: 1.6 });
  petals(c, 14, 14, 8, 3.8, 3.2, 2.6, YELLOW);
  petals(c, 14, 14, 8, 3.6, 3, 2.4, SNOW, 0.4);
  c.fill(ellipse(14, 14, 2.6, 2.6), YELLOW, { bevel: 1.4 });
  c.fill(ellipse(34, 15, 6.4, 6.4), RED, { bevel: 4 });
  c.flat(ring(34, 15, 3, 1, 1), ROSE[2]!);
  c.fill(ellipse(24, 10, 4.2, 6), PINK, { bevel: 3 });
  c.fill(
    polygon([
      [19, 8],
      [21, 3],
      [24, 7],
      [27, 3],
      [29, 8],
    ]),
    PINK,
    { bevel: 1.2 },
  );
  c.fill(ellipse(20, 31, 4, 2.6, -0.4), RED, { bevel: 1.4 });
  c.fill(ellipse(28, 31, 4, 2.6, 0.4), RED, { bevel: 1.4 });
  c.fill(ellipse(24, 31, 2, 2), ROSE, { bevel: 1 });
  return done(c);
}

/** A sprout: two round leaves unfolding on a short stem from a mound of brown earth. */
export function sprout(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 43, 18, 6.6), WOOD, { bevel: 4 });
  for (const [x, y] of [
    [14, 43],
    [30, 41],
    [22, 46],
    [35, 45],
  ] as const)
    c.flat(ellipse(x, y, 1, 0.8), DARKWOOD[2]!);
  stalk(c, 24, 42, 24, 22, 1.4, 1.6);
  c.fill(ellipse(15, 18, 9.4, 5.6, -0.4), GREEN, { bevel: 3 });
  c.fill(ellipse(33.4, 15, 9.4, 5.6, 0.4), GREEN, { bevel: 3 });
  c.line(23, 22, 9, 16, LEAF[2]!, 0.7);
  c.line(25, 22, 39, 13.4, LEAF[2]!, 0.7);
  c.flat(ellipse(11, 15.4, 2.4, 1, -0.4), WHITE, 150);
  return done(c);
}

/** A stem: a long green stalk with leaves in pairs, a thorn or two and a cut end at the bottom. */
export function stem(): Rgba {
  const c = canvas();
  stalk(c, 22, 46, 26, 4, 3, 1.7);
  for (const [x, y, rot, s] of [
    [14, 37, -0.6, 1],
    [33, 31, 0.6, 1],
    [14, 22, -0.6, 0.9],
    [34, 15, 0.6, 0.9],
  ] as const)
    leaf(c, x, y, 7 * s, 3.2 * s, rot);
  c.fill(ellipse(26, 4.4, 2.6, 3.4), LEAF, { bevel: 1.6 });
  for (const [x, y, d] of [
    [25, 28, 1],
    [24, 44, -1],
    [27, 10, -1],
  ] as const)
    c.fill(
      polygon([
        [x, y - 1.4],
        [x + d * 4, y],
        [x, y + 1.4],
      ]),
      BROWN,
      { bevel: 0.8 },
    );
  c.fill(ellipse(22, 46, 2.2, 1.1), CREAM, { bevel: 1 });
  return done(c);
}

/** A rosebud: a tight pink bud wrapped in green sepals on a stem with two leaves. */
export function bud(): Rgba {
  const c = canvas();
  stalk(c, 24, 47, 24, 28, 2, 1.5);
  leaf(c, 14, 39, 6, 2.6, -0.6);
  leaf(c, 33, 36, 6, 2.6, 0.6);
  c.fill(ellipse(24, 18, 9, 12), PINK, { bevel: 5 });
  c.fill(ellipse(20, 17, 6, 10, 0.2), ROSE, { bevel: 3.4 });
  c.fill(ellipse(28, 16, 6, 10, -0.2), PINK, { bevel: 3.4 });
  c.flat(
    polygon([
      [22, 7],
      [24, 3],
      [26, 7],
    ]),
    ROSE[4]!,
  );
  c.fill(
    polygon([
      [13, 22],
      [18, 31],
      [24, 32],
      [30, 31],
      [35, 22],
      [30, 26],
      [24, 20],
      [18, 26],
    ]),
    GREEN,
    { bevel: 1.6 },
  );
  c.fill(
    polygon([
      [16, 26],
      [20, 36],
      [24, 28],
    ]),
    LEAF,
    { bevel: 1 },
  );
  c.fill(
    polygon([
      [32, 26],
      [28, 36],
      [24, 28],
    ]),
    LEAF,
    { bevel: 1 },
  );
  c.flat(ellipse(19, 12, 1.2, 3, 0.2), WHITE, 150);
  return done(c);
}

export const BLOOM = {
  sunflower,
  violet,
  poppy,
  lavender,
  bouquet,
  sprout,
  stem,
  bud,
};
