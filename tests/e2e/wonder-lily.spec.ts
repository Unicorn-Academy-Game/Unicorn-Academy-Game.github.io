import { expect, type Page, test } from '@playwright/test';
import type { LilyHop } from '../../src/wonder/games/lily-hop';
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
const TOY = 'playground/frog-pond-1';

type Pond = ReturnType<LilyHop['inspect']> & {
  readonly view: { readonly w: number; readonly h: number; readonly unit: number };
};
type Spot = { readonly x: number; readonly y: number };
type PadView = Pond['pads'][number];

const stateOf = (page: Page) => page.evaluate(() => window.__ua!.wonders.state);
const stepGame = (page: Page, seconds: number): Promise<void> =>
  page.evaluate((s) => window.__ua!.wonders.inside!.stage.step(s), seconds);

/**
 * What the game inside the overlay says about itself, picked inside the page because a method on a
 * class does not cross to the test.
 */
const pond = (page: Page): Promise<Pond> =>
  page.evaluate(() => {
    const inside = window.__ua!.wonders.inside!;
    const game = inside.wonder as unknown as { inspect(): Omit<Pond, 'view'> };
    const { w, h, unit } = inside.stage.view;
    return { ...game.inspect(), view: { w, h, unit } };
  });

/** How much the player has earned: the stars so far and how far they are to the next. */
const earned = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const w = window.__ua!.wonders.inside!.wonder;
    return w.stars + w.progress;
  });

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
  for (const at of rest) await page.mouse.move(at.x * unit, at.y * unit, { steps: 4 });
  await page.mouse.up();
}

const seen = (v: Pond, at: Spot): boolean => at.x > 6 && at.x < v.view.w - 6 && at.y > 6 && at.y < v.view.h;

async function openPond(page: Page, friends: readonly string[] = []): Promise<void> {
  await inThePlayground(page, friends);
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

/** The middle of a pad's top, where the frog sits and the finger goes. */
const onPad = (pad: PadView): Spot => ({ x: pad.x, y: pad.y - pad.ry * 0.5 });
const lotusPads = (v: Pond): PadView[] => v.pads.filter((p) => p.lotus >= 0);
const unopened = (v: Pond): PadView[] => lotusPads(v).filter((p) => !p.open);

/**
 * The one thing a child who knows the pond would do next: the next bud along the path, and now and
 * then the frog, a friend, a duck or the water.
 */
function next(v: Pond, turn: number): Spot {
  if (turn % 13 === 5) return v.frog;
  if (turn % 11 === 7 && v.friends.length > 0) return v.friends[turn % v.friends.length]!;
  if (turn % 17 === 9 && v.ducks.length > 0) return v.ducks[0]!;
  if (turn % 19 === 3) return { x: v.size.w * 0.5, y: v.size.h * 0.58 };
  const buds = unopened(v);
  const pad = buds.length > 0 ? buds[turn % buds.length]! : lotusPads(v)[turn % 7]!;
  return onPad(pad);
}

test.describe('the frog on the lily pads', () => {
  test('opens with the frog home on her pad, seven closed lotuses, the herd on the bank, and a touch on a pad sends her hopping there to open its flower', async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await openPond(page, ['leaf', 'glacier']);
    await expect(page.getByRole('dialog', { name: 'A frog hopping on lily pads' })).toBeVisible();
    await expect(page.locator('.wonder-star')).toHaveCount(5);
    await stepGame(page, 2);
    await shot(page, `${SCRATCH}/lily-open.png`);

    const start = await pond(page);
    expect(start.pads, 'a home pad and seven more').toHaveLength(8);
    expect(lotusPads(start), 'seven of them have a lotus').toHaveLength(7);
    expect(
      lotusPads(start).every((p) => !p.open && p.bloom === 0),
      'all of them still buds',
    ).toBe(true);
    expect(start.frog.at, 'the frog is on her home pad').toBe(0);
    expect(start.friends.map((f) => f.id).sort(), 'the herd she has, on the bank').toEqual([
      'glacier',
      'leaf',
      'wildstar',
    ]);
    expect(start.whole).toBe(false);
    for (const [what, at] of [
      ['the frog', start.frog],
      ...start.pads.map((p, i) => [`pad ${i}`, p] as const),
      ...start.friends.map((f) => [f.id, f] as const),
    ] as const) {
      expect(seen(start, at), `${what} is on the screen`).toBe(true);
    }
    for (const [i, p] of start.pads.entries())
      expect(await onTheGame(page, onPad(p), start.view.unit), `pad ${i} is not under a button`).toBe(true);
    for (const f of start.friends) {
      for (const p of start.pads)
        expect(Math.hypot(f.x - p.x, f.y - p.y), `${f.id} is not standing on a pad`).toBeGreaterThan(f.r * 0.6);
    }

    // The first bud: the frog crouches, leaps, lands on its pad, and its lotus opens.
    const first = lotusPads(start)[0]!;
    await touch(page, onPad(first), start.view.unit);
    await stepGame(page, 0.2);
    const going = await pond(page);
    expect(going.frog.busy, 'she is on her way').toBe(true);
    expect(going.frog.target, 'to the pad that was touched').toBe(start.pads.indexOf(first));
    await stepGame(page, 2.2);
    const there = await pond(page);
    expect(there.frog.busy, 'she has landed').toBe(false);
    expect(there.frog.at, 'on that pad').toBe(start.pads.indexOf(first));
    expect(
      there.pads.filter((p) => p.open),
      'and its lotus is open',
    ).toHaveLength(1);
    expect(there.open).toBe(1);
    await expect.poll(() => earned(page), { message: 'a hop and a bloom are worth something' }).toBeGreaterThan(0);
    await shot(page, `${SCRATCH}/lily-hop.png`);

    await closeGame(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('answers a finger everywhere: a slide hops pad to pad, the frog ribbits, a friend calls her to her own lotus, the water and the sky answer, and a duck and a dragonfly play', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const noise = watchConsole(page);
    await openPond(page, ['leaf', 'cinder']);
    await stepGame(page, 2);
    const v = await pond(page);
    const unit = v.view.unit;

    // One slide of a finger across four pads: she hops to each in turn and the lotuses open behind
    // her.
    let before = await earned(page);
    const row = lotusPads(v).slice(0, 4);
    await slide(page, row.map(onPad), unit);
    await stepGame(page, 0.4);
    expect((await pond(page)).frog.busy, 'she is hopping').toBe(true);
    await stepGame(page, 6);
    const crossed = await pond(page);
    expect(crossed.frog.busy, 'she has done').toBe(false);
    expect(crossed.frog.at, 'on the last pad she was shown').toBe(v.pads.indexOf(row[3]!));
    expect(crossed.pads.filter((p) => p.open).length, 'the lotuses she landed on are open').toBeGreaterThanOrEqual(3);
    expect(await earned(page), 'a run of hops is worth a good deal').toBeGreaterThan(before + 0.5);
    await shot(page, `${SCRATCH}/lily-slide.png`);

    // The frog herself: a ribbit.
    before = await earned(page);
    await touch(page, crossed.frog, unit);
    await stepGame(page, 0.4);
    await expect.poll(() => earned(page), { message: 'a ribbit is worth something' }).toBeGreaterThan(before);
    await shot(page, `${SCRATCH}/lily-ribbit.png`);
    await stepGame(page, 2);

    // A friend: a comet of her colour goes to the lotus that is hers, and the frog is called there.
    before = await earned(page);
    const friend = (await pond(page)).friends.find((f) => f.id === 'leaf')!;
    await touch(page, friend, unit);
    await stepGame(page, 0.4);
    await expect.poll(() => earned(page), { message: 'a friend is worth something' }).toBeGreaterThan(before);
    await shot(page, `${SCRATCH}/lily-friend.png`);
    await stepGame(page, 5);
    expect((await pond(page)).frog.busy, 'the frog has come').toBe(false);

    // The water, a duck, a dragonfly, and the sky.
    const calm = await pond(page);
    before = await earned(page);
    await touch(page, { x: calm.size.w * 0.5, y: calm.size.h * 0.6 }, unit);
    await stepGame(page, 0.6);
    await shot(page, `${SCRATCH}/lily-water.png`);
    if (calm.ducks.length > 0) {
      await touch(page, calm.ducks[0]!, unit);
      await stepGame(page, 0.6);
      await shot(page, `${SCRATCH}/lily-duck.png`);
    }
    const flies = (await pond(page)).dragonflies;
    if (flies.length > 0) {
      await touch(page, flies[0]!, unit);
      await stepGame(page, 0.6);
      await shot(page, `${SCRATCH}/lily-dragonfly.png`);
    }
    await page.mouse.click(40, 120);
    await stepGame(page, 1);
    await shot(page, `${SCRATCH}/lily-sky.png`);
    expect(await earned(page), 'the water and what lives on it are worth something').toBeGreaterThan(before);

    await closeGame(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('can be played to the end with touches alone: every lotus opens, the pond is whole, the finale plays, and the player can play again', async ({
    page,
  }) => {
    test.setTimeout(540_000);
    const noise = watchConsole(page);
    await openPond(page, ['leaf', 'glacier', 'river', 'cinder', 'storm']);
    await stepGame(page, 1);
    expect((await pond(page)).friends, 'the whole herd on the bank').toHaveLength(6);

    let wholeSeen = false;
    for (let turn = 0; turn < 900; turn++) {
      if ((await stateOf(page)).phase !== 'play') break;
      const v = await pond(page);
      wholeSeen ||= v.whole;
      await touch(page, next(v, turn), v.view.unit);
      await stepGame(page, 0.45);
    }
    expect((await stateOf(page)).phase, 'the fifth star began the finale').toBe('finale');
    expect((await stateOf(page)).stars).toBe(5);

    for (let i = 0; i < 60 && (await stateOf(page)).phase === 'finale'; i++) {
      if (i === 6) await shot(page, `${SCRATCH}/lily-finale-1.png`);
      if (i === 14) await shot(page, `${SCRATCH}/lily-finale-2.png`);
      if (i === 22) await shot(page, `${SCRATCH}/lily-finale-3.png`);
      await stepGame(page, 0.4);
    }
    await expect.poll(async () => (await stateOf(page)).phase, { timeout: 30_000 }).toBe('after');
    await stepGame(page, 2);
    const after = await pond(page);
    expect(after.open, 'the lotuses are open round the pond').toBeGreaterThanOrEqual(6);
    await shot(page, `${SCRATCH}/lily-after.png`);

    // It goes on being played after the finale, and she can begin again.
    const again = page.getByRole('button', { name: 'Play again' });
    await expect(again).toBeVisible();
    await expect(page.getByRole('button', { name: 'All done' })).toHaveCSS('opacity', '1');
    const bud = lotusPads(after).find((p) => p !== after.pads[after.frog.at])!;
    await touch(page, onPad(bud), after.view.unit);
    await stepGame(page, 0.2);
    expect((await pond(page)).frog.busy, 'she still hops').toBe(true);
    await stepGame(page, 3);

    await again.click();
    await expect.poll(async () => (await stateOf(page)).phase).toBe('play');
    expect((await stateOf(page)).stars).toBe(0);
    await stepGame(page, 1.5);
    const fresh = await pond(page);
    expect(fresh.open, 'the lotuses are buds again').toBe(0);
    expect(fresh.whole).toBe(false);
    expect(fresh.frog.at, 'and the frog is home').toBe(0);
    expect(wholeSeen || after.whole, 'the pond was whole at some point').toBe(true);

    await closeGame(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('keeps what the player has made, and can be played, when the phone is turned upright and back', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const noise = watchConsole(page);
    await openPond(page, ['leaf', 'glacier', 'river']);
    await stepGame(page, 2);
    const v = await pond(page);
    for (const pad of lotusPads(v).slice(0, 3)) {
      await touch(page, onPad(pad), v.view.unit);
      await stepGame(page, 3);
    }
    const made = await pond(page);
    expect(made.open, 'three lotuses are open').toBeGreaterThanOrEqual(3);
    const openIds = made.pads.map((p) => p.open);
    const had = await earned(page);

    const checkRoom = async (room: Pond, shape: string, flowers: readonly boolean[]): Promise<void> => {
      expect(room.friends, `${shape}: the herd is still here`).toHaveLength(made.friends.length);
      expect(
        room.pads.map((p) => p.open),
        `${shape}: the same lotuses are open`,
      ).toEqual(flowers);
      for (const [what, at] of [
        ['the frog', room.frog],
        ...room.pads.map((p, i) => [`pad ${i}`, p] as const),
        ...room.friends.map((f) => [f.id, f] as const),
      ] as const) {
        expect(seen(room, at), `${shape}: ${what} is on the screen`).toBe(true);
      }
      for (const [i, p] of room.pads.entries())
        expect(await onTheGame(page, onPad(p), room.view.unit), `${shape}: pad ${i} is not under a button`).toBe(true);
      for (const f of room.friends) {
        for (const p of room.pads)
          expect(Math.hypot(f.x - p.x, f.y - p.y), `${shape}: ${f.id} is not on a pad`).toBeGreaterThan(f.r * 0.6);
      }
    };

    await page.setViewportSize({ width: 360, height: 780 });
    await expect
      .poll(async () => (await pond(page)).view.h, { message: 'the game seeing the new shape of the screen' })
      .toBeGreaterThan(600);
    await stepGame(page, 3);
    const upright = await pond(page);
    await checkRoom(upright, 'upright', openIds);
    expect(await earned(page), 'what she has earned is kept').toBeGreaterThanOrEqual(had);
    await shot(page, `${SCRATCH}/lily-upright.png`);

    // It can be played upright: a hop to a bud opens it.
    const bud = unopened(upright)[0]!;
    await touch(page, onPad(bud), upright.view.unit);
    await stepGame(page, 4);
    const hopped = await pond(page);
    expect(hopped.pads[upright.pads.indexOf(bud)]!.open, 'a lotus opened upright').toBe(true);
    await shot(page, `${SCRATCH}/lily-upright-play.png`);

    await page.setViewportSize(PHONE);
    await expect.poll(async () => (await pond(page)).view.w).toBeGreaterThan(800);
    await stepGame(page, 2);
    const back = await pond(page);
    await checkRoom(
      back,
      'back',
      hopped.pads.map((p) => p.open),
    );
    await shot(page, `${SCRATCH}/lily-back.png`);

    await closeGame(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });
});
