import type { Rgba } from '../../core/image';
import {
  both,
  capsule,
  ellipse,
  heart as heartShape,
  polygon,
  ring,
  type Shape,
  starPoints,
  union,
} from '../../fx/kit';
import {
  AMBER,
  BLUE,
  BRICK,
  CREAM,
  canvas,
  DARKWOOD,
  done,
  GOLD,
  GREEN,
  LEAF,
  LILAC,
  ORANGE,
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

/** A pointed petal standing on `base`, as wide as `half` either side and `height` tall. */
const pointed = (cx: number, base: number, half: number, height: number): Shape =>
  union(
    ellipse(cx, base - height * 0.42, half, height * 0.42),
    polygon([
      [cx - half, base - height * 0.42],
      [cx, base - height],
      [cx + half, base - height * 0.42],
    ]),
  );

/** An orchid: two big round petals, three narrow ones behind, and a pink lip in the middle. */
export function orchid(): Rgba {
  const c = canvas();
  c.fill(capsule(24, 22, 22, 46, 1.6, 2), LEAF, { bevel: 1.4 });
  c.fill(ellipse(12.6, 41, 9, 3, -0.45), GREEN, { bevel: 2 });
  c.fill(ellipse(34, 40, 9, 3, 0.4), LEAF, { bevel: 2 });
  c.fill(ellipse(24, 8.6, 5.2, 7), PURPLE, { bevel: 3 });
  c.fill(ellipse(12.6, 25, 7.4, 3.8, 0.5), PURPLE, { bevel: 2.4 });
  c.fill(ellipse(35.4, 25, 7.4, 3.8, -0.5), PURPLE, { bevel: 2.4 });
  c.fill(ellipse(14.2, 15.6, 9, 7.6, -0.35), LILAC, { bevel: 3.8, gain: 1.15 });
  c.fill(ellipse(33.8, 15.6, 9, 7.6, 0.35), LILAC, { bevel: 3.8, gain: 1.15 });
  c.fill(
    union(
      ellipse(24, 23, 4.6, 4.4),
      polygon([
        [19.6, 20],
        [28.4, 20],
        [24, 29],
      ]),
    ),
    PINK,
    { bevel: 2.6, gain: 1.15 },
  );
  c.fill(ellipse(24, 17.4, 2.8, 2.8), YELLOW, { bevel: 1.8 });
  c.flat(ellipse(19, 13, 1.4, 2.4, 0.9), WHITE, 215);
  return done(c);
}

/** A yellow tulip with two long leaves. */
export function tulip(): Rgba {
  const c = canvas();
  c.fill(capsule(24, 22, 24, 46, 1.8), LEAF, { bevel: 1.4 });
  c.fill(ellipse(14.2, 36.6, 4.2, 12, 0.34), GREEN, { bevel: 2.4 });
  c.fill(ellipse(34, 37.6, 4.2, 11, -0.34), LEAF, { bevel: 2.4 });
  c.fill(
    union(
      ellipse(17, 18.4, 7.4, 11, -0.18),
      polygon([
        [10.6, 14],
        [14, 3.4],
        [19.4, 10],
      ]),
    ),
    AMBER,
    { bevel: 4, gain: 1.15 },
  );
  c.fill(
    union(
      ellipse(31, 18.4, 7.4, 11, 0.18),
      polygon([
        [37.4, 14],
        [34, 3.4],
        [28.6, 10],
      ]),
    ),
    AMBER,
    { bevel: 4, gain: 1.15 },
  );
  c.fill(
    union(
      ellipse(24, 18.6, 7.2, 11.8),
      polygon([
        [18.6, 12],
        [24, 1],
        [29.4, 12],
      ]),
    ),
    YELLOW,
    { bevel: 4.4, gain: 1.15 },
  );
  c.flat(ellipse(20.6, 15, 1.2, 4, 0.1), WHITE, 215);
  return done(c);
}

/** A pink lotus, its pointed petals fanned out over a green pad. */
export function lotus(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 40.4, 21.4, 6.2), GREEN, { bevel: 3.4 });
  c.flat(ellipse(24, 40, 17, 1), LEAF[5]!);
  for (const a of [-1.08, 1.08]) c.fill(turn(pointed(24, 40, 6.4, 27), 24, 40, a), ROSE, { bevel: 3.4, gain: 1.15 });
  for (const a of [-0.62, 0.62]) c.fill(turn(pointed(24, 40, 6.8, 31), 24, 40, a), PINK, { bevel: 3.6, gain: 1.15 });
  c.fill(pointed(24, 40, 7, 34), PINK, { bevel: 4, gain: 1.2, base: 0.78 });
  c.flat(both(pointed(24, 40, 7, 34), rect(0, 0, 48, 12)), WHITE, 150);
  c.flat(ellipse(21, 18, 1.2, 5, 0.1), WHITE, 190);
  return done(c);
}

/** A tiny tree with a bent trunk in a clay pot. */
export function bonsai(): Rgba {
  const c = canvas();
  c.fill(
    polygon([
      [12, 37],
      [36, 37],
      [33, 46],
      [15, 46],
    ]),
    BRICK,
    { bevel: 2.4, gain: 1.1 },
  );
  c.fill(rect(10, 33.6, 38, 38.6), BRICK, { bevel: 1.8, gain: 1.1 });
  c.flat(rect(11.4, 34, 36.6, 35.2), DARKWOOD[2]!);
  c.fill(capsule(24, 34, 19.6, 27, 2.8, 2.4), WOOD, { bevel: 1.6 });
  c.fill(capsule(19.6, 27, 26.6, 19, 2.4, 1.8), WOOD, { bevel: 1.4 });
  c.fill(capsule(26.6, 19, 24, 11, 1.8, 1.4), WOOD, { bevel: 1.2 });
  c.fill(capsule(21, 28.6, 11, 24, 1.4, 1), WOOD, { bevel: 1 });
  c.fill(capsule(26, 20, 35, 21, 1.3, 1), WOOD, { bevel: 1 });
  for (const [x, y, rx, ry] of [
    [11.6, 23.4, 7.6, 5],
    [24, 9, 10.4, 6.6],
    [35.6, 20.2, 7.8, 5.4],
    [18.6, 15.4, 6, 4.2],
  ] as const)
    c.fill(ellipse(x, y, rx, ry), LEAF, { bevel: 3.6, gain: 1.15 });
  for (const [x, y, rx] of [
    [9, 21.4, 3],
    [21.4, 6.4, 3.8],
    [33, 18.2, 3],
  ] as const)
    c.flat(ellipse(x, y, rx, 1), GREEN[5]!, 220);
  return done(c);
}

/** A big tree with a round green top, a brown trunk and three apples. */
export function tree(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 45, 16, 2.6), LEAF, { bevel: 1.6 });
  c.fill(
    polygon([
      [20, 26],
      [28, 26],
      [30.6, 45],
      [17.4, 45],
    ]),
    WOOD,
    { bevel: 2.4 },
  );
  c.fill(
    union(
      ellipse(24, 15, 16.6, 12.6),
      ellipse(13.4, 22, 9.8, 8.4),
      ellipse(34.6, 22, 9.8, 8.4),
      ellipse(24, 25, 15, 7.4),
    ),
    GREEN,
    { bevel: 7, gain: 1.15 },
  );
  for (const [x, y, rx] of [
    [15, 12, 4],
    [27, 7, 3.6],
    [34, 15, 3.2],
    [10, 22, 2.6],
  ] as const)
    c.flat(ellipse(x, y, rx, rx * 0.4, -0.5), GREEN[5]!, 220);
  for (const [x, y] of [
    [17, 19],
    [30.6, 22.6],
    [24.4, 13],
  ] as const) {
    c.fill(ellipse(x, y, 3.2, 3.2), RED, { bevel: 2.4, gain: 1.2 });
    c.flat(ellipse(x - 1, y - 1, 0.7, 0.7), WHITE);
  }
  return done(c);
}

/** A white vase with a blue band, and three flowers in it. */
export function vase(): Rgba {
  const c = canvas();
  for (const [x0, y0, x1, y1] of [
    [24, 19, 13.4, 10],
    [24, 19, 24, 7.6],
    [24, 19, 34.6, 10],
  ] as const)
    c.fill(capsule(x0, y0, x1, y1, 1.1), LEAF, { bevel: 1 });
  for (const [x, y, r, tone] of [
    [12.6, 8.6, 4.6, PINK],
    [24, 5.8, 3.8, YELLOW],
    [35.4, 8.6, 4.6, ROSE],
  ] as const) {
    c.fill(ellipse(x, y, r, r), tone, { bevel: 2.6, gain: 1.15 });
    c.flat(ellipse(x, y, 1.4, 1.4), WHITE, 230);
  }
  const body = union(ellipse(24, 35.6, 13, 10.4), capsule(24, 26, 24, 32, 5.2, 8), rect(20, 19, 28, 27));
  c.fill(body, SNOW, { bevel: 6, gain: 1.15 });
  c.fill(ellipse(24, 19.6, 6.6, 2.2), SNOW, { bevel: 1.6 });
  c.flat(both(body, rect(0, 32.6, 48, 35.6)), BLUE[3]!);
  for (const [x, y] of [
    [16.4, 40],
    [24, 41.4],
    [31.6, 40],
    [20, 29.2],
    [28, 29.2],
  ] as const)
    c.flat(polygon(starPoints(x, y, 4, 2.2, 0.7, -Math.PI / 2)), BLUE[2]!);
  c.fill(ellipse(24, 46, 8.6, 1.8), SNOW, { bevel: 1.2 });
  c.flat(ellipse(15.6, 34.6, 1.4, 4.4, 0.1), WHITE, 220);
  return done(c);
}

/** A seed in the soil with a first green shoot, and two more seeds beside it. */
export function seed(): Rgba {
  const c = canvas();
  c.fill(union(ellipse(24, 41, 20, 5.6), ellipse(24, 38.4, 11, 4.6)), DARKWOOD, { bevel: 3.4, gain: 1.1 });
  c.fill(capsule(24, 38, 24.4, 21, 1.8, 1.4), LEAF, { bevel: 1.4 });
  c.fill(ellipse(15.8, 19.4, 8.6, 4.4, -0.4), GREEN, { bevel: 2.6, gain: 1.15 });
  c.fill(ellipse(33, 17.6, 8.6, 4.4, 0.4), LEAF, { bevel: 2.6, gain: 1.15 });
  c.fill(ellipse(24, 14.6, 3, 4.6), GREEN, { bevel: 2 });
  for (const [x, y, rot] of [
    [9.6, 42, -0.3],
    [38.4, 42.4, 0.4],
  ] as const) {
    c.fill(ellipse(x, y, 3.8, 2.4, rot), AMBER, { bevel: 1.6, gain: 1.2 });
    c.flat(ellipse(x - 0.8, y - 0.6, 0.9, 0.5, rot), WHITE, 220);
  }
  return done(c);
}

/** A climbing vine with heart leaves and a curl. */
export function vine(): Rgba {
  const c = canvas();
  const path = [
    [28, 46],
    [25, 39],
    [19, 33],
    [18.4, 26],
    [24, 20.4],
    [31, 17],
    [30, 10],
    [24.4, 5.6],
  ] as const;
  for (let i = 0; i + 1 < path.length; i++)
    c.fill(capsule(path[i]![0], path[i]![1], path[i + 1]![0], path[i + 1]![1], 1.5), LEAF, { bevel: 1.2 });
  c.flat(both(ring(22, 6, 3.4, 1.3), rect(0, 0, 48, 9)), LEAF[2]!);
  c.flat(both(ring(34, 28, 3.6, 1.3), rect(34, 0, 48, 48)), LEAF[2]!);
  for (const [x, y, size, flip] of [
    [18, 40, 6.4, -1],
    [31, 36, 6, 1],
    [11, 26, 6, -1],
    [30, 25, 6.4, 1],
    [38, 14, 5.6, 1],
    [20, 10, 5.4, -1],
  ] as const) {
    c.fill(turn(heartShape(x, y, size), x, y, flip * 0.9), GREEN, { bevel: 2.6, gain: 1.2 });
  }
  return done(c);
}

/** A woven basket with a handle, and three fruits in it. */
export function basket(): Rgba {
  const c = canvas();
  c.fill(both(ring(24, 24, 14.6, 3, 1.2), rect(0, 0, 48, 28)), WOOD, { bevel: 1.6 });
  for (const [x, y, r, tone] of [
    [16.4, 22.4, 6, RED],
    [28.6, 20, 6, YELLOW],
    [33, 26, 5.2, GREEN],
  ] as const) {
    c.fill(ellipse(x, y, r, r), tone, { bevel: 3, gain: 1.2 });
    c.flat(ellipse(x - r * 0.35, y - r * 0.4, r * 0.2, r * 0.3), WHITE, 230);
  }
  c.fill(
    polygon([
      [6, 27],
      [42, 27],
      [37, 45],
      [11, 45],
    ]),
    AMBER,
    { bevel: 3.2, gain: 1.05 },
  );
  for (let y = 31; y < 45; y += 4) c.line(7, y, 41, y, WOOD[1]!, 1);
  for (let x = 12; x < 40; x += 5.6) c.line(x, 28, x - (x - 24) * 0.14, 44.6, WOOD[2]!, 1);
  c.fill(rect(4.6, 24.6, 43.4, 29.6), WOOD, { bevel: 1.8 });
  return done(c);
}

/** A stone fountain: three jets of water, a small bowl above and a big one below. */
export function fountain(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 40, 22, 6.8), STONE, { bevel: 3.2 });
  c.fill(ellipse(24, 39, 18.4, 4.6), BLUE, { bevel: 2.6 });
  c.fill(capsule(24, 24, 24, 38, 3.2, 4.4), STONE, { bevel: 2.2 });
  c.fill(ellipse(24, 24, 10.4, 3.6), STONE, { bevel: 2 });
  c.fill(ellipse(24, 23.6, 8, 2.2), BLUE, { bevel: 1.6 });
  c.fill(capsule(24, 23, 24, 7.6, 1.5, 1), SKY, { bevel: 1.2 });
  for (const [x0, x1, y1] of [
    [24, 16, 22],
    [24, 32, 22],
    [24, 11, 30],
    [24, 37, 30],
  ] as const) {
    const mx = (x0 + x1) / 2;
    c.line(x0, 8, mx, 6, SKY[4]!, 1.2);
    c.line(mx, 6, x1, y1 - 6, SKY[4]!, 1.2);
    c.flat(ellipse(x1, y1 - 4, 1.4, 2), SKY[5]!);
  }
  c.flat(ellipse(24, 6.4, 1.8, 1.8), WHITE);
  return done(c);
}

/**
 * A unicorn's horn, a long white spiral with gold in its grooves, rising out of a tuft of coloured
 * mane.
 */
export function horn(): Rgba {
  const c = canvas();
  const cone = polygon([
    [17, 42],
    [31, 42],
    [24, 1.6],
  ]);
  c.fill(cone, SNOW, { bevel: 6, gain: 1.25 });
  for (let i = 0; i < 9; i++) {
    const y = 39 - i * 4.4;
    c.flat(
      both(
        cone,
        polygon([
          [0, y + 5.6],
          [48, y - 6.4],
          [48, y - 4.4],
          [0, y + 7.6],
        ]),
      ),
      i % 2 ? PINK[4]! : GOLD[4]!,
    );
  }
  c.flat(ellipse(21.6, 24, 0.9, 10, 0.17), WHITE, 200);
  c.fill(
    union(
      ellipse(13.6, 42, 6, 4.6),
      polygon([
        [8, 44],
        [12, 34],
        [18, 44],
      ]),
    ),
    PINK,
    { bevel: 2.6, gain: 1.15 },
  );
  c.fill(
    union(
      ellipse(34.4, 42, 6, 4.6),
      polygon([
        [30, 44],
        [36, 34],
        [40, 44],
      ]),
    ),
    LILAC,
    { bevel: 2.6, gain: 1.15 },
  );
  c.fill(
    union(
      ellipse(24, 43.6, 8, 3.6),
      polygon([
        [17, 45],
        [24, 36],
        [31, 45],
      ]),
    ),
    SKY,
    { bevel: 2.6, gain: 1.15 },
  );
  c.flat(polygon(starPoints(39.4, 10, 4, 4.8, 1.2, -Math.PI / 2)), YELLOW[5]!);
  c.flat(polygon(starPoints(9.4, 22, 4, 3.6, 0.9, -Math.PI / 2)), WHITE);
  return done(c);
}

/**
 * A horse's hoof seen from the side: the leg, the bend of the ankle with its tuft, and a hoof with
 * a shoe.
 */
export function hoof(): Rgba {
  const c = canvas();
  c.fill(capsule(27, 1, 27, 24, 5.4, 5.6), SNOW, { bevel: 3.6, gain: 1.1 });
  c.fill(ellipse(26.6, 26, 6.6, 5.4), SNOW, { bevel: 3.4, gain: 1.1 });
  c.fill(
    polygon([
      [30, 24],
      [37, 30],
      [33, 34],
      [29, 30],
    ]),
    CREAM,
    { bevel: 2 },
  );
  c.fill(capsule(26, 27, 21.6, 36, 4.6, 4.2), SNOW, { bevel: 3, gain: 1.1 });
  c.fill(
    polygon([
      [17.4, 34],
      [26.6, 36.4],
      [30, 43.6],
      [9.4, 43.6],
    ]),
    WOOD,
    { bevel: 3.4, gain: 1.15 },
  );
  c.flat(
    polygon([
      [17.4, 34],
      [26.6, 36.4],
      [26.2, 37.6],
      [17, 35.2],
    ]),
    DARKWOOD[2]!,
  );
  c.fill(rect(9, 42, 30.6, 45.6), STONE, { bevel: 1.4 });
  for (const x of [13, 19, 25]) c.flat(ellipse(x, 43.8, 0.8, 0.8), STONE[1]!);
  c.flat(ellipse(16.4, 39.4, 1.1, 2.8, 0.45), ORANGE[5]!, 190);
  c.flat(ellipse(23.4, 9, 1.1, 6, 0.05), WHITE, 215);
  c.flat(polygon(starPoints(40.6, 10, 4, 4.4, 1.1, -Math.PI / 2)), YELLOW[5]!);
  return done(c);
}

/** A big red heart with a small one beside it. */
export function heart(): Rgba {
  const c = canvas();
  c.fill(heartShape(21.4, 22, 19), RED, { bevel: 7, gain: 1.25 });
  c.fill(heartShape(38.4, 38, 7.4), PINK, { bevel: 3.6, gain: 1.2 });
  c.flat(ellipse(13.4, 14, 2.4, 4.6, 0.7), WHITE, 225);
  c.flat(ellipse(35.6, 35.4, 1.1, 2, 0.7), WHITE, 225);
  return done(c);
}

/** A bale of hay, bound with two strings, with straw sticking out. */
export function hay(): Rgba {
  const c = canvas();
  let state = 7;
  const random = (): number => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  c.fill(
    polygon([
      [5, 17],
      [38, 17],
      [44, 10],
      [11, 10],
    ]),
    YELLOW,
    { bevel: 2, gain: 0.8, base: 0.8 },
  );
  c.fill(
    polygon([
      [38, 17],
      [44, 10],
      [44, 35],
      [38, 43],
    ]),
    AMBER,
    { bevel: 2, gain: 0.8, base: 0.5 },
  );
  c.fill(rect(5, 17, 38, 43), GOLD, { bevel: 2.4, gain: 0.9 });
  for (let i = 0; i < 46; i++) {
    const x = 6 + random() * 31;
    const y = 18 + random() * 24;
    const len = 3 + random() * 4;
    c.line(x, y, x + len, y - random() * 1.6, i % 3 ? AMBER[4]! : YELLOW[5]!, 0.9);
  }
  for (const x of [14, 28]) {
    c.line(x, 17, x, 43, DARKWOOD[3]!, 1.6);
    c.line(x, 17, x + 5.6, 10.6, DARKWOOD[3]!, 1.4);
  }
  for (const [x, y, dx, dy] of [
    [4, 20, -3, -1],
    [4, 30, -4, 1],
    [38, 43, 2, 3],
    [20, 43, 1, 3.6],
    [8, 10, -2, -3],
  ] as const)
    c.line(x, y, x + dx, y + dy, YELLOW[4]!, 1.2);
  return done(c);
}

/** A pink bow with two loops and two tails. */
export function ribbon(): Rgba {
  const c = canvas();
  c.fill(
    polygon([
      [22, 25],
      [12, 44],
      [18.6, 40.4],
      [22.8, 46.6],
      [26, 27],
    ]),
    ROSE,
    { bevel: 2.4, gain: 1.15 },
  );
  c.fill(
    polygon([
      [26, 25],
      [36, 44],
      [29.4, 40.4],
      [25.2, 46.6],
      [22, 27],
    ]),
    PINK,
    { bevel: 2.4, gain: 1.15 },
  );
  c.fill(ellipse(13.4, 19, 10, 8, -0.3), PINK, { bevel: 4, gain: 1.2 });
  c.fill(ellipse(34.6, 19, 10, 8, 0.3), PINK, { bevel: 4, gain: 1.2 });
  c.flat(ellipse(13.4, 19.6, 5.4, 3.6, -0.3), ROSE[3]!);
  c.flat(ellipse(34.6, 19.6, 5.4, 3.6, 0.3), ROSE[3]!);
  c.fill(ellipse(24, 22, 4.8, 5.4), ROSE, { bevel: 3, gain: 1.2 });
  c.flat(ellipse(8.8, 15, 3, 1.1, -0.5), WHITE, 215);
  c.flat(ellipse(23, 19.6, 1, 1.8, 0.2), WHITE, 215);
  return done(c);
}

export const GARDEN = {
  orchid,
  tulip,
  lotus,
  bonsai,
  tree,
  vase,
  seed,
  vine,
  basket,
  fountain,
  horn,
  hoof,
  heart,
  hay,
  ribbon,
};
