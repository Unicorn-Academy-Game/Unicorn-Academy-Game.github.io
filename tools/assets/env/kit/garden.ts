import {
  BED_CANVAS,
  type BedShape,
  BRAZIER_CANVAS,
  ICE_CANVAS,
  ICE_FROZEN_FRAMES,
  LAMP_CANVAS,
  ORNAMENT_CANVAS,
  PINWHEEL_CANVAS,
  PINWHEEL_SPIN_FRAMES,
  renderBed,
  renderBrazier,
  renderIceDisplay,
  renderLamp,
  renderOrnament,
  renderPinwheel,
} from '../../../art/world/garden';
import type { Recipe } from '../types';

const SRC = [
  'assets/env/kit/garden.ts',
  'art/world/garden.ts',
  'art/world/stone.ts',
  'art/world/arch.ts',
  'art/world/glow.ts',
  'art/world/paint.ts',
  'art/world/prims.ts',
  'art/world/scene.ts',
  'art/world/palette.ts',
  'art/world/flora.ts',
  'art/core/render.ts',
];

const BED_SHAPES: BedShape[] = ['long', 'square', 'round'];
const BED_SHADOW = {
  long: { rx: 108, ry: 30, dx: 10, dy: 4, a: 0.24 },
  square: { rx: 80, ry: 32, dx: 10, dy: 4, a: 0.24 },
  round: { rx: 78, ry: 32, dx: 10, dy: 4, a: 0.24 },
} as const;

/**
 * Interactive and ornamental props of the palace garden. State changes swap sprites; animated
 * states loop.
 */
export const GARDEN_RECIPES: Recipe[] = [
  ...BED_SHAPES.flatMap((shape, i) =>
    (['leafy', 'flowering'] as const).map(
      (state): Recipe => ({
        id: `bed-${state}-${i + 1}`,
        bundle: 'garden',
        canvas: BED_CANVAS,
        render: () => renderBed(shape, i, state === 'flowering'),
        source: SRC,
        shadow: BED_SHADOW[shape],
      }),
    ),
  ),
  {
    id: 'lantern-off',
    bundle: 'garden',
    canvas: LAMP_CANVAS,
    render: () => renderLamp(false),
    source: SRC,
    shadow: { rx: 34, ry: 10, dx: 10, dy: 2, a: 0.28 },
    footprint: { r: 16 },
  },
  {
    id: 'lantern-on',
    bundle: 'garden',
    canvas: LAMP_CANVAS,
    anim: { frames: 4, fps: 5, loop: true },
    render: (f) => renderLamp(true, f),
    source: SRC,
    shadow: { rx: 34, ry: 10, dx: 10, dy: 2, a: 0.28 },
    footprint: { r: 16 },
  },
  {
    id: 'brazier-unlit',
    bundle: 'garden',
    canvas: BRAZIER_CANVAS,
    render: () => renderBrazier(false),
    source: SRC,
    shadow: { rx: 60, ry: 17, dx: 10, dy: 3, a: 0.3 },
    footprint: { r: 36 },
  },
  {
    id: 'brazier-lit',
    bundle: 'garden',
    canvas: BRAZIER_CANVAS,
    anim: { frames: 6, fps: 10, loop: true },
    render: (f) => renderBrazier(true, f),
    source: SRC,
    shadow: { rx: 60, ry: 17, dx: 10, dy: 3, a: 0.3 },
    footprint: { r: 36 },
  },
  {
    id: 'pinwheel-still',
    bundle: 'garden',
    canvas: PINWHEEL_CANVAS,
    render: () => renderPinwheel(false),
    source: SRC,
    shadow: { rx: 34, ry: 10, dx: 8, dy: 2, a: 0.26 },
    footprint: { r: 22 },
  },
  {
    id: 'pinwheel-spin',
    bundle: 'garden',
    canvas: PINWHEEL_CANVAS,
    anim: { frames: PINWHEEL_SPIN_FRAMES, fps: 14, loop: true },
    render: (f) => renderPinwheel(true, f),
    source: SRC,
    shadow: { rx: 34, ry: 10, dx: 8, dy: 2, a: 0.26 },
    footprint: { r: 22 },
  },
  {
    id: 'ornament-calm',
    bundle: 'garden',
    canvas: ORNAMENT_CANVAS,
    render: () => renderOrnament(false),
    source: SRC,
    shadow: { rx: 40, ry: 12, dx: 10, dy: 2, a: 0.28 },
    footprint: { r: 28 },
  },
  {
    id: 'ornament-glow',
    bundle: 'garden',
    canvas: ORNAMENT_CANVAS,
    anim: { frames: 6, fps: 9, loop: true },
    render: (f) => renderOrnament(true, f),
    source: SRC,
    shadow: { rx: 40, ry: 12, dx: 10, dy: 2, a: 0.28 },
    footprint: { r: 28 },
  },
  {
    id: 'ice-display-idle',
    bundle: 'garden',
    canvas: ICE_CANVAS,
    render: () => renderIceDisplay(false),
    source: SRC,
    shadow: { rx: 58, ry: 17, dx: 10, dy: 3, a: 0.28 },
    footprint: { r: 42 },
  },
  {
    id: 'ice-display-frozen',
    bundle: 'garden',
    canvas: ICE_CANVAS,
    anim: { frames: ICE_FROZEN_FRAMES, fps: 6, loop: true },
    render: (f) => renderIceDisplay(true, f),
    source: SRC,
    shadow: { rx: 58, ry: 17, dx: 10, dy: 3, a: 0.28 },
    footprint: { r: 42 },
  },
];
