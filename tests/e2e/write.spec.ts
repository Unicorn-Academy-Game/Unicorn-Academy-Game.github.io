import { expect, type Locator, type Page, test } from '@playwright/test';
import { glyphOf, type Point, type WriteKind } from '../../src/content/letters';
import { along } from '../../src/game/tracing';
import { freeze, hush, openBook, openGame, play, settled, spellBook, stickersHad, watchStickers } from './helpers';

/** The Spell Book is open and the world is still. */
async function booked(page: Page): Promise<void> {
  await openGame(page);
  await watchStickers(page);
  await play(page);
  await page.locator('.title').waitFor({ state: 'hidden' });
  await freeze(page);
  await hush(page);
  await openBook(page);
}

const desk = (page: Page): Locator => page.locator('.write');
const tile = (page: Page, letter: string): Locator => page.locator(`.write-tile[data-letter="${letter}"]`);
const control = (page: Page, kind: string): Locator => page.locator(`.write [data-content-id="write.${kind}"]`);
const paper = (page: Page): Locator => page.locator('.write-svg');

async function writing(page: Page): Promise<void> {
  await booked(page);
  await page.locator('.book-write').click();
  await expect(desk(page)).toBeVisible();
  await settled(page);
}

/** Where a point of the letter is on the screen, by the way the page draws it. */
async function onScreen(page: Page): Promise<(point: Point) => { x: number; y: number }> {
  const [a, b, c, d, e, f] = await paper(page).evaluate((svg) => {
    const m = (svg as unknown as SVGGraphicsElement).getScreenCTM()!;
    return [m.a, m.b, m.c, m.d, m.e, m.f];
  });
  return ([x, y]) => ({ x: a! * x + c! * y + e!, y: b! * x + d! * y + f! });
}

/** The finger goes down at the start of a stroke of the letter and along it, up to `share` of the way. */
async function follow(page: Page, letter: string, stroke: number, share = 1, off = 0): Promise<void> {
  const glyph = glyphOf(letter, ((await desk(page).getAttribute('data-case')) as WriteKind) ?? 'upper')!;
  const there = await onScreen(page);
  const points = along(glyph.strokes[stroke]!);
  // A finger moves in strides, not in the steps the page measures in, and each move costs a round trip.
  const written = points.slice(0, Math.max(1, Math.round(points.length * share)));
  const stride = Math.min(10, Math.max(3, Math.ceil(written.length / 10)));
  const goes = written.filter((_, i, all) => i % stride === 0 || i === all.length - 1);
  const first = there(goes[0]!);
  await page.mouse.move(first.x + off, first.y + off);
  await page.mouse.down();
  for (const point of goes) {
    const at = there(point);
    await page.mouse.move(at.x + off, at.y + off);
  }
  await page.mouse.up();
}

const progress = async (page: Page): Promise<number[]> =>
  ((await paper(page).getAttribute('data-progress')) ?? '').split(' ').map(Number);

/** Counts the stars the pen leaves on the page, and the most that are on it at one time. */
async function counting(page: Page): Promise<() => Promise<{ made: number; most: number }>> {
  type Seen = { made: number; most: number };
  await page.evaluate(() => {
    const layer = document.querySelector('.write-sparks')!;
    const seen = { made: 0, most: 0 };
    (window as unknown as { __sparks: Seen }).__sparks = seen;
    new MutationObserver((changes) => {
      for (const change of changes) seen.made += change.addedNodes.length;
      seen.most = Math.max(seen.most, layer.childElementCount);
    }).observe(layer, { childList: true });
  });
  return () => page.evaluate(() => (window as unknown as { __sparks: Seen }).__sparks);
}

test.describe('writing the letters', () => {
  test('a letter is written by following it with a finger, and the sticker book gets its first letter', async ({
    page,
  }) => {
    await writing(page);
    await expect(page.locator('.write-tile')).toHaveCount(26);
    await expect(page.locator('.write-count')).toHaveText('0/26');
    const before = await stickersHad(page);

    await tile(page, 'l').click();
    await expect(paper(page)).toBeVisible();
    await expect(desk(page)).toHaveAttribute('data-view', 'write');
    await expect(desk(page)).toHaveAttribute('data-done', 'false');
    await settled(page);
    expect(await progress(page)).toEqual([0, 0]);

    await follow(page, 'l', 0);
    expect(await progress(page)).toEqual([1, 0]);
    await expect(desk(page)).toHaveAttribute('data-done', 'false');
    await follow(page, 'l', 1);
    await expect(desk(page)).toHaveAttribute('data-done', 'true');
    expect(await progress(page)).toEqual([1, 1]);

    await control(page, 'shut').click();
    await expect(desk(page)).toHaveAttribute('data-view', 'letters');
    await expect(tile(page, 'l')).toHaveAttribute('data-written', 'true');
    await expect(page.locator('.write-count')).toHaveText('1/26');
    await expect.poll(() => stickersHad(page)).toBe(before + 1);
    const got = await page.evaluate(() => Object.keys(window.__ua!.album.got()));
    expect(got).toContain('write');
  });

  test('a finger that is off the line does nothing, and nothing is said to be wrong', async ({ page }) => {
    await writing(page);
    await tile(page, 'i').click();
    await expect(paper(page)).toBeVisible();
    await settled(page);
    const there = await onScreen(page);
    const from = there([50, 20]);
    const to = there([50, 80]);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
    expect(await progress(page)).toEqual([0]);
    await expect(desk(page)).toHaveAttribute('data-done', 'false');
    await expect(desk(page)).not.toContainText(/wrong|lost|miss|fail|try again/i);
  });

  test('a line waits where it got to when the finger lifts, and goes on from there', async ({ page }) => {
    await writing(page);
    await tile(page, 'h').click();
    await expect(paper(page)).toBeVisible();
    await settled(page);
    await follow(page, 'h', 0, 0.5);
    const half = (await progress(page))[0]!;
    expect(half).toBeGreaterThan(0.3);
    expect(half).toBeLessThan(0.7);
    await follow(page, 'h', 0, 1);
    expect((await progress(page))[0]).toBe(1);
  });

  test('a line is only written from its start', async ({ page }) => {
    await writing(page);
    await tile(page, 'l').click();
    await expect(paper(page)).toBeVisible();
    await settled(page);
    const there = await onScreen(page);
    const glyph = glyphOf('l', 'upper')!;
    const backwards = along(glyph.strokes[0]!).reverse();
    const first = there(backwards[0]!);
    await page.mouse.move(first.x, first.y);
    await page.mouse.down();
    for (const point of backwards) {
      const at = there(point);
      await page.mouse.move(at.x, at.y);
    }
    await page.mouse.up();
    expect((await progress(page))[0]).toBeLessThan(1);
  });

  test('a finger a little off the line still writes it', async ({ page }) => {
    await writing(page);
    await tile(page, 't').click();
    await expect(paper(page)).toBeVisible();
    await settled(page);
    await follow(page, 't', 0, 1, 9);
    await follow(page, 't', 1, 1, 9);
    await expect(desk(page)).toHaveAttribute('data-done', 'true');
  });

  test('the helper writes the next line, and the whole letter when asked again', async ({ page }) => {
    await writing(page);
    await tile(page, 'v').click();
    await expect(paper(page)).toBeVisible();
    await settled(page);
    await control(page, 'help').click();
    await expect.poll(async () => (await progress(page))[0]).toBe(1);
    await control(page, 'help').click();
    await expect(desk(page)).toHaveAttribute('data-done', 'true');
    await expect(control(page, 'help')).toHaveAttribute('aria-disabled', 'true');
  });

  test('the arrows go to the next letter and the one before, and round the ends', async ({ page }) => {
    await writing(page);
    await tile(page, 'a').click();
    await expect(page.locator('.write-pair b').first()).toHaveText('A');
    await control(page, 'next').click();
    await expect(page.locator('.write-pair b').first()).toHaveText('B');
    await control(page, 'previous').click();
    await control(page, 'previous').click();
    await expect(page.locator('.write-pair b').first()).toHaveText('Z');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.write-pair b').first()).toHaveText('A');
  });

  test('capital and small letters are written and counted apart', async ({ page }) => {
    await writing(page);
    await expect(desk(page)).toHaveAttribute('data-case', 'upper');
    await tile(page, 'o').click();
    await expect(paper(page)).toBeVisible();
    await settled(page);
    await follow(page, 'o', 0);
    await expect(desk(page)).toHaveAttribute('data-done', 'true');
    await control(page, 'case').click();
    await expect(desk(page)).toHaveAttribute('data-case', 'lower');
    await expect(desk(page)).toHaveAttribute('data-done', 'false');
    await control(page, 'shut').click();
    await expect(tile(page, 'o')).toHaveAttribute('data-written', 'false');
    // The small letters, then the numbers, and round to the capitals again.
    await control(page, 'case').click();
    await control(page, 'case').click();
    await expect(desk(page)).toHaveAttribute('data-case', 'upper');
    await expect(tile(page, 'o')).toHaveAttribute('data-written', 'true');
  });

  test('the numbers have a page of their own, are written the same way, and earn their stickers', async ({ page }) => {
    await writing(page);
    await control(page, 'case').click();
    await control(page, 'case').click();
    await expect(desk(page)).toHaveAttribute('data-case', 'digits');
    await expect(page.locator('.write-tile')).toHaveCount(10);
    await expect(page.locator('.write-count')).toHaveText('0/10');
    await expect(tile(page, '7')).toHaveAccessibleName(/number 7/);
    const before = await stickersHad(page);

    await tile(page, '4').click();
    await expect(paper(page)).toBeVisible();
    await settled(page);
    await expect(page.locator('.write-pair b').first()).toHaveText('4');
    await expect(page.locator('.write-pair b').last()).toHaveText('four');
    expect(await progress(page), 'a four is written in two lines').toEqual([0, 0]);
    await follow(page, '4', 0);
    await expect(desk(page)).toHaveAttribute('data-done', 'false');
    await follow(page, '4', 1);
    await expect(desk(page)).toHaveAttribute('data-done', 'true');

    await control(page, 'shut').click();
    await expect(tile(page, '4')).toHaveAttribute('data-written', 'true');
    await expect(page.locator('.write-count')).toHaveText('1/10');
    await expect.poll(() => stickersHad(page)).toBe(before + 1);
    const got = await page.evaluate(() => Object.keys(window.__ua!.album.got()));
    expect(got).toContain('write-number');
    expect(got, 'a numeral is not a letter').not.toContain('write');

    await control(page, 'case').click();
    await expect(page.locator('.write-count'), 'the capitals are as they were').toHaveText('0/26');
  });

  test('the arrows go round the ten numbers, and Home and End go to the ends', async ({ page }) => {
    await writing(page);
    await control(page, 'case').click();
    await control(page, 'case').click();
    await tile(page, '0').click();
    await expect(page.locator('.write-pair b').last()).toHaveText('zero');
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.write-pair b').first()).toHaveText('9');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.write-pair b').first()).toHaveText('0');
    await page.keyboard.press('End');
    await expect(page.locator('.write-pair b').first()).toHaveText('9');
    await page.keyboard.press('Home');
    await expect(page.locator('.write-pair b').first()).toHaveText('0');
  });

  test('the way back has a name, on the page of one and on the page of them all', async ({ page }) => {
    await writing(page);
    await expect(control(page, 'shut')).toHaveAccessibleName('Back to the book');
    await tile(page, 'a').click();
    await expect(control(page, 'shut')).toHaveAccessibleName(/Back to the page of them all/);
  });

  test('Escape goes off the page, off the letters and then off the book', async ({ page }) => {
    await writing(page);
    await tile(page, 'a').click();
    await expect(desk(page)).toHaveAttribute('data-view', 'write');
    await page.keyboard.press('Escape');
    await expect(desk(page)).toHaveAttribute('data-view', 'letters');
    await page.keyboard.press('Escape');
    await expect(desk(page)).toHaveCount(0);
    await expect(spellBook(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(spellBook(page)).toHaveCount(0);
  });

  test('the book under the desk is out of reach while the desk is over it', async ({ page }) => {
    await writing(page);
    for (const part of ['.book-head', '.book-tabs', '.book-page'])
      await expect(page.locator(part)).toHaveAttribute('inert', '');
    await control(page, 'shut').click();
    for (const part of ['.book-head', '.book-tabs', '.book-page'])
      await expect(page.locator(part)).not.toHaveAttribute('inert', '');
  });

  test('every letter has strokes that can be followed on the screen', async ({ page }) => {
    test.setTimeout(300_000);
    await writing(page);
    for (const letter of ['a', 'm', 's', 'w', 'z']) {
      await tile(page, letter).click();
      await expect(paper(page)).toBeVisible();
      await settled(page);
      const glyph = glyphOf(letter, 'upper')!;
      for (let stroke = 0; stroke < glyph.strokes.length; stroke++) await follow(page, letter, stroke);
      await expect(desk(page)).toHaveAttribute('data-done', 'true');
      await control(page, 'shut').click();
      await expect(tile(page, letter)).toHaveAttribute('data-written', 'true');
    }
    await expect(page.locator('.write-count')).toHaveText('5/26');
  });

  test('the pen leaves a trail of stars that goes, a few at a time', async ({ page }) => {
    await writing(page);
    await tile(page, 'l').click();
    await expect(paper(page)).toBeVisible();
    await settled(page);
    const stars = await counting(page);
    await follow(page, 'l', 0);
    const { made, most } = await stars();
    expect(made).toBeGreaterThanOrEqual(3);
    expect(most).toBeLessThanOrEqual(16);
    await expect(page.locator('.write-spark')).toHaveCount(0, { timeout: 15_000 });
  });

  test('with fewer effects the pen leaves no stars', async ({ page }) => {
    await openGame(page);
    await page.evaluate(() => window.__ua!.settings.update({ reducedEffects: true }));
    await play(page);
    await page.locator('.title').waitFor({ state: 'hidden' });
    await freeze(page);
    await hush(page);
    await openBook(page);
    await page.locator('.book-write').click();
    await expect(desk(page)).toBeVisible();
    await settled(page);
    await tile(page, 'l').click();
    await expect(paper(page)).toBeVisible();
    await settled(page);
    const stars = await counting(page);
    await follow(page, 'l', 0);
    expect(await progress(page)).toEqual([1, 0]);
    expect((await stars()).made).toBe(0);
  });

  test('a device that asks for less motion gets no stars either, and a dot that waits at the start', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await writing(page);
    await tile(page, 'l').click();
    await expect(paper(page)).toBeVisible();
    await expect(page.locator('.write-hint')).toHaveAttribute('data-show', 'still');
    const stars = await counting(page);
    await follow(page, 'l', 0);
    expect(await progress(page)).toEqual([1, 0]);
    expect((await stars()).made).toBe(0);
  });
});
