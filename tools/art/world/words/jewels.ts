import type { Rgba } from '../../core/image';
import { both, type Canvas2D, capsule, ellipse, heart, minus, type Pt, polygon, ring, starPoints } from '../../fx/kit';
import { tone } from '../produce';
import { AMBER, BLUE, canvas, done, GOLD, PINK, RED, ROSE, rect, SKY, WHITE, YELLOW } from './shared';

const PEARL = tone('#fbf6ff', 280, 70);
const DIAMOND = tone('#8fdcff', 250, 235);
const AMETHYST = tone('#a75be8', 290, 330);

/** A row of pearls along a curve, with a gold clasp. */
function pearls(c: Canvas2D, pts: readonly Pt[], r: number): void {
  for (const [x, y] of pts) c.fill(ellipse(x, y, r, r), PEARL, { bevel: r });
}

/** A pearl necklace in a deep U, with a teardrop ruby on a gold bead at the front. */
export function necklace(): Rgba {
  const c = canvas();
  const arc: Pt[] = Array.from({ length: 13 }, (_, i) => {
    const t = i / 12;
    return [4 + t * 40, 5 + Math.sin(t * Math.PI) * 28] as Pt;
  });
  pearls(c, arc, 2.7);
  c.fill(ellipse(24, 38, 3.6, 3.6), GOLD, { bevel: 2 });
  c.fill(
    polygon([
      [24, 36],
      [29, 42],
      [27, 46],
      [21, 46],
      [19, 42],
    ]),
    RED,
    { bevel: 2 },
  );
  c.flat(ellipse(22, 41, 1, 1.6, 0.3), WHITE, 210);
  c.fill(ellipse(4.6, 5.4, 2.4, 2.4), GOLD, { bevel: 1.4 });
  c.fill(ellipse(43.4, 5.4, 2.4, 2.4), GOLD, { bevel: 1.4 });
  return done(c);
}

/** A gold bangle with a row of coloured gems and a little heart charm. */
export function bracelet(): Rgba {
  const c = canvas();
  c.fill(minus(ellipse(24, 24, 20, 17), ellipse(24, 24, 14, 10.4)), GOLD, { bevel: 3.6, gain: 1.1 });
  c.flat(
    both(minus(ellipse(24, 24, 14, 10.4), ellipse(24, 20, 14, 10.4)), (_x, y) => y > 24),
    GOLD[1]!,
    160,
  );
  for (const [x, y, ramp] of [
    [10, 31, PINK],
    [17, 37, SKY],
    [24, 40, ROSE],
    [31, 37, SKY],
    [38, 31, PINK],
  ] as const)
    c.fill(ellipse(x, y, 2.4, 2.4), ramp, { bevel: 1.6 });
  c.fill(heart(24, 46, 2.4), RED, { bevel: 1 });
  c.flat(ellipse(12, 15, 5, 1.4, -0.6), WHITE, 190);
  return done(c);
}

/** A brooch: a gold flower, each petal a pearl or a gem, a ruby at its heart. */
export function brooch(): Rgba {
  const c = canvas();
  c.fill(polygon(starPoints(24, 24, 8, 21, 11, Math.PI / 8)), GOLD, { bevel: 3.4 });
  c.fill(ellipse(24, 24, 14, 14), GOLD, { bevel: 4 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    c.fill(ellipse(24 + Math.cos(a) * 13.4, 24 + Math.sin(a) * 13.4, 2.8, 2.8), i % 2 === 0 ? PEARL : DIAMOND, {
      bevel: 2,
    });
  }
  c.fill(ellipse(24, 24, 7.4, 7.4), RED, { bevel: 4 });
  c.flat(ellipse(21.4, 21.6, 2, 1.4, -0.7), WHITE, 220);
  return done(c);
}

/** A heart-shaped gold locket with a sapphire, hanging from two links of chain. */
export function locket(): Rgba {
  const c = canvas();
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      c.fill(ellipse(24 + sx * (4 + i * 3.4), 4 + i * 1.2, 1.9, 1.3, sx * 0.5), GOLD, { bevel: 1 });
    }
  }
  c.fill(ellipse(24, 13, 2.8, 2.8), GOLD, { bevel: 1.6 });
  c.fill(heart(24, 28, 17), GOLD, { bevel: 5, gain: 1.1 });
  c.fill(heart(24, 28, 11), AMBER, { bevel: 3 });
  c.fill(heart(24, 28, 6.4), BLUE, { bevel: 3 });
  c.flat(ellipse(21, 26, 1.6, 1, -0.7), WHITE, 220);
  return done(c);
}

/** A pair of drop earrings: a gold hook, a pearl and a teardrop of amethyst. */
export function earring(): Rgba {
  const c = canvas();
  for (const x of [13, 35]) {
    c.fill(ring(x, 7, 4, 1.8, 1.2), GOLD, { bevel: 1.2 });
    c.fill(ellipse(x, 14, 2.6, 2.6), PEARL, { bevel: 2 });
    c.fill(capsule(x, 17, x, 20, 0.9), GOLD, { bevel: 0.8 });
    c.fill(
      polygon([
        [x, 19],
        [x + 5, 27],
        [x + 5, 33],
        [x, 44],
        [x - 5, 33],
        [x - 5, 27],
      ]),
      AMETHYST,
      { bevel: 3 },
    );
    c.flat(ellipse(x - 2, 28, 1, 2.6, 0.2), WHITE, 200);
  }
  return done(c);
}

/** A golden tiara with three points, a diamond at the top and pink and blue jewels. */
export function tiara(): Rgba {
  const c = canvas();
  c.fill(rect(3, 36, 45, 42), GOLD, { bevel: 2.4 });
  for (const [x, h] of [
    [8, 26],
    [16, 18],
    [24, 8],
    [32, 18],
    [40, 26],
  ] as const) {
    c.fill(
      polygon([
        [x - 5, 37],
        [x, h],
        [x + 5, 37],
      ]),
      GOLD,
      { bevel: 2 },
    );
    c.fill(ellipse(x, h - 1, 2.4, 2.4), x === 24 ? DIAMOND : PINK, { bevel: 1.6 });
  }
  for (const x of [8, 16, 24, 32, 40]) c.fill(ellipse(x, 39, 1.6, 1.6), x === 24 ? RED : SKY, { bevel: 1 });
  c.flat(rect(5, 37, 43, 38), YELLOW[5]!);
  return done(c);
}

/** A cut diamond, glittering. */
export function gem(): Rgba {
  const c = canvas();
  c.fill(
    polygon([
      [4, 16],
      [14, 6],
      [34, 6],
      [44, 16],
      [24, 44],
    ]),
    DIAMOND,
    { bevel: 4 },
  );
  c.flat(
    polygon([
      [14, 6],
      [34, 6],
      [30, 16],
      [18, 16],
    ]),
    SKY[5]!,
  );
  c.flat(
    polygon([
      [4, 16],
      [14, 6],
      [18, 16],
    ]),
    SKY[3]!,
  );
  c.flat(
    polygon([
      [44, 16],
      [34, 6],
      [30, 16],
    ]),
    SKY[3]!,
  );
  c.flat(
    polygon([
      [4, 16],
      [18, 16],
      [24, 44],
    ]),
    DIAMOND[2]!,
  );
  c.flat(
    polygon([
      [44, 16],
      [30, 16],
      [24, 44],
    ]),
    DIAMOND[3]!,
  );
  c.flat(
    polygon([
      [18, 16],
      [30, 16],
      [24, 44],
    ]),
    DIAMOND[4]!,
  );
  c.flat(
    polygon([
      [19, 8],
      [24, 8],
      [21, 14],
    ]),
    WHITE,
    230,
  );
  for (const [x, y, r] of [
    [40, 6, 4],
    [7, 8, 3],
    [41, 34, 2.6],
  ] as const)
    c.flat(polygon(starPoints(x, y, 4, r, r * 0.25)), YELLOW[5]!);
  return done(c);
}

/** A pendant on a V of fine chain: a round gold frame holding an amethyst. */
export function pendant(): Rgba {
  const c = canvas();
  for (let i = 0; i < 6; i++) {
    for (const sx of [-1, 1])
      c.fill(ellipse(24 + sx * (18 - i * 2.8), 3 + i * 2.3, 1.8, 1.2, sx * 0.9), GOLD, { bevel: 1 });
  }
  c.fill(ellipse(24, 17, 2.2, 2.2), GOLD, { bevel: 1.2 });
  c.fill(ellipse(24, 30, 14, 14), GOLD, { bevel: 4 });
  c.fill(ellipse(24, 30, 10.4, 10.4), AMBER, { bevel: 2.4 });
  c.fill(ellipse(24, 30, 8.4, 8.4), AMETHYST, { bevel: 4 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    c.flat(ellipse(24 + Math.cos(a) * 12.4, 30 + Math.sin(a) * 12.4, 0.9, 0.9), PEARL[5]!);
  }
  c.flat(ellipse(21, 27, 2.2, 1.4, -0.7), WHITE, 220);
  return done(c);
}

/** A royal sceptre: a long gold rod with rings, topped by a star holding a big ruby. */
export function scepter(): Rgba {
  const c = canvas();
  c.fill(capsule(6, 44, 32, 18, 2.2), GOLD, { bevel: 2.2 });
  for (const t of [0.12, 0.45, 0.7]) {
    const x = 6 + 26 * t,
      y = 44 - 26 * t;
    c.fill(ellipse(x, y, 2, 4.4, 0.785), AMBER, { bevel: 1.2 });
  }
  c.fill(polygon(starPoints(35, 14, 8, 12, 6.6)), GOLD, { bevel: 2.4 });
  c.fill(ellipse(35, 14, 6, 6), RED, { bevel: 3.4 });
  c.flat(ellipse(33, 12, 1.8, 1.2, -0.7), WHITE, 230);
  c.fill(ellipse(5.4, 45, 2.6, 2.6), AMBER, { bevel: 1.4 });
  return done(c);
}

export const JEWELS = {
  necklace,
  bracelet,
  brooch,
  locket,
  earring,
  tiara,
  gem,
  pendant,
  scepter,
};
