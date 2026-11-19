import { isPortrait, type WordId } from '../../content/lexicon';
import {
  type Facts,
  progressOf,
  STICKER_PAGES,
  STICKERS,
  type StickerPageId,
  stickersOf,
} from '../../content/stickers';

/**
 * What the sticker book shows, worked out from the stickers the player has and the facts of the
 * game and nothing else, so the screen only has to draw it. It is a row of pages, and on a page a
 * place for every sticker: one the player has is in colour and has its name, and one they have not
 * is a shape, with how far they have come when it asks for a number of something.
 */

export interface TabView {
  id: StickerPageId;
  title: string;
  /** The word whose picture stands for the page. */
  emblem: WordId;
  portrait: boolean;
  have: number;
  total: number;
  /** Every sticker on the page is in the book. */
  complete: boolean;
  /** The page being read. */
  current: boolean;
}

export interface StickerView {
  id: string;
  name: string;
  hint: string;
  emblem: WordId;
  /** The picture is a friend's head and shoulders, which sits in a round frame. */
  portrait: boolean;
  found: boolean;
  /** How far the player is to it, for a sticker that asks for a number of something. */
  progress: { have: number; of: number } | null;
  /** The player earned it a moment ago and has not seen it in the book yet. */
  fresh: boolean;
}

export interface PageView {
  id: StickerPageId;
  title: string;
  have: number;
  total: number;
  complete: boolean;
  stickers: readonly StickerView[];
}

export interface AlbumView {
  have: number;
  total: number;
  tabs: readonly TabView[];
  page: PageView;
}

/** The page the book opens on when nothing says otherwise. */
export const FIRST_PAGE: StickerPageId = STICKER_PAGES[0]!.id;

type Got = Readonly<Record<string, number>>;
const has = (got: Got, id: string): boolean => Object.hasOwn(got, id);

/**
 * The book, open at `current`. A page the book does not have opens the first one. A sticker the
 * player has that this game does not know, from a newer one, is not counted.
 */
export function albumView(got: Got, facts: Facts, current: StickerPageId, fresh: ReadonlySet<string>): AlbumView {
  const at = STICKER_PAGES.find((p) => p.id === current) ?? STICKER_PAGES[0]!;
  const count = (page: StickerPageId): number => stickersOf(page).filter((s) => has(got, s.id)).length;
  return {
    have: STICKERS.filter((s) => has(got, s.id)).length,
    total: STICKERS.length,
    tabs: STICKER_PAGES.map((p) => ({
      id: p.id,
      title: p.title,
      emblem: p.emblem,
      portrait: isPortrait(p.emblem),
      have: count(p.id),
      total: stickersOf(p.id).length,
      complete: count(p.id) === stickersOf(p.id).length,
      current: p.id === at.id,
    })),
    page: {
      id: at.id,
      title: at.title,
      have: count(at.id),
      total: stickersOf(at.id).length,
      complete: count(at.id) === stickersOf(at.id).length,
      stickers: stickersOf(at.id).map((s) => ({
        id: s.id,
        name: s.name,
        hint: s.hint,
        emblem: s.emblem,
        portrait: isPortrait(s.emblem),
        found: has(got, s.id),
        progress: has(got, s.id) ? null : progressOf(s, facts),
        fresh: fresh.has(s.id),
      })),
    },
  };
}

/**
 * The page of the sticker the player earned most recently, which is where the book opens, so a new
 * sticker is easy to see. Of stickers earned on the same day the later one in the table counts as
 * the newer. With none, the first page.
 */
export function latestPage(got: Got): StickerPageId {
  let page: StickerPageId = FIRST_PAGE;
  let latest = -1;
  for (const s of STICKERS) {
    const day = got[s.id];
    if (day === undefined || !has(got, s.id) || day < latest) continue;
    latest = day;
    page = s.page;
  }
  return page;
}

/** The page after or before `from`, going round the book, so there is always another to turn to. */
export function turned(from: StickerPageId, by: 1 | -1): StickerPageId {
  const at = STICKER_PAGES.findIndex((p) => p.id === from);
  return STICKER_PAGES[(Math.max(at, 0) + by + STICKER_PAGES.length) % STICKER_PAGES.length]!.id;
}

/**
 * How many dots go across a tab: a page of a few stickers keeps them in a row, and a page of many
 * in two rows as even as can be, so a tab never grows tall.
 */
export const dotsAcross = (stickers: number): number =>
  stickers <= 6 ? Math.max(1, stickers) : Math.ceil(stickers / 2);

/**
 * How crooked a sticker sits in the book, from -4 to 4 degrees, the same every time for the same
 * sticker, as if each had been stuck on by hand.
 */
export function tiltOf(id: string): number {
  let n = 0;
  for (const ch of id) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return (n % 9) - 4;
}
