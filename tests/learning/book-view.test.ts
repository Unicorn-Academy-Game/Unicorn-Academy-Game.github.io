import { describe, expect, it } from 'vitest';
import { PAGES, type PageId, WORD_IDS } from '../../src/content/lexicon';
import { emptyProfile, READS_FROM, STARS_PER_WORD } from '../../src/learning';
import { bookView, dotsAcross, FIRST_PAGE, latestPage, newestWord, turned } from '../../src/ui/learning/book-view';
import { collect, DAY, HOUR, profileOf, T0, withRead } from './helpers';

const MEADOW = PAGES[0];
const LAST = PAGES[PAGES.length - 1]!.id;

describe('a new Spell Book', () => {
  it('opens on the first page with a place for every word of it and none of them found', () => {
    const { page } = bookView(emptyProfile(), T0, FIRST_PAGE);
    expect(page).toMatchObject({
      id: 'meadow',
      title: 'The Meadow',
      collected: 0,
      total: MEADOW.words.length,
      complete: false,
    });
    expect(page.words.map((w) => w.word)).toEqual([...MEADOW.words]);
    for (const w of page.words)
      expect(w).toEqual({
        word: w.word,
        found: false,
        stars: 0,
        due: false,
        newest: false,
        letters: w.word.length,
        portrait: false,
        reads: false,
      });
  });

  it('has a tab for every page in order, with the page it is open at marked, and nothing found on any', () => {
    const { tabs } = bookView(emptyProfile(), T0, 'orchard');
    expect(tabs.map((t) => t.id)).toEqual(PAGES.map((p) => p.id));
    expect(tabs.filter((t) => t.current).map((t) => t.id)).toEqual(['orchard']);
    for (const [i, tab] of tabs.entries())
      expect(tab).toMatchObject({
        title: PAGES[i]!.title,
        emblem: PAGES[i]!.emblem,
        collected: 0,
        total: PAGES[i]!.words.length,
        complete: false,
      });
  });

  it('draws the emblem of the friends page in a round frame, and no other emblem', () => {
    expect(bookView(emptyProfile(), T0, FIRST_PAGE).tabs.map((t) => [t.id, t.portrait])).toEqual(
      PAGES.map((p) => [p.id, p.id === 'friends']),
    );
  });

  it('counts the whole book at the top, the same on every page', () => {
    for (const page of PAGES)
      expect(bookView(emptyProfile(), T0, page.id)).toMatchObject({ collected: 0, total: WORD_IDS.length, stars: 0 });
  });

  it('opens the first page for a page the book no longer has, so it is never blank', () => {
    const view = bookView(emptyProfile(), T0, 'taken-out' as PageId);
    expect(view.page.id).toBe(FIRST_PAGE);
    expect(view.tabs.filter((t) => t.current).map((t) => t.id)).toEqual([FIRST_PAGE]);
  });
});

describe('a word the player has spelled', () => {
  const profile = profileOf({
    bird: { level: 1, best: 1, due: T0 + DAY },
    frog: { level: 4, best: 4, due: T0 - 1 },
    bunny: { level: 5, best: 5, due: T0 + DAY },
  });

  it('is found, with its stars, and says when it is time to spell it again', () => {
    const { page } = bookView(profile, T0, 'meadow');
    expect(page.words.map((w) => [w.word, w.found, w.stars, w.due])).toEqual([
      ['bird', true, STARS_PER_WORD, false],
      ['frog', true, STARS_PER_WORD, true],
      ['bunny', true, STARS_PER_WORD, false],
      ...MEADOW.words.slice(3).map((word) => [word, false, 0, false]),
    ]);
  });

  it('counts on its page and on its tab, and in the whole book', () => {
    const view = bookView(profile, T0, 'meadow');
    expect(view.page).toMatchObject({ collected: 3, total: MEADOW.words.length, complete: false });
    expect(view.tabs[0]).toMatchObject({ collected: 3, total: MEADOW.words.length, complete: false });
    expect(view.tabs[1]).toMatchObject({ collected: 0, complete: false });
    expect(view).toMatchObject({ collected: 3, stars: 3 * STARS_PER_WORD });
  });

  it('is not due again until its time has come, and is due from the moment it has', () => {
    const early = bookView(profile, T0 + DAY - 1, 'meadow').page.words.find((w) => w.word === 'bird')!;
    const ready = bookView(profile, T0 + DAY, 'meadow').page.words.find((w) => w.word === 'bird')!;
    expect([early.due, ready.due]).toEqual([false, true]);
  });

  it('keeps its place and its stars whichever page is open, because the tabs tell the whole book', () => {
    const away = bookView(profile, T0, 'orchard');
    expect(away.tabs[0]).toMatchObject({ collected: 3, current: false });
    expect(away.page.words.every((w) => !w.found)).toBe(true);
  });
});

describe('a page the player has finished', () => {
  it('is complete on its page and on its tab, and no other page is', () => {
    const whole = collect(MEADOW.words);
    const view = bookView(whole, T0, 'meadow');
    expect(view.page).toMatchObject({ complete: true, collected: MEADOW.words.length });
    expect(view.tabs.map((t) => t.complete)).toEqual(PAGES.map((p) => p.id === 'meadow'));
  });

  it('is not complete with one word missing', () => {
    const view = bookView(collect(MEADOW.words.slice(1)), T0, 'meadow');
    expect(view.page).toMatchObject({ complete: false, collected: MEADOW.words.length - 1 });
  });
});

describe('the friends page', () => {
  it('draws the friends as portraits and nothing else is drawn that way', () => {
    for (const page of PAGES) {
      const portraits = bookView(emptyProfile(), T0, page.id).page.words.map((w) => w.portrait);
      expect(portraits.every(Boolean), page.id).toBe(page.id === 'friends');
      expect(portraits.some(Boolean), page.id).toBe(page.id === 'friends');
    }
  });
});

describe('where the book opens', () => {
  it('is the first page for a book with nothing in it', () => {
    expect(latestPage(emptyProfile())).toBe(FIRST_PAGE);
  });

  it('is the page of the word the player found most recently, wherever they practised since', () => {
    expect(latestPage(profileOf({ apple: { first: T0 }, frog: { first: T0 + HOUR } }))).toBe('meadow');
    expect(
      latestPage(
        profileOf({ apple: { first: T0 + DAY }, frog: { first: T0 }, ruby: { first: T0 + HOUR, last: T0 + 5 * DAY } }),
      ),
    ).toBe('orchard');
  });

  it('does not count a word the player has not finished', () => {
    expect(latestPage(profileOf({ frog: { first: T0 }, apple: { first: T0 + HOUR, done: 0 } }))).toBe('meadow');
  });
});

describe("the player's newest word", () => {
  it('is none in a book with nothing in it', () => {
    expect(newestWord(emptyProfile())).toBeNull();
    for (const page of PAGES)
      expect(
        bookView(emptyProfile(), T0, page.id).page.words.some((w) => w.newest),
        page.id,
      ).toBe(false);
  });

  it('is the word the player found most recently, wherever they practised since', () => {
    expect(newestWord(profileOf({ apple: { first: T0 }, frog: { first: T0 + HOUR } }))).toBe('frog');
    expect(
      newestWord(
        profileOf({ apple: { first: T0 + DAY }, frog: { first: T0 }, ruby: { first: T0 + HOUR, last: T0 + 5 * DAY } }),
      ),
    ).toBe('apple');
  });

  it('does not count a word the player has not finished', () => {
    expect(newestWord(profileOf({ frog: { first: T0 }, apple: { first: T0 + HOUR, done: 0 } }))).toBe('frog');
  });

  it('is marked on its own page, and on no other word of it and no other page', () => {
    const profile = profileOf({ frog: { first: T0 }, bird: { first: T0 + HOUR }, apple: { first: T0 + 2 * HOUR } });
    const marked = PAGES.map((page) => [
      page.id,
      bookView(profile, T0, page.id)
        .page.words.filter((w) => w.newest)
        .map((w) => w.word),
    ]);
    expect(marked).toEqual(PAGES.map((page) => [page.id, page.id === 'orchard' ? ['apple'] : []]));
  });

  it('moves to a word the player finds after it, and is still where it was when they only spell an old one again', () => {
    const before = profileOf({ frog: { first: T0 }, bird: { first: T0 + HOUR } });
    expect(newestWord(before)).toBe('bird');
    expect(newestWord(profileOf({ frog: { first: T0, last: T0 + DAY, done: 3 }, bird: { first: T0 + HOUR } }))).toBe(
      'bird',
    );
    expect(
      newestWord(profileOf({ frog: { first: T0 }, bird: { first: T0 + HOUR }, apple: { first: T0 + 2 * HOUR } })),
    ).toBe('apple');
  });
});

describe('turning the page', () => {
  it('goes to the next page or the one before, round the book', () => {
    expect(turned('meadow', 1)).toBe(PAGES[1]!.id);
    expect(turned(PAGES[1]!.id, -1)).toBe('meadow');
    expect(turned('meadow', -1)).toBe(LAST);
    expect(turned(LAST, 1)).toBe('meadow');
  });

  it('visits every page, one after the other, and comes back to where it started', () => {
    const seen: PageId[] = [];
    let at: PageId = FIRST_PAGE;
    for (let i = 0; i < PAGES.length; i++) {
      seen.push(at);
      at = turned(at, 1);
    }
    expect(seen).toEqual(PAGES.map((p) => p.id));
    expect(at).toBe(FIRST_PAGE);
  });

  it('treats a page that is gone as the first one', () => {
    expect(turned('taken-out' as PageId, 1)).toBe(PAGES[1]!.id);
  });
});

describe('the dots on a tab', () => {
  it('keep a few words in one row and many in two rows that are as even as can be', () => {
    expect([1, 3, 6].map(dotsAcross)).toEqual([1, 3, 6]);
    expect([7, 8, 9, 10, 11, 12].map(dotsAcross)).toEqual([4, 4, 5, 5, 6, 6]);
  });

  it('never need more than two rows for any page there is', () => {
    for (const page of PAGES)
      expect(Math.ceil(page.words.length / dotsAcross(page.words.length)), page.title).toBeLessThanOrEqual(2);
  });
});

describe('a word the player reads', () => {
  const spelled = collect(['bird', 'frog', 'bunny', 'duck']);
  const readsOf = (profile: ReturnType<typeof collect>): string[] =>
    bookView(profile, T0, 'meadow')
      .page.words.filter((w) => w.reads)
      .map((w) => w.word);

  it('is a word that has climbed off the first level where nothing is said, and not one that is still on it or has it said for the player', () => {
    const profile = withRead(spelled, {
      bird: { level: READS_FROM, best: READS_FROM },
      frog: { level: READS_FROM - 1, best: READS_FROM - 1 },
      bunny: { level: 5, best: 5 },
    });
    expect(readsOf(profile)).toEqual(['bird', 'bunny']);
  });

  it('stays a word the player reads when a later card goes less well, because the book keeps the best they did', () => {
    const profile = withRead(spelled, { bird: { level: 1, best: READS_FROM } });
    expect(readsOf(profile)).toEqual(['bird']);
  });

  it('is nothing until the player has read, and a book that has not been read in has none', () => {
    expect(readsOf(spelled)).toEqual([]);
    expect(readsOf(emptyProfile())).toEqual([]);
  });

  it('is never marked on a word that is not in the book yet', () => {
    const profile = withRead(emptyProfile(), { bird: { level: 5, best: 5 } });
    expect(bookView(profile, T0, 'meadow').page.words.every((w) => !w.reads)).toBe(true);
  });
});
