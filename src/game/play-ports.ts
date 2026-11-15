import type { WordId } from '../content/lexicon';
import type { PlayRecord } from '../shared/play';
import type { ReadVoice } from './reading-ports';

/**
 * What the two tables in front of the palace, the memory game and the maths game, share with the
 * game around them, and what each says to its screen. A session keeps every rule and hands its
 * screen a whole view each time something changes, so a screen is a picture of the view and nothing
 * more, as the reading computer's is.
 */

/** What the player has done at the tables, kept on the device. */
export interface PlayLedger {
  get(): PlayRecord;
  set(next: PlayRecord): void;
}

/**
 * What the tables sound like, apart from the voice. Every sound is made by the game and is safe to
 * ask for when it would not be heard.
 */
export interface PlaySounds {
  /** The screen comes up. */
  open(): void;
  /** A card is turned, or a choice is touched. */
  flip(): void;
  /**
   * Two cards are the same, or an answer is right. `streak` is how many in a row, from 1, so a run
   * of them climbs.
   */
  pair(streak: number): void;
  /**
   * Two cards are not the same, or an answer is not the one: soft and low, in the key, never a
   * buzz.
   */
  nudge(): void;
  /** The game or the round is over, and earned `stars` of 3. */
  finish(stars: number): void;
}

/** What the session says aloud, which is the same voice the reading computer has. */
export type PlayVoice = ReadVoice;

/** Where a card is: face down, turned up and waiting for its pair, or paired and staying up. */
type CardState = 'down' | 'up' | 'paired';

export interface CardView {
  /** The word whose picture is on the card, which is also what is written under it. */
  readonly word: WordId;
  readonly state: CardState;
}

/**
 * One of the sizes of game the player can choose: how many pairs, and the stars they have earned at
 * it.
 */
export interface SizeView {
  readonly pairs: number;
  readonly stars: 0 | 1 | 2 | 3;
  readonly chosen: boolean;
}

/** What a game that is won says to the player. */
export interface WonView {
  readonly turns: number;
  readonly stars: 1 | 2 | 3;
  /**
   * Fewer turns than any game of this size the player played before, which is never said of their
   * first.
   */
  readonly best: boolean;
  /** The next size up, when there is one. */
  readonly next: number | null;
}

export interface MemoryView {
  /**
   * Counts the boards that are dealt, so a screen can tell a new board from the same one drawn
   * again.
   */
  readonly deal: number;
  readonly pairs: number;
  readonly cards: readonly CardView[];
  readonly sizes: readonly SizeView[];
  readonly found: number;
  /** What a screen reader is told, in plain words. */
  readonly caption: string;
  readonly won: WonView | null;
  readonly speech: boolean;
}

/**
 * What the memory screen tells the session. The screen keeps no rules: it asks, and is drawn again
 * with what the session says.
 */
export interface MemoryHandlers {
  /** The card at this place was touched. */
  turn: (at: number) => void;
  /** A game of this many pairs, from the sizes. */
  size: (pairs: number) => void;
  /** Another game of the same size, after one is won. */
  again: () => void;
  /** A game one size up, after one is won. */
  more: () => void;
  /** Says the instruction again. */
  hear: () => void;
  /** The player closed the screen, with the cross or Escape. */
  close: () => void;
}

export interface MemoryScreen {
  show(view: MemoryView): void;
  close(): void;
}
