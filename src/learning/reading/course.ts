import { CHAPTERS, STAGE_COUNT, STAGES } from '../../content/reading';
import type { Chapter, Line, ReadWord, Stage } from '../../content/reading/types';
import type { Progress } from '../../shared/learning';
import type { LearnerProfile } from '../../shared/profile';
import { progressOf, sentenceProgress } from '../../shared/profile';
import { READS_FROM } from '../book';

/**
 * Where the player is in the course. None of it is stored: it is read off the words and sentences
 * they have read and the stage a parent started them at, so two copies of their book that are
 * merged agree about it, and a stage that was cleared stays cleared, since every count it is made
 * of only grows.
 */

/**
 * What clears a stage, as shares of what it has. The player has met three quarters of its words,
 * has read three fifths of them without help, and has read half of its sentences. It is not all of
 * them, so that one word they cannot get does not hold them at a stage, and it is not few, so that
 * they have met most of what they will be asked next. `tests/learning/reading/simulation.test.ts`
 * runs children who read well, middling and slowly through the course and fails if any is held
 * longer than these numbers should hold them.
 */
export const CLEAR = { met: 0.75, clean: 0.6, lines: 0.5 } as const;

const need = (count: number, share: number): number => Math.ceil(count * share);

/**
 * The words of a stage that the player is asked: those they sound out, then those they spell by
 * name.
 */
const WORDS_OF: ReadonlyMap<number, readonly ReadWord[]> = new Map(
  STAGES.map((stage) => [stage.n, [...stage.words, ...stage.tricky]]),
);
export const wordsOf = (stage: Stage): readonly ReadWord[] => WORDS_OF.get(stage.n)!;

/** The record of a word the player has read, or nothing. */
export const wordProgress = (profile: LearnerProfile, word: ReadWord): Progress | undefined =>
  progressOf(profile, word.id, 'read');
export const lineProgress = (profile: LearnerProfile, line: Line): Progress | undefined =>
  sentenceProgress(profile, line.id);

/** Whether the player has been through it to the end, helped or not. */
const met = (progress: Progress | undefined): boolean => progress !== undefined && progress.done > 0;
/** Whether the player has read it once with no help at all. */
const clean = (progress: Progress | undefined): boolean => progress !== undefined && progress.clean > 0;

export interface StageState {
  readonly stage: Stage;
  /**
   * Words to read, and how many of them the player has met, read without help, and now reads on
   * their own.
   */
  readonly words: number;
  readonly met: number;
  readonly clean: number;
  readonly reads: number;
  readonly lines: number;
  readonly linesRead: number;
  readonly linesClean: number;
  /**
   * A parent started the player further on, so this stage counts as cleared whatever they have
   * read.
   */
  readonly passed: boolean;
  readonly cleared: boolean;
  /**
   * The player read it to the end themselves, which is what pays its prize: a level a parent
   * started them beyond is cleared and pays nothing until they have read it.
   */
  readonly won: boolean;
  /**
   * Every word read on the player's own and every sentence read without help once. This is the gold
   * star.
   */
  readonly mastered: boolean;
}

export function stageState(profile: LearnerProfile, stage: Stage): StageState {
  const words = wordsOf(stage).map((word) => wordProgress(profile, word));
  const lines = stage.lines.map((line) => lineProgress(profile, line));
  const count = (list: readonly (Progress | undefined)[], test: (p: Progress | undefined) => boolean): number =>
    list.filter(test).length;
  const reads = count(words, (p) => p !== undefined && p.best >= READS_FROM);
  const linesClean = count(lines, clean);
  const passed = stage.n < (profile.floor ?? 1);
  const state = {
    stage,
    words: words.length,
    met: count(words, met),
    clean: count(words, clean),
    reads,
    lines: lines.length,
    linesRead: count(lines, met),
    linesClean,
    passed,
  };
  const won =
    state.met >= need(state.words, CLEAR.met) &&
    state.clean >= need(state.words, CLEAR.clean) &&
    state.linesRead >= need(state.lines, CLEAR.lines);
  return {
    ...state,
    cleared: passed || won,
    won,
    mastered: state.words > 0 && reads === state.words && linesClean === state.lines,
  };
}

/** Every stage as it stands, in order. */
export const courseState = (profile: LearnerProfile): StageState[] => STAGES.map((stage) => stageState(profile, stage));

export interface Totals {
  /**
   * The words the player has met, the words they read on their own, and the sentences they have
   * read.
   */
  readonly words: number;
  readonly reads: number;
  readonly lines: number;
}

/** What the player has read so far, over the whole course. */
export function totals(profile: LearnerProfile): Totals {
  let words = 0;
  let reads = 0;
  let lines = 0;
  for (const state of courseState(profile)) {
    words += state.met;
    reads += state.reads;
    lines += state.linesRead;
  }
  return { words, reads, lines };
}

/** How many words a parent is shown as the ones the player found trickiest. */
export const TRICKIEST_SHOWN = 5;
/**
 * How many times a word has to have needed help before it is called tricky, so that one slip on a
 * word the player has just met says nothing about them.
 */
export const TRICKY_AFTER = 2;

/**
 * The words the player needed help with most often, the one that needed it most first. The help is
 * counted over the times they were through the word to the end, and the wrong touches break a tie,
 * then the word itself so that the same book always gives the same list.
 */
export function trickiest(profile: LearnerProfile, count: number = TRICKIEST_SHOWN): readonly ReadWord[] {
  const rows = STAGES.flatMap((stage) => wordsOf(stage)).flatMap((word) => {
    const progress = wordProgress(profile, word);
    const helped = progress === undefined ? 0 : progress.done - progress.clean;
    return progress !== undefined && helped >= TRICKY_AFTER ? [{ word, helped, slips: progress.slips }] : [];
  });
  rows.sort((a, b) => b.helped - a.helped || b.slips - a.slips || (a.word.id < b.word.id ? -1 : 1));
  return rows.slice(0, count).map((row) => row.word);
}

/**
 * The stage the player is on: the first one that is not cleared, and the last one once all of them
 * are.
 */
export function currentStage(profile: LearnerProfile): number {
  for (const stage of STAGES) if (!stageState(profile, stage).cleared) return stage.n;
  return STAGE_COUNT;
}

/** Whether every stage is cleared. */
export const finished = (profile: LearnerProfile): boolean =>
  STAGES.every((stage) => stageState(profile, stage).cleared);

/** The chapter a stage ends, or nothing for a stage in the middle of one. */
export const chapterEndedBy = (n: number): Chapter | undefined => CHAPTERS.find((chapter) => chapter.to === n);
