import { expect, type Page, test } from '@playwright/test';
import type { TreasureRain } from '../../src/wonder/games/treasure-rain';
import {
  befriend,
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
  tapWorld,
  untilOpen,
  watchConsole,
} from './helpers';

/** What a phone held sideways shows, the screen everything here is for. */
const PHONE = { width: 863, height: 360 };
const TOY = 'treasure-house/rain-maker-1';

type Vault = ReturnType<TreasureRain['inspect']> & {
  readonly view: { readonly w: number; readonly h: number; readonly unit: number };
};
type Spot = { readonly x: number; readonly y: number };

const stateOf = (page: Page) => page.evaluate(() => window.__ua!.wonders.state);
const stepGame = (page: Page, seconds: number): Promise<void> =>
  page.evaluate((s) => window.__ua!.wonders.inside!.stage.step(s), seconds);

/**
 * What the game inside the overlay says about itself, picked inside the page because a method on a
 * class does not cross to the test.
 */
const vault = (page: Page): Promise<Vault> =>
  page.evaluate(() => {
    const inside = window.__ua!.wonders.inside!;
    const game = inside.wonder as unknown as { inspect(): Omit<Vault, 'view'> };
    const { w, h, unit } = inside.stage.view;
    return { ...game.inspect(), view: { w, h, unit } };
  });

const total = (counts: Vault['counts']): number => counts.gem + counts.gold + counts.money;

/** Whether a place on the screen is the game and not one of the overlay's buttons. */
const onTheGame = (page: Page, at: Spot, unit: number): Promise<boolean> =>
  page.evaluate(([px, py]) => document.elementFromPoint(px!, py!)?.tagName === 'CANVAS', [
    at.x * unit,
    at.y * unit,
  ] as const);

/**
 * A real touch at a place in the game's units. A place under a button would press the button, which
 * is a mistake in the test and not in the game.
 */
async function touch(page: Page, at: Spot, unit: number): Promise<void> {
  expect(
    await onTheGame(page, at, unit),
    `a finger at ${Math.round(at.x)},${Math.round(at.y)} is on the game and not on a button`,
  ).toBe(true);
  await page.mouse.click(at.x * unit, at.y * unit);
}

/**
 * A finger put down on one place and drawn through the others, as fast as a hand does it, then
 * lifted.
 */
async function slide(page: Page, through: readonly Spot[], unit: number): Promise<void> {
  const [first, ...rest] = through;
  await page.mouse.move(first!.x * unit, first!.y * unit);
  await page.mouse.down();
  for (const at of rest) await page.mouse.move(at.x * unit, at.y * unit, { steps: 3 });
  await page.mouse.up();
}

const seen = (v: Vault, at: Spot): boolean => at.x > 4 && at.x < v.view.w - 4 && at.y > 4 && at.y < v.view.h;

/**
 * In the treasure house with the creatures sent away, the friends named already found, and the
 * camera settled.
 */
async function inTheTreasureHouse(page: Page, friends: readonly string[] = []): Promise<void> {
  await openGame(page);
  await play(page);
  await freeze(page);
  for (const id of friends) await befriend(page, id);
  await page.evaluate(() => window.__ua!.controller.travel({ mapId: 'treasure-house', spawnId: 'from-garden' }));
  await hush(page);
  await step(page, 1.5);
}

async function openVault(page: Page, friends: readonly string[] = []): Promise<void> {
  await inTheTreasureHouse(page, friends);
  await page.setViewportSize(PHONE);
  await standBeside(page, TOY);
  await step(page, 2);
  await tapWorld(page, await fingerOn(page, TOY));
  await stepUntil(page, 'the game to start opening', () => window.__ua!.wonders.isOpen, 20);
  await untilOpen(page);
}

async function closeGame(page: Page): Promise<void> {
  await page.locator('.wonder-done').click();
  await expect.poll(() => page.evaluate(() => window.__ua!.wonders.isOpen), { timeout: 20_000 }).toBe(false);
}

/** The count in is three and a bit seconds, and the first piece falls a moment after it. */
async function throughTheCountIn(page: Page): Promise<void> {
  for (let i = 0; i < 40 && (await vault(page)).lead > 0; i++) await stepGame(page, 0.2);
  expect((await vault(page)).lead, 'the count in is over').toBe(0);
}

/**
 * The lowest piece that is on the screen and under no button, which is the one a hand goes to
 * first. The top row is the buttons, and a piece is out of reach there for as long as it takes to
 * fall past them.
 */
const lowest = (v: Vault): Vault['pieces'][number] | undefined =>
  v.pieces.filter((p) => p.y > 90 && p.y < v.view.h - 80).sort((a, b) => b.y - a.y)[0];

/** Runs until a piece is on the screen to catch. */
async function untilAPiece(page: Page): Promise<Vault> {
  for (let i = 0; i < 40; i++) {
    const v = await vault(page);
    if (lowest(v)) return v;
    await stepGame(page, 0.2);
  }
  throw new Error('no treasure fell');
}

/**
 * The pieces a line can be drawn through, left to right: on the screen and clear of the buttons
 * along the top and the heaps along the bottom.
 */
const inReach = (v: Vault): Vault['pieces'] =>
  [...v.pieces]
    .filter((p) => p.y > 90 && p.y < v.view.h - 90)
    .sort((a, b) => a.x - b.x)
    .slice(0, 3);

/**
 * Runs until a line can go through two pieces. The sky is random, and one look at one moment finds
 * fewer than two there about one time in four (40,000 simulated skies), so a test that needs two
 * steps on until they are there.
 */
async function untilTwoPieces(page: Page): Promise<Vault> {
  for (let i = 0; i < 60; i++) {
    const v = await vault(page);
    if (inReach(v).length >= 2) return v;
    await stepGame(page, 0.1);
  }
  throw new Error('the sky never had two pieces in reach');
}

test.describe('the treasure rain', () => {
  test('opens on a count of three, two, one with the chest, the clock and the herd where they belong, and a touch on a falling piece sends it into the chest', async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await openVault(page, ['leaf', 'glacier']);
    await expect(page.getByRole('dialog', { name: 'Catching treasure that rains from the sky' })).toBeVisible();
    await expect(page.locator('.wonder-star')).toHaveCount(5);
    await stepGame(page, 1);
    await shot(page, `${SCRATCH}/rain-count.png`);

    const start = await vault(page);
    expect(start.phase).toBe('play');
    expect(start.lead, 'it begins with the count in').toBeGreaterThan(0);
    expect(start.pieces, 'and nothing falls until it is done').toHaveLength(0);
    expect(start.remaining).toBe(60);
    expect(start.friends.map((f) => f.id).sort(), 'the herd she has, on the floor').toEqual([
      'glacier',
      'leaf',
      'wildstar',
    ]);
    for (const [what, at] of [
      ['the chest', start.chest],
      ['the clock', start.clock],
      ...start.friends.map((f) => [f.id, f] as const),
    ] as const) {
      expect(seen(start, at), `${what} is on the screen`).toBe(true);
    }
    expect(await onTheGame(page, start.clock, start.view.unit), 'the clock is not under a button').toBe(true);
    expect(await onTheGame(page, start.chest, start.view.unit), 'the chest can be touched').toBe(true);
    for (const f of start.friends)
      expect(
        Math.hypot(f.x - start.chest.x, f.y - start.chest.y),
        `${f.id} is not standing in the chest`,
      ).toBeGreaterThan(start.chest.w * 0.5);

    // A touch during the count in is not a catch, and nothing happens to it.
    await touch(page, { x: start.view.w * 0.3, y: start.view.h * 0.4 }, start.view.unit);
    expect(total((await vault(page)).counts)).toBe(0);

    await throughTheCountIn(page);
    // The game keeps falling while a touch is on its way from here to the page, and on a slow
    // machine the piece can be lower by then. A touch on the sky costs nothing, so it goes for the
    // next one.
    let raining = await untilAPiece(page);
    await shot(page, `${SCRATCH}/rain-falling.png`);
    let piece = lowest(raining)!;
    let caught = raining;
    for (let attempt = 0; attempt < 6 && total(caught.counts) === 0; attempt++) {
      raining = await untilAPiece(page);
      piece = lowest(raining)!;
      expect(seen(raining, piece), 'the piece is on the screen').toBe(true);
      await touch(page, piece, raining.view.unit);
      await stepGame(page, 0.1);
      caught = await vault(page);
    }
    expect(total(caught.counts), 'the piece is caught at once').toBe(1);
    expect(caught.flights, 'and is on its way to the chest').toBeGreaterThanOrEqual(1);
    expect(
      caught.pieces.find((p) => p.id === piece.id),
      'it is no longer falling',
    ).toBeUndefined();
    await stepGame(page, 0.8);
    const landed = await vault(page);
    expect(total(landed.landed), 'it has landed in its heap').toBe(1);
    expect(landed.flights).toBe(0);
    await expect
      .poll(
        async () =>
          await page.evaluate(
            () => window.__ua!.wonders.inside!.wonder.stars + window.__ua!.wonders.inside!.wonder.progress,
          ),
        { message: 'a catch is worth something' },
      )
      .toBeGreaterThan(0);
    await shot(page, `${SCRATCH}/rain-caught.png`);

    await closeGame(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('catches what a finger is drawn through, costs nothing when it touches the sky, and answers a touch on a friend', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const noise = watchConsole(page);
    await openVault(page, ['leaf', 'cinder']);
    await throughTheCountIn(page);
    await stepGame(page, 6);
    const v = await untilTwoPieces(page);
    const unit = v.view.unit;
    expect(v.pieces.length, 'there is treasure in the sky').toBeGreaterThanOrEqual(3);

    // A slide through three pieces catches them all, though a finger moves faster than they fall.
    const before = total(v.counts);
    const mine = inReach(v);
    await slide(
      page,
      mine.map((p) => ({ x: p.x, y: p.y })),
      unit,
    );
    const after = await vault(page);
    expect(total(after.counts), 'every piece the line went through').toBeGreaterThanOrEqual(before + mine.length);
    await shot(page, `${SCRATCH}/rain-swipe.png`);
    await stepGame(page, 1);

    // The empty place a finger can go to takes nothing away. A friend cheers.
    const kept = await vault(page);
    await touch(page, { x: 40, y: 150 }, unit);
    await stepGame(page, 0.3);
    expect(total((await vault(page)).counts)).toBeGreaterThanOrEqual(total(kept.counts));
    const friend = kept.friends.find((f) => f.id === 'leaf')!;
    await touch(page, friend, unit);
    await stepGame(page, 0.3);
    await shot(page, `${SCRATCH}/rain-friend.png`);

    // Nothing is ever lost: through twenty seconds of touching nothing, the heaps and the count
    // only stay or grow.
    let last = total((await vault(page)).landed);
    for (let i = 0; i < 20; i++) {
      await stepGame(page, 1);
      const now = total((await vault(page)).landed);
      expect(now, 'what is in the chest stays in it').toBeGreaterThanOrEqual(last);
      last = now;
    }
    expect((await vault(page)).remaining, 'the clock has run on').toBeLessThan(40);

    await closeGame(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('can be played to the end with touches alone: the clock runs down, the chest comes to the middle and is counted, what the player caught is said, and they can play again', async ({
    page,
  }) => {
    test.setTimeout(540_000);
    const noise = watchConsole(page);
    await openVault(page, ['leaf', 'glacier', 'river', 'cinder', 'storm']);
    expect((await vault(page)).friends, 'the whole herd on the floor').toHaveLength(6);
    await throughTheCountIn(page);

    let guard = 0;
    while ((await stateOf(page)).phase === 'play' && guard++ < 400) {
      const v = await vault(page);
      const piece = lowest(v);
      if (piece) await touch(page, piece, v.view.unit);
      await stepGame(page, 0.2);
    }
    expect((await stateOf(page)).phase, 'the time being up began the finale').toBe('finale');
    expect((await stateOf(page)).stars, 'all five stars').toBe(5);
    const done = await vault(page);
    expect(done.remaining).toBe(0);
    expect(total(done.counts), 'a hand that goes to the lowest piece every beat catches a good many').toBeGreaterThan(
      30,
    );
    expect(total(done.landed), 'every piece that was caught is in the chest').toBe(total(done.counts));
    expect(done.pieces, 'what was still falling is gone').toHaveLength(0);

    for (let i = 0; i < 80 && (await stateOf(page)).phase === 'finale'; i++) {
      if (i === 8) await shot(page, `${SCRATCH}/rain-counting-1.png`);
      if (i === 16) await shot(page, `${SCRATCH}/rain-counting-2.png`);
      if (i === 26) await shot(page, `${SCRATCH}/rain-said.png`);
      await stepGame(page, 0.3);
    }
    await expect.poll(async () => (await stateOf(page)).phase, { timeout: 30_000 }).toBe('after');
    await stepGame(page, 2);
    const said = await vault(page);
    expect(said.result?.title, 'it says what she caught').toBe(`You caught ${total(done.counts)}!`);
    await shot(page, `${SCRATCH}/rain-after.png`);

    // After it, a touch spills treasure from the chest, and a friend still answers.
    await touch(page, said.chest, said.view.unit);
    await stepGame(page, 0.5);
    await shot(page, `${SCRATCH}/rain-spill.png`);

    const again = page.getByRole('button', { name: 'Play again' });
    await expect(again).toBeVisible();
    await expect(page.getByRole('button', { name: 'All done' })).toHaveCSS('opacity', '1');
    await again.click();
    await expect.poll(async () => (await stateOf(page)).phase).toBe('play');
    expect((await stateOf(page)).stars).toBe(0);
    await stepGame(page, 1);
    const fresh = await vault(page);
    expect(fresh.lead, 'it counts in again').toBeGreaterThan(0);
    expect(total(fresh.counts)).toBe(0);
    expect(total(fresh.landed)).toBe(0);
    expect(fresh.remaining).toBe(60);
    expect(fresh.result).toBeNull();

    await closeGame(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('says how to catch some when nothing was caught, and never takes a star back', async ({ page }) => {
    test.setTimeout(240_000);
    const noise = watchConsole(page);
    await openVault(page);
    await throughTheCountIn(page);
    for (let i = 0; i < 90 && (await stateOf(page)).phase === 'play'; i++) await stepGame(page, 1);
    expect((await stateOf(page)).phase).toBe('finale');
    for (let i = 0; i < 40 && (await stateOf(page)).phase === 'finale'; i++) await stepGame(page, 0.3);
    await expect.poll(async () => (await stateOf(page)).phase, { timeout: 30_000 }).toBe('after');
    const none = await vault(page);
    expect(total(none.counts)).toBe(0);
    expect(none.result?.title).toBe('Nice try!');
    await shot(page, `${SCRATCH}/rain-nothing.png`);
    await closeGame(page);
    expect(noise).toEqual([]);
  });

  test('keeps what the player has caught, and can be played, when the phone is turned upright and back', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const noise = watchConsole(page);
    await openVault(page, ['leaf', 'glacier', 'river']);
    await throughTheCountIn(page);
    for (let i = 0; i < 24; i++) {
      const v = await vault(page);
      const piece = lowest(v);
      if (piece) await touch(page, piece, v.view.unit);
      await stepGame(page, 0.35);
    }
    await stepGame(page, 1);
    const made = await vault(page);
    expect(total(made.landed), 'some treasure is in the chest').toBeGreaterThanOrEqual(3);

    const checkRoom = async (room: Vault, shape: string): Promise<void> => {
      expect(room.friends, `${shape}: the herd is still here`).toHaveLength(made.friends.length);
      expect(room.landed, `${shape}: the heaps are kept`).toEqual(made.landed);
      for (const [what, at] of [
        ['the chest', room.chest],
        ['the clock', room.clock],
        ...room.friends.map((f) => [f.id, f] as const),
      ] as const) {
        expect(seen(room, at), `${shape}: ${what} is on the screen`).toBe(true);
      }
      expect(await onTheGame(page, room.clock, room.view.unit), `${shape}: the clock is not under a button`).toBe(true);
      for (const f of room.friends)
        expect(
          Math.hypot(f.x - room.chest.x, f.y - room.chest.y),
          `${shape}: ${f.id} is not in the chest`,
        ).toBeGreaterThan(room.chest.w * 0.45);
      for (const p of room.pieces) expect(p.x, `${shape}: a piece is not off the side`).toBeLessThan(room.view.w + 4);
    };

    await page.setViewportSize({ width: 360, height: 780 });
    await expect
      .poll(async () => (await vault(page)).view.h, { message: 'the game seeing the new shape of the screen' })
      .toBeGreaterThan(600);
    await stepGame(page, 0.5);
    await checkRoom(await vault(page), 'upright');
    await shot(page, `${SCRATCH}/rain-upright.png`);

    // It can be played upright: a piece that falls can be caught.
    const upright = await untilAPiece(page);
    const piece = lowest(upright)!;
    const before = total(upright.counts);
    await touch(page, piece, upright.view.unit);
    await stepGame(page, 0.8);
    expect(total((await vault(page)).counts), 'a catch upright').toBeGreaterThan(before);
    await shot(page, `${SCRATCH}/rain-upright-play.png`);

    await page.setViewportSize(PHONE);
    await expect.poll(async () => (await vault(page)).view.w).toBeGreaterThan(800);
    await stepGame(page, 0.5);
    const back = await vault(page);
    expect(total(back.landed), 'the heaps are kept when it is turned back').toBeGreaterThanOrEqual(total(made.landed));
    await shot(page, `${SCRATCH}/rain-back.png`);

    await closeGame(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });
});
