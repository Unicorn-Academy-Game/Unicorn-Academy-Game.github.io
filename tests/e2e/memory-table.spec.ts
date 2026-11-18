import { expect, type Locator, type Page, test } from '@playwright/test';
import { wordClip } from '../../src/learning';
import { spoken, toTheGarden, touch } from './computer';
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
  watchConsole,
  worldRuns,
} from './helpers';

/**
 * The memory table in front of the palace. A tap on it makes it sparkle, and with learning on the
 * player sits down at a board of cards a moment later. These are the whole of that in the game as a
 * child finds it: a finger on the table, the world resting under the screen, two cards turned at a
 * time, a game won and kept, and the way out at every moment. The rules are
 * `tests/learning/play/memory.test.ts` and the session is `tests/game/memory-game.test.ts`.
 *
 * The world's time is stepped by hand while Wildstar walks up to the table, and the screen comes on
 * a real timer when the table has had its moment, so the wait for it steps the world as it goes.
 * The recorded voice goes through the gate of zero that `openGame` puts before the speakers, and
 * the tests that listen end by looking that the device's own voice was never asked to speak.
 */

const TABLE = 'palace-garden/memory-table-1';

const screen = (page: Page): Locator => page.locator('.table-game[data-game="memory"]');
const cards = (page: Page): Locator => screen(page).locator('[data-content-id="memory.card"]');
const control = (page: Page, id: string): Locator => screen(page).locator(`[data-content-id="memory.${id}"]`);
const pill = (page: Page, cardCount: number): Locator =>
  screen(page).locator(`[data-content-id="memory.size"][data-pairs="${cardCount / 2}"]`);

/**
 * The garden, with the leader on the lawn and no butterfly to take a tap. The game is already being
 * played.
 */
async function inTheGarden(page: Page): Promise<void> {
  await openGame(page);
  await play(page);
  await toTheGarden(page);
}

/** Wildstar walks up to the table and a finger taps it. */
async function tapTheTable(page: Page): Promise<void> {
  await standBelow(page, TABLE, 60);
  await tapWorld(page, await spotOn(page, TABLE));
}

/**
 * Waits for her to sit down: the world walks her up as it is stepped, and the screen comes on a
 * real moment after the table has sparkled.
 */
async function untilSitting(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        await step(page, 1);
        return page.evaluate(() => window.__ua!.memory.game?.busy ?? false);
      },
      { message: 'her to sit down at the memory table', timeout: 60_000 * PATIENCE, intervals: [100] },
    )
    .toBe(true);
  await expect(cards(page).first()).toBeVisible();
}

/** Sits the player down at the table, with learning on. */
async function sitDown(page: Page, say = false): Promise<void> {
  await inTheGarden(page);
  await learningOn(page, { say });
  await tapTheTable(page);
  await untilSitting(page);
}

/**
 * The word on the face of each card, by place. The faces are in the page whichever way a card lies,
 * because that is how a screen reader finds them.
 */
const faces = (page: Page): Promise<string[]> =>
  cards(page).evaluateAll((nodes) => nodes.map((node) => node.querySelector('.mem-word')?.textContent ?? ''));

const stateOf = (page: Page, place: number): Locator => cards(page).nth(place);

/** The places of each word on the board, two for each. */
function pairsOf(words: readonly string[]): [number, number][] {
  const at = new Map<string, number[]>();
  words.forEach((word, place) => {
    at.set(word, [...(at.get(word) ?? []), place]);
  });
  return [...at.values()].map(([a, b]) => [a!, b!]);
}

/** Two places that do not have the same word. */
function notAPair(words: readonly string[]): [number, number] {
  const second = words.findIndex((word) => word !== words[0]);
  return [0, second];
}

const turnCard = (page: Page, place: number): Promise<void> => touch(page, cards(page).nth(place));

/** Finds every pair, with no luck needed, since the faces are in the page. */
async function playItThrough(page: Page): Promise<void> {
  const words = await faces(page);
  for (const [a, b] of pairsOf(words)) {
    await turnCard(page, a);
    await expect(stateOf(page, a)).toHaveAttribute('data-state', 'up');
    await turnCard(page, b);
    await expect(stateOf(page, b)).toHaveAttribute('data-state', 'paired');
    await expect(stateOf(page, a)).toHaveAttribute('data-state', 'paired');
  }
}

const record = (page: Page) => page.evaluate(() => window.__ua!.play.get().memory);

/**
 * Chooses a size of board: the button of the size where the sizes are in a row, and on a screen too
 * short for that the steps back and on, as many as it takes.
 */
async function chooseSize(page: Page, count: number): Promise<void> {
  const pill = screen(page).locator(`[data-content-id="memory.size"][data-pairs="${count / 2}"]`);
  if (await pill.isVisible()) {
    await pill.click();
    return;
  }
  const now = screen(page).locator('[data-content-id="memory.now"]');
  for (let steps = 0; steps < 8; steps++) {
    const shown = Number(await now.getAttribute('data-pairs'));
    if (shown === count / 2) return;
    await screen(page)
      .locator(`[data-content-id="memory.step-${shown < count / 2 ? 'more' : 'less'}"]`)
      .click();
    await expect(now).not.toHaveAttribute('data-pairs', String(shown));
  }
  throw new Error(`no way to choose ${count} cards`);
}

test.describe('the memory table', () => {
  test('a tap on it makes it sparkle, and the player sits down at a board of six cards, face down, while the world rests', async ({
    page,
  }, info) => {
    const noise = watchConsole(page);
    await inTheGarden(page);
    await learningOn(page);
    await standBelow(page, TABLE, 60);
    await step(page, 0.5);
    await shot(page, `${SCRATCH}/memory-world-${info.project.name}.png`);
    await tapWorld(page, await spotOn(page, TABLE));
    await untilSitting(page);

    await expect(cards(page)).toHaveCount(6);
    for (let place = 0; place < 6; place++) await expect(stateOf(page, place)).toHaveAttribute('data-state', 'down');
    await expect(pill(page, 6)).toHaveAttribute('aria-pressed', 'true');
    await expect(screen(page).locator('[data-content-id="memory.size"]')).toHaveCount(8);
    await expect(control(page, 'close')).toBeVisible();
    expect(await worldRuns(page)).toBe(false);
    await expect(page.locator('[data-reading="true"]')).toBeAttached();
    await expect(page.getByRole('dialog', { name: 'Memory game' })).toBeVisible();
    // Every picture is on two cards.
    const words = await faces(page);
    expect(pairsOf(words)).toHaveLength(3);
    expect(new Set(words).size).toBe(3);
    await page.waitForTimeout(900);
    await shot(page, `${SCRATCH}/memory-open-${info.project.name}.png`);
    expect(noise).toEqual([]);
    expect(await spoken(page)).toEqual([]);
  });

  test('two cards that are the same stay up, a whole game is won with three stars, and it is kept', async ({
    page,
  }, info) => {
    const noise = watchConsole(page);
    await sitDown(page);
    expect(await record(page)).toMatchObject({ played: 0 });

    await playItThrough(page);
    await shot(page, `${SCRATCH}/memory-found-${info.project.name}.png`);
    await expect(control(page, 'won')).toBeVisible({ timeout: 30_000 * PATIENCE });
    await expect(control(page, 'won')).toHaveText('You found every pair!');
    await expect(control(page, 'turns')).toContainText('3 turns');
    await expect(screen(page).locator('.play-won-stars')).toHaveAttribute('data-stars', '3');
    await shot(page, `${SCRATCH}/memory-won-${info.project.name}.png`);
    expect(await record(page)).toMatchObject({ played: 1, sizes: { '3': { wins: 1, best: 3, stars: 3 } } });

    // The bigger game is offered, and the same size again.
    await expect(control(page, 'more')).toContainText('8 cards');
    await control(page, 'more').click();
    await expect(cards(page)).toHaveCount(8);
    await expect(pill(page, 8)).toHaveAttribute('aria-pressed', 'true');
    await expect(pill(page, 6)).toHaveAttribute('aria-label', '6 cards, 3 stars');
    expect(noise).toEqual([]);
    expect(await spoken(page)).toEqual([]);
  });

  test('a game of thirty-two cards and a game of sixty-four cards can be chosen, played to the end, and are kept', async ({
    page,
  }, info) => {
    test.setTimeout(300_000);
    const noise = watchConsole(page);
    await sitDown(page);
    await pill(page, 32).click();
    await expect(cards(page)).toHaveCount(32);
    expect(pairsOf(await faces(page))).toHaveLength(16);
    await expect(screen(page).locator('.mem-board')).not.toHaveAttribute('data-entering', 'true');
    await shot(page, `${SCRATCH}/memory-32-${info.project.name}.png`);
    await playItThrough(page);
    await expect(control(page, 'won')).toBeVisible({ timeout: 30_000 * PATIENCE });
    expect(await record(page)).toMatchObject({ played: 1, sizes: { '16': { wins: 1 } } });

    await pill(page, 64).click();
    await expect(cards(page)).toHaveCount(64);
    expect(pairsOf(await faces(page))).toHaveLength(32);
    await expect(screen(page).locator('.mem-board')).not.toHaveAttribute('data-entering', 'true');
    await shot(page, `${SCRATCH}/memory-64-${info.project.name}.png`);
    await playItThrough(page);
    await expect(control(page, 'won')).toBeVisible({ timeout: 30_000 * PATIENCE });
    expect(await record(page)).toMatchObject({ played: 2, sizes: { '16': { wins: 1 }, '32': { wins: 1 } } });
    await expect(control(page, 'more')).toHaveCount(0);
    expect(noise).toEqual([]);
  });

  test('every size of board fits every screen it may be played on, with cards big enough for a finger and the buttons clear of each other', async ({
    page,
  }, info) => {
    test.setTimeout(240_000);
    await sitDown(page, true);
    const views = [
      { name: 'phone-sideways', width: 844, height: 390 },
      { name: 'small-phone-sideways', width: 568, height: 320 },
      { name: 'phone-upright', width: 390, height: 844 },
      { name: 'small-phone-upright', width: 320, height: 568 },
      { name: 'laptop', width: 1280, height: 720 },
    ];
    for (const view of views) {
      await page.setViewportSize({ width: view.width, height: view.height });
      for (const count of [6, 8, 12, 16, 24, 32, 48, 64]) {
        const where = `${view.name}, ${count} cards`;
        await chooseSize(page, count);
        await expect(cards(page)).toHaveCount(count);
        // What comes in grows to its size, so it is measured once it is there.
        await expect(screen(page).locator('.mem-board')).not.toHaveAttribute('data-entering', 'true');
        const found = await page.evaluate(() => {
          const box = (el: Element) => {
            const r = el.getBoundingClientRect();
            return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
          };
          const root = document.querySelector('.table-game')!;
          const hud = document.querySelector<HTMLElement>('.hud');
          return {
            view: { width: window.innerWidth, height: window.innerHeight },
            across: document.documentElement.scrollWidth,
            panel: box(root.querySelector('.read-panel')!),
            body: box(root.querySelector('.play-body')!),
            cards: [...root.querySelectorAll('[data-content-id="memory.card"]')].map(box),
            stepping: getComputedStyle(root.querySelector('.play-stepper')!).display !== 'none',
            buttons: [
              ...root.querySelectorAll('.read-close, .read-level, .play-size, .play-step, .play-hear:not([hidden])'),
            ]
              .filter((el) => el.getClientRects().length > 0)
              .map(box),
            hear: box(root.querySelector('.play-hear')!),
            hud: hud && !hud.hidden ? box(hud) : null,
          };
        });
        const inside = (
          inner: { left: number; top: number; right: number; bottom: number },
          outer: { left: number; top: number; right: number; bottom: number },
        ) =>
          inner.left >= outer.left - 1 &&
          inner.top >= outer.top - 1 &&
          inner.right <= outer.right + 1 &&
          inner.bottom <= outer.bottom + 1;
        const apart = (
          a: { left: number; top: number; right: number; bottom: number },
          b: { left: number; top: number; right: number; bottom: number },
        ) => a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1;
        const screenBox = { left: 0, top: 0, right: found.view.width, bottom: found.view.height };
        // Looked at before it is measured, so a board that does not pass can be seen.
        if (count === 64 || count === 32 || count === 6)
          await shot(page, `${SCRATCH}/memory-fit-${view.name}-${count}-${info.project.name}.png`);

        expect(found.across, `${where}: nothing to scroll across`).toBeLessThanOrEqual(found.view.width);
        expect(inside(found.panel, screenBox), `${where}: the screen is on the screen`).toBe(true);
        for (const [place, card] of found.cards.entries()) {
          expect(inside(card, found.body), `${where}: card ${place} is inside the board`).toBe(true);
          // The big boards trade the size of a card for the number of them, so the smallest a card
          // may be is a thumb for the boards that were there, and less for the ones that came after.
          // Thirty-two cards on the smallest phone held sideways, 568 by 320, are 36 or more wide, and
          // sixty-four on the narrowest, 320 across, come out 27.9, which is over the 24 pixels that
          // WCAG 2.2 asks of a target.
          const least = count <= 16 ? 44 : count <= 32 ? 36 : 26;
          expect(card.width, `${where}: card ${place} is wide enough to touch`).toBeGreaterThanOrEqual(least);
          expect(card.height, `${where}: card ${place} is tall enough to touch`).toBeGreaterThanOrEqual(least);
        }
        for (const [place, card] of found.cards.entries()) {
          for (const other of found.cards.slice(place + 1))
            expect(apart(card, other), `${where}: two cards are apart`).toBe(true);
        }
        expect(
          Math.abs(found.hear.width - found.hear.height),
          `${where}: the voice button is round, and not squeezed`,
        ).toBeLessThan(1.5);
        expect(found.hear.width, `${where}: the voice button is wide enough to touch`).toBeGreaterThanOrEqual(44);
        expect(found.stepping, `${where}: only the shortest screens step through the sizes`).toBe(
          view.width <= 680 && view.height <= 480,
        );
        expect(
          found.buttons.length,
          `${where}: the close button, the sizes (eight, or the two steps) and the voice button are all there`,
        ).toBeGreaterThanOrEqual(found.stepping ? 4 : 10);
        const everything = found.hud ? [...found.buttons, found.hud] : found.buttons;
        for (const [place, one] of found.buttons.entries()) {
          expect(inside(one, found.panel), `${where}: a thing of the top bar is on the screen`).toBe(true);
          for (const other of everything.slice(place + 1))
            expect(apart(one, other), `${where}: two things of the top bar are apart`).toBe(true);
        }
      }
    }
  });

  test('two cards that are not the same turn back down by themselves, and nothing says it was wrong', async ({
    page,
  }) => {
    await sitDown(page);
    const [a, b] = notAPair(await faces(page));
    await turnCard(page, a);
    await turnCard(page, b);
    await expect(stateOf(page, a)).toHaveAttribute('data-state', 'up');
    await expect(stateOf(page, b)).toHaveAttribute('data-state', 'up');
    // What the screen says in words, apart from the words on the cards, which are pictures' names.
    const said = (await screen(page).locator('.read-head, .read-live, .play-tools').allTextContents()).join(' ');
    expect(said).not.toMatch(/\b(wrong|fail|failed|bad|oops|no|not)\b/i);
    await expect(stateOf(page, a)).toHaveAttribute('data-state', 'down', { timeout: 15_000 * PATIENCE });
    await expect(stateOf(page, b)).toHaveAttribute('data-state', 'down');
    expect(await record(page)).toMatchObject({ played: 0 });
  });

  test('a card touched while two that are not the same are still up turns them down at once, so the player never waits to try again', async ({
    page,
  }) => {
    await sitDown(page);
    const words = await faces(page);
    const [a, b] = notAPair(words);
    const c = words.findIndex((word, place) => place !== a && place !== b && word !== words[a] && word !== words[b]);
    await turnCard(page, a);
    await turnCard(page, b);
    await expect(stateOf(page, b)).toHaveAttribute('data-state', 'up');
    await turnCard(page, c);
    await expect(stateOf(page, a)).toHaveAttribute('data-state', 'down');
    await expect(stateOf(page, b)).toHaveAttribute('data-state', 'down');
    await expect(stateOf(page, c)).toHaveAttribute('data-state', 'up');
  });

  test('a second finger turns a card while the first is still down, and two fingers that land together turn two cards', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'only Chromium takes touches from the protocol');
    await sitDown(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    const [first, second] = pairsOf(await faces(page));
    const finger = async (place: number, id: number): Promise<{ x: number; y: number; id: number }> => {
      const box = (await cards(page).nth(place).boundingBox())!;
      return { x: box.x + box.width / 2, y: box.y + box.height / 2, id };
    };
    // One finger is still down on a card when another lands on its pair, as when a child taps with
    // both thumbs and the touches overlap.
    const held = await finger(first![0], 1);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [held] });
    await expect(stateOf(page, first![0])).toHaveAttribute('data-state', 'up');
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [held, await finger(first![1], 2)],
    });
    await expect(stateOf(page, first![1])).toHaveAttribute('data-state', 'paired');
    await expect(stateOf(page, first![0])).toHaveAttribute('data-state', 'paired');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    // Two fingers that land in the same instant on the two cards of a pair.
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [await finger(second![0], 1), await finger(second![1], 2)],
    });
    await expect(stateOf(page, second![0])).toHaveAttribute('data-state', 'paired');
    await expect(stateOf(page, second![1])).toHaveAttribute('data-state', 'paired');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect((await record(page)).played, 'the game is not won until the last pair is found').toBe(0);
  });

  test('every size can be chosen, and a new game of the same size has other pictures', async ({ page }) => {
    await sitDown(page);
    for (const count of [8, 12, 16, 6]) {
      await pill(page, count).click();
      await expect(cards(page)).toHaveCount(count);
      await expect(pill(page, count)).toHaveAttribute('aria-pressed', 'true');
    }
    // A board is dealt from all the pictures there are. Ten deals of sixteen cards that were all
    // the same board would be a deal that is not random.
    const seen = new Set<string>();
    for (let deal = 0; deal < 6; deal++) {
      await pill(page, 16).click();
      await expect(cards(page)).toHaveCount(16);
      seen.add((await faces(page)).join(','));
    }
    expect(seen.size, 'six deals of sixteen cards are six different boards').toBe(6);
  });

  test('the cross and the Escape key both put the player back in the world, which runs again', async ({ page }) => {
    await inTheGarden(page);
    await learningOn(page);
    await tapTheTable(page);
    await untilSitting(page);

    await control(page, 'close').click();
    await expect(screen(page)).toHaveCount(0);
    expect(await worldRuns(page)).toBe(true);
    expect(await page.evaluate(() => window.__ua!.memory.game!.busy)).toBe(false);
    expect(await page.evaluate(() => window.__ua!.stage.scene.input.enabled)).toBe(true);

    await step(page, 3);
    await tapTheTable(page);
    await untilSitting(page);
    await page.keyboard.press('Escape');
    await expect(screen(page)).toHaveCount(0);
    expect(await worldRuns(page)).toBe(true);
    expect(await spoken(page)).toEqual([]);
  });

  test('the arrow keys move between the cards and Enter turns one, and no key reaches Wildstar', async ({ page }) => {
    await sitDown(page);
    const leading = () => page.evaluate(() => ({ ...window.__ua!.controller.world.leader }));
    const before = await leading();
    await page.keyboard.press('ArrowRight');
    await expect(cards(page).nth(0)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(cards(page).nth(1)).toBeFocused();
    // The board is laid out in the columns that give the biggest cards, so one step down is a row
    // of them on, or the last card where there is no row below.
    const columns = await page.evaluate(
      () => getComputedStyle(document.querySelector('.mem-board')!).gridTemplateColumns.split(' ').length,
    );
    const below = Math.min(5, 1 + columns);
    await page.keyboard.press('ArrowDown');
    await expect(cards(page).nth(below)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(cards(page).nth(below - 1)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(stateOf(page, below - 1)).toHaveAttribute('data-state', 'up');
    expect(await leading(), 'the keys went to the cards, and Wildstar was not asked to walk').toEqual(before);
  });

  test('with learning off a tap on the table sits the player down at the cards all the same, and nothing is said', async ({
    page,
  }) => {
    await inTheGarden(page);
    expect(await page.evaluate(() => window.__ua!.settings.get().learning.on), 'learning is off').toBe(false);
    await listenForSounds(page);
    await tapTheTable(page);
    await untilSitting(page);
    await expect(cards(page)).toHaveCount(6);
    await turnCard(page, 0);
    await expect(stateOf(page, 0)).toHaveAttribute('data-state', 'up');
    expect(await page.evaluate(() => [...window.__ua!.voice.heard]), 'the voice belongs to learning').toEqual([]);
    expect(await spoken(page)).toEqual([]);
    await control(page, 'close').click();
    await expect(screen(page)).toHaveCount(0);
    expect(await worldRuns(page)).toBe(true);
  });

  test('with the voice on, a card says its word as it is turned, and the device is never asked to speak', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await sitDown(page, true);
    const words = await faces(page);
    const heard = (): Promise<string[]> => page.evaluate(() => [...window.__ua!.voice.heard]);
    await turnCard(page, 0);
    await expect
      .poll(async () => (await heard()).filter((id) => id === wordClip(words[0] as never)).length, {
        message: `${words[0]} to be said when its card is turned`,
      })
      .toBeGreaterThan(0);
    expect(await spoken(page)).toEqual([]);
  });

  test('with the voice on, the first game says how it is played, the button says it again, and a game won says well done', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await sitDown(page, true);
    const heard = (id: string): Promise<number> =>
      page.evaluate((clip) => window.__ua!.voice.heard.filter((said) => said === clip).length, id);
    await expect
      .poll(() => heard('play.memory.start'), {
        message: 'the way to play to be said when she sits down',
        timeout: 30_000 * PATIENCE,
      })
      .toBe(1);
    await control(page, 'hear').click();
    await expect
      .poll(() => heard('play.memory.start'), { message: 'the way to play to be said again by the button' })
      .toBe(2);

    await playItThrough(page);
    await expect(control(page, 'won')).toBeVisible({ timeout: 30_000 * PATIENCE });
    await expect
      .poll(() => heard('play.memory.done'), { message: 'well done to be said when the game is won' })
      .toBe(1);
    expect(await spoken(page)).toEqual([]);
  });

  test('a game the player won is on the device after the page is opened again', async ({ page }) => {
    test.setTimeout(240_000);
    await sitDown(page);
    await playItThrough(page);
    await expect(control(page, 'won')).toBeVisible({ timeout: 30_000 * PATIENCE });
    await page.evaluate(() => window.__ua!.play.flush());
    await page.reload();
    await page.waitForFunction(() => window.__ua !== undefined, undefined, {
      polling: 250,
      timeout: 120_000 * PATIENCE,
    });
    await expect
      .poll(async () => (await record(page)).played, {
        message: 'the game she won to be in the record that was kept',
        timeout: 30_000 * PATIENCE,
      })
      .toBe(1);
    expect(await record(page)).toMatchObject({ sizes: { '3': { wins: 1, best: 3, stars: 3 } } });
  });

  test('a code chunk that does not come is asked for again, and the screen opens when it does', async ({ page }) => {
    let asked = 0;
    let coming = false;
    await page.route(/\/game\/memory-game(\.ts)?(\?|$)/, (route) => {
      if (coming) return route.continue();
      asked++;
      return route.abort('failed');
    });
    await inTheGarden(page);
    await learningOn(page);
    await tapTheTable(page);

    const notice = page.locator('.notice');
    await expect
      .poll(
        async () => {
          await step(page, 1);
          return notice.count();
        },
        { message: 'the notice that the game did not open', timeout: 60_000 * PATIENCE, intervals: [100] },
      )
      .toBe(1);
    await expect(notice).toContainText('did not open');
    // The preload that comes some seconds into play is an ask too, so it can be the second, but a
    // chunk that did not come is never asked for in a loop.
    expect(asked, 'the code was not asked for again and again').toBeLessThanOrEqual(2);
    await expect(screen(page)).toHaveCount(0);
    expect(await page.evaluate(() => window.__ua!.memory.game), 'nothing came').toBeNull();

    coming = true;
    await notice.getByRole('button', { name: 'Try again' }).click();
    await untilSitting(page);
    await expect(notice).toHaveCount(0);
    expect(await spoken(page)).toEqual([]);
  });

  test('its chunk comes down by itself once play has begun, with learning on or off', async ({ page }) => {
    for (const learning of [true, false]) {
      await openGame(page, 'kept', '', { learning });
      await play(page);
      expect(await page.evaluate(() => window.__ua!.memory.game), 'the world starts without it').toBeNull();
      await expect
        .poll(() => page.evaluate(() => window.__ua!.memory.game !== null), {
          message: `the chunk to come down with learning ${learning ? 'on' : 'off'}`,
          timeout: 60_000 * PATIENCE,
        })
        .toBe(true);
      await page.goto('about:blank');
    }
  });
});
