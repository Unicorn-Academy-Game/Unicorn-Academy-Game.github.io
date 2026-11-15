import {
  CUP,
  CUP_SIP_FRAMES,
  FOUNTAIN,
  renderBasin,
  renderCup,
  renderCupSip,
  renderJet,
  renderRipples,
} from '../../../art/world/fountain';
import { renderStatue, STATUE } from '../../../art/world/statue';
import type { Recipe } from '../types';

const SRC = [
  'assets/env/kit/fountain.ts',
  'art/world/fountain.ts',
  'art/world/statue.ts',
  'art/world/stone.ts',
  'art/world/arch.ts',
  'art/world/paint.ts',
  'art/world/prims.ts',
  'art/world/scene.ts',
  'art/world/palette.ts',
  'art/core/render.ts',
  'art/unicorn/frame.ts',
  'art/unicorn/kit.ts',
  'art/unicorn/model.ts',
  'art/unicorn/parts.ts',
  'art/unicorn/pose.ts',
  'art/unicorn/skeleton.ts',
  'art/unicorn/spec.ts',
  'art/unicorn/stamps.ts',
  'art/unicorn/glyphs.ts',
  'art/unicorn/characters/wildstar.ts',
  'art/unicorn/characters/shared.ts',
];

/**
 * The fountain plaza: the basin with its moving water, two marble statues of Wildstar, and the two
 * drinking cups, which are always full and dip when someone drinks.
 */
export const FOUNTAIN_RECIPES: Recipe[] = [
  {
    id: 'fountain-basin',
    bundle: 'garden',
    canvas: FOUNTAIN.canvas,
    render: () => renderBasin().rgba,
    source: SRC,
    shadow: { rx: 200, ry: 66, dx: 18, dy: 8, a: 0.26 },
  },
  {
    id: 'fountain-ripples',
    bundle: 'garden',
    canvas: FOUNTAIN.canvas,
    anim: { frames: FOUNTAIN.frames, fps: 6, loop: true },
    render: renderRipples,
    source: SRC,
  },
  {
    id: 'fountain-jet',
    bundle: 'garden',
    canvas: FOUNTAIN.jetCanvas,
    anim: { frames: FOUNTAIN.frames, fps: FOUNTAIN.fps, loop: true },
    render: renderJet,
    source: SRC,
  },
  ...(['east', 'west'] as const).map(
    (facing): Recipe => ({
      id: `fountain-statue-${facing}`,
      bundle: 'garden',
      canvas: STATUE.canvas,
      render: () => renderStatue(facing),
      source: SRC,
      shadow: { rx: 72, ry: 22, dx: 14, dy: 4, a: 0.3 },
      footprint: { r: 52 },
    }),
  ),
  {
    id: 'cup-full',
    bundle: 'garden',
    canvas: CUP.canvas,
    anim: { frames: 4, fps: 4, loop: true },
    render: renderCup,
    source: SRC,
    shadow: { rx: 36, ry: 11, dx: 6, dy: 2, a: 0.3 },
    footprint: { r: 30 },
  },
  {
    id: 'cup-sip',
    bundle: 'garden',
    canvas: CUP.canvas,
    anim: { frames: CUP_SIP_FRAMES, fps: 2.5, loop: true },
    render: renderCupSip,
    source: SRC,
    shadow: { rx: 36, ry: 11, dx: 6, dy: 2, a: 0.3 },
  },
];
