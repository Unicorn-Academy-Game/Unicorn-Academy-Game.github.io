import type { Rgba } from '../core/image';
import { hash2, mulberry32 } from '../core/rng';
import { TAU, type V3, v3 } from '../core/vec';
import { lathe } from './arch';
import type { BloomName } from './flora';
import { BLOOM, FOLIAGE, PALACE, type Ramp } from './palette';
import { blendNormals, blob, box, ribbon, tube } from './prims';
import { renderScene, SceneBuilder } from './scene';
import { stoneKit } from './stone';

export interface Canvas {
  w: number;
  h: number;
  ox: number;
  oy: number;
}
const frame = (c: Canvas, ss = 4) => ({ width: c.w, height: c.h, originX: c.ox, originY: c.oy, ss });

function render(b: SceneBuilder, c: Canvas, extra: Partial<Parameters<typeof renderScene>[1]> = {}): Rgba {
  return renderScene(b, { ...frame(c), aoRadius: 8, lineDepth: 5, ...extra }).rgba;
}

/**
 * A clipped garden hedge: rows of overlapping rounded clumps, shaded as one mass. `axis` is the way
 * it runs on the ground.
 */
export function hedge(o: {
  length: number;
  axis: 'x' | 'y';
  seed: number;
  height?: number;
  roses?: BloomName;
}): SceneBuilder {
  const b = new SceneBuilder();
  const rng = mulberry32(o.seed);
  const h = o.height ?? 44;
  const leaf = b.solid('leaf', b.variant('hedge', PALACE.hedge), (s) => (hash2(s.px, s.py, o.seed) - 0.5) * 0.2);
  const lit = b.solid(
    'leafLit',
    b.variant('hedgeLit', FOLIAGE.emerald),
    (s) => (hash2(s.px, s.py, o.seed + 1) - 0.5) * 0.2,
  );
  const m = b.mesh(leaf);
  const m2 = b.mesh(lit);
  const step = 20;
  const n = Math.max(2, Math.round(o.length / step));
  const at = (t: number, cross: number, z: number): V3 =>
    o.axis === 'x' ? v3(-o.length / 2 + t * o.length, cross, z) : v3(cross, -o.length / 2 + t * o.length, z);
  const R = o.axis === 'x' ? v3(o.length / 2 + 14, 26, h * 0.62) : v3(26, o.length / 2 + 14, h * 0.62);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    for (const cross of [-9, 9]) {
      const r = 15 + rng() * 3.4;
      blob(
        i % 2 === 0 ? m : m2,
        at(t, cross + (rng() - 0.5) * 3, h * 0.46 + (rng() - 0.5) * 2),
        v3(r * 1.15, r * 1.05, r * 1.18),
        rng() * 3,
        { rings: 6, segs: 9 },
      );
    }
    // The low front skirt, so the hedge sits on the ground without a gap.
    blob(m, at(t, -13, h * 0.2), v3(15, 12, 14), 0, { rings: 5, segs: 8 });
    blob(m, at(t, 13, h * 0.2), v3(15, 12, 14), 0, { rings: 5, segs: 8 });
    // A crisp top: flatter blobs along the crest.
    blob(m2, at(t, 0, h * 0.78), v3(15, 14, 11), rng() * 3, { rings: 5, segs: 8 });
  }
  blendNormals(m, v3(0, 0, h * 0.4), R, 0.35);
  blendNormals(m2, v3(0, 0, h * 0.5), R, 0.35);
  if (o.roses) {
    const petals = b.solid('petal', b.variant('petal', BLOOM[o.roses], { noLines: true, priority: 2 }));
    const pm = b.mesh(petals, { noLines: true });
    const count = Math.round(o.length / 11);
    for (let i = 0; i < count; i++) {
      const t = rng();
      const z = h * (0.4 + rng() * 0.5);
      blob(pm, at(t, -(18 + rng() * 5), z), v3(4.4, 3.6, 4.4), 0, { rings: 4, segs: 6 });
    }
  }
  return b;
}

export const hedgeCanvas = (length: number, axis: 'x' | 'y'): Canvas =>
  axis === 'x'
    ? { w: length + 80, h: 130, ox: (length + 80) / 2, oy: 92 }
    : { w: 110, h: Math.round(length * 0.454) + 130, ox: 55, oy: Math.round(length * 0.227) + 92 };
export const renderHedge = (o: Parameters<typeof hedge>[0]): Rgba =>
  render(hedge(o), hedgeCanvas(o.length, o.axis), { aoRadius: 7 });

export const TOPIARY_CANVAS: Canvas = { w: 150, h: 250, ox: 75, oy: 214 };

export function topiary(shape: 'ball' | 'spiral' | 'tiers'): SceneBuilder {
  const b = new SceneBuilder();
  const k = stoneKit(b, 20);
  const urn = b.mesh(k.marble);
  lathe(urn, {
    c: v3(0, 0, 0),
    segs: 24,
    smooth: true,
    profile: [
      [22, 0],
      [22, 5],
      [17, 9],
      [14, 14],
      [18, 24],
      [26, 34],
      [28, 40],
      [30, 44],
      [27, 44],
      [22, 40],
    ],
  });
  const gold = b.mesh(k.gold);
  lathe(gold, {
    c: v3(0, 0, 36),
    segs: 24,
    smooth: true,
    profile: [
      [27.4, 0],
      [29, 2.4],
      [27.4, 4.8],
      [26, 4.8],
    ],
  });
  const soil = b.mesh(
    b.solid(
      'soil',
      b.variant(
        'soil',
        [
          [62, 44, 34],
          [86, 62, 46],
        ] as Ramp,
        { noLines: true },
      ),
    ),
  );
  lathe(soil, {
    c: v3(0, 0, 41),
    segs: 20,
    profile: [
      [23, 0],
      [0, 0],
    ],
  });
  const leaf = b.solid('leaf', b.variant('topiary', FOLIAGE.lime), (s) => (hash2(s.px, s.py, 52) - 0.5) * 0.22);
  const trunk = b.mesh(b.solid('trunk', b.variant('trunk', FOLIAGE.spruce)));
  const m = b.mesh(leaf);
  const rng = mulberry32(shape.length * 17 + 5);
  const clump = (c: V3, r: number, n = 9): void => {
    blob(m, c, v3(r, r, r * 0.98), 0, { rings: 9, segs: 14 });
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU,
        e = (rng() - 0.3) * 1.6,
        rr = r * (0.22 + rng() * 0.12);
      blob(
        m,
        v3(
          c[0] + Math.cos(a) * Math.cos(e) * r * 0.86,
          c[1] + Math.sin(a) * Math.cos(e) * r * 0.86,
          c[2] + Math.sin(e) * r * 0.86,
        ),
        v3(rr, rr, rr),
        0,
        { rings: 4, segs: 6 },
      );
    }
  };
  if (shape === 'ball') {
    tube(
      trunk,
      [
        { p: v3(0, 0, 42), r: 3.2 },
        { p: v3(0, 0, 70), r: 3 },
      ],
      { segs: 6, n: 6 },
    );
    clump(v3(0, 0, 100), 32);
  } else if (shape === 'tiers') {
    tube(
      trunk,
      [
        { p: v3(0, 0, 42), r: 3 },
        { p: v3(0, 0, 66), r: 2.8 },
      ],
      { segs: 6, n: 6 },
    );
    clump(v3(0, 0, 80), 22, 6);
    clump(v3(0, 0, 112), 17, 5);
    clump(v3(0, 0, 138), 12, 4);
  } else {
    // A cone that twists: rings of clumps that narrow as they climb and wind around the axis.
    for (let i = 0; i < 26; i++) {
      const t = i / 25;
      const r = 28 * (1 - t) + 4;
      const a = t * TAU * 2.4;
      blob(m, v3(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.4, 52 + t * 96), v3(r * 0.78, r * 0.7, 9), a, {
        rings: 5,
        segs: 8,
      });
    }
    blob(m, v3(0, 0, 70), v3(24, 22, 24), 0, { rings: 7, segs: 10 });
  }
  return b;
}

export const renderTopiary = (shape: 'ball' | 'spiral' | 'tiers'): Rgba =>
  render(topiary(shape), TOPIARY_CANVAS, { aoRadius: 8 });

export const BENCH_CANVAS: Canvas = { w: 200, h: 130, ox: 100, oy: 94 };

export function bench(): SceneBuilder {
  const b = new SceneBuilder();
  const k = stoneKit(b, 23);
  const stone = b.mesh(k.marble);
  const seat = b.mesh(k.marbleSmooth);
  box(seat, v3(0, 0, 29), v3(128, 34, 8));
  for (const sx of [-1, 1]) {
    // A curled marble end: a block, a column and a scroll on top.
    box(stone, v3(sx * 52, 0, 12), v3(16, 34, 24));
    lathe(stone, {
      c: v3(sx * 62, 0, 0),
      segs: 14,
      smooth: true,
      profile: [
        [11, 0],
        [11, 4],
        [7, 9],
        [6, 24],
        [8, 30],
        [10, 36],
        [8, 40],
        [4, 40],
      ],
    });
  }
  // The back: a rail and a row of balusters.
  const back = b.mesh(k.marbleSmooth);
  box(back, v3(0, 14, 58), v3(128, 7, 7));
  const gold = b.mesh(k.gold);
  box(gold, v3(0, 11.2, 62), v3(120, 1.6, 2.4));
  for (let i = -5; i <= 5; i++)
    lathe(stone, {
      c: v3(i * 11, 14, 33),
      segs: 8,
      smooth: true,
      profile: [
        [2.8, 0],
        [4, 4],
        [2.6, 10],
        [2.6, 16],
        [4, 20],
        [2.8, 24],
        [0, 25],
      ],
    });
  for (const sx of [-1, 1])
    lathe(gold, {
      c: v3(sx * 62, 0, 40),
      segs: 10,
      smooth: true,
      profile: [
        [2, 0],
        [4.4, 4],
        [2, 8],
        [0, 9],
      ],
    });
  return b;
}

export const renderBench = (): Rgba => render(bench(), BENCH_CANVAS, { aoRadius: 7 });

export const URN_CANVAS: Canvas = { w: 150, h: 190, ox: 75, oy: 156 };

export function urn(o: { seed: number; blooms: readonly [BloomName, BloomName] }): SceneBuilder {
  const b = new SceneBuilder();
  const k = stoneKit(b, 30 + o.seed);
  const stone = b.mesh(k.marble);
  lathe(stone, {
    c: v3(0, 0, 0),
    segs: 24,
    smooth: true,
    profile: [
      [24, 0],
      [24, 5],
      [17, 9],
      [13, 15],
      [16, 26],
      [24, 38],
      [27, 46],
      [30, 52],
      [31, 56],
      [27, 56],
      [24, 52],
    ],
  });
  const gold = b.mesh(k.gold);
  lathe(gold, {
    c: v3(0, 0, 30),
    segs: 24,
    smooth: true,
    profile: [
      [21.4, 0],
      [23, 2.4],
      [21.4, 4.8],
      [20, 4.8],
    ],
  });
  const rng = mulberry32(o.seed * 31 + 9);
  const leafA = b.solid('leafA', b.variant('leafA', FOLIAGE.emerald), (s) => (hash2(s.px, s.py, 3) - 0.5) * 0.2);
  const leafB = b.solid('leafB', b.variant('leafB', FOLIAGE.lime), (s) => (hash2(s.px, s.py, 4) - 0.5) * 0.2);
  const m = b.mesh(leafA);
  const m2 = b.mesh(leafB);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + rng() * 0.4,
      d = 8 + rng() * 14;
    blob(i % 2 ? m : m2, v3(Math.cos(a) * d, Math.sin(a) * d * 0.8, 62 + rng() * 14), v3(13, 12, 11), a, {
      rings: 6,
      segs: 8,
    });
  }
  // Leaves that spill over the rim.
  const spill = b.mesh(leafB, { twoSided: true, noLines: true });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + 0.3;
    ribbon(
      spill,
      [
        { p: v3(Math.cos(a) * 18, Math.sin(a) * 14, 58), w: 5, t: 1 },
        { p: v3(Math.cos(a) * 28, Math.sin(a) * 22, 54), w: 4.4, t: 1 },
        { p: v3(Math.cos(a) * 32, Math.sin(a) * 26, 40), w: 1, t: 0.8 },
      ],
      v3(0, 0, 1),
      5,
    );
  }
  const petalMats = o.blooms.map((c, i) =>
    b.mesh(b.solid(`petal${i}`, b.variant(`petal${i}`, BLOOM[c], { noLines: true })), { noLines: true }),
  );
  const centre = b.mesh(b.solid('centre', b.variant('centre', BLOOM.yellow, { noLines: true, priority: 2 })), {
    noLines: true,
  });
  for (let i = 0; i < 9; i++) {
    const a = rng() * TAU,
      d = rng() * 20;
    const x = Math.cos(a) * d,
      y = Math.sin(a) * d * 0.7,
      z = 72 + rng() * 22;
    const r = 5.4 + rng() * 2;
    for (let p = 0; p < 6; p++) {
      const pa = (p / 6) * TAU;
      blob(
        petalMats[i % 2]!,
        v3(x + Math.cos(pa) * r * 0.9, y - 2, z + Math.sin(pa) * r * 0.9),
        v3(r * 0.62, r * 0.4, r * 0.62),
        0,
        { rings: 4, segs: 6 },
      );
    }
    blob(centre, v3(x, y - 3.4, z), v3(r * 0.45, r * 0.3, r * 0.45), 0, { rings: 4, segs: 6 });
  }
  return b;
}

export const renderUrn = (o: Parameters<typeof urn>[0]): Rgba => render(urn(o), URN_CANVAS, { aoRadius: 7 });

export const PILLAR_CANVAS: Canvas = { w: 130, h: 290, ox: 65, oy: 252 };

/** A square marble pillar with a gold ball. Two of them make a gate. */
export function pillar(o: { vines: boolean }): SceneBuilder {
  const b = new SceneBuilder();
  const k = stoneKit(b, 40);
  const stone = b.mesh(k.marble);
  box(stone, v3(0, 0, 8), v3(52, 52, 16));
  box(stone, v3(0, 0, 14), v3(46, 46, 6));
  const shaft = b.mesh(k.marble);
  box(shaft, v3(0, 0, 90), v3(38, 38, 150));
  box(stone, v3(0, 0, 167), v3(48, 48, 10));
  box(stone, v3(0, 0, 175), v3(42, 42, 7));
  const gold = b.mesh(k.gold);
  box(gold, v3(0, 0, 160), v3(41, 41, 3));
  lathe(gold, {
    c: v3(0, 0, 178),
    segs: 16,
    smooth: true,
    profile: [
      [10, 0],
      [13, 6],
      [14, 14],
      [12, 22],
      [7, 28],
      [0, 30],
    ],
  });
  if (o.vines) {
    const rng = mulberry32(7);
    const leaf = b.solid('vine', b.variant('vine', FOLIAGE.emerald), (s) => (hash2(s.px, s.py, 2) - 0.5) * 0.2);
    const m = b.mesh(leaf, { noLines: true });
    for (let i = 0; i < 10; i++)
      blob(m, v3(-14 + rng() * 14, -20.5, 20 + i * 12 + rng() * 8), v3(7 + rng() * 3, 4, 7), rng() * 3, {
        rings: 5,
        segs: 7,
      });
    const pink = b.mesh(b.solid('blossom', b.variant('blossom', BLOOM.pink, { noLines: true, priority: 2 })), {
      noLines: true,
    });
    for (let i = 0; i < 6; i++)
      blob(pink, v3(-16 + rng() * 14, -23, 24 + i * 18), v3(3.6, 2.6, 3.6), 0, { rings: 4, segs: 6 });
  }
  return b;
}

export const renderPillar = (vines: boolean): Rgba =>
  render(pillar({ vines }), PILLAR_CANVAS, { aoRadius: 8, shadowFit: true, shadowBias: 2.6 });
