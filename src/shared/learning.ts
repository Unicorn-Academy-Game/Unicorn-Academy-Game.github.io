import { z } from 'zod';

/**
 * The shapes the learning engine keeps: what a parent chooses, and what the child has learned. They
 * live in the shared layer so the device record, the engine and the parent pages all read the same
 * thing.
 */

/**
 * What can be learned about a word. Add one here and the compiler lists every table that needs a
 * row for it.
 */
export const SKILLS = ['spell', 'read'] as const;
export type Skill = (typeof SKILLS)[number];

/**
 * The first version of the stored profile that holds each skill. A copy of the game that does not
 * know a skill drops it when it writes the book, so a record that holds one must say it is a
 * version that copy will not write over. A skill is never added here without a version number to go
 * with it, which `tests/learning/profile.test.ts` checks.
 */
export const SKILL_SINCE = { spell: 1, read: 2 } as const satisfies Readonly<Record<Skill, number>>;

/**
 * The first version of the profile that holds each kind of record that is not about a word: the
 * sentences the player has read, and the stage a parent started them at. They follow the rule of
 * the skills. A copy of the game from before one drops it when it writes the book, so a book that
 * holds one says it is a version that copy leaves alone, and a book that holds none stays the
 * version it was.
 */
export const RECORD_SINCE = { sentences: 3, floor: 3 } as const;

/**
 * The newest version of the profile this game reads and writes. A record from a later one is left
 * alone.
 */
export const PROFILE_VERSION = 3;
export type ProfileVersion = 1 | 2 | 3;

/**
 * How far a word climbs. Zero is just met and the top is mastered. The table that says what each
 * level means is in the engine.
 */
export const MAX_LEVEL = 5;

export const KEYBOARD_LAYOUTS = ['abc', 'qwerty'] as const;
export type KeyboardLayout = (typeof KEYBOARD_LAYOUTS)[number];

export const LETTER_CASES = ['upper', 'lower'] as const;
export type LetterCase = (typeof LETTER_CASES)[number];

/** How much help a word that is new to the player starts with. */
export const START_HELP = ['full', 'some', 'little'] as const;
export type StartHelp = (typeof START_HELP)[number];

/** How often the game asks the player to spell something that they did not tap for a word. */
export const ASK_RATES = ['often', 'sometimes', 'rarely'] as const;
export type AskRate = (typeof ASK_RATES)[number];

/**
 * What a parent has chosen about learning on one device. Every field has a default, so a record
 * stored before a field existed still reads, and a value from another version falls back to the
 * gentle choice and keeps the rest.
 */
export const LearningSettings = z.object({
  /**
   * The whole mode. It is on unless a parent turns it off, and off means the game is exactly the
   * game the player knew before spelling.
   */
  on: z.boolean().default(true),
  /**
   * Whether the word is said aloud, and the sound of each letter the player presses. The voice is
   * the one that ships with the game, not the device's.
   */
  say: z.boolean().default(true),
  keyboard: z.enum(KEYBOARD_LAYOUTS).catch('abc'),
  letters: z.enum(LETTER_CASES).catch('upper'),
  help: z.enum(START_HELP).catch('full'),
  ask: z.enum(ASK_RATES).catch('sometimes'),
  /**
   * Whether a friend the player has not found joins only once her name is spelled, and not just by
   * walking up.
   */
  friends: z.boolean().default(true),
});
export type LearningSettings = z.infer<typeof LearningSettings>;

export const DEFAULT_LEARNING: LearningSettings = LearningSettings.parse({});

/** A word's id is its spelling: lower case letters and nothing else. */
export const WORD_PATTERN = /^[a-z]{2,24}$/;

/**
 * The most any one counter will hold. The engine stops there too, so a record it writes is always
 * one the schema reads back.
 */
export const COUNT_MAX = 1_000_000;
const Count = z.number().int().min(0).max(COUNT_MAX);
/** A moment, in milliseconds since 1970. */
const Instant = z.number().int().min(0).max(8_640_000_000_000_000);

/**
 * How well one skill is known for one word. The counters and `best` only grow. The rest is the
 * state after the latest completion, so two copies of a profile can be merged without losing a
 * star: counters take the larger, and the state comes from whichever copy saw the word last.
 */
export const Progress = z.object({
  level: z.number().int().min(0).max(MAX_LEVEL),
  /**
   * The highest level it has reached. A word that slips back a rung keeps this, so a parent can see
   * how far it once got.
   */
  best: z.number().int().min(0).max(MAX_LEVEL),
  /** Clean completions in a row at this level. */
  streak: z.number().int().min(0).max(100),
  /** Struggles in a row. Two move the word down. */
  struggles: z.number().int().min(0).max(100),
  /** When the word should be offered again. */
  due: Instant,
  /** Completions, and how many of them were clean. */
  done: Count,
  clean: Count,
  /** Wrong keys over all completions, for finding the tricky words. */
  slips: Count,
  first: Instant,
  last: Instant,
});
export type Progress = z.infer<typeof Progress>;

export const WordProgress = z.partialRecord(z.enum(SKILLS), Progress);
export type WordProgress = z.infer<typeof WordProgress>;

/**
 * A sentence's id is its words in lower case joined with single hyphens, so it is readable in a
 * saved book and does not move when a list of sentences is put in another order. Two words at
 * least, and no word of more than twelve letters, which is more than any sentence a young child
 * reads has, so a key that is not a sentence is not kept.
 */
export const SENTENCE_PATTERN = /^[a-z]{1,12}(?:-[a-z]{1,12}){1,19}$/;

/**
 * The stages are counted from 1, so a floor of 1 is no floor and the first one there can be is 2.
 * No course will have more stages than this.
 */
export const MAX_FLOOR = 99;

/**
 * The sentences the player has read, which are read the way words are: by the same counters and the
 * same levels.
 */
const Sentences = z.record(z.string().regex(SENTENCE_PATTERN), Progress);
/** The stage a parent started the player at. A stage under it counts as done. */
export const Floor = z.number().int().min(2).max(MAX_FLOOR);

/**
 * The least version a record can honestly claim for what it holds: 1 until a skill or a record that
 * arrived later has an entry. A book that only has spelling stays version 1, so a copy of the game
 * from before reading, or a Worker that is not updated yet, still reads it and writes it back
 * whole. A set of sentences that is empty, or no floor, says nothing, so it does not count.
 */
export function versionOf(
  words: Readonly<Record<string, WordProgress>>,
  more: { sentences?: Readonly<Record<string, Progress>> | undefined; floor?: number | undefined } = {},
): ProfileVersion {
  let version: number = 1;
  for (const entry of Object.values(words)) {
    for (const skill of SKILLS) if (entry[skill] !== undefined) version = Math.max(version, SKILL_SINCE[skill]);
  }
  if (more.sentences !== undefined && Object.keys(more.sentences).length > 0)
    version = Math.max(version, RECORD_SINCE.sentences);
  if (more.floor !== undefined) version = Math.max(version, RECORD_SINCE.floor);
  return version as ProfileVersion;
}

export const LearnerProfile = z
  .object({
    schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    words: z.record(z.string().regex(WORD_PATTERN), WordProgress),
    /**
     * The sentences the player has read, by their ids. Not there at all until they have read one.
     */
    sentences: Sentences.optional(),
    /**
     * The stage a parent started the player at, from 2. Not there at all until a parent has chosen
     * one.
     */
    floor: Floor.optional(),
  })
  // Older than what it holds is the one mistake that costs the player a skill. Newer than it needs
  // is harmless.
  .refine((profile) => profile.schemaVersion >= versionOf(profile.words, profile), {
    message: 'the record names a version that is older than what it holds',
    path: ['schemaVersion'],
  });
export type LearnerProfile = z.infer<typeof LearnerProfile>;
