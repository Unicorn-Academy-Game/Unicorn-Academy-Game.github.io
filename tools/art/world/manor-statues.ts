import { hex, type RGB, ramp } from '../core/color';
import { createRgba, type Rgba } from '../core/image';
import type { SampleInfo } from '../core/render';
import { hash2 } from '../core/rng';
import { v3 } from '../core/vec';
import { Painter } from './paint';
import { GEM, PAL, type Ramp } from './palette';
import { blob, blobAlong, box, tube } from './prims';
import { renderScene, SceneBuilder } from './scene';

/**
 * The Wonder Gallery's statues: eight rare creatures from other places and worlds, each carved from
 * a different stone on one ivory pedestal with a gold plaque. They are friendly, round and chunky,
 * and each has the badge of the world it is from. Built from ellipsoids and tubes in the same scene
 * the unicorns are drawn in, so they are lit and outlined alike.
 */
const r = (base: string, o: Parameters<typeof ramp>[1] = {}): RGB[] =>
  ramp(hex(base), {
    steps: 6,
    shadowHue: 270,
    lightHue: 85,
    lean: 0.9,
    lightness: [-0.3, -0.2, -0.1, 0, 0.09, 0.17],
    ...o,
  });

export const STATUE = { canvas: { w: 250, h: 300, ox: 125, oy: 250 }, unit: 1.45, pedestal: 38 } as const;

export const STATUES = [
  'star-whale',
  'crystal-fox',
  'moon-hare',
  'ember-drake',
  'coral-seahorse',
  'cloud-lion',
  'storm-bird',
  'glow-owl',
] as const;
export type StatueId = (typeof STATUES)[number];

/** Where each is from. The badge is drawn in this colour, with the picture of the place. */
export const WORLDS: Record<StatueId, { world: string; colour: RGB; stone: Ramp }> = {
  'star-whale': { world: 'sky', colour: [90, 130, 255], stone: r('#4a63d6', { shadowHue: 255 }) },
  'crystal-fox': { world: 'crystal', colour: [190, 110, 255], stone: GEM.amethyst },
  'moon-hare': { world: 'moon', colour: [230, 232, 250], stone: PAL.marble },
  'ember-drake': { world: 'ember', colour: [255, 140, 60], stone: r('#d98a3a', { shadowHue: 20, lightHue: 80 }) },
  'coral-seahorse': { world: 'ocean', colour: [255, 120, 150], stone: r('#f29ab8', { shadowHue: 320 }) },
  'cloud-lion': { world: 'cloud', colour: [150, 215, 255], stone: PAL.frost },
  'storm-bird': { world: 'storm', colour: [160, 130, 255], stone: r('#8c78d8', { shadowHue: 265 }) },
  'glow-owl': { world: 'wood', colour: [90, 210, 140], stone: r('#4fbf8d', { shadowHue: 215, lightHue: 110 }) },
};

const IVORY: Ramp = r('#f1e6d4', { shadowHue: 310, lightness: [-0.3, -0.19, -0.1, -0.04, 0, 0.045] });
const DARK: Ramp = r('#3a2a58', { shadowHue: 280, lightness: [-0.2, -0.12, -0.05, 0, 0.05, 0.1] });

const T = (yaw: number): number => yaw;

/** Faint veins, as in the marble of the garden, so a statue is carved from something. */
const veins =
  (seed: number) =>
  (s: SampleInfo): number => {
    const [x, y, z] = s.rest;
    const w = Math.sin(x * 0.09 + z * 0.06 + 2.2 * Math.sin(y * 0.06 - z * 0.04 + seed) + seed * 3.1);
    return (Math.abs(w) < 0.05 ? -0.09 : 0) + (hash2(s.px, s.py, seed + 7) - 0.5) * 0.03;
  };

/**
 * One statue on its pedestal. The creature stands on the pedestal's top, which is `STATUE.pedestal`
 * up.
 */
function build(id: StatueId): SceneBuilder {
  const b = new SceneBuilder();
  const stone = b.solid('stone', b.variant('stone', WORLDS[id].stone), veins(id.length));
  const gold = b.solid('gold', b.variant('gold', GEM.gold, { bands: [0.2, 0.4, 0.6, 0.8, 0.92] }));
  const ivory = b.solid('ivory', b.variant('ivory', IVORY));
  const dark = b.solid('dark', b.variant('dark', DARK, { noLines: true }));
  const S = (): ReturnType<SceneBuilder['mesh']> => b.mesh(stone);
  const G = (): ReturnType<SceneBuilder['mesh']> => b.mesh(gold);
  const D = (): ReturnType<SceneBuilder['mesh']> => b.mesh(dark);
  const P = STATUE.pedestal;

  // The pedestal: a foot, a die with a gold band top and bottom, a cap, and a plaque on the front.
  box(b.mesh(ivory), v3(0, 0, 4), v3(68, 52, 8));
  box(b.mesh(ivory), v3(0, 0, 19), v3(54, 40, 22));
  box(b.mesh(gold), v3(0, 0, 8.7), v3(58, 44, 2.2));
  box(b.mesh(gold), v3(0, 0, 30.5), v3(58, 44, 2.2));
  box(b.mesh(ivory), v3(0, 0, 34.5), v3(64, 48, 6));
  box(b.mesh(gold), v3(0, -20.6, 19), v3(28, 2, 18));

  const z = (h: number): number => P + h;
  switch (id) {
    case 'star-whale': {
      blob(S(), v3(2, 0, z(26)), v3(34, 19, 20));
      tube(
        S(),
        [
          { p: v3(-24, 0, z(24)), r: 12 },
          { p: v3(-42, 0, z(32)), r: 8.5 },
          { p: v3(-52, 0, z(50)), r: 6 },
          { p: v3(-50, 0, z(66)), r: 4 },
        ],
        { segs: 10 },
      );
      blobAlong(S(), v3(-50, 9, z(70)), v3(4, 13, 3), v3(0, 0, 1), T(0.35));
      blobAlong(S(), v3(-50, -9, z(70)), v3(4, 13, 3), v3(0, 0, 1), T(-0.35));
      blob(S(), v3(28, 0, z(30)), v3(17, 16, 18));
      blobAlong(S(), v3(4, -18, z(15)), v3(13, 3.5, 7), v3(0, 0, 1), T(-0.4));
      blob(D(), v3(38, -11, z(36)), v3(3, 2.4, 3.6));
      for (const [x, zz, rr] of [
        [8, 58, 5.5],
        [28, 66, 4],
        [-14, 70, 4.5],
      ] as const)
        blob(G(), v3(x, 0, z(zz)), v3(rr, rr, rr));
      break;
    }
    case 'crystal-fox': {
      blob(S(), v3(-3, 0, z(22)), v3(17, 15, 24));
      blob(S(), v3(12, -2, z(54)), v3(14, 13, 12));
      blobAlong(S(), v3(25, -2, z(50)), v3(9, 6, 6), v3(0, 1, 0), T(0.1));
      for (const sy of [-1, 1]) blobAlong(S(), v3(8, sy * 8, z(72)), v3(4, 3.4, 13), v3(1, 0, 0), T(sy * 0.16));
      for (const sy of [-1, 1]) blob(S(), v3(12, sy * 8, z(7)), v3(7, 6, 8));
      tube(
        S(),
        [
          { p: v3(-16, 0, z(8)), r: 8 },
          { p: v3(-36, 0, z(14)), r: 11 },
          { p: v3(-40, 0, z(34)), r: 10 },
          { p: v3(-32, 0, z(50)), r: 6 },
        ],
        { segs: 10 },
      );
      blob(G(), v3(-30, 0, z(56)), v3(6, 6, 7));
      for (const [x, h, tilt] of [
        [-14, 48, -0.35],
        [-6, 54, 0],
        [2, 48, 0.35],
      ] as const)
        blobAlong(G(), v3(x, 8, z(h)), v3(3, 3, 10), v3(0, 1, 0), T(tilt));
      blob(D(), v3(21, -12, z(56)), v3(2.4, 1.8, 3));
      blob(D(), v3(34, -3, z(50)), v3(3, 2.6, 2.6));
      break;
    }
    case 'moon-hare': {
      blob(G(), v3(-26, 8, z(46)), v3(23, 3, 23));
      blob(S(), v3(-2, 0, z(20)), v3(22, 18, 20));
      blob(S(), v3(14, 0, z(40)), v3(14, 13, 13));
      for (const sy of [-1, 1]) blobAlong(S(), v3(10, sy * 6, z(64)), v3(4, 3.4, 18), v3(1, 0, 0), T(sy * 0.16));
      blob(S(), v3(-20, 0, z(18)), v3(8, 8, 8));
      blob(S(), v3(8, 0, z(5)), v3(18, 20, 6));
      blob(D(), v3(23, -9, z(44)), v3(2.3, 1.8, 3));
      blob(D(), v3(27, -2, z(38)), v3(2.4, 2, 2));
      break;
    }
    case 'ember-drake': {
      blob(S(), v3(0, 0, z(20)), v3(28, 19, 19));
      tube(
        S(),
        [
          { p: v3(16, 0, z(26)), r: 11 },
          { p: v3(24, 0, z(46)), r: 8 },
          { p: v3(24, 0, z(62)), r: 8 },
        ],
        { segs: 10 },
      );
      blob(S(), v3(30, 0, z(68)), v3(15, 12, 11));
      blobAlong(S(), v3(44, 0, z(64)), v3(9, 8, 6), v3(0, 1, 0), T(0.15));
      for (const sy of [-1, 1]) blob(G(), v3(26, sy * 6, z(79)), v3(2.8, 2.8, 7));
      blobAlong(G(), v3(-12, 9, z(56)), v3(20, 3.5, 17), v3(0, 1, 0), T(-0.5));
      blobAlong(G(), v3(-6, -9, z(50)), v3(16, 3.5, 13), v3(0, 1, 0), T(-0.5));
      tube(
        S(),
        [
          { p: v3(-24, 0, z(12)), r: 10 },
          { p: v3(-44, 0, z(8)), r: 7 },
          { p: v3(-56, 0, z(20)), r: 5 },
          { p: v3(-50, 0, z(32)), r: 4 },
        ],
        { segs: 10 },
      );
      for (const sy of [-1, 1]) blob(S(), v3(14, sy * 11, z(6)), v3(9, 6, 7));
      for (const [x, h] of [
        [-8, 38],
        [4, 40],
        [-20, 30],
      ] as const)
        blob(G(), v3(x, 0, z(h)), v3(4, 3, 5));
      blob(D(), v3(38, -9, z(72)), v3(2.4, 2, 3));
      break;
    }
    case 'coral-seahorse': {
      tube(
        S(),
        [
          { p: v3(-4, 0, z(4)), r: 12 },
          { p: v3(-14, 0, z(20)), r: 11 },
          { p: v3(-6, 0, z(38)), r: 12 },
          { p: v3(6, 0, z(54)), r: 10 },
          { p: v3(8, 0, z(68)), r: 8 },
        ],
        { segs: 12 },
      );
      blob(S(), v3(14, 0, z(74)), v3(11, 10, 10));
      tube(
        S(),
        [
          { p: v3(18, 0, z(72)), r: 4.4 },
          { p: v3(34, 0, z(70)), r: 3.6 },
        ],
        { segs: 8 },
      );
      tube(
        S(),
        [
          { p: v3(-8, 0, z(6)), r: 7 },
          { p: v3(-26, 0, z(2)), r: 6 },
          { p: v3(-34, 0, z(14)), r: 5 },
          { p: v3(-26, 0, z(22)), r: 4 },
          { p: v3(-18, 0, z(16)), r: 3.2 },
        ],
        { segs: 8 },
      );
      blobAlong(G(), v3(-14, 12, z(40)), v3(4, 12, 10), v3(0, 0, 1), T(0.4));
      for (const [x, h] of [
        [8, 80],
        [-2, 74],
      ] as const)
        blobAlong(G(), v3(x, 0, z(h)), v3(3, 3, 8), v3(0, 1, 0), T(-0.5));
      blob(D(), v3(19, -8, z(77)), v3(2.2, 1.8, 2.6));
      break;
    }
    case 'cloud-lion': {
      blob(S(), v3(-4, 0, z(18)), v3(26, 19, 17));
      blob(S(), v3(14, 0, z(38)), v3(15, 14, 17));
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2;
        blob(
          G(),
          v3(14 + Math.cos(a) * 17, Math.sin(a) * 9 - 7, z(40 + Math.sin(a * 2) * 3 + Math.cos(a) * 9)),
          v3(8, 8, 9),
        );
      }
      blob(S(), v3(26, -6, z(32)), v3(9, 7, 7));
      blob(D(), v3(24, -12, z(40)), v3(2.3, 1.8, 2.8));
      blob(D(), v3(34, -9, z(33)), v3(3, 2.6, 2.4));
      for (const sy of [-1, 1]) blob(S(), v3(20, sy * 11, z(7)), v3(9, 6, 7));
      tube(
        S(),
        [
          { p: v3(-26, 0, z(10)), r: 6 },
          { p: v3(-42, 0, z(18)), r: 5 },
          { p: v3(-44, 0, z(34)), r: 4 },
        ],
        { segs: 8 },
      );
      blob(G(), v3(-44, 0, z(38)), v3(6, 6, 7));
      break;
    }
    case 'storm-bird': {
      blob(S(), v3(0, 0, z(24)), v3(17, 14, 24));
      blob(S(), v3(0, -3, z(52)), v3(11, 10, 10));
      blob(G(), v3(0, -13, z(50)), v3(3.4, 6, 3.4));
      blob(G(), v3(0, -2, z(66)), v3(3, 3, 8));
      for (const sx of [-1, 1]) {
        blobAlong(S(), v3(sx * 30, 2, z(38)), v3(22, 6, 8), v3(0, 1, 0), T(sx * -0.45));
        blobAlong(S(), v3(sx * 50, 2, z(54)), v3(14, 5, 6), v3(0, 1, 0), T(sx * -0.95));
        blobAlong(S(), v3(sx * 14, 8, z(14)), v3(4, 12, 3), v3(0, 0, 1), T(sx * 0.3));
        tube(
          G(),
          [
            { p: v3(sx * 6, -4, z(3)), r: 2.2 },
            { p: v3(sx * 6, -4, z(10)), r: 2.2 },
          ],
          { segs: 6 },
        );
      }
      blobAlong(S(), v3(0, 10, z(12)), v3(4, 14, 3), v3(0, 0, 1), T(0));
      for (const sx of [-1, 1]) blob(D(), v3(sx * 5, -11, z(56)), v3(2, 1.8, 2.6));
      break;
    }
    case 'glow-owl': {
      blob(S(), v3(0, 0, z(24)), v3(19, 16, 26));
      blob(S(), v3(0, -2, z(56)), v3(19, 15, 14));
      for (const sx of [-1, 1]) {
        blobAlong(S(), v3(sx * 11, 0, z(74)), v3(3.4, 3.4, 8), v3(0, 1, 0), T(sx * -0.4));
        blob(G(), v3(sx * 8, -13, z(58)), v3(7.4, 3, 7.4));
        blob(D(), v3(sx * 8, -15.5, z(58)), v3(3, 1.6, 3.4));
        blobAlong(S(), v3(sx * 18, 0, z(30)), v3(6, 9, 19), v3(0, 1, 0), T(sx * 0.1));
        blob(G(), v3(sx * 6, -6, z(3)), v3(6, 5, 3));
      }
      blob(G(), v3(0, -15, z(51)), v3(3, 4, 4));
      blob(G(), v3(0, -14, z(36)), v3(9, 2.6, 10));
      break;
    }
  }
  return b;
}

/** A statue on its pedestal, as one sprite anchored at the middle of the pedestal's foot. */
export function renderStatue(id: StatueId): Rgba {
  const c = STATUE.canvas;
  const out = renderScene(build(id), {
    width: c.w,
    height: c.h,
    originX: c.ox,
    originY: c.oy,
    ss: 4,
    unit: STATUE.unit,
    aoRadius: 8,
    lineDepth: 5,
    shadowFit: true,
    shadowBias: 3.2,
  });
  const p = new Painter(out.rgba);
  // The plaque: a small round badge of the world it is from, so a child who cannot read can still
  // tell where each one came from.
  const [bx, by] = out.at(v3(0, -26, 24));
  paintBadge(p, Math.round(bx), Math.round(by), id, 6);
  return out.rgba;
}

/**
 * A world's badge: a coloured disc with a simple mark for the place. Used on the plaque and,
 * bigger, when the statue is tapped.
 */
export function paintBadge(p: Painter, cx: number, cy: number, id: StatueId, R: number): void {
  const { world, colour } = WORLDS[id];
  const lit = (k: number): RGB => [
    Math.min(255, colour[0] * k),
    Math.min(255, colour[1] * k),
    Math.min(255, colour[2] * k),
  ];
  for (let y = -R - 1; y <= R + 1; y++) {
    for (let x = -R - 1; x <= R + 1; x++) {
      const d = Math.hypot(x, y);
      if (d > R + 0.5) continue;
      if (d > R - 1) p.px(cx + x, cy + y, [58, 36, 20]);
      else p.px(cx + x, cy + y, lit(x + y < -R * 0.4 ? 1.12 : x + y > R * 0.5 ? 0.72 : 0.92));
    }
  }
  const dot = (x: number, y: number, c: RGB): void => p.px(cx + x, cy + y, c);
  const k = Math.max(1, Math.round(R / 6));
  const white: RGB = [255, 250, 232];
  const mark: Record<string, [number, number][]> = {
    sky: [
      [0, -2],
      [-1, -1],
      [0, -1],
      [1, -1],
      [-2, 0],
      [-1, 0],
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 2],
    ],
    crystal: [
      [0, -3],
      [0, -2],
      [-1, -1],
      [0, -1],
      [1, -1],
      [-1, 0],
      [0, 0],
      [1, 0],
      [0, 1],
      [0, 2],
    ],
    moon: [
      [-1, -2],
      [0, -2],
      [-2, -1],
      [-2, 0],
      [-2, 1],
      [-1, 2],
      [0, 2],
      [-1, -1],
      [-1, 0],
      [-1, 1],
    ],
    ember: [
      [0, -3],
      [0, -2],
      [-1, -1],
      [0, -1],
      [1, 0],
      [-1, 0],
      [0, 0],
      [0, 1],
      [-1, 1],
      [1, 1],
      [0, 2],
    ],
    ocean: [
      [-3, 0],
      [-2, -1],
      [-1, 0],
      [0, -1],
      [1, 0],
      [2, -1],
      [3, 0],
      [-3, 2],
      [-2, 1],
      [-1, 2],
      [0, 1],
      [1, 2],
      [2, 1],
      [3, 2],
    ],
    cloud: [
      [-2, 1],
      [-1, 0],
      [0, -1],
      [1, 0],
      [2, 1],
      [-1, 1],
      [0, 1],
      [1, 1],
      [0, 0],
    ],
    storm: [
      [1, -3],
      [0, -2],
      [0, -1],
      [-1, 0],
      [0, 0],
      [1, 0],
      [0, 1],
      [-1, 2],
      [-1, 3],
    ],
    wood: [
      [0, -3],
      [0, -2],
      [-1, -1],
      [0, -1],
      [1, -1],
      [-2, 0],
      [-1, 0],
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [0, 2],
    ],
  };
  for (const [x, y] of mark[world]!)
    for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) dot(x * k + a, y * k + b, white);
}

/** The badge by itself, big enough to float over a statue when it is tapped. */
export const BADGE_CANVAS = { w: 56, h: 56, ox: 28, oy: 28 } as const;
export function renderBadge(id: StatueId): Rgba {
  const img = createRgba(BADGE_CANVAS.w, BADGE_CANVAS.h);
  paintBadge(new Painter(img), BADGE_CANVAS.ox, BADGE_CANVAS.oy, id, 22);
  return img;
}
