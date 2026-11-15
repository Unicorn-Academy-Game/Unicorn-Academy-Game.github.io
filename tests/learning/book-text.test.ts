import { describe, expect, it } from 'vitest';
import { PAGES, WORD_IDS } from '../../src/content/lexicon';
import { BOOK_LABELS, chipLabel, tabLabel, totalLabel, wordLabel } from '../../src/ui/learning/book-text';
import { bookView, type TabView, type WordView } from '../../src/ui/learning/book-view';
import { collect, DAY, profileOf, T0 } from './helpers';

/**
 * Words that tell a child something is wrong, or that they have failed, and that a young child
 * should not meet in the book.
 */
const UNKIND =
  /\b(wrong|fail|failed|failure|bad|no|incorrect|mistakes?|errors?|oops|sorry|lose|lost|missing|empty|try again)\b/i;

const word = (patch: Partial<WordView> = {}): WordView => ({
  word: 'frog',
  found: true,
  stars: 5,
  due: false,
  newest: false,
  letters: 4,
  portrait: false,
  reads: false,
  ...patch,
});
const tab = (patch: Partial<TabView> = {}): TabView => ({
  id: 'meadow',
  title: 'The Meadow',
  emblem: 'frog',
  portrait: false,
  collected: 3,
  total: 5,
  complete: false,
  current: false,
  ...patch,
});

describe('what a screen reader is told about the book', () => {
  it('names the button in the corner and says how much of the book is full', () => {
    expect(chipLabel(12, 34)).toBe('Open my Spell Book. 12 of 34 words.');
    expect(totalLabel(12, 34, 60)).toBe('12 of 34 words, 60 stars');
    expect(totalLabel(1, 34, 5)).toBe('1 of 34 words, 5 stars');
  });

  it('names a word that was found, with its stars, when it is ready again, and that it can be spelled again', () => {
    expect(wordLabel(word())).toBe('frog. 5 of 5 stars. Spell it again');
    expect(wordLabel(word({ due: true }))).toBe('frog. 5 of 5 stars. Ready to spell again. Spell it again');
  });

  it('says which word is the newest, because the sparkle on it is only a picture', () => {
    expect(wordLabel(word({ newest: true }))).toBe('frog. 5 of 5 stars. The newest word. Spell it again');
    expect(wordLabel(word({ newest: true, due: true }))).toBe(
      'frog. 5 of 5 stars. The newest word. Ready to spell again. Spell it again',
    );
  });

  it('says which words are read on their own, because the glasses on them are only a picture', () => {
    expect(wordLabel(word({ reads: true }))).toBe('frog. 5 of 5 stars. Read on its own. Spell it again');
    expect(wordLabel(word({ newest: true, due: true, reads: true }))).toBe(
      'frog. 5 of 5 stars. The newest word. Ready to spell again. Read on its own. Spell it again',
    );
  });

  it('does not name a word that was not found, because the name would be the answer, and says how long it is and that it will show where', () => {
    for (const w of WORD_IDS)
      expect(wordLabel(word({ word: w, found: false, stars: 0, letters: w.length })).toLowerCase(), w).not.toContain(w);
    expect(wordLabel(word({ word: 'frog', found: false, stars: 0, letters: 4 }))).toBe(
      'A word with 4 letters, waiting to be found. Show me where',
    );
  });

  it('names a page with how much of it is found, and says when all of it is', () => {
    expect(tabLabel(tab())).toBe('The Meadow. 3 of 5 found');
    expect(tabLabel(tab({ collected: 5, complete: true }))).toBe('The Meadow. 5 of 5 found. Every word found');
  });

  it('never says anything was wrong, lost or missing, for any page or word in any state', () => {
    for (const label of Object.values(BOOK_LABELS)) expect(label).not.toMatch(UNKIND);
    expect(chipLabel(0, WORD_IDS.length)).not.toMatch(UNKIND);
    expect(totalLabel(0, WORD_IDS.length, 0)).not.toMatch(UNKIND);
    const nothing = profileOf({});
    const some = profileOf({ frog: { due: T0 - 1 }, duck: { level: 5, best: 5, due: T0 + DAY } });
    const all = collect(WORD_IDS);
    for (const profile of [nothing, some, all]) {
      for (const page of PAGES) {
        const view = bookView(profile, T0 + DAY, page.id);
        for (const t of view.tabs) expect(tabLabel(t), t.id).not.toMatch(UNKIND);
        for (const w of view.page.words) expect(wordLabel(w), w.word).not.toMatch(UNKIND);
      }
    }
  });

  it('is short enough to be heard in one breath', () => {
    // The newest word that is also ready again says two things more than the rest, so it is allowed
    // ten more letters.
    for (const page of PAGES)
      for (const w of bookView(collect(WORD_IDS), T0 + DAY, page.id).page.words)
        expect(wordLabel(w).length, w.word).toBeLessThanOrEqual(w.newest ? 80 : 70);
    const longest = [...WORD_IDS].sort((a, b) => b.length - a.length)[0]!;
    expect(
      wordLabel(word({ word: longest, letters: longest.length, stars: 5, newest: true, due: true })).length,
      longest,
    ).toBeLessThanOrEqual(80);
    // One that is read on its own says one thing more, and is allowed what it takes.
    expect(
      wordLabel(word({ word: longest, letters: longest.length, stars: 5, newest: true, due: true, reads: true }))
        .length,
      longest,
    ).toBeLessThanOrEqual(100);
    for (const t of bookView(collect(WORD_IDS), T0, 'meadow').tabs)
      expect(tabLabel(t).length, t.id).toBeLessThanOrEqual(60);
  });
});
