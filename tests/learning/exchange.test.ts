import { describe, expect, it } from 'vitest';
import {
  exportBook,
  type LearnerProfile,
  MAX_BOOK_CHARS,
  MAX_SENTENCES,
  mergeProfiles,
  parseBookFile,
  raiseFloor,
  readProfile,
  sameProfile,
  withSentence,
} from '../../src/learning';
import { BOOK_KIND, parseImport } from '../../src/shared/exchange';
import { PROFILE_VERSION, SKILLS, versionOf, type WordProgress } from '../../src/shared/learning';
import { DAY, HOUR, profileOf, progress, T0 } from './helpers';

const AT = '2026-10-27T14:05:00.000Z';

const BOOK: LearnerProfile = profileOf({
  frog: { level: 5, best: 5, due: T0 + 14 * DAY, done: 6, clean: 6 },
  bird: { level: 3, best: 3, due: T0 - 1000, done: 3, slips: 7 },
  unicorn: { level: 1, best: 1, due: T0 + 10 * 60_000, done: 2, slips: 5 },
});

/** A file as a person could have broken it: some words in the book are not valid. */
const damaged = (): unknown => ({
  schemaVersion: 1,
  words: {
    frog: { spell: progress({ level: 2, best: 2 }) },
    bird: { spell: { level: 'high' } },
    'NOT A WORD': { spell: progress() },
    snail: 7,
  },
});

describe('saving a Spell Book as a file', () => {
  it('names the file for the day, says what it is and who made it, and ends with a newline', () => {
    const file = exportBook(BOOK, AT);
    expect(file.filename).toBe('unicorn-academy-spell-book-2026-10-27.json');
    expect(file.text.endsWith('\n')).toBe(true);
    expect(JSON.parse(file.text)).toMatchObject({ app: 'unicorn-academy', kind: BOOK_KIND, format: 1, exportedAt: AT });
  });

  it('reads back as exactly the same book, and says when it was saved', () => {
    const back = parseBookFile(exportBook(BOOK, AT).text);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(sameProfile(back.profile, BOOK)).toBe(true);
    expect(back.savedAt).toBe(Date.parse(AT));
    expect(back.dropped).toBe(0);
  });

  it('holds only the book, and nothing that says who the player is or where they are', () => {
    const file = JSON.parse(exportBook(BOOK, AT).text) as Record<string, unknown>;
    expect(Object.keys(file).sort()).toEqual(['app', 'book', 'exportedAt', 'format', 'kind']);
    expect(Object.keys(file.book as object).sort()).toEqual(['schemaVersion', 'words']);
  });

  it('is small enough for a book at the limit to be read back, with every skill in every word', () => {
    const name = (i: number): string =>
      String.fromCharCode(97 + (i % 26), 97 + (Math.floor(i / 26) % 26), 97 + Math.floor(i / 676));
    const most = progress({ done: 999_999, clean: 999_999, slips: 999_999 });
    const words: Record<string, WordProgress> = {};
    for (let i = 0; i < 2000; i++) words[name(i)] = Object.fromEntries(SKILLS.map((skill) => [skill, most]));
    expect(Object.keys(words)).toHaveLength(2000);
    const text = exportBook({ schemaVersion: versionOf(words), words }, AT).text;
    // A skill that is added takes up room, and this fails until the limit has some for it.
    expect(text.length, 'the limit in `MAX_BOOK_CHARS` leaves room for every skill').toBeLessThan(MAX_BOOK_CHARS);
    const back = parseBookFile(text);
    expect(back.ok && Object.keys(back.profile.words).length).toBe(2000);
    expect(back.ok && sameProfile(back.profile, { schemaVersion: versionOf(words), words })).toBe(true);
  });

  it('is small enough for a book at the limit to be read back, with the most sentences there are as well', () => {
    const name = (i: number): string =>
      String.fromCharCode(97 + (i % 26), 97 + (Math.floor(i / 26) % 26), 97 + Math.floor(i / 676));
    const most = progress({ done: 999_999, clean: 999_999, slips: 999_999 });
    const words: Record<string, WordProgress> = {};
    for (let i = 0; i < 2000; i++) words[name(i)] = Object.fromEntries(SKILLS.map((skill) => [skill, most]));
    // The longest ids the game accepts, which is more than any sentence of the course has.
    const sentences: Record<string, typeof most> = {};
    for (let i = 0; i < MAX_SENTENCES; i++) sentences[`${name(i)}-${'abcdefghijkl-'.repeat(2)}${name(i + 1)}`] = most;
    expect(Object.keys(sentences)).toHaveLength(MAX_SENTENCES);
    const book: LearnerProfile = { schemaVersion: 3, words, sentences, floor: 99 };
    const text = exportBook(book, AT).text;
    expect(text.length, 'the limit in `MAX_BOOK_CHARS` leaves room for the sentences too').toBeLessThan(MAX_BOOK_CHARS);
    const back = parseBookFile(text);
    expect(back.ok && Object.keys(back.profile.sentences ?? {}).length).toBe(MAX_SENTENCES);
    expect(back.ok && back.dropped).toBe(0);
    expect(back.ok && sameProfile(back.profile, book)).toBe(true);
  });

  it('holds the sentences and the floor when there are some, and says so in the version', () => {
    const book = raiseFloor(withSentence(BOOK, 'the-cat-sat', progress({ level: 2, best: 2 })), 4);
    const file = JSON.parse(exportBook(book, AT).text) as { book: Record<string, unknown> };
    expect(Object.keys(file.book).sort()).toEqual(['floor', 'schemaVersion', 'sentences', 'words']);
    expect(file.book.schemaVersion).toBe(3);
    const back = parseBookFile(exportBook(book, AT).text);
    expect(back.ok && sameProfile(back.profile, book)).toBe(true);
  });
});

describe('reading a Spell Book from a file', () => {
  it('takes a bare book too, which is what the copy put aside under Recovery holds, so a book that was started over can come back', () => {
    const back = parseBookFile(JSON.stringify(BOOK));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(sameProfile(back.profile, BOOK)).toBe(true);
    expect(back.savedAt).toBeNull();
  });

  it('takes a book that has sentences and a floor but no words as a book, and one with nothing at all as nothing', () => {
    const only = raiseFloor(withSentence({ schemaVersion: 1, words: {} }, 'the-cat-sat', progress()), 3);
    const back = parseBookFile(exportBook(only, AT).text);
    expect(back.ok && sameProfile(back.profile, only)).toBe(true);
    const floorOnly = raiseFloor({ schemaVersion: 1, words: {} }, 3);
    expect(parseBookFile(exportBook(floorOnly, AT).text).ok).toBe(true);
    expect(parseBookFile(JSON.stringify({ schemaVersion: 3, words: {}, sentences: {} }))).toEqual({
      ok: false,
      reason: expect.stringMatching(/no words in it/),
    });
  });

  it('keeps the words it can read and counts the things it could not, so one bad entry does not cost the player the rest', () => {
    for (const text of [
      JSON.stringify(damaged()),
      JSON.stringify({ app: 'unicorn-academy', kind: BOOK_KIND, format: 1, exportedAt: AT, book: damaged() }),
    ]) {
      const back = parseBookFile(text);
      expect(back.ok).toBe(true);
      if (!back.ok) continue;
      expect(Object.keys(back.profile.words)).toEqual(['frog']);
      expect(back.dropped).toBe(3);
    }
  });

  it('does not know when a file was saved if it says something that is not a date', () => {
    const file = JSON.parse(exportBook(BOOK, AT).text) as Record<string, unknown>;
    for (const exportedAt of ['last Tuesday', 12, null]) {
      const back = parseBookFile(JSON.stringify({ ...file, exportedAt }));
      expect(back.ok && back.savedAt).toBeNull();
      expect(back.ok).toBe(true);
    }
  });

  it('refuses what is not a Spell Book, in words a parent can read', () => {
    const refused: Array<[string, string, RegExp]> = [
      ['text that is not JSON', 'hello', /not a Spell Book.*could not be read/],
      ['nothing', '', /not a Spell Book.*could not be read/],
      ['a list', '[1, 2]', /not a Spell Book/],
      ['a number', '42', /not a Spell Book/],
      ['null', 'null', /not a Spell Book/],
      ['an object that is something else', '{"hello": 1}', /Nothing in that file could be read/],
      ['a book with no words in it', JSON.stringify({ schemaVersion: 1, words: {} }), /no words in it/],
      [
        'a book whose every word is unreadable',
        JSON.stringify({ schemaVersion: 1, words: { frog: { spell: { level: 'high' } } } }),
        /Nothing in that file could be read/,
      ],
      [
        'a wrapper with no book',
        JSON.stringify({ app: 'unicorn-academy', kind: BOOK_KIND, format: 1, exportedAt: AT }),
        /not a Spell Book/,
      ],
      [
        'a wrapper whose book is a list',
        JSON.stringify({ app: 'unicorn-academy', kind: BOOK_KIND, format: 1, exportedAt: AT, book: [] }),
        /not a Spell Book/,
      ],
      [
        'a wrapper with a format it does not know',
        JSON.stringify({ app: 'unicorn-academy', kind: BOOK_KIND, format: 0, exportedAt: AT, book: BOOK }),
        /not a Spell Book/,
      ],
    ];
    for (const [what, text, reason] of refused) {
      const back = parseBookFile(text);
      expect(back.ok, what).toBe(false);
      if (!back.ok) expect(back.reason, what).toMatch(reason);
    }
  });

  it('says to update the app when the file is from a newer version, whether it is wrapped or bare', () => {
    for (const text of [
      JSON.stringify({ app: 'unicorn-academy', kind: BOOK_KIND, format: 2, exportedAt: AT, book: BOOK }),
      JSON.stringify({ ...BOOK, schemaVersion: PROFILE_VERSION + 1 }),
    ]) {
      const back = parseBookFile(text);
      expect(back).toEqual({ ok: false, reason: expect.stringMatching(/newer version.*Update the app/) });
    }
  });

  it('says a saved world is a world, whether it is the file or the bare save, and the world side says the same about a Spell Book', () => {
    const world = { schemaVersion: 1, mapId: 'forest', recruited: ['leaf'], visitedMaps: ['forest'] };
    for (const text of [
      JSON.stringify(world),
      JSON.stringify({ app: 'unicorn-academy', format: 1, exportedAt: AT, save: world }),
    ]) {
      const back = parseBookFile(text);
      expect(back).toEqual({ ok: false, reason: expect.stringMatching(/saved world, not a Spell Book.*Recovery/) });
    }
    const theOtherWay = parseImport(exportBook(BOOK, AT).text);
    expect(theOtherWay).toEqual({ ok: false, reason: expect.stringMatching(/Spell Book, not a world.*Learning/) });
  });

  it('refuses a file that is too big before it reads any of it', () => {
    const back = parseBookFile(' '.repeat(MAX_BOOK_CHARS + 1));
    expect(back).toEqual({ ok: false, reason: expect.stringMatching(/too big/) });
  });

  it('does not let a word named for something every object has, or a key that points at the prototype, do anything', () => {
    const text =
      '{"schemaVersion":1,"words":{"constructor":{"spell":' +
      JSON.stringify(progress()) +
      '},"__proto__":{"spell":' +
      JSON.stringify(progress()) +
      '},"frog":{"spell":' +
      JSON.stringify(progress()) +
      '}}}';
    const back = parseBookFile(text);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(Object.keys(back.profile.words).sort()).toEqual(['constructor', 'frog']);
    expect(back.dropped).toBe(1);
    expect(({} as Record<string, unknown>).spell).toBeUndefined();
    const merged = mergeProfiles(BOOK, back.profile);
    expect(Object.keys(merged.words).sort()).toEqual(['bird', 'constructor', 'frog', 'unicorn']);
  });
});

describe('adding a file to a book', () => {
  const OTHER: LearnerProfile = profileOf({
    frog: { level: 2, best: 2, due: T0 + HOUR, done: 2, last: T0 + 5 * DAY },
    snail: { level: 1, best: 1, done: 1 },
  });

  it('brings in the words the player does not have, keeps every star the player has earned, and takes nothing away', () => {
    const file = parseBookFile(exportBook(OTHER, AT).text);
    if (!file.ok) throw new Error('the file should read');
    const merged = mergeProfiles(BOOK, file.profile);
    expect(Object.keys(merged.words).sort()).toEqual(['bird', 'frog', 'snail', 'unicorn']);
    expect(merged.words.frog?.spell?.best).toBe(5);
    expect(merged.words.frog?.spell?.done).toBe(6);
  });

  it('gives the same book whichever way round the two are put together, and when the same file is added again', () => {
    const file = parseBookFile(exportBook(OTHER, AT).text);
    if (!file.ok) throw new Error('the file should read');
    const once = mergeProfiles(BOOK, file.profile);
    expect(sameProfile(mergeProfiles(file.profile, BOOK), once)).toBe(true);
    expect(sameProfile(mergeProfiles(once, file.profile), once)).toBe(true);
  });

  it('changes nothing when the file holds only what the book already has', () => {
    const file = parseBookFile(exportBook(BOOK, AT).text);
    if (!file.ok) throw new Error('the file should read');
    expect(sameProfile(mergeProfiles(BOOK, file.profile), BOOK)).toBe(true);
  });

  it('survives the trip through the same gate the device record is read with', () => {
    const file = parseBookFile(exportBook(OTHER, AT).text);
    if (!file.ok) throw new Error('the file should read');
    const read = readProfile(mergeProfiles(BOOK, file.profile));
    expect(read).toMatchObject({ newer: false, dropped: 0 });
  });
});
