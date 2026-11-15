import { NAP_CANVAS, renderNapBed, renderNapQuilt } from '../../../art/world/palace-bedroom';
import { DIAMOND_VASES, FLOWER_VASES, renderVase, VASE_CANVAS, vaseSprite } from '../../../art/world/palace-vases';
import type { Recipe } from '../types';

const SRC = [
  'assets/env/kit/palace-props.ts',
  'art/world/palace-vases.ts',
  'art/world/palace-bedroom.ts',
  'art/world/treasure.ts',
  'art/world/gems.ts',
  'art/world/arch.ts',
  'art/world/paint.ts',
  'art/world/prims.ts',
  'art/world/scene.ts',
  'art/world/palette.ts',
  'art/core/render.ts',
];

/** The vases for the rooms, and the bed Wildstar naps in with the quilt that is drawn over her. */
export const PALACE_PROP_RECIPES: Recipe[] = [
  ...[...FLOWER_VASES, ...DIAMOND_VASES].map(
    (look): Recipe => ({
      id: vaseSprite(look),
      bundle: 'palace-hall',
      canvas: VASE_CANVAS,
      render: () => renderVase(look),
      source: SRC,
      shadow: { rx: 24, ry: 8, dx: 4, dy: 2, a: 0.26 },
      footprint: { r: 17 },
    }),
  ),
  {
    id: 'ph-nap-bed',
    bundle: 'palace-hall',
    canvas: NAP_CANVAS,
    render: renderNapBed,
    source: SRC,
    shadow: { rx: 96, ry: 28, dx: 6, dy: 4, a: 0.26 },
  },
  { id: 'ph-nap-quilt', bundle: 'palace-hall', canvas: NAP_CANVAS, render: renderNapQuilt, source: SRC },
];
