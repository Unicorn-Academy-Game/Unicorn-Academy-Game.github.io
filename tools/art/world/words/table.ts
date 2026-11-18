import type { Rgba } from '../../core/image';
import { both, ellipse, minus, type Pt, polygon, ring, union } from '../../fx/kit';
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
  IRON,
  LEAF,
  ORANGE,
  PINK,
  RED,
  ROSE,
  rect,
  SKY,
  SNOW,
  WHITE,
  YELLOW,
} from './shared';

const SILVER = tone('#d5d9ea', 265, 215);
const LEMON = tone('#fbe03a', 40, 85);
const CRUST = tone('#d89b4c', 345, 55);
const CHEESE = tone('#ffcf4a', 20, 80);
const JAM = tone('#c4264a', 330, 45);
const CHOC = tone('#6b3f2a', 320, 45);

/** A dinner plate seen from above and in front: white china with a blue band and a gold edge. */
export function plate(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 28, 21, 15), SNOW, { bevel: 4.4 });
  c.flat(ring(24, 28, 17, 1.8, 15 / 21), GOLD[4]!);
  c.fill(ellipse(24, 28, 15, 10.4), SNOW, { bevel: 3 });
  c.flat(ring(24, 28, 12.6, 1.6, 10.4 / 15), BLUE[3]!);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    c.fill(ellipse(24 + Math.cos(a) * 17.8, 28 + Math.sin(a) * 12.4, 1.4, 1.1), BLUE, { bevel: 0.8 });
  }
  c.flat(ellipse(14, 22, 3.6, 1.2, -0.5), WHITE, 210);
  return done(c);
}

/** A silver fork: four tines, a curved neck and a long handle. */
export function fork(): Rgba {
  const c = canvas();
  for (const x of [17.6, 21.6, 25.6, 29.6]) c.fill(rect(x - 1, 2, x + 1, 17), SILVER, { bevel: 1 });
  c.fill(ellipse(23.6, 17, 7.6, 4), SILVER, { bevel: 2 });
  c.fill(
    polygon([
      [20, 17],
      [27.2, 17],
      [25.4, 25],
      [21.8, 25],
    ]),
    SILVER,
    { bevel: 1.6 },
  );
  c.fill(
    polygon([
      [21.6, 24],
      [25.6, 24],
      [26.6, 45],
      [20.6, 45],
    ]),
    SILVER,
    { bevel: 1.8 },
  );
  c.flat(rect(22.2, 26, 23, 44), WHITE, 160);
  return done(c);
}

/** A table knife: a long rounded blade with a bolster and a handle. */
export function knife(): Rgba {
  const c = canvas();
  c.fill(
    polygon([
      [19, 3],
      [26, 3],
      [29, 8],
      [28, 28],
      [19, 28],
    ]),
    SILVER,
    { bevel: 2.4 },
  );
  c.flat(rect(20.4, 6, 21.4, 26), WHITE, 190);
  c.fill(rect(18.4, 27, 28.6, 30.6), GOLD, { bevel: 1.4 });
  c.fill(rect(19.6, 30, 27.4, 45), DARKWOOD, { bevel: 2.2 });
  for (const y of [34, 39]) c.fill(ellipse(23.5, y, 1.1, 1.1), GOLD, { bevel: 0.8 });
  return done(c);
}

/** An empty china bowl, blue with a white rim and a pattern of leaves. */
export function bowl(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 15, 20, 6.6), SNOW, { bevel: 3 });
  c.fill(
    both(ellipse(24, 15, 20, 28), (_x, y) => y > 15),
    BLUE,
    { bevel: 5 },
  );
  c.fill(ellipse(24, 15, 20, 6.6), SNOW, { bevel: 2, gain: 0.8 });
  c.fill(ellipse(24, 16, 16.8, 4.4), SKY, { bevel: 2 });
  c.fill(rect(15, 40, 33, 44), SNOW, { bevel: 1.6 });
  for (const [x, y] of [
    [14, 24],
    [24, 30],
    [34, 24],
  ] as const) {
    c.fill(ellipse(x, y, 2.6, 1.4, -0.5), SKY, { bevel: 1 });
    c.fill(ellipse(x + 2.4, y - 1, 2.6, 1.4, 0.5), SKY, { bevel: 1 });
  }
  return done(c);
}

/** A bowl of hot soup, orange and thick, with a spoon in it and steam rising. */
export function soup(): Rgba {
  const c = canvas();
  c.fill(
    both(ellipse(24, 24, 21, 20), (_x, y) => y > 24),
    SNOW,
    { bevel: 5 },
  );
  c.fill(ellipse(24, 24, 21, 6.6), SNOW, { bevel: 2.6 });
  c.fill(ellipse(24, 24.6, 17.6, 4.4), ORANGE, { bevel: 2.4 });
  c.flat(ellipse(18, 24, 2, 1, -0.2), AMBER[5]!);
  c.flat(ellipse(28, 25.6, 2.4, 1, 0.2), AMBER[5]!);
  c.fill(rect(15, 41, 33, 45), SNOW, { bevel: 1.6 });
  c.line(30, 24, 40, 9, IRON[3]!, 1.6);
  c.fill(ellipse(41.6, 6.6, 3.6, 2.6, -0.9), SILVER, { bevel: 1.6 });
  for (const [x, dx] of [
    [13, 2.6],
    [22, -2.6],
  ] as const) {
    const wisp: Pt[] = Array.from({ length: 8 }, (_, i) => [x + Math.sin(i * 0.9) * dx, 17 - i * 1.7] as Pt);
    for (let i = 0; i + 1 < wisp.length; i++)
      c.line(wisp[i]![0], wisp[i]![1], wisp[i + 1]![0], wisp[i + 1]![1], SKY[4]!, 1.5);
  }
  return done(c);
}

/** A crusty loaf of bread with three slashes across the top, and flour dusted on it. */
export function bread(): Rgba {
  const c = canvas();
  c.fill(union(ellipse(24, 28, 21, 13), ellipse(24, 22, 18, 11)), CRUST, { bevel: 7, gain: 1.1 });
  for (const x of [14, 23, 32])
    c.fill(
      polygon([
        [x - 2, 29],
        [x + 3.6, 17],
        [x + 6, 19.4],
        [x + 1.6, 31],
      ]),
      CREAM,
      { bevel: 1.2 },
    );
  c.flat(ellipse(16, 18, 4, 1.4, -0.5), CREAM[4]!, 190);
  for (const [x, y] of [
    [10, 31],
    [38, 28],
    [27, 36],
  ] as const)
    c.flat(ellipse(x, y, 1, 1), CREAM[5]!);
  return done(c);
}

/** A wedge of cheese with holes, its rind showing at the back. */
export function cheese(): Rgba {
  const c = canvas();
  c.fill(
    polygon([
      [4, 24],
      [38, 10],
      [44, 14],
      [44, 34],
      [4, 34],
    ]),
    CHEESE,
    { bevel: 3.4 },
  );
  c.fill(
    polygon([
      [4, 24],
      [38, 10],
      [44, 14],
      [10, 28],
    ]),
    YELLOW,
    { bevel: 2, gain: 1.1 },
  );
  c.flat(
    polygon([
      [40, 12],
      [44, 14],
      [44, 34],
      [40, 33],
    ]),
    AMBER[3]!,
  );
  for (const [x, y, r] of [
    [14, 30, 2.6],
    [26, 32, 2],
    [33, 25, 2.8],
    [9, 29, 1.2],
    [38, 31, 1.6],
  ] as const)
    c.flat(ellipse(x, y, r, r * 0.8), AMBER[1]!);
  for (const [x, y, r] of [
    [24, 23, 2],
    [32, 18, 1.4],
  ] as const)
    c.flat(ellipse(x, y, r, r * 0.6), AMBER[2]!);
  return done(c);
}

/** A pie in a tin, with a lattice crust, a golden edge and a wisp of steam. */
export function pie(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 30, 21, 11), IRON, { bevel: 3 });
  c.fill(ellipse(24, 28, 19, 10), CRUST, { bevel: 4 });
  c.fill(ellipse(24, 27, 15.4, 7.6), JAM, { bevel: 3 });
  for (const k of [-10, -5, 0, 5, 10]) {
    c.flat(
      both(ellipse(24, 27, 15.4, 7.6), (x, y) => Math.abs(x - 24 - k - (y - 27) * 0.9) < 1.3),
      CRUST[4]!,
    );
    c.flat(
      both(ellipse(24, 27, 15.4, 7.6), (x, y) => Math.abs(x - 24 - k + (y - 27) * 0.9) < 1.3),
      CRUST[3]!,
    );
  }
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    c.fill(ellipse(24 + Math.cos(a) * 17.6, 28 + Math.sin(a) * 8.8, 2, 1.6), CRUST, { bevel: 1.2 });
  }
  const wisp: Pt[] = Array.from({ length: 9 }, (_, i) => [24 + Math.sin(i * 0.9) * 3, 17 - i * 1.7] as Pt);
  for (let i = 0; i + 1 < wisp.length; i++)
    c.line(wisp[i]![0], wisp[i]![1], wisp[i + 1]![0], wisp[i + 1]![1], SKY[4]!, 1.5);
  return done(c);
}

/** A round teapot with a curved spout, a loop handle and a lid with a knob, in rose with white flowers. */
export function teapot(): Rgba {
  const c = canvas();
  c.fill(ring(38, 28, 7.4, 3.2, 1.2), ROSE, { bevel: 2 });
  c.fill(
    polygon([
      [10, 22],
      [4, 12],
      [8, 10],
      [15, 20],
    ]),
    ROSE,
    { bevel: 2 },
  );
  c.fill(ellipse(5.6, 11.4, 2.2, 1.8), ROSE, { bevel: 1.4 });
  c.fill(ellipse(23, 30, 16.4, 13.4), ROSE, { bevel: 9, gain: 1.1 });
  c.fill(rect(12, 41, 34, 45), ROSE, { bevel: 1.6 });
  c.fill(ellipse(23, 17.4, 9, 3.4), GOLD, { bevel: 2 });
  c.fill(ellipse(23, 13.4, 6, 4.6), ROSE, { bevel: 3 });
  c.fill(ellipse(23, 8.6, 2.2, 2.2), SNOW, { bevel: 1.6 });
  for (const [x, y] of [
    [16, 29],
    [24, 34],
    [30, 28],
  ] as const) {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      c.flat(ellipse(x + Math.cos(a) * 1.8, y + Math.sin(a) * 1.8, 1.1, 1.1), SNOW[4]!);
    }
    c.flat(ellipse(x, y, 0.9, 0.9), GOLD[4]!);
  }
  return done(c);
}

/** A teacup on its saucer, steaming, with a gold rim and a curl of a handle. */
export function teacup(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 38, 21, 6.4), SNOW, { bevel: 2.6 });
  c.fill(ring(37.6, 25, 5.6, 2.8, 1.1), SNOW, { bevel: 1.6 });
  c.fill(
    both(ellipse(23, 17, 15, 21), (_x, y) => y > 17),
    SNOW,
    { bevel: 5 },
  );
  c.fill(ellipse(23, 17, 15, 4.4), SNOW, { bevel: 2 });
  c.fill(ellipse(23, 17.6, 12.6, 3), BROWN, { bevel: 2 });
  c.flat(ring(23, 17, 14.4, 1.2, 4.4 / 15), GOLD[4]!);
  c.flat(rect(9, 26, 37, 27.6), PINK[3]!);
  for (const x of [14, 23, 32]) c.fill(ellipse(x, 31, 1.6, 1.6), PINK, { bevel: 1 });
  for (const [x, dx] of [
    [18, 2.6],
    [27, -2.6],
  ] as const) {
    const wisp: Pt[] = Array.from({ length: 8 }, (_, i) => [x + Math.sin(i * 0.9) * dx, 11 - i * 1.4] as Pt);
    for (let i = 0; i + 1 < wisp.length; i++)
      c.line(wisp[i]![0], wisp[i]![1], wisp[i + 1]![0], wisp[i + 1]![1], SKY[4]!, 1.4);
  }
  return done(c);
}

/** A saucer with a teaspoon lying on it and a ring where the cup stood. */
export function saucer(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 28, 21, 13), SNOW, { bevel: 4.4 });
  c.fill(ellipse(24, 28, 15.6, 8.8), SNOW, { bevel: 2.6 });
  c.flat(ring(24, 28, 15.6, 1.4, 8.8 / 15.6), PINK[3]!);
  c.flat(ring(24, 28, 21, 1.4, 13 / 21), GOLD[4]!);
  c.flat(ring(24, 28, 9, 1, 0.5), SKY[2]!);
  c.line(14, 31, 36, 24, SILVER[3]!, 1.6);
  c.fill(ellipse(38.6, 23.2, 3.4, 2.2, -0.3), SILVER, { bevel: 1.6 });
  c.flat(ellipse(14, 22, 3.6, 1.2, -0.4), WHITE, 190);
  return done(c);
}

/** Sugar: a stack of white cubes with glitter on them, and tongs lying by. */
export function sugar(): Rgba {
  const c = canvas();
  const cube = (x: number, y: number, s: number) => {
    c.fill(rect(x, y, x + s, y + s), SNOW, { bevel: 2.4 });
    c.flat(
      polygon([
        [x, y],
        [x + s, y],
        [x + s - 2, y + 2],
        [x + 2, y + 2],
      ]),
      WHITE,
      255,
    );
    c.flat(rect(x + s - 1.4, y + 1, x + s, y + s), SKY[2]!);
  };
  cube(5, 28, 14);
  cube(21, 28, 14);
  cube(13, 14, 14);
  cube(34, 34, 9);
  for (const [x, y] of [
    [9, 33],
    [28, 32],
    [19, 20],
    [38, 38],
  ] as const) {
    c.flat(ellipse(x, y, 0.9, 0.9), SKY[3]!);
  }
  for (const [x, y] of [
    [40, 12],
    [8, 10],
  ] as const) {
    c.flat(rect(x - 0.5, y - 3, x + 0.5, y + 3), WHITE);
    c.flat(rect(x - 3, y - 0.5, x + 3, y + 0.5), WHITE);
  }
  return done(c);
}

/** A lemon with a green leaf, and a slice cut from it beside it. */
export function lemon(): Rgba {
  const c = canvas();
  c.fill(union(ellipse(18, 27, 15, 11), ellipse(4.6, 27, 2.6, 2.6), ellipse(31.4, 27, 2.6, 2.6)), LEMON, {
    bevel: 7,
    gain: 1.15,
  });
  c.fill(ellipse(11, 12, 5.6, 3, -0.6), LEAF, { bevel: 2 });
  c.line(15, 17, 11, 13, DARKWOOD[3]!, 1);
  c.fill(ellipse(35, 36, 10, 10), LEMON, { bevel: 2.4 });
  c.fill(ellipse(35, 36, 8, 8), YELLOW, { bevel: 2 });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    c.line(35, 36, 35 + Math.cos(a) * 7, 36 + Math.sin(a) * 7, SNOW[4]!, 0.9);
  }
  c.flat(ellipse(35, 36, 1.4, 1.4), SNOW[4]!);
  c.flat(ellipse(11, 21, 3, 1.4, -0.6), WHITE, 190);
  return done(c);
}

/** A scone split open with a spoon of jam and a swirl of cream on it. */
export function scone(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 34, 20, 8), CRUST, { bevel: 4 });
  c.fill(ellipse(24, 28, 20, 8.4), CREAM, { bevel: 3 });
  c.fill(ellipse(24, 25.6, 19, 9), CRUST, { bevel: 5, gain: 1.1 });
  c.fill(ellipse(24, 22, 11, 5.4), JAM, { bevel: 3.6 });
  c.fill(ellipse(24, 15.6, 6.6, 4.2), SNOW, { bevel: 3.4 });
  c.fill(ellipse(24, 11, 4.2, 3, 0), SNOW, { bevel: 2.6 });
  c.fill(ellipse(24, 7.6, 2, 2), SNOW, { bevel: 1.4 });
  c.flat(ellipse(14, 27, 2, 0.9, -0.3), CREAM[5]!);
  return done(c);
}

/** A jar of jam with a red top and a gingham cloth tied over the lid. */
export function jam(): Rgba {
  const c = canvas();
  c.fill(rect(9, 14, 39, 43), SKY, { bevel: 3.6 });
  c.fill(rect(11, 20, 37, 42), JAM, { bevel: 4 });
  c.fill(rect(15, 26, 33, 38), CREAM, { bevel: 2 });
  c.fill(starFruit(24, 32), RED, { bevel: 1.6 });
  c.fill(
    polygon([
      [6, 12],
      [42, 12],
      [38, 8],
      [10, 8],
    ]),
    RED,
    { bevel: 1.6 },
  );
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 2; j++)
      if ((i + j) % 2 === 0) c.flat(rect(8 + i * 5.4, 8.4 + j * 2, 13.4 + i * 5.4, 10.4 + j * 2), SNOW[4]!);
  c.fill(rect(9, 14, 39, 17), RED, { bevel: 1.2 });
  c.line(8, 15.4, 4, 21, RED[2]!, 1.4);
  c.line(40, 15.4, 44, 21, RED[2]!, 1.4);
  c.flat(rect(12, 22, 13.6, 36), WHITE, 120);
  return done(c);
}

/** A strawberry-shaped patch for the label of a jam jar, as a shape. */
function starFruit(cx: number, cy: number) {
  return polygon([
    [cx - 4, cy - 3],
    [cx + 4, cy - 3],
    [cx + 2.6, cy + 3],
    [cx, cy + 5],
    [cx - 2.6, cy + 3],
  ]);
}

/** A big round cookie with chocolate chips and a bite out of the edge. */
export function cookie(): Rgba {
  const c = canvas();
  c.fill(minus(ellipse(24, 24, 20, 20), ellipse(40, 12, 6.4, 6.4)), CRUST, { bevel: 8, gain: 1.1 });
  c.fill(minus(ellipse(24, 24, 15, 15), ellipse(40, 12, 8.6, 8.6)), AMBER, { bevel: 5, gain: 0.9 });
  for (const [x, y, r] of [
    [16, 16, 3.4],
    [27, 20, 3],
    [14, 29, 3],
    [24, 32, 3.6],
    [33, 30, 3],
    [21, 24, 2.2],
    [31, 38, 2.4],
  ] as const)
    c.fill(ellipse(x, y, r, r * 0.8, 0.5), CHOC, { bevel: 1.8 });
  c.flat(ellipse(13, 21, 2, 0.9, -0.8), CREAM[4]!, 170);
  return done(c);
}

export const TABLE = {
  plate,
  fork,
  knife,
  bowl,
  soup,
  bread,
  cheese,
  pie,
  teapot,
  teacup,
  saucer,
  sugar,
  lemon,
  scone,
  jam,
  cookie,
};
