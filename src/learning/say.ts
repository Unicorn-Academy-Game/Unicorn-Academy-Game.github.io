import type { WordId } from '../content/lexicon';
import { occasionOf, type Reward } from './finish';
import {
  againClip,
  CHEERS,
  type ClipId,
  canClip,
  cheerClip,
  EVERYTHING_CLIP,
  milestoneClip,
  openClip,
  PRESS_CLIP,
  pageClip,
  READ_DONE_CLIP,
  READ_START_CLIP,
  READS_CLIP,
  STAR_CLIP,
  shoutClip,
  textOf,
  wordClip,
} from './lines';
import type { SpellOffer } from './offers';

/**
 * What the voice says. It is warm and short, it always says the word, and it never says a try was
 * wrong. Chance only picks between kind words, and `random` returns a number from 0 up to but not
 * including 1.
 */

/**
 * Something to say: the clips that are played one after another, and the words they say, which the
 * card shows.
 */
export interface Said {
  readonly text: string;
  readonly clips: readonly ClipId[];
}

/**
 * A line made of clips. What it writes is what they say, so the card and the voice cannot say two
 * things.
 */
const said = (...clips: ClipId[]): Said => ({ text: clips.map(textOf).join(' '), clips });

const pick = <T>(items: readonly T[], random: () => number): T =>
  items[Math.min(items.length - 1, Math.floor(random() * items.length))]!;

/** The word on its own, for the player to hear again. */
export const wordSaid = (word: WordId): Said => said(wordClip(word));

/** Said when the card opens. The first card the player ever sees also says how to use it. */
export function opening(offer: SpellOffer, firstEver: boolean, random: () => number): Said {
  const word = offer.word;
  if (offer.review) return said(pick([againClip(word), canClip(word)], random));
  return firstEver ? said(openClip(word), PRESS_CLIP) : said(openClip(word));
}

/** Said when the word is finished, for the first of these that applies. */
export function praise(reward: Reward, random: () => number): Said {
  const word = reward.offer.word;
  switch (occasionOf(reward)) {
    case 'everything':
      return said(shoutClip(word), EVERYTHING_CLIP);
    case 'page':
      // The occasion is a page only when a page was finished, so there is one.
      return said(shoutClip(word), pageClip(reward.pages[0]!));
    case 'milestone':
      return said(shoutClip(word), milestoneClip(reward.milestone!));
    case 'star':
      return said(shoutClip(word), STAR_CLIP);
    case 'word':
      return said(cheerClip(pick(CHEERS, random)), wordClip(word));
  }
}

/** Said when a round of reading begins. */
export const readStart = (): Said => said(READ_START_CLIP);

/**
 * Said when a word is read: a cheer and the word, and for a word the player now reads on their own,
 * the word shouted and that they can read it.
 */
export const readPraise = (word: WordId, reads: boolean, random: () => number): Said =>
  reads ? said(shoutClip(word), READS_CLIP) : said(cheerClip(pick(CHEERS, random)), wordClip(word));

/** Said when the last item of a round is read. */
export const readDone = (): Said => said(READ_DONE_CLIP);
