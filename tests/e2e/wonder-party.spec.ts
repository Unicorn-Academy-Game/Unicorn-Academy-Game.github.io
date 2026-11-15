import { expect, type Page, test } from '@playwright/test';
import type { PartyTime } from '../../src/wonder/games/party-time';
import {
  fingerOn,
  hush,
  inThePlayground,
  SCRATCH,
  shot,
  standBeside,
  step,
  stepUntil,
  tapWorld,
  untilArrived,
  untilOpen,
  watchConsole,
} from './helpers';

/** What a phone held sideways shows, the screen everything here is for. */
const PHONE = { width: 863, height: 360 };
const POPPER = 'playground/popper-1';
/** The dancing game opens from the poppers of the dance floor too. */
const DANCE_POPPER = 'dance-floor/popper-1';

type Party = ReturnType<PartyTime['inspect']> & {
  readonly view: { readonly w: number; readonly h: number; readonly unit: number };
};
type Dancer = Party['dancers'][number];

const stateOf = (page: Page) => page.evaluate(() => window.__ua!.wonders.state);
const stepGame = (page: Page, seconds: number): Promise<void> =>
  page.evaluate((s) => window.__ua!.wonders.inside!.stage.step(s), seconds);

/**
 * What the game inside the overlay says about itself, picked inside the page because a method on a
 * class does not cross to the test.
 */
const party = (page: Page): Promise<Party> =>
  page.evaluate(() => {
    const inside = window.__ua!.wonders.inside!;
    const game = inside.wonder as unknown as { inspect(): Omit<Party, 'view'> };
    const { w, h, unit } = inside.stage.view;
    return { ...game.inspect(), view: { w, h, unit } };
  });

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
 * A real touch on the screen at a place in the game's units. A place under one of the overlay's
 * buttons would press the button, which is a mistake in the test and not in the game.
 */
async function touch(page: Page, at: { x: number; y: number }, unit: number): Promise<void> {
  const onGame = await page.evaluate(([px, py]) => document.elementFromPoint(px!, py!)?.tagName === 'CANVAS', [
    at.x * unit,
    at.y * unit,
  ] as const);
  expect(onGame, `a finger at ${Math.round(at.x)},${Math.round(at.y)} is on the game and not on a button`).toBe(true);
  await page.mouse.click(at.x * unit, at.y * unit);
}

// Where a finger goes on each part of the room, picked from what the game says about itself.
const onFriend = (d: Dancer) => ({ x: d.x, y: (d.y + d.head) / 2 });
const onCannon = (c: Party['cannons'][number]) => ({ x: (c.x + c.mouth.x) / 2, y: (c.y + c.mouth.y) / 2 });
const onPinata = (v: Party) => ({ x: v.pinata.x, y: v.pinata.y });
const onBall = (v: Party) => ({ x: v.ball.x, y: v.ball.y + v.ball.r * 0.4 });
const onSpeaker = (s: Party['speakers'][number]) => ({ x: s.x, y: s.y });

/**
 * A place on the front of the floor where no friend stands, so that a finger there is on the floor
 * and on nothing else. `nth` picks one of the places along it.
 */
function openFloor(v: Party, nth: number): { x: number; y: number } {
  const y = v.floor.bottom - 12;
  const free: number[] = [];
  for (let x = v.floor.left + 100; x < v.floor.right - 100; x += 14) {
    if (v.dancers.every((d) => Math.abs(d.x - x) > 72 || y > d.y + 16)) free.push(x);
  }
  return { x: free[Math.floor(((nth % 7) / 7) * free.length)]!, y };
}

/** Whether a place is on the screen. */
const seen = (v: Party, at: { x: number; y: number }): boolean =>
  at.x > 8 && at.x < v.view.w - 8 && at.y > 8 && at.y < v.view.h;

async function openParty(page: Page, friends: readonly string[] = []): Promise<void> {
  // The friends are met on the screen the project gives, which is a little taller than a phone held
  // sideways, because one of them stands near the top of a forest clearing. The party is played on
  // the phone's.
  await inThePlayground(page, friends);
  await page.setViewportSize(PHONE);
  await standBeside(page, POPPER);
  await step(page, 2);
  await tapWorld(page, await fingerOn(page, POPPER));
  await stepUntil(page, 'the game to start opening', () => window.__ua!.wonders.isOpen, 20);
  await untilOpen(page);
}

async function closeGame(page: Page): Promise<void> {
  await page.locator('.wonder-done').click();
  await expect.poll(() => page.evaluate(() => window.__ua!.wonders.isOpen), { timeout: 20_000 }).toBe(false);
}

/**
 * The one thing a child who knows the room would do next, which is a different thing each turn so
 * that the party gets better.
 */
function next(v: Party, turn: number): { x: number; y: number } {
  const asleep = v.dancers.find((d) => d.move === null);
  if (asleep) return onFriend(asleep);
  const loaded = v.cannons.find((c) => c.ready);
  if (turn % 4 === 1 && loaded) return onCannon(loaded);
  if (turn % 3 !== 0 && v.pinata.state === 'hanging') return onPinata(v);
  if (turn % 14 === 5) return onBall(v);
  if (turn % 11 === 7) return onSpeaker(v.speakers[turn % v.speakers.length]!);
  if (turn % 5 === 0) return openFloor(v, turn);
  return onFriend(v.dancers[turn % v.dancers.length]!);
}

test.describe('the dance party', () => {
  test('opens from the popper with the floor lit, the friends ready and the cannons loaded, and a touch on a friend gets her dancing', async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await openParty(page, ['leaf', 'glacier']);
    await expect(page.getByRole('dialog', { name: 'A dance party' })).toBeVisible();
    await expect(page.locator('.wonder-star')).toHaveCount(5);
    await stepGame(page, 2);
    await shot(page, `${SCRATCH}/party-open.png`);

    const start = await party(page);
    expect(start.dancers.map((d) => d.id).sort(), 'the herd she has, on the floor').toEqual([
      'glacier',
      'leaf',
      'wildstar',
    ]);
    for (const d of start.dancers) {
      expect(d.move, `${d.id} listens to the music until she is touched`).toBeNull();
      expect(seen(start, onFriend(d)), `${d.id} is on the screen`).toBe(true);
      expect(d.y, `${d.id} stands on the floor`).toBeGreaterThan(start.floor.top);
      expect(d.y).toBeLessThan(start.floor.bottom + 6);
    }
    expect(start.cannons, 'a cannon at each side').toHaveLength(2);
    expect(start.cannons.map((c) => c.ready)).toEqual([true, true]);
    expect(start.cannons[0]!.x, 'one on the left and one on the right').toBeLessThan(start.view.w / 2);
    expect(start.cannons[1]!.x).toBeGreaterThan(start.view.w / 2);
    expect(start.pinata.state).toBe('hanging');
    expect(start.pinata.hits).toBe(0);
    expect(start.speakers, 'a speaker at each side').toHaveLength(2);
    expect(seen(start, onBall(start)), 'the mirror ball').toBe(true);
    expect(start.guests, 'nobody has come yet').toBe(0);
    expect(start.marching).toBe(false);

    // A touch on Wildstar: she dances, the first part of the song comes in, and the party notices.
    const lead = start.dancers.find((d) => d.id === 'wildstar')!;
    await touch(page, onFriend(lead), start.view.unit);
    await stepGame(page, 0.3);
    const dancing = await party(page);
    const first = dancing.dancers.find((d) => d.id === 'wildstar')!;
    expect(first.move, 'she is dancing').not.toBeNull();
    expect(first.taps).toBe(1);
    expect(dancing.parts, 'her part of the song came in').toBeGreaterThan(start.parts);
    expect(dancing.guests, 'the first guest comes when the party starts').toBeGreaterThanOrEqual(1);
    await expect.poll(() => earned(page)).toBeGreaterThan(0);
    await shot(page, `${SCRATCH}/party-dancing.png`);

    // Touched again she does another move, on the next beat.
    await stepGame(page, 1.5);
    await touch(page, onFriend(first), start.view.unit);
    await stepGame(page, 0.3);
    const again = (await party(page)).dancers.find((d) => d.id === 'wildstar')!;
    expect(again.taps).toBe(2);
    expect(again.move, 'a different move').not.toBe(first.move);
    const others = (await party(page)).dancers.filter((d) => d.id !== 'wildstar');
    expect(
      others.every((d) => d.move === null),
      'the others have not been touched',
    ).toBe(true);

    await closeGame(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('answers a finger everywhere in the room: the cannons go off and load again, the pinata bursts after a few knocks and a new one comes down, and the ball, the speakers and the floor all answer', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const noise = watchConsole(page);
    await openParty(page);
    await stepGame(page, 2);
    const v = await party(page);
    const unit = v.view.unit;

    // The cannons: each goes off, and is loaded again a moment later.
    for (const side of [-1, 1]) {
      const before = await earned(page);
      const c = v.cannons.find((x) => x.side === side)!;
      await touch(page, onCannon(c), unit);
      await stepGame(page, 0.2);
      expect(
        (await party(page)).cannons.find((x) => x.side === side)!.ready,
        `the ${side < 0 ? 'left' : 'right'} cannon went off`,
      ).toBe(false);
      await expect.poll(() => earned(page), { message: 'a cannon is worth something' }).toBeGreaterThan(before);
      await stepGame(page, 1.6);
      expect((await party(page)).cannons.find((x) => x.side === side)!.ready, 'loaded again').toBe(true);
    }
    await shot(page, `${SCRATCH}/party-cannon.png`);

    // The pinata swings, so a child follows it. A few knocks and it bursts.
    let knocks = 0;
    for (; knocks < 10; knocks++) {
      const p = await party(page);
      if (p.pinata.state !== 'hanging') break;
      await touch(page, onPinata(p), unit);
      await stepGame(page, 0.4);
      if (knocks === 1) await shot(page, `${SCRATCH}/party-pinata.png`);
    }
    expect(knocks, 'it takes more than one knock').toBeGreaterThanOrEqual(2);
    expect(knocks, 'and not a great many').toBeLessThanOrEqual(6);
    expect((await party(page)).pinata.state, 'it burst').not.toBe('hanging');
    await shot(page, `${SCRATCH}/party-burst.png`);
    await stepGame(page, 12);
    const fresh = (await party(page)).pinata;
    expect(fresh.state, 'a new one comes down so that the party can go on').toBe('hanging');
    expect(fresh.hits).toBe(0);

    // The ball, then a speaker, then a tile of the floor, then a finger drawn across the floor.
    for (const [what, at] of [
      ['the mirror ball', onBall(v)],
      ['the left speaker', onSpeaker(v.speakers[0]!)],
      ['the right speaker', onSpeaker(v.speakers[1]!)],
      ['a tile of the floor', openFloor(v, 3)],
    ] as const) {
      const before = await earned(page);
      await touch(page, at, unit);
      await stepGame(page, 0.3);
      await expect.poll(() => earned(page), { message: `${what} is worth something` }).toBeGreaterThan(before);
    }
    const before = await earned(page);
    const start = openFloor(v, 0);
    const end = openFloor(v, 6);
    await page.mouse.move(start.x * unit, start.y * unit);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(
        (start.x + ((end.x - start.x) * i) / 12) * unit,
        (start.y - 6 * Math.sin((i / 12) * Math.PI)) * unit,
      );
      await stepGame(page, 0.04);
    }
    await page.mouse.up();
    await expect
      .poll(() => earned(page), { message: 'a finger drawn across the floor is worth something' })
      .toBeGreaterThan(before);
    await shot(page, `${SCRATCH}/party-floor.png`);

    const lively = await party(page);
    expect(lively.guests, 'guests have come to the party she made').toBeGreaterThanOrEqual(2);
    // A touch on the sky answers with a twinkle, and nothing breaks.
    await page.mouse.click(40, 120);
    await stepGame(page, 1);

    await closeGame(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('can be played to the end with touches alone: the herd goes on parade round the world and comes home, and the player can play again', async ({
    page,
  }) => {
    test.setTimeout(420_000);
    const noise = watchConsole(page);
    await openParty(page, ['leaf', 'glacier', 'river', 'cinder', 'storm']);
    await stepGame(page, 1);
    const home = (await party(page)).dancers.map((d) => ({ id: d.id, x: d.x, y: d.y }));
    expect(home, 'the whole herd on the floor').toHaveLength(6);

    for (let turn = 0; turn < 400; turn++) {
      if ((await stateOf(page)).phase !== 'play') break;
      const v = await party(page);
      await touch(page, next(v, turn), v.view.unit);
      await stepGame(page, 0.6);
    }
    expect((await stateOf(page)).phase, 'the fifth star began the finale').toBe('finale');
    expect((await stateOf(page)).stars).toBe(5);
    const dancing = (await party(page)).dancers.filter((d) => d.move !== null).length;
    expect(dancing, 'most of the herd was dancing by the end').toBeGreaterThanOrEqual(5);

    // The parade: the friends leave their places, go a long way along the world, and are back where
    // they stood.
    let marched = 0;
    let along = 0;
    const seenAt: number[] = [];
    for (let i = 0; i < 120 && (await stateOf(page)).phase === 'finale'; i++) {
      const v = await party(page);
      if (v.marching) {
        marched++;
        const lead = v.dancers[0]!;
        seenAt.push(lead.x);
        along = Math.max(along, Math.abs(lead.x - home[0]!.x));
      }
      if (i === 8) await shot(page, `${SCRATCH}/party-parade-1.png`);
      if (i === 18) await shot(page, `${SCRATCH}/party-parade-2.png`);
      if (i === 28) await shot(page, `${SCRATCH}/party-parade-3.png`);
      await stepGame(page, 0.5);
    }
    expect(marched, 'the parade lasted most of the finale').toBeGreaterThan(20);
    expect(along, 'it went a good way along the world').toBeGreaterThan(PHONE.width * 0.8);
    await expect.poll(async () => (await stateOf(page)).phase, { timeout: 20_000 }).toBe('after');
    await shot(page, `${SCRATCH}/party-after.png`);

    // After it she is home, the floor is hers, and every friend is dancing. A sway takes her a
    // dance step to either side of her mark.
    await stepGame(page, 3);
    const later = await party(page);
    expect(later.marching, 'the parade is over').toBe(false);
    for (const h of home) {
      const d = later.dancers.find((x) => x.id === h.id)!;
      expect(Math.abs(d.x - h.x), `${h.id} is back where she stood`).toBeLessThan(20);
      expect(Math.abs(d.y - h.y)).toBeLessThan(2);
      expect(d.move, `${h.id} is dancing`).not.toBeNull();
    }
    const again = page.getByRole('button', { name: 'Play again' });
    await expect(again).toBeVisible();
    await expect(page.getByRole('button', { name: 'All done' })).toHaveCSS('opacity', '1');

    await again.click();
    await expect.poll(async () => (await stateOf(page)).phase).toBe('play');
    expect((await stateOf(page)).stars).toBe(0);
    await stepGame(page, 1);
    const fresh = await party(page);
    expect(
      fresh.dancers.every((d) => d.move === null && d.taps === 0),
      'everybody is listening again',
    ).toBe(true);
    expect(fresh.pinata.state).toBe('hanging');
    expect(fresh.pinata.hits).toBe(0);
    expect(fresh.guests, 'the guests have gone home').toBe(0);
    expect(fresh.marching).toBe(false);
    expect(fresh.cannons.every((c) => c.ready)).toBe(true);

    // She danced it through once, so leaving it now, a new party and all, takes the herd on to the
    // dance floor.
    await closeGame(page);
    await untilArrived(page, 'dance-floor');
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('keeps the party the player has made, and can be played, when the phone is turned upright and back', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const noise = watchConsole(page);
    await openParty(page, ['leaf']);
    await stepGame(page, 2);
    const v = await party(page);
    for (const d of v.dancers) {
      await touch(page, onFriend(d), v.view.unit);
      await stepGame(page, 0.8);
    }
    await touch(page, onCannon(v.cannons[0]!), v.view.unit);
    await stepGame(page, 1.2);
    await touch(page, openFloor(v, 3), v.view.unit);
    await stepGame(page, 1);
    const made = await party(page);
    expect(made.dancers.every((d) => d.move !== null)).toBe(true);
    const had = await earned(page);

    const checkRoom = (room: Party, shape: string): void => {
      expect(room.dancers, `${shape}: the herd is still here`).toHaveLength(made.dancers.length);
      for (const d of room.dancers) {
        expect(seen(room, onFriend(d)), `${shape}: ${d.id} is on the screen`).toBe(true);
        expect(d.x, `${shape}: ${d.id} is on the floor`).toBeGreaterThan(room.floor.left - 40);
        expect(d.x).toBeLessThan(room.floor.right + 40);
        expect(d.y).toBeGreaterThan(room.floor.top);
        expect(d.y).toBeLessThan(room.floor.bottom + 6);
        expect(d.move, `${shape}: ${d.id} is still dancing`).toBe(made.dancers.find((x) => x.id === d.id)!.move);
      }
      for (const c of room.cannons) expect(seen(room, onCannon(c)), `${shape}: a cannon is on the screen`).toBe(true);
      for (const s of room.speakers)
        expect(seen(room, onSpeaker(s)), `${shape}: a speaker is on the screen`).toBe(true);
      expect(seen(room, onBall(room)), `${shape}: the ball is on the screen`).toBe(true);
      expect(seen(room, onPinata(room)), `${shape}: the pinata is on the screen`).toBe(true);
      expect(room.guests, `${shape}: the guests are still here`).toBeGreaterThanOrEqual(made.guests);
      expect(room.marching).toBe(false);
    };

    await page.setViewportSize({ width: 360, height: 780 });
    await expect
      .poll(async () => (await party(page)).view.h, { message: 'the game seeing the new shape of the screen' })
      .toBeGreaterThan(600);
    await stepGame(page, 3);
    const upright = await party(page);
    checkRoom(upright, 'upright');
    expect(await earned(page), 'what she has earned is kept').toBeGreaterThanOrEqual(had);
    await shot(page, `${SCRATCH}/party-upright.png`);

    // It can be played upright: a friend answers, a cannon goes off.
    const friend = upright.dancers[1]!;
    await touch(page, onFriend(friend), upright.view.unit);
    await stepGame(page, 0.3);
    expect((await party(page)).dancers.find((d) => d.id === friend.id)!.taps, 'she answers a touch').toBe(
      friend.taps + 1,
    );
    await touch(page, onCannon(upright.cannons[1]!), upright.view.unit);
    await stepGame(page, 0.2);
    expect((await party(page)).cannons[1]!.ready, 'a cannon goes off').toBe(false);
    await shot(page, `${SCRATCH}/party-upright-play.png`);

    await page.setViewportSize(PHONE);
    await expect.poll(async () => (await party(page)).view.w).toBeGreaterThan(800);
    await stepGame(page, 2);
    const back = await party(page);
    expect(back.dancers).toHaveLength(made.dancers.length);
    for (const d of back.dancers) expect(seen(back, onFriend(d))).toBe(true);
    expect(await earned(page)).toBeGreaterThanOrEqual(had);

    await closeGame(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('goes on when the phone is turned during the parade, and every friend is home when it ends', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const noise = watchConsole(page);
    await openParty(page, ['leaf', 'glacier']);
    await stepGame(page, 1);
    const home = (await party(page)).dancers.map((d) => ({ id: d.id, x: d.x, y: d.y }));
    await page.evaluate(() => window.__ua!.wonders.inside!.wonder.celebrate());
    expect((await stateOf(page)).phase).toBe('finale');
    await stepGame(page, 4);
    expect((await party(page)).marching, 'they are on parade').toBe(true);

    await page.setViewportSize({ width: 360, height: 780 });
    await expect.poll(async () => (await party(page)).view.h).toBeGreaterThan(600);
    await stepGame(page, 4);
    const upright = await party(page);
    expect(upright.marching, 'still on parade, upright').toBe(true);
    await shot(page, `${SCRATCH}/party-parade-upright.png`);
    // A touch in the parade answers with a ring and a note and does nothing else.
    const before = upright.dancers.map((d) => d.taps);
    await page.mouse.click(upright.view.w / 2, upright.view.h / 2);
    await stepGame(page, 0.3);
    expect(
      (await party(page)).dancers.map((d) => d.taps),
      'a touch in the parade is not a touch on a friend',
    ).toEqual(before);

    await page.setViewportSize(PHONE);
    await expect.poll(async () => (await party(page)).view.w).toBeGreaterThan(800);
    for (let i = 0; i < 80 && (await stateOf(page)).phase === 'finale'; i++) await stepGame(page, 0.5);
    expect((await stateOf(page)).phase, 'the finale ended').toBe('after');
    await stepGame(page, 2);
    const later = await party(page);
    expect(later.marching).toBe(false);
    for (const h of home) {
      const d = later.dancers.find((x) => x.id === h.id)!;
      expect(Math.abs(d.x - h.x), `${h.id} is home`).toBeLessThan(2);
      expect(Math.abs(d.y - h.y)).toBeLessThan(2);
    }
    await closeGame(page);
    await untilArrived(page, 'dance-floor');
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('can be closed in the middle of the parade, which takes the herd on to the dance floor, where the next party that opens is a new one', async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await openParty(page, ['leaf']);
    await stepGame(page, 1);
    const v = await party(page);
    await touch(page, onFriend(v.dancers[0]!), v.view.unit);
    await stepGame(page, 0.5);
    await page.evaluate(() => window.__ua!.wonders.inside!.wonder.celebrate());
    await stepGame(page, 5);
    expect((await party(page)).marching).toBe(true);
    await closeGame(page);
    await untilArrived(page, 'dance-floor');
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);

    // The dance floor has poppers of its own. Open it again, the way she would, once the creatures
    // have gone from the lawn.
    await hush(page);
    await standBeside(page, DANCE_POPPER);
    await step(page, 3);
    await tapWorld(page, await fingerOn(page, DANCE_POPPER));
    await stepUntil(page, 'the game to open again', () => window.__ua!.wonders.isOpen, 20);
    await untilOpen(page);
    await stepGame(page, 1);
    expect((await stateOf(page)).stars, 'no stars: nothing is kept').toBe(0);
    expect((await stateOf(page)).phase).toBe('play');
    const fresh = await party(page);
    expect(fresh.marching).toBe(false);
    expect(fresh.dancers.every((d) => d.move === null)).toBe(true);
    expect(fresh.guests).toBe(0);
    await closeGame(page);
    expect(noise).toEqual([]);
  });

  test('plays with one friend, Wildstar, alone on the floor', async ({ page }) => {
    const noise = watchConsole(page);
    await openParty(page);
    await stepGame(page, 2);
    const v = await party(page);
    expect(v.dancers.map((d) => d.id)).toEqual(['wildstar']);
    const lone = v.dancers[0]!;
    expect(Math.abs(lone.x - v.view.w / 2), 'she stands in the middle').toBeLessThan(v.view.w * 0.1);
    for (let turn = 0; turn < 12; turn++) {
      const now = await party(page);
      await touch(page, turn % 3 === 0 ? onFriend(now.dancers[0]!) : next(now, turn), now.view.unit);
      await stepGame(page, 0.7);
    }
    const after = await party(page);
    expect(after.dancers[0]!.move).not.toBeNull();
    expect(after.parts, 'her songs came in one by one, as many as she has touched').toBeGreaterThan(v.parts);
    await shot(page, `${SCRATCH}/party-alone.png`);
    await closeGame(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('stays sound when a child hammers the screen with their whole hand, through every phase', async ({ page }) => {
    test.setTimeout(420_000);
    const noise = watchConsole(page);
    await openParty(page, ['leaf', 'glacier']);
    let guests = 0;
    for (let turn = 0; turn < 400; turn++) {
      const v = await party(page);
      guests = Math.max(guests, v.guests);
      // Four touches at once-ish, anywhere, and the game moved on a little.
      for (let i = 0; i < 4; i++) {
        const x = 20 + ((turn * 131 + i * 247) % (v.view.w - 40));
        const y = 20 + ((turn * 73 + i * 97) % (v.view.h - 40));
        // A hand that lands on a button presses the button, which is not what this is about.
        const onGame = await page.evaluate(([px, py]) => document.elementFromPoint(px!, py!)?.tagName === 'CANVAS', [
          x * v.view.unit,
          y * v.view.unit,
        ] as const);
        if (onGame) await page.mouse.click(x * v.view.unit, y * v.view.unit);
      }
      await stepGame(page, 0.35);
      if ((await stateOf(page)).phase === 'after') break;
    }
    expect(guests, 'the party got going').toBeGreaterThan(0);
    const ledOn = (await stateOf(page)).phase !== 'play';
    await closeGame(page);
    if (ledOn) await untilArrived(page, 'dance-floor');
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });
});
