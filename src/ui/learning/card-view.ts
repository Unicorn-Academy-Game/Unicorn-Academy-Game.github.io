import { isDone, LAYOUTS, litKey, occasionOf, type Spelling, type Worth } from '../../learning';
import type { KeyboardLayout } from '../../shared/learning';

/**
 * What the spell card draws, worked out from the spelling and nothing else, so the screen is a
 * plain picture of these values and every rule about what shows when can be tested without one.
 */

/** The place for one letter of the word. */
interface SlotView {
  /** The player's letter is in it, it is the one they are on, or it is still empty. */
  state: 'placed' | 'next' | 'empty';
  /** The letter that shows there, in lower case, or nothing. */
  letter: string | null;
  /** The letter is a faint guide to copy, and not one the player has spelled. */
  guide: boolean;
}

export interface CardView {
  slots: readonly SlotView[];
  /** The whole word, written out above the places, or nothing. */
  above: string | null;
  /**
   * Whether this card has a row above the places at all, so its room is kept while the row is out
   * of sight.
   */
  hasAbove: boolean;
  /**
   * Whether the card writes the word out for the player to see, as it does at the rungs that copy.
   */
  shown: boolean;
  done: boolean;
}

/**
 * `peeking` is true while the whole word is being shown for a moment, because the player asked for
 * help at a rung that does that.
 */
export function cardView(s: Spelling, peeking: boolean): CardView {
  const done = isDone(s);
  const guides = s.rung.model === 'in-places';
  const slots = s.letters.map((letter, i): SlotView => {
    if (i < s.placed) return { state: 'placed', letter, guide: false };
    return { state: i === s.placed ? 'next' : 'empty', letter: guides ? letter : null, guide: guides };
  });
  const hasAbove = s.rung.model === 'above' || s.rung.peek;
  const showing = s.rung.model === 'above' || (s.rung.peek && peeking);
  return {
    slots,
    above: !done && showing ? s.letters.join('') : null,
    hasAbove,
    shown: guides || s.rung.model === 'above',
    done,
  };
}

export type KeyState =
  /** A key that works. */
  | 'on'
  /** A key that is faded, because this rung does not use it. */
  | 'off'
  /** The key the player needs next, which glows. */
  | 'lit';

export interface KeyView {
  letter: string;
  state: KeyState;
}

/** The rows of the keyboard, each key with how it looks. All of them fade once the word is done. */
export function keyViews(layout: KeyboardLayout, s: Spelling): KeyView[][] {
  const lit = litKey(s);
  const over = isDone(s);
  return LAYOUTS[layout].map((row) =>
    [...row].map(
      (letter): KeyView => ({ letter, state: over || !s.keys.has(letter) ? 'off' : letter === lit ? 'lit' : 'on' }),
    ),
  );
}

/**
 * What a big moment pins to the picture: a rosette for a round number of words or a finished page,
 * and a crown for the whole book.
 */
export interface Badge {
  shape: 'rosette' | 'crown';
  /** The number of words in a round number's rosette, where a finished page's holds a star. */
  number: number | null;
}

/**
 * The badge for what a finished word was worth, or nothing for a word, or a new star, which the
 * stars already say.
 */
export function badgeOf(worth: Worth): Badge | null {
  switch (occasionOf(worth)) {
    case 'everything':
      return { shape: 'crown', number: null };
    case 'page':
      return { shape: 'rosette', number: null };
    case 'milestone':
      return { shape: 'rosette', number: worth.milestone };
    case 'star':
    case 'word':
      return null;
  }
}
