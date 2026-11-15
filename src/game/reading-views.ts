import type { Stage } from '../content/reading/types';
import { prizeOf, type ReadItem, type StageState } from '../learning/reading';
import type { Piece, StageView } from './reading-ports';

/**
 * The parts of a view that are worked out from the course alone, so the session and the tools that
 * look at the screen make them the same way.
 */

/** The words of a sentence as they are written, for the pieces the player touches. */
export const wordsOfLine = (text: string): string[] => text.split(' ');

/** What the player touches for a thing to read: the tiles of a word, or the words of a sentence. */
export function piecesOf(item: ReadItem): Piece[] {
  if (item.kind === 'line')
    return wordsOfLine(item.line.text).map((text) => ({ text, silent: false, split: null, gap: false }));
  return item.word.tiles.map((tile) => ({
    text: tile.letters,
    silent: tile.sound === null && !tile.name,
    split: tile.split ?? null,
    gap: tile.gap === true,
  }));
}

/** A few words of a stage, to show what is in it. */
const samplesOf = (stage: Stage): string[] =>
  (stage.words.length > 0 ? stage.words : stage.tricky).slice(0, 3).map((word) => word.id);

/** A stage as the map shows it: what it is called, what is in it, and how it stands. */
export function stageView(state: StageState, current: number): StageView {
  const { stage } = state;
  const mark = state.cleared ? (state.mastered ? 'mastered' : 'cleared') : stage.n === current ? 'current' : 'open';
  return {
    n: stage.n,
    title: stage.title,
    chapter: stage.chapter,
    samples: samplesOf(stage),
    mark,
    met: state.met,
    words: state.words,
    prize: prizeOf(stage.n),
    won: state.won,
  };
}
