import { DRAWN_WORD_IDS, wordSprite } from '../../../../src/content/lexicon';
import { WORD_CANVAS, WORD_DRAWINGS } from '../../../art/world/words';
import type { Recipe } from '../types';

const SRC = [
  'assets/env/kit/words.ts',
  'art/world/words/index.ts',
  'art/world/words/shared.ts',
  'art/world/words/nature.ts',
  'art/world/words/palace.ts',
  'art/world/words/manor.ts',
  'art/world/words/garden.ts',
  'art/world/words/treasure.ts',
  'art/world/produce.ts',
  'art/fx/kit.ts',
  'art/core/color.ts',
  'art/core/image.ts',
  'art/core/vec.ts',
];

/**
 * The pictures drawn for words, one each. They sit in the produce bundle, which loads with the
 * unicorns, so a card can show any of them in any place.
 */
export const WORD_RECIPES: Recipe[] = DRAWN_WORD_IDS.map(
  (id): Recipe => ({
    id: wordSprite(id),
    bundle: 'produce',
    canvas: WORD_CANVAS,
    render: WORD_DRAWINGS[id],
    source: SRC,
  }),
);
