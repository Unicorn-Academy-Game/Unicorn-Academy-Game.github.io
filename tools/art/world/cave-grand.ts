import { fromOklch } from '../core/color';
import type { Rgba } from '../core/image';
import { hash2, mulberry32 } from '../core/rng';
import { TAU, type V3, v3 } from '../core/vec';
import { lathe } from './arch';
import { jewel, KNOB, PRISM, prism, sparkle } from './cave-gems';
import { underGlow } from './glow';
import { Painter } from './paint';
import type { Ramp } from './palette';
import { blob, tube } from './prims';
import { renderScene, SceneBuilder, scaleScene } from './scene';

/**
 * The great things of the cave: the Heart Crystal that stands on its dais, the pillars that crackle
 * for the storm, the crystal ball in the witch's yard and the chimes. A thing the game tints is two
 * pictures, the stone it stands on, which keeps its own colour, and the crystal, drawn in white so
 * that it takes any colour a rainbow gives it.
 */

export interface Canvas {
  w: number;
  h: number;
  ox: number;
  oy: number;
}

const draw = (
  b: SceneBuilder,
  c: Canvas,
  extra: Partial<Parameters<typeof renderScene>[1]> = {},
): { rgba: Rgba; at: (p: V3) => [number, number] } => {
  const r = renderScene(b, {
    width: c.w,
    height: c.h,
    originX: c.ox,
    originY: c.oy,
    ss: 4,
    aoRadius: 9,
    lineDepth: 5,
    ...extra,
  });
  return { rgba: r.rgba, at: r.at };
};

const rockOf = (b: SceneBuilder): number =>
  b.solid(
    'rock',
    b.variant('rock', KNOB, { bands: [0.15, 0.32, 0.52, 0.74, 0.9] }),
    (s) => (hash2(s.px, s.py, 4) - 0.5) * 0.06,
  );

export const HEART_CANVAS: Canvas = { w: 440, h: 440, ox: 220, oy: 350 };
const DAIS_TOP = 26;

/**
 * The dais: a low mound of rock with a ring of rough stones round its foot and two steps up its
 * front.
 */
export function heartDais(): SceneBuilder {
  const b = new SceneBuilder();
  const rock = rockOf(b);
  const rng = mulberry32(31);
  blob(b.mesh(rock), v3(0, 0, 12), v3(104, 78, 20), 0.2, { rings: 8, segs: 16 });
  const rim = b.mesh(rock);
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng() * 0.3;
    const r = 15 + rng() * 9;
    blob(rim, v3(Math.cos(a) * 106, Math.sin(a) * 80, r * 0.5), v3(r * 1.2, r * 0.95, r * 0.8), rng() * 3, {
      rings: 5,
      segs: 8,
    });
  }
  lathe(b.mesh(rock), {
    c: v3(0, 0, 18),
    segs: 18,
    profile: [
      [70, 0],
      [64, DAIS_TOP - 18],
      [0, DAIS_TOP - 18],
    ],
    smooth: true,
  });
  return b;
}

/**
 * The Heart: one great crystal with a ring of tall ones leaning out from it and a few small ones at
 * its foot, all in white.
 */
export function heartCrystals(): SceneBuilder {
  const b = new SceneBuilder();
  const rng = mulberry32(17);
  const m = b.mesh(
    b.solid('stone', b.variant('stone', PRISM, { bands: [0.16, 0.4, 0.64, 0.86], outlineLit: PRISM[1]! })),
  );
  const pieces: { x: number; y: number; r: number; h: number; lx: number; ly: number; yaw: number }[] = [
    { x: 0, y: -6, r: 31, h: 236, lx: 0.02, ly: 0.01, yaw: 0.3 },
  ];
  const ring = 7;
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * TAU + 0.5;
    const d = 40 + rng() * 22;
    pieces.push({
      x: Math.cos(a) * d,
      y: Math.sin(a) * d * 0.7,
      r: 15 + rng() * 8,
      h: 100 + rng() * 74,
      lx: Math.cos(a) * (0.26 + rng() * 0.12),
      ly: Math.sin(a) * 0.2,
      yaw: rng() * 2,
    });
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.2;
    const d = 76 + rng() * 14;
    pieces.push({
      x: Math.cos(a) * d,
      y: Math.sin(a) * d * 0.7,
      r: 8 + rng() * 4,
      h: 34 + rng() * 26,
      lx: Math.cos(a) * 0.3,
      ly: Math.sin(a) * 0.2,
      yaw: rng() * 2,
    });
  }
  pieces.sort((p, q) => p.y - q.y);
  for (const p of pieces) prism(m, v3(p.x, p.y, DAIS_TOP), { r: p.r, h: p.h, lean: [p.lx, p.ly], yaw: p.yaw });
  return b;
}

export const renderHeartDais = (): Rgba => draw(heartDais(), HEART_CANVAS, { aoRadius: 12 }).rgba;
export const renderHeartCrystals = (): Rgba => draw(heartCrystals(), HEART_CANVAS, { aoRadius: 10 }).rgba;

/**
 * A pillar is built small and drawn this many times bigger, so the tall crystal stands well over a
 * unicorn's head.
 */
const PILLAR_K = 1.5;
export const PILLAR_CANVAS: Canvas = { w: 270, h: 370, ox: 135, oy: 316 };

export function pillarRock(): SceneBuilder {
  const b = new SceneBuilder();
  const rock = rockOf(b);
  const rng = mulberry32(5);
  blob(b.mesh(rock), v3(0, 0, 8), v3(42, 30, 12), 0.1, { rings: 6, segs: 12 });
  const rim = b.mesh(rock);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + rng() * 0.4;
    const r = 11 + rng() * 6;
    blob(rim, v3(Math.cos(a) * 36, Math.sin(a) * 26, r * 0.5), v3(r * 1.1, r * 0.9, r * 0.8), rng() * 3, {
      rings: 5,
      segs: 8,
    });
  }
  scaleScene(b, PILLAR_K);
  return b;
}

export function pillarCrystals(): SceneBuilder {
  const b = new SceneBuilder();
  const m = b.mesh(
    b.solid('stone', b.variant('stone', PRISM, { bands: [0.16, 0.4, 0.64, 0.86], outlineLit: PRISM[1]! })),
  );
  prism(m, v3(0, 4, 14), { r: 8, h: 78, lean: [-0.34, 0.1], yaw: 1 });
  prism(m, v3(18, 6, 14), { r: 9, h: 104, lean: [0.28, 0.1], yaw: 0.4 });
  prism(m, v3(0, -2, 14), { r: 17, h: 188, lean: [0.01, 0.02], yaw: 0.2 });
  scaleScene(b, PILLAR_K);
  return b;
}

export const renderPillarRock = (): Rgba => draw(pillarRock(), PILLAR_CANVAS).rgba;
export const renderPillarCrystals = (): Rgba => draw(pillarCrystals(), PILLAR_CANVAS).rgba;

/** The ball and its stand are built small and drawn this many times bigger. */
const ORB_K = 1.5;
export const ORB_CANVAS: Canvas = { w: 190, h: 250, ox: 95, oy: 190 };
/** How far above the foot of the stand the middle of the ball is, in pixels. */
export const ORB_HEIGHT = Math.round(74 * ORB_K);

/** The stand: a goblet of carved stone with a ring of little crystals round its foot. */
export function orbStand(): SceneBuilder {
  const b = new SceneBuilder();
  const rock = rockOf(b);
  const m = b.mesh(rock);
  lathe(m, {
    c: v3(0, 0, 0),
    segs: 12,
    smooth: true,
    profile: [
      [32, 0],
      [31, 6],
      [22, 12],
      [11, 24],
      [9, 36],
      [14, 44],
      [26, 52],
      [28, 56],
      [20, 56],
      [14, 52],
    ],
  });
  scaleScene(b, ORB_K);
  return b;
}

/**
 * The ball: a sphere of pale glass, drawn white so it takes any colour, with a bright crescent on
 * its upper left.
 */
export function renderOrb(): Rgba {
  const b = new SceneBuilder();
  const glass = b.solid(
    'glass',
    b.variant(
      'glass',
      [
        [120, 116, 170],
        [168, 164, 216],
        [210, 208, 244],
        [240, 240, 255],
        [255, 255, 255],
      ] as Ramp,
      { bands: [0.3, 0.52, 0.72, 0.9] },
    ),
  );
  blob(b.mesh(glass), v3(0, 0, 74), v3(27, 27, 27), 0, { rings: 12, segs: 18 });
  scaleScene(b, ORB_K);
  const { rgba, at } = draw(b, ORB_CANVAS, { aoRadius: 8 });
  const [cx, cy] = at(v3(0, 0, ORB_HEIGHT));
  const p = new Painter(rgba);
  // The highlight: a crescent and a spot, which do not take the tint at all when they are pure
  // white.
  for (let a = 2.4; a < 3.7; a += 0.035) {
    const x = Math.round(cx + Math.cos(a) * 29),
      y = Math.round(cy - Math.sin(a) * 29);
    for (const dx of [0, 1, 2]) p.px(x + dx, y, [255, 255, 255]);
  }
  for (const [dx, dy] of [
    [13, -18],
    [14, -18],
    [15, -18],
    [14, -17],
    [14, -19],
  ] as const)
    p.px(Math.round(cx) + dx, Math.round(cy) + dy, [255, 255, 255]);
  return rgba;
}

export const renderOrbStand = (): Rgba => draw(orbStand(), ORB_CANVAS, { aoRadius: 7 }).rgba;

export const CHIMES_CANVAS: Canvas = { w: 230, h: 250, ox: 115, oy: 200 };
const CHIME_HUES = [15, 55, 140, 200, 262, 320] as const;

/**
 * A frame of dark rock and wood with six crystal rods hanging from it, one for each colour of the
 * rainbow, the longest in the middle.
 */
export function chimes(): SceneBuilder {
  const b = new SceneBuilder();
  const rock = b.mesh(rockOf(b));
  const wood = b.mesh(
    b.solid(
      'wood',
      b.variant('wood', [
        [52, 34, 52],
        [76, 50, 72],
        [104, 70, 92],
        [138, 98, 116],
      ] as Ramp),
      (s) => (hash2(s.px, s.py, 8) - 0.5) * 0.08,
    ),
  );
  for (const sx of [-1, 1]) {
    blob(rock, v3(sx * 84, 0, 8), v3(20, 15, 10), sx, { rings: 5, segs: 9 });
    tube(
      wood,
      [
        { p: v3(sx * 84, 0, 8), r: 6.4 },
        { p: v3(sx * 84, 0, 90), r: 5.6 },
        { p: v3(sx * 82, 0, 150), r: 5 },
      ],
      { segs: 7, n: 6 },
    );
  }
  tube(
    wood,
    [
      { p: v3(-88, 0, 146), r: 5.4 },
      { p: v3(0, 0, 150), r: 5 },
      { p: v3(88, 0, 146), r: 5.4 },
    ],
    { segs: 7, n: 8 },
  );
  const cord = b.mesh(
    b.solid(
      'cord',
      b.variant(
        'cord',
        [
          [190, 170, 200],
          [226, 210, 232],
        ] as Ramp,
        { noLines: true },
      ),
    ),
    { noLines: true },
  );
  CHIME_HUES.forEach((hue, i) => {
    const x = -64 + i * 25.6;
    const len = [74, 90, 104, 104, 90, 74][i]!;
    const top = 146;
    tube(
      cord,
      [
        { p: v3(x, 0, top), r: 0.9 },
        { p: v3(x, 0, top - 8), r: 0.9 },
      ],
      { segs: 4, n: 2 },
    );
    const rod = b.mesh(b.solid(`rod${i}`, b.variant(`rod${i}`, jewel(hue, 0.2), { bands: [0.16, 0.4, 0.64, 0.86] })));
    // A rod hangs from its top, so it is a prism upside down: the foot is the top, the point is the
    // bottom.
    prism(rod, v3(x, 0, top - 8), { r: 7.6, h: -len, tip: 0.2, taper: 0.9, yaw: 0.3 });
  });
  return b;
}

export function renderChimes(): Rgba {
  const { rgba, at } = draw(chimes(), CHIMES_CANVAS, { aoRadius: 7 });
  const [cx, cy] = at(v3(0, 0, 90));
  const lit = underGlow(rgba, cx, cy, 108, 72, fromOklch(0.84, 0.12, 290), 0.34);
  for (const [dx, dy, hue] of [
    [-52, -4, 15],
    [-14, 22, 140],
    [40, 6, 262],
  ] as const)
    sparkle(lit, Math.round(cx) + dx, Math.round(cy) + dy, 2, fromOklch(0.92, 0.1, hue));
  return lit;
}
