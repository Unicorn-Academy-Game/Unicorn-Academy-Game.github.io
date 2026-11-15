import type { Family, Question, StrandId } from '../learning/play/maths/question';
import type { MathsLevel } from '../shared/play';

/**
 * What the maths game says to its screen, and what the screen says back. As with the memory game,
 * the session keeps every rule and hands its screen a whole view each time something changes, so a
 * screen is a picture of the view and nothing more.
 */

/** One kind of sum on the tiles, with the level the player plays it at. */
interface StrandView {
  readonly id: StrandId;
  readonly name: string;
  readonly level: MathsLevel;
  /** How many rounds of it the player has finished. */
  readonly rounds: number;
}

/** One family of levels, which the player switches between at the top of the tiles. */
interface FamilyView {
  readonly level: Family;
  /** What it is called: Level 0, Level 1. */
  readonly name: string;
  /** What is in it, for a screen reader. */
  readonly about: string;
  /** Whether its tiles are the ones that are showing. */
  readonly chosen: boolean;
}

/** The tiles the player chooses a kind of sum from, the ones of the family they are in. */
export interface PickView {
  readonly kind: 'pick';
  readonly families: readonly FamilyView[];
  readonly strands: readonly StrandView[];
  readonly speech: boolean;
  readonly caption: string;
}

/** A question of a round. */
export interface AskView {
  readonly kind: 'ask';
  readonly strand: StrandId;
  readonly name: string;
  readonly level: MathsLevel;
  /**
   * Counts the questions asked since the screen came up, so a screen can tell a new question from
   * the same one drawn again.
   */
  readonly serial: number;
  /** Which question of the round this is, from 0, and how many there are. */
  readonly index: number;
  readonly length: number;
  readonly question: Question;
  /** The choices that were touched and are not the one, which rest. */
  readonly rested: readonly number[];
  /** Whether the right choice has been touched, so the question waits only for the next to come. */
  readonly solved: boolean;
  /** Whether the right choice should shine, because enough others have been tried. */
  readonly hint: boolean;
  readonly speech: boolean;
  readonly caption: string;
}

/** A round that is finished. */
export interface DoneView {
  readonly kind: 'done';
  readonly strand: StrandId;
  readonly name: string;
  /** The level the player played it at, and the one they play it at next. */
  readonly level: MathsLevel;
  readonly next: MathsLevel;
  readonly clean: number;
  readonly length: number;
  readonly stars: 1 | 2 | 3;
  readonly speech: boolean;
  readonly caption: string;
}

export type MathsView = PickView | AskView | DoneView;

/**
 * What the maths screen tells the session. The screen keeps no rules: it asks, and is drawn again
 * with what the session says.
 */
export interface MathsHandlers {
  /** The other family of levels was chosen, to see its tiles. */
  family: (level: Family) => void;
  /** A kind of sum was chosen from the tiles. */
  pick: (strand: StrandId) => void;
  /** The choice at this place was touched. */
  choose: (at: number) => void;
  /** Says the question again, or what to do at the tiles. */
  hear: () => void;
  /** Another round of the same kind of sum, after one is finished. */
  again: () => void;
  /** Back to the tiles. */
  menu: () => void;
  /** The player closed the screen, with the cross or Escape. */
  close: () => void;
}

export interface MathsScreen {
  show(view: MathsView): void;
  close(): void;
}
