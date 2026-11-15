import { expect, type Locator, type Page } from '@playwright/test';
import { freeze, hush, PATIENCE, spotOn, standBelow, step, tapWorld } from './helpers';

/**
 * What a test needs to sit a child down at the reading computer and read a word, for the specs that
 * do it in the development server and the ones that do it in the built game. It is their side of
 * the screen: a finger on the computer, on a tile, on the button that goes on, and the tick that
 * they tap when they have said it.
 */

/** The computer's place in the garden, by the id of its instance on the map. */
export const COMPUTER = 'palace-garden/computer-1';

export const screen = (page: Page): Locator => page.locator('.read');
export const control = (page: Page, id: string): Locator => page.locator(`.read [data-content-id="reading.${id}"]`);
export const reading = (page: Page): Locator => page.locator('.read-item');

/**
 * What the computer is for: the garden, with the leader on the lawn, nothing moving and no
 * butterfly to take a tap. The game is already being played.
 */
export async function toTheGarden(page: Page): Promise<void> {
  await freeze(page);
  await page.evaluate(() => window.__ua!.controller.travel({ mapId: 'palace-garden', spawnId: 'from-forest' }));
  await hush(page);
}

/** Wildstar walks up to the computer and a finger taps it. */
export async function tapTheComputer(page: Page): Promise<void> {
  await standBelow(page, COMPUTER, 60);
  await tapWorld(page, await spotOn(page, COMPUTER));
}

/**
 * Waits for the player to sit down: the world walks Wildstar up as it is stepped, and the screen
 * comes on a real moment after the computer has woken.
 */
export async function untilSitting(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        await step(page, 1);
        return page.evaluate(() => window.__ua!.reading.reader?.busy ?? false);
      },
      { message: 'her to sit down at the computer', timeout: 60_000 * PATIENCE, intervals: [100] },
    )
    .toBe(true);
  await expect(screen(page)).toHaveAttribute('data-screen', 'home');
}

/**
 * Waits for as long as the screen would take to come after a tap, and some more. It waits on the
 * game's own clock, which runs its timers in the order of their due times, so the moment it has
 * passed is a moment after the one the computer sets for the screen however loaded the machine is,
 * and not just a number of seconds in the test.
 */
export const pastTheLeadIn = (page: Page): Promise<void> =>
  page.evaluate(() => new Promise<void>((done) => window.setTimeout(done, 4000)));

/**
 * A word they have read stays on the screen until the test goes on, and not for the few seconds it
 * stays for a child.
 */
export const stayOn = (page: Page): Promise<number> =>
  page.evaluate(() => (window.__ua!.reading.reader!.stayMs = 600_000));

/** The word on the screen, from its tiles. */
export const wordOnScreen = async (page: Page): Promise<string> =>
  (await control(page, 'piece').locator('.read-cap').allTextContents()).join('').toLowerCase();

/**
 * A finger on a thing, at the middle of where it is at that moment. A tile that is shining swells
 * and settles for as long as it shines, and the button that goes on bobs for as long as it waits,
 * so a click that waits for either to hold still would wait as long.
 */
export async function touch(page: Page, thing: Locator): Promise<void> {
  await expect(thing).toBeVisible();
  const box = (await thing.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/** Touches every tile of the word, or every word of the sentence, in order. */
export async function touchAll(page: Page): Promise<void> {
  const pieces = control(page, 'piece');
  const count = await pieces.count();
  for (let at = 0; at < count; at++) await touch(page, pieces.nth(at));
}

/**
 * Waits for the tick to be asked for, which is once the pieces have joined and the player is to say
 * it.
 */
async function untilTheTickIsAsked(page: Page): Promise<void> {
  await expect(page.locator('.read-answers')).toHaveAttribute('data-live', 'true');
  await expect(control(page, 'check')).toHaveAttribute('aria-disabled', 'false');
}

/** The middle of the tick, once it is asked for. */
export async function middleOfTheTick(page: Page): Promise<Point> {
  await untilTheTickIsAsked(page);
  const box = (await control(page, 'check').boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** What the player does when they have said it: one tap on the tick. */
export async function tapTheTick(page: Page): Promise<void> {
  await untilTheTickIsAsked(page);
  await touch(page, control(page, 'check'));
}

export interface Point {
  x: number;
  y: number;
}

/** How many times a word is in the player's book as read, or nothing when it is not there. */
export const readCount = (page: Page, word: string): Promise<number | undefined> =>
  page.evaluate((id) => window.__ua!.learner.get().words[id]?.read?.done, word);

/** What the device's own voice was asked to say, which is nothing, since the game never asks it. */
export const spoken = (page: Page): Promise<string[]> => page.evaluate(() => window.__silence!.spoken);
