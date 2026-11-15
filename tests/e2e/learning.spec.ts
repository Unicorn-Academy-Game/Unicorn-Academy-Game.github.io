import { expect, type Page, test } from '@playwright/test';
import { wordsOf } from '../../src/content/lexicon';
import { INVITE_AFTER_MS, MEET_AFTER_MS } from '../../src/game/teacher';
import {
  BOOT_MS,
  bodyOf,
  freeze,
  hush,
  keepWord,
  learningOn,
  openGame,
  play,
  SCRATCH,
  shot,
  spellCard,
  spellKey,
  spotOn,
  standAt,
  standBelow,
  standBelowLoneliest,
  step,
  stepUntil,
  tapWord,
  tapWorld,
  typeWord,
  worldRuns,
} from './helpers';

const lying = (page: Page): Promise<number> => page.evaluate(() => window.__ua!.controller.world.pickups.list.length);

async function inTheGarden(page: Page): Promise<void> {
  await openGame(page);
  await play(page);
  await freeze(page);
  await page.evaluate(() => window.__ua!.controller.travel({ mapId: 'palace-garden', spawnId: 'from-forest' }));
  await hush(page);
}

/**
 * A tap on the apple tree, on the part of it that a finger on a phone can reach and no other tree
 * is in front of.
 */
async function tapTheTree(page: Page): Promise<void> {
  await standBelow(page, 'palace-garden/orchard-1', 40);
  await tapWorld(page, await spotOn(page, 'palace-garden/orchard-1'));
}

test.describe('learning, when it is on', () => {
  test('is off when it is: a tap on a tree drops its fruit and no card ever comes up', async ({ page }) => {
    await inTheGarden(page);
    expect(await page.evaluate(() => window.__ua!.settings.get().learning.on)).toBe(false);
    await tapTheTree(page);
    await stepUntil(page, 'the apples to land', () => window.__ua!.controller.world.pickups.list.length >= 3, 10);
    await expect(page.locator('.spell')).toHaveCount(0);
    expect(await worldRuns(page)).toBe(true);
  });

  test('a tap on the tree asks for the word first, and the fruit falls once it is spelled', async ({ page }) => {
    await inTheGarden(page);
    await learningOn(page);
    await tapTheTree(page);

    await expect(page.getByRole('dialog', { name: 'Spell apple' })).toBeVisible();
    await page.waitForTimeout(700);
    await shot(page, `${SCRATCH}/learning-tree-open.png`);
    // The world rests under the card, and nothing has fallen.
    expect(await worldRuns(page)).toBe(false);
    expect(await lying(page)).toBe(0);

    await typeWord(page, 'apple');
    await expect(page.locator('.spell[data-done="true"]')).toBeVisible();
    await page.waitForTimeout(1600);
    await shot(page, `${SCRATCH}/learning-tree-done.png`);
    // The word is in the player's book as soon as it is spelled.
    expect(await page.evaluate(() => window.__ua!.learner.get().words.apple?.spell?.done)).toBe(1);
    await keepWord(page);

    expect(await worldRuns(page)).toBe(true);
    await stepUntil(page, 'the apples to land', () => window.__ua!.controller.world.pickups.list.length >= 3, 15);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);

    // The player has just spelled it, so it is not asked for again until its time comes.
    await tapTheTree(page);
    await page.waitForTimeout(1500);
    await expect(page.locator('.spell')).toHaveCount(0);
    expect(await worldRuns(page)).toBe(true);
  });

  test('closing the card drops the tap: nothing falls, and the player is asked again by the next one', async ({
    page,
  }) => {
    await inTheGarden(page);
    await learningOn(page);
    await tapTheTree(page);
    await expect(spellCard(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.spell')).toHaveCount(0);
    expect(await worldRuns(page)).toBe(true);

    await step(page, 12);
    expect(await lying(page)).toBe(0);
    expect(await page.evaluate(() => window.__ua!.learner.get().words.apple)).toBeUndefined();

    // Nothing was written, and the tree is still asking.
    await tapWorld(page, await spotOn(page, 'palace-garden/orchard-1'));
    await expect(spellCard(page)).toBeVisible();
  });

  test('keys can be tapped on the screen: a key that is resting is inert, and a wrong one is only a nudge', async ({
    page,
  }) => {
    await inTheGarden(page);
    await learningOn(page);
    await tapTheTree(page);
    await expect(spellCard(page)).toBeVisible();
    const placed = page.locator('.spell-slot[data-state="placed"]');

    // "z" is not in "apple" and rests. It is told so, and it is not a slip.
    await spellKey(page, 'z').click({ force: true });
    await expect(page.locator('.spell-live')).toContainText('resting');
    // "p" is in the word, but the word begins with "a". It is not placed, and it is a gentle nudge.
    await spellKey(page, 'p').click();
    await expect(placed).toHaveCount(0);
    await expect(page.locator('.spell-live')).toContainText('another go');

    await tapWord(page, 'apple');
    await keepWord(page);
    expect(await page.evaluate(() => window.__ua!.learner.get().words.apple?.spell?.slips)).toBe(1);
  });

  test('says the sound of every letter the player presses, on the card and on a keyboard, and the word when the card opens, until a parent turns the voice off', async ({
    page,
  }) => {
    await inTheGarden(page);
    await learningOn(page, { say: true });
    const heard = (): Promise<string[]> => page.evaluate(() => [...window.__ua!.voice.heard]);
    await tapTheTree(page);
    await expect(spellCard(page)).toBeVisible();
    await expect.poll(heard).toContain('open.apple');

    // A key on the card, one the word has no use for, and a key on a keyboard: each is said as it
    // is pressed.
    await spellKey(page, 'z').click({ force: true });
    await expect.poll(heard).toContain('sound.z');
    await page.keyboard.press('a');
    await expect.poll(heard).toContain('sound.a');
    await page.keyboard.press('p');
    await expect.poll(async () => (await heard()).filter((id) => id === 'sound.p').length).toBe(1);

    // A key that is not a letter is not said. Neither is anything when the parent has turned the
    // voice off.
    await page.keyboard.press('Shift');
    await page.evaluate(() =>
      window.__ua!.settings.update({ learning: { ...window.__ua!.settings.get().learning, say: false } }),
    );
    const before = (await heard()).length;
    await page.keyboard.press('p');
    await page.waitForTimeout(500);
    expect(await heard()).toHaveLength(before);
    expect(await page.evaluate(() => window.__silence!.spoken), 'the device was never asked to speak').toEqual([]);
  });
});

test.describe('learning, as a parent changes it and as the device keeps it', () => {
  test.setTimeout(300_000);

  test('turning it off in the controls takes the card away, lets the world go, and the tree gives its fruit as it always did', async ({
    page,
  }) => {
    await inTheGarden(page);
    await learningOn(page);
    await tapTheTree(page);
    await expect(spellCard(page)).toBeVisible();
    await page.evaluate(() =>
      window.__ua!.settings.update({ learning: { ...window.__ua!.settings.get().learning, on: false } }),
    );
    await expect(page.locator('.spell')).toHaveCount(0);
    expect(await worldRuns(page)).toBe(true);
    // The tap she made was not carried out, and the tap after it is the game she knows.
    expect(await lying(page)).toBe(0);
    await tapTheTree(page);
    await stepUntil(page, 'the apples to land', () => window.__ua!.controller.world.pickups.list.length >= 3, 10);
    await expect(page.locator('.spell')).toHaveCount(0);
  });

  test('what the player spelled is kept on the device and is there after a reload, and a look around reads it and writes nothing', async ({
    page,
    context,
  }) => {
    await inTheGarden(page);
    await learningOn(page);
    await tapTheTree(page);
    await typeWord(page, 'apple');
    await keepWord(page);
    await page.evaluate(async () => {
      await window.__ua!.learner.flush();
      await window.__ua!.settings.flush();
    });
    const onDisk = (p: Page): Promise<string[]> =>
      p.evaluate(async () => Object.keys((await window.__ua!.store!.learner())?.words ?? {}));
    expect(await onDisk(page)).toEqual(['apple']);

    await page.reload();
    await page.waitForFunction(() => window.__ua !== undefined, undefined, { polling: 250, timeout: BOOT_MS });
    expect(
      await page.evaluate(() => ({
        apple: window.__ua!.learner.get().words.apple?.spell?.done,
        on: window.__ua!.settings.get().learning.on,
      })),
    ).toEqual({ apple: 1, on: true });
    await page.close();

    const look = await context.newPage();
    await openGame(look, 'incognito');
    await play(look);
    expect(await look.evaluate(() => window.__ua!.learner.get().words.apple?.spell?.done)).toBe(1);
    await learningOn(look);
    expect(await look.evaluate(() => window.__ua!.lessons.practice('frog'))).toBe(true);
    await typeWord(look, 'frog');
    await keepWord(look);
    expect(await look.evaluate(() => Object.keys(window.__ua!.learner.get().words).sort())).toEqual(['apple', 'frog']);
    await look.evaluate(() => window.__ua!.learner.flush());
    expect(await onDisk(look)).toEqual(['apple']);
  });
});

async function inTheForest(page: Page): Promise<void> {
  await openGame(page);
  await play(page);
  await freeze(page);
}

/**
 * Waits until every delay the lesson sets has run out, so that a card which was going to come up
 * has come up and an absence seen after this is a real one. The page runs its timers in the order
 * they fall due, so this one, set last and for longer than the rest, runs after them on a machine
 * of any speed. A look at once after a tap would see no card on a fast machine and a card on a
 * starved one, and say nothing about either.
 */
const lessonTimersRunOut = (page: Page): Promise<void> =>
  page.evaluate(
    (ms) => new Promise<void>((done) => window.setTimeout(done, ms)),
    Math.max(INVITE_AFTER_MS, MEET_AFTER_MS) + 300,
  );

/**
 * What a child has to see of the world's answer to a tap before a card comes over it. It is a
 * promise to them, so it is written here and not read from the code that keeps it.
 */
const ANSWER_SHOWS_FOR_MS = 500;

type Stopwatch = { tap: number | null; card: number | null };

/**
 * Starts timing, by the page's own clock, from the first tap to the first card. What it gives back
 * is how long the card waited for the world to answer, which is the same on a machine of any speed.
 * A look at the screen a moment after the tap would find no card on a fast machine and a card on a
 * starved one.
 */
async function timeTheCard(page: Page): Promise<() => Promise<number>> {
  await page.evaluate(() => {
    const watch: Stopwatch = { tap: null, card: null };
    Object.assign(window, { __cardWatch: watch });
    window.addEventListener('pointerdown', () => (watch.tap ??= performance.now()), { capture: true });
    new MutationObserver(() => {
      if (watch.card === null && document.querySelector('.spell')) watch.card = performance.now();
    }).observe(document.body, { childList: true, subtree: true });
  });
  return async () => {
    const { tap, card } = await page.evaluate(() => (window as unknown as { __cardWatch: Stopwatch }).__cardWatch);
    if (tap === null || card === null)
      throw new Error(`the stopwatch did not see ${tap === null ? 'a tap' : 'a card'}`);
    return card - tap;
  };
}

test.describe('learning, in the forest', () => {
  test('a creature the player pokes answers first and is asked about a moment later, and the air shimmers where it is when it is spelled', async ({
    page,
  }) => {
    await inTheForest(page);
    await step(page, 2);
    await learningOn(page);
    // A friend who comes up to her is asked for before anything the player touched, so a fairy over
    // a friend's clearing would get no card.
    await page.evaluate(() => (window.__ua!.controller.world.map.encounters.length = 0));
    const fairy = await standBelowLoneliest(page, 'fairy');
    // A fairy gives several words, and it asks for the easiest first.
    const word = wordsOf('life.fairy')[0]!;
    const cardWaited = await timeTheCard(page);
    await tapWorld(page, (await page.evaluate((id) => window.__ua!.controller.debugCritterAt(id), fairy.id))!);

    // It twirls as it always did, and the card is not on top of that: it waits for the answer to
    // show before it comes.
    expect(
      await page.evaluate(
        (id) => window.__ua!.controller.world.life.critters.find((c) => c.id === id)!.state.kind,
        fairy.id,
      ),
    ).toBe('twirl');
    await expect(page.getByRole('dialog', { name: `Spell ${word}` })).toBeVisible();
    expect(await cardWaited(), 'milliseconds the card waited after the tap').toBeGreaterThanOrEqual(
      ANSWER_SHOWS_FOR_MS,
    );
    expect(await worldRuns(page)).toBe(false);
    await page.waitForTimeout(700);
    await shot(page, `${SCRATCH}/learning-fairy-open.png`);

    await page.evaluate(() => window.__ua!.controller.debugClearEffects());
    await typeWord(page, word);
    await keepWord(page);
    await expect.poll(() => page.evaluate(() => window.__ua!.controller.debugParticles())).toBeGreaterThan(0);
    expect(await worldRuns(page)).toBe(true);
    expect(await page.evaluate((w) => window.__ua!.learner.get().words[w]?.spell?.done, word)).toBe(1);
  });

  test('a friend waits to be asked in, is asked again when she is tapped, and joins when her name is spelled', async ({
    page,
  }) => {
    await inTheForest(page);
    await hush(page);
    await learningOn(page);
    const at = await page.evaluate(() => {
      const { world } = window.__ua!.controller;
      const e = world.map.encounters.find((x) => x.unicornId === 'leaf')!;
      return world.nav.freePointNear({ x: e.home.x - 40, y: e.home.y + 100 }, [], 0, 200);
    });
    await standAt(page, at!);
    await expect(page.getByRole('dialog', { name: 'Spell leaf' })).toBeVisible();
    await page.waitForTimeout(700);
    await shot(page, `${SCRATCH}/learning-leaf-open.png`);
    const recruited = (): Promise<string[]> => page.evaluate(() => window.__ua!.controller.world.persistent.recruited);
    expect(await recruited()).toEqual(['wildstar']);

    // The player closes it. Leaf is not sent away, and nothing is spelled.
    await page.keyboard.press('Escape');
    await expect(page.locator('.spell')).toHaveCount(0);
    await step(page, 10);
    expect(await recruited()).toEqual(['wildstar']);
    expect(await page.evaluate(() => window.__ua!.learner.get().words.leaf)).toBeUndefined();

    await tapWorld(page, await bodyOf(page, 'leaf'));
    await expect(page.getByRole('dialog', { name: 'Spell leaf' })).toBeVisible();
    await typeWord(page, 'leaf');
    await keepWord(page);
    await stepUntil(
      page,
      'Leaf to join the herd',
      () => window.__ua!.controller.world.persistent.recruited.includes('leaf'),
      20,
    );
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
  });

  test('with friends turned off in the controls, a friend joins by walking up as she always did, with no card', async ({
    page,
  }) => {
    await inTheForest(page);
    await learningOn(page, { friends: false });
    const at = await page.evaluate(() => {
      const { world } = window.__ua!.controller;
      const e = world.map.encounters.find((x) => x.unicornId === 'leaf')!;
      return world.nav.freePointNear({ x: e.home.x - 40, y: e.home.y + 100 }, [], 0, 200);
    });
    // Wildstar walks up and does not tap her. A tap on a friend who has joined is a reason to ask
    // for her name, as it is for any friend, so the tap is not part of this.
    await standAt(page, at!);
    await stepUntil(
      page,
      'Leaf to join the herd',
      () => window.__ua!.controller.world.persistent.recruited.includes('leaf'),
      20,
    );
    await lessonTimersRunOut(page);
    await expect(page.locator('.spell')).toHaveCount(0);
    // She was never kept waiting for her name: there was nothing to wait for.
    expect(await page.evaluate(() => window.__ua!.controller.world.met.size)).toBe(0);
  });
});
