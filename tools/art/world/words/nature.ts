import type { Rgba } from '../../core/image';
import { both, capsule, ellipse, heart, minus, type Pt, polygon, starPoints, union } from '../../fx/kit';
import {
  AMBER,
  BLUE,
  CREAM,
  canvas,
  DARKWOOD,
  done,
  GOLD,
  GREEN,
  LEAF,
  LILAC,
  ORANGE,
  PEACH,
  PINK,
  PURPLE,
  ROSE,
  rect,
  SKY,
  SLATE,
  SNOW,
  STONE,
  turn,
  WHITE,
  WOOD,
  YELLOW,
} from './shared';

/** A nest of twigs with three pale eggs in it, which is where a bird lives. */
export function nest(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 30, 19.5, 11.5), WOOD, { bevel: 5 });
  c.flat(ellipse(24, 27, 15.5, 6.6), DARKWOOD[1]!);
  for (const [x, y] of [
    [17.5, 25],
    [25, 22.4],
    [31, 25.6],
  ] as const) {
    c.fill(ellipse(x, y, 5, 6.2), SKY, { bevel: 4, gain: 1.1 });
    c.flat(ellipse(x - 1.6, y - 2, 0.9, 1.5, -0.4), WHITE);
    c.flat(ellipse(x + 1.4, y + 1.2, 0.7, 0.6), BLUE[2]!);
  }
  c.fill(both(ellipse(24, 30, 19.5, 11.5), rect(0, 28.5, 48, 48)), WOOD, { bevel: 4, gain: 0.8 });
  for (const [x0, y0, x1, y1] of [
    [7, 33, 18, 30],
    [14, 37, 27, 35],
    [24, 31, 37, 35],
    [31, 36.5, 41, 31],
    [10, 29.5, 19, 33],
    [20, 40, 33, 38.5],
  ] as const)
    c.line(x0, y0, x1, y1, CREAM[3]!, 1.5);
  for (const [x0, y0, x1, y1] of [
    [5, 28, 1.5, 24.5],
    [43, 27, 46.5, 23],
    [36, 38, 40, 42],
  ] as const)
    c.line(x0, y0, x1, y1, WOOD[3]!, 1.6);
  return done(c);
}

/** One white egg with brown freckles. */
export function egg(): Rgba {
  const c = canvas();
  c.fill(union(ellipse(24, 29, 12.6, 13.4), ellipse(24, 19.4, 8.8, 11.6)), CREAM, { bevel: 8, gain: 1.2 });
  for (const [x, y, r] of [
    [28, 22, 1.1],
    [20, 30, 1],
    [29, 32, 1.2],
    [24, 37, 0.9],
    [20.6, 23, 0.8],
    [25, 28, 0.8],
    [31, 27.6, 0.7],
    [23, 15, 0.7],
  ] as const)
    c.flat(ellipse(x, y, r, r * 0.8), PEACH[1]!);
  c.flat(ellipse(18.4, 21, 1.6, 4, -0.3), WHITE, 215);
  c.flat(ellipse(16.4, 29, 0.9, 1.6, -0.2), WHITE, 170);
  return done(c);
}

/** A long blue feather that curls a little, with a quill. */
export function feather(): Rgba {
  const c = canvas();
  const vane = union(ellipse(27, 22, 8.4, 19.6, 0.42), ellipse(24, 34, 6, 9, 0.4));
  c.fill(minus(vane, ellipse(35.4, 6.4, 3.6, 3.2, 0.4)), BLUE, { bevel: 6, gain: 1.1 });
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const x = 30 - t * 11 + 1;
    const y = 10 + t * 24;
    c.line(x, y, x + 6.4 - t * 2.4, y - 3.4, BLUE[1]!, 1);
    c.line(x - 0.6, y + 1, x - 6.4 + t * 2.4, y - 0.6, BLUE[4]!, 1);
  }
  c.line(11, 43, 33, 6.4, SKY[5]!, 1.8);
  c.line(10.4, 44.4, 14, 38.6, CREAM[4]!, 1.8);
  return done(c);
}

/**
 * A white wing raised up and to the right: the long feathers fanned out at the top, and shorter
 * ones in rows beneath.
 */
export function wing(): Rgba {
  const c = canvas();
  const root: Pt = [9, 41];
  const feather = (len: number, width: number, angle: number, tone: typeof SNOW): void => {
    const a = -angle;
    const cx = root[0] + Math.cos(a) * (len / 2);
    const cy = root[1] + Math.sin(a) * (len / 2);
    c.fill(ellipse(cx, cy, len / 2, width, a), tone, { bevel: 3.4, gain: 1.15 });
    c.line(
      root[0] + Math.cos(a) * (len * 0.3),
      root[1] + Math.sin(a) * (len * 0.3),
      root[0] + Math.cos(a) * (len - 4),
      root[1] + Math.sin(a) * (len - 4),
      SLATE[4]!,
      0.9,
    );
  };
  const deg = Math.PI / 180;
  for (const [len, angle] of [
    [42, 62],
    [43, 50],
    [42, 38],
    [39, 26],
    [34, 15],
  ] as const)
    feather(len, 4.6, angle * deg, SNOW);
  for (const [len, angle] of [
    [30, 72],
    [31, 58],
    [30, 44],
    [27, 31],
    [23, 20],
  ] as const)
    feather(len, 4.4, angle * deg, CREAM);
  for (const [len, angle] of [
    [19, 78],
    [20, 62],
    [19, 46],
    [16, 32],
  ] as const)
    feather(len, 4.2, angle * deg, SNOW);
  c.fill(capsule(8, 42, 14, 24, 4.6, 3.4), SNOW, { bevel: 3 });
  c.flat(ellipse(20, 14, 1.2, 5, -0.9), WHITE, 215);
  return done(c);
}

/** A clover with three leaves, each a heart, and a little stalk. */
export function clover(): Rgba {
  const c = canvas();
  c.line(24, 26, 21, 44, LEAF[2]!, 2.4);
  const leaf = (angle: number): void => {
    c.fill(turn(heart(24, 15.4, 8.6), 24, 25, angle), GREEN, { bevel: 5, gain: 1.15 });
  };
  leaf(Math.PI * 0.66);
  leaf(-Math.PI * 0.66);
  leaf(0);
  for (const angle of [0, Math.PI * 0.66, -Math.PI * 0.66]) {
    const a = angle - Math.PI / 2;
    const x0 = 24 + Math.cos(a) * 5;
    const y0 = 25 + Math.sin(a) * 5;
    const x1 = 24 + Math.cos(a) * 14;
    const y1 = 25 + Math.sin(a) * 14;
    c.line(x0, y0, x1, y1, GREEN[5]!, 1.2);
  }
  return done(c);
}

/** The spiral shell on a snail's back. */
export function shell(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 26, 17.6, 16), ORANGE, { bevel: 9, gain: 1.1 });
  c.fill(ellipse(24, 26, 13.6, 12.4), AMBER, { bevel: 7, gain: 1 });
  let [px, py] = [24, 26];
  for (let i = 1; i <= 120; i++) {
    const t = i * 0.12;
    const r = 0.9 + t * 0.78;
    const x = 24 + Math.cos(t + 2.6) * r;
    const y = 26 + Math.sin(t + 2.6) * r * 0.92;
    if (r < 16) c.line(px, py, x, y, ORANGE[0]!, 1.5);
    [px, py] = [x, y];
  }
  c.flat(ellipse(14.6, 18.6, 1.8, 3.4, -0.9), WHITE, 190);
  return done(c);
}

/** A glass jar of honey with a cloth tied over it, and honeycomb pressed into the glass. */
export function honey(): Rgba {
  const c = canvas();
  c.fill(union(ellipse(24, 30, 15.6, 13), rect(8.4, 19, 39.6, 30)), AMBER, { bevel: 6, gain: 1.15 });
  c.fill(ellipse(24, 15.2, 14, 4.8), PINK, { bevel: 3 });
  c.fill(capsule(10.6, 17, 37.4, 17, 2.4), PINK, { bevel: 2 });
  for (const x of [15, 24, 33]) c.line(x, 12.4, x + (x - 24) * 0.14, 17.4, ROSE[1]!, 1);
  const hex = (cx: number, cy: number, r: number) =>
    polygon(
      Array.from(
        { length: 6 },
        (_, k) =>
          [
            cx + Math.cos((k * Math.PI) / 3 + Math.PI / 6) * r,
            cy + Math.sin((k * Math.PI) / 3 + Math.PI / 6) * r,
          ] as const,
      ),
    );
  for (const [x, y] of [
    [20.4, 29],
    [27.6, 29],
    [24, 35.2],
  ] as const)
    c.flat(minus(hex(x, y, 4.2), hex(x, y, 2.9)), YELLOW[5]!);
  c.flat(ellipse(13.4, 28, 1.6, 6.6, 0.08), WHITE, 190);
  c.fill(capsule(33, 17.6, 33.4, 23.4, 1.7, 2.1), AMBER, { bevel: 1.6 });
  return done(c);
}

/** A beehive of woven straw, in bands, with a door at the bottom. */
export function hive(): Rgba {
  const c = canvas();
  for (const [y, rx, ry] of [
    [37, 17, 7],
    [30.4, 15, 6.4],
    [24, 12.6, 6],
    [18, 10, 5.6],
  ] as const)
    c.fill(ellipse(24, y, rx, ry), AMBER, { bevel: 4.4, gain: 1.15 });
  c.fill(ellipse(24, 11.6, 5, 4), AMBER, { bevel: 3 });
  c.fill(ellipse(24, 40, 18, 4.6), WOOD, { bevel: 3 });
  c.flat(ellipse(24, 35.6, 4.6, 3.4), DARKWOOD[0]!);
  c.flat(ellipse(24, 36.2, 3, 2.2), [20, 12, 26]);
  c.flat(ellipse(17.4, 23.6, 1.4, 2.8, 0.5), WHITE, 190);
  return done(c);
}

/** A round pond with a rim of stones and reeds at the edge. */
export function pond(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 29, 21.4, 13.4), STONE, { bevel: 4, gain: 0.9 });
  for (const [x, y] of [
    [5.6, 29],
    [9, 36],
    [16, 40.4],
    [26, 41.6],
    [35, 39.6],
    [41.6, 33.6],
    [43, 26],
    [37, 19.4],
    [11, 22],
  ] as const)
    c.fill(ellipse(x, y, 4, 2.8), STONE, { bevel: 2 });
  c.fill(ellipse(24, 29, 17, 10), BLUE, { bevel: 6, gain: 1.15 });
  c.flat(ellipse(24, 29, 9.4, 4.8), BLUE[4]!, 160);
  c.flat(ellipse(24, 29, 5.2, 2.2), SKY[4]!, 200);
  c.flat(ellipse(17, 25.6, 4, 1.1), WHITE, 190);
  for (const [x, h] of [
    [8, 14],
    [12, 19],
    [38, 16],
  ] as const) {
    c.line(x, 28, x - 1, 28 - h, LEAF[3]!, 1.6);
    c.fill(ellipse(x - 1, 28 - h - 1.6, 1.7, 3.4), DARKWOOD, { bevel: 1.5 });
  }
  return done(c);
}

/** A pink water lily on its round green pad. */
export function lily(): Rgba {
  const c = canvas();
  c.fill(
    minus(
      ellipse(24, 32, 21, 10.4),
      polygon([
        [24, 32],
        [47, 22],
        [47, 29],
      ]),
    ),
    GREEN,
    { bevel: 4, gain: 1.1 },
  );
  c.line(24, 32, 10, 28, GREEN[4]!, 1);
  c.line(24, 32, 14, 37.4, GREEN[4]!, 1);
  c.line(24, 32, 32, 38.4, GREEN[4]!, 1);
  const petal = (angle: number, len: number, wide: number, tone = PINK): void => {
    const cx = 24 + Math.cos(angle) * len * 0.5;
    const cy = 28 + Math.sin(angle) * len * 0.5;
    c.fill(ellipse(cx, cy, len * 0.5, wide, angle), tone, { bevel: 2.6, gain: 1.1 });
  };
  petal(-2.7, 14, 3.8);
  petal(-0.45, 14, 3.8);
  petal(-2.2, 15, 4);
  petal(-0.95, 15, 4);
  petal(-Math.PI / 2, 16, 4.2, ROSE);
  c.flat(ellipse(24, 26.4, 3, 2.2), YELLOW[4]!);
  c.flat(ellipse(23.4, 25.8, 1.2, 0.9), WHITE);
  return done(c);
}

/** A fin cutting through water, with the waves closing round it. */
export function fin(): Rgba {
  const c = canvas();
  c.fill(
    polygon([
      [12, 40],
      [15, 29],
      [19, 20],
      [25, 12],
      [34, 4],
      [33, 14],
      [35, 24],
      [38, 33],
      [42, 40],
    ]),
    SLATE,
    { bevel: 6, gain: 1.15 },
  );
  c.flat(
    polygon([
      [18, 31],
      [21, 23],
      [26, 16],
      [31, 10],
      [29.6, 18],
      [25, 27],
    ]),
    SKY[5]!,
    150,
  );
  const crests = [
    [5, 37, 6.4],
    [15, 36, 6.6],
    [26, 37, 6.8],
    [37, 36, 6.6],
    [46, 37, 5.4],
  ] as const;
  c.fill(
    union(rect(0, 37, 48, 43), ellipse(24, 43, 24, 4), ...crests.map(([x, y, r]) => ellipse(x, y, r, 3.6))),
    BLUE,
    { bevel: 3.6, gain: 1.1 },
  );
  for (const [x, y, r] of crests) c.flat(ellipse(x - 1, y - 1.6, r * 0.55, 0.9), SKY[5]!, 235);
  for (const [x, y] of [
    [9, 43],
    [22, 44],
    [33, 43],
    [42, 45],
  ] as const)
    c.flat(ellipse(x, y, 3, 0.8), SKY[4]!, 200);
  return done(c);
}

/** A wave that is about to curl over, with foam on its lip. */
export function wave(): Rgba {
  const c = canvas();
  c.fill(minus(ellipse(21, 26, 19.4, 18), ellipse(27.6, 31, 13.6, 13)), BLUE, { bevel: 6, gain: 1.15 });
  c.fill(minus(union(ellipse(24, 40, 22.6, 6.4), rect(5, 33, 43, 40)), rect(0, 0, 48, 32)), BLUE, {
    bevel: 3.6,
    gain: 1.1,
  });
  c.flat(ellipse(22, 38, 15, 1), SKY[5]!);
  c.flat(ellipse(11, 22, 1.8, 7, 0.45), SKY[5]!, 220);
  for (const [x, y, r] of [
    [34, 10.6, 3.2],
    [39, 14.6, 2.6],
    [28.6, 9.4, 2.6],
    [41.6, 21, 2],
  ] as const)
    c.fill(ellipse(x, y, r, r), SNOW, { bevel: 1.6 });
  return done(c);
}

/** A crown of drops thrown up from a splash. */
export function splash(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 38, 20, 5.6), BLUE, { bevel: 3 });
  c.flat(ellipse(24, 38, 13, 3), SKY[4]!);
  const drop = (x: number, y: number, size: number, angle: number): void => {
    const tip = [x + Math.sin(angle) * size * 1.5, y - Math.cos(angle) * size * 1.5] as const;
    c.fill(
      union(
        ellipse(x, y, size, size * 1.1),
        polygon([[x - size * 0.9, y - size * 0.4], [x + size * 0.9, y - size * 0.4], [...tip]]),
      ),
      BLUE,
      { bevel: size * 0.7, gain: 1.2 },
    );
    c.flat(ellipse(x - size * 0.35, y - size * 0.2, size * 0.22, size * 0.45), WHITE, 220);
  };
  drop(24, 24, 5.2, 0);
  drop(14, 27, 3.8, -0.5);
  drop(34, 27, 3.8, 0.5);
  drop(7.6, 33, 2.6, -0.8);
  drop(40.4, 33, 2.6, 0.8);
  drop(19, 12, 2.3, -0.3);
  drop(30, 11, 2.1, 0.3);
  return done(c);
}

/** A big soap bubble and a little one, each with a ring of colours and a glint. */
export function bubble(): Rgba {
  const c = canvas();
  const one = (x: number, y: number, r: number): void => {
    c.flat(ellipse(x, y, r, r), SKY[4]!, 120);
    c.fill(minus(ellipse(x, y, r, r), ellipse(x, y, r - 2.4, r - 2.4)), SKY, { bevel: 1.8, gain: 1.2 });
    c.flat(minus(ellipse(x + 0.6, y + 0.6, r - 1.6, r - 1.6), ellipse(x + 0.6, y + 0.6, r - 3, r - 3)), PINK[4]!, 150);
    c.flat(ellipse(x - r * 0.42, y - r * 0.42, r * 0.2, r * 0.36, -0.7), WHITE);
  };
  one(21, 26, 14.4);
  one(37.4, 12.6, 6);
  one(38.6, 36.6, 3.8);
  return done(c);
}

/** A puddle with the rings of a raindrop in it. */
export function puddle(): Rgba {
  const c = canvas();
  c.fill(union(ellipse(24, 31, 20, 9.6), ellipse(14, 34, 9, 5.4), ellipse(35, 28.6, 10, 6)), BLUE, {
    bevel: 5,
    gain: 1.15,
  });
  c.flat(ellipse(24, 31, 12, 4.6), BLUE[4]!, 170);
  for (const [x, y, rx, ry] of [
    [26, 32, 6.6, 2.7],
    [26, 32, 3.4, 1.4],
  ] as const)
    c.flat(minus(ellipse(x, y, rx, ry), ellipse(x, y, rx - 1.2, ry - 0.5)), SKY[5]!);
  c.flat(ellipse(14, 29.4, 5.4, 1.2), WHITE, 200);
  c.fill(ellipse(26, 14, 2.6, 3.6), SKY, { bevel: 2 });
  c.fill(
    polygon([
      [24.2, 14],
      [27.8, 14],
      [26, 8.4],
    ]),
    SKY,
    { bevel: 1 },
  );
  c.flat(ellipse(25.2, 14.4, 0.6, 1.4), WHITE);
  return done(c);
}

/** A magic wand with a gold star on the end, and a twinkle. */
export function wand(): Rgba {
  const c = canvas();
  c.fill(capsule(9, 41, 29, 20, 2.6, 2.6), PURPLE, { bevel: 2.4, gain: 1.1 });
  c.fill(capsule(13, 37, 17, 33, 3.2, 3.2), GOLD, { bevel: 2 });
  c.fill(polygon(starPoints(31, 16.6, 5, 12.6, 5.6, -Math.PI / 2 + 0.2)), GOLD, { bevel: 4, gain: 1.2 });
  c.flat(polygon(starPoints(31, 16.6, 5, 6.4, 3, -Math.PI / 2 + 0.2)), YELLOW[5]!);
  c.flat(polygon(starPoints(40.4, 32, 4, 5, 1.2, -Math.PI / 2)), PINK[5]!);
  c.flat(polygon(starPoints(8.6, 17, 4, 4, 1, -Math.PI / 2)), LILAC[5]!);
  return done(c);
}

/** A cloud of glitter, with a big sparkle at the middle. */
export function dust(): Rgba {
  const c = canvas();
  c.fill(polygon(starPoints(24, 24, 4, 20, 4.4, -Math.PI / 2)), GOLD, { bevel: 4, gain: 1.2 });
  c.flat(polygon(starPoints(24, 24, 4, 10.6, 2.6, -Math.PI / 2)), YELLOW[5]!);
  c.flat(ellipse(24, 24, 2, 2), WHITE);
  for (const [x, y, r, tone] of [
    [9, 11, 5, PINK],
    [38, 10, 4.4, LILAC],
    [37, 37, 5, PINK],
    [9.4, 36.6, 4, SKY],
  ] as const) {
    c.fill(polygon(starPoints(x, y, 4, r, r * 0.26, -Math.PI / 2)), tone, { bevel: 1.6 });
  }
  for (const [x, y] of [
    [17, 17],
    [31, 18],
    [31, 31],
    [17, 31],
    [24, 6],
    [42, 24],
    [24, 42],
    [6, 24],
    [13, 5],
    [44, 18],
    [3, 36],
    [26, 44],
  ] as const)
    c.flat(ellipse(x, y, 1, 1), x % 2 ? YELLOW[5]! : WHITE);
  return done(c);
}

/** A round flask of a bubbling potion, with a cork. */
export function potion(): Rgba {
  const c = canvas();
  c.fill(union(ellipse(24, 33, 14, 12.4), rect(19.6, 12, 28.4, 24)), PURPLE, { bevel: 6, gain: 1.15 });
  c.flat(both(ellipse(24, 33, 14, 12.4), rect(0, 28, 48, 48)), PINK[3]!);
  c.flat(minus(both(ellipse(24, 33, 14, 12.4), rect(0, 28, 48, 48)), ellipse(24, 29.6, 16, 3.4)), PINK[2]!);
  c.flat(ellipse(24, 28.6, 12.6, 1.5), PINK[5]!);
  c.fill(capsule(17.4, 12.4, 30.6, 12.4, 2.4), CREAM, { bevel: 2 });
  c.fill(rect(20.4, 4.6, 27.6, 12), WOOD, { bevel: 2.4 });
  for (const [x, y, r] of [
    [20.4, 33.4, 2.4],
    [28, 36.4, 1.8],
    [25.4, 31, 1.2],
    [17.6, 38, 1.2],
  ] as const)
    c.fill(ellipse(x, y, r, r), SNOW, { bevel: 1 });
  c.flat(ellipse(14.8, 31.4, 1.5, 5, 0.1), WHITE, 190);
  c.flat(ellipse(21.6, 17, 0.9, 3.2), WHITE, 170);
  c.flat(polygon(starPoints(37.6, 11, 4, 4.6, 1.1, -Math.PI / 2)), YELLOW[5]!);
  return done(c);
}

/** A shooting star: a star with a long coloured tail, and a few sparkles behind it. */
export function wish(): Rgba {
  const c = canvas();
  c.fill(capsule(30, 20, 5, 41, 4.4, 0.8), PINK, { bevel: 3, gain: 1.1 });
  c.flat(capsule(30, 19, 3, 34, 2.4, 0.4), LILAC[5]!);
  c.flat(capsule(32, 22, 12, 42, 1.8, 0.3), SKY[5]!);
  c.fill(polygon(starPoints(32, 18, 5, 14, 6, -Math.PI / 2 + 0.25)), GOLD, { bevel: 4.6, gain: 1.2 });
  c.flat(polygon(starPoints(32, 18, 5, 7.2, 3.2, -Math.PI / 2 + 0.25)), YELLOW[5]!);
  c.flat(ellipse(32, 18, 1.6, 1.6), WHITE);
  for (const [x, y, r] of [
    [8, 13, 4],
    [20, 5.6, 2.8],
    [42, 38, 3.4],
    [6, 30, 2.6],
    [40, 8, 2.2],
  ] as const)
    c.flat(polygon(starPoints(x, y, 4, r, r * 0.25, -Math.PI / 2)), x % 2 ? WHITE : YELLOW[5]!);
  return done(c);
}

export const NATURE = {
  nest,
  egg,
  feather,
  wing,
  clover,
  shell,
  honey,
  hive,
  pond,
  lily,
  fin,
  wave,
  splash,
  bubble,
  puddle,
  wand,
  dust,
  potion,
  wish,
};
