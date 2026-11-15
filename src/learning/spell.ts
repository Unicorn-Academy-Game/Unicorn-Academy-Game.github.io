import type { WordId } from '../content/lexicon';
import { asLetter, keysFor } from './keys';
import { type Rung, rungAt } from './levels';
import type { Attempt } from './mastery';

/** How many wrong presses on one letter it takes before the key the player needs begins to glow. */
export const HELP_AFTER = 2;

/**
 * One word being spelled. It is a plain value and every move returns a new one, so the card is a
 * thin picture of it and the rules can be tested without a screen. The rule at the heart of it is
 * that each press is checked at once: the right letter goes into its place, and a wrong one never
 * does. The player can only ever see a word that is right so far.
 */
export interface Spelling {
  readonly word: WordId;
  readonly letters: readonly string[];
  readonly level: number;
  readonly rung: Rung;
  /** The keys that work. The rest are faded. */
  readonly keys: ReadonlySet<string>;
  /** How many letters are in their places. */
  readonly placed: number;
  readonly slips: number;
  readonly hints: number;
  /**
   * The wrong key pressed last, while no right key has been pressed since, so a hammered key is one
   * slip.
   */
  readonly lastWrong: string | null;
  /** Wrong presses on the letter the player is on. */
  readonly misses: number;
  /** Whether the key the player needs is lit because they were helped. */
  readonly helped: boolean;
}

export type Outcome =
  | { kind: 'right'; letter: string; index: number; done: boolean }
  /** `lit` is set when this press made the right key begin to glow. */
  | { kind: 'wrong'; letter: string; lit: boolean }
  /**
   * A key that is faded, because this rung does not use it. Nothing happens, and it counts for
   * nothing against the player.
   */
  | { kind: 'faded'; letter: string }
  /** Not a letter, or the word is already finished. */
  | { kind: 'ignored' };

/**
 * Starts a word at a level. `random` chooses the decoys at the rung that has them, and returns a
 * number from 0 up to but not including 1.
 */
export function begin(word: WordId, level: number, random: () => number): Spelling {
  const rung = rungAt(level);
  return {
    word,
    letters: [...word],
    level,
    rung,
    keys: keysFor(rung.keys, word, random),
    // The rung that gives the first letter gives it already placed.
    placed: rung.model === 'first-letter' ? 1 : 0,
    slips: 0,
    hints: 0,
    lastWrong: null,
    misses: 0,
    helped: false,
  };
}

export const isDone = (s: Spelling): boolean => s.placed >= s.letters.length;

/** The letter the player needs next, or nothing once the word is done. */
export const nextLetter = (s: Spelling): string | null => s.letters[s.placed] ?? null;

/**
 * The key that glows now: always on the rung that lights it, and on the others once the player has
 * been helped.
 */
export const litKey = (s: Spelling): string | null =>
  !isDone(s) && (s.rung.lights || s.helped) ? nextLetter(s) : null;

export function press(s: Spelling, key: string): { spelling: Spelling; outcome: Outcome } {
  const letter = asLetter(key);
  if (letter === null || isDone(s)) return { spelling: s, outcome: { kind: 'ignored' } };
  if (!s.keys.has(letter)) return { spelling: s, outcome: { kind: 'faded', letter } };
  if (letter === nextLetter(s)) {
    const placed = s.placed + 1;
    return {
      spelling: { ...s, placed, misses: 0, helped: false, lastWrong: null },
      outcome: { kind: 'right', letter, index: s.placed, done: placed >= s.letters.length },
    };
  }
  const misses = s.misses + 1;
  const lit = !s.helped && !s.rung.lights && misses >= HELP_AFTER;
  return {
    spelling: {
      ...s,
      slips: s.slips + (letter === s.lastWrong ? 0 : 1),
      misses,
      lastWrong: letter,
      helped: s.helped || lit,
      hints: s.hints + (lit ? 1 : 0),
    },
    outcome: { kind: 'wrong', letter, lit },
  };
}

/**
 * The player asked for help: the key they need lights up, and the spell counts as helped. Asking
 * twice for one letter counts once.
 */
export function help(s: Spelling): Spelling {
  if (isDone(s) || s.rung.lights || s.helped) return s;
  return { ...s, helped: true, hints: s.hints + 1 };
}

/** The two numbers that say what this spell was. */
export const attemptOf = (s: Spelling): Attempt => ({ slips: s.slips, hints: s.hints });
