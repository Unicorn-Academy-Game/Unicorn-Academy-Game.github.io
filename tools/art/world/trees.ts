import type { SampleInfo } from '../core/render';
import { hash2, mulberry32, noise3 } from '../core/rng';
import { type V3, v3 } from '../core/vec';
import { BARK, BIRCH, FOLIAGE, type Ramp } from './palette';
import { blendNormals, blob, ribbon, tube } from './prims';
import { SceneBuilder } from './scene';

export type FoliageName = keyof typeof FOLIAGE;

/**
 * Leaf texture: a pixel-level dither that breaks cel bands into leafy speckle, plus slow variation
 * across the crown.
 */
function leafBias(seed: number, amount = 0.2) {
  return (s: SampleInfo): number => {
    const speck = hash2(s.px, s.py, seed) - 0.5;
    const drift = noise3(s.rest[0] * 0.05, s.rest[1] * 0.05, s.rest[2] * 0.05, seed) - 0.5;
    return speck * amount + drift * 0.16;
  };
}

function barkBias(seed: number, streaks = 5) {
  return (s: SampleInfo): number =>
    Math.sin(s.v * Math.PI * 2 * streaks + noise3(s.rest[0] * 0.08, s.rest[1] * 0.08, s.rest[2] * 0.05, seed) * 6) *
      0.1 +
    (hash2(s.px, s.py, seed) - 0.5) * 0.08;
}

/**
 * What a tree bears: round fruit on the side of the crown that faces the camera, bright against the
 * leaves.
 */
export interface Fruit {
  ramp: Ramp;
  count: number;
  /** Radius in pixels on a tree of scale 1. */
  size: number;
}

export interface TreeOpts {
  seed: number;
  foliage: FoliageName;
  /** Overall scale, 1 is a full-grown tree about 340 px tall. */
  scale?: number;
  /** Only an oak bears fruit. */
  fruit?: Fruit;
}

interface Lobe {
  c: V3;
  r: V3;
  /** Clump counts: large body clumps, mid shell clumps, small rim bumps. */
  big: number;
  mid: number;
  rim: number;
}

/**
 * A crown built from lobes, each a ball of small leaf clumps. A lobe is one mesh whose normals lean
 * toward the lobe's own center, so lobes read as rounded masses with their own lit side while every
 * clump stays scalloped.
 */
function crown(
  b: SceneBuilder,
  mat: number,
  rng: () => number,
  lobes: readonly Lobe[],
  k: number,
  clump: number,
  blend = 0.55,
): void {
  const part = b.newPart();
  for (const lobe of lobes) {
    const m = b.mesh(mat, { part });
    const sample = (shellOnly: boolean): V3 => {
      let x: number, y: number, z: number, d: number;
      do {
        x = rng() * 2 - 1;
        y = rng() * 2 - 1;
        z = rng() * 2 - 1;
        d = Math.hypot(x, y, z);
      } while (d > 1 || (shellOnly && d < 0.76) || z < -0.6);
      return v3(lobe.c[0] + x * lobe.r[0], lobe.c[1] + y * lobe.r[1], lobe.c[2] + z * lobe.r[2]);
    };
    const put = (n: number, rMin: number, rMax: number, shell: boolean): void => {
      for (let i = 0; i < n; i++) {
        const r = (rMin + rng() * (rMax - rMin)) * k * clump;
        blob(m, sample(shell), v3(r, r * (0.78 + rng() * 0.22), r * 0.82), rng() * 3, { rings: 7, segs: 10 });
      }
    };
    put(lobe.big, 26, 38, false);
    put(lobe.mid, 17, 27, true);
    put(lobe.rim, 9, 14, true);
    blendNormals(m, lobe.c, lobe.r, blend);
  }
}

function limb(b: SceneBuilder, mat: number, from: V3, to: V3, r0: number, r1: number): void {
  const m = b.mesh(mat, { part: 1 });
  const mid: V3 = v3(
    (from[0] + to[0]) / 2 + (to[1] - from[1]) * 0.08,
    (from[1] + to[1]) / 2,
    (from[2] + to[2]) / 2 + 6,
  );
  tube(
    m,
    [
      { p: from, r: r0 },
      { p: mid, r: (r0 + r1) / 2 },
      { p: to, r: r1 },
    ],
    { segs: 8 },
  );
}

/**
 * A broad, lobed, round-crowned tree on a stout trunk with a flared base, roots and limbs that show
 * under the crown.
 */
export function oak(o: TreeOpts): SceneBuilder {
  const k = o.scale ?? 1;
  const rng = mulberry32(o.seed);
  const b = new SceneBuilder();
  const bark = b.variant('bark', BARK);
  const leaf = b.variant('leaf', FOLIAGE[o.foliage]);
  const trunkMat = b.solid('trunk', bark, barkBias(o.seed));
  const leafMat = b.solid('leaf', leaf, leafBias(o.seed));

  const lean = (rng() - 0.5) * 18;
  const trunk = b.mesh(trunkMat, { part: 1 });
  tube(
    trunk,
    [
      { p: v3(0, 0, -8), r: 42 * k, rh: 40 * k },
      { p: v3(0, 0, 14 * k), r: 33 * k },
      { p: v3(lean * 0.3, 0, 60 * k), r: 25 * k },
      { p: v3(lean * 0.7, 2, 120 * k), r: 20 * k },
      { p: v3(lean, 4, 180 * k), r: 16 * k },
    ],
    { segs: 16, capEnd: true },
  );
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rng() * 0.7;
    const root = b.mesh(trunkMat, { part: 1 });
    blob(root, v3(Math.cos(a) * 32 * k, Math.sin(a) * 26 * k, 4 * k), v3(26 * k, 12 * k, 11 * k), a, {
      rings: 6,
      segs: 10,
    });
  }
  // Limbs go from the trunk's top into each lobe.
  const lobes: Lobe[] = [
    { c: v3(lean, 0, 268 * k), r: v3(98 * k, 84 * k, 74 * k), big: 30, mid: 52, rim: 22 },
    { c: v3(lean - 98 * k, -6, 228 * k), r: v3(66 * k, 60 * k, 52 * k), big: 12, mid: 28, rim: 14 },
    { c: v3(lean + 96 * k, 8, 238 * k), r: v3(70 * k, 62 * k, 56 * k), big: 14, mid: 30, rim: 14 },
    { c: v3(lean + 10 * k, 54 * k, 322 * k), r: v3(66 * k, 54 * k, 50 * k), big: 12, mid: 26, rim: 12 },
  ];
  for (const l of lobes.slice(1, 3))
    limb(b, trunkMat, v3(lean, 3, 172 * k), v3(l.c[0] * 0.8 + lean * 0.2, l.c[1], l.c[2] - 36 * k), 12 * k, 6 * k);
  crown(b, leafMat, rng, lobes, k, 1);
  if (o.fruit) bear(b, lobes, o.fruit, o.seed, k);
  return b;
}

/**
 * Fruit hangs on the shell of the three big lobes, on the half that faces the camera (negative y),
 * at heights from the lobe's waist to its crest. Each piece keeps its own colour through the
 * shading, so an apple stays an apple.
 */
function bear(b: SceneBuilder, lobes: readonly Lobe[], fruit: Fruit, seed: number, k: number): void {
  const rng = mulberry32(seed * 977 + 13);
  const mat = b.solid(
    'fruit',
    b.variant('fruit', fruit.ramp, { protect: true, priority: 2 }),
    (s) => (hash2(s.px, s.py, seed) - 0.5) * 0.06,
  );
  for (let i = 0; i < fruit.count; i++) {
    const lobe = lobes[Math.floor(rng() * 3)]!;
    const az = Math.PI * (1.12 + rng() * 0.76);
    const el = -0.1 + rng() * 1.0;
    const c = Math.cos(el),
      s = Math.sin(el);
    // A little beyond the lobe, where the outermost leaf clumps end, so nothing covers it.
    const reach = 1.12;
    const p = v3(
      lobe.c[0] + Math.cos(az) * c * lobe.r[0] * reach,
      lobe.c[1] + Math.sin(az) * c * lobe.r[1] * reach,
      lobe.c[2] + s * lobe.r[2] * reach,
    );
    const r = fruit.size * k * (0.9 + rng() * 0.2);
    blob(b.mesh(mat, { noLines: true }), p, v3(r, r, r), 0, { rings: 6, segs: 9 });
  }
}

/** A tall conifer: tiers of drooping clump rings that narrow toward the top. */
export function fir(o: TreeOpts): SceneBuilder {
  const k = o.scale ?? 1;
  const rng = mulberry32(o.seed);
  const b = new SceneBuilder();
  const bark = b.variant('bark', BARK);
  const leaf = b.variant('leaf', FOLIAGE[o.foliage]);
  const trunkMat = b.solid('trunk', bark, barkBias(o.seed, 4));
  const leafMat = b.solid('leaf', leaf, leafBias(o.seed, 0.22));
  const trunk = b.mesh(trunkMat, { part: 1 });
  tube(
    trunk,
    [
      { p: v3(0, 0, -6), r: 28 * k },
      { p: v3(0, 0, 40 * k), r: 20 * k },
      { p: v3(0, 0, 150 * k), r: 11 * k },
    ],
    { segs: 12 },
  );
  const tiers = 6;
  const part = b.newPart();
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1);
    const z = (62 + t * 52) * k;
    const radius = (112 - f * 82) * k;
    const m = b.mesh(leafMat, { part });
    const count = Math.round(14 - f * 6);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rng() * 0.4 + t;
      const rr = radius * (0.72 + rng() * 0.3);
      // Each clump droops outward and downward, like a bough end.
      const cl = (24 - f * 8) * k * (0.85 + rng() * 0.3);
      blob(
        m,
        v3(Math.cos(a) * rr, Math.sin(a) * rr * 0.9, z - rr * 0.18 + rng() * 8),
        v3(cl * 1.15, cl * 0.95, cl * 0.8),
        a,
        { rings: 7, segs: 10 },
      );
    }
    // The tier's core, so the tier is dense toward its middle.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + rng();
      const rr = radius * 0.42 * rng();
      const cl = (28 - f * 8) * k;
      blob(m, v3(Math.cos(a) * rr, Math.sin(a) * rr, z + 10 * k), v3(cl, cl * 0.9, cl * 0.8), a, {
        rings: 7,
        segs: 10,
      });
    }
    blendNormals(m, v3(0, 0, z + 20 * k), v3(radius * 1.2, radius * 1.2, 56 * k), 0.5);
  }
  const top = b.mesh(leafMat, { part });
  blob(top, v3(0, 0, (62 + tiers * 52 - 20) * k), v3(20 * k, 18 * k, 34 * k), 0, { rings: 8, segs: 10 });
  return b;
}

/** A slim white-barked tree with an airy crown of small lobes. */
export function birch(o: TreeOpts): SceneBuilder {
  const k = o.scale ?? 1;
  const rng = mulberry32(o.seed);
  const b = new SceneBuilder();
  const bark = b.variant('birch', BIRCH);
  const mark = b.variant('mark', [
    [34, 28, 40],
    [52, 46, 60],
    [74, 68, 86],
    [96, 90, 112],
    [120, 114, 134],
    [150, 144, 164],
  ] as Ramp);
  const leaf = b.variant('leaf', FOLIAGE[o.foliage]);
  const trunkMat = b.material({
    name: 'birch',
    // Dark chevron scars across the pale bark.
    shade: (s) =>
      Math.sin(s.rest[2] * 0.21 + s.v * 6.283 * 2) > 0.8 &&
      hash2(Math.floor(s.rest[2] / 9), Math.floor(s.v * 8), o.seed) > 0.55
        ? mark
        : bark,
    bias: (s) => (hash2(s.px, s.py, o.seed) - 0.5) * 0.08,
  });
  const leafMat = b.solid('leaf', leaf, leafBias(o.seed, 0.24));
  const lean = (rng() - 0.5) * 24;
  const trunk = b.mesh(trunkMat, { part: 1 });
  tube(
    trunk,
    [
      { p: v3(0, 0, -6), r: 20 * k },
      { p: v3(lean * 0.2, 0, 50 * k), r: 15 * k },
      { p: v3(lean * 0.6, 3, 140 * k), r: 11 * k },
      { p: v3(lean, 6, 230 * k), r: 8 * k },
    ],
    { segs: 12 },
  );
  const lobes: Lobe[] = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng();
    const h = 205 + rng() * 120;
    const spread = 38 + rng() * 40;
    lobes.push({
      c: v3(lean + Math.cos(a) * spread * k, Math.sin(a) * spread * 0.8 * k, h * k),
      r: v3(44 * k, 38 * k, 40 * k),
      big: 6,
      mid: 18,
      rim: 8,
    });
  }
  lobes.push({ c: v3(lean, 0, 300 * k), r: v3(50 * k, 44 * k, 44 * k), big: 8, mid: 18, rim: 8 });
  for (const l of lobes.slice(0, 3))
    limb(
      b,
      trunkMat,
      v3(lean * 0.6, 3, 150 * k),
      v3(l.c[0] * 0.7 + lean * 0.3, l.c[1] * 0.7, l.c[2] - 30 * k),
      7 * k,
      3.5 * k,
    );
  crown(b, leafMat, rng, lobes, k, 0.95);
  return b;
}

/** A tree with long drooping curtains of leaves. */
export function willow(o: TreeOpts): SceneBuilder {
  const k = o.scale ?? 1;
  const rng = mulberry32(o.seed);
  const b = new SceneBuilder();
  const bark = b.variant('bark', BARK);
  const leaf = b.variant('leaf', FOLIAGE[o.foliage]);
  const trunkMat = b.solid('trunk', bark, barkBias(o.seed, 6));
  const leafMat = b.solid('leaf', leaf, leafBias(o.seed, 0.2));
  const trunk = b.mesh(trunkMat, { part: 1 });
  tube(
    trunk,
    [
      { p: v3(0, 0, -8), r: 38 * k },
      { p: v3(-6, 0, 40 * k), r: 28 * k },
      { p: v3(4, 4, 100 * k), r: 22 * k },
      { p: v3(-2, 8, 160 * k), r: 17 * k },
    ],
    { segs: 14 },
  );
  const lobes: Lobe[] = [{ c: v3(0, 4, 215 * k), r: v3(110 * k, 92 * k, 52 * k), big: 20, mid: 44, rim: 18 }];
  crown(b, leafMat, rng, lobes, k, 1);
  // Curtains: ribbons hanging from the crown's rim, swaying a little.
  const hang = b.mesh(leafMat, { twoSided: true });
  const count = 26;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rng() * 0.2;
    const rx = (96 + rng() * 22) * k,
      ry = (80 + rng() * 18) * k;
    const x = Math.cos(a) * rx,
      y = Math.sin(a) * ry;
    const len = (110 + rng() * 80) * k;
    const sway = (rng() - 0.5) * 10 * k;
    ribbon(
      hang,
      [
        { p: v3(x, y, 212 * k), w: 9 * k, t: 3 * k },
        { p: v3(x * 1.03 + sway, y * 1.03, 212 * k - len * 0.5), w: 8 * k, t: 3 * k },
        { p: v3(x * 1.06 + sway * 2, y * 1.06, 212 * k - len), w: 4 * k, t: 2 * k },
      ],
      v3(0, -1, 0.2),
      6,
    );
  }
  return b;
}
