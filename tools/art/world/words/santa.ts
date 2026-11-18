import type { Rgba } from '../../core/image';
import { both, capsule, ellipse, heart, minus, type Pt, polygon, ring, starPoints, union } from '../../fx/kit';
import {
  AMBER,
  BLUE,
  BROWN,
  BURLAP,
  CREAM,
  canvas,
  DARKWOOD,
  done,
  GOLD,
  GREEN,
  INK,
  IRON,
  LEAF,
  ORANGE,
  PEACH,
  PINK,
  RED,
  ROSE,
  rect,
  SKY,
  SLATE,
  SNOW,
  WHITE,
  WOOD,
  YELLOW,
} from './shared';

/** Santa's face: a red hat with a white brim and pompom, rosy cheeks, round nose and a big white beard. */
export function santa(): Rgba {
  const c = canvas();
  c.fill(union(ellipse(24, 31, 15.5, 14), ellipse(11.5, 24, 5, 9.5), ellipse(36.5, 24, 5, 9.5)), SNOW, {
    bevel: 4,
    gain: 0.9,
  });
  c.fill(ellipse(24, 23.5, 10.4, 8.8), PEACH, { bevel: 4 });
  c.flat(ellipse(17.4, 27, 2.2, 1.6), ROSE[3]!, 190);
  c.flat(ellipse(30.6, 27, 2.2, 1.6), ROSE[3]!, 190);
  c.fill(
    polygon([
      [9, 19.5],
      [11, 8],
      [19, 3],
      [30, 4],
      [37, 10],
      [41, 17],
      [41, 20],
    ]),
    RED,
    { bevel: 3.4 },
  );
  c.fill(ellipse(41, 18.4, 4.4, 4.4), SNOW, { bevel: 3 });
  c.fill(capsule(9.6, 19.4, 38.4, 19.4, 3.6), SNOW, { bevel: 2.6 });
  c.fill(union(ellipse(18.8, 29.4, 6, 3.2, -0.2), ellipse(29.2, 29.4, 6, 3.2, 0.2)), SNOW, { bevel: 2.2 });
  c.fill(ellipse(24, 26.4, 2.8, 2.4), ROSE, { bevel: 2 });
  for (const x of [19.4, 28.6]) c.flat(ellipse(x, 23, 1.2, 1.5), INK[1]!);
  c.flat(ellipse(19, 22.3, 0.4, 0.5), WHITE);
  c.flat(ellipse(28.2, 22.3, 0.4, 0.5), WHITE);
  c.fill(ellipse(24, 38, 5, 3.2), SNOW, { bevel: 2 });
  return done(c);
}

/** An elf: a green pointed cap with a bell on its tip, pointed ears, wide eyes and rosy cheeks. */
export function elf(): Rgba {
  const c = canvas();
  for (const s of [-1, 1] as const)
    c.fill(
      polygon([
        [24 + s * 10, 26],
        [24 + s * 19, 21],
        [24 + s * 12.4, 32],
      ]),
      PEACH,
      { bevel: 1.6 },
    );
  c.fill(ellipse(24, 28, 11, 12.4), PEACH, { bevel: 4.4 });
  c.flat(ellipse(17, 31, 2.4, 1.6), ROSE[3]!, 200);
  c.flat(ellipse(31, 31, 2.4, 1.6), ROSE[3]!, 200);
  c.fill(
    polygon([
      [11, 22],
      [14, 12],
      [24, 3],
      [36, 2],
      [41, 7],
      [34, 9],
      [34, 22],
    ]),
    GREEN,
    { bevel: 3 },
  );
  c.fill(capsule(11.4, 21.6, 36.6, 21.6, 3), RED, { bevel: 2.2 });
  c.fill(ellipse(40.4, 7.4, 3, 3), GOLD, { bevel: 2.4 });
  for (const x of [19.6, 28.4]) {
    c.flat(ellipse(x, 28, 2.2, 2.6), WHITE);
    c.flat(ellipse(x, 28.4, 1.2, 1.5), INK[1]!);
  }
  c.fill(ellipse(24, 31.6, 1.7, 1.5), ROSE, { bevel: 1.4 });
  c.flat(
    both(ellipse(24, 34.2, 4.6, 3), (_x, y) => y > 34.4),
    INK[2]!,
  );
  return done(c);
}

/** A red sleigh with gold runners that curl up at the front, and a sack of presents in the back. */
export function sleigh(): Rgba {
  const c = canvas();
  c.fill(
    polygon([
      [6, 22],
      [14, 26],
      [36, 26],
      [43, 14],
      [44, 24],
      [38, 34],
      [10, 34],
    ]),
    RED,
    { bevel: 3 },
  );
  c.fill(capsule(10, 34, 38, 34, 1.4), GOLD, { bevel: 1.2 });
  c.fill(union(ellipse(18, 22, 7, 7), ellipse(27, 19, 4.4, 4.4)), BURLAP, { bevel: 3.6 });
  c.fill(rect(24.4, 20, 32, 27), BLUE, { bevel: 1.6 });
  c.flat(rect(27.4, 20, 29, 27), GOLD[4]!);
  for (const x of [14, 32]) c.fill(rect(x - 1, 34, x + 1, 40), IRON, { bevel: 1 });
  c.fill(
    polygon([
      [3, 41],
      [3, 36],
      [10, 33],
      [12, 41],
    ]),
    GOLD,
    { bevel: 1.2 },
  );
  c.fill(capsule(4, 41.4, 43, 41.4, 1.6), GOLD, { bevel: 1.4 });
  c.fill(capsule(41.4, 41.2, 44.4, 33.6, 1.6), GOLD, { bevel: 1.2 });
  c.flat(ellipse(11, 28, 1.2, 1.2), GOLD[4]!);
  return done(c);
}

/** A child's wooden sled with curled runners and a rope to pull it by. */
export function sled(): Rgba {
  const c = canvas();
  for (const y of [22, 27, 32]) c.fill(capsule(10, y, 36, y, 2.2), WOOD, { bevel: 1.8 });
  c.fill(rect(12, 20, 15, 38), DARKWOOD, { bevel: 1 });
  c.fill(rect(31, 20, 34, 38), DARKWOOD, { bevel: 1 });
  c.fill(
    union(capsule(6, 38.6, 40, 38.6, 1.8), capsule(40, 38.6, 43.4, 31.6, 1.8), capsule(6, 38.6, 3, 31.4, 1.8)),
    RED,
    { bevel: 1.4 },
  );
  c.line(43.4, 31.6, 45, 20, BURLAP[3]!, 1.4);
  c.line(45, 20, 38, 9, BURLAP[3]!, 1.4);
  c.flat(ellipse(13.4, 24, 1, 1), GOLD[4]!);
  c.flat(ellipse(32.6, 24, 1, 1), GOLD[4]!);
  return done(c);
}

/** A reindeer's face: brown with a cream muzzle, big antlers, soft ears and a round red nose. */
export function reindeer(): Rgba {
  const c = canvas();
  for (const s of [-1, 1] as const) {
    const x = 24 + s * 9;
    c.fill(capsule(x, 14, 24 + s * 15, 2.6, 1.6, 1.2), DARKWOOD, { bevel: 1.2 });
    c.fill(capsule(24 + s * 12, 8.4, 24 + s * 19.4, 8, 1.1), DARKWOOD, { bevel: 1 });
    c.fill(capsule(24 + s * 14, 5, 24 + s * 13, -0.4, 1), DARKWOOD, { bevel: 1 });
    c.fill(capsule(24 + s * 11, 11.6, 24 + s * 18, 14, 1), DARKWOOD, { bevel: 1 });
    c.fill(ellipse(24 + s * 12.6, 21, 4.4, 2.4, s * 0.5), BROWN, { bevel: 2 });
  }
  c.fill(
    polygon([
      [12, 17],
      [36, 17],
      [33, 36],
      [24, 44],
      [15, 36],
    ]),
    BROWN,
    { bevel: 4.4 },
  );
  c.fill(ellipse(24, 36.4, 8, 6.4), CREAM, { bevel: 3.4 });
  c.fill(ellipse(24, 37, 4.2, 3.8), RED, { bevel: 2.8, gain: 1.2 });
  for (const x of [17.6, 30.4]) {
    c.flat(ellipse(x, 26, 2.2, 2.6), WHITE);
    c.flat(ellipse(x, 26.4, 1.2, 1.5), INK[1]!);
  }
  return done(c);
}

/** One branching antler: a main beam curving up with tines off it. */
export function antler(): Rgba {
  const c = canvas();
  const beam: Pt[] = Array.from({ length: 12 }, (_, i) => {
    const t = i / 11;
    return [18 + t * 12 + Math.sin(t * 3) * 3, 44 - t * 40] as Pt;
  });
  for (let i = 0; i + 1 < beam.length; i++)
    c.fill(capsule(beam[i]![0], beam[i]![1], beam[i + 1]![0], beam[i + 1]![1], 2.6 - i * 0.12), WOOD, {
      bevel: 1.6,
    });
  for (const [from, dx, dy] of [
    [2, 10, -12],
    [4, -9, -10],
    [6, 11, -10],
    [8, -7, -9],
  ] as const) {
    const [x, y] = beam[from]!;
    c.fill(capsule(x, y, x + dx, y + dy, 1.8, 0.8), WOOD, { bevel: 1.2 });
  }
  c.fill(ellipse(18, 44, 5, 2.6), DARKWOOD, { bevel: 2 });
  return done(c);
}

/** A heap of fresh snow with a few flakes still coming down. */
export function snow(): Rgba {
  const c = canvas();
  c.fill(union(ellipse(24, 36, 20, 8), ellipse(16, 34, 10, 7), ellipse(32, 33, 11, 8)), SNOW, { bevel: 6, gain: 1.1 });
  c.flat(ellipse(19, 31, 3, 1.2, -0.4), WHITE, 220);
  for (const [x, y, r] of [
    [10, 8, 2.6],
    [24, 14, 3],
    [37, 6, 2.4],
    [16, 21, 2],
    [33, 20, 2.4],
    [42, 15, 1.8],
  ] as const) {
    c.fill(ellipse(x, y, r, r), SNOW, { bevel: 1.4 });
  }
  return done(c);
}

/** A snowflake: six arms, each with two pairs of side branches, in pale ice blue. */
export function snowflake(): Rgba {
  const c = canvas();
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 - Math.PI / 2;
    const dx = Math.cos(a),
      dy = Math.sin(a);
    c.fill(capsule(24, 24, 24 + dx * 21, 24 + dy * 21, 1.7), SKY, { bevel: 1.4, gain: 1.1 });
    for (const [at, len] of [
      [9, 6.4],
      [15, 4.4],
    ] as const)
      for (const side of [-1, 1] as const) {
        const b = a + side * 0.9;
        c.fill(
          capsule(24 + dx * at, 24 + dy * at, 24 + dx * at + Math.cos(b) * len, 24 + dy * at + Math.sin(b) * len, 1.2),
          SKY,
          { bevel: 1 },
        );
      }
  }
  c.fill(ellipse(24, 24, 3.6, 3.6), SNOW, { bevel: 2.4 });
  return done(c);
}

/** A snowball with a blue shade, a bright side and a few crumbs falling from it. */
export function snowball(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 25, 17, 17), SNOW, { bevel: 12, gain: 1.2 });
  c.flat(ellipse(17.6, 17.6, 4.4, 2.6, -0.7), WHITE, 230);
  for (const [x, y] of [
    [40, 38],
    [43, 30],
    [8, 40],
  ] as const)
    c.fill(ellipse(x, y, 2, 2), SNOW, { bevel: 1.2 });
  return done(c);
}

/** An igloo: a dome of snow blocks with a low arched door in front. */
export function igloo(): Rgba {
  const c = canvas();
  c.fill(
    minus(ellipse(24, 38, 21, 22), (_x, y) => y > 38),
    SNOW,
    { bevel: 6 },
  );
  c.fill(ellipse(24, 39, 22, 3), SNOW, { bevel: 2.4 });
  for (const y of [16, 24, 32])
    c.flat(
      both(ellipse(24, 38, 21, 22), (_x, yy) => Math.abs(yy - y) < 0.5),
      SKY[2]!,
    );
  for (const [y, xs] of [
    [20, [14, 24, 34]],
    [28, [9, 19, 29, 39]],
    [35, [12, 22, 32]],
  ] as const)
    for (const x of xs) c.flat(rect(x - 0.4, y - 4, x + 0.4, y + 3.6), SKY[2]!);
  c.fill(union(rect(18, 31, 30, 40), ellipse(24, 31, 6, 6)), SLATE, { bevel: 1.6 });
  c.fill(union(rect(19.6, 33, 28.4, 40), ellipse(24, 33, 4.4, 4.4)), INK, {
    bevel: 1,
  });
  return done(c);
}

/** Three icicles hanging from a ledge of snow, the middle one longest. */
export function icicle(): Rgba {
  const c = canvas();
  c.fill(union(ellipse(24, 7, 22, 5.4), ellipse(12, 6, 8, 5), ellipse(36, 6, 9, 5)), SNOW, { bevel: 3.6 });
  for (const [x, len, w] of [
    [10, 22, 3.2],
    [18, 30, 3.8],
    [27, 40, 4.4],
    [36, 25, 3.4],
    [42, 16, 2.6],
  ] as const) {
    c.fill(
      polygon([
        [x - w, 7],
        [x + w, 7],
        [x, len],
      ]),
      SKY,
      { bevel: 2.2, gain: 1.2 },
    );
    c.flat(rect(x - w * 0.5, 9, x - w * 0.2, len * 0.55), WHITE, 190);
  }
  return done(c);
}

/** A snowman: three balls of snow, a top hat, coal eyes, a carrot nose, a scarf and twig arms. */
export function snowman(): Rgba {
  const c = canvas();
  c.line(10, 26, 3, 20, DARKWOOD[3]!, 1.6);
  c.line(38, 26, 45, 19, DARKWOOD[3]!, 1.6);
  c.fill(ellipse(24, 37, 11.4, 9.6), SNOW, { bevel: 7 });
  c.fill(ellipse(24, 24, 8.6, 8), SNOW, { bevel: 6 });
  c.fill(ellipse(24, 12.6, 6.8, 6.6), SNOW, { bevel: 5 });
  c.fill(rect(15, 6.6, 33, 8.4), INK, { bevel: 1 });
  c.fill(rect(18.4, -0.4, 29.6, 7), INK, { bevel: 1.6 });
  c.flat(rect(18.4, 4, 29.6, 5.6), RED[3]!);
  c.fill(capsule(17.6, 17.6, 30.4, 17.6, 2.2), RED, { bevel: 1.6 });
  c.fill(rect(28, 17, 31.4, 26), RED, { bevel: 1.2 });
  for (const x of [21.4, 26.6]) c.flat(ellipse(x, 11.4, 0.9, 0.9), INK[0]!);
  c.fill(
    polygon([
      [24, 12.6],
      [30.6, 14.4],
      [24, 15.4],
    ]),
    ORANGE,
    { bevel: 1 },
  );
  for (const y of [22.6, 27.4]) c.flat(ellipse(24, y, 1, 1), INK[0]!);
  return done(c);
}

/** A knitted scarf wound twice round and hanging in two striped tails with fringes. */
export function scarf(): Rgba {
  const c = canvas();
  c.fill(minus(ellipse(24, 14, 18, 9), ellipse(24, 15.6, 11, 5)), RED, { bevel: 3 });
  for (const [x0, x1] of [
    [9, 5],
    [14, 12],
  ] as const) {
    c.fill(
      polygon([
        [x0, 17],
        [x0 + 8, 18],
        [x1 + 8, 42],
        [x1, 40],
      ]),
      RED,
      { bevel: 2.2 },
    );
  }
  for (const y of [24, 30, 36]) {
    c.flat(
      both(
        polygon([
          [9, 17],
          [17, 18],
          [13, 42],
          [5, 40],
        ]),
        (_x, yy) => Math.abs(yy - y) < 1.4,
      ),
      SNOW[3]!,
    );
  }
  for (const x of [5.6, 8, 10.4, 12.8]) c.fill(capsule(x, 40.4, x + 0.6, 45, 0.9), RED, { bevel: 0.8 });
  for (const [x, y] of [
    [14, 11],
    [24, 7.4],
    [34, 11],
  ] as const)
    c.flat(rect(x - 0.7, y - 1, x + 0.7, y + 4), SNOW[3]!);
  return done(c);
}

/** A red mitten with a white cuff and a snowflake knitted on its back. */
export function mitten(): Rgba {
  const c = canvas();
  c.fill(union(capsule(24, 38, 24, 14, 9.6), ellipse(24, 14, 9.6, 9.4)), RED, { bevel: 6 });
  c.fill(ellipse(11.6, 27, 4.4, 7.2, -0.5), RED, { bevel: 3.2 });
  c.fill(rect(13.4, 34, 34.6, 44), SNOW, { bevel: 2.6 });
  for (const x of [17, 21, 25, 29, 33]) c.flat(rect(x - 0.3, 35, x + 0.3, 43), SKY[2]!);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI;
    c.line(
      24 - Math.cos(a) * 4.4,
      21 - Math.sin(a) * 4.4,
      24 + Math.cos(a) * 4.4,
      21 + Math.sin(a) * 4.4,
      SNOW[4]!,
      1.2,
    );
  }
  return done(c);
}

/** A winter boot: brown leather with a fur top, laces and a thick sole. */
export function boot(): Rgba {
  const c = canvas();
  c.fill(
    polygon([
      [14, 6],
      [31, 6],
      [32, 28],
      [43, 33],
      [43, 41],
      [10, 41],
    ]),
    BROWN,
    { bevel: 3.4 },
  );
  c.fill(rect(9, 38, 44, 44), DARKWOOD, { bevel: 2 });
  c.fill(union(ellipse(22.6, 6.4, 10.4, 3.8), ellipse(16, 8, 4, 3.4), ellipse(30, 8, 4, 3.4)), SNOW, {
    bevel: 2.8,
  });
  for (const y of [14, 19, 24]) {
    c.line(17, y, 29, y, CREAM[2]!, 1.2);
    c.flat(ellipse(17, y, 1.2, 1.2), GOLD[4]!);
    c.flat(ellipse(29, y, 1.2, 1.2), GOLD[4]!);
  }
  return done(c);
}

/** A red winter coat with fur at the collar, big buttons and two pockets. */
export function coat(): Rgba {
  const c = canvas();
  c.fill(
    polygon([
      [14, 8],
      [34, 8],
      [41, 12],
      [45, 34],
      [38, 36],
      [36, 20],
      [37, 44],
      [11, 44],
      [12, 20],
      [10, 36],
      [3, 34],
      [7, 12],
    ]),
    RED,
    { bevel: 3.4 },
  );
  c.fill(union(ellipse(24, 8.6, 10.4, 3.8), ellipse(15, 10, 4, 3.6), ellipse(33, 10, 4, 3.6)), SNOW, { bevel: 2.8 });
  c.flat(rect(23.4, 11, 24.6, 44), RED[1]!);
  for (const y of [18, 26, 34]) c.fill(ellipse(24, y, 2, 2), GOLD, { bevel: 1.6 });
  for (const x of [16, 32]) c.flat(rect(x - 3.6, 33, x + 3.6, 34), RED[1]!);
  c.fill(rect(2, 33, 11, 37.6), SNOW, { bevel: 1.4 });
  c.fill(rect(37, 33, 46, 37.6), SNOW, { bevel: 1.4 });
  return done(c);
}

/** A wrapped present with a ribbon both ways and a big bow. */
export function present(): Rgba {
  const c = canvas();
  c.fill(rect(7, 20, 41, 43), RED, { bevel: 3 });
  c.fill(rect(5, 14, 43, 22), ROSE, { bevel: 2.4 });
  c.flat(rect(21.4, 20, 26.6, 43), GOLD[4]!);
  c.flat(rect(5, 16.4, 43, 20), GOLD[4]!);
  c.flat(rect(21.4, 14, 26.6, 22), GOLD[4]!);
  for (const s of [-1, 1] as const) {
    c.fill(ellipse(24 + s * 6.6, 9.6, 6.4, 4.6, s * 0.6), GOLD, { bevel: 3 });
    c.fill(ellipse(24 + s * 6.6, 9.6, 3.4, 2.2, s * 0.6), AMBER, { bevel: 1.4 });
  }
  c.fill(ellipse(24, 11.6, 2.8, 2.8), GOLD, { bevel: 2 });
  return done(c);
}

/** A gift in a bag: blue paper with a gold handle and tissue paper sticking out of the top. */
export function gift(): Rgba {
  const c = canvas();
  c.fill(
    polygon([
      [8, 18],
      [40, 18],
      [42, 44],
      [6, 44],
    ]),
    BLUE,
    { bevel: 3.4 },
  );
  for (const [x, y] of [
    [16, 28],
    [28, 32],
    [22, 38],
    [34, 24],
  ] as const)
    c.fill(polygon(starPoints(x, y, 5, 3, 1.3)), GOLD, { bevel: 1 });
  c.fill(
    polygon([
      [12, 20],
      [14, 8],
      [20, 14],
      [24, 4],
      [29, 14],
      [34, 8],
      [36, 20],
    ]),
    PINK,
    { bevel: 2 },
  );
  c.line(17, 18, 18, 11, ROSE[2]!, 1);
  c.line(30, 18, 29.4, 11, ROSE[2]!, 1);
  c.fill(ring(24, 18, 7, 2), GOLD, { bevel: 1 });
  return done(c);
}

/** A ribbon bow: two loops, two tails and a knot. */
export function bow(): Rgba {
  const c = canvas();
  c.fill(
    polygon([
      [22, 26],
      [12, 44],
      [20, 40],
      [24, 46],
    ]),
    ROSE,
    { bevel: 2 },
  );
  c.fill(
    polygon([
      [26, 26],
      [36, 44],
      [28, 40],
      [24, 46],
    ]),
    ROSE,
    { bevel: 2 },
  );
  for (const s of [-1, 1] as const) {
    c.fill(ellipse(24 + s * 11, 18, 11, 8.6, s * -0.4), RED, { bevel: 4 });
    c.fill(ellipse(24 + s * 11.4, 18.4, 5, 3.6, s * -0.4), ROSE, { bevel: 2 });
  }
  c.fill(ellipse(24, 24, 4.6, 5.4), RED, { bevel: 3.4 });
  c.flat(ellipse(22.6, 22.6, 1.2, 1.6), WHITE, 150);
  return done(c);
}

/** A gift tag: a cream tag with a punched hole, a string and a heart. */
export function tag(): Rgba {
  const c = canvas();
  c.fill(
    polygon([
      [14, 14],
      [22, 6],
      [38, 6],
      [38, 44],
      [14, 44],
    ]),
    CREAM,
    { bevel: 3 },
  );
  c.fill(ring(24.4, 12.6, 2.6, 1.8), GOLD, { bevel: 1 });
  c.flat(ellipse(24.4, 12.6, 1.5, 1.5), WHITE, 0);
  c.line(25, 11, 36, 1.4, RED[3]!, 1.2);
  c.line(23, 12, 8, 1.6, RED[3]!, 1.2);
  c.fill(heart(26, 28, 7), RED, { bevel: 2.6 });
  for (const y of [38.4, 41]) c.flat(rect(19, y, 33, y + 0.8), CREAM[2]!);
  return done(c);
}

/** A tower of alphabet blocks, three high, each a different colour with a letter on it. */
export function toy(): Rgba {
  const c = canvas();
  const block = (x: number, y: number, ramp: typeof RED, letter: Pt[][]) => {
    c.fill(rect(x, y, x + 15, y + 14), ramp, { bevel: 2.4 });
    for (const stroke of letter) {
      for (let i = 0; i + 1 < stroke.length; i++)
        c.line(x + stroke[i]![0], y + stroke[i]![1], x + stroke[i + 1]![0], y + stroke[i + 1]![1], WHITE, 1.4);
    }
  };
  block(5, 30, BLUE, [
    [
      [4, 11],
      [7.5, 3],
      [11, 11],
    ],
    [
      [5.4, 8],
      [9.6, 8],
    ],
  ]);
  block(26, 30, GREEN, [
    [
      [4, 3],
      [4, 11],
      [10, 11],
    ],
  ]);
  block(15, 16, RED, [
    [
      [4, 3],
      [10, 3],
      [4, 11],
      [10, 11],
    ],
  ]);
  c.fill(
    polygon([
      [22.5, 4],
      [30, 14.6],
      [15, 14.6],
    ]),
    YELLOW,
    { bevel: 2.4 },
  );
  return done(c);
}

/** A teddy bear sitting up, with round ears, a pale muzzle, a bow and stitched paws. */
export function teddy(): Rgba {
  const c = canvas();
  c.fill(union(ellipse(24, 34, 10.6, 11), ellipse(12.4, 41.4, 4.8, 3.6), ellipse(35.6, 41.4, 4.8, 3.6)), WOOD, {
    bevel: 4.4,
  });
  c.fill(ellipse(24, 36, 6, 7), CREAM, { bevel: 3 });
  c.fill(ellipse(11.6, 30.4, 3.6, 6, 0.6), WOOD, { bevel: 2.4 });
  c.fill(ellipse(36.4, 30.4, 3.6, 6, -0.6), WOOD, { bevel: 2.4 });
  for (const s of [-1, 1] as const) c.fill(ellipse(24 + s * 9, 8.4, 4.2, 4.2), WOOD, { bevel: 2.6 });
  for (const s of [-1, 1] as const) c.fill(ellipse(24 + s * 9, 8.4, 2.2, 2.2), PEACH, { bevel: 1.4 });
  c.fill(ellipse(24, 15.6, 11.6, 10.4), WOOD, { bevel: 5 });
  c.fill(ellipse(24, 19.4, 5.2, 4), CREAM, { bevel: 2.6 });
  c.fill(ellipse(24, 17.6, 2, 1.4), INK, { bevel: 1 });
  for (const s of [-1, 1] as const) c.flat(ellipse(24 + s * 5.4, 13.4, 1.3, 1.6), INK[0]!);
  c.line(24, 19, 24, 21, INK[2]!, 0.8);
  c.fill(
    polygon([
      [24, 27],
      [17, 25],
      [17, 30.4],
    ]),
    RED,
    { bevel: 1.4 },
  );
  c.fill(
    polygon([
      [24, 27],
      [31, 25],
      [31, 30.4],
    ]),
    RED,
    { bevel: 1.4 },
  );
  c.fill(ellipse(24, 27.4, 1.8, 1.8), ROSE, { bevel: 1.2 });
  return done(c);
}

/** A toy drum: a red body with white zigzag cords, gold rims, and two sticks. */
export function drum(): Rgba {
  const c = canvas();
  c.line(10, 5, 24, 18, WOOD[3]!, 2);
  c.line(38, 5, 24, 18, WOOD[3]!, 2);
  c.fill(ellipse(10, 4.6, 2.2, 2.2), CREAM, { bevel: 1.6 });
  c.fill(ellipse(38, 4.6, 2.2, 2.2), CREAM, { bevel: 1.6 });
  c.fill(rect(6, 20, 42, 38), RED, { bevel: 3.4 });
  c.fill(ellipse(24, 38, 18, 5), RED, { bevel: 3 });
  c.fill(ellipse(24, 20, 18, 5), CREAM, { bevel: 2.4 });
  c.flat(ring(24, 20, 18, 1.4, 5 / 18), GOLD[3]!);
  const zig: Pt[] = [];
  for (let i = 0; i <= 8; i++) zig.push([6 + i * 4.5, i % 2 === 0 ? 24 : 36]);
  for (let i = 0; i + 1 < zig.length; i++)
    c.line(zig[i]![0], zig[i]![1], zig[i + 1]![0], zig[i + 1]![1], SNOW[4]!, 1.4);
  return done(c);
}

/** A toy steam train: a blue engine with a tall funnel, a yellow cab and big red wheels. */
export function train(): Rgba {
  const c = canvas();
  c.fill(rect(10, 22, 36, 34), BLUE, { bevel: 3.4 });
  c.fill(ellipse(10, 28, 3, 6), BLUE, { bevel: 2 });
  c.fill(rect(30, 12, 44, 34), YELLOW, { bevel: 2.4 });
  c.fill(rect(28, 9, 46, 13), RED, { bevel: 1.8 });
  c.fill(rect(34, 16, 41, 23), SKY, { bevel: 1.4 });
  c.fill(
    polygon([
      [13, 22],
      [13, 12],
      [20, 12],
      [22, 22],
    ]),
    IRON,
    { bevel: 1.6 },
  );
  c.fill(rect(11, 9, 22, 13), IRON, { bevel: 1.6 });
  for (const [x, r] of [
    [15, 5],
    [26, 5],
    [38, 6],
  ] as const) {
    c.fill(ellipse(x, 38, r, r), RED, { bevel: 3 });
    c.flat(ellipse(x, 38, r * 0.3, r * 0.3), GOLD[4]!);
  }
  c.fill(rect(4, 36, 8, 41), IRON, { bevel: 1 });
  c.flat(ellipse(9, 28, 1.4, 1.4), YELLOW[5]!);
  for (const [x, y, r] of [
    [14, 5, 3],
    [10, 2, 2.2],
  ] as const)
    c.fill(ellipse(x, y, r, r), SNOW, { bevel: 1.6 });
  return done(c);
}

/** A rag doll in a red dress with yellow wool hair, button eyes and a sewn smile. */
export function doll(): Rgba {
  const c = canvas();
  c.fill(union(rect(6, 20, 10, 24), capsule(6.6, 19, 14, 30, 2.4), capsule(41.4, 19, 34, 30, 2.4)), PEACH, {
    bevel: 2,
  });
  c.fill(rect(17, 38, 22, 46), PEACH, { bevel: 1.2 });
  c.fill(rect(26, 38, 31, 46), PEACH, { bevel: 1.2 });
  c.fill(rect(16.4, 44, 22.6, 47.4), BROWN, { bevel: 1 });
  c.fill(rect(25.4, 44, 31.6, 47.4), BROWN, { bevel: 1 });
  c.fill(
    polygon([
      [17, 24],
      [31, 24],
      [38, 40],
      [10, 40],
    ]),
    RED,
    { bevel: 3 },
  );
  c.flat(rect(17, 26, 31, 27.6), SNOW[4]!);
  c.fill(ellipse(24, 14, 9.6, 9.8), PEACH, { bevel: 4 });
  c.fill(union(ellipse(24, 7, 11, 5), ellipse(13.4, 14, 3.4, 8), ellipse(34.6, 14, 3.4, 8)), YELLOW, { bevel: 2.4 });
  for (const x of [20.4, 27.6]) c.fill(ellipse(x, 13.4, 1.5, 1.5), INK, { bevel: 1 });
  c.flat(ellipse(17.4, 17.6, 1.8, 1.2), ROSE[3]!, 200);
  c.flat(ellipse(30.6, 17.6, 1.8, 1.2), ROSE[3]!, 200);
  c.flat(
    both(ellipse(24, 17, 3.4, 2.4), (_x, y) => y > 17.4),
    RED[2]!,
  );
  return done(c);
}

/** A diamond kite, red and yellow in quarters, with a string and a tail of three bows. */
export function kite(): Rgba {
  const c = canvas();
  const body: Pt[] = [
    [22, 2],
    [36, 15],
    [22, 32],
    [8, 15],
  ];
  c.fill(polygon(body), RED, { bevel: 2.6 });
  c.fill(
    polygon([
      [22, 2],
      [36, 15],
      [22, 17],
    ]),
    YELLOW,
    { bevel: 2 },
  );
  c.fill(
    polygon([
      [22, 32],
      [8, 15],
      [22, 17],
    ]),
    YELLOW,
    { bevel: 2 },
  );
  c.line(22, 2, 22, 32, WOOD[2]!, 1);
  c.line(8, 15, 36, 15, WOOD[2]!, 1);
  const tail: Pt[] = [
    [22, 32],
    [26, 37],
    [20, 41],
    [26, 45],
  ];
  for (let i = 0; i + 1 < tail.length; i++)
    c.line(tail[i]![0], tail[i]![1], tail[i + 1]![0], tail[i + 1]![1], WOOD[3]!, 1);
  for (const [x, y, ramp] of [
    [26, 37, BLUE],
    [20, 41, GREEN],
    [26, 45, PINK],
  ] as const) {
    c.fill(
      polygon([
        [x, y],
        [x + 4, y - 2.4],
        [x + 4, y + 2.4],
      ]),
      ramp,
      { bevel: 1.2 },
    );
    c.fill(
      polygon([
        [x, y],
        [x - 4, y - 2.4],
        [x - 4, y + 2.4],
      ]),
      ramp,
      { bevel: 1.2 },
    );
  }
  return done(c);
}

/** A tin robot: a square head with an aerial, round eyes, a grille mouth, bolted arms and a dial. */
export function robot(): Rgba {
  const c = canvas();
  c.line(24, 3, 24, 8, IRON[3]!, 1.4);
  c.fill(ellipse(24, 3, 2.4, 2.4), RED, { bevel: 1.8 });
  c.fill(rect(13, 8, 35, 24), IRON, { bevel: 3 });
  for (const x of [19.4, 28.6]) {
    c.fill(ellipse(x, 14.4, 3.4, 3.4), YELLOW, { bevel: 2.4 });
    c.flat(ellipse(x, 14.6, 1.4, 1.4), INK[0]!);
  }
  c.fill(rect(18, 19.4, 30, 22.6), INK, { bevel: 1 });
  for (const x of [20.4, 23, 25.6, 28.2]) c.flat(rect(x, 19.6, x + 0.8, 22.4), IRON[4]!);
  c.fill(rect(15, 26, 33, 42), SLATE, { bevel: 3 });
  c.fill(ellipse(24, 32, 4, 4), RED, { bevel: 2.4 });
  c.flat(rect(23.4, 29.6, 24.6, 32), WHITE);
  for (const x of [18.6, 29.4]) c.fill(ellipse(x, 37.6, 1.5, 1.5), YELLOW, { bevel: 1 });
  c.fill(rect(6, 27, 14, 31.6), IRON, { bevel: 1.6 });
  c.fill(rect(34, 27, 42, 31.6), IRON, { bevel: 1.6 });
  c.fill(rect(17, 42, 22.6, 47), IRON, { bevel: 1.6 });
  c.fill(rect(25.4, 42, 31, 47), IRON, { bevel: 1.6 });
  return done(c);
}

/** A boiled sweet in a twist of striped paper, with a fan at each end. */
export function candy(): Rgba {
  const c = canvas();
  for (const s of [-1, 1] as const)
    c.fill(
      polygon([
        [24 + s * 11, 24],
        [24 + s * 21, 15],
        [24 + s * 22, 24],
        [24 + s * 21, 33],
      ]),
      PINK,
      { bevel: 1.6 },
    );
  c.fill(ellipse(24, 24, 13, 10.4), RED, { bevel: 6 });
  for (const x of [15, 21, 27, 33])
    c.flat(
      both(ellipse(24, 24, 13, 10.4), (xx, y) => Math.abs(xx - x - (y - 24) * 0.5) < 1.5),
      SNOW[4]!,
    );
  c.flat(ellipse(19, 19, 3, 1.6, -0.6), WHITE, 190);
  return done(c);
}

/** A candy cane: a hooked stick with red stripes on white. */
export function cane(): Rgba {
  const c = canvas();
  const path: Pt[] = [];
  for (let i = 0; i <= 18; i++) path.push([15, 46 - (i / 18) * 26]);
  for (let i = 1; i <= 16; i++) {
    const t = (i / 16) * Math.PI;
    path.push([22.5 - Math.cos(t) * 7.5, 20 - Math.sin(t) * 12.4]);
  }
  for (let i = 0; i + 1 < path.length; i++) {
    const [x0, y0] = path[i]!,
      [x1, y1] = path[i + 1]!;
    c.fill(capsule(x0, y0, x1, y1, 3.8), Math.floor(i / 2) % 2 === 0 ? RED : SNOW, { bevel: 3 });
  }
  c.flat(rect(13.4, 21, 14.6, 45), WHITE, 150);
  return done(c);
}

/** A peppermint: a white round with a red swirl of curved wedges. */
export function mint(): Rgba {
  const c = canvas();
  c.fill(ellipse(24, 24, 19, 19), SNOW, { bevel: 7 });
  for (let k = 0; k < 4; k++) {
    const a0 = (k / 4) * Math.PI * 2;
    const pts: Pt[] = [];
    for (let r = 0; r <= 17; r += 1.5) pts.push([24 + Math.cos(a0 + r * 0.05) * r, 24 + Math.sin(a0 + r * 0.05) * r]);
    for (let r = 17; r >= 0; r -= 1.5)
      pts.push([24 + Math.cos(a0 + 0.78 + r * 0.05) * r, 24 + Math.sin(a0 + 0.78 + r * 0.05) * r]);
    c.fill(both(polygon(pts), ellipse(24, 24, 17.4, 17.4)), RED, { bevel: 2.4 });
  }
  c.fill(ellipse(24, 24, 2.6, 2.6), SNOW, { bevel: 2 });
  c.flat(ellipse(15.4, 14.6, 3.6, 1.6, -0.6), WHITE, 170);
  return done(c);
}

/** A mug of hot cocoa with marshmallows on top and steam curling up. */
export function cocoa(): Rgba {
  const c = canvas();
  c.fill(ring(40, 29, 5, 3.4, 1.1), RED, { bevel: 2 });
  c.fill(
    polygon([
      [8, 18],
      [38, 18],
      [35, 43],
      [11, 43],
    ]),
    RED,
    { bevel: 3.4 },
  );
  c.flat(rect(9, 25, 37, 27.6), SNOW[4]!);
  c.fill(ellipse(23, 18, 15, 4.4), BROWN, { bevel: 3 });
  for (const [x, y] of [
    [17, 16],
    [24.6, 14.6],
    [30, 17],
  ] as const)
    c.fill(rect(x - 3, y - 2.4, x + 3, y + 2.4), SNOW, { bevel: 2 });
  for (const [x, dx] of [
    [16, 3],
    [27, -3],
  ] as const) {
    const wisp: Pt[] = Array.from({ length: 9 }, (_, i) => [x + Math.sin(i * 0.9) * dx, 10 - i * 1.3] as Pt);
    for (let i = 0; i + 1 < wisp.length; i++)
      c.line(wisp[i]![0], wisp[i]![1], wisp[i + 1]![0], wisp[i + 1]![1], SKY[4]!, 1.6);
  }
  return done(c);
}

/** A glass bauble: a shiny red ball with a gold cap, a loop and a white swirl painted on it. */
export function bauble(): Rgba {
  const c = canvas();
  c.fill(ring(24, 6.4, 3.4, 1.6), GOLD, { bevel: 1 });
  c.fill(rect(19.6, 8.4, 28.4, 13), GOLD, { bevel: 1.6 });
  c.fill(ellipse(24, 28, 16.4, 16.4), RED, { bevel: 11, gain: 1.2 });
  for (let i = 0; i < 3; i++) {
    const y = 20 + i * 8;
    c.line(10, y + 2, 20, y - 2, SNOW[4]!, 1.4);
    c.line(20, y - 2, 30, y + 2, SNOW[4]!, 1.4);
    c.line(30, y + 2, 38, y - 2, SNOW[4]!, 1.4);
  }
  c.flat(ellipse(17, 20, 3.4, 5.6, 0.5), WHITE, 190);
  return done(c);
}

/** A strand of tinsel: a silver and gold zigzag of spiky fronds. */
export function tinsel(): Rgba {
  const c = canvas();
  const at = (t: number): Pt => [4 + t * 40, 24 + Math.sin(t * Math.PI * 2.4) * 10];
  for (let i = 0; i <= 40; i++) {
    const [x, y] = at(i / 40);
    const a = i * 0.9;
    for (const [len, ramp] of [
      [6.4, i % 2 === 0 ? SNOW : GOLD],
      [-6.4, i % 2 === 0 ? GOLD : SNOW],
    ] as const)
      c.fill(capsule(x, y, x + Math.cos(a) * len * 0.4, y + len, 1.1, 0.4), ramp, { bevel: 0.9 });
  }
  for (let i = 0; i < 40; i++) {
    const [x0, y0] = at(i / 40);
    const [x1, y1] = at((i + 1) / 40);
    c.line(x0, y0, x1, y1, IRON[4]!, 1.6);
  }
  return done(c);
}

/** A garland swagged across the width: green boughs with red berries, gold baubles and a bow. */
export function garland(): Rgba {
  const c = canvas();
  const at = (t: number): Pt => [3 + t * 42, 10 + Math.sin(t * Math.PI) * 18];
  for (let i = 0; i <= 28; i++) {
    const [x, y] = at(i / 28);
    c.fill(ellipse(x, y, 5, 4.2, ((i % 3) - 1) * 0.5), i % 2 ? LEAF : GREEN, { bevel: 2.6 });
  }
  for (const [t, ramp] of [
    [0.16, GOLD],
    [0.34, RED],
    [0.66, GOLD],
    [0.84, RED],
  ] as const) {
    const [x, y] = at(t);
    c.fill(ellipse(x, y + 1.6, 2.8, 2.8), ramp, { bevel: 2.2 });
  }
  const [bx, by] = at(0.5);
  for (const s of [-1, 1] as const) c.fill(ellipse(bx + s * 4.6, by + 1, 4.6, 3, s * -0.4), RED, { bevel: 2.4 });
  c.fill(ellipse(bx, by + 1, 2, 2.4), ROSE, { bevel: 1.6 });
  return done(c);
}

/** A holly wreath: a ring of leaves with berries, a red ribbon and a bow at the bottom. */
export function wreath(): Rgba {
  const c = canvas();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    c.fill(ellipse(24 + Math.cos(a) * 15, 22 + Math.sin(a) * 15, 6.4, 3.8, a + Math.PI / 2), i % 2 ? LEAF : GREEN, {
      bevel: 2.4,
    });
  }
  for (const k of [0.4, 1.4, 2.4, 3.6, 4.6, 5.6])
    c.fill(ellipse(24 + Math.cos(k) * 15, 22 + Math.sin(k) * 15, 2, 2), RED, { bevel: 1.6 });
  for (const s of [-1, 1] as const) {
    c.fill(
      polygon([
        [24, 38],
        [24 + s * 4, 47],
        [24 + s * 8, 44],
      ]),
      ROSE,
      { bevel: 1.2 },
    );
    c.fill(ellipse(24 + s * 5.6, 37, 5.6, 3.6, s * -0.4), RED, { bevel: 2.6 });
  }
  c.fill(ellipse(24, 37.6, 2.8, 3), ROSE, { bevel: 2 });
  return done(c);
}

/** A stocking hung up: red with a white cuff, a patched heel and toe, a loop to hang it by and a cane poking out. */
export function stocking(): Rgba {
  const c = canvas();
  c.fill(rect(26, 6, 40, 11), RED, { bevel: 1 });
  c.fill(ring(34, 4, 3.4, 1.6), GOLD, { bevel: 1 });
  c.fill(
    polygon([
      [13, 10],
      [33, 10],
      [33, 28],
      [43, 36],
      [41, 45],
      [24, 45],
      [13, 30],
    ]),
    RED,
    { bevel: 3.2 },
  );
  c.fill(rect(11, 6, 35, 14), SNOW, { bevel: 2.6 });
  c.fill(ellipse(36.6, 40, 5, 5), GREEN, { bevel: 2.2 });
  c.fill(ellipse(15.4, 31, 4, 4), GREEN, { bevel: 2.2 });
  for (const t of [0, 1, 2]) c.flat(rect(14 + t * 7, 7.4, 15 + t * 7, 12), SNOW[2]!);
  c.fill(capsule(20, 8, 22, -1, 1.7), SNOW, { bevel: 1.2 });
  c.fill(capsule(22, -1, 26, -1, 1.7), SNOW, { bevel: 1.2 });
  return done(c);
}

export const SANTA = {
  santa,
  elf,
  sleigh,
  sled,
  reindeer,
  antler,
  snow,
  snowflake,
  snowball,
  igloo,
  icicle,
  snowman,
  scarf,
  mitten,
  boot,
  coat,
  present,
  gift,
  bow,
  tag,
  toy,
  teddy,
  drum,
  train,
  doll,
  kite,
  robot,
  candy,
  cane,
  mint,
  cocoa,
  bauble,
  tinsel,
  garland,
  wreath,
  stocking,
};
