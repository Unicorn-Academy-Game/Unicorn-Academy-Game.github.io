import { expect, type Page, test } from '@playwright/test';
import { stickerOf } from '../../src/content/stickers';
import type { SleighRun } from '../../src/wonder/games/sleigh-run';
import { HOOKS, LIGHTS } from '../../src/wonder/games/tree/shape';
import type { TreeTrim } from '../../src/wonder/games/tree-trim';
import {
  fingerOn,
  freeze,
  hush,
  openGame,
  play,
  SCRATCH,
  shot,
  standBeside,
  step,
  stepUntil,
  stickersShown,
  tapWorld,
  untilClosed,
  untilOpen,
  watchConsole,
  watchStickers,
} from './helpers';

/** What a phone held sideways shows, the screen everything here is for. */
const PHONE = { width: 863, height: 360 };
const TREE = 'santa-grove/xmas-tree-1';
const SLEIGH = 'santa-grove/sleigh-1';
/** How far above a finger an ornament rides, which a drop has to allow for. */
const LIFT = 46;

type Spot = { readonly x: number; readonly y: number };
type View = { readonly w: number; readonly h: number; readonly unit: number };
type Tree = ReturnType<TreeTrim['inspect']> & { readonly view: View };
type Village = ReturnType<SleighRun['inspect']> & { readonly view: View };

const stateOf = (page: Page) => page.evaluate(() => window.__ua!.wonders.state);
const stepGame = (page: Page, seconds: number): Promise<void> =>
  page.evaluate((s) => window.__ua!.wonders.inside!.stage.step(s), seconds);

/** What the game inside the overlay says about itself, picked inside the page. */
const tree = (page: Page): Promise<Tree> =>
  page.evaluate(() => {
    const inside = window.__ua!.wonders.inside!;
    const game = inside.wonder as unknown as { inspect(): Omit<Tree, 'view'> };
    const { w, h, unit } = inside.stage.view;
    return { ...game.inspect(), view: { w, h, unit } };
  });

const village = (page: Page): Promise<Village> =>
  page.evaluate(() => {
    const inside = window.__ua!.wonders.inside!;
    const game = inside.wonder as unknown as { inspect(): Omit<Village, 'view'> };
    const { w, h, unit } = inside.stage.view;
    return { ...game.inspect(), view: { w, h, unit } };
  });

/** Whether a place on the screen is the game and not one of the overlay's buttons. */
const onTheGame = (page: Page, at: Spot, unit: number): Promise<boolean> =>
  page.evaluate(([px, py]) => document.elementFromPoint(px!, py!)?.tagName === 'CANVAS', [
    at.x * unit,
    at.y * unit,
  ] as const);

/** A real touch at a place in the game's units. A place under a button would press the button. */
async function touch(page: Page, at: Spot, unit: number): Promise<void> {
  expect(
    await onTheGame(page, at, unit),
    `a finger at ${Math.round(at.x)},${Math.round(at.y)} is on the game and not on a button`,
  ).toBe(true);
  await page.mouse.click(at.x * unit, at.y * unit);
}

/** A finger put down on one place and drawn through the others, then lifted. */
async function slide(page: Page, through: readonly Spot[], unit: number): Promise<void> {
  const [first, ...rest] = through;
  await page.mouse.move(first!.x * unit, first!.y * unit);
  await page.mouse.down();
  for (const at of rest) await page.mouse.move(at.x * unit, at.y * unit, { steps: 4 });
  await page.mouse.up();
}

/** Santa's grove with the creatures sent away and the camera settled, as a child finds it. */
async function inTheGrove(page: Page): Promise<void> {
  await openGame(page);
  await watchStickers(page);
  await play(page);
  await page.locator('.title').waitFor({ state: 'hidden' });
  await freeze(page);
  await page.evaluate(() => window.__ua!.controller.travel({ mapId: 'santa-grove', spawnId: 'from-forest' }));
  await hush(page);
  await step(page, 1.5);
}

/** Walks up to a toy in the grove and taps it, as a child does, and waits for the game to open. */
async function openToy(page: Page, toy: string): Promise<void> {
  await inTheGrove(page);
  await page.setViewportSize(PHONE);
  await standBeside(page, toy);
  await step(page, 2);
  await tapWorld(page, await fingerOn(page, toy));
  await stepUntil(page, 'the game to start opening', () => window.__ua!.wonders.isOpen, 20);
  await untilOpen(page);
}

/**
 * The finale, run to its end, and the buttons that come after it. `late` looks at the game when the
 * finale has run for seven and a half seconds of its eight.
 */
async function throughTheFinale(page: Page, late?: () => Promise<void>): Promise<void> {
  await page.evaluate(() => window.__ua!.wonders.inside!.wonder.celebrate());
  expect((await stateOf(page)).phase).toBe('finale');
  await expect
    .poll(async () => (await stateOf(page)).lit, { message: 'the five stars lighting', timeout: 15_000 })
    .toBe(5);
  await stepGame(page, 4);
  await shot(page, `${SCRATCH}/winter-finale-middle.png`);
  await stepGame(page, 3.5);
  await late?.();
  await stepGame(page, 2.5);
  await expect.poll(async () => (await stateOf(page)).phase).toBe('after');
  const done = page.getByRole('button', { name: 'All done' });
  await expect(page.getByRole('button', { name: 'Play again' })).toBeVisible();
  await expect(done).toBeVisible();
  await expect(done).toHaveCSS('opacity', '1');
}

async function leave(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'All done' }).click();
  await untilClosed(page);
  expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
}

test.describe('dressing the Christmas tree', () => {
  test('opens from a tap on the tree in the grove, bare, with its ornaments in a tray under the finger', async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await openToy(page, TREE);
    await expect(page.getByRole('dialog', { name: 'Dressing the Christmas tree' })).toBeVisible();
    await expect(page.locator('.wonder-star')).toHaveCount(5);
    const t = await tree(page);
    expect(t.hung).toHaveLength(0);
    expect(t.lit).toBe(0);
    expect(t.free).toHaveLength(HOOKS.length);
    for (const [slot, at] of t.plan.tray.entries())
      expect(await onTheGame(page, at, t.view.unit), `ornament ${slot} of the tray can be touched`).toBe(true);
    await shot(page, `${SCRATCH}/tree-open.png`);
    expect(noise).toEqual([]);
  });

  test('hangs an ornament that is tapped in the tray, and one that is dragged to a branch', async ({ page }) => {
    await openToy(page, TREE);
    const start = await tree(page);
    const { unit } = start.view;
    await touch(page, start.plan.tray[0]!, unit);
    await stepGame(page, 0.9);
    expect((await tree(page)).hung).toMatchObject([{ kind: 'ball-red', landed: true }]);

    const hook = start.plan.hooks[5]!;
    await slide(page, [start.plan.tray[3]!, { x: hook.x, y: hook.y + LIFT }], unit);
    await stepGame(page, 0.9);
    const after = await tree(page);
    expect(after.hung.map((o) => o.hook)).toContain(5);
    expect(after.hung).toHaveLength(2);
    await shot(page, `${SCRATCH}/tree-two.png`);
    await expect.poll(async () => (await stateOf(page)).phase).toBe('play');
  });

  test('earns the star on top, every light and the presents at the fifth star, and the sticker when the game is left', async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await openToy(page, TREE);
    const start = await tree(page);
    for (const slot of [0, 1, 2, 4]) {
      await touch(page, start.plan.tray[slot]!, start.view.unit);
      await stepGame(page, 0.6);
    }
    expect((await stateOf(page)).stars, 'a few ornaments earn a star').toBeGreaterThanOrEqual(1);
    await throughTheFinale(page);
    const done = await tree(page);
    expect(done.lit).toBe(LIGHTS.length);
    expect(done.gifts).toBe(4);
    expect(done.topper).toBeGreaterThan(0.9);
    await shot(page, `${SCRATCH}/tree-after.png`);
    await leave(page);
    await expect
      .poll(async () => (await stickersShown(page)).names, { timeout: 40_000 })
      .toEqual(expect.arrayContaining([stickerOf('tree')!.name, stickerOf('game-tree-trim')!.name]));
    expect(noise).toEqual([]);
  });
});

test.describe("flying Santa's sleigh over the village", () => {
  test('opens from a tap on the sleigh in the grove, with the herd in harness and a village ahead', async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await openToy(page, SLEIGH);
    await expect(page.getByRole('dialog', { name: "Flying Santa's sleigh over the village" })).toBeVisible();
    await expect(page.locator('.wonder-star')).toHaveCount(5);
    const v = await village(page);
    expect(v.houses.length).toBeGreaterThanOrEqual(3);
    expect(v.houses.every((h) => !h.lit)).toBe(true);
    expect(v.team, 'the herd she has pulls the sleigh').toBeGreaterThanOrEqual(1);
    await stepGame(page, 1);
    await shot(page, `${SCRATCH}/sleigh-open.png`);
    expect(noise).toEqual([]);
  });

  test('sends a present to the chimney nearest a touch, lights the house, and rings the bells when the sleigh is touched', async ({
    page,
  }) => {
    await openToy(page, SLEIGH);
    const first = await village(page);
    const { unit } = first.view;
    const ahead = first.plan.sleighAt * first.view.w;
    const house = first.houses.filter((h) => h.chimney.x > ahead + 20 && h.chimney.x < first.view.w - 12)[0]!;
    // A touch in the sky over it, nowhere near the chimney, still goes to it.
    await touch(page, { x: house.chimney.x + 10, y: first.plan.top + 10 }, unit);
    expect((await village(page)).gifts, 'a present is on its way').toBe(1);
    await stepGame(page, 1.4);
    const after = await village(page);
    expect(after.houses.find((h) => h.id === house.id)).toMatchObject({ lit: true, presents: 1, incoming: 0 });
    expect(after.seen).toEqual([house.shape]);
    await shot(page, `${SCRATCH}/sleigh-delivered.png`);

    // A touch on the sleigh sends no present.
    const gifts = after.gifts;
    await touch(page, { x: ahead, y: after.plan.flyY - 30 }, unit);
    expect((await village(page)).gifts).toBe(gifts);
  });

  test('lights the whole village at the fifth star, loops the loop, and gives the sticker when the game is left', async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await openToy(page, SLEIGH);
    const start = await village(page);
    await touch(page, { x: start.view.w * 0.8, y: 120 }, start.view.unit);
    await stepGame(page, 1);
    await throughTheFinale(page, async () => {
      const end = await village(page);
      const ahead = end.plan.sleighAt * end.view.w;
      const inSight = end.houses.filter((h) => h.chimney.x > ahead && h.chimney.x < end.view.w - 8);
      expect(inSight.length).toBeGreaterThan(2);
      for (const h of inSight) expect(h.lit, `house ${h.id} is lit`).toBe(true);
      await shot(page, `${SCRATCH}/sleigh-lit.png`);
    });
    await shot(page, `${SCRATCH}/sleigh-after.png`);
    await leave(page);
    await expect
      .poll(async () => (await stickersShown(page)).names, { timeout: 40_000 })
      .toEqual(expect.arrayContaining([stickerOf('delivery')!.name, stickerOf('game-sleigh-run')!.name]));
    expect(noise).toEqual([]);
  });
});
