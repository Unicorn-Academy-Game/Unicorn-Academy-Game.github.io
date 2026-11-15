import { expect, type Page, test } from '@playwright/test';
import {
  approachOf,
  centreOf,
  freeze,
  hush,
  openGame,
  play,
  SCRATCH,
  shot,
  spotOn,
  standAt,
  step,
  stepUntil,
  tapWorld,
  untilArrived,
} from './helpers';

/** What a phone held sideways shows, the screen everything here is for. */
const PHONE = { width: 863, height: 360 };

const mapId = (page: Page): Promise<string> => page.evaluate(() => window.__ua!.controller.world.map.id);
const liveEffects = (page: Page): Promise<number> => page.evaluate(() => window.__ua!.controller.world.effects.length);

async function inTheThroneRoom(page: Page): Promise<void> {
  await openGame(page);
  await play(page);
  await freeze(page);
  await page.evaluate(() => window.__ua!.controller.travel({ mapId: 'palace-hall', spawnId: 'from-garden' }));
  await hush(page);
  await step(page, 1.5);
}

test.describe('the throne room', () => {
  test('is where the palace door leads, and the door out leads back to the palace steps', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openGame(page);
    await play(page);
    await freeze(page);
    await page.evaluate(() => window.__ua!.controller.travel({ mapId: 'palace-garden', spawnId: 'from-forest' }));
    await hush(page);
    await standAt(page, { x: 1536, y: 1032 });
    await tapWorld(page, await centreOf(page, 'palace-garden/palace-door'));
    await stepUntil(page, 'the palace to welcome her', () => window.__ua!.controller.world.effects.length > 0, 8);
    await shot(page, `${SCRATCH}/palace-welcome-door.png`);
    await step(page, 3);
    await untilArrived(page, 'palace-hall');
    await step(page, 1.5);
    await shot(page, `${SCRATCH}/throne-room-arrival.png`);

    // In front of the door, a step short of the doorway. The place the herd stands to use this door
    // is in the doorway, and she goes through from there by herself, so a test that stood in it and
    // then tapped would be racing a door that had already taken her.
    const doorway = await approachOf(page, 'palace-hall/hall-door');
    await standAt(page, { x: doorway.x, y: doorway.y + 60 });
    expect(await mapId(page)).toBe('palace-hall');
    await tapWorld(page, await spotOn(page, 'palace-hall/hall-door'));
    await step(page, 3);
    await untilArrived(page, 'palace-garden');
    const stood = await page.evaluate(() => window.__ua!.controller.world.unicorns.wildstar!.pos);
    // Back on the steps' side of the palace, not somewhere else in the garden.
    expect(Math.abs(stood.x - 1536)).toBeLessThan(700);
    expect(stood.y).toBeGreaterThan(1032);
    expect(stood.y).toBeLessThan(1500);
  });

  test('has something to tap everywhere, and each one answers with sparkles', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await inTheThroneRoom(page);
    const NAMES = ['throne', 'table', 'harp', 'crown', 'bookcase-1', 'bed', 'chandelier-1'];
    for (const name of NAMES) {
      const id = `palace-hall/${name}`;
      await standAt(page, await approachOf(page, id));
      await step(page, 3);
      const before = await liveEffects(page);
      await tapWorld(page, await centreOf(page, id));
      await stepUntil(page, `${name} to answer`, () => window.__ua!.controller.world.effects.length > 0, 8);
      expect(await liveEffects(page), name).toBeGreaterThan(Math.min(before, 0));
      if (name === 'throne') await shot(page, `${SCRATCH}/throne-room-throne.png`);
      if (name === 'chandelier-1') await shot(page, `${SCRATCH}/throne-room-chandelier.png`);
      await step(page, 3);
    }
    expect(await mapId(page)).toBe('palace-hall');
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
  });

  test('seats Wildstar on the throne, sunk into it and facing the room, and gets her up again when she is sent anywhere', async ({
    page,
  }) => {
    await inTheThroneRoom(page);
    const id = 'palace-hall/throne';
    const seat = () => page.evaluate(() => window.__ua!.controller.world.leader.seat);
    /**
     * Whether her picture is drawn only part of the way down, which is how the seat takes her legs.
     */
    const sunk = () =>
      page.evaluate(() => {
        const list = window.__ua!.stage.scene.children.list as unknown as {
          texture?: { key: string };
          isCropped?: boolean;
        }[];
        return list.some((c) => c.texture?.key.startsWith('unicorn:wildstar') === true && c.isCropped === true);
      });
    /**
     * How far above her ground point her picture is drawn, which is how far the seat has carried
     * her up.
     */
    const carried = () =>
      page.evaluate(() => {
        const list = window.__ua!.stage.scene.children.list as unknown as { texture?: { key: string }; y: number }[];
        const picture = list.find((c) => c.texture?.key.startsWith('unicorn:wildstar'));
        return picture ? window.__ua!.controller.world.unicorns.wildstar!.pos.y - picture.y : NaN;
      });
    // On the carpet a short way below the throne, near enough for a phone held sideways to show the
    // throne and the carpet both.
    const carpet = { x: 1280, y: 450 };
    await standAt(page, carpet);
    expect(await seat()).toBeNull();
    expect(await sunk()).toBe(false);
    expect(await carried()).toBeCloseTo(0, 0);

    await tapWorld(page, await spotOn(page, id));
    await stepUntil(page, 'her to take her seat', () => window.__ua!.controller.world.leader.seat !== null, 25);
    await step(page, 2);
    expect(await seat()).toBe(id);
    const sat = await page.evaluate(() => window.__ua!.controller.world.unicorns.wildstar!);
    expect(sat.anim.facing, 'she faces the room').toBe(8);
    expect(await sunk()).toBe(true);
    expect(await carried()).toBeGreaterThan(15);
    await shot(page, `${SCRATCH}/throne-room-seated.png`);

    await tapWorld(page, carpet);
    expect(await seat()).toBeNull();
    await step(page, 2);
    const down = await page.evaluate(() => window.__ua!.controller.world.unicorns.wildstar!.pos);
    expect(down.y, 'she walked down off the dais').toBeGreaterThan(sat.pos.y + 30);
    expect(await sunk()).toBe(false);
    expect(await carried()).toBeCloseTo(0, 0);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
  });

  test('can be tapped again and again, and still nothing about it is saved', async ({ page }) => {
    await inTheThroneRoom(page);
    const id = 'palace-hall/harp';
    await standAt(page, await approachOf(page, id));
    for (let i = 0; i < 4; i++) {
      await tapWorld(page, await centreOf(page, id));
      await step(page, 4);
    }
    expect(
      await page.evaluate(
        (k) => Object.keys(window.__ua!.controller.world.persistent.props).filter((p) => p.includes(k)),
        'palace-hall/',
      ),
    ).toEqual([]);
  });
});
