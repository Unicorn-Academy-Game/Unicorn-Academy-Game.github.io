import { hex, ramp } from '../core/color';
import type { Rgba } from '../core/image';
import { hash2, mulberry32, noise3 } from '../core/rng';
import { TAU, type V3, v3 } from '../core/vec';
import { lathe } from './arch';
import { GEM, PALACE, type Ramp } from './palette';
import { blob, box, ribbon, tube } from './prims';
import { renderScene, SceneBuilder } from './scene';

/**
 * The Magic Hall, on the far bank of the river: a pearl palace that glitters. Its walls shimmer
 * through pink, mint, lilac and white as the frames go round, glints twinkle on them, and the dome
 * and the windows glow. It is drawn from the front, wide, with a great arched door that only
 * Wildstar opens.
 */

export interface Canvas {
  w: number;
  h: number;
  ox: number;
  oy: number;
}

export const HALL_CANVAS: Canvas = { w: 800, h: 700, ox: 400, oy: 610 };
/**
 * Four frames, one for each tint of the pearl and the glass, so the walls go round them. A fifth
 * and sixth would add a third of the memory the whole shore bundle costs on a phone.
 */
export const HALL_FRAMES = 4;
export const HALL_FPS = 3;

const r6 = (base: string, shadowHue: number, lightHue: number, lightness?: readonly number[]): Ramp =>
  ramp(hex(base), {
    steps: 6,
    shadowHue,
    lightHue,
    lean: 0.9,
    lightness: lightness ?? [-0.26, -0.17, -0.08, 0, 0.07, 0.13],
  });

/** Pearl in four tints, so a wall can shift from one to the next. */
const PEARLS: readonly Ramp[] = [
  r6('#f4eefa', 290, 80, [-0.24, -0.15, -0.08, -0.02, 0.03, 0.06]),
  r6('#fbdcec', 330, 70, [-0.24, -0.15, -0.08, -0.02, 0.03, 0.07]),
  r6('#d8f5ec', 190, 110, [-0.24, -0.15, -0.08, -0.02, 0.03, 0.07]),
  r6('#e4dcfb', 275, 330, [-0.24, -0.15, -0.08, -0.02, 0.03, 0.07]),
];
const GOLD = GEM.gold;
const GLASS: readonly Ramp[] = [
  ramp(hex('#7be0ff'), { steps: 5, shadowHue: 250, lightHue: 150, lean: 0.9 }),
  ramp(hex('#ff9be6'), { steps: 5, shadowHue: 300, lightHue: 30, lean: 0.9 }),
  ramp(hex('#b9a2ff'), { steps: 5, shadowHue: 270, lightHue: 320, lean: 0.9 }),
  ramp(hex('#8affc9'), { steps: 5, shadowHue: 200, lightHue: 130, lean: 0.9 }),
];
const WINDOW: Ramp = ramp(hex('#ffe9a8'), { steps: 5, shadowHue: 30, lightHue: 95, lean: 0.8 });
const DOOR_GLOW: Ramp = ramp(hex('#9ff2ff'), { steps: 5, shadowHue: 250, lightHue: 150, lean: 0.8 });

/** A twinkle, a small star that swells and shrinks, laid over a finished picture. */
export function twinkles(
  sprite: Rgba,
  frame: number,
  frames: number,
  o: { seed: number; count: number; size?: number; colors?: readonly (readonly [number, number, number])[] },
): Rgba {
  const out: Rgba = { width: sprite.width, height: sprite.height, data: new Uint8Array(sprite.data) };
  const rng = mulberry32(o.seed);
  const colors = o.colors ?? [
    [255, 255, 255],
    [255, 226, 248],
    [220, 246, 255],
    [255, 246, 200],
  ];
  const put = (x: number, y: number, c: readonly number[], a: number): void => {
    if (x < 0 || y < 0 || x >= out.width || y >= out.height) return;
    const i = (y * out.width + x) * 4;
    if (out.data[i + 3] === 0) return;
    const t = a;
    out.data[i] = out.data[i]! * (1 - t) + c[0]! * t;
    out.data[i + 1] = out.data[i + 1]! * (1 - t) + c[1]! * t;
    out.data[i + 2] = out.data[i + 2]! * (1 - t) + c[2]! * t;
  };
  const size = o.size ?? 3;
  let placed = 0;
  for (let tries = 0; tries < o.count * 40 && placed < o.count; tries++) {
    const x = Math.floor(rng() * out.width),
      y = Math.floor(rng() * out.height);
    const phase = rng();
    const colour = colors[Math.floor(rng() * colors.length)]!;
    if (out.data[(y * out.width + x) * 4 + 3] !== 255) continue;
    placed++;
    const cycle = (frame / frames + phase) % 1;
    const swell = Math.max(0, Math.sin(cycle * Math.PI * 2)) ** 2;
    const reach = Math.round(swell * size);
    if (swell < 0.12) continue;
    put(x, y, colour, 1);
    for (let d = 1; d <= reach; d++) {
      const a = 1 - (d - 1) / (reach + 1);
      put(x + d, y, colour, a);
      put(x - d, y, colour, a);
      put(x, y + d, colour, a);
      put(x, y - d, colour, a);
    }
    if (reach >= 2) {
      put(x + 1, y + 1, colour, 0.7);
      put(x - 1, y - 1, colour, 0.7);
    }
  }
  return out;
}

/** The hall in one frame of its shimmer. */
function hallScene(frame: number): SceneBuilder {
  const b = new SceneBuilder();
  const drift = (frame / HALL_FRAMES) * TAU;
  const pearls = PEARLS.map((r, i) => b.variant(`pearl-${i}`, r, { bands: [0.2, 0.42, 0.64, 0.86] }));
  const glints = b.variant('glint', [[255, 255, 255]], { emissive: 6, protect: true, noLines: true, priority: 2 });
  const wall = b.material({
    name: 'pearl',
    shade: (s) => {
      if (hash2(s.px + frame * 7, s.py + frame * 3, 91) > 0.987) return glints;
      const n = noise3(
        s.rest[0] * 0.014 + Math.cos(drift) * 0.9,
        s.rest[1] * 0.014,
        s.rest[2] * 0.014 + Math.sin(drift) * 0.9,
        5,
      );
      return pearls[Math.min(3, Math.floor(n * 4.4))]!;
    },
    bias: (s) => (hash2(s.px, s.py, 3) - 0.5) * 0.035,
  });
  const goldV = b.variant('gold', GOLD, { bands: [0.2, 0.4, 0.6, 0.8, 0.92] });
  const goldMat = b.solid('gold', goldV);
  const roofs = [PALACE.roofRose, PALACE.roofViolet, PALACE.roofTeal].map((r, i) =>
    b.variant(`roof-${i}`, r, { bands: [0.2, 0.42, 0.64, 0.86] }),
  );
  const roofMats = roofs.map((v, i) => b.solid(`roof-${i}`, v));
  const glass = GLASS.map((r, i) => b.variant(`glass-${i}`, r, { emissive: 1.3, bands: [0.2, 0.4, 0.6, 0.8] }));
  const dome = b.material({
    name: 'dome',
    shade: (s) => {
      const n =
        (noise3(
          s.rest[0] * 0.011 + Math.cos(drift) * 0.6,
          s.rest[1] * 0.011,
          s.rest[2] * 0.011 + Math.sin(drift) * 0.6,
          9,
        ) *
          0.7 +
          (s.rest[2] - 330) / 380) %
        1;
      return glass[Math.max(0, Math.min(3, Math.floor(Math.abs(n) * 4.2)))]!;
    },
  });
  const win = b.variant('window', WINDOW, { emissive: 1.8, protect: true, noLines: true });
  const winMat = b.solid('window', win);
  const portal = b.variant('portal', DOOR_GLOW, { emissive: 2.4, protect: true, noLines: true });
  const portalMat = b.solid('portal', portal);
  const dark = b.variant('dark', r6('#3a2a6a', 275, 330), { flat: 0 });
  const darkMat = b.solid('dark', dark);
  const stoneMat = wall;

  // Terraces: two wide steps.
  box(b.mesh(stoneMat), v3(0, -10, 8), v3(700, 220, 16));
  box(b.mesh(stoneMat), v3(0, -30, 20), v3(560, 150, 10));
  // The hall: a long block, with three towers and a dome.
  box(b.mesh(wall), v3(0, 40, 100), v3(420, 120, 150));
  const towerR = (cx: number, cy: number, r: number, h: number, roof: number, cap = 1): void => {
    lathe(b.mesh(wall), {
      c: v3(cx, cy, 24),
      profile: [
        [0, 0],
        [r * 1.06, 0],
        [r, h],
        [r * 1.14, h],
        [r * 1.14, h + 8],
        [r * 0.2, h + 8],
        [0, h + 8],
      ],
      segs: 20,
    });
    lathe(b.mesh(roofMats[roof]!), {
      c: v3(cx, cy, 24 + h + 8),
      profile: [
        [0, 0],
        [r * 1.3, 0],
        [r * 0.95, 26 * cap],
        [r * 0.5, 74 * cap],
        [r * 0.2, 110 * cap],
        [0, 134 * cap],
      ],
      segs: 20,
    });
    blob(b.mesh(goldMat), v3(cx, cy, 24 + h + 8 + 136 * cap), v3(7, 7, 9), 0, { rings: 5, segs: 8 });
    tube(b.mesh(goldMat), [
      { p: v3(cx, cy, 24 + h + 8 + 130 * cap), r: 1.8 },
      { p: v3(cx, cy, 24 + h + 8 + 168 * cap), r: 1.2 },
    ]);
  };
  towerR(-250, 10, 62, 236, 0);
  towerR(250, 10, 62, 236, 1);
  towerR(-132, 70, 36, 300, 2, 1.1);
  towerR(132, 70, 36, 300, 2, 1.1);
  // The great central tower and its glass dome.
  lathe(b.mesh(wall), {
    c: v3(0, 60, 24),
    profile: [
      [0, 0],
      [92, 0],
      [84, 300],
      [96, 300],
      [96, 312],
      [0, 312],
    ],
    segs: 24,
  });
  blob(b.mesh(dome), v3(0, 60, 24 + 312), v3(88, 88, 112), 0, { rings: 14, segs: 24 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    tube(
      b.mesh(goldMat),
      [
        { p: v3(Math.cos(a) * 88, 60 + Math.sin(a) * 88, 24 + 312 + 2), r: 2.2 },
        { p: v3(Math.cos(a) * 62, 60 + Math.sin(a) * 62, 24 + 312 + 78), r: 2.2 },
        { p: v3(Math.cos(a) * 8, 60 + Math.sin(a) * 8, 24 + 312 + 112), r: 2 },
      ],
      { segs: 5, n: 10 },
    );
  }
  lathe(b.mesh(goldMat), {
    c: v3(0, 60, 24 + 312 + 108),
    profile: [
      [0, 0],
      [10, 0],
      [4, 40],
      [1.4, 78],
      [0, 92],
    ],
    segs: 10,
  });
  blob(b.mesh(glass[1]! >= 0 ? b.solid('star', glass[1]!) : goldMat), v3(0, 60, 24 + 312 + 204), v3(13, 7, 13), 0, {
    rings: 5,
    segs: 8,
  });

  // Windows: tall arches that glow, on the front of the hall and the towers.
  const archWin = (x: number, y: number, z: number, w: number, h: number): void => {
    blob(b.mesh(winMat, { noLines: true }), v3(x, y, z), v3(w, 3.4, h), 0, { rings: 8, segs: 10 });
    tube(
      b.mesh(goldMat),
      [
        { p: v3(x - w - 2, y - 2, z - h * 0.2), r: 2.2 },
        { p: v3(x - w * 0.6, y - 2, z + h * 0.7), r: 2.2 },
        { p: v3(x, y - 2, z + h + 3), r: 2.2 },
        { p: v3(x + w * 0.6, y - 2, z + h * 0.7), r: 2.2 },
        { p: v3(x + w + 2, y - 2, z - h * 0.2), r: 2.2 },
      ],
      { segs: 5, n: 18 },
    );
  };
  for (const x of [-156, -104, 104, 156]) archWin(x, -22, 124, 13, 30);
  for (const x of [-250, 250]) {
    archWin(x, -52, 200, 14, 34);
    archWin(x, -52, 120, 14, 28);
  }
  for (const x of [-132, 132]) archWin(x, 36, 250, 8, 24);
  for (const a of [-0.6, 0, 0.6]) archWin(Math.sin(a) * 92, 60 - Math.cos(a) * 92, 240, 12, 34);

  // The great door: a tall gold arch with a glowing teal doorway behind steps.
  box(b.mesh(wall), v3(0, -42, 36), v3(150, 48, 26));
  box(b.mesh(wall), v3(0, -30, 50), v3(116, 40, 28));
  box(b.mesh(darkMat), v3(0, -25, 90), v3(70, 6, 104));
  blob(b.mesh(darkMat), v3(0, -25, 142), v3(35, 3, 28), 0, { rings: 8, segs: 12 });
  blob(b.mesh(portalMat, { noLines: true }), v3(0, -29, 96), v3(28, 2, 88), 0, { rings: 10, segs: 12 });
  blob(b.mesh(portalMat, { noLines: true }), v3(0, -29, 140), v3(28, 2, 26), 0, { rings: 8, segs: 12 });
  tube(
    b.mesh(goldMat),
    [
      { p: v3(-40, -31, 44), r: 3.6 },
      { p: v3(-40, -31, 130), r: 3.6 },
      { p: v3(-28, -31, 160), r: 3.6 },
      { p: v3(0, -31, 172), r: 3.6 },
      { p: v3(28, -31, 160), r: 3.6 },
      { p: v3(40, -31, 130), r: 3.6 },
      { p: v3(40, -31, 44), r: 3.6 },
    ],
    { segs: 6, n: 32 },
  );
  // Banners hang by the door.
  for (const sx of [-1, 1]) {
    const flag = b.variant(`flag-${sx}`, sx < 0 ? PALACE.banner : PALACE.roofViolet, { noLines: true });
    ribbon(
      b.mesh(b.solid(`flag-${sx}`, flag), { twoSided: true, noLines: true }),
      [
        { p: v3(sx * 74, -27, 190), w: 9, t: 1 },
        { p: v3(sx * 74, -27, 148), w: 9, t: 1 },
        { p: v3(sx * 74, -27, 112), w: 3, t: 1 },
      ],
      v3(0, -1, 0),
      4,
    );
  }
  // Floating crystals round the dome: stars of colour that hang in the air.
  const rng = mulberry32(12);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + 0.3;
    const rr = 150 + rng() * 40;
    const z = 410 + Math.sin(a * 2) * 50 + rng() * 40;
    const g = b.variant(`float-${i}`, GLASS[i % 4]!, { emissive: 2, bands: [0.2, 0.4, 0.6, 0.8] });
    const cm = b.mesh(b.solid(`float-${i}`, g));
    const bob = Math.sin(drift + i) * 5;
    blob(cm, v3(Math.cos(a) * rr, 60 + Math.sin(a) * rr * 0.6, z + bob), v3(7, 7, 12), a, { rings: 4, segs: 6 });
  }
  return b;
}

export function renderMagicHall(frame: number): Rgba {
  const c = HALL_CANVAS;
  const base = renderScene(hallScene(frame), { width: c.w, height: c.h, originX: c.ox, originY: c.oy, ss: 3 }).rgba;
  return twinkles(base, frame, HALL_FRAMES, { seed: 77, count: 90, size: 4 });
}

export type { V3 };
