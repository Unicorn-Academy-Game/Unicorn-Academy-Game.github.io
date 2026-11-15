import { expect, type Page, test } from '@playwright/test';
import {
  centreOf,
  freeze,
  hush,
  openGame,
  type Pt,
  play,
  SCRATCH,
  shot,
  standAt,
  standBelow,
  step,
  stepUntil,
  tapWorld,
} from './helpers';

const basket = (page: Page) => page.getByRole('group', { name: /basket/i });
const lying = (page: Page): Promise<number> => page.evaluate(() => window.__ua!.controller.world.pickups.list.length);

async function inTheGarden(page: Page): Promise<void> {
  await openGame(page);
  await play(page);
  await freeze(page);
  await page.evaluate(() => window.__ua!.controller.travel({ mapId: 'palace-garden', spawnId: 'from-forest' }));
  await hush(page);
}

/**
 * Makes the bed of tomatoes drop some. Where the pieces land is up to the seed, so it is not told
 * how many.
 */
async function growSome(page: Page): Promise<void> {
  await standBelow(page, 'palace-garden/crop-2', 150);
  await tapWorld(page, await centreOf(page, 'palace-garden/crop-2'));
  await stepUntil(page, 'the tomatoes to land', () => window.__ua!.controller.world.pickups.list.length >= 3, 10);
  await step(page, 1);
}

/**
 * The piece nearest the herd that a tap lands beside and not on. A piece that lies on the bed or
 * under a unicorn turns the tap into one on the bed or the unicorn.
 */
const nearestOnOpenGround = (page: Page): Promise<Pt | null> =>
  page.evaluate(() => {
    const { controller } = window.__ua!;
    const here = controller.world.unicorns.wildstar!.pos;
    const dist = (p: Pt): number => Math.hypot(p.x - here.x, p.y - here.y);
    return (
      controller.world.pickups.list
        .map((p) => p.to)
        .filter((p) => controller.targetAt(p).kind === 'ground')
        .sort((a, b) => dist(a) - dist(b))[0] ?? null
    );
  });

/** Walks over the piece nearest the herd, and waits until one has been taken. */
async function gatherOne(page: Page): Promise<void> {
  // A walk to one piece can pass over another, so there may be none left to take, and where they
  // land is up to the seed, so there may be none a tap can reach.
  let to = await nearestOnOpenGround(page);
  for (let tries = 0; to === null && tries < 4; tries++) {
    await growSome(page);
    to = await nearestOnOpenGround(page);
  }
  if (to === null) throw new Error('gatherOne: no piece lies where a tap would walk to it');
  // The page cannot see this test's variables, so it keeps the count it started from.
  await page.evaluate((n) => ((window as unknown as { __lying: number }).__lying = n), await lying(page));
  await tapWorld(page, to);
  await stepUntil(
    page,
    'a tomato to be gathered',
    () => window.__ua!.controller.world.pickups.list.length < (window as unknown as { __lying: number }).__lying,
    12,
  );
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The bubbles for the ways out and what the corner shows, as boxes on the screen, and the height of
 * the row the bubbles stand in.
 */
const looking = (page: Page): Promise<{ bubbles: Box[]; parts: Box[]; row: number; middleCovered: boolean }> =>
  page.evaluate(() => {
    const box = (el: Element): Box => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    const bubbles = [...document.querySelectorAll<HTMLElement>('.guide .exit')]
      .filter((e) => e.dataset.leaving !== 'true')
      .map(box);
    const parts = [...document.querySelectorAll<HTMLElement>('.corner > *')]
      .filter((e) => !e.hidden && e.dataset.resting !== 'true')
      .map(box);
    const row = Math.min(...bubbles.map((b) => (b.top + b.bottom) / 2));
    const middle = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    return { bubbles, parts, row, middleCovered: middle?.closest('.guide .exit') != null };
  });

function expectClear(seen: { bubbles: Box[]; parts: Box[]; middleCovered: boolean }): void {
  for (const b of seen.bubbles) {
    for (const p of seen.parts) {
      const apart = b.right <= p.left + 1 || b.left >= p.right - 1 || b.bottom <= p.top + 1 || b.top >= p.bottom - 1;
      expect(
        apart,
        `a bubble at ${Math.round(b.left)},${Math.round(b.top)} sits on a button at ${Math.round(p.left)},${Math.round(p.top)}`,
      ).toBe(true);
    }
  }
  expect(seen.middleCovered, 'a bubble over the middle of the screen takes the taps meant for the world').toBe(false);
}

test.describe('the farm and the orchard', () => {
  test('a tap on a bed makes vegetables fall, and walking over them fills the basket', async ({ page }) => {
    await inTheGarden(page);
    await expect(basket(page)).toBeHidden();
    await growSome(page);
    const grown: string[] = await page.evaluate(() => window.__ua!.controller.world.pickups.list.map((p) => p.produce));
    expect(new Set(grown)).toEqual(new Set(['tomato']));
    await shot(page, `${SCRATCH}/harvest-tomatoes.png`);
    await expect(basket(page)).toBeHidden();

    await gatherOne(page);
    await expect(basket(page)).toBeVisible();
    await expect(basket(page)).toHaveAttribute('data-total', /^[1-9]/);
    await expect(page.locator('.basket-chip[data-produce="tomato"]')).toBeVisible();
    await shot(page, `${SCRATCH}/harvest-basket.png`);
  });

  test('the numbers fade ten seconds after the last one, and come back with the next', async ({ page }) => {
    test.setTimeout(120_000);
    await inTheGarden(page);
    await growSome(page);
    await gatherOne(page);
    await expect(basket(page)).toBeVisible();
    // The node is still there while it fades, and the role query does not find it once it is out of
    // sight, so the flag is read from the class.
    const node = page.locator('.basket');
    const total = async (): Promise<number> => Number(await node.getAttribute('data-total'));
    await expect(node).not.toHaveAttribute('data-resting', 'true');
    const first = await total();
    expect(first).toBeGreaterThan(0);
    await expect(node).toHaveAttribute('data-resting', 'true', { timeout: 30_000 });
    await expect(basket(page)).toBeHidden();
    await gatherOne(page);
    await expect(basket(page)).toBeVisible();
    await expect(node).not.toHaveAttribute('data-resting', 'true');
    expect(await total()).toBeGreaterThan(first);
  });

  test('the bubbles for the ways out keep off the basket and the other buttons, and the basket gives its room back when it fades', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    // A tablet has the height to put the bubbles under every button, so the room the basket takes
    // can be seen to come and go.
    await page.setViewportSize({ width: 1024, height: 768 });
    await inTheGarden(page);
    // Mid-garden, where every way out is out of sight. The bubbles are looked at from the same
    // place each time.
    const look = async (): Promise<Awaited<ReturnType<typeof looking>>> => {
      await standAt(page, { x: 1536, y: 1640 });
      await step(page, 0.5);
      // The basket swells as it arrives, and the boxes are read once it has settled.
      await expect(page.locator('.basket')).not.toHaveAttribute('data-arrive', 'true');
      return looking(page);
    };
    const before = await look();
    expect(before.bubbles.length, 'the ways out have bubbles').toBeGreaterThan(0);
    expect(before.parts.length, 'the counter and the Spell Book button show').toBe(2);
    expectClear(before);

    await growSome(page);
    await gatherOne(page);
    await expect(basket(page)).toBeVisible();
    const shown = await look();
    expect(shown.parts.length, 'the basket joins them').toBe(3);
    expectClear(shown);
    expect(shown.row, 'the bubbles went down to stay clear of the basket').toBeGreaterThan(before.row + 30);

    await expect(page.locator('.basket')).toHaveAttribute('data-resting', 'true', { timeout: 30_000 });
    const resting = await look();
    expect(resting.parts.length, 'a basket that has faded is not one of the buttons').toBe(2);
    expectClear(resting);
    expect(Math.abs(resting.row - before.row), 'the room it took is given back').toBeLessThan(3);
  });

  test('an apple tree drops apples, and the world carries on after she leaves', async ({ page }) => {
    await inTheGarden(page);
    await standBelow(page, 'palace-garden/orchard-1', 40);
    // The tree's hit area reaches high into the crown, which is off a phone's screen from the foot
    // of the trunk. A tap beside the trunk lands in it too, and clear of the round exit buttons
    // that float above the herd.
    const trunk = await page.evaluate(
      () => window.__ua!.controller.world.interactables.get('palace-garden/orchard-1')!.pos,
    );
    await tapWorld(page, { x: trunk.x + 85, y: trunk.y - 30 });
    await stepUntil(page, 'the apples to land', () => window.__ua!.controller.world.pickups.list.length >= 3, 10);
    const kinds = await page.evaluate(
      () => new Set(window.__ua!.controller.world.pickups.list.map((p) => p.produce)).size,
    );
    expect(kinds).toBe(1);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
  });
});
