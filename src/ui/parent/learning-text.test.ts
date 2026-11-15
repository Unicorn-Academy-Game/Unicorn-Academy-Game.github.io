import { describe, expect, it } from 'vitest';
import { PAGES, WORD_IDS } from '../../content/lexicon';
import {
  type BookFile,
  emptyProfile,
  GAP,
  type LearnerProfile,
  STARS_PER_WORD,
  starsOf,
  withProgress,
} from '../../learning';
import { ASK_RATES, type Progress } from '../../shared/learning';
import {
  ASK_LABELS,
  addBlock,
  askDescription,
  CASE_LABELS,
  describeSpan,
  factsOf,
  HELP_LABELS,
  helpDescription,
  KEYBOARD_LABELS,
  keepingLine,
  previewFile,
  reportOf,
  saveBlock,
  startNewBlock,
  startNewSaid,
  trickyNote,
} from './learning-text';
import type { StartNewResult } from './services';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-10-27T15:00:00Z');

describe('a length of time', () => {
  it('speaks in the steps a parent would', () => {
    expect(describeSpan(1_000)).toBe('1 second');
    expect(describeSpan(8_000)).toBe('8 seconds');
    expect(describeSpan(30_000)).toBe('30 seconds');
    expect(describeSpan(60_000)).toBe('a minute');
    expect(describeSpan(89_000)).toBe('a minute');
    expect(describeSpan(2 * MINUTE)).toBe('2 minutes');
    expect(describeSpan(10 * MINUTE)).toBe('10 minutes');
    expect(describeSpan(44 * MINUTE)).toBe('44 minutes');
    expect(describeSpan(45 * MINUTE)).toBe('an hour');
    expect(describeSpan(HOUR)).toBe('an hour');
    expect(describeSpan(89 * MINUTE)).toBe('an hour');
    expect(describeSpan(90 * MINUTE)).toBe('2 hours');
    expect(describeSpan(5 * HOUR)).toBe('5 hours');
    expect(describeSpan(22 * HOUR)).toBe('a day');
    expect(describeSpan(DAY)).toBe('a day');
    expect(describeSpan(36 * HOUR)).toBe('2 days');
    expect(describeSpan(3 * DAY)).toBe('3 days');
    expect(describeSpan(14 * DAY)).toBe('14 days');
  });

  it('never goes below nothing', () => {
    expect(describeSpan(-5_000)).toBe('0 seconds');
  });
});

describe('the choices', () => {
  it('say how often from the spacing the engine keeps, so the page cannot drift from the game', () => {
    const text = askDescription();
    for (const rate of ASK_RATES) expect(text).toContain(describeSpan(GAP[rate]));
    expect(text).toContain('8 seconds if often, 30 seconds if sometimes, 2 minutes if rarely');
  });

  it('say what each start of help shows, from the rungs the card reads', () => {
    const text = helpDescription();
    expect(text).toContain('A lot: every letter is shown faintly and the next key glows.');
    expect(text).toContain('Some: the word is shown above the empty places.');
    expect(text).toContain('A little: only the first letter is shown.');
  });

  it('name every option once', () => {
    for (const labels of [KEYBOARD_LABELS, CASE_LABELS, HELP_LABELS, ASK_LABELS]) {
      const names = Object.values(labels);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});

describe('where the book is going', () => {
  it('is kept on the device, and says where it is not', () => {
    expect(keepingLine('device', 'kept')).toEqual({
      tone: 'good',
      title: 'Kept on this device',
      detail: 'The Spell Book is saved here as your child plays.',
    });
  });

  it('says what the browser has promised about keeping it, and says nothing when the browser has said nothing', () => {
    const promised = keepingLine('device', 'kept', 'promised');
    expect(promised).toMatchObject({ tone: 'good', title: 'Kept on this device' });
    expect(promised.detail).toContain('This browser has promised not to clear it.');
    const not = keepingLine('device', 'kept', 'not-promised');
    expect(not.tone, 'the book is being kept, so this is a thing to know and not an alarm').toBe('good');
    expect(not.detail).toContain('has not promised to keep it');
    expect(not.detail, 'what a parent can do about it').toMatch(/Home Screen.*saving a copy/);
    expect(keepingLine('device', 'kept', 'unknown')).toEqual(keepingLine('device', 'kept'));
    // Only a book that is going to the device has a promise to talk about.
    for (const keeping of ['page', 'newer', 'unreadable'] as const)
      expect(keepingLine(keeping, 'kept', 'promised').detail).not.toContain('promised');
  });

  it('is kept when each visit starts from the beginning, because only the world starts over', () => {
    const line = keepingLine('device', 'fresh');
    expect(line.tone).toBe('good');
    expect(line.detail).toContain('kept even though each visit starts from the beginning');
  });

  it('is not kept in an incognito visit, whatever else is true', () => {
    for (const keeping of ['device', 'page', 'newer', 'unreadable'] as const) {
      expect(keepingLine(keeping, 'incognito')).toMatchObject({ tone: 'info', title: 'Incognito: nothing is kept' });
    }
  });

  it('warns plainly when the browser cannot keep it, and when the record is locked', () => {
    expect(keepingLine('page', 'kept')).toMatchObject({ tone: 'warn', title: 'Not being kept' });
    expect(keepingLine('newer', 'kept')).toMatchObject({
      tone: 'warn',
      title: 'A newer version wrote this Spell Book',
    });
    expect(keepingLine('unreadable', 'kept')).toMatchObject({
      tone: 'warn',
      title: 'This device would not give up the Spell Book',
    });
    expect(keepingLine('unreadable', 'kept').detail).toContain('nothing was deleted');
  });

  it('can be started again only when there is something kept to put away', () => {
    expect(startNewBlock('device', 'kept', 3)).toBeNull();
    expect(startNewBlock('device', 'fresh', 3)).toBeNull();
    expect(startNewBlock('page', 'kept', 3), 'a browser with no storage can still clear what is held').toBeNull();
    expect(startNewBlock('device', 'kept', 0)).toContain('no words');
    expect(startNewBlock('device', 'incognito', 3)).toContain('incognito');
    expect(startNewBlock('newer', 'kept', 3)).toContain('cannot be changed');
    expect(startNewBlock('unreadable', 'kept', 3)).toContain('cannot be changed');
  });
});

describe('what a parent is told after asking for a new book', () => {
  it('is good only when the new book is started', () => {
    expect(startNewSaid('started')).toEqual({ text: 'A new Spell Book is started.', tone: 'good' });
    expect(startNewSaid('refused').tone).toBe('warn');
  });

  it('says that the book was left as it was when nothing was started', () => {
    expect(startNewSaid('refused').text).toContain('left as it was');
  });

  it('says each thing differently, so a parent can tell them apart', () => {
    const results: StartNewResult[] = ['started', 'refused'];
    expect(new Set(results.map((r) => startNewSaid(r).text)).size).toBe(results.length);
  });
});

const progress = (over: Partial<Progress>): Progress => ({
  level: 0,
  best: 0,
  streak: 0,
  struggles: 0,
  due: NOW,
  done: 1,
  clean: 1,
  slips: 0,
  first: NOW - DAY,
  last: NOW,
  ...over,
});
const book = (...entries: [string, Partial<Progress>][]): LearnerProfile =>
  entries.reduce((profile, [word, over]) => withProgress(profile, word, 'spell', progress(over)), emptyProfile());

describe('how the child is doing', () => {
  const MEADOW = PAGES[0]!;
  const FIVE = ['bird', 'frog', 'bunny', 'snail', 'ladybug'];
  const REST = MEADOW.words.filter((word) => !FIVE.includes(word));
  const profile = book(
    ['bird', { level: 3, best: 3, due: NOW - 1, done: 3, slips: 6 }],
    ['frog', { level: 5, best: 5, due: NOW + 14 * DAY, done: 2 }],
    ['bunny', { level: 1, best: 1, due: NOW + 10 * MINUTE, done: 2, slips: 3 }],
    ['snail', { level: 0, best: 0, due: NOW, done: 1, slips: 5 }],
    ['ladybug', { level: 2, best: 2, due: NOW + HOUR, done: 4, slips: 1 }],
    ['carrot', { level: 4, best: 4, due: NOW + DAY, done: 2 }],
    ...REST.map((word): [string, Partial<Progress>] => [word, { level: 1, best: 1, due: NOW + DAY }]),
  );
  const report = reportOf(profile, NOW);
  const FOUND = 6 + REST.length;
  const STARS = FOUND * STARS_PER_WORD;

  it('counts words, stars and finished pages over the whole book', () => {
    expect(report).toMatchObject({
      found: FOUND,
      total: WORD_IDS.length,
      stars: STARS,
      mostStars: WORD_IDS.length * STARS_PER_WORD,
      pagesDone: 1,
      ready: 2,
    });
    expect(report.pages).toHaveLength(PAGES.length);
  });

  it('lists the words that were found, page by page, in the order of the page, with when each comes back', () => {
    const meadow = report.pages[0]!;
    expect(meadow).toMatchObject({
      title: 'The Meadow',
      found: MEADOW.words.length,
      total: MEADOW.words.length,
      complete: true,
    });
    expect(meadow.words.slice(0, FIVE.length)).toEqual([
      { word: 'bird', stars: STARS_PER_WORD, level: 'Nearly there', again: 'Ready to be asked again' },
      { word: 'frog', stars: STARS_PER_WORD, level: 'A master', again: 'Asked again in 14 days' },
      { word: 'bunny', stars: STARS_PER_WORD, level: 'Learning', again: 'Asked again in 10 minutes' },
      { word: 'snail', stars: STARS_PER_WORD, level: 'Just met', again: 'Ready to be asked again' },
      { word: 'ladybug', stars: STARS_PER_WORD, level: 'Getting it', again: 'Asked again in an hour' },
    ]);
    expect(meadow.words.slice(FIVE.length).map((w) => w.word)).toEqual(REST);
    const orchard = report.pages.find((page) => page.title === 'The Orchard')!;
    expect(orchard).toMatchObject({ found: 1, complete: false });
    expect(orchard.words.map((w) => w.word)).toEqual(['carrot']);
  });

  it('names the trickiest words by wrong keys for each time they were spelled, and needs two spells before it counts', () => {
    expect(report.tricky).toEqual(['bird', 'bunny', 'ladybug']);
    expect(report.tricky, 'snail took 5 wrong keys in one spell, which says nothing yet').not.toContain('snail');
  });

  it('puts the numbers in a few short facts', () => {
    expect(factsOf(report)).toEqual([
      { label: 'Words found', value: `${FOUND} of ${WORD_IDS.length}` },
      { label: 'Stars', value: `${STARS} of ${WORD_IDS.length * STARS_PER_WORD}` },
      { label: 'Pages finished', value: `1 of ${PAGES.length}` },
      { label: 'Ready to be asked again', value: '2 words' },
      { label: 'Trickiest words', value: 'bird, bunny, ladybug' },
    ]);
  });

  it('reads an empty book as an empty book, with no trickiest words to list', () => {
    const empty = reportOf(emptyProfile(), NOW);
    expect(empty).toMatchObject({ found: 0, stars: 0, pagesDone: 0, ready: 0, tricky: [] });
    expect(empty.pages.every((page) => page.words.length === 0)).toBe(true);
    expect(factsOf(empty)).toEqual([
      { label: 'Words found', value: `0 of ${WORD_IDS.length}` },
      { label: 'Stars', value: `0 of ${WORD_IDS.length * STARS_PER_WORD}` },
      { label: 'Pages finished', value: `0 of ${PAGES.length}` },
      { label: 'Ready to be asked again', value: 'None' },
    ]);
  });

  it('says one word when one is ready', () => {
    expect(factsOf(reportOf(book(['bird', { due: NOW - 5 }]), NOW))).toContainEqual({
      label: 'Ready to be asked again',
      value: '1 word',
    });
  });

  it('counts the most stars a word can earn by what the engine gives a word that has just been met', () => {
    expect(starsOf(progress({ level: 0, best: 0 }))).toBe(STARS_PER_WORD);
  });
});

describe('what is stored of reading, for the spelling page', () => {
  const spelled = book(['bird', {}], ['frog', {}], ['bunny', {}], ['snail', {}], ['ladybug', {}], ['apple', {}]);
  const read = ['bird', 'frog', 'bunny'].reduce(
    (next, word) => withProgress(next, word, 'read', progress({ level: 3, best: 3, done: 5, slips: 4 })),
    spelled,
  );

  it('does not change what is said about spelling: a word that has been read is reported as spelled, with the facts the same', () => {
    expect(reportOf(read, NOW)).toEqual(reportOf(spelled, NOW));
    expect(factsOf(reportOf(read, NOW))).toEqual(factsOf(reportOf(spelled, NOW)));
  });

  it('does not make a word tricky to spell: its slips in reading are not its slips in spelling', () => {
    expect(reportOf(read, NOW).tricky).toEqual([]);
    expect(trickyNote(reportOf(read, NOW))).toBeNull();
  });

  it('explains the list of trickiest words when there is one', () => {
    const slippy = withProgress(read, 'ladybug', 'spell', progress({ level: 2, best: 2, done: 4, slips: 8 }));
    expect(reportOf(slippy, NOW).tricky).toEqual(['ladybug']);
    expect(trickyNote(reportOf(slippy, NOW))).toBe(
      'The trickiest words are the ones that took the most wrong keys each time they were spelled.',
    );
  });
});

describe('keeping a copy', () => {
  it('can be added to only where the book is kept, and says why not otherwise', () => {
    expect(addBlock('device', 'kept')).toBeNull();
    expect(addBlock('device', 'fresh'), 'each visit starting over leaves the book alone, so it is kept').toBeNull();
    expect(addBlock('device', 'incognito')).toContain('incognito');
    expect(addBlock('page', 'incognito'), 'incognito is said first').toContain('incognito');
    expect(addBlock('page', 'kept')).toContain('cannot keep the Spell Book');
    expect(addBlock('newer', 'kept')).toContain('cannot be changed');
    expect(addBlock('unreadable', 'fresh')).toContain('cannot be changed');
  });

  it('can be saved once there is a word to save', () => {
    expect(saveBlock(0)).toContain('no words');
    expect(saveBlock(1)).toBeNull();
  });

  const have = book(['bird', { level: 3, best: 3 }], ['frog', { level: 5, best: 5 }]);
  const file = (
    profile: LearnerProfile,
    over: Partial<Extract<BookFile, { ok: true }>> = {},
  ): Extract<BookFile, { ok: true }> => ({ ok: true, profile, savedAt: null, dropped: 0, ...over });

  it('shows what is in a file, which of it is new, and that adding takes nothing away', () => {
    const preview = previewFile(
      have,
      file(book(['snail', { level: 1, best: 1 }], ['frog', { level: 2, best: 2 }], ['bunny', { level: 4, best: 4 }])),
      NOW,
    );
    expect(preview.adds).toBe(true);
    expect(preview).toMatchObject({ tone: 'good', title: 'This file holds a Spell Book' });
    expect(preview.detail).toContain(`3 words and ${3 * STARS_PER_WORD} stars.`);
    expect(preview.detail).toContain('2 words are not in the Spell Book yet.');
    expect(preview.detail).toContain('never takes a word or a star away');
  });

  it('says one word in the singular, and says when the file was saved', () => {
    const preview = previewFile(have, file(book(['snail', { level: 0, best: 0 }]), { savedAt: NOW - 5 * MINUTE }), NOW);
    expect(preview.detail).toContain(`1 word and ${STARS_PER_WORD} stars, saved 5 minutes ago.`);
    expect(preview.detail).toContain('1 word is not in the Spell Book yet.');
  });

  it('says so when the book has all the words and the file only brings them up to date', () => {
    const preview = previewFile(have, file(book(['frog', { level: 5, best: 5, done: 9, last: NOW + HOUR }])), NOW);
    expect(preview.adds).toBe(true);
    expect(preview.detail).toContain('The Spell Book has all of these words already');
  });

  it('is not offered when the file holds only what the book has', () => {
    const preview = previewFile(have, file(book(['bird', { level: 3, best: 3 }])), NOW);
    expect(preview).toMatchObject({ adds: false, tone: 'info', title: 'The Spell Book has all of this already' });
    expect(previewFile(have, file(have), NOW).adds).toBe(false);
  });

  it('counts what could not be read, so a parent knows the file was not whole', () => {
    expect(previewFile(have, file(book(['snail', {}]), { dropped: 1 }), NOW).detail).toContain(
      '1 thing in the file could not be read, and was left out.',
    );
    expect(previewFile(have, file(book(['snail', {}]), { dropped: 3 }), NOW).detail).toContain(
      '3 things in the file could not be read, and were left out.',
    );
    expect(previewFile(have, file(have, { dropped: 2 }), NOW).detail).toContain(
      '2 things in the file could not be read',
    );
  });

  it('counts a word named for something every object has as a new word, and not as one the book has', () => {
    const preview = previewFile(have, file(book(['constructor', {}])), NOW);
    expect(preview.detail).toContain('1 word is not in the Spell Book yet.');
  });
});

describe('the words on the page', () => {
  it('use no long dashes and no curly quotes', () => {
    const lines = (['device', 'page', 'newer', 'unreadable'] as const).flatMap((k) =>
      (['kept', 'fresh', 'incognito'] as const).flatMap((v) =>
        (['promised', 'not-promised', 'unknown'] as const).map((d) => keepingLine(k, v, d)),
      ),
    );
    const reasons = (['device', 'page', 'newer', 'unreadable'] as const).flatMap((k) =>
      (['kept', 'incognito'] as const).flatMap((v) => [startNewBlock(k, v, 0), startNewBlock(k, v, 4)]),
    );
    const adding = (['device', 'page', 'newer', 'unreadable'] as const).flatMap((k) =>
      (['kept', 'fresh', 'incognito'] as const).map((v) => addBlock(k, v)),
    );
    const have = book(['bird', {}]);
    const previews = [
      previewFile(
        have,
        { ok: true, profile: book(['frog', {}], ['snail', {}]), savedAt: NOW - 2 * DAY, dropped: 2 },
        NOW,
      ),
      previewFile(have, { ok: true, profile: have, savedAt: null, dropped: 1 }, NOW),
    ];
    const said = (['started', 'refused'] as const).map((r) => startNewSaid(r).text);
    const text = [
      ...said,
      ...lines.flatMap((l) => [l.title, l.detail ?? '']),
      ...reasons.filter((r): r is string => r !== null),
      ...adding.filter((r): r is string => r !== null),
      saveBlock(0) ?? '',
      ...previews.flatMap((p) => [p.title, p.detail]),
      askDescription(),
      helpDescription(),
      ...[KEYBOARD_LABELS, CASE_LABELS, HELP_LABELS, ASK_LABELS].flatMap((labels) => Object.values(labels)),
    ].join('\n');
    expect(text).not.toMatch(/[\u2013\u2014\u2018\u2019\u201C\u201D]/);
  });
});
