import type { Rgba } from '../../../art/core/image';
import {
  type BloomName,
  bush,
  crystals,
  flowerClump,
  lily,
  mushrooms,
  pebbles,
  reeds,
  rock,
  tallGrass,
  windflower,
} from '../../../art/world/flora';
import { underGlow } from '../../../art/world/glow';
import { BLOOM, PAL } from '../../../art/world/palette';
import { renderScene, type SceneBuilder } from '../../../art/world/scene';
import type { FoliageName } from '../../../art/world/trees';
import type { Recipe } from '../types';

const SRC = [
  'assets/env/kit/flora.ts',
  'art/world/flora.ts',
  'art/world/glow.ts',
  'art/world/prims.ts',
  'art/world/scene.ts',
  'art/world/palette.ts',
];
const SMALL = { w: 128, h: 128, ox: 64, oy: 104 } as const;

const make = (id: string, b: () => SceneBuilder | Rgba, extra: Partial<Recipe> = {}): Recipe => ({
  id,
  bundle: 'forest',
  canvas: SMALL,
  render: () => {
    const built = b();
    return 'meshes' in built
      ? renderScene(built, { width: SMALL.w, height: SMALL.h, originX: SMALL.ox, originY: SMALL.oy, ss: 4 }).rgba
      : built;
  },
  source: SRC,
  ...extra,
});

const draw = (b: SceneBuilder, ss = 4) =>
  renderScene(b, { width: SMALL.w, height: SMALL.h, originX: SMALL.ox, originY: SMALL.oy, ss }).rgba;

const bushShadow = { rx: 54, ry: 15, dx: 8, dy: 2, a: 0.28 } as const;
const blossoms: BloomName[] = ['pink', 'sky', 'yellow', 'white', 'lilac', 'coral'];

export const FLORA_RECIPES: Recipe[] = [
  ...(['emerald', 'lime'] as FoliageName[]).flatMap((f) =>
    [1, 2].map((n) =>
      make(`bush-${f}-${n}`, () => bush({ seed: n * 7 + (f === 'lime' ? 100 : 0), foliage: f }), {
        shadow: bushShadow,
        footprint: { r: 30 },
      }),
    ),
  ),
  make('bush-pink-dots', () => bush({ seed: 41, foliage: 'lime', dots: 'pink', dotCount: 16 }), {
    shadow: bushShadow,
    footprint: { r: 30 },
  }),
  make('bush-rose-dots', () => bush({ seed: 43, foliage: 'emerald', dots: 'rose', dotCount: 12, scale: 0.85 }), {
    shadow: bushShadow,
    footprint: { r: 26 },
  }),
  ...blossoms.flatMap((c, i) =>
    [1, 2].map((n) =>
      make(
        `flowers-${c}-${n}`,
        () =>
          flowerClump({
            seed: 50 + i * 3 + n,
            bloom: c,
            bloom2: blossoms[(i + 2) % blossoms.length]!,
            count: 5 + n,
            scale: 1.25,
          }),
        { shadow: { rx: 26, ry: 7, dx: 3, dy: 1, a: 0.16 } },
      ),
    ),
  ),
  ...[1, 2, 3].map((n) =>
    make(`rock-grey-${n}`, () => rock({ seed: n * 13, scale: 0.8 + n * 0.12 }), {
      shadow: { rx: 46, ry: 13, dx: 8, dy: 2, a: 0.3 },
      footprint: { r: 28 },
    }),
  ),
  ...[1, 2].map((n) =>
    make(`rock-moss-${n}`, () => rock({ seed: n * 17 + 3, moss: true, scale: 0.9 + n * 0.1 }), {
      shadow: { rx: 48, ry: 13, dx: 8, dy: 2, a: 0.3 },
      footprint: { r: 30 },
    }),
  ),
  ...[1, 2].map((n) =>
    make(`crystal-amethyst-dim-${n}`, () => crystals({ seed: n * 9, hue: 'amethyst', lit: false }), {
      shadow: { rx: 44, ry: 12, dx: 8, dy: 2, a: 0.28 },
      footprint: { r: 26 },
    }),
  ),
  ...[1, 2].map((n) =>
    make(
      `crystal-amethyst-lit-${n}`,
      () =>
        underGlow(draw(crystals({ seed: n * 9, hue: 'amethyst', lit: true })), 62, 72, 60, 48, [224, 160, 255], 0.5),
      { shadow: { rx: 44, ry: 12, dx: 8, dy: 2, a: 0.28 }, footprint: { r: 26 } },
    ),
  ),
  ...[1, 2, 3].map((n) =>
    make(`rock-warm-${n}`, () => rock({ seed: n * 19 + 5, ramp: PAL.ember, scale: 0.85 + n * 0.1 }), {
      shadow: { rx: 46, ry: 13, dx: 8, dy: 2, a: 0.3 },
      footprint: { r: 28 },
    }),
  ),
  ...[1, 2].map((n) =>
    make(`rock-frost-${n}`, () => rock({ seed: n * 23 + 7, ramp: PAL.frost, scale: 0.85 + n * 0.1 }), {
      shadow: { rx: 46, ry: 13, dx: 8, dy: 2, a: 0.26 },
      footprint: { r: 28 },
    }),
  ),
  ...[1, 2, 3].map((n) =>
    make(`crystal-ice-${n}`, () => crystals({ seed: n * 29, hue: 'diamond', lit: true, scale: 0.8 + n * 0.12 }), {
      shadow: { rx: 44, ry: 12, dx: 8, dy: 2, a: 0.24 },
      footprint: { r: 26 },
    }),
  ),
  ...(['pink', 'lilac', 'coral'] as const).flatMap((a, i) =>
    [1, 2].map(
      (n): Recipe => ({
        id: `windflower-${a}-${n}`,
        bundle: 'forest',
        canvas: SMALL,
        anim: { frames: 6, fps: 6, loop: true },
        render: (f) => draw(windflower({ seed: 60 + i * 5 + n, bloom: a, sway: (f / 6) * Math.PI * 2, count: 3 + n })),
        source: SRC,
        shadow: { rx: 28, ry: 8, dx: 3, dy: 1, a: 0.16 },
      }),
    ),
  ),
  ...[1, 2].map((n) =>
    make(`reeds-${n}`, () => reeds({ seed: n * 31 }), { shadow: { rx: 30, ry: 8, dx: 4, dy: 1, a: 0.14 } }),
  ),
  ...[1, 2].map((n) => make(`lily-${n}`, () => lily({ seed: n * 37, flower: n === 2 }))),
  ...[1, 2].map((n) => make(`pebbles-${n}`, () => pebbles({ seed: n * 41 }))),
  ...[1, 2, 3].map((n) =>
    make(`tuft-${n}`, () => tallGrass({ seed: n * 43 }), { shadow: { rx: 18, ry: 5, dx: 2, dy: 1, a: 0.12 } }),
  ),
  make('mushrooms-rose', () => mushrooms({ seed: 11, cap: BLOOM.rose, spots: true }), {
    shadow: { rx: 26, ry: 8, dx: 4, dy: 1, a: 0.2 },
  }),
  make('mushrooms-sky', () => mushrooms({ seed: 12, cap: BLOOM.sky, spots: true }), {
    shadow: { rx: 26, ry: 8, dx: 4, dy: 1, a: 0.2 },
  }),
  make('mushrooms-sand', () => mushrooms({ seed: 13, cap: PAL.sand as never }), {
    shadow: { rx: 26, ry: 8, dx: 4, dy: 1, a: 0.2 },
  }),
];
