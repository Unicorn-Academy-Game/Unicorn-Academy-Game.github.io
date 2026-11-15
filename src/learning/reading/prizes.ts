import { CHAPTERS } from '../../content/reading';

/**
 * What a cleared level pays, which is for the screen to say before the player begins ("finish this
 * level to win 7 diamonds") and after. It does not have to make sense, and it is not stored: it is
 * worked out from the level, and their treasure from the levels they have cleared by reading, so
 * two copies of their book that are merged agree about it.
 */

export type Gem = 'diamond' | 'emerald' | 'ruby' | 'sapphire' | 'gold';

/**
 * The kinds in the order they are told, one for each chapter in turn, and the first chapter is
 * diamonds.
 */
export const GEMS: readonly Gem[] = ['diamond', 'emerald', 'ruby', 'sapphire', 'gold'];

export interface Prize {
  readonly gem: Gem;
  readonly count: number;
}

/**
 * What a level of the course pays: the chapter says the kind, and each level after the first of its
 * chapter pays one more than the one before.
 */
export function prizeOf(n: number): Prize {
  const at = CHAPTERS.findIndex((chapter) => n >= chapter.from && n <= chapter.to);
  const chapter = CHAPTERS[at]!;
  return { gem: GEMS[at % GEMS.length]!, count: 3 + n - chapter.from };
}

/**
 * What the player has all together, of each kind they have any of, from the levels they have won.
 */
export function treasureOf(won: readonly number[]): Prize[] {
  const total = new Map<Gem, number>();
  for (const n of won) {
    const { gem, count } = prizeOf(n);
    total.set(gem, (total.get(gem) ?? 0) + count);
  }
  return GEMS.flatMap((gem) => (total.has(gem) ? [{ gem, count: total.get(gem)! }] : []));
}
