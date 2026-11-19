import { expect, type Page, test } from '@playwright/test';
import { stickerOf } from '../../src/content/stickers';
import { MAX_PHOTOS } from '../../src/shared/photos';
import {
  cameraButton,
  cameraThumb,
  freeze,
  hush,
  openGame,
  photoAlbum,
  photosHad,
  play,
  SCRATCH,
  settled,
  shot,
  stickersHad,
  watchStickers,
  worldRuns,
} from './helpers';

async function playing(page: Page): Promise<void> {
  await openGame(page);
  await watchStickers(page);
  await play(page);
  await page.locator('.title').waitFor({ state: 'hidden' });
  await freeze(page);
  await hush(page);
}

/** Takes a picture and waits for its print to have landed in the corner. */
async function snap(page: Page, count: number): Promise<void> {
  await cameraButton(page).click();
  await expect.poll(() => photosHad(page)).toBe(count);
  await expect(page.locator('.camera-print')).toHaveCount(0, { timeout: 30_000 });
}

const openAlbum = async (page: Page): Promise<void> => {
  await cameraThumb(page).click();
  await expect(photoAlbum(page)).toBeVisible();
  // The sheet rises into place, and a tap on it before it has is a tap on something that moves.
  await settled(page);
};

const prints = (page: Page) => page.locator('.photo');
const ids = (page: Page): Promise<string[]> =>
  page.evaluate(() => window.__ua!.photos.get().shots.map((p: { id: string }) => p.id));

test.describe('taking a picture', () => {
  test.setTimeout(180_000);

  test('keeps the world as the screen shows it, and the print lands on the corner', async ({ page }) => {
    await playing(page);
    await expect(cameraButton(page)).toBeVisible();
    await expect(cameraThumb(page), 'there is no picture to open yet').toBeHidden();
    await cameraButton(page).click();
    await expect(page.locator('.camera-print')).toBeVisible();
    await expect.poll(() => photosHad(page)).toBe(1);
    const kept = await page.evaluate(() => {
      const [first] = window.__ua!.photos.get().shots;
      const canvas = document.querySelector('canvas')!;
      return { ...first!, canvasRatio: canvas.width / canvas.height };
    });
    expect(kept.image).toMatch(/^data:image\/jpeg;base64,/);
    expect(kept.place).toBe('forest');
    expect(kept.w / kept.h, 'it is the whole screen').toBeCloseTo(kept.canvasRatio, 1);
    expect(kept.image.length, 'small enough to keep').toBeLessThan(160_000);
    await shot(page, `${SCRATCH}/camera-print.png`);
    await expect(cameraThumb(page)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.camera-print')).toHaveCount(0);
  });

  test('counts for the sticker book', async ({ page }) => {
    await playing(page);
    await snap(page, 1);
    expect(await page.evaluate(() => Object.keys(window.__ua!.album.got()))).toContain('photo');
    expect(await stickersHad(page)).toBe(2);
    expect(stickerOf('photo')!.name).toBe('Say cheese!');
  });

  test('takes one print at a time, and a second picture sends the first off', async ({ page }) => {
    await playing(page);
    await cameraButton(page).click();
    await expect(page.locator('.camera-print')).toHaveCount(1);
    await cameraButton(page).click();
    await expect.poll(() => photosHad(page)).toBe(2);
    await expect(page.locator('.camera-print')).toHaveCount(1);
    await expect(page.locator('.camera-print')).toHaveCount(0, { timeout: 30_000 });
    expect(new Set(await ids(page)).size).toBe(2);
  });

  test('keeps the pictures for the next visit', async ({ page }) => {
    await playing(page);
    await snap(page, 1);
    const before = await ids(page);
    await page.evaluate(() => window.__ua!.photos.flush());
    await page.goto('/?test&keep');
    await page.waitForFunction(() => window.__ua !== undefined, undefined, { polling: 250, timeout: 120_000 });
    await page.getByRole('button', { name: 'Play' }).waitFor();
    expect(await ids(page)).toEqual(before);
    await play(page);
    await expect(cameraThumb(page)).toBeVisible();
  });

  test('looking around keeps nothing on the device', async ({ page }) => {
    await openGame(page, 'incognito');
    await play(page);
    await page.locator('.title').waitFor({ state: 'hidden' });
    await freeze(page);
    await hush(page);
    await snap(page, 1);
    await page.evaluate(() => window.__ua!.photos.flush());
    expect(await page.evaluate(() => window.__ua!.store!.photos()), 'nothing is on the device').toBeUndefined();
  });

  test('answers a tap that comes to no picture, and the next tap takes one', async ({ page }) => {
    await playing(page);
    // A screen that is not drawing has nothing for the camera to copy.
    await page.evaluate(() => window.__ua!.stage.game.loop.sleep());
    await cameraButton(page).click();
    await expect(cameraButton(page)).toHaveAttribute('data-miss', 'true', { timeout: 20_000 });
    await expect(page.locator('.camera-stage .book-live')).toHaveText('Tap the camera to try again.');
    expect(await photosHad(page)).toBe(0);
    await page.evaluate(() => window.__ua!.stage.game.loop.wake());
    await snap(page, 1);
  });

  test('with fewer effects a tap that comes to no picture lights a ring and nothing moves', async ({ page }) => {
    await openGame(page);
    await page.evaluate(() => window.__ua!.settings.update({ reducedEffects: true }));
    await watchStickers(page);
    await play(page);
    await page.locator('.title').waitFor({ state: 'hidden' });
    await freeze(page);
    await hush(page);
    await page.evaluate(() => window.__ua!.stage.game.loop.sleep());
    await cameraButton(page).click();
    // The ring is up for a moment, so what it looks like is read in the same breath as the flag.
    await expect
      .poll(
        () =>
          cameraButton(page).evaluate((button) => {
            const style = getComputedStyle(button);
            return [button.dataset.miss, style.outlineStyle, style.animationName].join(' ');
          }),
        { timeout: 20_000 },
      )
      .toBe('still solid none');
    await page.evaluate(() => window.__ua!.stage.game.loop.wake());
    await snap(page, 1);
  });

  test('a device that asks for less motion gets the same ring', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await playing(page);
    await page.evaluate(() => window.__ua!.stage.game.loop.sleep());
    await cameraButton(page).click();
    await expect(cameraButton(page)).toHaveAttribute('data-miss', 'still', { timeout: 20_000 });
    await page.evaluate(() => window.__ua!.stage.game.loop.wake());
  });

  test('says so when the album is full, before a picture makes room and after', async ({ page }) => {
    await playing(page);
    // The print is up for two seconds only, so what it says is written down as it comes.
    await page.evaluate(() => {
      const seen = { room: '' };
      (window as unknown as { __room: typeof seen }).__room = seen;
      new MutationObserver(() => {
        const node = document.querySelector('.camera-print-room');
        if (node) seen.room = node.textContent ?? '';
      }).observe(document.body, { childList: true, subtree: true });
    });
    const roomSaid = (): Promise<string> =>
      page.evaluate(() => (window as unknown as { __room: { room: string } }).__room.room);
    await snap(page, 1);
    expect(await roomSaid(), 'a print in an album with room says nothing of it').toBe('');
    await page.evaluate((max) => {
      const model = window.__ua!.photos;
      const [first] = model.get().shots;
      const shots = Array.from({ length: max }, (_, i) => ({
        ...first!,
        id: `fill${String(i).padStart(3, '0')}`,
        at: first!.at + i,
      }));
      model.set({ ...model.get(), shots });
    }, MAX_PHOTOS);
    expect(await photosHad(page)).toBe(MAX_PHOTOS);
    await expect(cameraButton(page)).toHaveAttribute('aria-label', /album is full/i);
    await cameraButton(page).click();
    await expect(page.locator('.camera-stage .book-live')).toContainText('The oldest picture made room for it.');
    await expect
      .poll(roomSaid, { message: 'the print says it too, where the player can see it' })
      .toBe('The oldest picture made room for it.');
    expect(await photosHad(page), 'the album holds no more than it did').toBe(MAX_PHOTOS);
    await expect(page.locator('.camera-print')).toHaveCount(0, { timeout: 30_000 });
    await openAlbum(page);
    await expect(page.locator('.book-full')).toBeVisible();
    await expect(page.locator('.book-full')).toHaveText('Album full');
  });

  test('with fewer effects there is no flash, and the print stays still and fades', async ({ page }) => {
    await openGame(page);
    await page.evaluate(() => window.__ua!.settings.update({ reducedEffects: true }));
    await play(page);
    await page.locator('.title').waitFor({ state: 'hidden' });
    await freeze(page);
    await hush(page);
    await cameraButton(page).click();
    await expect(page.locator('.camera-print')).toHaveAttribute('data-calm', 'true');
    await expect(page.locator('.camera-flash')).not.toHaveAttribute('data-on', 'true');
    await expect.poll(() => photosHad(page)).toBe(1);
    await expect(page.locator('.camera-print')).toHaveCount(0, { timeout: 30_000 });
    await expect(cameraThumb(page)).toBeVisible();
  });
});

test.describe('the album', () => {
  test.setTimeout(180_000);

  test('opens from the corner, rests the world, shows the newest first, and closes with Escape', async ({ page }) => {
    await playing(page);
    await snap(page, 1);
    await snap(page, 2);
    const [older, newer] = await ids(page);
    await openAlbum(page);
    expect(await worldRuns(page), 'the world rests while the album is open').toBe(false);
    await expect(prints(page)).toHaveCount(2);
    await expect(prints(page).first()).toHaveAttribute('data-photo', newer!);
    await expect(prints(page).last()).toHaveAttribute('data-photo', older!);
    await expect(page.locator('.book-total')).toContainText('2 pictures');
    await shot(page, `${SCRATCH}/camera-album.png`);
    await page.keyboard.press('Escape');
    await expect(photoAlbum(page)).toHaveCount(0);
    expect(await worldRuns(page)).toBe(true);
  });

  test('opens on the picture when the print is tapped as it comes up', async ({ page }) => {
    await playing(page);
    await cameraButton(page).click();
    // The print is moving as it comes up, so it is never still for the check that waits for that.
    await page.locator('.camera-print').click({ force: true });
    await expect(photoAlbum(page)).toBeVisible();
    await expect(page.locator('.photo-view')).toBeVisible();
    await expect(page.locator('.camera-print')).toHaveCount(0);
  });

  test('shows a picture big, moves along, and Escape goes back before it closes', async ({ page }) => {
    await playing(page);
    await snap(page, 1);
    await snap(page, 2);
    await snap(page, 3);
    const [oldest, middle, newest] = await ids(page);
    await openAlbum(page);
    await prints(page).first().getByRole('button').click();
    const view = page.locator('.photo-view');
    await expect(view).toBeVisible();
    await shot(page, `${SCRATCH}/camera-view.png`);
    const bigIs = async (id: string): Promise<boolean> =>
      (await view.locator('.photo-big').getAttribute('src')) ===
      (await page.evaluate((i) => window.__ua!.photos.get().shots.find((p: { id: string }) => p.id === i)?.image, id));
    expect(await bigIs(newest!)).toBe(true);
    await expect(view.locator('[data-kind="newer"]')).toBeDisabled();
    await view.locator('[data-kind="older"]').click();
    await expect.poll(() => bigIs(middle!)).toBe(true);
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => bigIs(oldest!)).toBe(true);
    await expect(view.locator('[data-kind="older"]')).toBeDisabled();
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => bigIs(middle!)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(view).toHaveCount(0);
    await expect(photoAlbum(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(photoAlbum(page)).toHaveCount(0);
  });

  test('puts a picture away only after asking, and keeps it when the player says keep', async ({ page }) => {
    await playing(page);
    await snap(page, 1);
    await snap(page, 2);
    const [older, newer] = await ids(page);
    await openAlbum(page);
    await prints(page).first().getByRole('button').click();
    await page.locator('.photo-view [data-kind="away"]').click();
    await expect(page.locator('.photo-ask')).toContainText('Put this picture away?');
    await shot(page, `${SCRATCH}/camera-ask.png`);
    await page.locator('.photo-ask [data-kind="keep"]').click();
    await expect(page.locator('.photo-ask')).toHaveCount(0);
    expect(await ids(page), 'it is still there').toEqual([older, newer]);
    await page.locator('.photo-view [data-kind="away"]').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.photo-ask'), 'Escape takes the question back').toHaveCount(0);
    await expect(page.locator('.photo-view')).toBeVisible();
    expect(await ids(page)).toEqual([older, newer]);
    await page.locator('.photo-view [data-kind="away"]').click();
    await page.locator('.photo-ask [data-kind="yes"]').click();
    expect(await ids(page)).toEqual([older]);
    expect(await page.evaluate(() => window.__ua!.photos.get().gone)).toEqual([newer]);
    await expect(page.locator('.photo-view'), 'the picture before it is shown').toBeVisible();
    await page.locator('.photo-view [data-kind="away"]').click();
    await page.locator('.photo-ask [data-kind="yes"]').click();
    await expect(page.locator('.photo-view')).toHaveCount(0);
    await expect(page.locator('.photo-empty')).toBeVisible();
    await expect(page.locator('.photo-empty')).toContainText('Tap the camera to take one!');
    await page.keyboard.press('Escape');
    await expect(photoAlbum(page)).toHaveCount(0);
    expect(await stickersHad(page), 'the sticker the picture earned stays').toBe(2);
  });

  test('never says that anything is lost or wrong', async ({ page }) => {
    await playing(page);
    await snap(page, 1);
    await openAlbum(page);
    await prints(page).first().getByRole('button').click();
    await page.locator('.photo-view [data-kind="away"]').click();
    const text = (await photoAlbum(page).innerText()) + (await photoAlbum(page).getAttribute('aria-label'));
    expect(text).not.toMatch(/\b(lost|missing|locked|wrong|failed|incorrect|delete|deleted|error)\b/i);
  });
});
