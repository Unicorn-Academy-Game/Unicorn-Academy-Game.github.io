import type { Line, ReadWord } from '../../content/reading/types';
import type { Progress } from '../../shared/learning';
import { type LearnerProfile, withProgress, withSentence } from '../../shared/profile';
import { lineProgress, wordProgress } from './course';

/**
 * A word to read, and how well the player knows it, so that a card that is made for it starts at
 * the right level.
 */
export interface WordItem {
  readonly kind: 'word';
  readonly word: ReadWord;
  readonly level: number;
  /** The player has read it before, so this is a review and not the first time. */
  readonly review: boolean;
}

/** A sentence to read. */
export interface LineItem {
  readonly kind: 'line';
  readonly line: Line;
  readonly level: number;
  readonly review: boolean;
}

/** Something for the player to read: a word, or a sentence. */
export type ReadItem = WordItem | LineItem;

export const wordItem = (word: ReadWord, progress: Progress | undefined): WordItem => ({
  kind: 'word',
  word,
  level: progress?.level ?? 0,
  review: progress !== undefined && progress.done > 0,
});
export const lineItem = (line: Line, progress: Progress | undefined): LineItem => ({
  kind: 'line',
  line,
  level: progress?.level ?? 0,
  review: progress !== undefined && progress.done > 0,
});

/**
 * The word as the player reads it, or the sentence as it is written, and what names it in a saved
 * book and in the voice's clips.
 */
export const idOf = (item: ReadItem): string => (item.kind === 'word' ? item.word.id : item.line.id);
export const stageOf = (item: ReadItem): number => (item.kind === 'word' ? item.word.stage : item.line.stage);

/** How many touches it takes to read it: its tiles, or its words. */
export const touchesOf = (item: ReadItem): number =>
  item.kind === 'word' ? item.word.tiles.length : item.line.words.length;

/** What the player's book holds about it. */
export const progressOfItem = (profile: LearnerProfile, item: ReadItem): Progress | undefined =>
  item.kind === 'word' ? wordProgress(profile, item.word) : lineProgress(profile, item.line);

/** The player's book with what they have read of it set to `progress`. */
export const withItem = (profile: LearnerProfile, item: ReadItem, progress: Progress): LearnerProfile =>
  item.kind === 'word'
    ? withProgress(profile, item.word.id, 'read', progress)
    : withSentence(profile, item.line.id, progress);

/**
 * The same thing, for telling whether two are one. A word and a sentence are never one, whatever
 * they are called.
 */
export const keyOf = (item: ReadItem): string => `${item.kind}:${idOf(item)}`;
