import { cloud, HILLS, hills, rainbow, SKY_STRIP, skyStrip } from '../../../art/world/sky';
import type { Recipe } from '../types';

const SRC = ['assets/env/kit/sky.ts', 'art/world/sky.ts', 'art/world/paint.ts', 'art/world/noise.ts'];

/**
 * The arch of the palace rainbow. The map hangs it so its centre line sits behind the palace roofs.
 */
export const RAINBOW = { a: 740, b: 550, band: 20, legs: 140 } as const;

const CLOUDS = [
  { id: 'cloud-1', seed: 3, w: 300, h: 120 },
  { id: 'cloud-2', seed: 8, w: 220, h: 96 },
  { id: 'cloud-3', seed: 12, w: 380, h: 130 },
  { id: 'cloud-4', seed: 21, w: 180, h: 80 },
  { id: 'cloud-5', seed: 34, w: 260, h: 104 },
] as const;

/** The sky behind the palace: a repeatable strip, two rows of hills, clouds and the rainbow. */
export const SKY_RECIPES: Recipe[] = [
  {
    id: 'sky-strip',
    bundle: 'garden',
    canvas: { w: SKY_STRIP.w, h: SKY_STRIP.h, ox: SKY_STRIP.w / 2, oy: SKY_STRIP.h },
    render: () => skyStrip(),
    source: SRC,
  },
  ...([0, 1, 2] as const).flatMap((v) =>
    (['far', 'near'] as const).map(
      (layer): Recipe => ({
        id: `hills-${layer}-${v}`,
        bundle: 'garden',
        canvas: { w: HILLS.w, h: HILLS.h, ox: HILLS.w / 2, oy: HILLS.h },
        render: () => hills({ layer, variant: layer === 'far' ? v : v + 3 }),
        source: SRC,
      }),
    ),
  ),
  ...CLOUDS.map(
    (c): Recipe => ({
      id: c.id,
      bundle: 'garden',
      canvas: { w: c.w, h: c.h, ox: c.w / 2, oy: c.h },
      render: () => cloud(c.seed, c.w, c.h),
      source: SRC,
    }),
  ),
  {
    id: 'rainbow',
    bundle: 'garden',
    canvas: {
      w: Math.ceil(RAINBOW.a * 2 + 44),
      h: 22 + RAINBOW.b + RAINBOW.legs,
      ox: Math.ceil(RAINBOW.a * 2 + 44) / 2,
      oy: 22 + RAINBOW.b + RAINBOW.legs,
    },
    render: () => rainbow(RAINBOW),
    source: SRC,
  },
];
