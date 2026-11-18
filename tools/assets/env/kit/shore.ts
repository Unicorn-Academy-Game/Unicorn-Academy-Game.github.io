import type { Rgba } from '../../../art/core/image';
import { bush, flowerClump } from '../../../art/world/flora';
import { HALL_CANVAS, HALL_FPS, HALL_FRAMES, renderMagicHall, twinkles } from '../../../art/world/magic-hall';
import type { SceneBuilder } from '../../../art/world/scene';
import { renderScene } from '../../../art/world/scene';
import {
  bucket,
  clam,
  crystalBoulder,
  digMound,
  driftwood,
  lighthouse,
  palm,
  renderShore,
  riverStone,
  type ShellColor,
  type ShellKind,
  sandCastle,
  seashell,
  shutClam,
  starfish,
  umbrella,
} from '../../../art/world/shore';
import { oak } from '../../../art/world/trees';
import type { Recipe } from '../types';
import { CAVE_RECIPES } from './cave';
import { FLORA_RECIPES } from './flora';
import { SKY_RECIPES } from './sky';
import { TREE_RECIPES } from './trees';

const SRC = [
  'assets/env/kit/shore.ts',
  'art/world/magic-hall.ts',
  'art/world/flora.ts',
  'art/world/trees.ts',
  'art/world/arch.ts',
  'art/world/shore.ts',
  'art/world/arch.ts',
  'art/world/prims.ts',
  'art/world/scene.ts',
  'art/world/palette.ts',
  'art/core/render.ts',
];

/**
 * The beach and the river share one bundle, so a unicorn who walks from the one to the other finds
 * the same sand, palms, shells and stones already loaded. The vegetation is the forest's, drawn
 * again under this bundle's ids.
 */
const reuse = (from: readonly Recipe[], ids: readonly string[]): Recipe[] =>
  ids.map((id) => {
    const r = from.find((x) => x.id === id);
    if (!r) throw new Error(`no recipe ${id} to reuse on the shore`);
    return { ...r, id: `sh-${id}`, bundle: 'shore' };
  });

const SMALL = { w: 128, h: 128, ox: 64, oy: 104 } as const;
const PALM = { w: 400, h: 400, ox: 200, oy: 368 } as const;
const shadow = (rx: number, ry: number, dx = 0, a = 0.28) => ({ rx, ry, dx, dy: 2, a });

const make = (
  id: string,
  canvas: { w: number; h: number; ox: number; oy: number },
  scene: () => SceneBuilder,
  extra: Partial<Recipe> = {},
): Recipe => ({
  id,
  bundle: 'shore',
  canvas,
  render: () => renderShore(scene(), canvas),
  source: SRC,
  ...extra,
});

const PALMS = [
  { n: 1, lean: 0.28, fronds: 'emerald', scale: 1, seed: 1 },
  { n: 2, lean: -0.22, fronds: 'lime', scale: 0.9, seed: 2 },
  { n: 3, lean: 0.12, fronds: 'blossom', scale: 0.85, seed: 3 },
  { n: 4, lean: -0.34, fronds: 'spruce', scale: 1.05, seed: 4 },
] as const;

const SHELLS: readonly { id: string; kind: ShellKind; color: ShellColor; seed: number }[] = [
  { id: 'scallop-pink', kind: 'scallop', color: 'pink', seed: 1 },
  { id: 'scallop-lilac', kind: 'scallop', color: 'lilac', seed: 2 },
  { id: 'turret-cream', kind: 'turret', color: 'cream', seed: 3 },
  { id: 'turret-gold', kind: 'turret', color: 'gold', seed: 4 },
  { id: 'conch-pink', kind: 'conch', color: 'pink', seed: 5 },
  { id: 'conch-cream', kind: 'conch', color: 'cream', seed: 6 },
];

const STONES = [
  { n: 1, r: 76, seed: 1 },
  { n: 2, r: 70, seed: 2 },
  { n: 3, r: 86, seed: 3 },
  { n: 4, r: 74, seed: 4 },
] as const;

const BOULDERS = [
  { gem: 'amethyst', seed: 1, scale: 1 },
  { gem: 'sapphire', seed: 2, scale: 0.85 },
  { gem: 'diamond', seed: 3, scale: 0.95 },
  { gem: 'emerald', seed: 4, scale: 0.8 },
] as const;

const COLOURS = ['pink', 'teal', 'yellow'] as const;

const GLITTER_FRAMES = 4;

/**
 * Plants round the Magic Hall that glint all the time: the forest's bushes, flowers and a blossom
 * oak, drawn with twinkles that come and go over four frames.
 */
const glitter = (
  id: string,
  canvas: { w: number; h: number; ox: number; oy: number },
  scene: () => SceneBuilder,
  count: number,
  seed: number,
  extra: Partial<Recipe> = {},
): Recipe =>
  make(id, canvas, scene, {
    anim: { frames: GLITTER_FRAMES, fps: 4, loop: true },
    render: (f) =>
      twinkles(
        renderScene(scene(), { width: canvas.w, height: canvas.h, originX: canvas.ox, originY: canvas.oy, ss: 4 }).rgba,
        f,
        GLITTER_FRAMES,
        { seed, count, size: 3 },
      ),
    ...extra,
  });

export const SHORE_RECIPES: Recipe[] = [
  ...reuse(TREE_RECIPES, [
    'tree-blossom-1',
    'tree-oak-lime-1',
    'tree-oak-lime-2',
    'tree-oak-emerald-1',
    'tree-willow-emerald-1',
  ]),
  ...reuse(FLORA_RECIPES, [
    'bush-lime-1',
    'bush-lime-2',
    'bush-pink-dots',
    'bush-rose-dots',
    'flowers-pink-1',
    'flowers-sky-1',
    'flowers-yellow-1',
    'flowers-white-1',
    'flowers-lilac-1',
    'flowers-coral-1',
    'windflower-pink-1',
    'windflower-lilac-1',
    'tuft-1',
    'tuft-2',
    'tuft-3',
    'pebbles-1',
    'pebbles-2',
    'reeds-1',
    'reeds-2',
    'lily-1',
    'lily-2',
    'rock-moss-1',
    'rock-moss-2',
    'rock-grey-1',
  ]),
  ...reuse(CAVE_RECIPES, ['cc-halo']),
  ...reuse(SKY_RECIPES, [
    'sky-strip',
    'hills-far-0',
    'hills-far-1',
    'hills-far-2',
    'hills-near-0',
    'hills-near-1',
    'hills-near-2',
    'cloud-1',
    'cloud-2',
    'cloud-3',
    'cloud-4',
    'cloud-5',
  ]),
  ...PALMS.map((p) =>
    make(`sh-palm-${p.n}`, PALM, () => palm({ seed: p.seed, lean: p.lean, fronds: p.fronds, scale: p.scale }), {
      shadow: shadow(Math.round(80 * p.scale), Math.round(22 * p.scale), 30),
      canopy: {
        x: -Math.round(130 * p.scale),
        y: -Math.round(310 * p.scale),
        w: Math.round(260 * p.scale),
        h: Math.round(170 * p.scale),
      },
      footprint: { r: 16 },
    }),
  ),
  ...SHELLS.map((s) =>
    make(`sh-shell-${s.id}`, SMALL, () => seashell({ kind: s.kind, color: s.color, seed: s.seed }), {
      shadow: shadow(22, 6, 4, 0.24),
      footprint: { r: 16 },
    }),
  ),
  ...[1, 2].map((n) =>
    make(`sh-starfish-${n}`, SMALL, () => starfish({ seed: n, scale: n === 1 ? 0.85 : 0.7 }), {
      shadow: shadow(28, 7, 2, 0.2),
      footprint: { r: 14 },
    }),
  ),
  make('sh-clam-shut', { w: 192, h: 160, ox: 96, oy: 120 }, () => shutClam({ seed: 1 }), {
    shadow: shadow(48, 12, 6),
    footprint: { r: 34 },
  }),
  make('sh-clam-open', { w: 192, h: 160, ox: 96, oy: 120 }, () => clam({ open: true, seed: 1 }), {
    shadow: shadow(48, 12, 6),
    footprint: { r: 34 },
  }),
  make('sh-castle-grand', { w: 360, h: 300, ox: 180, oy: 230 }, () => sandCastle({ grand: true, seed: 1 }), {
    shadow: shadow(120, 30, 14, 0.24),
    footprint: { r: 100 },
  }),
  make('sh-castle-small', { w: 360, h: 300, ox: 180, oy: 230 }, () => sandCastle({ grand: false, seed: 2 }), {
    shadow: shadow(80, 20, 10, 0.24),
    footprint: { r: 70 },
  }),
  make('sh-mound', SMALL, () => digMound({ seed: 5 }), { shadow: shadow(36, 9, 4, 0.2), footprint: { r: 36 } }),
  ...STONES.map((s) =>
    make(`sh-stone-${s.n}`, { w: 192, h: 160, ox: 96, oy: 100 }, () => riverStone({ seed: s.seed, r: s.r }), {
      shadow: shadow(s.r, Math.round(s.r * 0.26), 4, 0.2),
    }),
  ),
  ...BOULDERS.map((s) =>
    make(
      `sh-boulder-${s.gem}`,
      { w: 192, h: 192, ox: 96, oy: 150 },
      () => crystalBoulder({ seed: s.seed, gem: s.gem, scale: s.scale }),
      {
        shadow: shadow(Math.round(54 * s.scale), 14, 6),
        footprint: { r: Math.round(44 * s.scale) },
      },
    ),
  ),
  ...COLOURS.map((c, i) =>
    make(`sh-umbrella-${c}`, { w: 256, h: 256, ox: 128, oy: 224 }, () => umbrella({ stripes: c, seed: i + 1 }), {
      shadow: shadow(46, 12, 20),
      canopy: { x: -64, y: -150, w: 128, h: 60 },
      footprint: { r: 16 },
    }),
  ),
  ...(['pink', 'teal'] as const).map((c, i) =>
    make(`sh-bucket-${c}`, SMALL, () => bucket({ seed: i + 1, colour: c }), {
      shadow: shadow(22, 6, 3, 0.24),
      footprint: { r: 16 },
    }),
  ),
  ...[3, 8].map((seed, i) =>
    make(`sh-driftwood-${i + 1}`, SMALL, () => driftwood({ seed, scale: i === 0 ? 1 : 0.8 }), {
      shadow: shadow(46, 8, 4, 0.2),
      footprint: { r: 26 },
    }),
  ),
  {
    id: 'sh-hall',
    bundle: 'shore',
    canvas: HALL_CANVAS,
    anim: { frames: HALL_FRAMES, fps: HALL_FPS, loop: true },
    render: renderMagicHall,
    source: SRC,
    shadow: { rx: 360, ry: 64, dx: 20, dy: 6, a: 0.26 },
  },
  glitter('sh-gl-bush-1', SMALL, () => bush({ seed: 31, foliage: 'lime', dots: 'lilac', dotCount: 18 }), 22, 3, {
    shadow: shadow(54, 15, 8),
    footprint: { r: 30 },
  }),
  glitter(
    'sh-gl-bush-2',
    SMALL,
    () => bush({ seed: 33, foliage: 'emerald', dots: 'sky', dotCount: 16, scale: 0.9 }),
    20,
    5,
    {
      shadow: shadow(50, 14, 8),
      footprint: { r: 28 },
    },
  ),
  glitter(
    'sh-gl-bush-3',
    SMALL,
    () => bush({ seed: 35, foliage: 'lime', dots: 'pink', dotCount: 18, scale: 0.85 }),
    20,
    7,
    {
      shadow: shadow(46, 13, 8),
      footprint: { r: 26 },
    },
  ),
  glitter(
    'sh-gl-flowers-1',
    SMALL,
    () => flowerClump({ seed: 61, bloom: 'lilac', bloom2: 'white', count: 7, scale: 1.4 }),
    16,
    9,
    {
      shadow: shadow(28, 8, 3, 0.16),
    },
  ),
  glitter(
    'sh-gl-flowers-2',
    SMALL,
    () => flowerClump({ seed: 63, bloom: 'sky', bloom2: 'pink', count: 7, scale: 1.4 }),
    16,
    11,
    {
      shadow: shadow(28, 8, 3, 0.16),
    },
  ),
  glitter(
    'sh-gl-flowers-3',
    SMALL,
    () => flowerClump({ seed: 65, bloom: 'pink', bloom2: 'yellow', count: 7, scale: 1.4 }),
    16,
    13,
    {
      shadow: shadow(28, 8, 3, 0.16),
    },
  ),
  glitter(
    'sh-gl-tree',
    { w: 400, h: 400, ox: 200, oy: 368 },
    () => oak({ seed: 71, foliage: 'blossom', scale: 0.85 }),
    70,
    17,
    {
      shadow: shadow(100, 28, 28, 0.3),
      canopy: { x: -140, y: -285, w: 280, h: 195 },
      footprint: { r: 26 },
    },
  ),
  ...([false, true] as const).map((lit) =>
    make(`sh-lighthouse-${lit ? 'lit' : 'dark'}`, { w: 320, h: 520, ox: 160, oy: 470 }, () => lighthouse({ lit }), {
      shadow: shadow(110, 26, 24, 0.26),
      footprint: { r: 80 },
    }),
  ),
];

export type { Rgba };
