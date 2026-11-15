import { hex, type RGB, ramp } from '../core/color';
import { createRgba, type Rgba } from '../core/image';
import { hash2, mulberry32, noise2 } from '../core/rng';
import { TAU, type V3, v3 } from '../core/vec';
import { lathe } from './arch';
import type { BloomName } from './flora';
import { underGlow } from './glow';
import { Painter } from './paint';
import { BLOOM, FOLIAGE, GEM, PAL, type Ramp } from './palette';
import { blendNormals, blob, box, ribbon, tube } from './prims';
import { renderScene, SceneBuilder } from './scene';
import { stoneKit } from './stone';

const COS = Math.cos((27 * Math.PI) / 180);
const SIN = Math.sin((27 * Math.PI) / 180);
const rise = (z: number): number => z * COS;

export interface Canvas {
  w: number;
  h: number;
  ox: number;
  oy: number;
}
const opts = (c: Canvas, ss = 4) => ({ width: c.w, height: c.h, originX: c.ox, originY: c.oy, ss });

const copy = (img: Rgba): Rgba => {
  const out = createRgba(img.width, img.height);
  out.data.set(img.data);
  return out;
};

/**
 * Renders a builder once per key and hands out copies, so a 2D pass can paint on a sprite without
 * touching the cache.
 */
const cache = new Map<string, { img: Rgba; at: (p: V3) => [number, number] }>();
function rendered(
  key: string,
  make: () => SceneBuilder,
  c: Canvas,
  extra: Partial<Parameters<typeof renderScene>[1]> = {},
): { img: Rgba; at: (p: V3) => [number, number] } {
  let hit = cache.get(key);
  if (!hit) {
    const r = renderScene(make(), { ...opts(c), ...extra });
    hit = { img: r.rgba, at: r.at };
    cache.set(key, hit);
  }
  return { img: copy(hit.img), at: hit.at };
}

const BRONZE: Ramp = ramp(hex('#b0803e'), {
  steps: 6,
  shadowHue: 20,
  lightHue: 80,
  lean: 0.9,
  lightness: [-0.32, -0.22, -0.11, 0, 0.1, 0.19],
});
const SOIL: Ramp = ramp(hex('#6b4a38'), { steps: 5, shadowHue: 320, lightHue: 60, lean: 0.8 });
const GLASS_OFF: Ramp = [
  [118, 126, 168],
  [150, 160, 198],
  [182, 192, 224],
  [208, 218, 240],
];
const GLASS_ON: Ramp = [
  [255, 196, 84],
  [255, 218, 118],
  [255, 236, 156],
  [255, 248, 206],
];
const ICE: Ramp = GEM.diamond;
const SPARK: RGB = [255, 250, 222];

const tone = (c: RGB, a: number): RGB => [Math.round(c[0] * a), Math.round(c[1] * a), Math.round(c[2] * a)];
const lighten = (c: RGB): RGB => [
  Math.min(255, Math.round(c[0] * 1.1 + 22)),
  Math.min(255, Math.round(c[1] * 1.1 + 22)),
  Math.min(255, Math.round(c[2] * 1.1 + 22)),
];

export type BedShape = 'long' | 'square' | 'round';
export const BED_CANVAS: Canvas = { w: 230, h: 160, ox: 115, oy: 112 };
const BED_SIZE = { long: { w: 176, d: 66 }, square: { w: 124, d: 84 }, round: { w: 128, d: 128 } } as const;

/** A petal ring facing the camera with a bright centre. */
function bloomHead(pm: ReturnType<SceneBuilder['mesh']>, cm: ReturnType<SceneBuilder['mesh']>, c: V3, r: number): void {
  for (let p = 0; p < 6; p++) {
    const a = (p / 6) * TAU;
    blob(
      pm,
      v3(c[0] + Math.cos(a) * r * 0.9, c[1] - 2, c[2] + Math.sin(a) * r * 0.9),
      v3(r * 0.62, r * 0.4, r * 0.62),
      0,
      { rings: 4, segs: 6 },
    );
  }
  blob(cm, v3(c[0], c[1] - 3.4, c[2]), v3(r * 0.45, r * 0.3, r * 0.45), 0, { rings: 4, segs: 6 });
}

export function flowerbed(o: {
  shape: BedShape;
  seed: number;
  flowering: boolean;
  blooms: readonly [BloomName, BloomName];
}): SceneBuilder {
  const b = new SceneBuilder();
  const k = stoneKit(b, 4 + o.seed);
  const size = BED_SIZE[o.shape];
  const wall = b.mesh(k.marble);
  const cap = b.mesh(k.marbleSmooth);
  if (o.shape === 'round') {
    lathe(wall, {
      c: v3(0, 0, 0),
      segs: 28,
      profile: [
        [62, 0],
        [64, 2],
        [64, 17],
        [56, 17],
      ],
    });
    lathe(cap, {
      c: v3(0, 0, 0),
      segs: 28,
      profile: [
        [64, 17],
        [67, 19],
        [67, 23],
        [56, 23],
        [56, 17],
      ],
    });
  } else {
    const { w, d } = size;
    const t = 9;
    box(wall, v3(0, -(d / 2 - t / 2), 9), v3(w, t, 18));
    box(wall, v3(0, d / 2 - t / 2, 9), v3(w, t, 18));
    box(wall, v3(-(w / 2 - t / 2), 0, 9), v3(t, d - 2 * t, 18));
    box(wall, v3(w / 2 - t / 2, 0, 9), v3(t, d - 2 * t, 18));
    box(cap, v3(0, -(d / 2 + 1), 20), v3(w + 4, t + 4, 4));
    box(cap, v3(0, d / 2 + 1, 20), v3(w + 4, t + 4, 4));
    box(cap, v3(-(w / 2 + 1), 0, 20), v3(t + 4, d - 2 * t + 2, 4));
    box(cap, v3(w / 2 + 1, 0, 20), v3(t + 4, d - 2 * t + 2, 4));
  }
  const soilV = b.variant('soil', SOIL);
  const soil = b.mesh(b.solid('soil', soilV, (s) => (hash2(s.px, s.py, 31) - 0.5) * 0.12));
  if (o.shape === 'round')
    lathe(soil, {
      c: v3(0, 0, 15),
      segs: 24,
      profile: [
        [56, 0],
        [0, 0],
      ],
    });
  else box(soil, v3(0, 0, 14.5), v3(size.w - 14, size.d - 14, 3));

  const rng = mulberry32(o.seed * 977 + 13);
  const leafA = b.solid('leafA', b.variant('leafA', FOLIAGE.emerald), (s) => (hash2(s.px, s.py, 3) - 0.5) * 0.2);
  const leafB = b.solid('leafB', b.variant('leafB', FOLIAGE.lime), (s) => (hash2(s.px, s.py, 4) - 0.5) * 0.2);
  const centres: [number, number, number][] = [];
  if (o.shape === 'long')
    for (let i = 0; i < 6; i++) centres.push([-70 + i * 28, (i % 2 === 0 ? -1 : 1) * 10, 17 + rng() * 4]);
  else if (o.shape === 'square') centres.push([-30, -16, 19], [30, -16, 17], [0, 2, 21], [-30, 20, 17], [30, 20, 19]);
  else
    for (let i = 0; i < 5; i++)
      centres.push([Math.cos((i / 5) * TAU + 0.4) * 32, Math.sin((i / 5) * TAU + 0.4) * 32, 18 + rng() * 4]);
  if (o.shape === 'round') centres.push([0, 0, 24]);
  centres.forEach(([cx, cy, r], i) => {
    const m = b.mesh(i % 2 === 0 ? leafA : leafB);
    blob(m, v3(cx, cy, 15 + r * 0.55), v3(r * 1.05, r * 0.9, r * 0.8), rng() * 3, { rings: 7, segs: 10 });
    for (let j = 0; j < 3; j++) {
      const a = (j / 3) * TAU + rng();
      const rr = r * (0.55 + rng() * 0.2);
      blob(
        m,
        v3(cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.5, 15 + rr * 0.55),
        v3(rr, rr * 0.85, rr * 0.8),
        rng() * 3,
        { rings: 5, segs: 8 },
      );
    }
    blendNormals(m, v3(cx, cy, 15 + r * 0.4), v3(r * 1.4, r * 1.1, r), 0.45);
    // Sprouting blades give the leafy bed a lively outline.
    const blades = b.mesh(i % 2 === 0 ? leafB : leafA, { twoSided: true, noLines: true });
    const count = o.flowering ? 3 : 5;
    for (let j = 0; j < count; j++) {
      const a = (j / count) * TAU + rng() * 0.8;
      const len = 11 + rng() * 9;
      ribbon(
        blades,
        [
          { p: v3(cx + Math.cos(a) * 3, cy + Math.sin(a) * 2, 15 + r * 0.8), w: 3.4, t: 1 },
          { p: v3(cx + Math.cos(a) * len * 0.5, cy + Math.sin(a) * len * 0.35, 15 + r * 0.8 + 9), w: 3, t: 1 },
          { p: v3(cx + Math.cos(a) * len, cy + Math.sin(a) * len * 0.5, 15 + r * 0.8 + 6), w: 0.8, t: 0.7 },
        ],
        v3(0, 0, 1),
        5,
      );
    }
  });
  if (o.flowering) {
    const stem = b.mesh(b.solid('stem', b.variant('stem', FOLIAGE.emerald, { noLines: true })), { noLines: true });
    const petalMat = o.blooms.map((c, i) => b.solid(`petal${i}`, b.variant(`petal${i}`, BLOOM[c], { noLines: true })));
    const centerMat = b.solid('centre', b.variant('centre', BLOOM.yellow, { noLines: true, priority: 2 }));
    const cm = b.mesh(centerMat, { noLines: true });
    const heads = petalMat.map((m) => b.mesh(m, { noLines: true }));
    centres.forEach(([cx, cy, r], i) => {
      const n = o.shape === 'round' ? 3 : 4;
      for (let j = 0; j < n; j++) {
        const a = rng() * TAU,
          d = rng() * r * 0.75;
        const x = cx + Math.cos(a) * d,
          y = cy + Math.sin(a) * d * 0.7;
        const base = 15 + r * 0.9;
        const h = base + 10 + rng() * 22;
        tube(
          stem,
          [
            { p: v3(x, y, base - 2), r: 1.1 },
            { p: v3(x + (rng() - 0.5) * 4, y, (base + h) / 2), r: 1 },
            { p: v3(x, y, h), r: 0.9 },
          ],
          { segs: 5, n: 5 },
        );
        bloomHead(heads[(i + j) % 2]!, cm, v3(x, y, h), 5.2 + rng() * 2);
      }
    });
  }
  return b;
}

const BED_SPEC: Record<
  BedShape,
  { blooms: [readonly [BloomName, BloomName], readonly [BloomName, BloomName], readonly [BloomName, BloomName]] }
> = {
  long: {
    blooms: [
      ['pink', 'white'],
      ['yellow', 'coral'],
      ['sky', 'lilac'],
    ],
  },
  square: {
    blooms: [
      ['yellow', 'coral'],
      ['lilac', 'pink'],
      ['white', 'sky'],
    ],
  },
  round: {
    blooms: [
      ['sky', 'lilac'],
      ['pink', 'white'],
      ['coral', 'yellow'],
    ],
  },
};

/**
 * `variant` 0..2 picks the bloom colours; leafy and flowering of one variant share their leaves
 * exactly.
 */
export function renderBed(shape: BedShape, variant: number, flowering: boolean): Rgba {
  const blooms = BED_SPEC[shape].blooms[variant]!;
  const seed = variant * 11 + (shape === 'long' ? 1 : shape === 'square' ? 2 : 3);
  return rendered(
    `bed-${shape}-${variant}-${flowering}`,
    () => flowerbed({ shape, seed, flowering, blooms }),
    BED_CANVAS,
    { aoRadius: 8, lineDepth: 5 },
  ).img;
}

export const LAMP_CANVAS: Canvas = { w: 240, h: 270, ox: 120, oy: 232 };
const LAMP_GLASS_Z = 132;

function buildLamp(lit: boolean): SceneBuilder {
  const b = new SceneBuilder();
  const k = stoneKit(b, 6);
  const base = b.mesh(k.marble);
  lathe(base, {
    c: v3(0, 0, 0),
    segs: 20,
    smooth: true,
    profile: [
      [19, 0],
      [19, 5],
      [14, 9],
      [9, 15],
      [6.5, 26],
      [5, 34],
    ],
  });
  const pole = b.mesh(k.marbleSmooth);
  lathe(pole, {
    c: v3(0, 0, 30),
    segs: 14,
    profile: [
      [4.4, 0],
      [4.4, 84],
    ],
  });
  const gold = b.mesh(k.gold);
  for (const z of [38, 76, 108])
    lathe(gold, {
      c: v3(0, 0, z),
      segs: 14,
      smooth: true,
      profile: [
        [7.4, 0],
        [8, 2.6],
        [7.4, 5.2],
        [4.6, 5.2],
        [4.6, 0],
      ],
    });
  // The lantern: a hexagonal glass with gold corner posts, a plate under it and a little roof.
  lathe(gold, {
    c: v3(0, 0, 112),
    segs: 6,
    profile: [
      [20, 0],
      [20, 3],
      [16, 6],
      [0, 6],
    ],
  });
  const glassV = b.variant(
    lit ? 'glassOn' : 'glassOff',
    lit ? GLASS_ON : GLASS_OFF,
    lit ? { emissive: 1.5, noLines: true } : { noLines: true },
  );
  const glass = b.mesh(b.solid('glass', glassV), { noLines: true });
  lathe(glass, {
    c: v3(0, 0, 118),
    segs: 6,
    faceted: true,
    profile: [
      [15.5, 0],
      [17, 22],
      [15.5, 44],
      [0, 44],
    ],
  });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    box(gold, v3(Math.cos(a) * 16.4, Math.sin(a) * 16.4, 140), v3(2.6, 2.6, 46), a);
  }
  lathe(gold, {
    c: v3(0, 0, 160),
    segs: 6,
    profile: [
      [21, 0],
      [21, 3],
      [14, 8],
      [10, 18],
      [0, 30],
    ],
  });
  lathe(gold, {
    c: v3(0, 0, 188),
    segs: 12,
    smooth: true,
    profile: [
      [1.6, 0],
      [4, 5],
      [5.5, 10],
      [4, 16],
      [0, 20],
    ],
  });
  if (lit) {
    const core = b.mesh(
      b.solid(
        'core',
        b.variant(
          'core',
          [
            [255, 244, 190],
            [255, 252, 226],
          ] as Ramp,
          { emissive: 3, noLines: true, flat: 1 },
        ),
      ),
      { noLines: true, noShadow: true },
    );
    blob(core, v3(0, 0, 140), v3(8, 8, 12), 0, { rings: 6, segs: 8 });
  }
  return b;
}

export function renderLamp(lit: boolean, frame = 0): Rgba {
  const r = rendered(`lamp-${lit}`, () => buildLamp(lit), LAMP_CANVAS, { aoRadius: 6, lineDepth: 4 });
  if (!lit) return r.img;
  const [cx, cy] = r.at(v3(0, 0, LAMP_GLASS_Z + 10));
  const flick = [0, 3, 1, 4][frame % 4]!;
  const sprite = underGlow(r.img, cx, cy, 78 + flick, 74 + flick, [255, 214, 110], 0.5);
  const p = new Painter(sprite);
  // Two stars that wink in turn above the lantern.
  const twinkle = (x: number, y: number, on: boolean): void => {
    if (!on) return;
    p.px(x, y, [255, 255, 255]);
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const)
      p.over(x + dx, y + dy, SPARK, 0.85);
  };
  twinkle(Math.round(cx) + 22, Math.round(cy) - 26, frame % 4 === 0 || frame % 4 === 1);
  twinkle(Math.round(cx) - 24, Math.round(cy) - 8, frame % 4 === 2 || frame % 4 === 3);
  return sprite;
}

export const BRAZIER_CANVAS: Canvas = { w: 260, h: 280, ox: 130, oy: 214 };
const BOWL_Z = 66;

function buildBrazier(lit: boolean): SceneBuilder {
  const b = new SceneBuilder();
  const bronzeV = b.variant('bronze', BRONZE, { bands: [0.16, 0.34, 0.55, 0.78, 0.92] });
  const bronze = b.solid('bronze', bronzeV, (s) => (hash2(s.px, s.py, 17) - 0.5) * 0.06);
  const legs = b.mesh(bronze);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    tube(
      legs,
      [
        { p: v3(Math.cos(a) * 42, Math.sin(a) * 42, 1), r: 3.4 },
        { p: v3(Math.cos(a) * 34, Math.sin(a) * 34, 24), r: 2.8 },
        { p: v3(Math.cos(a) * 26, Math.sin(a) * 26, 50), r: 3.2 },
      ],
      { segs: 7, n: 8 },
    );
    lathe(legs, {
      c: v3(Math.cos(a) * 43, Math.sin(a) * 43, 0),
      segs: 8,
      smooth: true,
      profile: [
        [4.4, 0],
        [5, 3],
        [3.4, 6],
        [0, 6.4],
      ],
    });
  }
  const ring = b.mesh(bronze);
  lathe(ring, {
    c: v3(0, 0, 26),
    segs: 24,
    smooth: true,
    profile: [
      [27, 0],
      [30, 2.4],
      [27, 4.8],
      [24.6, 2.4],
    ],
  });
  const bowl = b.mesh(bronze);
  lathe(bowl, {
    c: v3(0, 0, 0),
    segs: 28,
    smooth: true,
    profile: [
      [0, 46],
      [12, 45],
      [25, 49],
      [34, 57],
      [39, BOWL_Z],
      [41, BOWL_Z + 2],
      [37, BOWL_Z + 2],
      [34, BOWL_Z - 1],
      [28, 58],
      [18, 54],
      [0, 52],
    ],
  });
  const rim = b.mesh(b.solid('gold', b.variant('goldRim', GEM.gold, { bands: [0.2, 0.4, 0.6, 0.8, 0.92] })));
  lathe(rim, {
    c: v3(0, 0, BOWL_Z),
    segs: 28,
    smooth: true,
    profile: [
      [40, 0],
      [42, 1.8],
      [40.4, 3.6],
      [36.4, 3.6],
      [36, 0],
    ],
  });
  const coalV = b.variant(
    lit ? 'coalLit' : 'coalOut',
    lit
      ? ([
          [148, 34, 20],
          [230, 84, 24],
          [255, 150, 40],
        ] as Ramp)
      : ([
          [44, 40, 54],
          [66, 62, 78],
          [92, 88, 106],
        ] as Ramp),
    lit ? { emissive: 2, noLines: true } : { noLines: true },
  );
  const coals = b.mesh(
    b.solid('coals', coalV, (s) => (hash2(s.px >> 1, s.py >> 1, 5) - 0.5) * 0.4),
    { noLines: true },
  );
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU,
      d = i === 0 ? 0 : 15 + (i % 3) * 3;
    blob(coals, v3(Math.cos(a) * d, Math.sin(a) * d * 0.9, BOWL_Z - 6 + (i % 2) * 2), v3(8, 7, 5), a, {
      rings: 4,
      segs: 6,
    });
  }
  return b;
}

/**
 * One flame: a tongue that bends with the phase and narrows to a tip. `layer` 0 is the red outer, 3
 * the white core.
 */
function paintFlame(p: Painter, cx: number, baseY: number, frame: number, frames: number, scale: number): void {
  const phase = (frame / frames) * TAU;
  const tongues = [
    { x: 0, h: 62, w: 19, ph: 0 },
    { x: -13, h: 40, w: 11, ph: 1.7 },
    { x: 14, h: 46, w: 12, ph: 3.3 },
    { x: -5, h: 34, w: 9, ph: 5 },
    { x: 7, h: 28, w: 8, ph: 2.4 },
  ];
  const ramp4: RGB[] = [
    [208, 48, 28],
    [255, 112, 30],
    [255, 184, 48],
    [255, 236, 130],
  ];
  for (const layer of [0, 1, 2, 3]) {
    const shrink = [1, 0.74, 0.5, 0.28][layer]!;
    for (const t of tongues) {
      const h = Math.round(t.h * scale * (0.82 + 0.18 * Math.sin(phase * 2 + t.ph)) * (layer === 3 ? 0.7 : 1));
      const w = t.w * scale * shrink;
      for (let y = 0; y < h; y++) {
        const u = y / h;
        const sway =
          Math.sin(phase + t.ph + u * 2.4) * (3.2 + 3.4 * u) * scale + Math.sin(phase * 2 + t.ph * 1.7) * u * 1.4;
        const half = w * (1 - u) ** 0.62 * (0.55 + 0.45 * Math.sin(Math.min(1, u * 3.2) * (Math.PI / 2)));
        const x0 = Math.round(cx + t.x * scale + sway - half),
          x1 = Math.round(cx + t.x * scale + sway + half);
        for (let x = x0; x <= x1; x++) p.px(x, baseY - y, ramp4[layer]!);
      }
    }
  }
  // Sparks that float up and fade.
  for (let i = 0; i < 4; i++) {
    const u = (frame / frames + i / 4) % 1;
    const x = Math.round(cx + (hash2(i, 3, 2) - 0.5) * 34 * scale + Math.sin(u * 6 + i) * 5);
    const y = Math.round(baseY - 36 * scale - u * 50 * scale);
    p.over(x, y, [255, 214, 120], 1 - u);
    p.over(x + 1, y, [255, 170, 70], (1 - u) * 0.8);
  }
}

export function renderBrazier(lit: boolean, frame = 0): Rgba {
  const r = rendered(`brazier-${lit}`, () => buildBrazier(lit), BRAZIER_CANVAS, { aoRadius: 7, lineDepth: 4 });
  if (!lit) return r.img;
  const [cx, cy] = r.at(v3(0, 0, BOWL_Z - 2));
  const flick = [0, 3, 1, 4, 2, 5][frame % 6]!;
  const sprite = underGlow(r.img, cx, cy - 24, 96 + flick, 80 + flick, [255, 150, 60], 0.46);
  paintFlame(new Painter(sprite), Math.round(cx), Math.round(cy), frame, 6, 1);
  return sprite;
}

export const PINWHEEL_CANVAS: Canvas = { w: 170, h: 250, ox: 85, oy: 214 };
export const PINWHEEL_HEAD_Z = 128;
export const PINWHEEL_SPIN_FRAMES = 8;
const VANES: RGB[] = [
  [255, 112, 160],
  [255, 214, 80],
  [88, 178, 255],
];

function buildPinwheelPost(): SceneBuilder {
  const b = new SceneBuilder();
  const k = stoneKit(b, 9);
  const base = b.mesh(k.marble);
  lathe(base, {
    c: v3(0, 0, 0),
    segs: 18,
    smooth: true,
    profile: [
      [24, 0],
      [24, 6],
      [18, 12],
      [12, 16],
      [6, 24],
    ],
  });
  const wood = b.mesh(b.solid('pole', b.variant('pole', PAL.wood)));
  lathe(wood, {
    c: v3(0, 0, 18),
    segs: 10,
    profile: [
      [3.2, 0],
      [3.2, PINWHEEL_HEAD_Z - 16],
    ],
  });
  const gold = b.mesh(k.gold);
  lathe(gold, {
    c: v3(0, 0, 16),
    segs: 12,
    smooth: true,
    profile: [
      [7, 0],
      [7.6, 2.6],
      [7, 5.2],
    ],
  });
  return b;
}

/**
 * The paper vanes, drawn flat to the screen: six sectors in three colours, each folded so one half
 * is darker.
 */
function paintPinwheel(p: Painter, cx: number, cy: number, R: number, angle: number): void {
  const sector = TAU / 6;
  for (let y = -R - 2; y <= R + 2; y++) {
    for (let x = -R - 2; x <= R + 2; x++) {
      const r = Math.hypot(x + 0.5, y + 0.5);
      if (r > R + 0.5 || r < 3.5) continue;
      let th = Math.atan2(y + 0.5, x + 0.5) - angle;
      th = ((th % sector) + sector) % sector;
      const idx = ((Math.floor(((((Math.atan2(y + 0.5, x + 0.5) - angle) % TAU) + TAU) % TAU) / sector) % 6) + 6) % 6;
      const u = th / sector;
      const edge = 0.96 - 0.28 * (r / R) ** 1.6;
      if (u > edge) continue;
      const base = VANES[idx % 3]!;
      const fold = u > edge * 0.52;
      const c = fold ? tone(base, 0.74) : base;
      // A thin pale edge along the leading side and a deeper crease where the fold meets.
      const lead = u < 0.05 || r > R - 1.2;
      p.px(cx + x, cy + y, lead ? lighten(base) : Math.abs(u - edge * 0.52) < 0.025 ? tone(base, 0.58) : c);
    }
  }
  // Hub and pin.
  for (let y = -4; y <= 4; y++)
    for (let x = -4; x <= 4; x++)
      if (x * x + y * y <= 13) p.px(cx + x, cy + y, x * x + y * y <= 5 ? [255, 236, 156] : [214, 150, 40]);
  p.px(cx - 1, cy - 1, [255, 255, 255]);
}

export function renderPinwheel(spin: boolean, frame = 0): Rgba {
  const r = rendered('pinwheel-post', buildPinwheelPost, PINWHEEL_CANVAS, { aoRadius: 6, lineDepth: 4 });
  const [cx, cy] = r.at(v3(0, 0, PINWHEEL_HEAD_Z));
  const p = new Painter(r.img);
  const angle = spin ? (frame / PINWHEEL_SPIN_FRAMES) * (TAU / 3) + 0.25 : 0.25;
  paintPinwheel(p, Math.round(cx), Math.round(cy), 34, angle);
  if (spin) {
    // Motion arcs trailing each vane tip.
    for (let i = 0; i < 6; i++) {
      const a0 = angle + (i / 6) * TAU + 0.02;
      for (let s = 0; s < 8; s++)
        p.over(
          Math.round(cx + Math.cos(a0 - s * 0.06) * 38),
          Math.round(cy + Math.sin(a0 - s * 0.06) * 38),
          SPARK,
          0.5 - s * 0.06,
        );
    }
  }
  return r.img;
}

export const ORNAMENT_CANVAS: Canvas = { w: 200, h: 260, ox: 100, oy: 220 };
const ORB_Z = 118;
const ORB_R = 27;

function buildOrnament(): SceneBuilder {
  const b = new SceneBuilder();
  const k = stoneKit(b, 12);
  const base = b.mesh(k.marble);
  lathe(base, {
    c: v3(0, 0, 0),
    segs: 20,
    smooth: true,
    profile: [
      [26, 0],
      [26, 6],
      [20, 12],
      [13, 20],
      [9, 32],
      [8, 50],
    ],
  });
  const stem = b.mesh(k.marbleSmooth);
  lathe(stem, {
    c: v3(0, 0, 44),
    segs: 12,
    smooth: true,
    profile: [
      [6, 0],
      [5.4, 30],
      [7, 44],
    ],
  });
  const gold = b.mesh(k.gold);
  lathe(gold, {
    c: v3(0, 0, 84),
    segs: 20,
    smooth: true,
    profile: [
      [17, 0],
      [20, 4],
      [24, 8],
      [19, 12],
      [10, 14],
      [0, 14],
    ],
  });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    tube(
      gold,
      [
        { p: v3(Math.cos(a) * 17, Math.sin(a) * 17, 96), r: 1.8 },
        { p: v3(Math.cos(a) * 24, Math.sin(a) * 24, ORB_Z - 6), r: 1.8 },
        { p: v3(Math.cos(a) * 20, Math.sin(a) * 20, ORB_Z + 6), r: 1.6 },
      ],
      { segs: 5, n: 8 },
    );
  }
  lathe(gold, {
    c: v3(0, 0, ORB_Z + ORB_R - 3),
    segs: 12,
    smooth: true,
    profile: [
      [6, 0],
      [4, 4],
      [2, 9],
      [0, 12],
    ],
  });
  return b;
}

/**
 * The orb is painted flat: a calm sky with soft clouds, or a storm with a bolt flickering through
 * it.
 */
export function renderOrnament(glow: boolean, frame = 0): Rgba {
  const r = rendered('ornament', buildOrnament, ORNAMENT_CANVAS, { aoRadius: 7, lineDepth: 4 });
  const [cx0, cy0] = r.at(v3(0, 0, ORB_Z));
  const cx = Math.round(cx0),
    cy = Math.round(cy0);
  const src = glow ? underGlow(r.img, cx, cy, 70, 66, [255, 238, 140], 0.52) : r.img;
  const p = new Painter(src);
  const R = ORB_R;
  const lightDir = (x: number, y: number): number => (-x * 0.55 - y * 0.6) / R;
  for (let y = -R; y <= R; y++) {
    for (let x = -R; x <= R; x++) {
      const d = Math.hypot(x + 0.5, y + 0.5);
      if (d > R) continue;
      const rim = d > R - 1.6;
      const lit = lightDir(x, y);
      // Sky inside the glass.
      let c: RGB;
      if (glow) {
        const n =
          noise2((x + R) / 7.5 + frame * 0.35, (y + R) / 7.5 - frame * 0.15, 41) * 0.65 +
          noise2((x + R) / 3.6 - frame * 0.5, (y + R) / 3.6, 7) * 0.35;
        c = n > 0.62 ? [150, 128, 214] : n > 0.44 ? [108, 92, 178] : [74, 62, 132];
        if (lit > 0.5) c = tone(c, 1.12);
        if (y > R * 0.55) c = tone(c, 0.88);
      } else {
        const t = (y + R) / (2 * R);
        c = [Math.round(150 + 40 * (1 - t)), Math.round(196 + 30 * (1 - t)), 246];
        const cloud =
          (Math.hypot(x + 8, y + 5) < 8 && y > -12) || Math.hypot(x - 7, y + 1) < 7 || Math.hypot(x + 1, y + 8) < 5;
        if (cloud) c = [250, 252, 255];
      }
      if (rim) c = glow ? [255, 232, 140] : [196, 214, 246];
      p.px(cx + x, cy + y, c);
    }
  }
  if (glow) {
    // A jagged bolt that jumps to a new path each frame, with a hot white core.
    const rnd = mulberry32(frame * 131 + 7);
    let x = cx + Math.round((rnd() - 0.5) * 10),
      y = cy - R + 3;
    const pts: [number, number][] = [[x, y]];
    while (y < cy + R - 4) {
      y += 4 + Math.floor(rnd() * 4);
      x += Math.round((rnd() - 0.5) * 12);
      x = Math.max(cx - 10, Math.min(cx + 10, x));
      pts.push([x, y]);
    }
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1]!,
        [x1, y1] = pts[i]!;
      p.line(x0 - 1, y0, x1 - 1, y1, [255, 214, 70]);
      p.line(x0 + 1, y0, x1 + 1, y1, [255, 214, 70]);
      p.line(x0, y0, x1, y1, [255, 255, 255]);
    }
    for (let i = 0; i < 4; i++) {
      const a = ((frame + i * 1.7) / 6) * TAU;
      const sx = cx + Math.round(Math.cos(a) * (R + 9)),
        sy = cy + Math.round(Math.sin(a) * (R + 9));
      p.px(sx, sy, [255, 255, 255]);
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ] as const)
        p.over(sx + dx, sy + dy, SPARK, 0.8);
    }
  }
  // Specular highlight on the glass in both states.
  for (const [dx, dy] of [
    [-12, -13],
    [-11, -14],
    [-10, -15],
    [-13, -11],
    [-14, -9],
  ] as const)
    p.px(cx + dx, cy + dy, [255, 255, 255]);
  return src;
}

export const ICE_CANVAS: Canvas = { w: 220, h: 250, ox: 110, oy: 196 };

function buildIcePedestal(frozen: boolean): SceneBuilder {
  const b = new SceneBuilder();
  const k = stoneKit(b, 14);
  const ped = b.mesh(k.marble);
  lathe(ped, {
    c: v3(0, 0, 0),
    segs: 24,
    smooth: true,
    profile: [
      [36, 0],
      [36, 6],
      [28, 12],
      [22, 20],
      [21, 34],
      [28, 40],
      [38, 44],
      [40, 50],
      [38, 54],
      [32, 54],
    ],
  });
  const gold = b.mesh(k.gold);
  lathe(gold, {
    c: v3(0, 0, 50),
    segs: 24,
    smooth: true,
    profile: [
      [40.5, 0],
      [42, 2],
      [40.5, 4],
      [38, 4],
      [38, 0],
    ],
  });
  const iceV = b.variant('ice', ICE, { bands: [0.2, 0.4, 0.6, 0.8] });
  const icy = b.solid('ice', iceV, (s) => (hash2(s.px >> 1, s.py >> 1, 6) - 0.5) * 0.12);
  // The frozen bowl: a plate of ice with a rim of frost.
  const plate = b.mesh(icy);
  lathe(plate, {
    c: v3(0, 0, 50),
    segs: 24,
    smooth: true,
    profile: [
      [34, 0],
      [32, 4],
      [0, 5],
    ],
  });
  if (frozen) {
    const rng = mulberry32(99);
    const sheet = b.variant(
      'iceFrozen',
      [
        [78, 132, 206],
        [120, 178, 236],
        [170, 218, 252],
        [214, 242, 255],
        [255, 255, 255],
      ] as Ramp,
      { bands: [0.18, 0.4, 0.62, 0.84] },
    );
    const mat = b.material({
      name: 'iceSculpt',
      shade: () => sheet,
      bias: (s) => (hash2(s.px >> 1, s.py >> 1, 8) - 0.5) * 0.1,
    });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + rng() * 0.4;
      const d = i === 0 ? 0 : 14 + rng() * 12;
      const h = i === 0 ? 88 : 36 + rng() * 34;
      const lean = (0.1 + rng() * 0.2) * (rng() < 0.5 ? -1 : 1);
      const cx = Math.cos(a) * d,
        cy = Math.sin(a) * d * 0.8;
      const m = b.mesh(mat);
      const w = (4.6 + rng() * 2.4) * (i === 0 ? 1.45 : 1);
      tube(
        m,
        [
          { p: v3(cx, cy, 53), r: w },
          { p: v3(cx + lean * h * 0.5, cy, 53 + h * 0.7), r: w * 0.9 },
          { p: v3(cx + lean * h, cy, 53 + h), r: 1 },
        ],
        { segs: 6, n: 8 },
      );
    }
  }
  return b;
}

export const ICE_FROZEN_FRAMES = 6;

export function renderIceDisplay(frozen: boolean, frame = 0): Rgba {
  const r = rendered(`ice-${frozen}`, () => buildIcePedestal(frozen), ICE_CANVAS, { aoRadius: 8, lineDepth: 5 });
  const [cx0, cy0] = r.at(v3(0, 0, 53));
  const cx = Math.round(cx0),
    cy = Math.round(cy0);
  if (!frozen) {
    // A faint frost pattern creeping across the empty plate.
    const p = new Painter(r.img);
    for (let i = 0; i < 26; i++) {
      const a = hash2(i, 1, 90) * TAU,
        d = hash2(i, 2, 90) * 28;
      const x = cx + Math.round(Math.cos(a) * d),
        y = cy + Math.round(Math.sin(a) * d * SIN) - 1;
      if (p.get(x, y)[3] === 255) p.over(x, y, [255, 255, 255], 0.55);
    }
    return r.img;
  }
  const sprite = underGlow(r.img, cx, cy - 44, 82, 90, [170, 226, 255], 0.4);
  const p = new Painter(sprite);
  for (let i = 0; i < 7; i++) {
    const on = (frame + i) % ICE_FROZEN_FRAMES;
    if (on > 1) continue;
    const x = cx + Math.round((hash2(i, 5, 91) - 0.5) * 70),
      y = cy - 10 - Math.round(hash2(i, 6, 91) * 92);
    p.px(x, y, [255, 255, 255]);
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const)
      p.over(x + dx, y + dy, [225, 246, 255], on === 0 ? 0.95 : 0.6);
    if (on === 0)
      for (const [dx, dy] of [
        [-2, 0],
        [2, 0],
        [0, -2],
        [0, 2],
      ] as const)
        p.over(x + dx, y + dy, [225, 246, 255], 0.5);
  }
  return sprite;
}

export { rise };
