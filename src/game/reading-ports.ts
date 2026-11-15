import type { ChapterId } from '../content/reading/types';
import type { ClipId } from '../learning';
import type { Prize } from '../learning/reading/prizes';

/**
 * What the reading computer's session and its screen say to each other. The session keeps every
 * rule and hands the screen a whole view each time something changes, so the screen is a picture of
 * the view and nothing more. A happening that has to be seen, like a tile that is touched, comes
 * with the view as a cue, and the screen shows each cue once.
 */

/** One thing to touch, as it is drawn: a tile of a word, or a word of a sentence. */
export interface Piece {
  /**
   * What is written on it. A word of a sentence is written as it is in the sentence, with its
   * capital and its mark.
   */
  readonly text: string;
  /** A letter that makes no sound, which is drawn faint. */
  readonly silent: boolean;
  /** The two halves of a vowel and its magic e, which are drawn joined. */
  readonly split: 'start' | 'end' | null;
  /** The first tile of a later part of a longer word, which has a gap before it. */
  readonly gap: boolean;
}

/**
 * How a stage stands on the map. Every stage can be played at any time, and this says only what the
 * player has done with it: `current` is the first one they have not cleared.
 */
export type StageMark = 'open' | 'current' | 'cleared' | 'mastered';

export interface StageView {
  /** Counted from 1, which is "Level 7" to the player. */
  readonly n: number;
  readonly title: string;
  readonly chapter: ChapterId;
  /** A few of its words, to show what is in it. */
  readonly samples: readonly string[];
  readonly mark: StageMark;
  /** How many of its words the player has met, out of how many there are to read. */
  readonly met: number;
  readonly words: number;
  /** What it pays for being cleared, and whether the player has been paid it. */
  readonly prize: Prize;
  readonly won: boolean;
}

export interface ChapterView {
  readonly id: ChapterId;
  readonly title: string;
  readonly stages: readonly StageView[];
}

/**
 * The place the player begins at: the stage they are working on (the one they chose, or else the
 * first they have not cleared), and what they have read so far.
 */
export interface HomeView {
  readonly screen: 'home';
  readonly stage: StageView;
  /** The player chose this stage themselves, from the levels, and it is not just the next one. */
  readonly chosen: boolean;
  readonly chapter: string;
  readonly words: number;
  readonly reads: number;
  readonly lines: number;
  /** All the player has won, of each kind they have any of. */
  readonly treasure: readonly Prize[];
  /** The player has never read anything here, so the screen says how it works. */
  readonly firstEver: boolean;
  /**
   * What the screen says, in the words the voice says: a welcome the first time, and nothing after.
   */
  readonly caption: string;
  readonly speech: boolean;
}

/** All the stages, to pick the one to work on. */
export interface MapView {
  readonly screen: 'map';
  readonly chapters: readonly ChapterView[];
  /** The first stage the player has not cleared. */
  readonly current: number;
  /** The stage the player is working on, which is the one that is picked to begin with. */
  readonly picked: number;
}

/**
 * One of the seven bands of a round. A band fills for a thing that was read, and is left empty for
 * one that was skipped.
 */
export type Band = 'ahead' | 'now' | 'read' | 'skipped';

/**
 * When a piece is said: after `after` seconds from now, for `seconds`. A piece of null is the whole
 * of it.
 */
export interface Mark {
  readonly at: number | null;
  readonly after: number;
  readonly seconds: number;
}

/** Something that happened and has to be seen. */
export type Happening =
  /** A tile or a word was touched, and it was the one the player needed. */
  | { readonly kind: 'touched'; readonly at: number }
  /** One that was touched already, touched again. */
  | { readonly kind: 'again'; readonly at: number }
  /** One that was not next. */
  | { readonly kind: 'bounced'; readonly at: number }
  /** The pieces are joined, and now the player says it. */
  | { readonly kind: 'joined' }
  /**
   * The voice is saying pieces, or the whole of it: a sentence read to the player comes as one cue
   * with a mark for each word.
   */
  | { readonly kind: 'voiced'; readonly marks: readonly Mark[] }
  /** The player asked for once more, and it is being shown to them. */
  | { readonly kind: 'asked' };

/**
 * A happening that is counted: the screen shows each once, and `n` goes up with each, so a screen
 * that is drawn again with the same view can tell that it has shown this one.
 */
export type Cue = Happening & { readonly n: number };

/** What the player earned by a thing read, for the screen to say, and no more than it needs. */
export interface Earned {
  /** The cheer, and what was earned, as the voice says it. */
  readonly text: string;
  /** It was told to the player, and it comes back soon. */
  readonly told: boolean;
  /** It took no help at all, which is a star. */
  readonly clean: boolean;
  /** A word the player now reads on their own. */
  readonly reads: boolean;
  /** The stage that was cleared by it, the chapter that ended, and the whole course. */
  readonly cleared: number | null;
  /** What the stage that was cleared paid. */
  readonly prize: Prize | null;
  readonly chapter: string | null;
  readonly everything: boolean;
}

/** A word or a sentence, being read. */
export interface ItemView {
  readonly screen: 'item';
  /**
   * Counts the things that are dealt, so a screen can tell a new thing from the same one drawn
   * again.
   */
  readonly deal: number;
  readonly kind: 'word' | 'line';
  readonly pieces: readonly Piece[];
  /** How many are touched, which is also the place of the one the player needs next. */
  readonly touched: number;
  /** The one that shines. */
  readonly glowing: number | null;
  /**
   * `touching` while the pieces are touched, `saying` while the player says it out loud and then
   * taps the tick, and `found` once it is read.
   */
  readonly phase: 'touching' | 'saying' | 'found';
  /** What the screen says, in the words the voice says. */
  readonly caption: string;
  /** The seven bands of the round. */
  readonly bands: readonly Band[];
  readonly stage: StageView;
  readonly chapter: string;
  /** The help button is offered: the next one can be made to shine. */
  readonly canHelp: boolean;
  /** Hear it, and Show me, are offered to the player, and the tick and Once more are live. */
  readonly canHear: boolean;
  readonly canShow: boolean;
  readonly canApprove: boolean;
  readonly canAskAgain: boolean;
  readonly speech: boolean;
  /**
   * What the player is told, next to the tick, while the word is to be said, the first time ever.
   * It is only there until they have tapped it once.
   */
  readonly hint: string | null;
  readonly earned: Earned | null;
  readonly cue: Cue | null;
}

/** The round is over. */
export interface DoneView {
  readonly screen: 'done';
  readonly bands: readonly Band[];
  /** How many of the round the player read, and how many of those were new to them. */
  readonly read: number;
  readonly fresh: number;
  readonly caption: string;
  readonly stage: StageView;
  /** The last stage that was cleared in the round, the chapter it ended, and the whole course. */
  readonly cleared: number | null;
  /** What that stage paid. */
  readonly prize: Prize | null;
  readonly chapter: string | null;
  readonly everything: boolean;
  readonly speech: boolean;
}

export type ReadView = HomeView | MapView | ItemView | DoneView;

/**
 * What the screen tells the session. The screen keeps no rules: it asks, and it is drawn again with
 * what the session says.
 */
export interface ReadHandlers {
  /** A round from the stage the player is working on. */
  start: () => void;
  /** The map of the stages. */
  levels: () => void;
  /** Back to the place the player begins at. */
  home: () => void;
  /** A round of one stage, from the map. Any stage may be played, at any time. */
  play: (stage: number) => void;
  /** A tile or a word was touched. */
  touch: (at: number) => void;
  help: () => void;
  hear: () => void;
  show: () => void;
  /** The player said it out loud and tapped the tick. */
  approve: () => void;
  /** The player asked for once more. */
  again: () => void;
  skip: () => void;
  /** A thing is read and the player is ready to go on. */
  next: () => void;
  /** Another round, after one is done. */
  another: () => void;
  /** The player closed the screen, with the cross or Escape. */
  close: () => void;
}

/** The screen the player reads on, as the session drives it. */
export interface ReadScreen {
  /** Draws a view. The first view after `open` brings the screen up. */
  show(view: ReadView): void;
  /** Takes the screen away. What it was doing is dropped. */
  close(): void;
}

/**
 * What reading sounds like, apart from the voice. Every sound is made by the game and is safe to
 * ask for when it would not be heard.
 */
export interface ReadingSounds {
  /** The screen comes up. */
  open(): void;
  /** A tile or a word is touched, `at` of `of`: a note on a rising scale. */
  tile(at: number, of: number): void;
  /** A touch of the wrong one. */
  bounce(): void;
  /** The last piece joined the others. */
  join(): void;
  /** The one the player needs began to shine because they asked or kept missing. */
  hint(): void;
  /**
   * A thing was read. `clean` is for one that took no help, and `reads` for a word the player now
   * reads on their own.
   */
  found(clean: boolean, reads: boolean): void;
  /** A stage was cleared, and `chapter` is for the last of its chapter. */
  cleared(chapter: boolean): void;
  /** The round is over, and the player read `read` of its seven. */
  round(read: number): void;
}

/**
 * What the session says aloud. The voice is made of clips that ship with the game, so it is the
 * same on every device.
 */
export interface ReadVoice {
  /** Whether a clip said now would be heard. */
  readonly audible: boolean;
  /**
   * Says the clips one after another and cuts off what was being said. `began` is told as each clip
   * is set to sound: which, how long it is, and how many seconds until it is heard.
   */
  say(clips: readonly ClipId[], began?: (clip: ClipId, seconds: number, delay: number) => void): void;
  stop(): void;
}
