import { isPortrait, PAGES, type PageId, type WordId } from '../../content/lexicon';
import { type Card, chapters, type LearnerProfile, progressOf, readsWord, type Stars, tally } from '../../learning';

/**
 * What the Spell Book shows, worked out from the player's profile and nothing else, so the screen
 * only has to draw it. The book is a row of pages, each with a picture to find it by, and on a page
 * a place for every word: a word the player has spelled is a card in colour with its name and
 * stars, and a word they have not is a shape with a place for each letter, there to be found.
 */

/** A page's tab: its picture, and how much of the page is in the book. */
export interface TabView {
  id: PageId;
  title: string;
  /** The word whose picture stands for the page. */
  emblem: WordId;
  /** The emblem is a friend's head and shoulders, which sits in a round frame. */
  portrait: boolean;
  collected: number;
  total: number;
  /** Every word on the page is in the book. */
  complete: boolean;
  /** The page being read. */
  current: boolean;
}

/** A place on a page. */
export interface WordView {
  word: WordId;
  /**
   * In the book: in colour, with its name and stars. Otherwise a shape, with a place for each
   * letter.
   */
  found: boolean;
  stars: Stars;
  /** Time to spell it again. */
  due: boolean;
  /** The word the player found most recently. It wears a sparkle until they find another. */
  newest: boolean;
  letters: number;
  /** A friend, drawn in a round frame like the finder's. */
  portrait: boolean;
  /**
   * The player reads it on their own, which is a word that has climbed off the first level where
   * the voice does not say it for them.
   */
  reads: boolean;
}

export interface PageView {
  id: PageId;
  title: string;
  collected: number;
  total: number;
  complete: boolean;
  words: readonly WordView[];
}

export interface BookView {
  /** Over the whole book. */
  collected: number;
  total: number;
  stars: number;
  tabs: readonly TabView[];
  page: PageView;
}

/** The page the book opens on when nothing says otherwise. */
export const FIRST_PAGE: PageId = PAGES[0].id;

function wordView(profile: LearnerProfile, card: Card, newest: WordId | null): WordView {
  return {
    word: card.word,
    found: card.collected,
    stars: card.stars,
    due: card.due,
    newest: card.word === newest,
    letters: card.word.length,
    portrait: isPortrait(card.word),
    reads: card.collected && readsWord(profile, card.word),
  };
}

/**
 * The book, open at `current`. A page the book does not have opens the first one, so a page that
 * was taken out never leaves a blank.
 */
export function bookView(profile: LearnerProfile, now: number, current: PageId): BookView {
  const all = chapters(profile, now);
  const at = all.find((c) => c.page.id === current) ?? all[0]!;
  const totals = tally(profile, now);
  const newest = newestWord(profile);
  return {
    collected: totals.collected,
    total: totals.total,
    stars: totals.stars,
    tabs: all.map((c) => ({
      id: c.page.id,
      title: c.page.title,
      emblem: c.page.emblem,
      portrait: isPortrait(c.page.emblem),
      collected: c.collected,
      total: c.cards.length,
      complete: c.complete,
      current: c === at,
    })),
    page: {
      id: at.page.id,
      title: at.page.title,
      collected: at.collected,
      total: at.cards.length,
      complete: at.complete,
      words: at.cards.map((card) => wordView(profile, card, newest)),
    },
  };
}

/**
 * The word the player found most recently, which is the one whose first spelling came last, or none
 * while the book is empty.
 */
export function newestWord(profile: LearnerProfile): WordId | null {
  return newest(profile)?.word ?? null;
}

/**
 * The page of the word the player found most recently, which is where the book opens, so a find is
 * easy to see. With nothing found, the first page.
 */
export function latestPage(profile: LearnerProfile): PageId {
  return newest(profile)?.page ?? FIRST_PAGE;
}

function newest(profile: LearnerProfile): { word: WordId; page: PageId } | null {
  let found: { word: WordId; page: PageId } | null = null;
  let latest = -Infinity;
  for (const def of PAGES) {
    for (const word of def.words) {
      const progress = progressOf(profile, word, 'spell');
      if (progress === undefined || progress.done === 0 || progress.first <= latest) continue;
      latest = progress.first;
      found = { word, page: def.id };
    }
  }
  return found;
}

/**
 * How many dots go across a tab: a page of a few words keeps them in a row, and a page of many in
 * two rows as even as can be, so a tab never grows tall.
 */
export const dotsAcross = (words: number): number => (words <= 6 ? Math.max(1, words) : Math.ceil(words / 2));

/**
 * The page after or before `from`, going round the book, so there is always another page to turn
 * to.
 */
export function turned(from: PageId, by: 1 | -1): PageId {
  const at = PAGES.findIndex((p) => p.id === from);
  return PAGES[(Math.max(at, 0) + by + PAGES.length) % PAGES.length]!.id;
}
