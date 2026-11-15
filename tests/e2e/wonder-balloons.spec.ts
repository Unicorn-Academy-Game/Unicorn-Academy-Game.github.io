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
/**
 * The three stands in the playground, whose looks are a sunny party, a warm evening and a cool
 * night.
 */
const STANDS = {
  party: 'playground/balloons-1',
  warm: 'playground/balloons-2',
  cool: 'playground/balloons-3',
} as const;

interface BalloonView {
  readonly balloons: readonly {
    readonly id: number;
    readonly x: number;
    readonly y: number;
    readonly r: number;
    readonly degree: number;
    readonly kind: string;
    readonly tied: boolean;
    readonly ready: boolean;
  }[];
  readonly target: number;
  readonly done: number;
  readonly phrase: number;
  readonly song: string;
  readonly completed: number;
  readonly gift: { readonly x: number; readonly y: number; readonly half: number; readonly height: number };
  readonly rainbow: { readonly standing: boolean; readonly left: number; readonly total: number };
  readonly replaying: boolean;
  readonly friends: readonly { readonly id: string; readonly x: number; readonly y: number }[];
  readonly view: { readonly w: number; readonly h: number; readonly unit: number };
}

const stateOf = (page: Page) => page.evaluate(() => window.__ua!.wonders.state);
const stepGame = (page: Page, seconds: number): Promise<void> =>
  page.evaluate((s) => window.__ua!.wonders.inside!.stage.step(s), seconds);

/**
 * What the game inside the overlay says about itself, picked inside the page because a method on a
 * class does not cross to the test.
 */
const balloons = (page: Page): Promise<BalloonView> =>
  page.evaluate(() => {
    const inside = window.__ua!.wonders.inside!;
    const game = inside.wonder as unknown as { inspect(): Omit<BalloonView, 'view'> };
    const v = game.inspect();
    const { w, h, unit } = inside.stage.view;
    return { ...v, view: { w, h, unit } };
  });

/** A real touch on the screen at a place in the game's units. */
const touch = (page: Page, x: number, y: number, unit: number): Promise<void> => page.mouse.click(x * unit, y * unit);

/**
 * The balloon a child who has understood would go for: one that sings the note the song asks for
 * and that can be reached.
 */
function wanted(v: BalloonView): { x: number; y: number } | null {
  const seen = v.balloons.filter(
    (b) =>
      b.kind === 'note' &&
      b.degree === v.target &&
      b.ready &&
      b.y > 80 &&
      b.y < v.view.h - 30 &&
      b.x > 12 &&
      b.x < v.view.w - 12,
  );
  // The bouquet last, since it is the one that is always there.
  return seen.sort((a, b) => Number(a.tied) - Number(b.tied))[0] ?? null;
}

async function openStand(page: Page, which: string = STANDS.party): Promise<void> {
  await inThePlayground(page);
  await standBeside(page, which);
  await step(page, 2);
  await tapWorld(page, await fingerOn(page, which));
  await stepUntil(page, 'the game to start opening', () => window.__ua!.wonders.isOpen, 20);
  await untilOpen(page);
}

async function closeGame(page: Page): Promise<void> {
  await page.locator('.wonder-done').click();
  await expect.poll(() => page.evaluate(() => window.__ua!.wonders.isOpen), { timeout: 20_000 }).toBe(false);
}

test.describe('the balloon song', () => {
  test('opens from the balloon stand with a bouquet of five notes tied to a gift, and a touch on the balloon the song asks for plays its note', async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await page.setViewportSize(PHONE);
    await openStand(page);
    await expect(page.getByRole('dialog', { name: 'Balloons that play a song' })).toBeVisible();
    await expect(page.locator('.wonder-star')).toHaveCount(5);
    await stepGame(page, 3);
    await shot(page, `${SCRATCH}/balloons-open.png`);

    const start = await balloons(page);
    const tied = start.balloons.filter((b) => b.tied);
    expect(tied, 'the five notes of the bouquet').toHaveLength(5);
    expect(new Set(tied.map((b) => b.degree)).size, 'all different').toBe(5);
    expect(start.balloons.filter((b) => !b.tied).length, 'balloons floating in the sky').toBeGreaterThan(3);
    for (const b of tied) {
      expect(b.ready, 'blown up').toBe(true);
      expect(b.x - b.r).toBeGreaterThan(0);
      expect(b.x + b.r).toBeLessThan(start.view.w);
      expect(b.y - b.r).toBeGreaterThan(0);
    }

    // A real touch on the balloon the song asks for: it goes off, the song moves on, and the meter
    // has points.
    const first = wanted(start)!;
    expect(first, 'a balloon to pop').not.toBeNull();
    await touch(page, first.x, first.y, start.view.unit);
    await stepGame(page, 0.2);
    const after = await balloons(page);
    expect(after.done, 'the first note of the phrase is played').toBe(1);
    await expect.poll(() => page.evaluate(() => window.__ua!.wonders.inside!.wonder.progress)).toBeGreaterThan(0);
    await shot(page, `${SCRATCH}/balloons-pop.png`);

    await closeGame(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('can be played to the end with touches alone: a rainbow of balloons is let out, popped as the song, and the player can play again', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const noise = watchConsole(page);
    await page.setViewportSize(PHONE);
    await openStand(page);

    for (let turn = 0; turn < 400; turn++) {
      if ((await stateOf(page)).phase !== 'play') break;
      const v = await balloons(page);
      const next = wanted(v);
      if (next) await touch(page, next.x, next.y, v.view.unit);
      await stepGame(page, 0.6);
    }
    expect((await stateOf(page)).phase, 'the fifth star began the finale').toBe('finale');
    expect((await stateOf(page)).stars).toBe(5);
    await stepGame(page, 6);
    const rainbow = await balloons(page);
    expect(rainbow.rainbow.standing, 'the rainbow of balloons is up').toBe(true);
    expect(rainbow.rainbow.total).toBeGreaterThan(40);
    await shot(page, `${SCRATCH}/balloons-rainbow.png`);

    // A touch on the rainbow pops the balloon under it.
    const piece = await page.evaluate(() => {
      const w = window.__ua!.wonders.inside!.wonder as unknown as { inspect(): { rainbow: { left: number } } };
      return w.inspect().rainbow.left;
    });
    await touch(page, rainbow.view.w * 0.3, rainbow.view.h * 0.45, rainbow.view.unit);
    await stepGame(page, 0.2);
    expect((await balloons(page)).rainbow.left, 'a touch on the rainbow').toBeLessThanOrEqual(piece);

    // The finale ends by itself.
    for (let i = 0; i < 260 && (await stateOf(page)).phase === 'finale'; i++) await stepGame(page, 0.25);
    await expect.poll(async () => (await stateOf(page)).phase).toBe('after');
    await shot(page, `${SCRATCH}/balloons-after.png`);

    // Afterwards the bouquet is tied again and the balloons play on.
    await stepGame(page, 3);
    const later = await balloons(page);
    expect(later.balloons.filter((b) => b.tied)).toHaveLength(5);
    const again = page.getByRole('button', { name: 'Play again' });
    await expect(again).toBeVisible();
    await expect(page.getByRole('button', { name: 'All done' })).toHaveCSS('opacity', '1');

    await again.click();
    await expect.poll(async () => (await stateOf(page)).phase).toBe('play');
    expect((await stateOf(page)).stars).toBe(0);
    const fresh = await balloons(page);
    expect(fresh.completed).toBe(0);
    expect(fresh.rainbow.standing).toBe(false);

    await closeGame(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test("gives the player a friend's balloon when they touch the friend, which goes off in the friend's magic", async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await page.setViewportSize(PHONE);
    await openStand(page);
    await stepGame(page, 2);
    const v = await balloons(page);
    expect(v.friends.length, 'friends beside the gift').toBeGreaterThan(0);
    const friend = v.friends[0]!;
    await touch(page, friend.x, friend.y, v.view.unit);
    await stepGame(page, 1.5);
    const gift = (await balloons(page)).balloons.find((b) => b.kind === 'gift');
    expect(gift, 'her balloon floats up from her horn').toBeDefined();
    await shot(page, `${SCRATCH}/balloons-gift.png`);
    const before = (await stateOf(page)).stars;
    await touch(page, gift!.x, gift!.y, v.view.unit);
    await stepGame(page, 0.3);
    expect(
      (await balloons(page)).balloons.find((b) => b.id === gift!.id),
      'it went off',
    ).toBeUndefined();
    await expect.poll(() => page.evaluate(() => window.__ua!.wonders.inside!.wonder.progress)).toBeGreaterThan(0);
    expect((await stateOf(page)).stars).toBeGreaterThanOrEqual(before);
    await closeGame(page);
    expect(noise).toEqual([]);
  });

  test('plays in the evening and at night too, each with its own sky', async ({ page }) => {
    const noise = watchConsole(page);
    await page.setViewportSize(PHONE);
    for (const look of ['warm', 'cool'] as const) {
      await openStand(page, STANDS[look]);
      await stepGame(page, 4);
      const v = await balloons(page);
      expect(v.balloons.filter((b) => b.tied)).toHaveLength(5);
      await shot(page, `${SCRATCH}/balloons-${look}.png`);
      await closeGame(page);
    }
    expect(noise).toEqual([]);
  });

  test('keeps the bouquet whole on the screen when the phone is turned upright and back', async ({ page }) => {
    const noise = watchConsole(page);
    await page.setViewportSize(PHONE);
    await openStand(page);
    await stepGame(page, 3);
    const first = wanted(await balloons(page))!;
    await touch(page, first.x, first.y, 1);
    await stepGame(page, 0.5);

    await page.setViewportSize({ width: 360, height: 780 });
    await expect
      .poll(async () => (await balloons(page)).view.h, { message: 'the game seeing the new shape of the screen' })
      .toBeGreaterThan(600);
    await stepGame(page, 3);
    const upright = await balloons(page);
    const tied = upright.balloons.filter((b) => b.tied);
    expect(tied).toHaveLength(5);
    for (const b of tied) {
      expect(b.x - b.r).toBeGreaterThan(0);
      expect(b.x + b.r).toBeLessThan(upright.view.w);
      expect(b.y - b.r).toBeGreaterThan(0);
    }
    await shot(page, `${SCRATCH}/balloons-upright.png`);

    await page.setViewportSize(PHONE);
    await expect.poll(async () => (await balloons(page)).view.w).toBeGreaterThan(800);
    await stepGame(page, 2);
    expect((await balloons(page)).balloons.filter((b) => b.tied)).toHaveLength(5);
    await closeGame(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('stays sound when a child hammers the screen with their whole hand, through every phase', async ({ page }) => {
    test.setTimeout(240_000);
    const noise = watchConsole(page);
    await page.setViewportSize(PHONE);
    await openStand(page);
    let most = 0;
    for (let turn = 0; turn < 300; turn++) {
      const v = await balloons(page);
      most = Math.max(most, v.balloons.length);
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
    expect(most, 'never more balloons than the game allows').toBeLessThanOrEqual(44);
    await closeGame(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });
});
