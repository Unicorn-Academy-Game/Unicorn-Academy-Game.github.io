import type { Rgba } from '../core/image';
import { type Mesh, newMesh } from '../core/mesh';
import { mulberry32 } from '../core/rng';
import { add, applyM, rotX, TAU, type V3, v3 } from '../core/vec';
import { lathe } from './arch';
import { type GemOpts, gem } from './gems';
import { BLOOM, GEM, type Ramp } from './palette';
import { blob, blobAlong, tube } from './prims';
import { SceneBuilder } from './scene';
import { type Canvas, GOLD_BANDS, glint, noise, r6, render, URN_GLAZES } from './treasure';

/**
 * Vases for the rooms of the palace: four with flowers and three with diamonds. Each stands on the
 * floor at its anchor and is drawn with the same camera and light as everything else. A model has x
 * running east, y away from the viewer and z up.
 */

/**
 * Modelled at full size and drawn at this share of it, so a vase with its flowers is about one and
 * a half times as tall as she is.
 */
const VASE_UNIT = 0.72;
/**
 * Wide enough for a spray of flowers and tall enough for the tallest, with the anchor near the
 * foot.
 */
export const VASE_CANVAS: Canvas = { w: 150, h: 200, ox: 75, oy: 166 };
const draw = (b: SceneBuilder) => render(b, VASE_CANVAS, { unit: VASE_UNIT });

export const FLOWER_VASES = ['rose', 'tulip', 'daisy', 'lilac'] as const;
export const DIAMOND_VASES = ['clear', 'gold', 'spray'] as const;
export type FlowerVase = (typeof FLOWER_VASES)[number];
export type DiamondVase = (typeof DIAMOND_VASES)[number];

/** The picture of a vase's look, which is also its name in the bundle. */
export const vaseSprite = (look: FlowerVase | DiamondVase): string => `ph-vase-${look}`;

const GEM_BANDS = [0.15, 0.4, 0.65, 0.85] as const;
/**
 * A small clear stone needs deeper blues than the big diamond in the treasure house, or its facets
 * all read as white.
 */
const CLEAR_RAMP: Ramp = [
  [48, 62, 148],
  [86, 120, 210],
  [132, 172, 240],
  [184, 216, 255],
  [248, 253, 255],
];
const CLEAR = { bands: [0.22, 0.45, 0.7, 0.9], outline: [40, 54, 130], outlineLit: [70, 100, 180] } as const;
const IVORY = r6('#f6ecdf', 320, 80);
const MINT = r6('#7fd6b0', 190, 110);
const GLASS = r6('#bfe9f4', 215, 140);
const DEEP_PLUM = r6('#5f3a9a', 270, 330);
const LEAF = r6('#3a9a54', 215, 105);
const STEM = r6('#4aa860', 210, 110);

type M = Mesh;

interface Kit {
  gold: M;
  leaf: M;
  stem: M;
  glaze: (name: string, ramp_: Ramp) => M;
  bloom: (name: keyof typeof BLOOM) => M;
  stone: (name: Stone) => M;
}

const STONES = { diamond: CLEAR_RAMP, ruby: GEM.ruby, sapphire: GEM.sapphire, emerald: GEM.emerald } as const;
type Stone = keyof typeof STONES;

function kit(b: SceneBuilder): Kit {
  const made = new Map<string, M>();
  const once = (key: string, make: () => M): M => {
    if (!made.has(key)) made.set(key, make());
    return made.get(key)!;
  };
  return {
    gold: b.mesh(b.solid('gold', b.variant('gold', GEM.gold, { bands: GOLD_BANDS }), noise(7))),
    leaf: b.mesh(b.solid('leaf', b.variant('leaf', LEAF))),
    stem: b.mesh(b.solid('stem', b.variant('stem', STEM))),
    glaze: (name, ramp_) =>
      once(`glaze-${name}`, () => b.mesh(b.solid(`glaze-${name}`, b.variant(`glaze-${name}`, ramp_), noise(3)))),
    bloom: (name) =>
      once(`bloom-${name}`, () => b.mesh(b.solid(`bloom-${name}`, b.variant(`bloom-${name}`, BLOOM[name])))),
    stone: (name) =>
      once(`stone-${name}`, () =>
        b.mesh(
          b.solid(
            `stone-${name}`,
            b.variant(`stone-${name}`, STONES[name], name === 'diamond' ? CLEAR : { bands: GEM_BANDS }),
          ),
        ),
      ),
  };
}

/**
 * A stem from the mouth of a vase to a flower head, bowed a little so a spray does not look like a
 * bundle of rods.
 */
function stemTo(m: Kit, from: V3, to: V3, bow = 0): void {
  const mid = v3((from[0] + to[0]) / 2 + bow, (from[1] + to[1]) / 2, from[2] + (to[2] - from[2]) * 0.55);
  tube(
    m.stem,
    [
      { p: from, r: 2 },
      { p: mid, r: 1.8 },
      { p: to, r: 1.6 },
    ],
    { segs: 6 },
  );
}

/** Leaves that fan from a point and arch outward. */
function leaves(m: Kit, c: V3, n: number, len: number, width: number, seed: number): void {
  const rnd = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rnd() * 0.5;
    const reach = len * (0.7 + rnd() * 0.5);
    blobAlong(
      m.leaf,
      v3(c[0] + Math.cos(a) * reach * 0.5, c[1] + Math.sin(a) * reach * 0.5, c[2] + reach * 0.3),
      v3(reach * 0.5, width, width * 0.5),
      v3(0, 0, 1),
      a,
    );
  }
}

/** A rose: a bud ringed with cupped petals. `r` is the whole flower's radius. */
function rose(mesh: M, c: V3, r: number): void {
  blob(mesh, v3(c[0], c[1], c[2] + r * 0.25), v3(r * 0.55, r * 0.55, r * 0.5), 0, { rings: 6, segs: 8 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + c[0] * 0.3;
    blob(
      mesh,
      v3(c[0] + Math.cos(a) * r * 0.55, c[1] + Math.sin(a) * r * 0.55, c[2] + r * 0.1),
      v3(r * 0.5, r * 0.5, r * 0.42),
      0,
      { rings: 6, segs: 8 },
    );
  }
}

/** A tulip: a cup and three tips. */
function tulip(mesh: M, c: V3): void {
  blob(mesh, v3(c[0], c[1], c[2] + 7), v3(8, 8, 11), 0, { rings: 6, segs: 10 });
  for (const dx of [-5, 0, 5]) blob(mesh, v3(c[0] + dx, c[1], c[2] + 15), v3(3.2, 3.2, 5), 0, { rings: 4, segs: 6 });
}

/** A daisy faces the viewer: a ring of long petals round a golden eye. */
function daisy(petals: M, eye: M, c: V3, r: number): void {
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    blobAlong(
      petals,
      v3(c[0] + Math.cos(a) * r * 0.7, c[1] - 2, c[2] + Math.sin(a) * r * 0.7),
      v3(r * 0.5, r * 0.2, r * 0.22),
      v3(0, 1, 0),
      -a,
      { rings: 4, segs: 6 },
    );
  }
  blob(eye, v3(c[0], c[1] - 4, c[2]), v3(r * 0.36, r * 0.3, r * 0.36), 0, { rings: 5, segs: 8 });
}

/** A round head of tiny flowers, such as a lilac or a hydrangea. */
function cluster(meshes: readonly M[], c: V3, r: number, seed: number): void {
  const rnd = mulberry32(seed);
  for (let i = 0; i < 26; i++) {
    const a = rnd() * TAU,
      e = Math.acos(1 - rnd() * 1.4);
    const d = r * (0.55 + rnd() * 0.45);
    blob(
      meshes[i % meshes.length]!,
      v3(
        c[0] + Math.cos(a) * Math.sin(e) * d,
        c[1] + Math.sin(a) * Math.sin(e) * d * 0.9,
        c[2] + Math.cos(e) * d * 0.9,
      ),
      v3(r * 0.3, r * 0.3, r * 0.28),
      0,
      { rings: 4, segs: 6 },
    );
  }
}

function band(m: Kit, z: number, rad: number, meshes?: M): void {
  lathe(meshes ?? m.gold, {
    c: v3(0, 0, z),
    segs: 26,
    profile: [
      [rad + 0.6, 0],
      [rad + 0.8, 3],
      [rad - 1.6, 3.4],
      [rad - 1.6, 0],
    ],
  });
}

function roseVase(): SceneBuilder {
  const b = new SceneBuilder();
  const k = kit(b);
  lathe(k.glaze('ivory', IVORY), {
    c: v3(0, 0, 0),
    segs: 26,
    smooth: true,
    profile: [
      [17, 0],
      [22, 3],
      [26, 18],
      [27, 42],
      [22, 70],
      [13, 92],
      [14, 100],
      [22, 108],
      [22, 112],
      [17, 112],
    ],
  });
  band(k, 6, 20);
  band(k, 44, 27, k.glaze('rose', URN_GLAZES.rose));
  band(k, 50, 26.6, k.glaze('rose', URN_GLAZES.rose));
  band(k, 108, 22.4);
  const heads: [number, number, number, number, keyof typeof BLOOM][] = [
    [-30, -4, 166, 14, 'rose'],
    [-12, 6, 190, 13, 'pink'],
    [8, -6, 180, 15, 'white'],
    [30, 4, 160, 14, 'coral'],
    [0, -14, 148, 13, 'rose'],
    [-20, 12, 140, 12, 'pink'],
    [22, 12, 138, 12, 'white'],
  ];
  leaves(k, v3(0, 0, 112), 9, 46, 11, 3);
  for (const [x, y, z, r, c] of heads) {
    stemTo(k, v3(x * 0.18, y * 0.18, 112), v3(x, y, z - r * 0.3), x * 0.06);
    rose(k.bloom(c), v3(x, y, z), r);
  }
  return b;
}

function tulipVase(): SceneBuilder {
  const b = new SceneBuilder();
  const k = kit(b);
  lathe(k.glaze('teal', URN_GLAZES.teal), {
    c: v3(0, 0, 0),
    segs: 26,
    smooth: true,
    profile: [
      [18, 0],
      [24, 4],
      [34, 22],
      [38, 42],
      [34, 62],
      [22, 80],
      [14, 92],
      [16, 100],
      [24, 106],
      [22, 108],
      [16, 108],
    ],
  });
  band(k, 6, 22);
  band(k, 40, 38.4);
  band(k, 104, 22.6);
  for (const s of [-1, 1])
    tube(
      k.gold,
      [
        { p: v3(s * 14, 0, 90), r: 2.4 },
        { p: v3(s * 30, 0, 96), r: 2.4 },
        { p: v3(s * 40, 0, 80), r: 2.4 },
        { p: v3(s * 36, 0, 62), r: 2.6 },
      ],
      { segs: 8 },
    );
  const heads: [number, number, number, keyof typeof BLOOM][] = [
    [-34, 2, 148, 'yellow'],
    [-18, -8, 170, 'coral'],
    [0, 6, 182, 'lilac'],
    [18, -6, 166, 'white'],
    [34, 4, 146, 'pink'],
    [-6, -14, 140, 'rose'],
    [12, 14, 150, 'yellow'],
  ];
  leaves(k, v3(0, 0, 108), 8, 52, 7, 5);
  for (const [x, y, z, c] of heads) {
    stemTo(k, v3(x * 0.2, y * 0.2, 108), v3(x, y, z), x * 0.05);
    tulip(k.bloom(c), v3(x, y, z));
  }
  return b;
}

function daisyVase(): SceneBuilder {
  const b = new SceneBuilder();
  const k = kit(b);
  lathe(k.glaze('plum', URN_GLAZES.plum), {
    c: v3(0, 0, 0),
    segs: 26,
    smooth: true,
    profile: [
      [22, 0],
      [30, 4],
      [38, 18],
      [38, 36],
      [30, 52],
      [26, 60],
      [30, 66],
      [34, 70],
      [30, 70],
    ],
  });
  band(k, 8, 28);
  band(k, 30, 38.2);
  band(k, 66, 30.4);
  const petals = k.bloom('white');
  const eye = k.bloom('yellow');
  leaves(k, v3(0, 0, 70), 10, 50, 9, 8);
  const heads: [number, number, number, number][] = [
    [-30, 0, 118, 12],
    [-12, -6, 142, 13],
    [10, 4, 134, 12],
    [30, -2, 114, 12],
    [0, -10, 110, 11],
    [-20, 8, 100, 10],
    [24, 10, 96, 10],
  ];
  for (const [x, y, z, r] of heads) {
    stemTo(k, v3(x * 0.2, y * 0.2, 70), v3(x, y, z), x * 0.04);
    daisy(petals, eye, v3(x, y, z), r);
  }
  // Little blue and pink flowers filling the gaps.
  const filler: [number, number, number, keyof typeof BLOOM][] = [
    [-40, 4, 92, 'sky'],
    [38, 2, 88, 'pink'],
    [-4, 8, 160, 'sky'],
    [18, -4, 160, 'pink'],
    [-28, -6, 150, 'lilac'],
  ];
  for (const [x, y, z, c] of filler) {
    stemTo(k, v3(x * 0.25, y * 0.25, 70), v3(x, y, z), 0);
    blob(k.bloom(c), v3(x, y, z + 3), v3(5, 5, 5), 0, { rings: 5, segs: 8 });
    blob(k.gold, v3(x, y - 3, z + 3), v3(1.8, 1.8, 1.8), 0, { rings: 3, segs: 5 });
  }
  return b;
}

function lilacVase(): SceneBuilder {
  const b = new SceneBuilder();
  const k = kit(b);
  lathe(k.glaze('mint', MINT), {
    c: v3(0, 0, 0),
    segs: 26,
    smooth: true,
    profile: [
      [14, 0],
      [18, 4],
      [22, 30],
      [18, 64],
      [12, 96],
      [16, 110],
      [24, 122],
      [22, 124],
      [16, 124],
    ],
  });
  band(k, 6, 17);
  band(k, 56, 19.4);
  band(k, 120, 23.2);
  const lilac = k.bloom('lilac'),
    sky = k.bloom('sky'),
    pink = k.bloom('pink');
  leaves(k, v3(0, 0, 124), 8, 44, 10, 11);
  const balls: [number, number, number, number][] = [
    [-26, 0, 168, 19],
    [0, -4, 192, 20],
    [26, 2, 166, 18],
    [-6, 10, 150, 15],
    [16, -12, 150, 14],
  ];
  balls.forEach(([x, y, z, r], i) => {
    stemTo(k, v3(x * 0.15, y * 0.15, 124), v3(x, y, z - r * 0.7), x * 0.05);
    cluster(i % 2 === 0 ? [lilac, sky, lilac, pink] : [pink, lilac, pink, sky], v3(x, y, z), r, 20 + i);
  });
  return b;
}

/**
 * A cut stone leaned toward the viewer, so its table and facets show at the camera's height instead
 * of only its top.
 */
function cut(mesh: Mesh, c: V3, r: number, o: GemOpts, lean: number): void {
  const stone = newMesh(mesh.mat, mesh.part);
  gem(stone, v3(0, 0, 0), r, o);
  const tilt = rotX(lean);
  const base = mesh.pos.length / 3;
  for (let i = 0; i < stone.pos.length; i += 3) {
    const p = add(applyM(tilt, [stone.pos[i]!, stone.pos[i + 1]!, stone.pos[i + 2]!]), c);
    const n = applyM(tilt, [stone.nor[i]!, stone.nor[i + 1]!, stone.nor[i + 2]!]);
    mesh.pos.push(...p);
    mesh.rest.push(...p);
    mesh.nor.push(...n);
  }
  mesh.uv.push(...stone.uv);
  for (const i of stone.idx) mesh.idx.push(base + i);
}

interface Pile {
  stones: readonly (readonly [number, number, number, number, Stone])[];
  seed: number;
}

/** Lays stones out as given and returns where to put a glint on each one that faces the viewer. */
function lay(m: Kit, pile: Pile): V3[] {
  const rnd = mulberry32(pile.seed);
  const glints: V3[] = [];
  for (const [x, y, z, r, stone] of pile.stones) {
    cut(
      m.stone(stone),
      v3(x, y, z),
      r,
      { sides: rnd() < 0.5 ? 6 : 8, table: 0.62, crown: 0.42, pavilion: 0.78, yaw: rnd() * TAU },
      0.08 + rnd() * 0.3,
    );
    if (y < 6) glints.push(v3(x - r * 0.3, y - r * 0.45, z + r * 0.35));
  }
  return glints;
}

function clearVase(): { b: SceneBuilder; glints: V3[] } {
  const b = new SceneBuilder();
  const k = kit(b);
  lathe(k.glaze('glass', GLASS), {
    c: v3(0, 0, 0),
    segs: 26,
    smooth: true,
    profile: [
      [18, 0],
      [22, 3],
      [26, 12],
      [28, 40],
      [26, 80],
      [22, 100],
      [24, 106],
      [22, 108],
      [18, 108],
    ],
  });
  lathe(k.gold, {
    c: v3(0, 0, 0),
    segs: 26,
    profile: [
      [22, 0],
      [24, 8],
      [20, 14],
      [18, 14],
      [18, 0],
    ],
  });
  band(k, 104, 24);
  band(k, 50, 28.2);
  const glints = lay(k, {
    seed: 4,
    stones: [
      [-12, 10, 112, 11, 'diamond'],
      [12, 10, 112, 11, 'diamond'],
      [0, 14, 118, 11, 'diamond'],
      [-15, -2, 114, 12, 'diamond'],
      [15, -2, 114, 12, 'diamond'],
      [0, 3, 122, 12, 'diamond'],
      [-9, -9, 118, 13, 'diamond'],
      [9, -9, 118, 13, 'diamond'],
      [0, -5, 130, 14, 'diamond'],
      [-12, 4, 132, 12, 'diamond'],
      [12, 4, 134, 12, 'diamond'],
      [0, -2, 146, 15, 'diamond'],
    ],
  });
  return { b, glints };
}

function goldVase(): { b: SceneBuilder; glints: V3[] } {
  const b = new SceneBuilder();
  const k = kit(b);
  lathe(k.gold, {
    c: v3(0, 0, 0),
    segs: 28,
    smooth: true,
    profile: [
      [20, 0],
      [26, 4],
      [32, 16],
      [36, 36],
      [34, 56],
      [26, 72],
      [20, 82],
      [22, 88],
      [30, 94],
      [32, 98],
      [26, 98],
    ],
  });
  const studs = ['ruby', 'sapphire', 'emerald'] as const;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    blob(k.stone(studs[i % 3]!), v3(Math.cos(a) * 35.4, Math.sin(a) * 35.4, 36), v3(4.6, 4.6, 4.6), 0, {
      rings: 6,
      segs: 8,
    });
  }
  for (const s of [-1, 1])
    tube(
      k.gold,
      [
        { p: v3(s * 22, 0, 84), r: 2.6 },
        { p: v3(s * 40, 0, 88), r: 2.6 },
        { p: v3(s * 46, 0, 72), r: 2.6 },
        { p: v3(s * 40, 0, 56), r: 2.8 },
      ],
      { segs: 8 },
    );
  const glints = lay(k, {
    seed: 9,
    stones: [
      [-16, 12, 100, 11, 'diamond'],
      [16, 12, 100, 11, 'sapphire'],
      [0, 16, 106, 11, 'diamond'],
      [-20, -2, 102, 12, 'ruby'],
      [20, -2, 102, 12, 'diamond'],
      [0, 4, 110, 12, 'diamond'],
      [-12, -10, 106, 13, 'diamond'],
      [12, -10, 106, 13, 'diamond'],
      [0, -6, 118, 14, 'diamond'],
      [-12, 4, 122, 12, 'sapphire'],
      [12, 4, 124, 12, 'diamond'],
      [0, -3, 136, 16, 'diamond'],
    ],
  });
  return { b, glints };
}

function sprayVase(): { b: SceneBuilder; glints: V3[] } {
  const b = new SceneBuilder();
  const k = kit(b);
  lathe(k.glaze('deep', DEEP_PLUM), {
    c: v3(0, 0, 0),
    segs: 26,
    smooth: true,
    profile: [
      [14, 0],
      [18, 3],
      [20, 20],
      [16, 50],
      [10, 82],
      [12, 92],
      [20, 100],
      [18, 102],
      [12, 102],
    ],
  });
  band(k, 6, 16);
  band(k, 96, 20.4);
  band(k, 36, 19.4);
  const buds: [number, number, number, number][] = [
    [-38, 2, 150, 15],
    [-20, -8, 178, 16],
    [0, 6, 198, 18],
    [20, -6, 176, 16],
    [38, 4, 148, 15],
    [-8, -14, 134, 13],
    [14, 12, 140, 13],
  ];
  for (const [x, y, z] of buds) {
    tube(
      k.gold,
      [
        { p: v3(x * 0.2, y * 0.2, 100), r: 2.2 },
        { p: v3(x * 0.7, y * 0.7, 100 + (z - 100) * 0.55), r: 2 },
        { p: v3(x, y, z - 8), r: 1.8 },
      ],
      { segs: 6 },
    );
  }
  const glints = lay(k, { seed: 12, stones: buds.map(([x, y, z, r]) => [x, y, z, r, 'diamond'] as const) });
  return { b, glints };
}

/**
 * Stars of light in the air above and beside the stones, so a vase of diamonds sparkles even when
 * nobody is looking at one stone.
 */
const SPARKLES = {
  clear: [
    [-32, -6, 150, 5],
    [34, -4, 132, 3],
    [10, -14, 168, 2],
  ],
  gold: [
    [-36, -6, 140, 4],
    [36, -4, 118, 5],
    [4, -12, 162, 3],
  ],
  spray: [
    [-54, 0, 172, 4],
    [54, 0, 168, 3],
    [-4, -10, 224, 5],
  ],
} as const satisfies Record<DiamondVase, readonly (readonly [number, number, number, number])[]>;

/** The picture of one look of a vase. */
export function renderVase(look: FlowerVase | DiamondVase): Rgba {
  switch (look) {
    case 'rose':
      return draw(roseVase()).rgba;
    case 'tulip':
      return draw(tulipVase()).rgba;
    case 'daisy':
      return draw(daisyVase()).rgba;
    case 'lilac':
      return draw(lilacVase()).rgba;
    case 'clear':
    case 'gold':
    case 'spray': {
      const made = look === 'clear' ? clearVase() : look === 'gold' ? goldVase() : sprayVase();
      const r = draw(made.b);
      const sparkle = (p: V3, size: number): void => {
        const [x, y] = r.at(p);
        glint(r.rgba, Math.round(x), Math.round(y), size);
      };
      made.glints.forEach((g, i) => {
        sparkle(g, i % 2 === 0 ? 4 : 3);
      });
      for (const [x, y, z, size] of SPARKLES[look]) sparkle(v3(x, y, z), size);
      return r.rgba;
    }
  }
}
