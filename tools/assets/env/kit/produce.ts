import { FOOD_IDS, produceSprite } from '../../../../src/content/produce';
import { RAIN_PIECE_IDS, rainSprite } from '../../../../src/content/rain';
import { PRODUCE_CANVAS, renderProduce } from '../../../art/world/produce';
import { RAIN_CANVAS, renderRain } from '../../../art/world/rain';
import type { Recipe } from '../types';

const SRC = [
  'assets/env/kit/produce.ts',
  '../src/content/produce.ts',
  'art/world/produce.ts',
  'art/world/rain.ts',
  '../src/content/rain.ts',
  'art/fx/kit.ts',
  'art/core/color.ts',
  'art/core/image.ts',
  'art/core/vec.ts',
];

/**
 * The fruit and vegetables, one picture each. They load with the unicorns, since the herd eats in
 * every place.
 */
export const PRODUCE_RECIPES: Recipe[] = FOOD_IDS.map(
  (id): Recipe => ({
    id: produceSprite(id),
    bundle: 'produce',
    canvas: PRODUCE_CANVAS,
    render: () => renderProduce(id),
    source: SRC,
    shadow: { rx: 13, ry: 4, dx: 0, dy: 2, a: 0.28 },
  }),
);

/**
 * The pieces that fall in the treasure game. They live with the produce, which loads with the
 * unicorns, so the game can cut them out in any place.
 */
export const RAIN_RECIPES: Recipe[] = RAIN_PIECE_IDS.map(
  (id): Recipe => ({
    id: rainSprite(id),
    bundle: 'produce',
    canvas: RAIN_CANVAS,
    render: () => renderRain(id),
    source: SRC,
  }),
);
