import type { Rgba } from '../../core/image';
import { both, capsule, ellipse, minus, type Pt, polygon, ring, starPoints, union } from '../../fx/kit';
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
  INK,
  IRON,
  LILAC,
  MINT,
  NIGHT,
  ONYX,
  ORANGE,
  PEACH,
  PINK,
  PURPLE,
  RED,
  ROSE,
  rect,
  SKY,
  SNOW,
  STONE,
  turn,
  WHITE,
  WOOD,
  YELLOW,
} from './shared';

/** A star of four long points, for a glint. */
const glint = (cx: number, cy: number, r: number) => polygon(starPoints(cx, cy, 4, r, r * 0.28));

/** A swirl of magic: a spiral of purple and pink round a gold star, with glints thrown off it. */
export function charm(): Rgba {
  const c = canvas();
  let prev: Pt = [24, 24];
  for (let i = 1; i <= 90; i++) {
    const t = i * 0.12;
    const r = 2.4 + t * 1.5;
    const next: Pt = [24 + Math.cos(t * 1.1) * r, 24 + Math.sin(t * 1.1) * r];
    if (r < 21) c.line(prev[0], prev[1], next[0], next[1], i % 2 ? PURPLE[3]! : PINK[3]!, 3.6 - t * 0.1);
    prev = next;
  }
  c.fill(glint(24, 24, 11), YELLOW, { bevel: 2.4, gain: 1.2 });
  for (const [x, y, r] of [
    [8, 9, 4.4],
    [40, 11, 3.6],
    [39, 39, 4.6],
    [9, 38, 3.2],
  ] as const)
    c.fill(glint(x, y, r), x < 24 ? PINK : LILAC, { bevel: 1.2 });
  return done(c);
}

/** A scroll: cream parchment rolled at both ends, lines of writing and a red seal on a ribbon. */
export function scroll(): Rgba {
  const c = canvas();
  c.fill(rect(10, 10, 38, 38), CREAM, { bevel: 3.4 });
  for (const x of [10, 38]) {
    c.fill(ellipse(x, 24, 4, 15.6), AMBER, { bevel: 2.6, gain: 1.1 });
    c.fill(ellipse(x, 24, 1.8, 8), DARKWOOD, { bevel: 1.4 });
  }
  for (const [y, w] of [
    [16, 17],
    [20.4, 20],
    [24.8, 14],
    [29.2, 18],
  ] as const)
    c.flat(rect(14.6, y, 14.6 + w, y + 1.4), BROWN[1]!);
  c.fill(ellipse(32, 33, 4.4, 4.4), RED, { bevel: 2.4, gain: 1.1 });
  c.flat(glint(32, 33, 2.6), ROSE[4]!);
  c.fill(
    polygon([
      [29, 36],
      [26, 44],
      [30, 42],
      [32, 46],
      [33.4, 37],
    ]),
    RED,
    { bevel: 1.2 },
  );
  return done(c);
}

/** A white quill with a long vane, its dark nib touching a drop of ink and a curl of writing. */
export function quill(): Rgba {
  const c = canvas();
  const vane = polygon([
    [44, 3],
    [36, 8],
    [26, 18],
    [18, 28],
    [14, 36],
    [20, 33],
    [28, 28],
    [38, 20],
    [43, 11],
  ]);
  c.fill(vane, SNOW, { bevel: 5, gain: 1.1 });
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    const x = 40 - t * 22;
    const y = 8 + t * 22;
    c.line(x, y, x + 3.4, y + 2.6 - t * 1.4, SKY[2]!, 0.9);
  }
  c.line(14, 38, 41, 5.6, CREAM[4]!, 1.6);
  c.fill(
    polygon([
      [14, 36.6],
      [17, 39.6],
      [8, 46],
      [9, 41],
    ]),
    ONYX,
    { bevel: 1.2 },
  );
  c.flat(ellipse(6.6, 46.4, 1.7, 1.2), NIGHT[2]!);
  c.flat(ellipse(22, 41, 7, 1), NIGHT[2]!);
  c.flat(ellipse(31, 42.4, 4, 0.9), NIGHT[2]!);
  return done(c);
}

/** A bottle of blue-black ink with a cork, a white label and a drop that ran down the side. */
export function ink(): Rgba {
  const c = canvas();
  c.fill(union(rect(13, 22, 35, 42), ellipse(24, 42, 11, 3.4), ellipse(24, 22, 11, 3.4)), NIGHT, {
    bevel: 6,
    gain: 1.15,
  });
  c.fill(rect(19, 12, 29, 22), SKY, { bevel: 2.6, gain: 0.9 });
  c.fill(rect(18.6, 7, 29.4, 13), WOOD, { bevel: 2 });
  c.fill(rect(15.6, 27, 32.4, 36), CREAM, { bevel: 1.8 });
  c.flat(glint(24, 31.6, 3.6), NIGHT[1]!);
  c.flat(ellipse(16.4, 29, 1, 6, 0), WHITE, 190);
  c.fill(ellipse(35.4, 38, 1.7, 2.6), INK, { bevel: 1.4 });
  return done(c);
}

/** A bright five pointed star in gold, with a glint at its middle. */
export function star(): Rgba {
  const c = canvas();
  c.fill(polygon(starPoints(24, 25.4, 5, 22, 9.8)), YELLOW, { bevel: 6.4, gain: 1.15 });
  c.fill(polygon(starPoints(24, 25.4, 5, 12, 5.6)), GOLD, { bevel: 3.4, gain: 1.2 });
  c.flat(ellipse(19.6, 18, 2.4, 1.1, -0.9), WHITE, 210);
  return done(c);
}

/** A round yellow sun with eight rays and a bright patch where it shines. */
export function sun(): Rgba {
  const c = canvas();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const [x, y] = [24 + Math.cos(a) * 14, 24 + Math.sin(a) * 14];
    const [px, py] = [-Math.sin(a), Math.cos(a)];
    const tip: Pt = [24 + Math.cos(a) * 23, 24 + Math.sin(a) * 23];
    c.fill(polygon([[x + px * 4, y + py * 4], [x - px * 4, y - py * 4], tip]), ORANGE, { bevel: 2.4 });
  }
  c.fill(ellipse(24, 24, 14, 14), YELLOW, { bevel: 8, gain: 1.15 });
  c.flat(ellipse(18.6, 17.6, 4, 2.2, -0.7), WHITE, 190);
  return done(c);
}

/** A purple planet with a pale band and a gold ring tilted round it, among small stars. */
export function planet(): Rgba {
  const c = canvas();
  const tilt = (r: number) => ring(24, 25, r, 3.6, 0.28);
  c.fill(turn(tilt(20), 24, 25, -0.38), GOLD, { bevel: 1.6 });
  c.fill(ellipse(24, 25, 13.4, 13.4), PURPLE, { bevel: 8, gain: 1.15 });
  c.flat(both(ellipse(24, 25, 13, 13), ellipse(24, 22, 16, 2.4, -0.2)), LILAC[3]!, 190);
  c.flat(both(ellipse(24, 25, 13, 13), ellipse(23, 30, 16, 1.6, -0.2)), PINK[3]!, 160);
  c.fill(both(turn(tilt(20), 24, 25, -0.38), rect(0, 26.4, 48, 48)), GOLD, { bevel: 1.6 });
  c.flat(ellipse(18, 18, 3.4, 1.8, -0.7), WHITE, 170);
  c.fill(glint(6, 8, 3.6), YELLOW, { bevel: 1 });
  c.fill(glint(42, 41, 3.2), YELLOW, { bevel: 1 });
  return done(c);
}

/** A comet: a bright head at the top right and a long tail that fades away behind it. */
export function comet(): Rgba {
  const c = canvas();
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    c.flat(
      capsule(32 - t * 8, 17 + t * 6, 4 + t * 3, 43 - t * 3, 7.4 - t * 5.4, 1.4),
      i < 2 ? SKY[4]! : i < 4 ? BLUE[3]! : LILAC[3]!,
      200 - i * 28,
    );
  }
  c.fill(capsule(34, 15, 10, 38, 4, 0.8), SNOW, { bevel: 2.4 });
  c.fill(ellipse(35, 14, 9, 9), YELLOW, { bevel: 6, gain: 1.15 });
  c.flat(ellipse(33, 12, 3, 2, -0.7), WHITE, 220);
  c.fill(glint(8, 12, 3.8), YELLOW, { bevel: 1 });
  c.fill(glint(43, 36, 3.2), LILAC, { bevel: 1 });
  return done(c);
}

/** A glowing orb of light: soft rings of blue round a white heart. */
export function glow(): Rgba {
  const c = canvas();
  for (const [r, col, a] of [
    [23, SKY[4]!, 60],
    [19, SKY[4]!, 100],
    [15, SNOW[3]!, 150],
    [11, SNOW[5]!, 230],
  ] as const)
    c.flat(ellipse(24, 24, r, r), col, a);
  c.fill(ellipse(24, 24, 8, 8), SNOW, { bevel: 5, gain: 0.6 });
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + 0.4;
    c.line(24 + Math.cos(a) * 12, 24 + Math.sin(a) * 12, 24 + Math.cos(a) * 21, 24 + Math.sin(a) * 21, WHITE, 1.2);
  }
  return done(c);
}

/** A lamp of gold with a long spout, a loop of a handle and a small flame at the tip. */
export function lamp(): Rgba {
  const c = canvas();
  c.fill(
    polygon([
      [4, 20],
      [14, 26],
      [14, 30],
      [8, 24],
    ]),
    GOLD,
    { bevel: 1.6 },
  );
  c.fill(ellipse(26, 32, 14, 8.6), GOLD, { bevel: 6, gain: 1.15 });
  c.fill(ellipse(26, 41, 8, 3.2), GOLD, { bevel: 2.4 });
  c.fill(rect(19, 38, 33, 42), GOLD, { bevel: 2 });
  c.fill(ellipse(26, 25, 8, 4), GOLD, { bevel: 3 });
  c.fill(
    polygon([
      [22, 22],
      [30, 22],
      [26, 12],
    ]),
    YELLOW,
    { bevel: 2.6, gain: 1.1 },
  );
  c.fill(ellipse(26, 10.6, 2, 2), GOLD, { bevel: 1.4 });
  c.fill(minus(ellipse(41, 31, 6.4, 6), ellipse(41, 31.4, 3.4, 3.2)), GOLD, { bevel: 1.6 });
  c.fill(ellipse(4.6, 18, 2.2, 3.4, 0.3), ORANGE, { bevel: 1.6 });
  c.fill(ellipse(4.8, 18.6, 1, 2, 0.3), YELLOW, { bevel: 1 });
  c.flat(ellipse(19, 29, 5, 1.6, -0.5), WHITE, 190);
  c.flat(glint(26, 33, 2.4), WHITE);
  return done(c);
}

/** A torch: a wooden stick wrapped in cloth at the top, with a roaring flame. */
export function torch(): Rgba {
  const c = canvas();
  c.fill(
    polygon([
      [21, 46],
      [27, 46],
      [29, 24],
      [19, 24],
    ]),
    WOOD,
    { bevel: 2.4 },
  );
  c.fill(rect(17.4, 22, 30.6, 29), BROWN, { bevel: 2.2 });
  c.line(18, 25.6, 30, 25.6, DARKWOOD[1]!, 1);
  c.fill(
    union(
      ellipse(24, 14, 9.4, 9.4),
      polygon([
        [14.8, 14],
        [33.2, 14],
        [28, 6],
        [24, 0.6],
        [20, 6],
      ]),
    ),
    ORANGE,
    { bevel: 6, gain: 1.15 },
  );
  c.fill(
    union(
      ellipse(24, 15.6, 5.4, 6.4),
      polygon([
        [18.6, 15.6],
        [29.4, 15.6],
        [24, 4.6],
      ]),
    ),
    YELLOW,
    { bevel: 4 },
  );
  c.flat(ellipse(24, 17.6, 2.6, 3.4), SNOW[5]!);
  return done(c);
}

/** A burst of light: eight rays round a white heart, with a glint at the tip of each long one. */
export function spark(): Rgba {
  const c = canvas();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const len = i % 2 === 0 ? 21 : 14;
    c.fill(
      capsule(24 + Math.cos(a) * 6, 24 + Math.sin(a) * 6, 24 + Math.cos(a) * len, 24 + Math.sin(a) * len, 2.6, 0.6),
      i % 2 === 0 ? YELLOW : ORANGE,
      { bevel: 1.6 },
    );
  }
  for (const [x, y] of [
    [8, 8],
    [40, 9],
    [41, 40],
    [8, 40],
  ] as const)
    c.fill(ellipse(x, y, 1.8, 1.8), PINK, { bevel: 1.4 });
  c.fill(ellipse(24, 24, 7.4, 7.4), SNOW, { bevel: 4, gain: 0.7 });
  c.flat(ellipse(22, 22, 2.4, 1.6, -0.7), WHITE, 255);
  return done(c);
}

/** A black cauldron full of bubbling green brew, with steam rising and a fire under it. */
export function brew(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 45, 12, 2.4), ORANGE, { bevel: 2 });
  c.fill(
    polygon([
      [10, 38],
      [14, 38],
      [12, 45],
    ]),
    ONYX,
    { bevel: 1 },
  );
  c.fill(
    polygon([
      [34, 38],
      [38, 38],
      [36, 45],
    ]),
    ONYX,
    { bevel: 1 },
  );
  c.fill(ellipse(24, 32, 18, 12.4), ONYX, { bevel: 8, gain: 1.1 });
  c.fill(ellipse(24, 22, 18.4, 5.4), STONE, { bevel: 3 });
  c.fill(ellipse(24, 22, 15.4, 3.8), GREEN, { bevel: 2.4, gain: 1.2 });
  c.flat(ellipse(24, 22, 9, 1.8), MINT[4]!, 200);
  for (const [x, y, r] of [
    [17, 18.6, 2.4],
    [27, 15.6, 3.2],
    [32, 19.6, 1.8],
    [22, 11.6, 1.8],
  ] as const) {
    c.fill(ellipse(x, y, r, r), MINT, { bevel: 1.6, gain: 1.2 });
    c.flat(ellipse(x - r * 0.3, y - r * 0.3, r * 0.3, r * 0.3), WHITE);
  }
  c.flat(ellipse(13.4, 31, 1.4, 6, 0.1), WHITE, 120);
  return done(c);
}

/** A wooden spoon, long in the handle, with a deep round bowl, leaning across the picture. */
export function spoon(): Rgba {
  const c = canvas();
  const lean = (shape: ReturnType<typeof rect>) => turn(shape, 24, 24, -0.62);
  c.fill(lean(capsule(24, 22, 24, 46, 2.2, 2.8)), WOOD, { bevel: 2 });
  c.fill(lean(ellipse(24, 12, 9, 11)), WOOD, { bevel: 5.4, gain: 1.1 });
  c.flat(lean(ellipse(24, 12.6, 5.8, 7.4)), DARKWOOD[1]!);
  c.flat(lean(ellipse(24, 14.6, 4.4, 5.2)), DARKWOOD[2]!);
  c.flat(lean(ellipse(20.4, 7.4, 1.4, 3, 0.1)), WHITE, 150);
  return done(c);
}

/** Steam curling up from a blue cup: three soft white wisps that wobble as they rise. */
export function steam(): Rgba {
  const c = canvas();
  for (const [x0, off] of [
    [15, 0],
    [24, 1.4],
    [33, 0.4],
  ] as const) {
    let prev: Pt = [x0, 30];
    for (let i = 1; i <= 16; i++) {
      const y = 30 - i * 1.7;
      const x = x0 + Math.sin(i * 0.62 + off) * 4;
      c.line(prev[0], prev[1], x, y, i < 11 ? SNOW[4]! : SKY[4]!, 2.8 - i * 0.07);
      prev = [x, y];
    }
  }
  c.fill(minus(union(rect(8, 31, 40, 39), ellipse(24, 39, 16, 6)), ellipse(24, 31, 14, 3.4)), BLUE, {
    bevel: 4.6,
    gain: 1.1,
  });
  c.fill(ellipse(24, 31.4, 15, 3.6), SNOW, { bevel: 2 });
  c.fill(minus(ellipse(41, 34, 5.6, 5.2), ellipse(41, 34, 2.8, 2.6)), BLUE, { bevel: 1.6 });
  c.fill(ellipse(24, 44, 18, 2.4), BLUE, { bevel: 1.6 });
  c.flat(ellipse(13, 36.4, 1.1, 3.2, 0), WHITE, 190);
  return done(c);
}

/** A tall glass of clear water, filled almost to the top, with a bright edge of light. */
export function water(): Rgba {
  const c = canvas();
  const glass = polygon([
    [10, 6],
    [38, 6],
    [34, 43],
    [14, 43],
  ]);
  c.fill(glass, SKY, { bevel: 3.6, gain: 0.7 });
  const filled = polygon([
    [10.8, 13],
    [37.2, 13],
    [34, 43],
    [14, 43],
  ]);
  c.fill(filled, BLUE, { bevel: 4.4, gain: 1.1 });
  c.flat(ellipse(24, 13.4, 13.4, 2.2), SKY[5]!, 230);
  c.flat(ellipse(17, 27, 1.4, 11, 0.08), WHITE, 190);
  for (const [x, y, r] of [
    [27, 22, 1.4],
    [30, 30, 1],
    [24, 35, 1.2],
  ] as const)
    c.flat(ellipse(x, y, r, r), SKY[5]!, 210);
  c.fill(rect(13.4, 41, 34.6, 44), SKY, { bevel: 1.6 });
  return done(c);
}

/** One big drop of water with a bright patch, and the ring it makes where it lands. */
export function drop(): Rgba {
  const c = canvas();
  c.flat(ellipse(24, 42, 16, 3.6), BLUE[4]!, 210);
  c.flat(minus(ellipse(24, 42, 16, 3.6), ellipse(24, 42, 12.4, 2.2)), SKY[5]!, 240);
  c.fill(
    union(
      ellipse(24, 29, 11.4, 11.6),
      polygon([
        [13.8, 25],
        [34.2, 25],
        [24, 3.4],
      ]),
    ),
    BLUE,
    { bevel: 8, gain: 1.15 },
  );
  c.flat(ellipse(18.6, 29, 2, 5.6, 0.3), WHITE, 210);
  c.flat(ellipse(17.6, 22.6, 1, 1, 0), WHITE, 230);
  return done(c);
}

/** A stream seen from above: a blue band that bends twice, with white ripples and stones on its banks. */
export function stream(): Rgba {
  const c = canvas();
  c.fill(rect(3, 3, 45, 45), GREEN, { bevel: 4, gain: 0.9 });
  const path = (t: number): Pt => [24 + Math.sin(t * 6.4) * 12, 3 + t * 42];
  for (let i = 0; i < 60; i++) {
    const [x, y] = path(i / 60);
    c.flat(ellipse(x, y, 6.4, 3.6), BLUE[2]!);
  }
  for (let i = 0; i < 60; i++) {
    const [x, y] = path(i / 60);
    c.flat(ellipse(x, y, 4.6, 2.4), BLUE[4]!);
  }
  for (const t of [0.12, 0.34, 0.58, 0.82]) {
    const [x, y] = path(t);
    c.flat(ellipse(x - 1, y, 2.8, 0.7), WHITE, 220);
  }
  for (const [x, y] of [
    [9, 12],
    [38, 18],
    [11, 33],
    [37, 38],
  ] as const)
    c.fill(ellipse(x, y, 2.6, 1.8), STONE, { bevel: 1.4 });
  return done(c);
}

/** A glass window pane in a gold frame with a looped handle, a magnifying glass. */
export function glass(): Rgba {
  const c = canvas();
  c.fill(turn(capsule(32, 32, 42, 43, 2.4, 3), 24, 24, 0), WOOD, { bevel: 2 });
  c.fill(minus(ellipse(20, 20, 16, 16), ellipse(20, 20, 12.4, 12.4)), GOLD, { bevel: 2.4, gain: 1.15 });
  c.flat(ellipse(20, 20, 12.4, 12.4), SKY[4]!, 120);
  c.flat(ellipse(14, 14, 5.4, 1.8, -0.8), WHITE, 220);
  c.flat(ellipse(26, 27, 2, 0.8, -0.8), WHITE, 150);
  c.fill(capsule(30, 30, 33.6, 34, 3, 3), GOLD, { bevel: 1.6 });
  return done(c);
}

/** A glass prism: a white beam goes in at the left and comes out as a rainbow on the right. */
export function prism(): Rgba {
  const c = canvas();
  c.fill(
    polygon([
      [14, 40],
      [34, 40],
      [24, 10],
    ]),
    SKY,
    { bevel: 3.4, gain: 0.9 },
  );
  c.flat(
    polygon([
      [19, 36],
      [26, 36],
      [24, 22],
    ]),
    WHITE,
    80,
  );
  c.line(1, 31, 19.6, 27.6, WHITE, 2.2);
  const bands = [RED[3]!, ORANGE[3]!, YELLOW[3]!, GREEN[3]!, BLUE[3]!, PURPLE[3]!];
  for (const [i, col] of bands.entries()) c.line(28.4, 26.4, 47, 14 + i * 5.4, col, 2.2);
  c.flat(ellipse(21, 24, 1, 6, -0.34), WHITE, 210);
  return done(c);
}

/** A wizard: a tall purple hat with gold stars, a kind face, round eyes and a long white beard. */
export function wizard(): Rgba {
  const c = canvas();
  c.fill(
    polygon([
      [24, 36],
      [8, 44],
      [40, 44],
    ]),
    SNOW,
    { bevel: 4 },
  );
  c.fill(
    polygon([
      [14, 25],
      [34, 25],
      [36, 38],
      [24, 46],
      [12, 38],
    ]),
    SNOW,
    { bevel: 5, gain: 1.1 },
  );
  c.fill(ellipse(24, 29, 8.4, 7.4), PEACH, { bevel: 4, gain: 1.1 });
  c.fill(ellipse(24, 33, 5, 2.2), SNOW, { bevel: 1.6 });
  c.fill(ellipse(24, 31, 2, 1.7), PINK, { bevel: 1.2 });
  for (const x of [20.4, 27.6]) {
    c.flat(ellipse(x, 27, 1.7, 1.7), WHITE);
    c.flat(ellipse(x, 27.2, 0.9, 0.9), NIGHT[0]!);
  }
  c.fill(
    polygon([
      [26, 1.4],
      [31, 12],
      [36, 24],
      [12, 24],
      [17, 12],
    ]),
    PURPLE,
    { bevel: 4.4, gain: 1.15 },
  );
  c.fill(ellipse(24, 24.6, 17, 3.6), PURPLE, { bevel: 2.6 });
  c.flat(rect(14.6, 21, 33.4, 23), GOLD[3]!);
  c.fill(glint(23, 13.6, 3.2), YELLOW, { bevel: 1 });
  c.fill(glint(27.4, 6.8, 1.8), YELLOW, { bevel: 1 });
  return done(c);
}

/** A witch: green face with a hooked nose, orange hair, and a black hat with a purple band. */
export function witch(): Rgba {
  const c = canvas();
  for (const x of [11.6, 36.4]) c.fill(ellipse(x, 33, 4.6, 11), ORANGE, { bevel: 3.6 });
  c.fill(ellipse(24, 31, 11.4, 11.6), GREEN, { bevel: 6, gain: 1.1 });
  c.fill(
    polygon([
      [24, 28],
      [28.6, 34.6],
      [24.4, 34.4],
    ]),
    GREEN,
    { bevel: 1.6 },
  );
  c.flat(ellipse(26.8, 33.6, 0.8, 0.8), ROSE[1]!);
  for (const x of [19.8, 28.2]) {
    c.flat(ellipse(x, 27.6, 2.4, 2.1), YELLOW[4]!);
    c.flat(ellipse(x, 27.8, 0.9, 1.4), NIGHT[0]!);
  }
  c.flat(both(ellipse(24, 38, 5.6, 2.8), rect(0, 38, 48, 48)), ROSE[1]!);
  c.fill(ellipse(24, 20.6, 21, 3.6), ONYX, { bevel: 2.6 });
  c.fill(
    polygon([
      [17, 20],
      [31, 20],
      [27.6, 5],
      [29.8, 1],
      [24, 4.4],
      [20.6, 7],
    ]),
    ONYX,
    { bevel: 3.4, gain: 1.1 },
  );
  c.flat(rect(17.2, 15.6, 30.8, 18.8), PURPLE[3]!);
  c.fill(rect(22, 15, 26, 19.4), GOLD, { bevel: 1 });
  return done(c);
}

/** A magician's tall black hat with a red band, a white rabbit's ears sticking out and a star. */
export function magic(): Rgba {
  const c = canvas();
  for (const [x, a] of [
    [19, -0.2],
    [28, 0.22],
  ] as const) {
    c.fill(turn(ellipse(x, 11, 3.8, 11, 0), x, 24, a), SNOW, { bevel: 3, gain: 1.1 });
    c.flat(turn(ellipse(x, 11.4, 1.6, 7.6, 0), x, 24, a), PINK[4]!);
  }
  c.fill(rect(10.4, 22, 37.6, 40), ONYX, { bevel: 4.4, gain: 1.15 });
  c.fill(ellipse(24, 40, 22, 4.4), ONYX, { bevel: 3 });
  c.fill(ellipse(24, 22, 13.6, 3.2), ONYX, { bevel: 2 });
  c.flat(ellipse(24, 22, 11, 1.8), NIGHT[0]!);
  c.fill(rect(10.6, 31.4, 37.4, 36.4), RED, { bevel: 2 });
  c.flat(ellipse(15, 29, 1, 5, 0.1), WHITE, 120);
  c.fill(glint(38, 8, 4.6), YELLOW, { bevel: 1.4 });
  c.fill(glint(8, 14, 3), PINK, { bevel: 1 });
  return done(c);
}

/** A round stone carved with a glowing blue rune, a bar with two arms. */
export function rune(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 26, 19, 21), STONE, { bevel: 8, gain: 1.1 });
  c.fill(ellipse(24, 26, 15.4, 17.4), IRON, { bevel: 6, gain: 0.8 });
  for (const [x0, y0, x1, y1] of [
    [24, 10, 24, 42],
    [24, 18, 33, 12],
    [24, 26, 34, 20],
    [24, 34, 14, 28],
  ] as const) {
    c.line(x0, y0, x1, y1, SKY[3]!, 3.8);
    c.line(x0, y0, x1, y1, SNOW[5]!, 1.4);
  }
  c.flat(ellipse(14, 14, 3.4, 1.4, -0.8), WHITE, 150);
  return done(c);
}

/** A cape in red with folds down it, a gold collar and a clasp at the throat. */
export function cape(): Rgba {
  const c = canvas();
  c.fill(
    polygon([
      [14, 8],
      [34, 8],
      [45, 44],
      [28, 41],
      [24, 45],
      [20, 41],
      [3, 44],
    ]),
    RED,
    { bevel: 5.4, gain: 1.15 },
  );
  for (const [x0, x1] of [
    [20, 14],
    [24, 24],
    [28, 34],
  ] as const)
    c.line(x0, 12, x1, 42, RED[0]!, 1.4);
  c.fill(ellipse(24, 9, 11.4, 4.2), AMBER, { bevel: 2.4 });
  c.fill(ellipse(24, 9, 8.4, 2.4), RED, { bevel: 1.4 });
  c.fill(ellipse(24, 13.4, 3.2, 3.2), GOLD, { bevel: 2, gain: 1.2 });
  c.flat(ellipse(20, 20, 1, 6, 0.12), WHITE, 100);
  return done(c);
}

/** A tall pointed hat in purple with a wide brim, a gold buckle and a few stars. */
export function hat(): Rgba {
  const c = canvas();
  c.fill(
    polygon([
      [23, 2],
      [28, 14],
      [34, 33],
      [14, 33],
      [19, 14],
    ]),
    PURPLE,
    { bevel: 5, gain: 1.15 },
  );
  c.fill(ellipse(24, 35, 22, 6), PURPLE, { bevel: 3.4, gain: 1.05 });
  c.flat(ellipse(24, 35, 15, 3.2), NIGHT[1]!);
  c.fill(rect(15.4, 28, 32.6, 33), GOLD, { bevel: 1.6 });
  c.flat(rect(22, 29, 26, 32), NIGHT[0]!);
  c.fill(glint(22, 18, 3.2), YELLOW, { bevel: 1 });
  c.fill(glint(28, 9, 2), YELLOW, { bevel: 1 });
  c.fill(glint(14, 38, 2.4), LILAC, { bevel: 1 });
  c.flat(ellipse(18, 22, 1, 6, 0.26), WHITE, 120);
  return done(c);
}

/** An owl face on: round amber eyes, ear tufts, a small orange beak and a speckled breast. */
export function owl(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 28, 15, 17), BROWN, { bevel: 8, gain: 1.1 });
  c.fill(
    polygon([
      [10, 14],
      [17, 10],
      [15, 20],
    ]),
    BROWN,
    { bevel: 1.6 },
  );
  c.fill(
    polygon([
      [38, 14],
      [31, 10],
      [33, 20],
    ]),
    BROWN,
    { bevel: 1.6 },
  );
  c.fill(ellipse(24, 35, 8.8, 9.6), CREAM, { bevel: 4 });
  for (const [x, y] of [
    [21, 33],
    [27, 34],
    [24, 38],
    [20.6, 39],
    [27.4, 39.6],
  ] as const)
    c.flat(ellipse(x, y, 0.9, 1.4), BROWN[2]!);
  for (const x of [17, 31]) {
    c.fill(ellipse(x, 22, 6.6, 6.6), CREAM, { bevel: 3.6 });
    c.flat(ellipse(x, 22, 4.2, 4.2), AMBER[3]!);
    c.flat(ellipse(x, 22, 2.2, 2.2), INK[0]!);
    c.flat(ellipse(x - 0.8, 21, 0.8, 0.8), WHITE);
  }
  c.fill(
    polygon([
      [24, 25],
      [27, 29.6],
      [24, 31.6],
      [21, 29.6],
    ]),
    ORANGE,
    { bevel: 1.4 },
  );
  c.fill(ellipse(8.6, 30, 3.6, 10, 0.12), BROWN, { bevel: 2.4 });
  c.fill(ellipse(39.4, 30, 3.6, 10, -0.12), BROWN, { bevel: 2.4 });
  c.flat(rect(19, 43.6, 22, 46), ORANGE[3]!);
  c.flat(rect(26, 43.6, 29, 46), ORANGE[3]!);
  return done(c);
}

/** A witch's broom: a long wooden handle and a fan of straw tied on with a band. */
export function broom(): Rgba {
  const c = canvas();
  const lean = (shape: ReturnType<typeof rect>) => turn(shape, 24, 24, 0.78);
  c.fill(lean(capsule(24, 2, 24, 30, 1.7)), WOOD, { bevel: 1.6 });
  c.fill(
    lean(
      polygon([
        [19, 29],
        [29, 29],
        [35, 46],
        [13, 46],
      ]),
    ),
    AMBER,
    { bevel: 4, gain: 1.1 },
  );
  c.fill(lean(rect(18.6, 28.4, 29.4, 33)), DARKWOOD, { bevel: 1.4 });
  for (const x of [17.4, 20.8, 24, 27.2, 30.6]) c.flat(lean(capsule(x, 37, 24 + (x - 24) * 1.5, 46, 0.5)), WOOD[2]!);
  c.flat(lean(ellipse(21, 40, 1, 4, 0)), WHITE, 120);
  return done(c);
}

export const MAGIC = {
  charm,
  scroll,
  quill,
  ink,
  star,
  sun,
  planet,
  comet,
  glow,
  lamp,
  torch,
  spark,
  brew,
  spoon,
  steam,
  water,
  drop,
  stream,
  glass,
  prism,
  wizard,
  witch,
  magic,
  rune,
  cape,
  hat,
  owl,
  broom,
} as const;
