import { describe, expect, it } from 'vitest';
import {
  emptyProfile,
  MAX_SENTENCES,
  MAX_WORDS,
  mergeProfiles,
  mergeProgress,
  progressOf,
  raiseFloor,
  readProfile,
  sameProfile,
  sentenceProgress,
  starsOf,
  withProgress,
  withSentence,
} from '../../src/learning';
import {
  LearnerProfile,
  MAX_FLOOR,
  MAX_LEVEL,
  PROFILE_VERSION,
  type Progress,
  RECORD_SINCE,
  SKILL_SINCE,
  SKILLS,
  versionOf,
} from '../../src/shared/learning';
import { collect, DAY, profileOf, progress, seeded, T0 } from './helpers';

describe('a profile', () => {
  it('starts empty, and a word is set without changing the profile it came from', () => {
    const empty = emptyProfile();
    const one = withProgress(empty, 'frog', 'spell', progress({ level: 2 }));
    expect(empty.words).toEqual({});
    expect(progressOf(one, 'frog', 'spell')?.level).toBe(2);
    expect(progressOf(one, 'duck', 'spell')).toBeUndefined();
    const two = withProgress(one, 'frog', 'spell', progress({ level: 3 }));
    expect(progressOf(one, 'frog', 'spell')?.level).toBe(2);
    expect(progressOf(two, 'frog', 'spell')?.level).toBe(3);
  });

  it('is what the schema says it is', () => {
    expect(() => LearnerProfile.parse(collect(['frog', 'duck', 'bee']))).not.toThrow();
    expect(() => LearnerProfile.parse(emptyProfile())).not.toThrow();
    expect(() => LearnerProfile.parse(withProgress(emptyProfile(), 'frog', 'read', progress()))).not.toThrow();
  });

  // A copy of the app that does not know a skill drops what it cannot read when it writes the book.
  // A newer schema version is what makes that copy leave the book alone, so a skill and a schema
  // version have to arrive together.
  it('has the skills and records that the schema versions were written with', () => {
    expect(
      SKILLS,
      'A new skill? Give it a version in SKILL_SINCE, raise PROFILE_VERSION, and then change this list.',
    ).toEqual(['spell', 'read']);
    expect(
      SKILL_SINCE,
      'A skill never moves to another version: a record that holds it has already been written under the old one.',
    ).toEqual({ spell: 1, read: 2 });
    expect(
      RECORD_SINCE,
      'A kind of record never moves to another version either: a book that holds one has already been written under the old one.',
    ).toEqual({ sentences: 3, floor: 3 });
    expect(PROFILE_VERSION, 'The newest version is the one the newest skill or record arrived with.').toBe(
      Math.max(...Object.values(SKILL_SINCE), ...Object.values(RECORD_SINCE)),
    );
  });
});

describe('the version of a profile', () => {
  const duck = progress({ level: 1 });

  it('is the least one that can hold what is in it, so a book with only spelling stays one an older copy of the game can use', () => {
    expect(emptyProfile().schemaVersion).toBe(1);
    expect(collect(['frog', 'duck']).schemaVersion).toBe(1);
    expect(versionOf({ frog: { spell: duck } })).toBe(1);
    expect(versionOf({})).toBe(1);
  });

  it('goes up the moment a word is read, and does not come down again', () => {
    const reading = withProgress(collect(['frog']), 'duck', 'read', duck);
    expect(reading.schemaVersion).toBe(2);
    expect(withProgress(reading, 'frog', 'spell', progress({ level: 2 })).schemaVersion).toBe(2);
    expect(versionOf({ frog: { spell: duck }, duck: { read: duck } })).toBe(2);
  });

  it('is what the schema checks: a record cannot say it is older than what it holds, and can say it is newer', () => {
    expect(LearnerProfile.safeParse({ schemaVersion: 1, words: { frog: { read: duck } } }).success).toBe(false);
    expect(LearnerProfile.safeParse({ schemaVersion: 2, words: { frog: { read: duck } } }).success).toBe(true);
    expect(LearnerProfile.safeParse({ schemaVersion: 2, words: { frog: { spell: duck } } }).success).toBe(true);
    expect(LearnerProfile.safeParse({ schemaVersion: PROFILE_VERSION + 1, words: {} }).success).toBe(false);
    expect(LearnerProfile.safeParse({ schemaVersion: 0, words: {} }).success).toBe(false);
  });

  it('keeps both skills of a word, each with its own progress', () => {
    const spelled = withProgress(emptyProfile(), 'frog', 'spell', progress({ level: 4, best: 4 }));
    const both = withProgress(spelled, 'frog', 'read', progress({ level: 1, best: 1 }));
    expect(progressOf(both, 'frog', 'spell')?.level).toBe(4);
    expect(progressOf(both, 'frog', 'read')?.level).toBe(1);
    expect(progressOf(spelled, 'frog', 'read')).toBeUndefined();
  });
});

describe('reading what was stored', () => {
  it('gives back what was written', () => {
    const profile = collect(['frog', 'duck', 'bee']);
    expect(readProfile(JSON.parse(JSON.stringify(profile)))).toEqual({ profile, newer: false, dropped: 0 });
  });

  it('reads nothing at all as an empty book that lost nothing', () => {
    for (const raw of [undefined, null])
      expect(readProfile(raw), String(raw)).toEqual({ profile: emptyProfile(), newer: false, dropped: 0 });
    expect(readProfile(emptyProfile())).toEqual({ profile: emptyProfile(), newer: false, dropped: 0 });
  });

  it('starts the player with an empty book rather than failing, on anything that is not a profile, and says that something was lost', () => {
    for (const raw of [
      'frog',
      42,
      true,
      [],
      {},
      { schemaVersion: 1 },
      { words: 'frog' },
      { schemaVersion: 1, words: null },
      { schemaVersion: 1, words: [] },
    ]) {
      expect(readProfile(raw), JSON.stringify(raw)).toEqual({ profile: emptyProfile(), newer: false, dropped: 1 });
    }
  });

  it('knows a record from a newer version of the game, reads it as empty and says so, so nothing writes over it', () => {
    const newer = { schemaVersion: PROFILE_VERSION + 1, words: { frog: { spell: progress() } } };
    expect(readProfile(newer)).toEqual({ profile: emptyProfile(), newer: true, dropped: 0 });
  });

  it("keeps the rest of the player's book when one word cannot be read", () => {
    const good = progress({ level: 3, best: 3 });
    const raw = {
      schemaVersion: 1,
      words: {
        frog: { spell: good },
        // Not words: capital letters, a number, too short, too long.
        Frog: { spell: good },
        '123': { spell: good },
        f: { spell: good },
        [`${'x'.repeat(25)}`]: { spell: good },
        // Not progress: a level that does not exist, a number that is not one, a missing field.
        duck: { spell: { ...good, level: 99 } },
        bee: { spell: { ...good, done: Number.NaN } },
        bird: { spell: { level: 1 } },
        fish: 'swimming',
        snail: null,
        bunny: {},
        // A skill that this version does not know is left out, and the word goes with it when it
        // has no other.
        ladybug: { dance: good },
        // A word with one good skill and one that is not keeps the good one.
        apple: { spell: good, dance: good },
      },
    };
    const read = readProfile(raw);
    expect(Object.keys(read.profile.words).sort()).toEqual(['apple', 'frog']);
    expect(progressOf(read.profile, 'apple', 'spell')).toEqual(good);
    // Eleven of the thirteen words were left out, one for each, and the book is told so.
    expect(read.dropped).toBe(11);
  });

  it('reads both skills, and gives back the version of what it found, whatever version the record said', () => {
    const good = progress({ level: 2, best: 2 });
    const both = readProfile({ schemaVersion: 2, words: { frog: { spell: good, read: good }, duck: { read: good } } });
    expect(both).toMatchObject({ newer: false, dropped: 0 });
    expect(both.profile.schemaVersion).toBe(2);
    expect(progressOf(both.profile, 'duck', 'read')).toEqual(good);
    // Version 2 with only spelling in it is a book an older copy can read, so that is what it is
    // called.
    expect(readProfile({ schemaVersion: 2, words: { frog: { spell: good } } }).profile.schemaVersion).toBe(1);
    // A record that says version 1 but holds reading was labelled wrong, and it is not read as if
    // it were right.
    expect(readProfile({ schemaVersion: 1, words: { frog: { read: good } } }).profile.schemaVersion).toBe(2);
    // A bad reading record is dropped without costing the player the spelling of the same word.
    const half = readProfile({ schemaVersion: 2, words: { frog: { spell: good, read: { level: 99 } } } });
    expect(progressOf(half.profile, 'frog', 'spell')).toEqual(good);
    expect(progressOf(half.profile, 'frog', 'read')).toBeUndefined();
    expect(half.dropped).toBe(1);
    expect(half.profile.schemaVersion).toBe(1);
  });

  it('refuses a count that is not a whole number, so a fraction never reaches the book', () => {
    const raw = { schemaVersion: 1, words: { frog: { spell: progress({ done: 1.5 }) } } };
    expect(readProfile(raw)).toEqual({ profile: emptyProfile(), newer: false, dropped: 1 });
  });

  it('never keeps more than it is willing to hold', () => {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const name = (i: number): string =>
      [i % 26, Math.floor(i / 26) % 26, Math.floor(i / 676) % 26].map((n) => letters[n]).join('');
    const words: Record<string, unknown> = {};
    for (let i = 0; i < MAX_WORDS + 500; i++) words[name(i)] = { spell: progress() };
    expect(Object.keys(words)).toHaveLength(MAX_WORDS + 500);
    const read = readProfile({ schemaVersion: 1, words });
    expect(Object.keys(read.profile.words)).toHaveLength(MAX_WORDS);
    expect(read.newer).toBe(false);
    expect(read.dropped).toBe(500);
  });

  it('is not fooled by words that are only named like a built in', () => {
    const raw = JSON.parse(
      '{"schemaVersion":1,"words":{"__proto__":{"spell":{}},"constructor":{"spell":{}},"toString":{"spell":{}}}}',
    ) as unknown;
    const read = readProfile(raw);
    expect(read.profile.words).toEqual({});
    expect(Object.getPrototypeOf(read.profile.words)).toBe(Object.prototype);
  });
});

describe('telling whether two books hold the same', () => {
  const book = (): LearnerProfile => collect(['frog', 'duck', 'bee']);

  it('says yes for the same book, for a copy of it, and for two empty ones', () => {
    const a = book();
    expect(sameProfile(a, a)).toBe(true);
    expect(sameProfile(a, JSON.parse(JSON.stringify(a)) as LearnerProfile)).toBe(true);
    expect(sameProfile(emptyProfile(), emptyProfile())).toBe(true);
  });

  it('says yes however the words were put in', () => {
    const a = book();
    const backwards: LearnerProfile = {
      schemaVersion: 1,
      words: Object.fromEntries(Object.entries(a.words).reverse()),
    };
    expect(sameProfile(a, backwards)).toBe(true);
    expect(sameProfile(backwards, a)).toBe(true);
  });

  it('says no when one number of one word differs, whichever way round', () => {
    const a = book();
    const frog = progressOf(a, 'frog', 'spell')!;
    for (const key of Object.keys(frog) as (keyof typeof frog)[]) {
      const b = withProgress(a, 'frog', 'spell', { ...frog, [key]: frog[key] + 1 });
      expect(sameProfile(a, b), key).toBe(false);
      expect(sameProfile(b, a), key).toBe(false);
    }
  });

  it('says no when a word is missing, and when two books have as many words but not the same ones', () => {
    const a = book();
    const fewer = { schemaVersion: 1 as const, words: { frog: a.words.frog!, duck: a.words.duck! } };
    expect(sameProfile(a, fewer)).toBe(false);
    expect(sameProfile(fewer, a)).toBe(false);
    expect(sameProfile(a, emptyProfile())).toBe(false);
    const other = collect(['frog', 'duck', 'bird']);
    expect(sameProfile(a, other)).toBe(false);
    expect(sameProfile(other, a)).toBe(false);
  });
});

/**
 * A random record that is valid and plausible, with small numbers so two of them often tie on a
 * field.
 */
function anyProgress(random: () => number): Progress {
  const int = (max: number): number => Math.floor(random() * (max + 1));
  const level = int(MAX_LEVEL);
  const first = T0 + int(3) * DAY;
  const done = int(5) + 1;
  return {
    level,
    best: Math.min(MAX_LEVEL, level + int(2)),
    streak: int(2),
    struggles: int(1),
    due: T0 + int(3) * DAY,
    done,
    clean: int(done),
    slips: int(6),
    first,
    last: first + int(3) * DAY,
  };
}

const LINES = ['the-cat-sat', 'a-big-red-bus', 'the-frog-can-hop-up', 'we-can-run'] as const;

/**
 * A random book with each skill of each word there or not, so the laws below run over spelling
 * alone, reading alone, and both. A book also has, now and then, sentences the player has read and
 * a stage a parent started them at, so they run over version 3 as well.
 */
function anyProfile(random: () => number): LearnerProfile {
  let profile = emptyProfile();
  for (const word of ['frog', 'duck', 'bee', 'bird', 'fish']) {
    for (const skill of SKILLS) if (random() < 0.5) profile = withProgress(profile, word, skill, anyProgress(random));
  }
  for (const line of LINES) if (random() < 0.35) profile = withSentence(profile, line, anyProgress(random));
  if (random() < 0.3) profile = raiseFloor(profile, 2 + Math.floor(random() * 6));
  return profile;
}

describe('putting two copies of a book together', () => {
  const trials = 400;

  it('gives the same book whichever copy comes first', () => {
    for (let seed = 0; seed < trials; seed++) {
      const random = seeded(seed);
      const a = anyProfile(random);
      const b = anyProfile(random);
      expect(mergeProfiles(a, b), `seed ${seed}`).toEqual(mergeProfiles(b, a));
    }
  });

  it('gives the same book however three copies are grouped', () => {
    for (let seed = 0; seed < trials; seed++) {
      const random = seeded(seed + 1000);
      const [a, b, c] = [anyProfile(random), anyProfile(random), anyProfile(random)] as const;
      expect(mergeProfiles(mergeProfiles(a, b), c), `seed ${seed}`).toEqual(mergeProfiles(a, mergeProfiles(b, c)));
    }
  });

  it('can be done again and again without changing anything', () => {
    for (let seed = 0; seed < trials; seed++) {
      const random = seeded(seed + 2000);
      const a = anyProfile(random);
      const b = anyProfile(random);
      const once = mergeProfiles(a, b);
      expect(mergeProfiles(once, b)).toEqual(once);
      expect(mergeProfiles(once, a)).toEqual(once);
      expect(mergeProfiles(a, a)).toEqual(a);
    }
  });

  it('never loses a word, a star or a count, and always gives a book that can be stored', () => {
    for (let seed = 0; seed < trials; seed++) {
      const random = seeded(seed + 3000);
      const a = anyProfile(random);
      const b = anyProfile(random);
      const merged = mergeProfiles(a, b);
      expect(() => LearnerProfile.parse(merged)).not.toThrow();
      for (const source of [a, b]) {
        for (const word of Object.keys(source.words)) {
          for (const skill of SKILLS) {
            const theirs = progressOf(source, word, skill);
            if (!theirs) continue;
            const mine = progressOf(merged, word, skill)!;
            expect(mine, `${word} ${skill}`).toBeDefined();
            expect(starsOf(mine)).toBeGreaterThanOrEqual(starsOf(theirs));
            expect(mine.best).toBeGreaterThanOrEqual(theirs.best);
            expect(mine.done).toBeGreaterThanOrEqual(theirs.done);
            expect(mine.slips).toBeGreaterThanOrEqual(theirs.slips);
            expect(mine.first).toBeLessThanOrEqual(theirs.first);
            expect(mine.last).toBeGreaterThanOrEqual(theirs.last);
          }
        }
      }
      // The version is the one the words need, which is the higher of the two copies' versions.
      expect(merged.schemaVersion).toBe(Math.max(a.schemaVersion, b.schemaVersion));
      expect(Object.keys(merged.words).sort()).toEqual(
        [...new Set([...Object.keys(a.words), ...Object.keys(b.words)])].sort(),
      );
      // A sentence the player has read stays read, with every count at least what it was, and the
      // stage they are started at never goes down.
      for (const source of [a, b]) {
        for (const line of Object.keys(source.sentences ?? {})) {
          const theirs = sentenceProgress(source, line)!;
          const mine = sentenceProgress(merged, line);
          expect(mine, line).toBeDefined();
          expect(mine!.best).toBeGreaterThanOrEqual(theirs.best);
          expect(mine!.done).toBeGreaterThanOrEqual(theirs.done);
          expect(mine!.slips).toBeGreaterThanOrEqual(theirs.slips);
        }
        expect(merged.floor ?? 0).toBeGreaterThanOrEqual(source.floor ?? 0);
      }
      expect(Object.keys(merged.sentences ?? {}).sort()).toEqual(
        [...new Set([...Object.keys(a.sentences ?? {}), ...Object.keys(b.sentences ?? {})])].sort(),
      );
    }
  });

  it('keeps spelling on one copy and reading on the other, and calls the result by the version that holds both', () => {
    const spelled = collect(['frog']);
    const read = withProgress(emptyProfile(), 'frog', 'read', progress({ level: 2, best: 2 }));
    const merged = mergeProfiles(spelled, read);
    expect(progressOf(merged, 'frog', 'spell')).toEqual(progressOf(spelled, 'frog', 'spell'));
    expect(progressOf(merged, 'frog', 'read')).toEqual(progressOf(read, 'frog', 'read'));
    expect(merged.schemaVersion).toBe(2);
    expect(mergeProfiles(read, spelled)).toEqual(merged);
  });

  it('stays version 1 when neither copy has reading in it, so a Worker that is not updated yet still accepts the book', () => {
    expect(mergeProfiles(collect(['frog']), collect(['duck'])).schemaVersion).toBe(1);
  });

  it('leaves a book alone when the other copy is empty', () => {
    const book = collect(['frog', 'duck']);
    expect(mergeProfiles(book, emptyProfile())).toEqual(book);
    expect(mergeProfiles(emptyProfile(), book)).toEqual(book);
  });

  it('does not change either copy', () => {
    const a = collect(['frog', 'duck']);
    const b = profileOf({ frog: { level: 4, best: 4, last: T0 + DAY }, bee: {} });
    const [before, other] = [JSON.stringify(a), JSON.stringify(b)];
    mergeProfiles(a, b);
    expect([JSON.stringify(a), JSON.stringify(b)]).toEqual([before, other]);
  });

  it('takes where a word has got to from the copy that saw it last, and what the player has done from whichever has more', () => {
    const older = progress({
      level: 4,
      best: 4,
      streak: 0,
      due: T0 + 3 * DAY,
      done: 9,
      clean: 9,
      slips: 1,
      first: T0,
      last: T0 + DAY,
    });
    const newer = progress({
      level: 2,
      best: 2,
      streak: 1,
      due: T0 + DAY,
      done: 5,
      clean: 3,
      slips: 6,
      first: T0 + DAY,
      last: T0 + 2 * DAY,
    });
    const merged = mergeProgress(older, newer);
    // The word was seen last on the copy where it is at level 2, so that is where it is now. The
    // star for level 4 stays.
    expect(merged).toEqual({
      level: 2,
      best: 4,
      streak: 1,
      struggles: 0,
      due: T0 + DAY,
      done: 9,
      clean: 9,
      slips: 6,
      first: T0,
      last: T0 + 2 * DAY,
    });
    expect(mergeProgress(newer, older)).toEqual(merged);
  });
});

describe('the sentences and the floor of version 3', () => {
  const line = 'the-cat-sat';
  const read = progress({ level: 2, best: 2, done: 3, clean: 2 });

  it('are not in a book that has none, so a book from before them is the book it was', () => {
    expect(Object.keys(emptyProfile())).toEqual(['schemaVersion', 'words']);
    expect(Object.keys(collect(['frog']))).toEqual(['schemaVersion', 'words']);
    expect(Object.keys(readProfile({ schemaVersion: 2, words: {} }).profile)).toEqual(['schemaVersion', 'words']);
    expect(Object.keys(mergeProfiles(collect(['frog']), collect(['duck'])))).toEqual(['schemaVersion', 'words']);
  });

  it('are set without changing the book they came from, and make it version 3', () => {
    const before = collect(['frog']);
    const after = withSentence(before, line, read);
    expect(before.sentences).toBeUndefined();
    expect(sentenceProgress(after, line)).toEqual(read);
    expect(sentenceProgress(after, 'we-can-run')).toBeUndefined();
    expect(sentenceProgress(before, line)).toBeUndefined();
    expect(after.schemaVersion).toBe(3);
    expect(progressOf(after, 'frog', 'spell')).toEqual(progressOf(before, 'frog', 'spell'));
    expect(sentenceProgress(withSentence(after, line, { ...read, level: 3 }), line)?.level).toBe(3);
    expect(sentenceProgress(after, line)?.level).toBe(2);
  });

  it('are kept by everything that changes a word, so setting a word never loses a sentence or the floor', () => {
    const book = raiseFloor(withSentence(emptyProfile(), line, read), 5);
    const next = withProgress(book, 'frog', 'read', progress());
    expect(sentenceProgress(next, line)).toEqual(read);
    expect(next.floor).toBe(5);
    expect(next.schemaVersion).toBe(3);
  });

  it('raise the floor and never lower it, and a floor of the first stage is no floor', () => {
    const book = emptyProfile();
    expect(raiseFloor(book, 1)).toBe(book);
    expect(raiseFloor(book, 0)).toBe(book);
    expect(raiseFloor(book, -3)).toBe(book);
    expect(raiseFloor(book, Number.NaN)).toBe(book);
    const five = raiseFloor(book, 5);
    expect(five).toEqual({ schemaVersion: 3, words: {}, floor: 5 });
    expect(raiseFloor(five, 3)).toBe(five);
    expect(raiseFloor(five, 5)).toBe(five);
    expect(raiseFloor(five, 8).floor).toBe(8);
    expect(raiseFloor(book, 2.7).floor, 'a stage is a whole number').toBe(2);
    expect(raiseFloor(book, MAX_FLOOR + 50).floor, 'and there is a last one').toBe(MAX_FLOOR);
  });

  it('are what the schema says, and a book that holds one cannot call itself an older version', () => {
    expect(LearnerProfile.safeParse({ schemaVersion: 3, words: {}, sentences: { [line]: read } }).success).toBe(true);
    expect(LearnerProfile.safeParse({ schemaVersion: 2, words: {}, sentences: { [line]: read } }).success).toBe(false);
    expect(LearnerProfile.safeParse({ schemaVersion: 1, words: {}, floor: 4 }).success).toBe(false);
    expect(LearnerProfile.safeParse({ schemaVersion: 3, words: {}, floor: 4 }).success).toBe(true);
    expect(
      LearnerProfile.safeParse({ schemaVersion: 3, words: {}, sentences: {} }).success,
      'an empty record is fine, and it says nothing',
    ).toBe(true);
    for (const bad of [
      'The-Cat-Sat',
      'the cat sat',
      'cat',
      'the--cat',
      '-the-cat',
      'the-cat-',
      'the-cat-2',
      `${'abcdefghijklm-'.repeat(2)}cat`,
      `${'a-'.repeat(31)}a`,
    ]) {
      expect(LearnerProfile.safeParse({ schemaVersion: 3, words: {}, sentences: { [bad]: read } }).success, bad).toBe(
        false,
      );
    }
    for (const bad of [0, 1, -2, 2.5, MAX_FLOOR + 1, Number.NaN, '4', null]) {
      expect(LearnerProfile.safeParse({ schemaVersion: 3, words: {}, floor: bad }).success, String(bad)).toBe(false);
    }
  });

  it('say what version they need', () => {
    expect(versionOf({})).toBe(1);
    expect(versionOf({}, { sentences: { [line]: read } })).toBe(3);
    expect(versionOf({}, { floor: 3 })).toBe(3);
    expect(versionOf({ frog: { read } }, { sentences: {} })).toBe(2);
    expect(versionOf({ frog: { spell: read } }, { floor: undefined })).toBe(1);
  });

  it('are read back with the rest of the book, and the version is the one of what was found, whatever it was labelled', () => {
    const book = raiseFloor(withSentence(collect(['frog']), line, read), 4);
    expect(readProfile(JSON.parse(JSON.stringify(book)))).toEqual({ profile: book, newer: false, dropped: 0 });
    const mislabelled = readProfile({ schemaVersion: 1, words: {}, sentences: { [line]: read } });
    expect(mislabelled.profile.schemaVersion).toBe(3);
    expect(sentenceProgress(mislabelled.profile, line)).toEqual(read);
    expect(
      readProfile({ schemaVersion: 3, words: { frog: { spell: read } } }).profile.schemaVersion,
      'version 3 holding nothing of version 3 is a version 1 book',
    ).toBe(1);
  });

  it('are kept one by one: a sentence that cannot be read, a floor that cannot be, are left out and counted, and the rest stays', () => {
    const raw = {
      schemaVersion: 3,
      words: { frog: { spell: read } },
      sentences: {
        [line]: read,
        'The-Cat': read,
        'a-big-red-bus': { ...read, level: 99 },
        'we-can-run': 'yes',
        'the-frog-can-hop-up': { level: 1 },
      },
      floor: 'high',
    };
    const got = readProfile(raw);
    expect(Object.keys(got.profile.sentences ?? {})).toEqual([line]);
    expect(got.profile.floor).toBeUndefined();
    expect(got.dropped).toBe(5);
    expect(got.profile.schemaVersion).toBe(3);
    expect(progressOf(got.profile, 'frog', 'spell')).toEqual(read);
  });

  it('are not read from anything that is not a record, and an unreadable set of them costs one', () => {
    for (const sentences of ['the cat', 4, ['the-cat-sat'], true]) {
      const got = readProfile({ schemaVersion: 3, words: { frog: { spell: read } }, sentences });
      expect(got.profile.sentences, JSON.stringify(sentences)).toBeUndefined();
      expect(got.dropped).toBe(1);
      expect(progressOf(got.profile, 'frog', 'spell')).toEqual(read);
    }
    const nothing = readProfile({ schemaVersion: 3, words: {}, sentences: null });
    expect(nothing.profile).toEqual(emptyProfile());
    expect(nothing.dropped).toBe(1);
  });

  it('are not read when a built in is named like one', () => {
    const raw = JSON.parse(
      '{"schemaVersion":3,"words":{},"sentences":{"__proto__":{},"constructor":{},"the-cat-sat":' +
        JSON.stringify(read) +
        '}}',
    ) as unknown;
    const got = readProfile(raw);
    expect(Object.keys(got.profile.sentences ?? {})).toEqual([line]);
    expect(Object.getPrototypeOf(got.profile.sentences)).toBe(Object.prototype);
  });

  it('are never more than the book will hold', () => {
    const word = (i: number): string =>
      ['a', 'b', 'c', 'd'].map((_, n) => String.fromCharCode(97 + ((i >> (n * 3)) & 7))).join('');
    const sentences: Record<string, unknown> = {};
    for (let i = 0; i < MAX_SENTENCES + 100; i++) sentences[`the-${word(i)}-${word(i >> 3)}-sat`] = read;
    expect(Object.keys(sentences).length).toBe(MAX_SENTENCES + 100);
    const got = readProfile({ schemaVersion: 3, words: {}, sentences });
    expect(Object.keys(got.profile.sentences ?? {})).toHaveLength(MAX_SENTENCES);
    expect(got.dropped).toBe(100);
  });

  it('are told apart when two books are compared, and a floor of nothing is the same as none', () => {
    const a = withSentence(collect(['frog']), line, read);
    expect(sameProfile(a, withSentence(collect(['frog']), line, read))).toBe(true);
    expect(sameProfile(a, collect(['frog']))).toBe(false);
    expect(sameProfile(collect(['frog']), a)).toBe(false);
    for (const key of Object.keys(read) as (keyof Progress)[]) {
      const b = withSentence(a, line, { ...read, [key]: read[key] + 1 });
      expect(sameProfile(a, b), key).toBe(false);
      expect(sameProfile(b, a), key).toBe(false);
    }
    expect(sameProfile(a, withSentence(collect(['frog']), 'we-can-run', read)), 'not the same sentence').toBe(false);
    expect(sameProfile(raiseFloor(a, 4), a)).toBe(false);
    expect(sameProfile(a, raiseFloor(a, 4))).toBe(false);
    expect(sameProfile(raiseFloor(a, 4), raiseFloor(a, 4))).toBe(true);
    expect(sameProfile({ ...a, sentences: {} }, collect(['frog'])), 'an empty set says nothing').toBe(true);
  });

  it('merge like words: the counters take the larger and where the player is comes from the copy that saw it last', () => {
    const older = progress({ level: 4, best: 4, done: 9, clean: 9, slips: 1, first: T0, last: T0 + DAY });
    const newer = progress({ level: 2, best: 2, done: 5, clean: 3, slips: 6, first: T0 + DAY, last: T0 + 2 * DAY });
    const merged = mergeProfiles(withSentence(emptyProfile(), line, older), withSentence(emptyProfile(), line, newer));
    expect(sentenceProgress(merged, line)).toEqual(mergeProgress(older, newer));
    expect(merged.schemaVersion).toBe(3);
  });

  it('merge by the larger floor, and a book with no floor does not lower one', () => {
    const high = raiseFloor(emptyProfile(), 6);
    const low = raiseFloor(emptyProfile(), 3);
    expect(mergeProfiles(high, low).floor).toBe(6);
    expect(mergeProfiles(low, high).floor).toBe(6);
    expect(mergeProfiles(high, emptyProfile())).toEqual(high);
    expect(mergeProfiles(emptyProfile(), high)).toEqual(high);
  });

  it('make a merge version 3 when either copy has them, and keep it a version an older copy can read when neither does', () => {
    const plain = collect(['frog']);
    const sentence = withSentence(emptyProfile(), line, read);
    expect(mergeProfiles(plain, sentence).schemaVersion).toBe(3);
    expect(mergeProfiles(plain, raiseFloor(emptyProfile(), 2)).schemaVersion).toBe(3);
    expect(mergeProfiles(plain, collect(['duck'])).schemaVersion).toBe(1);
    expect(mergeProfiles(plain, withProgress(emptyProfile(), 'duck', 'read', progress())).schemaVersion).toBe(2);
    expect(Object.keys(mergeProfiles(plain, withProgress(emptyProfile(), 'duck', 'read', progress())))).toEqual([
      'schemaVersion',
      'words',
    ]);
  });

  it('do not change either copy when two books are merged', () => {
    const a = raiseFloor(withSentence(collect(['frog']), line, read), 3);
    const b = withSentence(emptyProfile(), line, progress({ done: 8 }));
    const [before, other] = [JSON.stringify(a), JSON.stringify(b)];
    mergeProfiles(a, b);
    expect([JSON.stringify(a), JSON.stringify(b)]).toEqual([before, other]);
  });
});
