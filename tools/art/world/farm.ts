import { hex, ramp } from '../core/color';
import type { Rgba } from '../core/image';
import { hash2, mulberry32 } from '../core/rng';
import { TAU, type V3, v3 } from '../core/vec';
import { lathe } from './arch';
import { BLOOM, FOLIAGE, type Ramp } from './palette';
import { blendNormals, blob, box, ribbon, tube } from './prims';
import { renderScene, SceneBuilder } from './scene';
import type { Fruit } from './trees';

/**
 * The farm: beds of vegetables, a scarecrow who smiles, crates and baskets, and a picket fence.
 * Everything is built in world space with z up and +y away from the camera, like the rest of the
 * grounds. Nothing here is alive, so it is all still.
 */

const tone = (base: string, shadowHue = 320, lightHue = 70): Ramp =>
  ramp(hex(base), { steps: 6, shadowHue, lightHue, lean: 1, lightness: [-0.32, -0.21, -0.1, 0, 0.09, 0.17] });

const SOIL = tone('#6b4a36', 320, 60);
const PLANK = tone('#b27c52', 320, 70);
const WOOD_PALE = tone('#d9b07a', 320, 80);
const RED = tone('#e8403f', 330, 50);
const TOMATO = tone('#f0482f', 335, 45);
const ORANGE = tone('#f2862b', 335, 60);
const PUMPKIN = tone('#f08a24', 335, 65);
const STRAW = tone('#e8c85a', 340, 90);
const SACK = tone('#ecd5a8', 320, 85);
const BERRY = tone('#6fa8ff', 275, 190);
const STRAWBERRY = tone('#f0457a', 330, 40);
const CABBAGE = tone('#86d46f', 200, 105);
const CABBAGE_OUTER = tone('#4fa58a', 220, 130);
const SHIRT = tone('#8f6edb', 285, 340);
const PATCH = tone('#ee6f9f', 325, 55);
const COAL: Ramp = [
  [26, 20, 34],
  [44, 36, 56],
  [70, 60, 86],
];

/** What the orchard's trees bear, for the `fruit` option of the oak in trees.ts. */
export const APPLES: Fruit = { ramp: RED, count: 28, size: 12.5 };
export const SKY_BERRIES: Fruit = { ramp: BERRY, count: 46, size: 9.2 };

const leafBias =
  (seed: number, amount = 0.2) =>
  (s: { px: number; py: number }): number =>
    (hash2(s.px, s.py, seed) - 0.5) * amount;

export interface Canvas {
  w: number;
  h: number;
  ox: number;
  oy: number;
}

const draw = (b: SceneBuilder, c: Canvas, extra: Partial<Parameters<typeof renderScene>[1]> = {}): Rgba =>
  renderScene(b, { width: c.w, height: c.h, originX: c.ox, originY: c.oy, ss: 4, aoRadius: 7, lineDepth: 4, ...extra })
    .rgba;

export const CROPS = ['carrot', 'tomato', 'strawberry', 'pumpkin', 'cabbage', 'berry'] as const;
export type Crop = (typeof CROPS)[number];

export const BED_CANVAS: Canvas = { w: 248, h: 168, ox: 124, oy: 126 };
/** The bed's footprint on the ground, in world pixels, so the map can block it. */
export const BED = { w: 184, d: 68 } as const;

interface Kit {
  b: SceneBuilder;
  rng: () => number;
  leaf: number;
  leafLight: number;
  petal: number;
}

/** One plant of a bed, standing at (x, y) on the soil. */
function plant(k: Kit, crop: Crop, x: number, y: number, seed: number): void {
  const { b, rng, leaf, leafLight } = k;
  const top = 14;
  const jitter = (n: number): number => (rng() - 0.5) * n;
  switch (crop) {
    case 'carrot': {
      const tops = b.mesh(leaf, { twoSided: true });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + rng() * 0.5;
        const len = 20 + rng() * 10;
        const out = 8 + rng() * 6;
        ribbon(
          tops,
          [
            { p: v3(x, y, top), w: 3.2, t: 1 },
            { p: v3(x + Math.cos(a) * out * 0.5, y + Math.sin(a) * out * 0.5, top + len * 0.55), w: 3.6, t: 1 },
            { p: v3(x + Math.cos(a) * out, y + Math.sin(a) * out, top + len), w: 0.9, t: 0.7 },
          ],
          v3(Math.sin(a), -Math.cos(a), 0.2),
          5,
        );
      }
      const root = b.mesh(b.solid('carrot', b.variant('carrot', ORANGE, { protect: true, priority: 2 })), {
        noLines: true,
      });
      blob(root, v3(x, y - 1.5, top + 0.5), v3(5.6, 5, 3.6), 0, { rings: 5, segs: 8 });
      return;
    }
    case 'cabbage': {
      const outer = b.mesh(b.solid('cabbageOuter', b.variant('cabbageOuter', CABBAGE_OUTER), leafBias(seed + 1, 0.16)));
      blob(outer, v3(x, y, top + 8), v3(17, 15, 11), rng() * 3, { rings: 8, segs: 12 });
      for (const side of [-1, 1])
        blob(outer, v3(x + side * 12, y - 1, top + 5), v3(10, 11, 7), side * 0.5, { rings: 6, segs: 9 });
      const inner = b.mesh(b.solid('cabbage', b.variant('cabbage', CABBAGE), leafBias(seed + 2, 0.14)));
      blob(inner, v3(x, y - 1.5, top + 13), v3(12.4, 11.4, 11.4), 0, { rings: 8, segs: 11 });
      blob(inner, v3(x - 3, y - 4, top + 17), v3(7, 6, 6.4), 0.6, { rings: 6, segs: 9 });
      return;
    }
    case 'strawberry': {
      const lm = b.mesh(leaf);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + rng();
        const d = 5 + rng() * 5;
        blob(lm, v3(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, top + 4 + rng() * 3), v3(8.6, 7.4, 4.6), a, {
          rings: 5,
          segs: 8,
        });
      }
      const fruit = b.mesh(b.solid('strawberry', b.variant('strawberry', STRAWBERRY, { protect: true, priority: 2 })), {
        noLines: true,
      });
      for (let i = 0; i < 3; i++) {
        const a = Math.PI * (1.15 + rng() * 0.7);
        blob(fruit, v3(x + Math.cos(a) * 12, y + Math.sin(a) * 11 - 2, top + 3.4), v3(4.8, 4.6, 5.4), 0, {
          rings: 5,
          segs: 8,
        });
      }
      if (rng() > 0.4) {
        const fl = b.mesh(k.petal, { noLines: true });
        blob(fl, v3(x + jitter(8), y - 8, top + 10), v3(3.2, 2.2, 3.2), 0, { rings: 4, segs: 6 });
      }
      return;
    }
    case 'tomato': {
      const stake = b.mesh(b.solid('stake', b.variant('stake', WOOD_PALE)), { noLines: true });
      tube(
        stake,
        [
          { p: v3(x, y + 6, top - 2), r: 1.5 },
          { p: v3(x, y + 6, top + 50), r: 1.3 },
        ],
        { segs: 5, n: 4 },
      );
      const lm = b.mesh(leaf);
      for (let i = 0; i < 4; i++)
        blob(lm, v3(x + jitter(10), y + jitter(6) + 2, top + 10 + i * 9), v3(11, 8.6, 7.4), rng() * 3, {
          rings: 5,
          segs: 8,
        });
      const lm2 = b.mesh(leafLight);
      blob(lm2, v3(x + jitter(6), y + 1, top + 46), v3(8, 6.6, 6), 0, { rings: 5, segs: 8 });
      const fruit = b.mesh(b.solid('tomato', b.variant('tomato', TOMATO, { protect: true, priority: 2 })), {
        noLines: true,
      });
      for (let i = 0; i < 4; i++)
        blob(fruit, v3(x + (i % 2 === 0 ? -1 : 1) * (8 + rng() * 3), y - 6, top + 8 + i * 8.4), v3(5.6, 5.4, 5.4), 0, {
          rings: 5,
          segs: 8,
        });
      return;
    }
    case 'pumpkin': {
      const vm = b.mesh(leaf, { twoSided: true });
      for (let i = 0; i < 3; i++) {
        const a = rng() * TAU;
        blob(vm, v3(x + Math.cos(a) * 14, y + Math.sin(a) * 9 + 3, top + 6 + i * 2), v3(13, 11, 2.8), a, {
          rings: 5,
          segs: 8,
        });
      }
      const fruit = b.mesh(b.solid('pumpkin', b.variant('pumpkin', PUMPKIN, { protect: true, priority: 2 })), {
        noLines: true,
      });
      for (const dx of [-7, 0, 7])
        blob(fruit, v3(x + dx, y - 3, top + 11), v3(dx === 0 ? 11 : 8.4, 12, 11), 0, { rings: 7, segs: 10 });
      const stem = b.mesh(b.solid('stem', b.variant('stem', tone('#7a5a3e', 310, 70))), { noLines: true });
      tube(
        stem,
        [
          { p: v3(x, y - 2, top + 20), r: 2.6 },
          { p: v3(x + 1.5, y - 2, top + 26), r: 2 },
        ],
        { segs: 5, n: 4 },
      );
      return;
    }
    case 'berry': {
      // A low, lush bush with blue berries that shine, the sky berries of the stable.
      const lm = b.mesh(leafLight);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU + rng();
        const d = 3 + rng() * 9;
        blob(lm, v3(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, top + 8 + rng() * 9), v3(10, 9, 8), a, {
          rings: 5,
          segs: 8,
        });
      }
      const fruit = b.mesh(b.solid('berry', b.variant('berry', BERRY, { protect: true, priority: 2 })), {
        noLines: true,
      });
      for (let i = 0; i < 6; i++) {
        const a = Math.PI * (1.05 + rng() * 0.9);
        const r = 10 + rng() * 5;
        blob(fruit, v3(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8, top + 7 + rng() * 14), v3(4.4, 4.2, 4.4), 0, {
          rings: 5,
          segs: 8,
        });
      }
      return;
    }
  }
}

/** A raised bed with a wooden edge, three rows of one crop. */
export function cropBed(o: { crop: Crop; seed: number }): SceneBuilder {
  const b = new SceneBuilder();
  const rng = mulberry32(o.seed * 131 + 7);
  const plank = b.solid('plank', b.variant('plank', PLANK), (s) => (hash2(s.px >> 1, s.py, o.seed) - 0.5) * 0.12);
  const frame = b.mesh(plank);
  const { w, d } = BED;
  box(frame, v3(0, -d / 2 + 3, 8), v3(w, 6, 16));
  box(frame, v3(0, d / 2 - 3, 8), v3(w, 6, 16));
  for (const sx of [-1, 1]) box(frame, v3(sx * (w / 2 - 3), 0, 8), v3(6, d, 16));
  // Corner posts, a little proud of the boards.
  const post = b.mesh(b.solid('post', b.variant('post', WOOD_PALE)));
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) box(post, v3(sx * (w / 2 - 3), sy * (d / 2 - 3), 10), v3(8, 8, 20));
  const soil = b.mesh(
    b.solid('soil', b.variant('soil', SOIL, { noLines: true }), (s) => (hash2(s.px, s.py, o.seed + 3) - 0.5) * 0.18),
    { noLines: true },
  );
  box(soil, v3(0, 0, 10), v3(w - 12, d - 12, 8));
  blob(soil, v3(0, 0, 13), v3((w - 12) / 2, (d - 12) / 2, 3), 0, { rings: 5, segs: 14 });
  const leaf = b.solid('leaf', b.variant('leaf', FOLIAGE.emerald), leafBias(o.seed));
  const leafLight = b.solid('leafLight', b.variant('leafLight', FOLIAGE.lime), leafBias(o.seed + 5));
  const petal = b.solid('petal', b.variant('petal', BLOOM.white, { noLines: true, priority: 2 }));
  const kit: Kit = { b, rng, leaf, leafLight, petal };
  const columns = o.crop === 'cabbage' || o.crop === 'pumpkin' ? 4 : 5;
  const rows = o.crop === 'cabbage' || o.crop === 'pumpkin' ? 2 : 3;
  const x0 = -(w - 44) / 2,
    step = (w - 44) / (columns - 1);
  const y0 = rows === 3 ? -17 : -11,
    ystep = rows === 3 ? 17 : 24;
  // Back to front so a plant is never hidden by one that stands behind it.
  for (let r = rows - 1; r >= 0; r--)
    for (let c = 0; c < columns; c++)
      plant(kit, o.crop, x0 + c * step + (r % 2) * 6, y0 + r * ystep + (rng() - 0.5) * 3, o.seed * 7 + r * 13 + c);
  return b;
}

export const renderBed = (o: Parameters<typeof cropBed>[0]): Rgba => draw(cropBed(o), BED_CANVAS, { aoRadius: 6 });

export const SCARECROW_CANVAS: Canvas = { w: 190, h: 250, ox: 95, oy: 214 };

/**
 * A friendly scarecrow with a sack face and a flower in her hat. Nothing about her is meant to
 * frighten anyone.
 */
export function scarecrow(): SceneBuilder {
  const b = new SceneBuilder();
  const rng = mulberry32(21);
  const pole = b.mesh(b.solid('pole', b.variant('pole', PLANK)));
  tube(
    pole,
    [
      { p: v3(0, 4, 0), r: 4.4 },
      { p: v3(0, 4, 92), r: 3.6 },
    ],
    { segs: 8, n: 6 },
  );
  tube(
    pole,
    [
      { p: v3(-46, 4, 84), r: 3 },
      { p: v3(46, 4, 84), r: 3 },
    ],
    { segs: 8, n: 6 },
  );
  // The body: a shirt stuffed with straw, and sleeves along the crossbar.
  const shirt = b.mesh(b.solid('shirt', b.variant('shirt', SHIRT), (s) => (hash2(s.px, s.py, 3) - 0.5) * 0.1));
  blob(shirt, v3(0, 2, 66), v3(24, 15, 27), 0, { rings: 9, segs: 14 });
  for (const sx of [-1, 1])
    tube(
      shirt,
      [
        { p: v3(sx * 16, 3, 84), r: 9 },
        { p: v3(sx * 32, 4, 85), r: 8.4 },
        { p: v3(sx * 44, 4, 84), r: 7.4 },
      ],
      { segs: 10, n: 8, capEnd: true },
    );
  const patch = b.mesh(b.solid('patch', b.variant('patch', PATCH, { protect: true, priority: 2 })), { noLines: true });
  blob(patch, v3(-9, -12.5, 66), v3(7.4, 2.6, 7.4), 0, { rings: 5, segs: 8 });
  blob(patch, v3(-30, -2.5, 85), v3(5.6, 2.4, 5.6), 0, { rings: 5, segs: 8 });
  // Trousers: two stuffed legs that end in a tuft of straw.
  const legs = b.mesh(b.solid('legs', b.variant('legs', tone('#4cb9c2', 250, 120))));
  for (const sx of [-1, 1])
    tube(
      legs,
      [
        { p: v3(sx * 9, 2, 44), r: 10 },
        { p: v3(sx * 11, 2, 22), r: 8.4 },
        { p: v3(sx * 11, 2, 8), r: 7.4 },
      ],
      { segs: 10, n: 8, capEnd: true },
    );
  const straw = b.mesh(
    b.solid('straw', b.variant('straw', STRAW), (s) => (hash2(s.px, s.py, 9) - 0.5) * 0.18),
    { twoSided: true },
  );
  const tuft = (x: number, z: number, dx: number, dz: number, n: number): void => {
    for (let i = 0; i < n; i++) {
      const a = (i / (n - 1) - 0.5) * 1.5;
      ribbon(
        straw,
        [
          { p: v3(x, 3, z), w: 1.8, t: 0.6 },
          { p: v3(x + Math.sin(a) * dx * 0.5 + dx * 0.3, 3, z + dz * 0.5), w: 1.6, t: 0.6 },
          { p: v3(x + Math.sin(a) * dx + dx * 0.4, 3, z + dz), w: 0.5, t: 0.4 },
        ],
        v3(0, -1, 0),
        4,
      );
    }
  };
  for (const sx of [-1, 1]) {
    tuft(sx * 48, 84, sx * 14, -3, 5);
    tuft(sx * 11, 10, sx * 6, -8, 4);
  }
  // A sack for a head with a face that smiles. Features sit on the sack's surface, found from its
  // own ellipsoid.
  const HEAD = { c: v3(0, 3, 108), r: v3(21, 19, 22) };
  const onHead = (x: number, z: number, out = 0.5): number =>
    HEAD.c[1] -
    HEAD.r[1] * Math.sqrt(Math.max(0.05, 1 - ((x - HEAD.c[0]) / HEAD.r[0]) ** 2 - ((z - HEAD.c[2]) / HEAD.r[2]) ** 2)) -
    out;
  const sack = b.mesh(b.solid('sack', b.variant('sack', SACK), (s) => (hash2(s.px, s.py, 5) - 0.5) * 0.1));
  blob(sack, HEAD.c, HEAD.r, 0, { rings: 10, segs: 14 });
  const ink = b.mesh(b.solid('ink', b.variant('ink', COAL, { protect: true, priority: 3, noOutline: true })), {
    noLines: true,
  });
  for (const sx of [-1, 1]) blob(ink, v3(sx * 8, onHead(sx * 8, 113, 0.4), 113), v3(3, 2, 4), 0, { rings: 5, segs: 7 });
  for (let i = 0; i <= 8; i++) {
    const t = (i / 8) * 2 - 1;
    const x = t * 8.6,
      z = 99.4 + 4.4 * t * t;
    blob(ink, v3(x, onHead(x, z, 0.3), z), v3(1.9, 1.4, 1.7), 0, { rings: 4, segs: 6 });
  }
  const nose = b.mesh(b.solid('nose', b.variant('nose', ORANGE, { protect: true, priority: 2 })), { noLines: true });
  blob(nose, v3(0, onHead(0, 106.4, -1.4), 106.4), v3(2.8, 4.4, 2.8), 0, { rings: 5, segs: 7 });
  const cheeks = b.mesh(b.solid('cheek', b.variant('cheek', PATCH, { protect: true, priority: 2, noOutline: true })), {
    noLines: true,
  });
  for (const sx of [-1, 1])
    blob(cheeks, v3(sx * 14, onHead(sx * 14, 104, 0.2), 104), v3(4, 1.6, 3), 0, { rings: 4, segs: 7 });
  // A straw hat with a brim that keeps off the sun but not the smile, and a flower on its band.
  const hat = b.mesh(b.solid('hat', b.variant('hat', STRAW), (s) => (hash2(s.px, s.py, 11) - 0.5) * 0.14));
  lathe(hat, {
    c: v3(0, 3, 124),
    segs: 22,
    smooth: true,
    profile: [
      [29, 0],
      [30, 1.4],
      [25, 3.4],
      [18, 4.2],
      [14.4, 5.6],
      [13.6, 13],
      [11, 16],
      [0, 17],
    ],
  });
  const band = b.mesh(b.solid('band', b.variant('band', SHIRT)));
  lathe(band, {
    c: v3(0, 3, 128),
    segs: 22,
    smooth: true,
    profile: [
      [14.6, 0],
      [14.8, 4],
      [14, 4],
      [13.8, 0],
    ],
  });
  const flowerMat = b.solid('flower', b.variant('flower', BLOOM.pink, { noLines: true, priority: 2 }));
  const fm = b.mesh(flowerMat, { noLines: true });
  for (let p = 0; p < 6; p++) {
    const pa = (p / 6) * TAU;
    blob(fm, v3(-12 + Math.cos(pa) * 5, -12.6, 131 + Math.sin(pa) * 5), v3(3.4, 2.4, 3.4), 0, { rings: 4, segs: 6 });
  }
  blob(
    b.mesh(b.solid('centre', b.variant('centre', BLOOM.yellow, { noLines: true, priority: 2 })), { noLines: true }),
    v3(-12, -14.6, 131),
    v3(2.6, 1.6, 2.6),
    0,
    { rings: 4, segs: 6 },
  );
  // Straw that pokes out from under the hat and from the neck.
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      ribbon(
        straw,
        [
          { p: v3(sx * 19, 1, 114 - i * 2), w: 1.6, t: 0.6 },
          { p: v3(sx * (26 + rng() * 3), 0, 111 - i * 3), w: 1.4, t: 0.6 },
          { p: v3(sx * (32 + rng() * 4), -1, 107 - i * 4), w: 0.4, t: 0.4 },
        ],
        v3(0, -1, 0),
        4,
      );
    }
  }
  blendNormals(sack, HEAD.c, HEAD.r, 0.3);
  return b;
}

export const renderScarecrow = (): Rgba => draw(scarecrow(), SCARECROW_CANVAS, { aoRadius: 7 });

export const CRATE_CANVAS: Canvas = { w: 130, h: 120, ox: 65, oy: 88 };
export const CRATES = ['apples', 'carrots', 'berries', 'pumpkins'] as const;
export type CrateKind = (typeof CRATES)[number];

const PILE: Record<CrateKind, { ramp: Ramp; r: V3; count: number }> = {
  apples: { ramp: RED, r: v3(8.4, 8, 8), count: 14 },
  carrots: { ramp: ORANGE, r: v3(4.6, 4.6, 14), count: 16 },
  berries: { ramp: BERRY, r: v3(5.4, 5.2, 5.4), count: 22 },
  pumpkins: { ramp: PUMPKIN, r: v3(11, 10, 9.6), count: 8 },
};

/** A wooden crate heaped with one kind of fruit or vegetable. */
export function crate(kind: CrateKind): SceneBuilder {
  const b = new SceneBuilder();
  const rng = mulberry32(kind.length * 31 + 5);
  const wood = b.solid('wood', b.variant('wood', PLANK), (s) => (hash2(s.px >> 1, s.py, 4) - 0.5) * 0.12);
  const m = b.mesh(wood);
  const w = 74,
    d = 50,
    h = 28;
  box(m, v3(0, -d / 2 + 2, h / 2), v3(w, 4, h));
  box(m, v3(0, d / 2 - 2, h / 2), v3(w, 4, h));
  for (const sx of [-1, 1]) box(m, v3(sx * (w / 2 - 2), 0, h / 2), v3(4, d, h));
  box(m, v3(0, 0, 2), v3(w - 4, d - 4, 4));
  // A lighter band across the front, where the stripes of the boards meet.
  const slat = b.mesh(b.solid('slat', b.variant('slat', WOOD_PALE)));
  box(slat, v3(0, -d / 2 - 0.4, h * 0.5), v3(w - 10, 1.6, 4));
  const pile = PILE[kind];
  const fruit = b.solid(
    'fruit',
    b.variant('fruit', pile.ramp, { protect: true, priority: 2 }),
    (s) => (hash2(s.px, s.py, 6) - 0.5) * 0.06,
  );
  const filler = b.mesh(b.solid('filler', b.variant('filler', SOIL, { noLines: true })), { noLines: true });
  box(filler, v3(0, 0, h - 5), v3(w - 10, d - 10, 8));
  for (let i = 0; i < pile.count; i++) {
    const cols = 5;
    const cx = ((i % cols) - (cols - 1) / 2) * ((w - 18) / cols) + (rng() - 0.5) * 4;
    const row = Math.floor(i / cols);
    const cy = -12 + row * 11 + (rng() - 0.5) * 3;
    const tall = kind === 'carrots';
    const layer = row % 2 ? 4 : 0;
    const fm = b.mesh(fruit, { noLines: true });
    if (tall) blob(fm, v3(cx, cy, h - 2 + layer), v3(pile.r[0], pile.r[1], pile.r[2]), 0, { rings: 5, segs: 7 });
    else blob(fm, v3(cx, cy, h + 2 + layer), pile.r, 0, { rings: 6, segs: 9 });
  }
  if (kind === 'carrots') {
    const tops = b.mesh(b.solid('tops', b.variant('tops', FOLIAGE.lime)), { twoSided: true });
    for (let i = 0; i < 9; i++) {
      const x = (rng() - 0.5) * (w - 26),
        y = 6 + rng() * 10;
      ribbon(
        tops,
        [
          { p: v3(x, y, h + 10), w: 2.4, t: 0.8 },
          { p: v3(x + (rng() - 0.5) * 10, y + 6, h + 22), w: 2.6, t: 0.8 },
          { p: v3(x + (rng() - 0.5) * 18, y + 10, h + 32), w: 0.6, t: 0.5 },
        ],
        v3(0, -1, 0),
        4,
      );
    }
  }
  return b;
}

export const renderCrate = (kind: CrateKind): Rgba => draw(crate(kind), CRATE_CANVAS, { aoRadius: 6 });

export const FENCE_LENGTH = 192;
export const FENCE_X_CANVAS: Canvas = { w: FENCE_LENGTH + 40, h: 90, ox: (FENCE_LENGTH + 40) / 2, oy: 66 };
export const FENCE_Y_CANVAS: Canvas = {
  w: 60,
  h: Math.round(FENCE_LENGTH * 0.454) + 90,
  ox: 30,
  oy: Math.round(FENCE_LENGTH * 0.227) + 66,
};

/**
 * A white-washed fence a unicorn could look over. Running across the view it is pickets with round
 * tops; running into the view the pickets would only show their edges, so it is posts and two
 * rails.
 */
export function fence(axis: 'x' | 'y'): SceneBuilder {
  const b = new SceneBuilder();
  const wash = b.solid('wash', b.variant('wash', tone('#f4ecde', 300, 80)), (s) => (hash2(s.px, s.py, 8) - 0.5) * 0.06);
  const m = b.mesh(wash);
  const at = (t: number, cross: number, z: number): V3 =>
    axis === 'x' ? v3(-FENCE_LENGTH / 2 + t, cross, z) : v3(cross, -FENCE_LENGTH / 2 + t, z);
  const size = (along: number, across: number, up: number): V3 =>
    axis === 'x' ? v3(along, across, up) : v3(across, along, up);
  const post = b.mesh(b.solid('post', b.variant('post', tone('#e8dcc6', 300, 80))));
  if (axis === 'x') {
    const pickets = 14;
    const gap = FENCE_LENGTH / pickets;
    box(m, at(FENCE_LENGTH / 2, 4, 22), size(FENCE_LENGTH, 4, 5));
    box(m, at(FENCE_LENGTH / 2, 4, 8), size(FENCE_LENGTH, 4, 5));
    for (let i = 0; i < pickets; i++) {
      const t = gap * (i + 0.5);
      box(m, at(t, 0, 17), size(9.4, 4, 34));
      blob(m, at(t, 0, 34.6), v3(4.7, 2.2, 4.6), 0, { rings: 5, segs: 8 });
    }
  } else {
    box(m, at(FENCE_LENGTH / 2, 0, 28), size(FENCE_LENGTH, 4.4, 5));
    box(m, at(FENCE_LENGTH / 2, 0, 13), size(FENCE_LENGTH, 4.4, 5));
  }
  const posts =
    axis === 'x' ? [0, FENCE_LENGTH] : [0, FENCE_LENGTH / 4, FENCE_LENGTH / 2, (FENCE_LENGTH * 3) / 4, FENCE_LENGTH];
  for (const t of posts) {
    box(post, at(t, 1, 22), size(11, 11, 44));
    blob(post, at(t, 1, 45), v3(6.6, 6.6, 5), 0, { rings: 5, segs: 8 });
  }
  return b;
}

export const renderFence = (axis: 'x' | 'y'): Rgba =>
  draw(fence(axis), axis === 'x' ? FENCE_X_CANVAS : FENCE_Y_CANVAS, { aoRadius: 5 });
