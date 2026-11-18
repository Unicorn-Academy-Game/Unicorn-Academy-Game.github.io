import type { Rgba } from '../../core/image';
import { capsule, ellipse, heart, minus, polygon, starPoints, union } from '../../fx/kit';
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
  INK,
  LILAC,
  MINT,
  ORANGE,
  PEACH,
  PINK,
  RED,
  ROSE,
  rect,
  SKY,
  SNOW,
  WHITE,
  YELLOW,
} from './shared';

const GLASS = tone('#d6f3ff', 250, 235);

/** A cosy blanket in broad blue and cream stripes, folded over, with a fringe along the end. */
export function blanket(): Rgba {
  const c = canvas();
  c.fill(
    polygon([
      [4, 16],
      [38, 12],
      [44, 18],
      [44, 38],
      [10, 42],
      [4, 36],
    ]),
    BLUE,
    { bevel: 4, gain: 0.9 },
  );
  for (const [x0, x1] of [
    [12, 17],
    [23, 28],
    [34, 39],
  ] as const)
    c.flat(
      polygon([
        [x0, 15],
        [x1, 14.4],
        [x1 + 3, 39],
        [x0 - 1, 39.8],
      ]),
      CREAM[5]!,
      235,
    );
  c.fill(
    polygon([
      [4, 16],
      [38, 12],
      [44, 18],
      [10, 22],
    ]),
    SKY,
    { bevel: 2 },
  );
  c.flat(
    polygon([
      [6, 17.4],
      [37, 14],
      [41, 17.8],
      [10, 21],
    ]),
    CREAM[4]!,
    110,
  );
  for (let i = 0; i < 8; i++) c.line(44, 19 + i * 2.6, 46.6, 20.4 + i * 2.6, CREAM[4]!, 1);
  c.fill(heart(24, 31, 4), PINK, { bevel: 1.6 });
  return done(c);
}

/** A patchwork quilt: a four by four of coloured squares, each with its own pattern, sewn with dashed stitching. */
export function quilt(): Rgba {
  const c = canvas();
  const cells = [
    [PINK, ROSE, SKY, YELLOW],
    [MINT, LILAC, ORANGE, BLUE],
    [YELLOW, SKY, PINK, MINT],
    [BLUE, ORANGE, LILAC, ROSE],
  ] as const;
  c.fill(rect(3, 3, 45, 45), CREAM, { bevel: 1.6 });
  for (let r = 0; r < 4; r++)
    for (let k = 0; k < 4; k++) {
      const x = 5 + k * 10,
        y = 5 + r * 10;
      c.fill(rect(x, y, x + 9, y + 9), cells[r]![k]!, { bevel: 1.2 });
      const kind = (r + k * 3) % 4;
      const [cx, cy] = [x + 4.5, y + 4.5];
      if (kind === 0) c.flat(heart(cx, cy, 2.2), WHITE, 230);
      else if (kind === 1) c.flat(polygon(starPoints(cx, cy, 5, 3, 1.2)), WHITE, 230);
      else if (kind === 2) c.flat(ellipse(cx, cy, 2.2, 2.2), WHITE, 230);
      else
        c.flat(
          polygon([
            [cx, cy - 3],
            [cx + 3, cy],
            [cx, cy + 3],
            [cx - 3, cy],
          ]),
          WHITE,
          230,
        );
    }
  return done(c);
}

/** A dream: a puffy thought cloud holding a crescent moon and stars, with two small bubbles trailing from it. */
export function dream(): Rgba {
  const c = canvas();
  c.fill(
    union(
      ellipse(14, 20, 9, 8),
      ellipse(26, 13, 10, 9),
      ellipse(36, 20, 9, 8),
      ellipse(30, 26, 12, 8),
      ellipse(16, 27, 11, 7),
      ellipse(24, 20, 12, 10),
    ),
    SNOW,
    { bevel: 5 },
  );
  c.fill(minus(ellipse(23, 20, 8, 8), ellipse(27, 17.4, 7.2, 7)), YELLOW, { bevel: 2.6 });
  for (const [x, y, r] of [
    [32, 12, 2.6],
    [33, 25, 2],
    [12, 14, 1.8],
  ] as const)
    c.flat(polygon(starPoints(x, y, 4, r, r * 0.3)), AMBER[4]!);
  c.fill(ellipse(15, 38, 3.6, 3.2), SNOW, { bevel: 2 });
  c.fill(ellipse(9, 44, 2.2, 2, 0), SNOW, { bevel: 1.4 });
  return done(c);
}

/** Sleep: a child under a starry blue blanket with eyes closed on a white pillow, and a trail of z letters. */
export function sleep(): Rgba {
  const c = canvas();
  c.fill(rect(3, 32, 45, 44), DARKWOOD, { bevel: 2.4 });
  c.fill(ellipse(15, 29, 13, 7.4), SNOW, { bevel: 4 });
  c.fill(ellipse(15, 24, 6.4, 6), PEACH, { bevel: 3.4 });
  c.fill(minus(ellipse(15, 20.8, 7, 4.2), ellipse(15, 24.4, 5.6, 4)), BROWN, { bevel: 2 });
  c.line(12.6, 25, 14.2, 25.8, INK[1]!, 0.8);
  c.line(16.2, 25.8, 17.8, 25, INK[1]!, 0.8);
  c.flat(ellipse(11.4, 27.6, 1.4, 1, 0), ROSE[3]!, 180);
  c.fill(
    polygon([
      [10, 28],
      [45, 26],
      [45, 38],
      [10, 40],
    ]),
    BLUE,
    { bevel: 3 },
  );
  c.fill(ellipse(10, 34, 3.4, 6), BLUE, { bevel: 2.4 });
  for (const [x, y, r] of [
    [22, 32, 2.4],
    [30, 36, 2],
    [37, 30, 2.6],
    [41, 36, 1.8],
  ] as const)
    c.flat(polygon(starPoints(x, y, 5, r, r * 0.45)), YELLOW[5]!);
  for (const [x, y, s] of [
    [27, 18, 5],
    [34, 11, 4],
    [40, 5, 3],
  ] as const) {
    c.flat(rect(x, y, x + s, y + 1), SKY[5]!);
    c.flat(
      polygon([
        [x + s, y + 1],
        [x + s - 1, y + 1],
        [x, y + s],
        [x + 1, y + s],
      ]),
      SKY[5]!,
    );
    c.flat(rect(x, y + s - 1, x + s, y + s), SKY[5]!);
  }
  return done(c);
}

/** A hand mirror: a round glass with a gleam across it in a gold frame with a handle and a pink gem. */
export function mirror(): Rgba {
  const c = canvas();
  c.fill(capsule(24, 30, 24, 45, 2.6), GOLD, { bevel: 2 });
  c.fill(ellipse(24, 45, 3.4, 2.4), GOLD, { bevel: 1.4 });
  c.fill(ellipse(24, 18, 19, 17), GOLD, { bevel: 4.4, gain: 1.1 });
  c.fill(ellipse(24, 18, 15, 13.4), GLASS, { bevel: 2.4, gain: 0.6 });
  c.flat(
    polygon([
      [11, 22],
      [20, 8],
      [24, 8],
      [13, 26],
    ]),
    WHITE,
    210,
  );
  c.flat(
    polygon([
      [26, 28],
      [34, 18],
      [36, 19.6],
      [29, 29.4],
    ]),
    WHITE,
    160,
  );
  c.fill(ellipse(24, 33, 3.6, 3.6), GOLD, { bevel: 1.6 });
  c.fill(ellipse(24, 33, 2, 2), PINK, { bevel: 1.2 });
  for (const sx of [-1, 1]) c.fill(ellipse(24 + sx * 18, 18, 2, 2), PINK, { bevel: 1 });
  c.fill(ellipse(24, 1.6, 2.2, 2), PINK, { bevel: 1 });
  return done(c);
}

/** A pink comb with a heart gem on its spine and a row of fine teeth. */
export function comb(): Rgba {
  const c = canvas();
  c.fill(rect(4, 9, 44, 19), PINK, { bevel: 4.4 });
  c.fill(ellipse(4.6, 14, 3.4, 5), PINK, { bevel: 2 });
  c.fill(ellipse(43.4, 14, 3.4, 5), PINK, { bevel: 2 });
  for (let i = 0; i < 11; i++) {
    const x = 6 + i * 3.6;
    c.fill(
      polygon([
        [x - 1.2, 18],
        [x + 1.2, 18],
        [x + 0.6, 45],
        [x - 0.6, 45],
      ]),
      PINK,
      { bevel: 0.8 },
    );
  }
  c.fill(heart(24, 14, 4.2), RED, { bevel: 2 });
  c.flat(ellipse(21.6, 12.4, 1.2, 0.8, -0.6), WHITE, 220);
  for (const x of [9.6, 38.4]) c.fill(ellipse(x, 14, 1.8, 1.8), YELLOW, { bevel: 1 });
  c.flat(rect(7, 10.4, 41, 11.6), WHITE, 150);
  return done(c);
}

export const HOME = {
  blanket,
  quilt,
  dream,
  sleep,
  mirror,
  comb,
};
