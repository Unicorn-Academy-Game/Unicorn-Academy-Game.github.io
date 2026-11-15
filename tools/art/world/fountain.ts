import type { RGB } from '../core/color';
import { createRgba, type Rgba } from '../core/image';
import { hash2 } from '../core/rng';
import { v3 } from '../core/vec';
import { lathe } from './arch';
import { Painter } from './paint';
import { PAL } from './palette';
import { blob } from './prims';
import { type RenderedObject, renderScene, SceneBuilder } from './scene';
import { stoneKit } from './stone';

const SIN = Math.sin((27 * Math.PI) / 180);
const COS = Math.cos((27 * Math.PI) / 180);
/** Screen rows above the ground anchor for a height in scene units. */
const rise = (z: number): number => z * COS;
const frameOf = (c: { w: number; h: number; ox: number; oy: number }) => ({
  width: c.w,
  height: c.h,
  originX: c.ox,
  originY: c.oy,
});

/**
 * The garden fountain. Everything is in scene units (one unit is one pixel across the screen),
 * centred on the middle of the basin. The basin, its two bowls and the finial are one 3D render.
 * The water in motion is painted on top, frame by frame, in 2D, so the jet, the overflow curtains
 * and the rings on the water are each exact pixels.
 */
export const FOUNTAIN = {
  /** The basin sprite. The jet gets more headroom but keeps the same anchor. */
  canvas: { w: 420, h: 300, ox: 210, oy: 218 },
  jetCanvas: { w: 420, h: 420, ox: 210, oy: 338 },
  rimR: 180,
  waterZ: 34,
  waterR: 149,
  bowl2: { waterZ: 124, waterR: 70, rimZ: 130, rimR: 84 },
  bowl3: { waterZ: 180, waterR: 36, rimZ: 189, rimR: 46 },
  finialTop: 208,
  frames: 8,
  fps: 8,
} as const;

export function buildBasin(): SceneBuilder {
  const b = new SceneBuilder();
  const k = stoneKit(b, 3);
  const rim = b.mesh(k.marble);
  lathe(rim, {
    c: v3(0, 0, 0),
    segs: 40,
    profile: [
      [150, 0],
      [166, 3],
      [172, 10],
      [172, 28],
      [180, 33],
      [180, 41],
      [174, 47],
      [156, 47],
      [149, 42],
      [149, 34],
    ],
  });
  const water = b.mesh(k.water, { noLines: true });
  lathe(water, {
    c: v3(0, 0, FOUNTAIN.waterZ),
    segs: 40,
    profile: [
      [FOUNTAIN.waterR, 0],
      [0, 0],
    ],
  });
  // A gold bead on every other rim stone, like a ring of pearls.
  const beads = b.mesh(k.gold);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    blob(beads, v3(Math.cos(a) * 177, Math.sin(a) * 177, 50), v3(4.2, 4.2, 4.2), 0, { rings: 6, segs: 8 });
  }
  const pillar = b.mesh(k.marble);
  lathe(pillar, {
    c: v3(0, 0, 30),
    segs: 28,
    smooth: true,
    profile: [
      [46, 0],
      [46, 8],
      [34, 16],
      [27, 28],
      [25, 50],
      [30, 60],
      [40, 66],
    ],
  });
  const bowl2 = b.mesh(k.marble);
  lathe(bowl2, {
    c: v3(0, 0, 0),
    segs: 36,
    smooth: true,
    profile: [
      [36, 92],
      [54, 96],
      [70, 104],
      [80, 114],
      [84, 124],
      [84, 130],
      [78, 132],
      [72, 130],
      [70, 124],
    ],
  });
  const water2 = b.mesh(k.water, { noLines: true });
  lathe(water2, {
    c: v3(0, 0, FOUNTAIN.bowl2.waterZ),
    segs: 32,
    profile: [
      [FOUNTAIN.bowl2.waterR, 0],
      [0, 0],
    ],
  });
  const stem = b.mesh(k.marble);
  lathe(stem, {
    c: v3(0, 0, 118),
    segs: 24,
    smooth: true,
    profile: [
      [18, 0],
      [14, 10],
      [12, 32],
      [16, 40],
      [22, 44],
    ],
  });
  const bowl3 = b.mesh(k.marble);
  lathe(bowl3, {
    c: v3(0, 0, 0),
    segs: 28,
    smooth: true,
    profile: [
      [20, 160],
      [32, 164],
      [42, 172],
      [46, 182],
      [46, 188],
      [41, 189],
      [37, 186],
      [FOUNTAIN.bowl3.waterR, FOUNTAIN.bowl3.waterZ],
    ],
  });
  const water3 = b.mesh(k.water, { noLines: true });
  lathe(water3, {
    c: v3(0, 0, FOUNTAIN.bowl3.waterZ),
    segs: 24,
    profile: [
      [FOUNTAIN.bowl3.waterR, 0],
      [0, 0],
    ],
  });
  const crown = b.mesh(k.gold);
  lathe(crown, {
    c: v3(0, 0, 176),
    segs: 16,
    smooth: true,
    profile: [
      [7, 0],
      [9, 8],
      [7, 16],
      [4.5, 24],
      [7, 28],
      [8, 31],
      [5.5, 34],
      [0, 36],
    ],
  });
  return b;
}

let basinCache: RenderedObject | null = null;
export function renderBasin(): RenderedObject {
  basinCache ??= renderScene(buildBasin(), {
    ...frameOf(FOUNTAIN.canvas),
    ss: 3,
    aoRadius: 14,
    lineDepth: 6,
    shadowFit: true,
    shadowBias: 2.2,
    shadowStrength: 0.42,
  });
  return basinCache;
}

const WATER_KEYS = new Set<number>(
  PAL.water.map((c) => (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2])),
);
const isWater = (img: Rgba, x: number, y: number): boolean => {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return false;
  const i = (y * img.width + x) * 4;
  return img.data[i + 3] === 255 && WATER_KEYS.has((img.data[i]! << 16) | (img.data[i + 1]! << 8) | img.data[i + 2]!);
};

const FOAM: RGB = [236, 249, 255];
const SPRAY: RGB = [190, 232, 252];
const DEEP: RGB = [96, 178, 226];

/** Ground-plane ellipse point for a radius and angle at a height, as a canvas pixel. */
const ring = (cx: number, cy: number, r: number, a: number, z: number): [number, number] => [
  Math.round(cx + Math.cos(a) * r),
  Math.round(cy - rise(z) + Math.sin(a) * r * SIN),
];

/**
 * Rings that spread over the basin water, glints that wink, and little splashes where the curtains
 * land.
 */
export function renderRipples(frame: number): Rgba {
  const { w, h, ox, oy } = FOUNTAIN.canvas;
  const img = createRgba(w, h);
  const p = new Painter(img);
  const base = renderBasin().rgba;
  const t = frame / FOUNTAIN.frames;
  const rings = 3;
  for (let k = 0; k < rings; k++) {
    const u = (t + k / rings) % 1;
    const r = 52 + u * 96;
    const fade = Math.min(1, (1 - u) * 1.6) * Math.min(1, u * 5);
    const steps = Math.ceil(r * 5);
    for (let s = 0; s < steps; s++) {
      const [x, y] = ring(ox, oy, r, (s / steps) * Math.PI * 2, FOUNTAIN.waterZ);
      if (!isWater(base, x, y) || fade < 0.12) continue;
      p.over(x, y, FOAM, 0.55 * fade);
      p.over(x, y + 1, DEEP, 0.25 * fade);
    }
  }
  // Splashes where the lower bowl's curtain lands.
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.12 + (0.76 * i) / 8);
    const u = (t * 2 + hash2(i, 5, 2)) % 1;
    const r = 2 + u * 7;
    for (let s = 0; s < 14; s++) {
      const [x, y] = ring(ox + Math.cos(a) * 88 - Math.cos(a) * r, oy, r, (s / 14) * Math.PI * 2, FOUNTAIN.waterZ);
      const yy = y + Math.round(Math.sin(a) * 88 * SIN) - Math.round(Math.sin(a) * r * SIN);
      if (isWater(base, x, yy)) p.over(x, yy, FOAM, 0.5 * (1 - u));
    }
  }
  // Glints: a few points that wink for two frames each.
  for (let i = 0; i < 18; i++) {
    const on = (frame + Math.floor(hash2(i, 9, 4) * FOUNTAIN.frames)) % FOUNTAIN.frames;
    if (on > 1) continue;
    const a = hash2(i, 1, 4) * Math.PI * 2,
      r = 55 + hash2(i, 2, 4) * 88;
    const [x, y] = ring(ox, oy, r, a, FOUNTAIN.waterZ);
    if (!isWater(base, x, y) || !isWater(base, x - 2, y) || !isWater(base, x + 2, y)) continue;
    p.px(x, y, [255, 255, 255]);
    if (on === 0) {
      p.px(x - 1, y, FOAM);
      p.px(x + 1, y, FOAM);
      p.px(x, y - 1, FOAM);
      p.px(x, y + 1, FOAM);
    }
  }
  return img;
}

/** The jet and the water that spills from bowl to bowl, drawn over the basin. */
export function renderJet(frame: number): Rgba {
  const { w, h, ox, oy } = FOUNTAIN.jetCanvas;
  const img = createRgba(w, h);
  const p = new Painter(img);
  const F = FOUNTAIN.frames;
  const topY = Math.round(oy - rise(FOUNTAIN.finialTop));
  /**
   * One pixel of flowing water: a body, a bright core when the dash passes, and a darker edge on
   * the shaded side.
   */
  const flow = (x: number, y: number, phase: number, period: number, thick: number): void => {
    const bright = ((phase % period) + period) % period < period * 0.45;
    for (let k = 0; k < thick; k++) {
      const edgeL = k === 0 && thick > 2,
        edgeR = k === thick - 1 && thick > 2;
      const c = edgeR ? DEEP : bright && !edgeL ? FOAM : SPRAY;
      p.over(x + k - Math.floor(thick / 2), y, c, edgeR ? 0.8 : bright ? 0.94 : 0.68);
    }
  };

  // The plume: a stout column that thins as it climbs, dashes of light running up it.
  const plume = 44;
  for (let y = 0; y <= plume; y++) {
    const u = y / plume;
    const thick = u < 0.35 ? 7 : u < 0.7 ? 5 : 3;
    flow(ox, topY - y, y - (frame * 10) / F, 10, thick);
  }
  // Arcs fall from the top of the plume into the upper bowl.
  const apexY = topY - plume;
  const bowlY = Math.round(oy - rise(FOUNTAIN.bowl3.waterZ));
  const arcs = [-34, -25, -17, -9, 9, 17, 25, 34];
  const SAMPLES = 80;
  arcs.forEach((vx, i) => {
    const land = Math.round(bowlY + (hash2(i, 4, 9) - 0.5) * 6);
    for (let k = 0; k <= SAMPLES; k++) {
      const s = k / SAMPLES;
      const x = Math.round(ox + vx * Math.sin(s * Math.PI * 0.5) * 1.0);
      const y = Math.round(apexY + 3 + (land - apexY - 3) * s * s - (1 - s) * 10 * (1 - Math.abs(vx) / 40));
      flow(x, y, k - (frame * 12) / F, 12, 1);
    }
    // A puff where it lands.
    const lx = Math.round(ox + vx),
      ly = land;
    const wob = (frame + i) % 2;
    for (let d = -2 - wob; d <= 2 + wob; d++) p.over(lx + d, ly, FOAM, 0.85 - Math.abs(d) * 0.12);
  });
  // The upper bowl spills over its front rim onto the lower bowl, and the lower bowl onto the
  // basin.
  const curtain = (rimR: number, rimZ: number, fall: number, count: number, span: number, thick: number): void => {
    for (let c = 0; c < count; c++) {
      const x = -span + (2 * span * (c + 0.5)) / count;
      const edge = Math.sqrt(Math.max(0, rimR * rimR - x * x));
      const y0 = Math.round(oy - rise(rimZ) + edge * SIN);
      const kick = Math.sign(x) * (0.5 + 2.5 * (Math.abs(x) / span));
      for (let y = 0; y < fall; y++) {
        const out = y < 7 ? Math.round(kick * (1 - y / 7) * (1 - y / 7)) : 0;
        flow(Math.round(ox + x + out), y0 + y, y - (frame * 9) / F + c * 3, 9, thick);
      }
      const wob = (frame + c) % 2;
      for (let d = -1 - wob; d <= 1 + wob + thick - 1; d++) p.over(Math.round(ox + x) + d - 1, y0 + fall, FOAM, 0.8);
      p.over(Math.round(ox + x), y0 + fall + 1, SPRAY, 0.5);
    }
  };
  curtain(
    FOUNTAIN.bowl3.rimR - 4,
    FOUNTAIN.bowl3.rimZ - 1,
    Math.round(rise(FOUNTAIN.bowl3.rimZ - FOUNTAIN.bowl2.waterZ)) - 4,
    7,
    36,
    3,
  );
  curtain(
    FOUNTAIN.bowl2.rimR - 3,
    FOUNTAIN.bowl2.rimZ - 1,
    Math.round(rise(FOUNTAIN.bowl2.rimZ - FOUNTAIN.waterZ)) - 5,
    13,
    74,
    4,
  );
  // Rings on the two upper bowls where the water lands.
  const bowlRings = (waterZ: number, r0: number, r1: number): void => {
    for (let k = 0; k < 2; k++) {
      const u = (frame / F + k / 2) % 1;
      const r = r0 + u * (r1 - r0);
      const steps = Math.ceil(r * 5);
      for (let s = 0; s < steps; s++) {
        const [x, y] = ring(ox, oy, r, (s / steps) * Math.PI * 2, waterZ);
        p.over(x, y, FOAM, 0.7 * (1 - u));
      }
    }
  };
  bowlRings(FOUNTAIN.bowl3.waterZ, 12, 33);
  bowlRings(FOUNTAIN.bowl2.waterZ, 34, 67);
  return img;
}

export const CUP = { canvas: { w: 120, h: 120, ox: 60, oy: 92 }, rimZ: 55, fullZ: 49, lowZ: 41 } as const;

/**
 * Inside of the goblet as [height above its foot, radius], so the water disc always fits the glass.
 */
const INNER: readonly (readonly [number, number])[] = [
  [26, 0],
  [28, 9],
  [33, 15],
  [38, 19],
  [41, 20.5],
];
const innerRadius = (zRel: number): number => {
  for (let i = 1; i < INNER.length; i++) {
    const [z0, r0] = INNER[i - 1]!,
      [z1, r1] = INNER[i]!;
    if (zRel <= z1) return r0 + ((r1 - r0) * (Math.max(zRel, z0) - z0)) / (z1 - z0);
  }
  return INNER[INNER.length - 1]![1];
};

/** `level` is how full the cup is, 0 (a puddle in the bottom) to 1 (a finger below the rim). */
function buildCup(level: number): SceneBuilder {
  const b = new SceneBuilder();
  const k = stoneKit(b, 8);
  const pedestal = b.mesh(k.marble);
  lathe(pedestal, {
    c: v3(0, 0, 0),
    segs: 24,
    profile: [
      [30, 0],
      [30, 4],
      [26, 7],
      [24, 11],
      [26, 13],
      [27, 15],
      [20, 15],
    ],
  });
  const gold = b.mesh(k.gold);
  lathe(gold, {
    c: v3(0, 0, 14),
    segs: 28,
    smooth: true,
    profile: [
      [14, 0],
      [14, 3],
      [8, 6],
      [5, 9],
      [4.5, 14],
      [6, 19],
      [10, 22],
      [16, 26],
      [21, 32],
      [23, 38],
      [23.5, 41],
      [20.5, 41],
      [19, 38],
      [15, 33],
      [9, 28],
      [0, 26],
    ],
  });
  const z = CUP.lowZ + (CUP.fullZ - CUP.lowZ) * level;
  const water = b.mesh(k.water, { noLines: true });
  lathe(water, {
    c: v3(0, 0, z),
    segs: 24,
    profile: [
      [innerRadius(z - 14) - 0.6, 0],
      [0, 0],
    ],
  });
  return b;
}

const cupCache = new Map<string, Rgba>();
function cupImage(level: number): Rgba {
  const key = String(level);
  let img = cupCache.get(key);
  if (!img) {
    img = renderScene(buildCup(level), { ...frameOf(CUP.canvas), ss: 4, aoRadius: 7, lineDepth: 4 }).rgba;
    cupCache.set(key, img);
  }
  const copy = createRgba(img.width, img.height);
  copy.data.set(img.data);
  return copy;
}

const star = (p: Painter, x: number, y: number, size: 1 | 2): void => {
  p.px(x, y, [255, 255, 255]);
  p.over(x - 1, y, FOAM, 0.9);
  p.over(x + 1, y, FOAM, 0.9);
  p.over(x, y - 1, FOAM, 0.9);
  p.over(x, y + 1, FOAM, 0.9);
  if (size === 2) {
    p.over(x - 2, y, FOAM, 0.55);
    p.over(x + 2, y, FOAM, 0.55);
    p.over(x, y - 2, FOAM, 0.55);
    p.over(x, y + 2, FOAM, 0.55);
  }
};

const mouthY = (z: number): number => Math.round(CUP.canvas.oy - rise(z));

/**
 * The cup is always full, and the water shimmers: a few stars wink in turn and a pale glint slides
 * across the top.
 */
export function renderCup(frame = 0): Rgba {
  const img = cupImage(1);
  shimmer(new Painter(img), mouthY(CUP.fullZ), frame);
  return img;
}

function shimmer(p: Painter, cy: number, frame: number): void {
  const { ox } = CUP.canvas;
  const spots: [number, number][] = [
    [-9, -1],
    [6, 2],
    [-2, 4],
    [10, -3],
  ];
  spots.forEach(([dx, dy], i) => {
    if ((frame + i) % 4 === 0) star(p, ox + dx, cy + dy, 1);
  });
  for (let x = 0; x < 6; x++)
    p.over(ox - 13 + x + (frame % 4) * 2, cy - 3 - Math.round(Math.abs(x - 3) * 0.3), FOAM, 0.55);
}

export const CUP_SIP_FRAMES = 6;

/**
 * A unicorn drinking: the water sinks sip by sip and comes back up, with a few sparkles over it.
 */
export function renderCupSip(frame: number): Rgba {
  const levels = [1, 0.84, 0.6, 0.36, 0.6, 0.84] as const;
  const level = levels[frame % CUP_SIP_FRAMES]!;
  const img = cupImage(level);
  const q = new Painter(img);
  const cy = mouthY(CUP.lowZ + (CUP.fullZ - CUP.lowZ) * level);
  shimmer(q, cy, frame);
  for (let i = 0; i < 3; i++)
    star(
      q,
      CUP.canvas.ox + Math.round((hash2(i, frame, 3) - 0.5) * 36),
      cy - 10 + Math.floor(hash2(i, frame, 4) * 12),
      i % 2 ? 1 : 2,
    );
  return img;
}
