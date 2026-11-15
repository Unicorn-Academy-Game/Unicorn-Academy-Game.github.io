import { describe, expect, it } from 'vitest';
import { CHAPTERS, STAGE_COUNT, STAGES } from '../../../src/content/reading';
import {
  emptyProfile,
  type LearnerProfile,
  progressOf,
  READS_FROM,
  sentenceProgress,
  withProgress,
  withSentence,
} from '../../../src/learning';
import { CLEAR, finishItem, lineItem, stageState, wordItem, wordsOf } from '../../../src/learning/reading';
import { CLEAN, DAY, HOUR, MINUTE, progress, T0 } from '../helpers';

const stage1 = STAGES[0]!;
const word = (n: number, at = 0) => wordItem(wordsOf(STAGES[n - 1]!)[at]!, undefined);
const line = (n: number, at = 0) => lineItem(STAGES[n - 1]!.lines[at]!, undefined);

describe('finishing one read', () => {
  it('keeps a word the player read in their book as read, at the level its read earned, and says it was the first time', () => {
    const item = word(1);
    const { profile, reward } = finishItem(emptyProfile(), item, CLEAN, T0);
    const kept = progressOf(profile, item.word.id, 'read');
    expect(kept).toMatchObject({
      level: 1,
      best: 1,
      done: 1,
      clean: 1,
      slips: 0,
      first: T0,
      last: T0,
      due: T0 + 10 * MINUTE,
    });
    expect(reward).toMatchObject({
      fresh: true,
      clean: true,
      level: { before: 0, after: 1 },
      reads: false,
      cleared: null,
      chapter: null,
      everything: false,
    });
    expect(profile.schemaVersion, 'a word read is version 2').toBe(2);
  });

  it('keeps a sentence the player read in the book of sentences, which makes the book version 3', () => {
    const item = line(1);
    const { profile, reward } = finishItem(emptyProfile(), item, CLEAN, T0);
    expect(sentenceProgress(profile, item.line.id)).toMatchObject({ level: 1, done: 1, clean: 1 });
    expect(Object.keys(profile.words)).toEqual([]);
    expect(profile.schemaVersion).toBe(3);
    expect(reward).toMatchObject({ fresh: true, clean: true, reads: false });
  });

  it('counts a read that needed help as one through to the end that was not clean, and brings it back soon', () => {
    const { profile, reward } = finishItem(emptyProfile(), word(1), { slips: 1, hints: 1 }, T0);
    const kept = progressOf(profile, word(1).word.id, 'read')!;
    expect(kept).toMatchObject({ level: 0, done: 1, clean: 0, slips: 1, due: T0 });
    expect(reward).toMatchObject({ fresh: true, clean: false, level: { before: 0, after: 0 } });
  });

  it('says a word whose record was never finished is new, the same as one with no record', () => {
    const id = word(1).word.id;
    const empty = withProgress(emptyProfile(), id, 'read', progress({ done: 0, clean: 0, level: 0, best: 0 }));
    expect(finishItem(empty, word(1), CLEAN, T0).reward.fresh).toBe(true);
    const finished = withProgress(emptyProfile(), id, 'read', progress({ done: 1 }));
    expect(finishItem(finished, { ...word(1), review: true }, CLEAN, T0 + DAY).reward.fresh).toBe(false);
  });

  it('counts a few slips of a small finger as clean, and many as not, by the level the word is at', () => {
    expect(finishItem(emptyProfile(), word(1), { slips: 2, hints: 0 }, T0).reward.clean).toBe(true);
    expect(finishItem(emptyProfile(), word(1), { slips: 3, hints: 0 }, T0).reward.clean).toBe(false);
  });

  it("is not the first time the second time, and moves a word up a level for each clean read, so the third is the one that reads it on the player's own", () => {
    const item = word(1);
    const first = finishItem(emptyProfile(), item, CLEAN, T0);
    expect(first.reward).toMatchObject({ fresh: true, level: { before: 0, after: 1 }, reads: false });
    const second = finishItem(first.profile, { ...item, level: 1, review: true }, CLEAN, T0 + HOUR);
    expect(second.reward).toMatchObject({ fresh: false, level: { before: 1, after: 2 }, reads: false });
    const third = finishItem(second.profile, { ...item, level: 2, review: true }, CLEAN, T0 + DAY);
    expect(third.reward).toMatchObject({ fresh: false, level: { before: 2, after: READS_FROM }, reads: true });
  });

  it("says a word is read on the player's own once, when it climbs to the level that says so, and not again", () => {
    const id = wordsOf(stage1)[0]!.id;
    const near = withProgress(
      emptyProfile(),
      id,
      'read',
      progress({ level: READS_FROM - 1, best: READS_FROM - 1, done: 3, clean: 3 }),
    );
    const item = { ...word(1), level: READS_FROM - 1, review: true };
    const up = finishItem(near, item, CLEAN, T0 + DAY);
    expect(up.reward).toMatchObject({ reads: true, level: { before: READS_FROM - 1, after: READS_FROM } });
    const next = finishItem(up.profile, { ...item, level: READS_FROM }, CLEAN, T0 + 2 * DAY);
    expect(next.reward.reads).toBe(false);
    const sentence = finishItem(emptyProfile(), line(1), CLEAN, T0);
    expect(sentence.reward.reads, 'only words are read on their own in this sense').toBe(false);
  });

  it('is told of the stage it finishes off, and only the one read that clears it', () => {
    const w = wordsOf(stage1).length;
    const needMet = Math.ceil(w * CLEAR.met);
    const needLines = Math.ceil(stage1.lines.length * CLEAR.lines);
    let book: LearnerProfile = emptyProfile();
    wordsOf(stage1).forEach((item, i) => {
      if (i < needMet - 1) book = withProgress(book, item.id, 'read', progress({ done: 1, clean: 1 }));
    });
    stage1.lines.forEach((item, i) => {
      if (i < needLines) book = withSentence(book, item.id, progress({ done: 1, clean: 1 }));
    });
    expect(stageState(book, stage1).cleared).toBe(false);
    const last = finishItem(book, wordItem(wordsOf(stage1)[needMet - 1]!, undefined), CLEAN, T0);
    expect(last.reward.cleared).toBe(1);
    expect(stageState(last.profile, stage1).cleared).toBe(true);
    const after = finishItem(last.profile, wordItem(wordsOf(stage1)[needMet]!, undefined), CLEAN, T0 + MINUTE);
    expect(after.reward.cleared, 'a stage that was cleared is not cleared a second time').toBeNull();
  });

  it('is told of the chapter a stage ends, and of the whole course at the last stage', () => {
    for (const chapter of [CHAPTERS[0]!, CHAPTERS[CHAPTERS.length - 1]!]) {
      const stage = STAGES[chapter.to - 1]!;
      let book: LearnerProfile = emptyProfile();
      const all = wordsOf(stage);
      const needMet = Math.ceil(all.length * CLEAR.met);
      all.forEach((item, i) => {
        if (i < needMet - 1) book = withProgress(book, item.id, 'read', progress({ done: 1, clean: 1 }));
      });
      stage.lines.forEach((item, i) => {
        if (i < Math.ceil(stage.lines.length * CLEAR.lines))
          book = withSentence(book, item.id, progress({ done: 1, clean: 1 }));
      });
      const done = finishItem(book, wordItem(all[needMet - 1]!, undefined), CLEAN, T0).reward;
      expect(done.cleared, `stage ${chapter.to}`).toBe(chapter.to);
      expect(done.chapter?.id).toBe(chapter.id);
      expect(done.everything).toBe(chapter.to === STAGE_COUNT);
    }
  });

  it('is not told of a chapter when a stage in the middle of one is cleared', () => {
    const stage = STAGES[1]!;
    let book: LearnerProfile = emptyProfile();
    const all = wordsOf(stage);
    const needMet = Math.ceil(all.length * CLEAR.met);
    all.forEach((item, i) => {
      if (i < needMet - 1) book = withProgress(book, item.id, 'read', progress({ done: 1, clean: 1 }));
    });
    stage.lines.forEach((item, i) => {
      if (i < Math.ceil(stage.lines.length * CLEAR.lines))
        book = withSentence(book, item.id, progress({ done: 1, clean: 1 }));
    });
    const done = finishItem(book, wordItem(all[needMet - 1]!, undefined), CLEAN, T0).reward;
    expect(done).toMatchObject({ cleared: 2, chapter: null, everything: false });
  });

  describe('a sentence read without help', () => {
    /** The little words a and I are not words of the course, so they are not read as words. */
    const real = (words: readonly string[]): string[] => words.filter((id) => id !== 'a' && id !== 'i');
    /**
     * A sentence that has a word in it twice, in the first stage that has one, which has the words
     * that a stage is cleared by.
     */
    const host = STAGES.find((stage) =>
      stage.lines.some((l) => new Set(real(l.words)).size < real(l.words).length && new Set(real(l.words)).size >= 3),
    )!;
    const sentence = host.lines.find(
      (l) => new Set(real(l.words)).size < real(l.words).length && new Set(real(l.words)).size >= 3,
    )!;
    const distinct = [...new Set(real(sentence.words))];

    it('is a clean read of each word in it that the player has met, once for each, and leaves the words they have not met alone', () => {
      const [first, second] = distinct;
      let book: LearnerProfile = emptyProfile();
      for (const id of [first!, second!])
        book = withProgress(book, id, 'read', progress({ level: 1, best: 1, done: 1, clean: 1, due: T0 }));
      const { profile } = finishItem(book, lineItem(sentence, undefined), CLEAN, T0 + HOUR);
      for (const id of [first!, second!])
        expect(progressOf(profile, id, 'read'), id).toMatchObject({ done: 2, clean: 2, last: T0 + HOUR });
      for (const id of distinct.slice(2)) expect(progressOf(profile, id, 'read'), `${id} was not met`).toBeUndefined();
    });

    it('counts a word that comes twice in it once, and moves it up the levels the way a read of the word would', () => {
      const twice = [...new Set(sentence.words.filter((id, at) => sentence.words.indexOf(id) !== at))][0];
      if (twice === undefined) return;
      const book = withProgress(
        emptyProfile(),
        twice,
        'read',
        progress({ level: 2, best: 2, streak: 0, done: 4, clean: 4, due: T0 }),
      );
      const { profile } = finishItem(book, lineItem(sentence, undefined), CLEAN, T0);
      expect(progressOf(profile, twice, 'read'), 'one step up, though it is in the sentence twice').toMatchObject({
        level: 3,
        best: 3,
        done: 5,
        clean: 5,
      });
    });

    it('gives its words nothing when it needed help, and nothing is taken from them either', () => {
      const id = distinct[0]!;
      const book = withProgress(
        emptyProfile(),
        id,
        'read',
        progress({ level: 1, best: 1, done: 1, clean: 1, due: T0 }),
      );
      const { profile, reward } = finishItem(book, lineItem(sentence, undefined), { slips: 0, hints: 1 }, T0 + HOUR);
      expect(reward.clean).toBe(false);
      expect(progressOf(profile, id, 'read')).toEqual(progressOf(book, id, 'read'));
    });

    it('can clear the stage, by the one word it made clean that the stage was waiting for', () => {
      const all = wordsOf(host);
      const needMet = Math.ceil(all.length * CLEAR.met);
      const needClean = Math.ceil(all.length * CLEAR.clean);
      const needLines = Math.ceil(host.lines.length * CLEAR.lines);
      const own = new Set(all.map((w) => w.id));
      const ofHost = distinct.filter((id) => own.has(id));
      const target = ofHost[0]!;
      // The words met are the sentence's, then the others, and all but enough of them were read
      // with help.
      const met = [...new Set([...ofHost, ...all.map((w) => w.id)])].slice(0, Math.max(needMet, ofHost.length));
      let book: LearnerProfile = emptyProfile();
      let cleanSoFar = 0;
      for (const id of met) {
        const isClean = id !== target && cleanSoFar < needClean - 1;
        if (isClean) cleanSoFar += 1;
        book = withProgress(
          book,
          id,
          'read',
          progress({ done: 1, clean: isClean ? 1 : 0, level: isClean ? 1 : 0, best: isClean ? 1 : 0, due: T0 }),
        );
      }
      host.lines
        .filter((l) => l.id !== sentence.id)
        .slice(0, needLines - 1)
        .forEach((l) => {
          book = withSentence(book, l.id, progress({ done: 1, clean: 1 }));
        });
      expect(cleanSoFar).toBe(needClean - 1);
      expect(stageState(book, host)).toMatchObject({ cleared: false, clean: needClean - 1 });
      const done = finishItem(book, lineItem(sentence, undefined), CLEAN, T0 + HOUR);
      expect(done.reward.cleared).toBe(host.n);
      expect(stageState(done.profile, host).cleared).toBe(true);
    });
  });

  it('changes nothing in the book it was given', () => {
    const book = emptyProfile();
    const before = JSON.stringify(book);
    finishItem(book, word(1), CLEAN, T0);
    finishItem(book, line(1), CLEAN, T0);
    expect(JSON.stringify(book)).toBe(before);
  });
});
