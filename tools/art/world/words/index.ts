import type { DrawnWordId } from '../../../../src/content/lexicon';
import type { Rgba } from '../../core/image';
import { GARDEN } from './garden';
import { MANOR } from './manor';
import { NATURE } from './nature';
import { PALACE } from './palace';
import { TREASURE } from './treasure';

export { WORD_CANVAS } from './shared';

/**
 * The drawing of every word that has a picture of its own. A word added to the lexicon with no
 * drawing here does not compile.
 */
export const WORD_DRAWINGS: Readonly<Record<DrawnWordId, () => Rgba>> = {
  ...NATURE,
  ...PALACE,
  ...MANOR,
  ...GARDEN,
  ...TREASURE,
};
