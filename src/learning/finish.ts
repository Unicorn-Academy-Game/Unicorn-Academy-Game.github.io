import { PAGES, type PageId, WORD_IDS } from '../content/lexicon';
import { type LearnerProfile, progressOf, withProgress } from '../shared/profile';
import { cardOf } from './book';
import { type Attempt, isClean, isNew, learn, type Stars, starsOf } from './mastery';
import type { SpellOffer } from './offers';

/** Every this many new words, there is something to celebrate. */
export const MILESTONE_EVERY = 5;

/**
 * What the player earned by spelling one word. Everything the screen celebrates comes from here.
 */
export interface Reward {
  offer: SpellOffer;
  /** The first time the player has spelled this word: a new card for the book. */
  fresh: boolean;
  /** Spelled without help and within what the rung allows. */
  clean: boolean;
  stars: { before: Stars; after: Stars };
  level: { before: number; after: number };
  /** How many words the player has in their book now. */
  collected: number;
  /** A round number of words that this one brought the player to. */
  milestone: number | null;
  /** The pages that this word finished. */
  pages: readonly PageId[];
  /** The player now has every word there is. */
  everything: boolean;
}

/**
 * What the screen needs of a reward to celebrate it: the stars, and whether it was a round number,
 * a page or the whole book.
 */
export type Worth = Pick<Reward, 'everything' | 'pages' | 'milestone' | 'stars'>;

/**
 * What was biggest about a finished word. The words said, the sound played and the card shown each
 * celebrate this, so they cannot disagree about it.
 */
export type Occasion = 'everything' | 'page' | 'milestone' | 'star' | 'word';

export function occasionOf(reward: Worth): Occasion {
  if (reward.everything) return 'everything';
  if (reward.pages.length > 0) return 'page';
  if (reward.milestone !== null) return 'milestone';
  return reward.stars.after > reward.stars.before ? 'star' : 'word';
}

const collectedIn = (profile: LearnerProfile, now: number): number =>
  WORD_IDS.filter((word) => cardOf(profile, word, now).collected).length;

/**
 * A word was spelled. Returns what the player knows now and what the player earned, and changes
 * nothing else. A word that is new to them begins at the level the offer was made at, and `now` is
 * when it happened.
 */
export function finish(
  profile: LearnerProfile,
  offer: SpellOffer,
  attempt: Attempt,
  now: number,
): { profile: LearnerProfile; reward: Reward } {
  const before = progressOf(profile, offer.word, offer.skill);
  const after = learn('spell', before, attempt, now, offer.level);
  const next = withProgress(profile, offer.word, offer.skill, after);
  const fresh = isNew(before);
  const collected = collectedIn(next, now);
  const finished = (p: LearnerProfile, page: (typeof PAGES)[number]): boolean =>
    page.words.every((word) => cardOf(p, word, now).collected);
  return {
    profile: next,
    reward: {
      offer,
      fresh,
      clean: isClean('spell', before?.level ?? offer.level, attempt),
      stars: { before: starsOf(before), after: starsOf(after) },
      level: { before: before?.level ?? offer.level, after: after.level },
      collected,
      milestone: fresh && collected % MILESTONE_EVERY === 0 ? collected : null,
      pages: PAGES.filter(
        (page) =>
          (page.words as readonly string[]).includes(offer.word) && finished(next, page) && !finished(profile, page),
      ).map((page) => page.id),
      everything: fresh && collected === WORD_IDS.length,
    },
  };
}
