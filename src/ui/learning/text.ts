import { type Outcome, type Spelling, STARS_PER_WORD } from '../../learning';
import type { KeyState } from './card-view';

/**
 * Every word the card shows on the screen or gives to a screen reader. None of it ever says that a
 * try was wrong: a key that is not the next letter is a chance to find another, and a faded key is
 * resting. The word itself is only written where the card means the player to see it, because at
 * the rungs that ask them to remember, the word is the answer.
 */

export const LABELS = {
  close: 'Close',
  say: 'Hear the word',
  help: 'Show me the next letter',
  letters: 'Letters',
  places: 'The word, one place for each letter',
} as const;

/** What is written under the picture. */
export function caption(s: Spelling, firstEver: boolean): string {
  const shown = s.rung.model === 'in-places' || s.rung.model === 'above';
  if (!shown) return 'Can you spell it?';
  return firstEver ? `Spell ${s.word}. Press the shining letters.` : `Spell ${s.word}.`;
}

/** What the card is called to a screen reader. */
export function dialogLabel(s: Spelling): string {
  const shown = s.rung.model === 'in-places' || s.rung.model === 'above';
  return shown ? `Spell ${s.word}` : 'Spell the word for this picture';
}

/**
 * One place for a letter. `letter` is what the player has put there, and nothing for a place that
 * is empty or only a guide.
 */
export const slotLabel = (index: number, total: number, letter: string | null): string =>
  `Letter ${index + 1} of ${total}: ${letter ? letter.toUpperCase() : 'empty'}`;

export function keyLabel(letter: string, state: KeyState): string {
  const name = letter.toUpperCase();
  return state === 'lit' ? `${name}, shining` : state === 'off' ? `${name}, resting` : name;
}

export const starsLabel = (stars: number): string => `${stars} of ${STARS_PER_WORD} stars`;

/**
 * What a screen reader is told when a key is pressed, with `s` as it stands after the press. The
 * word being done is told by its praise instead.
 */
export function announce(outcome: Outcome, s: Spelling): string {
  switch (outcome.kind) {
    case 'right':
      return outcome.done ? '' : `${outcome.letter.toUpperCase()}. ${s.placed} of ${s.letters.length}.`;
    case 'wrong':
      return outcome.lit ? 'Have another go. A key is shining to help.' : 'Have another go.';
    case 'faded':
      return 'That letter is resting.';
    case 'ignored':
      return '';
  }
}

export const HELP_ANNOUNCEMENT = 'A key is shining to help.';
