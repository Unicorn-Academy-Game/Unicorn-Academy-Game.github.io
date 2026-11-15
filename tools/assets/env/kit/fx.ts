import { FX_SPRITES } from '../../../art/fx/sprites';
import type { Recipe } from '../types';

const SRC = ['assets/env/kit/fx.ts', 'art/fx/kit.ts', 'art/fx/sprites.ts'];

/**
 * The effect pictures, drawn by the 2D kit. They all live in one small bundle that loads with the
 * unicorns.
 */
export const FX_RECIPES: Recipe[] = FX_SPRITES.map(
  (s): Recipe => ({
    id: s.id,
    bundle: 'fx',
    canvas: { w: s.w, h: s.h, ox: s.ox, oy: s.oy },
    ...(s.frames && s.frames > 1 ? { anim: { frames: s.frames, fps: s.fps ?? 10, loop: s.loop ?? false } } : {}),
    render: s.render,
    source: SRC,
  }),
);
