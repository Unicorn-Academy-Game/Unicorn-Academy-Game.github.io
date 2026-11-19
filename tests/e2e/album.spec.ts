import { expect, type Page, test } from '@playwright/test';
import { STICKER_PAGES, STICKERS, stickerOf, stickersOf } from '../../src/content/stickers';
import {
  freeze,
  hush,
  learningOn,
  openGame,
  play,
  SCRATCH,
  settled,
  shot,
  stickerBook,
  stickerChip,
  stickerPlace,
  stickersHad,
  stickersShown,
  watchStickers,
  worldRuns,
} from './helpers';

const TOTAL = STICKERS.length;
const named = (id: string): string => stickerOf(id)!.name;
const chipName = (count: number): string => `Open my Sticker Book. ${count} of ${TOTAL} stickers.`;

/** How far a swipe goes along the page, in pixels. The book turns for 56 and more. */
const SWIPE = 60;

async function playing(page: Page): Promise<void> {
  await openGame(page);
  await watchStickers(page);
  await play(page);
  await page.locator('.title').waitFor({ state: 'hidden' });
  await freeze(page);
  await hush(page);
}

/** Waits for the sticker that came up first to have gone to the book. */
async function welcomed(page: Page): Promise<void> {
  await expect(stickerChip(page)).toHaveAccessibleName(chipName(1), { timeout: 30_000 });
  await expect(page.locator('.sticker-toast')).toHaveCount(0);
}

const openStickers = async (page: Page): Promise<void> => {
  await stickerChip(page).click();
  await expect(stickerBook(page)).toBeVisible();
  // The sheet rises into place, and a tap on it before it has is a tap on something that moves.
  await settled(page);
};

const note = (page: Page, name: string): Promise<void> => page.evaluate((n) => window.__ua!.album.note(n), name);

test.describe('a new sticker', () => {
  test('welcomes a new player, and flies to the button, which counts it when it lands', async ({ page }) => {
    await playing(page);
    await welcomed(page);
    expect((await stickersShown(page)).names).toEqual([named('hello')]);
    expect((await stickersShown(page)).flights, 'the sticker flew to the button').toBeGreaterThan(0);
    expect(await stickersHad(page)).toBe(1);
  });

  test('comes up when the player does something, and a tap goes through it to the world', async ({ page }) => {
    await playing(page);
    await welcomed(page);
    await note(page, 'swim');
    await expect(page.locator('.sticker-toast')).toContainText(named('swim'));
    await expect(page.locator('.sticker-toast')).toHaveCSS('pointer-events', 'none');
    await expect(stickerChip(page)).toHaveAccessibleName(chipName(1));
    await expect(stickerChip(page)).toHaveAccessibleName(chipName(2), { timeout: 30_000 });
  });

  test('waits for a game to be over, and then comes up', async ({ page }) => {
    await playing(page);
    await welcomed(page);
    await page.evaluate(() => window.__ua!.wonders.open({ game: 'sparkle-sky', at: { x: 400, y: 200 } }));
    await expect.poll(() => page.evaluate(() => window.__ua!.wonders.isOpen)).toBe(true);
    await note(page, 'swim');
    await page.waitForTimeout(1500);
    expect((await stickersShown(page)).names, 'not while the game has the screen').toEqual([named('hello')]);
    await page.evaluate(() => window.__ua!.wonders.close());
    await expect.poll(() => page.evaluate(() => window.__ua!.wonders.isOpen)).toBe(false);
    await expect(stickerChip(page)).toHaveAccessibleName(chipName(2), { timeout: 30_000 });
    expect((await stickersShown(page)).names).toEqual([named('hello'), named('swim')]);
  });

  test('comes one at a time when several come together, and the count goes up as each lands', async ({ page }) => {
    await playing(page);
    await welcomed(page);
    await note(page, 'swim');
    await note(page, 'presents');
    await note(page, 'castle-grand');
    await expect(stickerChip(page)).toHaveAccessibleName(chipName(1));
    await expect(stickerChip(page)).toHaveAccessibleName(chipName(4), { timeout: 40_000 });
    const seen = await stickersShown(page);
    expect(seen.names).toEqual([named('hello'), named('swim'), named('present'), named('castle')]);
    expect(seen.most, 'never two at once').toBe(1);
  });

  test('stays still and fades with fewer effects, and the button counts it', async ({ page }) => {
    await openGame(page);
    await page.evaluate(() => window.__ua!.settings.update({ reducedEffects: true }));
    await watchStickers(page);
    await play(page);
    await page.locator('.title').waitFor({ state: 'hidden' });
    await freeze(page);
    await welcomed(page);
    const seen = await stickersShown(page);
    expect(seen.names).toEqual([named('hello')]);
    expect(seen.calm).toEqual([true]);
    expect(seen.flights, 'nothing flew').toBe(0);
  });
});

test.describe('the Sticker Book', () => {
  test.setTimeout(180_000);

  test('opens from the button in the corner, rests the world, and closes with Escape', async ({ page }) => {
    await playing(page);
    await welcomed(page);
    await expect(stickerChip(page)).toBeVisible();
    await openStickers(page);
    expect(await worldRuns(page), 'the world rests while the book is open').toBe(false);
    await expect(page.locator('.book-tab')).toHaveCount(STICKER_PAGES.length);
    await expect(page.locator('.book-total')).toContainText(`1/${TOTAL}`);
    await expect(stickerPlace(page, 'hello')).toHaveAttribute('data-found', 'true');
    await expect(stickerPlace(page, 'herd')).toHaveAttribute('data-found', 'false');
    await shot(page, `${SCRATCH}/stickers-friends.png`);
    await page.keyboard.press('Escape');
    await expect(stickerBook(page)).toHaveCount(0);
    expect(await worldRuns(page)).toBe(true);
  });

  test('opens on the page of the newest sticker, and says which stickers are new', async ({ page }) => {
    await playing(page);
    await welcomed(page);
    await note(page, 'swim');
    await expect(stickerChip(page)).toHaveAccessibleName(chipName(2), { timeout: 30_000 });
    await openStickers(page);
    await expect(page.locator('.book-tab[aria-selected="true"]')).toHaveAttribute('data-page', 'seaside');
    await expect(stickerPlace(page, 'swim')).toHaveAttribute('data-newest', 'true');
    await page.keyboard.press('Escape');
    await openStickers(page);
    await expect(stickerPlace(page, 'swim'), 'the book has shown it, so it is not new now').toHaveAttribute(
      'data-newest',
      'false',
    );
  });

  test('turns by its tabs, the arrow keys, and a swipe along the page', async ({ page }) => {
    await playing(page);
    await welcomed(page);
    await openStickers(page);
    const title = page.locator('.book-page-title');
    const first = STICKER_PAGES[0]!;
    const second = STICKER_PAGES[1]!;
    await expect(title).toHaveText(first.title);
    await page.locator(`.book-tab[data-page="${second.id}"]`).click();
    await expect(title).toHaveText(second.title);
    await expect(page.locator('.book-grid .book-word')).toHaveCount(stickersOf(second.id).length);
    await page.keyboard.press('ArrowLeft');
    await expect(title).toHaveText(first.title);
    await page.keyboard.press('ArrowLeft');
    await expect(title, 'goes round to the last page').toHaveText(STICKER_PAGES.at(-1)!.title);
    await page.keyboard.press('Home');
    await expect(title).toHaveText(first.title);
    const box = (await page.locator('.book-page').boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.7, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.7 - SWIPE, y, { steps: 4 });
    await page.mouse.up();
    await expect(title, 'a swipe to the left turns to the next page').toHaveText(second.title);
  });

  test('says what a sticker is for when the player touches it, and how far they are', async ({ page }) => {
    await playing(page);
    await welcomed(page);
    await page.evaluate(() => window.__ua!.albumModel.set({ v: 1, counts: { 'cast:light': 4 }, got: {} }));
    await openStickers(page);
    const noteLine = page.locator('.sticker-note');
    await expect(noteLine, 'with none touched, what comes next').toContainText('Next sticker');
    await page.locator('.book-tab[data-page="magic"]').click();
    await stickerPlace(page, 'magic-light').getByRole('button').click();
    await expect(noteLine).toContainText(stickerOf('magic-light')!.hint);
    await expect(noteLine).toContainText('4 of 10');
    await expect(stickerPlace(page, 'magic-light')).toHaveAttribute('data-picked', 'true');
    await page.locator('.book-tab[data-page="friends"]').click();
    await stickerPlace(page, 'hello').getByRole('button').click();
    await expect(noteLine).toContainText(named('hello'));
    await expect(noteLine).toContainText(stickerOf('hello')!.hint);
  });

  test('says the word on a sticker when the player touches it, with the voice on', async ({ page }) => {
    await playing(page);
    await welcomed(page);
    await learningOn(page, { say: true });
    await openStickers(page);
    const before = await page.evaluate(() => window.__ua!.voice.heard.length);
    await stickerPlace(page, 'hello').getByRole('button').click();
    await expect
      .poll(() => page.evaluate(() => window.__ua!.voice.heard.length), { message: 'a clip was started' })
      .toBeGreaterThan(before);
  });

  test('never says that anything is lost or missing, and has a way out at every moment', async ({ page }) => {
    await playing(page);
    await welcomed(page);
    await openStickers(page);
    for (const { id } of STICKER_PAGES) {
      await page.locator(`.book-tab[data-page="${id}"]`).click();
      const text = (await stickerBook(page).innerText()) + (await stickerBook(page).getAttribute('aria-label'));
      expect(text, id).not.toMatch(/\b(lost|missing|locked|wrong|failed|incorrect)\b/i);
      await expect(page.getByRole('button', { name: 'Close the Sticker Book' })).toBeVisible();
    }
    await page.getByRole('button', { name: 'Close the Sticker Book' }).click();
    await expect(stickerBook(page)).toHaveCount(0);
  });
});

test.describe('what the device keeps', () => {
  test.setTimeout(180_000);

  test('keeps the stickers for the next visit, and says nothing about them again', async ({ page }) => {
    await playing(page);
    await welcomed(page);
    await note(page, 'swim');
    await expect(stickerChip(page)).toHaveAccessibleName(chipName(2), { timeout: 30_000 });
    await page.evaluate(() => window.__ua!.albumModel.flush());
    await page.goto('/?test&keep');
    await page.waitForFunction(() => window.__ua !== undefined, undefined, { polling: 250, timeout: 120_000 });
    await page.getByRole('button', { name: 'Play' }).waitFor();
    expect(await stickersHad(page)).toBe(2);
    await watchStickers(page);
    await play(page);
    await expect(stickerChip(page)).toHaveAccessibleName(chipName(2));
    await page.waitForTimeout(3000);
    expect((await stickersShown(page)).names, 'nothing is announced twice').toEqual([]);
    expect(await page.evaluate(() => Object.keys(window.__ua!.albumModel.get().got).sort())).toEqual(['hello', 'swim']);
  });

  test('looking around keeps nothing', async ({ page }) => {
    await openGame(page, 'incognito');
    await play(page);
    await expect.poll(() => stickersHad(page), { message: 'the first sticker is in the book on the screen' }).toBe(1);
    await page.evaluate(() => window.__ua!.albumModel.flush());
    expect(await page.evaluate(() => window.__ua!.store!.album()), 'nothing is on the device').toBeUndefined();
  });
});
