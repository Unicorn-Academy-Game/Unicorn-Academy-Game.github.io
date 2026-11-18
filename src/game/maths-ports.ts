import type { Family, Question, StrandId } from '../learning/play/maths/question';
import type { MathsLevel } from '../shared/play';

/**
 * What the maths game says to its screen, and what the screen says back. As with the memory game,
 * the session keeps every rule and hands its screen a whole view each time something changes, so a
 * screen is a picture of the view and nothing more.
 */

/**
 * What every screen of the table shows of the child's own two switches, and of the voice they sit
 * under.
 */
interface Switches {
  /** Whether the table is speaking: the voice is on, can be heard, and the child has not stopped it. */
  readonly speech: boolean;
  /**
   * Whether there is a voice to switch off: a parent has it on and it can be heard. Without it the
   * switch is not shown, since there is nothing for it to stop.
   */
  readonly voice: boolean;
  /** The child's switch for the voice at this table. */
  readonly say: boolean;
  /** The child's switch for answering on the keypad, where an answer is a number. */
  readonly keys: boolean;
  readonly caption: string;
}

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
export interface PickView extends Switches {
  readonly kind: 'pick';
  readonly families: readonly FamilyView[];
  readonly strands: readonly StrandView[];
}

/** The keypad that answers a question in place of its choices. */
export interface KeypadView {
  /** The digits of the right answer, which shine on the keys once enough tries have missed. */
  readonly answer: string;
  /** How many numbers typed in were not the answer, so a screen can tell a new miss from the last. */
  readonly misses: number;
}

/** A question of a round. */
export interface AskView extends Switches {
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
  /**
   * The keypad, when the question is answered by typing a number. The choices are still the
   * question's own, and are not shown.
   */
  readonly keypad: KeypadView | null;
}

/** A round that is finished. */
export interface DoneView extends Switches {
  readonly kind: 'done';
  readonly strand: StrandId;
  readonly name: string;
  /** The level the player played it at, and the one they play it at next. */
  readonly level: MathsLevel;
  readonly next: MathsLevel;
  readonly clean: number;
  readonly length: number;
  readonly stars: 1 | 2 | 3;
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
  /** A number was typed in on the keypad and sent. */
  enter: (value: number) => void;
  /** A key of the keypad was pressed, for the sound of it. */
  tap: () => void;
  /** The child turned the voice at this table on or off. */
  say: (on: boolean) => void;
  /** The child turned the keypad on or off. */
  keys: (on: boolean) => void;
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
