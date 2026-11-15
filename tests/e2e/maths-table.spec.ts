import { expect, type Locator, type Page, test } from '@playwright/test';
import { type Family, familyOf, STRAND_IDS, type StrandId, strandsOf } from '../../src/learning/play/maths/question';
import { pastTheLeadIn, spoken, toTheGarden, touch } from './computer';
import {
  learningOn,
  openGame,
  PATIENCE,
  play,
  SCRATCH,
  shot,
  spotOn,
  standBelow,
  step,
  tapWorld,
  untilDelighted,
  watchConsole,
  worldRuns,
} from './helpers';

/**
 * The maths table in front of the palace, which is the abacus. A tap on it makes it sparkle, and
 * with learning on the player sits down at the tiles a moment later, chooses a kind of sum, and
 * answers a round of five. These are the whole of that in the game as a child finds it: a finger on
 * the abacus, the world resting under the screen, a choice that rests and a choice that lights up,
 * a round finished and kept, and the way out at every moment. The rules are
 * `tests/learning/play/maths-questions.test.ts` and `maths-round.test.ts`, and the session is
 * `tests/game/maths-game.test.ts`.
 *
 * The world's time is stepped by hand while Wildstar walks up, and the screen comes on a real timer
 * when the abacus has had its moment, so the wait for it steps the world as it goes. Every page is
 * silent: the recorded voice goes through the gate of zero that `openGame` puts before the
 * speakers, and the tests that listen end by looking that the device's own voice was never asked to
 * speak.
 */

const TABLE = 'palace-garden/abacus-1';

const screen = (page: Page): Locator => page.locator('.table-game[data-game="maths"]');
const choices = (page: Page): Locator => screen(page).locator('[data-content-id="maths.choice"]');
const tiles = (page: Page): Locator => screen(page).locator('[data-content-id="maths.tile"]');
const tile = (page: Page, strand: StrandId): Locator =>
  screen(page).locator(`[data-content-id="maths.tile"][data-strand="${strand}"]`);
const control = (page: Page, id: string): Locator => screen(page).locator(`[data-content-id="maths.${id}"]`);
/**
 * The button that switches to Level 0 or Level 1, which is in the top bar while the tiles are up.
 */
const pill = (page: Page, level: Family): Locator =>
  screen(page).locator(`[data-content-id="maths.family"][data-family="${level}"]`);

/** What the screen is showing, as the session handed it over. */
const showing = (page: Page) => page.evaluate(() => window.__ua!.maths.game?.showing ?? null);
const asked = async (page: Page) => {
  const view = await showing(page);
  if (view?.kind !== 'ask') throw new Error(`the screen shows ${view?.kind ?? 'nothing'}, not a question`);
  return view;
};
const record = (page: Page) => page.evaluate(() => window.__ua!.play.get().maths);

/**
 * The garden, with the leader on the lawn and no butterfly to take a tap. The game is already being
 * played.
 */
async function inTheGarden(page: Page): Promise<void> {
  await openGame(page);
  await play(page);
  await toTheGarden(page);
}

/** Wildstar walks up to the abacus and a finger taps it. */
async function tapTheTable(page: Page): Promise<void> {
  await standBelow(page, TABLE, 60);
  await tapWorld(page, await spotOn(page, TABLE));
}

/**
 * Waits for her to sit down: the world walks her up as it is stepped, and the screen comes on a
 * real moment after the abacus has sparkled.
 */
async function untilSitting(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        await step(page, 1);
        return page.evaluate(() => window.__ua!.maths.game?.busy ?? false);
      },
      { message: 'her to sit down at the maths table', timeout: 60_000 * PATIENCE, intervals: [100] },
    )
    .toBe(true);
  await expect(tiles(page).first()).toBeVisible();
}

/** Sits the player down at the table, with learning on. */
async function sitDown(page: Page, say = false): Promise<void> {
  await inTheGarden(page);
  await learningOn(page, { say });
  await tapTheTable(page);
  await untilSitting(page);
}

/**
 * Puts a kind of sum at a level in what the player has done, as if they had got there, and leaves
 * everything else as it was.
 */
const reachLevel = (page: Page, strand: StrandId, level: 1 | 2 | 3): Promise<void> =>
  page.evaluate(
    ([id, at]) => {
      const now = window.__ua!.play.get();
      window.__ua!.play.set({
        ...now,
        maths: { ...now.maths, strands: { ...now.maths.strands, [id]: { level: at, rounds: 1, flawless: 0 } } },
      });
    },
    [strand, level] as const,
  );

/**
 * Goes to the tiles if the player is not at them, switches to the level the kind of sum is in, and
 * touches its tile.
 */
async function openTile(page: Page, strand: StrandId): Promise<void> {
  if (await control(page, 'menu').isVisible()) await control(page, 'menu').click();
  const level = pill(page, familyOf(strand));
  if ((await level.getAttribute('aria-pressed')) !== 'true') await level.click();
  await tile(page, strand).click();
}

/** Touches the choice at a place. */
const choose = (page: Page, place: number): Promise<void> => touch(page, choices(page).nth(place));

/** Waits for a question of a round that is not the one with this number. */
async function untilAfter(page: Page, serial: number): Promise<void> {
  await expect
    .poll(
      async () =>
        (await showing(page))?.kind === 'done' ||
        ((await showing(page)) as { serial?: number } | null)?.serial !== serial,
      { message: 'the next question to come', timeout: 30_000 * PATIENCE },
    )
    .toBe(true);
}

/**
 * Answers the question that is up, after `slips` choices that are not the one, and waits for what
 * comes next.
 */
async function answer(page: Page, slips = 0): Promise<void> {
  const view = await asked(page);
  const wrong = view.question.choices.map((_, place) => place).filter((place) => place !== view.question.answer);
  for (const place of wrong.slice(0, slips)) await choose(page, place);
  await choose(page, view.question.answer);
  await expect(choices(page).nth(view.question.answer)).toHaveAttribute('data-state', 'right');
  await untilAfter(page, view.serial);
}

/** A whole round of five, the first `slips` questions each slipped once. */
async function playRound(page: Page, strand: StrandId, slips = 0): Promise<void> {
  await openTile(page, strand);
  for (let i = 0; i < 5; i++) {
    await expect(choices(page).first()).toBeVisible();
    await answer(page, i < slips ? 1 : 0);
  }
  await expect(control(page, 'done')).toBeVisible({ timeout: 30_000 * PATIENCE });
}

const VIEWS = [
  { name: 'phone-sideways', width: 844, height: 390 },
  { name: 'small-phone-sideways', width: 568, height: 320 },
  { name: 'phone-upright', width: 390, height: 844 },
  { name: 'small-phone-upright', width: 320, height: 568 },
  { name: 'laptop', width: 1280, height: 720 },
];

type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };
/**
 * A box and, when it is writing, how high the letters are, because a one is narrow at any size, and
 * when it is bars of squares, how big a square is, because a single bar is as tall as one square.
 */
type Seen = Box & { writing: number | null; square: number | null };

const inside = (inner: Box, outer: Box): boolean =>
  inner.left >= outer.left - 1.5 &&
  inner.top >= outer.top - 1.5 &&
  inner.right <= outer.right + 1.5 &&
  inner.bottom <= outer.bottom + 1.5;
const apart = (a: Box, b: Box): boolean =>
  a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1;
/**
 * How big a thing is to the eye: the size of its letters when it is writing, of a square when it is
 * bars, and else its smaller side.
 */
const seen = (one: Seen): number => one.writing ?? one.square ?? Math.min(one.width, one.height);
/**
 * A bar is read by its length and by the two shades of its fives, so its squares may be smaller
 * than a drawing that is known by its shape. They are never smaller than the smallest letters on
 * these screens.
 */
const SQUARE = 13;
/** The least `seen` that is enough: one number for a drawing and one for writing. */
const least = (one: Seen, drawing: number, writing: number): number =>
  one.writing !== null ? writing : one.square !== null ? SQUARE : drawing;

/** Where everything on the maths screen is, as the page lays it out now. */
const measure = (page: Page) =>
  page.evaluate(() => {
    const box = (el: Element): Box => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const look = (el: Element): Seen => ({
      ...box(el),
      writing: el.matches('.mv-numeral, .mv-words, .mv-time, .mv-equation')
        ? Number.parseFloat(getComputedStyle(el).fontSize)
        : null,
      square: el.matches('.mv-blocks') ? el.querySelector('i, .mv-cube')!.getBoundingClientRect().height : null,
    });
    const root = document.querySelector('.table-game')!;
    const hud = document.querySelector<HTMLElement>('.hud');
    const show = root.querySelector('.maths-show:not([hidden])');
    const prompt = root.querySelector<HTMLElement>('.maths-prompt')!;
    return {
      view: { width: window.innerWidth, height: window.innerHeight },
      across: document.documentElement.scrollWidth,
      panel: box(root.querySelector('.read-panel')!),
      body: box(root.querySelector('.play-body')!),
      prompt: { ...box(prompt), clipped: prompt.scrollWidth > prompt.clientWidth + 1 },
      show: show ? box(show) : null,
      shown: show?.firstElementChild ? look(show.firstElementChild) : null,
      choices: [...root.querySelectorAll('[data-content-id="maths.choice"]')].map((el) => {
        const inner = el.querySelector('.maths-choice-in')!;
        return {
          choice: box(el),
          drawn: inner.firstElementChild ? look(inner.firstElementChild) : null,
          inner: box(inner),
        };
      }),
      buttons: [
        ...root.querySelectorAll('.read-close, .read-level, .play-menu:not([hidden]), .play-hear:not([hidden])'),
      ]
        .filter((el) => el.getClientRects().length > 0)
        .map(box),
      hud: hud && !hud.hidden ? box(hud) : null,
      what: `${root.querySelector('.maths-ask')?.getAttribute('data-strand')} ${root.querySelector('.maths-prompt')?.textContent}`,
    };
  });

test.describe('the maths table', () => {
  test('a tap on the abacus makes it sparkle, and the player sits down at the tiles, one for each kind of sum, while the world rests', async ({
    page,
  }, info) => {
    const noise = watchConsole(page);
    await inTheGarden(page);
    await learningOn(page);
    await standBelow(page, TABLE, 60);
    await step(page, 0.5);
    await shot(page, `${SCRATCH}/maths-world-${info.project.name}.png`);
    await tapWorld(page, await spotOn(page, TABLE));
    await untilSitting(page);

    await expect(tiles(page)).toHaveCount(strandsOf(0).length);
    await expect(control(page, 'close')).toBeVisible();
    await expect(control(page, 'title')).toHaveText('Maths');
    await expect(control(page, 'menu')).toBeHidden();
    expect(await worldRuns(page)).toBe(false);
    await expect(page.locator('[data-reading="true"]')).toBeAttached();
    await expect(page.getByRole('dialog', { name: 'Maths game' })).toBeVisible();
    for (const id of strandsOf(0)) await expect(tile(page, id)).toBeVisible();
    await page.waitForTimeout(900);
    await shot(page, `${SCRATCH}/maths-tiles-${info.project.name}.png`);
    expect(noise).toEqual([]);
    expect(await spoken(page)).toEqual([]);
  });

  test('a tile starts a round at its first level, and a choice that is not the one rests while nothing says it was wrong', async ({
    page,
  }, info) => {
    await sitDown(page);
    await tile(page, 'count').click();
    await expect(choices(page).first()).toBeVisible();
    const view = await asked(page);
    expect(view).toMatchObject({ strand: 'count', level: 1, index: 0, length: 5, solved: false });
    await expect(control(page, 'title')).toHaveText('Counting');
    await expect(control(page, 'prompt')).toHaveText(view.question.prompt);
    await expect(control(page, 'menu')).toBeVisible();
    await page.waitForTimeout(700);
    await shot(page, `${SCRATCH}/maths-question-${info.project.name}.png`);

    const wrong = view.question.choices.map((_, place) => place).filter((place) => place !== view.question.answer);
    await choose(page, wrong[0]!);
    await expect(choices(page).nth(wrong[0]!)).toHaveAttribute('data-state', 'rest');
    await expect(choices(page).nth(wrong[0]!)).toHaveAttribute('aria-disabled', 'true');
    // What the screen says in words, apart from the numbers it shows.
    const said = (
      await screen(page).locator('.read-head, .read-live, .play-tools, .maths-prompt').allTextContents()
    ).join(' ');
    expect(said).not.toMatch(/\b(wrong|fail|failed|bad|oops|no|not|mistake|sorry)\b/i);
    expect((await asked(page)).serial, 'the same question stays up, in place').toBe(view.serial);

    // After a second one has rested the right one shines, and touching it lights it up.
    await choose(page, wrong[1]!);
    await expect(choices(page).nth(view.question.answer)).toHaveAttribute('data-hint', 'true');
    await choose(page, view.question.answer);
    await expect(choices(page).nth(view.question.answer)).toHaveAttribute('data-state', 'right');
    await expect(choices(page).nth(view.question.answer)).toHaveAttribute('data-hint', 'false');
    await page.waitForTimeout(200);
    await shot(page, `${SCRATCH}/maths-right-${info.project.name}.png`);
    expect(await page.evaluate(() => window.__ua!.voice.heard), 'with the voice off no clip was begun').toEqual([]);
    expect(await spoken(page)).toEqual([]);
  });

  test('a whole round is played, three stars and the next level are earned, and the tile shows how far the player has come', async ({
    page,
  }, info) => {
    test.setTimeout(240_000);
    const noise = watchConsole(page);
    await sitDown(page);
    expect(await record(page)).toMatchObject({ played: 0 });
    await playRound(page, 'add');
    await shot(page, `${SCRATCH}/maths-done-${info.project.name}.png`);
    await expect(control(page, 'done')).toHaveText('Well done!');
    await expect(screen(page).locator('.play-won-stars')).toHaveAttribute('data-stars', '3');
    await expect(control(page, 'count')).toContainText('5 of 5');
    await expect(control(page, 'levelup')).toHaveText('On to level 2!');
    expect(await record(page)).toEqual({ played: 1, strands: { add: { level: 2, rounds: 1, flawless: 1 } } });

    // The next round of it is at the next level, and the tile remembers.
    await control(page, 'again').click();
    await expect(choices(page).first()).toBeVisible();
    expect(await asked(page)).toMatchObject({ strand: 'add', level: 2, index: 0 });
    await control(page, 'menu').click();
    await expect(tile(page, 'add').locator('.maths-pips i[data-on="true"]')).toHaveCount(2);
    await expect(tile(page, 'add')).toHaveAttribute('aria-label', 'Adding, level 2');
    await expect(tile(page, 'clock').locator('.maths-pips i[data-on="true"]')).toHaveCount(0);
    expect(noise).toEqual([]);
    expect(await spoken(page)).toEqual([]);
  });

  test('a round with slips earns fewer stars, and stays at its level until most of it is answered at the first touch', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await sitDown(page);
    await playRound(page, 'take', 3);
    await expect(screen(page).locator('.play-won-stars')).toHaveAttribute('data-stars', '1');
    await expect(control(page, 'count')).toContainText('2 of 5');
    await expect(control(page, 'levelup')).toHaveCount(0);
    expect(await record(page)).toEqual({ played: 1, strands: { take: { level: 1, rounds: 1, flawless: 0 } } });
  });

  test('Level 0 is the first table and Level 1 has the sums the player does at school, one tap away, and a switch at the tiles is kept while they are at the table', async ({
    page,
  }, info) => {
    await sitDown(page);
    // The player has played nothing, so the table opens at Level 0 with its ten kinds of sum.
    await expect(pill(page, 0)).toHaveText('Level 0');
    await expect(pill(page, 1)).toHaveText('Level 1');
    await expect(pill(page, 0)).toHaveAttribute('aria-pressed', 'true');
    await expect(pill(page, 1)).toHaveAttribute('aria-pressed', 'false');
    await expect(tiles(page)).toHaveCount(strandsOf(0).length);
    await expect(tile(page, 'plus')).toHaveCount(0);

    // Level 1 is never locked, and its tiles are adding, taking away, times, sharing and sums with
    // a few numbers.
    await pill(page, 1).click();
    await expect(pill(page, 1)).toHaveAttribute('aria-pressed', 'true');
    await expect(pill(page, 0)).toHaveAttribute('aria-pressed', 'false');
    await expect(tiles(page)).toHaveCount(strandsOf(1).length);
    for (const id of strandsOf(1)) await expect(tile(page, id)).toBeVisible();
    await expect(tile(page, 'count')).toHaveCount(0);
    await expect(tile(page, 'times')).toHaveAttribute('aria-label', 'Times tables');
    await page.waitForTimeout(700);
    await shot(page, `${SCRATCH}/maths-level-1-${info.project.name}.png`);

    // A round of it is at its own first level, with the sum written out as the player meets it at
    // school, and no switch gets in the way of a question.
    await tile(page, 'mixed').click();
    await expect(choices(page).first()).toBeVisible();
    expect(await asked(page)).toMatchObject({ strand: 'mixed', level: 1, index: 0, length: 5 });
    await expect(control(page, 'prompt')).toHaveText(/^What is \d+ (plus|take away) \d+ (plus|take away) \d+\?$/);
    await expect(screen(page).locator('.mv-equation')).toContainText('?');
    await expect(pill(page, 0)).toBeHidden();
    await expect(pill(page, 1)).toBeHidden();
    await page.waitForTimeout(500);
    await shot(page, `${SCRATCH}/maths-sum-${info.project.name}.png`);

    // Back at the tiles the player is still at Level 1, and a switch back to Level 0 stays as it is
    // after the screen is closed and opened again.
    await control(page, 'menu').click();
    await expect(pill(page, 1)).toHaveAttribute('aria-pressed', 'true');
    await expect(tiles(page)).toHaveCount(strandsOf(1).length);
    await pill(page, 0).click();
    await expect(tiles(page)).toHaveCount(strandsOf(0).length);
    await pill(page, 1).click();
    await control(page, 'close').click();
    await expect(screen(page)).toHaveCount(0);
    await step(page, 3);
    await tapTheTable(page);
    await untilSitting(page);
    await expect(pill(page, 1)).toHaveAttribute('aria-pressed', 'true');
    await expect(tiles(page)).toHaveCount(strandsOf(1).length);
    expect(await record(page), 'looking at the tiles of Level 1 is nothing to keep').toEqual({
      played: 0,
      strands: {},
    });
    expect(await spoken(page)).toEqual([]);
  });

  test('a round of times tables is played at Level 1, and it is kept, and the table opens at Level 1 when the player comes back', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await sitDown(page);
    await playRound(page, 'times');
    await expect(control(page, 'levelup')).toHaveText('On to level 2!');
    expect(await record(page)).toEqual({ played: 1, strands: { times: { level: 2, rounds: 1, flawless: 1 } } });
    await page.evaluate(() => window.__ua!.play.flush());
    await page.reload();
    await page.waitForFunction(() => window.__ua !== undefined, undefined, {
      polling: 250,
      timeout: 120_000 * PATIENCE,
    });
    await expect
      .poll(async () => (await record(page)).played, {
        message: 'the round she finished to be in the record that was kept',
        timeout: 30_000 * PATIENCE,
      })
      .toBe(1);
    await play(page);
    await toTheGarden(page);
    await learningOn(page);
    await tapTheTable(page);
    await untilSitting(page);
    await expect(pill(page, 1)).toHaveAttribute('aria-pressed', 'true');
    await expect(tiles(page)).toHaveCount(strandsOf(1).length);
    await expect(tile(page, 'times')).toHaveAttribute('aria-label', 'Times tables, level 2');
    expect(await spoken(page)).toEqual([]);
  });

  for (const view of VIEWS) {
    test(`every kind of sum, at every level, fits ${view.name} with buttons big enough for a finger and clear of each other`, async ({
      page,
    }, info) => {
      test.setTimeout(1_800_000);
      await sitDown(page);
      await page.setViewportSize({ width: view.width, height: view.height });
      for (const strand of STRAND_IDS) {
        for (const level of [1, 2, 3] as const) {
          for (let sample = 0; sample < 2; sample++) {
            await reachLevel(page, strand, level);
            // The tile the player is looking at was drawn before the level was set, so they go back
            // to the tiles to see it.
            await openTile(page, strand);
            await expect(choices(page).first()).toBeVisible();
            // What comes in grows to its size, so it is measured once it is there.
            await expect(screen(page).locator('.maths-ask')).not.toHaveAttribute('data-entering', 'true');
            const found = await measure(page);
            const where = `${view.name}, ${strand} level ${level} (${found.what})`;
            const screenBox = {
              left: 0,
              top: 0,
              right: found.view.width,
              bottom: found.view.height,
              width: found.view.width,
              height: found.view.height,
            };

            expect.soft(found.across, `${where}: nothing to scroll across`).toBeLessThanOrEqual(found.view.width);
            expect.soft(inside(found.panel, screenBox), `${where}: the screen is on the screen`).toBe(true);
            expect.soft(found.prompt.clipped, `${where}: the question is not cut off`).toBe(false);
            expect.soft(inside(found.prompt, found.body), `${where}: the question is inside the screen`).toBe(true);
            if (found.show && found.shown) {
              expect.soft(found.show.width, `${where}: there is room to look`).toBeGreaterThanOrEqual(90);
              expect.soft(found.show.height, `${where}: there is room to look`).toBeGreaterThanOrEqual(60);
              expect.soft(inside(found.shown, found.show), `${where}: what is shown is inside its box`).toBe(true);
              expect
                .soft(seen(found.shown), `${where}: what is shown is big enough to see`)
                .toBeGreaterThanOrEqual(least(found.shown, 30, 20));
            }
            for (const [place, one] of found.choices.entries()) {
              expect.soft(inside(one.choice, found.body), `${where}: choice ${place} is inside the screen`).toBe(true);
              expect
                .soft(one.choice.width, `${where}: choice ${place} is wide enough to touch`)
                .toBeGreaterThanOrEqual(44);
              expect
                .soft(one.choice.height, `${where}: choice ${place} is tall enough to touch`)
                .toBeGreaterThanOrEqual(44);
              if (one.drawn) {
                expect
                  .soft(inside(one.drawn, one.inner), `${where}: what choice ${place} shows is inside it`)
                  .toBe(true);
                expect
                  .soft(seen(one.drawn), `${where}: what choice ${place} shows is big enough to see`)
                  .toBeGreaterThanOrEqual(least(one.drawn, 24, 20));
              }
              for (const other of found.choices.slice(place + 1))
                expect.soft(apart(one.choice, other.choice), `${where}: two choices are apart`).toBe(true);
              if (found.show)
                expect.soft(apart(one.choice, found.show), `${where}: a choice is clear of what is shown`).toBe(true);
            }
            expect
              .soft(found.buttons.length, `${where}: the close button, the way back and the voice button are there`)
              .toBeGreaterThanOrEqual(2);
            const everything = found.hud ? [...found.buttons, found.hud] : found.buttons;
            for (const [place, one] of found.buttons.entries()) {
              expect.soft(inside(one, found.panel), `${where}: a thing of the top bar is on the screen`).toBe(true);
              for (const other of everything.slice(place + 1))
                expect.soft(apart(one, other), `${where}: two things of the top bar are apart`).toBe(true);
            }
            if (sample === 0)
              await shot(page, `${SCRATCH}/maths-fit-${view.name}-${strand}-${level}-${info.project.name}.png`);
          }
        }
      }
    });
  }

  test('the cross and the Escape key both put the player back in the world, which runs again', async ({ page }) => {
    await inTheGarden(page);
    await learningOn(page);
    await tapTheTable(page);
    await untilSitting(page);

    await control(page, 'close').click();
    await expect(screen(page)).toHaveCount(0);
    expect(await worldRuns(page)).toBe(true);
    expect(await page.evaluate(() => window.__ua!.maths.game!.busy)).toBe(false);
    expect(await page.evaluate(() => window.__ua!.stage.scene.input.enabled)).toBe(true);

    await step(page, 3);
    await tapTheTable(page);
    await untilSitting(page);
    await tile(page, 'shape').click();
    await expect(choices(page).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(screen(page)).toHaveCount(0);
    expect(await worldRuns(page)).toBe(true);
    expect(await record(page), 'a round left in the middle is nothing to keep').toMatchObject({ played: 0 });
    expect(await spoken(page)).toEqual([]);
  });

  test('the arrow keys move between the tiles and between the choices, Enter chooses, and no key reaches Wildstar', async ({
    page,
  }) => {
    await sitDown(page);
    const leading = () => page.evaluate(() => ({ ...window.__ua!.controller.world.leader }));
    const before = await leading();
    // The first tile has the focus as the tiles come up, and the tiles are five across and two
    // down.
    await expect(tiles(page).nth(0)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(tiles(page).nth(1)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(tiles(page).nth(2)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(tiles(page).nth(7)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(tiles(page).nth(6)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(tiles(page).nth(7)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(choices(page).first()).toBeVisible();
    expect((await asked(page)).strand).toBe('shape');

    // The first choice takes the focus as the question comes up, so a child on a keyboard is
    // already on it.
    await expect(choices(page).nth(0)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(choices(page).nth(1)).toBeFocused();
    const right = (await asked(page)).question.answer;
    for (let place = 1; place < right; place++) await page.keyboard.press('ArrowRight');
    for (let place = 1; place > right; place--) await page.keyboard.press('ArrowLeft');
    await expect(choices(page).nth(right)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(choices(page).nth(right)).toHaveAttribute('data-state', 'right');
    expect(await leading(), 'the keys went to the screen, and Wildstar was not asked to walk').toEqual(before);
  });

  test('at Level 1 the arrow keys go three across and two down, and a step down from the last of the first line is the last tile', async ({
    page,
  }) => {
    await sitDown(page);
    await pill(page, 1).click();
    await expect(tiles(page)).toHaveCount(5);
    await tiles(page).nth(0).focus();
    await page.keyboard.press('ArrowRight');
    await expect(tiles(page).nth(1)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(tiles(page).nth(4)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(tiles(page).nth(3)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(tiles(page).nth(0)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await expect(tiles(page).nth(4)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(choices(page).first()).toBeVisible();
    expect((await asked(page)).strand).toBe('mixed');
  });

  test('with learning off a tap on the abacus only makes it sparkle, and no screen comes', async ({ page }) => {
    await openGame(page);
    await play(page);
    await toTheGarden(page);
    await tapTheTable(page);
    await untilDelighted(page, 'palace-garden/abacus-1');
    await pastTheLeadIn(page);
    await step(page, 1);
    await expect(screen(page)).toHaveCount(0);
    expect(await page.evaluate(() => window.__ua!.maths.game), 'nothing was fetched for it').toBeNull();
    expect(await worldRuns(page)).toBe(true);
    expect(await spoken(page)).toEqual([]);
  });

  test('with the voice on, the first visit says what to play, the button says it again, and a question, the choice the player touches and a cheer are said as they come', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await sitDown(page, true);
    const heard = (): Promise<string[]> => page.evaluate(() => [...window.__ua!.voice.heard]);
    const times = async (id: string): Promise<number> => (await heard()).filter((said) => said === id).length;
    const allSaid = async (ids: readonly string[]): Promise<boolean> => {
      const now = await heard();
      return ids.every((id) => now.includes(id));
    };
    await expect
      .poll(() => times('maths.pick'), {
        message: 'what to play to be said when she sits down',
        timeout: 30_000 * PATIENCE,
      })
      .toBe(1);
    await control(page, 'hear').click();
    await expect.poll(() => times('maths.pick'), { message: 'what to play to be said again by the button' }).toBe(2);

    await tile(page, 'add').click();
    const view = await asked(page);
    expect(view.question.say.length, 'a question has words to say').toBeGreaterThan(0);
    await expect
      .poll(() => allSaid(view.question.say), { message: 'the question to be read out', timeout: 30_000 * PATIENCE })
      .toBe(true);

    const first = view.question.say[0]!;
    const before = await times(first);
    await control(page, 'hear').click();
    await expect
      .poll(() => times(first), { message: 'the question to be read out again by the button' })
      .toBe(before + 1);

    const right = view.question.choices[view.question.answer]!;
    await choose(page, view.question.answer);
    await expect
      .poll(async () => (await allSaid(right.clips)) && (await heard()).some((id) => id.startsWith('cheer.')), {
        message: 'the choice and a cheer to be said',
        timeout: 30_000 * PATIENCE,
      })
      .toBe(true);
    expect(await spoken(page)).toEqual([]);
  });

  test('with the voice on, a round that is finished says well done once', async ({ page }) => {
    test.setTimeout(300_000);
    await sitDown(page, true);
    const done = (): Promise<number> =>
      page.evaluate(() => window.__ua!.voice.heard.filter((said) => said === 'maths.done').length);
    expect(await done()).toBe(0);
    await playRound(page, 'count');
    await expect
      .poll(done, { message: 'well done to be said when the round is finished', timeout: 30_000 * PATIENCE })
      .toBe(1);
    expect(await spoken(page)).toEqual([]);
  });

  test('a round the player finished is on the device after the page is opened again', async ({ page }) => {
    test.setTimeout(240_000);
    await sitDown(page);
    await playRound(page, 'count');
    await page.evaluate(() => window.__ua!.play.flush());
    await page.reload();
    await page.waitForFunction(() => window.__ua !== undefined, undefined, {
      polling: 250,
      timeout: 120_000 * PATIENCE,
    });
    await expect
      .poll(async () => (await record(page)).played, {
        message: 'the round she finished to be in the record that was kept',
        timeout: 30_000 * PATIENCE,
      })
      .toBe(1);
    expect(await record(page)).toEqual({ played: 1, strands: { count: { level: 2, rounds: 1, flawless: 1 } } });
  });

  test('a code chunk that does not come is asked for again, and the screen opens when it does', async ({ page }) => {
    let asked = 0;
    let coming = false;
    await page.route(/\/game\/maths-game(\.ts)?(\?|$)/, (route) => {
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
    expect(await page.evaluate(() => window.__ua!.maths.game), 'nothing came').toBeNull();

    coming = true;
    await notice.getByRole('button', { name: 'Try again' }).click();
    await untilSitting(page);
    await expect(notice).toHaveCount(0);
    expect(await spoken(page)).toEqual([]);
  });

  test('its chunk comes down by itself once play has begun with learning on, and not with it off', async ({ page }) => {
    await openGame(page, 'kept', '', { learning: true });
    await play(page);
    expect(await page.evaluate(() => window.__ua!.maths.game), 'the world starts without it').toBeNull();
    await expect
      .poll(() => page.evaluate(() => window.__ua!.maths.game !== null), {
        message: 'the chunk to come down',
        timeout: 60_000 * PATIENCE,
      })
      .toBe(true);

    await page.goto('about:blank');
    await openGame(page);
    await play(page);
    await page.waitForTimeout(7000);
    expect(await page.evaluate(() => window.__ua!.maths.game), 'with learning off nothing is fetched').toBeNull();
  });
});
