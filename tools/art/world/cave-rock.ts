import { createRgba, type Rgba } from '../core/image';
import { hash2, mulberry32 } from '../core/rng';
import { type V3, v3 } from '../core/vec';
import { lathe } from './arch';
import { KNOB, prism, sparkle } from './cave-gems';
import { rock } from './flora';
import type { Ramp } from './palette';
import { blob } from './prims';
import { renderScene, SceneBuilder } from './scene';

/**
 * The stone the cave is made of, and the crystals that sleep in it: boulders, the tall spires that
 * rise from the floor, and the little groups of crystals that wake when a light touches them.
 */

export interface Canvas {
  w: number;
  h: number;
  ox: number;
  oy: number;
}

export const ROCK_CANVAS: Canvas = { w: 180, h: 160, ox: 90, oy: 124 };
export const SPIRE_CANVAS: Canvas = { w: 180, h: 280, ox: 90, oy: 236 };
export const GROUP_CANVAS: Canvas = { w: 130, h: 140, ox: 65, oy: 108 };

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
    aoRadius: 8,
    lineDepth: 5,
    ...extra,
  });
  return { rgba: r.rgba, at: r.at };
};

/** A boulder of the cave's own dark stone. */
export const caveRock = (seed: number, scale: number): Rgba =>
  draw(rock({ seed, ramp: KNOB, scale }), ROCK_CANVAS).rgba;

/**
 * A stalagmite: a few faceted cones of different heights standing together, each cut flat so it
 * catches the light on its own, with a thin band of crystal near the tip of the tallest.
 */
export function spire(o: { seed: number; scale?: number }): SceneBuilder {
  const k = o.scale ?? 1;
  const rng = mulberry32(o.seed);
  const b = new SceneBuilder();
  const stone = b.solid(
    'stone',
    b.variant('stone', KNOB, { bands: [0.16, 0.34, 0.54, 0.76, 0.92] }),
    (s) => (hash2(s.px, s.py, o.seed) - 0.5) * 0.06,
  );
  const m = b.mesh(stone);
  const parts: { x: number; y: number; r: number; h: number; yaw: number }[] = [
    { x: 0, y: 0, r: 36 * k, h: (170 + rng() * 30) * k, yaw: rng() },
    { x: -34 * k, y: 10 * k, r: 24 * k, h: (84 + rng() * 26) * k, yaw: rng() },
    { x: 30 * k, y: 12 * k, r: 20 * k, h: (62 + rng() * 22) * k, yaw: rng() },
  ];
  parts.sort((p, q) => p.y - q.y);
  for (const p of parts) {
    const bulge = 1 + (rng() - 0.5) * 0.18;
    lathe(m, {
      c: v3(p.x, p.y, 0),
      segs: 7,
      faceted: true,
      yaw: p.yaw,
      profile: [
        [p.r, 0],
        [p.r * 0.92 * bulge, p.h * 0.18],
        [p.r * 0.7, p.h * 0.5],
        [p.r * 0.4 * bulge, p.h * 0.8],
        [0, p.h],
      ],
    });
  }
  return b;
}

export function renderSpire(seed: number, scale = 1): Rgba {
  return draw(spire({ seed, scale }), SPIRE_CANVAS).rgba;
}

/** What a crystal looks like while it sleeps: grey-violet, with no shine of its own. */
export const DIM: Ramp = [
  [52, 46, 78],
  [74, 68, 104],
  [100, 94, 132],
  [128, 122, 158],
  [158, 152, 184],
];

/**
 * A group of crystals standing out of a little rock. `ramp` is what they are made of, the white
 * prism ramp when they are to be tinted.
 */
export function group(o: { seed: number; ramp: Ramp; scale?: number }): SceneBuilder {
  const k = o.scale ?? 1;
  const rng = mulberry32(o.seed);
  const b = new SceneBuilder();
  const stone = b.solid('stone', b.variant('stone', o.ramp, { bands: [0.16, 0.4, 0.64, 0.86] }));
  const rockMat = b.solid('rock', b.variant('rock', KNOB, { bands: [0.15, 0.32, 0.52, 0.74, 0.9] }));
  blob(b.mesh(rockMat), v3(0, 0, 4 * k), v3(24 * k, 17 * k, 8 * k), 0.3, { rings: 6, segs: 9 });
  const m = b.mesh(stone);
  const pieces = [
    { x: 0, y: -1, r: 9.5, h: 62, lx: 0.04, ly: 0 },
    { x: -14, y: 4, r: 7, h: 38, lx: -0.28, ly: 0.04 },
    { x: 13, y: 5, r: 7.5, h: 44, lx: 0.3, ly: 0.06 },
    { x: 2, y: 10, r: 5.5, h: 26, lx: 0.02, ly: 0.22 },
  ];
  for (const p of pieces)
    prism(m, v3(p.x * k, p.y * k, 7 * k), {
      r: p.r * k,
      h: p.h * k * (0.92 + rng() * 0.16),
      lean: [p.lx, p.ly],
      yaw: rng() * 2,
    });
  return b;
}

/**
 * A sleeping group has one dim point of light in its tip that blinks, so a child can tell it is
 * alive. `frame` of `frames`.
 */
export function renderSleeping(seed: number, frame = 0, frames = 6): Rgba {
  const { rgba, at } = draw(group({ seed, ramp: DIM }), GROUP_CANVAS);
  const [tx, ty] = at(v3(0, -1, 68));
  const on = frame % frames === 1 || frame % frames === 2;
  if (on) sparkle(rgba, Math.round(tx), Math.round(ty) + 2, 2, [214, 206, 255]);
  return rgba;
}

/**
 * The same group awake, in white, for the game to tint. The glow that sits behind it is a separate
 * picture, so it can shine and change colour.
 */
export function renderAwake(seed: number): Rgba {
  return draw(
    group({
      seed,
      ramp: [
        [104, 100, 156],
        [146, 142, 200],
        [190, 188, 230],
        [228, 228, 250],
        [255, 255, 255],
      ],
    }),
    GROUP_CANVAS,
  ).rgba;
}

/**
 * A soft round glow in white, kept in a few steps so it keeps the pixel-art look, for the game to
 * tint and lay over the picture it shines behind.
 */
export function renderHalo(size: number, steps = 7): Rgba {
  const img = createRgba(size, size);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c) / c;
      if (d >= 1) continue;
      const t = Math.floor((1 - d) * steps) / steps;
      const a = Math.round(255 * t * t);
      if (a > 0) img.data.set([255, 255, 255, a], (y * size + x) * 4);
    }
  }
  return img;
}
