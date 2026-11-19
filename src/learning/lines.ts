import { PAGES, type PageId, WORD_IDS, type WordId } from '../content/lexicon';
import { MILESTONE_EVERY } from './finish';
import { ALPHABET } from './keys';

/**
 * Everything the voice can say, as a list of clips. Each clip is read once, by the voice that was
 * made for the game, and ships as a sound file. The game never reads anything aloud itself: it
 * picks clips and plays them one after another. A line that has the word in it is a clip of its
 * own, so the word is said with the sound of the sentence round it, and what is only ever put next
 * to a word (a cheer, "A new star!") is a clip that is shared.
 *
 * The card shows the same words as the voice says, because what the card shows is made from the
 * clips it plays.
 */

/** A clip's name, which is also the name of its sound file in the manifest. */
export type ClipId = string;

export interface Clip {
  readonly id: ClipId;
  /** What it says, as the card writes it. */
  readonly text: string;
  /** What the voice reads when that is not how it is written: a number in words. */
  readonly say?: string;
  /**
   * A clip that is a piece of a sentence, to be said with the pieces beside it and not alone, is
   * made by speaking a whole sentence and cutting the piece out. This is that sentence, with the
   * words of the piece in square brackets: `What is [thirty-four] plus five?`
   */
  readonly frame?: string;
}

/** The cheers that come before a word. */
export const CHEERS = ['Yes!', 'You did it!', 'Wonderful!', 'Hooray!', 'Magic!', 'Brilliant!', 'Lovely!'] as const;

const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
] as const;
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'] as const;

/** A whole number from 0 to 999 in words, for the voice to read: "one hundred forty-five". */
export function numberWords(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999) throw new RangeError(`${n} is not a number from 0 to 999`);
  if (n >= 100) {
    const rest = n % 100;
    return rest === 0 ? `${ONES[n / 100]} hundred` : `${ONES[Math.floor(n / 100)]} hundred ${numberWords(rest)}`;
  }
  if (n < 20) return ONES[n]!;
  const ones = n % 10;
  return ones === 0 ? TENS[n / 10]! : `${TENS[Math.floor(n / 10)]}-${ONES[ones]}`;
}

/**
 * The round numbers of words that are celebrated on the way to the whole book. The whole book has
 * its own line.
 */
export const MILESTONES: readonly number[] = Array.from(
  { length: Math.floor((WORD_IDS.length - 1) / MILESTONE_EVERY) },
  (_, i) => (i + 1) * MILESTONE_EVERY,
);

/** The name of a letter, as in "bee". */
export const letterClip = (letter: string): ClipId => `letter.${letter}`;
/**
 * What a letter sounds like by itself, as in "buh". This is what a key says when the player presses
 * it.
 */
export const soundClip = (letter: string): ClipId => `sound.${letter}`;
export const wordClip = (word: WordId): ClipId => `word.${word}`;
/** A number said on its own, as an answer is. The maths tables keep this clip for every number too. */
export const numeralClip = (n: number): ClipId => `num.${n}`;
/** The word with a shout, said before a bigger thing is said about it. */
export const shoutClip = (word: WordId): ClipId => `shout.${word}`;
/** Whether a clip is this word said on its own, or shouted. */
export const saysWord = (clip: ClipId, word: WordId): boolean => clip === wordClip(word) || clip === shoutClip(word);
export const openClip = (word: WordId): ClipId => `open.${word}`;
export const againClip = (word: WordId): ClipId => `again.${word}`;
export const canClip = (word: WordId): ClipId => `can.${word}`;
export const cheerClip = (cheer: (typeof CHEERS)[number]): ClipId => `cheer.${slug(cheer)}`;
export const pageClip = (page: PageId): ClipId => `page.${page}`;
export const milestoneClip = (count: number): ClipId => `milestone.${count}`;
export const STAR_CLIP: ClipId = 'star';
export const EVERYTHING_CLIP: ClipId = 'everything';
export const PRESS_CLIP: ClipId = 'press';
/** Said when a round of reading begins. */
export const READ_START_CLIP: ClipId = 'read.start';
/** Said after a word the player now reads on their own, in place of a cheer. */
export const READS_CLIP: ClipId = 'read.reads';
/** Said when a round of reading is finished. */
export const READ_DONE_CLIP: ClipId = 'read.done';

/**
 * What each letter sounds like, as a child's book writes it. The voice makes these sounds from the
 * sound itself, not from the spelling (see `tools/voice/sounds.py`), so this is what the card shows
 * and what a person reads to know what the clip should be.
 */
const SOUND_TEXT: Readonly<Record<string, string>> = {
  a: 'a, as in apple',
  b: 'buh',
  c: 'kuh',
  d: 'duh',
  e: 'eh',
  f: 'fuh',
  g: 'guh',
  h: 'huh',
  i: 'ih',
  j: 'juh',
  k: 'kuh',
  l: 'luh',
  m: 'muh',
  n: 'nuh',
  o: 'o, as in octopus',
  p: 'puh',
  q: 'kwuh',
  r: 'ruh',
  s: 'suh',
  t: 'tuh',
  u: 'uh',
  v: 'vuh',
  w: 'wuh',
  x: 'ksuh',
  y: 'yuh',
  z: 'zuh',
};

/** Every clip, in the order the files are made in. */
export const CLIPS: readonly Clip[] = [
  ...[...ALPHABET].map((letter): Clip => ({ id: letterClip(letter), text: letter.toUpperCase() })),
  ...[...ALPHABET].map((letter): Clip => ({ id: soundClip(letter), text: SOUND_TEXT[letter]! })),
  ...WORD_IDS.flatMap((word): Clip[] => [
    { id: wordClip(word), text: `${word}.` },
    { id: shoutClip(word), text: `${word}!` },
    { id: openClip(word), text: `Let's spell ${word}.` },
    { id: againClip(word), text: `Let's spell ${word} again.` },
    { id: canClip(word), text: `Can you spell ${word}?` },
  ]),
  ...CHEERS.map((cheer): Clip => ({ id: cheerClip(cheer), text: cheer })),
  { id: STAR_CLIP, text: 'A new star!' },
  ...PAGES.map((page): Clip => ({ id: pageClip(page.id), text: `You finished ${page.title}!` })),
  ...MILESTONES.map(
    (count): Clip => ({
      id: milestoneClip(count),
      text: `That is ${count} words!`,
      say: `That is ${numberWords(count)} words!`,
    }),
  ),
  { id: EVERYTHING_CLIP, text: 'You have every word in the book!' },
  { id: PRESS_CLIP, text: 'Press the shining letters.' },
  { id: READ_START_CLIP, text: "Let's read!" },
  { id: READS_CLIP, text: 'You can read it!' },
  { id: READ_DONE_CLIP, text: 'You are a reader!' },
];

const BY_ID: ReadonlyMap<ClipId, Clip> = new Map(CLIPS.map((clip) => [clip.id, clip]));

/**
 * What a clip says, as the card writes it. A clip that is not in the list is a mistake in the game,
 * and is thrown.
 */
export function textOf(id: ClipId): string {
  const clip = BY_ID.get(id);
  if (!clip) throw new Error(`there is no clip called ${id}`);
  return clip.text;
}
