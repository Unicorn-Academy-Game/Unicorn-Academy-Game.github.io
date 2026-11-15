import { describe, expect, it } from 'vitest';
import { STAGES } from '../../../src/content/reading';
import { emptyProfile, type LearnerProfile, raiseFloor, withProgress, withSentence } from '../../../src/learning';
import {
  currentStage,
  idOf,
  keyOf,
  PACE_AFTER,
  PACES,
  paceOf,
  planRound,
  type ReadItem,
  ROUND_SIZE,
  SENTENCES,
  SLOW_SHARE,
  stageOf,
  stageState,
  UNLOCK,
  wordsOf,
} from '../../../src/learning/reading';
import { DAY, HOUR, progress, seeded, T0 } from '../helpers';
import { READERS, readRound, readUntil } from './helpers';

const ids = (items: readonly ReadItem[]): string[] => items.map(idOf);
const kinds = (items: readonly ReadItem[]): string => items.map((item) => item.kind[0]).join('');
const fresh = (items: readonly ReadItem[]): ReadItem[] => items.filter((item) => item.kind === 'word' && !item.review);

/** Words of a stage that the player has been through, as the patch says. */
function metWords(
  start: LearnerProfile,
  n: number,
  count: number,
  patch: Partial<ReturnType<typeof progress>> = {},
): LearnerProfile {
  let book = start;
  for (const word of wordsOf(STAGES[n - 1]!).slice(0, count))
    book = withProgress(book, word.id, 'read', progress({ done: 1, clean: 1, ...patch }));
  return book;
}

/**
 * Words read with no help, which are due again now: the way a child who reads easily has left a
 * stage.
 */
const EASY = { level: 1, best: 1, clean: 1, due: T0 } as const;
/** Words that needed help, which are due again now. */
const HARD = { level: 0, best: 0, clean: 0, due: T0 } as const;

/**
 * The first stage with a lot of words, so that a few of them met does not yet open its sentences.
 * The stages before it are a few words each.
 */
const BIG = STAGES.find((stage) => wordsOf(stage).length >= 18)!.n;

describe('a round of reading', () => {
  it('is seven things, and a new book is given the first words of the first stage, and then three sentences made of them', () => {
    const items = planRound(emptyProfile(), T0);
    const words = items.filter((item) => item.kind === 'word');
    const lines = items.filter((item) => item.kind === 'line');
    expect(items).toHaveLength(ROUND_SIZE);
    expect(kinds(items)).toBe('wwwwlll');
    expect(new Set(ids(words)).size).toBe(4);
    expect(ids(words).every((id) => wordsOf(STAGES[0]!).some((word) => word.id === id))).toBe(true);
    expect(items.every((item) => item.level === 0 && !item.review)).toBe(true);
    // The first thing the player reads as a sentence is made of the words they have just read, and
    // the little words a and I.
    const read = new Set([...ids(words), 'a', 'i']);
    expect(lines.length).toBe(SENTENCES);
    for (const item of lines)
      if (item.kind === 'line')
        expect(
          item.line.words.every(
            (word) => read.has(word) || STAGES.slice(0, 3).some((stage) => wordsOf(stage).some((w) => w.id === word)),
          ),
          item.line.text,
        ).toBe(true);
  });

  it('gives the words in an order that is not the order of the stage, the same one for the same book, and a different one after the player has read more', () => {
    const order = (book = emptyProfile()): string[] => ids(planRound(book, T0).filter((item) => item.kind === 'word'));
    const taught = wordsOf(STAGES[0]!)
      .slice(0, 4)
      .map((word) => word.id);
    expect(order()).toEqual(order());
    expect(order()).not.toEqual(taught);
    const firsts = new Set<string>();
    for (let n = 1; n <= STAGES.length; n++)
      firsts.add(
        ids(planRound(emptyProfile(), T0, n).filter((item) => item.kind === 'word'))[0]! ===
          wordsOf(STAGES[n - 1]!)[0]!.id
          ? 'taught'
          : 'other',
      );
    expect(firsts.has('other'), 'the first word of a round is not always the first of the stage').toBe(true);
    expect(firsts.has('taught'), 'and sometimes it is, since the order is not a reversal').toBe(true);
  });

  it('puts the sentences that use only words the player has read, or is given in the round, before sentences that use words they have not met', () => {
    const stage = STAGES[0]!;
    const items = planRound(emptyProfile(), T0);
    const given = new Set([...ids(items.filter((item) => item.kind === 'word')), 'a', 'i']);
    const taken = items.filter((item) => item.kind === 'line');
    const unmet = (words: readonly string[]): number => words.filter((word) => !given.has(word)).length;
    const left = stage.lines.filter((line) => !taken.some((item) => idOf(item) === line.id));
    for (const item of taken) {
      if (item.kind !== 'line') continue;
      for (const line of left)
        expect(unmet(item.line.words), `${item.line.text} before ${line.text}`).toBeLessThanOrEqual(unmet(line.words));
    }
  });

  it('is the same round for the same book at the same moment, so a round left half done is the same when the player comes back', () => {
    const book = metWords(emptyProfile(), 1, 5);
    expect(planRound(book, T0 + HOUR)).toEqual(planRound(book, T0 + HOUR));
  });

  describe('the pace', () => {
    it('is the usual one until four words have been met, and then is slow when fewer than two in three of them were read without help', () => {
      const stage = STAGES[BIG - 1]!;
      expect(paceOf(stageState(emptyProfile(), stage))).toBe('usual');
      expect(paceOf(stageState(metWords(emptyProfile(), BIG, PACE_AFTER - 1, HARD), stage)), 'too few to tell').toBe(
        'usual',
      );
      expect(paceOf(stageState(metWords(emptyProfile(), BIG, PACE_AFTER, HARD), stage))).toBe('slow');
      expect(paceOf(stageState(metWords(emptyProfile(), BIG, PACE_AFTER, EASY), stage))).toBe('usual');
      // Six of ten read without help is under the share, and seven of ten is over it.
      expect(SLOW_SHARE).toBeGreaterThan(0.6);
      expect(SLOW_SHARE).toBeLessThan(0.7);
      const six = metWords(metWords(emptyProfile(), BIG, 10, HARD), BIG, 6, EASY);
      expect(paceOf(stageState(six, stage))).toBe('slow');
      const seven = metWords(metWords(emptyProfile(), BIG, 10, HARD), BIG, 7, EASY);
      expect(paceOf(stageState(seven, stage))).toBe('usual');
    });

    it('brings a child who needed help one fewer new word, and keeps a place for one more word to go over', () => {
      const easy = metWords(emptyProfile(), BIG, PACE_AFTER, EASY);
      const hard = metWords(emptyProfile(), BIG, PACE_AFTER, HARD);
      const usual = planRound(easy, T0, BIG);
      const slow = planRound(hard, T0, BIG);
      // The sentences keep three of the seven, so the words that are due and the new ones share
      // four.
      expect(fresh(usual).length).toBeLessThanOrEqual(PACES.usual.news);
      expect(fresh(slow).length).toBeLessThanOrEqual(PACES.slow.news);
      expect(fresh(slow).length).toBeLessThanOrEqual(fresh(usual).length);
      expect(PACES.slow.news).toBeLessThan(PACES.usual.news);
      expect(
        slow.filter((item) => item.review).length,
        'what is due fills the places that new words do not',
      ).toBeGreaterThan(usual.filter((item) => item.review).length);
      expect(usual).toHaveLength(ROUND_SIZE);
      expect(slow).toHaveLength(ROUND_SIZE);
    });

    it('never brings more new words than the pace allows while there is something due to go over, over many books', () => {
      const random = seeded(5);
      for (let game = 0; game < 30; game++) {
        let book = emptyProfile();
        let now = T0;
        const who = [READERS.strong, READERS.middling, READERS.slow][game % 3]!;
        for (let round = 0; round < 1 + (game % 20); round++) {
          const pace = PACES[paceOf(stageState(book, STAGES[currentStage(book) - 1]!))];
          const items = planRound(book, now);
          const due = items.filter((item) => item.review).length;
          const news = fresh(items).length;
          // Words that fill a round of nothing else to read are not capped, so only a round with
          // something due is held to it.
          if (due > 0 && items.filter((item) => item.kind === 'line').length === 0)
            expect(news, `game ${game} round ${round}`).toBeLessThanOrEqual(Math.max(pace.news, ROUND_SIZE - due));
          const played = readRound(book, now, who, random);
          book = played.profile;
          now = played.now + 2 * DAY * random();
        }
      }
    });
  });

  it('puts a word the player knows that is due first, and not a word they have just met', () => {
    const stage = wordsOf(STAGES[0]!);
    let book = withProgress(emptyProfile(), stage[0]!.id, 'read', progress({ level: 0, due: T0 }));
    book = withProgress(book, stage[1]!.id, 'read', progress({ level: 2, best: 2, due: T0 - DAY }));
    const items = planRound(book, T0);
    expect(idOf(items[0]!)).toBe(stage[1]!.id);
    expect(items[0]).toMatchObject({ level: 2, review: true });
    expect(ids(items), 'the word the player has just met is asked again, but is not the warm-up').toContain(
      stage[0]!.id,
    );
    expect(idOf(items[0]!)).not.toBe(stage[0]!.id);
  });

  it('begins with a word of an earlier stage when one is due, so what the player learned a while ago comes round again', () => {
    const early = wordsOf(STAGES[0]!)[2]!;
    const here = wordsOf(STAGES[2]!)[0]!;
    let book = raiseFloor(emptyProfile(), 3);
    book = withProgress(
      book,
      early.id,
      'read',
      progress({ level: 3, best: 3, due: T0 - 2 * HOUR, last: T0 - 3 * HOUR }),
    );
    book = withProgress(book, here.id, 'read', progress({ level: 1, best: 1, due: T0 - DAY, last: T0 - DAY - HOUR }));
    expect(currentStage(book)).toBe(3);
    const items = planRound(book, T0);
    expect(idOf(items[0]!), 'the older word, though the other is due longer').toBe(early.id);
    expect(ids(items)).toContain(here.id);
  });

  it('begins with the best known of the older words that are due, and the one that has waited longest when they are as well known', () => {
    const [a, b, c] = wordsOf(STAGES[0]!).slice(0, 3) as [
      ReturnType<typeof wordsOf>[number],
      ReturnType<typeof wordsOf>[number],
      ReturnType<typeof wordsOf>[number],
    ];
    const book = (
      levels: readonly [number, number, number],
      dues: readonly [number, number, number],
    ): LearnerProfile => {
      let next = raiseFloor(emptyProfile(), 3);
      [a, b, c].forEach((word, i) => {
        next = withProgress(
          next,
          word.id,
          'read',
          progress({ level: levels[i]!, best: levels[i]!, last: T0 - 5 * DAY, due: T0 - dues[i]! * HOUR }),
        );
      });
      return next;
    };
    expect(idOf(planRound(book([1, 3, 2], [9, 1, 5]), T0)[0]!), 'the best known, though it has waited the least').toBe(
      b.id,
    );
    expect(
      idOf(planRound(book([2, 2, 1], [3, 8, 20]), T0)[0]!),
      'as well known as another, and has waited longer',
    ).toBe(b.id);
  });

  it('leaves a word alone until its time, whatever else it could have been asked', () => {
    const stage = wordsOf(STAGES[0]!);
    const book = withProgress(emptyProfile(), stage[0]!.id, 'read', progress({ level: 2, best: 2, due: T0 + DAY }));
    expect(ids(planRound(book, T0))).not.toContain(stage[0]!.id);
    expect(ids(planRound(book, T0 + DAY))).toContain(stage[0]!.id);
  });

  it('keeps sentences until the player has met half the words of the stage, and puts them last', () => {
    const stage = STAGES[BIG - 1]!;
    const w = wordsOf(stage).length;
    const pace = PACES.usual.news;
    // Met words that were read with some help, so the pace is the usual one and does not change the
    // sum.
    const few = metWords(metWords(emptyProfile(), BIG, Math.ceil(w * UNLOCK) - pace - 1), BIG, 1, HARD);
    expect(paceOf(stageState(few, stage))).toBe('usual');
    expect(kinds(planRound(few, T0 + DAY, BIG)), 'with too few met').not.toContain('l');
    const enough = metWords(emptyProfile(), BIG, Math.ceil(w * UNLOCK) - pace, {
      level: 1,
      best: 1,
      clean: 1,
      due: T0 + 2 * DAY,
    });
    const items = planRound(enough, T0 + DAY, BIG);
    const lines = items.filter((item) => item.kind === 'line');
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines.length).toBeLessThanOrEqual(SENTENCES);
    expect(kinds(items), 'every sentence comes after every word').toMatch(/^w+l+$/);
    expect(lines.every((item) => item.kind === 'line' && item.line.stage === BIG && !item.review)).toBe(true);
  });

  it('begins sentences at exactly half the words of a stage, counting the new words of this round, and not a word sooner', () => {
    const stage = STAGES.find(
      (candidate) => wordsOf(candidate).length % 2 === 0 && wordsOf(candidate).length * UNLOCK >= PACES.usual.news + 1,
    )!;
    const half = wordsOf(stage).length * UNLOCK - PACES.usual.news;
    const base = raiseFloor(emptyProfile(), stage.n);
    const asked = (met: number): string =>
      kinds(planRound(metWords(base, stage.n, met, { level: 1, best: 1, clean: 1, due: T0 + DAY }), T0));
    expect(Number.isInteger(half)).toBe(true);
    expect(asked(half)).toMatch(/^w+l+$/);
    expect(asked(half - 1)).toMatch(/^w+$/);
  });

  it('asks nothing of a stage the player has not come to, however well the words in it are known and whatever is due', () => {
    const later = wordsOf(STAGES[4]!)[0]!;
    const book = withProgress(emptyProfile(), later.id, 'read', progress({ level: 1, best: 1, due: T0 - DAY }));
    expect(ids(planRound(book, T0, 1))).not.toContain(later.id);
    expect(ids(planRound(book, T0, 5))[0]).toBe(later.id);
  });

  it('does not begin with a word the player has just met, even when it is the only one that is due', () => {
    const met = wordsOf(STAGES[0]!)[0]!;
    const book = withProgress(
      raiseFloor(emptyProfile(), 2),
      met.id,
      'read',
      progress({ level: 0, best: 0, clean: 0, due: T0 - DAY }),
    );
    const items = planRound(book, T0);
    expect(items[0]).toMatchObject({ review: false });
    expect(idOf(items[0]!)).not.toBe(met.id);
    expect(ids(items)).toContain(met.id);
  });

  it('begins with a word of an earlier stage that the player knows less well before one of this stage that they know better', () => {
    const early = wordsOf(STAGES[0]!)[0]!;
    const here = wordsOf(STAGES[2]!)[0]!;
    let book = raiseFloor(emptyProfile(), 3);
    book = withProgress(book, early.id, 'read', progress({ level: 1, best: 1, due: T0 - HOUR }));
    book = withProgress(book, here.id, 'read', progress({ level: 4, best: 4, due: T0 - DAY }));
    expect(idOf(planRound(book, T0)[0]!)).toBe(early.id);
  });

  it('takes the shortest sentences of a stage first', () => {
    const stage = STAGES[0]!;
    const book = metWords(emptyProfile(), 1, wordsOf(stage).length);
    const lines = planRound(book, T0 + DAY).filter((item) => item.kind === 'line');
    expect(ids(lines)).toEqual(stage.lines.slice(0, lines.length).map((line) => line.id));
  });

  it('asks again for a sentence that is due, as the one sentence of its round', () => {
    const stage = STAGES[0]!;
    let book = metWords(emptyProfile(), 1, wordsOf(stage).length);
    book = withSentence(book, stage.lines[0]!.id, progress({ level: 1, best: 1, due: T0 }));
    const items = planRound(book, T0);
    expect(ids(items)).toContain(stage.lines[0]!.id);
    expect(items.find((item) => idOf(item) === stage.lines[0]!.id)).toMatchObject({ review: true, level: 1 });
  });

  it('never has one thing twice, and is always seven, over many books at many moments', () => {
    const random = seeded(99);
    for (let game = 0; game < 40; game++) {
      let book = emptyProfile();
      let now = T0;
      const who = [READERS.strong, READERS.middling, READERS.slow][game % 3]!;
      for (let round = 0; round < 1 + (game % 25); round++) {
        const played = readRound(book, now, who, random);
        expect(played.items).toHaveLength(ROUND_SIZE);
        expect(new Set(played.items.map(keyOf)).size).toBe(ROUND_SIZE);
        book = played.profile;
        now = played.now + Math.floor(random() * 3 * DAY);
      }
    }
  });

  it('is a round of the stage the player picked when they pick one, and a cleared stage is read again, with its sentences', () => {
    const { profile: book, now } = readUntil((p) => currentStage(p) >= 3, READERS.strong, seeded(7));
    const items = planRound(book, now + DAY, 2);
    expect(items).toHaveLength(ROUND_SIZE);
    expect(
      items.every((item) => stageOf(item) <= 2),
      'a stage the player did not pick and has gone past is not asked',
    ).toBe(true);
    expect(
      items.slice(1).every((item) => stageOf(item) === 2),
      'only the warm-up is from before',
    ).toBe(true);
    expect(items.some((item) => item.kind === 'line')).toBe(true);
  });

  it('is still seven when all of the course has been met and nothing is due, and is the stage the player is on, what they know least well first', () => {
    const last = STAGES[STAGES.length - 1]!;
    let book = emptyProfile();
    const known = progress({ done: 3, clean: 3, level: 3, best: 3, due: T0 + 10 * DAY, last: T0 });
    for (const stage of STAGES) {
      for (const word of wordsOf(stage)) book = withProgress(book, word.id, 'read', known);
      for (const line of stage.lines) book = withSentence(book, line.id, known);
    }
    const weak = wordsOf(last).slice(5, 8);
    for (const word of weak)
      book = withProgress(
        book,
        word.id,
        'read',
        progress({ done: 1, clean: 0, level: 1, best: 1, due: T0 + 10 * DAY, last: T0 }),
      );
    expect(currentStage(book)).toBe(STAGES.length);
    const items = planRound(book, T0);
    expect(items).toHaveLength(ROUND_SIZE);
    expect(items.every((item) => item.review && stageOf(item) === STAGES.length)).toBe(true);
    for (const word of weak) expect(ids(items)).toContain(word.id);
  });

  it('starts at the floor a parent set', () => {
    const book = raiseFloor(emptyProfile(), 4);
    const items = planRound(book, T0);
    expect(items.every((item) => stageOf(item) === 4)).toBe(true);
    expect(kinds(items)).toBe('wwwwlll');
    const words = ids(items.filter((item) => item.kind === 'word'));
    expect(words.every((id) => wordsOf(STAGES[3]!).some((word) => word.id === id))).toBe(true);
    const read = new Set([...words, 'a', 'i']);
    for (const item of items)
      if (item.kind === 'line')
        expect(
          item.line.words.every(
            (word) => read.has(word) || STAGES.slice(0, 3).some((stage) => wordsOf(stage).some((w) => w.id === word)),
          ),
          item.line.text,
        ).toBe(true);
  });

  it('refuses a stage that is not in the course, which is a mistake in the game', () => {
    for (const n of [0, -1, STAGES.length + 1, 2.5])
      expect(() => planRound(emptyProfile(), T0, n), String(n)).toThrow(RangeError);
  });
});
