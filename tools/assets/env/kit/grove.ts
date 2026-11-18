import type { Rgba } from '../../../art/core/image';
import {
  cabin,
  candyLamp,
  christmasTree,
  gate,
  glowOf,
  present,
  reindeer,
  renderGrove,
  sleigh,
  snowFir,
  snowman,
  snowPile,
  snowRock,
  WRAP_NAMES,
} from '../../../art/world/grove';
import type { SceneBuilder } from '../../../art/world/scene';
import type { Recipe } from '../types';
import { CAVE_RECIPES } from './cave';
import { reuse } from './reuse';

const SRC = [
  'assets/env/kit/grove.ts',
  'art/world/grove.ts',
  'art/world/trees.ts',
  'art/world/arch.ts',
  'art/world/prims.ts',
  'art/world/scene.ts',
  'art/world/palette.ts',
  'art/core/render.ts',
];

/**
 * Santa's grove: firs heavy with snow, the Christmas tree, presents to open, the sleigh and its
 * reindeer, snowmen, striped lamp posts, the cabin and mounds of snow. The way in is drawn for the
 * forest's bundle, so the forest has its gate without loading the grove.
 */
const SMALL = { w: 128, h: 128, ox: 64, oy: 104 } as const;
const FIR = { w: 400, h: 400, ox: 200, oy: 368 } as const;
const TREE = { w: 560, h: 680, ox: 280, oy: 640 } as const;
const shadow = (rx: number, ry: number, dx = 0, a = 0.26) => ({ rx, ry, dx, dy: 2, a });

const make = (
  id: string,
  canvas: { w: number; h: number; ox: number; oy: number },
  scene: () => SceneBuilder,
  extra: Partial<Recipe> = {},
): Recipe => ({
  id,
  bundle: 'grove',
  canvas,
  render: () => renderGrove(scene(), canvas),
  source: SRC,
  ...extra,
});

const FIRS = [
  { n: 1, seed: 2, scale: 0.85 },
  { n: 2, seed: 12, scale: 0.7 },
  { n: 3, seed: 22, scale: 0.95 },
] as const;

const LIGHT_FRAMES = 3;

/** The tree's lights are an overlay of three frames, each lighting a third of the bulbs. */
const treeLights = (f: number): Rgba => glowOf(renderGrove(christmasTree({ lights: true, phase: f }), TREE), 8, 0.6);

export const GROVE_RECIPES: Recipe[] = [
  ...reuse(CAVE_RECIPES, ['cc-halo'], 'xm', 'grove'),
  ...FIRS.map((f) =>
    make(`xm-fir-${f.n}`, FIR, () => snowFir({ seed: f.seed, scale: f.scale }), {
      shadow: {
        rx: Math.round(84 * f.scale),
        ry: Math.round(84 * f.scale * 0.27),
        dx: Math.round(84 * f.scale * 0.28),
        dy: -2,
        a: 0.28,
      },
      canopy: {
        x: -Math.round(112 * f.scale),
        y: -Math.round(330 * f.scale),
        w: Math.round(224 * f.scale),
        h: Math.round(290 * f.scale),
      },
      footprint: { r: Math.round(20 * f.scale) },
    }),
  ),
  make('xm-tree', TREE, () => christmasTree({ lights: false }), {
    shadow: shadow(150, 42, 40, 0.3),
    canopy: { x: -170, y: -520, w: 340, h: 420 },
    footprint: { r: 46 },
  }),
  {
    id: 'xm-tree-lights',
    bundle: 'grove',
    canvas: TREE,
    anim: { frames: LIGHT_FRAMES, fps: 3, loop: true },
    render: treeLights,
    source: SRC,
  },
  ...WRAP_NAMES.flatMap((wrap, i) => [
    make(`xm-present-${wrap}`, SMALL, () => present({ wrap, open: false, seed: i }), {
      shadow: shadow(34, 9, 4, 0.24),
      footprint: { r: 24 },
    }),
    make(`xm-present-open-${wrap}`, { w: 192, h: 192, ox: 96, oy: 168 }, () => present({ wrap, open: true, seed: i }), {
      shadow: shadow(34, 9, 4, 0.24),
    }),
  ]),
  make('xm-sleigh', { w: 256, h: 192, ox: 128, oy: 150 }, sleigh, {
    shadow: shadow(100, 24, 10),
    footprint: { r: 64 },
  }),
  make('xm-reindeer', { w: 224, h: 256, ox: 112, oy: 214 }, reindeer, {
    shadow: shadow(56, 14, 4),
    footprint: { r: 28 },
  }),
  ...(['red', 'green'] as const).map((scarf) =>
    make(`xm-snowman-${scarf}`, { w: 192, h: 224, ox: 96, oy: 190 }, () => snowman({ scarf }), {
      shadow: shadow(46, 12, 4, 0.22),
      footprint: { r: 26 },
    }),
  ),
  ...(['red', 'green'] as const).map((stripe) =>
    make(`xm-lamp-${stripe}`, { w: 160, h: 224, ox: 60, oy: 190 }, () => candyLamp({ stripe }), {
      shadow: shadow(22, 6, 4, 0.2),
      footprint: { r: 10 },
    }),
  ),
  ...([1, 2] as const).map((n) =>
    make(`xm-pile-${n}`, { w: 224, h: 128, ox: 112, oy: 100 }, () => snowPile({ seed: n, big: n === 2 }), {
      shadow: shadow(n === 2 ? 66 : 46, 10, 2, 0.12),
      footprint: { r: n === 2 ? 52 : 38 },
    }),
  ),
  ...([1, 2] as const).map((n) =>
    make(`xm-rock-${n}`, { w: 192, h: 128, ox: 96, oy: 100 }, () => snowRock({ seed: n, scale: n === 1 ? 1 : 0.7 }), {
      shadow: shadow(n === 1 ? 50 : 36, 10, 4, 0.2),
      footprint: { r: n === 1 ? 36 : 26 },
    }),
  ),
  make('xm-gate', { w: 320, h: 300, ox: 160, oy: 250 }, gate, {
    shadow: shadow(110, 22, 10, 0.28),
    footprint: { r: 16 },
  }),
  make('xm-cabin', { w: 380, h: 340, ox: 190, oy: 270 }, cabin, {
    shadow: shadow(176, 34, 20, 0.28),
  }),
];

/** The gate in the forest: the candy-cane arch that opens onto the snow. */
export const GROVE_GATE_RECIPES: Recipe[] = [
  {
    id: 'snow-gate',
    bundle: 'forest',
    canvas: { w: 320, h: 300, ox: 160, oy: 250 },
    render: () => renderGrove(gate(), { w: 320, h: 300, ox: 160, oy: 250 }),
    source: SRC,
    shadow: shadow(110, 22, 10, 0.28),
    footprint: { r: 16 },
  },
];
