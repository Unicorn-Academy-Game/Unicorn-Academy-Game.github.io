import { describe, expect, it } from 'vitest';
import { CHAPTERS, STAGE_COUNT, STAGES } from '../../../src/content/reading';
import {
  emptyProfile,
  type LearnerProfile,
  mergeProfiles,
  READS_FROM,
  raiseFloor,
  withProgress,
  withSentence,
} from '../../../src/learning';
import {
  CLEAR,
  chapterEndedBy,
  courseState,
  currentStage,
  finished,
  stageState,
  TRICKIEST_SHOWN,
  TRICKY_AFTER,
  totals,
  trickiest,
  wordsOf,
} from '../../../src/learning/reading';
import { progress } from '../helpers';

/** The stage with some of its words and sentences read, as the patches say. */
function readSome(
  start: LearnerProfile,
  n: number,
  counts: { met: number; clean: number; lines: number },
  patch: { word?: Partial<ReturnType<typeof progress>>; line?: Partial<ReturnType<typeof progress>> } = {},
): LearnerProfile {
  const stage = STAGES[n - 1]!;
  let book = start;
  wordsOf(stage).forEach((word, i) => {
    if (i >= counts.met) return;
    book = withProgress(book, word.id, 'read', progress({ done: 1, clean: i < counts.clean ? 1 : 0, ...patch.word }));
  });
  stage.lines.forEach((line, i) => {
    if (i < counts.lines) book = withSentence(book, line.id, progress({ done: 1, clean: 1, ...patch.line }));
  });
  return book;
}

const share = (count: number, of: number): number => Math.ceil(count * of);

/** What a stage asks, to the word and to the sentence. */
function clearing(n: number): { met: number; clean: number; lines: number } {
  const stage = STAGES[n - 1]!;
  const w = wordsOf(stage).length;
  return { met: share(w, CLEAR.met), clean: share(w, CLEAR.clean), lines: share(stage.lines.length, CLEAR.lines) };
}

describe('where the player is in the course', () => {
  const first = STAGES[0]!;
  const words = wordsOf(first).length;
  const lines = first.lines.length;
  const exactly = clearing(1);

  it('starts at the first stage with nothing read, and nothing cleared', () => {
    const book = emptyProfile();
    expect(currentStage(book)).toBe(1);
    expect(finished(book)).toBe(false);
    for (const state of courseState(book))
      expect(state).toMatchObject({
        met: 0,
        clean: 0,
        reads: 0,
        linesRead: 0,
        linesClean: 0,
        passed: false,
        cleared: false,
        mastered: false,
      });
    expect(stageState(book, first).words).toBe(words);
    expect(stageState(book, first).lines).toBe(lines);
  });

  it('counts the words the player sounds out and the words they spell by name, and the sentences, of a stage', () => {
    for (const stage of STAGES) {
      const state = stageState(emptyProfile(), stage);
      expect(state.words).toBe(stage.words.length + stage.tricky.length);
      expect(state.lines).toBe(stage.lines.length);
    }
  });

  it('clears a stage at exactly what it asks, in all three, and not one short in any', () => {
    const book = readSome(emptyProfile(), 1, exactly);
    expect(stageState(book, first).cleared).toBe(true);
    expect(currentStage(book)).toBe(2);
    expect(
      stageState(readSome(emptyProfile(), 1, { ...exactly, met: exactly.met - 1, clean: exactly.met - 1 }), first)
        .cleared,
      'one word fewer met',
    ).toBe(false);
    expect(
      stageState(readSome(emptyProfile(), 1, { ...exactly, clean: exactly.clean - 1 }), first).cleared,
      'one word fewer read without help',
    ).toBe(false);
    expect(
      stageState(readSome(emptyProfile(), 1, { ...exactly, lines: exactly.lines - 1 }), first).cleared,
      'one sentence fewer',
    ).toBe(false);
  });

  it('counts a word that was told to the player as met and not as read without help', () => {
    const book = readSome(emptyProfile(), 1, { met: words, clean: 0, lines });
    const state = stageState(book, first);
    expect(state.met).toBe(words);
    expect(state.clean).toBe(0);
    expect(state.cleared).toBe(false);
  });

  it('is on the first stage that is not cleared, whatever is read beyond it, and stays there until it is', () => {
    let book = readSome(emptyProfile(), 3, clearing(3));
    expect(currentStage(book)).toBe(1);
    book = readSome(book, 1, clearing(1));
    expect(currentStage(book), 'stage 2 is still to be done').toBe(2);
    book = readSome(book, 2, clearing(2));
    expect(currentStage(book), 'and stage 3 was done already').toBe(4);
  });

  it('is on the last stage once all are cleared, and says it is finished', () => {
    let book = emptyProfile();
    for (const stage of STAGES) {
      const w = wordsOf(stage).length;
      book = readSome(book, stage.n, { met: w, clean: w, lines: stage.lines.length });
    }
    expect(currentStage(book)).toBe(STAGE_COUNT);
    expect(finished(book)).toBe(true);
    expect(courseState(book).every((state) => state.cleared)).toBe(true);
  });

  it('counts the stages under a floor as cleared, and starts the player at the floor', () => {
    const book = raiseFloor(emptyProfile(), 5);
    expect(currentStage(book)).toBe(5);
    const states = courseState(book);
    expect(states.slice(0, 4).every((state) => state.passed && state.cleared)).toBe(true);
    expect(states[4]).toMatchObject({ passed: false, cleared: false });
    expect(
      states.slice(0, 4).every((state) => !state.mastered),
      'a stage a parent passed has no gold star, since the player has not read it',
    ).toBe(true);
  });

  it("keeps a stage cleared when more is read, and when two copies of the player's book are put together", () => {
    const one = readSome(emptyProfile(), 1, exactly);
    const other = raiseFloor(readSome(emptyProfile(), 2, { met: 1, clean: 1, lines: 0 }), 2);
    for (const merged of [mergeProfiles(one, other), mergeProfiles(other, one)]) {
      expect(stageState(merged, first).cleared).toBe(true);
      expect(currentStage(merged)).toBeGreaterThanOrEqual(2);
    }
    const more = readSome(one, 1, { met: words, clean: words, lines });
    expect(stageState(more, first).cleared).toBe(true);
  });

  it("has a gold star when every word is read on the player's own and every sentence has been read without help", () => {
    const stage = STAGES[1]!;
    const w = wordsOf(stage).length;
    const full = readSome(
      emptyProfile(),
      2,
      { met: w, clean: w, lines: stage.lines.length },
      { word: { level: READS_FROM, best: READS_FROM } },
    );
    expect(stageState(full, stage).mastered).toBe(true);
    const short = readSome(
      emptyProfile(),
      2,
      { met: w, clean: w, lines: stage.lines.length - 1 },
      { word: { level: READS_FROM, best: READS_FROM } },
    );
    expect(stageState(short, stage).mastered, 'one sentence missing').toBe(false);
    const low = readSome(
      emptyProfile(),
      2,
      { met: w, clean: w, lines: stage.lines.length },
      { word: { level: READS_FROM - 1, best: READS_FROM - 1 } },
    );
    expect(stageState(low, stage).mastered, 'words that are not yet read on their own').toBe(false);
    expect(stageState(low, stage).cleared, 'but the stage is cleared').toBe(true);
  });

  it('knows which stage ends which chapter', () => {
    for (const chapter of CHAPTERS) expect(chapterEndedBy(chapter.to)).toBe(chapter);
    expect(chapterEndedBy(1)).toBeUndefined();
    expect(chapterEndedBy(CHAPTERS[0]!.to - 1)).toBeUndefined();
    expect(chapterEndedBy(STAGE_COUNT)?.id).toBe('unicorn');
  });
});

describe('what the player has read so far, over the course', () => {
  it('is nothing for an empty book, and adds up what each stage holds', () => {
    expect(totals(emptyProfile())).toEqual({ words: 0, reads: 0, lines: 0 });
    let book = readSome(
      emptyProfile(),
      1,
      { met: 5, clean: 5, lines: 2 },
      { word: { level: READS_FROM, best: READS_FROM } },
    );
    // Three more words read without help, which are not yet words the player reads on their own.
    book = readSome(book, 2, { met: 3, clean: 3, lines: 1 });
    expect(totals(book)).toEqual({ words: 8, reads: 5, lines: 3 });
  });

  it('does not count a stage that a parent passed, which the player has not read', () => {
    expect(totals(raiseFloor(emptyProfile(), 10))).toEqual({ words: 0, reads: 0, lines: 0 });
  });
});

describe('the words the player found trickiest, for a parent', () => {
  // The first stage with enough words to leave some out of a list of five.
  const some = wordsOf(STAGES.find((stage) => wordsOf(stage).length >= 9)!);
  /**
   * A book in which each word has been through to the end `done` times, `clean` of them with no
   * help, and with `slips` wrong touches.
   */
  const needing = (rows: readonly (readonly [number, number, number, number?])[]): LearnerProfile =>
    rows.reduce(
      (book, [at, done, clean, slips = 0]) =>
        withProgress(book, some[at]!.id, 'read', progress({ done, clean, slips })),
      emptyProfile(),
    );
  const ids = (book: LearnerProfile, count?: number): string[] => trickiest(book, count).map((word) => word.id);

  it('is empty for a book with nothing read, and for words that never needed help', () => {
    expect(trickiest(emptyProfile())).toEqual([]);
    expect(
      trickiest(
        needing([
          [0, 6, 6],
          [1, 1, 1],
        ]),
      ),
    ).toEqual([]);
  });

  it('names a word only once it has needed help twice, so one slip on a word the player has just met says nothing', () => {
    expect(TRICKY_AFTER).toBe(2);
    expect(ids(needing([[0, 1, 0]])), 'one time it needed help').toEqual([]);
    expect(ids(needing([[0, 2, 0]])), 'two times').toEqual([some[0]!.id]);
    expect(ids(needing([[0, 5, 3]])), 'two of five, though the player got the rest right').toEqual([some[0]!.id]);
    expect(ids(needing([[0, 5, 4]])), 'one of five').toEqual([]);
  });

  it('puts the word that needed help most often first, then the one with more wrong touches, then the one that comes first in the alphabet', () => {
    const book = needing([
      [0, 4, 1, 0],
      [1, 6, 2, 1],
      [2, 5, 1, 7],
      [3, 5, 1, 2],
    ]);
    // Helped 3, 4, 4 and 4 times. The three that needed it four times are ordered by their wrong
    // touches, 7, 2 and 1, and the one that needed it three times is last.
    expect(ids(book)).toEqual([some[2]!.id, some[3]!.id, some[1]!.id, some[0]!.id]);
    // Two that tie in everything, where the one that is later in the course is earlier in the
    // alphabet, so the alphabet and not the course decides.
    const first = some.findIndex((word, at) => some.slice(at + 1).some((other) => other.id < word.id));
    const second = some.findIndex((other, at) => at > first && other.id < some[first]!.id);
    expect(first, 'the stage has words that are not in the order of the alphabet').toBeGreaterThanOrEqual(0);
    expect(
      ids(
        needing([
          [first, 4, 1, 3],
          [second, 4, 1, 3],
        ]),
      ),
    ).toEqual([some[second]!.id, some[first]!.id]);
  });

  it('shows no more than it is asked for, five by default, and the same list for the same book', () => {
    const many = needing(some.slice(0, 8).map((_, at) => [at, 4, 1, at] as const));
    expect(TRICKIEST_SHOWN).toBe(5);
    expect(trickiest(many)).toHaveLength(5);
    expect(ids(many, 2)).toHaveLength(2);
    expect(ids(many, 0)).toEqual([]);
    expect(ids(many)).toEqual(ids(many));
    // The ones left out are the ones that needed the least: here the wrong touches were the only
    // difference.
    expect(ids(many)).toEqual([7, 6, 5, 4, 3].map((at) => some[at]!.id));
  });

  it('looks at every stage, and at the words the player spells by name as well as the ones they sound out', () => {
    const later = STAGES.find((stage) => stage.n > 10 && stage.tricky.length > 0)!;
    const word = later.tricky[0]!;
    const book = withProgress(emptyProfile(), word.id, 'read', progress({ done: 3, clean: 0 }));
    expect(trickiest(book).map((w) => w.id)).toEqual([word.id]);
  });
});
