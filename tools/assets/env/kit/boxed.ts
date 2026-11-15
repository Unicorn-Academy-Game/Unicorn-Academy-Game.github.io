import { readdirSync } from 'node:fs';
import { BOX_COATS, BOXED_FRAMES, renderBoxed } from '../../../art/unicorn/coats';
import { FRAME, ORIGIN_X, ORIGIN_Y } from '../../../art/unicorn/frame';
import type { Recipe } from '../types';

/**
 * What decides how a unicorn looks: the model, the pose, the renderer, the colours and the six
 * characters they are turned from.
 */
const SRC = [
  'assets/env/kit/boxed.ts',
  ...readdirSync('tools/art/unicorn')
    .filter((f) => f.endsWith('.ts'))
    .map((f) => `art/unicorn/${f}`),
  ...readdirSync('tools/art/unicorn/characters').map((f) => `art/unicorn/characters/${f}`),
  'art/core/render.ts',
];

/**
 * The unicorns in the stable's stalls: each breathes in a loop of four frames, facing whoever walks
 * in.
 */
export const BOXED_RECIPES: Recipe[] = BOX_COATS.map(
  (coat): Recipe => ({
    id: `boxed-${coat.id}`,
    bundle: 'stable',
    canvas: { w: FRAME, h: FRAME, ox: ORIGIN_X, oy: ORIGIN_Y },
    anim: { frames: BOXED_FRAMES, fps: 4, loop: true },
    render: (frame) => renderBoxed(coat, frame),
    source: SRC,
    shadow: { rx: 52, ry: 13, dx: 8, dy: 2, a: 0.32 },
    footprint: { r: 44 },
  }),
);
