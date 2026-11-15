import type { KeyboardLayout } from '../shared/learning';
import type { Keys } from './levels';

export const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

/**
 * The rows of the keyboard, in lower case. ABC order is the order the player learned the letters
 * in, and the other is the order of the keyboards they will see everywhere. A new layout is one
 * more row of strings here.
 */
export const LAYOUTS: Readonly<Record<KeyboardLayout, readonly string[]>> = {
  abc: ['abcdefghi', 'jklmnopqr', 'stuvwxyz'],
  qwerty: ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'],
};

/**
 * Letters that a child who is learning to read mixes up. A decoy is never the twin of a letter in
 * the word.
 */
const TWINS: Readonly<Record<string, string>> = { b: 'd', d: 'b', p: 'q', q: 'p', m: 'w', w: 'm', n: 'u', u: 'n' };

/** How many keys that are not in the word work at the rung that gives a bank of letters. */
export const DECOYS = 4;

/**
 * The word's own letters and a few that are not in it, chosen by `random`, which returns a number
 * from 0 up to but not including 1.
 */
export function bankFor(word: string, random: () => number, decoys: number = DECOYS): ReadonlySet<string> {
  const own = new Set(word);
  const twins = new Set([...own].map((letter) => TWINS[letter]));
  const pool = [...ALPHABET].filter((letter) => !own.has(letter) && !twins.has(letter));
  const picked: string[] = [];
  for (let i = 0; i < decoys && pool.length > 0; i++)
    picked.push(...pool.splice(Math.min(pool.length - 1, Math.floor(random() * pool.length)), 1));
  return new Set([...own, ...picked]);
}

/** The keys that work at a rung, for a word. */
export function keysFor(mode: Keys, word: string, random: () => number): ReadonlySet<string> {
  if (mode === 'word') return new Set(word);
  if (mode === 'bank') return bankFor(word, random);
  return new Set(ALPHABET);
}

/** A letter as a key knows it: one lower case letter from a to z, or nothing. */
export const asLetter = (text: string): string | null =>
  text.length === 1 && /[a-z]/i.test(text) ? text.toLowerCase() : null;
