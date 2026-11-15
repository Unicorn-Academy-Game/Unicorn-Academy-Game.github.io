import { expect, type Page, test } from '@playwright/test';
import {
  fingerOn,
  inThePlayground,
  SCRATCH,
  shot,
  standBeside,
  step,
  stepUntil,
  tapWorld,
  untilOpen,
  watchConsole,
} from './helpers';

/** What a phone held sideways shows, the screen everything here is for. */
const PHONE = { width: 863, height: 360 };
const MACHINE = 'playground/bubbles-1';

interface GardenView {
  readonly bubbles: readonly {
    readonly id: number;
    readonly x: number;
    readonly y: number;
    readonly r: number;
    readonly prizes: readonly string[];
    readonly ready: boolean;
    readonly rider: string | null;
    readonly held: boolean;
  }[];
  readonly machine: { readonly x: number; readonly y: number; readonly half: number; readonly height: number };
  readonly friends: readonly { readonly id: string; readonly x: number; readonly y: number }[];
  readonly residents: Readonly<Record<string, number>>;
  readonly slack: number;
  readonly blowing: number;
  readonly riding: number;
  readonly stage: string | null;
  readonly giant: number;
  readonly view: { readonly w: number; readonly h: number; readonly unit: number };
}

const stateOf = (page: Page) => page.evaluate(() => window.__ua!.wonders.state);
const stepGame = (page: Page, seconds: number): Promise<void> =>
  page.evaluate((s) => window.__ua!.wonders.inside!.stage.step(s), seconds);

/**
 * What the game inside the overlay says about itself, picked inside the page because a method on a
 * class does not cross to the test.
 */
const garden = (page: Page): Promise<GardenView> =>
  page.evaluate(() => {
    const inside = window.__ua!.wonders.inside!;
    const game = inside.wonder as unknown as { inspect(): Omit<GardenView, 'view'> };
    const v = game.inspect();
    const { w, h, unit } = inside.stage.view;
    return { ...v, view: { w, h, unit } };
  });

/** A real touch on the screen at a place in the game's units. */
const touch = (page: Page, x: number, y: number, unit: number): Promise<void> => page.mouse.click(x * unit, y * unit);

/**
 * A place on bubble `id` that no other bubble reaches, as far as the game's own slack goes. The
 * game gives a touch to the smallest bubble that reaches it, so a small one that drifts across the
 * middle of a big one takes a touch meant for the big one, as it should for a child. Where each is,
 * is read in one look, and with the game's clock held nothing moves before the touch.
 */
function freeOn(v: GardenView, id: number): { x: number; y: number } | null {
  const me = v.bubbles.find((b) => b.id === id)!;
  const others = v.bubbles.filter((b) => b.id !== id && !b.held);
  const spots = [
    { x: me.x, y: me.y },
    ...Array.from({ length: 8 }, (_, i) => ({
      x: me.x + Math.cos((i * Math.PI) / 4) * me.r * 0.6,
      y: me.y + Math.sin((i * Math.PI) / 4) * me.r * 0.6,
    })),
  ].filter((p) => reachable(v, p.x, p.y));
  const clearance = (p: { x: number; y: number }): number =>
    Math.min(Infinity, ...others.map((o) => Math.hypot(p.x - o.x, p.y - o.y) - (o.r + v.slack + 2)));
  const best = spots.map((p) => ({ p, c: clearance(p) })).sort((a, b) => b.c - a.c)[0];
  return best && best.c > 0 ? best.p : null;
}

/**
 * Touches bubble `id` where no other bubble reaches, and looks again a moment later if there is no
 * such place.
 */
async function popBubble(page: Page, id: number): Promise<void> {
  for (let tries = 0; tries < 40; tries++) {
    const v = await garden(page);
    const at = freeOn(v, id);
    if (at) return touch(page, at.x, at.y, v.view.unit);
    await stepGame(page, 0.1);
  }
  throw new Error(`no place on bubble ${id} that another bubble does not reach`);
}

/**
 * Touches the friend `index` on the grass, once no bubble is within reach of the place, since a
 * bubble there would take the touch.
 */
async function touchFriend(page: Page, index: number): Promise<void> {
  for (let tries = 0; tries < 40; tries++) {
    const v = await garden(page);
    const f = v.friends[index]!;
    if (!v.bubbles.some((b) => !b.held && Math.hypot(f.x - b.x, f.y - b.y) <= b.r + v.slack + 2))
      return touch(page, f.x, f.y, v.view.unit);
    await stepGame(page, 0.1);
  }
  throw new Error(`a bubble stayed over friend ${index}`);
}

/**
 * How much the player has earned: the stars so far and how far they are to the next. A touch that
 * finishes a star takes the second back to nothing.
 */
const earned = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const w = window.__ua!.wonders.inside!.wonder;
    return w.stars + w.progress;
  });

/**
 * Whether a place is clear of the corner buttons and the counter, which a finger there would press
 * instead of the game.
 */
const reachable = (v: GardenView, x: number, y: number): boolean =>
  x > 14 && x < v.view.w - 14 && y > 80 && y < v.view.h - 40;

/**
 * The bubble a child would go for: whole, free, and where a finger can reach. The one with the most
 * inside it, as they would.
 */
function target(v: GardenView): { x: number; y: number; id: number } | null {
  const seen = v.bubbles.filter((b) => b.ready && !b.held && !b.rider && reachable(v, b.x, b.y));
  return seen.sort((a, b) => b.prizes.length - a.prizes.length)[0] ?? null;
}

async function openMachine(page: Page): Promise<void> {
  await inThePlayground(page);
  await standBeside(page, MACHINE);
  await step(page, 2);
  await tapWorld(page, await fingerOn(page, MACHINE));
  await stepUntil(page, 'the game to start opening', () => window.__ua!.wonders.isOpen, 20);
  await untilOpen(page);
}

async function closeGame(page: Page): Promise<void> {
  await page.locator('.wonder-done').click();
  await expect.poll(() => page.evaluate(() => window.__ua!.wonders.isOpen), { timeout: 20_000 }).toBe(false);
}

test.describe('the bubble garden', () => {
  test('opens from the bubble machine with bubbles in the sky and the friends on the grass, and a touch on a bubble lets its surprise out', async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await page.setViewportSize(PHONE);
    await openMachine(page);
    await expect(page.getByRole('dialog', { name: 'Bubbles with surprises inside' })).toBeVisible();
    await expect(page.locator('.wonder-star')).toHaveCount(5);
    await stepGame(page, 3);
    await shot(page, `${SCRATCH}/bubbles-open.png`);

    const start = await garden(page);
    expect(start.bubbles.length, 'the sky is full from the first moment').toBeGreaterThan(5);
    for (const b of start.bubbles) expect(b.prizes.length, 'a surprise in every bubble').toBeGreaterThan(0);
    expect(start.friends.length, 'friends on the grass').toBeGreaterThan(0);
    expect(start.machine.x, 'the machine is on the screen').toBeGreaterThan(0);
    expect(start.machine.x + start.machine.half).toBeLessThan(start.view.w);

    const first = target(start)!;
    expect(first, 'a bubble to pop').not.toBeNull();
    await popBubble(page, first.id);
    await stepGame(page, 0.3);
    const after = await garden(page);
    expect(
      after.bubbles.find((b) => b.id === first.id),
      'it went off',
    ).toBeUndefined();
    await expect.poll(() => earned(page)).toBeGreaterThan(0);
    await shot(page, `${SCRATCH}/bubbles-pop.png`);

    await closeGame(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('lets the player blow their own: a tap on the machine blows a few, and holding it blows one that takes a surprise for every moment they hold on', async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await page.setViewportSize(PHONE);
    await openMachine(page);
    await stepGame(page, 2);
    const v = await garden(page);
    const at = { x: v.machine.x * v.view.unit, y: (v.machine.y - v.machine.height * 0.4) * v.view.unit };

    // A tap: the machine blows a few bubbles one after another.
    const had = new Set((await garden(page)).bubbles.map((b) => b.id));
    await page.mouse.click(at.x, at.y);
    await stepGame(page, 0.5);
    expect(
      (await garden(page)).bubbles.filter((b) => !had.has(b.id)).length,
      'three new bubbles in the air',
    ).toBeGreaterThanOrEqual(3);

    // A hold: one bubble forms on the ring and grows.
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await stepGame(page, 0.5);
    expect((await garden(page)).blowing, 'one surprise to begin with').toBe(1);
    await stepGame(page, 1.2);
    expect((await garden(page)).blowing, 'another for each moment').toBeGreaterThanOrEqual(2);
    await stepGame(page, 1.6);
    const held = await garden(page);
    expect(held.blowing, 'as many as a bubble holds, and no more').toBe(3);
    expect(held.bubbles.filter((b) => b.held)).toHaveLength(1);
    await shot(page, `${SCRATCH}/bubbles-blowing.png`);
    await page.mouse.up();
    await stepGame(page, 1.5);
    const gone = await garden(page);
    expect(gone.blowing, 'she let go').toBe(0);
    const mine = gone.bubbles.filter((b) => b.prizes.length === 3 && !b.held);
    expect(mine.length, 'her bubble floats up with its three surprises').toBeGreaterThanOrEqual(1);
    expect(Math.min(...mine.map((b) => b.y)), 'and it has left the machine').toBeLessThan(at.y / v.view.unit - 20);

    await closeGame(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('takes a friend up in a bubble when the player touches the friend, and the friend comes down when it is popped', async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await page.setViewportSize(PHONE);
    await openMachine(page);
    await stepGame(page, 2);
    const v = await garden(page);
    const friend = v.friends[0]!;
    await touchFriend(page, 0);
    await stepGame(page, 2.6);
    const up = await garden(page);
    expect(up.riding, 'she is in a bubble').toBe(1);
    const mine = up.bubbles.find((b) => b.rider !== null)!;
    expect(mine, 'the bubble round her').toBeDefined();
    expect(mine.y, 'and it has taken her up off the grass').toBeLessThan(friend.y - 40);
    await shot(page, `${SCRATCH}/bubbles-ride.png`);

    const before = await earned(page);
    await popBubble(page, mine.id);
    await stepGame(page, 0.4);
    expect(
      (await garden(page)).bubbles.find((b) => b.id === mine.id),
      'it went off',
    ).toBeUndefined();
    await shot(page, `${SCRATCH}/bubbles-ride-pop.png`);
    await expect.poll(() => earned(page)).toBeGreaterThan(before);
    await stepGame(page, 2.5);
    expect((await garden(page)).riding, 'she is on the grass again').toBe(0);

    await closeGame(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('can be played to the end with touches alone: the bubbles are called into one great bubble, it bursts, the friends float up and burst out of theirs, and the player can play again', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const noise = watchConsole(page);
    await page.setViewportSize(PHONE);
    await openMachine(page);

    for (let turn = 0; turn < 500; turn++) {
      if ((await stateOf(page)).phase !== 'play') break;
      const v = await garden(page);
      // Now and then she takes a friend up, which is worth more than a bubble.
      const friend = turn % 9 === 4 && v.riding === 0 ? v.friends[turn % Math.max(1, v.friends.length)] : undefined;
      const ride = v.bubbles.find((b) => b.rider !== null && reachable(v, b.x, b.y));
      const next = ride ?? friend ?? target(v);
      if (next) await touch(page, next.x, next.y, v.view.unit);
      await stepGame(page, 0.5);
    }
    expect((await stateOf(page)).phase, 'the fifth star began the finale').toBe('finale');
    expect((await stateOf(page)).stars).toBe(5);

    // The finale goes in its order, and all of the friends are in bubbles at once at some moment.
    const stages: string[] = [];
    let giant = 0;
    let riding = 0;
    for (let i = 0; i < 100 && (await stateOf(page)).phase === 'finale'; i++) {
      const v = await garden(page);
      if (v.stage && stages.at(-1) !== v.stage) stages.push(v.stage);
      giant = Math.max(giant, v.giant);
      riding = Math.max(riding, v.riding);
      if (i === 24) await shot(page, `${SCRATCH}/bubbles-finale-1.png`);
      if (i === 40) await shot(page, `${SCRATCH}/bubbles-finale-2.png`);
      await stepGame(page, 0.25);
    }
    expect(stages, 'the order of the finale').toEqual(['gather', 'swell', 'burst']);
    expect(giant, 'the great bubble grew to nearly the size of the sky').toBeGreaterThan(0.6);
    const friends = (await garden(page)).friends.length;
    expect(riding, 'every friend was in a bubble').toBe(friends);
    await expect.poll(async () => (await stateOf(page)).phase, { timeout: 20_000 }).toBe('after');
    await shot(page, `${SCRATCH}/bubbles-after.png`);

    // Afterwards she is on the grass again, the garden is as she made it, and the bubbles go on.
    await stepGame(page, 3);
    const later = await garden(page);
    expect(later.riding, 'all the friends are down').toBe(0);
    expect(later.stage).toBeNull();
    expect(later.bubbles.length, 'the sky fills again').toBeGreaterThan(3);
    expect(
      Object.values(later.residents).reduce((a, b) => a + b, 0),
      'what she freed is still in the garden',
    ).toBeGreaterThan(5);
    const again = page.getByRole('button', { name: 'Play again' });
    await expect(again).toBeVisible();
    await expect(page.getByRole('button', { name: 'All done' })).toHaveCSS('opacity', '1');

    await again.click();
    await expect.poll(async () => (await stateOf(page)).phase).toBe('play');
    expect((await stateOf(page)).stars).toBe(0);
    await stepGame(page, 1);
    const fresh = await garden(page);
    expect(Object.keys(fresh.residents), 'an empty garden to fill').toEqual([]);
    expect(fresh.bubbles.length).toBeGreaterThan(5);
    expect(fresh.giant).toBe(0);

    await closeGame(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('keeps the garden the player has grown, and the friends on the grass, when the phone is turned upright and back', async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await page.setViewportSize(PHONE);
    await openMachine(page);
    await stepGame(page, 3);
    for (let i = 0; i < 6; i++) {
      const v = await garden(page);
      const next = target(v);
      if (next) await touch(page, next.x, next.y, v.view.unit);
      await stepGame(page, 1.6);
    }
    const grown = Object.values((await garden(page)).residents).reduce((a, b) => a + b, 0);
    expect(grown, 'something has come out of a bubble and stayed').toBeGreaterThan(0);

    await page.setViewportSize({ width: 360, height: 780 });
    await expect
      .poll(async () => (await garden(page)).view.h, { message: 'the game seeing the new shape of the screen' })
      .toBeGreaterThan(600);
    await stepGame(page, 3);
    const upright = await garden(page);
    expect(
      Object.values(upright.residents).reduce((a, b) => a + b, 0),
      'the garden is kept',
    ).toBe(grown);
    expect(upright.friends.length).toBeGreaterThan(0);
    for (const f of upright.friends) {
      expect(f.x).toBeGreaterThan(0);
      expect(f.x).toBeLessThan(upright.view.w);
    }
    expect(upright.machine.x + upright.machine.half).toBeLessThan(upright.view.w);
    expect(upright.bubbles.length).toBeGreaterThan(3);
    await shot(page, `${SCRATCH}/bubbles-upright.png`);

    await page.setViewportSize(PHONE);
    await expect.poll(async () => (await garden(page)).view.w).toBeGreaterThan(800);
    await stepGame(page, 2);
    const back = await garden(page);
    expect(Object.values(back.residents).reduce((a, b) => a + b, 0)).toBe(grown);
    await closeGame(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('stays sound when a child hammers the screen with their whole hand, through every phase', async ({ page }) => {
    test.setTimeout(300_000);
    const noise = watchConsole(page);
    await page.setViewportSize(PHONE);
    await openMachine(page);
    let most = 0;
    for (let turn = 0; turn < 300; turn++) {
      const v = await garden(page);
      most = Math.max(most, v.bubbles.length);
      // Four touches at once-ish, anywhere, and the game moved on a little.
      for (let i = 0; i < 4; i++) {
        const x = 20 + ((turn * 131 + i * 247) % (v.view.w - 40));
        const y = 20 + ((turn * 73 + i * 97) % (v.view.h - 40));
        // A hand that lands on a button presses the button, which is not what this is about.
        const onGame = await page.evaluate(([px, py]) => document.elementFromPoint(px!, py!)?.tagName === 'CANVAS', [
          x * v.view.unit,
          y * v.view.unit,
        ] as const);
        if (onGame) await touch(page, x, y, v.view.unit);
      }
      await stepGame(page, 0.35);
      if ((await stateOf(page)).phase === 'after') break;
    }
    expect(most, 'never more bubbles than a finale makes').toBeLessThanOrEqual(90);
    await closeGame(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });
});
