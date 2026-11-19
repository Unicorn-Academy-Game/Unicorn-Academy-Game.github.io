import { describe, expect, it } from 'vitest';
import { factsOf, NOTHING_YET, STICKER_PAGES, STICKERS, stickersOf } from '../../src/content/stickers';
import {
  ALBUM_LABELS,
  chipLabel,
  progressLabel,
  stickerLabel,
  tabLabel,
  totalLabel,
} from '../../src/ui/album/album-text';
import { albumView, dotsAcross, FIRST_PAGE, latestPage, turned } from '../../src/ui/album/album-view';

const none = new Set<string>();
const facts = factsOf({ 'cast:light': 4 }, NOTHING_YET);
const got = (ids: readonly string[], day = 20_000): Record<string, number> =>
  Object.fromEntries(ids.map((id) => [id, day]));

describe('what the book shows', () => {
  it('has a tab for every page, and a total over all the stickers there are', () => {
    const view = albumView({}, facts, FIRST_PAGE, none);
    expect(view.tabs.map((t) => t.id)).toEqual(STICKER_PAGES.map((p) => p.id));
    expect(view.total).toBe(STICKERS.length);
    expect(view.have).toBe(0);
    expect(view.tabs.filter((t) => t.current).map((t) => t.id)).toEqual([FIRST_PAGE]);
  });

  it('counts the stickers the player has, on the page and in all, and not what this game does not know', () => {
    const view = albumView(got(['hello', 'friend-leaf', 'spell', 'from-a-newer-game']), facts, 'friends', none);
    expect(view.have).toBe(3);
    expect(view.page.have).toBe(2);
    expect(view.page.total).toBe(stickersOf('friends').length);
    expect(view.tabs.find((t) => t.id === 'magic')?.have).toBe(1);
  });

  it('draws a place for every sticker of the open page, in colour for those that are in the book', () => {
    const view = albumView(got(['hello']), facts, 'friends', none);
    expect(view.page.stickers.map((s) => s.id)).toEqual(stickersOf('friends').map((s) => s.id));
    expect(view.page.stickers.find((s) => s.id === 'hello')?.found).toBe(true);
    expect(view.page.stickers.find((s) => s.id === 'herd')?.found).toBe(false);
  });

  it('says a page is complete only when every sticker on it is in the book', () => {
    const all = stickersOf('seaside').map((s) => s.id);
    expect(albumView(got(all), facts, 'seaside', none).page.complete).toBe(true);
    expect(albumView(got(all.slice(1)), facts, 'seaside', none).page.complete).toBe(false);
    expect(albumView(got(all), facts, 'seaside', none).tabs.find((t) => t.id === 'seaside')?.complete).toBe(true);
  });

  it('says how far the player is to a sticker that asks for a number, and nothing for one that is in the book', () => {
    const open = albumView({}, facts, 'magic', none).page.stickers;
    expect(open.find((s) => s.id === 'magic-light')?.progress).toEqual({ have: 4, of: 10 });
    expect(open.find((s) => s.id === 'spell')?.progress).toBeNull();
    const kept = albumView(got(['magic-light']), facts, 'magic', none).page.stickers;
    expect(kept.find((s) => s.id === 'magic-light')?.progress).toBeNull();
  });

  it('marks the stickers the player has not seen yet', () => {
    const view = albumView(got(['hello', 'spell']), facts, 'friends', new Set(['hello']));
    expect(view.page.stickers.find((s) => s.id === 'hello')?.fresh).toBe(true);
    expect(view.page.stickers.find((s) => s.id === 'herd')?.fresh).toBe(false);
  });

  it('opens the first page when it is asked for one that does not exist', () => {
    expect(albumView({}, facts, 'a-page-taken-out' as never, none).page.id).toBe(FIRST_PAGE);
  });

  it('draws a friend, or a thing, in the frame that suits its picture', () => {
    const view = albumView({}, facts, 'friends', none);
    expect(view.page.stickers.find((s) => s.id === 'friend-leaf')?.portrait).toBe(true);
    expect(albumView({}, facts, 'magic', none).page.stickers.every((s) => !s.portrait)).toBe(true);
  });
});

describe('where the book opens, and turning it', () => {
  it('opens on the first page for a player with no stickers', () => {
    expect(latestPage({})).toBe(FIRST_PAGE);
  });

  it('opens on the page of the sticker earned last, and of the later one of two earned on the same day', () => {
    expect(latestPage({ hello: 20_000, spell: 20_001 })).toBe('magic');
    expect(latestPage({ hello: 20_002, spell: 20_001 })).toBe('friends');
    expect(latestPage({ hello: 20_001, spell: 20_001 })).toBe('magic');
    expect(latestPage({ ...got(['hello']), 'from-a-newer-game': 99_999 })).toBe('friends');
  });

  it('turns to the next page and the one before, and goes round at the ends', () => {
    const ids = STICKER_PAGES.map((p) => p.id);
    expect(turned(ids[0]!, 1)).toBe(ids[1]);
    expect(turned(ids[1]!, -1)).toBe(ids[0]);
    expect(turned(ids[0]!, -1)).toBe(ids.at(-1));
    expect(turned(ids.at(-1)!, 1)).toBe(ids[0]);
    expect(turned('nothing' as never, 1)).toBe(ids[1]);
  });

  it('puts the dots of a tab in one row for a few and two even rows for many', () => {
    expect(dotsAcross(0)).toBe(1);
    expect(dotsAcross(5)).toBe(5);
    expect(dotsAcross(7)).toBe(4);
    expect(dotsAcross(12)).toBe(6);
  });
});

describe('what a screen reader says', () => {
  it('names the stickers the player has, and what to do for the ones they have not', () => {
    const view = albumView(got(['hello']), facts, 'friends', new Set(['hello']));
    const hello = view.page.stickers.find((s) => s.id === 'hello')!;
    const herd = view.page.stickers.find((s) => s.id === 'herd')!;
    expect(stickerLabel(hello)).toBe('Hello, Wildstar! A new sticker.');
    expect(stickerLabel(herd)).toBe('A sticker waiting for you. Find all the unicorn friends. 0 of 6.');
    const spell = albumView({}, facts, 'magic', none).page.stickers.find((s) => s.id === 'magic-light')!;
    expect(stickerLabel(spell)).toBe(
      `A sticker waiting for you. Cast Wildstar's magic ten times. ${progressLabel({ have: 4, of: 10 })}.`,
    );
  });

  it('never says that anything is lost, missing, locked or wrong', () => {
    const lines = [
      ...Object.values(ALBUM_LABELS),
      chipLabel(0, 94),
      totalLabel(0, 94),
      ...albumView({}, facts, FIRST_PAGE, none).tabs.map(tabLabel),
      ...STICKER_PAGES.flatMap((p) => albumView({}, facts, p.id, none).page.stickers.map(stickerLabel)),
    ];
    for (const line of lines) expect(line, line).not.toMatch(/\b(lost|missing|locked|wrong|failed|incorrect|empty)\b/i);
  });

  it('says how many there are on a tab, and when a page is full', () => {
    const tab = albumView(got(stickersOf('seaside').map((s) => s.id)), facts, 'seaside', none).tabs.find(
      (t) => t.id === 'seaside',
    )!;
    expect(tabLabel(tab)).toBe('Sand and Sea. 5 of 5 stickers. Every sticker on this page');
    expect(chipLabel(3, 94)).toBe('Open my Sticker Book. 3 of 94 stickers.');
    expect(totalLabel(3, 94)).toBe('3 of 94 stickers');
  });
});
