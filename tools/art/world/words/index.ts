import type { DrawnWordId } from '../../../../src/content/lexicon';
import type { Rgba } from '../../core/image';
import { BALL } from './ball';
import { BLOOM } from './bloom';
import { CAVE } from './cave';
import { GARDEN } from './garden';
import { HOME } from './home';
import { JEWELS } from './jewels';
import { MAGIC } from './magic';
import { MANOR } from './manor';
import { NATURE } from './nature';
import { PALACE } from './palace';
import { RIVER } from './river';
import { ROYAL } from './royal';
import { SANTA } from './santa';
import { SEA_WORDS } from './sea';
import { SHORE } from './shore';
import { SPOOKY } from './spooky';
import { STUDY } from './study';
import { TABLE } from './table';
import { TREASURE } from './treasure';

export { WORD_CANVAS } from './shared';

/**
 * The drawing of every word that has a picture of its own. A word added to the lexicon with no
 * drawing here does not compile.
 */
export const WORD_DRAWINGS: Readonly<Record<DrawnWordId, () => Rgba>> = {
  ...SANTA,
  ...TABLE,
  ...STUDY,
  ...BALL,
  ...JEWELS,
  ...BLOOM,
  ...HOME,
  ...ROYAL,
  ...SEA_WORDS,
  ...SPOOKY,
  ...NATURE,
  ...PALACE,
  ...MANOR,
  ...GARDEN,
  ...TREASURE,
  ...SHORE,
  ...RIVER,
  ...MAGIC,
  ...CAVE,
};
