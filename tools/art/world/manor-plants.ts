import { hex, ramp } from '../core/color';
import type { Rgba } from '../core/image';
import { createRgba } from '../core/image';
import type { SampleInfo } from '../core/render';
import { hash2, mulberry32 } from '../core/rng';
import { TAU, type V3, v3 } from '../core/vec';
import { lathe } from './arch';
import { gem } from './gems';
import { Painter } from './paint';
import { BARK, BLOOM, GEM, type Ramp } from './palette';
import { blob, blobAlong, box, tube } from './prims';
import { renderScene, SceneBuilder } from './scene';

/**
 * The Sky Garden's treasures: very expensive plants in very expensive pots. Gold urns spilling
 * roses, a planter set with jewels, orchids, tulips cut from crystal, a bonsai of carved jade, a
 * lotus fountain and a basket of flowers hung from the ceiling. Everything is round and chunky,
 * drawn with the same camera and light as the rest of the world.
 */
export interface Canvas {
  w: number;
  h: number;
  ox: number;
  oy: number;
}

const GOLD_BANDS = [0.2, 0.4, 0.6, 0.8, 0.92] as const;
const r6 = (base: string, shadowHue: number, lightHue: number): Ramp =>
  ramp(hex(base), { steps: 6, shadowHue, lightHue, lean: 1.0, lightness: [-0.32, -0.21, -0.1, 0, 0.09, 0.17] });
const JADE = r6('#4fbf94', 215, 120);
const JADE_DEEP = r6('#2a8f6e', 220, 130);
const LEAF = r6('#3a9a54', 215, 105);
const STEM = r6('#4aa860', 210, 110);
const ORCHID_PINK = r6('#ee5fb4', 320, 330);
const ORCHID_WHITE = r6('#fff4f8', 300, 330);
const LOTUS = r6('#f58cc0', 320, 350);
const CRYSTAL: Record<string, Ramp> = {
  amethyst: [
    [104, 56, 176],
    [150, 92, 220],
    [190, 140, 245],
    [226, 192, 255],
    [250, 232, 255],
  ],
  topaz: [
    [196, 120, 24],
    [240, 168, 40],
    [255, 206, 90],
    [255, 232, 160],
    [255, 250, 220],
  ],
  sapphire: [
    [44, 76, 190],
    [76, 124, 240],
    [128, 176, 255],
    [186, 218, 255],
    [240, 250, 255],
  ],
  rose: [
    [196, 48, 110],
    [236, 86, 150],
    [255, 140, 190],
    [255, 192, 220],
    [255, 238, 248],
  ],
  diamond: [
    [96, 118, 196],
    [142, 170, 228],
    [186, 212, 248],
    [222, 238, 255],
    [255, 255, 255],
  ],
};

const noise =
  (seed: number) =>
  (s: SampleInfo): number =>
    (hash2(s.px, s.py, seed) - 0.5) * 0.05;

function render(
  b: SceneBuilder,
  c: Canvas,
  extra: Partial<Parameters<typeof renderScene>[1]> = {},
): { rgba: Rgba; at: (p: V3) => [number, number] } {
  const r = renderScene(b, {
    width: c.w,
    height: c.h,
    originX: c.ox,
    originY: c.oy,
    ss: 4,
    aoRadius: 8,
    lineDepth: 5,
    shadowFit: true,
    shadowBias: 3,
    ...extra,
  });
  return { rgba: r.rgba, at: r.at };
}

type M = ReturnType<SceneBuilder['mesh']>;

interface Kit {
  gold: M;
  leaf: M;
  stem: M;
  bloom: (name: keyof typeof BLOOM) => M;
  gemMesh: (name: keyof typeof GEM) => M;
}

/**
 * Gold, leaves and every flower colour a scene might want, made once so each part gets its own
 * mesh.
 */
function kit(b: SceneBuilder): Kit {
  const goldM = b.solid('gold', b.variant('gold', GEM.gold, { bands: GOLD_BANDS }), noise(7));
  const leafM = b.solid('leaf', b.variant('leaf', LEAF));
  const stemM = b.solid('stem', b.variant('stem', STEM));
  const blooms = new Map<string, number>();
  const gems = new Map<string, number>();
  return {
    gold: b.mesh(goldM),
    leaf: b.mesh(leafM),
    stem: b.mesh(stemM),
    bloom: (name) => {
      if (!blooms.has(name)) blooms.set(name, b.solid(`bloom-${name}`, b.variant(`bloom-${name}`, BLOOM[name])));
      return b.mesh(blooms.get(name)!);
    },
    gemMesh: (name) => {
      if (!gems.has(name))
        gems.set(name, b.solid(`gem-${name}`, b.variant(`gem-${name}`, GEM[name], { bands: [0.15, 0.35, 0.6, 0.85] })));
      return b.mesh(gems.get(name)!);
    },
  };
}

/** A rose: a ring of cupped petals round a bud. `r` is the whole flower's radius. */
function rose(mesh: M, c: V3, r: number, up = 1): void {
  blob(mesh, v3(c[0], c[1], c[2] + r * 0.25 * up), v3(r * 0.55, r * 0.55, r * 0.5), 0, { rings: 6, segs: 8 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + c[0] * 0.3;
    blob(
      mesh,
      v3(c[0] + Math.cos(a) * r * 0.55, c[1] + Math.sin(a) * r * 0.55, c[2] + r * 0.1 * up),
      v3(r * 0.5, r * 0.5, r * 0.42),
      0,
      { rings: 6, segs: 8 },
    );
  }
}

/** A cluster of leaves fanning from a point. */
function leaves(mesh: M, c: V3, n: number, len: number, width: number, seed: number, lift = 0.5): void {
  const rnd = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rnd() * 0.5;
    const reach = len * (0.7 + rnd() * 0.5);
    blobAlong(
      mesh,
      v3(c[0] + Math.cos(a) * reach * 0.5, c[1] + Math.sin(a) * reach * 0.5, c[2] + reach * lift * 0.5),
      v3(reach * 0.5, width, width * 0.55),
      v3(0, 0, 1),
      a,
    );
  }
}

export const GOLD_URN: Canvas = { w: 230, h: 290, ox: 115, oy: 220 };

export function goldUrn(): SceneBuilder {
  const b = new SceneBuilder();
  const k = kit(b);
  lathe(k.gold, {
    c: v3(0, 0, 0),
    segs: 28,
    smooth: true,
    profile: [
      [24, 0],
      [30, 4],
      [38, 18],
      [44, 42],
      [42, 68],
      [30, 90],
      [22, 102],
      [24, 110],
      [34, 118],
      [36, 122],
      [28, 122],
    ],
  });
  // Jewels set round its belly, and two handles.
  const cycle: (keyof typeof GEM)[] = ['ruby', 'emerald', 'sapphire', 'amethyst', 'topaz'];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    blob(k.gemMesh(cycle[i % 5]!), v3(Math.cos(a) * 43, Math.sin(a) * 43, 46), v3(5, 5, 5), 0, { rings: 6, segs: 8 });
  }
  for (const s of [-1, 1])
    tube(
      k.gold,
      [
        { p: v3(s * 24, 0, 108), r: 3 },
        { p: v3(s * 44, 0, 112), r: 3 },
        { p: v3(s * 52, 0, 92), r: 3 },
        { p: v3(s * 46, 0, 72), r: 3.2 },
      ],
      { segs: 8 },
    );
  // A mound of leaves and roses overflowing the mouth, and a vine trailing down one side.
  const rnd = mulberry32(5);
  blob(k.leaf, v3(0, 0, 130), v3(46, 40, 24), 0, { rings: 8, segs: 12 });
  leaves(k.leaf, v3(0, 0, 128), 11, 56, 12, 3, 0.45);
  const colours: (keyof typeof BLOOM)[] = ['rose', 'pink', 'white', 'coral', 'pink', 'rose', 'white', 'yellow', 'pink'];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + 0.4;
    const rr = i === 8 ? 0 : 30;
    rose(
      k.bloom(colours[i]!),
      v3(Math.cos(a) * rr, Math.sin(a) * rr * 0.9, 146 + (i === 8 ? 12 : -Math.abs(Math.sin(a)) * 4)),
      15 + rnd() * 3,
    );
  }
  tube(
    k.stem,
    [
      { p: v3(-30, -16, 128), r: 2.4 },
      { p: v3(-46, -20, 108), r: 2.4 },
      { p: v3(-50, -22, 84), r: 2 },
      { p: v3(-46, -20, 62), r: 1.6 },
    ],
    { segs: 6 },
  );
  for (const [z, c] of [
    [100, 'pink'],
    [78, 'white'],
    [58, 'rose'],
  ] as const)
    rose(k.bloom(c), v3(-48, -23, z), 8);
  return b;
}
export const renderGoldUrn = (): Rgba => render(goldUrn(), GOLD_URN, { aoRadius: 9 }).rgba;

export const JEWEL_PLANTER: Canvas = { w: 230, h: 230, ox: 115, oy: 160 };

export function jewelPlanter(): SceneBuilder {
  const b = new SceneBuilder();
  const k = kit(b);
  const soil = b.solid('soil', b.variant('soil', BARK));
  // A gold box on little feet, its face set with five jewels in a row, its lid of soil full of
  // tulips.
  box(k.gold, v3(0, 0, 26), v3(130, 58, 40), 0, 3);
  box(k.gold, v3(0, 0, 49), v3(138, 64, 8), 0, 2);
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) blob(k.gold, v3(sx * 56, sy * 22, 4), v3(9, 9, 6), 0, { rings: 6, segs: 8 });
  box(b.mesh(soil), v3(0, 0, 54), v3(124, 50, 4));
  const row: (keyof typeof GEM)[] = ['ruby', 'topaz', 'emerald', 'sapphire', 'amethyst'];
  row.forEach((g, i) => {
    const x = (i - 2) * 25;
    gem(k.gemMesh(g), v3(x, -31, 26), 9, { sides: 6, stretch: [1, 0.35] });
    blob(k.gold, v3(x, -30, 26), v3(11.5, 3.2, 11.5), 0, { rings: 6, segs: 10 });
    gem(k.gemMesh(g), v3(x, -34, 26), 8, { sides: 6, stretch: [1, 0.35], yaw: 0 });
  });
  const tulip: [number, number, number, keyof typeof BLOOM][] = [
    [-46, -4, 56, 'rose'],
    [-28, 8, 70, 'yellow'],
    [-10, -6, 62, 'pink'],
    [8, 8, 74, 'coral'],
    [26, -4, 60, 'white'],
    [44, 6, 68, 'lilac'],
    [0, -12, 50, 'rose'],
  ];
  for (const [x, y, h, c] of tulip) {
    tube(
      k.stem,
      [
        { p: v3(x, y, 54), r: 1.8 },
        { p: v3(x + 2, y, 54 + h * 0.6), r: 1.8 },
        { p: v3(x, y, 54 + h), r: 1.8 },
      ],
      { segs: 6 },
    );
    blob(k.bloom(c), v3(x, y, 54 + h + 7), v3(8, 8, 11), 0, { rings: 6, segs: 10 });
    for (const dx of [-5, 0, 5])
      blob(k.bloom(c), v3(x + dx, y, 54 + h + 15), v3(3.2, 3.2, 5), 0, { rings: 4, segs: 6 });
  }
  leaves(k.leaf, v3(0, 0, 56), 12, 56, 7, 9, 0.7);
  return b;
}
export const renderJewelPlanter = (): Rgba => render(jewelPlanter(), JEWEL_PLANTER, { aoRadius: 8 }).rgba;

export const ORCHID: Canvas = { w: 200, h: 290, ox: 100, oy: 224 };

export function orchid(): SceneBuilder {
  const b = new SceneBuilder();
  const k = kit(b);
  const jade = b.mesh(b.solid('jade', b.variant('jade', JADE, { bands: [0.15, 0.4, 0.62, 0.85] }), noise(2)));
  const pink = b.mesh(b.solid('opink', b.variant('opink', ORCHID_PINK)));
  const white = b.mesh(b.solid('owhite', b.variant('owhite', ORCHID_WHITE)));
  lathe(jade, {
    c: v3(0, 0, 0),
    segs: 24,
    smooth: true,
    profile: [
      [22, 0],
      [26, 4],
      [28, 24],
      [30, 44],
      [26, 46],
      [0, 44],
    ],
  });
  lathe(k.gold, {
    c: v3(0, 0, 40),
    segs: 24,
    profile: [
      [31, 0],
      [31, 6],
      [27, 7],
      [27, 0],
    ],
  });
  lathe(k.gold, {
    c: v3(0, 0, 4),
    segs: 24,
    profile: [
      [27, 0],
      [27, 3],
      [23, 3.5],
      [23, 0],
    ],
  });
  // Broad leaves arching from the pot.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.3;
    blobAlong(k.leaf, v3(Math.cos(a) * 20, Math.sin(a) * 18, 62), v3(32, 8, 5), v3(0, 0, 1), a);
  }
  // Two stems arching over, with blossoms strung along them.
  const stems: { pts: V3[]; n: number }[] = [
    { pts: [v3(-6, 0, 46), v3(-8, 0, 110), v3(8, -2, 168), v3(34, -4, 196), v3(54, -4, 190)], n: 6 },
    { pts: [v3(8, 0, 46), v3(12, 0, 100), v3(-4, 2, 140), v3(-26, 2, 160)], n: 4 },
  ];
  for (const s of stems) {
    tube(
      k.stem,
      s.pts.map((p, i) => ({ p, r: 2.6 - i * 0.2 })),
      { segs: 6 },
    );
    for (let i = 0; i < s.n; i++) {
      const t = 0.36 + (i / s.n) * 0.66;
      const idx = Math.min(s.pts.length - 2, Math.floor(t * (s.pts.length - 1)));
      const f = t * (s.pts.length - 1) - idx;
      const p0 = s.pts[idx]!,
        p1 = s.pts[idx + 1]!;
      const c = v3(p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f - 4, p0[2] + (p1[2] - p0[2]) * f);
      const size = 15 - i * 0.9;
      const body = i % 2 === 0 ? pink : white;
      // Two broad wings, two narrow petals behind, and a frilled lip with a dark throat.
      blob(body, v3(c[0] - size * 0.7, c[1] - 2, c[2] + size * 0.35), v3(size * 0.62, size * 0.3, size * 0.5), 0, {
        rings: 6,
        segs: 8,
      });
      blob(body, v3(c[0] + size * 0.7, c[1] - 2, c[2] + size * 0.35), v3(size * 0.62, size * 0.3, size * 0.5), 0, {
        rings: 6,
        segs: 8,
      });
      blob(body, v3(c[0], c[1] - 1, c[2] + size * 0.75), v3(size * 0.3, size * 0.25, size * 0.55), 0, {
        rings: 6,
        segs: 8,
      });
      blob(
        i % 2 === 0 ? white : pink,
        v3(c[0], c[1] - 5, c[2] - size * 0.2),
        v3(size * 0.38, size * 0.3, size * 0.4),
        0,
        { rings: 6, segs: 8 },
      );
      blob(k.gold, v3(c[0], c[1] - 7, c[2] + size * 0.05), v3(2.6, 2.2, 2.6), 0, { rings: 4, segs: 6 });
    }
  }
  return b;
}
export const renderOrchid = (): Rgba => render(orchid(), ORCHID, { aoRadius: 8 }).rgba;

export const CRYSTAL_TULIPS: Canvas = { w: 210, h: 280, ox: 105, oy: 204 };

export function crystalTulips(): SceneBuilder {
  const b = new SceneBuilder();
  const k = kit(b);
  lathe(k.gold, {
    c: v3(0, 0, 0),
    segs: 24,
    smooth: true,
    profile: [
      [20, 0],
      [26, 4],
      [32, 22],
      [30, 48],
      [22, 66],
      [26, 76],
      [30, 80],
      [24, 80],
    ],
  });
  const jewel = (n: string): M =>
    b.mesh(b.solid(`cr-${n}`, b.variant(`cr-${n}`, CRYSTAL[n]!, { bands: [0.12, 0.3, 0.55, 0.8] })));
  const buds: [number, number, number, string][] = [
    [-40, 4, 150, 'amethyst'],
    [-20, -6, 176, 'topaz'],
    [0, 6, 192, 'sapphire'],
    [20, -4, 172, 'rose'],
    [40, 4, 146, 'diamond'],
  ];
  for (const [x, y, h, c] of buds) {
    tube(
      k.stem,
      [
        { p: v3(x * 0.3, y * 0.3, 78), r: 2.4 },
        { p: v3(x * 0.8, y * 0.8, 78 + (h - 78) * 0.5), r: 2.2 },
        { p: v3(x, y, h - 14), r: 2 },
      ],
      { segs: 6 },
    );
    // Each bloom is a faceted crystal, pointed like a tulip and held in a gold collar.
    gem(jewel(c), v3(x, y, h - 6), 15, {
      sides: 6,
      stretch: [0.85, 0.85],
      crown: 1.55,
      pavilion: 0.34,
      table: 0.16,
      yaw: x * 0.07,
    });
    lathe(k.gold, {
      c: v3(x, y, h - 18),
      segs: 10,
      profile: [
        [3, 0],
        [8, 6],
        [10, 10],
        [3, 10],
      ],
    });
  }
  leaves(k.leaf, v3(0, 0, 80), 7, 62, 7, 4, 0.9);
  return b;
}
export const renderCrystalTulips = (): Rgba => render(crystalTulips(), CRYSTAL_TULIPS, { aoRadius: 8 }).rgba;

export const JADE_BONSAI: Canvas = { w: 230, h: 260, ox: 115, oy: 188 };

export function jadeBonsai(): SceneBuilder {
  const b = new SceneBuilder();
  const k = kit(b);
  const jade = b.mesh(b.solid('jade', b.variant('jade', JADE_DEEP, { bands: [0.15, 0.4, 0.62, 0.85] }), noise(3)));
  const crown = b.mesh(b.solid('crown', b.variant('crown', JADE, { bands: [0.1, 0.3, 0.55, 0.8] }), noise(4)));
  const bark = b.mesh(b.solid('bark', b.variant('bark', BARK)));
  // A round gold tray, a jade pot on it, and a trunk that bends twice.
  lathe(k.gold, {
    c: v3(0, 0, 0),
    segs: 28,
    profile: [
      [52, 0],
      [54, 5],
      [50, 8],
      [0, 8],
    ],
  });
  lathe(jade, {
    c: v3(0, 0, 8),
    segs: 24,
    smooth: true,
    profile: [
      [26, 0],
      [34, 4],
      [38, 16],
      [36, 28],
      [40, 32],
      [0, 32],
    ],
  });
  lathe(k.gold, {
    c: v3(0, 0, 36),
    segs: 24,
    profile: [
      [40.4, 0],
      [40.4, 4],
      [36, 4.5],
      [36, 0],
    ],
  });
  tube(
    bark,
    [
      { p: v3(0, 0, 40), r: 8 },
      { p: v3(-14, 0, 66), r: 7 },
      { p: v3(10, 0, 92), r: 6 },
      { p: v3(-4, 0, 116), r: 5 },
      { p: v3(18, 0, 134), r: 3.6 },
    ],
    { segs: 10 },
  );
  tube(
    bark,
    [
      { p: v3(-10, 0, 74), r: 3.6 },
      { p: v3(-40, 0, 90), r: 3 },
      { p: v3(-56, 0, 100), r: 2.4 },
    ],
    { segs: 8 },
  );
  tube(
    bark,
    [
      { p: v3(6, 0, 100), r: 3.4 },
      { p: v3(34, 0, 112), r: 2.8 },
      { p: v3(52, 0, 124), r: 2.2 },
    ],
    { segs: 8 },
  );
  // Cloud pads of carved jade, each flat on top, each carrying one gold berry.
  for (const [x, z, rx, rz] of [
    [20, 140, 40, 16],
    [-58, 104, 28, 12],
    [54, 128, 28, 12],
    [-20, 118, 30, 12],
  ] as const) {
    blob(crown, v3(x, 0, z), v3(rx, rx * 0.8, rz), 0, { rings: 8, segs: 14 });
    blob(crown, v3(x - rx * 0.3, -rx * 0.1, z + rz * 0.5), v3(rx * 0.55, rx * 0.5, rz * 0.8), 0, {
      rings: 6,
      segs: 10,
    });
  }
  for (const [x, z] of [
    [28, 156],
    [-52, 118],
    [60, 142],
    [-10, 128],
    [6, 150],
  ] as const)
    blob(k.gold, v3(x, -6, z), v3(4.4, 4.4, 4.4), 0, { rings: 6, segs: 8 });
  return b;
}
export const renderJadeBonsai = (): Rgba => render(jadeBonsai(), JADE_BONSAI, { aoRadius: 8 }).rgba;

export const LOTUS_FOUNTAIN: Canvas = { w: 360, h: 270, ox: 180, oy: 170 };
export const LOTUS_FRAMES = 6;
/** Water's flat colour, which the ripples are painted over. */
const WATER_RGB: readonly [number, number, number] = [92, 182, 232];

export function lotusFountain(): { b: SceneBuilder; waterZ: number } {
  const b = new SceneBuilder();
  const k = kit(b);
  const marble = b.mesh(b.solid('marble', b.variant('marble', r6('#f4eef8', 300, 80)), noise(5)));
  const water = b.mesh(
    b.solid(
      'water',
      b.variant(
        'water',
        [[60, 140, 200], WATER_RGB.slice() as unknown as [number, number, number], [140, 214, 246]] as Ramp,
        { flat: 1, noLines: true },
      ),
    ),
    { noLines: true },
  );
  const lotus = b.mesh(b.solid('lotus', b.variant('lotus', LOTUS)));
  const lotusLight = b.mesh(b.solid('lotus2', b.variant('lotus2', ORCHID_WHITE)));
  const waterZ = 30;
  lathe(marble, {
    c: v3(0, 0, 0),
    segs: 40,
    smooth: true,
    profile: [
      [110, 0],
      [124, 4],
      [130, 12],
      [130, 30],
      [136, 34],
      [136, 40],
      [130, 44],
      [114, 44],
      [108, 38],
      [108, 30],
    ],
  });
  lathe(water, {
    c: v3(0, 0, waterZ),
    segs: 40,
    profile: [
      [108, 0],
      [0, 0],
    ],
  });
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU;
    blob(k.gold, v3(Math.cos(a) * 133, Math.sin(a) * 133, 46), v3(4, 4, 4), 0, { rings: 6, segs: 8 });
  }
  // A gold stem rises from the middle, and a great lotus of two rings of petals opens on it.
  lathe(k.gold, {
    c: v3(0, 0, waterZ),
    segs: 20,
    smooth: true,
    profile: [
      [18, 0],
      [12, 10],
      [8, 30],
      [10, 44],
      [0, 46],
    ],
  });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    blobAlong(
      lotus,
      v3(Math.cos(a) * 26, Math.sin(a) * 26, waterZ + 54),
      v3(14, 30, 10),
      v3(-Math.sin(a), Math.cos(a), 0),
      0.5,
      { rings: 6, segs: 10 },
    );
  }
  for (let i = 0; i < 7; i++) {
    const a = ((i + 0.5) / 7) * TAU;
    blobAlong(
      lotusLight,
      v3(Math.cos(a) * 14, Math.sin(a) * 14, waterZ + 76),
      v3(10, 22, 8),
      v3(-Math.sin(a), Math.cos(a), 0),
      0.3,
      { rings: 6, segs: 10 },
    );
  }
  blob(k.gold, v3(0, 0, waterZ + 82), v3(8, 8, 6), 0, { rings: 6, segs: 10 });
  // Lily pads floating on the water, with a bud on two of them.
  for (const [x, y, r] of [
    [-62, 20, 20],
    [54, 30, 18],
    [-40, -44, 16],
    [70, -26, 14],
  ] as const) {
    blob(k.leaf, v3(x, y, waterZ + 1.4), v3(r, r * 0.9, 2.4), 0, { rings: 4, segs: 14 });
  }
  for (const [x, y] of [
    [-62, 20],
    [70, -26],
  ] as const)
    blob(lotus, v3(x + 4, y, waterZ + 7), v3(6, 6, 9), 0, { rings: 6, segs: 8 });
  return { b, waterZ };
}

/**
 * Rings spreading on the water, and a glint or two. Painted over the pixels that are water, so they
 * never leave the basin.
 */
export function renderLotusFountain(frame: number): Rgba {
  const { b } = lotusFountain();
  const out = render(b, LOTUS_FOUNTAIN, { aoRadius: 10 });
  const img = out.rgba;
  const p = new Painter(img);
  const base = new Uint8Array(img.data);
  const waterAt = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) return false;
    const i = (y * img.width + x) * 4;
    return (
      base[i + 3] === 255 && base[i] === WATER_RGB[0] && base[i + 1] === WATER_RGB[1] && base[i + 2] === WATER_RGB[2]
    );
  };
  const [cx, cy] = out.at(v3(0, 0, 30));
  const t = frame / LOTUS_FRAMES;
  const SIN = Math.sin((27 * Math.PI) / 180);
  for (let k = 0; k < 3; k++) {
    const u = (t + k / 3) % 1;
    const r = 26 + u * 80;
    const fade = Math.min(1, (1 - u) * 1.6) * Math.min(1, u * 4);
    const steps = Math.ceil(r * 6);
    for (let s = 0; s < steps; s++) {
      const a = (s / steps) * TAU;
      const x = Math.round(cx + Math.cos(a) * r),
        y = Math.round(cy + Math.sin(a) * r * SIN);
      if (!waterAt(x, y) || fade < 0.12) continue;
      p.over(x, y, [236, 249, 255], 0.6 * fade);
      p.over(x, y + 1, [70, 150, 206], 0.3 * fade);
    }
  }
  for (let i = 0; i < 14; i++) {
    const on = (frame + Math.floor(hash2(i, 9, 4) * LOTUS_FRAMES)) % LOTUS_FRAMES;
    if (on > 1) continue;
    const a = hash2(i, 1, 4) * TAU,
      r = 30 + hash2(i, 2, 4) * 70;
    const x = Math.round(cx + Math.cos(a) * r),
      y = Math.round(cy + Math.sin(a) * r * SIN);
    if (!waterAt(x, y) || !waterAt(x - 2, y) || !waterAt(x + 2, y)) continue;
    p.px(x, y, [255, 255, 255]);
    if (on === 0)
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ] as const)
        p.px(x + dx, y + dy, [236, 249, 255]);
  }
  return img;
}

export const HANGING_GARDEN: Canvas = { w: 210, h: 330, ox: 105, oy: 206 };
/**
 * How far the anchor hangs above the floor beneath, in screen pixels: the basket's rim is 150 units
 * up.
 */
export const HANGING_HANG = Math.round(150 * Math.cos((27 * Math.PI) / 180));
const HANGING_FLOOR_ROW = 320;

export function hangingGarden(): SceneBuilder {
  const b = new SceneBuilder();
  const k = kit(b);
  const top = 296;
  // Three gold chains from a ceiling rose to the rim of a gold bowl.
  lathe(k.gold, {
    c: v3(0, 0, top - 4),
    segs: 14,
    profile: [
      [14, 0],
      [14, 4],
      [6, 8],
      [0, 8],
    ],
  });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    tube(
      k.gold,
      [
        { p: v3(0, 0, top - 6), r: 1.8 },
        { p: v3(Math.cos(a) * 20, Math.sin(a) * 20, 150), r: 1.8 },
      ],
      { segs: 6 },
    );
    for (const t of [0.3, 0.55, 0.8])
      blob(k.gold, v3(Math.cos(a) * 20 * t, Math.sin(a) * 20 * t, top - 6 - (top - 156) * t), v3(2.8, 2.8, 3.4), 0, {
        rings: 4,
        segs: 6,
      });
  }
  lathe(k.gold, {
    c: v3(0, 0, 112),
    segs: 24,
    smooth: true,
    profile: [
      [0, 0],
      [12, 2],
      [26, 12],
      [36, 30],
      [38, 38],
      [32, 40],
      [0, 38],
    ],
  });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    blob(
      k.gemMesh((['ruby', 'emerald', 'sapphire', 'amethyst'] as const)[i % 4]!),
      v3(Math.cos(a) * 36, Math.sin(a) * 36, 130),
      v3(3.8, 3.8, 3.8),
      0,
      { rings: 5, segs: 8 },
    );
  }
  blob(k.leaf, v3(0, 0, 152), v3(40, 36, 20), 0, { rings: 8, segs: 12 });
  leaves(k.leaf, v3(0, 0, 150), 9, 46, 9, 6, 0.4);
  const cols: (keyof typeof BLOOM)[] = ['pink', 'lilac', 'white', 'coral', 'sky', 'yellow', 'rose'];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + 0.2;
    rose(k.bloom(cols[i]!), v3(Math.cos(a) * 24, Math.sin(a) * 22, 160 - (i % 2) * 6), 11);
  }
  // Vines of leaves and blossoms hang down past the bowl, three long and two short.
  const vines: [number, number, number, number][] = [
    [-30, -6, 92, -1],
    [28, 4, 60, 1],
    [4, -26, 78, 0],
    [-18, 20, 44, -1],
    [20, -22, 36, 1],
  ];
  for (const [x, y, len, lean] of vines) {
    const pts = Array.from({ length: 5 }, (_, i) => ({
      p: v3(x + lean * i * 3, y, 124 - (len * i) / 4),
      r: 1.8 - i * 0.2,
    }));
    tube(k.stem, pts, { segs: 6 });
    pts.forEach((q, i) => {
      if (i === 0) return;
      blob(k.leaf, v3(q.p[0] + 5, q.p[1] - 2, q.p[2]), v3(7, 3, 4), 0, { rings: 4, segs: 8 });
      blob(k.leaf, v3(q.p[0] - 5, q.p[1] - 2, q.p[2] - 2), v3(7, 3, 4), 0, { rings: 4, segs: 8 });
    });
    const end = pts[4]!.p;
    rose(
      k.bloom(cols[(len + x) % 7 < 0 ? 0 : Math.abs(Math.round(len + x)) % 7]!),
      v3(end[0], end[1] - 2, end[2] - 4),
      7,
    );
  }
  return b;
}
export const renderHangingGarden = (): Rgba =>
  render(hangingGarden(), HANGING_GARDEN, { aoRadius: 6, originY: HANGING_FLOOR_ROW }).rgba;

/** The soft pool of shade a hanging basket drops on the floor. */
export const GARDEN_SHADOW: Canvas = { w: 160, h: 64, ox: 80, oy: 32 };
export function renderGardenShadow(): Rgba {
  const c = GARDEN_SHADOW;
  const img = createRgba(c.w, c.h);
  const p = new Painter(img);
  for (let y = 0; y < c.h; y++)
    for (let x = 0; x < c.w; x++) {
      const d = Math.hypot((x + 0.5 - c.ox) / (c.w / 2), (y + 0.5 - c.oy) / (c.h / 2));
      if (d >= 1) continue;
      const t = Math.floor((1 - d) * 5) / 5;
      p.over(x, y, [18, 40, 64], t * t * 0.34);
    }
  return img;
}
