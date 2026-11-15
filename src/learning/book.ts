import { PAGES, type Page, WORD_IDS, type WordId } from '../content/lexicon';
import { type LearnerProfile, progressOf } from '../shared/profile';
import { isDue, type Stars, starsOf } from './mastery';

/** One word in the Spell Book, as the book shows it. */
export interface Card {
  word: WordId;
  /** The player has spelled it, so it is in colour and not a silhouette. */
  collected: boolean;
  stars: Stars;
  /** The level it is at now, or nothing for a word the player has not collected. */
  level: number | null;
  /** Whether it is time to spell it again. */
  due: boolean;
  slips: number;
  done: number;
}

export interface Chapter {
  page: Page;
  cards: readonly Card[];
  collected: number;
  complete: boolean;
}

export function cardOf(profile: LearnerProfile, word: WordId, now: number): Card {
  const progress = progressOf(profile, word, 'spell');
  const done = progress?.done ?? 0;
  const collected = progress !== undefined && done > 0;
  return {
    word,
    collected,
    stars: starsOf(progress),
    level: collected ? progress.level : null,
    due: collected && isDue(progress, now),
    slips: progress?.slips ?? 0,
    done,
  };
}

/** The pages of the book with a card for every word on them, in the order the pages are listed. */
export function chapters(profile: LearnerProfile, now: number): Chapter[] {
  return PAGES.map((page) => {
    const cards = page.words.map((word) => cardOf(profile, word, now));
    const collected = cards.filter((c) => c.collected).length;
    return { page, cards, collected, complete: collected === cards.length };
  });
}

export interface Tally {
  collected: number;
  total: number;
  /** Stars earned over all words. */
  stars: number;
  /** Words that are ready to be spelled again. */
  due: number;
}

/** How the player is doing over the whole book. Words the book no longer has are not counted. */
export function tally(profile: LearnerProfile, now: number): Tally {
  const cards = WORD_IDS.map((word) => cardOf(profile, word, now));
  return {
    collected: cards.filter((c) => c.collected).length,
    total: cards.length,
    stars: cards.reduce((sum, c) => sum + c.stars, 0),
    due: cards.filter((c) => c.due).length,
  };
}

/**
 * The words that have cost the player the most slips for each time, worst first, for a parent who
 * wants to know where to help. A word needs two goes before it counts, since one bad try is not a
 * pattern, and ties are broken by the word so the list does not shuffle.
 */
function trickiest<T extends { word: WordId; slips: number; done: number }>(cards: readonly T[], count: number): T[] {
  return cards
    .filter((c) => c.done >= 2 && c.slips > 0)
    .sort((a, b) => b.slips / b.done - a.slips / a.done || a.word.localeCompare(b.word))
    .slice(0, count);
}

/** The words that have cost the player the most slips for each time they spelled them. */
export const tricky = (profile: LearnerProfile, count: number): Card[] =>
  trickiest(
    WORD_IDS.map((word) => cardOf(profile, word, 0)),
    count,
  );

/**
 * The level from which the player counts as reading a word on their own. It is the fourth level of
 * the ladder, 'Nearly there'. A word is read at the first level with its tiles shining and the word
 * said to them, at the second with the tiles shining, and at the third with nothing shining, and a
 * clean read at that third level is the one that takes it to the fourth, so they have read it on
 * their own.
 */
export const READS_FROM = 3;

/**
 * The player reads a word on their own once it has climbed to `READS_FROM`, and a word that slips
 * back a level keeps that, the way it keeps its stars. The book's badge means this.
 */
export const readsWord = (profile: LearnerProfile, word: WordId): boolean =>
  (progressOf(profile, word, 'read')?.best ?? 0) >= READS_FROM;
