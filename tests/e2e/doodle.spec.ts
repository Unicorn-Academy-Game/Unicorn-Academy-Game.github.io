import { expect, type Page, test } from '@playwright/test';
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
  watchStickers,
} from './helpers';

type Colour = [number, number, number];

async function playing(page: Page): Promise<void> {
  await openGame(page);
  await watchStickers(page);
  await play(page);
  await page.locator('.title').waitFor({ state: 'hidden' });
  await freeze(page);
  await hush(page);
}

/** One picture is taken, and the album is open on it, big. */
async function pictureOpen(page: Page): Promise<void> {
  await cameraButton(page).click();
  await expect.poll(() => photosHad(page)).toBe(1);
  await expect(page.locator('.camera-print')).toHaveCount(0, { timeout: 30_000 });
  await cameraThumb(page).click();
  await expect(photoAlbum(page)).toBeVisible();
  await settled(page);
  await page.locator('.photo').first().getByRole('button').click();
  await expect(page.locator('.photo-view')).toBeVisible();
}

const editor = (page: Page) => page.locator('.doodle');
const paper = (page: Page) => page.locator('.doodle-canvas');
const control = (page: Page, kind: string) => page.locator(`.doodle [data-content-id="doodle.${kind}"]`);
const ink = (page: Page, name: string) => page.locator(`.doodle [data-ink="${name}"]`);
/** A button for the crayon, the eraser or one of the stamps. */
const tool = (page: Page, name: string) => page.locator(`.doodle [data-tool="${name}"]`);

async function drawing(page: Page): Promise<void> {
  await page.locator('.photo-view [data-kind="draw"]').click();
  await expect(editor(page)).toBeVisible();
  await expect(editor(page)).toHaveAttribute('data-ready', 'true');
  await settled(page);
}

/** Where a place on the picture, as a share of each side, is on the page. */
async function onPaper(page: Page, across: number, down: number): Promise<{ x: number; y: number }> {
  const box = (await paper(page).boundingBox())!;
  return { x: box.x + box.width * across, y: box.y + box.height * down };
}

async function line(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const a = await onPaper(page, ...from);
  const b = await onPaper(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 14 });
  await page.mouse.up();
}

async function press(page: Page, at: [number, number]): Promise<void> {
  const p = await onPaper(page, ...at);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.up();
}

/** The colour on the drawing board at a place on the picture. */
const colourOnBoard = (page: Page, across: number, down: number): Promise<Colour> =>
  paper(page).evaluate(
    (canvas: HTMLCanvasElement, [fx, fy]) => {
      const { data } = canvas
        .getContext('2d')!
        .getImageData(Math.round(canvas.width * fx), Math.round(canvas.height * fy), 1, 1);
      return [data[0]!, data[1]!, data[2]!] as [number, number, number];
    },
    [across, down] as [number, number],
  );

/** The colour in a picture the album keeps, at a place on it. */
const colourInPhoto = (page: Page, id: string, across: number, down: number): Promise<Colour> =>
  page.evaluate(
    async ([wanted, fx, fy]) => {
      const photo = window.__ua!.photos.get().shots.find((p: { id: string }) => p.id === wanted)!;
      const image = new Image();
      image.src = photo.image;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = photo.w;
      canvas.height = photo.h;
      const g = canvas.getContext('2d')!;
      g.drawImage(image, 0, 0);
      const { data } = g.getImageData(Math.round(photo.w * (fx as number)), Math.round(photo.h * (fy as number)), 1, 1);
      return [data[0]!, data[1]!, data[2]!] as [number, number, number];
    },
    [id, across, down] as [string, number, number],
  );

const near = (a: Colour, b: Colour, within: number): boolean => a.every((v, i) => Math.abs(v - b[i]!) <= within);

/** Waits for the board to be painted, which is on the frame after the finger moves, and says whether the place is `colour`. */
const paintedWith = (page: Page, across: number, down: number, colour: Colour, within = 6) =>
  expect.poll(async () => near(await colourOnBoard(page, across, down), colour, within), { timeout: 5000 });
const RED: Colour = [239, 74, 90];
const BLUE: Colour = [74, 144, 242];

const ids = (page: Page): Promise<string[]> =>
  page.evaluate(() => window.__ua!.photos.get().shots.map((p: { id: string }) => p.id));

test.describe('drawing on a picture', () => {
  test.setTimeout(180_000);

  test('draws a line and a stamp, takes the stamp off, and keeps the rest as a new picture beside the old', async ({
    page,
  }) => {
    await playing(page);
    await pictureOpen(page);
    const [first] = await ids(page);
    const before = await page.evaluate(() => window.__ua!.photos.get().shots[0]!);
    await drawing(page);
    await shot(page, `${SCRATCH}/doodle-open.png`);

    const bare = await colourOnBoard(page, 0.5, 0.5);
    await ink(page, 'red').click();
    await line(page, [0.2, 0.5], [0.8, 0.5]);
    await paintedWith(page, 0.5, 0.5, RED).toBe(true);
    expect(near(bare, RED, 6), 'it was not red before').toBe(false);

    await tool(page, 'star').click();
    await ink(page, 'blue').click();
    await press(page, [0.5, 0.25]);
    await paintedWith(page, 0.5, 0.25, BLUE).toBe(true);
    await shot(page, `${SCRATCH}/doodle-drawn.png`);

    await control(page, 'undo').click();
    await paintedWith(page, 0.5, 0.25, BLUE).toBe(false);
    await paintedWith(page, 0.5, 0.5, RED).toBe(true);
    expect(await photosHad(page), 'nothing is kept until the player says').toBe(1);

    await control(page, 'done').click();
    await expect(editor(page)).toHaveCount(0);
    await expect.poll(() => photosHad(page)).toBe(2);
    const [old, drawn] = await ids(page);
    expect(old).toBe(first);
    const kept = await page.evaluate(() => window.__ua!.photos.get().shots[1]!);
    expect(kept.place, 'it was made where the first one was').toBe(before.place);
    expect([kept.w, kept.h]).toEqual([before.w, before.h]);
    expect(kept.image).not.toBe(before.image);
    expect(kept.image.length, 'small enough to keep').toBeLessThan(160_000);
    expect(await page.evaluate(() => window.__ua!.photos.get().shots[0]!.image), 'the old one is as it was').toBe(
      before.image,
    );
    expect(near(await colourInPhoto(page, drawn!, 0.5, 0.5), RED, 40), 'the line is in what was kept').toBe(true);
    expect(near(await colourInPhoto(page, drawn!, 0.5, 0.25), BLUE, 40), 'the stamp was taken off').toBe(false);

    await expect(page.locator('.photo-view'), 'the new picture is shown').toBeVisible();
    expect(await page.locator('.photo-big').getAttribute('src')).toBe(kept.image);
    expect(await page.evaluate(() => Object.keys(window.__ua!.album.got()))).toContain('doodle');
    await shot(page, `${SCRATCH}/doodle-kept.png`);
  });

  test('asks before leaving a drawing, so that a tap beside it never loses it', async ({ page }) => {
    await playing(page);
    await pictureOpen(page);
    await drawing(page);
    await line(page, [0.2, 0.4], [0.7, 0.6]);

    await control(page, 'shut').click();
    await expect(page.locator('.doodle-ask')).toContainText('Keep your drawing?');
    await shot(page, `${SCRATCH}/doodle-ask.png`);
    await page.keyboard.press('Escape');
    await expect(page.locator('.doodle-ask'), 'Escape takes the question back').toHaveCount(0);
    await expect(editor(page)).toBeVisible();

    await page.locator('.book').click({ position: { x: 3, y: 3 } });
    await expect(page.locator('.doodle-ask'), 'a tap beside the sheet asks').toBeVisible();
    await expect(editor(page)).toBeVisible();
    await page.locator('.book').click({ position: { x: 3, y: 3 } });
    await expect(page.locator('.doodle-ask'), 'and a tap beside it again takes the question back').toHaveCount(0);
    await expect(editor(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.doodle-ask')).toBeVisible();

    await control(page, 'drop').click();
    await expect(editor(page)).toHaveCount(0);
    expect(await photosHad(page), 'not now keeps nothing').toBe(1);
    await expect(page.locator('.photo-view'), 'the picture it was drawn on is back').toBeVisible();

    await drawing(page);
    await line(page, [0.3, 0.3], [0.6, 0.7]);
    await page.keyboard.press('Escape');
    await control(page, 'keep').click();
    await expect(editor(page)).toHaveCount(0);
    await expect.poll(() => photosHad(page)).toBe(2);
  });

  test('closes without asking when nothing was drawn, from the cross and from done', async ({ page }) => {
    await playing(page);
    await pictureOpen(page);
    await drawing(page);
    await control(page, 'shut').click();
    await expect(editor(page)).toHaveCount(0);
    await drawing(page);
    await control(page, 'done').click();
    await expect(editor(page)).toHaveCount(0);
    await drawing(page);
    await page.keyboard.press('Escape');
    await expect(editor(page)).toHaveCount(0);
    await expect(page.locator('.photo-view')).toBeVisible();
    expect(await photosHad(page)).toBe(1);
  });

  test('the colours, the stamps and the size say which is chosen, and undo says when there is nothing to undo', async ({
    page,
  }) => {
    await playing(page);
    await pictureOpen(page);
    await drawing(page);
    await expect(control(page, 'undo')).toBeDisabled();
    await expect(ink(page, 'rainbow')).toHaveAttribute('aria-pressed', 'true');
    await expect(tool(page, 'pen')).toHaveAttribute('aria-pressed', 'true');
    await ink(page, 'green').click();
    await expect(ink(page, 'green')).toHaveAttribute('aria-pressed', 'true');
    await expect(ink(page, 'rainbow')).toHaveAttribute('aria-pressed', 'false');
    await tool(page, 'heart').click();
    await expect(tool(page, 'heart')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.doodle [data-tool="pen"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(control(page, 'size')).toHaveAttribute('data-size', 'bold');
    await control(page, 'size').click();
    await expect(control(page, 'size')).toHaveAttribute('data-size', 'fine');
    await press(page, [0.4, 0.4]);
    await expect(control(page, 'undo')).toBeEnabled();
    expect((await control(page, 'size').getAttribute('aria-label'))!.length).toBeGreaterThan(3);
    await control(page, 'undo').click();
    await expect(control(page, 'undo')).toBeDisabled();
  });

  test('the eraser draws the picture back where it is rubbed, and a colour chosen after it is the crayon again', async ({
    page,
  }) => {
    await playing(page);
    await pictureOpen(page);
    await drawing(page);
    const bare = await colourOnBoard(page, 0.5, 0.5);
    await ink(page, 'red').click();
    await line(page, [0.2, 0.5], [0.8, 0.5]);
    await paintedWith(page, 0.5, 0.5, RED).toBe(true);

    await tool(page, 'rubber').click();
    await expect(tool(page, 'rubber')).toHaveAttribute('aria-pressed', 'true');
    await line(page, [0.3, 0.5], [0.7, 0.5]);
    await paintedWith(page, 0.5, 0.5, bare, 2).toBe(true);
    await paintedWith(page, 0.22, 0.5, RED).toBe(true);
    await paintedWith(page, 0.78, 0.5, RED).toBe(true);
    await shot(page, `${SCRATCH}/doodle-rubbed.png`);

    await ink(page, 'blue').click();
    await expect(tool(page, 'pen')).toHaveAttribute('aria-pressed', 'true');
    await expect(tool(page, 'rubber')).toHaveAttribute('aria-pressed', 'false');
    await control(page, 'undo').click();
    await paintedWith(page, 0.5, 0.5, RED).toBe(true);
  });

  test('the world rests while drawing, and the album is as it was after', async ({ page }) => {
    await playing(page);
    await pictureOpen(page);
    await drawing(page);
    await line(page, [0.2, 0.5], [0.8, 0.5]);
    await control(page, 'done').click();
    await expect.poll(() => photosHad(page)).toBe(2);
    await page.keyboard.press('Escape');
    await expect(page.locator('.photo-view')).toHaveCount(0);
    await expect(page.locator('.photo')).toHaveCount(2);
    await page.keyboard.press('Escape');
    await expect(photoAlbum(page)).toHaveCount(0);
  });
});
