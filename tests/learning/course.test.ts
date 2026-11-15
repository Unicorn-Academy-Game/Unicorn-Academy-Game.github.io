import { describe, expect, it } from 'vitest';
import {
  CHAPTERS,
  chapterAt,
  READ_LINES,
  READ_WORDS,
  readLine,
  readWord,
  STAGE_COUNT,
  STAGES,
  stageAt,
} from '../../src/content/reading';
import { COURSE_LIMITS, chapterDifficulties, checkCourse, countCourse } from '../../src/content/reading/check';
import { isSoundId } from '../../src/content/reading/sounds';

describe('the reading course as it ships', () => {
  it('has nothing wrong with it', () => {
    expect(checkCourse(STAGES, CHAPTERS)).toEqual([]);
  });

  it('is eighty-five stages in thirteen chapters that follow one another with nothing left over', () => {
    expect(STAGE_COUNT).toBe(85);
    expect(CHAPTERS.map((chapter) => chapter.id)).toEqual([
      'tiny',
      'meadow',
      'farm',
      'pond',
      'beach',
      'forest',
      'treehouse',
      'palace',
      'garden',
      'sky',
      'stars',
      'rainbow',
      'unicorn',
    ]);
    expect(CHAPTERS[0]!.from).toBe(1);
    CHAPTERS.slice(1).forEach((chapter, i) => {
      expect(chapter.from).toBe(CHAPTERS[i]!.to + 1);
    });
    expect(CHAPTERS[CHAPTERS.length - 1]!.to).toBe(STAGE_COUNT);
    STAGES.forEach((stage, i) => {
      expect(stage.n).toBe(i + 1);
      expect(stage.chapter).toBe(chapterAt(stage.n).id);
    });
  });

  it('is a lot of content, well past what the checks ask for', () => {
    const counts = countCourse(STAGES);
    expect(counts.stages).toBeGreaterThanOrEqual(80);
    expect(counts.words).toBeGreaterThanOrEqual(800);
    expect(counts.tricky).toBeGreaterThanOrEqual(60);
    expect(counts.lines).toBeGreaterThanOrEqual(350);
    expect(counts.kinds).toBeGreaterThanOrEqual(80);
    expect(counts.words).toBeGreaterThan(COURSE_LIMITS.minWords);
    expect(counts.longestWord).toBeLessThanOrEqual(COURSE_LIMITS.maxTiles);
  });

  it('gets harder with every chapter, give or take the luck of a few stages, and the last is at least twice the first', () => {
    const hardness = chapterDifficulties(STAGES, CHAPTERS);
    hardness.forEach((value, i) => {
      if (i > 0)
        expect(value, `${CHAPTERS[i]!.id} against ${CHAPTERS[i - 1]!.id}`).toBeGreaterThanOrEqual(
          hardness[i - 1]! - COURSE_LIMITS.slack,
        );
    });
    for (let i = 2; i < hardness.length; i++)
      expect(hardness[i]!, `${CHAPTERS[i]!.id} against ${CHAPTERS[i - 2]!.id}`).toBeGreaterThan(hardness[i - 2]!);
    expect(hardness[hardness.length - 1]!).toBeGreaterThanOrEqual(2 * hardness[0]!);
  });

  it('puts the sentences of every stage in order, shortest first', () => {
    for (const stage of STAGES) {
      const lengths = stage.lines.map((line) => line.words.length);
      expect(lengths, `stage ${stage.n}`).toEqual([...lengths].sort((a, b) => a - b));
    }
  });

  it('finds every word and sentence by its name, in the stage that asks for it', () => {
    for (const stage of STAGES) {
      for (const word of [...stage.words, ...stage.tricky]) expect(readWord(word.id)).toBe(word);
      for (const line of stage.lines) expect(readLine(line.id)).toBe(line);
    }
    expect(READ_WORDS.length).toBe(countCourse(STAGES).words + countCourse(STAGES).tricky);
    expect(READ_LINES.length).toBe(countCourse(STAGES).lines);
    expect(readWord('zzz')).toBeUndefined();
    expect(readLine('a-b-c')).toBeUndefined();
  });

  it('hands out the stage of a number, and refuses a number that is not a stage', () => {
    expect(stageAt(1).title).toBe('A Cat in a Hat');
    expect(stageAt(STAGE_COUNT).chapter).toBe('unicorn');
    expect(() => stageAt(0)).toThrow(RangeError);
    expect(() => stageAt(STAGE_COUNT + 1)).toThrow('there is no reading stage');
    expect(() => chapterAt(0)).toThrow('is in no chapter');
  });

  it('begins with a few single words that make a sentence at once, and never asks for the little word a on its own', () => {
    const first = stageAt(1);
    expect(first.words.map((word) => word.id)).toEqual(['cat', 'hat', 'mat', 'sat', 'in', 'it']);
    expect(first.words.every((word) => word.tiles.length <= 3)).toBe(true);
    expect(first.lines.map((line) => line.text)).toContain('A cat in a hat.');
    expect(first.lines[0]!.words.length).toBeLessThanOrEqual(3);
    expect(READ_WORDS.map((word) => word.id)).not.toContain('a');
    expect(READ_WORDS.map((word) => word.id)).not.toContain('i');
  });

  it('is made of small stages, so that a round or two clears one, and each has a round of things to read', () => {
    for (const stage of STAGES) {
      expect(stage.words.length + stage.tricky.length, `stage ${stage.n} words`).toBeLessThanOrEqual(40);
      expect(stage.words.length + stage.lines.length, `stage ${stage.n} things`).toBeGreaterThanOrEqual(8);
    }
    expect(STAGES.slice(0, 5).every((stage) => stage.words.length <= 6)).toBe(true);
  });

  it('gives every sounded tile a sound and every tricky tile a letter name, so nothing is touched that cannot be heard', () => {
    for (const word of READ_WORDS) {
      for (const tile of word.tiles) {
        if (word.tricky) expect(tile.name, word.id).toBe(true);
        else if (tile.sound !== null) expect(isSoundId(tile.sound), `${word.id} ${tile.letters}`).toBe(true);
      }
    }
  });

  it('never shows the same sentence twice', () => {
    const ids = READ_LINES.map((line) => line.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
