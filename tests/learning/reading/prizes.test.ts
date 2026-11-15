import { describe, expect, it } from 'vitest';
import { CHAPTERS, STAGE_COUNT } from '../../../src/content/reading';
import { GEMS, prizeOf, treasureOf } from '../../../src/learning/reading';

describe('what a level pays', () => {
  it('pays three for the first level of a chapter and one more for each after it', () => {
    for (const chapter of CHAPTERS) {
      for (let n = chapter.from; n <= chapter.to; n++) expect(prizeOf(n).count).toBe(3 + n - chapter.from);
    }
  });

  it('is one kind for a whole chapter, the first chapter is diamonds, and the kinds go round', () => {
    expect(prizeOf(1)).toEqual({ gem: 'diamond', count: 3 });
    expect(prizeOf(5)).toEqual({ gem: 'diamond', count: 7 });
    CHAPTERS.forEach((chapter, at) => {
      for (let n = chapter.from; n <= chapter.to; n++) expect(prizeOf(n).gem).toBe(GEMS[at % GEMS.length]);
    });
    expect(new Set(CHAPTERS.map((_, at) => GEMS[at % GEMS.length])).size).toBe(GEMS.length);
  });

  it('pays something for every level of the course', () => {
    for (let n = 1; n <= STAGE_COUNT; n++) expect(prizeOf(n).count).toBeGreaterThanOrEqual(3);
  });
});

describe("the player's treasure", () => {
  it('is empty before the player has won a level', () => {
    expect(treasureOf([])).toEqual([]);
  });

  it('adds up what the levels the player has won paid, a kind at a time, in the order the kinds are told', () => {
    expect(treasureOf([1, 2])).toEqual([{ gem: 'diamond', count: 3 + 4 }]);
    expect(treasureOf([7, 1])).toEqual([
      { gem: 'diamond', count: 3 },
      { gem: 'emerald', count: 4 },
    ]);
  });

  it('is the same whichever order the levels are given in', () => {
    expect(treasureOf([30, 2, 14, 6])).toEqual(treasureOf([2, 6, 14, 30]));
  });
});
