import type { SoundId } from './sounds';

/**
 * The shapes of the reading course. A course is stages, a stage has words to sound out, words that
 * cannot be sounded out, and sentences, and every word is already cut into the tiles a child
 * touches. All of it is data, and `check.ts` says what is wrong with it, so a slip in a list is
 * caught when the tests run and not by a child.
 */

/** One touch on a word: a letter, or a group of letters that make one sound. */
export interface Tile {
  /** The letters, as written. */
  readonly letters: string;
  /**
   * What touching it says, or none for a letter that makes no sound (the e that makes the vowel
   * before it long).
   */
  readonly sound: SoundId | null;
  /**
   * A tile of a word that cannot be sounded out says the name of its letter, since the sound would
   * teach the player the wrong word.
   */
  readonly name?: true;
  /** The two ends of a vowel and its magic e (the a and the e of make), which are drawn joined. */
  readonly split?: 'start' | 'end';
  /** The first tile of a later part of a longer word, which is drawn with a gap before it. */
  readonly gap?: true;
}

export interface ReadWord {
  /** The word in lower case letters. Also the name of its clip. */
  readonly id: string;
  readonly tiles: readonly Tile[];
  /** A word that cannot be sounded out, which the player spells by the names of its letters. */
  readonly tricky: boolean;
  /**
   * The tiles were written out by hand and not cut from the letters, because the usual cut says the
   * wrong sound.
   */
  readonly explicit?: true;
  /** The stage that asks for it. */
  readonly stage: number;
}

export interface Line {
  /**
   * The words of the sentence in lower case, joined with hyphens. A sentence is named by what it
   * says.
   */
  readonly id: string;
  /** As the player reads it: a capital letter at the start and a mark at the end. */
  readonly text: string;
  /** The words, in lower case and without marks, in the order the player reads them. */
  readonly words: readonly string[];
  readonly stage: number;
}

export interface Chapter {
  readonly id: ChapterId;
  readonly title: string;
  /** The first and last stage, counted from 1. */
  readonly from: number;
  readonly to: number;
}

const CHAPTER_IDS = [
  'tiny',
  'meadow',
  'farm',
  'pond',
  'beach',
  'forest',
  'treehouse',
  'palace',
  'garden',
  'sky',
  'stars',
  'rainbow',
  'unicorn',
] as const;
export type ChapterId = (typeof CHAPTER_IDS)[number];

export interface Stage {
  /** Counted from 1. This is "Level 7" to the player. */
  readonly n: number;
  readonly chapter: ChapterId;
  readonly title: string;
  /** What the stage teaches, as it was written, for the level map to say what is new. */
  readonly teaches: readonly string[];
  /** The words to sound out and then say, easiest first. */
  readonly words: readonly ReadWord[];
  /** The words that are new to the player here and that they spell by name. */
  readonly tricky: readonly ReadWord[];
  /** The sentences, easiest first. */
  readonly lines: readonly Line[];
}

/**
 * What a stage is written as. `teaches` lists what the tiles of its words may say from here on,
 * `prefer` which sound a letter group says first in this stage.
 */
export interface StageSource {
  readonly title: string;
  readonly teaches: readonly string[];
  readonly prefer?: Readonly<Record<string, SoundId>>;
  /**
   * Words separated by spaces. A word is its letters, or its letters, `=` and its tiles
   * (`snow=s.n.ow:oh`), and `|` marks where a longer word breaks.
   */
  readonly words: string;
  /** Words that cannot be sounded out, separated by spaces. */
  readonly tricky?: string;
  readonly lines: readonly string[];
}
