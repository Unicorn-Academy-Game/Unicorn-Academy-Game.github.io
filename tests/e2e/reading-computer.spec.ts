import { expect, type Page, test } from '@playwright/test';
import { readWord } from '../../src/content/reading';
import { tileClip } from '../../src/learning/reading';
import {
  COMPUTER,
  control,
  middleOfTheTick,
  readCount,
  reading,
  screen,
  spoken,
  stayOn,
  tapTheComputer,
  tapTheTick,
  toTheGarden,
  touch,
  touchAll,
  untilSitting,
  wordOnScreen,
} from './computer';
import {
  learningOn,
  listenForSounds,
  openGame,
  PATIENCE,
  play,
  SCRATCH,
  shot,
  spotOn,
  standBelow,
  step,
  tapWorld,
  untilSounding,
  watchConsole,
  worldRuns,
} from './helpers';
import { fingers } from './touch';

/**
 * The reading computer, which stands by the palace where the piano's mirror is. A tap on it wakes
 * it with a little show of its own, and with learning on the player sits down at its screen a
 * moment later. These are the whole of that in the game as a child finds it: a finger on the
 * computer, the world resting under the screen, a word read from its tiles to the tap on the tick
 * that says yes, and the way out at every moment. What the screen looks like at every size of
 * window is `reading-layout.spec.ts`, and what the course does is the unit tests.
 *
 * The world's time is stepped by hand while Wildstar walks up to it, and the screen comes on a real
 * timer when the computer has had its moment, so the wait for it steps the world as it goes. The
 * recorded voice goes through the gate of zero that `openGame` puts before the speakers, and every
 * test ends by looking that the device's own voice was never asked to speak.
 */

/**
 * What the screen is for: the garden, with the leader on the lawn and no butterfly to take a tap.
 */
async function inTheGarden(page: Page): Promise<void> {
  await openGame(page);
  await play(page);
  await toTheGarden(page);
}

/**
 * Sits the player down at the computer, with learning on, and a word they have read stays on the
 * screen until the test goes on.
 */
async function sitDown(page: Page, say = false): Promise<void> {
  await inTheGarden(page);
  await learningOn(page, { say });
  await tapTheComputer(page);
  await untilSitting(page);
  await stayOn(page);
}

/**
 * A tap on the computer with learning off, from the start of the game to the home screen, with the
 * computer's code already fetched when `made` says so (a parent who turned learning off in the
 * middle of a day) and not yet fetched when it does not.
 */
async function tapItWithLearningOff(page: Page, made: boolean): Promise<void> {
  await openGame(page);
  await play(page);
  await untilSounding(page);
  await toTheGarden(page);
  await listenForSounds(page);
  if (made) {
    await page.evaluate(() => window.__ua!.reading.seat());
    expect(await page.evaluate(() => window.__ua!.reading.reader), 'the computer is made').not.toBeNull();
  }
  await tapTheComputer(page);
  await untilSitting(page);
}

test.describe('the reading computer', () => {
  test('a tap on it wakes it, and the player sits down at its home screen while the world rests', async ({
    page,
  }, info) => {
    const noise = watchConsole(page);
    await inTheGarden(page);
    await learningOn(page);
    await standBelow(page, COMPUTER, 60);
    await step(page, 0.5);
    await shot(page, `${SCRATCH}/computer-world-${info.project.name}.png`);
    await tapWorld(page, await spotOn(page, COMPUTER));
    await untilSitting(page);

    // The first visit has one big thing to press, and the levels are there from the start, since
    // the player chooses what they work on.
    await expect(control(page, 'start')).toBeVisible();
    await expect(control(page, 'levels')).toBeVisible();
    await expect(page.locator('.read-close')).toBeVisible();
    expect(await worldRuns(page)).toBe(false);
    // The corner steps aside for it, and the screen is a dialog that a screen reader finds.
    await expect(page.locator('[data-reading="true"]')).toBeAttached();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.waitForTimeout(900);
    await shot(page, `${SCRATCH}/computer-home-${info.project.name}.png`);
    expect(noise).toEqual([]);
    expect(await spoken(page)).toEqual([]);
  });

  test('the player chooses a level from the very first visit, any of them, and plays it', async ({ page }) => {
    const noise = watchConsole(page);
    await sitDown(page);
    await control(page, 'levels').click();
    await expect(page.locator('.read-map')).toBeVisible();
    const nodes = page.locator('.read-node');
    expect(await nodes.count(), 'every level is on the map').toBeGreaterThan(80);
    expect(await page.locator('.read-node[aria-disabled="true"]').count(), 'and none of them is shut').toBe(0);

    // A level far from the first, which nothing has led the player to.
    const far = page.locator('.read-node[data-n="30"]');
    await far.click();
    await expect(far).toHaveAttribute('data-picked', 'true');
    await expect(control(page, 'play')).toBeEnabled();
    await control(page, 'play').click();
    await expect(reading(page)).toHaveAttribute('data-phase', 'touching');
    await expect(page.locator('.read-level')).toHaveText('Level 30');
    expect(noise).toEqual([]);
    expect(await spoken(page)).toEqual([]);
  });

  test('the cross and the Escape key both put the player back in the world, which runs again', async ({ page }) => {
    await inTheGarden(page);
    await learningOn(page);
    await tapTheComputer(page);
    await untilSitting(page);

    await page.locator('.read-close').click();
    await expect(screen(page)).toHaveCount(0);
    expect(await worldRuns(page)).toBe(true);
    expect(await page.evaluate(() => window.__ua!.reading.reader!.busy)).toBe(false);
    expect(await page.evaluate(() => window.__ua!.stage.scene.input.enabled)).toBe(true);

    // The player can sit down again, and this time a key sends them back.
    await step(page, 3);
    await tapTheComputer(page);
    await untilSitting(page);
    await page.keyboard.press('Escape');
    await expect(screen(page)).toHaveCount(0);
    expect(await worldRuns(page)).toBe(true);
    expect(await spoken(page)).toEqual([]);
  });

  test("a key pressed at the screen is the screen's, and Wildstar does not walk off when she is back", async ({
    page,
  }) => {
    await inTheGarden(page);
    await learningOn(page);
    await tapTheComputer(page);
    await untilSitting(page);
    const where = (): Promise<{ x: number; y: number }> =>
      page.evaluate(() => ({ ...window.__ua!.controller.world.unicorns.wildstar!.pos }));
    const before = await where();

    for (const key of ['ArrowRight', 'ArrowDown', 'd', 's']) await page.keyboard.down(key);
    await page.waitForTimeout(300);
    for (const key of ['ArrowRight', 'ArrowDown', 'd', 's']) await page.keyboard.up(key);
    await page.keyboard.press('Escape');
    await expect(screen(page)).toHaveCount(0);
    await step(page, 2);
    const after = await where();
    expect(Math.hypot(after.x - before.x, after.y - before.y), 'she stayed where she was').toBeLessThan(2);
  });

  test("a word is read: its tiles in order, said out loud, one tap on the tick says yes, and it is in the player's book at once", async ({
    page,
  }, info) => {
    test.setTimeout(240_000);
    const noise = watchConsole(page);
    await sitDown(page);
    await control(page, 'start').click();
    await expect(reading(page)).toHaveAttribute('data-phase', 'touching');
    const word = await wordOnScreen(page);
    expect(readWord(word), `${word} is a word of the course`).toBeDefined();
    const pieces = control(page, 'piece');
    const count = await pieces.count();

    // A tile that is not the next one is turned away and nothing is counted.
    if (count > 1) {
      await touch(page, pieces.nth(count - 1));
      await expect(pieces.nth(0)).toHaveAttribute('data-state', 'waiting');
      await expect(pieces.nth(count - 1)).toHaveAttribute('data-state', 'waiting');
    }
    await touchAll(page);
    await expect(pieces.nth(count - 1)).toHaveAttribute('data-state', 'touched');

    // The pieces join and the player is asked to say it. Nobody holds anything: one tap on the tick
    // says yes.
    await expect(reading(page)).toHaveAttribute('data-phase', 'saying');
    const tried = word;
    expect(await readCount(page, tried), 'nothing is in her book before she says yes').toBeUndefined();
    await tapTheTick(page);
    await expect(reading(page)).toHaveAttribute('data-phase', 'found');
    expect(await readCount(page, tried), 'the word is in her book as soon as it is read').toBe(1);
    await page.waitForTimeout(900);
    await shot(page, `${SCRATCH}/computer-found-${info.project.name}.png`);

    // She goes on to the next thing, which is another one.
    await touch(page, control(page, 'next'));
    await expect(reading(page)).toHaveAttribute('data-phase', 'touching');
    expect(await readCount(page, tried)).toBe(1);
    expect(noise).toEqual([]);
    expect(await spoken(page)).toEqual([]);
  });

  test('a real finger that taps the tick says yes, and one that the system takes away says nothing', async ({
    page,
    browserName,
    hasTouch,
  }) => {
    test.skip(browserName !== 'chromium' || !hasTouch, 'real fingers are driven through Chromium');
    test.setTimeout(240_000);
    const noise = watchConsole(page);
    await sitDown(page);
    await control(page, 'start').click();
    const word = await wordOnScreen(page);
    await touchAll(page);
    await expect(reading(page)).toHaveAttribute('data-phase', 'saying');
    const hand = await fingers(page);
    const at = await middleOfTheTick(page);

    // A swipe from the edge takes the finger away after it landed. It has not said yes.
    await hand.down(1, at);
    await hand.cancel();
    await page.waitForTimeout(400);
    await expect(reading(page)).toHaveAttribute('data-phase', 'saying');
    expect(await readCount(page, word), 'a finger that was taken away leaves nothing in her book').toBeUndefined();

    // A finger that lands and lifts is a tap, and says yes.
    await hand.down(1, at);
    await hand.up(1);
    await expect(reading(page)).toHaveAttribute('data-phase', 'found', { timeout: 15_000 * PATIENCE });
    expect(await readCount(page, word), 'the word is in her book as soon as it is read').toBe(1);
    expect(noise).toEqual([]);
    expect(await spoken(page)).toEqual([]);
  });

  test('the player can always go on: a thing is skipped and left as it was, and the cross is there to leave from', async ({
    page,
  }) => {
    await sitDown(page);
    await control(page, 'start').click();
    const first = await wordOnScreen(page);
    const deal = (): Promise<string | null> => reading(page).getAttribute('data-deal');
    const before = await deal();

    await control(page, 'skip').click();
    await expect.poll(deal, { message: 'the next thing to be dealt' }).not.toBe(before);
    expect(await readCount(page, first)).toBeUndefined();
    expect(await page.evaluate(() => Object.keys(window.__ua!.learner.get().words))).toEqual([]);

    // The screen is still there, and the player can leave it from here.
    await expect(reading(page)).toHaveAttribute('data-phase', 'touching');
    await page.locator('.read-close').click();
    await expect(screen(page)).toHaveCount(0);
    expect(await worldRuns(page)).toBe(true);
  });

  test('a parent turning learning off leaves the screen up, and what the player read stays read', async ({ page }) => {
    await sitDown(page);
    await control(page, 'start').click();
    const word = await wordOnScreen(page);
    await touchAll(page);
    await tapTheTick(page);
    await expect(reading(page)).toHaveAttribute('data-phase', 'found');

    await page.evaluate(() =>
      window.__ua!.settings.update({ learning: { ...window.__ua!.settings.get().learning, on: false } }),
    );
    await expect(screen(page)).toHaveCount(1);
    expect(await readCount(page, word)).toBe(1);
    expect(await page.evaluate(() => window.__ua!.reading.reader!.busy)).toBe(true);
    await page.locator('.read-close').click();
    await expect(screen(page)).toHaveCount(0);
    expect(await worldRuns(page)).toBe(true);
  });

  test('what the player read is still read after the page is loaded again', async ({ page }) => {
    await sitDown(page);
    await control(page, 'start').click();
    const word = await wordOnScreen(page);
    await touchAll(page);
    await tapTheTick(page);
    await expect(reading(page)).toHaveAttribute('data-phase', 'found');
    expect(await readCount(page, word)).toBe(1);

    await page.evaluate(() => window.__ua!.learner.flush());
    await page.reload();
    await page.waitForFunction(() => window.__ua !== undefined, undefined, {
      polling: 250,
      timeout: 120_000 * PATIENCE,
    });
    await expect
      .poll(() => readCount(page, word), {
        message: 'the word she read to be in the book that was kept',
        timeout: 30_000 * PATIENCE,
      })
      .toBe(1);
  });

  test('with the voice on, a tile says its sound as it is touched, and the device is never asked to speak', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await inTheGarden(page);
    await learningOn(page, { say: true });
    await tapTheComputer(page);
    await untilSitting(page);
    await control(page, 'start').click();
    const word = await wordOnScreen(page);
    const clip = tileClip(readWord(word)!.tiles[0]!);
    const heard = (): Promise<string[]> => page.evaluate(() => [...window.__ua!.voice.heard]);

    await touch(page, control(page, 'piece').nth(0));
    if (clip === null) await page.waitForTimeout(500);
    else
      await expect
        .poll(async () => (await heard()).filter((id) => id === clip).length, {
          message: `${clip} to be said for the first tile of ${word}`,
        })
        .toBeGreaterThan(0);
    expect(await spoken(page)).toEqual([]);
  });

  test('with learning off a tap on the computer sits the player down at its home screen all the same, and nothing is said', async ({
    page,
  }) => {
    await tapItWithLearningOff(page, false);
    await expect(screen(page)).toHaveAttribute('data-screen', 'home');
    expect(await page.evaluate(() => window.__ua!.reading.reader!.busy)).toBe(true);
    expect(await page.evaluate(() => [...window.__ua!.voice.heard]), 'the voice belongs to learning').toEqual([]);
    expect(await spoken(page)).toEqual([]);
  });

  test('with learning off and the computer already made, a tap sits the player down too', async ({ page }) => {
    await tapItWithLearningOff(page, true);
    await expect(screen(page)).toHaveAttribute('data-screen', 'home');
    await control(page, 'close').click();
    await expect(screen(page)).toHaveCount(0);
    expect(await page.evaluate(() => window.__ua!.reading.reader!.busy)).toBe(false);
    expect(await worldRuns(page)).toBe(true);
  });

  test('a code chunk that does not come is asked for again, and the screen opens when it does', async ({ page }) => {
    // The requests for the computer's code fail, as a phone's do when the signal drops for a
    // moment, until the test lets them through. The page learns nothing of it by itself, so it has
    // to say so, with a button that asks again.
    let asked = 0;
    let coming = false;
    await page.route(/\/game\/reader(\.ts)?(\?|$)/, (route) => {
      asked++;
      return coming ? route.continue() : route.abort('failed');
    });
    await inTheGarden(page);
    await learningOn(page);
    await tapTheComputer(page);

    const notice = page.locator('.notice');
    await expect
      .poll(
        async () => {
          await step(page, 1);
          return notice.count();
        },
        { message: 'the notice that the computer did not wake up', timeout: 60_000 * PATIENCE, intervals: [100] },
      )
      .toBe(1);
    await expect(notice).toContainText('did not wake up');
    // The preload that comes some seconds into play is an ask too, so it can be the second, but a
    // chunk that did not come is never asked for in a loop.
    expect(asked, 'the code was not asked for again and again').toBeLessThanOrEqual(2);
    await expect(screen(page)).toHaveCount(0);
    expect(await page.evaluate(() => window.__ua!.reading.reader), 'nothing came').toBeNull();
    expect(await worldRuns(page)).toBe(true);

    const before = asked;
    coming = true;
    await notice.getByRole('button', { name: 'Try again' }).click();
    await untilSitting(page);
    expect(asked, 'and again').toBeGreaterThan(before);
    await expect(notice).toHaveCount(0);
    expect(await spoken(page)).toEqual([]);
  });

  test('its chunk comes down by itself once play has begun, with learning on or off', async ({ page }) => {
    for (const learning of [true, false]) {
      await openGame(page, 'kept', '', { learning });
      await play(page);
      expect(await page.evaluate(() => window.__ua!.reading.reader), 'the world starts without it').toBeNull();
      await expect
        .poll(() => page.evaluate(() => window.__ua!.reading.reader !== null), {
          message: `the chunk to come down with learning ${learning ? 'on' : 'off'}`,
          timeout: 60_000 * PATIENCE,
        })
        .toBe(true);
      await page.goto('about:blank');
    }
  });
});
