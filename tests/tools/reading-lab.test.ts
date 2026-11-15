import { describe, expect, it } from 'vitest';
import { readLine, readWord, STAGES } from '../../src/content/reading';
import { piecesOf } from '../../src/game/reading-views';
import { lineItem, wordItem, wordsOf } from '../../src/learning/reading';
import { itemView, LONGEST } from '../../tools/lab/reading-views';

/**
 * The lab puts the longest things in the course on the screen at every size, and that is only worth
 * anything while they are the longest. So the names it has for them are held to the course here,
 * and a word or a sentence that is added and is longer makes this fail until the lab is told.
 */

const WORDS = [...new Map(STAGES.flatMap((stage) => wordsOf(stage)).map((word) => [word.id, word])).values()];
const LINES = STAGES.flatMap((stage) => stage.lines);
const piecesIn = (id: string): number => piecesOf(wordItem(readWord(id)!, undefined)).length;

describe('the longest things the lab looks at', () => {
  it('has the word with the most letters, and it has a gap in it', () => {
    expect(LONGEST.word.length).toBe(Math.max(...WORDS.map((word) => word.id.length)));
    expect(piecesOf(wordItem(readWord(LONGEST.word)!, undefined)).some((piece) => piece.gap)).toBe(true);
  });

  it('has the word with the most pieces to touch', () => {
    expect(piecesIn(LONGEST.manyTiles)).toBe(Math.max(...WORDS.map((word) => piecesIn(word.id))));
  });

  it('has the longest sentence, the sentence with the longest word in it, and the shortest sentence', () => {
    expect(readLine(LONGEST.line)!.text.length).toBe(Math.max(...LINES.map((line) => line.text.length)));
    expect(Math.max(...readLine(LONGEST.wordLine)!.words.map((word) => word.length))).toBe(
      Math.max(...LINES.flatMap((line) => line.words.map((word) => word.length))),
    );
    expect(readLine(LONGEST.shortLine)!.text.length).toBe(Math.min(...LINES.map((line) => line.text.length)));
  });

  it('makes a view of each of them with the pieces of it to touch', () => {
    expect(itemView({ word: LONGEST.manyTiles }).pieces).toHaveLength(piecesIn(LONGEST.manyTiles));
    expect(itemView({ line: LONGEST.line }).pieces).toHaveLength(readLine(LONGEST.line)!.text.split(' ').length);
    expect(piecesOf(lineItem(readLine(LONGEST.shortLine)!, undefined)).length).toBeGreaterThan(0);
  });
});
