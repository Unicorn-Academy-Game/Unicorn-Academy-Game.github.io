import { type SubjectId, type WordId, wordsOf } from '../content/lexicon';
import type { AskRate, LearningSettings, Skill } from '../shared/learning';
import { type LearnerProfile, progressOf } from '../shared/profile';
import { START_LEVEL } from './levels';
import { isDue, isNew } from './mastery';

/**
 * A card the game would like to put in front of the player: which word, for which skill, and how
 * well they know it now.
 */
export interface Offer<S extends Skill = Skill> {
  word: WordId;
  skill: S;
  /**
   * The level the player is at for this word. A word they have not tried starts at the level a
   * parent chose.
   */
  level: number;
  /** The player has tried it before, so this is a review and not the first time. */
  review: boolean;
}

/** A card where the player spells a word, which is what the world asks for. */
export type SpellOffer = Offer<'spell'>;
/**
 * How the world asks.
 *
 * - `hold` is for a thing that gives something away, like a fruit tree. The player tapped it for
 *   the fruit, so the card is what stands between them and it, and nothing is ever held back from
 *   them by pacing.
 * - `invite` is for a thing that already answered their tap. The card is an offer on top of that,
 *   so it keeps its distance from the last one and leaves a card alone that they just closed.
 */
export type Ask = 'hold' | 'invite';

/** How the last cards went, which is all the pacing needs to know. */
export interface Pace {
  /** When the last card ended, in milliseconds, or nothing if none has. */
  last: number | null;
  /** Words the player closed without finishing, and when they may be offered again. */
  snoozed: ReadonlyMap<string, number>;
}

export const NO_PACE: Pace = { last: null, snoozed: new Map() };

/**
 * The shortest time between one card ending and an invitation to the next, by how often a parent
 * wants the game to ask.
 */
export const GAP: Readonly<Record<AskRate, number>> = { often: 8_000, sometimes: 30_000, rarely: 120_000 };

/** How long a word the player closed is left alone. */
export const SNOOZE: Readonly<Record<AskRate, number>> = { often: 60_000, sometimes: 180_000, rarely: 900_000 };

/** What the game knows when it decides. */
export interface Context {
  profile: LearnerProfile;
  settings: LearningSettings;
  now: number;
  pace: Pace;
  /**
   * The word the player asked to be taken to, which the thing that gives it asks for as soon as
   * they touch it.
   */
  want?: WordId;
}

/**
 * Where a word starts: where it is if the player has tried to spell it, and where a new word
 * begins, by how much help a parent chose, if they have not.
 */
const levelFor = (ctx: Context, word: WordId): { level: number; review: boolean } => {
  const progress = progressOf(ctx.profile, word, 'spell');
  return progress ? { level: progress.level, review: true } : { level: START_LEVEL[ctx.settings.help], review: false };
};

/**
 * Which of the due words of a thing to ask for. A word the player has not spelled comes first, the
 * easiest of them first, so a thing that gives several teaches every one before it asks for any
 * again. Once none is new, the word they saw longest ago comes first, so the words go round and one
 * easy word that they spelled with help is not asked for over and over.
 */
function wordToAsk(due: readonly WordId[], profile: LearnerProfile): WordId | undefined {
  const fresh = due.find((word) => isNew(progressOf(profile, word, 'spell')));
  if (fresh !== undefined) return fresh;
  const seen = (word: WordId): number => progressOf(profile, word, 'spell')?.last ?? 0;
  return due.reduce<WordId | undefined>(
    (oldest, word) => (oldest === undefined || seen(word) < seen(oldest) ? word : oldest),
    undefined,
  );
}

/**
 * The card to put in front of the player for a thing they touched, or nothing when no word is due.
 * A thing that gives several teaches them in turn, the new ones before any they have spelled (see
 * `wordToAsk`), and a word they know well waits until its time. The word the player asked to be
 * taken to comes first, at once, and is never held back by pacing: they came for it. While learning
 * is off nothing is ever offered, so no caller can forget to check.
 */
export function offerFor(subject: SubjectId, ask: Ask, ctx: Context): SpellOffer | null {
  if (!ctx.settings.on) return null;
  const sought = ctx.want;
  if (sought !== undefined && wordsOf(subject).includes(sought) && isNew(progressOf(ctx.profile, sought, 'spell')))
    return { word: sought, skill: 'spell', ...levelFor(ctx, sought) };
  let due = wordsOf(subject).filter((word) => isDue(progressOf(ctx.profile, word, 'spell'), ctx.now));
  if (ask === 'invite') {
    if (ctx.pace.last !== null && ctx.now - ctx.pace.last < GAP[ctx.settings.ask]) return null;
    due = due.filter((word) => (ctx.pace.snoozed.get(word) ?? 0) <= ctx.now);
  }
  const word = wordToAsk(due, ctx.profile);
  return word === undefined ? null : { word, skill: 'spell', ...levelFor(ctx, word) };
}

/**
 * The card for one word, or nothing when it is not due. For a friend she has just met, whose own
 * name is the word and not one among several. She walked up to ask, so only the word's own time can
 * hold it back.
 */
export function offerForWord(word: WordId, ctx: Context): SpellOffer | null {
  if (!ctx.settings.on || !isDue(progressOf(ctx.profile, word, 'spell'), ctx.now)) return null;
  return { word, skill: 'spell', ...levelFor(ctx, word) };
}

/** A card for a word the player picked from the book. Nothing holds it back: they asked. */
export const practiceOffer = (word: WordId, ctx: Context): SpellOffer => ({
  word,
  skill: 'spell',
  ...levelFor(ctx, word),
});

/**
 * The pacing after a card ends. A card the player closed without finishing is left alone for a
 * while.
 */
export function ended(pace: Pace, now: number, word: WordId, finished: boolean, ask: AskRate): Pace {
  const snoozed = new Map(pace.snoozed);
  if (finished) snoozed.delete(word);
  else snoozed.set(word, now + SNOOZE[ask]);
  return { last: now, snoozed };
}
